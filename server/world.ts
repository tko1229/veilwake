/**
 * Voyage orchestration.
 *
 * Holds every piece of state that must never leave the process:
 *   - the discovered token addresses backing each live voyage
 *   - the in-flight Nansen toolkit reads for the current wave
 *   - the per-session busy lock that blocks duplicate concurrent actions
 *
 * Everything crossing the HTTP boundary goes through `publicGame` and therefore
 * carries token symbols, derived signals and derived clues only. The single
 * exception is `nansenLink`, which answers an explicit player click with a
 * redirect to the token's public Token God Mode page on nansen.ai.
 */
import { randomBytes } from 'node:crypto';
import {
  advanceWave,
  createGame,
  demoLanes,
  demoResolution,
  demoWaveWeather,
  emptyMarket,
  investigateLane,
  publicGame,
  resolveWave,
  scoutLane,
  validateExtras,
  validatePlans,
  type ResolveExtras,
} from '../shared/engine.ts';
import { calmWeather, perpShadowFor } from '../shared/intel.ts';
import type { Clue, Doctrine, GameState, IntelToolId, Lane, Mode, Reading, Stance, Weather } from '../shared/types.ts';
import { STANCES } from '../shared/types.ts';
import { ApiError, type Candidate, type NansenClient, type Timeframe } from './nansen.ts';

export const LANE_IDS = ['north', 'east', 'west'] as const;
export const LANE_NAMES = ['Glass Reach', 'Ember Reach', 'Moss Reach'] as const;
export const WAVES = 3;
export const TOKENS_PER_WAVE = 3;
export const TOKENS_PER_GAME = WAVES * TOKENS_PER_WAVE;
export const SCREENER_POOL = 18;
export const NANSEN_APP = 'https://app.nansen.ai';

const DEFAULT_MAX_SESSIONS = 200;
const DEFAULT_MAX_DEMO_SESSIONS = 500;
const DEFAULT_MAX_LIVE_PER_OWNER = 4;
const DEFAULT_IDLE_TTL_MS = 600_000;

export interface WorldOptions {
  now?: () => number;
  /** Cap on live voyages (the only kind that spends upstream calls), creates in flight included. */
  maxSessions?: number;
  /** Cap on rehearsal voyages. At the cap the least recently used rehearsal is dropped, never refused. */
  maxDemoSessions?: number;
  /** Live voyages one client address may hold. At the cap its own least recently used one is dropped. */
  maxLivePerOwner?: number;
  idleTtlMs?: number;
}

type IntelBundle = Partial<Record<IntelToolId, Clue>>[];

interface Session {
  game: GameState;
  /** Addresses stay here, server-side, and are never serialised. */
  waves: Candidate[][];
  /** Background toolkit reads per wave index; resolved into the game on first need. */
  intel: (Promise<IntelBundle> | null)[];
  intelLoaded: boolean[];
  busy: boolean;
  lastAccess: number;
  /** Client address that created the voyage; used only for the per-client live cap. */
  owner: string | null;
}

function newGameId(): string {
  return randomBytes(24).toString('base64url');
}

/** Round-robins across chains so a voyage is never single-chain. */
function roundRobin(candidates: Candidate[]): Candidate[] {
  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const bucket = groups.get(candidate.chain);
    if (bucket) bucket.push(candidate);
    else groups.set(candidate.chain, [candidate]);
  }
  const chains = [...groups.keys()];
  const ordered: Candidate[] = [];
  const longest = Math.max(0, ...[...groups.values()].map((bucket) => bucket.length));
  for (let round = 0; round < longest; round += 1) {
    for (const chain of chains) {
      const bucket = groups.get(chain);
      if (bucket && round < bucket.length) ordered.push(bucket[round]);
    }
  }
  return ordered;
}

/** Picks `count` distinct candidates, rotating the start so fresh sessions differ. */
function pickDiversified(candidates: Candidate[], count: number, cursor: number): Candidate[] {
  const ordered = roundRobin(candidates);
  if (ordered.length === 0) return [];
  const take = Math.min(count, ordered.length);
  const start = ((cursor % ordered.length) + ordered.length) % ordered.length;
  const picked: Candidate[] = [];
  for (let index = 0; index < take; index += 1) {
    picked.push(ordered[(start + index) % ordered.length]);
  }
  return picked;
}

