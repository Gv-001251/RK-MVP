/**
 * ============================================================================
 * RK Clinic LIS — desktop app (macOS menu bar)
 * ============================================================================
 * Installed on the machine the analyzers are wired to. It does three jobs:
 *
 *   1. runs the LIS web server, bound so every other machine in the hospital
 *      can reach it in a browser — this box is the server, not a client
 *   2. supervises one analyzer bridge per instrument, restarting them when they
 *      crash and reporting honestly when they cannot start at all
 *   3. keeps that state visible in the menu bar, and stops the machine sleeping
 *      underneath it
 *
 * Point 3 is not decoration. A Mac that sleeps drops its serial handles and TCP
 * listeners exactly like a shutdown, and an instrument that transmits into a
 * sleeping host loses that result — nothing on the analyzer side holds it for a
 * retry. So the app takes a power-save block while it is running.
 *
 * The window is a convenience, not the product: it loads the same web UI that
 * every other machine loads. Closing it deliberately does NOT quit the app,
 * because the bridges must outlive it. Quit is on the tray menu, where it is a
 * decision rather than an accident.
 * ============================================================================
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, Tray, Menu, BrowserWindow, shell, dialog, nativeImage, clipboard, powerSaveBlocker } = require('electron');

const { Supervisor } = require('./supervisor');
const { allServices } = require('./services');
const { stateFile: stateFilePath } = require('./paths');
const { loadDotEnv: readDotEnv } = require('./config');

/**
 * Is a headless supervisor already running the lab?
 *
 * Two supervisors on one machine is the worst outcome available: both try to
 * bind 3000, 8080 and 8888, one wins, the other logs EADDRINUSE and restarts
 * forever, and the tray shows failures for services that are actually running
 * perfectly in the other process.
 *
 * The state file answers the question. It carries the writing process's pid, so a
 * file left behind by a crash can be told apart from a live one — a stale pid
 * means the service is gone and this app should take over.
 *
 * @returns {{pid: number, updatedAt: string, services: object[]}|null}
 */
function readServiceState() {
  try {
    const state = JSON.parse(fs.readFileSync(stateFilePath(), 'utf8'));
    if (!state?.pid) return null;

    // process.kill(pid, 0) tests for existence without signalling.
    try { process.kill(state.pid, 0); } catch { return null; }
    if (state.pid === process.pid) return null;

    return state;
  } catch {
    return null;
  }
}

/**
 * Where the app's own code and the things it runs live.
 *
 * Always the directory holding this file's parent, which is the point: packaged,
 * that is Contents/Resources/app, and in a checkout it is the repository root.
 * Both layouts therefore have `tools/`, `.next/` and — crucially — `node_modules`
 * as siblings.
 *
 * That sibling relationship is not cosmetic. The bridges are spawned as separate
 * Node processes and `import 'serialport'` resolves by walking up from the
 * script's own directory. Copying the bridges somewhere outside the tree that
 * holds node_modules produces a packaged app where every serial instrument fails
 * with "Cannot find package 'serialport'" — while working perfectly in a
 * checkout.
 */
const APP_ROOT = path.join(__dirname, '..');

const DEFAULTS = {
  port: 3000,
  // 0.0.0.0 is the whole point of this app: other machines must be able to
  // reach it. See the security note in the README section of this file's
  // sibling docs — this is an authenticated app, but it is now on the network.
  host: '0.0.0.0',
  keepAwake: true,
  enabled: {},
};

let tray = null;
let win = null;
let supervisor = null;
let settings = { ...DEFAULTS };
let powerBlockerId = null;
let quitting = false;

/**
 * Set when a headless supervisor is in charge. Non-null means this process owns
 * nothing: it reads status and opens windows, and Quit closes the window rather
 * than stopping the lab.
 */
let attachedState = null;

/** The services to display, from whichever supervisor is actually running them. */
function currentServices() {
  if (attachedState) return attachedState.services || [];
  return supervisor ? supervisor.list() : [];
}

/** One word for the whole system, for the menu bar. */
function currentAggregate() {
  if (attachedState) return attachedState.aggregate || 'stopped';
  return supervisor ? supervisor.aggregate() : 'stopped';
}

/* ── Settings ─────────────────────────────────────────────────────────────── */

