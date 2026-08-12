#!/usr/bin/env node
/**
 * ============================================================================
 * RK Clinic LIS — Analyzer Connectivity Probe
 * ============================================================================
 * A standalone diagnostic (NOT part of the Next.js app) to answer one question:
 * "Is the analyzer actually talking to us?"
 *
 * It opens a TCP connection to/from the analyzer and logs every byte it
 * receives (hex + annotated ASCII), so you can confirm the physical/network
 * link and see the raw ASTM / HL7 frames before writing any parser.
 *
 * It optionally performs the ASTM low-level ACK handshake so the analyzer will
 * send its full result payload instead of timing out.
 *
 * ── Requirements ────────────────────────────────────────────────────────────
 *   Node.js 20.9+ (no npm install needed — uses the built-in `net` module).
 *   Run this ON A PC that is on the same network as the analyzer (TCP), or that
 *   the analyzer is configured to send to.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *   # Most analyzers are configured with the LIS IP + port and CONNECT TO it.
 *   # So run this as a SERVER and point the analyzer's "Host/LIS IP" at this PC:
 *   node tools/analyzer-probe.mjs --mode server --port 9100
 *
 *   # If instead the analyzer LISTENS and expects the LIS to connect to it:
 *   node tools/analyzer-probe.mjs --mode client --host 192.168.1.101 --port 9100
 *
 *   # Disable the automatic ASTM ACK (pure passive capture):
 *   node tools/analyzer-probe.mjs --mode server --port 9100 --no-ack
 *
 * Then, on the analyzer, run a sample or QC (or press "Transmit to Host/LIS").
 * Watch this terminal: you should see bytes arrive.
 * ============================================================================
 */

import net from 'node:net';

// ── Parse CLI args ───────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i !== -1 && args[i + 1] && !args[i + 1].startsWith('--')) return args[i + 1];
  return fallback;
}
const MODE = arg('mode', process.env.PROBE_MODE || 'server'); // 'server' | 'client'
const HOST = arg('host', process.env.PROBE_HOST || '0.0.0.0');
const PORT = parseInt(arg('port', process.env.PROBE_PORT || '9100'), 10);
const ACK = !args.includes('--no-ack');

// ── ASTM / HL7 control byte helpers ──────────────────────────────────────────
const CTRL = {
  0x02: '<STX>', 0x03: '<ETX>', 0x04: '<EOT>', 0x05: '<ENQ>',
  0x06: '<ACK>', 0x15: '<NAK>', 0x0d: '<CR>', 0x0a: '<LF>',
  0x0b: '<VT/HL7-START>', 0x1c: '<FS/HL7-END>', 0x17: '<ETB>',
};
const ENQ = 0x05, EOT = 0x04, ACK_BYTE = 0x06;

function annotate(buf) {
  let out = '';
  for (const b of buf) {
    if (CTRL[b]) out += CTRL[b];
    else if (b >= 0x20 && b <= 0x7e) out += String.fromCharCode(b);
    else out += `<0x${b.toString(16).padStart(2, '0')}>`;
  }
  return out;
}

function ts() {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

function logData(buf) {
  console.log(`\n[${ts()}]  ⬇ received ${buf.length} byte(s)`);
  console.log(`   HEX  : ${buf.toString('hex').match(/../g).join(' ')}`);
  console.log(`   ASCII: ${annotate(buf)}`);
}

function detectProtocol(buf) {
  if (buf.includes(ENQ) || (buf.includes(0x02) && buf.includes(0x03))) return 'Looks like ASTM (E1381/E1394)';
  if (buf.includes(0x0b) && buf.includes(0x1c)) return 'Looks like HL7 (MLLP)';
  return null;
}

// ── Handle a connected socket ────────────────────────────────────────────────
function handleSocket(sock, label) {
  const peer = `${sock.remoteAddress}:${sock.remotePort}`;
  console.log(`\n✅ [${ts()}] ${label} connected: ${peer}`);
  console.log('   Waiting for data… (run a sample / press "Transmit to LIS" on the analyzer)\n');

  let announced = false;
  sock.on('data', (buf) => {
    logData(buf);

    if (!announced) {
      const proto = detectProtocol(buf);
      if (proto) { console.log(`   ℹ  ${proto}`); announced = true; }
    }

    if (ACK) {
      // Minimal ASTM low-level handshake so the analyzer keeps sending.
      if (buf.length === 1 && buf[0] === ENQ) {
        sock.write(Buffer.from([ACK_BYTE]));
        console.log('   ⬆ sent <ACK> (replied to ENQ)');
      } else if (buf.includes(EOT)) {
        console.log('   ■ transmission complete (<EOT> received)');
      } else {
        sock.write(Buffer.from([ACK_BYTE]));
        console.log('   ⬆ sent <ACK> (frame acknowledged)');
      }
    }
  });

  sock.on('error', (err) => console.log(`\n⚠  [${ts()}] socket error: ${err.message}`));
  sock.on('close', () => console.log(`\n🔌 [${ts()}] ${label} disconnected: ${peer}`));
}

// ── Start in server or client mode ───────────────────────────────────────────
console.log('════════════════════════════════════════════════════════════');
console.log(' RK Clinic LIS — Analyzer Connectivity Probe');
console.log('════════════════════════════════════════════════════════════');
console.log(` mode      : ${MODE}`);
console.log(` endpoint  : ${MODE === 'server' ? `${HOST}:${PORT} (listening)` : `${HOST}:${PORT} (connecting)`}`);
console.log(` auto-ACK  : ${ACK ? 'on (ASTM handshake)' : 'off (passive capture)'}`);
console.log('════════════════════════════════════════════════════════════');

if (MODE === 'server') {
  const server = net.createServer((sock) => handleSocket(sock, 'analyzer'));
  server.on('error', (err) => {
    console.error(`\n❌ server error: ${err.message}`);
    if (err.code === 'EADDRINUSE') console.error(`   Port ${PORT} is already in use — pick another with --port.`);
    process.exit(1);
  });
  server.listen(PORT, HOST, () => {
    console.log(`\n👂 Listening on ${HOST}:${PORT}. Point the analyzer's Host/LIS IP at THIS PC's IP and this port.`);
    console.log('   (Find this PC\'s IP: macOS/Linux `ifconfig` or `ip addr`, Windows `ipconfig`.)');
    console.log('   Press Ctrl+C to stop.\n');
  });
} else if (MODE === 'client') {
  const sock = net.createConnection({ host: HOST, port: PORT }, () => handleSocket(sock, 'analyzer (as client)'));
  sock.on('error', (err) => {
    console.error(`\n❌ could not connect to ${HOST}:${PORT} — ${err.message}`);
    console.error('   Check: analyzer powered on? same subnet? firewall? correct IP/port?');
    process.exit(1);
  });
} else {
  console.error(`\n❌ Unknown --mode "${MODE}". Use "server" or "client".`);
  process.exit(1);
}
