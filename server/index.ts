/**
 * Veilwake HTTP entry point.
 *
 * Express 5 + tsx. Vite serves the client through middleware in development and
 * `dist/` is served statically in production (`--production`).
 *
 * The server is a thin shell around `World` (game orchestration) and
 * `NansenClient` (upstream transport). It never accepts upstream parameters from
 * the client, never exposes the API key and never returns raw Nansen data.
 */
import path from 'node:path';
import { createHash, timingSafeEqual } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { ApiError, DEFAULT_PER_DAY, DEFAULT_PER_HOUR, NansenClient } from './nansen.ts';
import { World, isValidDoctrine, isValidMode, isValidStance } from './world.ts';
import { isToolId } from '../shared/engine.ts';
import { ALERTS, CALLS } from '../shared/types.ts';
import type { AlertPlan, ApiFailure, CallChoice, Doctrine, IntelToolId, Mode, Stance } from '../shared/types.ts';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4173;
const BODY_LIMIT = '8kb';
const DEFAULT_RATE_LIMIT_PER_MINUTE = 120;
const RATE_WINDOW_MS = 60_000;

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export interface CreateAppOptions {
  production?: boolean;
  root?: string;
  /** Mount the Vite dev middleware. Defaults to `!production`. */
  vite?: boolean;
  /** Serve `dist/`. Defaults to `production`. */
  serveStatic?: boolean;
  host?: string;
  port?: number;
  adminToken?: string | null;
  /** Optional extra origin accepted for state-changing API calls (exact match). */
  trustedOrigin?: string | null;
  client?: NansenClient;
  world?: World;
  rateLimitPerMinute?: number;
  /** Express `trust proxy` value. Defaults to `TRUST_PROXY`, else false. */
  trustProxy?: boolean | number | string;
  now?: () => number;
}

/** Reads `.env` from the project root. Missing or unreadable files are not fatal. */
function loadEnv(root: string): void {
  const loader = (process as unknown as { loadEnvFile?: (p?: string) => void }).loadEnvFile;
  if (typeof loader !== 'function') return;
  try {
    loader.call(process, path.join(root, '.env'));
  } catch {
    // No .env: the server still starts, live mode reports `keyConfigured: false`.
  }
}

function hostnameOf(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed.includes('://') ? trimmed : `http://${trimmed}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isLoopbackHostname(hostname: string | null): boolean {
  return hostname !== null && LOOPBACK_HOSTNAMES.has(hostname);
}

/** True only for a genuine direct loopback connection with no proxy headers. */
function isDirectLoopback(req: Request): boolean {
  const address = (req.socket.remoteAddress ?? '').toLowerCase();
  const loopbackAddress = address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
  if (!loopbackAddress) return false;
  for (const header of ['x-forwarded-for', 'x-forwarded-host', 'x-real-ip', 'forwarded', 'x-forwarded-proto']) {
    if (req.get(header)) return false;
  }
  return isLoopbackHostname(hostnameOf(req.get('host')));
}

/** Canonicalises an origin to scheme://host:port so ports are never ignored. */
function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value.includes('://') ? value : `http://${value}`);
    return parsed.origin;
  } catch {
    return null;
  }
}

/** The client address used for rate limits and the per-client live voyage cap. */
function clientKey(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

/** Constant-time string comparison; digests first so length differences do not leak. */
function constantTimeEqual(a: string, b: string): boolean {
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right);
}

function statusForCode(code: string): number {
  switch (code) {
    case 'bad_request':
      return 400;
    case 'missing_key':
      return 503;
    case 'auth':
      return 401;
    case 'payment':
      return 402;
    case 'forbidden':
      return 403;
    case 'not_found':
      return 404;
    case 'conflict':
    case 'busy':
      return 409;
    case 'payload_too_large':
      return 413;
    case 'rate_limited':
    case 'budget':
      return 429;
    case 'timeout':
      return 504;
    case 'unavailable':
    case 'session_limit':
      return 503;
    // Nansen answered, but not usefully: a bad gateway, not a server bug and
    // never the game's own 404 (which the client reads as "voyage expired").
    case 'upstream':
    case 'upstream_not_found':
    case 'upstream_rejected':
    case 'malformed':
      return 502;
    default:
      return 500;
  }
}

