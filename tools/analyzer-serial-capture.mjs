#!/usr/bin/env node
/**
 * ============================================================================
 * RK Clinic LIS — Serial Analyzer Capture
 * ============================================================================
 * Companion to analyzer-capture.mjs (which handles TCP instruments like the
 * Hemat 60). This one reads an RS-232 instrument over a USB-serial adapter —
 * the Maglumi 800 is configured that way in analyzer_connections:
 *
 *   maglumi800 | Serial (RS-232/USB) | /dev/tty.usbserial-MAGLUMI | 9600
 *
 *   node tools/analyzer-serial-capture.mjs --list
 *   node tools/analyzer-serial-capture.mjs --port /dev/tty.usbserial-XXXX
 *   node tools/analyzer-serial-capture.mjs --port <dev> --baud 9600 --ack
 *
 * With no --port it auto-selects the only USB-serial device present, and
 * refuses to guess if there are several.
 *
 * Purpose is protocol discovery, exactly like the TCP capture tool: log every
 * byte, keep the raw stream, work out the framing. It writes nothing to the
 * database.
 *
 * Serial line settings default to 9600 8N1 with no flow control, which is the
 * usual Snibe configuration — but confirm against the instrument's own comms
 * screen, since a mismatch shows up as plausible-looking garbage rather than an
 * obvious error.
 * ============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { SerialPort } from 'serialport';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const LIST_ONLY = args.includes('--list');
const SEND_ACK = args.includes('--ack');
const BAUD = parseInt(flag('--baud', process.env.SERIAL_BAUD || '9600'), 10);
const DATA_BITS = parseInt(flag('--databits', '8'), 10);
const STOP_BITS = parseInt(flag('--stopbits', '1'), 10);
const PARITY = flag('--parity', 'none');

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

/**
 * Serial ports that are a real USB adapter rather than a macOS built-in.
 *
 * Keyed on USB metadata, not on the device name. Naming is driver-specific —
 * Prolific's App Store extension can expose `PL2303G-...`, FTDI gives
 * `usbserial-A50285BI`, CH340 `wchusbserial...`, CP210x `SLAB_USBtoUART` — so
 * matching names means guessing at every vendor. Built-in and Bluetooth ports
 * report nothing but a `path`, whereas anything on the USB bus carries a
 * vendorId, which makes this both simpler and vendor-agnostic.
 */
function isCandidate(p) {
  if (!p.path) return false;
  if (/Bluetooth|debug-console/i.test(p.path)) return false;
  return Boolean(p.vendorId || p.productId || p.manufacturer);
}

async function listPorts() {
  const ports = await SerialPort.list();
  console.log('Serial ports visible to the system:\n');
  if (!ports.length) console.log('  (none)');
  for (const p of ports) {
    const tag = isCandidate(p) ? ' ← USB-serial candidate' : '';
    console.log(`  ${p.path}${tag}`);
    const meta = [
      p.manufacturer && `manufacturer=${p.manufacturer}`,
      p.vendorId && `vid=${p.vendorId}`,
      p.productId && `pid=${p.productId}`,
      p.serialNumber && `serial=${p.serialNumber}`,
    ].filter(Boolean).join('  ');
    if (meta) console.log(`      ${meta}`);
  }
  console.log('');
  return ports;
}

async function resolvePort() {
  const explicit = flag('--port');
  if (explicit) return explicit;

  const ports = await SerialPort.list();
  const candidates = ports.filter(isCandidate);

  if (candidates.length === 1) {
    console.log(`auto-selected the only USB-serial device: ${candidates[0].path}\n`);
    return candidates[0].path;
  }
  if (candidates.length === 0) {
    console.error('❌ No USB-serial device found.\n');
    console.error('   Plug the analyzer in (or its USB-serial adapter) and re-run.');
    console.error('   Use --list to see everything the system can see.');
    console.error('   If the adapter is connected but absent here, it needs a driver');
    console.error('   (Prolific PL2303 and some CH340 clones do on macOS).\n');
    process.exit(1);
  }
  console.error('❌ Several USB-serial devices present — pick one explicitly with --port:\n');
  for (const c of candidates) console.error(`   ${c.path}  ${c.manufacturer || ''}`);
  console.error('');
  process.exit(1);
}

