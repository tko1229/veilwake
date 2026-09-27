# Design record

## Design thesis

**Read the current. Keep the lights on.** VEILWAKE turns an abstract data-classification problem into a three-wave survival decision. The goal is not to make blockchain data look decorative. It is to make the player feel the cost of acting on incomplete evidence, and to practice the research sequence a Nansen analyst actually uses.

## Player promise

In under a minute, a new player should understand:

- what the world is: three fictional reaches and one beacon, each reach backed by a real token;
- what the evidence is: a free market overview, then paid Nansen views (cohort flows, buyers, trades, transfers, Smart Money trend, a wallet profile) under fog;
- what to do: spend limited lenses on the views that matter, set gates, optionally arm a Smart Alert or make a timeframe call, resolve;
- why it matters: the wrong stance damages the hull or starves the beacon, and the report shows which unopened view would have warned you;
- what is real: live observations are marked `LIVE DATA`, while rehearsal is marked fictional.

The game teaches an analysis sequence rather than a buy/sell answer: **market → cohorts → buyers → tape → transfers → trend → wallet → consequence**. The timeframe call is scored only against the real 5m Smart Trader direction. There is no price forecast and no investment advice.

## Core loop

```text
Title
  → first time: the three-chapter tutorial on a clearly labeled rehearsal (always Keeper)
  → then: the live current, with a doctrine of your choice
  → read the free overview: market bands, whale/exchange surface, storm glass, perp shadow
  → open Token God Mode on a reach: scout Flow Intelligence, open toolkit views (1 lens each)
  → choose Harvest / Brace / Divert; optionally arm one Smart Alert and make calls
  → resolve from the 5m window
  → read the pressure ledger: every source, its value, seen vs not opened
  → replenish (+3 supply, +2 lenses) and enter the next wave
  → end screen: achievements, practiced skills, research logbook → continue on Nansen
```

The player commits before seeing the resolution reading or any unopened clue. This preserves the difference between research and consequence rather than showing every signal as a dashboard.

## Tutorial

The rehearsal is the tutorial. Its fixtures are deterministic, so a coach can teach against known answers without pretending to know anything about live data. The coach is a pure function of game state (`src/coachSteps.ts`). It never calls the API, changes a plan or blocks input. Its only memory is acknowledgements, skips and stance clicks, so it follows a player who jumps ahead and credits work already done.

- **Chapter 1 · The false calm** is a strict walkthrough of the analyst order on a green token that smart money is leaving. The copy quotes the clue the player just opened, so the text cannot drift from the data.
- **Chapter 2 · Find the open current** hands over the choice. The coach names the pattern of a wrong scout, teaches Divert by showing the one that would flood the harvest, and checks the gate plan against the visible evidence.
- **Chapter 3 · Read the surface** gives two lenses for three reaches. The player spots the open current from free information and confirms it with the tape and the cargo. If the tape says no, the coach steers away from that reach and reasons by elimination.

Each report step explains the outcome (damage against pressure, diversions, alert, call) and separates missed views on defended reaches from missed views on a harvest. Reactive feedback appears as a distinct good/heads-up note, never as a silent change to the instruction. Answers are revealed only on request. The finale adapts to victory, a wrecked hull or a dark beacon. Completion is a single local flag.

## Information hierarchy

1. **Objective:** 18 beacon charge while hull remains above zero.
2. **Current state:** wave, weather, hull, charge, supply and lenses.
3. **Reach decision:** token-backed reach, market overview, surface signals, views opened (n/6), stance costs.
4. **Consequence:** pattern, pressure ledger, damage, charge, externality, alert and call outcome.
5. **Proof:** source endpoint, window, request ID and fetched time for every reading and clue.

The UI uses editorial typography, numbered instructions and a schematic lockwork motif instead of generic crypto-dashboard cards. The water bands and gate controls communicate flow at a glance; text remains the source of truth for accessibility and precision.

## Three stances

- **Harvest:** no supply cost, captures charge based on pressure, accepts full damage.
- **Brace:** costs one supply, captures one charge, reduces local damage to 28%.
- **Divert:** costs two supply, captures no charge, halves damage from incoming diversions and sends 55% of its own pressure to the next reach.

