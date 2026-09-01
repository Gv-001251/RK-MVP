/**
 * HL7 v2 support for TCP analyzers (Afinion 2, Maglumi 800, Wondfo, Finecare…).
 *
 * ── Why this file grew ──────────────────────────────────────────────────────
 * It started as MLLP-only. Two things from the vendor material forced it wider:
 *
 *   1. Framing is not always MLLP. The Maglumi's LIS module ships
 *      SnibeLisSocket4C.dll, which is HP-Socket — a library whose PACK model
 *      prefixes each body with a 4-byte big-endian header instead of wrapping it
 *      in <VT>…<FS><CR>. Some builds also just write bare `MSH|…` down the
 *      socket. We detect which of the three we are being sent rather than
 *      assuming, and we only commit to a mode once a real MSH has come out of it.
 *
 *   2. The field layout is more specific than "OBX-5 is the value". Snibe's
 *      DllHL7Analysis.dll builds OBX as
 *
 *          OBX|{n}||{code}||{value}^|{unit}|{ref}|{flag}|||F|||{obsTime}||||{equipId}|{analysisTime}
 *
 *      Note the trailing `^` on the value: read naively, an HbA1c of 5.1 arrives
 *      as the string "5.1^". Note also that the result's own timestamp is in
 *      OBX-14, which matters here because the instruments on site have wrong
 *      clocks and we want to record what they claimed, not just when we received it.
 *
 * MSH from the same source is
 *
 *     MSH|^~\&|{sendApp}||{recvApp}||{ts}||{type}|{ctrlId}|P|{ver}|||NE|NE||UTF-8
 *
 * MSH-15/16 = NE|NE, i.e. "do not acknowledge". So ACK stays opt-in per machine
 * (`"ack": true`), the same call we made for the Afinion: the Hemat 60 wants
 * silence on its link, and answering an analyzer that did not ask can reset it.
 */

const VT = 0x0b; // MLLP start block
const FS = 0x1c; // MLLP end block
const CR = 0x0d;

export const FRAMING = { MLLP: 'mllp', PACK: 'pack', BARE: 'bare', AUTO: 'auto' };

/** HP-Socket PACK: 4-byte BE header, flag in the top 10 bits, length in the low 22. */
const PACK_HEADER_BYTES = 4;
const PACK_LENGTH_MASK = 0x3fffff;
/** Refuse absurd declared lengths; a result message is kilobytes, not megabytes. */
const PACK_MAX_BODY = 4 * 1024 * 1024;

/** A bare (unframed) message is terminated by silence, since nothing delimits it. */
const BARE_IDLE_MS = 500;

/** Does this text look like a real HL7 message rather than noise? */
function looksLikeHl7(text) {
  return /(^|[\r\n])MSH\|/.test(text);
}

/**
 * Decode message bytes to text.
 *
 * Snibe declares UTF-8 in MSH-18, so decoding everything as latin1 (as this
 * module used to) mangles any non-ASCII unit or patient name — "µIU/mL" arrives
 * as "ÂµIU/mL". Try UTF-8 first and fall back to latin1 only when the bytes are
 * not valid UTF-8, which is what an analyzer sending raw 8-bit text produces.
 */
function decodeMessage(buf) {
  const utf8 = buf.toString('utf8');
  return utf8.includes('\uFFFD') ? buf.toString('latin1') : utf8;
}

/**
 * Receiver that de-frames HL7 off a byte stream, figuring out the framing in use.
 *
 * Same shape as the old MllpReceiver — construct with { write, onMessage, onLog }
 * and push bytes at feed() — so transports need no changes.
 *
 *   framing  'auto' (default) | 'mllp' | 'pack' | 'bare'
 *   ack      when true, reply with an HL7 ACK after each message we accept
 */
export class Hl7Receiver {
  constructor({ write, onMessage, onLog, framing = FRAMING.AUTO, ack = false } = {}) {
    this.write = write || (() => {});
    this.onMessage = onMessage || (() => {});
    this.onLog = onLog || (() => {});
    this.mode = (framing || FRAMING.AUTO).toLowerCase();
    this.locked = this.mode !== FRAMING.AUTO; // did the caller pin the framing?
    this.ack = !!ack;
    this.buf = Buffer.alloc(0);
    this.bareTimer = null;
  }

  feed(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : Buffer.from(chunk);
    this.#drain();
  }

