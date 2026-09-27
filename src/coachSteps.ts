/**
 * The VEILWAKE tutorial: a pure, state-derived coach for the guided rehearsal.
 *
 * Every step decides for itself whether it is done by looking at the real game
 * state (what is scouted, which Nansen views are open, the chosen stances, the
 * alert, the phase). The coach therefore follows the player instead of driving
 * the game: it never calls the API, never changes a plan and never blocks input.
 * Acknowledgements, skips and explicit stance clicks are the only coach-owned state.
 *
 * Three chapters, one per wave:
 *   1. The false calm         a strict, click-by-click walkthrough of the analyst workflow.
 *   2. Find the open current  the player chooses; the coach reacts to what they scout,
 *                             teaches Divert and checks the gates against the evidence.
 *   3. Read the surface       spot the currents from free information, then confirm
 *                             with the tape and the cargo before committing.
 * Each wave report explains what happened, and the finale adapts to the result.
 * Practice answers are revealed only on request.
 *
 * Only meaningful in rehearsal (demo) mode, whose fixtures are deterministic
 * (see ORDER in shared/engine.ts and the documented route in scripts/balance.ts).
 * Reactive copy quotes the clue the player actually opened, so it cannot drift
 * away from the fixtures.
 */
import type { AlertPlan, CallChoice, Clue, CohortId, GameState, IntelToolId, Lane, LaneResult, Modifier, Stance } from './types';
import { DOCTRINES, STANCES, TOOLS, TOOL_ORDER, WAVE_REFILL } from './types';

export type CoachAction = 'start-live' | 'replay';

/** Reactive feedback on what the player just did, shown apart from the instruction. */
export interface CoachNote {
  tone: 'good' | 'warn';
  text: string;
}

export interface CoachStep {
  id: string;
  wave: number;
  chapter: number;
  chapterTitle: string;
  /** 1-based position inside the current chapter's script. */
  index: number;
  total: number;
  title: string;
  body: string;
  note?: CoachNote;
  /** The Nansen feature this step practises, shown as a chip. */
  feature?: string;
  /** data-coach keys to highlight, in priority order (the first one is scrolled to). */
  targets: string[];
  /** Label of a manual continue button; steps without it complete from game state alone. */
  ack?: string;
  /** Optional steps can be skipped with a secondary button. */
  optional?: boolean;
  skipLabel?: string;
  /** Practice answer for this step, revealed only on request. */
  answer?: string;
  /** Calls to action handled by the host, in priority order. */
  actions?: CoachAction[];
}

export interface CoachInput {
  game: GameState;
  plans: Record<string, Stance>;
  calls: Record<string, CallChoice>;
  alert: AlertPlan | null;
  /** Lane whose Token God Mode panel is open, if any. */
  tgmLane: string | null;
  /** Coach-owned acknowledgements, skips and stance clicks. */
  acked: ReadonlySet<string>;
  /** False when the server has no Nansen key: the finale then does not offer a live run. */
  liveReady?: boolean;
}

/** The tutorial is written for Keeper's budget: 5 lenses cover the whole script exactly. */
export const TUTORIAL_DOCTRINE = 'keeper' as const;

export const CHAPTERS: Record<number, string> = {
  1: 'The false calm',
  2: 'Find the open current',
  3: 'Read the surface',
};

/**
 * Coach event for a stance click. Recorded even when the stance is already
 * selected, so "click Harvest" works on a reach that starts on Harvest.
 */
export const planEvent = (wave: number, laneId: string, stance: Stance) => `plan:w${wave}:${laneId}:${stance}`;

/** The documented rehearsal route (scripts/balance.ts): harvest the open current, brace the rest. */
export const REHEARSAL_ROUTE: Record<number, Record<string, Stance>> = {
  1: { north: 'brace', east: 'harvest', west: 'brace' },
  2: { north: 'harvest', east: 'brace', west: 'brace' },
  3: { north: 'brace', east: 'brace', west: 'harvest' },
};

const LANE_NAME: Record<string, string> = { north: 'Glass', east: 'Ember', west: 'Moss' };
const STANCE_NAME: Record<Stance, string> = { harvest: 'Harvest', brace: 'Brace', divert: 'Divert' };

/* ------------------------------------------------------------- helpers */

