# Inspectable mechanics

The authoritative rules are in `shared/engine.ts` (hazard, modifiers, alerts, calls, consequences) and `shared/intel.ts` (Nansen view → clue derivation). This document explains that code; it does not replace it. This is a fictional engineering model, **not a token-risk score or predictive market model**.

## Cohort observations to strengths

Each of six Flow Intelligence cohort net flows (Smart Traders, Top PnL, Whales, Exchanges, Fresh Wallets, Public Figures) is independently converted to a direction (`in/out/flat/unknown`) and an absolute-strength band:

- nonfinite, nonnumeric or missing: `unknown`, force `null`;
- magnitude below $1: force 0;
- $1 to below $10,000: force 1;
- $10,000 to below $1,000,000: force 2;
- $1,000,000 or above: force 3.

Direction remains the sign even at force 0. Values are not recoverable from the output. The thresholds are game design choices, not Nansen classifications. Cohorts can overlap, so their dollar amounts are **never summed**.

## Market snapshot (Token Screener)

The browser receives price, 24h % change, buy/sell bias (sign of buy − sell volume), netflow direction and 0–3 bands. Band edges (band 0 below the first edge, band 3 at or above the last):

| Field | Edges (USD) |
|---|---|
| Volume | 100k · 10M · 100M |
| Liquidity | 100k · 1M · 10M |
| Market cap | 1M · 100M · 1B |
| \|Netflow\| | 10k · 1M · 10M |

## Observation horizons

Daily flow is the baseline and hourly flow is the planning context. After commitment, a 5-minute flow read resolves the wave. This reveals more recent evidence inside overlapping past windows; it is not waiting for a future event. Missing 5m values fall back to the same cohort's 1h value. Missing 1h and 5m values stay unknown. Fresh-wallet data comes only from the daily baseline. An all-empty 5m read stops resolution before any resource is spent. Toolkit views use their own past windows: trades 1h, buyers and transfers 24h, Smart Money holdings 7d, Profiler 30d, perp screener 24h.

The *trading guide* is the Smart Trader slot when it is available with positive force, otherwise Top PnL. Public-figure flow is contextual education and does not change pressure. No real entity is called a villain or accused of wrongdoing.

## Base cohort hazard

Let `Gout`, `Wout`, `Ein` be the guide's outward strength, whale outward strength and exchange inward strength (after the 5m → 1h fallback). Let `U` be the number of unavailable slots among Smart Trader, Top PnL, Whale and Exchange.

```text
base = 3 + 3*Gout + 2*Wout + 2*Ein + U
+6 if guide out AND (whale in OR daily fresh wallets in)      -> The false calm
+4 if guide direction reverses between 1h context and 5m      -> Turning current
+2 if no key cohort has positive strength                     -> Uncharted water
base = clamp(base, 2, 32)
```

Narratives are deterministic: False calm, Turning current, Undertow (outward guide/whale), Crowded gates (exchange inward), Open current or Uncharted water. These are fictional translations, not transaction allegations.

## Modifiers

`modifiersFor` adds every non-cohort source. Each toolkit clue's value is the sum of its triggered factors, clamped to the tool's bounds. An empty result or an "unavailable" view (upstream error, chain not covered, ledger missing) contributes **0** and is shown as such, never faked.

| Source | Nansen view | Rule | Bounds |
|---|---|---|---|
| Harbor | Token Screener | liquidity band 0 → +2; band 1 → +1 | 0..+2 |
| Storm glass (every reach) | Perp Screener, Smart Money, 24h, top 60 | `r = Σ net_position_change / Σ smart_money_volume`: r ≤ −8% Squall +2; r < −2% Headwind +1; r ≥ 5% and SM long share ≥ 60% Fair wind −1; else Crosswind 0; no data: Glass fogged 0 | −1..+2 |
| Perp shadow (per reach) | same response, token's own perp (symbol, or without a leading `W`/`CB`) | SM long share ≥ 65% → −1; ≤ 35% → +1; else 0; not listed 0 | −1..+1 |
| Dock ledger | Who Bought/Sold, BUY, 24h, top 25 by bought USD | `retention = Σ max(0, bought − sold) / Σ bought`: < 20% +2 (Churn); ≥ 60% −1 (Conviction). Largest buyer > 50% of bought +1 (One big hand). ≥ 1 smart-money-archetype net buyer −2 (Navigators aboard) | −2..+3 |
| Tide log | DEX Trades, 1h, 100 newest | sell share of value ≥ 60% +2 (Ebb tide); buy share ≥ 60% −1 (Flood tide); < 5 trades and no further page +1 (Thin tape); zero trades +1 (Slack water) | −1..+3 |
| Cargo manifest | Token Transfers, 24h, 25 largest by USD | deposits into exchange-labeled wallets − withdrawals ≥ 2 → +2; withdrawals − deposits ≥ 2 → −1; ≥ 2 sends from deployer/team wallets +1 | −1..+3 |
| Depth sounding | Flows, `smart_money`, 7d hourly | holdings change first → last ≤ −5% +2 (Distributing, direction out); ≥ +5% −1 (Accumulating, direction in); else 0 | −1..+2 |
| Captain's log | Profiler PnL summary, 30d, largest net buyer (not exchange or pool) | no realized trades and no tokens → +1 (No track record); realized PnL > 0 and win rate ≥ 50% or unknown → −1 (Seasoned); realized PnL < 0 → +1 (Struggling); else 0 | −1..+1 |
| Long ebb | Flows × Flow Intelligence | trend direction out AND guide out at resolution → +1 | +1 |
| Squall in a flood | Flows × Flow Intelligence | trend direction in AND guide out at resolution → −1 | −1 |

