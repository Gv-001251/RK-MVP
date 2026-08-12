import { query } from '@/lib/mysql/db';
import { requireAuth } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';

/**
 * GET /api/lab/qc/status — current QC state per analyzer (latest batch),
 * for the QC dashboard. `blocked` = latest batch Rejected (verification gate).
 */
export async function GET() {
  try {
    const { response } = await requireAuth(...ROLES.QC_READ);
    if (response) return response;

    const rows = await query(
      `SELECT b.analyzer_id, b.id AS batch_id, b.batch_no, b.status, b.run_at, b.operator,
              b.overridden_at, b.override_reason, c.name AS analyzer_name
         FROM qc_batches b
         JOIN (SELECT analyzer_id, MAX(run_at) AS mx FROM qc_batches GROUP BY analyzer_id) latest
           ON latest.analyzer_id = b.analyzer_id AND latest.mx = b.run_at
         LEFT JOIN analyzer_connections c ON c.id = b.analyzer_id
         ORDER BY b.analyzer_id`
    );

    const seen = new Set();
    const analyzers = [];
    for (const r of rows) {
      if (seen.has(r.analyzer_id)) continue; // guard against run_at ties
      seen.add(r.analyzer_id);
      analyzers.push({
        analyzerId: r.analyzer_id,
        analyzerName: r.analyzer_name || r.analyzer_id,
        status: r.status,
        batchId: r.batch_id,
        batchNo: r.batch_no,
        operator: r.operator,
        lastRunAt: r.run_at,
        blocked: r.status === 'Rejected',
        overridden: !!r.overridden_at,
      });
    }

    return Response.json({
      analyzers,
      blockedCount: analyzers.filter(a => a.blocked).length,
    });
  } catch (err) {
    console.error('qc status error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
