import { query } from '@/lib/mysql/db';
import { requireAuth } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';

/**
 * GET /api/lab/qc/results — Levey-Jennings series for one control.
 * Params: analyzerId, testCode, controlLevel (all required), from?, to?, limit?
 * Returns points (oldest first) plus the target mean/SD for the chart.
 */
export async function GET(request) {
  try {
    const { response } = await requireAuth(...ROLES.QC_READ);
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const analyzerId = searchParams.get('analyzerId');
    const testCode = searchParams.get('testCode');
    const controlLevel = searchParams.get('controlLevel');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limit = Math.min(parseInt(searchParams.get('limit') || '120', 10) || 120, 500);

    if (!analyzerId || !testCode || !controlLevel) {
      return Response.json({ error: 'analyzerId, testCode and controlLevel are required.' }, { status: 400 });
    }

    const where = ['analyzer_id = ?', 'test_code = ?', 'control_level = ?'];
    const vals = [analyzerId, testCode, controlLevel];
    if (from) { where.push('run_at >= ?'); vals.push(from); }
    if (to) { where.push('run_at <= ?'); vals.push(to); }

    const rows = await query(
      `SELECT id, value, target_mean, target_sd, z_score, side, status, flags, operator, lot_number, run_at
         FROM qc_results WHERE ${where.join(' AND ')}
         ORDER BY run_at DESC, created_at DESC LIMIT ?`,
      [...vals, limit]
    );

    const points = rows.slice().reverse().map(r => ({
      id: r.id,
      value: Number(r.value),
      z: r.z_score != null ? Number(r.z_score) : null,
      status: r.status,
      flags: r.flags ? r.flags.split(',') : [],
      operator: r.operator,
      lotNumber: r.lot_number,
      runAt: r.run_at,
    }));

    const latest = rows[0];
    const mean = latest ? Number(latest.target_mean) : null;
    const sd = latest ? Number(latest.target_sd) : null;

    return Response.json({ points, mean, sd, analyzerId, testCode, controlLevel });
  } catch (err) {
    console.error('qc results series error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
