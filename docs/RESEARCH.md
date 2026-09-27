# Research record

## Brief

VEILWAKE was selected for the Nansen Meridian Buildathon after comparing data-native games, browser strategy loops, blockchain investigations and lightweight roguelike systems. The selection criteria were strict: Nansen had to change the rules of play, the first run had to be understandable without narration, the product had to avoid wagering and execution, and the implementation had to remain small enough to verify.

## Buildathon requirements checked

The project brief and official buildathon materials were checked for the following release gates:

- public repository;
- 30–60 second recording;
- live Nansen data visible in the official recording;
- at least 1,000 qualifying API calls during the event window;
- submission through the official form;
- evaluation across data integration, originality, functionality and documentation.

The account-level call requirement cannot be certified by this repository. Nansen account analytics is authoritative; the local Engine room is operational evidence only.

## Nansen capability research

The initial prototype used Token Screener and Flow Intelligence. The final implementation expands that research into **eight REST endpoints**:

1. `POST /api/v1/token-screener` discovers active token candidates across Ethereum, Base and Solana.
2. `POST /api/v1/tgm/flow-intelligence` reads labeled cohort flow for a token and timeframe.
3. `POST /api/v1/tgm/who-bought-sold` supplies the bounded buyers/sellers ledger.
4. `POST /api/v1/tgm/dex-trades` supplies recent transaction context.
5. `POST /api/v1/tgm/transfers` supplies labeled transfer context.
6. `POST /api/v1/tgm/flows` supplies the Smart Money holdings trend.
7. `POST /api/v1/profiler/address/pnl-summary` supplies a summary of the largest qualifying net buyer's record.
8. `POST /api/v1/perp-screener` supplies Smart Money perpetual-positioning context.

The transport uses the documented `apikey` request header and retains upstream request IDs and credit headers for source proof and telemetry. The game reads six cohort families: Smart Traders, Top PnL, Whales, Exchanges, Fresh Wallets and Public Figures.

Raw wallet-label redistribution, restricted Holders use and prohibited PnL leaderboards were rejected. The chosen token-specific Flows and DEX Trades endpoints are distinct from excluded standalone wallet/Smart Money data products. Public output contains derived directions, bands, ratios and verdicts—not raw wallet lists or labels. See [COMPLIANCE.md](COMPLIANCE.md) for the exact endpoint-by-endpoint posture and limitations.

## Concept matrix

More than twenty directions were considered internally. Representative candidates included:

| Concept | Nansen fit | Demo clarity | Rejected because |
|---|---:|---:|---|
| Wallet portfolio dashboard | Low | High | Dashboard, not a game; Nansen is decorative |
| Copy-trading assistant | High | Medium | Execution, financial-risk and terms concerns |
| Token price predictor | Medium | High | Encourages false certainty and future claims |
| On-chain detective | High | Medium | Easy to become a wallet-data viewer |
| Cohort weather map | High | High | Strong visual, but low player consequence |
| Liquidity survival game | High | High | Risked becoming a market simulator |
| Faction diplomacy | High | Medium | Too much narrative state for the time budget |
| Trading card battler | Medium | High | Could imply wagering or asset ownership |
| DAO governance simulator | Medium | Medium | Nansen actor flow was not mechanically central |
| Blockchain city builder | Medium | Medium | Broad scope and weak 60-second story |
| Flow rhythm game | Medium | High | Fun, but teaching value was shallow |
| Address reputation game | High | Medium | Wallet-level redistribution boundary |
| MEV chase | High | High | Too close to execution and adversarial trading |
| Token launch survival | High | Medium | Could be read as investment advice |
| Prediction market | High | High | Explicitly conflicts with no-wager requirement |
| Cohort escape room | High | High | Better as a puzzle layer than a full product |
| Chain routing puzzle | High | High | Risked reducing actor identity to a score |
| Fleet logistics | Medium | Medium | Nansen did not need to remain in the core loop |
| Social sentiment world | Low | Medium | Wrong data source and model-training concerns |
| Live market roguelike | High | High | Broader than the available verification budget |
| **Fog-of-war beacon defense** | **High** | **High** | **Selected** |

## Why VEILWAKE won

The selected loop has a compact causal chain:

`Nansen cohort conflict → hidden crosscurrent → scout decision → stance cost → neighboring consequence → teaching moment`

That chain satisfies the mechanical-necessity test. Without the flow-intelligence response, the live world cannot be created or resolved. It also produces an immediate visual metaphor: the player is not looking at a chart; the player is keeping a settlement alive while actor currents move beneath the fog.

## Competitive and precedent scan

The design borrows proven interaction patterns, not copyrighted content:

- fog-of-war strategy games: incomplete information makes scouting meaningful;
- roguelike runs: bounded waves and changing resources create replayable decisions;
- deckbuilder-style trade-offs: low-cost harvest versus safer brace versus externality-heavy divert;
- on-chain investigations: actor labels matter more than a single aggregate number;
- browser game onboarding: one deterministic rehearsal teaches the loop before live variability.

The product deliberately avoids a wallet tracker, portfolio view, copy-trading tool, prediction market, leaderboard and generic AI chat interface.

## Research conclusions

1. Actor identity is more educational than gross inflow/outflow alone.
2. A coarse derived signal can be more honest than displaying a misleadingly precise USD number.
3. Overlapping past windows must be labeled as observations, not forecasts.
4. A deterministic rehearsal is valuable only when visibly separated from live data.
5. Nansen API calls should happen at player actions, with caching, deduplication, bounded concurrency and explicit budgets.

## Sources

- [Nansen API documentation](https://docs.nansen.ai/)
- [Nansen redistribution guide](https://docs.nansen.ai/guides/redistribution-guide)
- [Nansen API terms](https://nansen.ai/legal/api)
- [Meridian Buildathon campaign](https://nansen.ai/campaigns/meridian-buildathon)
- [Meridian Buildathon FAQ](https://academy.nansen.ai/articles/3540155-nansen-meridian-buildathon-sep-14-27)
