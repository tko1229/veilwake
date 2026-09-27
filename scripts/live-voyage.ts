/**
 * Full live voyage QA: plays all three waves against the real Nansen API through the HTTP surface,
 * spending lenses like a careful player, and audits every response for leaks.
 * Spends roughly 60–80 credits per voyage (weather, discovery, three flow windows and the toolkit per reach).
 * Run: npm run voyage            (one voyage, cartographer)
 *      npm run voyage -- 3 keeper (three voyages, keeper doctrine)
 */
import { createApp } from '../server/index.ts';
import type { AddressInfo } from 'node:net';

process.loadEnvFile('.env');
const voyages = Math.max(1, Math.min(20, Number(process.argv[2] ?? 1) || 1));
const doctrine = (['keeper', 'cartographer', 'engineer'] as const).find((d) => d === process.argv[3]) ?? 'cartographer';
const secret = process.env.NANSEN_API_KEY ?? '';

const app = await createApp({ production: false, vite: false, serveStatic: false, adminToken: null });
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const leaks: string[] = [];
function audit(where: string, text: string) {
  if (/0x[0-9a-fA-F]{20,}/.test(text)) leaks.push(`${where}: EVM address-like string`);
  if (secret && text.includes(secret)) leaks.push(`${where}: API key`);
  if (/\$\s?\d[\d,.]*\s?[kKmMbB]?\b/.test(text)) leaks.push(`${where}: USD amount`);
}
async function call(method: 'GET' | 'POST', path: string, body?: unknown) {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  audit(path, text);
  return { status: r.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
}

type Tool = 'buyers' | 'trades' | 'transfers' | 'trend' | 'profiler';
const TOOL_ORDER: Tool[] = ['buyers', 'trend', 'trades', 'profiler', 'transfers'];
const failures: string[] = [];

async function voyage(n: number) {
  let t = Date.now();
  const created = await call('POST', '/api/game', { mode: 'live', doctrine });
  if (created.status !== 200) { failures.push(`create ${created.status} ${created.text}`); return; }
  let game = created.json;
  console.log(`\n── Voyage ${n} (${doctrine}) · created in ${Date.now() - t}ms`);

  while (game.phase !== 'finished') {
    console.log(`  Wave ${game.wave} · ${game.weather?.name} (${game.weather?.status}) · lenses ${game.intel} · supply ${game.energy} · ${game.lanes.map((l: any) => `${l.token.symbol}/${l.token.chain}`).join(', ')}`);
    // 1. Scout every reach first, then open toolkit views in a sensible order while lenses last.
    const actions: Array<{ laneId: string; tool: Tool | 'scout' }> = [
      ...game.lanes.map((l: any) => ({ laneId: l.id, tool: 'scout' as const })),
      ...TOOL_ORDER.flatMap((tool) => game.lanes.map((l: any) => ({ laneId: l.id, tool }))),
    ];
    for (const a of actions) {
      if (game.intel <= 0) break;
      const r = a.tool === 'scout'
        ? await call('POST', `/api/game/${game.id}/scout`, { laneId: a.laneId, revision: game.revision })
        : await call('POST', `/api/game/${game.id}/investigate`, { laneId: a.laneId, tool: a.tool, revision: game.revision });
      if (r.status !== 200) { if (r.status >= 500) failures.push(`W${game.wave} ${a.tool}@${a.laneId} ${r.status} ${r.text}`); continue; }
      game = r.json;
      if (a.tool !== 'scout') {
        const lane = game.lanes.find((l: any) => l.id === a.laneId);
        const c = lane?.intel?.[a.tool];
        if (c) console.log(`    ${lane.token.symbol.padEnd(8)} ${a.tool.padEnd(9)} ${c.status.padEnd(9)} "${c.verdict}" ${c.pressure >= 0 ? '+' : ''}${c.pressure}`);
        // 'empty' is an honest reading (nobody traded); only 'unavailable' means the endpoint let us down.
        if (c && c.status === 'unavailable') failures.push(`W${game.wave} ${a.tool}@${lane.token.symbol} unavailable`);
      }
    }
    // 2. Brace the reaches whose opened evidence looks worst, harvest the rest; set one alert on the harvested one.
    const risk = (l: any) => Object.values(l.intel ?? {}).reduce((s: number, c: any) => s + (c?.pressure ?? 0), 0) + (l.perp?.pressure ?? 0);
    const ranked = [...game.lanes].sort((a: any, b: any) => risk(b) - risk(a));
    let supply = game.energy;
    const plans: Record<string, string> = {};
    for (const l of ranked) { if (supply >= 1 && Object.keys(plans).length < 2) { plans[l.id] = 'brace'; supply -= 1; } else plans[l.id] = 'harvest'; }
    const harvested = ranked.find((l: any) => plans[l.id] === 'harvest');
    const calls = Object.fromEntries(game.lanes.map((l: any) => [l.id, 'hold']));
    t = Date.now();
    const res = await call('POST', `/api/game/${game.id}/resolve`, { plans, revision: game.revision, alert: harvested ? { laneId: harvested.id, condition: 'smart_out' } : undefined, calls });
    if (res.status !== 200) { failures.push(`W${game.wave} resolve ${res.status} ${res.text}`); return; }
    game = res.json;
    const round = game.history[game.history.length - 1];
    console.log(`    resolve ${Date.now() - t}ms · dmg ${round.damage} · +${round.energy} charge · ${round.points} pts · "${round.title}"`);
    for (const l of round.lanes) console.log(`      ${l.token.symbol.padEnd(8)} ${l.effectiveStance.padEnd(7)} ${l.pattern} base${l.baseHazard}→p${l.hazard} dmg${l.damage} alert=${l.alert ? JSON.stringify(l.alert) : '-'} call=${l.callHit ?? '-'}`);
    const link = await fetch(`${base}/api/game/${game.id}/nansen/${round.wave}/${round.lanes[0].laneId}`, { redirect: 'manual' });
    if (link.status !== 302 || !link.headers.get('location')?.startsWith('https://app.nansen.ai/')) failures.push(`W${round.wave} nansen link ${link.status}`);
    if (game.phase === 'finished') break;
    t = Date.now();
    const nx = await call('POST', `/api/game/${game.id}/next`, { revision: game.revision });
    if (nx.status !== 200) { failures.push(`W${game.wave} next ${nx.status} ${nx.text}`); return; }
    game = nx.json;
    console.log(`    next wave ready in ${Date.now() - t}ms`);
  }
  console.log(`  ⚓ ${game.victory ? 'VICTORY' : 'defeat'} · charge ${game.charge}/${game.target} · hull ${game.hull} · score ${game.score}`);
}

try {
  for (let i = 1; i <= voyages; i += 1) await voyage(i);
  const tel = (await (await fetch(`${base}/api/admin/telemetry`)).json()).telemetry;
  console.log(`\ntelemetry · requests ${tel.requests} · failures ${tel.failures} · credits remaining ${tel.creditsRemaining}`);
  console.log(`endpoints · ${JSON.stringify(tel.endpoints)}`);
  console.log(leaks.length ? `\n!!! LEAKS\n${[...new Set(leaks)].join('\n')}` : '\n✓ no addresses, USD amounts or secrets in any response');
  console.log(failures.length ? `!!! FAILURES\n${failures.join('\n')}` : '✓ every wave resolved, every link redirected');
  process.exitCode = leaks.length || failures.length ? 1 : 0;
} finally {
  (app.locals.stopSweep as () => void)();
  (app.locals.client as { flushTelemetry: () => void }).flushTelemetry();
  server.close();
}
