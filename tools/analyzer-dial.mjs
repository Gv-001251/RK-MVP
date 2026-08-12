#!/usr/bin/env node
/**
 * ============================================================================
 * RK Clinic LIS — Analyzer Dial (client-mode capture)
 * ============================================================================
 *   node tools/analyzer-dial.mjs --host 192.168.1.5 --port 5555
 *   node tools/analyzer-dial.mjs --host 192.168.1.5 --port 5555 --ack
 *   node tools/analyzer-dial.mjs --host 192.168.1.5 --port 5555 --enq
 *
 * Why this exists
 * ---------------
 * Every other capture tool here listens and waits for the analyzer to dial in,
 * because that is what the Hemat 60 and Mispa Plus do. The Afinion 2 is the
 * other way round: a 34-port probe found it LISTENING on 5555 and refusing
 * nothing else, so the host has to dial the instrument. None of the existing
 * tools can do that, which meant running a test on it produced nothing we could
 * see.
 *
 * This holds a client connection open and records everything that arrives, so a
 * test run on the instrument is captured rather than lost. It redials when the
 * link drops, because these instruments tend to close an idle socket.
 *
 * Passive by default:
 *   (no flag)  connect and listen. Always try this first.
 *   --ack      reply <ACK> to <ENQ>. ASTM senders will not proceed without it.
 *   --enq      send one <ENQ> on connect, to invite the instrument to talk.
 *
 * Nothing is written to the database. This is a capture tool — the driver that
 * parses frames and POSTs to /api/lab/analyzer/results is a separate piece, and
 * writing it is the point of capturing a frame here.
 * ============================================================================
 */

import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (n, d = null) => { const i = args.indexOf(n); return i !== -1 && args[i + 1] ? args[i + 1] : d; };

const HOST = flag('--host', '192.168.1.5');
const PORT = parseInt(flag('--port', '5555'), 10);
const SEND_ACK = args.includes('--ack');
const SEND_ENQ = args.includes('--enq');
const RECONNECT_MS = parseInt(flag('--reconnect', '5000'), 10);

const ENQ = 0x05, ACK = 0x06, STX = 0x02, VT = 0x0b;

const CTRL = {
  0x01: '<SOH>', 0x02: '<STX>', 0x03: '<ETX>', 0x04: '<EOT>', 0x05: '<ENQ>',
  0x06: '<ACK>', 0x07: '<BEL>', 0x08: '<BS>', 0x09: '<TAB>', 0x0a: '<LF>',
  0x0b: '<VT>', 0x0c: '<FF>', 0x0d: '<CR>', 0x11: '<DC1>', 0x12: '<DC2>',
  0x13: '<DC3>', 0x14: '<DC4>', 0x15: '<NAK>', 0x16: '<SYN>', 0x17: '<ETB>',
  0x1a: '<SUB>', 0x1b: '<ESC>', 0x1c: '<FS>', 0x1d: '<GS>', 0x1e: '<RS>',
  0x1f: '<US>', 0x7f: '<DEL>',
};

function annotate(buf) {
  let out = '';
  for (const b of buf) {
    if (CTRL[b]) out += CTRL[b];
    else if (b >= 0x20 && b <= 0x7e) out += String.fromCharCode(b);
    else out += `<0x${b.toString(16).padStart(2, '0')}>`;
  }
  return out;
}

function hexdump(buf, maxBytes = 384) {
  const slice = buf.subarray(0, maxBytes);
  const lines = [];
  for (let i = 0; i < slice.length; i += 16) {
    const chunk = slice.subarray(i, i + 16);
    const hex = [...chunk].map((b) => b.toString(16).padStart(2, '0')).join(' ').padEnd(47);
    const ascii = [...chunk].map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.')).join('');
    lines.push('   ' + String(i).padStart(5, '0') + '  ' + hex + '  |' + ascii + '|');
  }
  if (buf.length > maxBytes) lines.push(`   … ${buf.length - maxBytes} more byte(s)`);
  return lines.join('\n');
}

