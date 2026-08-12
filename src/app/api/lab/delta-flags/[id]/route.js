import { query } from '@/lib/mysql/db';
import { requireAuth, writeAuditLog } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';
import { broadcastRealtimeEvent } from '@/lib/realtime-registry';

const REVIEW_ACTIONS = ['accepted', 'rejected', 'dismissed'];

/** GET /api/lab/delta-flags/[id] — flag detail + the rule that produced it. */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { response } = await requireAuth(...ROLES.DELTA_READ);
    if (response) return response;

    const rows = await query('SELECT * FROM lab_delta_flags WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) return Response.json({ error: 'Delta flag not found' }, { status: 404 });
    const flag = rows[0];
    const rule = flag.rule_id
      ? (await query('SELECT * FROM lab_delta_rules WHERE id = ? LIMIT 1', [flag.rule_id]))[0] || null
      : null;

    return Response.json({ flag, rule });
  } catch (err) {
    console.error('delta-flag detail error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/lab/delta-flags/[id] — manual verification of a delta flag.
 * Body: { action: accepted|rejected|dismissed, note? }
 * Records who reviewed (name + role), writes an audit entry, and broadcasts.
 */
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile, response } = await requireAuth(...ROLES.DELTA_REVIEW);
    if (response) return response;

    const rows = await query('SELECT * FROM lab_delta_flags WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) return Response.json({ error: 'Delta flag not found' }, { status: 404 });
    const flag = rows[0];

    // Idempotent: an already-reviewed flag is returned unchanged.
    if (flag.status !== 'Flagged') return Response.json({ flag });

    const body = await request.json().catch(() => ({}));
    const action = (body.action || 'accepted').trim();
    if (!REVIEW_ACTIONS.includes(action)) {
      return Response.json({ error: `action must be one of: ${REVIEW_ACTIONS.join(', ')}` }, { status: 400 });
    }
    const note = (body.note || '').trim() || null;
    const actor = profile?.full_name || 'Lab Staff';
    const role = profile?.role || 'unknown';
    const newStatus = action === 'dismissed' ? 'Dismissed' : 'Reviewed';

    await query(
      `UPDATE lab_delta_flags
         SET status = ?, review_action = ?, reviewed_by = ?, reviewed_role = ?, reviewed_at = NOW(), review_note = ?
       WHERE id = ?`,
      [newStatus, action, actor, role, note, id]
    );

    await writeAuditLog(null, {
      userId: user?.id, userName: actor,
      action: 'DELTA_FLAG_REVIEW', entityType: 'lab_delta_flag', entityId: id,
      changes: { test: flag.test_name, current: flag.current_value, previous: flag.previous_value, action, role, note }, request,
    });

    broadcastRealtimeEvent('DELTA_FLAG_REVIEWED', { id, action, reviewedBy: actor, role });

    const [updated] = await query('SELECT * FROM lab_delta_flags WHERE id = ?', [id]);
    return Response.json({ flag: updated });
  } catch (err) {
    console.error('delta-flag review error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
