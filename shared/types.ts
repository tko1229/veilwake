export type Mode = 'live' | 'demo';
export type CohortId = 'smart_trader' | 'top_pnl' | 'whale' | 'exchange' | 'fresh_wallets' | 'public_figure';
export type Direction = 'in' | 'out' | 'flat' | 'unknown';
export type Stance = 'harvest' | 'brace' | 'divert';
export type Doctrine = 'keeper' | 'cartographer' | 'engineer';
/** Nansen views a player can open on a reach, beyond Flow Intelligence (the scout). */
export type IntelToolId = 'buyers' | 'trades' | 'transfers' | 'trend' | 'profiler';
/** A teaching call about Smart Trader direction between the 1h context and the 5m read. */
export type CallChoice = 'hold' | 'turn' | 'pass';
/** Smart Alert conditions, evaluated against the 5m resolution read. */
export type AlertCondition = 'smart_out' | 'whale_out' | 'exchange_in';
/** Coarse label families. Raw Nansen labels never leave the server. */
export type Archetype = 'smart' | 'size' | 'exchange' | 'insider' | 'machine' | 'active' | 'unlabeled' | 'other';

export interface Signal { id: CohortId; direction: Direction; force: number | null; }
export interface Token { chain: string; address: string; symbol: string; }
export interface Provenance { endpoint: string; fetchedAt: string; timeframe: string; requestId: string | null; cached: boolean; }
/** A derived, display-safe fact: ratios, counts, bands. Never an address, raw label or USD amount. */
export interface Fact { label: string; value: string; }

/** Token Screener snapshot. Price and % change are shown; size fields are reduced to 0–3 bands. */
export interface MarketSnapshot {
  priceUsd: number | null;
  priceChangePct: number | null;
  volumeBand: number | null;
  liquidityBand: number | null;
  marketCapBand: number | null;
  buySellBias: Direction;
  netflowDirection: Direction;
  netflowBand: number | null;
  provenance: Provenance;
}

/** One derived Nansen view on a reach, turned into a bounded pressure modifier. */
export interface Clue {
  tool: IntelToolId;
  status: 'ok' | 'empty' | 'unavailable';
  verdict: string;
  detail: string;
  pressure: number;
  /** Optional trend direction used by resolution combinations (Smart Money holdings trend). */
  direction?: Direction;
  facts: Fact[];
  provenance: Provenance;
}

/** Hyperliquid positioning of Smart Money on the reach's own perp market, if listed. */
export interface PerpShadow { listed: boolean; bias: 'long' | 'short' | 'balanced' | null; pressure: number; detail: string; }

/** Market-wide Smart Money perp positioning (Perp Screener). Applies to every reach in a wave. */
export interface Weather { status: 'ok' | 'unavailable'; name: string; detail: string; pressure: number; facts: Fact[]; provenance: Provenance; }

