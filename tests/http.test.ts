/**
 * HTTP integration tests for the Express shell.
 *
 * Every test builds the app with `vite: false` and `serveStatic: false`, injects a
 * mocked upstream transport and never reads `.env`. No real Nansen traffic is
 * generated: the default client's fetch throws if it is ever reached, and the
 * live tests use a deterministic in-memory mock.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import { createApp } from '../server/index.ts';
import { NansenClient, type FetchLike } from '../server/nansen.ts';
import { World } from '../server/world.ts';

// ---------------------------------------------------------------- fixtures

const CHAINS = ['ethereum', 'base', 'solana'];
const CANDIDATES = Array.from({ length: 9 }, (_, index) => ({
  chain: CHAINS[index % CHAINS.length],
  token_address: `0xaddr${(index + 1).toString().padStart(4, '0')}`,
  token_symbol: `TOK${index + 1}`,
  price_usd: 1.25 + index,
  price_change: index % 2 === 0 ? 0.08 : -0.04,
  volume: 2_000_000 + index * 100_000,
  liquidity: 500_000 + index * 10_000,
  market_cap_usd: 50_000_000 + index * 1_000_000,
  buy_volume: 1_200_000,
  sell_volume: 800_000,
  netflow: 400_000,
}));

const STRONG_ROW = {
  smart_trader_net_flow_usd: 5000,
  top_pnl_net_flow_usd: 5000,
  whale_net_flow_usd: 5000,
  exchange_net_flow_usd: 5000,
  fresh_wallets_net_flow_usd: 5000,
  public_figure_net_flow_usd: 5000,
};
/** No cohort fields at all, so every lane normalises to `available: 0`. */
const EMPTY_ROW = {};

/** Toolkit rows carry secrets that must never reach the browser. */
const SECRET_ADDRESS = '0xwhalesecret000000000000000000000000000001';
const SECRET_LABEL = 'secretcaptain.eth';
const PERP_ROWS = [
  { token_symbol: 'TOK1', smart_money_volume: 1_000_000, net_position_change: -150_000, current_smart_money_position_longs_usd: 2_000_000, current_smart_money_position_shorts_usd: -1_000_000, funding: 0.00001 },
];
const BUYER_ROWS = [
  { address: SECRET_ADDRESS, address_label: SECRET_LABEL, bought_volume_usd: 1_000_000, sold_volume_usd: 100_000 },
  { address: '0xsecondbuyer', address_label: 'Token Millionaire', bought_volume_usd: 400_000, sold_volume_usd: 390_000 },
];
const TRADE_ROWS = [
  { action: 'BUY', estimated_value_usd: 1000, trader_address: '0xtradersecret', trader_address_label: SECRET_LABEL, transaction_hash: '0xhashsecret' },
  { action: 'SELL', estimated_value_usd: 200, trader_address: '0xtrader2', trader_address_label: '' },
];
const TRANSFER_ROWS = [
  { from_address: '0xfromsecret', to_address: '0xtosecret', from_address_label: 'Binance 7', to_address_label: SECRET_LABEL, transfer_value_usd: 50_000 },
];
const TREND_ROWS = [
  { date: '2026-09-19T00:00:00Z', token_amount: 100, holders_count: 3 },
  { date: '2026-09-26T00:00:00Z', token_amount: 120, holders_count: 4 },
];
const PNL_SUMMARY = { pagination: { page: 1, per_page: 1, is_last_page: true }, top5_tokens: [], traded_token_count: 7, traded_times: 12, realized_pnl_usd: 4321, realized_pnl_percent: 0.1, win_rate: 0.66 };

// ---------------------------------------------------------------- helpers

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

interface UpstreamOptions {
  /** Hold the very first call (used to keep a create pending). */
  holdFirst?: boolean;
  /** Hold the first 5m call (used to keep a resolve in flight). */
  hold5m?: boolean;
  /** Return an empty 5m row so every lane reads unavailable. */
  empty5m?: boolean;
}

