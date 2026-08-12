import { describe, it, expect } from 'vitest';
import {
  STX, ETX, ETB, CR, LF,
  checksum, buildFrame, parseFrame, parseRecord, components, decodeAstm,
  buildOrderDownload, buildNoOrderReply, buildRecordBlock,
} from '../tools/astm.mjs';

/**
 * ASTM E1394 protocol layer for the Maglumi 800.
 *
 * The record expectations below are the manual's own examples, copied verbatim
 * from the Maglumi 800 Operating Instructions chapter 16 (16.5.1 to 16.6.3).
 * Using the vendor's strings rather than invented ones is the whole point: field
 * positions are the kind of thing that looks right and reads one field early.
 *
 * The checksum is worth testing properly too: a wrong one is silent on our side
 * and makes the analyzer NAK every frame, which looks like a wiring fault rather
 * than a software bug.
 */

describe('checksum', () => {
  it('matches a hand-computed sum for "1L|1|N" + ETX', () => {
    // 0x31 0x4C 0x7C 0x31 0x7C 0x4E 0x03 = 503; 503 & 0xff = 247 = 0xF7
    const body = Buffer.from([0x31, 0x4c, 0x7c, 0x31, 0x7c, 0x4e, ETX]);
    expect(checksum(body)).toBe('F7');
  });

  it('wraps at 256 rather than overflowing', () => {
    expect(checksum(Buffer.from([0xff, 0x02]))).toBe('01');
  });

  it('always returns two uppercase hex digits', () => {
    expect(checksum(Buffer.from([0x01]))).toBe('01');
    expect(checksum(Buffer.from([0xab]))).toBe('AB');
  });
});

describe('framing', () => {
  it('builds a final frame as STX FN text ETX C1 C2 CR LF', () => {
    const frame = buildFrame(1, 'L|1|N', true);
    expect(frame[0]).toBe(STX);
    expect(String.fromCharCode(frame[1])).toBe('1');
    expect(frame[frame.length - 2]).toBe(CR);
    expect(frame[frame.length - 1]).toBe(LF);
    expect(frame).toContain(ETX);
    expect(frame.subarray(-4, -2).toString('ascii')).toBe('F7');
  });

  it('uses ETB for an intermediate frame', () => {
    const frame = buildFrame(2, 'P|1', false);
    expect(frame).toContain(ETB);
    expect(frame.includes(ETX)).toBe(false);
  });

  it('round-trips through parseFrame', () => {
    const text = 'O|1|123456||^^^TSH|R';
    const parsed = parseFrame(buildFrame(3, text, true));
    expect(parsed.ok).toBe(true);
    expect(parsed.frameNumber).toBe(3);
    expect(parsed.text).toBe(text);
    expect(parsed.isLast).toBe(true);
  });

  it('wraps the frame number at 8', () => {
    const frame = buildFrame(8, 'X', true);
    expect(String.fromCharCode(frame[1])).toBe('0');
  });

  it('rejects a corrupted checksum instead of accepting the frame', () => {
    const good = buildFrame(1, 'L|1|N', true);
    const bad = Buffer.from(good);
    bad[bad.length - 3] = bad[bad.length - 3] === 0x30 ? 0x31 : 0x30;  // flip a checksum digit
    const parsed = parseFrame(bad);
    expect(parsed.ok).toBe(false);
    expect(parsed.reason).toBe('checksum mismatch');
  });

  it('reports missing STX and missing terminator', () => {
    expect(parseFrame(Buffer.from('nope')).reason).toBe('missing STX');
    expect(parseFrame(Buffer.from([STX, 0x31, 0x41])).reason).toBe('missing ETX/ETB');
  });
});

