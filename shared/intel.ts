/**
 * Derivation layer for the Nansen toolkit.
 *
 * Every function here takes raw upstream rows (server-side only) and returns a
 * display-safe `Clue`: a verdict, a short explanation, a bounded pressure
 * modifier and a handful of derived facts (ratios, counts, bands). Addresses,
 * raw Nansen labels, transaction hashes and USD amounts never survive this step.
 *
 * The pressure values are game rules, not risk scores or predictions.
 */
import type { Archetype, Clue, Direction, Fact, IntelToolId, PerpShadow, Provenance, Weather } from './types.ts';

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const pct = (x: number) => `${Math.round(x * 100)}%`;
const signedPct = (x: number) => `${x >= 0 ? '+' : '−'}${Math.round(Math.abs(x) * 100)}%`;
const rowsOf = (rows: unknown): Record<string, unknown>[] =>
  Array.isArray(rows) ? rows.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object' && !Array.isArray(row)) : [];

// ------------------------------------------------------------------ labels

const SMART = /smart|\bfund\b|ventures?\b|capital\b/i;
const EXCHANGE = /exchange|binance|coinbase|\bokx\b|okex|kraken|bybit|bitget|kucoin|gate\.io|\bhtx\b|huobi|mexc|crypto\.com|bitfinex|gemini|upbit|bithumb|bitstamp|deribit|hot wallet|cold wallet|\bcex\b/i;
const INSIDER = /deployer|\bteam\b|treasury|foundation|vesting|founder|multisig/i;
const MACHINE = /liquidity pool|\bpool\b|router|\bbot\b|\bmev\b|sniper|arbitrage|contract|vault|bridge|aggregator|market maker/i;
const SIZE = /whale|millionaire|billionaire|high balance/i;
const ACTIVE = /high activity|\btrader\b|active/i;

/** Maps a free-text Nansen label to a coarse family. The label itself is discarded. */
export function archetypeOf(label: unknown): Archetype {
  if (typeof label !== 'string' || label.trim().length === 0) return 'unlabeled';
  if (SMART.test(label)) return 'smart';
  if (EXCHANGE.test(label)) return 'exchange';
  if (INSIDER.test(label)) return 'insider';
  if (MACHINE.test(label)) return 'machine';
  if (SIZE.test(label)) return 'size';
  if (ACTIVE.test(label)) return 'active';
  return 'other';
}

export const ARCHETYPE_NAMES: Record<Archetype, string> = {
  smart: 'smart money',
  size: 'whale-class',
  exchange: 'exchange',
  insider: 'deployer/team',
  machine: 'pools & bots',
  active: 'high-activity',
  unlabeled: 'unlabeled',
  other: 'other labels',
};