/** Converts any thrown value into a safe, sanitised failure payload. */
function toFailure(error: unknown): { failure: ApiFailure; status: number } {
  if (error instanceof ApiError) {
    return { failure: error.toFailure(), status: statusForCode(error.code) };
  }
  const typed = error as { type?: string; status?: number } | null;
  if (typed?.type === 'entity.too.large' || typed?.status === 413) {
    return { failure: { error: 'Request body is too large.', code: 'payload_too_large' }, status: 413 };
  }
  if (error instanceof SyntaxError) {
    return { failure: { error: 'Request body is not valid JSON.', code: 'bad_request' }, status: 400 };
  }
  // Body-parser and router errors carry their own client status (415 charset,
  // 400 malformed URL encoding, ...). They are the caller's fault, not a 500.
  const status = typed?.status;
  if (typeof status === 'number' && Number.isInteger(status) && status >= 400 && status < 500) {
    return { failure: { error: 'The request could not be read.', code: 'bad_request' }, status };
  }
  return { failure: { error: 'Something went wrong on the server.', code: 'internal' }, status: 500 };
}

/** Reads a numeric env var. Empty or non-numeric means "use the default", never 0. */
function envNumber(name: string): number | undefined {
  const raw = (process.env[name] ?? '').trim();
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/** `.env.example` placeholders must never act as real secrets. */
function realSecret(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed || /^(replace_with|your_)/i.test(trimmed)) return null;
  return trimmed;
}

/**
 * `TRUST_PROXY` for deployments behind a reverse proxy: `true`, a hop count, or
 * an Express trust list such as `loopback`. Unset means the socket is the client.
 */
function parseTrustProxy(value: string | undefined): boolean | number | string {
  const raw = (value ?? '').trim();
  if (!raw || raw === 'false' || raw === '0') return false;
  if (raw === 'true') return true;
  const hops = Number(raw);
  return Number.isInteger(hops) && hops > 0 ? hops : raw;
}

/** Express 5 can type a route parameter as an array; game ids are always single. */
function pathId(req: Request): string {
  const value = (req.params as Record<string, string | string[] | undefined>).id;
  const id = Array.isArray(value) ? value[0] : value;
  if (!id) throw new ApiError('A voyage id is required.', 'bad_request');
  return id;
}

function parseRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new ApiError('A numeric revision is required.', 'bad_request');
  }
  return value;
}

function parseTool(value: unknown): IntelToolId {
  if (isToolId(value)) return value;
  throw new ApiError('Unknown Nansen view.', 'bad_request');
}

function parseAlert(value: unknown): AlertPlan | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new ApiError('A Smart Alert must be an object.', 'bad_request');
  const { laneId, condition } = value as { laneId?: unknown; condition?: unknown };
  if (typeof laneId !== 'string' || !laneId) throw new ApiError('A Smart Alert needs a lane id.', 'bad_request');
  if (typeof condition !== 'string' || !Object.hasOwn(ALERTS, condition)) throw new ApiError('Unknown Smart Alert condition.', 'bad_request');
  return { laneId, condition: condition as AlertPlan['condition'] };
}

function parseCalls(value: unknown): Record<string, CallChoice> {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new ApiError('Calls must be an object of lane calls.', 'bad_request');
  const calls: Record<string, CallChoice> = {};
  for (const [laneId, call] of Object.entries(value as Record<string, unknown>)) {
    if (typeof call !== 'string' || !Object.hasOwn(CALLS, call)) throw new ApiError(`Unknown call for lane "${laneId}".`, 'bad_request');
    calls[laneId] = call as CallChoice;
  }
  return calls;
}

function parsePlans(value: unknown): Record<string, Stance> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError('Plans must be an object of lane stances.', 'bad_request');
  }
  const plans: Record<string, Stance> = {};
  for (const [laneId, stance] of Object.entries(value as Record<string, unknown>)) {
    if (!isValidStance(stance)) throw new ApiError(`Unknown stance for lane "${laneId}".`, 'bad_request');
    plans[laneId] = stance;
  }
  return plans;
}

