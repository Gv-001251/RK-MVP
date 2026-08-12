#!/usr/bin/env node
/**
 * ============================================================================
 * RK Clinic LIS — Analyzer Capture
 * ============================================================================
 * Passive listener for the Hemat 60 (Genrui) over TCP. The analyzer is the
 * client: it dials the address configured as "LIS IP" on its System > LIS
 * screen and pushes records. We listen and record.
 *
 *   node tools/analyzer-capture.mjs [--port 8080] [--ack]
 *
 * Why this exists alongside analyzer-handshake.mjs
 * ------------------------------------------------
 * The handshake tool cycles candidate replies to try to unstick a session. We
 * now know the analyzer emits a lone <STX> every 3.000s as a keep-alive — it
 * does not change behaviour for any reply, and "Ack Synchronous Communication"
 * is switched off on the instrument. So there is nothing to unstick, and
 * spraying control bytes at a working analyzer is just noise.
 *
 * This tool therefore:
 *   • stays silent on the heartbeat (logs it compactly, one line per minute)
 *   • logs real frames in full: timestamp, length, hex, annotated ASCII
 *   • appends the raw byte stream to tmp/ for offline protocol work
 *   • only ACKs when --ack is passed, for analyzers that do expect it
 *
 * Nothing is written to the database. This is a capture tool; the bridge that
 * parses frames and POSTs to /api/lab/analyzer/results is a separate piece.
 * ============================================================================
 */

import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
const PORT = parseInt(portArg !== -1 ? args[portArg + 1] : (process.env.PROBE_PORT || '8080'), 10);
const SEND_ACK = args.includes('--ack');

const ACK = 0x06;
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

function hexdump(buf, maxBytes = 512) {
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

// Raw capture file, so the frame can be studied after the fact.
const outDir = path.resolve('tmp');
fs.mkdirSync(outDir, { recursive: true });
const capturePath = path.join(outDir, `analyzer-capture-${Date.now()}.bin`);
const capture = fs.createWriteStream(capturePath);

console.log('════════════════════════════════════════════════════════════');
console.log(' RK Clinic LIS — Analyzer Capture (passive)');
console.log(`  reply mode : ${SEND_ACK ? 'ACK data frames' : 'silent (no bytes sent)'}`);
console.log(`  raw capture: ${capturePath}`);
console.log('════════════════════════════════════════════════════════════\n');

const server = net.createServer((sock) => {
  const peer = `${sock.remoteAddress}:${sock.remotePort}`;
  console.log(`✅ [${ts()}] analyzer connected: ${peer}\n`);

  let heartbeats = 0;
  let lastHeartbeatLog = 0;
  let frames = 0;
  let totalBytes = 0;

  sock.on('data', (buf) => {
    capture.write(buf);
    totalBytes += buf.length;

    // A lone control byte is the keep-alive. Summarise rather than spam.
    const isHeartbeat = buf.length === 1 && CTRL[buf[0]];
    if (isHeartbeat) {
      heartbeats += 1;
      const now = Date.now();
      if (now - lastHeartbeatLog > 60000 || heartbeats === 1) {
        lastHeartbeatLog = now;
        console.log(`[${ts()}] ♥ keep-alive ${annotate(buf)} ×${heartbeats} — idle, nothing to report`);
      }
      return;
    }

    frames += 1;
    console.log(`\n┌─ [${ts()}] DATA FRAME #${frames} — ${buf.length} bytes ─────────────`);
    console.log(hexdump(buf));
    console.log('   ASCII: ' + annotate(buf).slice(0, 2000));
    console.log('└──────────────────────────────────────────────────────────\n');

    if (SEND_ACK) {
      sock.write(Buffer.from([ACK]));
      console.log('   ⬆ sent <ACK>\n');
    }
  });

  sock.on('close', () => {
    console.log(`🔌 [${ts()}] disconnected: ${peer} — ${frames} frame(s), ${heartbeats} keep-alive(s), ${totalBytes} byte(s)\n`);
  });
  sock.on('error', (e) => console.log(`⚠  ${e.message}`));
});

server.on('error', (err) => {
  console.error(`❌ ${err.message}${err.code === 'EADDRINUSE' ? ` — port ${PORT} busy (stop the other listener first)` : ''}`);
  process.exit(1);
});

// Dual-stack: accepts both IPv6 and IPv4-mapped connections.
server.listen(PORT, () => {
  const a = server.address();
  console.log(`   listening on ${a.address}:${a.port} — waiting for the analyzer\n`);
  console.log('   Now run a sample, or resend a stored record from the');
  console.log('   instrument (Review > select record > send to LIS).\n');
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    capture.end();
    console.log(`\nraw capture saved: ${capturePath}`);
    process.exit(0);
  });
}
