# VEILWAKE

**Read the current. Keep the lights on.**

A fog-of-war strategy game that turns Nansen's Token God Mode workflow into the water threatening a fragile settlement. Eight Nansen API views (screener, cohort flows, buyers, trades, transfers, Smart Money holdings, a wallet profile and Hyperliquid perp positioning) become the pressure you must read before you commit. No wallet connection, wagers, tokens to buy, or trading execution.

**Learn to investigate before you invest.** VEILWAKE is guided practice in a Nansen research workflow: it teaches *which questions to ask and which Nansen views answer them*, not which token to buy. The [player value and hackathon pitch](#player-value--hackathon-pitch) below is the full argument.

## Table of contents

- [Setup](#setup)
- [Environment variables](#environment-variables)
- [Running locally](#running-locally)
- [Troubleshooting](#troubleshooting)
- [Demo video](#demo-video)
- [Player value & hackathon pitch](#player-value--hackathon-pitch)
- [What is it?](#what-is-it)
- [Why it exists](#why-it-exists)
- [Why Nansen is essential](#why-nansen-is-essential)
- [How the game works](#how-the-game-works)
- [How Nansen data drives gameplay](#how-nansen-data-drives-gameplay)
- [Learn the platform](#learn-the-platform)
- [Architecture](#architecture)
- [Nansen endpoints used](#nansen-endpoints-used)
- [Tutorial (guided rehearsal)](#tutorial-guided-rehearsal)
- [API usage](#api-usage)
- [Technical decisions](#technical-decisions)
- [Limitations](#limitations)
- [Future ideas](#future-ideas)
- [Documentation, license & hackathon links](#documentation-license--hackathon-links)

## Setup

Requirements: Node **22.13+** and npm. No extra service, database, login or cloud account is needed.

There are two ways to run it, and the difference matters:

- **No-key tutorial (rehearsal).** Just install and start the app. The three-chapter guided rehearsal runs entirely on authored, explicitly fictional data, needs no Nansen key and spends no credits. This is the fastest way to see the game.
- **Server-key live voyage.** For live Nansen data, copy `.env.example` to `.env` and set `NANSEN_API_KEY` to your own key. The key is read server-side only and never reaches the browser.

After the repository is published, clone it (or use **Code → Download ZIP**, extract it and open a terminal in the extracted folder):

```bash
git clone https://github.com/tko1229/veilwake.git
cd veilwake
```

Install dependencies, then start the no-key tutorial:

```bash
npm ci --include=dev
npm run dev
# Open http://127.0.0.1:4173 and choose "Start the tutorial".
```

`--include=dev` ensures TypeScript and Vite are installed even if your shell defaults to production-only dependencies; both are needed to build the application.

**Quick path:** install → start → tutorial. The live mode is optional and requires your own server-side Nansen key and available API credits.

Run these commands from the repository root after cloning it or extracting GitHub's source ZIP. For live mode, create your local `.env` only if it is missing (Windows PowerShell):

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

On macOS/Linux:

```bash
[ -f .env ] || cp .env.example .env
```

**Do not overwrite an existing `.env`.** Edit your key into it instead of re-copying. The no-key tutorial does not require this step.

For a local run, leave `ADMIN_TOKEN` blank (or remove that example line) if you want localhost Engine room access without a token. Never paste the key into browser code.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `NANSEN_API_KEY` | none | Live data, server only; the tutorial (rehearsal) works without it |
| `HOST` | `127.0.0.1` | Bind address; keep loopback for local use |
| `PORT` | `4173` | One HTTP port |
| `ADMIN_TOKEN` | none | Required for non-loopback binding; protects telemetry |
| `TRUSTED_ORIGIN` | none | Exact externally visible HTTPS origin behind a reverse proxy |
| `TRUST_PROXY` | off | Behind a reverse proxy: `true`, a hop count or an Express list (e.g. `loopback`). Makes rate limits and the per-player live cap (4 voyages) use the real client address, and turns off the token-free loopback telemetry bypass |
| `MAX_API_CALLS_PER_HOUR` | `600` | Hard application upstream-attempt budget |
| `MAX_API_CALLS_PER_DAY` | `4000` | Hard rolling daily budget |
| `CACHE_TTL_SECONDS` | `600` | Derived memory cache; capped at 600 seconds |

## Running locally

```bash
npm run dev
# Open http://127.0.0.1:4173
```

Production build:

```bash
npm run build
npm start
```

Mock tests and checks (consume **zero Nansen credits**):

```bash
npm test        # mocked upstream
npm run typecheck
npm run balance # offline rehearsal balance table, zero credits
```

> **⚠️ Paid commands.** The following hit the live Nansen API, spend real credits and require `NANSEN_API_KEY` in `.env`:

```bash
npm run smoke                 # wave 1 only: every toolkit view on one reach, resolve, Open-on-Nansen redirect (~30 credits)
npm run voyage                # full 3-wave live voyage through the HTTP API with a leak audit (~70 credits)
npm run voyage -- 3 keeper    # several voyages with a chosen doctrine
```

`live-voyage` plays like a careful player (scout first, then toolkit views while lenses last, brace the reaches with the worst opened evidence, arm one Smart Alert, make timeframe calls) and fails with a non-zero exit code if any response contains an EVM address, a USD amount or the API key, if a toolkit view comes back `unavailable`, or if an Open-on-Nansen redirect breaks.

`npm test` uses mocks and consumes **zero Nansen credits**. It exercises the engine, the Nansen client, the HTTP layer, the derivation rules (`tests/intel.test.ts`) and the tutorial coach (`tests/coach.test.ts`), including assertions that addresses and raw labels never appear in public game state. Browser QA is optional: `scripts/browser-qa.mjs` uses an installed browser automation binary supplied through `AGENT_BROWSER_BIN` and Chromium through `CHROME_PATH`; it intentionally exercises real live requests. See [QA](docs/QA.md).

**Maintainer diagnostic (also paid):** `node scripts/probe.mjs` calls the live Token Screener and, if a candidate is returned, Flow Intelligence (normally up to two calls). It bypasses the game client's application budgets and prints diagnostic metadata; it is not part of setup, tests or release preparation. Do not publish its console output without reviewing it.

## Troubleshooting

- **`node` or `npm` is not recognized:** install [Node.js](https://nodejs.org/) 22.13+ with npm, reopen the terminal, and check `node --version` / `npm --version`.
- **PowerShell blocks `npm.ps1`:** use `npm.cmd ci` and `npm.cmd run dev`; there is no need to weaken your system-wide execution policy.
- **The page does not load:** keep the terminal running and open `http://127.0.0.1:4173`. If that port is busy, set `PORT=4174` in your local `.env` and use that port instead.
- **Live mode is unavailable:** configure `NANSEN_API_KEY` in the root `.env`, check available credits and restart the server. Never put the key in a `VITE_` variable. The tutorial still works without it.
- **`npm start` has no frontend:** run `npm run build` first, or use `npm run dev` for development.
- **A voyage disappears after a restart or long pause:** sessions are deliberately ephemeral; start a new run. Local tutorial progress is separate.

## Demo video

[![VEILWAKE — 60-second demo](media/demo-poster.svg)](media/veilwake-buildathon-60s.mp4)

▶️ **[Watch/download the 60-second demo](media/veilwake-buildathon-60s.mp4)** · MP4 · 1920×1080 · approximately 46 MiB

An **edited walkthrough using captures of a live Nansen-powered voyage** — assembled with Remotion from animated screenshots and crops of real live-data runs, not a continuous, unedited screen capture. Live outcomes differ from run to run, so the voyage shown is one example rather than a scripted guarantee. Script and shot list: [submission kit](docs/SUBMISSION.md).

The video is included in `media/`. If GitHub does not play it in place, download the MP4 from the link above. Maintainers: [PUBLISHING.md](docs/PUBLISHING.md) explains how to verify/repackage it and upload through Git or GitHub Desktop (the file exceeds GitHub's 25 MiB web-upload limit). The event asks for a **30–60s screen recording**; the edited screenshot-based format remains an acceptance question for the organizers. Watch the full render before posting and attach it directly to the [X post](docs/X_POST.md), not just as a repository link.

## Player value & hackathon pitch

**Positioning:** a playable introduction to Nansen's research workflow. **Pitch line:** *learn to investigate before you invest.*

### The central argument

For someone new to on-chain analytics, having access to information is not the same as knowing what to do with it. Which panel should they open? Whose activity matters? What should they check when signals disagree? VEILWAKE gives those questions a purpose: players protect a settlement by investigating token-backed waterways, spending a limited research budget and choosing where to harvest, defend or divert pressure. Nansen's data changes the game, and the game explains the consequences of the player's research choices.

**The benefit is not learning which token to buy. It is practising which questions to ask, which Nansen views can answer them, and why one signal is not enough.**

### The 60-second pitch (spoken)

> Nansen gives users powerful on-chain intelligence — but a beginner still needs to know what to look for, and why it matters. VEILWAKE turns that learning curve into a strategy game.
>
> You protect a settlement across three waves. Each waterway is backed by a token, and eight Nansen API views shape the conditions you face. With limited research lenses you investigate who is moving funds, whether heavy buying hides churn, and whether a large buyer has a track record. Then you choose where to harvest, defend or divert.
>
> After every wave, a pressure ledger shows what affected the outcome — including evidence you never opened. Mistakes cost fictional hull, not real capital.
>
> A guided rehearsal introduces the workflow. Live runs let players practise it with real Nansen observations. Then token links and copyable research prompts help them continue on Nansen.
>
> We are not teaching price prediction. We are teaching the questions that make Nansen useful.
>
> **VEILWAKE: learn to investigate before you invest.**

### What players gain

1. **A place to practise without trading capital.** No wallet, signing, wager or token purchase. The clearly labelled tutorial needs no API key and moves from a guided investigation to confirming an opportunity with limited evidence — so a newcomer can make mistakes before risking real money. It lowers the barrier to trying the workflow; it does not remove the risk of later investing.
2. **A map from questions to Nansen tools.** A repeatable sequence — **market context → cohort flows → buyers → trades → transfers → longer-term holdings → wallet profile** — where every panel names its Nansen feature, question and window. Profiler unlocks after Who Bought/Sold, mirroring "find the wallet, then profile it". A useful starter workflow, not the only valid order.
3. **Why "who" matters as much as "how much".** The signature lesson is the **false calm**: visible whale inflows can coexist with Smart Trader outflows. Players get a reason to use Nansen's labelled cohorts instead of treating all volume as one signal.
4. **Checking evidence rather than trusting a headline.** Heavy buying can hide heavy selling by the same buyers; a big buyer may have little history; a short-term view can conflict with a longer trend.
5. **Learning what to research next.** Lenses are limited, so players must decide which further observation is most useful before committing — modelling limited attention and research time.
6. **Feedback that explains a mistake.** The pressure ledger labels each factor **seen** or **not opened**, turning a bad call into a specific next step rather than a blank loss.
7. **A concrete next step on Nansen.** The Field Manual gives "how to do it on Nansen" steps, and the logbook links each live token to its real Token God Mode page with a copyable research prompt.

### What the game teaches

| Lesson practised | How the game teaches it | Application on Nansen |
|---|---|---|
| Market context is a starting point, not a conclusion | Free price, volume and liquidity context precedes deeper investigation | Use Token Screener to find candidates, then investigate beyond headline activity |
| Participant identity matters | Whale inflows can disagree with trading-cohort outflows | Compare labelled cohorts in Flow Intelligence |
| Activity is not automatically conviction | Buyers & Sellers compares buying, selling and concentration in a bounded sample | Investigate churn and concentration before reading high buying volume |
| Recent transactions can challenge an aggregate | DEX Trades exposes recent buy/sell balance | Inspect the trade sample behind an initial impression |
| A transfer is not necessarily a trade | Transfers distinguishes exchange, team and contract-related movements | Use labels and context; an exchange deposit alone does not prove a sale |
| Timeframes can tell different stories | Daily/hourly flows, a short resolution window and a seven-day holdings trend | Compare a short window with a longer baseline instead of assuming one settles it |
| A large buyer deserves scrutiny | Buyers & Sellers leads to a 30-day Profiler summary | Check observable wallet performance and the limits of its coverage |
| Derivatives add another layer of context | Smart Money perp positioning becomes weather and token-specific modifiers | Treat Perp Screener as extra context, not a standalone spot forecast |
| Monitoring should have a purpose | A modelled Smart Alert watches a chosen condition | Decide what change would justify revisiting an investigation; configure real alerts separately on Nansen |
| Uncertainty is not safety | Missing data stays unknown; a timeframe call can be passed | Recognise coverage gaps and avoid forcing a conclusion |

Full version, including the source-code review trail: [player value pitch](docs/PITCH_PLAYER_VALUE.md).

### The practical handoff to Nansen

**Guided rehearsal → live-data practice → explanation of consequences → continued research on Nansen.** By the end, the intended change is from *"There are many dashboards here. What should I look at?"* to *"I want to compare whale and Smart Trader flows, inspect the recent buyers and trades, check the weekly holdings trend, and profile a relevant buyer before drawing a conclusion."* That is the onboarding value: the player has practised both the vocabulary and the purpose of the tools. It is not a substitute for full platform training, independent research or investment judgement.

### Caveats to keep precise

- Say **guided practice in a Nansen research workflow**, not "proven analyst training" or "guaranteed better returns". Learning transfer has not been validated in a player study.
- Game pressure is a fictional ruleset, not a financial-risk rating or investment recommendation.
- The 1d, 1h and 5m reads are overlapping past windows; resolution is not a future-price reveal, and live observations may be upstream-cached.
- Smart Alerts are modelled in the game; it does not create alerts or watchlists in a Nansen account. Nansen AI support is a copyable prompt, not an AI API integration.
- Local "skills practised" flags record interactions, not assessed competence.
- Tutorial data is explicitly fictional; live mode requires a configured server-side key.
- The simplified buyer-retention clue is derived from sampled USD buying and selling totals, not a complete token-balance audit.

## What is it?

Three reaches. Three waves. One beacon. Investigate each token-backed reach with Nansen views, choose which gates to harvest, brace or divert, and reach **18 charge with hull above zero**. No wallet connection, wagers, tokens to buy, or trading execution.

## Why it exists

Most on-chain products ask you to read a dashboard. VEILWAKE asks you to make a consequential decision with limited research budget. Whale inflows can conceal trader outflows; heavy buying can be churn; a big buyer can have no track record. Protecting one reach can endanger its neighbor. Playing teaches the order an analyst works in on Nansen (**market → cohorts → buyers → tape → transfers → trend → wallet**) and why actor identity, incomplete evidence and observation windows matter.

## Why Nansen is essential

A generic price feed cannot tell the engine whether inflows belong to whales while outflows belong to a trading cohort, whether the top buyers kept what they bought, whether the largest transfers are landing in exchange-labeled wallets, whether Smart Money is trimming over the week, or whether the biggest buyer has ever traded profitably. Nansen's labels and cohorts create every one of those conflicts, and each view is a bounded pressure term in the engine. Remove Nansen and **new live voyages cannot start or resolve**. The explicitly labeled rehearsal is an independent authored teaching fixture, not a counterfeit live world.

## How the game works

1. **Survey (free):** every reach opens a **Token God Mode panel**. The overview is visible: Token Screener price, 24h change, 0–3 volume/liquidity/market-cap bands and buy/sell bias, plus whale/exchange direction, the wave's *Storm glass* (perp weather) and the reach's *perp shadow*. Everything else is removed server-side.
2. **Investigate (1 lens per view):** Flow Intelligence (the scout: six cohorts, 1h context + 1d baseline) and five toolkit views: Who Bought/Sold, DEX Trades, Token Transfers, Flows (Smart Money) and Profiler. Profiler requires Who Bought/Sold first. On Nansen, too, you find the wallet in the ledger before you profile it.
3. **Commit:** one stance per reach. Harvest is free, brace costs 1 supply and divert costs 2. Optionally arm one **Smart Alert** (tripwire) per wave and, on scouted reaches, make a **timeframe call**.
4. **Consequence:** the server reads the 5-minute Flow Intelligence window, adds every modifier, applies neighboring diversions, damage and charge. The wave report's **pressure ledger** lists each source, its value and whether you opened it (`seen`) or not (`not opened`).
5. **Adapt:** surviving waves replenish 3 supply and 2 lenses (caps 12 and 10) and bring three new token-backed reaches.

Harvest captures 1–6 charge but takes full pressure. Brace captures 1 charge and takes 28% of pressure, rounded up. Divert captures none, pushes 55% of its pressure into the next reach, and still takes half of any pressure diverted into it. A Smart Alert (*Smart traders exit*, *Whales exit* or *Exchange inflow spike*) that fires on the 5m read turns a harvesting gate into a free brace. A call predicts whether Smart Traders **hold** or **turn** their 1h direction in the 5m read: +12 points right, −4 wrong, 0 for **pass**. It is scored against the real response, never a price.

Doctrines: **Keeper** 100 hull / 6 supply / 5 lenses; **Cartographer** 85 / 6 / 8; **Engineer** 100 / 9 / 3. Progression consists of escalating run consequences, new waves, local records, practiced skills and outcome achievements. There is no token economy or artificial grind.

## How Nansen data drives gameplay

| Nansen view | In-game instrument | Game transformation |
|---|---|---|
| Token Screener (24h) | Harbor chart | Nine distinct non-stablecoin reaches per run; liquidity band 0 → +2, band 1 → +1 pressure |
| Flow Intelligence 1d / 1h | Current lens (scout) | Six cohort directions + 0–3 strength; whale/exchange visible, the rest fogged |
| Flow Intelligence 5m | Resolution read | Base hazard from trader/whale outflow, exchange inflow and missing cohorts |
| Trader out + whale/fresh-wallet in | **The false calm** | +6 hidden crosscurrent |
| Trading cohort flips 1h → 5m | Turning current | +4; Smart Trader direction also scores the call |
| Who Bought/Sold (BUY, 24h, top 25) | Dock ledger | Top buyers kept <20% +2 (churn), ≥60% −1; one buyer >50% +1; Smart Money net buyers −2 |
| DEX Trades (1h, 100 newest) | Tide log | Sells ≥60% of value +2; buys ≥60% −1; thin tape (<5 trades) +1 |
| Token Transfers (24h, 25 largest) | Cargo manifest | Net ≥2 into exchange-labeled wallets +2; net ≥2 out −1; ≥2 deployer/team sends +1 |
| Flows · Smart Money (7d hourly) | Depth sounding | Holdings ≤−5% +2 (distributing); ≥+5% −1 (accumulating) |
| Weekly trend × live trader exit | Long ebb / Squall in a flood | +1 / −1 combination |
| Profiler PnL summary (30d, largest net buyer) | Captain's log | No record +1; struggling +1; seasoned −1 |
| Perp Screener (Smart Money, 24h, top 60) | Storm glass + perp shadow | Weather −1..+2 on every reach; ±1 on a reach whose token has a Hyperliquid perp (e.g. WETH → ETH) |
| Missing cohort / failed view | `?` / "unavailable" clue | Cohorts: uncertainty cost. Views: 0 pressure. Never faked |
| Player diverts one gate | none (player action) | Added pressure in the neighboring reach |

**Hazard = clamp(base cohort hazard + modifiers, 2, 40)**, then neighbor diversion. Each toolkit view is individually bounded. Full formulas: [mechanics](docs/MECHANICS.md).

Raw Nansen labels are mapped server-side to coarse archetypes (smart money, whale-class, exchange, deployer/team, pools & bots, high-activity, unlabeled, other) and then discarded. Wallet addresses, raw labels, transaction hashes, raw wallet/flow USD amounts and token contract addresses are excluded from public game JSON. Market token prices are visible in the overview. The intentional address exception is a player-clicked **Open on Nansen** redirect: its destination URL contains that token's public contract address, never a wallet address. See [the processing boundary](docs/COMPLIANCE.md#processing-boundary). Cohorts may overlap, so their flows are never summed as disjoint capital.

**Time honesty:** 1d baseline, 1h context and 5m resolution are overlapping past windows. The toolkit uses its own past windows (1h, 24h, 7d, 30d). None of this is a backtest or future-price reveal. A fresh HTTP response can contain upstream-cached observations. Endpoint, window, fetch time and Nansen request ID stay visible in Source proof.

## Learn the platform

- **Tutorial.** *Start the tutorial* on the title screen opens a three-chapter guided rehearsal. A coach highlights the next control and reacts to what you actually open, from the analyst workflow on a false calm to finding the open current yourself. See [Tutorial](#tutorial-guided-rehearsal).
- **Token God Mode panel.** Each reach is laid out the way Nansen lays out a token. Every view names where it lives in the app (e.g. *Token God Mode → Buyers & Sellers*), the question it answers and its window.
- **Field Manual.** Lists every Nansen feature as a *live mechanic* (the 8 API-backed views), *modelled* (Smart Money, Labels, Smart Alerts, timeframe comparison, Watchlists, Nansen AI) or *lesson only*, with the reason: Holders, Indicators, PnL Leaderboards, Portfolio, Points, Trading, Prediction Markets, Chains. Each entry has "how to do it on Nansen" steps and an `app.nansen.ai` link. Twelve practiced skills are tracked in localStorage (skill names only).
- **Research logbook.** The end screen lists every token you sailed with the verdicts you saw. Each has an **Open on Nansen** link to that token's real Token God Mode page and a copyable **Nansen AI research prompt** built from your observations.
- **Achievements** reward the workflow, e.g. *The full workflow*, *Checked the captain*, *The tripwire held*, *Reads the timeframes*.

## Architecture

```text
React browser -> same-origin Express game routes -> server-only Nansen client (8 endpoints)
                         |                               |
                 authoritative game state      derive: bands, archetypes, bounded clues
                         |                               |
                 decisions / consequences <---- display-safe readings + clues
```

One Node process. No database, login service, wallet SDK, AI model or external font/CDN. React 19 + TypeScript + Vite 6 + Express 5. Server-owned sessions (10-minute idle, 20-minute absolute lifetime), typed pure engine (`shared/engine.ts`) and derivation layer (`shared/intel.ts`). Production serves the compiled frontend and backend on one port.

Game API: `POST /api/game` `{mode, doctrine}` · `GET /api/game/:id` · `POST /api/game/:id/scout` `{laneId, revision}` · `POST /api/game/:id/investigate` `{laneId, tool, revision}` · `POST /api/game/:id/resolve` `{plans, revision, alert?, calls?}` · `POST /api/game/:id/next` `{revision}` · `GET /api/game/:id/nansen/:wave/:laneId` (302 to Nansen). There is no forecast route.

## Nansen endpoints used

All eight are official REST **POST** endpoints at `https://api.nansen.ai/api/v1`, called with the server-side `apikey` header. Each is published at **1 credit** per call.

| Endpoint | Request | Response fields consumed |
|---|---|---|
| `/token-screener` | chains `ethereum/base/solana`, timeframe `24h`, page 1 × 18, stablecoins excluded, volume desc | `chain, token_address, token_symbol, price_usd, price_change, volume, liquidity, market_cap_usd, buy_volume, sell_volume, netflow` |
| `/tgm/flow-intelligence` | chain + token address + `1d`, `1h` or `5m` | `data[0].<cohort>_net_flow_usd` for six cohorts |
| `/tgm/who-bought-sold` | `buy_or_sell: BUY`, last 24h, 25 rows, `bought_volume_usd` desc | `address` (server-only), `address_label`, `bought_volume_usd, sold_volume_usd` |
| `/tgm/dex-trades` | last 1h, 100 rows, `block_timestamp` desc | `action, estimated_value_usd, trader_address_label` |
| `/tgm/transfers` | last 24h, 25 rows, `transfer_value_usd` desc | `from_address_label, to_address_label` |
| `/tgm/flows` | `label: smart_money`, last 7d, up to 200 hourly rows, date asc | `date, token_amount, holders_count` |
| `/profiler/address/pnl-summary` | largest qualifying net buyer from the ledger, chain, last 30d | object: `traded_times, traded_token_count, realized_pnl_usd, win_rate` |
| `/perp-screener` | last 24h, `trader_type: sm`, 60 rows, `smart_money_volume` desc | `token_symbol, current_smart_money_position_longs_usd/_shorts_usd, net_position_change, smart_money_volume, funding` |

Pagination is explicit and bounded; no endpoint is paged beyond page 1. Profiler is skipped (and shown as "Nobody to profile" or "unavailable") if the ledger has no qualifying net buyer or failed. The [redistribution guide](https://docs.nansen.ai/guides/redistribution-guide) writes two of these paths in shorthand, `tgm/token-screener` and `tgm/perp-screener`. The real contracts are `/api/v1/token-screener` and `/api/v1/perp-screener`.

In the redistribution guide, seven of these views are **Allowed with attribution** and Profiler PnL summary is **Allowed**. The UI shows **Powered by Nansen API** linked to `nansen.ai`. The game deliberately does not use Holders with the Smart Money filter (Restricted, 5 credits), PnL Leaderboards (Prohibited) or Nansen Indicators (not listed). See [compliance](docs/COMPLIANCE.md). This is an implementation rationale, not legal clearance from Nansen.

## Tutorial (guided rehearsal)

New players start with **Start the tutorial** on the title screen. It is a guided rehearsal in three chapters, played on authored data that is clearly labeled as fictional. It needs no API key and always sails as **Keeper**, because Keeper's 5 lenses cover every coached view exactly (the doctrine picker applies to live runs). A coach card follows the player rather than driving the game. It highlights the next control, quotes the clue the player actually opened, and never blocks input. It can be minimized, or hidden and reopened from the header.

| Chapter | Wave · weather | What it teaches |
|---|---|---|
| **1 · The false calm** | 1 · Crosswind (±0) | A click-by-click walkthrough: the four resources, the storm glass (Perp Screener), then Token Screener → Token God Mode → Flow Intelligence → Who Bought/Sold → Flows (Smart Money) on a green token that smart money is leaving. Then: brace it, harvest the open current, brace the reach you cannot read, arm a Smart Alert where you are exposed, and optionally make a timeframe call. |
| **2 · Find the open current** | 2 · Fair wind (−1) | You choose. Scout from the free surface. A wrong scout gets named ("Not this one: Moss is a false calm"). Then Who Bought/Sold → Profiler on the open current, **Divert** (and why here it would flood your harvest), and gate checks against the evidence ("Careful: Ember is on Harvest, but its surface looks like an undertow"). |
| **3 · Read the surface** | 3 · Headwind (+1) | Two lenses, three reaches. Spot the open current from free information, then confirm it with DEX Trades and Token Transfers. If the tape says no, the coach steers you to another reach and helps you reason by elimination. |

Every wave report explains the outcome in plain words: damage against pressure per reach, diversions, the Smart Alert, the call, and which unopened views added pressure. Practice answers are revealed only on request. The finale adapts to a lit beacon, a wrecked hull or a beacon that stayed dark. It offers **Replay the tutorial** and, when the server has a key, **Enter the live current**, and it marks the tutorial complete on this device.

The coach is a pure function of game state (`src/coachSteps.ts`, rendered by `src/Coach.tsx`). `tests/coach.test.ts` plays every branch, including a guard that each control the coach highlights has a matching `data-coach` hook in the UI.

The coached route, which is also the exactly repeatable demo:

| Wave | Weather | Glass Reach | Ember Reach | Moss Reach |
|---|---|---|---|---|
| 1 | Crosswind (±0) | Brace | Harvest | Brace |
| 2 | Fair wind (−1) | Harvest | Brace | Brace |
| 3 | Headwind (+1) | Brace | Brace | Harvest |

This route ends with **24 charge, 39 hull and 933 points**, plus 12 for each correct timeframe call. Blind harvesting loses (hull 0 in wave 2), and bracing everything survives with only 9 charge. Arming the Smart Alert *Smart traders exit* on the false-calm reach and harvesting it also wins, because the alert fires on the 5m read and braces that gate at no supply cost. The game is understandable without narration: the pressure ledger connects every Nansen view to its consequence.

For the **official recording**, use **Enter the live current**, not rehearsal. Show real token symbols, the Token God Mode panel, Source proof with request IDs, a committed strategy and the resulting pressure ledger. Live outcomes are not predetermined. Shot list: [submission kit](docs/SUBMISSION.md).

## API usage

A fresh, fully uncached live voyage makes up to **74 calls**:

```text
1 token screener + 1 perp screener
+ per wave: 6 flow-intelligence (1h + 1d × 3 tokens)
          + 12 toolkit (buyers, trades, transfers, flows × 3)
          + up to 3 profiler
          + 3 flow-intelligence 5m at resolution
= 2 + 3 × 24 = 74
```

Measured on 26 September 2026: two consecutive `npm run voyage` runs (Cartographer, then Keeper) each made **70 upstream requests** with **0 failures** across all 8 endpoints, finished all three waves (victories at 21/18 charge) and passed the leak audit. The count is below 74 because the Profiler is skipped when Who Bought/Sold has no net buyer to profile.

The perp screener is shared through the memory cache. A voyage that outlasts the 10-minute cache can refresh it at a later wave (+1). Toolkit reads for a wave are **prefetched in the background** once that wave's flows load; investigate and resolve await them. A live wave therefore spends its toolkit calls whether or not the player opens the views. Lenses are a game resource, not a credit meter; opening a view never triggers an extra call. Cache hits and in-flight duplicates are not network calls. Only player-triggered start/resolve/next actions request data; there is no idle polling or quota-burning loop.

Engine room shows actual requests, successes, failures, endpoint breakdown, observed credit headers, estimated cost, remaining credits, chains, processed observations and budget windows. Operational counters persist in ignored `.runtime/telemetry.json`; raw responses do not. Provider account analytics, not local counters, are the authoritative buildathon count.

The campaign specifies a **1,000-call** threshold, and this project targets that stricter figure; the official campaign and help sources have disagreed (1,000 versus 100+), so the **final authoritative count remains the Nansen account's usage analytics**, not these local counters. Reaching the target must happen through genuine play and testing during the event. Roughly **14 fully uncached voyages** would exceed it (14 × 74 = 1,036); cached sessions cost less. As of 26 September 2026 the local telemetry recorded **1,044 upstream requests (1,044 successes, 0 failures)** from live smoke and voyage QA runs.

Retries: at most two for 429/5xx, with exponential backoff and `Retry-After` respected up to 5 seconds; longer delays are surfaced to the player instead of blocking. No retry on credential, credit or validation errors. Upstream concurrency is 5 (hard cap 6), well below Nansen's free-plan limit of 15 requests/second. Each attempt counts toward budgets, and stalled headers or body reads have a 25-second deadline.

## Technical decisions

- Deterministic rules rather than an LLM: inspectable causes, zero model training, no hallucinated narrative.
- Cohorts and archetypes instead of wallet characters: attribution stays honest and addresses stay out of the UI.
- Server-authoritative fog, plans and revisions: unopened clues are stripped from the payload, so hidden state cannot be uncovered through browser CSS or modified scores.
- Explicit rehearsal rather than silent fallback: failure never becomes fake live data, and a failed view becomes an "unavailable" clue worth 0.
- Eight one-credit, redistributable views rather than restricted or prohibited ones: deep Token God Mode coverage without redistributing wallet lists.
- Ephemeral sessions (10-minute idle, 20-minute absolute): refresh resumes while the session is alive; restarting the server ends runs.

## Limitations

- Single-player, single-process; no global leaderboard or persistent live-world archive.
- Nansen observations can be sparse or cached, and not every cohort or view exists for every token. Fresh-wallet fields exist only on the daily baseline; missing values are never fabricated.
- Label → archetype mapping is a keyword heuristic over free-text labels and can misclassify. Perp-shadow matching is symbol-based (e.g. WETH → ETH, cbBTC → BTC).
- Profiler reads only the single largest net buyer and only on chains the endpoint supports.
- A live voyage requires nine distinct candidates from the bounded screener page; insufficient coverage produces an explicit error.
- Pressure rules are game design over rolling windows, not historical ground truth or investment-risk measurement.
- "Open on Nansen" links resolve only while the voyage is alive on the server.
- Doctrine balance and learning outcomes have not been validated in a large player study.
- Public hosting, public GitHub publication, account-wide 1,000-call eligibility, X posting and final form submission are external release gates this repository cannot certify, and the account's usage analytics — not local counters — are the authoritative call count.
- The included demo is an edited screenshot-based walkthrough rather than a continuous screen recording. Review it against the organizer's recording requirement before posting; duration alone does not establish acceptance.

## Future ideas

Asynchronous shared challenges using permitted derived state; more tested teaching scenarios; accessibility and localization studies; an opt-in operator credit budget per event. None of these are dead buttons in the current game.

## Hackathon submission information

Built for [Nansen Meridian Buildathon](https://nansen.ai/campaigns/meridian-buildathon), Sep 14–27, 2026. Four equal-weight criteria: data integration, originality, functionality, documentation. The campaign specifies **1,000+ API calls** in the event window (the official campaign and help sources have also cited 100+, so this project treats 1,000 as the stricter target and relies on the Nansen account's usage analytics as the authoritative count). It also requires a public GitHub repo, a 30–60s live-data recording on X tagging `@nansen_ai`, and the [entry form](https://nansen-ai.typeform.com/meridian-submit).

Brand copy, X draft, submission description and exact release checklist: [SUBMISSION.md](docs/SUBMISSION.md). Research and the 20-concept selection: [RESEARCH.md](docs/RESEARCH.md).

## Documentation, license & hackathon links

- **Docs:** [player value & hackathon pitch](docs/PITCH_PLAYER_VALUE.md) · [submission kit](docs/SUBMISSION.md) · [publishing guide](docs/PUBLISHING.md) · [X post](docs/X_POST.md) · [game mechanics](docs/MECHANICS.md) · [design](docs/DESIGN.md) · [compliance](docs/COMPLIANCE.md) · [QA](docs/QA.md) · [research](docs/RESEARCH.md)
- **Hackathon:** [Nansen Meridian Buildathon](https://nansen.ai/campaigns/meridian-buildathon) · [official help article](https://release.nansen.ai/help/articles/3540155-nansen-meridian-buildathon-sep-14-27) · [entry form](https://nansen-ai.typeform.com/meridian-submit)
- **License:** [MIT](LICENSE) © 2026 VEILWAKE contributors.
- **Creator:** a solo project by [tko1229](https://github.com/tko1229).

The source-and-video package is prepared for `https://github.com/tko1229/veilwake`. See the [publishing guide](docs/PUBLISHING.md) for publication and the submission checklist; preparing the package is not a GitHub upload, X post or completed hackathon entry. The maintainer submits the official form personally.
