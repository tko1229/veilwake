# Veilwake release report

Generated 2026-09-27T12:51:31.252Z (UTC) by `scripts/prepare-release.mjs` on Node v22.23.3 (win32).

- This script changed only `media/veilwake-buildathon-60s.mp4` (copied into repo) in the source checkout, plus dependency/build output. Local machine paths are omitted from public release metadata.
- Bundle folder: `veilwake-github-ready`
- ZIP: `veilwake-github-ready.zip`. Its SHA-256 is printed in the console, not stored here, because this file is inside the ZIP.
- Repository URL: `https://github.com/tko1229/veilwake` (format checked only; public visibility NOT verified)

## Local checks

All local checks passed on this machine.

| Check | Status |
|---|---|
| `npm ci --include=dev` | PASS (95.1 s) |
| `npm test` | PASS (23.1 s) |
| `npm run typecheck` | PASS (39.6 s) |
| `npm run build` | PASS (51.9 s) |

## Video

- Bundle path: `media/veilwake-buildathon-60s.mp4`, 46.25 MiB (48497462 bytes), under GitHub's 100 MiB hard limit.
- This file is over GitHub's 25 MiB **browser-upload** limit. Add it with `git push`, not the web uploader.
- Duration (from mvhd): 60.000 s. Required: 30-60 s, with ±0.001 s tolerance.
- Dimensions (from tkhd): 1920x1080
- SHA-256: `86d0501a4748bda7b095bea3d5a8ec96e0ea42e24e9c184a40edce2f85d11648`
- **What the video is:** an edited walkthrough built from live-run screenshots with crops, captions and overlays. It is **not** a continuous, unedited screen recording.
- This script checks the file's container metadata only. **Someone still needs to watch the whole video** to confirm live Nansen data is visible and no keys, notifications or private content appear.

## Snapshot and secret scan

- 64 allowlisted files (47.03 MiB). Old Git history, node_modules, dist, .runtime, outputs, .env, logs, ZIPs, hidden files, symlinks and caches are excluded. Raw telemetry was never read.
- Secret scan: PASS. Real `.env` values compared: 1 (values never printed; placeholders skipped). Also scanned for private-key blocks and GitHub-token patterns.
- Excluded entries: 7. The full list is in `release-manifest.json`.

## X post

- `X-POST.txt`: READY (repository URL inserted; publication not verified). Weighted length 249/280 (URLs count as 23).

## Remaining external gates (this script did NOT do any of these)

1. Watch the full MP4. If judges need a continuous screen recording rather than an edited walkthrough, record one.
2. Publish the source (this script ran no git commands):
   - **New, empty public repository** (no auto-generated README/license/.gitignore): start a fresh history inside this bundle folder (`git init -b main`), review `git status`, commit and push.
   - **Existing repository:** clone it into a separate folder, copy these files in while keeping its `.git` and unrelated work, review the diff, then commit and push normally. Do **not** force-push or replace its history with this snapshot.
3. While signed out, open the repo and confirm README, source, `.env.example` and the video all load. Never upload `.env` or any API key.
4. Confirm the URL in `X-POST.txt` matches the live repository.
5. Publish the X post from your own account with the MP4 attached and the `@nansen_ai` tag. Copy the post URL.
6. Submit your email, the X post URL and the GitHub URL through the official entry form.
7. Confirm the Nansen API-call threshold in account analytics, and check the deadline on the live entry page.