const ts = () => new Date().toISOString().replace('T', ' ').replace('Z', '');
const log = (m) => console.log(`[${ts()}] ${m}`);
const warn = (m) => console.warn(`[${ts()}] ⚠  ${m}`);

/** Name the protocol from the first bytes, so the driver can be written to it. */
function identify(buf) {
  const text = buf.toString('latin1');
  if (buf.includes(VT) || /MSH\|/.test(text)) return 'HL7 over MLLP (VT … FS CR, MSH header)';
  if (buf[0] === ENQ) return 'ASTM E1381 (opens with ENQ — needs ACK to proceed, use --ack)';
  if (/H\|\\\^&/.test(text) || /^H\|/m.test(text)) return 'ASTM E1394 records (H| header)';
  if (buf.length === 1 && buf[0] === STX) return 'a lone STX — likely a keep-alive, wait for a real frame';
  if (/^(GET|POST|HTTP)/.test(text)) return 'HTTP — this is a web service, not a result stream';
  return 'unrecognised; the hexdump is the evidence';
}

const RAW_DIR = path.resolve('tmp', 'analyzer-dial');
fs.mkdirSync(RAW_DIR, { recursive: true });

let attempts = 0;
let totalBytes = 0;
let stopping = false;
let sock = null;

function connect() {
  attempts += 1;
  sock = new net.Socket();
  let sessionBytes = 0;
  let identified = false;
  let raw = null;

  sock.on('connect', () => {
    log(`✅ connected to ${HOST}:${PORT} (attempt ${attempts})`);
    log('   holding the line open. Run a test on the instrument now.');
    if (SEND_ENQ) {
      sock.write(Buffer.from([ENQ]));
      log('   ⬆ sent <ENQ> (invitation to transmit)');
    }
  });

  sock.on('data', (chunk) => {
    if (!raw) raw = fs.createWriteStream(path.join(RAW_DIR, `${Date.now()}-${HOST}-${PORT}.bin`));
    raw.write(chunk);
    sessionBytes += chunk.length;
    totalBytes += chunk.length;

    if (!identified) {
      identified = true;
      console.log('');
      log(`🎯 FIRST DATA — protocol looks like: ${identify(chunk)}`);
    }

    log(`⬇ ${chunk.length} byte(s) (${sessionBytes} this session, ${totalBytes} total)`);
    console.log(hexdump(chunk));
    const shown = annotate(chunk);
    console.log(`   ascii: ${shown.length > 800 ? shown.slice(0, 800) + '…' : shown}`);

    if (SEND_ACK && chunk.includes(ENQ)) {
      sock.write(Buffer.from([ACK]));
      log('   ⬆ sent <ACK>');
    }
  });

  sock.on('error', (e) => warn(`${e.code || e.message}`));

  sock.on('close', () => {
    if (raw) raw.end();
    if (stopping) return;
    if (sessionBytes) log(`🔌 link closed after ${sessionBytes} byte(s) this session`);
    setTimeout(connect, RECONNECT_MS);
  });

  sock.connect(PORT, HOST);
}

console.log('════════════════════════════════════════════════════════════');
console.log(' RK Clinic LIS — Analyzer Dial (we connect to the analyzer)');
console.log(`  target     : ${HOST}:${PORT}`);
console.log(`  reply mode : ${SEND_ENQ ? 'ENQ on connect' : SEND_ACK ? 'ACK on ENQ' : 'silent (recommended first)'}`);
console.log(`  redial     : every ${RECONNECT_MS} ms if the link drops`);
console.log(`  raw capture: ${RAW_DIR}`);
console.log('════════════════════════════════════════════════════════════\n');

connect();

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    stopping = true;
    console.log('');
    log(totalBytes
      ? `✅ captured ${totalBytes} byte(s) in total — see ${RAW_DIR}`
      : 'no data was received. The instrument accepted the connection but never spoke,');
    if (!totalBytes) {
      log('   which usually means its LIS/data-transfer function is still switched off.');
    }
    if (sock) sock.destroy();
    setTimeout(() => process.exit(0), 200);
  });
}
