/**
 * Transport tests for NansenClient. Every test uses a mocked fetch — no real
 * network calls are ever made and no API key is required.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ApiError, NansenClient, type NansenClientOptions } from '../server/nansen.ts';

interface MockCall {
  url: string;
  body: unknown;
}

interface MockResponseSpec {
  status?: number;
  headers?: Record<string, string>;
  json?: unknown;
  /** Rejects instead of resolving, simulating a network failure. */
  networkError?: { name?: string };
  /** Never resolves — used to exercise the timeout path. */
  hang?: boolean;
  /** Resolves headers but the body never arrives — exercises the body-read deadline. */
  jsonHang?: boolean;
}

function mockResponse(spec: MockResponseSpec): Response {
  const headers = new Map(Object.entries(spec.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    ok: (spec.status ?? 200) >= 200 && (spec.status ?? 200) < 300,
    status: spec.status ?? 200,
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    json: async () => {
      if (spec.jsonHang) return new Promise<never>(() => undefined);
      if (spec.json === undefined) throw new SyntaxError('Unexpected token');
      return spec.json;
    },
  } as unknown as Response;
}

type ResponseSpec = MockResponseSpec | ((call: MockCall) => MockResponseSpec);

function makeClient(responses: ResponseSpec[], overrides: Partial<NansenClientOptions> = {}) {
  const calls: MockCall[] = [];
  const sleeps: number[] = [];
  let index = 0;
  const client = new NansenClient({
    apiKey: 'test-key',
    telemetryPath: null,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
    fetchImpl: async (url, init) => {
      const call: MockCall = { url, body: JSON.parse(String(init.body)) };
      calls.push(call);
      const entry = responses[Math.min(index, responses.length - 1)];
      index += 1;
      const spec = typeof entry === 'function' ? entry(call) : entry;
      if (spec.networkError) {
        const error = new Error('socket hang up');
        error.name = spec.networkError.name ?? 'Error';
        throw error;
      }
      if (spec.hang) return new Promise<Response>(() => undefined);
      return mockResponse(spec);
    },
    ...overrides,
  });
  return { client, calls, sleeps };
}

const flowRow = {
  smart_trader_net_flow_usd: 1200,
  top_pnl_net_flow_usd: -400,
  whale_net_flow_usd: 900,
  exchange_net_flow_usd: 0,
  fresh_wallets_net_flow_usd: null,
  public_figure_net_flow_usd: null,
};

test('health-ish defaults: no key configured reports false and refuses live calls', async () => {
  const { client, calls } = makeClient([{ status: 200, json: { data: [] } }], { apiKey: null });
  assert.equal(client.keyConfigured, false);
  await assert.rejects(() => client.loadReading('ethereum', '0xabc', '1h'), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 'missing_key');
    return true;
  });
  assert.equal(calls.length, 0);
});

test('screener uses only the official payload shape', async () => {
  const { client, calls } = makeClient([
    {
      status: 200,
      headers: { 'X-Request-Id': 'req-1', 'X-Nansen-Credits-Used': '1', 'X-Nansen-Credits-Remaining': '99' },
      json: {
        data: [
          { chain: 'ethereum', token_address: '0xaaa', token_symbol: 'AAA' },
          { chain: 'base', token_address: '0xbbb', token_symbol: 'BBB' },
          { chain: 'solana', token_address: 'So111', token_symbol: 'CCC' },
          { chain: 'base', token_address: '0xbbb', token_symbol: 'BBB' },
        ],
      },
    },
  ]);

  const candidates = await client.discoverCandidates();
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/token-screener$/);
  assert.deepEqual(calls[0].body, {
    chains: ['ethereum', 'base', 'solana'],
    timeframe: '24h',
    pagination: { page: 1, per_page: 18 },
    filters: { include_stablecoins: false },
    order_by: [{ field: 'volume', direction: 'DESC' }],
  });
  assert.deepEqual(candidates.map(({ chain, address, symbol }) => ({ chain, address, symbol })), [
    { chain: 'ethereum', address: '0xaaa', symbol: 'AAA' },
    { chain: 'base', address: '0xbbb', symbol: 'BBB' },
    { chain: 'solana', address: 'So111', symbol: 'CCC' },
  ]);
  assert.equal(candidates.every((candidate) => candidate.market.volumeBand === null), true);
  assert.equal(client.telemetry().creditsUsed, 1);
  assert.equal(client.telemetry().creditsRemaining, 99);
});