const nameOf = (laneId: string, fallback = 'this reach') => LANE_NAME[laneId] ?? fallback.replace(/ Reach$/, '');
const short = (l: Lane) => nameOf(l.id, l.name);
const names = (lanes: Lane[]) => lanes.map(short).join(' and ');
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '±0');
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined) return '?';
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}%`;
}

function routeText(wave: number): string {
  const route = REHEARSAL_ROUTE[wave];
  if (!route) return '';
  return Object.entries(route).map(([id, stance]) => `${LANE_NAME[id]}: ${STANCE_NAME[stance]}`).join(' · ');
}

function weatherMeaning(pressure: number): string {
  if (pressure < 0) return 'a tailwind, so every reach is a little calmer';
  if (pressure > 0) return 'a headwind, so every reach takes a little more pressure';
  return 'no push either way';
}

const lane = (game: GameState, id: string): Lane | undefined => game.lanes.find((l) => l.id === id);
const opened = (l: Lane | undefined, tool: IntelToolId) => Boolean(l && (l.opened ?? []).includes(tool));
const anyOpened = (game: GameState, tool: IntelToolId) => game.lanes.some((l) => opened(l, tool));
const touched = (l: Lane | undefined) => Boolean(l && (l.revealed || (l.opened ?? []).length > 0));
const clueOn = (l: Lane | undefined, tool: IntelToolId): Clue | undefined => (l && opened(l, tool) ? l.intel?.[tool] : undefined);
const stanceOf = (plans: Record<string, Stance>, id: string): Stance => plans[id] ?? 'harvest';
const planCost = (game: GameState, plans: Record<string, Stance>) => game.lanes.reduce((sum, l) => sum + STANCES[stanceOf(plans, l.id)].cost, 0);

function planSummary(game: GameState, plans: Record<string, Stance>, alert: AlertPlan | null): string {
  const gates = game.lanes.map((l) => `${short(l)} ${STANCE_NAME[stanceOf(plans, l.id)].toLowerCase()}`).join(', ');
  const watched = alert ? lane(game, alert.laneId) : undefined;
  return `${gates}${watched ? `, Smart Alert on ${short(watched)}` : ', no Smart Alert'}`;
}

/* ---------------------------------------------------- reading the water */

type Current = 'open' | 'false-calm' | 'undertow' | 'unclear';

const CURRENT: Record<Current, { name: string; flows: string; surface: string }> = {
  open: {
    name: 'an open current',
    flows: 'smart traders and whales are both buying while exchanges release supply: the actors agree',
    surface: 'whales buying while exchanges release supply',
  },
  'false-calm': {
    name: 'a false calm',
    flows: 'smart traders are selling into whale buying: opposing actors hide a crosscurrent',
    surface: 'whales and exchanges both loading in',
  },
  undertow: {
    name: 'an undertow',
    flows: 'smart traders and whales are heading out while exchanges fill up: the current pulls against the gates',
    surface: 'whales leaving while exchanges fill up',
  },
  unclear: {
    name: 'unclear water',
    flows: 'the flows do not line up into a clear pattern',
    surface: 'no clear whale or exchange signal',
  },
};

function moving(l: Lane, id: CohortId, direction: 'in' | 'out'): boolean {
  return [l.context, l.baseline].some((reading) => {
    const s = reading.signals.find((signal) => signal.id === id);
    return Boolean(s && s.force !== null && s.force > 0 && s.direction === direction);
  });
}

/**
 * What a reach shows the player right now: the scouted flows if scouted, else
 * the free whale/exchange surface. Mirrors the engine's order of precedence
 * (disagreement, then outflow and gate pressure, then agreement).
 */
function readCurrent(l: Lane): Current {
  const whaleIn = moving(l, 'whale', 'in');
  const whaleOut = moving(l, 'whale', 'out');
  const exchangeIn = moving(l, 'exchange', 'in');
  const exchangeOut = moving(l, 'exchange', 'out');
  if (l.revealed) {
    const traderOut = moving(l, 'smart_trader', 'out');
    if (traderOut && (whaleIn || moving(l, 'fresh_wallets', 'in'))) return 'false-calm';
    if (traderOut || whaleOut || exchangeIn) return 'undertow';
    if (moving(l, 'smart_trader', 'in') && whaleIn) return 'open';
    return 'unclear';
  }
  if (whaleOut) return 'undertow';
  if (whaleIn && exchangeOut) return 'open';
  if (whaleIn && exchangeIn) return 'false-calm';
  if (exchangeIn) return 'undertow';
  return 'unclear';
}

function describe(l: Lane): string {
  const current = readCurrent(l);
  return l.revealed ? `its flows read as ${CURRENT[current].name} (${CURRENT[current].flows})` : `its surface looks like ${CURRENT[current].name} (${CURRENT[current].surface})`;
}

/** Checks a gate plan against the evidence the player can see. */
function gateCheck(game: GameState, plans: Record<string, Stance>): CoachNote | undefined {
  const cost = planCost(game, plans);
  if (cost > game.energy) return { tone: 'warn', text: `That plan costs ${cost} supply and you hold ${game.energy}. Lower a stance before you resolve.` };
  const n = game.lanes.length;
  const flooding = game.lanes.find((l, i) => stanceOf(plans, l.id) === 'divert' && stanceOf(plans, game.lanes[(i + 1) % n].id) === 'harvest');
  if (flooding) {
    const into = game.lanes[(game.lanes.indexOf(flooding) + 1) % n];
    return { tone: 'warn', text: `${short(flooding)} is set to Divert, which pushes 55% of its pressure into ${short(into)}, and ${short(into)} is on Harvest. Brace ${short(flooding)} instead, or it floods your harvest.` };
  }
  const harvesting = game.lanes.filter((l) => stanceOf(plans, l.id) === 'harvest');
  const risky = harvesting.find((l) => readCurrent(l) === 'false-calm' || readCurrent(l) === 'undertow');
  if (risky) return { tone: 'warn', text: `Careful: ${short(risky)} is on Harvest, but ${describe(risky)}.` };
  if (harvesting.length === 0) return { tone: 'warn', text: 'Nothing is on Harvest, so this wave earns at most 3 charge. Safe, but the beacon needs charge.' };
  if (harvesting.every((l) => readCurrent(l) === 'open')) return { tone: 'good', text: `This plan matches the evidence: harvest ${names(harvesting)}, defend the rest.` };
  return undefined;
}

/* ------------------------------------------------------------ reports */

function verdictOf(mod: Modifier): string {
  const tool = TOOLS[mod.source as IntelToolId];
  return tool && mod.label.startsWith(`${tool.nansen} · `) ? mod.label.slice(tool.nansen.length + 3) : mod.label;
}

function laneLine(l: LaneResult, i: number, lanes: LaneResult[]): string {
  const name = nameOf(l.laneId, l.name);
  const prev = lanes[(i + lanes.length - 1) % lanes.length];
  const next = lanes[(i + 1) % lanes.length];
  const pushed = l.incoming > 0 && prev ? ` (${l.incoming} of it pushed in by ${nameOf(prev.laneId, prev.name)}'s divert)` : '';
  if (l.effectiveStance === 'harvest') return `${name} harvested +${l.energy} charge for ${l.damage} hull${pushed}.`;
  if (l.effectiveStance === 'brace') {
    return l.stance === 'harvest'
      ? `${name}'s Smart Alert fired and braced it for free: ${l.damage} damage from ${l.hazard} pressure${pushed}.`
      : `${name} braced: ${l.damage} damage from ${l.hazard} pressure${pushed}.`;
  }
  return next && next.incoming > 0
    ? `${name} diverted: ${l.damage} damage and no charge, and it pushed ${next.incoming} pressure into ${nameOf(next.laneId, next.name)}.`
    : `${name} diverted: ${l.damage} damage and no charge.`;
}

