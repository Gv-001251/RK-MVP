#!/usr/bin/env node
/**
 * ============================================================================
 * Build the web server in the shape the desktop app ships
 * ============================================================================
 *   node scripts/build-desktop.mjs
 *
 * Runs `next build` with standalone output, then copies in the two things Next
 * deliberately leaves out of it: `public/` and `.next/static`. Next omits them
 * because it assumes a CDN or a reverse proxy is serving them; inside a desktop
 * app there is neither, and without this step the UI loads with no stylesheet
 * and no images — which looks like a broken build rather than a missing copy.
 *
 * The result, .next/standalone, is self-contained: its own server.js and a
 * pruned node_modules. That is what gets packaged, and it is why the app bundle
 * is a manageable size.
 * ============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const standalone = path.join(root, '.next', 'standalone');
const buildDir = path.join(root, 'build');

const log = (m) => console.log(`▸ ${m}`);

function run(command, args, env = {}) {
  const res = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
    cwd: root,
  });
  if (res.status !== 0) {
    console.error(`\n✖ ${command} ${args.join(' ')} failed with code ${res.status}`);
    process.exit(res.status ?? 1);
  }
}

log('building the web server with standalone output');
run('npx', ['next', 'build'], { NEXT_OUTPUT: 'standalone' });

if (!fs.existsSync(standalone)) {
  console.error('\n✖ .next/standalone was not produced. Is NEXT_OUTPUT wired into next.config.mjs?');
  process.exit(1);
}

log('copying public/ into the standalone build');
const publicDir = path.join(root, 'public');
if (fs.existsSync(publicDir)) {
  fs.cpSync(publicDir, path.join(standalone, 'public'), { recursive: true });
} else {
  log('  (no public/ directory — skipped)');
}

log('copying .next/static into the standalone build');
fs.cpSync(
  path.join(root, '.next', 'static'),
  path.join(standalone, '.next', 'static'),
  { recursive: true }
);

// Sanity check: the server the desktop app will actually spawn must exist.
const serverJs = path.join(standalone, 'server.js');
if (!fs.existsSync(serverJs)) {
  console.error('\n✖ .next/standalone/server.js is missing — the app would have nothing to start.');
  process.exit(1);
}

/* ── Strip source maps ─────────────────────────────────────────────────────── */

/**
 * Remove the .map files Next emits alongside the compiled server.
 *
 * These are not a size optimisation. A source map contains the original source
 * inline, so shipping them hands over the very code the app is meant to keep —
 * every route handler, readable, with the original formatting. There were 421 of
 * them in the first build of this bundle.
 *
 * Deleting them here rather than switching a Next flag is deliberate: it holds
 * regardless of which flags a future Next version honours, and it is verifiable
 * by looking at the output.
 */
function stripSourceMaps(dir) {
  let removed = 0;
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (entry.name.endsWith('.map')) { fs.rmSync(full); removed += 1; }
    }
  };
  walk(dir);
  return removed;
}

log('removing source maps from the server build');
log(`  ${stripSourceMaps(standalone)} .map file(s) removed`);

/* ── Repair dangling symlinks ──────────────────────────────────────────────── */

/**
 * Replace broken symlinks in the standalone tree with the real module, or drop
 * them.
 *
 * Next's dependency tracing links packages listed in serverExternalPackages into
 * .next/node_modules, and those links can point at paths that do not exist in the
 * standalone output — ioredis does exactly this here. Nothing notices in normal
 * use, because the module is only imported when REDIS_URL is set. Packaging does
 * notice: the archiver walks every entry, fails to stat the target, and exits
 * non-zero, so the installer is never produced. The error it prints says nothing
 * about symlinks, which makes it a genuinely puzzling half hour.
 *
 * Copying the real module keeps the behaviour the link intended, so enabling
 * Redis later does not need a packaging change.
 */
function repairDanglingLinks(dir) {
  const repaired = [];
  const removed = [];

  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);

      // EVERY symlink is materialised, not only the ones that are already
      // broken. A link that resolves here can still arrive broken in the app,
      // because the packager decides for itself whether to follow the link and
      // whether to copy its target — and for this tree it copies the link but
      // not the directory it points at. Leaving no symlinks behind removes the
      // question entirely.
      if (entry.isSymbolicLink()) {
        const resolved = fs.existsSync(full) ? fs.realpathSync(full) : null;

        // Fall back to naming the package from the link target, for a link that
        // is already broken: ../../node_modules/ioredis → ioredis
        const target = fs.readlinkSync(full);
        const marker = 'node_modules/';
        const index = target.lastIndexOf(marker);
        const pkg = index === -1 ? null : target.slice(index + marker.length);
        const source = resolved
          || (pkg && fs.existsSync(path.join(root, 'node_modules', pkg))
            ? path.join(root, 'node_modules', pkg)
            : null);

        fs.rmSync(full, { force: true });
        if (source) {
          fs.cpSync(source, full, { recursive: true, dereference: true });
          repaired.push(pkg || path.relative(dir, full));
        } else {
          removed.push(path.relative(dir, full));
        }
        continue;
      }

      if (entry.isDirectory()) walk(full);
    }
  };

  walk(dir);
  return { repaired, removed };
}

