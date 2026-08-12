/**
 * ============================================================================
 * Where the app keeps its own files
 * ============================================================================
 * Shared by the GUI and the headless service, and that sharing is the point.
 * The two processes must agree on every one of these paths or they end up
 * reading different config, writing different logs, and disagreeing about
 * whether the lab is running.
 *
 * The GUI could ask Electron for `app.getPath('userData')`, but the service has
 * no Electron app object — it runs as a plain Node process — so the location is
 * computed here instead, using the same rule Electron uses: the platform's
 * per-user application data directory, named after `name` in package.json.
 * Changing that name moves this directory, and with it the operator's settings.
 * ============================================================================
 */

const os = require('node:os');
const path = require('node:path');

/**
 * Must match `name` in package.json.
 *
 * Electron derives userData from app.getName(), which reads that field. If the
 * two ever disagree, the GUI and the service quietly use separate directories:
 * the service reads no credentials, the tray shows no status, and nothing
 * reports an error.
 */
const APP_DIR_NAME = 'rk-clinic';

function userDataDir() {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, APP_DIR_NAME);
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', APP_DIR_NAME);
  }
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(configHome, APP_DIR_NAME);
}

const logsDir = () => path.join(userDataDir(), 'logs');

/** Live status, written by whichever supervisor is in charge. */
const stateFile = () => path.join(userDataDir(), 'state.json');

/** Operator choices: port, which bridges start, keep-awake. */
const settingsFile = () => path.join(userDataDir(), 'settings.json');

/**
 * Credential files, in the order they are merged.
 *
 * The operator's copy in userData comes last so it wins over anything shipped
 * or left in a checkout — and it lives outside the app directory so upgrading
 * the app cannot overwrite it.
 */
function envFiles(appRoot) {
  return [
    path.join(appRoot, '.env'),
    path.join(appRoot, '.env.local'),
    path.join(userDataDir(), '.env'),
    path.join(userDataDir(), '.env.local'),
  ];
}

module.exports = { APP_DIR_NAME, userDataDir, logsDir, stateFile, settingsFile, envFiles };
