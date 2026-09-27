import { ALERTS, CALLS, COHORTS, DOCTRINES, STANCES, TOOLS, TOOL_ORDER, WAVE_REFILL } from './types.ts';
import type {
  AlertCondition,
  AlertPlan,
  CallChoice,
  CohortId,
  Direction,
  Doctrine,
  GameState,
  IntelToolId,
  Lane,
  LaneResult,
  MarketSnapshot,
  Mode,
  Modifier,
  Provenance,
  Reading,
  Signal,
  Stance,
  Weather,
} from './types.ts';
import { calmWeather, demoIntel, demoPerp, demoWeather, NO_PERP } from './intel.ts';

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const clone = <T>(v: T): T => structuredClone(v);
const SESSION_LIFETIME_MS = 1_200_000;
const MAX_HAZARD = 40;

export const emptyMarket = (): MarketSnapshot => ({
  priceUsd: null,
  priceChangePct: null,
  volumeBand: null,
  liquidityBand: null,
  marketCapBand: null,
  buySellBias: 'unknown',
  netflowDirection: 'unknown',
  netflowBand: null,
  provenance: { endpoint: 'unknown', fetchedAt: '', timeframe: '24h', requestId: null, cached: false },
});

/** Quantize each cohort independently; cohorts overlap and MUST NOT be summed as capital. */
export function normalizeReading(raw: unknown, provenance: Provenance): Reading {
  const row = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const signals: Signal[] = COHORTS.map(({ id }) => {
    const n = row[`${id}_net_flow_usd`];
    if (typeof n !== 'number' || !Number.isFinite(n)) return { id, direction: 'unknown', force: null };
    const absolute = Math.abs(n);
    const force = absolute < 1 ? 0 : absolute < 10_000 ? 1 : absolute < 1_000_000 ? 2 : 3;
    return { id, direction: n === 0 ? 'flat' : n > 0 ? 'in' : 'out', force };
  });
  return { signals, provenance: { ...provenance }, available: signals.filter((s) => s.force !== null).length };
}

function signal(reading: Reading, id: CohortId): Signal {
  return reading.signals.find((s) => s.id === id) ?? { id, direction: 'unknown', force: null };
}
function effective(latest: Reading, context: Reading, id: CohortId): Signal {
  const recent = signal(latest, id);
  return recent.force !== null ? recent : signal(context, id);
}
function force(s: Signal, direction: Direction): number {
  return s.direction === direction ? s.force ?? 0 : 0;
}
function guideOf(lane: Lane, latest: Reading): Signal {
  const smart = effective(latest, lane.context, 'smart_trader');
  const pnl = effective(latest, lane.context, 'top_pnl');
  return smart.force !== null && smart.force > 0 ? smart : pnl;
}

