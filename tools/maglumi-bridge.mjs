#!/usr/bin/env node
/**
 * ============================================================================
 * RK Clinic LIS — Maglumi 800 bridge (ASTM E1394 over RS-232)
 * ============================================================================
 *   node tools/maglumi-bridge.mjs [--port /dev/tty.X] [--baud 9600] [--dry-run]
 *
 * Bidirectional, both halves implemented:
 *
 *   result upload    analyzer sends H/P/O/R/L  →  POST /api/lab/analyzer/results
 *   order download   analyzer sends H/Q/L      →  GET  /api/lab/host-query
 *                                              →  we reply H/P/O…/L
 *
 * Why this exists separately from tools/lis-bridge.mjs: the Hemat 60 speaks HL7
 * v2.3.1 over MLLP with no handshake, the Maglumi speaks ASTM E1394 with a full
 * ENQ/ACK link layer. Same destination, completely different conversation.
 *
 * The link layer is the part that bit us during discovery. The analyzer sends
 * ENQ and will not proceed without an ACK; our read-only capture stayed silent,
 * so it retried four times, sent EOT and gave up. What looked like a baud
 * mismatch was simply an unanswered handshake.
 *
 * --dry-run answers queries and logs results without POSTing, for safe testing.
 * ============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { SerialPort } from 'serialport';
import {
  ENQ, ACK, NAK, STX, ETX, ETB, EOT, CR, LF,
  buildFrame, parseFrame, parseRecord, decodeAstm,
  buildOrderDownload, buildNoOrderReply, buildRecordBlock,
} from './astm.mjs';
import { createForwarder } from './lib/result-forwarder.mjs';
import { onShutdown } from './lib/shutdown.mjs';
import { dataDir } from './lib/data-dir.mjs';

dotenv.config({ path: '.env.local' });
dotenv.config();

const args = process.argv.slice(2);
const flag = (n, d = null) => { const i = args.indexOf(n); return i !== -1 && args[i + 1] ? args[i + 1] : d; };

const BAUD = parseInt(flag('--baud', process.env.MAGLUMI_BAUD || '9600'), 10);
const PARITY = flag('--parity', process.env.MAGLUMI_PARITY || 'none');
const DATA_BITS = parseInt(flag('--databits', process.env.MAGLUMI_DATA_BITS || '8'), 10);
const STOP_BITS = parseInt(flag('--stopbits', process.env.MAGLUMI_STOP_BITS || '1'), 10);
const DRY_RUN = args.includes('--dry-run');

/**
 * Which link layer to speak: 'auto' (default), 'bare' or 'framed'.
 *
 * 'bare' is the one the Snibe manual documents — lone STX, no frame number, no
 * checksum, and an ACK expected after every control byte including EOT.
 * 'framed' is textbook E1381, STX FN text ETX C1 C2 CR LF.
 *
 * 'auto' waits to be told by the instrument: a digit right after STX means
 * framed, a record letter means bare, and an STX that arrives alone and then
 * goes quiet means bare too — because in bare mode the analyzer is sitting there
 * waiting for us to acknowledge that STX before it will send anything else.
 */
const FRAMING = (flag('--framing', process.env.MAGLUMI_FRAMING || 'auto')).toLowerCase();
if (!['auto', 'bare', 'framed'].includes(FRAMING)) {
  console.error(`❌ --framing must be auto, bare or framed (got "${FRAMING}")`);
  process.exit(1);
}

/** How long a lone STX may sit unexplained before we call it bare framing. */
const STX_DECIDE_MS = 300;

/** How long to wait for the analyzer to acknowledge a step of our download. */
const OUTBOUND_STEP_TIMEOUT_MS = 15_000;

