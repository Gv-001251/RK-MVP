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
  let text = toCrlf(fs.readFileSync(src, 'utf8'));

  // Everything staged here is read on Windows, by a shell and a text editor that
  // both guess at encoding. Windows PowerShell 5.1 -- what `powershell -File`
  // runs, and what the documented command line uses -- decodes a .ps1 as the
  // system ANSI code page unless the file carries a UTF-8 BOM. On a cp1252
  // machine every multi-byte character is then misread, and the damage is not
  // cosmetic: both U+2500 and U+2014 encode a 0x94 byte, which cp1252 renders as
  // a right double quotation mark, and PowerShell honours that as a string
  // delimiter. One em dash in a message therefore ends its string early and
  // every construct after it fails to parse. That is exactly how 0.3.1 shipped:
  // 395 such characters, and a setup script that could not run at all.
  //
  // So refuse to stage anything but ASCII. It costs nothing -- these are English
  // instructions and a script -- and it removes the whole class of failure,
  // which is otherwise invisible until it reaches a clinic.
  const offending = [...new Set([...text].filter((c) => c.charCodeAt(0) > 127))];
  if (offending.length) {
    console.error(`✖ ${from} contains characters that Windows will misdecode:`);
    for (const c of offending) {
      console.error(`    U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} ${JSON.stringify(c)}`);
    }
    console.error('  Replace them with ASCII equivalents and rebuild.');
    process.exit(1);
  }

  // A BOM on the script as a second defence, so that an edit made later on the
  // clinic machine is still decoded as UTF-8 rather than reviving the bug. Left
  // off the text file, where a BOM shows up as stray characters in some viewers.
  if (to.endsWith('.ps1')) text = '\ufeff' + text;

  fs.writeFileSync(path.join(KIT, to), text);
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
