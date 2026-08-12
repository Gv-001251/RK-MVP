import { describe, it, expect } from 'vitest';
import { parseRange, flagFor } from '@/lib/reference-range';

describe('parseRange', () => {
  it('parses simple numeric ranges', () => {
    expect(parseRange('70-110')).toEqual({ low: 70, high: 110 });
    expect(parseRange('3.5-5.1')).toEqual({ low: 3.5, high: 5.1 });
  });
  it('handles en/em dashes and surrounding spaces', () => {
    expect(parseRange('70 – 110')).toEqual({ low: 70, high: 110 });
    expect(parseRange(' 12.0 — 15.0 ')).toEqual({ low: 12, high: 15 });
  });
  it('returns null for non-parseable ranges', () => {
    expect(parseRange('Positive')).toBeNull();
    expect(parseRange('M: 13-17, F: 12-15')).toBeNull();
    expect(parseRange('')).toBeNull();
    expect(parseRange(null)).toBeNull();
  });
});

describe('flagFor', () => {
  it('flags Low / High / normal against a numeric range', () => {
    expect(flagFor('60', '70-110')).toBe('L');
    expect(flagFor('130 mg/dL', '70-110')).toBe('H');
    expect(flagFor('95', '70-110')).toBe('');
  });
  it('returns no flag when value or range is non-numeric', () => {
    expect(flagFor('Positive', '70-110')).toBe('');
    expect(flagFor('95', 'see comment')).toBe('');
  });
  it('respects range boundaries (inclusive)', () => {
    expect(flagFor('70', '70-110')).toBe('');
    expect(flagFor('110', '70-110')).toBe('');
  });
});
