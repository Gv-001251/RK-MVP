#!/usr/bin/env node
/**
 * ============================================================================
 * RK Clinic LIS — Analyzer Reachability Check (Ethernet / TCP-IP)
 * ============================================================================
 * Answers: "Is this networked analyzer ALIVE, and are its details ACCESSIBLE?"
 *
 * It performs a TCP connection test to the analyzer's IP:port and reports a
 * clear verdict, then briefly listens for any data the machine pushes.
 *
 * Standalone — needs only Node.js 20.9+ (built-in `net` module, no install).
 * Run it on a PC that is on the SAME NETWORK as the analyzer.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *   node tools/analyzer-check.mjs --host 192.168.1.101 --port 9100
 *   node tools/analyzer-check.mjs --host 192.168.1.101 --port 9100 --wait 15
 *
 * How to find --host and --port:
 *   • On the analyzer: Settings → Host / LIS / Communication / Interface.
 *     It shows the IP + port it uses to talk to the LIS.
 *   • Or check your router's "connected devices" / DHCP client list.
 * ============================================================================
 */

import net from 'node:net';

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i !== -1 && args[i + 1] && !args[i + 1].startsWith('--')) return args[i + 1];
  return fallback;
}

const HOST = arg('host', process.env.PROBE_HOST);
const PORT = parseInt(arg('port', process.env.PROBE_PORT || '9100'), 10);
const WAIT_SECS = parseInt(arg('wait', '10'), 10);
const CONNECT_TIMEOUT_MS = 6000;

if (!HOST) {
  console.error('❌ Missing --host. Example:\n   node tools/analyzer-check.mjs --host 192.168.1.101 --port 9100');
  process.exit(1);
}

const CTRL = {
  0x02: '<STX>', 0x03: '<ETX>', 0x04: '<EOT>', 0x05: '<ENQ>', 0x06: '<ACK>',
  0x15: '<NAK>', 0x0d: '<CR>', 0x0a: '<LF>', 0x0b: '<VT/HL7-START>', 0x1c: '<FS/HL7-END>',
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

console.log('════════════════════════════════════════════════════════════');
console.log(' RK Clinic LIS — Analyzer Reachability Check');
console.log('════════════════════════════════════════════════════════════');
console.log(` target : ${HOST}:${PORT}`);
console.log(` step 1 : opening a TCP connection (timeout ${CONNECT_TIMEOUT_MS / 1000}s)…\n`);

const sock = new net.Socket();
let gotData = false;
let settled = false;

sock.setTimeout(CONNECT_TIMEOUT_MS);

sock.on('connect', () => {
  console.log('✅ STEP 1 PASSED — port is OPEN. The machine is reachable and accepting a connection.');
  console.log(`\n step 2 : listening ${WAIT_SECS}s for data the analyzer pushes…`);
  console.log('          (tip: on the analyzer, run a QC/sample or press "Transmit to LIS")\n');
  sock.setTimeout(0); // disable idle timeout while we wait for data

  // If the analyzer opens with ASTM ENQ, ACK it so it keeps sending.
  const waitTimer = setTimeout(() => {
    if (!gotData) {
      console.log('ℹ  Connected, but no data received yet.');
      console.log('   → The link works. The machine just hasn\'t transmitted a result.');
      console.log('   → Trigger a QC/sample on the analyzer, or run the capture tool:');
      console.log('     node tools/analyzer-probe.mjs --mode client --host ' + HOST + ' --port ' + PORT);
    }
    finish(0);
  }, WAIT_SECS * 1000);

  sock.on('data', (buf) => {
    gotData = true;
    console.log(`⬇ received ${buf.length} byte(s)`);
    console.log(`   HEX  : ${buf.toString('hex').match(/../g).join(' ')}`);
    console.log(`   ASCII: ${annotate(buf)}`);
    if (buf.length === 1 && buf[0] === 0x05) {
      sock.write(Buffer.from([0x06])); // ACK the ENQ
      console.log('   ⬆ sent <ACK>');
    } else if (buf.includes(0x03) || buf.includes(0x1c)) {
      sock.write(Buffer.from([0x06]));
      console.log('   ⬆ sent <ACK>');
    }
    console.log('   ✅ STEP 2 PASSED — the machine\'s details ARE accessible.\n');
    clearTimeout(waitTimer);
    // keep listening a bit more for additional frames, then finish
    setTimeout(() => finish(0), 4000);
  });
});

sock.on('timeout', () => {
  if (settled) return;
  console.log('❌ STEP 1 FAILED — connection TIMED OUT (no response).');
  console.log('   The machine is NOT reachable at this IP:port. Likely causes:');
  console.log('   • wrong IP or port            • analyzer on a different subnet');
  console.log('   • Ethernet cable / link down  • firewall blocking the port');
  console.log(`\n   Try a ping first:  ping ${HOST}`);
  finish(1);
});

sock.on('error', (err) => {
  if (settled) return;
  if (err.code === 'ECONNREFUSED') {
    console.log('⚠  STEP 1: host is UP but the port is CLOSED (connection refused).');
    console.log('   → The analyzer is likely configured to CONNECT TO the LIS, not listen.');
    console.log('   → Run the LIS in "server" mode and point the analyzer\'s Host IP at THIS PC:');
    console.log(`     node tools/analyzer-probe.mjs --mode server --port ${PORT}`);
  } else if (err.code === 'EHOSTUNREACH' || err.code === 'ENETUNREACH') {
    console.log(`❌ STEP 1 FAILED — host unreachable (${err.code}).`);
    console.log('   Check the IP, that both devices are on the same subnet, and the cabling.');
  } else {
    console.log(`❌ STEP 1 FAILED — ${err.code || err.message}`);
  }
  console.log(`\n   Tip: confirm basic reachability with:  ping ${HOST}`);
  finish(1);
});

function finish(code) {
  if (settled) return;
  settled = true;
  try { sock.destroy(); } catch {}
  console.log('\n════════════════════════════════════════════════════════════');
  console.log(gotData
    ? ' RESULT: ✅ Machine ACTIVE and sending data — details are accessible.'
    : code === 0
      ? ' RESULT: ✅ Machine reachable (port open). Trigger a result to see data.'
      : ' RESULT: ❌ Could not reach the machine at this IP:port (see above).');
  console.log('════════════════════════════════════════════════════════════');
  process.exit(code);
}

sock.connect(PORT, HOST);
