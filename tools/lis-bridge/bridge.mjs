#!/usr/bin/env node
/**
 * ============================================================================
 * RK Clinic — LIS Bridge
 * ============================================================================
 * One always-on on-prem service that owns every analyzer connection, parses
 * each machine's protocol, and forwards normalised results to the LIS
 * ingestion endpoint (/api/lab/analyzer/results) with the analyzer API key.
 *
 *   1. cp config.example.json config.json   (then edit it)
 *   2. node tools/lis-bridge/bridge.mjs --config tools/lis-bridge/config.json
 *
 * Node 20+ only, no npm install (serial machines additionally need the
 * 'serialport' package — see README).
 * ============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { startTcpServer } from './lib/tcp-server.mjs';
import { startTcpClient } from './lib/tcp-client.mjs';
import { startSerial } from './lib/serial.mjs';
import { parseMessage, detectQuery, buildOrderResponse } from './lib/protocol.mjs';
import { createForwarder } from './lib/forwarder.mjs';
import { createReporter } from './lib/reporter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);

// ── Load config ──
const cfgIdx = process.argv.indexOf('--config');
const cfgPath = cfgIdx !== -1 ? process.argv[cfgIdx + 1] : path.join(__dirname, 'config.json');
if (!fs.existsSync(cfgPath)) {
  console.error(`❌ Config not found: ${cfgPath}\n   Copy config.example.json to config.json and edit it.`);
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
if (!config.lis || !config.lis.endpoint) {
  console.error('❌ config.lis.endpoint is required');
  process.exit(1);
}

const forwarder = createForwarder({
  endpoint: config.lis.endpoint,
  apiKey: config.lis.apiKey || process.env.LIS_ANALYZER_API_KEY,
  queueDir: path.resolve(__dirname, config.queueDir || './.queue'),
  log,
});

// Retry any queued (previously undelivered) results on a timer.
setInterval(() => forwarder.flushQueue(), 15000);
forwarder.flushQueue();

// ── Live machine status (offline | online | active) ──────────────────────────
const statusEndpoint = config.lis.statusEndpoint
  || config.lis.endpoint.replace(/\/analyzer\/results\/?$/, '/analyzer/status');
const reporter = createReporter({
  endpoint: statusEndpoint,
  apiKey: config.lis.apiKey || process.env.LIS_ANALYZER_API_KEY,
  log,
  // Control actions queued by the LIS ride back on the heartbeat response.
  onCommand: (id, command) => executeCommand(id, command),
});

// ── Host-query (LIS → analyzer): answer "what's ordered for this accession?" ──
const hostQueryEndpoint = config.lis.hostQueryEndpoint
  || config.lis.endpoint.replace(/\/analyzer\/results\/?$/, '/host-query');
const lisApiKey = config.lis.apiKey || process.env.LIS_ANALYZER_API_KEY;

// Ask the LIS what tests are ordered for a scanned accession.
async function queryHost(specimenId) {
  try {
    const url = `${hostQueryEndpoint}?specimen=${encodeURIComponent(specimenId)}`;
    const res = await fetch(url, { headers: { 'x-lis-api-key': lisApiKey || '' } });
    if (!res.ok) { log(`host-query HTTP ${res.status} for ${specimenId}`); return null; }
    return await res.json();
  } catch (e) {
    log(`host-query failed for ${specimenId}: ${e.message}`);
    return null;
  }
}

// A message arrived — if it's a query frame, resolve it to order-response
// records for the analyzer; otherwise return null so it forwards as a result.
async function handleQuery(machine, text) {
  const q = detectQuery(machine, text);
  if (!q.isQuery) return null;
  markActive(machine.id);
  log(`[${machine.id}] ⇦ host-query for specimen ${q.specimenId || '(none)'}`);

  let order = { specimenId: q.specimenId || '', tests: [] };
  if (q.specimenId) {
    const ans = await queryHost(q.specimenId);
    if (ans && ans.found) {
      order = {
        specimenId: ans.specimenId || q.specimenId,
        patientName: ans.order?.patientName,
        patientId: ans.order?.patientId,
        sex: ans.order?.sex,
        priority: ans.order?.priority,
        tests: ans.tests || [],
      };
      log(`[${machine.id}] ⇨ host-query answer: ${order.tests.length} test(s) for ${order.specimenId}`);
    } else {
      log(`[${machine.id}] host-query: no open order for ${q.specimenId}`);
    }
  }

  const records = buildOrderResponse(machine, order);
  return records ? { records } : null;
}

const ACTIVE_WINDOW_MS = 30000; // "active" if it transmitted within this window
const machineState = {};        // id -> { connected, lastActiveAt, name, protocol }

function computeStatus(id) {
  const s = machineState[id];
  if (!s || !s.connected) return 'offline';
  if (s.lastActiveAt && Date.now() - s.lastActiveAt < ACTIVE_WINDOW_MS) return 'active';
  return 'online';
}
function reportStatus(id) {
  const s = machineState[id] || {};
  reporter.report(id, computeStatus(id), {
    name: s.name, protocol: s.protocol,
    connectionType: s.connectionType, softwareVersion: s.softwareVersion,
  });
}
function setConnected(id, connected) {
  machineState[id] = { ...(machineState[id] || {}), connected };
  reportStatus(id);
}
function markActive(id) {
  machineState[id] = { ...(machineState[id] || {}), connected: true, lastActiveAt: Date.now() };
  reportStatus(id);
}

// Heartbeat: refresh every machine so the LIS never marks a live one stale,
// and "active" decays back to "online" after the window.
setInterval(() => { for (const id of Object.keys(machineState)) reportStatus(id); }, 15000);

function handleMessage(machine, rawText) {
  markActive(machine.id); // a message means this machine is actively testing
  const parsed = parseMessage(machine, rawText);
  if (!parsed.specimenId) {
    log(`[${machine.id}] ⚠ message had no specimen/barcode ID — NOT forwarded (kept in log). Raw:\n${rawText}`);
    return;
  }
  const messageId = `${machine.id}:${parsed.specimenId}:${crypto.createHash('sha256').update(rawText).digest('hex').slice(0, 16)}`;
  const payload = {
    analyzerId: machine.id,
    specimenId: parsed.specimenId,
    messageId,
    tests: parsed.tests,
    raw: rawText,
  };
  log(`[${machine.id}] specimen ${parsed.specimenId}: ${parsed.tests.length} result(s) → forwarding to LIS`);
  forwarder.forward(payload);
}

// ── Driver lifecycle (per machine) — capture handles so we can control them ──
const drivers = {};       // id -> { stop() }  (running transports)
const machinesById = {};  // id -> machine config (for restart-on-command)

function connectionTypeFor(machine) {
  const t = machine.transport || 'tcp-server';
  if (t === 'serial') return 'Serial (RS-232/USB)';
  if (t === 'manual') return 'Manual (no interface)';
  return 'Ethernet (TCP)';
}

function startDriver(machine) {
  const id = machine.id;
  const transport = machine.transport || 'tcp-server';
  if (transport === 'manual') return;
  // Baseline for the watchdog: record when this driver (re)started, so a fresh
  // start isn't immediately treated as "silent".
  machineState[id] = { ...(machineState[id] || {}), startedAt: Date.now() };
  const opts = {
    log,
    onMessage: (text) => handleMessage(machine, text),
    onStatus: (connected) => setConnected(id, connected),
    onQuery: (text) => handleQuery(machine, text),
  };
  if (transport === 'tcp-server') {
    const server = startTcpServer(machine, opts);
    drivers[id] = { stop: () => { try { server && server.close && server.close(); } catch { /* noop */ } } };
  } else if (transport === 'tcp-client') {
    const handle = startTcpClient(machine, opts);
    drivers[id] = { stop: () => { try { handle && handle.stop && handle.stop(); } catch { /* noop */ } } };
  } else if (transport === 'serial') {
    // startSerial manages its own reopen loop and returns a { stop() } handle.
    startSerial(machine, opts)
      .then((handle) => { drivers[id] = handle || { stop: () => {} }; })
      .catch((e) => log(`[${id}] serial start failed: ${e.message}`));
  } else {
    log(`[${id}] ⚠ unknown transport '${transport}' — skipped`);
  }
}

