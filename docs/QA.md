# Quality assurance record

## Verification status

Last local verification:

- `npm test`: **82 passed, 0 failed** (26 September 2026, run with Bun's `node:test` compatibility on this machine).
- TypeScript `tsc --noEmit`: **passed**.
- Production Vite build: **passed** (26 September 2026).
- Browser tutorial path: a headless Chrome driver played all three chapters at 1440×900 by clicking only what the coach highlighted. Two lane preferences covered the happy path, the wrong-scout, divert and tape-says-no branches. Both runs finished in victory (945 points, which is the route plus one correct call) and logged no console errors. The narrow-viewport (390px) coach layout has not been re-checked since the tutorial rewrite.
- Under heavy CPU load, two HTTP tests (`all-empty 5m window`, `concurrent live creations`) can exceed Bun's default 5-second per-test timeout. They pass on an idle machine.
- Browser rehearsal path: exercised through three waves, consequence reports and victory in the acceptance harness.
- Browser live path: the production endpoint currently returns a live game with real token symbols and upstream request IDs. The full browser harness has an unresolved transport/session failure immediately after the rehearsal leg on this Windows environment, so it is not claimed as a full pass. A fresh buildathon key is still required for the final recording if the provider returns `401 Invalid API key`.

## Automated test coverage

### Pure engine

- missing and malformed cohort values stay unknown;
- independent quantization discards raw information;
- server fog hides context and baseline cohorts;
- scouting consumes one lens and cannot be duplicated;
- invalid and overspent plans are rejected;
- actor identity changes pressure even with the same gross direction;
- divert creates neighboring externality;
- informed rehearsal route wins;
- blind harvest route loses;
- all-brace route survives but misses the charge objective;
- missing live readings fail without mutating state;
- all 27 stance combinations remain finite and deterministic.

### Tutorial coach (`tests/coach.test.ts`)

- silent outside the rehearsal;
- every highlighted target matches a `data-coach` hook the UI actually renders, and the guard rejects unknown keys;
- chapter 1 follows the player through the whole workflow, and closing or switching panels re-points the highlight;
- copy quotes the clue actually opened (Glass reads "One big hand", never "churn");
- clicking an already-selected Harvest completes the step;
- work done early is credited, and planning steps vanish once a wave resolves;
- an off-script doctrine is flagged, and an empty lens budget turns a lens step into a skippable note;
- chapter 2 names a wrong scout's pattern, points at the open current, and keeps the Divert lesson done once tried;
- gate checks flag harvesting a false calm or undertow, diverting into a harvest, and harvesting nothing, and confirm a plan that matches;
- chapter 3 reveals the surface answer on request, steers away from a reach whose tape says no, and reasons by elimination;
- reports trace diversions, alerts, calls and missed views;
- the coached route wins, and the finale adapts to victory, a wrecked hull or a dark beacon, and to a server without a key.

### HTTP/world integration

- full demo lifecycle;
- validation before upstream calls;
- busy resolve lock;
- stale revision conflict;
- no token addresses or API key in public responses;
- same-origin and cross-port protection;
- admin-token protection;
- missing-key live failure;
- session expiry;
- empty 5m `503 canDemo` behavior;
- API-only rate limiting;
- pending max-session reservations;
- health defaults;
- official screener and flow payload shapes.

### Nansen transport

- retry behavior for 429 and 5xx;
- no retry for credential, credit or validation failures;
- long `Retry-After` refusal;
- header and body-read deadlines;
- malformed payload handling;
- one telemetry record per attempt;
- in-flight deduplication;
- bounded memory cache and 600-second cap;
- hourly/daily attempt budgets;
- persistence and recovery of operational telemetry;
- ordered reading loads.

## Browser acceptance flow

`scripts/browser-qa.mjs` runs a named browser session and records:

1. title screen has no first-time modal;
2. rehearsal is explicitly labeled fictional;
3. server response enforces fog;
4. scouting consumes a lens;
5. each of three waves resolves;
6. the false-calm pattern appears in the authored route;
7. deterministic victory reaches the expected charge;
8. live creation, provenance and no-raw-data checks;
9. refresh resumes the same session;
10. live resolution uses a 5m reading;
11. Engine room renders without `NaN`;
12. 390px and 768px layouts have no horizontal overflow;
13. browser and production console errors are absent.

The harness writes screenshots and `outputs/qa-evidence.json` only after a successful run. It intentionally does not silently replace a failed live call with rehearsal.

## Manual release checks

Before public submission:

- use a newly issued key and confirm it is absent from git history;
- run `npm ci`, `npm run build` and `npm test` from a clean checkout;
- record a live session showing actual token symbols, `LIVE DATA`, source proof and request IDs;
- inspect the compiled bundle for accidental `NANSEN_API_KEY` or raw token addresses;
- check current redistribution terms and obtain permission if the deployment scope changes;
- confirm account-level call analytics reaches the event threshold;
- test the protected Engine room with and without `ADMIN_TOKEN`;
- verify the official form and recording links before the deadline.

## Known blockers and honest limits

The browser live leg depends on provider credential validity and candidate coverage. A `401` is an expected explicit failure state, not a reason to fabricate live data. The application remains demonstrable through the labeled rehearsal, but the official buildathon recording must use valid live credentials.

The local test suite uses mocks and intentionally consumes zero Nansen credits. Local telemetry is not proof of the account-wide 1,000-call requirement.