/** Rules, not a predictive model. Values are fictional engineering pressure, never risk scores. */
export function interpret(lane: Lane, latest: Reading): { hazard: number; pattern: string; explanation: string; lesson: string; changed: boolean } {
  const smart = effective(latest, lane.context, 'smart_trader');
  const pnl = effective(latest, lane.context, 'top_pnl');
  const guide = smart.force !== null && smart.force > 0 ? smart : pnl;
  const whale = effective(latest, lane.context, 'whale');
  const exchange = effective(latest, lane.context, 'exchange');
  const fresh = signal(lane.baseline, 'fresh_wallets');
  const unknown = [smart, pnl, whale, exchange].filter((s) => s.force === null).length;
  const meaningful = [smart, pnl, whale, exchange].filter((s) => s.force !== null && s.force > 0);
  const disagreement = force(guide, 'out') > 0 && (force(whale, 'in') > 0 || force(fresh, 'in') > 0);
  const oldGuide = signal(lane.context, guide.id);
  const changed = latest.signals.some((s) => s.force !== null && signal(lane.context, s.id).force !== null && s.direction !== signal(lane.context, s.id).direction);
  const reversal = oldGuide.force !== null && guide.force !== null && oldGuide.direction !== 'flat' && guide.direction !== 'flat' && oldGuide.direction !== guide.direction;
  let hazard = 3 + force(guide, 'out') * 3 + force(whale, 'out') * 2 + force(exchange, 'in') * 2 + unknown;
  if (disagreement) hazard += 6;
  if (reversal) hazard += 4;
  if (meaningful.length === 0) hazard += 2;
  hazard = clamp(hazard, 2, 32);
  let pattern = 'Open current';
  let explanation = 'No strong opposition appears in the available cohorts. An open gate can collect charge.';
  let lesson = 'A calm observation is not a guarantee. These windows describe recorded flows, not future prices.';
  if (meaningful.length === 0) { pattern = 'Uncharted water'; explanation = 'Available observations are quiet or missing. Uncertainty adds fictional pressure rather than inventing a signal.'; lesson = 'Missing data is not zero. A lack of evidence is different from evidence of safety.'; }
  else if (disagreement) { pattern = 'The false calm'; explanation = 'A size or fresh-wallet cohort flows inward while the trading cohort flows outward. Their disagreement adds a hidden crosscurrent.'; lesson = 'Size and skill are different. A whale inflow can coexist with trader outflows; do not treat every large movement as agreement.'; }
  else if (reversal) { pattern = 'Turning current'; explanation = 'The available trading-cohort direction differs between the hour context and the short resolution window. The lock takes extra pressure.'; lesson = 'Timeframes can disagree. A 5-minute window sits inside a 1-hour window; this is not a future-price reveal.'; }
  else if (force(guide, 'out') || force(whale, 'out')) { pattern = 'Undertow'; explanation = 'Outward movement in a trading or large-holder cohort pulls against the gate. Defenses matter more than raw activity.'; lesson = 'A cohort outflow is an observation, not proof of a sale or intent. The undertow is a game rule, not an allegation.'; }
  else if (force(exchange, 'in')) { pattern = 'Crowded gates'; explanation = 'Exchange-labeled inward flow loads the Gatekeepers with pressure. Brace to trade capture for protection.'; lesson = 'Exchange deposits are not necessarily sales. VEILWAKE uses them as fictional gate pressure, not a sell signal.'; }
  if (unknown > 0) explanation += ` ${unknown} key cohort${unknown === 1 ? ' is' : 's are'} unavailable; earlier context is used only where present.`;
  return { hazard, pattern, explanation, lesson, changed };
}

/**
 * Every non-cohort source of pressure on a reach: the Token Screener harbor, the
 * Perp Screener weather and perp shadow, and each Nansen toolkit clue. `seen`
 * records whether the player could read it before committing.
 */
export function modifiersFor(lane: Lane, latest: Reading, weather: Weather | null | undefined): Modifier[] {
  const mods: Modifier[] = [];
  const liquidity = lane.market?.liquidityBand;
  if (liquidity === 0) mods.push({ source: 'market', label: 'Shallow harbor · liquidity band 0', value: 2, seen: true });
  else if (liquidity === 1) mods.push({ source: 'market', label: 'Shallow harbor · liquidity band 1', value: 1, seen: true });
  if (weather && weather.pressure !== 0) mods.push({ source: 'weather', label: `Storm glass · ${weather.name}`, value: weather.pressure, seen: true });
  if (lane.perp && lane.perp.pressure !== 0) mods.push({ source: 'perp', label: `Perp shadow · Smart Money ${lane.perp.bias ?? 'mixed'}`, value: lane.perp.pressure, seen: true });
  const opened = lane.opened ?? [];
  for (const tool of TOOL_ORDER) {
    const clue = lane.intel?.[tool];
    if (!clue) continue;
    mods.push({ source: tool, label: `${TOOLS[tool].nansen} · ${clue.verdict}`, value: clue.pressure, seen: opened.includes(tool) });
  }
  const trend = lane.intel?.trend;
  const guide = guideOf(lane, latest);
  const seenCombo = opened.includes('trend') && lane.revealed;
  if (trend?.direction === 'out' && force(guide, 'out') > 0) mods.push({ source: 'combo', label: 'Long ebb · weekly Smart Money trim meets a fresh trader exit', value: 1, seen: seenCombo });
  if (trend?.direction === 'in' && force(guide, 'out') > 0) mods.push({ source: 'combo', label: 'Squall in a flood · a short exit inside weekly accumulation', value: -1, seen: seenCombo });
  return mods;
}

