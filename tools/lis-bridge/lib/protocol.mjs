/**
 * Protocol dispatcher + shared connection handler.
 *
 * Transports stay protocol-agnostic: they build a connection handler and feed
 * it bytes. The handler assembles messages, forwards results, and — for
 * host-query-capable ASTM machines — answers query frames back on the same link.
 */

import { AstmReceiver, parseAstmRecords, parseAstmQuery, buildAstmOrderMessage, AstmSender } from './astm.mjs';
import { MllpReceiver, parseHl7 } from './hl7.mjs';

function proto(machine) {
  return (machine.protocol || 'astm').toLowerCase();
}
function isHl7(machine) {
  const p = proto(machine);
  return p === 'hl7' || p === 'mllp';
}

export function makeReceiver(machine, cbs) {
  if (isHl7(machine)) return new MllpReceiver(cbs);
  return new AstmReceiver(cbs);
}

export function parseMessage(machine, text) {
  if (isHl7(machine)) return parseHl7(text);
  return parseAstmRecords(text);
}

/** Detect a host-query frame. HL7 host-query is not implemented yet. */
export function detectQuery(machine, text) {
  if (isHl7(machine)) return { isQuery: false, specimenId: null };
  return parseAstmQuery(text);
}

/** Build the protocol-specific order-response records for a host-query. */
export function buildOrderResponse(machine, order) {
  if (isHl7(machine)) return null; // not supported yet
  return buildAstmOrderMessage(order);
}

/** Create a protocol-specific sender for the response handshake (null if unsupported). */
export function makeSender(machine, opts) {
  if (isHl7(machine)) return null;
  return new AstmSender(opts);
}

/**
 * Shared per-connection handler used by every transport. Owns the receiver and,
 * during a host-query response, routes the analyzer's control bytes (ACK/NAK)
 * to the sender instead of the receiver.
 *
 *   write     (bytes) => void                    send raw bytes to the analyzer
 *   onMessage (text)  => void                     a complete RESULT message (forward to LIS)
 *   onQuery   (text)  => Promise<{records}|null>  resolve a query frame to response records
 */
export function createConnectionHandler(machine, { write, onMessage, onQuery, onLog } = {}) {
  const logf = onLog || (() => {});
  let sender = null;

  const receiver = makeReceiver(machine, {
    write,
    onMessage: (text) => { void handle(text); },
    onLog: logf,
  });

  async function handle(text) {
    // Host-query? Ask the resolver; if it returns records, send them back on
    // this link instead of forwarding as a result.
    if (onQuery) {
      let resp = null;
      try { resp = await onQuery(text); }
      catch (e) { logf(`host-query handler error: ${e.message}`); }
      if (resp && Array.isArray(resp.records) && resp.records.length) {
        const s = makeSender(machine, {
          write,
          records: resp.records,
          onLog: logf,
          onDone: () => { if (sender === s) sender = null; },
        });
        if (s) { sender = s; s.start(); return; }
      }
    }
    if (onMessage) onMessage(text);
  }

  return {
    feed(buf) {
      if (sender) { sender.feedControl(buf); return; }
      receiver.feed(buf);
    },
  };
}