/** Explains a resolved wave in plain words: outcome per reach, alert, calls, and the views that were missed. */
function report(game: GameState, wave: number): { body: string; note?: CoachNote } {
  const round = game.history.find((r) => r.wave === wave);
  const legend = 'Each ledger row is one Nansen view on one reach: its verdict, the pressure it added and whether you saw it.';
  if (!round) return { body: legend };
  const lines = round.lanes.map((l, i, all) => laneLine(l, i, all));
  const watched = round.lanes.find((l) => l.alert);
  if (watched?.alert && !watched.alert.fired) lines.push(`Your Smart Alert on ${nameOf(watched.laneId, watched.name)} stayed quiet: nothing tripped it, so nothing changed.`);
  if (watched?.alert?.fired && !watched.alert.switched) lines.push(`Your Smart Alert on ${nameOf(watched.laneId, watched.name)} fired, but those gates were already defended.`);
  for (const l of round.lanes) {
    if (l.callHit === true) lines.push(`Your call on ${nameOf(l.laneId, l.name)} was right (+12 points).`);
    if (l.callHit === false) lines.push(`Your call on ${nameOf(l.laneId, l.name)} missed (−4 points).`);
  }
  const missed = round.lanes
    .flatMap((l) => l.modifiers.filter((m) => !m.seen && m.value > 0 && (TOOL_ORDER as string[]).includes(m.source)).map((m) => ({ l, m })))
    .sort((a, b) => b.m.value - a.m.value);
  let note: CoachNote;
  if (missed.length === 0) {
    note = { tone: 'good', text: 'Every view that added pressure was one you had opened. That is the workflow.' };
  } else {
    const exposed = missed.filter(({ l }) => l.effectiveStance === 'harvest');
    const top = exposed[0] ?? missed[0];
    const example = `${TOOLS[top.m.source as IntelToolId].nansen} on ${nameOf(top.l.laneId, top.l.name)} read “${verdictOf(top.m)}” (+${top.m.value})`;
    note = exposed.length === 0
      ? { tone: 'good', text: `${plural(missed.length, 'unopened view', 'unopened views')} added pressure, all on reaches you defended. That is why you brace what you cannot read. Biggest: ${example}.` }
      : { tone: 'warn', text: `${plural(exposed.length, 'unopened view', 'unopened views')} added pressure to a reach you harvested. ${example}: that is the view to open before harvesting.` };
  }
  return { body: `${lines.join(' ')} ${legend}`, note };
}

/* -------------------------------------------------------------- drafts */

interface Draft {
  id: string;
  title: string;
  body: string;
  note?: CoachNote;
  feature?: string;
  /** Where the step's control lives. `tgm:<lane>` = that lane's Token God Mode panel; `tgm:*` = any lane's panel. */
  at: 'board' | 'report' | `tgm:${string}`;
  targets: string[];
  done: boolean;
  ack?: string;
  optional?: boolean;
  skipLabel?: string;
  /** Costs a lens: when none are left the step turns into a skippable note. */
  lens?: boolean;
  answer?: string;
  /** For `tgm:*` steps: what to highlight while no panel is open. */
  hint?: string[];
  /** For `tgm:*` steps: a reach whose panel is the wrong place for this step. */
  avoid?: string;
  /** Planning steps are moot once the wave is resolved; report steps are not. */
  phase: 'planning' | 'report';
}