function alertFires(condition: AlertCondition, latest: Reading): boolean {
  const s = signal(latest, ALERTS[condition].cohort);
  if (s.force === null) return false;
  if (condition === 'smart_out') return s.direction === 'out' && s.force >= 1;
  if (condition === 'whale_out') return s.direction === 'out' && s.force >= 1;
  return s.direction === 'in' && s.force >= 2;
}

function callHit(call: CallChoice, context: Reading, latest: Reading): boolean | null {
  if (call === 'pass') return null;
  const before = signal(context, 'smart_trader');
  const after = signal(latest, 'smart_trader');
  const usable = (s: Signal) => s.force !== null && (s.direction === 'in' || s.direction === 'out');
  if (!usable(before) || !usable(after)) return null;
  return call === 'hold' ? before.direction === after.direction : before.direction !== after.direction;
}

export function createGame({ id, mode, doctrine, lanes, weather, now = Date.now() }: { id: string; mode: Mode; doctrine: Doctrine; lanes: Lane[]; weather?: Weather; now?: number }): GameState {
  if (!Object.hasOwn(DOCTRINES, doctrine)) throw new Error('Unknown doctrine.');
  validateLanes(lanes);
  const d = DOCTRINES[doctrine];
  return {
    id, mode, doctrine, phase: 'planning', wave: 1, maxWaves: 3, hull: d.hull, energy: d.energy, charge: 0, target: 18, score: 0, intel: d.intel,
    lanes: clone(lanes).map(normalizeLane),
    weather: clone(weather ?? calmWeather({ endpoint: 'perp-screener', fetchedAt: '', timeframe: '24h', requestId: null, cached: false })),
    plans: Object.fromEntries(lanes.map((l) => [l.id, 'harvest'])),
    calls: {},
    alert: null,
    history: [],
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_LIFETIME_MS).toISOString(),
    revision: 0,
    victory: null,
  };
}
function normalizeLane(lane: Lane): Lane {
  return { ...lane, market: lane.market ?? emptyMarket(), intel: lane.intel ?? {}, opened: lane.opened ?? [], perp: lane.perp ?? { ...NO_PERP } };
}
function validateLanes(lanes: Lane[]) {
  if (lanes.length !== 3 || new Set(lanes.map((l) => l.id)).size !== 3) throw new Error('A voyage requires three distinct reaches.');
}