const BASE_URL = (process.env.LIS_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const API_KEY = process.env.LIS_ANALYZER_API_KEY;
const ANALYZER_ID = process.env.MAGLUMI_ANALYZER_ID || 'maglumi800';
const LIS_ID = process.env.LIS_ASTM_ID || 'LIS';
const ANALYZER_ASTM_ID = process.env.MAGLUMI_ASTM_ID || 'MAGLUMI';

// Must be well inside the LIS staleness window (analyzer-metrics STALE_MS, 60s)
// or the dashboard marks a healthy line offline between beats.
const HEARTBEAT_MS = 30_000;

const RAW_DIR = dataDir('maglumi-raw');
fs.mkdirSync(RAW_DIR, { recursive: true });
const rawLog = fs.createWriteStream(path.join(RAW_DIR, `session-${Date.now()}.bin`));

const ts = () => new Date().toISOString().replace('T', ' ').replace('Z', '');
const log = (m) => console.log(`[${ts()}] ${m}`);
const warn = (m) => console.warn(`[${ts()}] ⚠  ${m}`);

/* ── Port discovery ───────────────────────────────────────────────────────── */

const isCandidate = (p) =>
  p.path && !/Bluetooth|debug-console/i.test(p.path) && (p.vendorId || p.productId || p.manufacturer);

async function resolvePort() {
  const explicit = flag('--port');
  if (explicit) return explicit;
  const candidates = (await SerialPort.list()).filter(isCandidate);
  if (candidates.length === 1) return candidates[0].path;
  if (!candidates.length) {
    console.error('❌ No USB-serial device found. Plug the adapter in, then re-run.');
    process.exit(1);
  }
  console.error('❌ Several USB-serial devices; choose one with --port:');
  for (const c of candidates) console.error(`   ${c.path}  ${c.manufacturer || ''}`);
  process.exit(1);
}

/* ── LIS calls ────────────────────────────────────────────────────────────── */

async function hostQuery(specimenId) {
  const url = `${BASE_URL}/api/lab/host-query?specimen=${encodeURIComponent(specimenId)}`;
  const res = await fetch(url, { headers: { 'x-lis-api-key': API_KEY } });
  if (!res.ok) throw new Error(`host-query ${res.status}`);
  return res.json();
}

/**
 * Delivery with a durable queue behind it. See tools/lib/result-forwarder.mjs —
 * a result that cannot be posted is written to tmp/maglumi-spool and retried,
 * because the analyzer will not hold it for us and the LIS may be at another
 * site.
 */
const forwarder = createForwarder({
  analyzerId: ANALYZER_ID,
  baseUrl: BASE_URL,
  apiKey: API_KEY,
  spoolDir: dataDir('maglumi-spool'),
  log, warn, dryRun: DRY_RUN,
});

function resultPayload(specimenId, tests, raw) {
  const digest = crypto.createHash('sha256')
    .update(JSON.stringify({ ANALYZER_ID, specimenId, tests })).digest('hex').slice(0, 24);
  return {
    analyzerId: ANALYZER_ID,
    specimenId,
    messageId: `${ANALYZER_ID}:${specimenId}:${digest}`,
    tests,
    raw,
  };
}

/**
 * Report the line's state to the LIS and collect any queued command.
 *
 * The response carries a control command at most once — the server clears it
 * as it hands it over — so it must never be dropped silently.
 *
 * @param {'active'|'online'|'offline'} status
 */
async function reportStatus(status) {
  try {
    const res = await fetch(`${BASE_URL}/api/lab/analyzer/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-lis-api-key': API_KEY },
      body: JSON.stringify({
        analyzerId: ANALYZER_ID, status,
        name: 'Snibe Maglumi 800', department: 'Immunoassay (CLIA)',
        protocol: 'ASTM E1394', connectionType: 'Serial (RS-232/USB)',
      }),
    });
    if (!res.ok) {
      warn(`status report rejected ${res.status} — the analyzer tile will go stale`);
      return;
    }
    const body = await res.json().catch(() => null);
    if (body?.command) {
      log(`⚙ command from LIS: ${body.command}`);
      handleCommand(body.command);
    }
  } catch (err) {
    // A heartbeat failure must not disturb the analyzer link.
    warn(`status report failed (${err.message})`);
  }
}

/**
 * Act on a control command handed back on the heartbeat.
 *
 * `rack_scan` deserves a word. The operator has pressed Scan in the LIS and is
 * about to scan a sample-holder key. There is nothing to transmit: ASTM E1394
 * has no "prepare to scan" record, and on this link the analyzer is always the
 * one that opens a conversation. What the command is for is the log — it marks
 * the moment the bench started loading a holder, so a query arriving a minute
 * later can be read in context, and it proves the port was open at the time.
 * Anything unimplemented is warned about rather than swallowed, so it is
 * obvious when an operator's request had no effect.
 */
function handleCommand(command) {
  switch (command) {
    case 'rack_scan':
      rackArmedAt = Date.now();
      if (port?.isOpen) {
        log('   → holder scan armed; line is open and ready for the analyzer to query');
      } else {
        warn('   → holder scan armed but the serial port is NOT open — the analyzer cannot ask for orders');
      }
      break;
    case 'reconnect':
    case 'restart':
      log('   → cycling the serial port');
      cyclePort();
      break;
    case 'disable':
      log('   → closing the serial port');
      if (port?.isOpen) port.close();
      break;
    case 'enable':
      log('   → reopening the serial port');
      if (!port?.isOpen) cyclePort();
      break;
    case 'maintenance_on':
    case 'maintenance_off':
      log(`   → "${command}" noted; no change to the line`);
      break;
    default:
      warn(`   → unrecognised command "${command}"; ignored`);
  }
}

/* ── Session state ────────────────────────────────────────────────────────── */

/**
 * One ASTM "transaction" — everything between ENQ and EOT. Records accumulate
 * across frames and are interpreted when the terminator arrives.
 */
function newSession() {
  return { records: [], inbound: false };
}

let session = newSession();
let rxBuffer = Buffer.alloc(0);
let port = null;
let devicePath = null;        // remembered so a reconnect can reopen the same tty
let outboundQueue = [];       // records waiting to be sent (framed mode)
let sendingFrameNo = 1;
let rackArmedAt = null;       // when the bench last pressed Scan in the LIS

/** 'bare' | 'framed' | null — what this line has actually been observed doing. */
let linkMode = FRAMING === 'auto' ? null : FRAMING;

/** True between a bare-mode STX and its ETX: incoming bytes are record text. */
let bareActive = false;
let lineBytes = [];           // bytes of the record currently arriving (bare mode)
let stxTimer = null;          // pending "is this lone STX bare framing?" decision

/** Bare-mode download progress: null | 'enq' | 'stx' | 'records' | 'etx' | 'eot' */
let outboundStep = null;
let outboundRecords = [];
let outboundMode = null;
let outboundTimer = null;

/** How long a holder-scan arming stays interesting in the log. */
const RACK_ARMED_WINDOW_MS = 10 * 60 * 1000;

/** "…, 42s after the holder scan was armed" — or '' when not relevant. */
function rackContext() {
  if (!rackArmedAt) return '';
  const age = Date.now() - rackArmedAt;
  if (age > RACK_ARMED_WINDOW_MS) return '';
  return ` (${Math.round(age / 1000)}s after the holder scan was armed)`;
}

function write(bytes, label) {
  if (!port?.isOpen) return;
  port.write(Buffer.from(bytes));
  if (label) log(`   ⬆ ${label}`);
}

/* ── Outbound: we become the sender for an order download ─────────────────── */

/**
 * Start sending records to the analyzer.
 *
 * Which dialect we use is decided by what the line has already shown us. If the
 * analyzer has never spoken yet, bare framing is the default, since that is what
 * the Snibe manual documents for this instrument.
 */
function beginOutbound(records) {
  clearOutboundTimer();
  outboundRecords = [...records];
  outboundMode = linkMode || (FRAMING === 'framed' ? 'framed' : 'bare');

  if (outboundMode === 'bare') {
    outboundStep = 'enq';
    log(`   ⬆ ENQ (offering ${records.length} record(s), bare framing)`);
    write([ENQ]);
  } else {
    outboundQueue = [...records];
    sendingFrameNo = 1;
    outboundStep = 'framed';
    log(`   ⬆ ENQ (offering ${records.length} record(s), framed)`);
    write([ENQ]);
  }
  armOutboundTimer();
}

function armOutboundTimer() {
  clearOutboundTimer();
  if (!outboundStep) return;
  outboundTimer = setTimeout(() => {
    warn(`download stalled at "${outboundStep}" — no ACK in ${OUTBOUND_STEP_TIMEOUT_MS / 1000}s; giving the line back`);
    outboundStep = null;
    outboundRecords = [];
    outboundQueue = [];
    write([EOT], 'EOT (abandoning the download)');
  }, OUTBOUND_STEP_TIMEOUT_MS);
}

function clearOutboundTimer() {
  if (outboundTimer) { clearTimeout(outboundTimer); outboundTimer = null; }
}

/**
 * The analyzer ACKed something. Move the download on one step.
 *
 * Bare mode follows manual 16.6.2 exactly: ENQ, STX, the whole record block,
 * ETX, EOT — each waiting for its own ACK. The final ACK is the analyzer
 * acknowledging our EOT, which textbook ASTM would never send but this
 * instrument does.
 */
function advanceOutbound() {
  if (!outboundStep) {
    // Nothing of ours is in flight. An ACK here is the analyzer being polite
    // about something we did not send; noting it beats silently swallowing it.
    warn('⬇ ACK with no download in progress — ignored');
    return;
  }

  if (outboundMode === 'framed') { sendNextFrame(); armOutboundTimer(); return; }

  switch (outboundStep) {
    case 'enq':
      outboundStep = 'stx';
      write([STX], 'STX');
      break;
    case 'stx': {
      outboundStep = 'records';
      port.write(buildRecordBlock(outboundRecords));
      for (const r of outboundRecords) log(`   ⬆ ${r.slice(0, 80)}`);
      break;
    }
    case 'records':
      outboundStep = 'etx';
      write([ETX], 'ETX');
      break;
    case 'etx':
      outboundStep = 'eot';
      write([EOT], 'EOT (download complete)');
      break;
    case 'eot':
      outboundStep = null;
      outboundRecords = [];
      clearOutboundTimer();
      log('   ✅ download acknowledged');
      return;
    default:
      outboundStep = null;
      return;
  }
  armOutboundTimer();
}

function sendNextFrame() {
  if (!outboundQueue.length) {
    outboundStep = null;
    clearOutboundTimer();
    write([EOT], 'EOT (download complete)');
    return;
  }
  const record = outboundQueue.shift();
  const frame = buildFrame(sendingFrameNo, record, true);
  sendingFrameNo = (sendingFrameNo % 7) + 1;
  port.write(frame);
  log(`   ⬆ frame: ${record.slice(0, 70)}`);
}

/* ── Inbound interpretation ───────────────────────────────────────────────── */

async function handleTransaction(records) {
  const parsed = records.map(parseRecord);
  const query = parsed.find((r) => r.type === 'Q');
  const results = parsed.filter((r) => r.type === 'R');
  const order = parsed.find((r) => r.type === 'O');

  if (query) {
    await answerQuery(query.specimenId);
    return;
  }

  if (results.length) {
    const specimenId = order?.specimenId || null;
    if (!specimenId) {
      warn('results arrived with no specimen id in the O record — cannot match, discarding');
      return;
    }

    const tests = results
      .filter((r) => r.testCode && r.value !== '')
      .map((r) => ({
        code: r.testCode,
        value: r.value,
        unit: r.unit,
        flag: /^H$/i.test(r.flag) ? 'H' : /^L$/i.test(r.flag) ? 'L' : '',
      }));

    if (!tests.length) { warn('no usable R records in transaction'); return; }

    log(`⬇ ${tests.length} result(s) for specimen ${specimenId}: ` +
        tests.map((t) => `${t.code}=${t.value}${t.unit ? ' ' + t.unit : ''}`).join(', '));

    await forwarder.send(resultPayload(specimenId, tests, records.join('\r')));
  }
}

async function answerQuery(specimenId) {
  if (!specimenId) {
    warn('query with no specimen id — replying "no order"');
    beginOutbound(buildNoOrderReply({ senderId: LIS_ID, receiverId: ANALYZER_ASTM_ID }));
    return;
  }

  log(`⬇ query: what is ordered for specimen ${specimenId}?${rackContext()}`);

  let answer = null;
  try {
    answer = await hostQuery(specimenId);
  } catch (err) {
    warn(`host-query failed (${err.message}) — replying "no order" so the analyzer isn't left waiting`);
  }

  if (!answer?.found) {
    log('   → nothing ordered for that specimen');
    beginOutbound(buildNoOrderReply({ senderId: LIS_ID, receiverId: ANALYZER_ASTM_ID }));
    return;
  }

  // Only offer tests this analyzer can actually run.
  const mine = (answer.tests || []).filter(
    (t) => !t.department || /immuno/i.test(t.department)
  );
  const offered = mine.length ? mine : answer.tests || [];

  log(`   → ${answer.order?.patientName || 'patient'}: ${offered.map((t) => t.code).join(', ') || 'none'}`);

  beginOutbound(buildOrderDownload({
    specimenId,
    tests: offered,
    patient: {
      id: answer.order?.patientId || '',
      name: answer.order?.patientName || '',
      sex: answer.order?.sex || '',
    },
    senderId: LIS_ID,
    receiverId: ANALYZER_ASTM_ID,
  }));
}

/* ── Link layer ───────────────────────────────────────────────────────────── */

function consume(chunk) {
  rawLog.write(chunk);
  rxBuffer = Buffer.concat([rxBuffer, chunk]);
  pump();
}

/**
 * Decide, on seeing an STX, which dialect this is.
 *
 * @returns {'bare'|'framed'|null} null means "not enough bytes to tell yet"
 */
function classifyStx() {
  if (FRAMING !== 'auto') return FRAMING;
  if (linkMode) return linkMode;              // this line already told us once
  if (rxBuffer.length < 2) return null;       // a lone STX so far — let the timer decide

  const next = rxBuffer[1];
  // Textbook framing puts a frame-number digit straight after STX. Records start
  // with a letter (H, P, O, Q, R, C, L), so a letter means the bare dialect.
  if (next >= 0x30 && next <= 0x39) return 'framed';
  return 'bare';
}

function noteLinkMode(mode) {
  if (linkMode === mode) return;
  linkMode = mode;
  log(mode === 'bare'
    ? '   ℹ link layer: bare framing (no frame number, no checksum) — as documented for this instrument'
    : '   ℹ link layer: textbook E1381 frames (frame number + checksum)');
}

/**
 * A bare-mode record has arrived complete (its CR was seen).
 *
 * The manual expects a single ACK for the whole block, sent once the terminator
 * record (L) has landed — not one per record. Sending an ACK the sender is not
 * waiting for is how a link starts talking over itself.
 */
function pushBareRecord() {
  if (!lineBytes.length) return;
  const text = decodeAstm(Buffer.from(lineBytes)).trim();
  lineBytes = [];
  if (!text) return;

  log(`⬇ ${text.slice(0, 90)}`);
  session.records.push(text);

  if (/^L\|/i.test(text)) write([ACK], 'ACK (record block received)');
}

function pump() {
  for (;;) {
    if (!rxBuffer.length) return;
    const b = rxBuffer[0];

    // Single-byte link control.
    if (b === ENQ) {
      rxBuffer = rxBuffer.subarray(1);
      session = newSession();
      session.inbound = true;
      bareActive = false;
      lineBytes = [];
      log('⬇ ENQ — analyzer requesting the line');
      write([ACK], 'ACK');
      continue;
    }
    if (b === EOT) {
      rxBuffer = rxBuffer.subarray(1);
      log('⬇ EOT — transaction complete');
      // In bare mode the analyzer waits for an ACK even on the EOT (manual
      // 16.6.1); without it, it decides the LIS has gone away.
      if (linkMode === 'bare') write([ACK], 'ACK (EOT)');
      bareActive = false;
      lineBytes = [];
      const records = session.records;
      session = newSession();
      if (records.length) handleTransaction(records).catch((e) => warn(e.message));
      continue;
    }
    if (b === ACK) {
      rxBuffer = rxBuffer.subarray(1);
      advanceOutbound();
      continue;
    }
    if (b === NAK) {
      rxBuffer = rxBuffer.subarray(1);
      warn('⬇ NAK — analyzer rejected the last frame');
      continue;
    }
    if (b === ETX && bareActive) {
      rxBuffer = rxBuffer.subarray(1);
      pushBareRecord();                 // in case the last record lacked its CR
      bareActive = false;
      log('⬇ ETX — end of message block');
      write([ACK], 'ACK (ETX)');
      continue;
    }

    if (b === STX) {
      const mode = classifyStx();
      if (mode === null) { scheduleStxDecision(); return; }

      if (mode === 'bare') {
        rxBuffer = rxBuffer.subarray(1);
        clearStxTimer();
        noteLinkMode('bare');
        if (!session.inbound) { session = newSession(); session.inbound = true; }
        bareActive = true;
        lineBytes = [];
        log('⬇ STX — start of message block');
        write([ACK], 'ACK (STX)');
        continue;
      }

      // Textbook frame: STX FN … ETX/ETB CS CS CR LF
      const end = rxBuffer.findIndex((x, i) => i > 0 && (x === ETX || x === ETB));
      if (end === -1) return;                       // still arriving
      if (rxBuffer.length < end + 5) return;        // checksum + CR LF pending

      const frame = rxBuffer.subarray(0, end + 5);
      rxBuffer = rxBuffer.subarray(end + 5);
      noteLinkMode('framed');

      const parsed = parseFrame(frame);
      if (!parsed.ok) {
        warn(`⬇ bad frame (${parsed.reason}${parsed.expected ? `, expected ${parsed.expected} got ${parsed.actual}` : ''}) — NAK`);
        write([NAK]);
        continue;
      }

      log(`⬇ ${parsed.text.slice(0, 90)}`);
      session.records.push(parsed.text);
      write([ACK]);
      continue;
    }

    // Record text, in bare mode.
    if (bareActive) {
      rxBuffer = rxBuffer.subarray(1);
      if (b === CR) pushBareRecord();
      else if (b !== LF) lineBytes.push(b);
      continue;
    }

    // Anything else is noise between transactions; drop one byte and resync.
    rxBuffer = rxBuffer.subarray(1);
  }
}

/**
 * An STX turned up with nothing behind it. In textbook framing the rest of the
 * frame follows immediately, so silence means this is the bare dialect and the
 * analyzer is waiting for us to acknowledge the STX before it will go on. Give
 * the rest of a frame a brief chance to arrive, then commit to bare.
 */
function scheduleStxDecision() {
  if (stxTimer) return;
  stxTimer = setTimeout(() => {
    stxTimer = null;
    if (!rxBuffer.length || rxBuffer[0] !== STX) return;
    log('   … a lone STX and then silence — the analyzer is waiting on an ACK');
    noteLinkMode('bare');
    pump();
  }, STX_DECIDE_MS);
}

function clearStxTimer() {
  if (stxTimer) { clearTimeout(stxTimer); stxTimer = null; }
}

/* ── Port lifecycle ───────────────────────────────────────────────────────── */

/**
 * Open the serial port and wire the link layer to it.
 *
 * Extracted from main() so a `reconnect`/`restart` command from the LIS can
 * cycle the line. Unlike the Hemat 60 — which dials in over TCP, leaving us
 * unable to redial it — a serial port is ours to reopen, so those commands do
 * something real here.
 *
 * @param {{exitOnFailure?: boolean}} opts exit the process if the port will not
 *   open. True at startup (nothing to fall back to), false for a live cycle
 *   (better to stay up, report offline and let the operator retry).
 */
function openPort({ exitOnFailure = false } = {}) {
  port = new SerialPort({
    path: devicePath, baudRate: BAUD, dataBits: DATA_BITS,
    stopBits: STOP_BITS, parity: PARITY, autoOpen: false,
  });

  port.on('open', () => {
    log('✅ port open — ready to answer ENQ');
    if (!DRY_RUN) reportStatus('online');
  });
  port.on('data', consume);
  port.on('error', (e) => warn(`serial: ${e.message}`));
  port.on('close', () => { log('🔌 port closed'); if (!DRY_RUN) reportStatus('offline'); });

  port.open((err) => {
    if (!err) return;
    const message = `could not open ${devicePath}: ${err.message}`;
    if (!exitOnFailure) { warn(message); return; }
    console.error(`❌ ${message}`);
    if (/Resource busy/i.test(err.message)) {
      console.error('   Another process holds the port — stop the capture tool first.');
    }
    process.exit(1);
  });
}

/** Close the line (if open) and reopen it, discarding any half-read frame. */
function cyclePort() {
  rxBuffer = Buffer.alloc(0);
  session = newSession();
  outboundQueue = [];
  outboundRecords = [];
  outboundStep = null;
  clearOutboundTimer();
  clearStxTimer();
  bareActive = false;
  lineBytes = [];
  // linkMode is deliberately kept: it is a fact about the instrument, not about
  // this particular open file handle.
  if (port?.isOpen) {
    port.close(() => setTimeout(() => openPort(), 400));
  } else {
    openPort();
  }
}

/* ── Main ─────────────────────────────────────────────────────────────────── */

async function main() {
  if (!API_KEY && !DRY_RUN) {
    console.error('❌ LIS_ANALYZER_API_KEY is not set in .env.local (or use --dry-run).');
    process.exit(1);
  }

  devicePath = await resolvePort();

  console.log('════════════════════════════════════════════════════════════');
  console.log(' RK Clinic LIS — Maglumi 800 bridge (ASTM E1394)');
  console.log(`  device   : ${devicePath}`);
  console.log(`  line     : ${BAUD} ${DATA_BITS}${PARITY[0].toUpperCase()}${STOP_BITS}, no flow control`);
  console.log(`  framing  : ${FRAMING}${FRAMING === 'auto' ? ' (bare unless the analyzer proves otherwise)' : ''}`);
  console.log(`  analyzer : ${ANALYZER_ID}  (ASTM id ${ANALYZER_ASTM_ID})`);
  console.log(`  LIS      : ${BASE_URL}  (ASTM id ${LIS_ID})`);
  console.log(`  mode     : ${DRY_RUN ? 'DRY RUN — answers queries, does not post results' : 'live'}`);
  console.log('════════════════════════════════════════════════════════════\n');

  if (!DRY_RUN) {
    const waiting = forwarder.pendingCount();
    if (waiting) log(`spool: ${waiting} result(s) from a previous run waiting to be delivered`);
    forwarder.drain().catch((e) => warn(`spool drain failed: ${e.message}`));
    forwarder.start();
  }

  openPort({ exitOnFailure: true });

  // Serial gives us no keep-alive to piggyback on, so the heartbeat is on a
  // timer. It has to beat faster than the LIS staleness window (60s) or the
  // dashboard shows the instrument offline while the line is perfectly healthy,
  // and it is also how queued commands reach us.
  if (!DRY_RUN) {
    setInterval(() => reportStatus(port?.isOpen ? 'online' : 'offline'), HEARTBEAT_MS);
  }

  onShutdown(() => {
    log('shutting down');
    rawLog.end();
    forwarder.stop();
    if (!DRY_RUN) reportStatus('offline');
    setTimeout(() => process.exit(0), 600);
  });
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();

export { consume, handleTransaction, answerQuery };
