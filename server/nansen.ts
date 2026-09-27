/**
 * Nansen transport layer.
 *
 * Eight official one-credit endpoints are contacted, all listed as "Allowed"
 * in Nansen's redistribution guide (attribution shown in the UI):
 *   POST /api/v1/token-screener                   discovery + market snapshot
 *   POST /api/v1/tgm/flow-intelligence            cohort flows (1d, 1h, 5m)
 *   POST /api/v1/tgm/who-bought-sold              Buyers & Sellers ledger
 *   POST /api/v1/tgm/dex-trades                   recent DEX tape
 *   POST /api/v1/tgm/transfers                    largest transfers
 *   POST /api/v1/tgm/flows                        Smart Money holdings trend
 *   POST /api/v1/profiler/address/pnl-summary     track record of the top net buyer
 *   POST /api/v1/perp-screener                    Hyperliquid Smart Money positioning
 *
 * Every response is reduced immediately: screener rows to a market snapshot,
 * flow rows to cohort directions and bands, toolkit rows to bounded clues (see
 * `shared/intel.ts`). Raw rows, addresses and labels are never logged, never
 * persisted and never exposed over HTTP. The only things that survive outside
 * this process are operational counters (see `.runtime/telemetry.json`).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { normalizeReading } from '../shared/engine.ts';
import {
  deriveBuyers,
  deriveProfile,
  deriveTrades,
  deriveTransfers,
  deriveTrend,
  deriveWeather,
  noTargetProfile,
  unavailableClue,
  type BuyersDerived,
  type PerpDerived,
} from '../shared/intel.ts';
import type { ApiFailure, Clue, Direction, IntelToolId, MarketSnapshot, Provenance, Reading, Telemetry } from '../shared/types.ts';

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface NansenClientOptions {
  apiKey?: string | null;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  /** Derived, memory-only cache lifetime. Clamped to MAX_CACHE_TTL_MS. */
  cacheTtlMs?: number;
  perHourLimit?: number;
  perDayLimit?: number;
  maxConcurrency?: number;
  /** Absolute path for the operational telemetry file. `null` disables persistence. */
  telemetryPath?: string | null;
  maxRecent?: number;
  /** Injectable clock (epoch ms). */
  now?: () => number;
  /** Injectable fetch implementation. */
  fetchImpl?: FetchLike;
  /** Injectable sleep implementation, used only for bounded backoff. */
  sleep?: (ms: number) => Promise<void>;
}

export interface Candidate {
  chain: string;
  address: string;
  symbol: string;
  market: MarketSnapshot;
}

export type Timeframe = '5m' | '1h' | '1d' | '7d' | '24h';

const DEFAULT_BASE_URL = 'https://api.nansen.ai/api/v1';
const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_CACHE_TTL_MS = 600_000;
export const MAX_CACHE_TTL_MS = 600_000;
/** The 5m Flow Intelligence read resolves a wave, so it is shared for one minute at most. */
export const SHORT_WINDOW_TTL_MS = 60_000;
/** A full uncached live voyage makes up to 74 calls; these defaults allow several voyages per hour. */
export const DEFAULT_PER_HOUR = 600;
export const DEFAULT_PER_DAY = 4000;
const DEFAULT_CONCURRENCY = 5;
const MAX_CONCURRENCY = 6;
const DEFAULT_MAX_RECENT = 40;
const BACKOFF_BASE_MS = 500;
/** Never block a request for longer than this; surface `retryAfter` instead. */
const MAX_RETRY_AFTER_MS = 5_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

const SCREENER_ENDPOINT = 'token-screener';
const FLOW_ENDPOINT = 'tgm/flow-intelligence';
const BUYERS_ENDPOINT = 'tgm/who-bought-sold';
const TRADES_ENDPOINT = 'tgm/dex-trades';
const TRANSFERS_ENDPOINT = 'tgm/transfers';
const TREND_ENDPOINT = 'tgm/flows';
const PROFILER_ENDPOINT = 'profiler/address/pnl-summary';
const PERP_ENDPOINT = 'perp-screener';
const SCREENER_TIMEFRAME = '24h';
const SCREENER_PER_PAGE = 18;
/** Chains accepted by the Profiler PnL summary endpoint. */
const PROFILER_CHAINS = new Set(['arbitrum', 'avalanche', 'base', 'bnb', 'ethereum', 'linea', 'mantle', 'monad', 'optimism', 'plasma', 'polygon', 'robinhood', 'sei', 'solana', 'sonic', 'sui']);

function directionOf(value: unknown): Direction {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'unknown';
  if (value > 0) return 'in';
  if (value < 0) return 'out';
  return 'flat';
}

function bandOf(value: unknown, thresholds: [number, number, number]): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  if (value < thresholds[0]) return 0;
  if (value < thresholds[1]) return 1;
  if (value < thresholds[2]) return 2;
  return 3;
}