/** All hidden intelligence is removed server-side, including baseline and unopened clues. Never trust CSS fog. */
export function publicGame(game: GameState): GameState {
  const result = clone(game);
  if (result.phase !== 'planning') return result;
  for (const lane of result.lanes) {
    const opened = new Set(lane.opened ?? []);
    lane.intel = Object.fromEntries(Object.entries(lane.intel ?? {}).filter(([tool]) => opened.has(tool as IntelToolId)));
    if (lane.revealed) continue;
    for (const reading of [lane.context, lane.baseline]) {
      reading.signals = reading.signals.filter((s) => s.id === 'whale' || s.id === 'exchange');
      reading.available = reading.signals.filter((s) => s.force !== null).length;
    }
  }
  return result;
}
export function scoutLane(game: GameState, laneId: string): GameState {
  if (game.phase !== 'planning') throw new Error('Scout only before committing a wave.');
  const lane = game.lanes.find((l) => l.id === laneId);
  if (!lane) throw new Error('Unknown reach.');
  if (lane.revealed) throw new Error('This reach is already scouted.');
  if (game.intel < 1) throw new Error('No lenses remain. Read the visible current or save a lens next wave.');
  const next = clone(game); next.lanes.find((l) => l.id === laneId)!.revealed = true; next.intel--; next.revision++; return next;
}
export function isToolId(value: unknown): value is IntelToolId {
  return typeof value === 'string' && (TOOL_ORDER as string[]).includes(value);
}
/** Opens one Nansen view on a reach for one lens. The Profiler needs the Buyers & Sellers ledger first. */
export function investigateLane(game: GameState, laneId: string, tool: IntelToolId): GameState {
  if (game.phase !== 'planning') throw new Error('Open Nansen views only before committing a wave.');
  const lane = game.lanes.find((l) => l.id === laneId);
  if (!lane) throw new Error('Unknown reach.');
  if (!isToolId(tool)) throw new Error('Unknown Nansen view.');
  const opened = lane.opened ?? [];
  if (opened.includes(tool)) throw new Error('This view is already open on this reach.');
  const required = TOOLS[tool].requires;
  if (required && !opened.includes(required)) throw new Error(`Open ${TOOLS[required].nansen} first — on Nansen you find the wallet in the ledger before you profile it.`);
  if (game.intel < 1) throw new Error('No lenses remain. Read what you already have or save a lens for the next wave.');
  const next = clone(game);
  const target = next.lanes.find((l) => l.id === laneId)!;
  target.opened = [...(target.opened ?? []), tool];
  next.intel--;
  next.revision++;
  return next;
}
export function validatePlans(game: GameState, plans: Record<string, Stance>): number {
  if (game.phase !== 'planning') throw new Error('This wave has already resolved.');
  if (Object.keys(plans).length !== game.lanes.length || game.lanes.some((l) => !Object.hasOwn(plans, l.id))) throw new Error('Choose exactly one stance for every reach.');
  if (Object.values(plans).some((s) => !Object.hasOwn(STANCES, s))) throw new Error('Unknown gate stance.');
  const cost = Object.values(plans).reduce((sum, s) => sum + STANCES[s].cost, 0);
  if (cost > game.energy) throw new Error('Your plan costs more supply than you have.');
  return cost;
}
export function validateExtras(game: GameState, extras: ResolveExtras): { alert: AlertPlan | null; calls: Record<string, CallChoice> } {
  const alert = extras.alert ?? null;
  if (alert !== null) {
    if (!game.lanes.some((l) => l.id === alert.laneId)) throw new Error('A Smart Alert must watch one of the three reaches.');
    if (!Object.hasOwn(ALERTS, alert.condition)) throw new Error('Unknown Smart Alert condition.');
  }
  const calls: Record<string, CallChoice> = {};
  for (const [laneId, call] of Object.entries(extras.calls ?? {})) {
    if (!game.lanes.some((l) => l.id === laneId)) throw new Error('A call must name one of the three reaches.');
    if (!Object.hasOwn(CALLS, call)) throw new Error('Unknown call.');
    calls[laneId] = call;
  }
  return { alert: alert ? { laneId: alert.laneId, condition: alert.condition } : null, calls };
}

export interface ResolveExtras { alert?: AlertPlan | null; calls?: Record<string, CallChoice>; }

const sum = (mods: Modifier[]) => mods.reduce((total, m) => total + m.value, 0);