function chapterOne(input: CoachInput): Draft[] {
  const { game, plans, calls, alert, tgmLane, acked } = input;
  const glass = lane(game, 'north');
  const ember = lane(game, 'east');
  const moss = lane(game, 'west');
  const eager = game.lanes.some(touched);
  const buyers = clueOn(glass, 'buyers');
  const trend = clueOn(glass, 'trend');
  const doctrine = DOCTRINES[game.doctrine];
  const cost = planCost(game, plans);
  return [
    {
      id: 'w1-intro', phase: 'planning', at: 'board', targets: [], done: acked.has('w1-intro') || eager, ack: 'Start the tutorial',
      title: 'Welcome to the VEILWAKE tutorial',
      body: `Three reaches, three waves, one beacon: reach ${game.target} charge before wave ${game.maxWaves} ends, with hull above 0. This rehearsal runs on invented data that behaves like Nansen data, and the answers are fixed, so it is safe to experiment. Chapter 1 walks you through the analyst workflow click by click. In chapters 2 and 3 you take the wheel and I react to what you find.`,
      note: game.doctrine === TUTORIAL_DOCTRINE ? undefined : { tone: 'warn', text: `You are sailing as ${doctrine.name} with ${plural(doctrine.intel, 'lens', 'lenses')}. The tutorial is written for Keeper's 5, so I will flag any step your lenses cannot cover.` },
    },
    {
      id: 'w1-resources', phase: 'planning', at: 'board', targets: ['objective'], done: acked.has('w1-resources') || eager, ack: 'Next',
      title: 'Four numbers to watch',
      body: `Charge (${game.charge}/${game.target}) is the goal, and harvesting earns it. Hull (${game.hull}) is your life: every point of pressure you let through costs hull. Supply (${game.energy}) pays for defence: Brace costs 1, Divert 2. Lenses (${game.intel}) open Nansen views, one lens per view. Survive a wave and you get +${WAVE_REFILL.energy} supply and +${WAVE_REFILL.intel} lenses.`,
    },
    {
      id: 'w1-weather', phase: 'planning', at: 'board', targets: ['stormglass'], done: acked.has('w1-weather') || eager, ack: 'Next',
      title: 'The storm glass sets the weather',
      feature: 'Perp Screener',
      body: `This is the Perp Screener: Smart Money positioning on Hyperliquid perps. It adds the same pressure to every reach this wave. ${game.weather.name} (${signed(game.weather.pressure)}) means ${weatherMeaning(game.weather.pressure)}. Click it any time for the details.`,
    },
    {
      id: 'w1-open-glass', phase: 'planning', at: 'board', targets: ['market-north', 'tgm-north'],
      done: tgmLane === 'north' || touched(glass),
      title: 'Glass looks like a buy. Is it?',
      feature: 'Token Screener → Token God Mode',
      body: `Glass Reach's Token Screener strip is green: ${pct(glass?.market.priceChangePct)} in 24h on heavy volume. A screener alone would say harvest. An analyst first checks who is actually moving. Open Token God Mode on Glass.`,
    },
    {
      id: 'w1-scout-glass', phase: 'planning', at: 'tgm:north', targets: ['scout-north'], done: Boolean(glass?.revealed), lens: true,
      title: 'Scout the flows',
      feature: 'Flow Intelligence',
      body: 'This panel is laid out like Token God Mode on Nansen. The overview at the top is free, and each deeper view costs one lens. Start with Flow Intelligence: it splits the last hour of net flow by who is moving: smart traders, top PnL wallets, whales, exchanges, fresh wallets and public figures.',
    },
    {
      id: 'w1-buyers', phase: 'planning', at: 'tgm:north', targets: ['tool-buyers'], done: opened(glass, 'buyers'), lens: true,
      title: 'A crosscurrent. Is the buying real?',
      feature: 'Who Bought/Sold',
      body: 'Smart traders are selling while whales buy and exchanges fill up: opposing actors plus gate pressure. The green price is being carried by size, not skill. Now check the buying itself. Open Who Bought/Sold to see who bought and whether they kept it.',
    },
    {
      id: 'w1-trend', phase: 'planning', at: 'tgm:north', targets: ['tool-trend'], done: opened(glass, 'trend'), lens: true,
      title: buyers ? `${buyers.verdict}. Now the weekly trend` : 'Now the weekly trend',
      feature: 'Flows · Smart Money',
      body: `${buyers ? `${buyers.detail} ` : ''}One last check before you decide: is Smart Money building or trimming over the week? Open Flows (Smart Money holdings, 7 days).`,
    },
    {
      id: 'w1-brace-glass', phase: 'planning', at: 'board', targets: ['stance-north-brace'], done: stanceOf(plans, 'north') === 'brace',
      title: 'A false calm: brace Glass',
      body: `${trend ? `${trend.detail} ` : ''}A green screener, smart money leaving, concentrated buying: that is a false calm. Set Glass to Brace (1 supply). Bracing lets in only 28% of the pressure and still catches 1 charge.`,
    },
    {
      id: 'w1-scout-ember', phase: 'planning', at: 'board', targets: ['scout-east'], done: Boolean(ember?.revealed), lens: true,
      title: 'Now find where the charge is',
      feature: 'Flow Intelligence',
      body: `Ember is quiet on the screener (${pct(ember?.market.priceChangePct)}), but its harbor is deep (liquidity ${ember?.market.liquidityBand ?? '?'}/3). Quiet is not the same as empty. Scout Ember's flows; the Scout button on the board works just like the one in Token God Mode.`,
    },
    {
      id: 'w1-harvest-ember', phase: 'planning', at: 'board', targets: ['stance-east-harvest'],
      done: stanceOf(plans, 'east') === 'harvest' && (acked.has('w1-harvest-ember') || acked.has(planEvent(1, 'east', 'harvest'))),
      ack: stanceOf(plans, 'east') === 'harvest' ? 'Keep Ember on Harvest' : undefined,
      title: 'An open current: harvest Ember',
      body: `${cap(CURRENT.open.flows)}. That is an open current, and it is where your charge comes from. Click Harvest on Ember (0 supply) to commit to it.`,
    },
    {
      id: 'w1-brace-moss', phase: 'planning', at: 'board', targets: ['stance-west-brace', 'market-west'], done: stanceOf(plans, 'west') !== 'harvest',
      title: 'Moss: a falling price in shallow water',
      body: `Moss is ${pct(moss?.market.priceChangePct)} and its harbor is thin: liquidity ${moss?.market.liquidityBand ?? '?'}/3 adds +1 pressure to every flow. Even without a scout you can see whales leaving and exchanges filling up. You cannot read everything, so brace what you cannot read.${game.intel > 0 ? ` Keep your remaining ${game.intel === 1 ? 'lens' : 'lenses'}: unspent lenses carry over into chapter 2.` : ''}`,
    },
    {
      id: 'w1-alert', phase: 'planning', at: 'board', targets: ['alert-east'], done: alert !== null,
      title: 'Put a Smart Alert where you are exposed',
      feature: 'Smart Alerts',
      body: 'You are harvesting Ember, so that is where a surprise would hurt. In Ember\'s Smart Alert box, choose “Smart traders exit”. If it fires in the 5-minute read while you harvest, the gates brace in time at no supply cost. That is exactly why Nansen users set alerts on their open positions.',
    },
    {
      id: 'w1-call', phase: 'planning', at: 'board', targets: ['call-north'], done: calls.north !== undefined || acked.has('w1-call'), optional: true,
      title: 'Optional: make a call',
      feature: 'Timeframe comparison',
      body: 'Smart traders sold Glass over the last hour. Will they keep that direction in the next 5-minute read? Pick Holds or Turns: right is +12 points, wrong is −4. Pass is always allowed, because weak evidence deserves no claim.',
    },
    {
      id: 'w1-resolve', phase: 'planning', at: 'board', targets: ['resolve'], done: false,
      title: 'Resolve wave 1',
      body: `Your plan: ${planSummary(game, plans, alert)}. Commit it. The rehearsal plays the next 5-minute Flow Intelligence read and applies every pressure source, including the Nansen views you did not open.`,
      note: cost > game.energy ? { tone: 'warn', text: `That plan costs ${cost} supply and you hold ${game.energy}. Lower a stance first.` } : undefined,
    },
    {
      id: 'w1-report', phase: 'report', at: 'report', targets: ['ledger', 'next'], done: false,
      title: 'What the current did',
      ...(() => { const r = report(game, 1); return { body: `${r.body} When you are ready, continue to chapter 2.`, note: r.note }; })(),
    },
  ];
}