/**
 * Candidate rates, ordered by likelihood for this situation rather than
 * numerically. Reading at 9600 produced roughly two bytes per real byte with
 * high-bit-heavy values, which points at a slower true rate — so the halves and
 * the common lab defaults come first. The sweep has to finish inside the
 * instrument's transmit window, so order matters.
 */
const BAUD_CANDIDATES = [4800, 9600, 19200, 2400, 38400, 1200, 57600, 115200];

/**
 * Score a sample of bytes by how much it looks like a real protocol.
 *
 * A correct baud rate yields printable ASCII plus the usual framing control
 * bytes. A wrong one yields a narrow set of high-bit-set values (0x88, 0xf4 …)
 * because the UART samples bit transitions in the wrong places.
 */
function plausibility(buf) {
  if (!buf.length) return { score: -1, printable: 0, distinct: 0 };
  let printable = 0;
  const seen = new Set();
  const framing = new Set([0x02, 0x03, 0x04, 0x05, 0x06, 0x0a, 0x0b, 0x0d, 0x15, 0x1c]);
  for (const b of buf) {
    seen.add(b);
    if ((b >= 0x20 && b <= 0x7e) || framing.has(b)) printable += 1;
  }
  return {
    score: printable / buf.length,
    printable,
    distinct: seen.size,
  };
}

/**
 * Listen at each candidate rate and report which one produces sensible bytes.
 * The instrument heartbeats every ~3s, so a few seconds per rate is enough.
 */
async function autobaud(devicePath, dwellMs = parseInt(flag('--dwell', '3500'), 10)) {
  console.log('Scanning baud rates — the analyzer beats every ~3s, so this takes a moment.\n');
  const results = [];

  for (const baud of BAUD_CANDIDATES) {
    const port = new SerialPort({
      path: devicePath, baudRate: baud, dataBits: 8, stopBits: 1, parity: 'none', autoOpen: false,
    });

    const chunks = [];
    await new Promise((resolve) => {
      port.on('data', (b) => chunks.push(b));
      port.on('error', () => {});
      port.open((err) => {
        if (err) { resolve(); return; }
        setTimeout(() => { if (port.isOpen) port.close(() => resolve()); else resolve(); }, dwellMs);
      });
    });

    const buf = Buffer.concat(chunks);
    const p = plausibility(buf);
    results.push({ baud, bytes: buf.length, ...p, sample: buf.subarray(0, 24).toString('hex') });

    const verdict = buf.length === 0 ? 'silent'
      : p.score >= 0.8 ? 'LOOKS CORRECT'
      : p.score >= 0.4 ? 'partial' : 'garbage';
    console.log(`  ${String(baud).padStart(6)}  ${String(buf.length).padStart(4)} bytes  ` +
      `printable ${(p.score * 100).toFixed(0).padStart(3)}%  distinct ${String(p.distinct).padStart(3)}  ${verdict}`);
    if (buf.length) console.log(`          ${buf.subarray(0, 24).toString('hex').match(/../g).join(' ')}`);
  }

  const best = results.filter((r) => r.bytes > 0).sort((a, b) => b.score - a.score)[0];
  console.log('');
  if (!best) {
    console.log('No data at any rate. The instrument is not transmitting, or the cable is wrong.');
  } else if (best.score >= 0.8) {
    console.log(`=> Use --baud ${best.baud}  (${(best.score * 100).toFixed(0)}% printable)`);
  } else {
    console.log(`=> Best was ${best.baud} at only ${(best.score * 100).toFixed(0)}% printable.`);
    console.log('   Try a different parity or stop-bit setting, e.g. --parity even, --stopbits 2.');
  }
  return best;
}

