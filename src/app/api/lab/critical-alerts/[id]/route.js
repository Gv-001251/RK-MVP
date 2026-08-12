import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/mysql/db';
import { requireAuth, writeAuditLog } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';
import { broadcastRealtimeEvent } from '@/lib/realtime-registry';

/** GET /api/lab/critical-alerts/[id] — alert detail + rule + notification log. */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { response } = await requireAuth(...ROLES.CRITICAL_READ);
    if (response) return response;

    const rows = await query('SELECT * FROM lab_critical_alerts WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) return Response.json({ error: 'Alert not found' }, { status: 404 });
    const alert = rows[0];

    const rule = alert.rule_id
      ? (await query('SELECT * FROM lab_critical_rules WHERE id = ? LIMIT 1', [alert.rule_id]))[0] || null
      : null;
    const notifications = await query(
      'SELECT event, channel, actor, role, detail, created_at FROM lab_critical_notifications WHERE alert_id = ? ORDER BY created_at ASC, id ASC',
      [id]
    );

    return Response.json({ alert, rule, notifications });
  } catch (err) {
    console.error('critical-alert detail error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/lab/critical-alerts/[id] — technician confirmation / acknowledge.
 * Body: { note? }. Records who confirmed (name + role), logs a notification,
 * writes an audit entry, and broadcasts so the live banner clears.
 */
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile, response } = await requireAuth(...ROLES.CRITICAL_ACK);
    if (response) return response;

    const rows = await query('SELECT * FROM lab_critical_alerts WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) return Response.json({ error: 'Alert not found' }, { status: 404 });
    const alert = rows[0];

    // Idempotent: already-confirmed alerts return as-is.
    if (alert.acknowledged) return Response.json({ alert });

    const body = await request.json().catch(() => ({}));
    const note = (body.note || '').trim() || null;
    const actor = profile?.full_name || 'Lab Staff';
    const role = profile?.role || 'unknown';

    await query(
      `UPDATE lab_critical_alerts
         SET acknowledged = 1, acknowledged_by = ?, acknowledged_role = ?, acknowledged_at = NOW(),
             status = 'Acknowledged', ack_note = ?
       WHERE id = ?`,
      [actor, role, note, id]
    );

    await query(
      `INSERT INTO lab_critical_notifications (id, alert_id, event, channel, actor, role, detail)
       VALUES (?, ?, 'acknowledged', 'in-app', ?, ?, ?)`,
      [uuidv4(), id, actor, role, note || 'Confirmed']
    );

    await writeAuditLog(null, {
      userId: user?.id, userName: actor,
      action: 'CRITICAL_ALERT_ACK', entityType: 'lab_critical_alert', entityId: id,
      changes: { test: alert.test_name, value: alert.result_value, role, note }, request,
    });

    broadcastRealtimeEvent('CRITICAL_ALERT_ACK', { id, acknowledgedBy: actor, role });

    const [updated] = await query('SELECT * FROM lab_critical_alerts WHERE id = ?', [id]);
    return Response.json({ alert: updated });
  } catch (err) {
    console.error('critical-alert ack error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
