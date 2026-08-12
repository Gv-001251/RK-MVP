#!/usr/bin/env node
/**
 * ============================================================================
 * RK Clinic LIS — Analyzer Handshake Learner
 * ============================================================================
 * The Hemat 60 connects and sends a repeating single control byte (e.g. <STX>)
 * every few seconds, waiting for the "go ahead" reply defined by its protocol.
 * A plain <ACK> didn't advance it, so this tool cycles through the common
 * handshake replies — one per beat — and logs everything, so we can see which
 * reply makes the analyzer send its full result frame.
 *
 * Standalone; Node 20+, no install. Server mode (analyzer connects to us).
 *
 *   node tools/analyzer-handshake.mjs --port 8080
 *
 * Watch the log: when a reply is correct, the next message from the analyzer
 * will be MUCH longer than 1 byte (the real data frame) instead of another
 * lone control byte.
 * ============================================================================
 */

import net from 'node:net';

const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
const PORT = parseInt(portArg !== -1 ? args[portArg + 1] : (process.env.PROBE_PORT || '8080'), 10);

const CTRL = {
  0x01: '<SOH>', 0x02: '<STX>', 0x03: '<ETX>', 0x04: '<EOT>', 0x05: '<ENQ>',
  0x06: '<ACK>', 0x11: '<DC1>', 0x15: '<NAK>', 0x0d: '<CR>', 0x0a: '<LF>',
  0x0b: '<VT>', 0x1c: '<FS>', 0x16: '<SYN>', 0x17: '<ETB>',
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
const ts = () => new Date().toISOString().replace('T', ' ').replace('Z', '');

// Candidate replies to try, in order, one per incoming control-byte beat.
const CANDIDATES = [
  { desc: 'ACK (0x06)',            bytes: [0x06] },
  { desc: 'STX echo (0x02)',       bytes: [0x02] },
  { desc: 'ENQ (0x05)',            bytes: [0x05] },
  { desc: 'DC1/XON (0x11)',        bytes: [0x11] },
  { desc: 'ACK+STX (0x06 0x02)',   bytes: [0x06, 0x02] },
  { desc: 'SYN (0x16)',            bytes: [0x16] },
  { desc: 'SOH (0x01)',            bytes: [0x01] },
  { desc: 'CR LF (0x0d 0x0a)',     bytes: [0x0d, 0x0a] },
  { desc: '(no reply — passive)',  bytes: null },
];

console.log('════════════════════════════════════════════════════════════');
console.log(' RK Clinic LIS — Analyzer Handshake Learner');
console.log(`  listening on 0.0.0.0:${PORT} — cycling handshake replies`);
console.log('════════════════════════════════════════════════════════════\n');

const server = net.createServer((sock) => {
  const peer = `${sock.remoteAddress}:${sock.remotePort}`;
  console.log(`✅ [${ts()}] analyzer connected: ${peer}\n`);
  let idx = 0;
  let sawFrame = false;

  sock.on('data', (buf) => {
    console.log(`[${ts()}] ⬇ ${buf.length} byte(s)`);
    console.log(`   HEX  : ${buf.toString('hex').match(/../g).join(' ')}`);
    console.log(`   ASCII: ${annotate(buf)}`);

    if (buf.length > 2) {
      // Looks like a real data frame, not a lone handshake byte.
      if (!sawFrame) {
        console.log('   🎉 GOT A DATA FRAME — the previous reply worked! Keeping it and ACKing.\n');
        sawFrame = true;
      }
      sock.write(Buffer.from([0x06])); // ACK the frame so more keep coming
      return;
    }

    // Lone control byte → try the next candidate reply.
    const cand = CANDIDATES[idx % CANDIDATES.length];
    idx++;
    if (cand.bytes) {
      sock.write(Buffer.from(cand.bytes));
      console.log(`   ⬆ tried reply: ${cand.desc}\n`);
    } else {
      console.log(`   ⏸ tried reply: ${cand.desc}\n`);
    }
  });

  sock.on('close', () => console.log(`🔌 [${ts()}] disconnected: ${peer}\n`));
  sock.on('error', (e) => console.log(`⚠  ${e.message}`));
});

server.on('error', (err) => {
  console.error(`❌ ${err.message}${err.code === 'EADDRINUSE' ? ` — port ${PORT} busy (stop the other listener first)` : ''}`);
  process.exit(1);
});

// Bind dual-stack. Omitting the host makes Node listen on :: and accept both
// IPv6 and IPv4-mapped connections; the previous '0.0.0.0' would have silently
// ignored an analyzer that dialled in over IPv6 link-local.
server.listen(PORT, () => {
  const a = server.address();
  console.log(`   bound ${a.address}:${a.port} (${a.family}, accepts IPv4 + IPv6)\n`);
});