function chapterTwo(input: CoachInput): Draft[] {
  const { game, plans, alert, tgmLane, acked } = input;
  const revealed = game.lanes.filter((l) => l.revealed);
  const unscouted = game.lanes.filter((l) => !l.revealed);
  const found = revealed.find((l) => readCurrent(l) === 'open');
  const wrong = revealed.find((l) => readCurrent(l) !== 'open');
  const favoured = found ?? revealed.find((l) => stanceOf(plans, l.id) === 'harvest') ?? revealed[0];
  const panelLane = tgmLane ? lane(game, tgmLane) : undefined;
  const focus = panelLane ?? favoured;
  const where = panelLane ? `In ${short(panelLane)}'s Token God Mode` : favoured ? `In ${short(favoured)}'s Token God Mode` : 'In Token God Mode on the reach you would harvest';
  const hint = favoured ? [`tgm-${favoured.id}`] : game.lanes.map((l) => `tgm-${l.id}`);
  const ledger = clueOn(focus, 'buyers');
  const profiled = game.lanes.find((l) => opened(l, 'profiler'));
  const profile = clueOn(profiled, 'profiler');
  const index = favoured ? game.lanes.indexOf(favoured) : -1;
  const feeder = index >= 0 ? game.lanes[(index + game.lanes.length - 1) % game.lanes.length] : undefined;
  const ring = [...game.lanes, game.lanes[0]].map(short).join(' → ');
  const harvesting = game.lanes.filter((l) => stanceOf(plans, l.id) === 'harvest');
  const check = gateCheck(game, plans);
  return [
    {
      id: 'w2-intro', phase: 'planning', at: 'board', targets: ['stormglass'], done: acked.has('w2-intro') || game.lanes.some(touched), ack: 'Start chapter 2',
      title: 'Chapter 2: find the open current',
      body: `New wave, new currents: the reaches have reshuffled. You got +${WAVE_REFILL.energy} supply and +${WAVE_REFILL.intel} lenses (now ${game.energy} and ${game.intel}). The storm glass reads ${game.weather.name} (${signed(game.weather.pressure)}): ${weatherMeaning(game.weather.pressure)}. This time you choose the harvest, and I react to what you find.`,
      feature: 'Perp Screener',
    },
    {
      id: 'w2-scout', phase: 'planning', at: 'board', targets: unscouted.map((l) => `scout-${l.id}`), done: revealed.length > 0, lens: true,
      title: 'Scout the reach you would harvest',
      feature: 'Flow Intelligence',
      body: 'Use the free surface to choose: the whale and exchange rows are visible on every reach without a lens. In chapter 1 the open current had whales buying and exchanges releasing supply. Scout the reach that looks like that.',
    },
    {
      id: 'w2-rescout', phase: 'planning', at: 'board', targets: unscouted.map((l) => `scout-${l.id}`),
      done: revealed.length === 0 || Boolean(found), lens: true, optional: true, skipLabel: 'Continue anyway',
      title: wrong ? `Not this one: ${short(wrong)} is ${CURRENT[readCurrent(wrong)].name}` : 'Not this one',
      body: `${wrong ? `${cap(CURRENT[readCurrent(wrong)].flows)}. ` : ''}Plan to brace it, and scout another reach. You have ${plural(game.intel, 'lens', 'lenses')} left.`,
      feature: 'Flow Intelligence',
    },
    {
      id: 'w2-profiler', phase: 'planning', at: 'tgm:*', hint, targets: [opened(focus, 'buyers') ? 'tool-profiler' : 'tool-buyers'],
      done: anyOpened(game, 'profiler'), lens: true,
      title: found ? `${short(found)} is an open current. Whose buying is it?` : 'Check the hand behind the buying',
      feature: 'Who Bought/Sold → Profiler',
      body: ledger
        ? `${ledger.verdict}: ${ledger.detail} Now open Profiler for the 30-day track record of the largest net buyer. On Nansen you click from the ledger through to the wallet in the same way.`
        : `${found ? `${cap(CURRENT.open.flows)}. ` : ''}${where}, open Who Bought/Sold, then Profiler. Profiler shows the 30-day track record of the largest net buyer. On Nansen you click from the ledger through to the wallet in the same way.`,
    },
    {
      id: 'w2-divert', phase: 'planning', at: 'board', ack: 'Got it',
      targets: feeder ? [`stance-${feeder.id}-divert`] : game.lanes.map((l) => `stance-${l.id}-divert`),
      // Sticky: trying Divert counts as having met it, even if the player changes their mind.
      done: acked.has('w2-divert') || game.lanes.some((l) => acked.has(planEvent(game.wave, l.id, 'divert'))),
      title: 'One more tool: Divert',
      body: `Divert (2 supply) seals a reach, so it takes no damage and earns no charge, and pushes 55% of its pressure into the next reach along: ${ring}. ${feeder && favoured ? `Diverting ${short(feeder)} would push its pressure straight into ${short(favoured)}, the reach you want to harvest. ` : ''}Divert only pays off when the neighbour can absorb the load. Here, Brace is the better tool.`,
      note: profile && profiled ? { tone: profile.pressure <= 0 ? 'good' : 'warn', text: `Profiler on ${short(profiled)}: ${profile.verdict}. ${profile.detail}` } : undefined,
    },
    {
      id: 'w2-gates', phase: 'planning', at: 'board', targets: game.lanes.map((l) => `stances-${l.id}`), done: acked.has('w2-gates'), ack: 'My gates are set',
      title: 'Set your gates',
      body: 'Harvest the reach whose evidence agrees, and brace the ones that look like a false calm or an undertow. The total cost has to fit your supply. Stuck? Reveal the answer.',
      note: check,
      answer: routeText(2),
    },
    {
      id: 'w2-alert', phase: 'planning', at: 'board', targets: (harvesting.length ? harvesting : game.lanes).map((l) => `alert-${l.id}`), done: alert !== null,
      title: 'Arm this wave\'s Smart Alert',
      feature: 'Smart Alerts',
      body: `One alert per wave, and it is free. Put it on ${harvesting.length ? names(harvesting) : 'the reach you harvest'}: that is where a sudden exit would hurt.`,
    },
    {
      id: 'w2-resolve', phase: 'planning', at: 'board', targets: ['resolve'], done: false,
      title: 'Resolve wave 2',
      body: `Your plan: ${planSummary(game, plans, alert)}. Commit it, and the 5-minute read decides what the current does.`,
      note: check?.tone === 'warn' ? check : undefined,
    },
    {
      id: 'w2-report', phase: 'report', at: 'report', targets: ['ledger', 'next'], done: false,
      title: 'Which view would have changed your mind?',
      ...(() => { const r = report(game, 2); return { body: `${r.body} The habit to build: before committing, open the view that could prove you wrong.`, note: r.note }; })(),
    },
  ];
}

