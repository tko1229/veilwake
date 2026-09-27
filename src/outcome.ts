import type { GameState, LaneResult } from './types';
import { COHORTS, DOCTRINES, STANCES, TOOLS, TOOL_ORDER } from './types';

export interface Achievement {
  id: string;
  name: string;
  description: string;
}

export interface OutcomeTotals {
  damageTaken: number;
  energyGained: number;
  points: number;
  supplySpent: number;
  scoutsInFinalWave: number;
  shifts: number;
  wavesResolved: number;
  worstWaveDamage: number;
  viewsOpened: number;
  toolsUsed: number;
  alertsSet: number;
  alertsSaved: number;
  callsMade: number;
  callsRight: number;
}

export interface Outcome {
  victory: boolean;
  verdictTitle: string;
  verdictNote: string;
  rank: string;
  achievements: Achievement[];
  totals: OutcomeTotals;
  shareText: string;
}

const RANKS: { min: number; name: string }[] = [
  { min: 320, name: 'Tidewarden' },
  { min: 240, name: 'Lampkeeper' },
  { min: 170, name: 'Current-reader' },
  { min: 100, name: 'Gatehand' },
  { min: 40, name: 'Dockhand' },
  { min: Number.NEGATIVE_INFINITY, name: 'Drifter' },
];

