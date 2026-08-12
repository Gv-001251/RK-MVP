import { query } from '@/lib/mysql/db';
import { requireAuth } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';

/**
 * GET /api/lab/critical-notifications — append-only notification log.
 * Joins the alert for context (patient / test / value / severity).
 * Filters: alertId, event, limit.
 */
export async function GET(request) {
  try {
    const { response } = await requireAuth(...ROLES.CRITICAL_READ);
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const alertId = searchParams.get('alertId');
    const event = searchParams.get('event');
    const limit = Math.min(parseInt(searchParams.get('limit') || '150', 10) || 150, 500);

    const where = ['1=1'];
    const vals = [];
    if (alertId) { where.push('n.alert_id = ?'); vals.push(alertId); }
    if (event) { where.push('n.event = ?'); vals.push(event); }

    const notifications = await query(
      `SELECT n.id, n.alert_id, n.event, n.channel, n.actor, n.role, n.detail, n.created_at,
              a.patient_name, a.test_name, a.result_value, a.threshold_text, a.severity, a.status, a.acknowledged
       FROM lab_critical_notifications n
       LEFT JOIN lab_critical_alerts a ON a.id = n.alert_id
       WHERE ${where.join(' AND ')}
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT ?`,
      [...vals, limit]
    );

    return Response.json({ notifications });
  } catch (err) {
    console.error('critical-notifications list error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
