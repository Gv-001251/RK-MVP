import { describe, it, expect } from 'vitest';
import { normToken, parseLeadingNumber, testMatchesRule } from '@/lib/result-matching';

describe('parseLeadingNumber', () => {
  it('extracts the leading numeric from a value string', () => {
    expect(parseLeadingNumber('7.2 mmol/L')).toBe(7.2);
    expect(parseLeadingNumber('150000')).toBe(150000);
    expect(parseLeadingNumber('20,000 /uL')).toBe(20000);
    expect(parseLeadingNumber('-3.1')).toBe(-3.1);
  });
  it('returns null for non-numeric / qualitative values', () => {
    expect(parseLeadingNumber('Positive')).toBeNull();
    expect(parseLeadingNumber('')).toBeNull();
    expect(parseLeadingNumber(null)).toBeNull();
  });
});

describe('normToken', () => {
  it('lowercases and strips non-alphanumerics', () => {
    expect(normToken('Serum Potassium')).toBe('serumpotassium');
    expect(normToken('K+')).toBe('k');
  });
});

describe('testMatchesRule', () => {
  const potassium = { test_code: 'POTASSIUM', test_name: 'Potassium', aliases: 'K,K+,Serum Potassium' };

  it('matches the canonical name and code', () => {
    expect(testMatchesRule('Potassium', potassium)).toBe(true);
    expect(testMatchesRule('POTASSIUM', potassium)).toBe(true);
  });
  it('matches longer variants via substring', () => {
    expect(testMatchesRule('Serum Potassium', potassium)).toBe(true);
  });
  it('does not match unrelated tests', () => {
    expect(testMatchesRule('Hemoglobin', potassium)).toBe(false);
    expect(testMatchesRule('Glucose', potassium)).toBe(false);
  });
  it('does not let short codes cause false positives', () => {
    // 'K' (len 1) should only match exactly, not appear inside other words.
    expect(testMatchesRule('Markers', potassium)).toBe(false);
  });
  it('returns false for empty input', () => {
    expect(testMatchesRule('', potassium)).toBe(false);
  });
});