export async function createApp(options: CreateAppOptions = {}): Promise<Express> {
  const root = options.root ?? ROOT_DIR;
  const production = options.production ?? false;
  const now = options.now ?? (() => Date.now());
  const adminToken = options.adminToken !== undefined ? options.adminToken : realSecret(process.env.ADMIN_TOKEN);
  const trustedOrigin = normalizeOrigin(
    options.trustedOrigin !== undefined
      ? options.trustedOrigin
      : (process.env.TRUSTED_ORIGIN ?? '').trim() || null,
  );
  const trustProxy = options.trustProxy ?? parseTrustProxy(process.env.TRUST_PROXY);
  // Any sign of a proxied deployment turns off the token-free loopback bypass:
  // a same-host proxy makes every visitor look like a loopback connection.
  const proxied = trustProxy !== false || trustedOrigin !== null;

  const ttlSeconds = envNumber('CACHE_TTL_SECONDS');
  const client =
    options.client ??
    new NansenClient({
      apiKey: realSecret(process.env.NANSEN_API_KEY),
      cacheTtlMs: ttlSeconds === undefined ? undefined : ttlSeconds * 1000,
      perHourLimit: envNumber('MAX_API_CALLS_PER_HOUR') ?? DEFAULT_PER_HOUR,
      perDayLimit: envNumber('MAX_API_CALLS_PER_DAY') ?? DEFAULT_PER_DAY,
      // Anchored to the project, not the working directory, so the rolling
      // budget windows survive restarts wherever the process is launched from.
      telemetryPath: path.join(root, '.runtime', 'telemetry.json'),
      now,
    });
  const world = options.world ?? new World(client, { now });

  // Hostnames this server answers to on loopback. A DNS-rebinding page arrives
  // with its own hostname in Host, so an unproxied loopback bind rejects it.
  const boundHost = hostnameOf(options.host ?? DEFAULT_HOST);
  const guardHost = trustProxy === false && isLoopbackHostname(boundHost);
  const knownHosts = new Set(LOOPBACK_HOSTNAMES);
  if (boundHost) knownHosts.add(boundHost);
  const trustedHost = hostnameOf(trustedOrigin ?? undefined);
  if (trustedHost) knownHosts.add(trustedHost);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);

  // ---------------------------------------------- in-memory maintenance sweep
  // Drops expired sessions and cache entries on a timer. It only touches memory
  // and never contacts upstream. `unref` keeps it from holding the process open.
  const sweepTimer = setInterval(() => {
    try {
      world.sweep();
    } catch {
      // A maintenance sweep must never surface as an unhandled rejection.
    }
  }, 30_000);
  if (typeof sweepTimer.unref === 'function') sweepTimer.unref();
  app.locals.sweepTimer = sweepTimer;
  app.locals.stopSweep = () => clearInterval(sweepTimer);
  app.locals.world = world;
  app.locals.client = client;

  // ------------------------------------------------------------- security
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    // Vite's dev client needs inline scripts and an HMR websocket; production stays strict.
    res.setHeader(
      'Content-Security-Policy',
      production
        ? "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
        : "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ws: wss: http://127.0.0.1:* http://localhost:*; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    );
    next();
  });

  // ------------------------------------------------------- entry rate limit
  // Only the API is throttled; static asset loads must never consume the budget.
  const limit = options.rateLimitPerMinute ?? DEFAULT_RATE_LIMIT_PER_MINUTE;
  const hits = new Map<string, number[]>();
  let lastPrune = 0;
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const nowMs = now();
    // `req.ip` is the socket address unless TRUST_PROXY names a proxy, in which
    // case it is the forwarded client, so players behind one proxy are not pooled.
    const key = clientKey(req);
    const recent = (hits.get(key) ?? []).filter((at) => nowMs - at < RATE_WINDOW_MS);
    if (recent.length >= limit) {
      res.setHeader('Retry-After', '60');
      res.status(429).json({ error: 'Too many requests to this game server.', code: 'server_rate_limited', retryAfter: 60 } satisfies ApiFailure);
      return;
    }
    recent.push(nowMs);
    hits.set(key, recent);
    // Prune at most every few seconds, so a crowded map is not rescanned per request.
    if (hits.size > 2_000 && nowMs - lastPrune > 5_000) {
      lastPrune = nowMs;
      for (const [address, stamps] of hits) {
        if (stamps.every((at) => nowMs - at >= RATE_WINDOW_MS)) hits.delete(address);
      }
    }
    next();
  });

  // Loopback binds answer only to loopback (and configured) hostnames.
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (guardHost) {
      const host = hostnameOf(req.get('host'));
      if (host === null || !knownHosts.has(host)) {
        res.status(403).json({ error: 'Unknown host.', code: 'forbidden' } satisfies ApiFailure);
        return;
      }
    }
    next();
  });

  // ------------------------------------------------------------- API shell
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    // Same-origin guard: reject cross-site state changes. The comparison uses the
    // full origin (scheme, host AND port) against this server's own origin, so a
    // different port or an unrelated localhost origin is never trusted.
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE') {
      const site = (req.get('sec-fetch-site') ?? '').trim().toLowerCase();
      if (site === 'cross-site') {
        res.status(403).json({ error: 'Cross-site request rejected.', code: 'forbidden' } satisfies ApiFailure);
        return;
      }
      const origin = req.get('origin');
      if (origin) {
        const presented = normalizeOrigin(origin);
        const expected = normalizeOrigin(`${req.protocol}://${req.get('host') ?? ''}`);
        const allowed =
          presented !== null &&
          (presented === expected || (trustedOrigin !== null && presented === trustedOrigin));
        if (!allowed) {
          res.status(403).json({ error: 'Cross-origin request rejected.', code: 'forbidden' } satisfies ApiFailure);
          return;
        }
      }
    }
    next();
  });

  app.use('/api', express.json({ limit: BODY_LIMIT }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, keyConfigured: client.keyConfigured });
  });

  app.get('/api/admin/telemetry', (req: Request, res: Response) => {
    const header = req.get('authorization') ?? '';
    const presented = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    // The loopback bypass is only safe when no token is configured at all;
    // once a token exists it is required even from loopback.
    // A proxied deployment never gets it: a same-host proxy looks like loopback.
    const loopbackBypass = adminToken === null && !proxied && isDirectLoopback(req);
    if (!loopbackBypass && (adminToken === null || !constantTimeEqual(presented, adminToken))) {
      res.status(403).json({ error: 'Telemetry is restricted.', code: 'forbidden' } satisfies ApiFailure);
      return;
    }
    res.json({ telemetry: client.telemetry(), sessions: world.sessionCount });
  });

  app.post('/api/game', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { mode?: unknown; doctrine?: unknown };
    if (!isValidMode(body.mode)) throw new ApiError('Mode must be "live" or "demo".', 'bad_request');
    if (!isValidDoctrine(body.doctrine)) throw new ApiError('Unknown doctrine.', 'bad_request');
    const game = await world.create(body.mode as Mode, body.doctrine as Doctrine, clientKey(req));
    res.json(game);
  });

  app.get('/api/game/:id', (req: Request, res: Response) => {
    res.json(world.get(pathId(req)));
  });

  app.post('/api/game/:id/scout', (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { laneId?: unknown; revision?: unknown };
    if (typeof body.laneId !== 'string' || body.laneId.length === 0) {
      throw new ApiError('A lane id is required.', 'bad_request');
    }
    res.json(world.scout(pathId(req), body.laneId, parseRevision(body.revision)));
  });

  app.post('/api/game/:id/investigate', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { laneId?: unknown; tool?: unknown; revision?: unknown };
    if (typeof body.laneId !== 'string' || body.laneId.length === 0) throw new ApiError('A lane id is required.', 'bad_request');
    res.json(await world.investigate(pathId(req), body.laneId, parseTool(body.tool), parseRevision(body.revision)));
  });

  app.post('/api/game/:id/resolve', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { plans?: unknown; revision?: unknown; alert?: unknown; calls?: unknown };
    const plans = parsePlans(body.plans);
    const extras = { alert: parseAlert(body.alert), calls: parseCalls(body.calls) };
    res.json(await world.resolve(pathId(req), plans, parseRevision(body.revision), extras));
  });

  // Explicit player click → the token's public Token God Mode page on nansen.ai.
  // The contract address is disclosed only in this redirect, never in game state.
  app.get('/api/game/:id/nansen/:wave/:laneId', (req: Request, res: Response) => {
    const params = req.params as Record<string, string | string[] | undefined>;
    const wave = Number(Array.isArray(params.wave) ? params.wave[0] : params.wave);
    const laneId = String(Array.isArray(params.laneId) ? params.laneId[0] : params.laneId ?? '');
    res.redirect(302, world.nansenLink(pathId(req), wave, laneId));
  });

  app.post('/api/game/:id/next', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { revision?: unknown };
    res.json(await world.next(pathId(req), parseRevision(body.revision)));
  });

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'No such endpoint.', code: 'not_found' } satisfies ApiFailure);
  });

  // ------------------------------------------------------------- client app
  // Secrets and runtime state must never be reachable through the static layer.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (/\/\.(env|runtime|git)/i.test(req.path) || req.path.includes('..')) {
      res.status(404).type('text/plain').send('Not found');
      return;
    }
    next();
  });

  const useVite = options.vite ?? !production;
  const useStatic = options.serveStatic ?? production;

  if (useVite) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      root,
      appType: 'spa',
      server: {
        middlewareMode: true,
        host: options.host ?? DEFAULT_HOST,
        port: options.port ?? DEFAULT_PORT,
      },
    });
    app.use(vite.middlewares);
  } else if (useStatic) {
    const distDir = path.join(root, 'dist');
    app.use(express.static(distDir, { index: false, dotfiles: 'deny', fallthrough: true }));
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      // A missing hashed asset (stale tab after a deploy) must 404, not come back
      // as index.html that the browser then fails to run as a script.
      if (req.path.startsWith('/assets/') || /\.[a-z0-9]+$/i.test(req.path)) {
        res.status(404).type('text/plain').send('Not found');
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'), (error) => {
        if (error) next(error);
      });
    });
  }

  // -------------------------------------------------------------- errors
  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    // Mid-stream failures belong to Express, which closes the connection.
    if (res.headersSent) return next(error);
    const { failure, status } = toFailure(error);
    if (status === 429 && failure.retryAfter !== undefined) res.setHeader('Retry-After', String(failure.retryAfter));
    if (status >= 500) {
      // Server-side only: the stack helps the operator, the player gets the generic line.
      const detail = failure.code === 'internal' && error instanceof Error ? `\n${error.stack ?? error.message}` : '';
      console.error(`[veilwake] ${failure.code}${detail}`);
    }
    res.status(status).json(failure);
  });

  return app;
}

