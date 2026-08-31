/**
 * ============================================================================
 * What the desktop app runs
 * ============================================================================
 * One declaration per long-running child: the web server, then one bridge per
 * instrument. The tray reads this list, so adding an instrument is an edit here
 * rather than a change to the UI.
 *
 * `enabled` is the default for a fresh install and is overridden by whatever the
 * operator last chose, which is remembered in the app's own settings file. The
 * defaults below are not uniform, and deliberately so — a bridge is only started
 * unattended if it has been shown to work with the instrument in front of it.
 * Auto-starting a bridge whose hardware is absent just fills the log with failed
 * starts and puts a red light in the menu bar that nobody can act on.
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * How to start the web server.
 *
 * Two shapes are supported and the leaner one wins when it is present. A
 * `next build` with output: 'standalone' produces .next/standalone/server.js
 * with only the dependencies it actually needs, which is what gets packaged into
 * the app. A plain `next build` leaves us the Next CLI, which is what a
 * developer has in a checkout. Preferring standalone means the packaged app and
 * a local run take the same code path wherever possible.
 */
function serverService({ appRoot, host, port }) {
  // Two layouts, because packaging flattens the tree. electron-builder copies
  // the contents of .next/standalone into the resources root, so inside the app
  // bundle server.js sits directly at the top; in a checkout it is still nested
  // where next build left it. Checking both keeps one code path for both.
  const standaloneCandidates = [
    path.join(appRoot, 'server.js'),
    path.join(appRoot, '.next', 'standalone', 'server.js'),
  ];
  const nextCli = path.join(appRoot, 'node_modules', 'next', 'dist', 'bin', 'next');

  const common = {
    id: 'server',
    label: 'LIS web server',
    enabled: true,
    healthUrl: `http://127.0.0.1:${port}/api/health`,
  };

  const standalone = standaloneCandidates.find((p) => fs.existsSync(p));
  if (standalone) {
    return {
      ...common,
      script: standalone,
      args: [],
      // The standalone server takes its address from the environment; there are
      // no command-line flags to pass it.
      env: { HOSTNAME: host, PORT: String(port) },
      note: 'packaged build',
    };
  }

  return {
    ...common,
    script: nextCli,
    args: ['start', '-H', host, '-p', String(port)],
    note: 'development checkout (next start)',
  };
}

/**
 * The analyzer bridges.
 *
 * Each entry's `enabled` reflects what is actually known to work as of
 * 2026-08-08, and the notes are the reason — they are shown in the tray so the
 * bench sees why a line is not running rather than assuming it is broken.
 */
function bridgeServices({ appRoot, toolsDir }) {
  const tool = (name) => path.join(toolsDir || path.join(appRoot, 'tools'), name);

  return [
    {
      id: 'hemat60',
      label: 'Hemat 60 — Hematology',
      script: tool('lis-bridge.mjs'),
      args: [],
      enabled: true,
      after: 'server',
      note: 'HL7 over MLLP, TCP 8080. Proven in production.',
    },
    {
      id: 'mispaplus',
      label: 'Mispa Plus — Biochemistry',
      script: tool('mispa-bridge.mjs'),
      args: [],
      enabled: true,
      after: 'server',
      note: 'Proprietary line protocol, TCP 8888. Driver written from a captured frame; '
        + 'the instrument opens the socket once and needs a nudge on its connectivity '
        + 'screen if this is restarted.',
    },
    {
      id: 'afinion2',
      label: 'Afinion 2 — POCT',
      script: tool('lis-bridge.mjs'),
      args: [],
      env: {
        BRIDGE_PORT: '2575',
        BRIDGE_ANALYZER_ID: 'afinion2',
        // This one does need answering: it sets MSH-15 = AL, and an unanswered
        // message is resent every 30 s forever. The Hemat 60 on 8080 is the
        // opposite case, which is why the flag is per-analyzer and not global.
        BRIDGE_ACK: '1',
      },
      enabled: true,
      after: 'server',
      note: 'HL7 over MLLP, TCP 2575 — the analyzer dials in. Replaces the old DLE/5555 '
        + 'driver: the instrument had Protocol set to Disabled, and once switched to HL7 '
        + 'it sent a normal ORU^R01. Answering its ACK request drained 153 stored results '
        + 'on the first connection. Tick "New results only" on the instrument before '
        + 'pointing it here, or it replays its whole history again.',
    },
    {
      id: 'maglumi800',
      label: 'Maglumi 800 — Immunoassay',
      script: tool(path.join('lis-bridge', 'bridge.mjs')),
      args: ['--only', 'maglumi800'],
      enabled: true,
      after: 'server',
      note: 'HL7 over TCP, listening on 2576. Switched off serial/ASTM after reading the '
        + "vendor install: the Maglumi's own Lis.exe offers TCP, its socket layer is "
        + 'HP-Socket, and Snibe\'s LIS parses HL7 (DllHL7Analysis.dll). Not yet seen '
        + 'against this instrument — the instrument still has to be pointed at this '
        + 'machine on 2576 from its own LIS screen. Listening costs nothing until it does.',
    },
  ];
}

/**
 * @param {object} opts
 * @param {string} opts.appRoot
 * @param {string} opts.host
 * @param {number} opts.port
 * @param {string} [opts.toolsDir] where the bridge scripts live. The packaged
 *   app points this at build/tools, which holds the bundled and minified
 *   bridges; a checkout leaves it unset and runs the readable source.
 */
function allServices({ appRoot, host, port, toolsDir }) {
  return [serverService({ appRoot, host, port }), ...bridgeServices({ appRoot, toolsDir })];
}

module.exports = { allServices, serverService, bridgeServices };