function settingsFile() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    settings = { ...DEFAULTS, ...raw, enabled: { ...DEFAULTS.enabled, ...(raw.enabled || {}) } };
  } catch {
    settings = { ...DEFAULTS };
  }
}

function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error('could not save settings:', err.message);
  }
}

/**
 * Read .env.local and hand it to the children explicitly.
 *
 * Electron is launched by Finder or launchd, which know nothing about the
 * project's env file, so the database credentials and the analyzer API key would
 * otherwise be missing. The bridges each call dotenv themselves, but the web
 * server's access to them must not depend on how Next happens to resolve env
 * files inside a packaged build — passing them explicitly makes it the same in a
 * checkout and in the app bundle.
 *
 * Nothing here is logged: these are credentials.
 */
function loadDotEnv() {
  const out = {};
  const files = [
    // Installed machine: the operator's own config, kept OUTSIDE the app bundle.
    path.join(app.getPath('userData'), '.env.local'),
    path.join(app.getPath('userData'), '.env'),
    // Developer checkout.
    path.join(APP_ROOT, '.env'),
    path.join(APP_ROOT, '.env.local'),
  ];

  for (const file of files) {
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
 * Refuse to start blind.
 *
 * The credentials are deliberately not packaged into the app bundle — a .dmg
 * with a database password and the analyzer API key inside it is a credential
 * leak waiting to be copied onto a laptop. So a fresh install has no config, and
 * without config the server starts, fails every query, and the operator sees a
 * login page that rejects them for no visible reason. Saying so plainly, once,
 * with the exact path to create, is worth more than any amount of log output.
 */
function checkConfig(env) {
  const missing = ['MYSQL_DATABASE', 'LIS_ANALYZER_API_KEY'].filter((k) => !env[k]);
  if (!missing.length) return true;

  const target = path.join(app.getPath('userData'), '.env.local');
  dialog.showMessageBoxSync({
    type: 'warning',
    message: 'RK Clinic LIS is not configured yet.',
    detail: `These settings are missing: ${missing.join(', ')}.\n\n`
      + `Create this file and restart the app:\n${target}\n\n`
      + 'It needs the database connection settings and LIS_ANALYZER_API_KEY. '
      + 'Copy .env.local from the project checkout if you have one. '
      + 'Credentials are kept here rather than inside the app so they are not '
      + 'shipped around with the installer.',
    buttons: ['Open the folder', 'Continue anyway'],
    defaultId: 0,
  }) === 0 && shell.openPath(app.getPath('userData'));

  return false;
}

/* ── Addresses ────────────────────────────────────────────────────────────── */

/**
 * Every address this machine can be reached on, so the tray can tell the
 * operator what to type on the other machines.
 *
 * The analyzer segment shows up here too (the direct-wired 192.168.1.x side).
 * That is worth seeing rather than hiding: if the only address listed is the
 * analyzer subnet, nothing on the hospital network can reach the LIS, and that
 * is the explanation.
 */
function localAddresses() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      out.push({ name, address: a.address });
    }
  }
  return out;
}

const uiUrl = () => `http://127.0.0.1:${settings.port}`;

/* ── Window ───────────────────────────────────────────────────────────────── */

function openWindow() {
  if (win && !win.isDestroyed()) { win.show(); win.focus(); return; }

  win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: 'RK Clinic LIS',
    show: false,
    webPreferences: {
      // The window only ever loads our own server over HTTP. It has no need for
      // Node, and granting it any would hand the whole filesystem to anything
      // that ever manages to inject a script into the page.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });

  // Anything that is not our own UI opens in the real browser rather than in a
  // chrome-less window the operator cannot inspect.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(uiUrl())) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });

  win.loadURL(uiUrl());
}

async function showUi() {
  const server = currentServices().find((s) => s.id === 'server');
  if (server?.status === 'running') { openWindow(); return; }

  // Attached mode cannot start anything, so offer what it can: the log that
  // explains why the service has not got the server up.
  if (attachedState) {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      message: 'The LIS web server is not running yet.',
      detail: `The background service (pid ${attachedState.pid}) reports it as `
        + `"${server?.status || 'unknown'}"${server?.lastError ? `: ${server.lastError}` : ''}.`,
      buttons: ['View log', 'Open anyway', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
    });
    if (response === 0 && server?.logFile) shell.openPath(server.logFile);
    if (response === 1) openWindow();
    return;
  }

  const { response } = await dialog.showMessageBox({
    type: 'info',
    message: 'The LIS web server is not running yet.',
    detail: server?.status === 'failed'
      ? `It failed to start. Last error: ${server.lastError || 'see the log'}`
      : 'It may still be starting up.',
    buttons: ['Start it', 'View log', 'Cancel'],
    defaultId: 0,
    cancelId: 2,
  });

  if (response === 0) { supervisor.start('server'); openWindow(); }
  if (response === 1) shell.openPath(supervisor.get('server').logFile);
}

