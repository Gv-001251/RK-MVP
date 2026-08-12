import { query } from '@/lib/mysql/db';
import { requireAuth } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';

/**
 * GET /api/lab/critical-alerts — critical alert feed / history.
 * Filters: status (Active|Acknowledged), acknowledged (0|1), patientId, taskId,
 * q (patient/test search), limit, offset. Also returns the live activeCount.
 */
export async function GET(request) {
  try {
    const { response } = await requireAuth(...ROLES.CRITICAL_READ);
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const acknowledged = searchParams.get('acknowledged');
    const patientId = searchParams.get('patientId');
    const taskId = searchParams.get('taskId');
    const q = (searchParams.get('q') || '').trim();
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10) || 100, 500);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);

    const where = ['1=1'];
    const vals = [];
    if (status) { where.push('status = ?'); vals.push(status); }
    if (acknowledged !== null && acknowledged !== undefined && acknowledged !== '') {
      where.push('acknowledged = ?'); vals.push(acknowledged === 'true' || acknowledged === '1' ? 1 : 0);
    }
    if (patientId) { where.push('patient_id = ?'); vals.push(patientId); }
    if (taskId) { where.push('lab_task_id = ?'); vals.push(taskId); }
    if (q) {
      where.push('(patient_name LIKE ? OR test_name LIKE ? OR lab_task_id LIKE ?)');
      const like = `%${q}%`;
      vals.push(like, like, like);
    }

    const alerts = await query(
      `SELECT * FROM lab_critical_alerts WHERE ${where.join(' AND ')}
       ORDER BY (status = 'Active') DESC, detected_at DESC
       LIMIT ? OFFSET ?`,
      [...vals, limit, offset]
    );

    const [{ activeCount }] = await query(
      "SELECT COUNT(*) AS activeCount FROM lab_critical_alerts WHERE status = 'Active'"
    );

    return Response.json({ alerts, activeCount: Number(activeCount) || 0, limit, offset });
  } catch (err) {
    console.error('critical-alerts list error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
