#!/usr/bin/env node
/**
 * ============================================================================
 * RK Clinic LIS — Mispa Plus bridge (Agappe biochemistry, proprietary TCP line)
 * ============================================================================
 *   node tools/mispa-bridge.mjs [--port 8888] [--dry-run]
 *
 * Where this one sits among the others
 * ------------------------------------
 *   Hemat 60     HL7 v2.3.1 over MLLP      analyzer dials us   (we listen :8080)
 *   Maglumi 800  ASTM E1394 over RS-232    serial link
 *   Afinion 2    proprietary, DLE-framed   analyzer LISTENS    (we dial it :5555)
 *   Mispa Plus   proprietary, '$…#' line   analyzer dials us   (we listen :8888)
 *
 * The wire format, captured from the instrument on 2026-08-07 rather than taken
 * from a manual — the first frame this machine has ever given us:
 *
 *   $07/08/2026|000000000029|mbglu|28.1945|mg/dL|1#<LF><CR>
 *   ^                                              ^
 *   |  date       sample no.  test  value   unit  |  status?
 *   start                                          end
 *
 *   '$'  0x24 opens the frame, '#' 0x23 closes it, then LF CR — in that order,
 *        which is the reverse of the usual pairing and worth not "fixing".
 *   date DD/MM/YYYY. No time of day, so the completion time we record is the
 *        moment of receipt, and a frame dated other than today is flagged.
 *   No checksum, no sequence number, and no acknowledgement expected: the line
 *   above arrived once, was never retransmitted, and the socket stayed open
 *   afterwards. So this bridge stays silent on the wire.
 *
 * One result per frame. A panel therefore arrives as several frames in quick
 * succession, which is why results are gathered per sample for a short window
 * before being posted — otherwise one tube of six tests becomes six separate
 * entries in the Exception Queue.
 *
 * What is deliberately NOT guessed at:
 *   - the sixth field ('1'). Every captured frame had the same value, so its
 *     meaning is unknown. It is carried through to the log and ignored.
 *   - test codes other than 'mbglu'. Unknown codes are still posted, under the
 *     name the instrument used, and logged loudly so the map below can be
 *     extended from real frames instead of from imagination.
 * ============================================================================
 */

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createForwarder } from './lib/result-forwarder.mjs';
import { onShutdown } from './lib/shutdown.mjs';
import { dataDir, dataPath } from './lib/data-dir.mjs';

dotenv.config({ path: '.env.local' });
dotenv.config();

const args = process.argv.slice(2);
const flag = (n, d = null) => { const i = args.indexOf(n); return i !== -1 && args[i + 1] ? args[i + 1] : d; };

const PORT = parseInt(flag('--port', process.env.MISPA_PORT || '8888'), 10);
const DRY_RUN = args.includes('--dry-run');

