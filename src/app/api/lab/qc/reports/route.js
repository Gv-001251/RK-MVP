import { query } from '@/lib/mysql/db';
import { requireAuth } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';

/**
 * GET /api/lab/qc/reports — QC summary report.
 * Params: from?, to?, analyzerId?
 * Returns batch totals by status, per-analyzer + per-test breakdown, and the
 * frequency of each Westgard rule violation over the period.
 */
export async function GET(request) {
  try {
    const { response } = await requireAuth(...ROLES.QC_READ);
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const analyzerId = searchParams.get('analyzerId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const bWhere = ['1=1'];
    const bVals = [];
    if (analyzerId) { bWhere.push('analyzer_id = ?'); bVals.push(analyzerId); }
    if (from) { bWhere.push('run_at >= ?'); bVals.push(from); }
    if (to) { bWhere.push('run_at <= ?'); bVals.push(to); }
    const bClause = bWhere.join(' AND ');

    const byStatus = await query(
      `SELECT status, COUNT(*) AS n FROM qc_batches WHERE ${bClause} GROUP BY status`, bVals
    );
    const totals = { batches: 0, Pass: 0, Warning: 0, Rejected: 0, Overridden: 0, Pending: 0 };
    for (const r of byStatus) { totals[r.status] = Number(r.n); totals.batches += Number(r.n); }

    const perAnalyzer = await query(
      `SELECT analyzer_id,
              COUNT(*) AS batches,
              SUM(status = 'Rejected') AS rejected,
              SUM(status = 'Warning') AS warning,
              SUM(status = 'Overridden') AS overridden
         FROM qc_batches WHERE ${bClause} GROUP BY analyzer_id ORDER BY rejected DESC, batches DESC`,
      bVals
    );

    // Result-level breakdown (per test) + Westgard rule frequency.
    const rWhere = ['1=1'];
    const rVals = [];
    if (analyzerId) { rWhere.push('analyzer_id = ?'); rVals.push(analyzerId); }
    if (from) { rWhere.push('run_at >= ?'); rVals.push(from); }
    if (to) { rWhere.push('run_at <= ?'); rVals.push(to); }
    const rClause = rWhere.join(' AND ');

    const perTest = await query(
      `SELECT test_name,
              COUNT(*) AS runs,
              SUM(status = 'Reject') AS rejects,
              SUM(status = 'Warning') AS warnings
         FROM qc_results WHERE ${rClause} GROUP BY test_name ORDER BY rejects DESC, runs DESC`,
      rVals
    );

    const flagRows = await query(
      `SELECT flags FROM qc_results WHERE ${rClause} AND flags IS NOT NULL AND flags <> ''`, rVals
    );
    const ruleFrequency = {};
    for (const r of flagRows) {
      for (const f of String(r.flags).split(',').filter(Boolean)) {
        ruleFrequency[f] = (ruleFrequency[f] || 0) + 1;
      }
    }

    return Response.json({ totals, perAnalyzer, perTest, ruleFrequency, range: { from, to, analyzerId } });
  } catch (err) {
    console.error('qc reports error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
