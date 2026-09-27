/**
 * Frontend type surface.
 *
 * The contracts in `shared/types.ts` are owned by the engine. This module
 * re-exports them unchanged and adds only presentation-layer types that never
 * leave the browser.
 */
export type {
  Mode,
  CohortId,
  Direction,
  Stance,
  Doctrine,
  IntelToolId,
  CallChoice,
  AlertCondition,
  AlertPlan,
  Clue,
  Fact,
  Modifier,
  PerpShadow,
  Weather,
  ToolInfo,
  MarketSnapshot,
  Signal,
  Token,
  Provenance,
  Reading,
  Lane,
  LaneResult,
  RoundResult,
  GameState,
  Telemetry,
  ApiFailure,
} from '../shared/types';

export { COHORTS, STANCES, DOCTRINES, TOOLS, TOOL_ORDER, FLOW_TOOL, CALLS, ALERTS, WAVE_REFILL } from '../shared/types';

import type { CohortId, Direction, Stance } from '../shared/types';

/** Cohorts whose flow is legible before a reach has been scouted. */
export const UNSCOUTED_COHORTS: readonly CohortId[] = ['whale', 'exchange'];

/** Ordered list used for stable rendering of signal rows. */
export const COHORT_ORDER: readonly CohortId[] = [
  'smart_trader',
  'top_pnl',
  'whale',
  'exchange',
  'fresh_wallets',
  'public_figure',
];

export const DIRECTIONS: Record<Direction, { label: string; arrow: string }> = {
  in: { label: 'inflow', arrow: '\u2193' },
  out: { label: 'outflow', arrow: '\u2191' },
  flat: { label: 'flat', arrow: '\u00b7' },
  unknown: { label: 'unknown', arrow: '?' },
};

export const PREVIEW_COPY = {
  quiet: 'Little movement is legible from the surface.',
  restless: 'The surface is disturbed; something is moving beneath it.',
  volatile: 'Heavy disturbance. The fog is thickest here.',
  uncertain: 'The window returned too little to characterise.',
} as const;

/** Plain-language reading of a lane's pre-scout surface condition. */
export const PREVIEW_LABEL: Record<string, string> = {
  quiet: 'Quiet surface',
  restless: 'Restless surface',
  volatile: 'Volatile surface',
  uncertain: 'Unreadable surface',
};

/** UI-only plan map. Values are always a valid stance; absence means "harvest". */
export type Plans = Record<string, Stance>;

export type ScreenId = 'welcome' | 'loading' | 'game' | 'admin';

export interface HealthReport {
  ok: boolean;
  keyConfigured: boolean;
}