/**
 * Preview is derived from the strength of the strongest available signal.
 * Missing cohorts are never filled with zeroes — an unreadable lane reads `uncertain`.
 */
export function previewOf(reading: Reading): Lane['preview'] {
  if (!reading || reading.available <= 0) return 'uncertain';
  const forces = reading.signals
    .map((signal) => signal.force)
    .filter((force): force is number => typeof force === 'number' && Number.isFinite(force));
  if (forces.length === 0) return 'uncertain';
  const strongest = Math.max(...forces);
  if (strongest >= 3) return 'volatile';
  if (strongest >= 1) return 'restless';
  return 'quiet';
}

export class World {
  private readonly sessions = new Map<string, Session>();
  private readonly now: () => number;
  private readonly maxSessions: number;
  private readonly maxDemoSessions: number;
  private readonly maxLivePerOwner: number;
  private readonly idleTtlMs: number;
  /** Live slots reserved by creates that are still awaiting upstream data. */
  private pending = 0;
  private readonly pendingByOwner = new Map<string, number>();
  private cursor = 0;

  constructor(private readonly client: NansenClient, options: WorldOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.maxSessions = Math.max(1, options.maxSessions ?? DEFAULT_MAX_SESSIONS);
    this.maxDemoSessions = Math.max(1, options.maxDemoSessions ?? DEFAULT_MAX_DEMO_SESSIONS);
    this.maxLivePerOwner = Math.max(1, options.maxLivePerOwner ?? DEFAULT_MAX_LIVE_PER_OWNER);
    this.idleTtlMs = Math.max(1_000, options.idleTtlMs ?? DEFAULT_IDLE_TTL_MS);
  }

  get sessionCount(): number {
    return this.sessions.size;
  }

  /** Drops expired sessions and cache entries. Called before every public operation. */
  sweep(): void {
    const nowMs = this.now();
    for (const [id, session] of this.sessions) {
      const expired = Date.parse(session.game.expiresAt);
      const stale = Number.isFinite(expired) ? expired <= nowMs : false;
      if (stale || nowMs - session.lastAccess > this.idleTtlMs) {
        this.sessions.delete(id);
      }
    }
    this.client.expireIdle();
  }

  private require(id: string): Session {
    this.sweep();
    const session = this.sessions.get(id);
    if (!session) throw new ApiError('That voyage is no longer afloat.', 'not_found');
    session.lastAccess = this.now();
    return session;
  }

  private static engineCall<T>(run: () => T): T {
    try {
      return run();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const message = error instanceof Error && error.message ? error.message : 'Invalid game action.';
      throw new ApiError(message, 'bad_request');
    }
  }

  /** Perp Screener weather plus per-symbol shadows. Failure fogs the glass; it never blocks play. */
  private async loadWeather(): Promise<{ weather: Weather; shadows: Record<string, number> }> {
    try {
      return await this.client.loadWeather();
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 'upstream';
      return {
        weather: calmWeather(
          { endpoint: 'perp-screener', fetchedAt: new Date(this.now()).toISOString(), timeframe: '24h', requestId: null, cached: false },
          `The Perp Screener did not answer (${code}). The storm glass is fogged this wave and adds no pressure.`,
        ),
        shadows: {},
      };
    }
  }

  private async buildLanes(tokens: Candidate[], shadows: Record<string, number>): Promise<Lane[]> {
    const requests = tokens.flatMap((token) => [
      { chain: token.chain, address: token.address, timeframe: '1h' as Timeframe },
      { chain: token.chain, address: token.address, timeframe: '1d' as Timeframe },
    ]);
    const readings = await this.client.loadReadings(requests);
    return tokens.map((token, index) => {
      const context = readings[index * 2];
      const baseline = readings[index * 2 + 1];
      return {
        id: LANE_IDS[index],
        name: LANE_NAMES[index],
        token: { chain: token.chain, symbol: token.symbol },
        market: token.market ?? emptyMarket(),
        context,
        baseline,
        revealed: false,
        preview: previewOf(context),
        intel: {},
        opened: [],
        perp: perpShadowFor(token.symbol, shadows),
      } satisfies Lane;
    });
  }