  /** Pull every complete message currently sitting in the buffer. */
  #drain() {
    let progressed = true;
    while (progressed && this.buf.length) {
      progressed = false;
      const mode = this.locked ? this.mode : this.#sniff();
      if (mode === FRAMING.MLLP) progressed = this.#takeMllp();
      else if (mode === FRAMING.PACK) progressed = this.#takePack();
      else if (mode === FRAMING.BARE) progressed = this.#takeBare();
      else break; // undecidable so far — wait for more bytes
    }
    // Bare framing has no terminator, so a tail that stops arriving is the message.
    if (!this.locked || this.mode === FRAMING.BARE) this.#armBareFlush();
  }

  /**
   * Guess the framing from what is in the buffer. Deliberately conservative:
   * returns null (meaning "not yet") rather than guessing wrong, because
   * committing to the wrong framing corrupts every later message on the link.
   */
  #sniff() {
    if (this.buf[0] === VT) return FRAMING.MLLP;
    if (this.buf.length >= 3 && this.buf.subarray(0, 3).toString('latin1') === 'MSH') return FRAMING.BARE;
    if (this.buf.length >= PACK_HEADER_BYTES) {
      const declared = this.buf.readUInt32BE(0) & PACK_LENGTH_MASK;
      if (declared > 0 && declared <= PACK_MAX_BODY) {
        // Only believe it if the body really does start with MSH.
        const start = PACK_HEADER_BYTES;
        if (this.buf.length >= start + 3) {
          return this.buf.subarray(start, start + 3).toString('latin1') === 'MSH'
            ? FRAMING.PACK
            : FRAMING.BARE; // header hypothesis failed; treat as unframed text
        }
        return null; // not enough body yet to confirm
      }
      return FRAMING.BARE;
    }
    return null;
  }

  #lock(mode) {
    if (this.locked) return;
    this.mode = mode;
    this.locked = true;
    this.onLog(`HL7 framing detected: ${mode}`);
  }

  #takeMllp() {
    const start = this.buf.indexOf(VT);
    if (start === -1) { this.buf = Buffer.alloc(0); return false; }
    const end = this.buf.indexOf(FS, start + 1);
    if (end === -1) return false; // message still arriving
    const body = this.buf.subarray(start + 1, end);
    // Skip the <CR> that follows <FS> when present.
    let next = end + 1;
    if (this.buf[next] === CR) next += 1;
    this.buf = this.buf.subarray(next);
    this.#lock(FRAMING.MLLP);
    this.#emit(body);
    return true;
  }

  #takePack() {
    if (this.buf.length < PACK_HEADER_BYTES) return false;
    const declared = this.buf.readUInt32BE(0) & PACK_LENGTH_MASK;
    if (declared <= 0 || declared > PACK_MAX_BODY) {
      // Not a header after all. Drop a byte and let the sniffer try again.
      this.buf = this.buf.subarray(1);
      return true;
    }
    if (this.buf.length < PACK_HEADER_BYTES + declared) return false;
    const body = this.buf.subarray(PACK_HEADER_BYTES, PACK_HEADER_BYTES + declared);
    this.buf = this.buf.subarray(PACK_HEADER_BYTES + declared);
    this.#lock(FRAMING.PACK);
    this.#emit(body);
    return true;
  }

  /**
   * Unframed stream. A following `MSH|` marks the end of the previous message;
   * the last one is flushed by #armBareFlush when the link goes quiet.
   */
  #takeBare() {
    // latin1 is a 1:1 byte↔char mapping, so an index found in this view is also
    // the correct byte offset to slice the Buffer at — safe for UTF-8 payloads.
    const view = this.buf.toString('latin1');
    const next = view.search(/[\r\n]MSH\|/);
    if (next === -1) return false;
    const body = this.buf.subarray(0, next + 1);
    this.buf = this.buf.subarray(next + 1);
    this.#lock(FRAMING.BARE);
    this.#emit(body);
    return true;
  }

  #armBareFlush() {
    if (this.bareTimer) clearTimeout(this.bareTimer);
    if (!this.buf.length) return;
    this.bareTimer = setTimeout(() => {
      this.bareTimer = null;
      if (!this.buf.length) return;
      if (!looksLikeHl7(this.buf.toString('latin1'))) return; // partial frame or junk — leave it
      const body = this.buf;
      this.buf = Buffer.alloc(0);
      this.#lock(FRAMING.BARE);
      this.#emit(body);
    }, BARE_IDLE_MS);
    if (typeof this.bareTimer.unref === 'function') this.bareTimer.unref();
  }

  #emit(body) {
    const text = Buffer.isBuffer(body) ? decodeMessage(body) : String(body);
    if (!text || !text.trim()) return;
    this.onLog('rx HL7 message');
    if (this.ack) {
      try {
        this.write(frameOutbound(buildHl7Ack(text), this.mode));
        this.onLog('tx ACK');
      } catch (e) {
        this.onLog(`ACK write failed: ${e.message}`);
      }
    }
    this.onMessage(text);
  }

  /** Release the idle timer so a closing socket does not hold the loop open. */
  dispose() {
    if (this.bareTimer) { clearTimeout(this.bareTimer); this.bareTimer = null; }
  }
}

