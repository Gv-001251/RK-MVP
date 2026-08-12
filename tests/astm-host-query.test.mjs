import { describe, it, expect } from 'vitest';
import {
  astmChecksum,
  buildAstmFrame,
  parseAstmQuery,
  buildAstmOrderMessage,
  AstmSender,
  CTRL,
} from '../tools/lis-bridge/lib/astm.mjs';

describe('astmChecksum', () => {
  it('sums bytes mod 256 as two upper-hex chars', () => {
    expect(astmChecksum(Buffer.from([0x01, 0x02]))).toBe('03');
    expect(astmChecksum(Buffer.from([0xff, 0x01]))).toBe('00'); // wraps at 256
    expect(astmChecksum(Buffer.from([0x10]))).toBe('10');
  });
});

describe('buildAstmFrame', () => {
  it('wraps a record as <STX>FN…<ETX>CC<CR><LF> with a valid checksum', () => {
    const frame = buildAstmFrame('L|1|N', 1, true);
    expect(frame[0]).toBe(CTRL.STX);
    expect(frame[frame.length - 2]).toBe(CTRL.CR);
    expect(frame[frame.length - 1]).toBe(CTRL.LF);

    const etxIdx = frame.indexOf(CTRL.ETX);
    expect(etxIdx).toBeGreaterThan(0);

    // Checksum covers the bytes from the frame number through ETX (i.e. after STX).
    const forSum = frame.subarray(1, etxIdx + 1);
    const expected = astmChecksum(forSum);
    const actual = frame.subarray(etxIdx + 1, etxIdx + 3).toString('latin1');
    expect(actual).toBe(expected);
  });

  it('uses ETB for intermediate (non-final) frames', () => {
    const frame = buildAstmFrame('H|\\^&|', 1, false);
    expect(frame.includes(CTRL.ETB)).toBe(true);
    expect(frame.includes(CTRL.ETX)).toBe(false);
  });
});

describe('parseAstmQuery', () => {
  it('detects a Q record and extracts the requested specimen', () => {
    expect(parseAstmQuery('Q|1|^ACC-123||ALL||||||O')).toEqual({ isQuery: true, specimenId: 'ACC-123' });
  });
  it('is not a query for a normal result message', () => {
    const result = 'H|\\^&|||Analyzer\rO|1|ACC-9||^^^GLU\rR|1|^^^GLU|5.5|mmol/L\rL|1|N';
    expect(parseAstmQuery(result)).toEqual({ isQuery: false, specimenId: null });
  });
});

describe('buildAstmOrderMessage', () => {
  it('builds H/P/O(one per test)/L records keyed on the accession', () => {
    const recs = buildAstmOrderMessage({ specimenId: 'ACC-1', patientName: 'Jane Doe', sex: 'F', tests: [{ code: 'GLU' }, { code: 'K' }] });
    expect(recs).toHaveLength(5);
    expect(recs[0].startsWith('H|')).toBe(true);
    expect(recs[1].startsWith('P|')).toBe(true);
    expect(recs[2]).toContain('ACC-1');
    expect(recs[2]).toContain('^^^GLU');
    expect(recs[3]).toContain('^^^K');
    expect(recs[4]).toBe('L|1|N');
  });
  it('falls back to an ALL order when no tests are supplied', () => {
    const recs = buildAstmOrderMessage({ specimenId: 'ACC-2', tests: [] });
    expect(recs.some((r) => r.includes('^^^ALL'))).toBe(true);
  });
});

describe('AstmSender handshake', () => {
  it('drives ENQ → frames (ACK-gated) → EOT and reports success', () => {
    const writes = [];
    let doneOk = null;
    const sender = new AstmSender({
      write: (b) => writes.push(Buffer.from(b)),
      records: ['H|\\^&|', 'L|1|N'],
      onDone: (ok) => { doneOk = ok; },
    });

    sender.start();
    expect(writes[0][0]).toBe(CTRL.ENQ);

    sender.feedControl(Buffer.from([CTRL.ACK])); // → first frame
    expect(writes[1][0]).toBe(CTRL.STX);
    expect(writes[1].includes(CTRL.ETB)).toBe(true); // intermediate frame

    sender.feedControl(Buffer.from([CTRL.ACK])); // → last frame
    expect(writes[2][0]).toBe(CTRL.STX);
    expect(writes[2].includes(CTRL.ETX)).toBe(true); // final frame

    sender.feedControl(Buffer.from([CTRL.ACK])); // → EOT + done
    expect(writes[3][0]).toBe(CTRL.EOT);
    expect(doneOk).toBe(true);
  });

  it('aborts if the analyzer NAKs the ENQ', () => {
    const writes = [];
    let doneOk = null;
    const sender = new AstmSender({
      write: (b) => writes.push(Buffer.from(b)),
      records: ['L|1|N'],
      onDone: (ok) => { doneOk = ok; },
    });
    sender.start();
    sender.feedControl(Buffer.from([CTRL.NAK]));
    expect(doneOk).toBe(false);
  });
});
