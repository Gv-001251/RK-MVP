#!/usr/bin/env node
/**
 * ============================================================================
 * Build a single SQL file that stands up the database on its own
 * ============================================================================
 *   node scripts/build-schema-bundle.mjs [--database rk_clinic] [--out FILE]
 *
 * Produces one file you can run directly on the clinic machine:
 *
 *   mysql -u root -p < rk-clinic-schema.sql
 *
 * Why this exists
 * ---------------
 * The normal path is `npm run db:migrate` from a developer machine, which needs
 * Node, the repository, and network access to the clinic's MySQL — so the
 * database has to accept remote connections during setup, before being locked
 * back to 127.0.0.1. That is three moving parts and a temporary hole in the
 * hardening, for something that happens once.
 *
 * This bundle needs none of them. It carries:
 *
 *   - all 18 migrations, in filename order
 *   - the schema_migrations rows they would have written, with matching
 *     checksums, so a later `db:migrate` correctly sees them as already applied
 *     rather than trying to run them again
 *   - staff accounts, with bcrypt hashes computed here and freshly generated
 *     passwords printed once to this terminal
 *
 * That last point matters beyond convenience. mysql/seed_users.js hardcodes
 * passwords that are committed to the repository, so every install shares
 * credentials that anyone with repo access already knows. This generates real
 * ones per install instead.
 * ============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const args = process.argv.slice(2);
const flag = (n, d = null) => { const i = args.indexOf(n); return i !== -1 && args[i + 1] ? args[i + 1] : d; };

const DB = flag('--database', 'rk_clinic');
const OUT = path.resolve(flag('--out', 'dist-desktop/rk-clinic-schema.sql'));
const MIGRATIONS = path.resolve('mysql');

const log = (m) => console.log(`▸ ${m}`);

/** The roles the app recognises, mirroring mysql/seed_users.js. */
const STAFF = [
  { full_name: 'Administrator',    role: 'admin',          email: 'admin@rkclinic.com',  cabin: 'Administration Block', department: 'Management' },
  { full_name: 'Dr. R. Kumar',     role: 'doctor',         email: 'doc@rkclinic.com',    cabin: 'Cabin A',              department: 'General Medicine' },
  { full_name: 'Nurse & Pharmacy', role: 'nurse_pharmacy', email: 'medic@rkclinic.com',  cabin: 'Nursing Station',      department: 'Nursing' },
  { full_name: 'Lab Technician',   role: 'technician',     email: 'lab@rkclinic.com',    cabin: 'Pathology Lab',        department: 'Laboratory' },
  { full_name: 'Receptionist',     role: 'receptionist',   email: 'reception@rkclinic.com', cabin: 'Front Desk',        department: 'Reception' },
];

/**
 * A password that can be read aloud and typed without ambiguity.
 *
 * Deliberately avoids characters that get misread when someone dictates a
 * credential across a room — no l/1/I, no O/0. Length compensates for the
 * smaller alphabet.
 */
function readablePassword(words = 3) {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const chunk = () => Array.from(
    crypto.randomBytes(5),
    (b) => alphabet[b % alphabet.length]
  ).join('');
  return Array.from({ length: words }, chunk).join('-');
}

const sqlString = (value) => (value === null || value === undefined
  ? 'NULL'
  : `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`);

/* ── Collect the migrations ────────────────────────────────────────────────── */

const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
if (!files.length) {
  console.error('✖ no .sql files in mysql/');
  process.exit(1);
}
log(`bundling ${files.length} migration(s)`);

const parts = [];
const applied = [];