/**
 * Sweep repeatedly until something plausible turns up.
 *
 * The Maglumi only transmits for a short window after its scan button is
 * pressed, and a single pass can easily miss it entirely — which is exactly
 * what happened on the first attempt. Looping removes the need to time the
 * button press against the sweep.
 */
async function watchForBaud(devicePath) {
  console.log('Cycling baud rates until data appears. Press the analyzer\'s scan button');
  console.log('at any point — the sweep will catch it. Ctrl-C to stop.\n');

  for (let pass = 1; ; pass += 1) {
    console.log(`── pass ${pass} ──`);
    const best = await autobaud(devicePath, parseInt(flag('--dwell', '3000'), 10));
    if (best && best.score >= 0.8) {
      console.log(`\n🎉 settled on ${best.baud}. Now run:`);
      console.log(`   npm run analyzer:maglumi:dry -- --baud ${best.baud}\n`);
      return best;
    }
    if (best) {
      console.log(`   (data seen at ${best.baud} but only ${(best.score * 100).toFixed(0)}% printable — continuing)\n`);
    }
  }
}

/**
 * Determine the baud rate by asking, rather than by listening.
 *
 * Passive sweeping cannot work on an instrument that never transmits
 * unprompted — every pass reads as silent. But ASTM defines ENQ (0x05) as
 * "request to send" and ACK (0x06) as the reply, so we can drive the exchange
 * ourselves and look for that one known byte. A correct rate gives back exactly
 * 0x06 (or 0x15 NAK, which is also a valid, meaningful answer); a wrong rate
 * gives silence or noise.
 *
 * Sending ENQ is protocol-defined rather than invented, which is why this is a
 * safe thing to send to a live analyzer: it asks permission, it commands
 * nothing.
 */
async function probeBaud(devicePath, dwellMs = parseInt(flag('--dwell', '2000'), 10)) {
  const ENQ = 0x05;
  console.log('Probing with ASTM ENQ at each baud rate, looking for ACK (0x06).');
  console.log('This drives the exchange, so it works even though the analyzer');
  console.log('never transmits on its own.\n');

  const findings = [];

  for (const baud of BAUD_CANDIDATES) {
    const port = new SerialPort({
      path: devicePath, baudRate: baud, dataBits: DATA_BITS,
      stopBits: STOP_BITS, parity: PARITY, autoOpen: false,
    });

    const chunks = [];
    await new Promise((resolve) => {
      port.on('data', (b) => chunks.push(b));
      port.on('error', () => {});
      port.open((err) => {
        if (err) { resolve(); return; }
        // Give the line a moment to settle before speaking.
        setTimeout(() => port.write(Buffer.from([ENQ])), 150);
        setTimeout(() => { if (port.isOpen) port.close(() => resolve()); else resolve(); }, dwellMs);
      });
    });

    const buf = Buffer.concat(chunks);
    const gotAck = buf.includes(0x06);
    const gotNak = buf.includes(0x15);
    const verdict = gotAck ? 'ACK — CORRECT RATE'
      : gotNak ? 'NAK — correct rate, analyzer busy/refusing'
      : buf.length ? 'noise'
      : 'silent';

    findings.push({ baud, bytes: buf.length, gotAck, gotNak, hex: buf.subarray(0, 16).toString('hex') });
    console.log(`  ${String(baud).padStart(6)}  ${String(buf.length).padStart(3)} bytes  ${verdict}` +
      (buf.length ? `   ${buf.subarray(0, 16).toString('hex').match(/../g).join(' ')}` : ''));
  }

  const hit = findings.find((f) => f.gotAck) || findings.find((f) => f.gotNak);
  console.log('');
  if (hit) {
    console.log(`=> ${hit.baud} is the rate. Next:`);
    console.log(`   npm run analyzer:maglumi:dry -- --baud ${hit.baud}\n`);
  } else if (findings.some((f) => f.bytes)) {
    console.log('=> Bytes came back but never a clean ACK. Likely a parity or stop-bit');
    console.log('   mismatch rather than baud. Try --parity even or --stopbits 2.\n');
  } else {
    console.log('=> Nothing answered at any rate. Either the analyzer needs to be put');
    console.log('   into its LIS/online mode first, or the cable needs a null-modem');
    console.log('   crossover (TX and RX are not crossed over).\n');
  }
  return hit;
}

