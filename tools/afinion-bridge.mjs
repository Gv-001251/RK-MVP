#!/usr/bin/env node
/**
 * ============================================================================
 * RK Clinic LIS — Afinion 2 bridge (proprietary DLE-framed protocol over TCP)
 * ============================================================================
 *   node tools/afinion-bridge.mjs [--host 192.168.1.5] [--port 5555] [--dry-run]
 *
 * How this one differs from the other two bridges
 * -----------------------------------------------
 *   Hemat 60     HL7 v2.3.1 over MLLP    analyzer dials us   (we listen :8080)
 *   Maglumi 800  ASTM E1394 over RS-232  serial link
 *   Afinion 2    proprietary, DLE-framed analyzer LISTENS    (we dial it :5555)
 *
 * The Afinion is the only one we have to dial. A 34-port probe found it serving
 * on 22 (QNX OpenSSH) and 5555 and refusing everything else.
 *
 * The wire format, captured from the instrument rather than taken from a manual:
 *
 *   DLE STX  0199 FFFF :IC@ 20260807,090833,AF20095065,21.16X  DLE ETX
 *            ^^^^                                                sequence, hex, +1/frame
 *                 ^^^^                                           address, FFFF = broadcast
 *                      ^^^^                                      message class
 *                           ^^^^^^^^ ^^^^^^                       date, time
 *                                           ^^^^^^^^^^            device id
 *                                                      ^^^^^      value
 *                                                           ^     trailing marker
 *
 * It emits one :IC@ frame every 2.00s carrying an unchanging value — a status
 * heartbeat, not a result. That is what this bridge can act on today: it turns
 * the heartbeat into a live "online" tile in Analyzer Management, which is real
 * and useful on its own.
 *
 * What it deliberately does NOT do is guess at results. No result frame has ever
 * been observed, so the class and layout a result uses are unknown. Any frame
 * whose class is not :IC@ is logged loudly and spooled to tmp/afinion-unknown/
 * so the parser can be written against real bytes. Inventing a layout here would
 * risk posting fabricated numbers onto a patient record.
 * ============================================================================
 */

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { onShutdown } from './lib/shutdown.mjs';
import { dataPath } from './lib/data-dir.mjs';

dotenv.config({ path: '.env.local' });
dotenv.config();

const args = process.argv.slice(2);
const flag = (n, d = null) => { const i = args.indexOf(n); return i !== -1 && args[i + 1] ? args[i + 1] : d; };

const HOST = flag('--host', process.env.AFINION_HOST || '192.168.1.5');
const PORT = parseInt(flag('--port', process.env.AFINION_PORT || '5555'), 10);
const DRY_RUN = args.includes('--dry-run');
const RECONNECT_MS = parseInt(flag('--reconnect', '5000'), 10);

