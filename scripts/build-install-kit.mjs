#!/usr/bin/env node
/**
 * ============================================================================
 * Stage the files that ship next to the app
 * ============================================================================
 *   node scripts/build-install-kit.mjs [--regenerate]
 *
 * electron-builder copies this directory to the install root, so the clinic
 * machine ends up with everything the install needs in one place:
 *
 *   C:\Program Files\RK Clinic LIS\rk-clinic-schema.sql
 *   C:\Program Files\RK Clinic LIS\setup-windows.ps1
 *   C:\Program Files\RK Clinic LIS\INSTALL.txt
 *
 * Until 0.3.1 the first two had to be carried over by hand, and the setup script
 * told the operator to apply the schema "from the developer machine" — which
 * meant opening MySQL to the network during setup, then remembering to close it.
 *
 * The schema is NOT regenerated on every build. Each build would mint new staff
 * passwords and a new database password, so rebuilding after handing the
 * credentials to the clinic would silently invalidate them. Pass --regenerate
 * when new credentials are actually wanted.
 *
 * Text files are written with CRLF. They are read on Windows, often in whatever
 * editor is to hand, and a lone LF still renders as one long line in some of
 * them.
 * ============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const KIT = path.resolve('install-kit');
const SCHEMA = path.join(KIT, 'rk-clinic-schema.sql');
const regenerate = process.argv.includes('--regenerate');

const log = (m) => console.log(`▸ ${m}`);

fs.mkdirSync(KIT, { recursive: true });

/* ── The database ──────────────────────────────────────────────────────────── */

if (regenerate || !fs.existsSync(SCHEMA)) {
  const result = spawnSync(
    process.execPath,
    ['scripts/build-schema-bundle.mjs', '--out', SCHEMA],
    { stdio: 'inherit' }
  );
  if (result.status !== 0) {
    console.error('✖ schema bundle failed — not packaging an installer without it');
    process.exit(1);
  }
} else {
  log(`reusing ${path.relative(process.cwd(), SCHEMA)} — pass --regenerate for new credentials`);
}

/* ── The scripts and instructions ──────────────────────────────────────────── */

const toCrlf = (s) => s.replace(/\r?\n/g, '\r\n');

for (const [from, to] of [
  ['deploy/setup-windows.ps1', 'setup-windows.ps1'],
  ['deploy/INSTALL.txt', 'INSTALL.txt'],
]) {
  const src = path.resolve(from);
  if (!fs.existsSync(src)) {
    console.error(`✖ missing ${from}`);
    process.exit(1);
  }
  fs.writeFileSync(path.join(KIT, to), toCrlf(fs.readFileSync(src, 'utf8')));
  log(`staged ${to}`);
}

/* ── Report ───────────────────────────────────────────────────────────────── */

console.log('');
for (const name of fs.readdirSync(KIT).sort()) {
  const kb = (fs.statSync(path.join(KIT, name)).size / 1024).toFixed(0);
  console.log(`  ${String(kb).padStart(4)} KB  ${name}`);
}
console.log('');

// A schema that predates the app account would leave the operator prompted for a
// password that was never generated, so say so at build time rather than at the
// clinic.
if (!fs.readFileSync(SCHEMA, 'utf8').includes('CREATE USER IF NOT EXISTS')) {
  console.error('✖ the staged schema has no application account — rebuild it with --regenerate');
  process.exit(1);
}
log('install kit ready');
