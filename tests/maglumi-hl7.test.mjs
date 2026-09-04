/**
 * Maglumi 800 / Snibe HL7 tests.
 *
 * The message shapes here are not invented — they follow the format strings
 * lifted from the vendor's own SnibeLis/DllHL7Analysis.dll:
 *
 *   MSH|{0}|{1}||{2}||{3}||{4}|{5}|P|{6}|||NE|NE||UTF-8{7}
 *   PID|1||{0}||{1}||{2}|{3}||||||||||||||{4}||||||||||||||||{5}^{6}{7}
 *   SPM|1|{0}^{1}^{2}^{6}^{7}||{3}|||||||{4}{5}
 *   OBR|{0}|||{1}^{2}{3}
 *   OBX|{0}||{1}||{2}^|{3}|{4}|{5}|||F|||{6}||||{7}|{8}{9}
 *   NTE|{0}{1}
 *
 * The trailing `^` on the OBX value and the timestamp sitting in OBX-14 are the
 * two details that a generic parser gets wrong, so they are asserted explicitly.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  Hl7Receiver, parseHl7, buildHl7Ack, frameOutbound, parseHl7Timestamp, FRAMING,
  detectHl7Query, buildHl7OrderResponse,
} from '../tools/lis-bridge/lib/hl7.mjs';
import { resolveAssay, applyMaglumiAssayMap } from '../tools/lis-bridge/lib/maglumi-assays.mjs';
import {
  sniffProtocol, createConnectionHandler, parseMessage, detectQuery, buildOrderResponse,
} from '../tools/lis-bridge/lib/protocol.mjs';

const CR = '\r';

/** A two-result ORU^R01 in the vendor's exact field layout. */
const MAGLUMI_ORU = [
  'MSH|^~\\&|P1^Maglumi||RK_LIS||20260830143000||ORU^R01|MG0000123|P|2.4|||NE|NE||UTF-8',
  'PID|1||PT0001||DOE^JANE||19900115|F||||||||||||||||||||||||||||||',
  'SPM|1|SP2026001^^^SER^||SER|||||||',
  'OBR|1|||TSH^Thyroid Stimulating Hormone',
  'OBX|1||TSH||2.35^|\u00b5IU/mL|0.35-4.94|N|||F|||20260830142500||||MAG800-01|20260830142800',
  'OBX|2||25-OH-VD||18.7^|ng/mL|30-100|L|||F|||20260830142500||||MAG800-01|20260830142800',
  'NTE|1||Sample slightly haemolysed',
].join(CR) + CR;

const mllp = (text) => Buffer.concat([
  Buffer.from([0x0b]), Buffer.from(text, 'utf8'), Buffer.from([0x1c, 0x0d]),
]);

/** HP-Socket PACK framing: 4-byte big-endian length header, then the body. */
const pack = (text) => {
  const body = Buffer.from(text, 'utf8');
  const head = Buffer.alloc(4);
  head.writeUInt32BE(body.length, 0);
  return Buffer.concat([head, body]);
};

function collect(opts = {}) {
  const messages = [];
  const written = [];
  const rx = new Hl7Receiver({
    onMessage: (t) => messages.push(t),
    write: (b) => written.push(b),
    ...opts,
  });
  return { rx, messages, written };
}