function pct(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value * 100 : null;
}

function marketSnapshot(row: Record<string, unknown>, provenance: Provenance): MarketSnapshot {
  const buy = typeof row.buy_volume === 'number' && Number.isFinite(row.buy_volume) ? row.buy_volume : null;
  const sell = typeof row.sell_volume === 'number' && Number.isFinite(row.sell_volume) ? row.sell_volume : null;
  const bias = buy === null || sell === null ? 'unknown' : directionOf(buy - sell);
  return {
    priceUsd: typeof row.price_usd === 'number' && Number.isFinite(row.price_usd) ? row.price_usd : null,
    priceChangePct: pct(row.price_change),
    volumeBand: bandOf(row.volume, [100_000, 10_000_000, 100_000_000]),
    liquidityBand: bandOf(row.liquidity, [100_000, 1_000_000, 10_000_000]),
    marketCapBand: bandOf(row.market_cap_usd, [1_000_000, 100_000_000, 1_000_000_000]),
    buySellBias: bias,
    netflowDirection: directionOf(row.netflow),
    netflowBand: bandOf(typeof row.netflow === 'number' ? Math.abs(row.netflow) : null, [10_000, 1_000_000, 10_000_000]),
    provenance,
  };
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Safe, sanitised failure. Never contains upstream bodies, keys or URLs. */
export class ApiError extends Error {
  code: string;
  retryAfter?: number;
  canDemo?: boolean;

  constructor(message: string, code: string, extra: { retryAfter?: number; canDemo?: boolean } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    if (extra.retryAfter !== undefined) this.retryAfter = extra.retryAfter;
    if (extra.canDemo !== undefined) this.canDemo = extra.canDemo;
  }

  toFailure(): ApiFailure {
    const failure: ApiFailure = { error: this.message, code: this.code };
    if (this.retryAfter !== undefined) failure.retryAfter = this.retryAfter;
    if (this.canDemo !== undefined) failure.canDemo = this.canDemo;
    return failure;
  }
}

interface PersistedTelemetry {
  version: 1;
  startedAt: string;
  totals: {
    requests: number;
    successes: number;
    failures: number;
    cacheHits: number;
    deduplicated: number;
    creditsUsed: number;
    creditsEstimated: number;
    eventsProcessed: number;
  };
  endpoints: Record<string, { requests: number; successes: number; failures: number }>;
  chains: string[];
  hour: { windowStart: number; used: number };
  day: { windowStart: number; used: number };
  creditsRemaining: number | null;
  recent: Telemetry['recent'];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function nonNegative(value: unknown, fallback = 0): number {
  return isFiniteNumber(value) && value >= 0 ? Math.floor(value) : fallback;
}

/** Simple counting semaphore so upstream concurrency stays bounded. */
class Semaphore {
  private active = 0;
  private queue: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active += 1;
      return;
    }
    // The releasing caller hands its slot straight to us (see `release`), so
    // `active` is never decremented in between and nobody can slip past the limit.
    await new Promise<void>((resolve) => this.queue.push(resolve));
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
      return;
    }
    this.active = Math.max(0, this.active - 1);
  }
}

export class NansenClient {
  private readonly apiKey: string | null;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly cacheTtlMs: number;
  private readonly perHourLimit: number;
  private readonly perDayLimit: number;
  private readonly maxRecent: number;
  private readonly telemetryPath: string | null;
  private readonly now: () => number;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly semaphore: Semaphore;

  /** Derived readings only — never raw API rows. */
  private readonly cache = new Map<string, { value: unknown; storedAt: number; expiresAt: number }>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  private totals = {
    requests: 0,
    successes: 0,
    failures: 0,
    cacheHits: 0,
    deduplicated: 0,
    creditsUsed: 0,
    creditsEstimated: 0,
    eventsProcessed: 0,
  };
  private endpoints: Record<string, { requests: number; successes: number; failures: number }> = {};
  private chains: string[] = [];
  private hourWindowStart = 0;
  private hourUsed = 0;
  private dayWindowStart = 0;
  private dayUsed = 0;
  private creditsRemaining: number | null = null;
  private recent: Telemetry['recent'] = [];
  private startedAt = new Date().toISOString();
  private persistScheduled = false;