/** Derived only: no wallet addresses, raw rows or unbounded API payloads. */
export interface Reading { signals: Signal[]; provenance: Provenance; available: number; }
export interface Lane {
  id: string;
  name: string;
  token: Pick<Token, 'chain' | 'symbol'>;
  market: MarketSnapshot;
  context: Reading;
  baseline: Reading;
  revealed: boolean;
  preview: 'quiet' | 'restless' | 'volatile' | 'uncertain';
  /** Hidden server-side until the matching tool is opened (or the wave resolves). */
  intel: Partial<Record<IntelToolId, Clue>>;
  opened: IntelToolId[];
  perp: PerpShadow;
}
export interface Modifier { source: 'market' | 'weather' | 'perp' | 'combo' | IntelToolId; label: string; value: number; seen: boolean; }
export interface AlertPlan { laneId: string; condition: AlertCondition; }
export interface LaneResult {
  laneId: string;
  name: string;
  token: Pick<Token, 'chain' | 'symbol'>;
  stance: Stance;
  effectiveStance: Stance;
  baseHazard: number;
  incoming: number;
  hazard: number;
  pattern: string;
  damage: number;
  energy: number;
  points: number;
  explanation: string;
  lesson: string;
  reading: Reading;
  changed: boolean;
  modifiers: Modifier[];
  scouted: boolean;
  opened: IntelToolId[];
  call: CallChoice;
  callHit: boolean | null;
  alert: { condition: AlertCondition; fired: boolean; switched: boolean } | null;
}
export interface RoundResult { wave: number; lanes: LaneResult[]; damage: number; energy: number; points: number; title: string; weather: string; }
export interface GameState {
  id: string;
  mode: Mode;
  doctrine: Doctrine;
  phase: 'planning' | 'resolved' | 'finished';
  wave: number;
  maxWaves: number;
  hull: number;
  energy: number;
  charge: number;
  target: number;
  score: number;
  intel: number;
  lanes: Lane[];
  weather: Weather;
  plans: Record<string, Stance>;
  calls: Record<string, CallChoice>;
  alert: AlertPlan | null;
  history: RoundResult[];
  createdAt: string;
  expiresAt: string;
  revision: number;
  victory: boolean | null;
}
export interface Telemetry { startedAt: string; requests: number; successes: number; failures: number; cacheHits: number; deduplicated: number; creditsUsed: number; creditsEstimated: number; creditsRemaining: number|null; eventsProcessed: number; endpoints: Record<string,{requests:number;successes:number;failures:number}>; chains: string[]; recent: {at:string;endpoint:string;status:number;requestId:string|null;credits:number|null}[]; hourUsed: number; hourLimit: number; dayUsed:number; dayLimit:number; }
export interface ApiFailure { error: string; code: string; retryAfter?: number; canDemo?: boolean; }

export const COHORTS: {id:CohortId; name:string; fiction:string; glyph:string; color:string; description:string}[] = [
  {id:'smart_trader',name:'Smart traders',fiction:'The Navigators',glyph:'N',color:'#476c63',description:'Nansen-classified smart traders. Not infallible; this is a cohort, not a recommendation.'},
  {id:'top_pnl',name:'Top PnL',fiction:'The Pathfinders',glyph:'P',color:'#637f45',description:'Top PnL cohort. May overlap with other cohorts; past results are not future skill.'},
  {id:'whale',name:'Whales',fiction:'The Leviathans',glyph:'W',color:'#5f718b',description:'Large-holder flow. Scale alone says nothing about intent.'},
  {id:'exchange',name:'Exchanges',fiction:'The Gatekeepers',glyph:'E',color:'#aa7545',description:'Exchange-labeled flow. Deposits are not necessarily sales.'},
  {id:'fresh_wallets',name:'Fresh wallets',fiction:'The Drifters',glyph:'F',color:'#9d727d',description:'Fresh-wallet flow. A new address is not necessarily a new person. Available on 1d/7d only.'},
  {id:'public_figure',name:'Public figures',fiction:'The Heralds',glyph:'H',color:'#8774a1',description:'Public-figure cohort. Visibility does not imply predictive value.'}
];

export interface ToolInfo {
  /** In-game instrument name. */
  name: string;
  /** The Nansen feature this instrument teaches. */
  nansen: string;
  /** Where the same view lives in the Nansen app. */
  where: string;
  endpoint: string;
  window: string;
  question: string;
  lesson: string;
  requires?: IntelToolId;
}

/** Flow Intelligence is the scout. Kept separate because it predates the toolkit and costs the same lens. */
export const FLOW_TOOL: ToolInfo = {
  name: 'Current lens',
  nansen: 'Flow Intelligence',
  where: 'Token God Mode → Flow Intelligence',
  endpoint: 'tgm/flow-intelligence',
  window: '1h context + 1d baseline',
  question: 'Which labeled cohorts are net buying or net selling this token?',
  lesson: 'Start every token deep-dive by splitting the flow by actor. Size (whales) and skill (smart traders) often disagree.',
};

export const TOOL_ORDER: IntelToolId[] = ['buyers', 'trades', 'transfers', 'trend', 'profiler'];