function stopDriver(id) {
  const d = drivers[id];
  if (d) { try { d.stop(); } catch { /* noop */ } delete drivers[id]; }
  setConnected(id, false); // report offline right away
}

// Execute a control action the LIS delivered on the status heartbeat.
function executeCommand(id, command) {
  const machine = machinesById[id];
  if (!machine) { log(`[${id}] command '${command}' for unknown machine — ignored`); return; }
  log(`[${id}] ⇩ LIS command: ${command}`);
  switch (command) {
    case 'reconnect':
    case 'restart':
      stopDriver(id);
      setTimeout(() => startDriver(machine), 500);
      break;
    case 'disable':
    case 'maintenance_on':
      stopDriver(id);
      break;
    case 'enable':
    case 'maintenance_off':
      if (!drivers[id]) startDriver(machine);
      break;
    default:
      log(`[${id}] unknown command '${command}' — ignored`);
  }
}

/**
 * `--only <id>[,<id>…]` restricts this run to named machines.
 *
 * Commissioning one analyzer means not opening every other port at the same
 * time: a COM port that is not there logs reopen failures every few seconds, and
 * two bridges both binding a TCP port is a silent EADDRINUSE away from results
 * going to the wrong listener.
 */
const onlyIdx = process.argv.indexOf('--only');
const onlyIds = onlyIdx !== -1 && process.argv[onlyIdx + 1]
  ? new Set(process.argv[onlyIdx + 1].split(',').map((s) => s.trim()).filter(Boolean))
  : null;