/* ── Tray ─────────────────────────────────────────────────────────────────── */

const GLYPH = {
  running: '\u25CF',      // ●  everything up
  partial: '\u25D0',      // ◐  some up
  starting: '\u25CC',     // ◌  coming up
  failed: '\u26A0',       // ⚠  something needs a human
  stopped: '\u25CB',      // ○  nothing running
};

const STATUS_LABEL = {
  running: 'running',
  starting: 'starting…',
  stopped: 'stopped',
  failed: 'failed',
  partial: 'partly running',
};

function buildMenu() {
  const services = currentServices();
  const server = services.find((s) => s.id === 'server');
  const bridges = services.filter((s) => s.id !== 'server');
  const addresses = localAddresses();

  const addressItems = addresses.length
    ? addresses.map((a) => ({
        label: `${a.address}:${settings.port}  (${a.name})`,
        click: () => {
          clipboard.writeText(`http://${a.address}:${settings.port}`);
        },
      }))
    : [{ label: 'no network address — this machine is offline', enabled: false }];

  return Menu.buildFromTemplate([
    { label: `RK Clinic LIS — ${STATUS_LABEL[currentAggregate()]}`, enabled: false },
    ...(attachedState
      ? [{ label: `run by the background service (pid ${attachedState.pid})`, enabled: false }]
      : []),
    { type: 'separator' },
    { label: 'Open LIS', accelerator: 'CmdOrCtrl+O', click: showUi },
    {
      label: 'Other machines connect to',
      submenu: [
        { label: 'Click an address to copy it', enabled: false },
        { type: 'separator' },
        ...addressItems,
      ],
    },
    { type: 'separator' },
    {
      label: `Web server — ${STATUS_LABEL[server?.status] || 'unknown'}`,
      submenu: serviceSubmenu(server),
    },
    { type: 'separator' },
    { label: 'Analyzers', enabled: false },
    ...bridges.map((b) => ({
      label: `   ${GLYPH[b.status]}  ${b.label}`,
      submenu: serviceSubmenu(b),
    })),
    { type: 'separator' },
    {
      label: 'Keep this machine awake',
      type: 'checkbox',
      enabled: !attachedState,
      checked: settings.keepAwake,
      click: (item) => { settings.keepAwake = item.checked; saveSettings(); applyPowerBlocker(); },
    },
    {
      label: 'Start at login',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    { label: 'Open logs folder', click: () => shell.openPath(path.join(app.getPath('userData'), 'logs')) },
    { type: 'separator' },
    { label: 'Quit (stops all analyzer links)', click: () => quit() },
  ]);
}

function serviceSubmenu(s) {
  if (!s) return [{ label: 'not registered', enabled: false }];

  const detail = [];
  if (s.status === 'running' && s.uptimeMs != null) {
    detail.push({ label: `up ${formatDuration(s.uptimeMs)}${s.pid ? `, pid ${s.pid}` : ''}`, enabled: false });
  }
  if (s.degraded) detail.push({ label: `⚠ ${s.degraded}`, enabled: false });
  if (s.restarts) detail.push({ label: `restarted ${s.restarts}×`, enabled: false });
  if (s.lastError) detail.push({ label: `last error: ${truncate(s.lastError, 60)}`, enabled: false });
  if (s.note) {
    detail.push({ type: 'separator' });
    for (const line of wrap(s.note, 64)) detail.push({ label: line, enabled: false });
  }

  // Attached to a headless service: show everything, control nothing. Offering
  // a Stop button that cannot work — or worse, that stops a child this process
  // does not own — would be a lie with consequences.
  if (attachedState) {
    return [
      { label: `Status: ${STATUS_LABEL[s.status] || s.status}`, enabled: false },
      ...detail,
      { type: 'separator' },
      { label: 'Managed by the background service', enabled: false },
      { label: 'Restart it from Services / Task Scheduler', enabled: false },
      { type: 'separator' },
      { label: 'View log', click: () => shell.openPath(s.logFile) },
    ];
  }

  return [
    { label: `Status: ${STATUS_LABEL[s.status] || s.status}`, enabled: false },
    ...detail,
    { type: 'separator' },
    { label: 'Start', enabled: s.status === 'stopped' || s.status === 'failed', click: () => supervisor.start(s.id) },
    { label: 'Stop', enabled: s.status !== 'stopped', click: () => supervisor.stop(s.id) },
    { label: 'Restart', click: () => supervisor.restart(s.id) },
    { type: 'separator' },
    {
      label: 'Start with the app',
      type: 'checkbox',
      checked: settings.enabled[s.id] ?? false,
      click: (item) => { settings.enabled[s.id] = item.checked; saveSettings(); },
    },
    { label: 'View log', click: () => shell.openPath(s.logFile) },
  ];
}

/**
 * Find the tray icon, whether we are running bundled or from source.
 *
 * Windows has no equivalent of macOS's text-in-the-menu-bar, so an icon is not
 * decoration here: a Tray created with an empty image is simply invisible in the
 * notification area, and the app becomes unreachable — running, serving, with no
 * way for the operator to open it or see a status.
 */
function trayImage() {
  const candidates = [
    path.join(__dirname, 'tray.png'),                 // bundled: build/tray.png
    path.join(APP_ROOT, 'assets', 'tray.png'),        // checkout
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const image = nativeImage.createFromPath(file);
    if (!image.isEmpty()) return image;
  }
  return null;
}

/**
 * Reflect the current state in the menu bar / notification area.
 *
 * The status glyph goes in the title on macOS, where a tray title is supported
 * and reads well next to the clock. On Windows there is no title, so the same
 * information has to travel in the tooltip and in the first line of the menu —
 * which is why that line exists at all.
 */
function refreshTray() {
  if (!tray) return;
  const state = supervisor.aggregate();

  if (process.platform === 'darwin') tray.setTitle(`${GLYPH[state]} RK`);
  tray.setToolTip(`RK Clinic LIS — ${STATUS_LABEL[state]}`);
  tray.setContextMenu(buildMenu());
}

/* ── Power ────────────────────────────────────────────────────────────────── */

function applyPowerBlocker() {
  const active = powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId);

  if (settings.keepAwake && !active) {
    // 'prevent-app-suspension' stops the system sleeping while allowing the
    // display to switch off, which is what a lab machine in a corner wants.
    powerBlockerId = powerSaveBlocker.start('prevent-app-suspension');
  } else if (!settings.keepAwake && active) {
    powerSaveBlocker.stop(powerBlockerId);
    powerBlockerId = null;
  }
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function formatDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function wrap(text, width) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + w).length > width) { lines.push(line.trimEnd()); line = ''; }
    line += `${w} `;
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}

