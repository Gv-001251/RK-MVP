import { describe, it, expect } from 'vitest';
import { computeZ, sideOf, evaluateWestgard, isRejectRule } from '@/lib/qc-westgard';

describe('computeZ / sideOf', () => {
  it('computes the standard deviation index', () => {
    expect(computeZ(110, 100, 5)).toBe(2);
    expect(computeZ(90, 100, 5)).toBe(-2);
    expect(computeZ(100, 100, 5)).toBe(0);
  });
  it('returns null when SD is zero/invalid', () => {
    expect(computeZ(110, 100, 0)).toBeNull();
    expect(computeZ(110, 100, null)).toBeNull();
  });
  it('reports the side of the mean', () => {
    expect(sideOf(1.2)).toBe('above');
    expect(sideOf(-1.2)).toBe('below');
    expect(sideOf(0)).toBe('on');
  });
});

describe('evaluateWestgard', () => {
  it('passes an in-control result', () => {
    const r = evaluateWestgard({ z: 0.4 });
    expect(r.status).toBe('Pass');
    expect(r.flags).toEqual([]);
  });

  it('flags 1-2s as a warning (no reject)', () => {
    const r = evaluateWestgard({ z: 2.4 });
    expect(r.flags).toContain('1-2s');
    expect(r.status).toBe('Warning');
  });

  it('rejects on 1-3s', () => {
    const r = evaluateWestgard({ z: 3.2 });
    expect(r.flags).toContain('1-3s');
    expect(r.status).toBe('Reject');
  });

  it('rejects on 2-2s across consecutive runs (same level, same side)', () => {
    const r = evaluateWestgard({ z: 2.3, historySameLevel: [{ z: 2.1 }] });
    expect(r.flags).toContain('2-2s');
    expect(r.status).toBe('Reject');
  });

  it('rejects on 2-2s within a run (two levels, same side)', () => {
    const r = evaluateWestgard({ z: 2.3, peersInRun: [{ z: 2.5 }] });
    expect(r.flags).toContain('2-2s');
    expect(r.status).toBe('Reject');
  });

  it('does NOT trigger 2-2s when the two points are on opposite sides', () => {
    const r = evaluateWestgard({ z: 2.3, historySameLevel: [{ z: -2.4 }] });
    expect(r.flags).not.toContain('2-2s');
  });

  it('rejects on R-4s (range across two levels exceeds 4SD)', () => {
    const r = evaluateWestgard({ z: 2.5, peersInRun: [{ z: -2.0 }] });
    expect(r.flags).toContain('R-4s');
    expect(r.status).toBe('Reject');
  });

  it('rejects on 4-1s (four consecutive same-side beyond 1SD)', () => {
    const r = evaluateWestgard({ z: 1.4, historySameLevel: [{ z: 1.2 }, { z: 1.6 }, { z: 1.1 }] });
    expect(r.flags).toContain('4-1s');
    expect(r.status).toBe('Reject');
  });

  it('does NOT trigger 4-1s with only three consecutive points', () => {
    const r = evaluateWestgard({ z: 1.4, historySameLevel: [{ z: 1.2 }, { z: 1.6 }] });
    expect(r.flags).not.toContain('4-1s');
  });

  it('rejects on 10x (ten consecutive on the same side of the mean)', () => {
    const history = Array.from({ length: 9 }, () => ({ z: 0.3 }));
    const r = evaluateWestgard({ z: 0.2, historySameLevel: history });
    expect(r.flags).toContain('10x');
    expect(r.status).toBe('Reject');
  });

  it('does NOT trigger 10x when the streak is broken by an opposite side', () => {
    const history = [{ z: 0.3 }, { z: -0.1 }, ...Array.from({ length: 7 }, () => ({ z: 0.3 }))];
    const r = evaluateWestgard({ z: 0.2, historySameLevel: history });
    expect(r.flags).not.toContain('10x');
  });

  it('treats a null z as Pass (no data)', () => {
    expect(evaluateWestgard({ z: null }).status).toBe('Pass');
  });
});

describe('isRejectRule', () => {
  it('classifies rules correctly', () => {
    expect(isRejectRule('1-3s')).toBe(true);
    expect(isRejectRule('R-4s')).toBe(true);
    expect(isRejectRule('1-2s')).toBe(false);
  });
});
