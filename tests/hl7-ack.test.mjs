import { describe, it, expect } from 'vitest';
import { splitFrames, parseFrame, buildAck, controlIdOf } from '../tools/lis-bridge.mjs';

/**
 * HL7 acknowledgement, and the Afinion 2 in HL7 mode.
 *
 * On 2026-08-28 the instrument's Protocol setting was changed from Disabled to
 * HL7, and it immediately dialled the LIS on TCP 2575 and delivered this. It is
 * the first result frame ever captured from this analyzer: the previous interface
 * was a proprietary DLE-framed protocol on 5555 from which only heartbeats were
 * ever seen.
 *
 * MSH-15 is AL -- accept acknowledgement ALWAYS. With no reply the analyzer
 * assumed delivery had failed and resent the same result every 30 seconds, the
 * control id advancing 1000, 1001, 1002 while the observation timestamp stayed
 * identical. Unacknowledged, one cartridge would have produced a duplicate result
 * in the LIS twice a minute for as long as it stayed connected. That is what
 * buildAck exists to prevent.
 */
const SEGMENTS = [
  'MSH|^~\\&|Afinion 2 Analyzer||RKLIS|RKLIS|20260828080453||ORU^R01|1000|P|2.4|||AL|NE||8859/1',
  'PID|1||1|',
  'PV1|1|||||||||||||||||||',
  'OBR|1||1|HbA1c|||||||N||||ORH||||||||^10233356||F|',
  'OBX|1|ST|HbA1c||5.1|%|||||F|||||||AF20095065|20251226100439|',
  'OBX|2|ST|HbA1c||32|mmol/mol|||||F|||||||AF20095065|20251226100439|',
  'OBX|3|ST|eAG||5.5|mmol/L|||||F|||||||AF20095065|20251226100439|',
];

const AFINION_ORU = Buffer.concat([
  Buffer.from([0x0b]),
  Buffer.from(`${SEGMENTS.join('\r')}\r`, 'latin1'),
  Buffer.from([0x1c, 0x0d]),
]);

/**
 * The 373 bytes as they came off the wire. The fixture above is assembled from
 * readable segments, which is easier to check by eye but is a re-typed string --
 * so it is pinned against the real capture. If the two ever disagree, the
 * readable version has drifted and the tests below are no longer about this
 * instrument.
 */
const CAPTURED_HEX = '0b4d53487c5e7e5c267c4166696e696f6e203220416e616c797a65727c7c524b4c49537c524b4c49537c32303236303832383038303435337c7c4f52555e5230317c313030307c507c322e347c7c7c414c7c4e457c7c383835392f310d5049447c317c7c317c0d5056317c317c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c0d4f42527c317c7c317c48624131637c7c7c7c7c7c7c4e7c7c7c7c4f52487c7c7c7c7c7c7c7c5e31303233333335367c7c467c0d4f42587c317c53547c48624131637c7c352e317c257c7c7c7c7c467c7c7c7c7c7c7c414632303039353036357c32303235313232363130303433397c0d4f42587c327c53547c48624131637c7c33327c6d6d6f6c2f6d6f6c7c7c7c7c7c467c7c7c7c7c7c7c414632303039353036357c32303235313232363130303433397c0d4f42587c337c53547c6541477c7c352e357c6d6d6f6c2f4c7c7c7c7c7c467c7c7c7c7c7c7c414632303039353036357c32303235313232363130303433397c0d1c0d';

const frameOf = (buf) => splitFrames(buf).frames[0];