function upstream(options: UpstreamOptions = {}) {
  const calls: { url: string; body: { timeframe?: string } }[] = [];
  let releaseHold: () => void = () => undefined;
  const hold = new Promise<void>((resolve) => {
    releaseHold = resolve;
  });
  let markStarted: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  let firstHeld = false;
  let fiveHeld = false;

  const fetchImpl: FetchLike = async (url, init) => {
    const body = JSON.parse(String(init.body)) as { timeframe?: string };
    calls.push({ url, body });
    if (options.holdFirst && !firstHeld) {
      firstHeld = true;
      markStarted();
      await hold;
    }
    if (url.includes('token-screener')) {
      return jsonResponse({ data: CANDIDATES });
    }
    if (url.includes('perp-screener')) return jsonResponse({ data: PERP_ROWS });
    if (url.includes('who-bought-sold')) return jsonResponse({ data: BUYER_ROWS, pagination: { page: 1, per_page: 25, is_last_page: true } });
    if (url.includes('dex-trades')) return jsonResponse({ data: TRADE_ROWS, pagination: { page: 1, per_page: 100, is_last_page: true } });
    if (url.endsWith('/tgm/transfers')) return jsonResponse({ data: TRANSFER_ROWS });
    if (url.endsWith('/tgm/flows')) return jsonResponse({ data: TREND_ROWS, warnings: [] });
    if (url.includes('pnl-summary')) return jsonResponse(PNL_SUMMARY);
    if (url.includes('flow-intelligence')) {
      if (body.timeframe === '5m') {
        if (options.hold5m && !fiveHeld) {
          fiveHeld = true;
          markStarted();
          await hold;
        }
        return jsonResponse({ data: [options.empty5m ? EMPTY_ROW : STRONG_ROW] });
      }
      return jsonResponse({ data: [STRONG_ROW] });
    }
    throw new Error(`unexpected upstream url: ${url}`);
  };

  return { fetchImpl, calls, release: () => releaseHold(), started };
}

function makeClient(fetchImpl: FetchLike, overrides: ConstructorParameters<typeof NansenClient>[0] = {}) {
  return new NansenClient({
    apiKey: 'test-key',
    telemetryPath: null,
    sleep: async () => undefined,
    fetchImpl,
    ...overrides,
  });
}

interface StartedApp {
  app: Express;
  server: http.Server;
  base: string;
  port: number;
  client: NansenClient;
  close: () => Promise<void>;
}