const BASE_URL = (process.env.LIS_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const API_KEY = process.env.LIS_ANALYZER_API_KEY;
const ANALYZER_ID = process.env.AFINION_ANALYZER_ID || 'afinion2';

/** The heartbeat arrives every 2s; refreshing last_ping that often is pointless
 *  write load. The LIS treats an analyzer as stale after 60s, so beat well
 *  inside that. */
const STATUS_EVERY_MS = 30_000;

const DLE = 0x10, STX = 0x02, ETX = 0x03;

const UNKNOWN_DIR = dataPath('afinion-unknown');

const ts = () => new Date().toISOString().replace('T', ' ').replace('Z', '');
const log = (m) => console.log(`[${ts()}] ${m}`);
const warn = (m) => console.warn(`[${ts()}] ⚠  ${m}`);

/* ── Framing ───────────────────────────────────────────────────────────────── */

/**
 * Pull complete DLE STX … DLE ETX frames out of a rolling buffer.
 *
 * DLE is the escape byte, so a literal 0x10 inside the payload is sent doubled
 * (DLE DLE). The scan therefore has to step over DLE DLE pairs, or a payload
 * byte of 0x10 followed by 0x03 would be mistaken for the end of the frame. The
 * payload is un-stuffed on the way out.
 *
 * @returns {{frames: Buffer[], rest: Buffer}}
 */
export function extractFrames(buf) {
  const frames = [];
  let i = 0;
  let consumedTo = 0;

  while (i < buf.length - 1) {
    if (buf[i] !== DLE || buf[i + 1] !== STX) { i += 1; continue; }

    // Walk the payload looking for an unescaped DLE ETX.
    let j = i + 2;
    const out = [];
    let closed = false;
    while (j < buf.length - 1) {
      if (buf[j] === DLE) {
        if (buf[j + 1] === ETX) { closed = true; break; }
        if (buf[j + 1] === DLE) { out.push(DLE); j += 2; continue; }  // un-stuff
        // DLE followed by anything else is not ours; treat it literally.
        out.push(buf[j]); j += 1; continue;
      }
      out.push(buf[j]); j += 1;
    }

    if (!closed) break;                 // frame still arriving; keep it buffered
    frames.push(Buffer.from(out));
    i = j + 2;
    consumedTo = i;
  }

  return { frames, rest: buf.subarray(consumedTo) };
}

/**
 * Split a de-framed payload into its fields.
 *
 * Note on the trailing character: every captured frame ended with the same
 * single character despite the sequence number changing on each one, so it is a
 * fixed marker rather than a checksum over the frame. No checksum is validated
 * here precisely because none has been demonstrated to exist — pretending to
 * verify one would be worse than not verifying.
 */
export function parseFrame(payload) {
  const text = payload.toString('latin1');
  const m = text.match(/^([0-9A-Fa-f]{4})([0-9A-Fa-f]{4}):([A-Za-z0-9]+)@(.*)$/);
  if (!m) return { ok: false, text };

  const [, seqHex, addr, cls, body] = m;
  const parts = body.split(',');
  const [date, time, device, ...rest] = parts;

  return {
    ok: true,
    text,
    sequence: parseInt(seqHex, 16),
    sequenceHex: seqHex.toUpperCase(),
    address: addr.toUpperCase(),
    cls,
    date: date || null,
    time: time || null,
    device: device || null,
    fields: rest,
    observedAt: isoFrom(date, time),
  };
}

/** "20260807" + "090833" → "2026-08-07T09:08:33", or null. */
function isoFrom(date, time) {
  if (!/^\d{8}$/.test(date || '') || !/^\d{6}$/.test(time || '')) return null;
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`
    + `T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4)}`;
}

/* ── LIS ───────────────────────────────────────────────────────────────────── */

async function reportStatus(status) {
  if (DRY_RUN) return;
  try {
    const res = await fetch(`${BASE_URL}/api/lab/analyzer/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-lis-api-key': API_KEY },
      body: JSON.stringify({
        analyzerId: ANALYZER_ID, status,
        name: 'Afinion 2 (Abbott)', department: 'Diabetes / POCT',
        protocol: 'Proprietary (DLE-framed, TCP)', connectionType: 'Ethernet (TCP)',
      }),
    });
    if (!res.ok) { warn(`status report rejected ${res.status}`); return; }
    const body = await res.json().catch(() => null);
    if (body?.command) {
      log(`⚙ command from LIS: ${body.command}`);
      warn(`   "${body.command}" is not implemented for this instrument; no action taken`);
    }
  } catch (err) {
    warn(`status report failed (${err.message})`);
  }
}

/* ── State ─────────────────────────────────────────────────────────────────── */

let rx = Buffer.alloc(0);
let sock = null;
let stopping = false;
let attempts = 0;
let heartbeats = 0;
let lastStatusAt = 0;
let clockWarned = false;

