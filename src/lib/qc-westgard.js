/**
 * Westgard multirule evaluation for QC results.
 *
 * A result's z-score (a.k.a. SDI) = (value - mean) / SD. Rules:
 *   1-2s  warning  — one control beyond ±2SD (inspection trigger)
 *   1-3s  reject   — one control beyond ±3SD
 *   2-2s  reject   — two consecutive same-side controls beyond 2SD
 *                    (across consecutive runs of one level, OR two levels in a run)
 *   R-4s  reject   — range between two levels in a run exceeds 4SD
 *   4-1s  reject   — four consecutive same-side controls beyond 1SD
 *   10x   reject   — ten consecutive controls on the same side of the mean
 */

const REJECT_RULES = new Set(['1-3s', '2-2s', 'R-4s', '4-1s', '10x']);

export function computeZ(value, mean, sd) {
  const s = Number(sd);
  if (!s || Number.isNaN(s)) return null;
  return (Number(value) - Number(mean)) / s;
}

export function sideOf(z) {
  if (z == null || Number.isNaN(z)) return 'on';
  if (z > 0) return 'above';
  if (z < 0) return 'below';
  return 'on';
}

function sameSign(a, b) {
  return (a > 0 && b > 0) || (a < 0 && b < 0);
}

/**
 * @param {object} ctx
 * @param {number} ctx.z                          current result z-score
 * @param {Array<{z:number}>} [ctx.historySameLevel]  prior results for the same
 *        (analyzer, test, control level), MOST RECENT FIRST, excluding current
 * @param {Array<{z:number}>} [ctx.peersInRun]        other results in the same run
 *        for the same (analyzer, test) at OTHER control levels
 * @returns {{ flags: string[], status: 'Pass'|'Warning'|'Reject' }}
 */
export function evaluateWestgard({ z, historySameLevel = [], peersInRun = [] }) {
  const flags = [];
  if (z == null || Number.isNaN(z)) return { flags, status: 'Pass' };

  const az = Math.abs(z);
  const sameLevelSeq = [{ z }, ...historySameLevel]; // current first

  // 1-2s — warning / inspection trigger
  if (az > 2) flags.push('1-2s');

  // 1-3s
  if (az > 3) flags.push('1-3s');

  // 2-2s — two consecutive same-side beyond 2SD (across-run or within-run)
  if (az > 2) {
    const prev = historySameLevel[0];
    if (prev && Math.abs(prev.z) > 2 && sameSign(prev.z, z)) flags.push('2-2s');
    else if (peersInRun.some(p => Math.abs(p.z) > 2 && sameSign(p.z, z))) flags.push('2-2s');
  }

  // R-4s — two levels in the same run span more than 4SD
  if (peersInRun.some(p => Math.abs(z - p.z) > 4)) flags.push('R-4s');

  // 4-1s — four consecutive same-side beyond 1SD (same level)
  {
    const seq = sameLevelSeq.slice(0, 4);
    if (seq.length === 4 && seq.every(r => Math.abs(r.z) > 1 && sameSign(r.z, z))) flags.push('4-1s');
  }

  // 10x — ten consecutive on the same side of the mean (same level)
  {
    const seq = sameLevelSeq.slice(0, 10);
    if (seq.length === 10 && seq.every(r => r.z !== 0 && sameSign(r.z, z))) flags.push('10x');
  }

  const deduped = [...new Set(flags)];
  const status = deduped.some(f => REJECT_RULES.has(f)) ? 'Reject' : deduped.length ? 'Warning' : 'Pass';
  return { flags: deduped, status };
}

export function isRejectRule(code) {
  return REJECT_RULES.has(code);
}
