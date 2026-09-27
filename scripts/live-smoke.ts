/**
 * Live end-to-end smoke test against the real Nansen API (spends ~25–30 credits).
 * Run: npx tsx scripts/live-smoke.ts
 */
import { createApp } from '../server/index.ts';
import type { AddressInfo } from 'node:net';

process.loadEnvFile('.env');
const app = await createApp({ production: false, vite: false, serveStatic: false, adminToken: null });
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const post = async (path: string, body: unknown) => {
  const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, text: await r.text() };
};
try {
  let t = Date.now();
  const created = await post('/api/game', { mode: 'live', doctrine: 'cartographer' });
  let game = JSON.parse(created.text);
  console.log(`create ${created.status} in ${Date.now() - t}ms · weather=${game.weather?.name} (${game.weather?.status}) · tokens=${game.lanes?.map((l: any) => `${l.token.symbol}/${l.token.chain} liq${l.market.liquidityBand} perp:${l.perp.bias ?? '-'}`).join(', ')}`);
  for (const tool of ['buyers', 'trades', 'transfers', 'trend', 'profiler']) {
    t = Date.now();
    const r = await post(`/api/game/${game.id}/investigate`, { laneId: 'north', tool, revision: game.revision });
    if (r.status !== 200) { console.log(tool, r.status, r.text); break; }
    game = JSON.parse(r.text);
    const c = game.lanes[0].intel[tool];
    console.log(`  ${tool.padEnd(9)} ${r.status} ${Date.now() - t}ms · ${c.status} · "${c.verdict}" ${c.pressure >= 0 ? '+' : ''}${c.pressure} · req ${c.provenance.requestId} · ${c.facts.map((f: any) => `${f.label}=${f.value}`).join('; ')}`);
    if (/0x[0-9a-fA-F]{20,}/.test(r.text)) console.log('  !!! address-like string found in response');
  }
  const s = await post(`/api/game/${game.id}/scout`, { laneId: 'north', revision: game.revision });
  game = JSON.parse(s.text);
  t = Date.now();
  const res = await post(`/api/game/${game.id}/resolve`, { plans: { north: 'harvest', east: 'brace', west: 'brace' }, revision: game.revision, alert: { laneId: 'north', condition: 'smart_out' }, calls: { north: 'hold' } });
  const done = JSON.parse(res.text);
  console.log(`resolve ${res.status} ${Date.now() - t}ms`);
  for (const l of done.history?.[0]?.lanes ?? []) console.log(`  ${l.token.symbol}: ${l.pattern} base${l.baseHazard} → p${l.hazard} dmg${l.damage} +${l.energy} alert=${JSON.stringify(l.alert)} call=${l.callHit} mods=[${l.modifiers.map((m: any) => `${m.source}:${m.value}${m.seen ? '✓' : '·'}`).join(' ')}]`);
  const link = await fetch(`${base}/api/game/${game.id}/nansen/1/north`, { redirect: 'manual' });
  console.log('nansen link', link.status, link.headers.get('location'));
  const tel = await (await fetch(`${base}/api/admin/telemetry`)).json();
  console.log('telemetry', JSON.stringify({ requests: tel.telemetry.requests, failures: tel.telemetry.failures, endpoints: tel.telemetry.endpoints, remaining: tel.telemetry.creditsRemaining }));
} finally {
  (app.locals.stopSweep as () => void)();
  (app.locals.client as { flushTelemetry: () => void }).flushTelemetry();
  server.close();
}