function chapterThree(input: CoachInput): Draft[] {
  const { game, plans, alert, tgmLane, acked } = input;
  const panelLane = tgmLane ? lane(game, tgmLane) : undefined;
  const open = game.lanes.filter((l) => readCurrent(l) === 'open');
  const tapeLane = game.lanes.find((l) => opened(l, 'trades'));
  const tape = clueOn(tapeLane, 'trades');
  const tapeSaysNo = Boolean(tape && tape.pressure > 0);
  const harvesting = game.lanes.filter((l) => stanceOf(plans, l.id) === 'harvest');
  const check = gateCheck(game, plans);
  const others = tapeLane ? game.lanes.filter((l) => l.id !== tapeLane.id) : game.lanes;
  // Sum up what the player read this wave, and help them reason from it.
  const clues = (l: Lane) => (l.opened ?? []).map((tool) => l.intel?.[tool]).filter((c): c is Clue => Boolean(c));
  const read = game.lanes.filter((l) => clues(l).length > 0);
  const evidence = read.map((l) => `${short(l)}: ${clues(l).map((c) => `${c.verdict} (${signed(c.pressure)})`).join(', ')}`);
  const warned = read.filter((l) => clues(l).every((c) => c.pressure > 0));
  const confirmed = read.filter((l) => clues(l).every((c) => c.pressure <= 0) && clues(l).some((c) => c.pressure < 0));
  const left = warned.length === game.lanes.length - 1 ? game.lanes.find((l) => !warned.includes(l)) : undefined;
  const deduction = confirmed.length === 1
    ? `${short(confirmed[0])} checks out. `
    : left
      ? `${names(warned)} both warned you off, which leaves ${short(left)}${readCurrent(left) === 'open' ? ', and its surface looks open' : ''}. `
      : '';
  return [
    {
      id: 'w3-intro', phase: 'planning', at: 'board', targets: ['stormglass'], done: acked.has('w3-intro') || game.lanes.some(touched), ack: 'Start chapter 3',
      title: 'Chapter 3: read the surface',
      body: `Final wave. The storm glass reads ${game.weather.name} (${signed(game.weather.pressure)}): ${weatherMeaning(game.weather.pressure)}. You have ${plural(game.intel, 'lens', 'lenses')}, not enough to scout and confirm everything. But you have met all three currents now, and each one shows on the free surface before you spend a lens.`,
      feature: 'Perp Screener',
    },
    {
      id: 'w3-surface', phase: 'planning', at: 'board', targets: game.lanes.map((l) => `flows-${l.id}`), done: acked.has('w3-surface') || game.lanes.some(touched), ack: 'I have a candidate',
      title: 'Spot the open current from the surface',
      feature: 'Token Screener + surface flows',
      body: 'Compare what is free on every reach: the whale and exchange rows, and the Token Screener strip above them. The open current: whales buying, exchanges releasing supply, a deep harbor. The false calm: a green price with everyone loading in. The undertow: a falling price in shallow water as whales leave. Which reach looks open?',
      answer: open.length ? `${names(open)}: whales buying, exchanges releasing supply, a deep harbor. That is the open current.` : undefined,
    },
    {
      id: 'w3-trades', phase: 'planning', at: 'tgm:*', hint: game.lanes.map((l) => `tgm-${l.id}`), targets: ['tool-trades'], done: anyOpened(game, 'trades'), lens: true,
      title: 'Confirm with the tape',
      feature: 'DEX Trades',
      body: `${panelLane ? `In ${short(panelLane)}'s Token God Mode, open` : 'Open Token God Mode on your candidate, then open'} DEX Trades: which side carried the last hour of swap value, buyers or sellers?`,
    },
    tapeSaysNo && tapeLane && tape
      ? {
          id: 'w3-transfers', phase: 'planning', at: 'tgm:*', avoid: tapeLane.id, hint: others.map((l) => `tgm-${l.id}`), targets: ['tool-transfers'],
          done: anyOpened(game, 'transfers'), lens: true,
          title: `The tape says no on ${short(tapeLane)}`,
          feature: 'Token Transfers',
          body: `${tape.detail} With sellers in control, that is not a harvest. Spend your last lens on another reach and open Transfers there. Cargo leaving exchange wallets is what an open current looks like.`,
        }
      : {
          id: 'w3-transfers', phase: 'planning', at: tapeLane ? `tgm:${tapeLane.id}` : 'tgm:*', hint: game.lanes.map((l) => `tgm-${l.id}`), targets: ['tool-transfers'],
          done: anyOpened(game, 'transfers'), lens: true,
          title: tape ? 'The tape agrees. Now follow the cargo' : 'Follow the cargo',
          feature: 'Token Transfers',
          body: `${tape ? `${tape.detail} ` : ''}Now open Transfers${tapeLane ? ` on ${short(tapeLane)}` : ''}: are the largest transfers going into exchange wallets (supply arriving to sell) or out of them (a move to self-custody)?`,
        },
    {
      id: 'w3-gates', phase: 'planning', at: 'board', targets: game.lanes.map((l) => `stances-${l.id}`), done: acked.has('w3-gates'), ack: 'My gates are set',
      title: 'Set your gates',
      body: `${evidence.length ? `Your evidence: ${evidence.join('; ')}. ` : ''}${deduction}Harvest where the surface and the toolkit agree, and brace the rest. Stuck? Reveal the answer.`,
      note: check,
      answer: routeText(3),
    },
    {
      id: 'w3-alert', phase: 'planning', at: 'board', targets: (harvesting.length ? harvesting : game.lanes).map((l) => `alert-${l.id}`), done: alert !== null,
      title: 'Arm the last Smart Alert',
      feature: 'Smart Alerts',
      body: `Same habit as before: put the free tripwire on ${harvesting.length ? names(harvesting) : 'the reach you harvest'}, where you are exposed.`,
    },
    {
      id: 'w3-resolve', phase: 'planning', at: 'board', targets: ['resolve'], done: false,
      title: 'Resolve the final wave',
      body: `Your plan: ${planSummary(game, plans, alert)}. Commit it and see whether the light comes on.`,
      note: check?.tone === 'warn' ? check : undefined,
    },
    {
      id: 'w3-report', phase: 'report', at: 'report', targets: ['ledger', 'next'], done: false,
      title: 'The last ledger',
      ...(() => { const r = report(game, 3); return { body: `${r.body} Then see your final results.`, note: r.note }; })(),
    },
  ];
}