function allLaneResults(game: GameState): LaneResult[] {
  return game.history.flatMap((round) => round.lanes);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

/**
 * Everything on the end screen is computed from the finished GameState.
 * No achievement is decorative: each one maps to a fact present in `history`,
 * `lanes`, `score`, `hull` or `charge`.
 */
export function deriveOutcome(game: GameState): Outcome {
  const lanes = allLaneResults(game);
  const victory = game.victory === true;
  const startingHull = DOCTRINES[game.doctrine]?.hull ?? 100;

  const totals: OutcomeTotals = {
    damageTaken: sum(lanes.map((lane) => lane.damage)),
    energyGained: sum(lanes.map((lane) => lane.energy)),
    points: sum(lanes.map((lane) => lane.points)),
    supplySpent: sum(lanes.map((lane) => STANCES[lane.stance]?.cost ?? 0)),
    // After resolution every lane is revealed, so read what the player scouted from history.
    scoutsInFinalWave: game.history.length > 0 ? game.history[game.history.length - 1].lanes.filter((lane) => lane.scouted).length : 0,
    shifts: lanes.filter((lane) => lane.changed).length,
    wavesResolved: game.history.length,
    worstWaveDamage: game.history.reduce((worst, round) => Math.max(worst, round.damage), 0),
    viewsOpened: sum(lanes.map((lane) => (lane.opened?.length ?? 0) + (lane.scouted ? 1 : 0))),
    toolsUsed: new Set(lanes.flatMap((lane) => [...(lane.opened ?? []), ...(lane.scouted ? ['flow'] : [])])).size,
    alertsSet: lanes.filter((lane) => lane.alert).length,
    alertsSaved: lanes.filter((lane) => lane.alert?.switched).length,
    callsMade: lanes.filter((lane) => lane.call && lane.call !== 'pass').length,
    callsRight: lanes.filter((lane) => lane.callHit === true).length,
  };

  const stancesUsed = new Set(lanes.map((lane) => lane.stance));

  const achievements: Achievement[] = [];

  if (victory && game.charge >= game.target) {
    achievements.push({
      id: 'full-charge',
      name: 'Charge met',
      description: `Reached ${game.charge} of ${game.target} charge before the third wave closed.`,
    });
  }
  if (victory && game.hull === startingHull) {
    achievements.push({
      id: 'untouched',
      name: 'Not a scratch',
      description: `Finished with all ${startingHull} hull intact.`,
    });
  }
  if (victory && game.hull > 0 && game.hull <= 20) {
    achievements.push({
      id: 'one-lamp',
      name: 'One lamp left',
      description: `Kept the lights on with only ${game.hull} hull remaining.`,
    });
  }
  if (totals.scoutsInFinalWave === 0 && victory) {
    achievements.push({
      id: 'blind',
      name: 'Sailed blind',
      description: 'Won the run without spending a single lens in the final wave.',
    });
  }
  if (totals.scoutsInFinalWave >= 3) {
    achievements.push({
      id: 'three-lenses',
      name: 'Three lenses down',
      description: 'Scouted every reach in the final wave before committing.',
    });
  }
  if (totals.supplySpent === 0 && game.history.length > 0) {
    achievements.push({
      id: 'frugal',
      name: 'Spent nothing',
      description: 'Resolved every wave on harvest alone; no supply was committed.',
    });
  }
  if (stancesUsed.size === 3) {
    achievements.push({
      id: 'three-hands',
      name: 'Three hands',
      description: 'Used harvest, brace and divert at least once across the run.',
    });
  }
  if (!stancesUsed.has('divert') && game.history.length > 0) {
    achievements.push({
      id: 'no-diversion',
      name: 'Nobody moved',
      description: 'Never diverted pressure onto a neighbouring reach.',
    });
  }
  if (totals.shifts > 0) {
    achievements.push({
      id: 'shifted',
      name: 'Pressure moved',
      description: `Redirected hazard into a neighbour ${totals.shifts} ${totals.shifts === 1 ? 'time' : 'times'}.`,
    });
  }
  if (totals.worstWaveDamage === 0 && game.history.length > 0) {
    achievements.push({
      id: 'clean-sweep',
      name: 'Clean sweep',
      description: 'No wave ever cost a single point of hull.',
    });
  }
  if (totals.worstWaveDamage >= 30) {
    achievements.push({
      id: 'rode-the-storm',
      name: 'Rode the storm',
      description: `Survived a wave that took ${totals.worstWaveDamage} hull.`,
    });
  }
  if (totals.toolsUsed >= 6) {
    achievements.push({
      id: 'full-workflow',
      name: 'The full workflow',
      description: 'Used Flow Intelligence and all five toolkit views — Who Bought/Sold, DEX Trades, Transfers, Flows and Profiler — in one run.',
    });
  }
  if (lanes.some((lane) => lane.opened?.includes('profiler'))) {
    achievements.push({
      id: 'profiled',
      name: 'Checked the captain',
      description: 'Profiled the biggest net buyer before trusting the buying.',
    });
  }
  if (totals.alertsSaved > 0) {
    achievements.push({
      id: 'alert-saved',
      name: 'The tripwire held',
      description: `A Smart Alert fired and braced a harvesting gate in time${totals.alertsSaved > 1 ? ` (${totals.alertsSaved} times)` : ''}.`,
    });
  }
  if (totals.callsRight >= 2) {
    achievements.push({
      id: 'timeframes',
      name: 'Reads the timeframes',
      description: `Called Smart Trader direction right ${totals.callsRight} times against the real 5m read.`,
    });
  }
  if (game.mode === 'live' && victory) {
    achievements.push({
      id: 'live-current',
      name: 'Against the live current',
      description: 'Won a run whose reads came from live upstream data.',
    });
  }

  const rank = RANKS.find((entry) => game.score >= entry.min)?.name ?? 'Drifter';

  const verdictTitle = victory ? 'The lights stayed on.' : 'The reach went dark.';
  const verdictNote = victory
    ? `Charge reached ${game.charge} of ${game.target} with ${game.hull} hull still holding after ${game.history.length} ${game.history.length === 1 ? 'wave' : 'waves'}.`
    : game.hull <= 0
      ? `Hull gave out on wave ${game.wave}. The settlement lost its light with charge at ${game.charge} of ${game.target}.`
      : `The third wave closed with charge at ${game.charge} of ${game.target} — short of the ${game.target} needed.`;

  const shareText = buildShareText(game, { victory, rank, totals });

  return { victory, verdictTitle, verdictNote, rank, achievements, totals, shareText };
}

/**
 * Spoiler-free summary: it never names a hazard, a lane pattern, or any reading,
 * so pasting it cannot spoil another player's fog of war.
 */
function buildShareText(game: GameState, input: { victory: boolean; rank: string; totals: OutcomeTotals }): string {
  const doctrine = DOCTRINES[game.doctrine]?.name ?? game.doctrine;
  const modeLabel = game.mode === 'live' ? 'LIVE DATA' : 'DEMO / FICTIONAL SCENARIO';
  const lines = [
    `VEILWAKE — ${input.victory ? 'victory' : 'defeat'} (${modeLabel})`,
    `Doctrine ${doctrine} · Score ${game.score} · Rank ${input.rank}`,
    `Charge ${game.charge}/${game.target} · Hull ${game.hull}/100 · Waves ${game.history.length}/${game.maxWaves}`,
    `Damage taken ${input.totals.damageTaken} · Supply spent ${input.totals.supplySpent} · Shifts ${input.totals.shifts}`,
    `Nansen views opened ${input.totals.viewsOpened} · Skills used ${input.totals.toolsUsed}/6 · Smart Alerts saved ${input.totals.alertsSaved}`,
    '',
    'Read the current. Keep the lights on. Powered by Nansen API.',
  ];
  return lines.join('\n');
}

/** Copy text with a fallback for browsers or contexts without the async clipboard. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', 'true');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, area.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/** Plain-language cohort summary of a reading, for research prompts. */
function cohortSummary(lane: LaneResult): string {
  const parts = lane.reading.signals
    .filter((signal) => signal.force !== null && (signal.direction === 'in' || signal.direction === 'out'))
    .map((signal) => `${COHORTS.find((cohort) => cohort.id === signal.id)?.name ?? signal.id} ${signal.direction === 'in' ? 'net inflow' : 'net outflow'}`);
  return parts.length ? parts.join(', ') : 'no readable cohort flow';
}

/**
 * A research prompt the player can paste into Nansen AI. Built only from what
 * the player already saw in the resolved wave; it names the token symbol, never
 * an address.
 */
export function researchPrompt(lane: LaneResult): string {
  const verdicts = lane.modifiers
    .filter((mod) => (TOOL_ORDER as string[]).includes(mod.source))
    .map((mod) => `${TOOLS[mod.source as keyof typeof TOOLS].nansen}: ${mod.label.split(' · ').slice(1).join(' · ')}`)
    .join('; ');
  return [
    `I'm researching ${lane.token.symbol} on ${lane.token.chain}.`,
    `A recent 5-minute Nansen Flow Intelligence read showed: ${cohortSummary(lane)}.`,
    verdicts ? `Other Nansen views read — ${verdicts}.` : '',
    `Using Nansen data, explain what Smart Money, whales and exchange-labeled wallets have done with ${lane.token.symbol} over the last 24 hours and 7 days, whether the 1h and 1d flows agree, and which wallets are worth profiling next.`,
    'Treat this as research, not investment advice.',
  ].filter(Boolean).join(' ');
}
