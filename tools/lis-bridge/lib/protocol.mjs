/**
 * Protocol dispatcher + shared connection handler.
 *
 * Transports stay protocol-agnostic: they build a connection handler and feed
 * it bytes. The handler assembles messages, forwards results, and — for
 * host-query-capable ASTM machines — answers query frames back on the same link.
 */

import { AstmReceiver, parseAstmRecords, parseAstmQuery, buildAstmOrderMessage, AstmSender } from './astm.mjs';
import {
  Hl7Receiver, parseHl7, detectHl7Query, buildHl7OrderResponse, frameOutbound,
} from './hl7.mjs';
import { applyMaglumiAssayMap } from './maglumi-assays.mjs';

/** Per-machine result-code translators, selected by `"assayMap"` in config.json. */
const ASSAY_MAPS = { maglumi: applyMaglumiAssayMap };

function proto(machine) {
  return (machine.protocol || 'astm').toLowerCase();
}
function isHl7(machine) {
  const p = proto(machine);
  return p === 'hl7' || p === 'mllp';
}

export function makeReceiver(machine, cbs) {
  if (isHl7(machine)) {
    // framing: 'auto' unless the machine pins it; ack stays opt-in per analyzer
    // because the Hemat 60 wants silence on its link and Snibe sends NE|NE.
    return new Hl7Receiver({
      ...cbs,
      framing: machine.framing || 'auto',
      ack: !!machine.ack,
    });
  }
  return new AstmReceiver(cbs);
}

export function parseMessage(machine, text) {
  const parsed = isHl7(machine) ? parseHl7(text) : parseAstmRecords(text);
  const mapper = ASSAY_MAPS[String(machine.assayMap || '').toLowerCase()];
  if (mapper && Array.isArray(parsed.tests)) parsed.tests = mapper(parsed.tests);
  return parsed;
}

/** Detect a host-query frame. */
export function detectQuery(machine, text) {
  if (isHl7(machine)) return detectHl7Query(text);
  return parseAstmQuery(text);
}

/**
 * Build the protocol-specific order response for a host-query.
 *
 * ASTM returns records for the send handshake; HL7 returns a finished message to
 * write straight back on the socket, since MLLP has no handshake to drive.
 */
export function buildOrderResponse(machine, order, query = null) {
  if (isHl7(machine)) {
    if (!query || !query.supported) return null;
    return { hl7: buildHl7OrderResponse(query, order) };
  }
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
      // HL7: one message, written back in whatever framing the analyzer used.
      if (resp && resp.hl7) {
        try {
          write(frameOutbound(resp.hl7, receiver.mode || 'mllp'));
          logf('tx host-query response');
        } catch (e) {
          logf(`host-query response write failed: ${e.message}`);
        }
        return;
      }
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
    /** Release any pending timers when the link closes. */
    dispose() {
      if (typeof receiver.dispose === 'function') receiver.dispose();
    },
  };
}