async function main(): Promise<void> {
  const root = ROOT_DIR;
  loadEnv(root);

  const production = process.argv.includes('--production') || process.env.NODE_ENV === 'production';
  const host = (process.env.HOST ?? '').trim() || DEFAULT_HOST;
  const portValue = Number(process.env.PORT ?? DEFAULT_PORT);
  const port = Number.isInteger(portValue) && portValue > 0 && portValue < 65_536 ? portValue : DEFAULT_PORT;
  const adminToken = realSecret(process.env.ADMIN_TOKEN);
  if ((process.env.ADMIN_TOKEN ?? '').trim() && !adminToken) {
    console.warn('[veilwake] ADMIN_TOKEN still holds the .env.example placeholder, so it is ignored.');
  }
  if (adminToken && adminToken.length < 24) {
    console.warn('[veilwake] ADMIN_TOKEN is shorter than 24 characters. Use a long random secret for any public deployment.');
  }

  // A public interface always requires a token, in development as well as production.
  if (!isLoopbackHostname(hostnameOf(host)) && !adminToken) {
    console.error('[veilwake] Refusing to bind a public interface without a real ADMIN_TOKEN.');
    process.exit(1);
  }

  if (production) {
    const { existsSync } = await import('node:fs');
    if (!existsSync(path.join(root, 'dist', 'index.html'))) {
      console.error('[veilwake] dist/index.html is missing. Run `npm run build` first.');
      process.exit(1);
    }
  }

  const app = await createApp({ production, root, host, port, adminToken });

  // Express 5 hands a bind failure (port in use, no permission) to this callback.
  app.listen(port, host, (error?: Error) => {
    if (error) {
      console.error(`[veilwake] could not listen on http://${host}:${port}: ${error.message}`);
      process.exit(1);
    }
    console.log(`[veilwake] listening on http://${host}:${port} (${production ? 'production' : 'development'})`);
    if (!realSecret(process.env.NANSEN_API_KEY)) console.log('[veilwake] NANSEN_API_KEY is not set — live voyages will be unavailable.');
  });
}

const invokedDirectly = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error('[veilwake] failed to start:', error instanceof Error ? error.message : 'unknown error');
    process.exit(1);
  });
}

export { loadEnv };
