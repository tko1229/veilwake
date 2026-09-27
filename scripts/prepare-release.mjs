#!/usr/bin/env node
// Veilwake release preparation - dependency-free, Node >= 22.
// Usage: node scripts/prepare-release.mjs --help
// Never runs git, never publishes, never overwrites existing output, never prints secret values.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF_REL = 'scripts/prepare-release.mjs';
const VIDEO_NAME = 'veilwake-buildathon-60s.mp4';
const VIDEO_REL = `media/${VIDEO_NAME}`;
const POSTER_REL = 'media/demo-poster.svg';
const MIB = 1024 * 1024;
const MAX_FILE_BYTES = 100 * MIB; // GitHub hard per-file limit
const WEB_UPLOAD_BYTES = 25 * MIB; // GitHub browser-upload limit
const DURATION_MIN = 30, DURATION_MAX = 60, DURATION_EPS = 0.001; // tiny rounding tolerance only
const X_LIMIT = 280, X_URL_WEIGHT = 23;
const PLACEHOLDER_URL = 'https://github.com/OWNER/REPOSITORY';
const ROOT_FILES = ['README.md', 'LICENSE', '.gitignore', '.gitattributes', '.env.example', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'index.html'];
const ROOT_DIRS = ['src', 'server', 'shared', 'tests', 'scripts', 'docs', 'media', '.github'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'outputs', 'coverage', 'tmp', 'temp', 'logs', 'telemetry', '__pycache__',
  'bower_components', 'jspm_packages', 'playwright-report', 'test-results', 'release', 'releases']);
const SKIP_FILE = /(\.(log|zip|pem|key|p8|p12|pfx|jks|keystore|tsbuildinfo|jsonl|ndjson|sqlite3?|db)$)|(^(id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|npm-debug.*|yarn-error.*)$)/i;
// Always scanned as text (plus any other file without NUL bytes in its first 8 KiB).
const TEXT_EXT = /(\.(md|txt|json|ts|tsx|js|mjs|cjs|css|html|svg|ya?ml|cmd|bat|ps1|sh|example)|^LICENSE|^\.git(ignore|attributes))$/i;
const STORE_EXT = /\.(mp4|mov|png|jpe?g|gif|webp|zip|gz|woff2?)$/i;
const CHECKS = [['npm ci --include=dev', ['ci', '--include=dev']], ['npm test', ['test']], ['npm run typecheck', ['run', 'typecheck']], ['npm run build', ['run', 'build']]];
// Marker regexes are assembled from fragments so this file's own source never matches them.
const PK_RE = new RegExp('-----BEGIN ' + '(?:[A-Z0-9]+ )*PRIVATE KEY-----\\s*[A-Za-z0-9+/=]{60,}');
const GH_RE = new RegExp('\\b(?:gh' + '[pousr]_[A-Za-z0-9]{36,255}|github' + '_pat_[A-Za-z0-9_]{80,})\\b', 'g');
const MOCK_RE = /(fake|mock|dummy|example|sample|test|x{6,}|0{6,}|123456|abcdef)/i;

const HELP = `Usage: node scripts/prepare-release.mjs [options]
  --video <file>     MP4 to publish (default: media/${VIDEO_NAME}, then sibling ../veilwake-video/out/${VIDEO_NAME})
  --repo-url <url>   Public https://github.com/OWNER/REPO URL, inserted into X-POST.txt
  --output <dir>     NEW bundle folder outside the repo (default: ../veilwake-release-YYYYMMDD-HHMMSS, UTC);
                     <dir>.zip is written alongside it
  --replace-video    Allow replacing a different ${VIDEO_REL} already in the repo
  --skip-checks      Skip npm ci/test/typecheck/build (bundle is marked UNVERIFIED, not passed)
  -h, --help         Show this help
Never runs git, never publishes, never overwrites an existing folder or ZIP.`;

