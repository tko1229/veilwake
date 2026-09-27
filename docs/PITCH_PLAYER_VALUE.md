# VEILWAKE — player value and hackathon pitch

**Positioning:** A playable introduction to Nansen's research workflow.

**Pitch line:** Learn to investigate before you invest.

**Game tagline:** Read the current. Keep the lights on.

Prepared from a source-code and documentation review on 27 September 2026. This is a player-value pitch, not a claim of measured learning outcomes or investment performance. The intended audience is hackathon judges and people new to Nansen's token-research tools.

## The central argument

For someone new to on-chain analytics, having access to information is not the same as knowing what to do with it. Which panel should they open? Whose activity matters? What should they check when signals disagree?

VEILWAKE gives those questions a purpose. Players protect a settlement by investigating token-backed waterways, spending a limited research budget and choosing where to harvest, defend or divert pressure. Nansen's data changes the game, and the game explains the consequences of the player's research choices.

**The benefit is not learning which token to buy. It is practicing which questions to ask, which Nansen views can answer them, and why one signal is not enough.**

## Ready-to-deliver pitch — approximately 60 seconds

Nansen gives users powerful on-chain intelligence. But a beginner still needs to know what to look for—and why it matters.

VEILWAKE turns that learning curve into a strategy game.

You protect a settlement across three waves. Each waterway is backed by a token, and eight Nansen API views shape the conditions you face. With limited research lenses, you investigate who is moving funds, whether heavy buying hides churn, and whether a large buyer has a track record. Then you choose where to harvest, defend or divert.

After every wave, a pressure ledger shows what affected the outcome—including evidence you never opened. Mistakes cost fictional hull, not real capital.

A guided rehearsal introduces the workflow. Live runs let players practice it with real Nansen observations. Then token links and copyable research prompts help them continue on Nansen.

We are not teaching price prediction. We are teaching the questions that make Nansen useful.

**VEILWAKE: learn to investigate before you invest.**

## Main advantages for players

### 1. A place to practice without trading capital

The game requires no wallet connection, transaction signing, wager or token purchase. The clearly labeled tutorial works without a Nansen API key. Its three chapters move from a guided investigation to choosing an opportunity and confirming it with limited evidence.

**Practical significance:** A newcomer can explore analytical concepts and make mistakes before applying them to real financial decisions. This lowers the barrier to trying the workflow; it does not eliminate the risks of later investing.

### 2. A map from questions to Nansen tools

The game presents a repeatable research sequence:

**Market context → cohort flows → buyers → trades → transfers → longer-term holdings → wallet profile.**

Each investigation panel names the corresponding Nansen feature, the question it answers and the observation window. Profiler is unlocked after Who Bought/Sold, reinforcing the transition from discovering a buyer to investigating that wallet.

**Practical significance:** Instead of opening Nansen and exploring tabs without a purpose, the player has practiced a sequence of research questions. This is a useful starter workflow, not the only valid order for every investigation.

### 3. Understanding why “who” matters as much as “how much”

The signature lesson is the **false calm**: visible whale inflows can coexist with Smart Trader outflows. Large participants and historically successful trading cohorts are not interchangeable.

**Practical significance:** Players get a reason to use Nansen's labeled cohorts rather than treating all volume or all large transfers as one signal. They practice asking whether different participants agree.

### 4. Checking evidence rather than trusting a headline

High buying activity can coexist with heavy selling by the same buyers. A large buyer may have little observable trading history. A positive short-term view can conflict with a longer holdings trend.

**Practical significance:** The game encourages cross-checking Buyers & Sellers, DEX Trades, Flows and Profiler instead of treating one impressive number as a complete thesis. Wallet performance remains historical evidence, not a guarantee of future returns.

### 5. Learning what to research next

Players cannot open every view on every reach: research lenses are limited. They must decide which additional observation would be most useful before committing.

**Practical significance:** This models limited attention and research time. The transferable skill is prioritization, not memorizing a dashboard or equating a lens with a paid Nansen API credit.

### 6. Feedback that explains a mistake

After each wave, the pressure ledger exposes the game's contributing factors and labels them **seen** or **not opened**. Players can distinguish a clue they ignored from one they never investigated.

**Practical significance:** A failed decision becomes a specific next step: “Next time, compare the weekly Smart Money trend” or “Check the buyer before trusting the buy.” This is causal feedback about the game's rules—not proof of why a real token's price moved.

### 7. A concrete next step on Nansen

The Field Manual provides feature descriptions and “how to do it on Nansen” steps. The live-run logbook offers a link to each token's real Token God Mode page and a copyable research prompt based on the player's observations.

**Practical significance:** Players can continue with a token and a research question already in mind, rather than starting from a blank dashboard. Rehearsal tokens are fictional and link to the Token Screener instead; live token redirects work only while the server session remains active.

## What does the game teach?