test('flow-intelligence posts the fixed body and tolerates null cohorts', async () => {
  const { client, calls } = makeClient([
    { status: 200, headers: { 'X-Request-Id': 'req-2' }, json: { data: [flowRow] } },
  ]);
  const reading = await client.loadReading('solana', 'So111', '5m');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/tgm\/flow-intelligence$/);
  assert.deepEqual(calls[0].body, { chain: 'solana', token_address: 'So111', timeframe: '5m' });
  assert.ok(Array.isArray(reading.signals));
  assert.equal(typeof reading.available, 'number');
  assert.equal(reading.provenance.endpoint, 'tgm/flow-intelligence');
  assert.equal(reading.provenance.requestId, 'req-2');
  assert.equal(reading.provenance.cached, false);
});

test('empty data array normalises without throwing', async () => {
  const { client } = makeClient([{ status: 200, json: { data: [] } }]);
  const reading = await client.loadReading('base', '0xbbb', '1d');
  assert.equal(reading.available, 0);
});

test('429 retries with Retry-After and then succeeds', async () => {
  const { client, calls, sleeps } = makeClient([
    { status: 429, headers: { 'Retry-After': '2' }, json: { error: 'slow down' } },
    { status: 200, json: { data: [flowRow] } },
  ]);
  await client.loadReading('ethereum', '0xaaa', '1h');
  assert.equal(calls.length, 2);
  assert.deepEqual(sleeps, [2000]);
});

test('429 with a long Retry-After throws immediately instead of sleeping', async () => {
  const { client, calls, sleeps } = makeClient([
    { status: 429, headers: { 'Retry-After': '120' }, json: { error: 'slow down' } },
  ]);
  await assert.rejects(() => client.loadReading('ethereum', '0xaaa', '1h'), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 'rate_limited');
    assert.equal(error.retryAfter, 120);
    return true;
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(sleeps, []);
});

test('5xx is retried up to maxRetries and then surfaces a sanitised upstream error', async () => {
  const { client, calls, sleeps } = makeClient([{ status: 503, json: { secret: 'leaky upstream body' } }]);
  await assert.rejects(() => client.loadReading('base', '0xbbb', '1h'), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 'upstream');
    assert.ok(!error.message.includes('leaky upstream body'));
    return true;
  });
  assert.equal(calls.length, 3);
  assert.deepEqual(sleeps, [500, 1000]);
});

test('401 and 403 are never retried', async () => {
  const unauthorized = makeClient([{ status: 401, json: { error: 'bad key' } }]);
  await assert.rejects(() => unauthorized.client.loadReading('base', '0xbbb', '1h'), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 'auth');
    return true;
  });
  assert.equal(unauthorized.calls.length, 1);

  const forbidden = makeClient([{ status: 403, json: { error: 'nope' } }]);
  await assert.rejects(() => forbidden.client.loadReading('base', '0xbbb', '1h'), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 'forbidden');
    return true;
  });
  assert.equal(forbidden.calls.length, 1);
});

test('timeout aborts a hanging request', async () => {
  const { client } = makeClient([{ hang: true }], { timeoutMs: 20 });
  await assert.rejects(() => client.loadReading('base', '0xbbb', '1h'), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 'timeout');
    return true;
  });
});

test('the hard deadline covers the body read, not just the headers', async () => {
  const { client, calls } = makeClient([{ status: 200, jsonHang: true }], { timeoutMs: 20 });
  await assert.rejects(() => client.loadReading('base', '0xbbb', '1h'), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 'timeout');
    return true;
  });
  assert.equal(calls.length, 1);
  // The attempt is recorded exactly once, even though only headers arrived.
  assert.equal(client.telemetry().requests, 1);
  assert.equal(client.telemetry().failures, 1);
  assert.equal(client.telemetry().recent.length, 1);
});

test('non-array data is malformed rather than silently empty', async () => {
  const { client } = makeClient([{ status: 200, json: { data: { not: 'an array' } } }]);
  await assert.rejects(() => client.loadReading('base', '0xbbb', '1h'), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 'malformed');
    return true;
  });
  assert.equal(client.telemetry().requests, 1);
  assert.equal(client.telemetry().failures, 1);
});

test('a malformed body is recorded once and still counts deducted credits', async () => {
  const { client } = makeClient([
    { status: 200, headers: { 'X-Nansen-Credits-Used': '1' }, json: { data: 'nope' } },
  ]);
  await assert.rejects(() => client.loadReading('base', '0xbbb', '1h'), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 'malformed');
    return true;
  });
  const telemetry = client.telemetry();
  assert.equal(telemetry.requests, 1, 'one attempt');
  assert.equal(telemetry.failures, 1, 'one failure');
  assert.equal(telemetry.recent.length, 1, 'recorded once');
  assert.equal(telemetry.creditsUsed, 1, 'credits deducted upstream are still counted');
});