/* ── Lifecycle ────────────────────────────────────────────────────────────── */

async function quit() {
  if (quitting) return;
  quitting = true;
  refreshTray();
  // In attached mode the services belong to the headless supervisor and must
  // outlive this window. Quitting the viewer is not an instruction to close the lab.
  if (!attachedState && supervisor) {
    try { await supervisor.stopAll(); } catch { /* going down anyway */ }
  }
  if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
    powerSaveBlocker.stop(powerBlockerId);
  }
  app.quit();
}

function bootstrap() {
  loadSettings();

  // Attached mode: the headless service owns the lifecycle, so this window is a
  // viewer. Nothing is spawned, nothing competes for the ports.
  attachedState = readServiceState();
  if (attachedState) {
    console.log(`headless supervisor detected (pid ${attachedState.pid}) — running as a viewer`);
    bootstrapAttached();
    return;
  }

  const dotEnv = loadDotEnv();
  checkConfig(dotEnv);

  supervisor = new Supervisor({
    appRoot: APP_ROOT,
    logsDir: path.join(app.getPath('userData'), 'logs'),
    // Run children with this very binary acting as Node, so the installed app
    // depends on nothing being present on the machine. See supervisor.js.
    nodePath: process.env.RK_NODE_PATH || process.execPath,
    runAsNode: !process.env.RK_NODE_PATH,
    // Publish status even in app mode, so a viewer started later attaches to this
    // process instead of racing it for the ports.
    stateFile: stateFilePath(),
    env: {
      ...dotEnv,
      NODE_ENV: 'production',
      // Somewhere writable for raw captures and the result spool: the app folder
      // is read-only for a standard user once installed. See tools/lib/data-dir.mjs.
      RK_DATA_DIR: app.getPath('userData'),
      // Local only when this machine is the server. With the web server switched
      // off, this box is an analyzer agent for a LIS at another site, and the
      // bridges must post across the link rather than at themselves.
      ...((settings.enabled.server ?? true)
        ? { LIS_BASE_URL: uiUrl() }
        : (dotEnv.LIS_BASE_URL ? { LIS_BASE_URL: dotEnv.LIS_BASE_URL.replace(/\/$/, '') } : {})),
    },
  });

  // Packaged, the bridges are the bundled and minified copies in build/tools;
  // in a checkout they are the readable originals, so debugging stays sane.
  const toolsDir = app.isPackaged
    ? path.join(APP_ROOT, 'build', 'tools')
    : path.join(APP_ROOT, 'tools');

  for (const def of allServices({ appRoot: APP_ROOT, host: settings.host, port: settings.port, toolsDir })) {
    // A remembered choice wins over the shipped default.
    const enabled = settings.enabled[def.id] ?? def.enabled;
    settings.enabled[def.id] = enabled;
    supervisor.register({ ...def, enabled });
  }
  saveSettings();

  supervisor.on('change', refreshTray);

  const icon = trayImage();
  if (!icon && process.platform !== 'darwin') {
    // Better to say this loudly than to leave an invisible tray icon and an app
    // the operator cannot reach.
    console.error('tray icon asset is missing — the app would have no visible entry point');
  }
  tray = new Tray(icon || nativeImage.createEmpty());
  refreshTray();

  // On Windows a left click should open the thing; the menu is the right-click
  // gesture users expect there. On macOS a click opens the menu.
  if (process.platform === 'win32') {
    tray.on('click', () => showUi());
    tray.on('double-click', () => showUi());
  } else {
    tray.on('click', () => tray.popUpContextMenu());
  }

  applyPowerBlocker();

  // A bridge left running by a previous session still owns its analyzer port, so
  // clear those out before competing with them for it.
  for (const { id, pid } of supervisor.reclaimOrphans()) {
    console.log(`${id}: killed an orphan from a previous run (pid ${pid}) to free its port`);
  }

  supervisor.startEnabled();

  // Uptime and status text drift as processes run; a slow tick keeps the menu
  // honest without polling anything expensive.
  setInterval(refreshTray, 10_000);
}