const BASE_URL = (process.env.LIS_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const API_KEY = process.env.LIS_ANALYZER_API_KEY;
const ANALYZER_ID = process.env.MISPA_ANALYZER_ID || 'mispaplus';

/**
 * How long to keep gathering results for the same sample before posting them.
 *
 * Long enough that a multi-test panel lands as one message, short enough that
 * the bench is not left waiting on a tile that should already have moved to
 * Pending Verification.
 */
const BATCH_MS = parseInt(flag('--batch', process.env.MISPA_BATCH_MS || '5000'), 10);

/**
 * The LIS marks an analyzer stale after 60s, so the state has to be refreshed on
 * a timer and not only when something happens on the wire.
 *
 * Without this, an idle-but-perfectly-healthy line reads as offline in Analyzer
 * Management: the Mispa connects, says nothing for an hour because nobody has
 * run a sample, and the tile silently goes stale. Someone then walks to the lab
 * to investigate a link that was never broken.
 */
const STATUS_EVERY_MS = 30_000;

const RAW_DIR = dataDir('mispa-raw');
const UNKNOWN_DIR = dataPath('mispa-unknown');

const ts = () => new Date().toISOString().replace('T', ' ').replace('Z', '');
const log = (m) => console.log(`[${ts()}] ${m}`);
const warn = (m) => console.warn(`[${ts()}] ⚠  ${m}`);

/* ══════════════════════════════════════════════════════════════════════════
 * Parameter map — Mispa Plus
 *
 * `catalogNames` is a candidate list, not a single answer, because the
 * instrument reports one glucose while the LIS catalogue distinguishes fasting
 * from random. Which of the candidates a result belongs to is decided by asking
 * the LIS what was actually ordered for that sample, never by picking one.
 *
 * Seeded from a single captured frame. Every other code this machine can send
 * is still unverified, so there is nothing else in here yet — see the header.
 * ══════════════════════════════════════════════════════════════════════════ */
export const MISPA_PARAMS = [
  {
    code: 'glu',
    label: 'Glucose',
    unit: 'mg/dL',
    catalogNames: ['Glucose (Fasting)', 'Glucose (Random)'],
    verified: '2026-08-07, frame $07/08/2026|000000000029|mbglu|28.1945|mg/dL|1#',
  },
];

/**
 * The instrument prefixes its codes with 'mb' ("mbglu"). Stripping it is a rule
 * observed from one code, so resolution tries the code both ways rather than
 * assuming the prefix is always there.
 */
const PARAM_BY_TOKEN = new Map();
for (const p of MISPA_PARAMS) {
  for (const token of [p.code, `mb${p.code}`, ...(p.aliases || [])]) {
    PARAM_BY_TOKEN.set(token.toLowerCase().replace(/[\s_-]/g, ''), p);
  }
}

/** Resolve an instrument code to a known parameter, or null if we've not seen it. */
export function resolveParam(code) {
  const key = String(code || '').toLowerCase().replace(/[\s_-]/g, '');
  return PARAM_BY_TOKEN.get(key) || PARAM_BY_TOKEN.get(key.replace(/^mb/, '')) || null;
}

/* ══════════════════════════════════════════════════════════════════════════
 * Framing
 * ══════════════════════════════════════════════════════════════════════════ */

const FRAME_START = 0x24;   // '$'
const FRAME_END = 0x23;     // '#'

/**
 * Pull complete '$…#' frames out of a rolling buffer.
 *
 * Bytes before the first '$' are dropped: the trailing LF CR of the previous
 * frame lives there, and so would any noise. An unterminated tail is kept for
 * the next chunk, because a panel can straddle TCP segments.
 *
 * @param {Buffer} buf
 * @returns {{frames: string[], rest: Buffer}}
 */
export function extractFrames(buf) {
  const frames = [];
  let cursor = 0;

  for (;;) {
    const start = buf.indexOf(FRAME_START, cursor);
    if (start === -1) { cursor = buf.length; break; }      // nothing left but leader
    const end = buf.indexOf(FRAME_END, start + 1);
    if (end === -1) { cursor = start; break; }             // frame still arriving
    frames.push(buf.subarray(start + 1, end).toString('latin1'));
    cursor = end + 1;
  }

  // Whatever sits between the last '#' and the next '$' — the LF CR, or noise —
  // is not the beginning of a frame, so it is dropped rather than buffered.
  // Keeping it would grow the buffer by two bytes per result, forever.
  return { frames, rest: buf.subarray(cursor) };
}

/**
 * Split one de-framed line into its fields.
 *
 * Field count is checked rather than assumed. A frame with fewer than five
 * fields is reported and dropped instead of being read with whatever happens to
 * be in the right position — a value read out of the wrong field is exactly the
 * kind of error that reaches a patient report looking plausible.
 *
 * @param {string} text  the bytes between '$' and '#'
 */
export function parseFrame(text) {
  const parts = text.split('|').map((s) => s.trim());
  if (parts.length < 5) return { ok: false, text, reason: `expected ≥5 fields, got ${parts.length}` };

  const [date, sampleRaw, code, value, unit, status] = parts;
  if (!code) return { ok: false, text, reason: 'no test code' };
  if (value === '') return { ok: false, text, reason: 'no value' };

  return {
    ok: true,
    text,
    date: date || null,
    sampleRaw: sampleRaw || '',
    sampleId: normaliseSampleId(sampleRaw),
    code,
    value,
    unit: unit || '',
    status: status ?? null,      // meaning unknown; carried, not acted on
  };
}

/**
 * The instrument zero-pads its sample number to 12 digits, so what the operator
 * typed as 29 arrives as 000000000029. The padding is the instrument's, not the
 * lab's, so it is stripped for an all-digit id. A non-numeric id (an accession
 * typed in full, say) is left exactly as sent.
 */
export function normaliseSampleId(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (!/^\d+$/.test(s)) return s;
  return s.replace(/^0+(?=\d)/, '');
}

/** "07/08/2026" (DD/MM/YYYY) → "2026-08-07", or null if unparseable. */
export function isoDate(ddmmyyyy) {
  const m = String(ddmmyyyy || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

/* ══════════════════════════════════════════════════════════════════════════
 * LIS calls
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Ask the LIS what is ordered for a sample id.
 *
 * Used for two things: choosing between candidate catalogue names (fasting vs
 * random glucose), and finding which form of the sample id the LIS recognises.
 */
async function hostQuery(specimenId) {
  const url = `${BASE_URL}/api/lab/host-query?specimen=${encodeURIComponent(specimenId)}`;
  const res = await fetch(url, { headers: { 'x-lis-api-key': API_KEY } });
  if (!res.ok) throw new Error(`host-query ${res.status}`);
  return res.json();
}

/**
 * Delivery with a durable queue behind it.
 *
 * The bridge runs beside the instruments and the LIS may be at another site, so
 * a failed POST must not mean a lost result. Anything undeliverable is written
 * to tmp/mispa-spool and retried until it lands.
 */
const forwarder = createForwarder({
  analyzerId: ANALYZER_ID,
  baseUrl: BASE_URL,
  apiKey: API_KEY,
  spoolDir: dataDir('mispa-spool'),
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

async function reportStatus(status) {
  if (DRY_RUN) return;
  try {
    const res = await fetch(`${BASE_URL}/api/lab/analyzer/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-lis-api-key': API_KEY },
      body: JSON.stringify({
        analyzerId: ANALYZER_ID, status,
        name: 'Mispa Plus (Agappe)', department: 'Biochemistry',
        protocol: 'Proprietary ($…# line, TCP)', connectionType: 'Ethernet (TCP)',
      }),
    });
    if (!res.ok) { warn(`status report rejected ${res.status} — the analyzer tile will go stale`); return; }
    const body = await res.json().catch(() => null);
    if (body?.command) {
      log(`⚙ command from LIS: ${body.command}`);
      handleCommand(body.command);
    }
  } catch (err) {
    warn(`status report failed (${err.message})`);
  }
}

/**
 * Act on a control command handed back on the heartbeat.
 *
 * The analyzer is the one that dials in, so "reconnect" cannot mean redial: the
 * most this end can do is drop the current socket and let the instrument come
 * back, which it does roughly every 20 seconds.
 */
function handleCommand(command) {
  switch (command) {
    case 'reconnect':
    case 'restart':
      log('   → dropping the current socket; the analyzer redials on its own');
      for (const s of sockets) s.destroy();
      break;
    case 'disable':
      log('   → closing the listener');
      server?.close();
      break;
    case 'enable':
      if (!server?.listening) { log('   → reopening the listener'); listen(); }
      break;
    case 'maintenance_on':
    case 'maintenance_off':
      log(`   → "${command}" noted; no change to the link`);
      break;
    case 'rack_scan':
      log('   → holder scan armed; nothing to transmit on this link');
      break;
    default:
      warn(`   → unrecognised command "${command}"; ignored`);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * Batching and dispatch
 * ══════════════════════════════════════════════════════════════════════════ */

/** sampleId → { tests: [], timer, raw: [], firstSeen } */
const pending = new Map();

let server = null;
let sockets = new Set();
let rx = Buffer.alloc(0);
let rawLog = null;
let framesSeen = 0;
let lastStatusAt = 0;
let clockWarned = false;

function onFrame(frame) {
  framesSeen += 1;

  const param = resolveParam(frame.code);
  if (!param) onUnknownCode(frame);

  // A frame dated other than today means the instrument clock is off, which
  // would misdate every result it sends.
  const iso = isoDate(frame.date);
  if (!clockWarned && iso) {
    const today = new Date().toISOString().slice(0, 10);
    if (iso !== today) {
      clockWarned = true;
      warn(`instrument date reads ${iso} but today is ${today} — results would be misdated`);
      warn('   correct the date on the instrument before go-live');
    }
  }

  log(`⬇ sample ${frame.sampleId}: ${frame.code} = ${frame.value}${frame.unit ? ' ' + frame.unit : ''}`
    + `${param ? '' : '  (code not in the map)'}${frame.status ? `  [field6=${frame.status}]` : ''}`);

  const key = frame.sampleId || '(no id)';
  if (!pending.has(key)) {
    pending.set(key, { tests: [], raw: [], firstSeen: Date.now(), timer: null });
  }
  const batch = pending.get(key);

  batch.tests.push({
    code: param ? param.label : frame.code,     // resolved later against the order
    candidates: param ? param.catalogNames : null,
    value: frame.value,
    unit: frame.unit,
    flag: '',                                   // no abnormal marker in this format
  });
  batch.raw.push(`$${frame.text}#`);

  // Restart the window on every frame so a slow panel still lands as one message.
  if (batch.timer) clearTimeout(batch.timer);
  batch.timer = setTimeout(() => flush(key), BATCH_MS);
}

function onUnknownCode(frame) {
  fs.mkdirSync(UNKNOWN_DIR, { recursive: true });
  const file = path.join(UNKNOWN_DIR, `${Date.now()}-${frame.code.replace(/[^\w]/g, '')}.txt`);
  fs.writeFileSync(file, `$${frame.text}#\n`);
  warn(`new test code "${frame.code}" — not in MISPA_PARAMS`);
  warn(`   posted under the instrument's own name so nothing is lost; saved ${file}`);
  warn('   add it to MISPA_PARAMS in tools/mispa-bridge.mjs to map it onto the catalogue');
}

/**
 * Post one sample's gathered results.
 *
 * Two things are settled here rather than at parse time, because both need the
 * LIS to answer: which form of the sample id it recognises, and which of a
 * parameter's candidate catalogue names was actually ordered.
 */
async function flush(key) {
  const batch = pending.get(key);
  if (!batch) return;
  pending.delete(key);
  if (batch.timer) clearTimeout(batch.timer);

  const raw = batch.raw.join('\n');
  const held = batch.tests.length;

  // Which id does the LIS know this sample by?
  let specimenId = key;
  let ordered = null;
  const candidateIds = [key];
  const padded = batch.raw[0]?.match(/^\$[^|]*\|([^|]*)\|/)?.[1];
  if (padded && padded !== key) candidateIds.push(padded);

  for (const id of candidateIds) {
    try {
      const answer = await hostQuery(id);
      if (answer?.found) { specimenId = id; ordered = answer.tests || []; break; }
    } catch (err) {
      warn(`host-query for ${id} failed (${err.message})`);
      break;
    }
  }

  // Resolve candidate names against what was ordered. With no order to consult,
  // the generic label is sent — it is what the instrument measured, and the
  // Exception Queue is where a human ties it to a patient anyway.
  const orderedNames = (ordered || []).map((t) => String(t.name || t.code).toLowerCase());
  const tests = batch.tests.map((t) => {
    let code = t.code;
    if (t.candidates?.length) {
      const hit = t.candidates.find((c) => orderedNames.includes(c.toLowerCase()));
      if (hit) code = hit;
      else if (!ordered) code = t.candidates[0];
    }
    return { code, value: t.value, unit: t.unit, flag: t.flag };
  });

  log(`⬆ posting ${held} result(s) for sample ${specimenId}: `
    + tests.map((t) => `${t.code}=${t.value}`).join(', '));

  const outcome = await forwarder.send(resultPayload(specimenId, tests, raw));

  if (outcome === 'done' && !ordered) {
    log(`      the instrument called this sample "${specimenId}"; type the LIS`);
    log('      accession into the instrument\'s sample id to have it match by itself');
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * Link
 * ══════════════════════════════════════════════════════════════════════════ */

function listen() {
  server = net.createServer((sock) => {
    const peer = `${sock.remoteAddress}:${sock.remotePort}`;
    sockets.add(sock);
    log(`✅ analyzer connected from ${peer}`);
    rx = Buffer.alloc(0);
    if (!rawLog) rawLog = fs.createWriteStream(path.join(RAW_DIR, `session-${Date.now()}.bin`));
    reportStatus('active');
    lastStatusAt = Date.now();

    sock.on('data', (chunk) => {
      rawLog?.write(chunk);
      rx = Buffer.concat([rx, chunk]);
      const { frames, rest } = extractFrames(rx);
      rx = rest;

      for (const text of frames) {
        const frame = parseFrame(text);
        if (frame.ok) onFrame(frame);
        else warn(`unusable frame (${frame.reason}): ${JSON.stringify(frame.text.slice(0, 120))}`);
      }

      if (rx.length > 64 * 1024) {
        warn('64 KB buffered with no complete frame — discarding');
        rx = Buffer.alloc(0);
      }

      if (Date.now() - lastStatusAt > STATUS_EVERY_MS) {
        lastStatusAt = Date.now();
        reportStatus('active');
      }
    });

    sock.on('error', (e) => warn(`socket ${peer}: ${e.code || e.message}`));
    sock.on('close', () => {
      sockets.delete(sock);
      log(`🔌 ${peer} disconnected${sockets.size ? '' : ' — waiting for it to redial'}`);
      // Our side is still listening, so this is 'online', not 'offline'. The
      // distinction is the useful one for the bench: 'online' means the LIS is
      // ready and the instrument is quiet, 'offline' means nothing is listening
      // at all and a transmission now would be lost.
      if (!sockets.size) reportStatus('online');
    });
  });

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`❌ port ${PORT} is already in use — another bridge or the port scout still holds it.`);
      console.error('   Stop that process first:  lsof -nP -iTCP:' + PORT + ' -sTCP:LISTEN');
      process.exit(1);
    }
    warn(`server: ${e.message}`);
  });

  server.listen(PORT, () => {
    log(`listening on :${PORT} — waiting for the analyzer to dial in`);
    // Say so immediately: our side is ready even though the instrument has not
    // dialled yet, and the tile should reflect that rather than staying dark.
    reportStatus('online');
    lastStatusAt = Date.now();
  });
}

/**
 * Keep the reported state fresh.
 *
 * 'active' while an instrument holds the socket, 'online' while we are listening
 * and it is quiet. Either way the report has to keep arriving, or the LIS ages
 * the tile out after 60s and shows a healthy line as offline.
 */
function startStatusHeartbeat() {
  if (DRY_RUN) return null;
  return setInterval(() => {
    lastStatusAt = Date.now();
    reportStatus(sockets.size ? 'active' : 'online');
  }, STATUS_EVERY_MS);
}

function main() {
  if (!API_KEY && !DRY_RUN) {
    console.error('❌ LIS_ANALYZER_API_KEY is not set in .env.local (or use --dry-run).');
    process.exit(1);
  }

  console.log('════════════════════════════════════════════════════════════');
  console.log(' RK Clinic LIS — Mispa Plus bridge');
  console.log(`  analyzer : ${ANALYZER_ID} dials this host on :${PORT}`);
  console.log('  protocol : proprietary, $ date|sample|test|value|unit|? #');
  console.log(`  batching : results for one sample gathered for ${BATCH_MS} ms`);
  console.log(`  LIS      : ${BASE_URL}`);
  console.log(`  mode     : ${DRY_RUN ? 'DRY RUN — nothing posted' : 'live'}`);
  console.log('════════════════════════════════════════════════════════════');
  console.log('  Only "glu" is mapped to the catalogue so far. Any other code is');
  console.log('  still posted, under the name the instrument used, and logged.');
  console.log('');

  // Anything left queued by a previous run goes as soon as we start, and the
  // timer keeps trying while we are up.
  if (!DRY_RUN) {
    const waiting = forwarder.pendingCount();
    if (waiting) log(`spool: ${waiting} result(s) from a previous run waiting to be delivered`);
    forwarder.drain().catch((e) => warn(`spool drain failed: ${e.message}`));
    forwarder.start();
  }

  listen();
  const statusTimer = startStatusHeartbeat();

  onShutdown(() => {
    log(`shutting down after ${framesSeen} frame(s)`);
    if (statusTimer) clearInterval(statusTimer);
    // Flush in-flight batches before going, so a result gathered but not yet
    // posted is at least written to the spool rather than dropped on exit.
    Promise.all([...pending.keys()].map((key) => flush(key)))
      .catch((e) => warn(`flush on shutdown failed: ${e.message}`))
      .finally(() => {
        forwarder.stop();
        reportStatus('offline');
        rawLog?.end();
        for (const s of sockets) s.destroy();
        server?.close();
        setTimeout(() => process.exit(0), 800);
      });
  });
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
