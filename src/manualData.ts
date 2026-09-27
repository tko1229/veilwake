/**
 * The Field Manual: every Nansen platform feature, and how VEILWAKE uses it.
 *
 * `live`     — the feature's API powers a mechanic with real data.
 * `mechanic` — the feature's workflow is modelled in play (no extra API call).
 * `lesson`   — explained, with the reason it is not part of the game loop.
 */
export type ManualStatus = 'live' | 'mechanic' | 'lesson';
export type PracticeKey = 'screener' | 'flow' | 'buyers' | 'trades' | 'transfers' | 'trend' | 'profiler' | 'weather' | 'alert' | 'call' | 'logbook' | 'ai';

export interface ManualEntry {
  id: string;
  feature: string;
  status: ManualStatus;
  inGame: string;
  what: string;
  howTo: string[];
  link: string;
  linkLabel: string;
  practice?: PracticeKey;
  why?: string;
}

const APP = 'https://app.nansen.ai';

export const FIELD_MANUAL: ManualEntry[] = [
  {
    id: 'token-screener', feature: 'Token Screener', status: 'live',
    inGame: 'Harbor chart — picks the nine tokens of every live voyage and shows each reach’s price, 24h move, volume, liquidity and market-cap bands. Shallow liquidity adds pressure.',
    what: 'Filters and ranks tokens across chains by volume, netflow, liquidity, age and Smart Money activity.',
    howTo: ['Open Tokens in the Nansen sidebar.', 'Pick chains and a timeframe (5m → 30d).', 'Sort by volume or netflow; toggle Smart Money to see what labeled traders touch.'],
    link: `${APP}/tokens`, linkLabel: 'Open the Token Screener', practice: 'screener',
  },
  {
    id: 'flow-intelligence', feature: 'Token God Mode · Flow Intelligence', status: 'live',
    inGame: 'Current lens — the scout. Splits a token’s net flow into Smart Traders, Top PnL, Whales, Exchanges, Fresh Wallets and Public Figures across 1d, 1h and 5m windows.',
    what: 'Net inflow/outflow per labeled cohort for any token and timeframe.',
    howTo: ['Search a token and open it in Token God Mode.', 'Read the Flow Intelligence panel cohort by cohort.', 'Switch timeframes: a 1h trend and a 5m blip can disagree.'],
    link: `${APP}/token-god-mode`, linkLabel: 'Open Token God Mode', practice: 'flow',
  },
  {
    id: 'who-bought-sold', feature: 'Token God Mode · Who Bought/Sold', status: 'live',
    inGame: 'Dock ledger — reads the top 25 buyers of the last 24h: how much they kept after selling, how concentrated buying is, and whether Smart Money is among net buyers.',
    what: 'Ranks the addresses that bought or sold a token in a window, with labels and volumes.',
    howTo: ['In Token God Mode, open Buyers & Sellers.', 'Compare bought vs sold for each top buyer — round-trippers are churn.', 'Click a wallet to jump into its Profiler.'],
    link: `${APP}/token-god-mode`, linkLabel: 'Open Buyers & Sellers', practice: 'buyers',
  },
  {
    id: 'dex-trades', feature: 'Token God Mode · DEX Trades', status: 'live',
    inGame: 'Tide log — the last hour of swaps: buy vs sell share by value and count, tape thickness, share of labeled traders.',
    what: 'Every DEX swap of a token with trader labels, amounts and prices.',
    howTo: ['In Token God Mode, open Trades.', 'Filter to the last hour; watch whether sells or buys carry the value.', 'Filter by label to see only Smart Money trades.'],
    link: `${APP}/token-god-mode`, linkLabel: 'Open Trades', practice: 'trades',
  },
  {
    id: 'transfers', feature: 'Token God Mode · Token Transfers', status: 'live',
    inGame: 'Cargo manifest — the 25 largest transfers of 24h: deposits into exchanges, withdrawals out of them, deployer/team moves, pool plumbing.',
    what: 'The largest token transfers with from/to labels.',
    howTo: ['In Token God Mode, open Transfers.', 'Sort by USD value.', 'Look for labeled exchange wallets on the receiving side, and for deployer wallets sending.'],
    link: `${APP}/token-god-mode`, linkLabel: 'Open Transfers', practice: 'transfers',
  },
  {
    id: 'flows', feature: 'Token God Mode · Flows (Smart Money)', status: 'live',
    inGame: 'Depth sounding — seven days of hourly Smart Money holdings: accumulating, distributing or steady. Combines with the live trader flow into “long ebb” or “squall in a flood”.',
    what: 'Holdings, inflows and outflows over time for Smart Money, whales, exchanges, public figures or top holders.',
    howTo: ['In Token God Mode, open Flows.', 'Select the Smart Money segment and a 7D range.', 'Compare the weekly slope with today’s Flow Intelligence.'],
    link: `${APP}/token-god-mode`, linkLabel: 'Open Flows', practice: 'trend',
  },
  {
    id: 'profiler', feature: 'Profiler', status: 'live',
    inGame: 'Captain’s log — profiles the largest net buyer from the ledger: 30-day realized trades, win rate and PnL sign. The address never reaches your browser.',
    what: 'Everything about one wallet or entity: balances, PnL, trades, counterparties, related wallets.',
    howTo: ['From Buyers & Sellers, click the wallet you care about (or paste it into Profiler).', 'Open PnL & trade performance.', 'Ask: is this a seasoned trader, a fresh wallet, or a losing hand?'],
    link: `${APP}/profiler`, linkLabel: 'Open Profiler', practice: 'profiler',
  },
  {
    id: 'perp-screener', feature: 'Hyperliquid · Perp Screener', status: 'live',
    inGame: 'Storm glass — Smart Money perp positioning across the top Hyperliquid markets sets each wave’s weather; a reach whose token has a perp also gets a “perp shadow”.',
    what: 'Screens Hyperliquid perps by volume, funding, open interest and Smart Money long/short positioning.',
    howTo: ['Open Tokens and switch to Hyperliquid / Perps.', 'Toggle Smart Money.', 'Read net position change and long/short counts before judging a spot token.'],
    link: `${APP}/tokens?chains=hyperliquid`, linkLabel: 'Open Hyperliquid perps', practice: 'weather',
  },
  {
    id: 'smart-money', feature: 'Smart Money', status: 'mechanic',
    inGame: 'The Navigators cohort, Smart Money net buyers in the ledger, the weekly Smart Money holdings trend and Smart Money perp positioning all come from Nansen’s Smart Money classification.',
    what: 'Dashboards of what funds and consistently profitable traders buy, sell and hold.',
    howTo: ['Open Smart Money in the sidebar.', 'Check Top Tokens and Trades by timeframe.', 'Remember: a cohort is evidence, not a recommendation.'],
    link: `${APP}/smart-money`, linkLabel: 'Open Smart Money', practice: 'trend',
  },
  {
    id: 'labels', feature: 'Labels (500M+ addresses)', status: 'mechanic',
    inGame: 'Every cohort and every archetype (smart money, whale-class, exchange, deployer/team, pools & bots) is built on Nansen labels. Raw labels stay on the server; you see only families.',
    what: 'Nansen’s entity and behavioural labels on addresses — the foundation of every other view.',
    howTo: ['Hover any address in Nansen to see its labels.', 'Use label filters in Trades, Transfers and Buyers & Sellers.', 'Treat labels as probabilistic, not verdicts.'],
    link: 'https://www.nansen.ai', linkLabel: 'About Nansen labels', practice: 'buyers',
  },
  {
    id: 'smart-alerts', feature: 'Smart Alerts', status: 'mechanic',
    inGame: 'Tripwire — set one Smart Alert per wave (Smart traders exit, whales exit, exchange inflow spike). If it fires in the 5m read, a harvesting gate braces itself in time, free.',
    what: 'Rule-based notifications (Telegram, Slack, Discord, webhook) when wallets, tokens or Smart Money flows cross a threshold.',
    howTo: ['Open Smart Alerts.', 'Choose a type — e.g. Smart Money token flows — and a threshold.', 'Pick a delivery channel. Alert where you are exposed, not everywhere.'],
    link: `${APP}/smart-alerts`, linkLabel: 'Open Smart Alerts', practice: 'alert',
  },
  {
    id: 'timeframes', feature: 'Timeframe comparison', status: 'mechanic',
    inGame: 'The call — predict whether Smart Traders keep their 1h direction in the next 5m read. Scored against the real 5m response; “Pass” is always allowed.',
    what: 'Every Nansen flow view has a timeframe switch; reading them against each other is a core analyst habit.',
    howTo: ['In Flow Intelligence, read 1D, then 1H, then 5M.', 'Ask whether the short window confirms or contradicts the longer one.', 'Do not force a view when they disagree.'],
    link: `${APP}/token-god-mode`, linkLabel: 'Open Flow Intelligence', practice: 'call',
  },
  {
    id: 'watchlists', feature: 'Watchlists', status: 'mechanic',
    inGame: 'Logbook — every reach you sailed is listed on the end screen with an “Open on Nansen” link to its real Token God Mode page, ready to add to a watchlist.',
    what: 'Saved wallets, tokens and entities you want to follow.',
    howTo: ['Open a token or wallet page.', 'Use the star / watchlist button.', 'Review your watchlist in the sidebar.'],
    link: `${APP}/watchlists`, linkLabel: 'Open Watchlists', practice: 'logbook',
  },
  {
    id: 'nansen-ai', feature: 'Nansen AI & Deep Research', status: 'mechanic',
    inGame: 'Every logbook entry has a ready-made research prompt built from what you observed. Paste it into Nansen AI to continue the investigation.',
    what: 'A conversational agent over Nansen’s labeled data, plus long-form Deep Research reports.',
    howTo: ['Open Nansen and use the AI search / chat.', 'Paste a specific question about cohorts, timeframes and wallets.', 'Verify its claims in Token God Mode.'],
    link: APP, linkLabel: 'Open Nansen AI', practice: 'ai',
  },
  {
    id: 'holders', feature: 'Token God Mode · Holders', status: 'lesson',
    inGame: 'Not a mechanic. Concentration is taught through the ledger (“one big hand”) instead.',
    what: 'Top holders with labels and balance changes; shows how concentrated a token is.',
    howTo: ['In Token God Mode, open Holders.', 'Check the share held by the top 10 and by exchanges.', 'Watch balance changes of the largest holders.'],
    link: `${APP}/token-god-mode`, linkLabel: 'Open Holders',
    why: 'The Smart Money filter on Holders is “Restricted” in Nansen’s redistribution guide and costs 5 credits; VEILWAKE stays on freely redistributable one-credit views.',
  },
  {
    id: 'indicators', feature: 'Nansen Indicators (risk & reward scores)', status: 'lesson',
    inGame: 'Not a mechanic. VEILWAKE never shows a score that looks like a verdict on a token.',
    what: 'Daily risk and reward indicators, visible on the Token God Mode overview (e.g. risk and sniper scores).',
    howTo: ['Open a token in Token God Mode.', 'Read the risk indicators next to market cap and holders.', 'Use them as a checklist prompt, not a buy/sell signal.'],
    link: `${APP}/token-god-mode`, linkLabel: 'Open a token overview',
    why: 'Indicators are not listed as redistributable and would read like investment advice inside a game.',
  },
  {
    id: 'pnl-leaderboard', feature: 'PnL Leaderboards', status: 'lesson',
    inGame: 'Not a mechanic. The Top PnL cohort in Flow Intelligence carries the idea without naming wallets.',
    what: 'Wallets ranked by realized and unrealized PnL on a token or on Hyperliquid.',
    howTo: ['In Token God Mode, open PnL Leaderboard.', 'Look at who is up — and whether they are still holding.', 'Profile the top names before drawing conclusions.'],
    link: `${APP}/token-god-mode`, linkLabel: 'Open PnL Leaderboard',
    why: 'PnL leaderboards are “Prohibited” for redistribution; they must stay inside Nansen.',
  },
  {
    id: 'portfolio', feature: 'Portfolio', status: 'lesson',
    inGame: 'Not a mechanic — VEILWAKE never asks for a wallet.',
    what: 'Tracks your own wallets and DeFi positions across chains.',
    howTo: ['Open Portfolio.', 'Add the addresses you own or follow.', 'Review DeFi positions and PnL in one place.'],
    link: `${APP}/portfolio`, linkLabel: 'Open Portfolio',
    why: 'No wallet connection is a design rule of this game.',
  },
  {
    id: 'points', feature: 'Points & Staking', status: 'lesson',
    inGame: 'Not a mechanic. Progress here is skills practiced and local records — no tokens, no points economy.',
    what: 'Nansen’s loyalty programme and staking products.',
    howTo: ['Open Points to see your tier and how points are earned.', 'Open Stake for supported assets.'],
    link: `${APP}/points`, linkLabel: 'Open Points',
    why: 'A game that teaches analysis should not dangle rewards for activity.',
  },
  {
    id: 'trading', feature: 'Trading (spot & Hyperliquid perps)', status: 'lesson',
    inGame: 'Deliberately excluded. The game ends at the decision; it never executes one.',
    what: 'In-app swaps and Hyperliquid perp trading next to the intelligence.',
    howTo: ['Only after research: open a token and use Trade.', 'Size positions you can afford to lose.'],
    link: APP, linkLabel: 'Open Nansen',
    why: 'No execution, no wagers — VEILWAKE is a training ground, not a trading venue.',
  },
  {
    id: 'prediction-markets', feature: 'Prediction Markets', status: 'lesson',
    inGame: 'Deliberately excluded.',
    what: 'Polymarket markets, order books, top holders and trader PnL.',
    howTo: ['Use Nansen’s prediction-market views to study who is positioned on an event.'],
    link: 'https://docs.nansen.ai/api/prediction-market', linkLabel: 'Prediction market docs',
    why: 'Wagering conflicts with the no-bet rule of the game.',
  },
  {
    id: 'chains', feature: 'Chains, Hot Contracts & AI Signals', status: 'lesson',
    inGame: 'Context only. Each live voyage mixes Ethereum, Base and Solana tokens so you see several chains in one run.',
    what: 'Chain-level activity dashboards, trending contracts and AI-surfaced signals.',
    howTo: ['Open Chains to compare activity across networks.', 'Scan Hot Contracts for new attention.', 'Treat signals as leads to investigate in Token God Mode.'],
    link: APP, linkLabel: 'Open Nansen',
    why: 'Useful discovery tools, but the game already discovers tokens through the Token Screener.',
  },
];

export const PRACTICE_KEYS: PracticeKey[] = ['screener', 'flow', 'buyers', 'trades', 'transfers', 'trend', 'profiler', 'weather', 'alert', 'call', 'logbook', 'ai'];

export const PRACTICE_NAMES: Record<PracticeKey, string> = {
  screener: 'Token Screener',
  flow: 'Flow Intelligence',
  buyers: 'Who Bought/Sold',
  trades: 'DEX Trades',
  transfers: 'Token Transfers',
  trend: 'Smart Money Flows',
  profiler: 'Profiler',
  weather: 'Perp Screener',
  alert: 'Smart Alerts',
  call: 'Timeframe call',
  logbook: 'Open on Nansen',
  ai: 'Nansen AI prompt',
};
