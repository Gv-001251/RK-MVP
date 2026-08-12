/**
 * ============================================================================
 * Where a bridge keeps the files it has to write
 * ============================================================================
 * Raw captures, spooled results, unrecognised frames — all of it needs a
 * directory the process can actually write to.
 *
 * Until this existed, each bridge resolved `tmp/…` against its working
 * directory. In a checkout that is the repository and everything works. Installed
 * on Windows, the supervisor runs children with their working directory inside the
 * application folder, which lives under C:\Program Files and is not writable
 * without elevation. The consequences were not subtle:
 *
 *   - the Mispa bridge creates its capture directory at module load, so it threw
 *     immediately, crashed, and was marked failed after five retries
 *   - the result spool — the thing that holds patient results when the LIS is
 *     unreachable — had nowhere to write, so the one safety net that exists for a
 *     dropped link would have silently had no floor under it
 *
 * So the location comes from the environment. The supervisor passes RK_DATA_DIR
 * pointing at the per-user application data directory (%APPDATA%\rk-clinic on
 * Windows), which is writable by the account the service runs as. Run by hand
 * from a checkout with nothing set, it falls back to ./tmp exactly as before.
 * ============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Resolve a path inside the writable data directory, creating it if needed.
 *
 * @param {...string} segments e.g. dataPath('mispa-spool')
 * @returns {string} absolute path
 */
export function dataPath(...segments) {
  const base = process.env.RK_DATA_DIR
    ? path.resolve(process.env.RK_DATA_DIR)
    : path.resolve('tmp');

  const full = path.join(base, ...segments);

  // Callers used to mkdir themselves; doing it here means a bridge cannot forget
  // and discover the omission at the moment it needed to spool a result.
  try {
    fs.mkdirSync(path.dirname(full) === full ? full : path.dirname(full), { recursive: true });
  } catch {
    // Reported by the caller when it actually tries to write.
  }

  return full;
}

/**
 * Resolve AND create a directory inside the data directory.
 *
 * @param {...string} segments
 * @returns {string} absolute path to the directory
 */
export function dataDir(...segments) {
  const base = process.env.RK_DATA_DIR
    ? path.resolve(process.env.RK_DATA_DIR)
    : path.resolve('tmp');

  const full = path.join(base, ...segments);
  fs.mkdirSync(full, { recursive: true });
  return full;
}