  constructor(options: NansenClientOptions = {}) {
    this.apiKey = typeof options.apiKey === 'string' && options.apiKey.trim().length > 0 ? options.apiKey.trim() : null;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = nonNegative(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
    // Retries are bounded to two: more would multiply a failing upstream's cost and latency.
    this.maxRetries = Math.min(nonNegative(options.maxRetries ?? DEFAULT_MAX_RETRIES, DEFAULT_MAX_RETRIES), 2);
    // Zero is a real setting (no cache / no upstream spend), never "use the default".
    // Only a missing, negative or non-finite value falls back.
    this.cacheTtlMs = Math.min(nonNegative(options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS, DEFAULT_CACHE_TTL_MS), MAX_CACHE_TTL_MS);
    this.perHourLimit = nonNegative(options.perHourLimit ?? DEFAULT_PER_HOUR, DEFAULT_PER_HOUR);
    this.perDayLimit = nonNegative(options.perDayLimit ?? DEFAULT_PER_DAY, DEFAULT_PER_DAY);
    this.maxRecent = Math.max(1, nonNegative(options.maxRecent ?? DEFAULT_MAX_RECENT, DEFAULT_MAX_RECENT));
    this.telemetryPath =
      options.telemetryPath === undefined
        ? path.resolve(process.cwd(), '.runtime', 'telemetry.json')
        : options.telemetryPath;
    this.now = options.now ?? (() => Date.now());
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
    this.sleep = options.sleep ?? defaultSleep;
    this.semaphore = new Semaphore(Math.max(1, Math.min(nonNegative(options.maxConcurrency ?? DEFAULT_CONCURRENCY, DEFAULT_CONCURRENCY) || DEFAULT_CONCURRENCY, MAX_CONCURRENCY)));
    this.loadTelemetry();
  }

  get keyConfigured(): boolean {
    return this.apiKey !== null;
  }

  // ---------------------------------------------------------------- telemetry

  private endpointStats(endpoint: string) {
    if (!this.endpoints[endpoint]) {
      this.endpoints[endpoint] = { requests: 0, successes: 0, failures: 0 };
    }
    return this.endpoints[endpoint];
  }

  private loadTelemetry(): void {
    this.startedAt = new Date(this.now()).toISOString();
    const nowMs = this.now();
    this.hourWindowStart = nowMs;
    this.dayWindowStart = nowMs;
    if (!this.telemetryPath) return;
    let raw: string;
    try {
      raw = readFileSync(this.telemetryPath, 'utf8');
    } catch {
      return; // no file yet — fresh start
    }
    try {
      const parsed = JSON.parse(raw) as Partial<PersistedTelemetry>;
      if (!parsed || typeof parsed !== 'object') return;
      const t = parsed.totals;
      if (t && typeof t === 'object') {
        this.totals = {
          requests: nonNegative(t.requests),
          successes: nonNegative(t.successes),
          failures: nonNegative(t.failures),
          cacheHits: nonNegative(t.cacheHits),
          deduplicated: nonNegative(t.deduplicated),
          creditsUsed: nonNegative(t.creditsUsed),
          creditsEstimated: nonNegative(t.creditsEstimated),
          eventsProcessed: nonNegative(t.eventsProcessed),
        };
      }
      if (parsed.endpoints && typeof parsed.endpoints === 'object') {
        for (const [key, value] of Object.entries(parsed.endpoints)) {
          if (!value || typeof value !== 'object') continue;
          this.endpoints[key] = {
            requests: nonNegative((value as Record<string, unknown>).requests),
            successes: nonNegative((value as Record<string, unknown>).successes),
            failures: nonNegative((value as Record<string, unknown>).failures),
          };
        }
      }
      if (Array.isArray(parsed.chains)) {
        this.chains = parsed.chains.filter((c): c is string => typeof c === 'string').slice(0, 16);
      }
      // Rolling windows survive restarts, so throttles cannot be reset by bouncing the process.
      if (parsed.hour && isFiniteNumber(parsed.hour.windowStart) && nowMs - parsed.hour.windowStart < HOUR_MS) {
        this.hourWindowStart = parsed.hour.windowStart;
        this.hourUsed = nonNegative(parsed.hour.used);
      }
      if (parsed.day && isFiniteNumber(parsed.day.windowStart) && nowMs - parsed.day.windowStart < DAY_MS) {
        this.dayWindowStart = parsed.day.windowStart;
        this.dayUsed = nonNegative(parsed.day.used);
      }
      if (isFiniteNumber(parsed.creditsRemaining)) this.creditsRemaining = parsed.creditsRemaining;
      if (typeof parsed.startedAt === 'string') this.startedAt = parsed.startedAt;
      if (Array.isArray(parsed.recent)) {
        this.recent = parsed.recent
          .filter((r): r is Telemetry['recent'][number] => !!r && typeof r === 'object')
          .slice(-this.maxRecent)
          .map((r) => ({
            at: typeof r.at === 'string' ? r.at : new Date(this.now()).toISOString(),
            endpoint: typeof r.endpoint === 'string' ? r.endpoint : 'unknown',
            status: nonNegative(r.status),
            requestId: typeof r.requestId === 'string' ? r.requestId : null,
            credits: isFiniteNumber(r.credits) ? r.credits : null,
          }));
      }
    } catch {
      // Corrupt file: start from a clean slate rather than crashing.
    }
  }

  private schedulePersist(): void {
    if (!this.telemetryPath || this.persistScheduled) return;
    this.persistScheduled = true;
    queueMicrotask(() => {
      this.persistScheduled = false;
      this.flushTelemetry();
    });
  }

  /** Writes counters to disk. Safe to call at any time. */
  flushTelemetry(): void {
    if (!this.telemetryPath) return;
    const payload: PersistedTelemetry = {
      version: 1,
      startedAt: this.startedAt,
      totals: { ...this.totals },
      endpoints: this.endpoints,
      chains: this.chains.slice(0, 16),
      hour: { windowStart: this.hourWindowStart, used: this.hourUsed },
      day: { windowStart: this.dayWindowStart, used: this.dayUsed },
      creditsRemaining: this.creditsRemaining,
      recent: this.recent.slice(-this.maxRecent),
    };
    try {
      mkdirSync(path.dirname(this.telemetryPath), { recursive: true });
      writeFileSync(this.telemetryPath, JSON.stringify(payload), 'utf8');
    } catch {
      // Persistence is best-effort evidence, never a request blocker.
    }
  }

  telemetry(): Telemetry {
    return {
      startedAt: this.startedAt,
      requests: this.totals.requests,
      successes: this.totals.successes,
      failures: this.totals.failures,
      cacheHits: this.totals.cacheHits,
      deduplicated: this.totals.deduplicated,
      creditsUsed: this.totals.creditsUsed,
      creditsEstimated: this.totals.creditsEstimated,
      creditsRemaining: this.creditsRemaining,
      eventsProcessed: this.totals.eventsProcessed,
      endpoints: Object.fromEntries(Object.entries(this.endpoints).map(([k, v]) => [k, { ...v }])),
      chains: [...this.chains],
      recent: this.recent.slice(-this.maxRecent),
      hourUsed: this.hourUsed,
      hourLimit: this.perHourLimit,
      dayUsed: this.dayUsed,
      dayLimit: this.perDayLimit,
    };
  }

  // ------------------------------------------------------------------ budgets

  private rollWindows(nowMs: number): void {
    if (nowMs - this.hourWindowStart >= HOUR_MS || nowMs < this.hourWindowStart) {
      this.hourWindowStart = nowMs;
      this.hourUsed = 0;
    }
    if (nowMs - this.dayWindowStart >= DAY_MS || nowMs < this.dayWindowStart) {
      this.dayWindowStart = nowMs;
      this.dayUsed = 0;
    }
  }

  /** Reserves budget for exactly one real network attempt. */
  private reserveAttempt(): void {
    const nowMs = this.now();
    this.rollWindows(nowMs);
    if (this.hourUsed >= this.perHourLimit) {
      throw new ApiError('Hourly upstream budget exhausted.', 'budget', { canDemo: true });
    }
    if (this.dayUsed >= this.perDayLimit) {
      throw new ApiError('Daily upstream budget exhausted.', 'budget', { canDemo: true });
    }
    this.hourUsed += 1;
    this.dayUsed += 1;
    this.totals.requests += 1;
    this.schedulePersist();
  }

  // ------------------------------------------------------------------- cache

  private readCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.cache.delete(key);
      return null;
    }
    this.totals.cacheHits += 1;
    this.schedulePersist();
    return entry.value as T;
  }

  private writeCache(key: string, value: unknown, ttlMs = this.cacheTtlMs): void {
    const storedAt = this.now();
    this.cache.set(key, { value, storedAt, expiresAt: storedAt + Math.min(ttlMs, this.cacheTtlMs) });
  }

  /** Drops expired cache entries so nothing is retained beyond the TTL. */
  expireIdle(): void {
    const nowMs = this.now();
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= nowMs) this.cache.delete(key);
    }
  }

  // --------------------------------------------------------------- transport

  private parseRetryAfter(value: string | null): number | null {
    if (!value) return null;
    const seconds = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(seconds) && String(seconds) === value.trim()) return Math.max(0, seconds);
    const date = Date.parse(value);
    if (Number.isFinite(date)) return Math.max(0, Math.ceil((date - this.now()) / 1000));
    return null;
  }

  private codeForStatus(status: number): { code: string; message: string; canDemo: boolean } {
    if (status === 401) return { code: 'auth', message: 'Nansen rejected the API key.', canDemo: true };
    if (status === 402) return { code: 'payment', message: 'Nansen account has no available credits.', canDemo: true };
    if (status === 403) return { code: 'forbidden', message: 'Nansen refused this request.', canDemo: true };
    // Never reuse the game's own `not_found`: the client reads that as "your voyage expired".
    if (status === 404) return { code: 'upstream_not_found', message: 'Nansen could not find that resource.', canDemo: true };
    if (status === 429) return { code: 'rate_limited', message: 'Nansen rate limit reached.', canDemo: true };
    if (status >= 500) return { code: 'upstream', message: 'Nansen is temporarily unavailable.', canDemo: true };
    // Any other client error (400, 409, 422, ...) is deterministic: retrying the same
    // call cannot help, but the rehearsal still can, so it stays on offer.
    if (status >= 400) return { code: 'upstream_rejected', message: 'Nansen rejected this request.', canDemo: true };
    return { code: 'upstream', message: 'Unexpected upstream response.', canDemo: true };
  }

  private recordAttempt(endpoint: string, status: number, requestId: string | null, credits: number | null, ok: boolean): void {
    const stats = this.endpointStats(endpoint);
    stats.requests += 1;
    if (ok) {
      stats.successes += 1;
    } else {
      stats.failures += 1;
      this.totals.failures += 1;
    }
    // Credits are deducted upstream even when the response is an error or unreadable,
    // so a header-reported deduction is counted for every recorded attempt.
    if (credits !== null) this.totals.creditsUsed += credits;
    this.recent.push({ at: new Date(this.now()).toISOString(), endpoint, status, requestId, credits });
    if (this.recent.length > this.maxRecent) this.recent = this.recent.slice(-this.maxRecent);
    this.schedulePersist();
  }

  /**
   * One network attempt. The hard deadline covers the body read as well as the
   * response headers, and the attempt is recorded exactly once regardless of how
   * it ends (success, HTTP error, malformed body, timeout or transport failure).
   */
  private async attempt(pathname: string, payload: unknown, endpoint: string, shape: 'rows' | 'object' = 'rows'): Promise<{ json: unknown; requestId: string | null; credits: number | null; status: number }> {
    if (!this.apiKey) {
      throw new ApiError('Nansen API key is not configured.', 'missing_key', { canDemo: true });
    }
    this.reserveAttempt();
    // The semaphore wraps the whole attempt, so discovery and reads share one
    // global concurrency bound. Nothing else acquires it, so no double-acquire.
    await this.semaphore.acquire();

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new ApiError('Nansen request timed out.', 'timeout', { canDemo: true }));
      }, this.timeoutMs);
    });

    let recorded = false;
    const record = (status: number, requestId: string | null, credits: number | null, ok: boolean): void => {
      if (recorded) return;
      recorded = true;
      this.recordAttempt(endpoint, status, requestId, credits, ok);
    };

    try {
      let response: Response;
      try {
        const pending = this.fetchImpl(`${this.baseUrl}/${pathname}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json', apikey: this.apiKey },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        // Swallow late rejections so a timeout never becomes an unhandled rejection.
        pending.catch(() => undefined);
        response = await Promise.race([pending, timeout]);
      } catch (error) {
        if (error instanceof ApiError && error.code === 'timeout') {
          // The attempt was made and the budget consumed, so record it for quota evidence.
          record(0, null, null, false);
          throw error;
        }
        if (error instanceof ApiError) throw error;
        const name = (error as { name?: string } | null)?.name;
        if (name === 'AbortError' || name === 'TimeoutError') {
          record(0, null, null, false);
          throw new ApiError('Nansen request timed out.', 'timeout', { canDemo: true });
        }
        record(0, null, null, false);
        throw new ApiError('Could not reach Nansen.', 'upstream', { canDemo: true });
      }

      const requestId = response.headers.get('X-Request-Id');
      const creditsHeader = response.headers.get('X-Nansen-Credits-Used');
      const credits = creditsHeader !== null && Number.isFinite(Number(creditsHeader)) ? Number(creditsHeader) : null;
      const remainingHeader = response.headers.get('X-Nansen-Credits-Remaining');
      if (remainingHeader !== null && Number.isFinite(Number(remainingHeader))) {
        this.creditsRemaining = Number(remainingHeader);
      }

      if (!response.ok) {
        const { code, message, canDemo } = this.codeForStatus(response.status);
        const retryAfter = this.parseRetryAfter(response.headers.get('Retry-After')) ?? undefined;
        record(response.status, requestId, credits, false);
        throw new ApiError(message, code, { retryAfter, canDemo });
      }

      // Headers are not a response: the same hard deadline must cover the body read,
      // otherwise a stalled body would hang the request forever.
      let json: unknown;
      try {
        const body = response.json();
        body.catch(() => undefined);
        json = await Promise.race([body, timeout]);
      } catch (error) {
        if (error instanceof ApiError && error.code === 'timeout') {
          record(response.status, requestId, credits, false);
          throw error;
        }
        record(response.status, requestId, credits, false);
        throw new ApiError('Nansen returned an unreadable response.', 'malformed', { canDemo: true });
      }
      // Row endpoints: `data` must be an array. An empty array is legitimate; any
      // other shape is a schema violation and must never be silently normalised
      // into "no signal". Object endpoints (Profiler summary) must be an object.
      const badShape =
        json === null ||
        typeof json !== 'object' ||
        Array.isArray(json) ||
        (shape === 'rows' && !Array.isArray((json as { data?: unknown }).data));
      if (badShape) {
        record(response.status, requestId, credits, false);
        throw new ApiError('Nansen returned an unexpected payload.', 'malformed', { canDemo: true });
      }

      record(response.status, requestId, credits, true);
      this.totals.creditsEstimated += 1; // every endpoint used here is published at one credit per call
      this.totals.successes += 1;
      this.schedulePersist();
      return { json, requestId, credits, status: response.status };
    } finally {
      if (timer) clearTimeout(timer);
      this.semaphore.release();
    }
  }

  /** Attempt with bounded exponential retry for 429/5xx only. */
  private async request(pathname: string, payload: unknown, endpoint: string, timeframe: string, shape: 'rows' | 'object' = 'rows'): Promise<{ json: unknown; provenance: Provenance }> {
    let lastError: ApiError | null = null;
    for (let attemptIndex = 0; attemptIndex <= this.maxRetries; attemptIndex += 1) {
      try {
        const result = await this.attempt(pathname, payload, endpoint, shape);
        return {
          json: result.json,
          provenance: {
            endpoint,
            fetchedAt: new Date(this.now()).toISOString(),
            timeframe,
            requestId: result.requestId,
            cached: false,
          },
        };
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        lastError = error;
        const retryable = error.code === 'rate_limited' || error.code === 'upstream';
        if (!retryable || attemptIndex >= this.maxRetries) throw error;
        if (error.retryAfter !== undefined && error.retryAfter * 1000 > MAX_RETRY_AFTER_MS) {
          // Waiting this long would hang the player's request; let the caller decide.
          throw error;
        }
        const waitMs = error.retryAfter !== undefined ? error.retryAfter * 1000 : BACKOFF_BASE_MS * 2 ** attemptIndex;
        await this.sleep(waitMs);
      }
    }
    throw lastError ?? new ApiError('Nansen request failed.', 'upstream', { canDemo: true });
  }

  /**
   * Cache + in-flight dedup wrapper. `shouldCache` lets a caller refuse to keep
   * a result (an empty reading must not pin a retry to the same emptiness) and
   * `ttlMs` shortens the lifetime for short windows; it never extends it.
   */
  private async cached<T>(
    key: string,
    produce: () => Promise<T>,
    policy: { shouldCache?: (value: T) => boolean; ttlMs?: number } = {},
  ): Promise<{ value: T; cached: boolean }> {
    const hit = this.readCache<T>(key);
    if (hit !== null) return { value: hit, cached: true };

    const pending = this.inflight.get(key) as Promise<T> | undefined;
    if (pending) {
      this.totals.deduplicated += 1;
      this.schedulePersist();
      return { value: await pending, cached: true };
    }

    const promise = produce();
    this.inflight.set(key, promise as Promise<unknown>);
    try {
      const value = await promise;
      if (!policy.shouldCache || policy.shouldCache(value)) this.writeCache(key, value, policy.ttlMs);
      return { value, cached: false };
    } finally {
      this.inflight.delete(key);
    }
  }

  // -------------------------------------------------------------- public API

  /**
   * Token screener discovery. Returns at most `perPage` candidates carrying the
   * token address. Addresses stay server-side and are never placed in GameState.
   */
  async discoverCandidates(perPage = SCREENER_PER_PAGE): Promise<Candidate[]> {
    const page = Math.max(1, Math.min(Math.floor(perPage) || SCREENER_PER_PAGE, SCREENER_PER_PAGE));
    const key = `screener:${SCREENER_TIMEFRAME}:${page}`;
    const { value } = await this.cached(key, async () => {
      const { json, provenance } = await this.request(
        'token-screener',
        {
          chains: ['ethereum', 'base', 'solana'],
          timeframe: SCREENER_TIMEFRAME,
          pagination: { page: 1, per_page: page },
          filters: { include_stablecoins: false },
          order_by: [{ field: 'volume', direction: 'DESC' }],
        },
        SCREENER_ENDPOINT,
        SCREENER_TIMEFRAME,
      );
      const rows = extractRows(json);
      const candidates: Candidate[] = [];
      const seen = new Set<string>();
      for (const row of rows) {
        const chain = typeof row.chain === 'string' ? row.chain : null;
        const address = typeof row.token_address === 'string' ? row.token_address : null;
        const symbol = typeof row.token_symbol === 'string' ? row.token_symbol : null;
        if (!chain || !address || !symbol) continue;
        const identity = `${chain}:${address}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        candidates.push({ chain, address, symbol, market: marketSnapshot(row, { ...provenance }) });
      }
      for (const candidate of candidates) {
        if (!this.chains.includes(candidate.chain)) this.chains.push(candidate.chain);
      }
      this.chains = this.chains.slice(0, 16);
      this.totals.eventsProcessed += candidates.length;
      this.schedulePersist();
      return candidates;
    });
    return value.map((c) => ({ ...c, market: { ...c.market, provenance: { ...c.market.provenance } } } satisfies Candidate));
  }

  private isoWindow(ms: number): { from: string; to: string } {
    const to = this.now();
    const iso = (t: number) => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
    return { from: iso(to - ms), to: iso(to) };
  }

  private baseProvenance(endpoint: string, timeframe: string): Provenance {
    return { endpoint, fetchedAt: new Date(this.now()).toISOString(), timeframe, requestId: null, cached: false };
  }

  /** Cached derived clue; a cache hit is flagged in provenance so Source proof stays honest. */
  private async cachedClue<T extends { provenance: Provenance } | BuyersDerived>(key: string, produce: () => Promise<T>): Promise<T> {
    const { value, cached } = await this.cached(key, produce);
    const copy = structuredClone(value);
    if (cached) {
      if ('clue' in copy) copy.clue.provenance.cached = true;
      else copy.provenance.cached = true;
    }
    return copy;
  }

  /**
   * Market-wide Smart Money perp positioning on Hyperliquid (one call, cached).
   * Throws ApiError on failure; the caller degrades to a fogged storm glass.
   */
  async loadWeather(): Promise<PerpDerived> {
    const { value, cached } = await this.cached('perp-screener:sm:24h', async () => {
      const { json, provenance } = await this.request(
        'perp-screener',
        {
          date: this.isoWindow(DAY_MS),
          pagination: { page: 1, per_page: 60 },
          filters: { trader_type: 'sm' },
          order_by: [{ field: 'smart_money_volume', direction: 'DESC' }],
        },
        PERP_ENDPOINT,
        '24h',
      );
      const rows = extractRows(json);
      this.totals.eventsProcessed += rows.length;
      this.schedulePersist();
      return deriveWeather(rows, provenance);
    });
    const copy = structuredClone(value);
    if (cached) copy.weather.provenance.cached = true;
    return copy;
  }

  /**
   * The full Nansen toolkit for one token. Never throws: a view that fails
   * becomes an `unavailable` clue carrying the sanitised error code, because a
   * missing clue must never block play or be faked.
   */
  async loadTokenIntel(chain: string, address: string): Promise<Partial<Record<IntelToolId, Clue>>> {
    if (!chain || !address) throw new ApiError('A chain and token address are required.', 'bad_request');
    const guard = async <T>(run: () => Promise<T>, fallback: (code: string) => T): Promise<T> => {
      try {
        return await run();
      } catch (error) {
        return fallback(error instanceof ApiError ? error.code : 'upstream');
      }
    };
    const id = `${chain}:${address}`;

    const buyersP = guard<BuyersDerived>(
      () =>
        this.cachedClue(`buyers:${id}`, async () => {
          const { json, provenance } = await this.request(
            'tgm/who-bought-sold',
            {
              chain,
              token_address: address,
              buy_or_sell: 'BUY',
              date: this.isoWindow(DAY_MS),
              pagination: { page: 1, per_page: 25 },
              order_by: [{ field: 'bought_volume_usd', direction: 'DESC' }],
            },
            BUYERS_ENDPOINT,
            '24h',
          );
          const rows = extractRows(json);
          this.totals.eventsProcessed += rows.length;
          return deriveBuyers(rows, provenance);
        }),
      (code) => ({ clue: unavailableClue('buyers', this.baseProvenance(BUYERS_ENDPOINT, '24h'), code), profileTarget: null }),
    );

    const tradesP = guard<Clue>(
      () =>
        this.cachedClue(`trades:${id}`, async () => {
          const { json, provenance } = await this.request(
            'tgm/dex-trades',
            {
              chain,
              token_address: address,
              date: this.isoWindow(HOUR_MS),
              pagination: { page: 1, per_page: 100 },
              order_by: [{ field: 'block_timestamp', direction: 'DESC' }],
            },
            TRADES_ENDPOINT,
            '1h',
          );
          const rows = extractRows(json);
          const more = (json as { pagination?: { is_last_page?: unknown } }).pagination?.is_last_page === false;
          this.totals.eventsProcessed += rows.length;
          return deriveTrades(rows, provenance, more);
        }),
      (code) => unavailableClue('trades', this.baseProvenance(TRADES_ENDPOINT, '1h'), code),
    );

    const transfersP = guard<Clue>(
      () =>
        this.cachedClue(`transfers:${id}`, async () => {
          const { json, provenance } = await this.request(
            'tgm/transfers',
            {
              chain,
              token_address: address,
              date: this.isoWindow(DAY_MS),
              pagination: { page: 1, per_page: 25 },
              order_by: [{ field: 'transfer_value_usd', direction: 'DESC' }],
            },
            TRANSFERS_ENDPOINT,
            '24h',
          );
          const rows = extractRows(json);
          this.totals.eventsProcessed += rows.length;
          return deriveTransfers(rows, provenance);
        }),
      (code) => unavailableClue('transfers', this.baseProvenance(TRANSFERS_ENDPOINT, '24h'), code),
    );

    const trendP = guard<Clue>(
      () =>
        this.cachedClue(`trend:${id}`, async () => {
          const { json, provenance } = await this.request(
            'tgm/flows',
            {
              chain,
              token_address: address,
              label: 'smart_money',
              date: this.isoWindow(7 * DAY_MS),
              pagination: { page: 1, per_page: 200 },
              order_by: [{ field: 'date', direction: 'ASC' }],
            },
            TREND_ENDPOINT,
            '7d',
          );
          const rows = extractRows(json);
          this.totals.eventsProcessed += rows.length;
          return deriveTrend(rows, provenance);
        }),
      (code) => unavailableClue('trend', this.baseProvenance(TREND_ENDPOINT, '7d'), code),
    );

    const buyers = await buyersP;
    let profilerP: Promise<Clue>;
    if (buyers.clue.status === 'unavailable') {
      profilerP = Promise.resolve(unavailableClue('profiler', this.baseProvenance(PROFILER_ENDPOINT, '30d'), 'ledger unavailable'));
    } else if (!buyers.profileTarget) {
      profilerP = Promise.resolve(noTargetProfile(this.baseProvenance(PROFILER_ENDPOINT, '30d')));
    } else if (!PROFILER_CHAINS.has(chain)) {
      profilerP = Promise.resolve(unavailableClue('profiler', this.baseProvenance(PROFILER_ENDPOINT, '30d'), 'chain not covered'));
    } else {
      const target = buyers.profileTarget;
      profilerP = guard<Clue>(
        () =>
          this.cachedClue(`profiler:${chain}:${target}`, async () => {
            const { json, provenance } = await this.request(
              'profiler/address/pnl-summary',
              { address: target, chain, date: this.isoWindow(30 * DAY_MS) },
              PROFILER_ENDPOINT,
              '30d',
              'object',
            );
            this.totals.eventsProcessed += 1;
            return deriveProfile(json, provenance);
          }),
        (code) => unavailableClue('profiler', this.baseProvenance(PROFILER_ENDPOINT, '30d'), code),
      );
    }
    const [trades, transfers, trend, profiler] = await Promise.all([tradesP, transfersP, trendP, profilerP]);
    this.schedulePersist();
    return { buyers: buyers.clue, trades, transfers, trend, profiler };
  }

  /** Flow intelligence for one token/timeframe, normalised into a Reading. */
  async loadReading(chain: string, address: string, timeframe: Timeframe): Promise<Reading> {
    if (!chain || !address) throw new ApiError('A chain and token address are required.', 'bad_request');
    const key = `flow:${chain}:${address}:${timeframe}`;
    const { value, cached } = await this.cached(key, async () => {
      const { json, provenance } = await this.request(
        'tgm/flow-intelligence',
        { chain, token_address: address, timeframe },
        FLOW_ENDPOINT,
        timeframe,
      );
      const row = firstRow(json);
      const reading = normalizeReading(row, provenance);
      this.totals.eventsProcessed += 1;
      this.schedulePersist();
      return reading;
    }, {
      // An empty read is an availability blip: keeping it would make every retry
      // in the next ten minutes fail the same way.
      shouldCache: (reading) => reading.available > 0,
      // The resolving 5-minute window must stay close to five minutes old.
      ttlMs: timeframe === '5m' ? SHORT_WINDOW_TTL_MS : undefined,
    });
    if (cached) {
      return { ...value, provenance: { ...value.provenance, cached: true } };
    }
    return value;
  }

  /**
   * Loads several readings. Concurrency is bounded globally by the semaphore in
   * `attempt`, which also covers discovery, so this does not acquire it again.
   */
  async loadReadings(requests: { chain: string; address: string; timeframe: Timeframe }[]): Promise<Reading[]> {
    const results: Reading[] = new Array(requests.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(3, requests.length) }, async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= requests.length) return;
        const request = requests[index];
        results[index] = await this.loadReading(request.chain, request.address, request.timeframe);
      }
    });
    await Promise.all(workers);
    return results;
  }
}

function extractRows(json: unknown): Record<string, unknown>[] {
  if (!json || typeof json !== 'object') return [];
  const data = (json as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
}

function firstRow(json: unknown): unknown {
  const rows = extractRows(json);
  return rows.length > 0 ? rows[0] : null;
}