Raw labels are matched to archetypes (smart money, whale-class, exchange, deployer/team, pools & bots, high-activity, unlabeled, other) by keyword, then discarded.

## Total pressure and diversion

```text
pressure_i = clamp(base_i + Σ modifiers_i, 2, 40)
incoming_{i+1} += ceil(pressure_i × 0.55)   for each diverted reach i
total_i = pressure_i + incoming_i
```

Reaches divert clockwise in array order: Glass → Ember → Moss → Glass. Incoming pressure is not re-diverted, so a circular chain is finite and cannot erase externalities.

## Decisions and consequences

| Acted stance | Supply cost | Damage | Beacon charge |
|---|---:|---|---|
| Harvest | 0 | total | clamp(6 − floor(total / 8), 1, 6) |
| Brace | 1 | ceil(total × 0.28) | 1 |
| Divert | 2 | ceil(incoming × 0.5) | 0 |

Costs are validated **before** upstream requests. Revision checks and per-session locks prevent stale or concurrent actions from spending twice.

## Smart Alert (tripwire)

At most one alert per wave: `{laneId, condition}`, evaluated only on that reach's **5m** read (no 1h fallback; a missing cohort never fires):

- `smart_out`: Smart Trader direction out, force ≥ 1;
- `whale_out`: Whale direction out, force ≥ 1;
- `exchange_in`: Exchange direction in, force ≥ 2.

If it fires on a reach planned as **Harvest**, the acted stance becomes **Brace**. Brace damage, charge and efficiency apply, but no supply is charged because cost is taken from the submitted plan. If it fires on a Brace or Divert reach, it has no effect. The report states whether it fired, stayed quiet or switched the gate.

## Timeframe call

Per reach: `hold`, `turn` or `pass` (default). The UI offers it once a reach is scouted; the server validates only the reach and the choice. It is scored on the Smart Trader slot (not the guide):

```text
usable(s) = force != null AND direction in {in, out}
if pass OR !usable(1h) OR !usable(5m): no score
hold is right if 1h direction == 5m direction; turn is right otherwise
right: +12 points   wrong: −4 points
```

This replaced an earlier "next price" forecast, which was removed because it was not grounded in a Nansen response.

## Lenses, supply and doctrines

| Doctrine | Hull | Supply | Lenses |
|---|---:|---:|---:|
| Keeper | 100 | 6 | 5 |
| Cartographer | 85 | 6 | 8 |
| Engineer | 100 | 9 | 3 |

The overview (screener, whale/exchange, weather, perp shadow) is free. Flow Intelligence (scout) and each of the five toolkit views cost **1 lens** per reach, so a reach has at most 6 paid views. Profiler cannot be opened before Who Bought/Sold on the same reach. After each surviving wave: supply +3 (cap 12), lenses +2 (cap 10). Supply and charge are separate: harvesting does not refill supply.

## Fog and "seen"

During planning, `publicGame` strips unopened clues from the payload and, on unscouted reaches, every cohort except Whale and Exchange (context and baseline). After resolution the full state is returned. Each modifier carries `seen`: market, weather and perp are always seen. A toolkit clue is seen if opened. A combination is seen if Flows was opened and the reach was scouted. The pressure ledger prints `seen` / `not opened`. The report names the largest positive unopened toolkit clue, and if it was ≥ +2, the wave lesson becomes that view's lesson.

## Score

```text
per reach = max(0, charge*20 + (total − damage)*2 − damage + efficiency + call)
efficiency = 15 for acted Harvest at total ≤ 8, or acted Brace at total ≥ 12
```

A win requires hull > 0 and charge ≥ 18 after three waves. Victory adds `remaining hull × 3`. Hull 0 ends the run at the next result transition.

## Deterministic rehearsal acceptance

Keeper, plans B/H/B, H/B/B, B/B/H. Weather: Crosswind (0), Fair wind (−1), Headwind (+1).

| Wave | Total pressure Glass / Ember / Moss | Damage | Charge |
|---|---|---:|---:|
| 1 | 32 / 2 / 30 | 20 | 8 |
| 2 | 2 / 29 / 31 | 20 | 8 |
| 3 | 31 / 33 / 2 | 21 | 8 |

Result: **24 charge, 39 hull, 933 score, victory**. Blind harvesting reaches hull 0 in wave 2. All-brace survives with only 9 charge. Harvesting the false-calm reach under a *Smart traders exit* alert also wins: the alert fires and braces it for free. Reckless aggression and blanket defense are both deliberately suboptimal.

## Design limits

The baseline, hidden context, toolkit views and subsequent Nansen read all matter; identical visible whale readings can mask different guide behavior. A random-number substitution would remove the learning relationship and real actor-world causality, though any coded ruleset can technically be supplied synthetic inputs. The rehearsal intentionally proves mechanics using declared synthetic inputs. Originality means a differentiated interaction in the surveyed landscape, not a claim that no comparable game has ever existed.
