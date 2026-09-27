# Publish VEILWAKE

VEILWAKE is a solo project by [tko1229](https://github.com/tko1229). The intended public repository is **https://github.com/tko1229/veilwake**. That name is a publishing target, not a claim that the repository already exists.

**Preparation does not publish anything.** The maintainer publishes the repository and X post and fills in the hackathon form personally. Never share passwords, personal access tokens or the Nansen API key in chat or repository files.

## 1. Use the clean upload folder

If a verified `veilwake-github-ready` folder has already been supplied, use that folder—not the original workspace—and read its `RELEASE_REPORT.md`. The adjacent ZIP is a backup/transfer copy. **Do not upload only the ZIP to GitHub:** judges need browsable source and a rendered README.

The package includes:

```text
README.md, LICENSE, .env.example, .gitignore, .gitattributes
package.json, package-lock.json, index.html, tsconfig.json, vite.config.ts
src/, server/, shared/, tests/, scripts/, docs/
.github/workflows/ci.yml
media/demo-poster.svg
media/veilwake-buildathon-60s.mp4
RELEASE_REPORT.md, release-manifest.json, X-POST.txt
```

The clean snapshot excludes `.env`, `.git` history, `.runtime`, `node_modules`, `dist`, logs, private-key files, unrelated directories and development screenshots. `.env.example` contains placeholders only.

### Regenerate a package (maintainers)

Install Node **22.13+** and npm. Open a terminal **in the project root** (the folder containing `package.json`):

```powershell
npm run prepare:release -- --repo-url "https://github.com/tko1229/veilwake"
```

The script uses the video already in `media/` when present; otherwise it looks in the sibling video project at `../veilwake-video/out/veilwake-buildathon-60s.mp4`.

To explicitly select another render and a new output folder:

```powershell
npm run prepare:release -- --video "../veilwake-video/out/veilwake-buildathon-60s.mp4" --repo-url "https://github.com/tko1229/veilwake" --output "../veilwake-github-ready"
```

Existing output folders/ZIPs are never overwritten. An identical repository video is retained; replacing a different video needs `--replace-video`. `scripts/prepare-release.cmd` is a Windows shortcut once Node is installed.

The preparation command:

1. Validates the MP4 container duration (**30–60 seconds**) and GitHub's **100 MiB** file limit.
2. Scans selected files for local Nansen/admin secrets and recognizable credential patterns, without printing secrets.
3. Runs `npm ci --include=dev`, `npm test`, `npm run typecheck` and `npm run build`. Including development dependencies explicitly ensures TypeScript/Vite are present even in a production-default shell. These checks do **not** run live Nansen smoke/voyage commands or consume Nansen credits.
4. Places the MP4 in `media/`, checks relative documentation links, and copies an allowlisted snapshot into a new sibling folder.
5. Creates a ZIP, SHA-256 manifest, release report and `X-POST.txt` with a weighted-length check.

`--skip-checks` produces an explicitly **UNVERIFIED** package, not a tested release. A secret scan is a safeguard, not a guarantee or a substitute for reviewing what you publish.

## 2. Review the video and eligibility

The supplied MP4 is an **edited walkthrough of live-voyage screenshots**, with animated crops, captions and cursor overlays. It is not a continuous recording of interaction. Its duration is checked automatically, but the [official help article](https://release.nansen.ai/help/articles/3540155-nansen-meridian-buildathon-sep-14-27) specifically requests a **30–60s screen recording with live Nansen data visible**.

Watch the full video before posting. Confirm readable live data, investigation → decision → consequence, clean opening/ending, and no secrets, notifications or unrelated private content. If the organizers do not accept the edited screenshot-based format, use a direct capture of the working live application instead. Do not describe this render as an unedited screen recording.

The [campaign](https://nansen.ai/campaigns/meridian-buildathon) asks for **1,000 API calls**, while the official help article says **100+**. Use the stricter **1,000 event-window calls** target and verify the count in the Nansen account's analytics. Historical local counters are not authoritative eligibility proof. This packaging workflow makes no new paid API calls.

## 3. Publish to GitHub

### Easiest: GitHub Desktop

1. Install [GitHub Desktop](https://desktop.github.com/) and sign in to your `tko1229` account yourself through the browser.
2. Choose **File → Add local repository** and select the clean upload folder.
3. Because the clean folder intentionally has no `.git`, Desktop may offer **create a repository here**. Use that option and ensure the resulting local repository path is exactly the clean folder, not a new nested directory. Keep the supplied README, license and `.gitignore`.
4. Review the file list. It should contain source, docs and the MP4—not `.env`, `.runtime`, dependencies or the ZIP. Commit any remaining changes with a message such as `Prepare VEILWAKE hackathon submission`.
5. Choose **Publish repository**, set the repository name to `veilwake`, and **uncheck “Keep this code private.”** Select your own account and publish.
6. If `tko1229/veilwake` already exists remotely, do not publish a replacement. Clone that repository into a separate folder, copy the prepared files into the clone without replacing its `.git` or unrelated work, review the changes, commit and push normally.

For this Desktop route, you do **not** need to create the repository on GitHub first. The MP4 is about 46 MiB: it is below GitHub's normal Git limit, but above the **25 MiB browser-upload limit**. Use Desktop or Git; do not rely on the web uploader for the video.

### Alternative: Git CLI

Create a new **public, empty** repository named `veilwake` on GitHub without an automatically generated README, license or `.gitignore`. Then run these commands **inside the clean upload folder**:

```powershell
git init -b main
git add .
git status --short
git diff --cached --stat
git commit -m "Prepare VEILWAKE hackathon submission"
git remote add origin https://github.com/tko1229/veilwake.git
git push -u origin main
```

Use your own commit identity. Authenticate locally through GitHub's browser/device flow or GitHub Desktop; do not paste credentials into files or commands recorded in chat. Never force-push or replace existing repository history for this task.

### After publication

- Open `https://github.com/tko1229/veilwake` while signed out and verify that it is public.
- Check the rendered README, pitch, installation instructions, `.env.example` and clickable MP4 link. The poster is a video link, not an embedded player guaranteed on every GitHub interface.
- Wait for **Verify build** in GitHub Actions to pass. It uses mocked tests and needs no Nansen secret.
- Confirm there is no `.env`, private runtime data or unexpected file in the published repository. Rotate any key that was ever exposed; deleting a visible file alone is not sufficient.
- GitHub Pages cannot host this full application: VEILWAKE needs its Node/Express server. The public source repository is sufficient for code review and separate from an optional live deployment.

## 4. Post on X, then fill in the form

1. Copy `X-POST.txt` from the prepared package or use [X_POST.md](X_POST.md). Verify the repo URL is correct and public.
2. Attach `media/veilwake-buildathon-60s.mp4` **directly** to the X post and keep the `@nansen_ai` tag. A GitHub video link alone is not the requested X attachment.
3. Publish from your own X account and copy the public post URL.
4. **The maintainer fills in the [official entry form](https://nansen-ai.typeform.com/meridian-submit)** with email, X post URL and public GitHub URL. One submission per account.
5. Save the confirmation. The help article gives the deadline as **27 September, 23:59 UTC**—**28 September, 01:59 CEST in Frankfurt** for the 2026 cycle. Recheck the live form before submitting.

Copy-ready descriptions and the checklist: [SUBMISSION.md](SUBMISSION.md). Data-use boundaries: [COMPLIANCE.md](COMPLIANCE.md).