test('a generic 4xx such as 422 is never retried', async () => {
  const { client, calls, sleeps } = makeClient([{ status: 422, json: { error: 'unprocessable' } }]);
  await assert.rejects(() => client.loadReading('base', '0xbbb', '1h'), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 'upstream_rejected');
    assert.equal(error.canDemo, true, 'the rehearsal is still a way forward');
    return true;
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(sleeps, []);
});

test('an upstream 404 never masquerades as an expired voyage', async () => {
  const { client, calls } = makeClient([{ status: 404, json: { error: 'missing' } }]);
  await assert.rejects(() => client.loadReading('base', '0xbbb', '1h'), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 'upstream_not_found');
    assert.notEqual(error.code, 'not_found');
    assert.equal(error.canDemo, true);
    return true;
  });
  assert.equal(calls.length, 1, 'a 404 is not retried');
});

test('an all-empty reading is not cached, so a retry reads again', async () => {
  const { client, calls } = makeClient([
    { status: 200, json: { data: [] } },
    { status: 200, json: { data: [flowRow] } },
  ]);
  const first = await client.loadReading('base', '0xbbb', '5m');
  assert.equal(first.available, 0);
  const second = await client.loadReading('base', '0xbbb', '5m');
  assert.ok(second.available > 0, 'the retry got the fresh reading');
  assert.equal(calls.length, 2);
});

test('malformed JSON is reported as malformed', async () => {
  const { client } = makeClient([{ status: 200, json: undefined }]);
  await assert.rejects(() => client.loadReading('base', '0xbbb', '1h'), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 'malformed');
    return true;
  });
});

test('non-object payloads are rejected as malformed', async () => {
  const { client } = makeClient([{ status: 200, json: 'not-an-object' }]);
  await assert.rejects(() => client.loadReading('base', '0xbbb', '1h'), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 'malformed');
    return true;
  });
});

test('concurrent identical reads are deduplicated into one upstream call', async () => {
  const { client, calls } = makeClient([{ status: 200, json: { data: [flowRow] } }]);
  const [a, b, c] = await Promise.all([
    client.loadReading('ethereum', '0xaaa', '1h'),
    client.loadReading('ethereum', '0xaaa', '1h'),
    client.loadReading('ethereum', '0xaaa', '1h'),
  ]);
  assert.equal(calls.length, 1);
  assert.equal(a.available, b.available);
  assert.equal(b.available, c.available);
  assert.equal(client.telemetry().deduplicated, 2);
});

test('cached reads are served from memory within the TTL', async () => {
  const { client, calls } = makeClient([{ status: 200, json: { data: [flowRow] } }]);
  await client.loadReading('ethereum', '0xaaa', '1h');
  const second = await client.loadReading('ethereum', '0xaaa', '1h');
  assert.equal(calls.length, 1);
  assert.equal(second.provenance.cached, true);
  assert.equal(client.telemetry().cacheHits, 1);
});

test('cache entries expire once the TTL passes', async () => {
  let clock = 1_000_000;
  const { client, calls } = makeClient([{ status: 200, json: { data: [flowRow] } }], {
    cacheTtlMs: 600,
    now: () => clock,
  });
  await client.loadReading('ethereum', '0xaaa', '1h');
  clock += 601_000;
  await client.loadReading('ethereum', '0xaaa', '1h');
  assert.equal(calls.length, 2);
});

test('cache TTL is clamped to the 600 second maximum', async () => {
  let clock = 1_000_000;
  const { client, calls } = makeClient([{ status: 200, json: { data: [flowRow] } }], {
    cacheTtlMs: 99_999_000,
    now: () => clock,
  });
  await client.loadReading('ethereum', '0xaaa', '1h');
  clock += 599_000;
  await client.loadReading('ethereum', '0xaaa', '1h');
  assert.equal(calls.length, 1, 'still cached just under the cap');
  clock += 2_000;
  await client.loadReading('ethereum', '0xaaa', '1h');
  assert.equal(calls.length, 2, 'expired just after the cap');
});