| Lesson practiced | How the game teaches it | Application on Nansen |
|---|---|---|
| Market context is a starting point, not a conclusion | Free price, volume and liquidity context precedes deeper investigation | Use Token Screener to discover candidates, then investigate beyond headline activity |
| Participant identity matters | Whale inflows can disagree with trading-cohort outflows | Compare labeled cohorts in Flow Intelligence |
| Activity is not automatically conviction | Buyers & Sellers compares buying, selling and concentration in a bounded sample | Investigate churn and concentration before interpreting high buying volume |
| Recent transactions can challenge an aggregate | DEX Trades exposes recent buy/sell balance | Inspect the trade sample behind an initial impression |
| A transfer is not necessarily a trade | Transfers distinguishes exchange, team and contract-related movements | Use labels and context; an exchange deposit alone does not prove a sale |
| Timeframes can tell different stories | Daily/hourly flows, a short resolution window and a seven-day holdings trend | Compare short-window activity with a longer baseline instead of assuming one window settles the question |
| A large buyer deserves scrutiny | Buyers & Sellers leads to a 30-day Profiler summary | Check observable wallet performance and the limits of its coverage |
| Derivatives add another layer of context | Smart Money perp positioning becomes weather and token-specific modifiers | Recognize Perp Screener as additional context, not a standalone spot-price forecast |
| Monitoring should have a purpose | A modeled Smart Alert watches a chosen condition | Think about what change would justify revisiting an investigation; configure real alerts separately on Nansen |
| Uncertainty is not safety | Missing data stays unknown; a timeframe call can be passed | Recognize coverage gaps and avoid forcing a conclusion |

## The practical onboarding journey

**Guided rehearsal → live-data practice → explanation of consequences → continued research on Nansen.**

By the end, the intended change is from:

> “There are many dashboards here. What should I look at?”

to:

> “I want to compare whale and Smart Trader flows, inspect the recent buyers and trades, check the weekly holdings trend, and profile a relevant buyer before drawing a conclusion.”

That is the onboarding value: the player has practiced both the vocabulary and the purpose of the tools. The game is not a substitute for full platform training, independent research or investment judgment.

## Why this is compelling for a Nansen hackathon

### Nansen is part of the mechanics, not a logo

The implementation uses eight API endpoints: Token Screener, Flow Intelligence, Who Bought/Sold, DEX Trades, Token Transfers, Flows, Profiler PnL Summary and Perp Screener. Their derived observations influence conditions and consequences.

A price-only feed cannot preserve the current lessons about cohort disagreement, buyer behavior, labeled transfers and wallet history. Nansen's differentiation is something the player uses, not merely reads about.

### The game connects discovery to purposeful platform use

The player-value proposition is learning a research process. The corresponding opportunity for Nansen is attracting users who arrive with a specific question, recognize the relevant features and have a reason to investigate further.

This could support product education and activation. It is a product hypothesis—not a demonstrated increase in conversion or retention.

### The feedback loop is the differentiator

The strongest demonstration is not an API counter. Show a promising-looking reach, reveal conflicting evidence, make a decision, then show the ledger explaining the result. End with the same token opening on Nansen.

**Suggested demo story:** “The surface looked encouraging. Flow Intelligence disagreed. We investigated, changed our plan, and can show exactly which evidence mattered.” Use the labeled rehearsal to guarantee that teaching scenario; do not imply every live run contains it.

## Claims to keep precise

- Say **“guided practice in a Nansen research workflow,”** not “proven analyst training” or “guaranteed better returns.” Learning transfer has not been validated in a player study.
- Game pressure is a fictional ruleset, not a financial-risk rating or investment recommendation.
- The 1d, 1h and 5m reads describe overlapping past windows. Resolution is not a future-price reveal; live observations may be upstream-cached.
- Smart Alerts are modeled in the game. The game does not create alerts or watchlists in a Nansen account. Nansen AI support is a copyable prompt, not an AI API integration.
- Local “skills practiced” flags record interactions, not assessed competence.
- Tutorial data is explicitly fictional. Live mode requires a configured server-side Nansen API key.
- The simplified buyer-retention clue is derived from sampled USD buying and selling totals; it is not a complete token-balance audit. Keep the pitch focused on the investigative habit rather than literal proof of conviction.

## Evidence and references

### Project implementation

- [Research panels and Nansen feature mapping](../src/Investigation.tsx)
- [Feature questions, lessons and Profiler prerequisite](../shared/types.ts)
- [Tutorial coach](../src/coachSteps.ts)
- [Pressure, alerts, timeframe calls and seen/unopened evidence](../shared/engine.ts)
- [Transformation of Nansen observations into game clues](../shared/intel.ts)
- [Field Manual and practice categories](../src/manualData.ts)
- [End-screen logbook and onward links](../src/screens/EndScreen.tsx)
- [Research-prompt generation and achievements](../src/outcome.ts)
- [Server-side token-link construction](../server/world.ts)
- [Project overview and limitations](../README.md)

### Nansen documentation consulted

- [Token God Mode 101 — Nansen Academy](https://academy.nansen.ai/articles/3874203-token-god-mode-101): establishes the research role of buyers/sellers, DEX trades, transfers, exchange flows and Smart Money holdings; also notes limitations of USD-denominated buyer/seller comparisons.
- [Flow Intelligence API](https://docs.nansen.ai/api/token-god-mode/flow-intelligence): cohort-specific net flows, supported observation windows, availability differences and caching.

This review did not rerun the app, validate current account entitlements or spend live API credits.