describe('the captured Afinion message', () => {
  it('matches the bytes recorded on the wire, byte for byte', () => {
    expect(AFINION_ORU.toString('hex')).toBe(CAPTURED_HEX);
    expect(AFINION_ORU.length).toBe(373);
  });

  it('de-frames from MLLP with nothing left over', () => {
    const { frames, rest } = splitFrames(AFINION_ORU);
    expect(frames).toHaveLength(1);
    expect(rest.length).toBe(0);
  });

  it('parses with the parser written for the Hemat 60, unchanged', () => {
    // The point of this test is that no Afinion-specific parsing exists. If
    // someone later specialises the parser per analyzer, this should stop them.
    const r = parseFrame(frameOf(AFINION_ORU));
    expect(r.meta.messageType).toBe('ORU^R01');
    expect(r.meta.hl7Version).toBe('2.4');
    expect(r.tests.map((t) => [t.code, t.value, t.unit])).toEqual([
      ['HbA1c', '5.1', '%'],
      ['HbA1c', '32', 'mmol/mol'],
      ['eAG', '5.5', 'mmol/L'],
    ]);
  });

  it('yields a specimen id of "1", which cannot identify a patient', () => {
    // Not a parser defect: the instrument sends PID|1||1| with no name and no
    // MRN, and OBR-3 is likewise "1", so every cartridge looks like the same
    // specimen. Results must therefore land in the Exception Queue until an
    // accession is entered on the instrument. Asserted so the limitation is
    // recorded rather than rediscovered later.
    expect(parseFrame(frameOf(AFINION_ORU)).specimenId).toBe('1');
  });
});

describe('control id', () => {
  it('reads MSH-10 from the captured message', () => {
    expect(controlIdOf(frameOf(AFINION_ORU))).toBe('1000');
  });

  it('is empty rather than wrong when there is no MSH', () => {
    expect(controlIdOf(Buffer.from('OBX|1|ST|HbA1c||5.1|%\r', 'latin1'))).toBe('');
  });
});

describe('buildAck', () => {
  const ack = buildAck(frameOf(AFINION_ORU));
  const text = ack.toString('latin1');
  const header = text.split('\r')[0].split('|');

  it('wraps the reply in MLLP', () => {
    expect(ack[0]).toBe(0x0b);
    expect(ack[ack.length - 2]).toBe(0x1c);
    expect(ack[ack.length - 1]).toBe(0x0d);
  });

  it('echoes the control id in MSA-2, which is what links ack to message', () => {
    expect(text.split('\r').find((l) => l.startsWith('MSA|'))).toBe('MSA|AA|1000');
  });

  it('mirrors the routing fields back at the sender', () => {
    // Ours becomes theirs: we send from what they addressed, and address what
    // they sent from. Getting this backwards is invisible with one analyzer and
    // confusing the moment there are two.
    expect(header[2]).toBe('RKLIS');               // MSH-3 sending application
    expect(header[4]).toBe('Afinion 2 Analyzer');  // MSH-5 receiving application
  });

  it('answers ORU^R01 with ACK^R01 and matches the sender version', () => {
    expect(header[8]).toBe('ACK^R01');
    expect(header[11]).toBe('2.4');
  });

  it('is itself a frame our own de-framer can read back', () => {
    // A reply we cannot parse is one we cannot test, and it would also mean we
    // are emitting something subtly malformed.
    const { frames, rest } = splitFrames(ack);
    expect(frames).toHaveLength(1);
    expect(rest.length).toBe(0);
    expect(frames[0].toString('latin1')).toContain('MSA|AA|1000');
  });

  it('refuses to acknowledge a message with no MSH', () => {
    // Inventing an ack would tell the instrument its result was safely received
    // when we have no idea what it was.
    expect(buildAck(Buffer.from('garbage\r', 'latin1'))).toBeNull();
  });

  it('still answers when the message type carries no trigger event', () => {
    const bare = Buffer.from('MSH|^~\\&|A||B||20260828080453||ACK|77|P|2.3.1\r', 'latin1');
    const out = buildAck(bare).toString('latin1');
    expect(out.split('\r')[0].split('|')[8]).toBe('ACK');
    expect(out).toContain('MSA|AA|77');
  });

  it('tolerates LF as well as CR between segments', () => {
    // Some senders use CRLF. A separator assumption that only handles CR would
    // find no MSH and silently decline to acknowledge anything.
    const crlf = Buffer.from(SEGMENTS.join('\r\n'), 'latin1');
    expect(controlIdOf(crlf)).toBe('1000');
    expect(buildAck(crlf).toString('latin1')).toContain('MSA|AA|1000');
  });
});
