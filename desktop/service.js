#!/usr/bin/env node
/**
 * ============================================================================
 * RK Clinic LIS — headless supervisor
 * ============================================================================
 * The always-on half of the installation. It runs the LIS web server and the
 * analyzer bridges, and it has no window, no tray icon and no dependence on
 * anyone being logged in.
 *
 * Why this exists separately from the tray app
 * -------------------------------------------
 * The tray app supervises its children, which means the instruments are only
 * connected for as long as that app is running. On a lab machine that is the
 * wrong lifetime. Nobody should have to log in for the analyzers to be listening,
 * and closing an app by accident should not silently stop results arriving.
 *
 * So the lifetime belongs here: started at boot by the operating system,
 * restarted by it on failure, running whether or not a user is present. The tray
 * app becomes what it should have been all along — a window onto this process,
 * useful when a human is at the machine and irrelevant when they are not.
 *
 * On Windows this is registered as a scheduled task with an "At startup" trigger
 * and "Run whether user is logged on or not"; on macOS a launchd agent. Either
 * way the executable is the app's own binary, run in Node mode, so nothing needs
 * to be installed alongside it.
 *
 * Status is published to state.json, which is how the tray reads what is
 * happening without either process having to talk to the other.
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');

const { Supervisor } = require('./supervisor');
const { allServices } = require('./services');
const { logsDir, stateFile, userDataDir } = require('./paths');
const { loadDotEnv, missingConfig, loadSettings } = require('./config');

/**
 * The tree holding the bridges, the compiled server and node_modules.
 *
 * Bundled, this file is build/service.js so APP_ROOT is the app directory; in a
 * checkout it is desktop/service.js and APP_ROOT is the repository. Both put
 * node_modules a level up, which is what the bridges resolve `serialport`
 * against.
 */
const APP_ROOT = path.join(__dirname, '..');

/** How often to refresh the published state, so uptimes do not go stale. */
const PUBLISH_EVERY_MS = 5_000;

const ts = () => new Date().toISOString();

/**
 * Tee console output to a file.
 *
 * A background process with nowhere to write is a background process nobody can
 * debug. The per-service logs are written by the supervisor; this catches the
 * supervisor's own messages, including the reason it refused to start.
 */
function startLogging() {
  fs.mkdirSync(logsDir(), { recursive: true });
  const stream = fs.createWriteStream(path.join(logsDir(), 'service.log'), { flags: 'a' });

  for (const level of ['log', 'error', 'warn']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      const line = `[${ts()}] ${args.join(' ')}`;
      original(line);
      try { stream.write(`${line}\n`); } catch { /* never let logging break the lab */ }
    };
  }
  return stream;
}

function main() {
  const logStream = startLogging();
  const settings = loadSettings();
  const env = loadDotEnv(APP_ROOT);

  console.log('─'.repeat(64));
  console.log('RK Clinic LIS — headless supervisor');
  console.log(`  app       : ${APP_ROOT}`);
  console.log(`  data      : ${userDataDir()}`);
  console.log(`  server    : http://${settings.host}:${settings.port}`);
  console.log(`  runtime   : ${process.versions.electron ? `electron ${process.versions.electron} as node` : `node ${process.versions.node}`}`);
  console.log('─'.repeat(64));

  const missing = missingConfig(env);
  if (missing.length) {
    // Not fatal on purpose. The server will start and report itself unhealthy,
    // which is more useful to diagnose than a process that exits at boot and
    // leaves nothing behind but a scheduled task marked "failed".
    console.error(`⚠ configuration incomplete — missing ${missing.join(', ')}`);
    console.error(`⚠ create ${path.join(userDataDir(), '.env.local')} and restart this service`);
  }

  /**
   * Where the bridges send results.
   *
   * Local when this machine runs the web server, which is the single-site case.
   * But when the server lives elsewhere — the lab holding the instruments while
   * the LIS runs at the hospital — this machine runs bridges only, and they must
   * post across the link. Overriding to localhost unconditionally, as an earlier
   * revision did, meant every result queued to the spool against a server that
   * was never going to answer on this host.
   */
  const serverEnabled = settings.enabled.server ?? true;
  const lisBaseUrl = serverEnabled
    ? `http://127.0.0.1:${settings.port}`
    : (env.LIS_BASE_URL || '').replace(/\/$/, '');

  if (!serverEnabled) {
    if (lisBaseUrl) {
      console.log(`  mode      : bridges only — posting to ${lisBaseUrl}`);
    } else {
      console.error('⚠ the web server is disabled and LIS_BASE_URL is not set.');
      console.error('⚠ the bridges have nowhere to send results and will queue them to disk.');
    }
  }

  const supervisor = new Supervisor({
    appRoot: APP_ROOT,
    logsDir: logsDir(),
    // Our own binary. Under Electron that means Node mode; under plain Node it is
    // simply node. Either way nothing extra has to exist on the machine.
    nodePath: process.execPath,
    runAsNode: Boolean(process.versions.electron),
    stateFile: stateFile(),
    env: {
      ...env,
      NODE_ENV: 'production',
      // Bridges write raw captures and — crucially — spooled results. Their
      // working directory is the application folder, which on Windows sits under
      // Program Files and is not writable without elevation. Point them at the
      // per-user data directory instead. See tools/lib/data-dir.mjs.
      RK_DATA_DIR: userDataDir(),
      ...(lisBaseUrl ? { LIS_BASE_URL: lisBaseUrl } : {}),
    },
  });

  // Bundled, the bridges sit beside this file in build/tools; from a checkout
  // they are the readable originals under tools/.
  const bundledTools = path.join(__dirname, 'tools');
  const toolsDir = fs.existsSync(bundledTools) ? bundledTools : path.join(APP_ROOT, 'tools');

  for (const def of allServices({ appRoot: APP_ROOT, host: settings.host, port: settings.port, toolsDir })) {
    const enabled = settings.enabled[def.id] ?? def.enabled;
    supervisor.register({ ...def, enabled });
  }

  supervisor.on('change', (service) => {
    console.log(`${service.id}: ${service.status}${service.lastError ? ` — ${service.lastError}` : ''}`);
  });

  supervisor.startEnabled();
  supervisor.publishState();

  const ticker = setInterval(() => supervisor.publishState(), PUBLISH_EVERY_MS);

  let stopping = false;
  const shutdown = async (reason) => {
    if (stopping) return;
    stopping = true;
    console.log(`shutting down (${reason})`);
    clearInterval(ticker);

    try {
      await supervisor.stopAll();
    } catch (err) {
      console.error(`shutdown error: ${err.message}`);
    }

    // Remove the state file rather than leave a stale one claiming everything is
    // running — the tray would otherwise show a healthy lab with nothing behind it.
    try { fs.rmSync(stateFile(), { force: true }); } catch { /* nothing to do */ }

    console.log('stopped');
    logStream.end();
    setTimeout(() => process.exit(0), 300);
  };

  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => shutdown(signal));
  }
  // A service manager may prefer to ask over IPC; behave identically either way.
  process.on('message', (message) => {
    if (message && message.type === 'shutdown') shutdown('ipc');
  });

  process.on('uncaughtException', (err) => {
    // Log and keep going: one bad event in the supervisor must not take four
    // analyzer links down with it. The children are separate processes and are
    // unaffected by this.
    console.error(`uncaught exception in supervisor: ${err.stack || err.message}`);
  });
}

main();
