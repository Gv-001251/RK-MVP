#!/usr/bin/env node
/**
 * ============================================================================
 * RK Clinic LIS — database migration runner
 * ============================================================================
 * Applies mysql/NNN_*.sql in filename order, tracking what has run in a
 * `schema_migrations` table so deploys are reproducible and idempotent.
 *
 *   npm run db:migrate            # apply pending migrations
 *
 * Reads DB config from env (.env.local / .env): MYSQL_HOST, MYSQL_PORT,
 * MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE (default rk_clinic).
 * ============================================================================
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// Load env: .env.local first (Next convention), then .env as fallback.
dotenv.config({ path: '.env.local' });
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'mysql');
const DB = process.env.MYSQL_DATABASE || 'rk_clinic';

const log = (m) => console.log(`[migrate] ${m}`);

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    multipleStatements: true,
  });

  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB}\``);
    await conn.query(`USE \`${DB}\``);
    await conn.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         filename   VARCHAR(255) NOT NULL PRIMARY KEY,
         checksum   CHAR(64)     NOT NULL,
         applied_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
       )`
    );

    const [appliedRows] = await conn.query('SELECT filename, checksum FROM schema_migrations');
    const applied = Object.fromEntries(appliedRows.map((r) => [r.filename, r.checksum]));

    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

    // Baseline mode: record existing migrations as applied WITHOUT running them.
    // Use this once when adopting the runner on a database that was already
    // set up by hand, so future `db:migrate` only runs genuinely new files.
    if (process.argv.includes('--baseline')) {
      let marked = 0;
      for (const file of files) {
        if (applied[file]) continue;
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
        const checksum = crypto.createHash('sha256').update(sql).digest('hex');
        await conn.query('INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)', [file, checksum]);
        marked += 1;
      }
      log(`baseline complete — recorded ${marked} existing migration(s) as applied.`);
      return;
    }

    let ran = 0;

    for (const file of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');

      if (applied[file]) {
        if (applied[file] !== checksum) {
          log(`⚠ ${file} was applied earlier but its checksum changed — NOT re-running (review drift & write a new migration).`);
        }
        continue;
      }

      log(`applying ${file} …`);
      try {
        await conn.query(sql);
        await conn.query('INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)', [file, checksum]);
        ran += 1;
        log(`✓ ${file}`);
      } catch (e) {
        log(`✗ ${file} failed: ${e.message}`);
        process.exitCode = 1;
        return;
      }
    }

    log(ran ? `done — applied ${ran} migration(s).` : 'up to date — nothing to apply.');
  } finally {
    await conn.end();
  }
}

main().catch((e) => { console.error('[migrate] fatal:', e.message); process.exit(1); });
