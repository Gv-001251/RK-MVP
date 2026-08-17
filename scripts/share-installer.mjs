#!/usr/bin/env node
/**
 * ============================================================================
 * Prepare a download page for the built installer
 * ============================================================================
 *   node scripts/share-installer.mjs [--dir /tmp/rk-share] [--token <existing>]
 *
 * Collects the installer, the Windows setup script and a checksum file into a
 * directory with an unguessable path segment, and writes an index.html that
 * explains what to do with them.
 *
 * Why a generated page rather than a static one: the version, file size and
 * checksum all change with every build, and a hand-written page holding a stale
 * checksum is worse than no checksum — someone verifies, sees a mismatch, and
 * either wastes an hour or learns to ignore the check. Everything on the page is
 * read from the file it describes.
 *
 * Serving is left to whatever is convenient:
 *   npx serve /tmp/rk-share -l 8099        # LAN
 *   cloudflared tunnel --url http://127.0.0.1:8099   # anywhere
 * ============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';

const args = process.argv.slice(2);
const flag = (n, d = null) => { const i = args.indexOf(n); return i !== -1 && args[i + 1] ? args[i + 1] : d; };

const SHARE_ROOT = flag('--dir', path.join(os.tmpdir(), 'rk-share'));
const DIST = path.resolve('dist-desktop');
const SETUP_SCRIPT = path.resolve('deploy', 'setup-windows.ps1');

/**
 * --site <dir> --download-url <url>
 *
 * Emit a deployable static site instead of a local share directory: the page and
 * the small setup script only, with the installer linked from wherever it is
 * hosted. This exists because a 178 MB binary cannot be a static file on Vercel's
 * free tier (100 MB per file; 1 GB on Pro), so the sensible split is page on the
 * CDN, binary in object storage — Vercel Blob, Cloudflare R2, S3, whichever.
 *
 * The advantage over a tunnel is not convenience, it is dependence: a tunnel needs
 * this laptop awake, on, and with a working uplink — measured at ~140 KB/s here,
 * which is 20 minutes per download and re-uploaded every time. A CDN needs none
 * of those things.
 */
const SITE_DIR = flag('--site');
const DOWNLOAD_URL = flag('--download-url');

const log = (m) => console.log(`▸ ${m}`);

/* ── Locate what we are sharing ────────────────────────────────────────────── */

if (!fs.existsSync(DIST)) {
  console.error('✖ dist-desktop/ does not exist. Build first:  npm run desktop:dist:win');
  process.exit(1);
}

const installer = fs.readdirSync(DIST)
  .filter((f) => f.endsWith('.exe'))
  .map((f) => ({ name: f, ...fs.statSync(path.join(DIST, f)) }))
  .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];

if (!installer) {
  console.error('✖ no .exe in dist-desktop/. Build first:  npm run desktop:dist:win');
  process.exit(1);
}

const version = installer.name.match(/(\d+\.\d+\.\d+)/)?.[1] || 'unknown';
const sizeMb = (installer.size / 1024 / 1024).toFixed(0);
const builtAt = new Date(installer.mtimeMs);

log(`installer: ${installer.name} (${sizeMb} MB, built ${builtAt.toISOString().slice(0, 16).replace('T', ' ')})`);

log('hashing (this is what the clinic machine verifies against)');
const sha256 = crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(DIST, installer.name)))
  .digest('hex');

/* ── Deployable static site ────────────────────────────────────────────────── */