class ReleaseError extends Error {}
const fail = (msg) => { throw new ReleaseError(msg); };
const log = (msg) => console.log(msg);
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const exists = (p) => { try { fs.lstatSync(p); return true; } catch { return false; } };
const mib = (n) => `${(n / MIB).toFixed(2)} MiB`;
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = typeof zlib.crc32 === 'function' ? (b) => zlib.crc32(b) >>> 0
  : (b) => { let c = ~0; for (const x of b) c = CRC_TABLE[(c ^ x) & 0xff] ^ (c >>> 8); return ~c >>> 0; };
const created = { out: null, zip: null };
const warnings = [];

function parseArgs(argv) {
  const o = { skipChecks: false, replaceVideo: false, help: false };
  const valued = { '--video': 'video', '--repo-url': 'repoUrl', '--output': 'output' };
  for (let i = 0; i < argv.length; i++) {
    const eq = argv[i].indexOf('=');
    const k = eq > 0 ? argv[i].slice(0, eq) : argv[i];
    let v = eq > 0 ? argv[i].slice(eq + 1) : undefined;
    if ((k === '--help' || k === '-h') && v === undefined) o.help = true;
    else if (k === '--skip-checks' && v === undefined) o.skipChecks = true;
    else if (k === '--replace-video' && v === undefined) o.replaceVideo = true;
    else if (valued[k]) {
      if (v === undefined) v = argv[++i];
      if (!v || v.startsWith('--')) fail(`${k} needs a value`);
      if (o[valued[k]] !== undefined) fail(`${k} given twice`);
      o[valued[k]] = v;
    } else fail(k.startsWith('-') ? `Unknown option ${k} (see --help)` : 'Unexpected positional argument (see --help)');
  }
  return o;
}

function validateRepoUrl(u) {
  const m = /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/([A-Za-z0-9._-]{1,100})$/.exec(u);
  if (!m || /^\.+$/.test(m[2]) || /\.git$/i.test(m[2])) fail('--repo-url must be exactly https://github.com/OWNER/REPO (no credentials, query, fragment, trailing slash or .git)');
  if (u === PLACEHOLDER_URL) fail('--repo-url is still the OWNER/REPOSITORY placeholder');
  return u;
}

// Bounds-checked ISO-BMFF box iterator (32-bit, 64-bit and to-end sizes).
function* boxes(buf, start, end) {
  for (let p = start; p + 8 <= end;) {
    let size = buf.readUInt32BE(p), head = 8;
    const type = buf.toString('latin1', p + 4, p + 8);
    if (size === 1) {
      if (p + 16 > end) fail('MP4: truncated 64-bit box header');
      const big = buf.readBigUInt64BE(p + 8);
      if (big > BigInt(end - p)) fail(`MP4: box ${JSON.stringify(type)} exceeds its parent`);
      size = Number(big); head = 16;
    } else if (size === 0) size = end - p;
    if (size < head || p + size > end) fail(`MP4: malformed box ${JSON.stringify(type)}`);
    yield { type, start: p + head, end: p + size };
    p += size;
  }
}

function parseMp4(buf) {
  const top = [...boxes(buf, 0, buf.length)];
  if (top[0]?.type !== 'ftyp') fail('Video is not an MP4 (no leading ftyp box)');
  const moov = top.find((b) => b.type === 'moov') ?? fail('MP4 has no moov box');
  const kids = [...boxes(buf, moov.start, moov.end)];
  const mvhd = kids.find((b) => b.type === 'mvhd') ?? fail('MP4 has no mvhd box');
  const v = buf[mvhd.start];
  if ((v !== 0 && v !== 1) || mvhd.end - mvhd.start < (v === 1 ? 32 : 20)) fail('MP4 mvhd is unsupported or truncated');
  const timescale = buf.readUInt32BE(mvhd.start + (v === 1 ? 20 : 12));
  const dur = v === 1 ? buf.readBigUInt64BE(mvhd.start + 24) : BigInt(buf.readUInt32BE(mvhd.start + 16));
  if (!timescale || dur === 0n || dur === (v === 1 ? 0xffffffffffffffffn : 0xffffffffn)) fail('MP4 mvhd has an unknown duration or timescale');
  let width = null, height = null;
  for (const trak of kids.filter((b) => b.type === 'trak')) {
    const tkhd = [...boxes(buf, trak.start, trak.end)].find((b) => b.type === 'tkhd');
    const off = tkhd && (buf[tkhd.start] === 1 ? 88 : 76); // width/height are 16.16 fixed point
    if (tkhd && tkhd.end - tkhd.start >= off + 8) {
      const w = buf.readUInt32BE(tkhd.start + off) >>> 16, h = buf.readUInt32BE(tkhd.start + off + 4) >>> 16;
      if (w && h) { width = w; height = h; break; }
    }
  }
  return { timescale, durationSeconds: Number(dur) / timescale, width, height };
}