parts.push(`-- ============================================================================
-- RK Clinic LIS — complete database setup
-- Generated ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC
--
-- Run once on a machine with a FRESH MySQL, to create the database from nothing:
--     mysql -u root -p < ${path.basename(OUT)}
--
-- NOT for an existing database. Use \`npm run db:migrate\` for that — it tracks
-- what has already been applied. This file replays every migration from the
-- start, and some of them are not idempotent: index creation collides, and 002
-- clears timestamp columns before it would fail, which on a populated database
-- means losing data and then erroring. The guard below refuses to proceed rather
-- than leaving a half-applied schema behind.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS \`${DB}\`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE \`${DB}\`;

-- ── Refuse to run against a database that already has tables ────────────────
-- MySQL has no ABORT and SIGNAL only works inside stored programs, so the stop is
-- produced by preparing a statement that references a column name carrying the
-- explanation. The client halts on the error and prints the message. When the
-- database is empty the branch is a no-op.
SET @existing_tables = (
  SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '${DB}'
    AND table_name <> 'schema_migrations'
);
SET @guard = IF(@existing_tables > 0,
  'SELECT \`STOP: this database already has tables. This file is only for a fresh database. Use npm run db:migrate instead\` FROM information_schema.tables LIMIT 1',
  'DO 0');
PREPARE guard_stmt FROM @guard;
EXECUTE guard_stmt;
DEALLOCATE PREPARE guard_stmt;

-- The migration runner's bookkeeping table, created up front so the rows at the
-- end of this file have somewhere to go.
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename   VARCHAR(255) NOT NULL PRIMARY KEY,
  checksum   CHAR(64)     NOT NULL,
  applied_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

for (const file of files) {
  const raw = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');

  // The checksum must be of the ORIGINAL file, not the rewritten copy below, or
  // `db:migrate` will later report drift against files that were applied
  // correctly and refuse to trust them.
  applied.push({ file, checksum: crypto.createHash('sha256').update(raw).digest('hex') });

  // Each migration opens with its own USE/CREATE DATABASE. Stripped, because the
  // bundle has already selected the database and may have been told to use a
  // different name.
  const body = raw
    .split('\n')
    .filter((line) => !/^\s*(USE\s+|CREATE\s+DATABASE\s+)/i.test(line))
    .join('\n')
    .trim();

  parts.push(`\n-- ─────────────────────────────────────────────────────────────\n-- ${file}\n-- ─────────────────────────────────────────────────────────────\n${body}\n`);
}

/* ── Staff accounts ───────────────────────────────────────────────────────── */

log('hashing staff passwords (bcrypt, cost 12 — this takes a moment)');
const credentials = [];
const inserts = [];

for (const person of STAFF) {
  const password = readablePassword();
  // Cost 12, matching what the app uses when an admin creates a user, so a
  // seeded account is no cheaper to attack than a real one.
  const hash = await bcrypt.hash(password, 12);
  credentials.push({ ...person, password });

  inserts.push(
    `INSERT INTO user_profiles (id, full_name, role, email, password_hash, cabin, department, is_active)\n`
    + `VALUES (${sqlString(crypto.randomUUID())}, ${sqlString(person.full_name)}, ${sqlString(person.role)}, `
    + `${sqlString(person.email)}, ${sqlString(hash)}, ${sqlString(person.cabin)}, ${sqlString(person.department)}, 1)\n`
    + `ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);`
  );
}

parts.push(`\n-- ─────────────────────────────────────────────────────────────
-- Staff accounts
--
-- Passwords were generated when this file was built and printed once to the
-- terminal that built it. They are not recoverable from here — the column holds
-- a bcrypt hash. ON DUPLICATE KEY leaves an existing password alone, so
-- re-running this file will not lock anyone out.
-- ─────────────────────────────────────────────────────────────
${inserts.join('\n\n')}
`);

/* ── Migration bookkeeping ────────────────────────────────────────────────── */

parts.push(`\n-- ─────────────────────────────────────────────────────────────
-- Record these migrations as applied.
--
-- Without this, a later \`npm run db:migrate\` against this database would try to
-- run all ${files.length} files again on a schema that already has them.
-- ─────────────────────────────────────────────────────────────
${applied.map(({ file, checksum }) =>
  `INSERT IGNORE INTO schema_migrations (filename, checksum) VALUES (${sqlString(file)}, ${sqlString(checksum)});`
).join('\n')}

SELECT CONCAT('Setup complete: ', COUNT(*), ' tables in \`${DB}\`') AS result
FROM information_schema.tables WHERE table_schema = '${DB}';
`);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, parts.join('\n'));

const sizeKb = (fs.statSync(OUT).size / 1024).toFixed(0);
log(`wrote ${path.relative(process.cwd(), OUT)} (${sizeKb} KB)`);

console.log('');
console.log('  ┌─ Staff credentials — copy these now, they are not stored anywhere ─┐');
for (const c of credentials) {
  console.log(`  │ ${c.role.padEnd(15)} ${c.email.padEnd(26)} ${c.password}`);
}
console.log('  └────────────────────────────────────────────────────────────────────┘');
console.log('');
log('on the clinic machine:');
console.log(`    mysql -u root -p < ${path.basename(OUT)}`);
