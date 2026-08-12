/**
 * HL7 v2 over MLLP support (common on POCT analyzers: Afinion, Wondfo,
 * Finecare, etc.).
 *
 * MllpReceiver extracts messages framed as <VT> ...hl7... <FS><CR>.
 * parseHl7 pulls the specimen/barcode, patient name and OBX results out.
 */

const VT = 0x0b; // start block
const FS = 0x1c; // end block

export class MllpReceiver {
  constructor({ write, onMessage, onLog } = {}) {
    this.write = write || (() => {});
    this.onMessage = onMessage || (() => {});
    this.onLog = onLog || (() => {});
    this.buf = [];
    this.inMsg = false;
  }

  feed(buffer) {
    for (const b of buffer) {
      if (b === VT) { this.inMsg = true; this.buf = []; continue; }
      if (this.inMsg && b === FS) {
        const text = Buffer.from(this.buf).toString('latin1');
        this.inMsg = false; this.buf = [];
        if (text.trim()) this.onMessage(text);
        this.onLog('rx HL7 message');
        continue;
      }
      if (this.inMsg) this.buf.push(b);
    }
  }
}

/**
 * Parse an HL7 v2 message into { specimenId, patientName, tests[] }.
 *   MSH  → field/component separators
 *   PID-5 → patient name
 *   SPM-2 / OBR-3 / OBR-2 → specimen (barcode) ID
 *   OBX  → results (OBX-3 code, OBX-5 value, OBX-6 units, OBX-7 ref, OBX-8 flag)
 */
export function parseHl7(text) {
  const segments = String(text).split(/[\r\n]+/).map(s => s.trim()).filter(Boolean);
  const out = { specimenId: null, patientName: null, tests: [], raw: text };

  let fieldSep = '|';
  let compSep = '^';

  for (const seg of segments) {
    const type = seg.slice(0, 3).toUpperCase();

    if (type === 'MSH') {
      fieldSep = seg.charAt(3) || '|';
      const enc = seg.split(fieldSep)[1] || '^~\\&';
      compSep = enc.charAt(0) || '^';
      continue;
    }

    const f = seg.split(fieldSep);
    const firstComp = (v) => (v ? String(v).split(compSep).filter(Boolean)[0] || '' : '').trim();

    if (type === 'PID') {
      const name = (f[5] || '').split(compSep).filter(Boolean).join(' ').trim();
      if (name) out.patientName = name;
    } else if (type === 'SPM') {
      const sid = firstComp(f[2]);
      if (sid) out.specimenId = sid;
    } else if (type === 'OBR') {
      if (!out.specimenId) {
        const sid = firstComp(f[3]) || firstComp(f[2]);
        if (sid) out.specimenId = sid;
      }
    } else if (type === 'OBX') {
      const code = firstComp(f[3]);
      if (!code) continue;
      out.tests.push({
        code,
        value: (f[5] || '').trim(),
        unit: (f[6] || '').trim(),
        refRange: (f[7] || '').trim(),
        flag: (f[8] || '').trim(),
      });
    }
  }
  return out;
}