describe('parseHl7 — Maglumi field layout', () => {
  const parsed = parseHl7(MAGLUMI_ORU);

  it('strips the empty trailing component the Maglumi appends to OBX-5', () => {
    // Read naively this is the string "2.35^", which no numeric range check survives.
    expect(parsed.tests[0].value).toBe('2.35');
    expect(parsed.tests[1].value).toBe('18.7');
  });

  it('reads specimen id from the composite SPM-2', () => {
    expect(parsed.specimenId).toBe('SP2026001');
    expect(parsed.specimenType).toBe('SER');
  });

  it('reads the patient block', () => {
    expect(parsed.patientName).toBe('DOE JANE');
    expect(parsed.patientId).toBe('PT0001');
    expect(parsed.sex).toBe('F');
    expect(parsed.dob).toBe('1990-01-15 00:00:00');
  });

  it('keeps unit, reference range and abnormal flag', () => {
    expect(parsed.tests[0].unit).toBe('\u00b5IU/mL');
    expect(parsed.tests[0].refRange).toBe('0.35-4.94');
    expect(parsed.tests[1].flag).toBe('L');
  });

  it('captures the instrument timestamps from OBX-14 and OBX-19', () => {
    // Worth having: the analyzers on site have wrong clocks, and this records
    // what the instrument claimed rather than only when we received it.
    expect(parsed.tests[0].observedAt).toBe('2026-08-30 14:25:00');
    expect(parsed.tests[0].analysedAt).toBe('2026-08-30 14:28:00');
    expect(parsed.tests[0].equipmentId).toBe('MAG800-01');
    expect(parsed.tests[0].status).toBe('F');
  });

  it('records message metadata and honours NE|NE as "no ack wanted"', () => {
    expect(parsed.message.sendingApp).toBe('P1');
    expect(parsed.message.type).toBe('ORU^R01');
    expect(parsed.message.controlId).toBe('MG0000123');
    expect(parsed.message.version).toBe('2.4');
    expect(parsed.message.ackRequested).toBe(false);
  });

  it('flags ackRequested when MSH-15 asks for one', () => {
    const wantsAck = MAGLUMI_ORU.replace('|||NE|NE||UTF-8', '|||AL|NE||UTF-8');
    expect(parseHl7(wantsAck).message.ackRequested).toBe(true);
  });

  it('collects NTE comments', () => {
    expect(parsed.comments).toEqual(['Sample slightly haemolysed']);
  });

  it('leaves genuinely componentised values alone', () => {
    const seg = 'OBX|1||CRP||>^100|mg/L|||||F';
    const msg = `MSH|^~\\&|P1^Maglumi||RK_LIS||20260830143000||ORU^R01|1|P|2.4${CR}${seg}${CR}`;
    expect(parseHl7(msg).tests[0].value).toBe('>^100');
  });
});

describe('Hl7Receiver — framing detection', () => {
  it('de-frames MLLP', () => {
    const { rx, messages } = collect();
    rx.feed(mllp(MAGLUMI_ORU));
    expect(messages).toHaveLength(1);
    expect(parseHl7(messages[0]).specimenId).toBe('SP2026001');
    expect(rx.mode).toBe(FRAMING.MLLP);
  });

  it('de-frames HP-Socket PACK, which is what SnibeLisSocket4C uses', () => {
    const { rx, messages } = collect();
    rx.feed(pack(MAGLUMI_ORU));
    expect(messages).toHaveLength(1);
    expect(rx.mode).toBe(FRAMING.PACK);
    expect(parseHl7(messages[0]).tests).toHaveLength(2);
  });

  it('reassembles a message split across TCP segments', () => {
    const { rx, messages } = collect();
    const framed = mllp(MAGLUMI_ORU);
    rx.feed(framed.subarray(0, 40));
    expect(messages).toHaveLength(0);
    rx.feed(framed.subarray(40));
    expect(messages).toHaveLength(1);
  });

  it('handles two messages arriving in one read', () => {
    const { rx, messages } = collect();
    rx.feed(Buffer.concat([mllp(MAGLUMI_ORU), mllp(MAGLUMI_ORU)]));
    expect(messages).toHaveLength(2);
  });

  it('flushes an unframed message once the link goes quiet', () => {
    vi.useFakeTimers();
    try {
      const { rx, messages } = collect();
      rx.feed(Buffer.from(MAGLUMI_ORU, 'utf8'));
      expect(messages).toHaveLength(0);   // nothing delimits it yet
      vi.advanceTimersByTime(600);
      expect(messages).toHaveLength(1);
      expect(rx.mode).toBe(FRAMING.BARE);
    } finally {
      vi.useRealTimers();
    }
  });

  it('splits back-to-back unframed messages on the next MSH', () => {
    const { rx, messages } = collect();
    rx.feed(Buffer.from(MAGLUMI_ORU + MAGLUMI_ORU, 'utf8'));
    expect(messages).toHaveLength(1); // the first; the tail waits for the idle flush
  });

  it('decodes UTF-8 as declared in MSH-18 rather than latin1', () => {
    const { rx, messages } = collect();
    rx.feed(mllp(MAGLUMI_ORU));
    expect(messages[0]).toContain('\u00b5IU/mL');
    expect(messages[0]).not.toContain('\u00c2\u00b5');
  });

  it('stays silent by default and ACKs only when asked', () => {
    const quiet = collect();
    quiet.rx.feed(mllp(MAGLUMI_ORU));
    expect(quiet.written).toHaveLength(0);

    const acking = collect({ ack: true });
    acking.rx.feed(mllp(MAGLUMI_ORU));
    expect(acking.written).toHaveLength(1);
    expect(acking.written[0][0]).toBe(0x0b); // framed the same way it arrived
  });
});

