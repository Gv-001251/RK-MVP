#!/usr/bin/env node
/**
 * ============================================================================
 * RK Clinic LIS — Analyzer Port Scout
 * ============================================================================
 * Finds which TCP port an analyzer dials, and what it speaks, in one attempt.
 *
 *   node tools/analyzer-port-scout.mjs
 *   node tools/analyzer-port-scout.mjs --ports 8081,5150,9100
 *   node tools/analyzer-port-scout.mjs --range 8000-8100
 *   node tools/analyzer-port-scout.mjs --ack        # answer ENQ with ACK
 *
 * Why this exists
 * ---------------
 * Several of the instruments here expose only a "Server IP" field on their
 * connectivity screen — the Mispa Plus is one — with no way to see or set the
 * port. The port is fixed in firmware and absent from the documentation we
 * have, so `analyzer-capture.mjs --port N` turns into guesswork: one guess per
 * press of the instrument's Connect button, with a walk to the machine between
 * each try.
 *
 * This binds every plausible port at once. The analyzer connects, we record
 * which listener caught it, capture the bytes, and name the protocol from the
 * first frame. One press of Connect answers all three questions.
 *
 * It is passive by default. Nothing is written to the database and no bytes are
 * sent back unless --ack is passed, because spraying control characters at a
 * live instrument is a good way to wedge a session.
 *
 * SECURITY: this opens a lot of unauthenticated listening sockets on every
 * interface. It is a bench tool for a direct analyzer cable — run it while you
 * are watching it and stop it when you have your answer. Do not leave it up on
 * a shared network.
 * ============================================================================
 */

import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

/* ── Arguments ─────────────────────────────────────────────────────────────── */

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};
const SEND_ACK = args.includes('--ack');

/**
 * Ports analyzer vendors actually use for a host/LIS link. Ordered roughly by
 * how often they turn up in the field. Deliberately excludes ports this project
 * already occupies (3000 Next, 3306 MySQL) so the scout can never shadow them.
 */
const DEFAULT_PORTS = [
  8081, 8080, 8000, 8888,        // the config's guess, and the usual HTTP-ish suspects
  7100, 5100,                    // Wondfo Rapid: "PC End" and "Device End" ports
  5150, 5151,                    // Sysmex and lookalikes
  9100, 9600,                    // print-style ports; some vendors reuse the baud number
  1024, 1234, 2000, 2345,
  4000, 4001, 5000, 5001,
  6000, 6543, 7000, 7777,
  10000, 12000, 15000,
  502, 5555, 9999,
];

const RESERVED = new Set([3000, 3306]);

function chosenPorts() {
  const range = flag('--range');
  if (range) {
    const [lo, hi] = range.split('-').map((n) => parseInt(n, 10));
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || hi < lo) {
      console.error(`❌ --range wants LOW-HIGH, e.g. 8000-8100 (got "${range}")`);
      process.exit(1);
    }
    if (hi - lo > 500) {
      console.error(`❌ --range ${range} is ${hi - lo + 1} ports; keep it under 500.`);
      process.exit(1);
    }
    return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  }
  const list = flag('--ports');
  if (list) {
    return list.split(',').map((p) => parseInt(p.trim(), 10)).filter(Number.isInteger);
  }
  return DEFAULT_PORTS;
}

const PORTS = chosenPorts().filter((p) => {
  if (RESERVED.has(p)) {
    console.warn(`⚠  skipping port ${p} — in use by this project`);
    return false;
  }
  return p > 0 && p < 65536;
});

/* ── Byte formatting (shared shape with analyzer-capture.mjs) ─────────────── */

const ENQ = 0x05, ACK = 0x06, STX = 0x02, VT = 0x0b, FS = 0x1c;

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