  /** Starts the toolkit reads for a wave in the background. Never rejects. */
  private prefetchIntel(tokens: Candidate[]): Promise<IntelBundle> {
    const promise = Promise.all(tokens.map((token) => this.client.loadTokenIntel(token.chain, token.address).catch(() => ({}))));
    promise.catch(() => undefined);
    return promise;
  }

  /** Waits for the current wave's toolkit reads and writes them into the server-side game. */
  private async ensureIntel(session: Session): Promise<void> {
    const game = session.game;
    if (game.mode !== 'live') return;
    const index = game.wave - 1;
    if (session.intelLoaded[index]) return;
    if (!session.intel[index]) session.intel[index] = this.prefetchIntel(session.waves[index] ?? []);
    const bundle = await session.intel[index]!;
    // The game object may have been replaced while we waited; write into the latest.
    const current = session.game;
    if (current.wave - 1 !== index) return;
    session.game = { ...current, lanes: current.lanes.map((lane, i) => ({ ...lane, intel: bundle[i] ?? {} })) };
    session.intelLoaded[index] = true;
  }

  private async createLiveGame(id: string, doctrine: Doctrine, owner: string | null): Promise<GameState> {
    const [pool, sky] = await Promise.all([this.client.discoverCandidates(SCREENER_POOL), this.loadWeather()]);
    if (pool.length === 0) {
      throw new ApiError('No live market candidates are available right now.', 'unavailable', { canDemo: true });
    }
    const picked = pickDiversified(pool, TOKENS_PER_GAME, this.cursor);
    if (picked.length < TOKENS_PER_GAME) {
      throw new ApiError('Not enough distinct live tokens for a full voyage.', 'unavailable', { canDemo: true });
    }
    this.cursor = (this.cursor + picked.length) % pool.length;

    const waves: Candidate[][] = [];
    for (let wave = 0; wave < WAVES; wave += 1) {
      waves.push(picked.slice(wave * TOKENS_PER_WAVE, (wave + 1) * TOKENS_PER_WAVE));
    }

    const lanes = await this.buildLanes(waves[0], sky.shadows);
    const silent = lanes.every((lane) => lane.context.available === 0 && lane.baseline.available === 0);
    if (silent) {
      throw new ApiError('Live intelligence returned no readable signal for this voyage.', 'unavailable', { canDemo: true });
    }

    const game = World.engineCall(() => createGame({ id, mode: 'live', doctrine, lanes, weather: sky.weather, now: this.now() }));
    this.sessions.set(id, {
      game,
      waves,
      intel: [this.prefetchIntel(waves[0]), null, null],
      intelLoaded: [false, false, false],
      busy: false,
      lastAccess: this.now(),
      owner,
    });
    return game;
  }

  private createDemoGame(id: string, doctrine: Doctrine, owner: string | null): GameState {
    const lanes = World.engineCall(() => demoLanes(1));
    const game = World.engineCall(() => createGame({ id, mode: 'demo', doctrine, lanes, weather: demoWaveWeather(1), now: this.now() }));
    this.sessions.set(id, { game, waves: [], intel: [], intelLoaded: [true, true, true], busy: false, lastAccess: this.now(), owner });
    return game;
  }

  /** Least recently used, idle session matching `match`, if any. */
  private oldestIdle(match: (session: Session) => boolean): string | null {
    let oldestId: string | null = null;
    let oldestAt = Infinity;
    for (const [id, session] of this.sessions) {
      if (session.busy || !match(session)) continue;
      if (session.lastAccess < oldestAt) {
        oldestAt = session.lastAccess;
        oldestId = id;
      }
    }
    return oldestId;
  }

  private count(match: (session: Session) => boolean): number {
    let total = 0;
    for (const session of this.sessions.values()) if (match(session)) total += 1;
    return total;
  }

