/**
 * ============================================================================
 * ASTM E1394 / E1381 — framing, checksums and records
 * ============================================================================
 * Transport-agnostic protocol layer, shared by the serial bridge (Maglumi 800)
 * and usable by any other ASTM instrument. It deliberately knows nothing about
 * serial ports or HTTP so it can be unit-tested on its own.
 *
 * Note the Hemat 60 is NOT this protocol — it speaks HL7 v2.3.1 over MLLP (see
 * tools/lis-bridge.mjs). Two instruments, two dialects; keeping them in
 * separate modules avoids one bleeding into the other.
 *
 * ── Link layer (E1381) ───────────────────────────────────────────────────────
 *   sender                receiver
 *   ENQ            →                    request the line
 *                  ←      ACK           permission granted
 *   STX…frame      →                    one frame
 *                  ←      ACK           frame accepted (NAK = resend)
 *   EOT            →                    done
 *
 * ── Frame layout, "framed" mode (textbook E1381) ─────────────────────────────
 *   <STX> FN text <ETX> C1 C2 <CR> <LF>      final frame of a record
 *   <STX> FN text <ETB> C1 C2 <CR> <LF>      intermediate frame
 *
 *   FN  single digit frame number, 1-7 then wrapping to 0
 *   C1C2 checksum: sum of every byte after STX through ETX/ETB inclusive,
 *        modulo 256, as two uppercase hex digits
 *
 * ── Frame layout, "bare" mode (what the Maglumi 800 actually does) ───────────
 * The Snibe manual (Maglumi 800 Operating Instructions, 16.2/16.3/16.6) documents
 * a stripped-down link layer: NO frame number, NO checksum, NO CR LF after the
 * terminator, and every control byte individually acknowledged — including the
 * EOT, which textbook ASTM never acknowledges:
 *
 *   → ENQ            ← ACK
 *   → STX            ← ACK        the STX travels ALONE, and stalls until ACKed
 *   → H…<CR>P…<CR>L|1|N<CR>       the whole record block, one ACK for the lot
 *                    ← ACK
 *   → ETX            ← ACK
 *   → EOT            ← ACK
 *
 * Both dialects live here because the manual is a manual: firmware in the field
 * may well send textbook frames instead, and a bridge that only understands one
 * of the two looks, from the bench, exactly like a broken cable.
 *
 * ── Records (E1394), '|' delimited, <CR> terminated ───────────────────────────
 *   H header   P patient   O order   Q query   R result   C comment   L terminator
 *
 * Field numbering below follows the manual's tables, which are 1-based and count
 * the record type as field 1. Our arrays are 0-based, so manual field N lives at
 * index N-1. Getting this wrong is silent — every identity reads one field early
 * — so each mapping is spelled out against the manual's own example.
 * ============================================================================
 */

export const ENQ = 0x05;
export const ACK = 0x06;
export const NAK = 0x15;
export const STX = 0x02;
export const ETX = 0x03;
export const ETB = 0x17;
export const EOT = 0x04;
export const CR = 0x0d;
export const LF = 0x0a;

const utf8Strict = new TextDecoder('utf-8', { fatal: true });

/**
 * Decode record bytes to text without mangling units.
 *
 * This is not fussiness. The manual's own result example is
 * `R|1|^^^TSH|4.3|μIU/mL|0.3 to 4.5|N|…` — the unit carries a micro sign, and
 * decoding as ASCII strips the high bit, so 0xB5 ('µ' in the Windows code page
 * the analyzer PC runs) silently becomes '5' and the unit reads "5IU/mL". A
 * wrong unit on a thyroid result is a clinical problem, not a cosmetic one.
 *
 * UTF-8 is tried first and Latin-1 is the fallback, because Latin-1 can decode
 * any byte sequence and would therefore never reject a UTF-8 one.
 *
 * @param {Buffer|Uint8Array} bytes
 * @returns {string}
 */
export function decodeAstm(bytes) {
  const buf = Buffer.from(bytes);
  try {
    return utf8Strict.decode(buf);
  } catch {
    return buf.toString('latin1');
  }
}

/**
 * ASTM checksum: sum of bytes after STX up to and including the terminator
 * (ETX or ETB), modulo 256, rendered as two uppercase hex characters.
 *
 * @param {Buffer|number[]} bytes  frame content beginning at the frame number
 *                                 and ending with ETX/ETB
 * @returns {string} two uppercase hex digits
 */
export function checksum(bytes) {
  let sum = 0;
  for (const b of bytes) sum = (sum + b) & 0xff;
  return sum.toString(16).toUpperCase().padStart(2, '0');
}

/**
 * Wrap one record's text into a complete ASTM frame.
 *
 * @param {number} frameNumber 0-7
 * @param {string} text        the record, without any framing
 * @param {boolean} isLast     final frame (ETX) or intermediate (ETB)
 * @returns {Buffer}
 */