log('materialising symlinks in the server build');
const links = repairDanglingLinks(standalone);
log(`  ${links.repaired.length} replaced with the real module${links.repaired.length ? ` (${links.repaired.join(', ')})` : ''}`);
if (links.removed.length) log(`  ${links.removed.length} unresolvable link(s) removed: ${links.removed.join(', ')}`);

/* ── Bundle our own code ───────────────────────────────────────────────────── */

/**
 * Bundle and minify the desktop shell and the analyzer bridges into build/.
 *
 * The shipped app then contains no readable copy of our own source: no comments,
 * no original names, and each bridge merged with the modules it imports. What is
 * left is third-party node_modules, which was never ours to protect.
 *
 * This is obfuscation, not encryption, and it is worth being clear-eyed about
 * that — minified JavaScript can still be read by someone determined. What it
 * does is stop the app being a copy of the repository, which is the actual
 * requirement.
 *
 * Dependencies stay external (--packages=external) because they are resolved at
 * runtime from node_modules, and because bundling a native module like
 * serialport is not possible anyway.
 */
const BRIDGES = ['lis-bridge.mjs', 'mispa-bridge.mjs', 'maglumi-bridge.mjs', 'afinion-bridge.mjs'];

fs.rmSync(buildDir, { recursive: true, force: true });
fs.mkdirSync(path.join(buildDir, 'tools'), { recursive: true });

log('bundling the analyzer bridges');
for (const name of BRIDGES) {
  run('npx', [
    'esbuild', path.join('tools', name),
    '--bundle', '--platform=node', '--format=esm', '--target=node20',
    '--packages=external', '--minify', '--legal-comments=none',
    `--outfile=${path.join('build', 'tools', name)}`,
  ]);
}

// The tray icon travels with the bundle, because on Windows an app without one
// has no visible entry point at all.
log('copying the tray icon into the bundle');
fs.copyFileSync(path.join(root, 'assets', 'tray.png'), path.join(buildDir, 'tray.png'));

/**
 * A launcher for the headless service.
 *
 * The Windows Task Scheduler runs a program; it has no way to set an environment
 * variable first, and the service needs ELECTRON_RUN_AS_NODE to make the app's
 * own binary behave as a Node interpreter. Two lines of batch file solve that,
 * and it means the scheduled task points at one path with no quoting gymnastics.
 *
 * %~dp0 is this file's directory — <install>\resources\app\build — so three
 * levels up is the installation root where the .exe lives.
 */
log('writing the service launcher');
fs.writeFileSync(
  path.join(buildDir, 'service.cmd'),
  [
    '@echo off',
    'rem Starts the RK Clinic LIS background service (no window).',
    'set ELECTRON_RUN_AS_NODE=1',
    'start "" /b "%~dp0..\\..\\..\\RK Clinic LIS.exe" "%~dp0service.js"',
    '',
  ].join('\r\n')
);

log('bundling the desktop shell');
run('npx', [
  'esbuild', path.join('desktop', 'main.js'),
  '--bundle', '--platform=node', '--format=cjs', '--target=node20',
  '--external:electron', '--packages=external', '--minify', '--legal-comments=none',
  `--outfile=${path.join('build', 'main.js')}`,
]);

// The headless supervisor: the always-on half, registered with the OS to start at
// boot. Bundled separately because it must not pull in the GUI.
log('bundling the headless service');
run('npx', [
  'esbuild', path.join('desktop', 'service.js'),
  '--bundle', '--platform=node', '--format=cjs', '--target=node20',
  '--external:electron', '--packages=external', '--minify', '--legal-comments=none',
  `--outfile=${path.join('build', 'service.js')}`,
]);

// The bundles must actually be loadable; a syntax-level check now beats finding
// out from a packaged app that refuses to launch.
for (const file of [
  path.join(buildDir, 'main.js'),
  path.join(buildDir, 'service.js'),
  ...BRIDGES.map((b) => path.join(buildDir, 'tools', b)),
]) {
  if (!fs.existsSync(file)) {
    console.error(`\n✖ ${path.relative(root, file)} was not produced`);
    process.exit(1);
  }
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    console.error(`\n✖ ${path.relative(root, file)} is not valid JavaScript:\n${check.stderr}`);
    process.exit(1);
  }
}

/* ── Report ───────────────────────────────────────────────────────────────── */

const size = (dir) => {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    try { total += fs.statSync(path.join(entry.parentPath ?? entry.path, entry.name)).size; } catch { /* raced */ }
  }
  return (total / 1024 / 1024).toFixed(0);
};

const readable = (file) => {
  const text = fs.readFileSync(file, 'utf8');
  return /\/\*\*[\s\S]*?\*\//.test(text);
};

log(`server build: ${size(standalone)} MB`);
log(`our code: build/ is ${size(buildDir)} MB, doc comments present: ${readable(path.join(buildDir, 'tools', 'mispa-bridge.mjs'))}`);
log('done — package with: npx electron-builder --mac');