/** Kept so existing imports keep working; the class now auto-detects framing. */
export { Hl7Receiver as MllpReceiver };

/** Wrap an outbound message in the framing the analyzer is using. */
export function frameOutbound(text, mode = FRAMING.MLLP) {
  const body = Buffer.from(text, 'utf8');
  if (mode === FRAMING.PACK) {
    const head = Buffer.alloc(PACK_HEADER_BYTES);
    head.writeUInt32BE(body.length & PACK_LENGTH_MASK, 0);
    return Buffer.concat([head, body]);
  }
  if (mode === FRAMING.BARE) return body;
  return Buffer.concat([Buffer.from([VT]), body, Buffer.from([FS, CR])]);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Parsing
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Undo HL7's escape sequences inside a field value. */
function unescape(value, enc) {
  const [comp = '^', rep = '~', esc = '\\', sub = '&'] = enc;
  if (!value.includes(esc)) return value;
  return value.replace(new RegExp(`\\${esc}([FSTRE])\\${esc}`, 'g'), (_, code) => ({
    F: '|', S: comp, T: sub, R: rep, E: esc,
  }[code] ?? ''));
}

/**
 * Collapse a componentised field to a usable scalar.
 *
 * Snibe sends the result as `{value}^` — one real component and one empty one.
 * Dropping trailing empties turns "5.1^" into "5.1" while leaving genuinely
 * structured values such as ">^100" intact.
 */
function scalar(field, compSep) {
  if (!field) return '';
  const parts = String(field).split(compSep);
  while (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
  return (parts.length === 1 ? parts[0] : parts.join(compSep)).trim();
}

/** First non-empty component, for identifier fields like SPM-2 or OBX-3. */
function firstComponent(field, compSep) {
  if (!field) return '';
  return (String(field).split(compSep).find((c) => c && c.trim()) || '').trim();
}

/** HL7 timestamp (YYYYMMDDHHMMSS[.S…][±ZZZZ]) → ISO-ish string, or null. */
export function parseHl7Timestamp(raw) {
  const s = String(raw || '').trim();
  const m = /^(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/.exec(s);
  if (!m) return null;
  const [, y, mo = '01', d = '01', h = '00', mi = '00', se = '00'] = m;
  return `${y}-${mo}-${d} ${h}:${mi}:${se}`;
}

/**
 * Parse an HL7 v2 message.
 *
 * Returns the original contract — { specimenId, patientName, tests[], raw } —
 * plus message and per-result metadata that the older parser threw away:
 *
 *   message   sendingApp / receivingApp / type / controlId / version / ackRequested
 *   patient   patientId / sex / dob
 *   tests[]   code value unit refRange flag status observedAt analysedAt equipmentId
 *   comments  NTE text
 */
export function parseHl7(text) {
  const segments = String(text).split(/[\r\n]+/).map((s) => s.trim()).filter(Boolean);
  const out = {
    specimenId: null,
    patientName: null,
    patientId: null,
    sex: null,
    dob: null,
    specimenType: null,
    collectedAt: null,
    tests: [],
    comments: [],
    message: {
      sendingApp: null, receivingApp: null, type: null,
      controlId: null, version: null, ackRequested: false,
    },
    raw: text,
  };

  let fieldSep = '|';
  let enc = ['^', '~', '\\', '&'];
  let compSep = '^';

  for (const seg of segments) {
    const type = seg.slice(0, 3).toUpperCase();

    if (type === 'MSH') {
      fieldSep = seg.charAt(3) || '|';
      const f = seg.split(fieldSep);
      const encField = f[1] || '^~\\&';
      enc = [encField.charAt(0) || '^', encField.charAt(1) || '~', encField.charAt(2) || '\\', encField.charAt(3) || '&'];
      compSep = enc[0];
      out.message.sendingApp = firstComponent(f[2], compSep) || null;
      out.message.receivingApp = firstComponent(f[4], compSep) || null;
      out.message.type = (f[8] || '').trim() || null;
      out.message.controlId = (f[9] || '').trim() || null;
      out.message.version = firstComponent(f[11], compSep) || null;
      // MSH-15 accept-ack / MSH-16 application-ack. NE = never, AL/SU/ER = wants one.
      const acceptAck = (f[14] || '').trim().toUpperCase();
      const appAck = (f[15] || '').trim().toUpperCase();
      out.message.ackRequested = /^(AL|ER|SU)$/.test(acceptAck) || /^(AL|ER|SU)$/.test(appAck);
      continue;
    }

    const f = seg.split(fieldSep);

    if (type === 'PID') {
      const name = (f[5] || '').split(compSep).filter(Boolean).map((p) => unescape(p, enc)).join(' ').trim();
      if (name) out.patientName = name;
      const pid = firstComponent(f[3], compSep);
      if (pid) out.patientId = pid;
      const dob = parseHl7Timestamp(firstComponent(f[7], compSep));
      if (dob) out.dob = dob;
      const sex = (f[8] || '').trim();
      if (sex) out.sex = sex;
    } else if (type === 'SPM') {
      const sid = firstComponent(f[2], compSep);
      if (sid) out.specimenId = sid;
      const stype = firstComponent(f[4], compSep);
      if (stype) out.specimenType = stype;
    } else if (type === 'OBR') {
      if (!out.specimenId) {
        const sid = firstComponent(f[3], compSep) || firstComponent(f[2], compSep);
        if (sid) out.specimenId = sid;
      }
      const drawn = parseHl7Timestamp(firstComponent(f[7], compSep));
      if (drawn && !out.collectedAt) out.collectedAt = drawn;
    } else if (type === 'OBX') {
      const code = firstComponent(f[3], compSep);
      if (!code) continue;
      out.tests.push({
        code: unescape(code, enc),
        value: unescape(scalar(f[5], compSep), enc),
        unit: scalar(f[6], compSep),
        refRange: (f[7] || '').trim(),
        flag: (f[8] || '').trim(),
        status: (f[11] || '').trim(),          // OBX-11, F = final
        observedAt: parseHl7Timestamp(f[14]),  // OBX-14, the instrument's own stamp
        equipmentId: firstComponent(f[18], compSep) || null, // OBX-18
        analysedAt: parseHl7Timestamp(f[19]),  // OBX-19
      });
    } else if (type === 'NTE') {
      const note = unescape((f[3] || '').trim(), enc);
      if (note) out.comments.push(note);
    }
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ACK
 * ═══════════════════════════════════════════════════════════════════════════ */

/** HL7 timestamp for now, in the local zone the analyzer expects. */
function stampNow(d = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
    + `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * Build an ACK for a received message, echoing its control ID in MSA-2 and
 * swapping the application fields around. MSA-1 is AA (application accept);
 * enhanced-mode senders that insist on commit-accept want CA instead, which is
 * what `code` is for.
 */
export function buildHl7Ack(received, { code = 'AA', text = '' } = {}) {
  const parsed = parseHl7(received);
  const { sendingApp, receivingApp, type, controlId, version } = parsed.message;
  const trigger = (type || '').split('^')[1] || '';
  const ackType = trigger ? `ACK^${trigger}` : 'ACK';
  const segments = [
    `MSH|^~\\&|${receivingApp || 'RK_LIS'}||${sendingApp || ''}||${stampNow()}||${ackType}`
      + `|${controlId || stampNow()}|P|${version || '2.4'}`,
    `MSA|${code}|${controlId || ''}${text ? `|${text}` : ''}`,
  ];
  return `${segments.join('\r')}\r`;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Host query — order download
 *
 * The other half of a bidirectional link, and the piece the vendor's own LIS
 * does that ours did not: the analyzer reads a barcode, asks the LIS what to run
 * on that tube, and starts only the ordered assays. Without it every sample has
 * to be programmed by hand at the instrument, and a tube whose worklist nobody
 * typed in simply does not get tested.
 *
 * Snibe's DllHL7Analysis.dll carries QPD and RCP builders:
 *
 *     QPD|{0}||{1}^{2}|{3}{4}
 *     RCP|1||R|{0}
 *
 * QPD and RCP belong to QBP^Q11 in HL7 v2.4, so that is the dialect implemented
 * here, answered with RSP^K11. The older QRY^Q02 form uses QRD/QRF instead and
 * is deliberately NOT guessed at — it is detected and reported so the raw
 * message can be read, because shipping an unverified second dialect would just
 * fail in a harder-to-diagnose way.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Message types that are asking us a question rather than telling us a result. */
const QUERY_TYPES = /^(QBP|QRY|QCK)\b/i;

/**
 * Recognise a query and pull the specimen out of it.
 *
 * The specimen is looked for in several places because the field it lands in
 * varies by dialect: QPD-3 is where QBP^Q11 puts it, but instruments have been
 * seen putting it in SPM-2 or OBR-3, and QRY^Q02 uses QRD-8.
 */
export function detectHl7Query(text) {
  const parsed = parseHl7(text);
  const type = parsed.message.type || '';
  const none = { isQuery: false, specimenId: null };
  if (!QUERY_TYPES.test(type)) return none;

  const segments = String(text).split(/[\r\n]+/).map((s) => s.trim()).filter(Boolean);
  const fieldSep = (segments.find((s) => s.startsWith('MSH')) || 'MSH|').charAt(3) || '|';
  const seg = (name) => {
    const line = segments.find((l) => l.toUpperCase().startsWith(`${name}${fieldSep}`));
    return line ? line.split(fieldSep) : null;
  };
  const comp = (v) => (v ? String(v).split('^').find((c) => c && c.trim()) || '' : '').trim();

  const qpd = seg('QPD');
  const qrd = seg('QRD');
  const spm = seg('SPM');
  const obr = seg('OBR');

  const specimenId =
    comp(qpd?.[3]) ||        // QBP^Q11: QPD-3
    comp(qrd?.[8]) ||        // QRY^Q02: QRD-8
    parsed.specimenId ||     // SPM-2 / OBR-3 via the normal parser
    comp(spm?.[2]) ||
    comp(obr?.[3]) ||
    null;

  return {
    isQuery: true,
    specimenId,
    messageType: type,
    // Echoed back in QAK-1 and QPD-2 so the analyzer can pair reply to request.
    queryTag: (qpd?.[2] || '').trim() || null,
    queryName: (qpd?.[1] || '').trim() || 'WOS^Work Order Segment',
    controlId: parsed.message.controlId,
    sendingApp: parsed.message.sendingApp,
    receivingApp: parsed.message.receivingApp,
    version: parsed.message.version || '2.4',
    // QBP is the dialect we answer; anything else is recognised but not answered.
    supported: /^QBP/i.test(type),
  };
}

/**
 * Build the RSP^K11 answer to a QBP^Q11 work-order query.
 *
 * QAK-2 is the field that matters most to the instrument: OK means "here is the
 * worklist", NF means "no order for this tube". Returning NF explicitly is what
 * stops the analyzer waiting on a reply that never comes, so an unmatched
 * barcode is answered rather than ignored.
 */
export function buildHl7OrderResponse(query, order = {}) {
  const {
    queryTag, queryName, controlId, sendingApp, version,
  } = query || {};
  const tests = Array.isArray(order.tests) ? order.tests : [];
  const found = tests.length > 0;
  const specimenId = order.specimenId || query?.specimenId || '';
  const stamp = stampNow();

  const segments = [
    `MSH|^~\\&|RK_LIS||${sendingApp || ''}||${stamp}||RSP^K11|${stamp}|P|${version || '2.4'}`,
    `MSA|AA|${controlId || ''}`,
    `QAK|${queryTag || ''}|${found ? 'OK' : 'NF'}|${queryName || ''}`,
    `QPD|${queryName || ''}|${queryTag || ''}|${specimenId}`,
  ];

  if (found) {
    // Patient identity is optional in a work-order reply, but sending it means
    // the result that comes back carries the name the LIS already knows rather
    // than whatever was typed at the instrument.
    const nameComponents = String(order.patientName || '').trim().replace(/\s+/g, '^');
    if (order.patientId || nameComponents) {
      segments.push(`PID|1||${order.patientId || ''}||${nameComponents}|||${order.sex || ''}`);
    }
    segments.push(`SPM|1|${specimenId}||${order.specimenType || ''}`);

    let n = 1;
    for (const t of tests) {
      const code = (t && (t.code || t.name)) || '';
      if (!code) continue;
      const label = (t && t.name && t.name !== code) ? t.name : '';
      // ORC-1 = NW (new order); OBR-4 carries the assay the analyzer should run.
      segments.push(`ORC|NW|${specimenId}`);
      segments.push(`OBR|${n}|${specimenId}||${code}${label ? `^${label}` : ''}`
        + `|${order.priority === 'urgent' || order.priority === 'STAT' ? 'S' : 'R'}`);
      n += 1;
    }
  }

  return `${segments.join('\r')}\r`;
}