function labelMix(archetypes: Archetype[]): string {
  const counts = new Map<Archetype, number>();
  for (const a of archetypes) counts.set(a, (counts.get(a) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([a, n]) => `${ARCHETYPE_NAMES[a]} ${n}`)
    .join(' · ') || '?';
}

// ------------------------------------------------------------------ helpers

interface Factor { verdict: string; sentence: string; delta: number; }

function assemble(tool: IntelToolId, factors: Factor[], fallback: { verdict: string; sentence: string }, facts: Fact[], provenance: Provenance, bounds: [number, number], direction?: Direction): Clue {
  const pressure = clamp(factors.reduce((sum, f) => sum + f.delta, 0), bounds[0], bounds[1]);
  const lead = [...factors].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
  const clue: Clue = {
    tool,
    status: 'ok',
    verdict: lead ? lead.verdict : fallback.verdict,
    detail: factors.length > 0 ? factors.map((f) => f.sentence).join(' ') : fallback.sentence,
    pressure,
    facts,
    provenance: { ...provenance },
  };
  if (direction) clue.direction = direction;
  return clue;
}

export function unavailableClue(tool: IntelToolId, provenance: Provenance, code = 'unavailable'): Clue {
  return {
    tool,
    status: 'unavailable',
    verdict: 'No reading',
    detail: `Nansen did not return this view for this token (${code}). The clue cannot help you this wave, and it adds no pressure.`,
    pressure: 0,
    facts: [],
    provenance: { ...provenance },
  };
}

function emptyClue(tool: IntelToolId, verdict: string, detail: string, provenance: Provenance, pressure = 0): Clue {
  return { tool, status: 'empty', verdict, detail, pressure, facts: [], provenance: { ...provenance } };
}

// -------------------------------------------------------- Who Bought/Sold

export interface BuyersDerived {
  clue: Clue;
  /** Server-only: the largest net buyer, used for the Profiler follow-up. Never serialised. */
  profileTarget: string | null;
}

/** `tgm/who-bought-sold`, BUY side, 24h, ordered by bought USD. */
export function deriveBuyers(input: unknown, provenance: Provenance): BuyersDerived {
  const rows = rowsOf(input);
  if (rows.length === 0) {
    return {
      clue: emptyClue('buyers', 'Empty ledger', 'Nansen returned no buyers for this 24h window. Missing is not safe, but it is not a signal either.', provenance),
      profileTarget: null,
    };
  }
  let totalBought = 0;
  let kept = 0;
  let largest = 0;
  let smartNetBuyers = 0;
  let target: { address: string; net: number } | null = null;
  const archetypes: Archetype[] = [];
  for (const row of rows) {
    const bought = Math.max(0, num(row.bought_volume_usd) ?? 0);
    const sold = Math.max(0, num(row.sold_volume_usd) ?? 0);
    const net = bought - sold;
    const family = archetypeOf(row.address_label);
    archetypes.push(family);
    totalBought += bought;
    kept += Math.max(0, net);
    largest = Math.max(largest, bought);
    if (family === 'smart' && net > 0) smartNetBuyers += 1;
    const address = typeof row.address === 'string' ? row.address : null;
    if (address && net > 0 && family !== 'exchange' && family !== 'machine' && (!target || net > target.net)) target = { address, net };
  }
  if (totalBought <= 0) {
    return { clue: emptyClue('buyers', 'Empty ledger', 'The buyers returned carried no readable volume in this window.', provenance), profileTarget: null };
  }
  const retention = kept / totalBought;
  const top = largest / totalBought;
  const factors: Factor[] = [];
  if (retention < 0.2) factors.push({ verdict: 'Churn', sentence: `The top buyers kept only ${pct(retention)} of what they bought — the rest was sold back. Volume without conviction.`, delta: 2 });
  else if (retention >= 0.6) factors.push({ verdict: 'Conviction', sentence: `The top buyers kept ${pct(retention)} of what they bought.`, delta: -1 });
  if (top > 0.5) factors.push({ verdict: 'One big hand', sentence: `A single buyer accounts for ${pct(top)} of the top-buyer volume. One wallet can leave as fast as it came.`, delta: 1 });
  if (smartNetBuyers > 0) factors.push({ verdict: 'Navigators aboard', sentence: `${smartNetBuyers} Smart Money-labeled ${smartNetBuyers === 1 ? 'wallet is' : 'wallets are'} among the net buyers.`, delta: -2 });
  const facts: Fact[] = [
    { label: 'Top buyers read', value: String(rows.length) },
    { label: 'Kept after selling', value: pct(retention) },
    { label: 'Largest buyer share', value: pct(top) },
    { label: 'Smart Money net buyers', value: String(smartNetBuyers) },
    { label: 'Label mix', value: labelMix(archetypes) },
  ];
  return {
    clue: assemble('buyers', factors, { verdict: 'Mixed ledger', sentence: `Top buyers kept ${pct(retention)} of their purchases; no single hand or Smart Money cluster dominates.` }, facts, provenance, [-2, 3]),
    profileTarget: target?.address ?? null,
  };
}

// ------------------------------------------------------------- DEX Trades

/** `tgm/dex-trades`, last 1h, newest first, up to 100 rows. */
export function deriveTrades(input: unknown, provenance: Provenance, moreAvailable = false): Clue {
  const rows = rowsOf(input);
  if (rows.length === 0) {
    return assemble('trades', [{ verdict: 'Slack water', sentence: 'No DEX trades were recorded in the last hour. A thin tape means a single order can move the water.', delta: 1 }], { verdict: 'Slack water', sentence: '' }, [{ label: 'Trades read', value: '0' }, { label: 'Window', value: '1h' }], provenance, [-1, 3]);
  }
  let buyValue = 0;
  let sellValue = 0;
  let buys = 0;
  let labeled = 0;
  for (const row of rows) {
    const value = Math.max(0, num(row.estimated_value_usd) ?? 0);
    const action = typeof row.action === 'string' ? row.action.toUpperCase() : '';
    if (action === 'BUY') { buys += 1; buyValue += value; }
    else if (action === 'SELL') sellValue += value;
    if (typeof row.trader_address_label === 'string' && row.trader_address_label.trim()) labeled += 1;
  }
  const total = buyValue + sellValue;
  const buyShare = total > 0 ? buyValue / total : buys / rows.length;
  const sellShare = 1 - buyShare;
  const factors: Factor[] = [];
  if (rows.length < 5 && !moreAvailable) factors.push({ verdict: 'Thin tape', sentence: `Only ${rows.length} DEX ${rows.length === 1 ? 'trade' : 'trades'} in the last hour.`, delta: 1 });
  if (sellShare >= 0.6) factors.push({ verdict: 'Ebb tide', sentence: `Sells carried ${pct(sellShare)} of the last hour's DEX value.`, delta: 2 });
  else if (buyShare >= 0.6) factors.push({ verdict: 'Flood tide', sentence: `Buys carried ${pct(buyShare)} of the last hour's DEX value.`, delta: -1 });
  const facts: Fact[] = [
    { label: 'Trades read', value: moreAvailable ? `${rows.length}+` : String(rows.length) },
    { label: 'Buy share by value', value: pct(buyShare) },
    { label: 'Buy share by count', value: pct(buys / rows.length) },
    { label: 'Labeled traders', value: pct(labeled / rows.length) },
    { label: 'Window', value: '1h' },
  ];
  return assemble('trades', factors, { verdict: 'Balanced tape', sentence: `Buys and sells are close: ${pct(buyShare)} of recent DEX value was buying.` }, facts, provenance, [-1, 3]);
}

// ------------------------------------------------------- Token Transfers

/** `tgm/transfers`, 24h, 25 largest by USD value. */
export function deriveTransfers(input: unknown, provenance: Provenance): Clue {
  const rows = rowsOf(input);
  if (rows.length === 0) {
    return assemble('transfers', [], { verdict: 'Quiet docks', sentence: 'No large transfers were recorded in the last 24 hours.' }, [{ label: 'Largest transfers read', value: '0' }], provenance, [-1, 3]);
  }
  let deposits = 0;
  let withdrawals = 0;
  let insiderOut = 0;
  let machine = 0;
  for (const row of rows) {
    const from = archetypeOf(row.from_address_label);
    const to = archetypeOf(row.to_address_label);
    if (to === 'exchange' && from !== 'exchange') deposits += 1;
    if (from === 'exchange' && to !== 'exchange') withdrawals += 1;
    if (from === 'insider') insiderOut += 1;
    if (from === 'machine' || to === 'machine') machine += 1;
  }
  const factors: Factor[] = [];
  if (deposits - withdrawals >= 2) factors.push({ verdict: 'Loading the gates', sentence: `${deposits} of the ${rows.length} largest transfers went into exchange-labeled wallets (${withdrawals} came out).`, delta: 2 });
  else if (withdrawals - deposits >= 2) factors.push({ verdict: 'Cargo leaving port', sentence: `${withdrawals} of the largest transfers left exchange wallets (${deposits} went in) — usually a move to self-custody.`, delta: -1 });
  if (insiderOut >= 2) factors.push({ verdict: 'Deployer cargo', sentence: `Deployer/team-labeled wallets sent ${insiderOut} of the largest transfers.`, delta: 1 });
  const facts: Fact[] = [
    { label: 'Largest transfers read', value: String(rows.length) },
    { label: 'Into exchanges', value: String(deposits) },
    { label: 'Out of exchanges', value: String(withdrawals) },
    { label: 'From deployer/team', value: String(insiderOut) },
    { label: 'Touching pools/contracts', value: String(machine) },
  ];
  const fallback = machine > rows.length / 2
    ? { verdict: 'Machine shuffles', sentence: 'Most large transfers touch pools or contracts — plumbing, not a directional signal.' }
    : { verdict: 'Quiet docks', sentence: 'No exchange or deployer pattern stands out among the largest transfers.' };
  return assemble('transfers', factors, fallback, facts, provenance, [-1, 3]);
}

// --------------------------------------------- Flows (Smart Money holdings)

/** `tgm/flows`, label smart_money, 7d hourly buckets. */
export function deriveTrend(input: unknown, provenance: Provenance): Clue {
  const rows = rowsOf(input)
    .filter((row) => num(row.token_amount) !== null && typeof row.date === 'string')
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (rows.length < 2) {
    return emptyClue('trend', 'No Smart Money berth', 'Nansen shows no Smart Money holdings series for this token over 7 days. Absence of Smart Money is information about coverage, not about safety.', provenance);
  }
  const first = num(rows[0].token_amount) ?? 0;
  const last = num(rows[rows.length - 1].token_amount) ?? 0;
  if (first <= 0 && last <= 0) {
    return emptyClue('trend', 'No Smart Money berth', 'Smart Money held none of this token across the week.', provenance);
  }
  const change = first > 0 ? (last - first) / first : 1;
  const holdersFirst = num(rows[0].holders_count);
  const holdersLast = num(rows[rows.length - 1].holders_count);
  const factors: Factor[] = [];
  let direction: Direction = 'flat';
  if (change <= -0.05) { direction = 'out'; factors.push({ verdict: 'Distributing', sentence: `Smart Money holdings fell ${pct(Math.abs(change))} over 7 days.`, delta: 2 }); }
  else if (change >= 0.05) { direction = 'in'; factors.push({ verdict: 'Accumulating', sentence: `Smart Money holdings grew ${first > 0 ? pct(change) : 'from zero'} over 7 days.`, delta: -1 }); }
  const facts: Fact[] = [
    { label: 'SM holdings, 7d', value: first > 0 ? signedPct(change) : 'new position' },
    { label: 'SM holders', value: `${holdersFirst ?? '?'} → ${holdersLast ?? '?'}` },
    { label: 'Snapshots', value: String(rows.length) },
  ];
  return assemble('trend', factors, { verdict: 'Holding steady', sentence: `Smart Money holdings moved ${signedPct(change)} over the week — no clear build or trim.` }, facts, provenance, [-1, 2], direction);
}

// ------------------------------------------------------ Profiler summary

/** `profiler/address/pnl-summary` for the largest net buyer, 30d. */
export function deriveProfile(summary: unknown, provenance: Provenance): Clue {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return unavailableClue('profiler', provenance, 'malformed');
  const s = summary as Record<string, unknown>;
  const times = num(s.traded_times) ?? 0;
  const tokens = num(s.traded_token_count) ?? 0;
  const pnl = num(s.realized_pnl_usd);
  const raw = num(s.win_rate);
  const rate = raw === null ? null : raw <= 1 ? raw : times > 0 ? clamp(raw / times, 0, 1) : null;
  const facts: Fact[] = [
    { label: 'Realized trades, 30d', value: String(Math.round(times)) },
    { label: 'Tokens traded', value: String(Math.round(tokens)) },
    { label: 'Win rate', value: rate === null || times === 0 ? '?' : pct(rate) },
    { label: 'Realized PnL', value: pnl === null ? '?' : pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : 'flat' },
  ];
  if (times === 0 && tokens === 0) {
    return assemble('profiler', [{ verdict: 'No track record', sentence: 'The largest net buyer has no realized trades on this chain in 30 days. Profiler cannot vouch for a fresh or passive hand.', delta: 1 }], { verdict: '', sentence: '' }, facts, provenance, [-1, 1]);
  }
  const factors: Factor[] = [];
  if (pnl !== null && pnl > 0 && (rate === null || rate >= 0.5)) factors.push({ verdict: 'Seasoned hand', sentence: `The largest net buyer closed ${Math.round(times)} trades in 30 days with positive realized PnL${rate !== null ? ` and a ${pct(rate)} win rate` : ''}.`, delta: -1 });
  else if (pnl !== null && pnl < 0) factors.push({ verdict: 'Struggling hand', sentence: 'The largest net buyer is net negative on realized trades over 30 days.', delta: 1 });
  return assemble('profiler', factors, { verdict: 'Mixed record', sentence: 'The largest net buyer has a mixed 30-day record — neither a clear winner nor a clear loser.' }, facts, provenance, [-1, 1]);
}

export function noTargetProfile(provenance: Provenance): Clue {
  return emptyClue('profiler', 'Nobody to profile', 'No net buyer stood out in the Buyers & Sellers ledger, so there is no wallet worth profiling.', provenance);
}

// ---------------------------------------------------------- Perp Screener

export interface PerpDerived {
  weather: Weather;
  /** Smart Money long share per perp symbol (upper-case). Server-side and derived only. */
  shadows: Record<string, number>;
}

/** `perp-screener`, trader_type sm, 24h, ordered by Smart Money volume. */
export function deriveWeather(input: unknown, provenance: Provenance): PerpDerived {
  const rows = rowsOf(input);
  if (rows.length === 0) {
    return { weather: calmWeather(provenance, 'The Perp Screener returned no Smart Money markets for 24h. The storm glass is fogged, so it adds no pressure.'), shadows: {} };
  }
  let longs = 0;
  let shorts = 0;
  let net = 0;
  let volume = 0;
  const funding: number[] = [];
  const shadows: Record<string, number> = {};
  for (const row of rows) {
    const l = Math.max(0, num(row.current_smart_money_position_longs_usd) ?? 0);
    const s = Math.abs(num(row.current_smart_money_position_shorts_usd) ?? 0);
    longs += l;
    shorts += s;
    net += num(row.net_position_change) ?? 0;
    volume += Math.max(0, num(row.smart_money_volume) ?? 0);
    const f = num(row.funding);
    if (f !== null) funding.push(f);
    const symbol = typeof row.token_symbol === 'string' ? row.token_symbol.toUpperCase() : null;
    if (symbol && l + s > 0) shadows[symbol] = l / (l + s);
  }
  funding.sort((a, b) => a - b);
  const medianFunding = funding.length ? funding[Math.floor(funding.length / 2)] : null;
  const longShare = longs + shorts > 0 ? longs / (longs + shorts) : null;
  const netRatio = volume > 0 ? net / volume : 0;
  let name = 'Crosswind';
  let pressure = 0;
  let detail = `Smart Money perp flow is mixed across the top Hyperliquid markets (${signedPct(netRatio)} of its 24h volume, net). No market-wide push either way.`;
  if (netRatio <= -0.08) { name = 'Squall'; pressure = 2; detail = `Smart Money sold ${pct(Math.abs(netRatio))} more perp notional than it bought across the top Hyperliquid markets in 24h. Every reach feels it.`; }
  else if (netRatio < -0.02) { name = 'Headwind'; pressure = 1; detail = `Smart Money was a net seller of perps over 24h (${signedPct(netRatio)} of its volume). A mild headwind on every reach.`; }
  else if (netRatio >= 0.05 && (longShare ?? 0) >= 0.6) { name = 'Fair wind'; pressure = -1; detail = `Smart Money net bought perps over 24h (${signedPct(netRatio)}) and holds mostly longs. A tailwind on every reach.`; }
  const facts: Fact[] = [
    { label: 'Perp markets read', value: String(rows.length) },
    { label: 'SM long share', value: longShare === null ? '?' : pct(longShare) },
    { label: 'SM net flow, 24h', value: signedPct(netRatio) + ' of volume' },
    { label: 'Median funding', value: medianFunding === null ? '?' : `${(medianFunding * 100).toFixed(4)}%` },
  ];
  return { weather: { status: 'ok', name, detail, pressure, facts, provenance: { ...provenance } }, shadows };
}

export function calmWeather(provenance: Provenance, detail = 'No perp reading is attached to this wave.'): Weather {
  return { status: 'unavailable', name: 'Glass fogged', detail, pressure: 0, facts: [], provenance: { ...provenance } };
}

/** Candidate perp symbols for a spot token (WETH → ETH, cbBTC → BTC …). */
function perpSymbols(symbol: string): string[] {
  const upper = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const list = [upper];
  if (upper.startsWith('W') && upper.length > 2) list.push(upper.slice(1));
  if (upper.startsWith('CB') && upper.length > 3) list.push(upper.slice(2));
  return list;
}

export function perpShadowFor(symbol: string, shadows: Record<string, number>): PerpShadow {
  const key = perpSymbols(symbol).find((candidate) => shadows[candidate] !== undefined);
  if (!key) return { listed: false, bias: null, pressure: 0, detail: 'No Smart Money perp market for this token in the Hyperliquid screener.' };
  const share = shadows[key];
  if (share >= 0.65) return { listed: true, bias: 'long', pressure: -1, detail: `Smart Money is ${pct(share)} long on the ${key} perp.` };
  if (share <= 0.35) return { listed: true, bias: 'short', pressure: 1, detail: `Smart Money is ${pct(1 - share)} short on the ${key} perp.` };
  return { listed: true, bias: 'balanced', pressure: 0, detail: `Smart Money is balanced on the ${key} perp (${pct(share)} long).` };
}

export const NO_PERP: PerpShadow = { listed: false, bias: null, pressure: 0, detail: 'No perp reading.' };

// ------------------------------------------------------------ rehearsal

/** Authored GAME fixtures for the rehearsal. Not claimed to be Nansen responses. */
function fixtureProvenance(endpoint: string, timeframe: string): Provenance {
  return { endpoint: 'fictional-game-fixture', fetchedAt: '', timeframe: `${timeframe} · ${endpoint}`, requestId: null, cached: false };
}

function fixtureClue(tool: IntelToolId, verdict: string, detail: string, pressure: number, facts: [string, string][], timeframe: string, direction?: Direction): Clue {
  const clue: Clue = { tool, status: 'ok', verdict, detail, pressure, facts: facts.map(([label, value]) => ({ label, value })), provenance: fixtureProvenance(tool, timeframe) };
  if (direction) clue.direction = direction;
  return clue;
}

/** One intel set per authored current: 0 = the false calm, 1 = open current, 2 = undertow. */
export function demoIntel(index: number): Partial<Record<IntelToolId, Clue>> {
  if (index === 0) return {
    buyers: fixtureClue('buyers', 'One big hand', 'A single whale-class buyer accounts for 71% of the top-buyer volume. One wallet can leave as fast as it came.', 1, [['Top buyers read', '25'], ['Kept after selling', '44%'], ['Largest buyer share', '71%'], ['Smart Money net buyers', '0'], ['Label mix', 'whale-class 9 · unlabeled 8 · high-activity 5']], '24h'),
    trades: fixtureClue('trades', 'Ebb tide', "Sells carried 68% of the last hour's DEX value.", 2, [['Trades read', '100+'], ['Buy share by value', '32%'], ['Buy share by count', '47%'], ['Labeled traders', '58%'], ['Window', '1h']], '1h'),
    transfers: fixtureClue('transfers', 'Loading the gates', '4 of the 25 largest transfers went into exchange-labeled wallets (0 came out).', 2, [['Largest transfers read', '25'], ['Into exchanges', '4'], ['Out of exchanges', '0'], ['From deployer/team', '0'], ['Touching pools/contracts', '6']], '24h'),
    trend: fixtureClue('trend', 'Distributing', 'Smart Money holdings fell 18% over 7 days.', 2, [['SM holdings, 7d', '−18%'], ['SM holders', '41 → 33'], ['Snapshots', '168']], '7d', 'out'),
    profiler: fixtureClue('profiler', 'Struggling hand', 'The largest net buyer is net negative on realized trades over 30 days.', 1, [['Realized trades, 30d', '37'], ['Tokens traded', '12'], ['Win rate', '38%'], ['Realized PnL', 'negative']], '30d'),
  };
  if (index === 1) return {
    buyers: fixtureClue('buyers', 'Navigators aboard', 'The top buyers kept 66% of what they bought. 2 Smart Money-labeled wallets are among the net buyers.', -2, [['Top buyers read', '25'], ['Kept after selling', '66%'], ['Largest buyer share', '18%'], ['Smart Money net buyers', '2'], ['Label mix', 'unlabeled 10 · smart money 4 · whale-class 4']], '24h'),
    trades: fixtureClue('trades', 'Flood tide', "Buys carried 67% of the last hour's DEX value.", -1, [['Trades read', '64'], ['Buy share by value', '67%'], ['Buy share by count', '59%'], ['Labeled traders', '41%'], ['Window', '1h']], '1h'),
    transfers: fixtureClue('transfers', 'Cargo leaving port', '3 of the largest transfers left exchange wallets (0 went in) — usually a move to self-custody.', -1, [['Largest transfers read', '25'], ['Into exchanges', '0'], ['Out of exchanges', '3'], ['From deployer/team', '0'], ['Touching pools/contracts', '4']], '24h'),
    trend: fixtureClue('trend', 'Accumulating', 'Smart Money holdings grew 12% over 7 days.', -1, [['SM holdings, 7d', '+12%'], ['SM holders', '22 → 27'], ['Snapshots', '168']], '7d', 'in'),
    profiler: fixtureClue('profiler', 'Seasoned hand', 'The largest net buyer closed 58 trades in 30 days with positive realized PnL and a 64% win rate.', -1, [['Realized trades, 30d', '58'], ['Tokens traded', '19'], ['Win rate', '64%'], ['Realized PnL', 'positive']], '30d'),
  };
  return {
    buyers: fixtureClue('buyers', 'Churn', 'The top buyers kept only 9% of what they bought — the rest was sold back. Volume without conviction.', 2, [['Top buyers read', '25'], ['Kept after selling', '9%'], ['Largest buyer share', '27%'], ['Smart Money net buyers', '0'], ['Label mix', 'high-activity 11 · pools & bots 6 · unlabeled 5']], '24h'),
    trades: fixtureClue('trades', 'Ebb tide', "Sells carried 61% of the last hour's DEX value.", 2, [['Trades read', '100+'], ['Buy share by value', '39%'], ['Buy share by count', '51%'], ['Labeled traders', '63%'], ['Window', '1h']], '1h'),
    transfers: fixtureClue('transfers', 'Loading the gates', '5 of the 25 largest transfers went into exchange-labeled wallets (1 came out). Deployer/team-labeled wallets sent 2 of the largest transfers.', 3, [['Largest transfers read', '25'], ['Into exchanges', '5'], ['Out of exchanges', '1'], ['From deployer/team', '2'], ['Touching pools/contracts', '7']], '24h'),
    trend: fixtureClue('trend', 'No Smart Money berth', 'Nansen shows no Smart Money holdings series for this token over 7 days. Absence of Smart Money is information about coverage, not about safety.', 0, [], '7d'),
    profiler: fixtureClue('profiler', 'No track record', 'The largest net buyer has no realized trades on this chain in 30 days. Profiler cannot vouch for a fresh or passive hand.', 1, [['Realized trades, 30d', '0'], ['Tokens traded', '0'], ['Win rate', '?'], ['Realized PnL', 'flat']], '30d'),
  };
}

export function demoWeather(wave: number): Weather {
  const provenance = fixtureProvenance('perp-screener', '24h');
  const w = ((Math.max(1, wave) - 1) % 3);
  if (w === 0) return { status: 'ok', name: 'Crosswind', detail: 'Smart Money perp flow is mixed across the top Hyperliquid markets. No market-wide push either way.', pressure: 0, facts: [{ label: 'Perp markets read', value: '40' }, { label: 'SM long share', value: '58%' }, { label: 'SM net flow, 24h', value: '+1% of volume' }, { label: 'Median funding', value: '0.0013%' }], provenance };
  if (w === 1) return { status: 'ok', name: 'Fair wind', detail: 'Smart Money net bought perps over 24h and holds mostly longs. A tailwind on every reach.', pressure: -1, facts: [{ label: 'Perp markets read', value: '40' }, { label: 'SM long share', value: '71%' }, { label: 'SM net flow, 24h', value: '+9% of volume' }, { label: 'Median funding', value: '0.0021%' }], provenance };
  return { status: 'ok', name: 'Headwind', detail: 'Smart Money was a net seller of perps over 24h. A mild headwind on every reach.', pressure: 1, facts: [{ label: 'Perp markets read', value: '40' }, { label: 'SM long share', value: '52%' }, { label: 'SM net flow, 24h', value: '−5% of volume' }, { label: 'Median funding', value: '0.0009%' }], provenance };
}

export function demoPerp(index: number): PerpShadow {
  if (index === 0) return { listed: true, bias: 'short', pressure: 1, detail: 'Smart Money is 68% short on this perp (fictional).' };
  if (index === 1) return { listed: true, bias: 'long', pressure: -1, detail: 'Smart Money is 74% long on this perp (fictional).' };
  return { listed: false, bias: null, pressure: 0, detail: 'No Smart Money perp market for this token (fictional).' };
}
