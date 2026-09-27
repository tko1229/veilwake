# VEILWAKE — hackathon submission kit

Prepared for the **Nansen Meridian Buildathon, 14–27 September 2026**. This is a preparation kit, not proof that an entry has been submitted. **The maintainer will fill in the official form personally.**

## Entry details

| Field | Value |
|---|---|
| Project | **VEILWAKE** |
| Creator | **tko1229 — solo project** |
| Tagline | **Read the current. Keep the lights on.** |
| Positioning | **Learn to investigate before you invest.** |
| Intended public repository | **https://github.com/tko1229/veilwake** — publish and verify before submitting |
| Demo file | [`media/veilwake-buildathon-60s.mp4`](../media/veilwake-buildathon-60s.mp4) |
| X post | Use [X_POST.md](X_POST.md) / the package's `X-POST.txt`, then copy the published post URL |
| Submission email | Enter your own email directly in the official form; do not commit it to the repository |
| Entry form | https://nansen-ai.typeform.com/meridian-submit |

## One-line pitch

**VEILWAKE is a playable introduction to Nansen: learn to investigate before you invest.** Eight Nansen API views power a fog-of-war strategy game where research choices have explainable consequences, then token links and copyable prompts help players continue on Nansen.

## Short description

A three-wave strategy game that turns Nansen's on-chain intelligence into a research challenge. Spend limited lenses investigating token-backed waterways, then harvest, defend or divert to protect a settlement. A pressure ledger explains what mattered—including evidence you missed. No wallet, wagers or trading execution.

## Copy-ready longer description

Nansen gives users powerful on-chain intelligence, but beginners still need to know which questions to ask. VEILWAKE turns that learning curve into a strategy game.

Protect a settlement across three waves. Eight server-side Nansen API views shape token-backed waterways: Token Screener, Flow Intelligence, Who Bought/Sold, DEX Trades, Token Transfers, Smart Money Flows, Profiler PnL summary and Perp Screener. Spend limited research lenses to compare cohorts, question buying activity, inspect transfers and check a buyer's track record. Then choose where to harvest, defend or divert.

After every wave, a pressure ledger explains each contribution and distinguishes evidence seen from views not opened. Mistakes cost fictional hull, not real capital. A clearly labeled, no-key rehearsal teaches the workflow; live voyages use actual Nansen observations. The end-screen logbook links tokens back to Nansen and supplies copyable research prompts.

The Node/Express server owns game state and keeps the API key private. Wallet addresses, raw labels and raw flow amounts are excluded from game JSON; token prices are visible, and player-clicked Nansen redirects expose only the relevant public token address. The repository includes installation instructions, mocked zero-credit tests and CI.

This is guided practice in research—not proven analyst training, price prediction or investment advice. Smart Alerts are modeled in-game; AI prompts are copied rather than sent through an AI integration.

## Why it stands out

- **Data integration:** Nansen's participant labels, cohort flows, buyer activity, transfers, holdings and wallet history influence bounded game-pressure terms. A price-only feed could not preserve these lessons.
- **Originality:** research is a scarce resource. A whale inflow can hide trader outflows; evidence matters because the player must act with incomplete knowledge.
- **Workability:** an authoritative server, explicit failure states, clearly separated rehearsal/live modes and an explainable consequence ledger. Live failure never silently becomes fictional data.
- **Documentation:** no-key quick start first, then the demo and player-value pitch, plus mechanics, architecture, data-handling notes, automated tests and publishing instructions.

Full pitch: [README](../README.md#player-value--hackathon-pitch) and [player-value notes](PITCH_PLAYER_VALUE.md).

## Demo video: include, review, then post

The supplied render is at `../veilwake-video/out/veilwake-buildathon-60s.mp4` relative to the original source project. The release command includes a copy at `media/veilwake-buildathon-60s.mp4` and validates its duration and size. The [technical video review](VIDEO_REVIEW.md) records a successful full-stream decode, 60.000-second duration, 1080p/30 fps and sampled-frame observations.

**Accurate description:** an **edited walkthrough assembled from screenshots of a live Nansen-powered voyage**, with animated crops, captions and cursor overlays. It is not a continuous screen recording. The [official help article](https://release.nansen.ai/help/articles/3540155-nansen-meridian-buildathon-sep-14-27) requests a **30–60s screen recording of the build running with live data visible**. The current file's duration does not resolve whether the organizers accept its screenshot-based format. Review the complete render and, if needed, replace it with direct live-app capture.

Attach the MP4 directly to the X post; keep the public GitHub URL and `@nansen_ai`. No narration is required. Never present the fictional tutorial as live data.

### If a replacement direct screen recording is needed

1. **0–5s:** title and attribution; enter the live current.
2. **5–12s:** real token symbols, `LIVE DATA`, Storm glass and Source proof.
3. **12–28s:** investigate a reach: Flow Intelligence → Buyers & Sellers → another supporting view → Profiler after the buyer ledger.
4. **28–38s:** choose stances, arm a Smart Alert and resolve.
5. **38–50s:** show the pressure ledger and `seen` / `not opened` evidence.
6. **50–60s:** show the completed voyage's research logbook, Open on Nansen and copyable prompt. Cuts may shorten the run, but do not fabricate interaction or outcomes.

A live run spends real Nansen credits. Record only after checking the configured account and budget. Live outcomes vary; do not guarantee a specific win.

## Rules checked on 27 September 2026

| Requirement | Preparation / remaining action |
|---|---|
| Public GitHub source and README | Clean package prepared for the intended URL; publish and check while signed out |
| Working build with live Nansen integration | Run local mocked checks; review the supplied live-data footage; fresh paid live QA is not part of packaging |
| Nansen API usage during the event | Campaign says **1,000 calls**, help article says **100+**; use **1,000** and verify in account analytics |
| X demo post | Tag **@nansen_ai**, include repo URL, attach **30–60s recording**; publish and save the post URL |
| Final entry | Maintainer submits email, X URL and GitHub URL; **one submission per account** |
| Deadline | Help article: **27 September, 23:59 UTC** = **28 September, 01:59 CEST in Frankfurt** for 2026; verify the live form |

Sources: [campaign](https://nansen.ai/campaigns/meridian-buildathon), [official help article](https://release.nansen.ai/help/articles/3540155-nansen-meridian-buildathon-sep-14-27), [entry form](https://nansen-ai.typeform.com/meridian-submit).

Earlier project notes recorded 1,044 successful local upstream requests on 26 September 2026. That is **historical local evidence**, not a current official account count or proof of eligibility. Package preparation does not generate new API usage or independently certify the historical live runs. See the generated `RELEASE_REPORT.md` for actual offline check results.

## Final checklist

- [ ] Review the clean package and release report; never upload the original `.git`, `.env`, `.runtime` or dependency folders.
- [ ] Verify API-call eligibility in Nansen account analytics and recheck applicable API redistribution terms.
- [ ] Watch the entire MP4, check readability and privacy, and resolve the edited-walkthrough versus screen-recording requirement.
- [ ] Publish **https://github.com/tko1229/veilwake** as public using GitHub Desktop or Git (the video is too large for the web uploader).
- [ ] Check the README, installation instructions, pitch and video links while signed out; wait for GitHub Actions to pass.
- [ ] Publish the [X draft](X_POST.md) with the video attached and `@nansen_ai`; copy the post URL.
- [ ] Fill in the official form yourself before the deadline and save confirmation.

These boxes are intentionally not marked complete without verification. [PUBLISHING.md](PUBLISHING.md) gives step-by-step upload instructions.