describe('buildHl7Ack', () => {
  const ack = buildHl7Ack(MAGLUMI_ORU);

  it('echoes the control id in MSA-2 and accepts with AA', () => {
    expect(ack).toContain('MSA|AA|MG0000123');
  });

  it('swaps the application fields and mirrors the trigger event', () => {
    const msh = ack.split(CR)[0].split('|');
    expect(msh[2]).toBe('RK_LIS'); // MSH-3 is now us
    expect(msh[4]).toBe('P1');     // MSH-5 is the analyzer
    expect(msh[8]).toBe('ACK^R01');
    expect(msh[11]).toBe('2.4');
  });

  it('can send CA instead, for senders that insist on commit-accept', () => {
    expect(buildHl7Ack(MAGLUMI_ORU, { code: 'CA' })).toContain('MSA|CA|');
  });
});

describe('frameOutbound', () => {
  it('wraps in MLLP by default', () => {
    const out = frameOutbound('MSH|test\r');
    expect(out[0]).toBe(0x0b);
    expect(out[out.length - 2]).toBe(0x1c);
    expect(out[out.length - 1]).toBe(0x0d);
  });

  it('prefixes a length header in PACK mode', () => {
    const out = frameOutbound('MSH|test\r', FRAMING.PACK);
    expect(out.readUInt32BE(0)).toBe(out.length - 4);
  });
});

describe('parseHl7Timestamp', () => {
  it('handles full and partial precision', () => {
    expect(parseHl7Timestamp('20260830142500')).toBe('2026-08-30 14:25:00');
    expect(parseHl7Timestamp('20260830')).toBe('2026-08-30 00:00:00');
    expect(parseHl7Timestamp('')).toBeNull();
    expect(parseHl7Timestamp(null)).toBeNull();
  });
});