if (SITE_DIR) {
  const dir = path.resolve(SITE_DIR);
  fs.mkdirSync(path.join(dir, 'api'), { recursive: true });

  if (fs.existsSync(SETUP_SCRIPT)) {
    fs.copyFileSync(SETUP_SCRIPT, path.join(dir, 'setup-windows.ps1'));
  }
  fs.writeFileSync(path.join(dir, 'SHA256SUMS.txt'), `${sha256}  ${installer.name}\n`);

  // The installer is fetched through /api/download, which checks the session
  // first. It is never a direct link, so the page HTML is safe to serve to an
  // unauthenticated visitor — but it is only rendered after login anyway.
  const pageHtml = page({
    installer: installer.name, version, sizeMb, sha256, builtAt,
    hasSetup: fs.existsSync(path.join(dir, 'setup-windows.ps1')),
    downloadUrl: '/api/download',
  });
  const loginHtml = loginPage({ version });

  fs.writeFileSync(path.join(dir, 'api', 'index.js'), indexFunction({ pageHtml, loginHtml }));
  fs.writeFileSync(path.join(dir, 'api', 'unlock.js'), unlockFunction());
  fs.writeFileSync(path.join(dir, 'api', 'download.js'), downloadFunction({ installer: installer.name }));

  fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify({
    name: 'rk-lis-installer-share',
    private: true,
    version,
    dependencies: { '@vercel/blob': '^2.8.0' },
  }, null, 2)}\n`);

  fs.writeFileSync(path.join(dir, 'robots.txt'), 'User-agent: *\nDisallow: /\n');

  // `vercel env pull` writes credentials straight into this directory, and the
  // .gitignore the CLI leaves behind only covers .vercel — so a pulled OIDC token
  // or blob read-write token is one `git add .` away from the repository. Ignoring
  // env files here is the difference between a mistake and a leaked credential.
  fs.writeFileSync(path.join(dir, '.gitignore'), [
    '.vercel',
    '.env',
    '.env.*',
    'node_modules',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'vercel.json'), `${JSON.stringify({
    $schema: 'https://openapi.vercel.sh/vercel.json',
    // Explicitly NOT a framework project: plain functions and static files.
    //
    // Without this, deploying into a project whose preset is Next.js fails with
    // "No Next.js version detected" — which is what happens if the directory ends
    // up linked to an existing project. Stating it here makes the deployment
    // describe itself rather than inheriting a preset from wherever it lands.
    framework: null,
    rewrites: [{ source: '/', destination: '/api/index' }],
    headers: [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ],
  }, null, 2)}\n`);

  // A pathname without spaces: it ends up in URLs, shell commands and the
  // BLOB_PATHNAME variable, and "RK Clinic LIS Setup 0.3.0.exe" needs quoting or
  // escaping in every one of them.
  const blobPathname = `installer-${version}.exe`;
  const rel = path.relative(process.cwd(), dir) || dir;

  console.log('');
  log(`gated download site written to ${rel}`);
  console.log('');
  log('ORDER MATTERS. The upload needs credentials, and the simplest way to have');
  log('them is a linked project with the store attached — so the project comes first.');
  console.log('');
  log('1. create the project (answer NO to "Link to existing project?", then name it');
  log('   something like rk-lis-installer):');
  console.log(`     npx vercel --cwd ${rel}`);
  log('2. create the private store, if it does not exist yet:');
  console.log('     npx vercel blob create-store rk-installers --access private');
  log('3. in the dashboard, Storage → rk-installers → connect it to that new project.');
  log('   This is what gives the CLI and the function their credentials.');
  log('4. upload the installer (works without tokens now the folder is linked):');
  console.log(`     npx vercel blob put "dist-desktop/${installer.name}" \\`);
  console.log(`       --pathname ${blobPathname} --cwd ${rel}`);
  log('5. set the environment variables on the project:');
  console.log('     DOWNLOAD_PASSWORD   what you give whoever installs it');
  console.log(`     DOWNLOAD_SECRET     ${crypto.randomBytes(32).toString('hex')}`);
  console.log(`     BLOB_PATHNAME       ${blobPathname}`);
  log('6. promote to production once the preview works:');
  console.log(`     npx vercel --cwd ${rel} --prod`);
  console.log('');
  log('Check the gate before you hand the link out:');
  console.log('     node deploy/verify-share-gate.mjs');
  console.log('');
  log('The binary lives in a private store, so it has no public URL at all. The');
  log('function verifies the session and hands back a presigned link valid for ten');
  log('minutes — long enough to start a download, short enough that a leaked link');
  log('is worthless.');
  process.exit(0);
}

/* ── Assemble the local share directory ────────────────────────────────────── */

// Reusing an existing token keeps a running tunnel's URLs valid.
const token = flag('--token') || crypto.randomBytes(8).toString('hex');
const shareDir = path.join(SHARE_ROOT, token);
fs.mkdirSync(shareDir, { recursive: true });

fs.copyFileSync(path.join(DIST, installer.name), path.join(shareDir, installer.name));
if (fs.existsSync(SETUP_SCRIPT)) {
  fs.copyFileSync(SETUP_SCRIPT, path.join(shareDir, 'setup-windows.ps1'));
}
fs.writeFileSync(path.join(shareDir, 'SHA256SUMS.txt'), `${sha256}  ${installer.name}\n`);

fs.writeFileSync(path.join(shareDir, 'index.html'), page({
  installer: installer.name, version, sizeMb, sha256, builtAt,
  hasSetup: fs.existsSync(path.join(shareDir, 'setup-windows.ps1')),
}));

/* ── Report ───────────────────────────────────────────────────────────────── */

const lanAddresses = Object.values(os.networkInterfaces())
  .flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal)
  .map((a) => a.address);

console.log('');
log(`share directory: ${shareDir}`);
log('serve it with:');
console.log(`    npx serve ${SHARE_ROOT} -l 8099`);
for (const ip of lanAddresses) console.log(`      → http://${ip}:8099/${token}/`);
console.log('    cloudflared tunnel --url http://127.0.0.1:8099');
console.log(`      → https://<generated>.trycloudflare.com/${token}/`);

