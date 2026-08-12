/**
 * Serial (RS-232 / UART / USB-serial) transport for analyzers like the
 * Maglumi 800, Uriplus 300, MB+, etc.
 *
 * The `serialport` package is a native dependency and is loaded lazily, so the
 * bridge still runs for TCP machines without it. To enable serial machines,
 * install it on the bridge PC:  npm install serialport
 *
 * Reliability: if the port can't open or the link drops (analyzer powered off,
 * USB replugged), it auto-reopens on a timer (machine.reconnectMs, default 5s)
 * until stop() is called — so one serial machine rebooting never needs a manual
 * restart, and never affects the others.
 */

import { createConnectionHandler } from './protocol.mjs';

export async function startSerial(machine, { onMessage, onStatus, onQuery, log }) {
  const logf = log || (() => {});
  const status = onStatus || (() => {});
  const reconnectMs = Number(machine.reconnectMs) || 5000;

  let SerialPort;
  try {
    ({ SerialPort } = await import('serialport'));
  } catch {
    logf(`[${machine.id}] ✗ serial needs the 'serialport' package. On the bridge PC run:  npm install serialport`);
    return { stop() {} };
  }

  let port = null;
  let stopped = false;
  let reopenTimer = null;

  function scheduleReopen() {
    if (stopped || reopenTimer) return;
    logf(`[${machine.id}] serial link down — reopening in ${Math.round(reconnectMs / 1000)}s`);
    reopenTimer = setTimeout(() => { reopenTimer = null; open(); }, reconnectMs);
  }

  function open() {
    if (stopped) return;

    // Fresh connection handler each open so no stale frame state carries over.
    const conn = createConnectionHandler(machine, {
      write: (b) => { try { port && port.write(b); } catch { /* closed */ } },
      onMessage,
      onQuery,
      onLog: (m) => logf(`[${machine.id}] ${m}`),
    });

    port = new SerialPort({
      path: machine.comPort,
      baudRate: machine.baud || 9600,
      dataBits: machine.dataBits || 8,
      parity: machine.parity || 'none',
      stopBits: machine.stopBits || 1,
      autoOpen: false,
    });

    port.on('data', (buf) => { try { conn.feed(buf); } catch (e) { logf(`[${machine.id}] parse error: ${e.message}`); } });
    port.on('close', () => { status(false); scheduleReopen(); });
    port.on('error', (e) => { logf(`[${machine.id}] serial error: ${e.message}`); status(false); scheduleReopen(); });

    port.open((err) => {
      if (err) {
        logf(`[${machine.id}] ✗ cannot open ${machine.comPort}: ${err.message}`);
        status(false);
        scheduleReopen();
      } else {
        logf(`[${machine.id}] serial open ${machine.comPort} @ ${machine.baud || 9600} ${machine.dataBits || 8}${(machine.parity || 'none')[0].toUpperCase()}${machine.stopBits || 1} (${machine.protocol || 'astm'})`);
        status(true);
      }
    });
  }

  open();

  return {
    stop() {
      stopped = true;
      if (reopenTimer) { clearTimeout(reopenTimer); reopenTimer = null; }
      try { port && port.close && port.close(); } catch { /* noop */ }
    },
  };
}