/* -------------------------------------------------------------- finale */

function finale(input: CoachInput): CoachStep {
  const { game, liveReady = true } = input;
  const opened = new Set(game.history.flatMap((r) => r.lanes.flatMap((l) => l.opened)));
  const scouted = game.history.some((r) => r.lanes.some((l) => l.scouted));
  // Token Screener and Perp Screener are free on every wave; the rest had to be opened.
  const views = 2 + (scouted ? 1 : 0) + opened.size;
  const lastWave = game.history.length;
  const base = { id: 'finale', wave: game.maxWaves, chapter: 3, chapterTitle: 'Complete', index: 1, total: 1, targets: [] as string[] };
  const liveNote = liveReady ? '' : ' Live runs need a NANSEN_API_KEY on the server.';
  if (game.victory) {
    return {
      ...base,
      title: 'Tutorial complete: the light is on',
      body: `${game.charge} charge (the target was ${game.target}) with ${game.hull} hull left, using ${views} of the 8 Nansen views. You have met all three currents: the false calm (a green screener while smart money leaves), the open current (the actors agree) and the undertow (whales out, exchanges filling up). The live current uses the same instruments on real Nansen data, and nobody knows the answer in advance.${liveNote}`,
      actions: liveReady ? ['start-live', 'replay'] : ['replay'],
    };
  }
  const actions: CoachAction[] = liveReady ? ['replay', 'start-live'] : ['replay'];
  if (game.hull <= 0) {
    return {
      ...base,
      title: 'Tutorial over: the gates gave way',
      body: `The hull ran out in wave ${lastWave}. That is exactly what a rehearsal is for: every ledger row marked “not opened” with + pressure was a warning you could have read. Replay the tutorial, open those views first, and brace what you cannot read.${liveNote}`,
      actions,
    };
  }
  return {
    ...base,
    title: 'Tutorial complete: the light stayed dark',
    body: `Your hull held (${game.hull} left), but the beacon reached only ${game.charge} of ${game.target} charge. Bracing is safe but slow: charge comes from harvesting the reach where the actors agree. Replay the tutorial and trust the open current.${liveNote}`,
    actions,
  };
}

