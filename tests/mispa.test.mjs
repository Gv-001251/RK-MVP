import { describe, it, expect } from 'vitest';
import {
  extractFrames, parseFrame, normaliseSampleId, isoDate, resolveParam,
} from '../tools/mispa-bridge.mjs';

/**
 * Mispa Plus line protocol.
 *
 * The fixture below is the exact byte sequence the instrument sent on
 * 2026-08-07, the first frame it has ever given us, captured on TCP 8888:
 *
 *   24 30 37 2f 30 38 2f 32 30 32 36 7c …  $07/08/2026|000000000029|mbglu|…
 *
 * Tests are written against those bytes rather than a re-typed string so that
 * the trailing LF CR, the zero padding and the field count are all exercised as
 * they actually arrive.
 */
const CAPTURED = Buffer.from(
  '2430372f30382f323032367c3030303030303030303032397c6d62676c757c32382e313934357c6d672f644c7c31230a0d',
  'hex'
);

describe('framing', () => {
  it('extracts the captured frame and consumes its trailing LF CR', () => {
    const { frames, rest } = extractFrames(CAPTURED);
    expect(frames).toEqual(['07/08/2026|000000000029|mbglu|28.1945|mg/dL|1']);
    // The LF CR after '#' is leader for the next frame and must not be kept as
    // a partial one, or the buffer grows forever on a busy line.
    expect(rest.length).toBe(0);
  });

  it('holds an unterminated frame back until the rest arrives', () => {
    const split = CAPTURED.length - 12;
    const first = extractFrames(CAPTURED.subarray(0, split));
    expect(first.frames).toEqual([]);
    expect(first.rest.length).toBe(split);

    const whole = Buffer.concat([first.rest, CAPTURED.subarray(split)]);
    expect(extractFrames(whole).frames).toHaveLength(1);
  });

  it('reads several results out of one segment, as a panel arrives', () => {
    const two = Buffer.concat([CAPTURED, CAPTURED]);
    expect(extractFrames(two).frames).toHaveLength(2);
  });

  it('discards noise that contains no frame start', () => {
    expect(extractFrames(Buffer.from('\n\rrubbish')).rest.length).toBe(0);
  });
});

describe('field parsing', () => {
  it('parses every field of the captured frame', () => {
    const [text] = extractFrames(CAPTURED).frames;
    const f = parseFrame(text);
    expect(f.ok).toBe(true);
    expect(f.date).toBe('07/08/2026');
    expect(f.sampleRaw).toBe('000000000029');
    expect(f.sampleId).toBe('29');
    expect(f.code).toBe('mbglu');
    expect(f.value).toBe('28.1945');
    expect(f.unit).toBe('mg/dL');
    expect(f.status).toBe('1');
  });

  it('refuses a short frame instead of reading fields out of position', () => {
    const f = parseFrame('07/08/2026|29|mbglu');
    expect(f.ok).toBe(false);
    expect(f.reason).toMatch(/fields/);
  });

  it('refuses a frame with no value', () => {
    expect(parseFrame('07/08/2026|29|mbglu||mg/dL|1').ok).toBe(false);
  });

  it('strips the instrument zero padding but leaves a typed accession alone', () => {
    expect(normaliseSampleId('000000000029')).toBe('29');
    expect(normaliseSampleId('000000000000')).toBe('0');
    expect(normaliseSampleId('RKLAB-0007')).toBe('RKLAB-0007');
    expect(normaliseSampleId('  ')).toBe('');
  });

  it('reads the date as DD/MM/YYYY, which is what the instrument sends', () => {
    // 07/08/2026 is 7 August, not 8 July — the capture was taken on 7 Aug 2026.
    expect(isoDate('07/08/2026')).toBe('2026-08-07');
    expect(isoDate('2026-08-07')).toBe(null);
  });
});

describe('code mapping', () => {
  it('resolves the one code we have actually seen, with or without the mb prefix', () => {
    expect(resolveParam('mbglu').label).toBe('Glucose');
    expect(resolveParam('glu').label).toBe('Glucose');
    expect(resolveParam('MBGLU').label).toBe('Glucose');
  });

  it('offers both catalogue candidates rather than choosing one', () => {
    expect(resolveParam('mbglu').catalogNames).toEqual(['Glucose (Fasting)', 'Glucose (Random)']);
  });

  it('returns null for a code that has never been captured', () => {
    expect(resolveParam('mbchol')).toBe(null);
  });
});