async function main() {
  if (LIST_ONLY) { await listPorts(); return; }

  const devicePath = await resolvePort();

  if (args.includes('--probe-baud')) { await probeBaud(devicePath); return; }
  if (args.includes('--watch-baud')) { await watchForBaud(devicePath); return; }
  if (args.includes('--autobaud')) { await autobaud(devicePath); return; }

  const outDir = path.resolve('tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const capturePath = path.join(outDir, `serial-capture-${Date.now()}.bin`);
  const capture = fs.createWriteStream(capturePath);

  console.log('════════════════════════════════════════════════════════════');
  console.log(' RK Clinic LIS — Serial Analyzer Capture');
  console.log(`  device     : ${devicePath}`);
  console.log(`  line       : ${BAUD} ${DATA_BITS}${PARITY[0].toUpperCase()}${STOP_BITS}, no flow control`);
  console.log(`  reply mode : ${SEND_ACK ? 'ACK data frames' : 'silent (read-only)'}`);
  console.log(`  raw capture: ${capturePath}`);
  console.log('════════════════════════════════════════════════════════════\n');

  const port = new SerialPort({
    path: devicePath,
    baudRate: BAUD,
    dataBits: DATA_BITS,
    stopBits: STOP_BITS,
    parity: PARITY,
    autoOpen: false,
  });

  let frames = 0;
  let beats = 0;
  let totalBytes = 0;

  port.on('open', () => {
    console.log(`[${ts()}] ✅ port open — waiting for the analyzer to transmit`);
    console.log('   Run a sample, or use the instrument\'s "send to LIS" / communication');
    console.log('   control to push a stored record.\n');
  });

  port.on('data', (buf) => {
    capture.write(buf);
    totalBytes += buf.length;

    // Lone control byte: a keep-alive or link poll, not data.
    if (buf.length === 1 && CTRL[buf[0]]) {
      beats += 1;
      if (beats % 20 === 1) {
        console.log(`[${ts()}] ♥ ${annotate(buf)} ×${beats} — link alive, idle`);
      }
      return;
    }

    frames += 1;
    console.log(`\n┌─ [${ts()}] DATA #${frames} — ${buf.length} bytes ─────────────`);
    console.log(hexdump(buf));
    console.log('   ASCII: ' + annotate(buf).slice(0, 2000));
    console.log('└──────────────────────────────────────────────────────────\n');

    if (SEND_ACK) {
      port.write(Buffer.from([ACK]));
      console.log('   ⬆ sent <ACK>\n');
    }
  });

  port.on('error', (e) => console.error(`[${ts()}] ⚠  ${e.message}`));
  port.on('close', () => console.log(`[${ts()}] 🔌 port closed — ${frames} frame(s), ${beats} keep-alive(s), ${totalBytes} byte(s)`));

  port.open((err) => {
    if (!err) return;
    console.error(`❌ could not open ${devicePath}: ${err.message}\n`);
    if (/Resource busy/i.test(err.message)) {
      console.error('   Something else holds the port. Check for another capture,');
      console.error('   a screen/minicom session, or vendor software.');
    }
    if (/Permission denied/i.test(err.message)) {
      console.error('   Permission denied on the device node.');
    }
    process.exit(1);
  });

  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      capture.end();
      if (port.isOpen) port.close();
      console.log(`\nraw capture saved: ${capturePath}`);
      process.exit(0);
    });
  }
}

main().catch((e) => { console.error(`fatal: ${e.message}`); process.exit(1); });