test('hourly budget counts real attempts and blocks further calls', async () => {
  const { client, calls } = makeClient([{ status: 200, json: { data: [flowRow] } }], { perHourLimit: 2 });
  await client.loadReading('ethereum', '0xaaa', '1h');
  await client.loadReading('ethereum', '0xaaa', '1d');
  await assert.rejects(() => client.loadReading('base', '0xbbb', '1h'), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 'budget');
    return true;
  });
  assert.equal(calls.length, 2);
  assert.equal(client.telemetry().hourUsed, 2);
  assert.equal(client.telemetry().hourLimit, 2);
});

test('retries consume budget because budget tracks attempts', async () => {
  const { client } = makeClient([{ status: 503, json: {} }], { perHourLimit: 2, maxRetries: 2 });
  await assert.rejects(() => client.loadReading('base', '0xbbb', '1h'));
  assert.equal(client.telemetry().hourUsed, 2, 'two attempts before the budget ran out');
});

test('daily budget is enforced independently', async () => {
  const { client } = makeClient([{ status: 200, json: { data: [flowRow] } }], { perHourLimit: 50, perDayLimit: 1 });
  await client.loadReading('ethereum', '0xaaa', '1h');
  await assert.rejects(() => client.loadReading('base', '0xbbb', '1h'), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 'budget');
    return true;
  });
});

test('budget windows reset after an hour', async () => {
  let clock = 5_000_000;
  const { client } = makeClient([{ status: 200, json: { data: [flowRow] } }], {
    perHourLimit: 1,
    now: () => clock,
  });
  await client.loadReading('ethereum', '0xaaa', '1h');
  await assert.rejects(() => client.loadReading('base', '0xbbb', '1h'));
  clock += 3_600_001;
  await client.loadReading('base', '0xbbb', '1h');
  assert.equal(client.telemetry().hourUsed, 1);
});

