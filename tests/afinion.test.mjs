import { describe, it, expect } from 'vitest';
import { extractFrames, parseFrame } from '../tools/afinion-bridge.mjs';

/**
 * Afinion 2 framing.
 *
 * The fixture is the first 147 bytes the instrument actually sent, captured on
 * 2026-08-07 when this host dialled it at 192.168.1.5:5555:
 *
 *   10 02 30 31 30 42 …   <DLE><STX>010BFFFF:IC@20260807,090349,AF20095065,21.16X<DLE><ETX>
 *
 * Three consecutive frames, kept as bytes rather than a re-typed string so the
 * DLE STX / DLE ETX delimiters and the hex sequence counter are exercised as
 * they arrive. The full capture ran to 9065 bytes of the same heartbeat, so
 * three frames is enough to prove contiguity without pasting all of it here.
 *
 * What these frames are NOT: a result. Every frame in that capture is class IC,
 * a two-second heartbeat carrying an ambient reading. The result frame class is
 * still unknown, which is why the last test pins down only that an unrecognised
 * class is surfaced rather than mistaken for a result.
 */
const CAPTURED = Buffer.from(
  '100230313042464646463a49434032303236303830372c3039303334392c414632303039353036352c32312e3136581003'
  + '100230313043464646463a49434032303236303830372c3039303335312c414632303039353036352c32312e3136581003'
  + '100230313044464646463a49434032303236303830372c3039303335332c414632303039353036352c32312e3136581003',
  'hex'
);

const DLE = 0x10;
const STX = 0x02;
const ETX = 0x03;
const wrap = (s) => Buffer.concat([
  Buffer.from([DLE, STX]), Buffer.from(s, 'latin1'), Buffer.from([DLE, ETX]),
]);

describe('the real captured bytes', () => {
  it('recovers all three frames and buffers nothing', () => {
    const { frames, rest } = extractFrames(CAPTURED);
    expect(frames).toHaveLength(3);
    expect(rest.length).toBe(0);
  });

  it('parses every frame as an IC heartbeat from one device', () => {
    const parsed = extractFrames(CAPTURED).frames.map(parseFrame);
    expect(parsed.every((p) => p.ok)).toBe(true);
    expect(parsed.map((p) => p.cls)).toEqual(['IC', 'IC', 'IC']);
    expect(new Set(parsed.map((p) => p.device)).size).toBe(1);
    expect(parsed[0].device).toBe('AF20095065');
    // FFFF is a broadcast address: the instrument is not addressing this host
    // specifically, so a listener must not filter on its own id.
    expect(parsed.every((p) => p.address === 'FFFF')).toBe(true);
  });

  it('reads the hex sequence counter as contiguous decimal', () => {
    const seqs = extractFrames(CAPTURED).frames.map((f) => parseFrame(f).sequence);
    // 010B, 010C, 010D — a gap here would mean dropped frames, which is the
    // only signal available for loss on a stream with no acknowledgement.
    expect(seqs).toEqual([seqs[0], seqs[0] + 1, seqs[0] + 2]);
  });

  it('turns the instrument date and time into an ISO timestamp', () => {
    const parsed = extractFrames(CAPTURED).frames.map(parseFrame);
    expect(parsed.every((p) => p.observedAt !== null)).toBe(true);
    expect(parsed[0].observedAt).toContain('2026-08-07');
  });
});

describe('DLE stuffing', () => {
  // A literal 0x10 in the payload arrives doubled. Un-stuffing it wrongly is the
  // classic way to truncate a frame whose data happens to contain 0x10 0x03.
  const stuffed = Buffer.concat([
    Buffer.from([DLE, STX]),
    Buffer.from('0001FFFF:XX@a', 'latin1'),
    Buffer.from([DLE, DLE]),
    Buffer.from('b', 'latin1'),
    Buffer.from([DLE, ETX]),
  ]);

  it('collapses a doubled DLE back to one byte', () => {
    const { frames } = extractFrames(stuffed);
    expect(frames).toHaveLength(1);
    expect(frames[0].toString('latin1')).toBe('0001FFFF:XX@a\x10b');
  });

  it('does not end the frame early on a stuffed DLE', () => {
    const { frames } = extractFrames(stuffed);
    expect(frames[0].toString('latin1').endsWith('b')).toBe(true);
  });
});

describe('stream reassembly', () => {
  it('holds a frame split across two reads until the rest arrives', () => {
    const whole = wrap('0002FFFF:IC@20260807,101112,AF20095065,21.16X');
    const first = extractFrames(whole.subarray(0, 20));
    expect(first.frames).toEqual([]);
    // The partial bytes must be kept. Dropping them loses a frame silently,
    // and TCP splits wherever it likes.
    expect(first.rest.length).toBe(20);

    const second = extractFrames(Buffer.concat([first.rest, whole.subarray(20)]));
    expect(second.frames).toHaveLength(1);
    expect(parseFrame(second.frames[0]).text.endsWith('21.16X')).toBe(true);
  });

  it('recovers two frames delivered in a single read, in order', () => {
    const { frames } = extractFrames(Buffer.concat([
      wrap('0003FFFF:IC@20260807,101113,AF1,1X'),
      wrap('0004FFFF:IC@20260807,101114,AF1,2X'),
    ]));
    expect(frames.map((f) => parseFrame(f).sequence)).toEqual([3, 4]);
  });

  it('skips junk between frames instead of stalling', () => {
    const { frames } = extractFrames(Buffer.concat([
      Buffer.from([0x00, 0xff, 0x41]),
      wrap('0005FFFF:IC@20260807,101115,AF1,3X'),
    ]));
    expect(frames).toHaveLength(1);
  });
});

describe('unknown frame classes', () => {
  // The result frame has never been seen. When it turns up it must be reported
  // as its own class with its fields intact, not quietly read as a heartbeat.
  it('surfaces a non-IC class and keeps its fields', () => {
    const p = parseFrame(
      Buffer.from('0006FFFF:RS@20260807,101116,AF20095065,HbA1c,6.4,%', 'latin1')
    );
    expect(p.ok).toBe(true);
    expect(p.cls).toBe('RS');
    expect(p.fields).toEqual(['HbA1c', '6.4', '%']);
  });
});
