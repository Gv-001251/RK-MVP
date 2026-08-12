/**
 * ============================================================================
 * Credentials and operator settings
 * ============================================================================
 * Both the GUI and the headless service need these, and neither can assume the
 * environment it was launched from has them. An app started by Finder, by the
 * Windows Task Scheduler, or by a service manager inherits almost nothing — no
 * shell profile, no project env file, and on Windows not even a useful PATH. So
 * the values are read from disk explicitly and handed to every child process.
 *
 * Nothing here is ever logged. These are database credentials and the analyzer
 * shared secret.
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const { envFiles, settingsFile } = require('./paths');

/** Settings a fresh install starts with. */
const DEFAULT_SETTINGS = {
  port: 3000,
  // Bound on every interface deliberately: this machine is the server, and the
  // rest of the hospital reaches the LIS in a browser. See the security note in
  // the install runbook — the app is authenticated, but it is on the network.
  host: '0.0.0.0',
  keepAwake: true,
  enabled: {},
};

/**
 * Merge the env files that exist, later files winning.
 *
 * @param {string} appRoot
 * @returns {Record<string, string>}
 */
function loadDotEnv(appRoot) {
  const out = {};
  for (const file of envFiles(appRoot)) {
    if (!fs.existsSync(file)) continue;
    try {
      // dotenv is already a dependency of the app it is configuring.
      Object.assign(out, require('dotenv').parse(fs.readFileSync(file)));
    } catch (err) {
      console.error(`could not read ${path.basename(file)}: ${err.message}`);
    }
  }
  return out;
}

/**
 * Settings that must be present for the app to be able to do anything at all.
 *
 * Without a database the server starts, answers its health check, and then fails
 * every query — presenting a login page that rejects correct credentials for no
 * visible reason. Naming the missing keys once, loudly, is worth more than any
 * amount of downstream error handling.
 *
 * @returns {string[]} missing keys, empty when the config is usable
 */
function missingConfig(env) {
  return ['MYSQL_DATABASE', 'LIS_ANALYZER_API_KEY'].filter((key) => !env[key]);
}

function loadSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    return { ...DEFAULT_SETTINGS, ...raw, enabled: { ...DEFAULT_SETTINGS.enabled, ...(raw.enabled || {}) } };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error(`could not save settings: ${err.message}`);
  }
}

module.exports = { DEFAULT_SETTINGS, loadDotEnv, missingConfig, loadSettings, saveSettings };