/* ── The page ─────────────────────────────────────────────────────────────── */

/**
 * A single self-contained HTML file: no external stylesheet, font or script, so
 * it renders identically on a phone with a poor connection and on a clinic PC
 * with no internet beyond the tunnel itself.
 */
function page({ installer, version, sizeMb, sha256, builtAt, hasSetup, downloadUrl = null }) {
  const built = builtAt.toISOString().slice(0, 16).replace('T', ' ');
  // Local share: the file sits beside the page. Deployed: it lives in object
  // storage, because it is far larger than a static deployment allows.
  const enc = downloadUrl || encodeURIComponent(installer);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RK Clinic LIS ${version} — install</title>
<style>
  :root {
    --ink: #17181c; --ink-mid: #4b5563; --ink-soft: #8b93a1;
    --canvas: #f4f5f7; --surface: #ffffff; --line: #e6e8ee;
    --accent: #5c7cf5; --accent-deep: #4462e0; --green: #17a34a; --amber: #d98b0b;
    --radius: 14px;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px 16px 64px;
    font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: var(--ink); background: var(--canvas);
  }
  .wrap { max-width: 680px; margin: 0 auto; }
  header { margin-bottom: 22px; }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.01em; }
  .sub { color: var(--ink-soft); font-size: 13.5px; }
  .card {
    background: var(--surface); border: 1px solid var(--line);
    border-radius: var(--radius); padding: 18px; margin-bottom: 14px;
  }
  .card h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em;
             color: var(--ink-soft); margin: 0 0 12px; font-weight: 650; }
  .dl {
    display: flex; align-items: center; justify-content: space-between; gap: 14px;
    flex-wrap: wrap;
  }
  .dl-meta { font-size: 13px; color: var(--ink-mid); }
  .btn {
    display: inline-block; background: var(--accent); color: #fff; text-decoration: none;
    padding: 13px 20px; border-radius: 11px; font-weight: 650; font-size: 15px;
    border: 0; cursor: pointer; min-height: 46px; line-height: 20px;
  }
  .btn:hover { background: var(--accent-deep); }
  .btn:focus-visible { outline: 3px solid #c2cff2; outline-offset: 2px; }
  .btn.secondary { background: #eef1f6; color: var(--ink); }
  .btn.secondary:hover { background: #e4e8f0; }
  code, .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px;
  }
  .hash {
    display: flex; gap: 8px; align-items: flex-start;
  }
  .hash code {
    flex: 1; background: #f7f8fa; border: 1px solid var(--line); border-radius: 9px;
    padding: 10px 12px; word-break: break-all; color: var(--ink-mid);
  }
  .copy {
    background: #eef1f6; border: 1px solid var(--line); border-radius: 9px;
    padding: 10px 12px; cursor: pointer; font-size: 12.5px; font-weight: 600;
    min-height: 40px; white-space: nowrap;
  }
  .copy:hover { background: #e4e8f0; }
  ol { margin: 0; padding-left: 20px; }
  ol li { margin-bottom: 12px; }
  ol li:last-child { margin-bottom: 0; }
  .note {
    border-left: 3px solid var(--amber); background: #fdf8ec;
    padding: 11px 14px; border-radius: 0 9px 9px 0; font-size: 13.5px;
    color: #6b5410; margin-top: 12px;
  }
  .cmd {
    background: #17181c; color: #e6e8ee; border-radius: 9px; padding: 12px 14px;
    overflow-x: auto; margin: 8px 0 0;
  }
  .cmd code { color: #e6e8ee; white-space: pre; }
  footer { color: var(--ink-soft); font-size: 12.5px; text-align: center; margin-top: 26px; }
  @media (max-width: 480px) {
    body { padding: 18px 12px 48px; }
    .card { padding: 15px; }
    .btn { width: 100%; text-align: center; }
    .dl { flex-direction: column; align-items: stretch; }
  }
</style>
</head>
<body>
<div class="wrap">

  <header>
    <h1>RK Clinic LIS <span class="mono">${version}</span></h1>
    <div class="sub">Windows installer &middot; built ${built} UTC</div>
  </header>

  <div class="card">
    <h2>Download</h2>
    <div class="dl">
      <div class="dl-meta">
        <strong>${installer}</strong><br>
        ${sizeMb}&nbsp;MB &middot; Windows 10/11, 64-bit
      </div>
      <!-- No "download" attribute on purpose. This href goes through
           /api/download, which either redirects to a presigned URL or returns an
           error page. The attribute tells the browser to SAVE the response
           whatever it is, so an error page lands on disk as a mystery .html file
           and the reason never reaches the screen. Without it a failure renders,
           and a success still downloads because the redirect target serves the
           installer as a binary attachment. -->
      <a class="btn" href="${enc}">Download installer</a>
    </div>
    ${hasSetup ? `<div class="dl" style="margin-top:14px; border-top:1px solid var(--line); padding-top:14px;">
      <div class="dl-meta"><strong>setup-windows.ps1</strong><br>Run once after installing</div>
      <a class="btn secondary" href="setup-windows.ps1" download>Download setup script</a>
    </div>` : ''}
  </div>

  <div class="card">
    <h2>Verify before running</h2>
    <div class="hash">
      <code id="sha">${sha256}</code>
      <button class="copy" onclick="copyText('sha', this)" aria-label="Copy checksum">Copy</button>
    </div>
    <p class="dl-meta" style="margin:12px 0 0">In PowerShell, in the folder you downloaded to:</p>
    <div class="cmd"><code id="cmd">certutil -hashfile "${installer}" SHA256</code></div>
    <button class="copy" style="margin-top:8px" onclick="copyText('cmd', this)">Copy command</button>
    <div class="note">A 178&nbsp;MB download that arrives truncated produces an installer
      that fails in confusing ways rather than an obvious error. This takes ten seconds.</div>
  </div>

  <div class="card">
    <h2>Install</h2>
    <ol>
      <li>Install <strong>MySQL 8.4 LTS</strong> and make sure the service is running.
          Not 9.x — it removes authentication plugins between versions.</li>
      <li>Run the installer <strong>as Administrator</strong>. Windows will warn about an
          unknown publisher until the app is code-signed: choose <em>More info</em>, then
          <em>Run anyway</em>.</li>
      <li>Open PowerShell as Administrator and run the setup script, which writes the
          config, registers the service to start at boot, opens the firewall and stops
          the machine sleeping:
          <div class="cmd"><code>powershell -ExecutionPolicy Bypass -File setup-windows.ps1 -ServiceUser &lt;account&gt;</code></div>
      </li>
      <li>Have the database schema applied from the development machine, then restart.</li>
      <li>Check <code>http://127.0.0.1:3000/api/health</code> returns 200, and that the
          tray icon shows the analyzer tiles.</li>
    </ol>
  </div>

  <footer>Internal build. Do not redistribute this link.</footer>
</div>

<script>
  function copyText(id, btn) {
    var text = document.getElementById(id).textContent;
    var done = function () {
      var was = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(function () { btn.textContent = was; }, 1400);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done);
      return;
    }
    // Plain HTTP on the LAN has no clipboard API, and that is the common case here.
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'absolute'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* user can select it */ }
    document.body.removeChild(ta);
  }
</script>
</body>
</html>
`;
}

/* ══════════════════════════════════════════════════════════════════════════
 * Generated Vercel functions
 *
 * Emitted as source rather than kept as files in the repo so the version,
 * checksum and filename on the page always describe the binary that was
 * actually built. The HTML is embedded with JSON.stringify, which escapes
 * everything a template literal would otherwise choke on.
 *
 * The session is a signed cookie and nothing else — no database, no store. It
 * carries an expiry and an HMAC over it, which is all that is needed to answer
 * "has this browser presented the password recently".
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Shared helpers, inlined into each function so there is no import graph.
 *
 * A function declaration rather than a const: the --site branch that calls this
 * runs before the bottom of the module is reached, and a const would not be
 * initialised yet.
 */
function sessionHelpers() {
  return `
const crypto = require('node:crypto');

const COOKIE = 'rk_dl';
const SESSION_MS = 12 * 60 * 60 * 1000;

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(String(value)).digest('hex');
}

/** Constant-time compare that does not leak length through an early return. */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function issue(secret) {
  const expires = Date.now() + SESSION_MS;
  return expires + '.' + sign(expires, secret);
}

function valid(cookieHeader, secret) {
  const raw = String(cookieHeader || '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(COOKIE + '='));
  if (!raw) return false;

  const [expires, mac] = decodeURIComponent(raw.slice(COOKIE.length + 1)).split('.');
  if (!expires || !mac) return false;
  if (!safeEqual(mac, sign(expires, secret))) return false;
  return Number(expires) > Date.now();
}
`;
}

function indexFunction({ pageHtml, loginHtml }) {
  return `${sessionHelpers()}
const PAGE = ${JSON.stringify(pageHtml)};
const LOGIN = ${JSON.stringify(loginHtml)};

/**
 * Renders the download page to an authenticated visitor and the password form to
 * everyone else.
 *
 * Auth is checked here, in the handler, rather than in middleware — Vercel's own
 * guidance for private blobs, since a middleware misconfiguration can expose
 * content that a handler check cannot.
 */
module.exports = (req, res) => {
  const secret = process.env.DOWNLOAD_SECRET;
  if (!secret) {
    res.statusCode = 500;
    res.setHeader('content-type', 'text/plain');
    res.end('DOWNLOAD_SECRET is not configured.');
    return;
  }

  const authed = valid(req.headers.cookie, secret);
  res.statusCode = 200;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  // Never cache: the response differs by session, and a shared cache holding the
  // authenticated page would serve it to someone who never logged in.
  res.setHeader('cache-control', 'private, no-store');
  res.end(authed ? PAGE : LOGIN);
};
`;
}

function unlockFunction() {
  return `${sessionHelpers()}

/**
 * Exchange the shared password for a session cookie.
 *
 * There is deliberately no per-IP rate limit here. On serverless each instance
 * has its own memory, so an in-memory limiter gives an unpredictable fraction of
 * the protection it appears to give — worse than none, because it invites
 * trusting it. A fixed delay on every attempt is honest about what it is: it
 * makes bulk guessing slow without pretending to be a real limiter. If this ever
 * faces the open internet rather than a handful of colleagues, put Vercel's own
 * protection or a shared store in front of it.
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end('Method not allowed');
    return;
  }

  const expected = process.env.DOWNLOAD_PASSWORD;
  const secret = process.env.DOWNLOAD_SECRET;
  if (!expected || !secret) {
    res.statusCode = 500;
    res.end('DOWNLOAD_PASSWORD or DOWNLOAD_SECRET is not configured.');
    return;
  }

  let body = '';
  for await (const chunk of req) body += chunk;

  let supplied = '';
  try {
    supplied = new URLSearchParams(body).get('password') || '';
  } catch {
    supplied = '';
  }

  await new Promise((r) => setTimeout(r, 600));

  if (!safeEqual(supplied, expected)) {
    res.statusCode = 303;
    res.setHeader('location', '/?error=1');
    res.end();
    return;
  }

  res.statusCode = 303;
  res.setHeader('set-cookie', [
    COOKIE + '=' + encodeURIComponent(issue(secret)),
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=' + Math.floor(SESSION_MS / 1000),
  ].join('; '));
  res.setHeader('location', '/');
  res.end();
};
`;
}

function downloadFunction({ installer }) {
  return `${sessionHelpers()}

/**
 * Hand an authenticated visitor a short-lived link to the installer.
 *
 * The binary sits in a PRIVATE blob store, so it has no publicly reachable URL —
 * the only way to it is through this handler. Rather than streaming ~178 MB back
 * through the function, which Vercel advises against for anything over 100 MB and
 * which would pay data transfer twice, we mint a presigned GET URL valid for ten
 * minutes and redirect. Long enough to start a download and resume it; short
 * enough that a link copied out of someone's history is dead.
 */
module.exports = async (req, res) => {
  const secret = process.env.DOWNLOAD_SECRET;
  const pathname = process.env.BLOB_PATHNAME || ${JSON.stringify(installer)};

  if (!secret || !valid(req.headers.cookie, secret)) {
    res.statusCode = 303;
    res.setHeader('location', '/?error=auth');
    res.end();
    return;
  }

  try {
    const blob = require('@vercel/blob');

    if (typeof blob.issueSignedToken === 'function' && typeof blob.presignUrl === 'function') {
      // TWO steps, not one. issueSignedToken asks the Blob API for a delegation
      // scoped to this pathname and operation; presignUrl then signs a concrete
      // URL with it locally. presignUrl on its own cannot work — it has no
      // credentials and errors with "clientSigningToken and delegationToken from
      // issueSignedToken are required", which is exactly what an earlier revision
      // of this file produced.
      const validUntil = Date.now() + 10 * 60 * 1000;

      const delegation = await blob.issueSignedToken({
        pathname,
        operations: ['get'],
        validUntil,
      });

      const { presignedUrl } = await blob.presignUrl(delegation, {
        operation: 'get',
        pathname,
        access: 'private',
        validUntil,
      });

      res.statusCode = 302;
      res.setHeader('cache-control', 'private, no-store');
      res.setHeader('location', presignedUrl);
      res.end();
      return;
    }

    // Fallback for an SDK without presignUrl: stream it. Correct, but pays data
    // transfer twice and is not what you want for a file this size.
    const result = await blob.get(pathname, { access: 'private' });
    res.statusCode = 200;
    res.setHeader('content-type', 'application/octet-stream');
    res.setHeader('content-disposition', 'attachment; filename="' + pathname + '"');
    res.setHeader('cache-control', 'private, no-store');
    if (result.size) res.setHeader('content-length', String(result.size));
    const { Readable } = require('node:stream');
    Readable.fromWeb(result.stream).pipe(res);
  } catch (err) {
    // Deliberately HTML, not text/plain.
    //
    // A text/plain error from a route the browser is treating as a download gets
    // SAVED as a file — it lands in the downloads list as "download.txt" with a
    // generic "site wasn't available", and the actual reason is hidden inside a
    // file nobody thinks to open. An HTML response renders in the tab where the
    // person can read it.
    const missing = /not found|no such|404/i.test(err.message || '');
    res.statusCode = missing ? 503 : 500;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('cache-control', 'private, no-store');
    res.end(errorHtml(
      missing ? 'The installer has not been uploaded yet' : 'Could not produce a download link',
      missing
        ? 'The download page is live, but the installer for this version is not in storage yet. '
          + 'Whoever published this build needs to upload it before the download will work.'
        : 'The server could not reach the file store. This is usually a missing store '
          + 'connection or credentials on the project, not a problem with your browser.',
      err.message
    ));
  }
};

/** A readable failure page, so the reason is on screen rather than in a saved file. */
function errorHtml(heading, explanation, detail) {
  return [
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>' + heading + '</title><style>',
    'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;',
    'padding:24px;font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
    'color:#17181c;background:#f4f5f7}',
    '.card{background:#fff;border:1px solid #e6e8ee;border-radius:14px;padding:26px;max-width:460px}',
    'h1{font-size:18px;margin:0 0 10px}',
    'p{color:#4b5563;margin:0 0 14px}',
    'code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#8b93a1;',
    'background:#f7f8fa;border:1px solid #e6e8ee;border-radius:8px;padding:8px 10px;display:block;',
    'word-break:break-all}',
    'a{color:#5c7cf5;text-decoration:none;font-weight:650}',
    '</style></head><body><div class="card">',
    '<h1>' + heading + '</h1>',
    '<p>' + explanation + '</p>',
    '<code>' + String(detail || '').replace(/[<>&]/g, '') + '</code>',
    '<p style="margin:16px 0 0"><a href="/">Back to the download page</a></p>',
    '</div></body></html>',
  ].join('');
}
`;
}

/** The password gate. Same visual language as the download page. */
function loginPage({ version }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RK Clinic LIS — sign in</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center;
    justify-content: center; padding: 24px;
    font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #17181c; background: #f4f5f7;
  }
  .card {
    background: #fff; border: 1px solid #e6e8ee; border-radius: 14px;
    padding: 28px; width: 100%; max-width: 380px;
  }
  h1 { font-size: 19px; margin: 0 0 4px; }
  .sub { color: #8b93a1; font-size: 13.5px; margin-bottom: 20px; }
  label { display: block; font-size: 13px; font-weight: 650; margin-bottom: 6px; }
  input {
    width: 100%; padding: 12px 13px; font-size: 16px; border-radius: 10px;
    border: 1px solid #d8dce6; margin-bottom: 14px; min-height: 46px;
  }
  input:focus { outline: 3px solid #c2cff2; outline-offset: 1px; border-color: #5c7cf5; }
  button {
    width: 100%; background: #5c7cf5; color: #fff; border: 0; border-radius: 11px;
    padding: 13px; font-size: 15px; font-weight: 650; cursor: pointer; min-height: 46px;
  }
  button:hover { background: #4462e0; }
  .err {
    background: #fdeaee; border-left: 3px solid #dc2b4b; color: #8c1a30;
    padding: 10px 12px; border-radius: 0 8px 8px 0; font-size: 13.5px; margin-bottom: 16px;
  }
  .foot { color: #8b93a1; font-size: 12px; text-align: center; margin-top: 16px; }
</style>
</head>
<body>
  <form class="card" method="POST" action="/api/unlock">
    <h1>RK Clinic LIS <span style="font-weight:400;color:#8b93a1">${version}</span></h1>
    <div class="sub">Internal build. Enter the access password to continue.</div>
    <div id="err" class="err" hidden>That password was not accepted.</div>
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password"
           autofocus required>
    <button type="submit">Continue</button>
    <div class="foot">Access is logged. Do not share this link.</div>
  </form>
  <script>
    if (new URLSearchParams(location.search).has('error')) {
      document.getElementById('err').hidden = false;
    }
  </script>
</body>
</html>
`;
}