The stances are intentionally asymmetric. There is no dominant button: harvesting is necessary for the objective, bracing preserves hull, and diverting solves one problem by creating another. A Smart Alert adds a conditional fourth option: harvest, but brace for free if the tripwire fires on the 5m read.

## Fog and investigation

Before investigation, only the market overview, whale and exchange surface signals, weather and perp shadow are shown. Hidden cohorts and every unopened clue are removed from the server's public payload, not blurred in CSS. The scout (Flow Intelligence) reveals the six cohorts across 1h and 1d. Each toolkit view reveals one verdict with derived facts. Profiler is gated behind Who Bought/Sold, mirroring Nansen, where you find the wallet in the ledger before profiling it. Missing values stay `?`, and failed views say "unavailable" and add nothing.

The core teaching pattern is still **The false calm**: outward Smart Trader pressure alongside inward Whale or Fresh Wallet pressure. The toolkit then deepens it. Top buyers may have kept almost nothing (churn), the tape may lean to sells, large transfers may be loading exchange wallets, Smart Money may be distributing over the week, and the biggest buyer may have no track record. Doctrines decide how much of that you can afford to see.

## Data-to-game translation

Cohort net flows are independently quantized: missing or malformed → unknown; below $1 → 0; below $10k → 1; below $1M → 2; otherwise 3. Screener size fields become 0–3 bands. Toolkit rows become verdicts with bounded pressure: buyers −2..+3, trades −1..+3, transfers −1..+3, trend −1..+2, profiler −1..+1, weather −1..+2, perp shadow ±1, harbor liquidity 0..+2. Raw labels become archetypes, and addresses, labels, hashes and USD amounts are discarded before the browser. Cohorts can overlap and are never summed as disjoint capital. Exact rules: [MECHANICS.md](MECHANICS.md).

## Screen architecture

- `Welcome` and `OnboardingModal`: brand, promise, live or tutorial, schematic preview, doctrine selection and first-time rules.
- `Coach` and `coachSteps`: the tutorial card (floating on the board, sticky inside Token God Mode and the wave report), `data-coach` highlights and the state-derived script.
- `WorldBoard`: three reaches with market overview, surface signals, toolkit chips (locked or verdict), a Token God Mode button (n/6 views), stances and the objective strip. The wave's Smart Alert and calls are set before resolving.
- `Investigation`: the **Token God Mode** modal per reach, laid out in Nansen's order. It has a free overview, then Flow Intelligence and five toolkit panels. Each panel shows where it lives on Nansen, its question, window, verdict, facts and provenance, and shows fog until opened.
- `ResolutionPanel`: pattern interpretation, proof badge, per-reach **pressure ledger** (seen / not opened), alert and call outcome, lesson and next action.
- `FieldManual`: every Nansen feature as live mechanic / modelled / lesson-only, with reasons, "how to do it on Nansen" steps and app links. Practiced skills are tracked locally.
- `EndScreen`: result, achievements, practiced skills, **research logbook** (Open on Nansen + copyable Nansen AI prompt per token) and a spoiler-free share summary.
- `AdminView`: protected Engine room with operational counters and budget status.

## Responsive behavior

The board collapses from a three-column desktop layout into a vertical reach sequence. The objective and resolve action remain visible, controls are large enough for touch, and the SVG water bands use fixed direct-child sizing to avoid nested caption icons expanding across the page. Browser QA checks 390px and 768px viewports for horizontal overflow.

## Accessibility and honesty

The game uses native buttons, explicit labels, visible focus styles, dialog semantics, text alternatives for icons and no color-only decision cue. The ledger labels `seen` and `not opened` in text. Rehearsal and live badges are persistent. Source proof names the observation window and request ID. Error states tell the player whether trying again is meaningful or whether switching to rehearsal is available.

## What was deliberately excluded

No wallet connection, transaction signing, wagering, price target or price forecast, copy-trading action, permanent leaderboard, raw address or label display, hidden auto-refresh or AI-generated market advice. Holders, Indicators and PnL Leaderboards stay lesson-only for redistribution and advice reasons. Each exclusion protects the teaching goal and keeps the Nansen boundary legible.