function onHeartbeat(frame) {
  heartbeats += 1;
  if (heartbeats % 30 === 1) {
    log(`♥ heartbeat ×${heartbeats} — seq ${frame.sequenceHex}, ${frame.device}, ${frame.fields.join(',')}`);
  }

  // Flag a wrong instrument clock once. Results stamped with it would be misdated.
  if (!clockWarned && frame.observedAt) {
    const skewMin = Math.round((Date.now() - new Date(frame.observedAt).getTime()) / 60000);
    if (Math.abs(skewMin) > 5) {
      clockWarned = true;
      warn(`instrument clock is ${Math.abs(skewMin)} min ${skewMin > 0 ? 'behind' : 'ahead of'} this host`);
      warn('   results would be misdated — correct the date/time on the instrument');
    }
  }

  if (Date.now() - lastStatusAt > STATUS_EVERY_MS) {
    lastStatusAt = Date.now();
    reportStatus('online');
  }
}

function onUnknown(frame, raw) {
  fs.mkdirSync(UNKNOWN_DIR, { recursive: true });
  const file = path.join(UNKNOWN_DIR, `${Date.now()}-${frame.cls || 'unparsed'}.bin`);
  fs.writeFileSync(file, raw);

  console.log('');
  log('═'.repeat(60));
  log(`🎯 NEW MESSAGE CLASS: :${frame.cls || '??'}@  — this is not the heartbeat`);
  log('═'.repeat(60));
  log(`   raw   : ${frame.text}`);
  if (frame.ok) {
    log(`   seq   : ${frame.sequenceHex}   device: ${frame.device}   at: ${frame.observedAt || '?'}`);
    log(`   fields: ${JSON.stringify(frame.fields)}`);
  }
  log(`   saved : ${file}`);
  log('   Nothing is posted to the LIS from an unrecognised frame. Send this file');
  log('   over and the result parser can be written against it.');
}

/* ── Link ──────────────────────────────────────────────────────────────────── */

function connect() {
  attempts += 1;
  sock = new net.Socket();

  sock.on('connect', () => {
    log(`✅ connected to ${HOST}:${PORT} (attempt ${attempts})`);
    rx = Buffer.alloc(0);
    lastStatusAt = 0;
  });

  sock.on('data', (chunk) => {
    rx = Buffer.concat([rx, chunk]);
    const { frames, rest } = extractFrames(rx);
    rx = rest;

    for (const payload of frames) {
      const frame = parseFrame(payload);
      if (frame.ok && frame.cls === 'IC') onHeartbeat(frame);
      else onUnknown(frame, payload);
    }

    if (rx.length > 256 * 1024) {
      warn('receive buffer passed 256 KB with no complete frame — discarding');
      rx = Buffer.alloc(0);
    }
  });

  sock.on('error', (e) => warn(`${e.code || e.message}`));

  sock.on('close', () => {
    if (stopping) return;
    log(`🔌 link closed — redialling in ${RECONNECT_MS} ms`);
    reportStatus('offline');
    setTimeout(connect, RECONNECT_MS);
  });

  sock.connect(PORT, HOST);
}

function main() {
  if (!API_KEY && !DRY_RUN) {
    console.error('❌ LIS_ANALYZER_API_KEY is not set in .env.local (or use --dry-run).');
    process.exit(1);
  }

  console.log('════════════════════════════════════════════════════════════');
  console.log(' RK Clinic LIS — Afinion 2 bridge');
  console.log(`  analyzer : ${ANALYZER_ID} at ${HOST}:${PORT} (we dial it)`);
  console.log(`  protocol : proprietary, DLE STX … DLE ETX framed`);
  console.log(`  LIS      : ${BASE_URL}`);
  console.log(`  mode     : ${DRY_RUN ? 'DRY RUN — nothing posted' : 'live'}`);
  console.log('════════════════════════════════════════════════════════════');
  console.log('  Heartbeats keep the analyzer tile live. Result frames have never');
  console.log('  been seen, so they are captured and reported, never guessed at.');
  console.log('');

  connect();

  onShutdown(() => {
    stopping = true;
    log(`shutting down after ${heartbeats} heartbeat(s)`);
    reportStatus('offline');
    if (sock) sock.destroy();
    setTimeout(() => process.exit(0), 600);
  });
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