export function resolveWave(game: GameState, plans: Record<string, Stance>, readings: Reading[], extras: ResolveExtras = {}): GameState {
  const cost = validatePlans(game, plans);
  if (readings.length !== 3) throw new Error('Resolution requires all three readings.');
  if (game.mode === 'live' && readings.every((r) => r.available === 0)) throw new Error('No short-window intelligence is available. No resources were spent; retry or start an explicit rehearsal.');
  const { alert, calls } = validateExtras(game, extras);
  const next = clone(game);
  const states = game.lanes.map((l, i) => interpret(l, readings[i]));
  const mods = game.lanes.map((l, i) => modifiersFor(l, readings[i], game.weather));
  const pressures = states.map((s, i) => clamp(s.hazard + sum(mods[i]), 2, MAX_HAZARD));
  const incoming = [0, 0, 0];
  pressures.forEach((p, i) => { if (plans[game.lanes[i].id] === 'divert') incoming[(i + 1) % 3] += Math.ceil(p * 0.55); });
  const results: LaneResult[] = game.lanes.map((lane, i) => {
    const state = states[i];
    const stance = plans[lane.id];
    const watch = alert && alert.laneId === lane.id ? alert : null;
    const fired = watch ? alertFires(watch.condition, readings[i]) : false;
    const switched = fired && stance === 'harvest';
    const acted: Stance = switched ? 'brace' : stance;
    const pressure = pressures[i] + incoming[i];
    const damage = acted === 'harvest' ? pressure : acted === 'brace' ? Math.ceil(pressure * 0.28) : Math.ceil(incoming[i] * 0.5);
    const energy = acted === 'harvest' ? clamp(6 - Math.floor(pressure / 8), 1, 6) : acted === 'brace' ? 1 : 0;
    const efficiency = acted === 'harvest' && pressure <= 8 ? 15 : acted === 'brace' && pressure >= 12 ? 15 : 0;
    const call = calls[lane.id] ?? 'pass';
    const hit = callHit(call, lane.context, readings[i]);
    const callBonus = hit === true ? 12 : hit === false ? -4 : 0;
    const points = Math.max(0, energy * 20 + (pressure - damage) * 2 - damage + efficiency + callBonus);
    const missed = mods[i].filter((m) => !m.seen && m.value > 0 && TOOL_ORDER.includes(m.source as IntelToolId)).sort((a, b) => b.value - a.value)[0];
    const helped = mods[i].filter((m) => m.seen && m.value !== 0 && TOOL_ORDER.includes(m.source as IntelToolId)).length;
    const modTotal = sum(mods[i]);
    let explanation = state.explanation;
    if (modTotal !== 0) explanation += ` Market, perp and toolkit readings add ${modTotal > 0 ? '+' : ''}${modTotal} pressure.`;
    if (incoming[i] > 0) explanation += ` A neighboring diversion adds ${incoming[i]} pressure.`;
    if (watch) explanation += fired ? (switched ? ` Your Smart Alert (${ALERTS[watch.condition].name}) fired and braced the gates in time.` : ` Your Smart Alert (${ALERTS[watch.condition].name}) fired, but the gates were already closing.`) : ` Your Smart Alert (${ALERTS[watch.condition].name}) stayed quiet.`;
    if (hit === true) explanation += ' Your call on Smart Trader direction was right.';
    else if (hit === false) explanation += ' Your call on Smart Trader direction missed.';
    if (missed) explanation += ` You did not open ${TOOLS[missed.source as IntelToolId].nansen}: it read “${missed.label.split(' · ')[1] ?? missed.label}” (+${missed.value}).`;
    const lesson = missed && missed.value >= 2 ? TOOLS[missed.source as IntelToolId].lesson : helped > 0 ? `${state.lesson} You read ${helped} Nansen ${helped === 1 ? 'view' : 'views'} before committing — that is the workflow.` : state.lesson;
    return {
      laneId: lane.id,
      name: lane.name,
      token: { ...lane.token },
      stance,
      effectiveStance: acted,
      baseHazard: state.hazard,
      incoming: incoming[i],
      hazard: pressure,
      pattern: state.pattern,
      damage,
      energy,
      points,
      reading: clone(readings[i]),
      changed: state.changed,
      explanation,
      lesson,
      modifiers: mods[i],
      scouted: lane.revealed,
      opened: [...(lane.opened ?? [])],
      call,
      callHit: hit,
      alert: watch ? { condition: watch.condition, fired, switched } : null,
    };
  });
  const damage = results.reduce((s, r) => s + r.damage, 0);
  const energy = results.reduce((s, r) => s + r.energy, 0);
  const points = results.reduce((s, r) => s + r.points, 0);
  next.hull = Math.max(0, next.hull - damage); next.charge += energy; next.energy -= cost; next.score += points; next.phase = 'resolved';
  next.plans = { ...plans }; next.calls = { ...calls }; next.alert = alert; next.revision++;
  next.lanes.forEach((l) => (l.revealed = true));
  const title = next.hull === 0 ? 'The gates gave way' : next.charge >= next.target ? 'The beacon is lit' : damage <= 16 ? 'The settlement holds' : 'The current leaves a mark';
  next.history.push({ wave: game.wave, lanes: results, damage, energy, points, title, weather: game.weather?.name ?? 'Glass fogged' });
  return next;
}
export function advanceWave(game: GameState, lanes: Lane[], weather?: Weather): GameState {
  if (game.phase !== 'resolved') throw new Error('Resolve this wave before continuing.');
  const next = clone(game); next.revision++;
  if (game.wave >= game.maxWaves || game.hull <= 0) { next.phase = 'finished'; next.victory = next.hull > 0 && next.charge >= next.target; if (next.victory) next.score += next.hull * 3; return next; }
  validateLanes(lanes);
  next.wave++;
  next.lanes = clone(lanes).map(normalizeLane);
  next.weather = clone(weather ?? next.weather);
  next.phase = 'planning';
  next.energy = Math.min(WAVE_REFILL.maxEnergy, next.energy + WAVE_REFILL.energy);
  next.intel = Math.min(WAVE_REFILL.maxIntel, next.intel + WAVE_REFILL.intel);
  next.plans = Object.fromEntries(lanes.map((l) => [l.id, 'harvest']));
  next.calls = {};
  next.alert = null;
  return next;
}

