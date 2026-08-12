/**
 * TCP-server transport: the analyzer connects TO the bridge (the common case,
 * e.g. the Hemat 60). For each connection we run a protocol receiver, and hand
 * every complete message to onMessage(rawText).
 */

import net from 'node:net';
import { createConnectionHandler } from './protocol.mjs';

export function startTcpServer(machine, { onMessage, onStatus, onQuery, log }) {
  const logf = log || (() => {});
  const status = onStatus || (() => {});

  const server = net.createServer((sock) => {
    const peer = `${sock.remoteAddress}:${sock.remotePort}`;
    logf(`[${machine.id}] analyzer connected ${peer}`);
    status(true);

    // Connection handler assembles messages (astm | hl7), forwards results, and
    // answers host-query frames on the same socket.
    const conn = createConnectionHandler(machine, {
      write: (bytes) => { try { sock.write(bytes); } catch { /* socket closed */ } },
      onMessage: (text) => onMessage(text),
      onQuery,
      onLog: (m) => logf(`[${machine.id}] ${m}`),
    });

    sock.on('data', (buf) => {
      try { conn.feed(buf); }
      catch (e) { logf(`[${machine.id}] parse error: ${e.message}`); }
    });
    sock.on('close', () => { logf(`[${machine.id}] analyzer disconnected ${peer}`); status(false); });
    sock.on('error', (e) => logf(`[${machine.id}] socket error: ${e.message}`));
  });

  server.on('error', (e) => logf(`[${machine.id}] SERVER ERROR: ${e.message}`));
  server.listen(machine.port, machine.bind || '0.0.0.0', () =>
    logf(`[${machine.id}] listening on ${machine.bind || '0.0.0.0'}:${machine.port} (protocol: ${machine.protocol || 'astm'})`)
  );
  return server;
}