describe('Maglumi assay map', () => {
  it('resolves codes regardless of punctuation or case', () => {
    expect(resolveAssay('25-OH-VD').catalogName).toBe('Vitamin D (25-OH)');
    expect(resolveAssay('25ohvd').catalogName).toBe('Vitamin D (25-OH)');
    expect(resolveAssay('tsh').catalogName).toBe('TSH');
    expect(resolveAssay('CA19-9').catalogName).toBe('CA 19-9');
  });

  it('folds the Greek beta used in hCG naming', () => {
    expect(resolveAssay('\u03b2-hCG').catalogName).toBe('Beta hCG');
    expect(resolveAssay('B-HCG').catalogName).toBe('Beta hCG');
  });

  it('renames mapped results and keeps the reported code for audit', () => {
    const [vd] = applyMaglumiAssayMap([{ code: '25-OH-VD', value: '18.7', unit: 'ng/mL' }]);
    expect(vd.code).toBe('Vitamin D (25-OH)');
    expect(vd.reportedCode).toBe('25-OH-VD');
    expect(vd.mapped).toBe(true);
  });

  it('prefers the unit the analyzer sent over the table', () => {
    const [tsh] = applyMaglumiAssayMap([{ code: 'TSH', value: '2.35', unit: 'mIU/L' }]);
    expect(tsh.unit).toBe('mIU/L');
  });

  it('fills in a unit only when the analyzer sent none', () => {
    const [tsh] = applyMaglumiAssayMap([{ code: 'TSH', value: '2.35', unit: '' }]);
    expect(tsh.unit).toBe('\u00b5IU/mL');
  });

  it('passes unmapped codes through untouched rather than dropping them', () => {
    const [x] = applyMaglumiAssayMap([{ code: 'NEW-ASSAY-2027', value: '5' }]);
    expect(x.code).toBe('NEW-ASSAY-2027');
    expect(x.mapped).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * Host query (order download)
 *
 * QPD/RCP are the segments Snibe's DllHL7Analysis.dll builds, and they belong to
 * QBP^Q11 in v2.4 — so that is the request shape asserted here, answered with
 * RSP^K11. QRY^Q02 (QRD/QRF) is a different dialect and is deliberately detected
 * but not answered.
 * ═══════════════════════════════════════════════════════════════════════════ */

const QBP_QUERY = [
  'MSH|^~\\&|P1^Maglumi||RK_LIS||20260830143000||QBP^Q11|MG0000900|P|2.4',
  'QPD|WOS^Work Order Segment|QT001|SP2026001^SER',
  'RCP|1||R',
].join(CR) + CR;

describe('detectHl7Query', () => {
  it('recognises QBP^Q11 and reads the specimen from QPD-3', () => {
    const q = detectHl7Query(QBP_QUERY);
    expect(q.isQuery).toBe(true);
    expect(q.supported).toBe(true);
    expect(q.specimenId).toBe('SP2026001');
    expect(q.queryTag).toBe('QT001');
    expect(q.queryName).toBe('WOS^Work Order Segment');
    expect(q.controlId).toBe('MG0000900');
  });

  it('does not mistake a result message for a query', () => {
    expect(detectHl7Query(MAGLUMI_ORU).isQuery).toBe(false);
  });

  it('detects the older QRY^Q02 dialect but refuses to guess at answering it', () => {
    const qry = [
      'MSH|^~\\&|P1^Maglumi||RK_LIS||20260830143000||QRY^Q02|MG0000901|P|2.4',
      'QRD|20260830143000|R|I|QT002|||1^RD|SP2026001|OTH',
    ].join(CR) + CR;
    const q = detectHl7Query(qry);
    expect(q.isQuery).toBe(true);
    expect(q.supported).toBe(false);
    expect(q.specimenId).toBe('SP2026001');
  });

  it('falls back to SPM-2 when the query carries no QPD-3', () => {
    const q = detectHl7Query([
      'MSH|^~\\&|P1^Maglumi||RK_LIS||20260830143000||QBP^Q11|MG1|P|2.4',
      'QPD|WOS|QT9|',
      'SPM|1|SP-FALLBACK^^^SER^||SER',
    ].join(CR) + CR);
    expect(q.specimenId).toBe('SP-FALLBACK');
  });
});

describe('buildHl7OrderResponse', () => {
  const query = detectHl7Query(QBP_QUERY);

  it('answers OK with one ORC/OBR pair per ordered test', () => {
    const rsp = buildHl7OrderResponse(query, {
      specimenId: 'SP2026001',
      patientName: 'Jane Doe',
      patientId: 'PT0001',
      sex: 'F',
      tests: [{ code: 'TSH', name: 'TSH' }, { code: 'FT4', name: 'Free T4' }],
    });
    expect(rsp).toContain('MSH|^~\\&|RK_LIS||P1||');
    expect(rsp).toContain('RSP^K11');
    expect(rsp).toContain('MSA|AA|MG0000900');
    expect(rsp).toContain('QAK|QT001|OK|');
    expect(rsp).toContain('PID|1||PT0001||Jane^Doe');
    expect(rsp).toContain('SPM|1|SP2026001');
    expect((rsp.match(/\rORC\|NW\|/g) || []).length).toBe(2);
    expect(rsp).toContain('OBR|1|SP2026001||TSH|R');
    expect(rsp).toContain('OBR|2|SP2026001||FT4^Free T4|R');
  });

  it('answers NF when the tube has no open order, rather than staying silent', () => {
    const rsp = buildHl7OrderResponse(query, { specimenId: 'SP2026001', tests: [] });
    expect(rsp).toContain('QAK|QT001|NF|');
    expect(rsp).not.toContain('ORC|');
    expect(rsp).not.toContain('OBR|');
  });

  it('marks an urgent order S in OBR-5', () => {
    const rsp = buildHl7OrderResponse(query, {
      specimenId: 'SP1', priority: 'urgent', tests: [{ code: 'TNI' }],
    });
    expect(rsp).toContain('OBR|1|SP1||TNI|S');
  });

  it('produces a message our own parser can read back', () => {
    const rsp = buildHl7OrderResponse(query, {
      specimenId: 'SP2026001', tests: [{ code: 'TSH' }],
    });
    const back = parseHl7(rsp);
    expect(back.message.type).toBe('RSP^K11');
    expect(back.specimenId).toBe('SP2026001');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * The site's real assay menu
 *
 * Names taken from the analyzer's own assay definitions (Maglumi 800/assay/*.asy)
 * and its calibration history. These are second-generation kits, so every name
 * carries a " II" suffix — which the original brochure-derived table missed
 * entirely, meaning no assay on this instrument resolved at all.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('assay names as this instrument actually reports them', () => {
  it.each([
    ['TSH II',       'TSH'],
    ['FT3 II',       'Free T3'],
    ['FT4 II',       'Free T4'],
    ['TT3 II',       'Total T3'],
    ['TT4 II',       'Total T4'],
    ['25-OH VD II',  'Vitamin D (25-OH)'],
    ['Vit B12 II',   'Vitamin B12'],
    ['T-B HCG II',   'Beta hCG'],
    ['PRA',          'Plasma Renin Activity'],
  ])('maps %s to %s', (reported, expected) => {
    expect(resolveAssay(reported)?.catalogName).toBe(expected);
  });

  it('keeps serum and urine immunoglobulins apart', () => {
    // Collapsing these onto one name would file a urine result against a serum test.
    expect(resolveAssay('IgA(S)').catalogName).toBe('IgA (Serum)');
    expect(resolveAssay('IgA(U)').catalogName).toBe('IgA (Urine)');
    expect(resolveAssay('IgG(S)').catalogName).toBe('IgG (Serum)');
    expect(resolveAssay('IgG(U)').catalogName).toBe('IgG (Urine)');
  });

  it('treats the older hyphenated variants as the same assay', () => {
    expect(resolveAssay('IgA-(S)').catalogName).toBe('IgA (Serum)');
    expect(resolveAssay('IgG-(U)').catalogName).toBe('IgG (Urine)');
  });

  it('would also match a future third-generation kit', () => {
    expect(resolveAssay('TSH III')?.catalogName).toBe('TSH');
  });

  it('still matches the plain codes, so nothing regressed', () => {
    expect(resolveAssay('TSH').catalogName).toBe('TSH');
    expect(resolveAssay('FT4').catalogName).toBe('Free T4');
    expect(resolveAssay('CA19-9').catalogName).toBe('CA 19-9');
  });

  it('leaves the optical/system checks unmapped rather than inventing names', () => {
    for (const item of ['BGW', 'LC-le', 'LC-ri']) {
      expect(resolveAssay(item)).toBeNull();
      // Unmapped still means delivered, just under the instrument's own label.
      expect(applyMaglumiAssayMap([{ code: item, value: '1' }])[0].code).toBe(item);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * Protocol auto-detection
 *
 * The Maglumi's dialect is chosen on its control PC, not here: its Lis.exe holds
 * a hardcoded ASTM E1394-97 header record, yet NIIHL7.dll sits beside NIIASTM.dll.
 * So one listener has to accept either, decided from the first packet.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('sniffProtocol', () => {
  const buf = (s) => Buffer.from(s, 'latin1');

  it('recognises HL7 by its MLLP start block', () => {
    expect(sniffProtocol(Buffer.concat([Buffer.from([0x0b]), buf('MSH|^~\\&|')]))).toBe('hl7');
  });

  it('recognises unframed HL7 by the MSH segment', () => {
    expect(sniffProtocol(buf('MSH|^~\\&|P1^Maglumi'))).toBe('hl7');
  });

  it('recognises HP-Socket PACK framing as HL7', () => {
    const body = buf('MSH|^~\\&|x');
    const head = Buffer.alloc(4); head.writeUInt32BE(body.length, 0);
    expect(sniffProtocol(Buffer.concat([head, body]))).toBe('hl7');
  });

  it('recognises ASTM from the ENQ that opens the handshake', () => {
    expect(sniffProtocol(Buffer.from([0x05]))).toBe('astm');
  });

  it('recognises ASTM from a framed record', () => {
    expect(sniffProtocol(Buffer.from([0x02]))).toBe('astm');
  });

  it("recognises the ASTM header record Lis.exe actually builds", () => {
    // Verbatim shape from the string embedded in Maglumi 800/Lis.exe.
    expect(sniffProtocol(buf('H|\\^&||PSWD|Maglumi 1000|||||Lis||P|E1394-97|20100319'))).toBe('astm');
  });

  it('says "not yet" rather than guessing on an empty or ambiguous start', () => {
    expect(sniffProtocol(Buffer.alloc(0))).toBeNull();
    expect(sniffProtocol(buf('??'))).toBeNull();
  });
});

describe('a single auto listener accepts either dialect', () => {
  const machine = { id: 'maglumi800', protocol: 'auto', framing: 'auto', assayMap: 'maglumi' };

  it('assembles an HL7 result arriving in MLLP', () => {
    const seen = [];
    const conn = createConnectionHandler(machine, { write: () => {}, onMessage: (t) => seen.push(t) });
    conn.feed(mllp(MAGLUMI_ORU));
    expect(seen).toHaveLength(1);
    const parsed = parseMessage(machine, seen[0]);
    expect(parsed.specimenId).toBe('SP2026001');
    expect(parsed.tests[0].code).toBe('TSH');       // assay map still applied
  });

  it('answers the ASTM ENQ handshake on the same port', () => {
    const written = [];
    const conn = createConnectionHandler(machine, { write: (b) => written.push(...b) });
    conn.feed(Buffer.from([0x05]));                 // ENQ
    expect(written).toContain(0x06);                // ACK
  });

  it('stays silent until it knows which dialect it is hearing', () => {
    const written = [];
    const conn = createConnectionHandler(machine, { write: (b) => written.push(...b) });
    conn.feed(Buffer.from('??', 'latin1'));         // undecidable
    expect(written).toHaveLength(0);
  });

  it('routes an HL7 query to the HL7 responder even in auto mode', () => {
    const q = detectQuery(machine, QBP_QUERY);
    expect(q.isQuery).toBe(true);
    const resp = buildOrderResponse(machine, { specimenId: 'SP2026001', tests: [{ code: 'TSH' }] }, q);
    expect(resp.hl7).toContain('RSP^K11');
  });
});