export function buildFrame(frameNumber, text, isLast = true) {
  const terminator = isLast ? ETX : ETB;
  // latin1, not ascii: a patient name with an accent must not have its high bit
  // stripped, and one byte per character keeps the checksum arithmetic honest.
  const body = Buffer.concat([
    Buffer.from(String(frameNumber % 8), 'ascii'),
    Buffer.from(text, 'latin1'),
    Buffer.from([terminator]),
  ]);
  return Buffer.concat([
    Buffer.from([STX]),
    body,
    Buffer.from(checksum(body), 'ascii'),
    Buffer.from([CR, LF]),
  ]);
}

/**
 * Verify and unwrap a received frame.
 *
 * @param {Buffer} frame including STX and the trailing CR LF
 * @returns {{ok: boolean, frameNumber: number|null, text: string,
 *            isLast: boolean, expected?: string, actual?: string, reason?: string}}
 */
export function parseFrame(frame) {
  if (!frame.length || frame[0] !== STX) {
    return { ok: false, frameNumber: null, text: '', isLast: true, reason: 'missing STX' };
  }

  const endIndex = frame.findIndex((b, i) => i > 0 && (b === ETX || b === ETB));
  if (endIndex === -1) {
    return { ok: false, frameNumber: null, text: '', isLast: true, reason: 'missing ETX/ETB' };
  }

  const isLast = frame[endIndex] === ETX;
  const body = frame.subarray(1, endIndex + 1);          // FN … terminator
  const expected = checksum(body);
  const actual = frame.subarray(endIndex + 1, endIndex + 3).toString('ascii').toUpperCase();

  const frameNumber = Number(String.fromCharCode(frame[1]));
  const text = decodeAstm(frame.subarray(2, endIndex));

  if (actual && actual !== expected) {
    return { ok: false, frameNumber, text, isLast, expected, actual, reason: 'checksum mismatch' };
  }
  return { ok: true, frameNumber, text, isLast, expected, actual };
}

/**
 * Split a record into fields. Empty trailing fields are preserved because ASTM
 * position is significant — trimming them would shift every later field.
 */
export function fields(record) {
  return String(record).split('|');
}

/** Split an ASTM component field ("^^^TSH" -> ['','','','TSH']). */
export function components(field) {
  return String(field ?? '').split('^');
}

/**
 * Classify and shallow-parse one record by its type letter.
 * Field positions follow E1394; index 0 is the record type itself.
 */
export function parseRecord(record) {
  const f = fields(record);
  const type = (f[0] || '').charAt(0).toUpperCase();

  switch (type) {
    case 'H':
      // Manual 16.5.1, table 16.5-2, and its literal example:
      //
      //   H|\^&||PSWD|Maglumi 800|||||Lis||P|E1394-97|20100323
      //   0  1  2   3      4       5-8   9  10 11 12      13     ← our indices
      //   1  2  3   4      5            10  11 12 13      14     ← manual fields
      //
      //   field 4  password          index 3
      //   field 5  name of sender    index 4
      //   field 10 name of receiver  index 9
      //   field 12 processing mode   index 11
      //   field 13 protocol version  index 12
      //   field 14 date              index 13
      //
      // An earlier revision read sender/receiver from indices 3/4, i.e. it
      // reported the password as the sender. Nothing branched on those values so
      // it never showed up as a fault, but it made the logs lie. The `|| f[3]`
      // fallback keeps records produced by that revision readable.
      return {
        type,
        password: f[3] || null,
        sender: f[4] || f[3] || null,
        receiver: f[9] || null,
        processingId: f[11] || null,
        version: f[12] || null,
        timestamp: f[13] || null,
        raw: record,
      };
    case 'P':
      return {
        type,
        seq: f[1] || null,
        patientId: f[2] || f[3] || null,
        name: f[5] || null,
        birthDate: f[7] || null,
        sex: f[8] || null,
        raw: record,
      };
    case 'O': {
      // Manual 16.5.3:  O|1|1234567||^^^TSH|R
      // field 3 (index 2) sample no., field 5 (index 4) assays with a mandatory
      // '^^^' prefix, field 6 (index 5) priority: S urgent, R routine.
      const tests = components(f[4]).filter(Boolean);
      return {
        type,
        seq: f[1] || null,
        specimenId: (f[2] || '').trim() || null,
        tests,
        priority: f[5] || null,
        actionCode: f[11] || null,
        raw: record,
      };
    }
    case 'Q': {
      // Manual 16.5.5:  Q|1|^1234567||ALL||||||||O
      // field 3 (index 2) sample no., leading '^' required by the manual, so the
      // id is the second component. field 5 (index 4) is the assay selector,
      // 'ALL' meaning "everything ordered for this sample".
      const parts = components(f[2]);
      const specimenId = (parts[1] || parts[0] || '').trim() || null;
      return { type, seq: f[1] || null, specimenId, testId: (f[4] || '').trim() || null, raw: record };
    }
    case 'R': {
      // Manual 16.5.4:  R|1|^^^TSH|4.3|μIU/mL|0.3 to 4.5|N||||||20100326172956
      // field 3 test (^^^ prefix), 4 value, 5 unit, 6 reference range,
      // 7 flag (L/H/N), 13 finish time YYYYMMDDHHMMSS → index 12.
      const testParts = components(f[2]);
      return {
        type,
        seq: f[1] || null,
        testCode: (testParts[3] || testParts[testParts.length - 1] || '').trim() || null,
        value: (f[3] || '').trim(),
        unit: (f[4] || '').trim(),
        referenceRange: (f[5] || '').trim(),
        flag: (f[6] || '').trim(),
        status: (f[8] || '').trim(),
        completedAt: (f[12] || '').trim(),
        raw: record,
      };
    }
    case 'C':
      return { type, seq: f[1] || null, text: f[3] || '', raw: record };
    case 'L':
      return { type, seq: f[1] || null, terminationCode: f[2] || null, raw: record };
    default:
      return { type: type || '?', raw: record };
  }
}

