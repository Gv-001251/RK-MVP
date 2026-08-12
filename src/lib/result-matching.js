/**
 * Shared helpers for matching incoming lab results to configured rules.
 * Used by both critical-result detection and delta-check validation so the
 * test-name matching and numeric parsing behave identically across features.
 */

/** Normalise a token for matching: lowercase, strip non-alphanumerics. */
export function normToken(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Parse the leading number out of a result string, e.g. "7.2 mmol/L" -> 7.2. */
export function parseLeadingNumber(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/,/g, '');
  const m = cleaned.match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/**
 * Does an incoming test name match a rule (by code / name / aliases)?
 * `rule` must expose test_code, test_name and (optionally) a comma-separated
 * `aliases` string.
 */
export function testMatchesRule(testName, rule) {
  const hay = normToken(testName);
  if (!hay) return false;
  const tokens = [rule.test_code, rule.test_name, ...String(rule.aliases || '').split(',')]
    .map(normToken)
    .filter(Boolean);
  for (const tok of tokens) {
    if (hay === tok) return true;
    // Only allow substring matching for tokens of a safe length, to avoid
    // short codes like "k" or "na" matching unrelated test names.
    if (tok.length >= 3 && (hay.includes(tok) || tok.includes(hay))) return true;
  }
  return false;
}