function hexdump(buf, maxBytes = 320) {
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

/**
 * Name the protocol from the first bytes on the wire.
 *
 * Both families are recognisable immediately: HL7 over MLLP wraps messages in
 * VT … FS CR and always starts its first segment with "MSH|", while ASTM E1381
 * opens with a bare ENQ and its frames carry "H|\^&" as the first record.
 */
function identify(buf) {
  const text = buf.toString('latin1');
  if (buf.includes(VT) || /MSH\|/.test(text)) {
    return { protocol: 'hl7', detail: 'HL7 over MLLP (VT … FS CR framing, MSH header)' };
  }
  if (buf[0] === ENQ) {
    return { protocol: 'astm', detail: 'ASTM E1381 (opened with ENQ — expects ACK to proceed)' };
  }
  if (/H\|\\\^&/.test(text) || /^H\|/m.test(text)) {
    return { protocol: 'astm', detail: 'ASTM E1394 records (H| header seen)' };
  }
  if (buf.length === 1 && buf[0] === STX) {
    return { protocol: 'unknown', detail: 'a lone STX — probably a keep-alive, wait for a real frame' };
  }
  if (/^(GET|POST|PUT|HEAD) /.test(text)) {
    return { protocol: 'http', detail: 'HTTP request — this is a web client, not the analyzer' };
  }
  return { protocol: 'unknown', detail: 'unrecognised opening bytes; the hexdump below is the evidence' };
}

/* ── Capture ───────────────────────────────────────────────────────────────── */

const RAW_DIR = path.resolve('tmp', 'port-scout');
fs.mkdirSync(RAW_DIR, { recursive: true });

const bound = [];
const failed = [];
let winner = null;

function serverFor(port) {
  const server = net.createServer((sock) => {
    const peer = `${sock.remoteAddress}:${sock.remotePort}`;

    if (!winner) {
      winner = { port, peer, at: new Date() };
      console.log('\n' + '═'.repeat(64));
      log(`🎯 CONNECTION on port ${port} from ${peer}`);
      console.log('═'.repeat(64));
      log(`   The analyzer dials port ${port}. Put that in the bridge config.`);
    } else {
      log(`↪ another connection on port ${port} from ${peer}`);
    }

    const rawFile = path.join(RAW_DIR, `${Date.now()}-port${port}.bin`);
    const raw = fs.createWriteStream(rawFile);
    let total = 0;
    let identified = false;

    sock.on('data', (chunk) => {
      raw.write(chunk);
      total += chunk.length;

      if (!identified) {
        const { protocol, detail } = identify(chunk);
        identified = true;
        log(`   protocol : ${protocol.toUpperCase()} — ${detail}`);
      }

      log(`   ⬇ ${chunk.length} byte(s) (${total} total)`);
      console.log(hexdump(chunk));
      const shown = annotate(chunk);
      console.log(`   ascii: ${shown.length > 600 ? shown.slice(0, 600) + '…' : shown}`);

      if (SEND_ACK && chunk.includes(ENQ)) {
        sock.write(Buffer.from([ACK]));
        log('   ⬆ sent <ACK>');
      }
    });

    sock.on('close', () => {
      raw.end();
      log(`   🔌 ${peer} disconnected after ${total} byte(s) — raw kept at ${rawFile}`);
      if (total === 0) {
        log('   ⚠  it connected but sent nothing. That is still the right port —');
        log('      the instrument is probably waiting for us to speak first, or it');
        log('      only transmits when a run finishes. Try --ack, or run a sample.');
      }
    });
    sock.on('error', (e) => log(`   socket error on ${port}: ${e.message}`));
  });

  server.on('error', (err) => {
    failed.push({ port, reason: err.code === 'EADDRINUSE' ? 'already in use' : err.message });
  });

  server.listen(port, '0.0.0.0', () => bound.push(port));
  return server;
}

const servers = PORTS.map(serverFor);

/* ── Startup banner, once the binds have settled ───────────────────────────── */

setTimeout(() => {
  console.log('════════════════════════════════════════════════════════════');
  console.log(' RK Clinic LIS — Analyzer Port Scout');
  console.log(`  listening on ${bound.length} port(s), all interfaces`);
  console.log(`  reply mode : ${SEND_ACK ? 'ACK on ENQ' : 'silent (recommended first)'}`);
  console.log(`  raw capture: ${RAW_DIR}`);
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  ports: ${bound.sort((a, b) => a - b).join(', ')}`);
  if (failed.length) {
    console.log(`  skipped: ${failed.map((f) => `${f.port} (${f.reason})`).join(', ')}`);
  }
  console.log('');
  log('waiting — now press Connect on the analyzer, or run a sample.');
  log('nothing will be sent to the instrument; this only records.');
}, 400);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log('');
    if (winner) {
      log(`✅ result: the analyzer connects to port ${winner.port} (from ${winner.peer})`);
    } else {
      log('no connection was seen. Check that the analyzer\'s Server IP matches this');
      log('machine\'s address on the cable facing it, and that both are on the same subnet.');
    }
    for (const s of servers) s.close();
    setTimeout(() => process.exit(0), 200);
  });
}