/** ASTM timestamp: YYYYMMDDHHMMSS in local time. */
export function astmTimestamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
         `${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

/**
 * Build a message header in the layout the manual documents.
 *
 * Result:  H|\^&|||<sender>|||||<receiver>||P|E1394-97|<timestamp>
 *
 * Sender lands in field 5 and receiver in field 10, per table 16.5-2. The
 * password field (4) is left empty; the manual shows 'PSWD' there but marks the
 * field optional, and the instrument's [Online] screen has no password box to
 * agree with.
 *
 * One ambiguity to know about: the manual prints the same header line for both
 * directions of the conversation, with the analyzer name in field 5 even when
 * the LIS is the one talking. That is a copy-paste slip in the document rather
 * than a rule, so we do the protocol-correct thing and put ourselves in field 5
 * when we transmit. If a download is ever ignored by the instrument, swapping
 * MAGLUMI_ASTM_ID and LIS_ASTM_ID is the first experiment to run.
 */
function buildHeader(senderId, receiverId) {
  return `H|\\^&|||${senderId}|||||${receiverId}||P|E1394-97|${astmTimestamp()}`;
}

/**
 * Build the order-download reply to a query: H, P, O per test, then L.
 *
 * The Maglumi asks "what is ordered for this specimen?" and expects the tests
 * back as order records. Returned as an array of record strings, ready to be
 * framed one per frame (framed mode) or joined with CR (bare mode).
 *
 * Records are kept to the fields the manual lists. An earlier revision padded
 * each O record out to ~27 fields to park an action code at the end; that code
 * landed nowhere the manual defines, and the manual is explicit that only the
 * listed fields are needed, so the padding is gone.
 *
 * @param {object} opts
 * @param {string} opts.specimenId
 * @param {Array<{code: string}>|string[]} opts.tests
 * @param {object} [opts.patient]  { id, name, sex, birthDate }
 * @param {string} [opts.senderId] our LIS id — the instrument's "Host ID"
 * @param {string} [opts.receiverId] the analyzer id — its "Analyzer ID"
 */
export function buildOrderDownload({ specimenId, tests, patient = {}, senderId = 'LIS', receiverId = 'MAGLUMI' }) {
  const records = [buildHeader(senderId, receiverId)];

  // Manual 16.5.2: only fields 1 and 2 are required, and "P|1" is the form the
  // software normally uses. Name (field 6) and sex (field 9) are sent when known
  // so the bench can eyeball whose sample the instrument is about to run.
  records.push(
    patient.name || patient.sex || patient.id
      ? ['P', '1', patient.id || '', '', '', patient.name || '', '', patient.birthDate || '', patient.sex || ''].join('|')
      : 'P|1'
  );

  const list = (tests || []).map((t) => (typeof t === 'string' ? t : t.code)).filter(Boolean);
  list.forEach((code, i) => {
    // Manual 16.5.3: O|1|1234567||^^^TSH|R — R = routine priority.
    records.push(`O|${i + 1}|${specimenId}||^^^${code}|R`);
  });

  records.push('L|1|N');
  return records;
}

/**
 * Build the "nothing is ordered for that sample" reply.
 *
 * The manual documents no such case, which leaves two options: stay silent, or
 * answer with a well-formed message carrying no O records. Silence is the worse
 * one — 16.6.1 warns that a missing ACK makes the software consider the LIS
 * disconnected, and an unanswered query is the same class of problem. So we
 * answer H, P, L and let the instrument decide what to do with a sample it has
 * no assays for.
 *
 * Marked UNVERIFIED deliberately: whether the instrument treats an empty
 * download as "skip this tube" or reports a download error is not documented,
 * and needs one tube on the bench to settle.
 */
export function buildNoOrderReply({ senderId = 'LIS', receiverId = 'MAGLUMI' } = {}) {
  return [buildHeader(senderId, receiverId), 'P|1', 'L|1|N'];
}

/**
 * Join records into the single CR-terminated block that bare mode sends between
 * STX and ETX (manual 16.6). Each record ends with CR, the last one included —
 * the manual is emphatic that the terminator belongs on every record.
 *
 * @param {string[]} records
 * @returns {Buffer}
 */
export function buildRecordBlock(records) {
  return Buffer.from(records.map((r) => `${r}\r`).join(''), 'latin1');
}