// Reads only NANSEN_API_KEY / ADMIN_TOKEN from .env; values stay in memory and are never printed.
function loadRealSecrets() {
  const envPath = path.join(REPO, '.env');
  if (!exists(envPath)) return [];
  if (!fs.lstatSync(envPath).isFile()) { warnings.push('.env is not a regular file; real-value comparison skipped'); return []; }
  const parse = (file) => {
    const out = {};
    if (!exists(file) || !fs.lstatSync(file).isFile()) return out;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?(NANSEN_API_KEY|ADMIN_TOKEN)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      const raw = m[2].trim(), q = /^(['"])(.*)\1$/.exec(raw);
      out[m[1]] = q ? q[2] : raw.replace(/\s+#.*$/, '').trim();
    }
    return out;
  };
  const real = parse(envPath), example = parse(path.join(REPO, '.env.example'));
  const placeholder = /^(?:your|replace|change|placeholder|example|dummy|sample|fake|mock|test|todo|none|null|xxx|<|\$\{)/i;
  return Object.entries(real)
    .filter(([k, v]) => v.length >= 8 && !placeholder.test(v) && !/^(.)\1+$/.test(v) && v !== example[k])
    .map(([name, v]) => ({ name, bytes: Buffer.from(v, 'utf8') }));
}

function collect() {
  const files = [], excluded = [];
  const walk = (relDir) => {
    const entries = fs.readdirSync(path.join(REPO, relDir), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const d of entries) {
      const rel = `${relDir}/${d.name}`;
      if (d.isSymbolicLink()) excluded.push({ path: rel, reason: 'symlink' });
      else if (d.name.startsWith('.') && d.name !== '.gitkeep') excluded.push({ path: rel, reason: 'hidden' });
      else if (d.isDirectory()) SKIP_DIRS.has(d.name) ? excluded.push({ path: rel, reason: 'dependency/build/cache/log dir' }) : walk(rel);
      else if (!d.isFile()) excluded.push({ path: rel, reason: 'not a regular file' });
      else if (SKIP_FILE.test(d.name)) excluded.push({ path: rel, reason: 'excluded file type' });
      else files.push(rel);
    }
  };
  // Every allowlisted root entry is required: missing, symlinked/junctioned or wrong-type entries abort (never silently skipped).
  for (const name of [...ROOT_FILES, ...ROOT_DIRS]) {
    const abs = path.join(REPO, name), isDir = ROOT_DIRS.includes(name);
    if (!exists(abs)) fail(`Required root ${isDir ? 'folder' : 'file'} is missing: ${name}`);
    const st = fs.lstatSync(abs);
    if (st.isSymbolicLink() || (isDir ? !st.isDirectory() : !st.isFile())) fail(`Root entry ${name} is a symlink/junction or unexpected type; refusing to bundle`);
    if (isDir) walk(name); else files.push(name);
  }
  for (const name of fs.readdirSync(REPO).sort()) {
    if (!ROOT_FILES.includes(name) && !ROOT_DIRS.includes(name)) excluded.push({ path: name, reason: 'not allowlisted' });
  }
  return { files, excluded };
}

function scan(files, secrets) {
  const findings = [], meta = [];
  for (const rel of files) {
    const buf = fs.readFileSync(path.join(REPO, rel));
    if (buf.length >= MAX_FILE_BYTES) findings.push(`${rel}: >= 100 MiB (GitHub hard limit)`);
    for (const s of secrets) if (buf.includes(s.bytes)) findings.push(`${rel}: contains the real ${s.name} value from .env`);
    // Generic markers skip only this file (its patterns are split anyway); real .env values are checked everywhere.
    const isText = rel !== SELF_REL && buf.length < 5 * MIB && (TEXT_EXT.test(path.posix.basename(rel)) || !buf.subarray(0, 8192).includes(0));
    if (isText) {
      const text = buf.toString('utf8');
      if (PK_RE.test(text)) findings.push(`${rel}: private key block`);
      for (const m of text.matchAll(GH_RE)) {
        if (!MOCK_RE.test(m[0]) && new Set(m[0].slice(4)).size >= 12) { findings.push(`${rel}: GitHub token-shaped string`); break; }
      }
    }
    meta.push({ path: rel, bytes: buf.length, sha256: sha256(buf) });
  }
  if (findings.length) fail(`Secret/size scan blocked the release (filenames only):\n  - ${findings.join('\n  - ')}`);
  return meta;
}

function brokenDocLinks(files) {
  const set = new Set(files), out = [];
  for (const rel of files.filter((f) => f.endsWith('.md'))) {
    for (const [, target] of fs.readFileSync(path.join(REPO, rel), 'utf8').matchAll(/\]\(([^)\s#]+)(?:#[^)\s]*)?\)/g)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
      let t; try { t = decodeURIComponent(target); } catch { t = target; }
      const p = path.posix.normalize(t.startsWith('/') ? t.slice(1) : path.posix.join(path.posix.dirname(rel), t)).replace(/\/$/, '');
      if (!set.has(p) && !files.some((f) => f.startsWith(`${p}/`))) out.push(`${rel} -> ${target}`);
    }
  }
  return out;
}

function runChecks(skip) {
  if (skip) return CHECKS.map(([name]) => ({ name, status: 'UNVERIFIED', note: 'skipped via --skip-checks' }));
  const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  return CHECKS.map(([name, args]) => {
    log(`\n> ${name}`);
    const t0 = Date.now(), opts = { cwd: REPO, stdio: 'inherit', timeout: 20 * 60_000 };
    const r = exists(npmCli) ? spawnSync(process.execPath, [npmCli, ...args], opts) // no shell needed
      : process.platform === 'win32' ? spawnSync(`npm.cmd ${args.join(' ')}`, { ...opts, shell: true }) // fixed literal args only
      : spawnSync('npm', args, opts);
    if (r.error || r.status !== 0) fail(`${name} failed (${r.error ? r.error.code || 'spawn error' : `exit ${r.status ?? r.signal}`}); nothing was bundled`);
    return { name, status: 'PASS', seconds: Math.round((Date.now() - t0) / 100) / 10 };
  });
}

function buildPost(repoUrl) {
  const md = path.join(REPO, 'docs', 'X_POST.md');
  if (!exists(md)) fail('docs/X_POST.md not found');
  const m = /```text[ \t]*\r?\n([\s\S]*?)\r?\n```/.exec(fs.readFileSync(md, 'utf8')) ?? fail('docs/X_POST.md has no ```text code block');
  let text = m[1].replace(/\r\n/g, '\n').trim();
  if (!/^[\n\x20-\x7e]*$/.test(text)) fail('X post draft must be printable ASCII');
  const hasPlaceholder = text.includes(PLACEHOLDER_URL);
  if (repoUrl) {
    const urls = text.match(/https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/g) ?? [];
    if (urls.length !== 1) fail('docs/X_POST.md draft must contain exactly one GitHub repository URL to replace');
    text = text.replace(urls[0], repoUrl);
  }
  const weighted = text.replace(/https?:\/\/\S+/g, 'x'.repeat(X_URL_WEIGHT)).length; // ASCII => weight 1 per char
  if (weighted > X_LIMIT) fail(`X post weighted length ${weighted} exceeds ${X_LIMIT}`);
  const status = repoUrl ? 'READY (repository URL inserted; publication not verified)' : hasPlaceholder ? 'PLACEHOLDER - OWNER/REPOSITORY must be replaced before posting' : 'AS DRAFTED (verify the proposed repository URL)';
  return { text, weighted, status };
}

function writeZip(zipPath, rootName, entries) {
  const fd = fs.openSync(zipPath, 'wx');
  created.zip = zipPath;
  const d = new Date(), central = [];
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  let offset = 0;
  const put = (buf) => { for (let w = 0; w < buf.length;) w += fs.writeSync(fd, buf, w, buf.length - w); offset += buf.length; };
  try {
    if (entries.length >= 0xffff) fail('Too many files for a non-ZIP64 archive');
    for (const { rel, abs } of entries) {
      const data = fs.readFileSync(abs), name = Buffer.from(`${rootName}/${rel}`, 'utf8');
      const deflated = STORE_EXT.test(rel) ? null : zlib.deflateRawSync(data, { level: 9 });
      const store = !deflated || deflated.length >= data.length, body = store ? data : deflated;
      if (offset + 30 + name.length + body.length > 0xfffffff0) fail('ZIP would exceed 4 GiB (ZIP64 unsupported)');
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); // UTF-8 names
      local.writeUInt16LE(store ? 0 : 8, 8); local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12);
      local.writeUInt32LE(crc32(data), 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22);
      local.writeUInt16LE(name.length, 26);
      const cd = Buffer.alloc(46);
      cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); local.copy(cd, 6, 4, 30); cd.writeUInt32LE(offset, 42);
      central.push(Buffer.concat([cd, name]));
      put(local); put(name); put(body);
    }
    const cdBuf = Buffer.concat(central), cdOffset = offset;
    put(cdBuf);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(central.length, 8); eocd.writeUInt16LE(central.length, 10);
    eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(cdOffset, 16);
    put(eocd);
  } finally { fs.closeSync(fd); }
  return { bytes: offset, sha256: sha256(fs.readFileSync(zipPath)) };
}

function report(ctx) {
  const { iso, out, zip, repoUrl, checks, video, files, excluded, post, secretsCompared, videoAction } = ctx;
  const verified = checks.every((c) => c.status === 'PASS');
  const total = files.reduce((n, f) => n + f.bytes, 0);
  const lines = [
    '# Veilwake release report', '',
    `Generated ${iso} (UTC) by \`${SELF_REL}\` on Node ${process.version} (${process.platform}).`, '',
    `- This script changed only \`${VIDEO_REL}\` (${videoAction}) in the source checkout, plus dependency/build output. Local machine paths are omitted from public release metadata.`,
    `- Bundle folder: \`${path.basename(out)}\``,
    `- ZIP: \`${path.basename(zip)}\`. Its SHA-256 is printed in the console, not stored here, because this file is inside the ZIP.`,
    `- Repository URL: ${repoUrl ? `\`${repoUrl}\` (format checked only; public visibility NOT verified)` : '**not supplied - verify the URL in the X draft**'}`, '',
    '## Local checks', '',
    verified ? 'All local checks passed on this machine.' : '> **UNVERIFIED:** checks were skipped with `--skip-checks`. This is **not** a pass.', '',
    '| Check | Status |', '|---|---|',
    ...checks.map((c) => `| \`${c.name}\` | ${c.status}${c.seconds != null ? ` (${c.seconds} s)` : ''}${c.note ? ` - ${c.note}` : ''} |`), '',
    '## Video', '',
    `- Bundle path: \`${VIDEO_REL}\`, ${mib(video.bytes)} (${video.bytes} bytes), under GitHub's 100 MiB hard limit.`,
    ...(video.bytes > WEB_UPLOAD_BYTES ? ['- This file is over GitHub\'s 25 MiB **browser-upload** limit. Add it with `git push`, not the web uploader.'] : []),
    `- Duration (from mvhd): ${video.durationSeconds.toFixed(3)} s. Required: ${DURATION_MIN}-${DURATION_MAX} s, with ±${DURATION_EPS} s tolerance.`,
    `- Dimensions (from tkhd): ${video.width ? `${video.width}x${video.height}` : 'not detected'}`,
    `- SHA-256: \`${video.sha256}\``,
    '- **What the video is:** an edited walkthrough built from live-run screenshots with crops, captions and overlays. It is **not** a continuous, unedited screen recording.',
    '- This script checks the file\'s container metadata only. **Someone still needs to watch the whole video** to confirm live Nansen data is visible and no keys, notifications or private content appear.', '',
    '## Snapshot and secret scan', '',
    `- ${files.length} allowlisted files (${mib(total)}). Old Git history, node_modules, dist, .runtime, outputs, .env, logs, ZIPs, hidden files, symlinks and caches are excluded. Raw telemetry was never read.`,
    `- Secret scan: PASS. Real \`.env\` values compared: ${secretsCompared} (values never printed; placeholders skipped). Also scanned for private-key blocks and GitHub-token patterns.`,
    `- Excluded entries: ${excluded.length}. The full list is in \`release-manifest.json\`.`,
    ...(warnings.length ? ['', '**Warnings:**', ...warnings.map((w) => `- ${w}`)] : []), '',
    '## X post', '',
    `- \`X-POST.txt\`: ${post.status}. Weighted length ${post.weighted}/${X_LIMIT} (URLs count as ${X_URL_WEIGHT}).`, '',
    '## Remaining external gates (this script did NOT do any of these)', '',
    '1. Watch the full MP4. If judges need a continuous screen recording rather than an edited walkthrough, record one.',
    '2. Publish the source (this script ran no git commands):',
    '   - **New, empty public repository** (no auto-generated README/license/.gitignore): start a fresh history inside this bundle folder (`git init -b main`), review `git status`, commit and push.',
    '   - **Existing repository:** clone it into a separate folder, copy these files in while keeping its `.git` and unrelated work, review the diff, then commit and push normally. Do **not** force-push or replace its history with this snapshot.',
    '3. While signed out, open the repo and confirm README, source, `.env.example` and the video all load. Never upload `.env` or any API key.',
    `4. ${repoUrl ? 'Confirm the URL in `X-POST.txt` matches the live repository.' : 'Re-run with `--repo-url` (or edit `X-POST.txt`) to replace the OWNER/REPOSITORY placeholder.'}`,
    '5. Publish the X post from your own account with the MP4 attached and the `@nansen_ai` tag. Copy the post URL.',
    '6. Submit your email, the X post URL and the GitHub URL through the official entry form.',
    '7. Confirm the Nansen API-call threshold in account analytics, and check the deadline on the live entry page.', '',
  ];
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return log(HELP);
  const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
  if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 13)) fail(`Node >= 22.13 is required (found ${process.version})`);
  if (JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).name !== 'veilwake') fail('Script is not inside the veilwake repository');
  const repoUrl = args.repoUrl ? validateRepoUrl(args.repoUrl) : null;
  const iso = new Date().toISOString();
  const stamp = `${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 19).replace(/:/g, '')}`;
  const out = path.resolve(args.output ?? path.join(path.dirname(REPO), `veilwake-release-${stamp}`));
  const zip = `${out}.zip`;
  const inside = (child, parent) => { const r = path.relative(parent, child); return !r || (r !== '..' && !r.startsWith(`..${path.sep}`) && !path.isAbsolute(r)); };
  const parent = path.dirname(out);
  if (!exists(parent) || !fs.statSync(parent).isDirectory()) fail(`Output parent folder does not exist: ${parent}`);
  if (inside(out, REPO) || inside(path.join(fs.realpathSync(parent), path.basename(out)), fs.realpathSync(REPO))) fail('--output must be outside the source repository');
  for (const p of [out, zip]) if (exists(p)) fail(`Refusing to overwrite existing ${p}`);

  log('Validating video...');
  const bundledVideo = path.join(REPO, VIDEO_REL);
  const videoSrc = path.resolve(args.video ?? (exists(bundledVideo) ? bundledVideo : path.join(REPO, '..', 'veilwake-video', 'out', VIDEO_NAME)));
  if (!exists(videoSrc)) fail(`Video not found: ${videoSrc}`);
  const vst = fs.lstatSync(videoSrc);
  if (vst.isSymbolicLink() || !vst.isFile()) fail(`Video must be a regular file, not a symlink: ${videoSrc}`);
  if (vst.size >= MAX_FILE_BYTES) fail(`Video is ${mib(vst.size)}; GitHub's hard per-file limit is 100 MiB`);
  const videoBuf = fs.readFileSync(videoSrc);
  const mp4 = parseMp4(videoBuf);
  if (mp4.durationSeconds < DURATION_MIN - DURATION_EPS || mp4.durationSeconds > DURATION_MAX + DURATION_EPS) fail(`Video duration ${mp4.durationSeconds.toFixed(3)} s is outside ${DURATION_MIN}-${DURATION_MAX} s`);
  const videoHash = sha256(videoBuf);
  const mediaDir = path.join(REPO, 'media');
  const assertMediaDir = () => { if (!exists(mediaDir) || !fs.lstatSync(mediaDir).isDirectory()) fail('media/ must be a real folder, not a symlink/junction'); };
  assertMediaDir();
  const videoDst = path.join(mediaDir, VIDEO_NAME);
  let videoAction = 'copied into repo';
  if (exists(videoDst)) {
    const st = fs.lstatSync(videoDst);
    if (st.isSymbolicLink() || !st.isFile()) fail(`${VIDEO_REL} exists but is not a regular file`);
    if (sha256(fs.readFileSync(videoDst)) === videoHash) videoAction = 'identical copy already present, kept';
    else if (args.replaceVideo) videoAction = 'replaced via --replace-video';
    else fail(`${VIDEO_REL} already exists with different content; re-run with --replace-video to replace it`);
  }
  const posterAbs = path.join(REPO, ...POSTER_REL.split('/'));
  if (!exists(posterAbs) || !fs.lstatSync(posterAbs).isFile()) fail(`${POSTER_REL} is missing or not a regular file`);
  const post = buildPost(repoUrl);

  log('Pre-flight secret scan...');
  const secrets = loadRealSecrets();
  scan(collect().files, secrets);

  const checks = runChecks(args.skipChecks);

  if (!videoAction.startsWith('identical')) {
    assertMediaDir(); // re-check right before writing into the source repo
    if (videoAction.startsWith('copied') && exists(videoDst)) fail(`${VIDEO_REL} appeared during checks; re-run`);
    const tmp = path.join(mediaDir, `.${VIDEO_NAME}.${process.pid}.tmp`);
    let wroteTmp = false;
    try { fs.writeFileSync(tmp, videoBuf, { flag: 'wx' }); wroteTmp = true; fs.renameSync(tmp, videoDst); wroteTmp = false; }
    finally { if (wroteTmp) fs.rmSync(tmp, { force: true }); }
    if (sha256(fs.readFileSync(videoDst)) !== videoHash) fail(`${VIDEO_REL} verification failed after copy`);
    log(`Video ${videoAction}: ${VIDEO_REL}`);
  }

  log('Final snapshot scan...');
  const { files: relFiles, excluded } = collect();
  const files = scan(relFiles, secrets);
  for (const req of [VIDEO_REL, POSTER_REL, SELF_REL, 'scripts/prepare-release.cmd', '.github/workflows/ci.yml', 'docs/X_POST.md', 'docs/PUBLISHING.md']) {
    if (!relFiles.includes(req)) fail(`Required file missing from snapshot: ${req}`);
  }
  for (const b of brokenDocLinks(relFiles)) warnings.push(`Broken relative doc link: ${b}`);

  log(`Writing bundle ${out}`);
  fs.mkdirSync(out); // non-recursive: fails if it already exists
  created.out = out;
  for (const f of files) {
    const dst = path.join(out, ...f.path.split('/'));
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(REPO, ...f.path.split('/')), dst, fs.constants.COPYFILE_EXCL);
    if (sha256(fs.readFileSync(dst)) !== f.sha256) fail(`${f.path} changed while copying; re-run`);
  }
  const video = { source: path.basename(videoSrc), bytes: videoBuf.length, sha256: videoHash, ...mp4 };
  const manifest = {
    schema: 'veilwake-release-manifest/1', generatedAtUtc: iso, tool: SELF_REL, node: process.version, platform: process.platform,
    sourceRepo: 'local source checkout (machine path omitted)', output: path.basename(out), zip: path.basename(zip), repoUrl, repoUrlPublicVerified: false,
    checks, checksVerified: checks.every((c) => c.status === 'PASS'),
    video: { ...video, bundlePath: VIDEO_REL, repoAction: videoAction, nature: 'edited walkthrough of live-run screenshots; not a continuous screen recording; manual watch required' },
    poster: files.find((f) => f.path === POSTER_REL),
    xPost: { file: 'X-POST.txt', status: post.status, weightedLength: post.weighted, limit: X_LIMIT, urlWeight: X_URL_WEIGHT },
    secretScan: { status: 'PASS', realEnvValuesCompared: secrets.length, markers: ['private-key block', 'GitHub token'] },
    warnings, files, excluded,
    notPerformed: ['git init/stage/commit/push', 'GitHub publication or visibility check', 'X post', 'entry-form submission', 'API key upload', 'watching the video'],
  };
  const generated = [
    ['X-POST.txt', `${post.text}\n`],
    ['release-manifest.json', `${JSON.stringify(manifest, null, 2)}\n`],
    ['RELEASE_REPORT.md', report({ iso, out, zip, repoUrl, checks, video, files, excluded, post, secretsCompared: secrets.length, videoAction })],
  ];
  for (const [name, body] of generated) fs.writeFileSync(path.join(out, name), body, { flag: 'wx' });

  log('Writing ZIP...');
  const entries = [...files.map((f) => f.path), ...generated.map(([n]) => n)].map((rel) => ({ rel, abs: path.join(out, ...rel.split('/')) }));
  const z = writeZip(zip, path.basename(out), entries);

  log(`\nDone. ${files.length} source files + 3 generated files.`);
  log(`  Folder : ${out}\n  ZIP    : ${zip} (${mib(z.bytes)}, sha256 ${z.sha256})`);
  log(`  Checks : ${manifest.checksVerified ? 'PASS' : 'UNVERIFIED (--skip-checks)'}`);
  log(`  Video  : ${mp4.durationSeconds.toFixed(2)} s, ${mib(video.bytes)}${mp4.width ? `, ${mp4.width}x${mp4.height}` : ''} (edited walkthrough - watch it before posting)`);
  log(`  X post : ${post.status}, ${post.weighted}/${X_LIMIT}`);
  for (const w of warnings) log(`  WARN   : ${w}`);
  log('Nothing was committed, pushed or posted. See RELEASE_REPORT.md for the remaining external gates.');
}

try { main(); } catch (e) {
  try { if (created.zip) fs.rmSync(created.zip, { force: true }); if (created.out) fs.rmSync(created.out, { recursive: true, force: true }); } catch { /* best effort */ }
  const msg = e instanceof ReleaseError ? e.message : e?.code ? `${e.code}: ${e.message}` : `${e?.name ?? 'Error'} (unexpected; details suppressed to avoid leaking content)`;
  console.error(`\nERROR: ${msg}`);
  process.exitCode = 1;
}