async function startApp(
  options: {
    client?: NansenClient;
    world?: World;
    adminToken?: string | null;
    rateLimitPerMinute?: number;
    now?: () => number;
    trustedOrigin?: string | null;
  } = {},
): Promise<StartedApp> {
  const client = options.client ?? makeClient(async () => {
    throw new Error('the default test client must never reach upstream');
  });
  const world = options.world ?? new World(client, { now: options.now });
  const app = await createApp({
    production: false,
    vite: false,
    serveStatic: false,
    client,
    world,
    adminToken: options.adminToken ?? null,
    trustedOrigin: options.trustedOrigin ?? null,
    rateLimitPerMinute: options.rateLimitPerMinute ?? 10_000,
    now: options.now,
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;
  return {
    app,
    server,
    base,
    port,
    client,
    close: async () => {
      (app.locals.stopSweep as (() => void) | undefined)?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

interface HttpResult {
  status: number;
  headers: http.IncomingHttpHeaders;
  text: string;
  json: any;
}

/** Raw request helper so tests control Origin/Host/Sec-Fetch-Site exactly. */
function request(
  base: string,
  pathname: string,
  options: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
): Promise<HttpResult> {
  const url = new URL(pathname, base);
  const payload = options.body === undefined ? undefined : JSON.stringify(options.body);
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (payload !== undefined) {
    headers['content-type'] = headers['content-type'] ?? 'application/json';
    headers['content-length'] = String(Buffer.byteLength(payload));
  }
  return new Promise<HttpResult>((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: options.method ?? 'GET',
        headers,
        agent: false,
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          text += chunk;
        });
        res.on('end', () => {
          let json: unknown = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode ?? 0, headers: res.headers, text, json });
        });
      },
    );
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

async function createGame(base: string, mode: 'demo' | 'live', doctrine = 'keeper'): Promise<HttpResult> {
  return request(base, '/api/game', { method: 'POST', body: { mode, doctrine } });
}

const PLANS = { north: 'harvest', east: 'harvest', west: 'harvest' };

// ---------------------------------------------------------------- tests

test('demo voyage runs a full lifecycle and hides intelligence until scouted', async () => {
  const app = await startApp();
  try {
    const created = await createGame(app.base, 'demo');
    assert.equal(created.status, 200);
    const game = created.json;
    assert.equal(game.phase, 'planning');
    assert.equal(game.lanes.length, 3);
    assert.equal(game.mode, 'demo');
    // Hidden cohorts are stripped server-side before the first scout.
    for (const lane of game.lanes) {
      assert.deepEqual(lane.context.signals.map((s: { id: string }) => s.id).sort(), ['exchange', 'whale']);
      assert.deepEqual(lane.baseline.signals.map((s: { id: string }) => s.id).sort(), ['exchange', 'whale']);
      assert.equal(lane.market.priceUsd !== null, true, 'the Token Screener snapshot is free information');
      for (const band of [lane.market.volumeBand, lane.market.liquidityBand, lane.market.marketCapBand]) {
        assert.ok(Number.isInteger(band) && band >= 0 && band <= 3, 'size fields are reduced to 0–3 bands');
      }
      assert.equal(lane.market.provenance.endpoint, 'fictional-game-fixture');
      assert.equal('token_address' in lane, false);
    }

    for (const lane of game.lanes) assert.deepEqual(lane.intel, {}, 'toolkit clues are withheld until opened');
    assert.equal(game.weather.name, 'Crosswind');

    const early = await request(app.base, `/api/game/${game.id}/investigate`, {
      method: 'POST',
      body: { laneId: 'north', tool: 'profiler', revision: game.revision },
    });
    assert.equal(early.status, 400, 'the profiler needs the ledger first');

    const ledger = await request(app.base, `/api/game/${game.id}/investigate`, {
      method: 'POST',
      body: { laneId: 'north', tool: 'buyers', revision: game.revision },
    });
    assert.equal(ledger.status, 200);
    const northLedger = ledger.json.lanes.find((l: { id: string }) => l.id === 'north');
    assert.deepEqual(Object.keys(northLedger.intel), ['buyers']);
    assert.equal(ledger.json.intel, game.intel - 1);

    const unknownTool = await request(app.base, `/api/game/${game.id}/investigate`, {
      method: 'POST',
      body: { laneId: 'north', tool: 'labels', revision: ledger.json.revision },
    });
    assert.equal(unknownTool.status, 400);

    const scouted = await request(app.base, `/api/game/${game.id}/scout`, {
      method: 'POST',
      body: { laneId: 'north', revision: ledger.json.revision },
    });
    assert.equal(scouted.status, 200);
    const north = scouted.json.lanes.find((l: { id: string }) => l.id === 'north');
    assert.equal(north.revealed, true);
    assert.equal(north.context.signals.length, 6, 'scouting reveals every cohort');
    assert.equal(scouted.json.intel, game.intel - 2);

    const badAlert = await request(app.base, `/api/game/${game.id}/resolve`, {
      method: 'POST',
      body: { plans: PLANS, revision: scouted.json.revision, alert: { laneId: 'north', condition: 'moon' } },
    });
    assert.equal(badAlert.status, 400);

    const resolved = await request(app.base, `/api/game/${game.id}/resolve`, {
      method: 'POST',
      body: { plans: PLANS, revision: scouted.json.revision, alert: { laneId: 'north', condition: 'smart_out' }, calls: { north: 'hold' } },
    });
    assert.equal(resolved.status, 200);
    assert.equal(resolved.json.phase, 'resolved');
    assert.equal(resolved.json.history.length, 1);
    const report = resolved.json.history[0].lanes[0];
    assert.deepEqual(report.alert, { condition: 'smart_out', fired: true, switched: true });
    assert.equal(report.callHit, true);
    assert.equal(report.modifiers.find((m: { source: string }) => m.source === 'buyers').seen, true);
    assert.equal(report.modifiers.find((m: { source: string }) => m.source === 'trades').seen, false);
    assert.equal(Object.keys(resolved.json.lanes[1].intel).length, 5, 'after resolution every clue is shown for learning');

    const link = await request(app.base, `/api/game/${game.id}/nansen/1/north`);
    assert.equal(link.status, 302);
    assert.equal(link.headers.location, 'https://app.nansen.ai/tokens', 'rehearsal tokens are fictional');

    const next = await request(app.base, `/api/game/${game.id}/next`, {
      method: 'POST',
      body: { revision: resolved.json.revision },
    });
    assert.equal(next.status, 200);
    assert.equal(next.json.phase, 'planning');
    assert.equal(next.json.wave, 2);
  } finally {
    await app.close();
  }
});

test('invalid plans are rejected before any upstream call', async () => {
  const up = upstream();
  const app = await startApp({ client: makeClient(up.fetchImpl) });
  try {
    const created = await createGame(app.base, 'live');
    assert.equal(created.status, 200);
    const game = created.json;
    // Toolkit reads prefetch in the background; only 5m resolution reads matter here.
    const fiveMinute = () => up.calls.filter((call) => call.body.timeframe === '5m').length;

    const missingLane = await request(app.base, `/api/game/${game.id}/resolve`, {
      method: 'POST',
      body: { plans: { north: 'harvest', east: 'harvest' }, revision: game.revision },
    });
    assert.equal(missingLane.status, 400);
    assert.equal(missingLane.json.code, 'bad_request');
    assert.equal(fiveMinute(), 0, 'no 5m fetch for an incomplete plan');

    const unknownStance = await request(app.base, `/api/game/${game.id}/resolve`, {
      method: 'POST',
      body: { plans: { north: 'hack', east: 'harvest', west: 'harvest' }, revision: game.revision },
    });
    assert.equal(unknownStance.status, 400);
    assert.equal(fiveMinute(), 0, 'no 5m fetch for an unknown stance');

    const badCall = await request(app.base, `/api/game/${game.id}/resolve`, {
      method: 'POST',
      body: { plans: PLANS, revision: game.revision, calls: { north: 'maybe' } },
    });
    assert.equal(badCall.status, 400);
    assert.equal(fiveMinute(), 0, 'no 5m fetch for an invalid call');
  } finally {
    await app.close();
  }
});

test('scouting while a resolve is in flight is refused', async () => {
  const up = upstream({ hold5m: true });
  const app = await startApp({ client: makeClient(up.fetchImpl) });
  try {
    const created = await createGame(app.base, 'live');
    assert.equal(created.status, 200);
    const game = created.json;

    const resolving = request(app.base, `/api/game/${game.id}/resolve`, {
      method: 'POST',
      body: { plans: PLANS, revision: game.revision },
    });
    await up.started;

    const scout = await request(app.base, `/api/game/${game.id}/scout`, {
      method: 'POST',
      body: { laneId: 'north', revision: game.revision },
    });
    assert.equal(scout.status, 409);
    assert.equal(scout.json.code, 'conflict');

    up.release();
    const resolved = await resolving;
    assert.equal(resolved.status, 200);
  } finally {
    up.release();
    await app.close();
  }
});

test('stale revisions are refused with a conflict', async () => {
  const app = await startApp();
  try {
    const created = await createGame(app.base, 'demo');
    const game = created.json;
    const stale = await request(app.base, `/api/game/${game.id}/resolve`, {
      method: 'POST',
      body: { plans: PLANS, revision: game.revision + 5 },
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.json.code, 'conflict');
  } finally {
    await app.close();
  }
});

test('live responses never leak token addresses or the API key', async () => {
  const up = upstream();
  const app = await startApp({ client: makeClient(up.fetchImpl) });
  try {
    const created = await createGame(app.base, 'live');
    assert.equal(created.status, 200);
    assert.ok(!created.text.includes('test-key'));
    assert.ok(!created.text.includes('token_address'));
    for (const candidate of CANDIDATES) {
      assert.ok(!created.text.includes(candidate.token_address), `leaked ${candidate.token_address}`);
    }

    const telemetry = await request(app.base, '/api/admin/telemetry');
    assert.equal(telemetry.status, 200);
    assert.ok(!telemetry.text.includes('test-key'));
    for (const candidate of CANDIDATES) {
      assert.ok(!telemetry.text.includes(candidate.token_address));
    }
  } finally {
    await app.close();
  }
});

test('the live Nansen toolkit opens real views without leaking addresses, labels or hashes', async () => {
  const up = upstream();
  const app = await startApp({ client: makeClient(up.fetchImpl) });
  try {
    const created = await createGame(app.base, 'live');
    assert.equal(created.status, 200);
    let game = created.json;
    assert.equal(game.weather.status, 'ok');
    assert.equal(game.lanes[0].perp.listed, true, 'TOK1 has a Smart Money perp market in the mock');
    for (const tool of ['buyers', 'trades', 'transfers', 'trend', 'profiler']) {
      const res = await request(app.base, `/api/game/${game.id}/investigate`, {
        method: 'POST',
        body: { laneId: 'north', tool, revision: game.revision },
      });
      assert.equal(res.status, 200, `${tool} opened`);
      game = res.json;
      assert.notEqual(game.lanes[0].intel[tool].status, 'unavailable', `${tool} read`);
      for (const secret of [SECRET_ADDRESS, SECRET_LABEL, '0xtradersecret', '0xhashsecret', '0xfromsecret', '0xtosecret', 'Binance', '4321']) {
        assert.ok(!res.text.includes(secret), `${tool} leaked ${secret}`);
      }
    }
    assert.equal(game.lanes[0].intel.profiler.verdict, 'Seasoned hand');
    const endpoints = new Set(up.calls.map((call) => call.url.split('/api/v1/')[1]));
    for (const endpoint of ['token-screener', 'perp-screener', 'tgm/flow-intelligence', 'tgm/who-bought-sold', 'tgm/dex-trades', 'tgm/transfers', 'tgm/flows', 'profiler/address/pnl-summary']) {
      assert.ok(endpoints.has(endpoint), `${endpoint} was called`);
    }
    const profileCall = up.calls.find((call) => call.url.endsWith('pnl-summary'));
    assert.equal((profileCall?.body as { address?: string } | undefined)?.address, SECRET_ADDRESS, 'the Profiler follows the largest net buyer server-side');

    const link = await request(app.base, `/api/game/${game.id}/nansen/1/north`);
    assert.equal(link.status, 302);
    assert.equal(link.headers.location, 'https://app.nansen.ai/token-god-mode?chain=ethereum&tokenAddress=0xaddr0001');
    const peek = await request(app.base, `/api/game/${game.id}/nansen/2/north`);
    assert.equal(peek.status, 400, 'future waves cannot be peeked through the link');
    const bogus = await request(app.base, `/api/game/${game.id}/nansen/1/south`);
    assert.equal(bogus.status, 400);
  } finally {
    await app.close();
  }
});

test('a failing toolkit view degrades to an honest unavailable clue instead of breaking the voyage', async () => {
  const base = upstream();
  const fetchImpl: FetchLike = async (url, init) => {
    if (url.includes('dex-trades')) return jsonResponse({ error: 'boom' }, 422);
    return base.fetchImpl(url, init);
  };
  const app = await startApp({ client: makeClient(fetchImpl) });
  try {
    const created = await createGame(app.base, 'live');
    assert.equal(created.status, 200);
    const res = await request(app.base, `/api/game/${created.json.id}/investigate`, {
      method: 'POST',
      body: { laneId: 'east', tool: 'trades', revision: created.json.revision },
    });
    assert.equal(res.status, 200);
    const clue = res.json.lanes[1].intel.trades;
    assert.equal(clue.status, 'unavailable');
    assert.equal(clue.pressure, 0, 'a missing view adds no pressure');
    assert.ok(!res.text.includes('boom'), 'upstream bodies are never echoed');
  } finally {
    await app.close();
  }
});

test('cross-site and cross-port origins are rejected while same origin is allowed', async () => {
  const app = await startApp();
  try {
    const same = await request(app.base, '/api/game', {
      method: 'POST',
      headers: { origin: app.base },
      body: { mode: 'demo', doctrine: 'keeper' },
    });
    assert.equal(same.status, 200);

    const remote = await request(app.base, '/api/game', {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
      body: { mode: 'demo', doctrine: 'keeper' },
    });
    assert.equal(remote.status, 403);

    const otherPort = await request(app.base, '/api/game', {
      method: 'POST',
      headers: { origin: `http://127.0.0.1:${app.port + 1}` },
      body: { mode: 'demo', doctrine: 'keeper' },
    });
    assert.equal(otherPort.status, 403, 'a different port is a different origin');

    const localhostElsewhere = await request(app.base, '/api/game', {
      method: 'POST',
      headers: { origin: 'http://localhost:9999' },
      body: { mode: 'demo', doctrine: 'keeper' },
    });
    assert.equal(localhostElsewhere.status, 403, 'localhost is not trusted blindly');

    const crossSite = await request(app.base, '/api/game', {
      method: 'POST',
      headers: { 'sec-fetch-site': 'cross-site' },
      body: { mode: 'demo', doctrine: 'keeper' },
    });
    assert.equal(crossSite.status, 403);
  } finally {
    await app.close();
  }
});

test('a configured admin token is required even from loopback', async () => {
  const withToken = await startApp({ adminToken: 'sekret' });
  try {
    const noAuth = await request(withToken.base, '/api/admin/telemetry');
    assert.equal(noAuth.status, 403);
    const wrong = await request(withToken.base, '/api/admin/telemetry', {
      headers: { authorization: 'Bearer nope' },
    });
    assert.equal(wrong.status, 403);
    const ok = await request(withToken.base, '/api/admin/telemetry', {
      headers: { authorization: 'Bearer sekret' },
    });
    assert.equal(ok.status, 200);
    assert.ok(ok.json.telemetry);
  } finally {
    await withToken.close();
  }

  const noToken = await startApp({ adminToken: null });
  try {
    const res = await request(noToken.base, '/api/admin/telemetry');
    assert.equal(res.status, 200, 'loopback is allowed only when no token is configured');
  } finally {
    await noToken.close();
  }
});

test('a missing API key fails live creation instead of faking a demo', async () => {
  const client = makeClient(
    async () => {
      throw new Error('upstream must not be reached without a key');
    },
    { apiKey: null },
  );
  const app = await startApp({ client });
  try {
    const health = await request(app.base, '/api/health');
    assert.equal(health.json.keyConfigured, false);

    const res = await createGame(app.base, 'live');
    assert.equal(res.status, 503);
    assert.equal(res.json.code, 'missing_key');
    assert.equal(res.json.canDemo, true);
    assert.equal(res.json.id, undefined, 'no game is fabricated');
  } finally {
    await app.close();
  }
});

test('expired sessions are swept and reported as gone', async () => {
  let clock = 1_000_000;
  const now = () => clock;
  const client = makeClient(async () => {
    throw new Error('no upstream expected for a demo voyage');
  }, { now });
  const world = new World(client, { now });
  const app = await startApp({ client, world, now });
  try {
    const created = await createGame(app.base, 'demo');
    assert.equal(created.status, 200);
    const id = created.json.id;

    clock += 700_000;
    const gone = await request(app.base, `/api/game/${id}`);
    assert.equal(gone.status, 404);
    assert.equal(gone.json.code, 'not_found');
  } finally {
    await app.close();
  }
});

test('an all-empty 5m window is 503 canDemo and charges no state', async () => {
  const up = upstream({ empty5m: true });
  const app = await startApp({ client: makeClient(up.fetchImpl) });
  try {
    const created = await createGame(app.base, 'live');
    assert.equal(created.status, 200);
    const game = created.json;

    const res = await request(app.base, `/api/game/${game.id}/resolve`, {
      method: 'POST',
      body: { plans: PLANS, revision: game.revision },
    });
    assert.equal(res.status, 503);
    assert.equal(res.json.code, 'unavailable');
    assert.equal(res.json.canDemo, true);

    const after = await request(app.base, `/api/game/${game.id}`);
    assert.equal(after.status, 200);
    assert.equal(after.json.phase, 'planning', 'still planning');
    assert.equal(after.json.revision, game.revision, 'revision unchanged');
    assert.equal(after.json.hull, game.hull, 'no hull charged');
  } finally {
    await app.close();
  }
});

test('rate limiting applies to the API but never to asset requests', async () => {
  const app = await startApp({ rateLimitPerMinute: 3 });
  try {
    let last = 0;
    for (let index = 0; index < 4; index += 1) {
      last = (await request(app.base, '/api/health')).status;
    }
    assert.equal(last, 429);

    for (let index = 0; index < 6; index += 1) {
      const asset = await request(app.base, '/index.html');
      assert.notEqual(asset.status, 429, 'asset loads are not rate limited');
    }
  } finally {
    await app.close();
  }
});

test('concurrent live creations respect maxSessions via pending reservations', async () => {
  const up = upstream({ holdFirst: true });
  const client = makeClient(up.fetchImpl);
  const world = new World(client, { maxSessions: 1 });
  const app = await startApp({ client, world });
  try {
    const first = createGame(app.base, 'live');
    await up.started;

    const second = await createGame(app.base, 'live');
    assert.equal(second.status, 503);
    assert.equal(second.json.code, 'session_limit');

    up.release();
    const created = await first;
    assert.equal(created.status, 200);
    assert.equal(world.sessionCount, 1);
  } finally {
    up.release();
    await app.close();
  }
});
