/**
 * Protocol dispatcher + shared connection handler.
 *
 * Transports stay protocol-agnostic: they build a connection handler and feed
 * it bytes. The handler assembles messages, forwards results, and — for
 * host-query-capable ASTM machines — answers query frames back on the same link.
 */

import {
  AstmReceiver, parseAstmRecords, parseAstmQuery, buildAstmOrderMessage, AstmSender,
} from './astm.mjs';
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
function isAuto(machine) {
  return proto(machine) === 'auto';
}

/**
 * Decide from the opening bytes whether a connection is speaking ASTM or HL7.
 *
 * Returns 'astm', 'hl7', or null meaning "not enough to be sure yet".
 *
 * This exists because the Maglumi's protocol is genuinely ambiguous from the
 * outside: its own Lis.exe carries a hardcoded ASTM E1394-97 header record, yet
 * it ships NIIHL7.dll beside NIIASTM.dll, and the setting that picks between them
 * lives in a screen on the instrument's control PC. Rather than bet on one and
 * silently parse nothing, we let the first packet say which it is.
 */
export function sniffProtocol(buf) {
  if (!buf || !buf.length) return null;
  const b = buf[0];
  if (b === 0x0b) return 'hl7';                       // MLLP <VT>
  if (b === 0x05 || b === 0x02 || b === 0x04) return 'astm'; // ENQ / STX / EOT
  const head = buf.subarray(0, 8).toString('latin1');
  if (/^MSH\|/.test(head)) return 'hl7';              // unframed HL7
  if (/^H\|/.test(head)) return 'astm';               // unframed ASTM header record
  // HP-Socket PACK: 4-byte length header, then the body.
  if (buf.length >= 7) {
    const declared = buf.readUInt32BE(0) & 0x3fffff;
    if (declared > 0 && declared <= 4 * 1024 * 1024
      && buf.subarray(4, 7).toString('latin1') === 'MSH') return 'hl7';
  }
  return null;
}

/**
 * Buffers the opening bytes, works out the protocol, then hands everything to the
 * real receiver and gets out of the way.
 *
 * Nothing is written back before the decision is made. That matters: replying to
 * an ASTM ENQ with an HL7 ACK (or vice versa) is how a link ends up resetting in a
 * loop, and the Afinion already taught us that answering an analyzer in the wrong
 * dialect is worse than staying quiet.
 */
class AutoProtocolReceiver {
  constructor(machine, cbs) {
    this.machine = machine;
    this.cbs = cbs;
    this.pending = [];
    this.inner = null;
    this.bytesSeen = 0;
  }

  feed(buf) {
    if (this.inner) { this.inner.feed(buf); return; }

    this.pending.push(Buffer.from(buf));
    this.bytesSeen += buf.length;
    const combined = Buffer.concat(this.pending);
    const decided = sniffProtocol(combined);

    if (!decided) {
      // Give up guessing after a while and default to ASTM, which is what this
      // instrument's own Lis.exe builds. Logged either way so it is visible.
      if (this.bytesSeen < 64) return;
      this.#adopt('astm', combined, true);
      return;
    }
    this.#adopt(decided, combined, false);
  }

  #adopt(kind, buffered, byFallback) {
    const resolved = { ...this.machine, protocol: kind };
    this.cbs.onLog?.(byFallback
      ? `protocol undecided after ${this.bytesSeen} bytes — assuming ${kind}`
      : `protocol detected: ${kind}`);
    this.inner = kind === 'hl7'
      ? new Hl7Receiver({ ...this.cbs, framing: this.machine.framing || 'auto', ack: !!this.machine.ack })
      : new AstmReceiver(this.cbs);
    this.resolved = resolved;
    this.inner.feed(buffered);
    this.pending = [];
  }

  dispose() { if (this.inner?.dispose) this.inner.dispose(); }
}

export function makeReceiver(machine, cbs) {
  if (isAuto(machine)) return new AutoProtocolReceiver(machine, cbs);
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
  // With protocol 'auto' the message itself says which it is, so the dispatcher
  // does not have to remember the per-connection decision.
  const looksHl7 = isAuto(machine) ? /(^|[\r\n])MSH\|/.test(String(text)) : isHl7(machine);
  const parsed = looksHl7 ? parseHl7(text) : parseAstmRecords(text);
  const mapper = ASSAY_MAPS[String(machine.assayMap || '').toLowerCase()];
  if (mapper && Array.isArray(parsed.tests)) parsed.tests = mapper(parsed.tests);
  return parsed;
}

/** Detect a host-query frame. */
export function detectQuery(machine, text) {
  const looksHl7 = isAuto(machine) ? /(^|[\r\n])MSH\|/.test(String(text)) : isHl7(machine);
  if (looksHl7) return detectHl7Query(text);
  return parseAstmQuery(text);
}

/**
 * Build the protocol-specific order response for a host-query.
 *
 * ASTM returns records for the send handshake; HL7 returns a finished message to
 * write straight back on the socket, since MLLP has no handshake to drive.
 */
export function buildOrderResponse(machine, order, query = null) {
  // An HL7 query carries HL7 markers; anything else came off the ASTM path.
  const answerHl7 = isHl7(machine)
    || (isAuto(machine) && query && /^(QBP|QRY|QCK)/i.test(query.messageType || ''));
  if (answerHl7) {
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