describe('record parsing against the documented examples', () => {
  it('reads the header exactly as the manual lays it out', () => {
    // Manual 16.5.1: H|\^&||PSWD|Maglumi 800|||||Lis||P|E1394-97|20100323
    // field 4 password, field 5 sender, field 10 receiver, 12 mode, 13 version, 14 date.
    const r = parseRecord('H|\\^&||PSWD|Maglumi 800|||||Lis||P|E1394-97|20100323');
    expect(r.type).toBe('H');
    expect(r.password).toBe('PSWD');
    expect(r.sender).toBe('Maglumi 800');
    expect(r.receiver).toBe('Lis');
    expect(r.processingId).toBe('P');
    expect(r.version).toBe('E1394-97');
    expect(r.timestamp).toBe('20100323');
  });

  it('does not mistake the password field for the sender', () => {
    const r = parseRecord('H|\\^&||PSWD|Maglumi 800|||||Lis||P|E1394-97|20100323');
    expect(r.sender).not.toBe('PSWD');
  });

  it('round-trips a header we generate', () => {
    const [header] = buildOrderDownload({ specimenId: '1', tests: ['TSH'] });
    const r = parseRecord(header);
    expect(r.sender).toBe('LIS');
    expect(r.receiver).toBe('MAGLUMI');
    expect(r.processingId).toBe('P');
    expect(r.version).toBe('E1394-97');
  });

  it('extracts the specimen id from a query record', () => {
    // Manual 16.5.5: Q|1|^1234567||ALL||||||||O — id is the SECOND component of
    // field 3, and the assay selector 'ALL' is field 5.
    const r = parseRecord('Q|1|^1234567||ALL||||||||O');
    expect(r.type).toBe('Q');
    expect(r.specimenId).toBe('1234567');
    expect(r.testId).toBe('ALL');
  });

  it('parses an order record and its test list', () => {
    const r = parseRecord('O|1|1234567||^^^TSH|R');
    expect(r.type).toBe('O');
    expect(r.specimenId).toBe('1234567');
    expect(r.tests).toEqual(['TSH']);
    expect(r.priority).toBe('R');
  });

  it('parses the manual result example, micro sign and finish time included', () => {
    const r = parseRecord('R|1|^^^TSH|4.3|μIU/mL|0.3 to 4.5|N||||||20100326172956');
    expect(r.type).toBe('R');
    expect(r.testCode).toBe('TSH');
    expect(r.value).toBe('4.3');
    expect(r.unit).toBe('μIU/mL');
    expect(r.referenceRange).toBe('0.3 to 4.5');
    expect(r.flag).toBe('N');
    expect(r.completedAt).toBe('20100326172956');
  });

  it('parses a patient record', () => {
    // Manual 16.5.2: P|1||||ABC|||F — name is field 6, sex field 9.
    const r = parseRecord('P|1||||ABC|||F');
    expect(r.type).toBe('P');
    expect(r.name).toBe('ABC');
    expect(r.sex).toBe('F');
  });

  it('parses the terminator', () => {
    expect(parseRecord('L|1|N').type).toBe('L');
  });

  it('preserves empty trailing fields, since ASTM position is significant', () => {
    const r = parseRecord('R|1|^^^TSH|2.35||||');
    expect(r.unit).toBe('');
    expect(r.referenceRange).toBe('');
  });

  it('splits components', () => {
    expect(components('^^^TSH')).toEqual(['', '', '', 'TSH']);
  });
});

describe('order download replies', () => {
  it('emits H, one O per test, then L', () => {
    const recs = buildOrderDownload({
      specimenId: '123456',
      tests: [{ code: 'TSH' }, { code: 'FT4' }],
      patient: { id: 'RK-000001', name: 'Sivaswamy', sex: 'M' },
    });
    expect(recs[0].startsWith('H|')).toBe(true);
    expect(recs[1].startsWith('P|')).toBe(true);
    expect(recs.filter((r) => r.startsWith('O|')).length).toBe(2);
    expect(recs[recs.length - 1]).toBe('L|1|N');
    expect(recs[2]).toContain('^^^TSH');
    expect(recs[2]).toContain('123456');
  });

  it('accepts plain string test codes too', () => {
    const recs = buildOrderDownload({ specimenId: '9', tests: ['TSH'] });
    expect(recs.some((r) => r.includes('^^^TSH'))).toBe(true);
  });

  it('still answers when nothing is ordered, rather than leaving the analyzer waiting', () => {
    // A well-formed message with no O records. 16.6.1 warns that a missing reply
    // makes the instrument decide the LIS has gone away, so silence is not an
    // option; and inventing an action code the manual does not define is not one
    // either, which is why there is no O record here at all.
    const recs = buildNoOrderReply();
    expect(recs[0].startsWith('H|')).toBe(true);
    expect(recs.some((r) => r.startsWith('O|'))).toBe(false);
    expect(recs[recs.length - 1]).toBe('L|1|N');
  });

  it('keeps O records to the fields the manual documents', () => {
    const recs = buildOrderDownload({ specimenId: '1234567', tests: ['TSH'] });
    const order = recs.find((r) => r.startsWith('O|'));
    expect(order).toBe('O|1|1234567||^^^TSH|R');
  });

  it('joins records into the CR-terminated block bare mode sends', () => {
    const block = buildRecordBlock(['P|1', 'L|1|N']).toString('latin1');
    expect(block).toBe('P|1\rL|1|N\r');
  });

  it('decodes a micro sign rather than stripping its high bit', () => {
    // 0xB5 is 'µ' in the Windows code page the analyzer PC runs. Decoded as
    // ASCII it becomes '5', which would silently turn µIU/mL into 5IU/mL.
    expect(decodeAstm(Buffer.from([0xb5, 0x49, 0x55]))).toBe('µIU');
    expect(decodeAstm(Buffer.from('μIU/mL', 'utf8'))).toBe('μIU/mL');
  });

  it('every generated record survives framing and checksum verification', () => {
    const recs = buildOrderDownload({ specimenId: '123456', tests: ['TSH'] });
    recs.forEach((rec, i) => {
      const parsed = parseFrame(buildFrame(i + 1, rec, true));
      expect(parsed.ok).toBe(true);
      expect(parsed.text).toBe(rec);
    });
  });
});
