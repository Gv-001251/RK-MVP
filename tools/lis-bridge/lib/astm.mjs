/**
 * ASTM E1381 (low-level framing) + E1394 (record content) support.
 *
 * AstmReceiver assembles frames from a byte stream and performs the ACK
 * handshake; parseAstmRecords turns the assembled record text into a
 * normalised { specimenId, tests[] } shape the bridge can forward.
 *
 * NOTE: This is the standard ASTM implementation. Some analyzers (e.g. the
 * Hemat 60, which sends a bare <STX> and waits for a specific reply) deviate
 * from standard framing; those need their handshake confirmed from the
 * vendor's protocol spec and a small per-machine tweak. The framework is built
 * so that is a localized change.
 */

export const CTRL = {
  ENQ: 0x05, ACK: 0x06, NAK: 0x15, STX: 0x02,
  ETX: 0x03, ETB: 0x17, EOT: 0x04, CR: 0x0d, LF: 0x0a,
};

export class AstmReceiver {
  constructor({ write, onMessage, onLog } = {}) {
    this.write = write || (() => {});
    this.onMessage = onMessage || (() => {});
    this.onLog = onLog || (() => {});
    this.reset();
  }

  reset() {
    this.inFrame = false;
    this.skipFrameNumber = false;
    this.frameBytes = [];
    this.messageText = '';
  }

  feed(buf) {
    for (const b of buf) {
      switch (b) {
        case CTRL.ENQ:
          // Sender wants to establish — acknowledge and start a fresh message.
          this.messageText = '';
          this.write(Buffer.from([CTRL.ACK]));
          this.onLog('rx <ENQ> → tx <ACK>');
          break;

        case CTRL.STX:
          this.inFrame = true;
          this.skipFrameNumber = true; // the byte right after STX is the frame number
          this.frameBytes = [];
          break;

        case CTRL.ETX:
        case CTRL.ETB:
          // End of a frame's content. Append it and acknowledge the frame.
          this.inFrame = false;
          this.messageText += Buffer.from(this.frameBytes).toString('latin1');
          this.write(Buffer.from([CTRL.ACK]));
          this.onLog('rx <frame> → tx <ACK>');
          break;

        case CTRL.EOT: {
          // End of transmission — emit the complete message.
          const text = this.messageText;
          this.reset();
          if (text.trim()) this.onMessage(text);
          this.onLog('rx <EOT> (message complete)');
          break;
        }

        default:
          // Any other byte: part of the frame if we're inside one; otherwise
          // it's checksum/CR/LF noise between frames and is safely ignored
          // (checksum chars are hex ASCII, never control codes).
          if (this.inFrame) {
            if (this.skipFrameNumber) this.skipFrameNumber = false; // drop the frame number
            else this.frameBytes.push(b);
          }
          break;
      }
    }
  }
}

/** Split "^"-delimited component and return the first meaningful part. */
function firstComponent(field) {
  if (!field) return '';
  const parts = String(field).split('^').filter(Boolean);
  return (parts[0] || '').trim();
}

/**
 * Parse assembled ASTM E1394 record text into a normalised result.
 * Records are separated by CR; fields by "|".
 *   O record → specimen/barcode ID (field 3, fallback 4)
 *   P record → patient name (field 6)
 *   R record → test code (field 3), value (4), units (5), ref range (6), flag (7)
 */
export function parseAstmRecords(text) {
  const records = String(text).split(/[\r\n]+/).map(r => r.trim()).filter(Boolean);
  const out = { specimenId: null, patientName: null, tests: [], raw: text };

  for (const rec of records) {
    const fields = rec.split('|');
    const rtype = (fields[0] || '').replace(/^\d+/, '').toUpperCase().charAt(0);

    if (rtype === 'O') {
      const specimen = firstComponent(fields[2]) || firstComponent(fields[3]);
      if (specimen) out.specimenId = specimen;
    } else if (rtype === 'P') {
      const name = (fields[5] || '').replace(/\^/g, ' ').trim();
      if (name) out.patientName = name;
    } else if (rtype === 'R') {
      const code = firstComponent(fields[2]);
      if (!code) continue;
      out.tests.push({
        code,
        value: (fields[3] || '').trim(),
        unit: (fields[4] || '').trim(),
        refRange: (fields[5] || '').trim(),
        flag: (fields[6] || '').trim(),
      });
    }
  }
  return out;
}

// ============================================================================
// Host-query (LIS → analyzer) support: parse a query frame, build an order
// response, and drive the ASTM E1381 send handshake back to the analyzer.
//
// Used when a host-query-capable analyzer scans a barcode and asks the LIS
// what's ordered for that accession. This is the standard ASTM sender; strict
// analyzers may need a per-machine framing tweak (same caveat as the receiver).
// ============================================================================

/** ASTM frame checksum: (sum of bytes from the frame-number through ETX/ETB) mod 256, as 2 hex chars. */
export function astmChecksum(bytes) {
  let sum = 0;
  for (const b of bytes) sum = (sum + b) & 0xff;
  return sum.toString(16).toUpperCase().padStart(2, '0');
}

/**
 * Build one framed ASTM record as a Buffer:
 *   <STX> frameNumber record <CR> <ETX|ETB> C1 C2 <CR> <LF>
 * Intermediate frames use <ETB>; the final frame uses <ETX>.
 */