  /** Rehearsals cost nothing upstream, so a full house drops the stalest one instead of refusing. */
  private makeRoomForDemo(): void {
    const isDemo = (session: Session) => session.game.mode === 'demo';
    while (this.count(isDemo) >= this.maxDemoSessions) {
      const victim = this.oldestIdle(isDemo);
      if (victim === null) throw new ApiError('Too many rehearsals are running right now.', 'session_limit', { canDemo: false });
      this.sessions.delete(victim);
    }
  }

  /**
   * One client can hold only a few live voyages. Its own stalest idle voyage makes
   * way for a new one (the page only ever tracks one), so a single address can never
   * fill the global cap and lock everyone else out.
   */
  private makeRoomForOwner(owner: string): void {
    const mine = (session: Session) => session.game.mode === 'live' && session.owner === owner;
    while (this.count(mine) + (this.pendingByOwner.get(owner) ?? 0) >= this.maxLivePerOwner) {
      const victim = this.oldestIdle(mine);
      if (victim === null) {
        throw new ApiError('Your earlier live voyages are still being prepared. Try again in a moment.', 'session_limit', { canDemo: true });
      }
      this.sessions.delete(victim);
    }
  }

  private reserveOwner(owner: string | null, delta: 1 | -1): void {
    if (owner === null) return;
    const next = (this.pendingByOwner.get(owner) ?? 0) + delta;
    if (next > 0) this.pendingByOwner.set(owner, next);
    else this.pendingByOwner.delete(owner);
  }

  async create(mode: Mode, doctrine: Doctrine, owner: string | null = null): Promise<GameState> {
    this.sweep();
    const id = newGameId();
    if (mode === 'demo') {
      this.makeRoomForDemo();
      return publicGame(this.createDemoGame(id, doctrine, owner));
    }

    if (owner !== null) this.makeRoomForOwner(owner);
    // Count in-flight creates too: a live voyage awaits upstream data before its
    // session exists, so without a reservation concurrent creates would overrun.
    const live = this.count((session) => session.game.mode === 'live');
    if (live + this.pending >= this.maxSessions) {
      // Rehearsals never hit this cap (see makeRoomForDemo), so offering one is honest.
      throw new ApiError('Too many live voyages are already under way.', 'session_limit', { canDemo: true });
    }
    this.pending += 1;
    this.reserveOwner(owner, 1);
    try {
      return publicGame(await this.createLiveGame(id, doctrine, owner));
    } finally {
      this.pending -= 1;
      this.reserveOwner(owner, -1);
    }
  }

  get(id: string): GameState {
    const session = this.require(id);
    return publicGame(session.game);
  }

  scout(id: string, laneId: string, revision: number): GameState {
    const session = this.require(id);
    if (session.busy) throw new ApiError('This voyage is busy with another action.', 'conflict');
    const game = session.game;
    if (game.phase !== 'planning') throw new ApiError('The fleet is not planning right now.', 'conflict');
    if (game.revision !== revision) throw new ApiError('That plan is out of date.', 'conflict');
    session.game = World.engineCall(() => scoutLane(game, laneId));
    return publicGame(session.game);
  }

  /** Opens one Nansen toolkit view on a reach. Waits for the background read if it is still in flight. */
  async investigate(id: string, laneId: string, tool: IntelToolId, revision: number): Promise<GameState> {
    const session = this.require(id);
    if (session.busy) throw new ApiError('This voyage is busy with another action.', 'conflict');
    if (session.game.phase !== 'planning') throw new ApiError('The fleet is not planning right now.', 'conflict');
    if (session.game.revision !== revision) throw new ApiError('That plan is out of date.', 'conflict');
    // Validate before waiting so an illegal request never holds the lock.
    World.engineCall(() => investigateLane(session.game, laneId, tool));
    session.busy = true;
    try {
      await this.ensureIntel(session);
      session.game = World.engineCall(() => investigateLane(session.game, laneId, tool));
      session.lastAccess = this.now();
      return publicGame(session.game);
    } finally {
      session.busy = false;
    }
  }