/**
 * Start as a viewer onto a headless supervisor.
 *
 * No services are registered and nothing is spawned. The tray reflects what the
 * service publishes, and the window opens the same UI every other machine uses.
 */
function bootstrapAttached() {
  const icon = trayImage();
  tray = new Tray(icon || nativeImage.createEmpty());
  refreshTray();

  if (process.platform === 'win32') {
    tray.on('click', () => showUi());
    tray.on('double-click', () => showUi());
  } else {
    tray.on('click', () => tray.popUpContextMenu());
  }

  // Re-read the published state on a timer. A watcher on the file would be
  // tighter, but the file is replaced by rename rather than written in place, and
  // watchers on replaced files are a well-known source of missed events.
  setInterval(() => {
    const fresh = readServiceState();
    if (fresh) {
      attachedState = fresh;
    } else {
      // The service has gone. Say so rather than freezing on its last known
      // state, which would show a healthy lab that no longer exists.
      attachedState = { pid: attachedState?.pid ?? 0, aggregate: 'stopped', services: [] };
    }
    refreshTray();
  }, 3_000);
}

// Two copies would fight over port 3000 and over every serial port.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showUi());

  app.whenReady().then(() => {
    bootstrap();
    if (process.argv.includes('--open')) showUi();
  });

  // A tray app outlives its windows: closing the LIS window must not take the
  // analyzer links down with it.
  app.on('window-all-closed', () => { /* deliberately empty */ });

  app.on('before-quit', (e) => {
    if (quitting) return;
    e.preventDefault();
    quit();
  });
}
