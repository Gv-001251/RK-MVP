import { parseLeadingNumber } from '@/lib/result-matching';

/**
 * Pure reference-range helpers (no DB / no framework deps) so they can be
 * unit-tested in isolation and reused by both server and client code.
 */

/** Parse a numeric reference range "low-high" -> { low, high }, else null. */
export function parseRange(ref) {
  if (!ref) return null;
  const m = String(ref).replace(/[–—]/g, '-').match(/^\s*(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const low = parseFloat(m[1]);
  const high = parseFloat(m[2]);
  if (Number.isNaN(low) || Number.isNaN(high)) return null;
  return { low, high };
}

/** Abnormal flag for a value against a numeric reference range: '' | 'H' | 'L'. */
export function flagFor(resultValue, referenceRange) {
  const range = parseRange(referenceRange);
  const numeric = parseLeadingNumber(resultValue);
  if (!range || numeric == null) return '';
  if (numeric < range.low) return 'L';
  if (numeric > range.high) return 'H';
  return '';
}