/* ----------------------------------------------------------- placement */

/** Resolve a draft's targets against where the player currently is. */
function place(draft: Draft, tgmLane: string | null): { targets: string[]; body: string } {
  if (draft.at === 'tgm:*') {
    // Any reach's panel will do: the player picks the reach, the coach picks the view.
    if (tgmLane === null) return { targets: draft.hint ?? [], body: draft.body };
    if (draft.avoid && tgmLane === draft.avoid) return { targets: ['tgm-close'], body: `Close this panel and open Token God Mode on another reach. ${draft.body}` };
    return { targets: draft.targets, body: draft.body };
  }
  if (draft.at.startsWith('tgm:')) {
    const want = draft.at.slice(4);
    if (tgmLane === want) return { targets: draft.targets, body: draft.body };
    if (tgmLane !== null) return { targets: ['tgm-close'], body: `Close this panel, then open Token God Mode on ${LANE_NAME[want] ?? 'the reach'}. ${draft.body}` };
    return { targets: [`tgm-${want}`, ...draft.targets], body: draft.body };
  }
  if (draft.at === 'board' && tgmLane !== null) {
    // Scout buttons exist in both places; everything else lives on the board.
    if (draft.targets.includes(`scout-${tgmLane}`)) return { targets: [`scout-${tgmLane}`], body: draft.body };
    return { targets: ['tgm-close'], body: `Go back to the gates. ${draft.body}` };
  }
  return { targets: draft.targets, body: draft.body };
}

/** The step the coach should show right now, or null when there is nothing to coach. */
export function coachStep(input: CoachInput): CoachStep | null {
  const { game, tgmLane, acked } = input;
  if (game.mode !== 'demo') return null;
  if (game.phase === 'finished') return finale(input);

  const wave = Math.min(game.wave, game.maxWaves);
  const chapter = Math.min(wave, 3);
  const drafts = chapter === 1 ? chapterOne(input) : chapter === 2 ? chapterTwo(input) : chapterThree(input);
  const resolved = game.phase !== 'planning';
  const total = drafts.length;

  for (let i = 0; i < drafts.length; i += 1) {
    const draft = drafts[i];
    if (draft.phase === 'planning' && resolved) continue;
    if (draft.done || acked.has(draft.id)) continue;
    const base = { id: draft.id, wave, chapter, chapterTitle: CHAPTERS[chapter], index: i + 1, total, title: draft.title, feature: draft.feature, answer: draft.answer };
    if (draft.lens && game.intel < 1) {
      return {
        ...base,
        targets: [],
        optional: true,
        skipLabel: 'Skip this view',
        title: `Out of lenses: ${draft.title}`,
        body: `${draft.body} You have no lenses left, which is the trade-off of your doctrine. Skip this view; the wave report will show what it would have said.`,
      };
    }
    const placed = place(draft, tgmLane);
    return { ...base, targets: placed.targets, body: placed.body, note: draft.note, ack: draft.ack, optional: draft.optional, skipLabel: draft.skipLabel };
  }
  return null;
}