/** Authored GAME fixtures, not claimed to be actual Nansen API responses or market history. */
function fixture(directions: Partial<Record<CohortId, [Direction, number]>>, timeframe: string): Reading {
  const signals: Signal[] = COHORTS.map(({ id }) => ({ id, direction: directions[id]?.[0] ?? 'unknown', force: directions[id]?.[1] ?? null }));
  return { signals, available: signals.filter((s) => s.force !== null).length, provenance: { endpoint: 'fictional-game-fixture', fetchedAt: '', timeframe, requestId: null, cached: false } };
}
const FICTION = [
  { smart_trader: ['out', 3], top_pnl: ['out', 2], whale: ['in', 3], exchange: ['in', 2], fresh_wallets: ['in', 2], public_figure: ['in', 1] },
  { smart_trader: ['in', 2], top_pnl: ['in', 2], whale: ['in', 2], exchange: ['out', 1], fresh_wallets: ['in', 1], public_figure: ['flat', 0] },
  { smart_trader: ['out', 2], top_pnl: ['out', 2], whale: ['out', 3], exchange: ['in', 3], fresh_wallets: ['out', 1], public_figure: ['flat', 0] },
] as Partial<Record<CohortId, [Direction, number]>>[];
const ORDER = [[0, 1, 2], [1, 2, 0], [2, 0, 1]];
/** The false calm looks bullish on the screener; that is the point of the lesson. */
function fixtureMarket(current: number): MarketSnapshot {
  const provenance: Provenance = { endpoint: 'fictional-game-fixture', fetchedAt: '', timeframe: '24h · token-screener', requestId: null, cached: false };
  if (current === 0) return { priceUsd: 100, priceChangePct: 4.2, volumeBand: 3, liquidityBand: 2, marketCapBand: 2, buySellBias: 'in', netflowDirection: 'in', netflowBand: 2, provenance };
  if (current === 1) return { priceUsd: 12, priceChangePct: -1.1, volumeBand: 2, liquidityBand: 3, marketCapBand: 2, buySellBias: 'in', netflowDirection: 'in', netflowBand: 1, provenance };
  return { priceUsd: 0.8, priceChangePct: -6.5, volumeBand: 2, liquidityBand: 1, marketCapBand: 1, buySellBias: 'out', netflowDirection: 'out', netflowBand: 2, provenance };
}
export function demoLanes(wave: number): Lane[] {
  const order = ORDER[(Math.max(1, wave) - 1) % 3];
  return ['north', 'east', 'west'].map((id, i) => ({
    id,
    name: ['Glass Reach', 'Ember Reach', 'Moss Reach'][i],
    token: { chain: 'fiction', symbol: ['GLASS', 'EMBER', 'MOSS'][i] },
    market: fixtureMarket(order[i]),
    context: fixture(FICTION[order[i]], '1h'),
    baseline: fixture(FICTION[order[i]], '1d'),
    revealed: false,
    preview: order[i] === 1 ? 'restless' : 'volatile',
    intel: demoIntel(order[i]),
    opened: [],
    perp: demoPerp(order[i]),
  }));
}
export function demoWaveWeather(wave: number): Weather {
  return demoWeather(wave);
}
export function demoResolution(wave: number): Reading[] {
  return ORDER[(Math.max(1, wave) - 1) % 3].map((index) => {
    const fields = { ...FICTION[index] }; delete fields.fresh_wallets;
    return fixture(fields, '5m');
  });
}
