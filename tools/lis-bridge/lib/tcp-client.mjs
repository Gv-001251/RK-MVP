/**
 * TCP-client transport: the LIS connects OUT to an analyzer that listens as a
 * server. Auto-reconnects if the link drops (reliability for 24/7 operation).
 */

import net from 'node:net';
import { createConnectionHandler } from './protocol.mjs';

export function startTcpClient(machine, { onMessage, onStatus, onQuery, log }) {
  const logf = log || (() => {});
  const status = onStatus || (() => {});
  let sock = null;
  let stopped = false;

  function connect() {
    if (stopped) return;
    sock = net.connect(machine.port, machine.host, () => {
      logf(`[${machine.id}] connected to ${machine.host}:${machine.port} (${machine.protocol || 'astm'})`);
      status(true);
    });
    const conn = createConnectionHandler(machine, {
      write: (b) => { try { sock.write(b); } catch { /* closed */ } },
      onMessage,
      onQuery,
      onLog: (m) => logf(`[${machine.id}] ${m}`),
    });
    sock.on('data', (buf) => { try { conn.feed(buf); } catch (e) { logf(`[${machine.id}] parse error: ${e.message}`); } });
    sock.on('close', () => {
      status(false);
      if (!stopped) { logf(`[${machine.id}] connection lost — reconnecting in 5s`); setTimeout(connect, 5000); }
    });
    sock.on('error', (e) => logf(`[${machine.id}] socket error: ${e.message}`));
  }

  connect();
  return { stop() { stopped = true; try { sock && sock.destroy(); } catch { /* noop */ } } };
}