if (onlyIds) {
  const known = new Set((config.machines || []).map((m) => m.id));
  const unknown = [...onlyIds].filter((id) => !known.has(id));
  if (unknown.length) {
    console.error(`--only: no such machine in config: ${unknown.join(', ')}`);
    console.error(`available: ${[...known].join(', ')}`);
    process.exit(1);
  }
  log(`--only ${[...onlyIds].join(', ')} — other machines in config are skipped`);
}

// ── Start a driver per configured machine ──
let started = 0;
for (const machine of (config.machines || []).filter((m) => !onlyIds || onlyIds.has(m.id))) {
  machinesById[machine.id] = machine;
  const transport = machine.transport || 'tcp-server';

  if (transport === 'manual') {
    log(`[${machine.id}] manual-entry only (no data interface) — nothing to connect`);
    continue;
  }

  // Register so it shows in the dashboard (offline until it connects).
  machineState[machine.id] = {
    connected: false,
    name: machine.name || machine.id,
    protocol: machine.protocol || 'astm',
    connectionType: connectionTypeFor(machine),
    softwareVersion: machine.softwareVersion || null,
  };
  reportStatus(machine.id);

  if (machine.enabled === false) { log(`[${machine.id}] disabled in config — registered as offline, not connected`); continue; }

  startDriver(machine);
  started++;
}

// ── Watchdog (opt-in per machine via config.watchdogMs) ──────────────────────
// Transport-level auto-recovery (serial reopen / tcp-client retry / tcp-server
// re-accept) always runs. The watchdog is the extra layer: if a machine that
// should be transmitting goes silent while its link is nominally up, cycle its
// driver. Leave it OFF (0/unset) for analyzers that simply idle between samples;
// set it only for machines that transmit periodically (e.g. keep-alives).
const WATCHDOG_TICK_MS = 30000;
setInterval(() => {
  const now = Date.now();
  for (const id of Object.keys(machinesById)) {
    const machine = machinesById[id];
    const wd = Number(machine.watchdogMs) || 0;
    if (!wd) continue;                                   // opt-in only
    if ((machine.transport || 'tcp-server') === 'manual') continue;
    if (!drivers[id]) continue;                          // not running (disabled/maintenance)
    const s = machineState[id] || {};
    const last = Math.max(s.lastActiveAt || 0, s.startedAt || 0);
    if (last && now - last > wd) {
      log(`[${id}] watchdog: silent ${Math.round((now - last) / 1000)}s (> ${Math.round(wd / 1000)}s) — restarting driver`);
      stopDriver(id);
      setTimeout(() => startDriver(machine), 500);
    }
  }
}, WATCHDOG_TICK_MS);

log(`LIS Bridge running — ${started} machine driver(s) active. Forwarding to ${config.lis.endpoint}`);
process.on('SIGINT', () => { log('shutting down'); process.exit(0); });