  async resolve(id: string, plans: Record<string, Stance>, revision: number, extras: ResolveExtras = {}): Promise<GameState> {
    const session = this.require(id);
    if (session.busy) throw new ApiError('This voyage is busy with another action.', 'conflict');
    const game = session.game;
    if (game.phase !== 'planning') throw new ApiError('The fleet is not planning right now.', 'conflict');
    if (game.revision !== revision) throw new ApiError('That plan is out of date.', 'conflict');
    // Validate the plan, alert and calls before spending any upstream call.
    World.engineCall(() => validatePlans(game, plans));
    World.engineCall(() => validateExtras(game, extras));

    session.busy = true;
    try {
      let readings: Reading[];
      if (game.mode === 'demo') {
        readings = World.engineCall(() => demoResolution(game.wave));
      } else {
        const tokens = session.waves[game.wave - 1] ?? [];
        const [fresh] = await Promise.all([
          this.client.loadReadings(tokens.map((token) => ({ chain: token.chain, address: token.address, timeframe: '5m' as Timeframe }))),
          this.ensureIntel(session),
        ]);
        readings = fresh;
        // An all-empty short window is an upstream availability problem, not a
        // bad request. Surface it as 503 + canDemo before the engine can charge.
        if (readings.length > 0 && readings.every((reading) => reading.available === 0)) {
          throw new ApiError('No short-window intelligence is available for this wave.', 'unavailable', { canDemo: true });
        }
      }
      session.game = World.engineCall(() => resolveWave(session.game, plans, readings, extras));
      session.lastAccess = this.now();
      return publicGame(session.game);
    } finally {
      session.busy = false;
    }
  }

  async next(id: string, revision: number): Promise<GameState> {
    const session = this.require(id);
    if (session.busy) throw new ApiError('This voyage is busy with another action.', 'conflict');
    const game = session.game;
    if (game.phase !== 'resolved') throw new ApiError('The wave has not been resolved yet.', 'conflict');
    if (game.revision !== revision) throw new ApiError('That plan is out of date.', 'conflict');

    session.busy = true;
    try {
      let lanes: Lane[] = [];
      let weather: Weather | undefined;
      if (game.mode === 'demo') {
        lanes = World.engineCall(() => demoLanes(game.wave + 1));
        weather = demoWaveWeather(game.wave + 1);
      } else if (game.hull > 0 && game.wave < game.maxWaves) {
        // A wrecked fleet finishes on the next advance, so there is nothing worth fetching.
        const tokens = session.waves[game.wave] ?? [];
        const sky = await this.loadWeather();
        lanes = await this.buildLanes(tokens, sky.shadows);
        weather = sky.weather;
        session.intel[game.wave] = this.prefetchIntel(tokens);
      }
      session.game = World.engineCall(() => advanceWave(session.game, lanes, weather));
      session.lastAccess = this.now();
      return publicGame(session.game);
    } finally {
      session.busy = false;
    }
  }

  /**
   * The public Token God Mode URL for a reach the player has already met.
   * Only answers for waves that have started, so it cannot be used to peek ahead.
   */
  nansenLink(id: string, wave: number, laneId: string): string {
    const session = this.require(id);
    const game = session.game;
    const index = (LANE_IDS as readonly string[]).indexOf(laneId);
    if (!Number.isInteger(wave) || wave < 1 || wave > game.wave || index < 0) throw new ApiError('Unknown reach.', 'bad_request');
    if (game.mode === 'demo') return `${NANSEN_APP}/tokens`;
    const token = session.waves[wave - 1]?.[index];
    if (!token) throw new ApiError('Unknown reach.', 'bad_request');
    const params = new URLSearchParams({ chain: token.chain, tokenAddress: token.address });
    return `${NANSEN_APP}/token-god-mode?${params.toString()}`;
  }
}

export function isValidDoctrine(value: unknown): value is Doctrine {
  return value === 'keeper' || value === 'cartographer' || value === 'engineer';
}

export function isValidMode(value: unknown): value is Mode {
  return value === 'live' || value === 'demo';
}

export function isValidStance(value: unknown): value is Stance {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(STANCES, value);
}
