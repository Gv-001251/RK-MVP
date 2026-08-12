import { describe, it, expect } from 'vitest';
import { limitPlaceholderPositions, prepareParams } from '@/lib/mysql/db';

/**
 * MySQL 9 refuses integer bound parameters in LIMIT/OFFSET over the
 * prepared-statement protocol (ER_WRONG_ARGUMENTS, "Incorrect arguments to
 * mysqld_stmt_execute"). `prepareParams` coerces only those placeholders.
 */

describe('limitPlaceholderPositions', () => {
  it('finds LIMIT and OFFSET placeholders', () => {
    const sql = 'SELECT * FROM lab_orders ORDER BY created_at DESC LIMIT ? OFFSET ?';
    expect([...limitPlaceholderPositions(sql)]).toEqual([0, 1]);
  });

  it('counts earlier WHERE placeholders when indexing', () => {
    const sql = 'SELECT * FROM lab_orders WHERE status = ? AND priority = ? LIMIT ? OFFSET ?';
    expect([...limitPlaceholderPositions(sql)]).toEqual([2, 3]);
  });

  it('handles the LIMIT ?, ? shorthand', () => {
    const sql = 'SELECT * FROM patients LIMIT ?, ?';
    expect([...limitPlaceholderPositions(sql)]).toEqual([0, 1]);
  });

  it('is case and whitespace insensitive', () => {
    const sql = 'select id from t\n  limit   ?\n  offset ?';
    expect([...limitPlaceholderPositions(sql)]).toEqual([0, 1]);
  });

  it('ignores question marks inside string literals', () => {
    const sql = "SELECT * FROM t WHERE note = 'why? because' AND id = ? LIMIT ?";
    expect([...limitPlaceholderPositions(sql)]).toEqual([1]);
  });

  it('returns nothing when pagination is inlined', () => {
    const sql = 'SELECT * FROM t WHERE id = ? LIMIT 10 OFFSET 0';
    expect(limitPlaceholderPositions(sql).size).toBe(0);
  });

  it('tolerates a non-string argument', () => {
    expect(limitPlaceholderPositions(undefined).size).toBe(0);
  });
});

describe('prepareParams', () => {
  it('stringifies LIMIT/OFFSET numbers and leaves the rest alone', () => {
    const sql = 'SELECT * FROM lab_orders WHERE status = ? LIMIT ? OFFSET ?';
    expect(prepareParams(sql, ['Ordered', 50, 0])).toEqual(['Ordered', '50', '0']);
  });

  it('does not touch parameters when there is no bound pagination', () => {
    const sql = 'SELECT * FROM lab_orders WHERE patient_id = ? AND age > ?';
    const params = ['P-1', 40];
    expect(prepareParams(sql, params)).toBe(params);
  });

  it('truncates a fractional limit rather than sending a decimal', () => {
    expect(prepareParams('SELECT 1 LIMIT ?', [10.9])).toEqual(['10']);
  });

  it('passes strings through unchanged', () => {
    expect(prepareParams('SELECT 1 LIMIT ?', ['25'])).toEqual(['25']);
  });

  it('leaves invalid values in place so the driver still errors', () => {
    expect(prepareParams('SELECT 1 LIMIT ?', [Number.NaN])).toEqual([Number.NaN]);
    expect(prepareParams('SELECT 1 LIMIT ?', [null])).toEqual([null]);
  });

  it('handles an empty parameter list', () => {
    expect(prepareParams('SELECT 1 LIMIT ?', [])).toEqual([]);
  });
});