export function buildAstmFrame(record, frameNumber, final = true) {
  const end = final ? CTRL.ETX : CTRL.ETB;
  const body = Buffer.from(`${frameNumber}${record}${String.fromCharCode(CTRL.CR)}`, 'latin1');
  const forSum = Buffer.concat([body, Buffer.from([end])]);
  const cs = astmChecksum(forSum);
  return Buffer.concat([
    Buffer.from([CTRL.STX]),
    body,
    Buffer.from([end]),
    Buffer.from(cs, 'latin1'),
    Buffer.from([CTRL.CR, CTRL.LF]),
  ]);
}

/**
 * Detect an ASTM query (Q) record and pull the requested specimen id from it.
 * Q record: `Q|1|^ACC-123||ALL||...` — specimen is the starting-range field.
 */
export function parseAstmQuery(text) {
  const records = String(text).split(/[\r\n]+/).map((r) => r.trim()).filter(Boolean);
  for (const rec of records) {
    const fields = rec.split('|');
    const rtype = (fields[0] || '').replace(/^\d+/, '').toUpperCase().charAt(0);
    if (rtype === 'Q') {
      const specimen = firstComponent(fields[2]) || firstComponent(fields[3]);
      return { isQuery: true, specimenId: specimen || null };
    }
  }
  return { isQuery: false, specimenId: null };
}

/**
 * Build the ASTM E1394 records for a host-query response — H, P, one O per
 * ordered test (or an "ALL" order when nothing specific is found), and L.
 * Returns an array of record strings (framing is applied by the sender).
 */
export function buildAstmOrderMessage({ specimenId, patientName, patientId, sex, priority, tests } = {}) {
  const recs = [];
  recs.push('H|\\^&|||RK-LIS|||||||P|1'); // delimiter-definition + minimal header
  const nm = (patientName || '').trim().replace(/\s+/g, '^'); // best-effort name components
  recs.push(`P|1||${patientId || ''}||${nm}|||${sex || ''}`);

  const pr = (priority || 'R').charAt(0).toUpperCase(); // R(outine) | S(TAT) | A(SAP)
  let seq = 1;
  if (Array.isArray(tests) && tests.length) {
    for (const t of tests) {
      const code = (t && (t.code || t.name)) || '';
      recs.push(`O|${seq}|${specimenId || ''}||^^^${code}|${pr}||||||N`);
      seq += 1;
    }
  } else {
    // No specific order found — let the analyzer decide (or run its default panel).
    recs.push(`O|1|${specimenId || ''}||^^^ALL|${pr}||||||N`);
  }
  recs.push('L|1|N'); // terminator
  return recs;
}

/**
 * Drives the ASTM send handshake for a host-query response over an established
 * link: ENQ → (ACK) → frame → (ACK) → … → EOT. Feed the analyzer's control
 * bytes (ACK/NAK) via feedControl(); call start() to begin.
 */
export class AstmSender {
  constructor({ write, records, onLog, onDone, maxRetries = 3 } = {}) {
    this.write = write || (() => {});
    this.records = records || [];
    this.onLog = onLog || (() => {});
    this.onDone = onDone || (() => {});
    this.maxRetries = maxRetries;
    this.idx = 0;
    this.frameNumber = 1;
    this.retries = 0;
    this.state = 'idle'; // idle | enq | frame | done
  }

  start() {
    this.state = 'enq';
    this.write(Buffer.from([CTRL.ENQ]));
    this.onLog('tx <ENQ> (host-query response)');
  }

  _sendCurrentFrame() {
    const rec = this.records[this.idx];
    const final = this.idx === this.records.length - 1;
    this.state = 'frame';
    this.write(buildAstmFrame(rec, this.frameNumber, final));
    this.onLog(`tx <frame ${this.frameNumber}> ${rec}`);
  }

  _finish(ok) {
    if (this.state === 'done') return;
    this.state = 'done';
    this.onDone(ok);
  }

  feedControl(buf) {
    for (const b of buf) {
      if (this.state === 'done') return;

      if (b === CTRL.ACK) {
        if (this.state === 'enq') {
          if (!this.records.length) { this.write(Buffer.from([CTRL.EOT])); this._finish(true); return; }
          this.idx = 0; this.frameNumber = 1; this.retries = 0;
          this._sendCurrentFrame();
        } else if (this.state === 'frame') {
          this.idx += 1; this.retries = 0;
          if (this.idx >= this.records.length) {
            this.write(Buffer.from([CTRL.EOT]));
            this.onLog('tx <EOT> (host-query response complete)');
            this._finish(true);
          } else {
            this.frameNumber = (this.frameNumber + 1) % 8;
            this._sendCurrentFrame();
          }
        }
      } else if (b === CTRL.NAK) {
        if (this.state === 'enq') {
          this.onLog('rx <NAK> after ENQ — analyzer not ready, aborting response');
          this._finish(false);
        } else if (this.state === 'frame') {
          this.retries += 1;
          if (this.retries > this.maxRetries) { this.onLog('too many NAKs — aborting response'); this._finish(false); }
          else this._sendCurrentFrame();
        }
      }
      // Other bytes (e.g. ENQ contention) are ignored by this simplified sender.
    }
  }
}