test('telemetry persists operational counters across a restart', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'veilwake-'));
  const telemetryPath = path.join(dir, 'telemetry.json');
  try {
    const first = makeClient([{ status: 200, json: { data: [flowRow] } }], { telemetryPath });
    await first.client.loadReading('ethereum', '0xaaa', '1h');
    first.client.flushTelemetry();

    const onDisk = JSON.parse(readFileSync(telemetryPath, 'utf8')) as Record<string, unknown>;
    assert.ok(onDisk.totals, 'counters are written to disk');
    assert.ok(!JSON.stringify(onDisk).includes('0xaaa'), 'no token addresses are persisted');
    assert.ok(!JSON.stringify(onDisk).includes('smart_trader'), 'no raw API rows are persisted');

    const second = makeClient([{ status: 200, json: { data: [flowRow] } }], { telemetryPath });
    assert.ok(second.client.telemetry().requests >= 1, 'throttle counts survive a restart');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a corrupt telemetry file does not prevent startup', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'veilwake-'));
  const telemetryPath = path.join(dir, 'telemetry.json');
  try {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(telemetryPath, '{ not json at all', 'utf8');
    const { client } = makeClient([{ status: 200, json: { data: [flowRow] } }], { telemetryPath });
    assert.equal(client.telemetry().requests, 0);
    await client.loadReading('ethereum', '0xaaa', '1h');
    assert.equal(client.telemetry().requests, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('expireIdle drops expired cache entries', async () => {
  let clock = 1_000;
  const { client, calls } = makeClient([{ status: 200, json: { data: [flowRow] } }], {
    cacheTtlMs: 600,
    now: () => clock,
  });
  await client.loadReading('ethereum', '0xaaa', '1h');
  clock += 700_000;
  client.expireIdle();
  await client.loadReading('ethereum', '0xaaa', '1h');
  assert.equal(calls.length, 2);
});

test('loadReadings preserves request order', async () => {
  const { client, calls } = makeClient([
    (call: MockCall) => ({ status: 200, json: { data: [{ smart_trader_net_flow_usd: String(call.body).length }] } }),
  ]);
  const requests = [
    { chain: 'ethereum', address: '0xaaa', timeframe: '1h' as const },
    { chain: 'base', address: '0xbbb', timeframe: '1d' as const },
    { chain: 'solana', address: 'So111', timeframe: '1h' as const },
  ];
  const readings = await client.loadReadings(requests);
  assert.equal(readings.length, 3);
  assert.equal(calls.length, 3);
  assert.ok(readings.every((reading) => Array.isArray(reading.signals)));
});

test('the toolkit posts the official payload shapes and profiles the largest net buyer', async () => {
  const clock = Date.parse('2026-09-26T06:00:00.000Z');
  const { client, calls } = makeClient(
    [
      (call: MockCall) => {
        if (call.url.endsWith('/tgm/who-bought-sold')) return { status: 200, headers: { 'X-Request-Id': 'req-wbs' }, json: { data: [{ address: '0xbuyer', address_label: 'Fund', bought_volume_usd: 1000, sold_volume_usd: 10 }] } };
        if (call.url.endsWith('/tgm/dex-trades')) return { status: 200, json: { data: [{ action: 'BUY', estimated_value_usd: 5 }], pagination: { is_last_page: false } } };
        if (call.url.endsWith('/tgm/transfers')) return { status: 200, json: { data: [] } };
        if (call.url.endsWith('/tgm/flows')) return { status: 200, json: { data: [], warnings: ['x'] } };
        if (call.url.endsWith('/profiler/address/pnl-summary')) return { status: 200, json: { traded_times: 3, traded_token_count: 2, realized_pnl_usd: 50, win_rate: 0.7, top5_tokens: [] } };
        return { status: 500, json: {} };
      },
    ],
    { now: () => clock },
  );
  const intel = await client.loadTokenIntel('base', '0xtoken');
  const byPath = (suffix: string) => calls.find((call) => call.url.endsWith(suffix))?.body as Record<string, unknown>;
  assert.deepEqual(byPath('/tgm/who-bought-sold'), {
    chain: 'base', token_address: '0xtoken', buy_or_sell: 'BUY',
    date: { from: '2026-09-25T06:00:00Z', to: '2026-09-26T06:00:00Z' },
    pagination: { page: 1, per_page: 25 }, order_by: [{ field: 'bought_volume_usd', direction: 'DESC' }],
  });
  assert.deepEqual(byPath('/tgm/dex-trades'), {
    chain: 'base', token_address: '0xtoken',
    date: { from: '2026-09-26T05:00:00Z', to: '2026-09-26T06:00:00Z' },
    pagination: { page: 1, per_page: 100 }, order_by: [{ field: 'block_timestamp', direction: 'DESC' }],
  });
  assert.equal(byPath('/tgm/flows').label, 'smart_money');
  assert.deepEqual(byPath('/tgm/flows').date, { from: '2026-09-19T06:00:00Z', to: '2026-09-26T06:00:00Z' });
  assert.deepEqual(byPath('/profiler/address/pnl-summary'), { address: '0xbuyer', chain: 'base', date: { from: '2026-08-27T06:00:00Z', to: '2026-09-26T06:00:00Z' } });
  assert.equal(intel.buyers?.provenance.requestId, 'req-wbs');
  assert.equal(intel.trades?.facts.find((fact) => fact.label === 'Trades read')?.value, '1+');
  assert.equal(intel.trend?.status, 'empty');
  assert.equal(intel.profiler?.verdict, 'Seasoned hand', 'an object-shaped Profiler response is accepted');
  assert.ok(!JSON.stringify(intel).includes('0xbuyer'));
  assert.equal(calls.length, 5);
});

test('one failing toolkit view never rejects the whole bundle', async () => {
  const { client } = makeClient([
    (call: MockCall) => (call.url.endsWith('/tgm/transfers') ? { status: 403, json: {} } : { status: 200, json: { data: [] } }),
  ]);
  const intel = await client.loadTokenIntel('solana', 'So111');
  assert.equal(intel.transfers?.status, 'unavailable');
  assert.match(intel.transfers?.detail ?? '', /forbidden/);
  assert.equal(intel.buyers?.status, 'empty');
  assert.equal(intel.profiler?.verdict, 'Nobody to profile');
});

test('the perp screener asks for Smart Money positioning and derives the storm glass', async () => {
  const { client, calls } = makeClient([
    { status: 200, headers: { 'X-Request-Id': 'req-perp' }, json: { data: [{ token_symbol: 'BTC', smart_money_volume: 100, net_position_change: 30, current_smart_money_position_longs_usd: 80, current_smart_money_position_shorts_usd: -20, funding: 0.00001 }] } },
  ]);
  const { weather, shadows } = await client.loadWeather();
  assert.match(calls[0].url, /\/perp-screener$/);
  const body = calls[0].body as Record<string, unknown>;
  assert.deepEqual(body.filters, { trader_type: 'sm' });
  assert.deepEqual(body.order_by, [{ field: 'smart_money_volume', direction: 'DESC' }]);
  assert.equal(weather.name, 'Fair wind');
  assert.equal(weather.provenance.requestId, 'req-perp');
  assert.equal(shadows.BTC, 0.8);
  await client.loadWeather();
  assert.equal(calls.length, 1, 'the storm glass is cached');
});