export const TOOLS: Record<IntelToolId, ToolInfo> = {
  buyers: {
    name: 'Dock ledger',
    nansen: 'Who Bought/Sold',
    where: 'Token God Mode → Buyers & Sellers',
    endpoint: 'tgm/who-bought-sold',
    window: '24h',
    question: 'Who is actually buying — and do they keep what they buy?',
    lesson: 'Big buy volume can be churn: the same wallets often sell back almost everything. Check what the top buyers kept, not just what they bought.',
  },
  trades: {
    name: 'Tide log',
    nansen: 'DEX Trades',
    where: 'Token God Mode → Trades',
    endpoint: 'tgm/dex-trades',
    window: '1h',
    question: 'Is the most recent tape leaning to buys or to sells?',
    lesson: 'The trades tab is the ground truth behind every aggregate. Read the latest swaps to see whether sellers or buyers carry the value right now.',
  },
  transfers: {
    name: 'Cargo manifest',
    nansen: 'Token Transfers',
    where: 'Token God Mode → Transfers',
    endpoint: 'tgm/transfers',
    window: '24h',
    question: 'Are the largest moves heading into exchanges, out of them, or from the deployer?',
    lesson: 'Large transfers into exchange wallets load the sell side; transfers out of exchanges usually mean self-custody. Deployer and team wallets deserve a second look.',
  },
  trend: {
    name: 'Depth sounding',
    nansen: 'Flows · Smart Money holdings',
    where: 'Token God Mode → Flows (Smart Money)',
    endpoint: 'tgm/flows',
    window: '7d',
    question: 'Is Smart Money building or trimming its position over the week?',
    lesson: 'Flow Intelligence tells you the net for a window; Flows show the trend. A one-hour exit inside a week of accumulation is a squall, not a tide change.',
  },
  profiler: {
    name: "Captain's log",
    nansen: 'Profiler · PnL summary',
    where: 'Profiler → PnL & trade performance',
    endpoint: 'profiler/address/pnl-summary',
    window: '30d',
    question: 'Does the biggest net buyer have a winning track record?',
    lesson: 'Before you trust a big buyer, profile the wallet. A large buy from a wallet with no record — or a losing one — is not the same as a buy from a seasoned trader.',
    requires: 'buyers',
  },
};

export const CALLS: Record<CallChoice, {name:string;description:string;glyph:string}> = {
  hold:{name:'Holds',description:'Smart traders keep their 1h direction in the 5m read.',glyph:'→'},
  turn:{name:'Turns',description:'Smart traders flip direction in the 5m read.',glyph:'↺'},
  pass:{name:'Pass',description:'No call. Weak evidence deserves no claim.',glyph:'?'}
};

export const ALERTS: Record<AlertCondition, {name:string;description:string;cohort:CohortId}> = {
  smart_out:{name:'Smart traders exit',description:'Fires if the 5m read shows Smart Trader outflow.',cohort:'smart_trader'},
  whale_out:{name:'Whales exit',description:'Fires if the 5m read shows whale outflow.',cohort:'whale'},
  exchange_in:{name:'Exchange inflow spike',description:'Fires if the 5m read shows exchange inflow at strength 2 or more.',cohort:'exchange'}
};

export const STANCES: Record<Stance,{name:string;cost:number;description:string;glyph:string}> = {
  harvest:{name:'Harvest',cost:0,description:'Catch the current. More charge, full exposure.',glyph:'+'},
  brace:{name:'Brace',cost:1,description:'Reduce damage. Capture a little charge.',glyph:'='},
  divert:{name:'Divert',cost:2,description:'Protect this reach, but shift pressure to its neighbor.',glyph:'>'}
};
export const DOCTRINES: Record<Doctrine,{name:string;description:string;hull:number;energy:number;intel:number}> = {
  keeper:{name:'Keeper',description:'Balanced. 100 hull, 6 supply, 5 lenses.',hull:100,energy:6,intel:5},
  cartographer:{name:'Cartographer',description:'The analyst. 85 hull, 6 supply, 8 lenses.',hull:85,energy:6,intel:8},
  engineer:{name:'Engineer',description:'Machinery over research. 100 hull, 9 supply, 3 lenses.',hull:100,energy:9,intel:3}
};
/** Lenses and supply regained after each surviving wave. */
export const WAVE_REFILL = { energy: 3, intel: 2, maxEnergy: 12, maxIntel: 10 } as const;
