# Nansen data handling and compliance posture

This is the project's implementation posture against Nansen documentation consulted on 26 September 2026, including the [redistribution guide](https://docs.nansen.ai/guides/redistribution-guide). It is not legal advice or a substitute for Nansen approval.

## Endpoint choices

VEILWAKE calls exactly eight official one-credit endpoints, all server-side:

| Endpoint | Purpose | Redistribution status | What the browser receives |
|---|---|---|---|
| `POST /api/v1/token-screener` | Discovery + market snapshot | Allowed with attribution | Symbol, chain, price, 24h % change, 0–3 volume/liquidity/market-cap/netflow bands, buy/sell bias |
| `POST /api/v1/tgm/flow-intelligence` | Six cohort flows, 1d/1h/5m | Allowed with attribution | Per cohort: direction + 0–3 band; timeframe, timestamp, request ID |
| `POST /api/v1/tgm/who-bought-sold` | Dock ledger | Allowed with attribution | Verdict; retention %, top-buyer share %, Smart Money net-buyer count, archetype mix counts |
| `POST /api/v1/tgm/dex-trades` | Tide log | Allowed with attribution | Verdict; trade count, buy share by value/count %, labeled-trader share % |
| `POST /api/v1/tgm/transfers` | Cargo manifest | Allowed with attribution | Verdict; counts into/out of exchange-labeled wallets, from deployer/team, touching pools/contracts |
| `POST /api/v1/tgm/flows` | Depth sounding (Smart Money holdings) | Allowed with attribution | Verdict; 7d holdings change %, SM holder count first → last, snapshot count |
| `POST /api/v1/profiler/address/pnl-summary` | Captain's log | Allowed | Verdict; realized trade count, tokens traded, win rate %, PnL sign (positive/negative/flat) |
| `POST /api/v1/perp-screener` | Storm glass + perp shadow | Allowed with attribution | Weather name; markets read, SM long share %, SM net flow as % of volume, median funding; per-reach long/short share on the matched perp |

The guide writes two paths in shorthand (`tgm/token-screener`, `tgm/perp-screener`); the REST contracts are the paths above. Every clue also carries provenance (endpoint, window, fetch time, request ID, cache flag) for Source proof. Attribution: the UI visibly links **Powered by Nansen API** to `nansen.ai`.

### Not used, and why

- **Holders:** the Smart Money filter is *Restricted* (approval + significant modification) and costs 5 credits. Concentration is taught through the ledger's "one big hand" instead.
- **Nansen Indicators:** not listed in the redistribution guide, and a risk/reward score inside a game would read like investment advice.
- **PnL Leaderboards:** *Prohibited* for redistribution. The Top PnL cohort in Flow Intelligence carries the idea without naming wallets.
- Portfolio, Points, Trading and Prediction Markets are excluded by design (no wallet, no rewards for activity, no execution, no wagers). Smart Alerts and Watchlists are **modelled** as game mechanics and explained in the Field Manual. The game creates no alert or watchlist on Nansen.

Before a public or commercial launch, re-check the latest terms and redistribution guide and obtain written approval for this transformed educational use.

## Processing boundary

The API key exists only in `.env` and only the Node server reads it. There is no `VITE_` secret, key in the compiled bundle, token-address client route, generic upstream proxy or raw-response log.

Every response is reduced immediately in `shared/intel.ts` / `shared/engine.ts`:

```text
screener row       -> market snapshot (price, % change, bands, bias)
flow row           -> six {cohort, direction, force|null}
toolkit rows       -> Clue {verdict, detail, bounded pressure, derived facts}
perp screener rows -> weather + per-symbol long share (server-only map)
                                   -> game pressure
```

- **Labels:** raw Nansen labels (`address_label`, `trader_address_label`, `from/to_address_label`) are mapped by keyword to eight coarse archetypes and then discarded. Only archetype names and counts appear in facts.
- **Addresses:** token contract addresses stay in server session memory. The largest net buyer's wallet address is selected from the ledger server-side, used once as the Profiler request body and held only in the memory cache key (≤ 10 minutes). It is never serialized to the browser, logged or persisted.
- **Amounts and hashes:** USD values are reduced to ratios, counts, signs or 0–3 bands; transaction hashes are never read into game state.
- **Fog:** `publicGame` removes unopened clues and hidden cohorts from every planning-phase payload.
- **Tests** assert that addresses and raw labels never appear in public game state.

The output cannot be reverse engineered into USD values; direction is retained because it is the mechanic. Cohorts are not treated as disjoint wallets or summed as capital. Unavailable views become "unavailable" clues worth 0 pressure, never substituted data. Fictional hazards and settlement outcomes are computed locally and never described as Nansen findings.

### The redirect exception

The only place a token contract address leaves the server is `GET /api/game/:id/nansen/:wave/:laneId`. It answers an explicit player click ("Open on Nansen") with an HTTP 302 to the token's public page, `https://app.nansen.ai/token-god-mode?chain=…&tokenAddress=…`. It only answers for waves the voyage has already reached, so it cannot be used to peek ahead. In rehearsal it redirects to `https://app.nansen.ai/tokens`. The address never appears in game JSON, and wallet addresses are never exposed this way.

## Retention

- Derived readings and clues live in memory only, for a maximum ten-minute TTL.
- Sessions expire after 10 minutes idle or 20 minutes absolute and are swept.
- `.runtime/telemetry.json` is ignored and contains operational counts, endpoint names, status codes, request IDs, observed credit headers and chains, not raw data, addresses or keys. Delete it if Nansen requests deletion of derived operational evidence.
- Browser localStorage holds only the session ID, mode, tutorial flag, local player counters and the names of practiced skills. It does not store token addresses, readings, clues or provenance.
- There is no permanent database, export, replay archive, public leaderboard or API redistributor.

The [API Terms](https://nansen.ai/legal/api) prohibit permanent or cached copies beyond documented timeframes, external combinations without written permission, AI/model training, and substantially similar or competing Nansen products. VEILWAKE does not train or improve an AI system, use a model, make a copy-trading tool, or present a wallet/smart-money dashboard. The Nansen AI research prompt on the end screen is plain text the player may copy into Nansen's own product; VEILWAKE sends nothing to any model. The game is a differentiated interaction over transformed readings. For a public or commercial launch beyond this challenge, seek written permission and review the latest terms.

## Honest boundaries

Nansen's own terms say data may be delayed, classifications are probabilistic and may change, and the service is not investment advice. VEILWAKE explains those limits in the Field Manual, Rules and Source proof. It labels rehearsal fixtures as fictional, renders missing data as `?` or "unavailable", scores the timeframe call only against the real 5m response, and never claims a specific transaction just happened.

Buildathon eligibility (public repository, screen recording and account-level call requirement) is separate from API redistribution permission. A maintainer must complete any required Nansen approval or submission steps before publishing a public deployment.
