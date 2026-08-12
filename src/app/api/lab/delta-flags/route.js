import { query } from '@/lib/mysql/db';
import { requireAuth } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';

/**
 * GET /api/lab/delta-flags — delta-flag worklist / history.
 * Filters: status (Flagged|Reviewed|Dismissed), patientId, taskId, q, limit, offset.
 * Also returns the live flaggedCount (status = 'Flagged').
 */
export async function GET(request) {
  try {
    const { response } = await requireAuth(...ROLES.DELTA_READ);
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const patientId = searchParams.get('patientId');
    const taskId = searchParams.get('taskId');
    const q = (searchParams.get('q') || '').trim();
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10) || 100, 500);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);

    const where = ['1=1'];
    const vals = [];
    if (status) { where.push('status = ?'); vals.push(status); }
    if (patientId) { where.push('patient_id = ?'); vals.push(patientId); }
    if (taskId) { where.push('lab_task_id = ?'); vals.push(taskId); }
    if (q) {
      where.push('(patient_name LIKE ? OR test_name LIKE ? OR lab_task_id LIKE ?)');
      const like = `%${q}%`;
      vals.push(like, like, like);
    }

    const flags = await query(
      `SELECT * FROM lab_delta_flags WHERE ${where.join(' AND ')}
       ORDER BY (status = 'Flagged') DESC, detected_at DESC
       LIMIT ? OFFSET ?`,
      [...vals, limit, offset]
    );

    const [{ flaggedCount }] = await query(
      "SELECT COUNT(*) AS flaggedCount FROM lab_delta_flags WHERE status = 'Flagged'"
    );

    return Response.json({ flags, flaggedCount: Number(flaggedCount) || 0, limit, offset });
  } catch (err) {
    console.error('delta-flags list error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
