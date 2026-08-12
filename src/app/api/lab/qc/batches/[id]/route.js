import { query } from '@/lib/mysql/db';
import { requireAuth, writeAuditLog } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';
import { broadcastRealtimeEvent } from '@/lib/realtime-registry';

/** GET /api/lab/qc/batches/[id] — batch detail + its results. */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { response } = await requireAuth(...ROLES.QC_READ);
    if (response) return response;

    const rows = await query('SELECT * FROM qc_batches WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) return Response.json({ error: 'QC batch not found' }, { status: 404 });
    const results = await query('SELECT * FROM qc_results WHERE batch_id = ? ORDER BY test_name, control_level', [id]);
    return Response.json({ batch: rows[0], results });
  } catch (err) {
    console.error('qc batch detail error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/lab/qc/batches/[id] — override a rejected QC batch.
 * Body: { reason }. Releases the verification block with a supervisor sign-off.
 */
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile, response } = await requireAuth(...ROLES.QC_OVERRIDE);
    if (response) return response;

    const rows = await query('SELECT * FROM qc_batches WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) return Response.json({ error: 'QC batch not found' }, { status: 404 });
    if (rows[0].status !== 'Rejected') {
      return Response.json({ error: 'Only a rejected batch can be overridden.' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const reason = (body.reason || '').trim();
    if (!reason) return Response.json({ error: 'An override reason is required.' }, { status: 400 });

    const actor = profile?.full_name || 'Supervisor';
    await query(
      `UPDATE qc_batches SET status = 'Overridden', overridden_by = ?, override_reason = ?, overridden_at = NOW(), updated_at = NOW() WHERE id = ?`,
      [actor, reason, id]
    );

    await writeAuditLog(null, {
      userId: user?.id, userName: actor,
      action: 'QC_BATCH_OVERRIDE', entityType: 'qc_batch', entityId: id,
      changes: { analyzerId: rows[0].analyzer_id, reason }, request,
    });

    broadcastRealtimeEvent('QC_BATCH', { batchId: id, analyzerId: rows[0].analyzer_id, status: 'Overridden' });

    const [batch] = await query('SELECT * FROM qc_batches WHERE id = ?', [id]);
    return Response.json({ batch });
  } catch (err) {
    console.error('qc batch override error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
