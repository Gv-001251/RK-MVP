import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser, writeAuditLog } from '@/lib/auth-middleware';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const rows = await query('SELECT * FROM prescriptions WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) return Response.json({ error: 'Prescription not found' }, { status: 404 });

    const items = await query('SELECT * FROM prescription_items WHERE prescription_id = ?', [id]);
    rows[0].prescription_items = items;

    return Response.json({ prescription: rows[0] });
  } catch (err) {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile } = await getAuthenticatedUser();
    const body = await request.json();

    const sets = ['updated_at = NOW()'];  // prescriptions table has no updated_at but adding for safety
    const values = [];

    // prescriptions table has no updated_at column; only update status
    if (body.status !== undefined) { sets.push('status = ?'); values.push(body.status); }
    if (body.diagnosis !== undefined) { sets.push('diagnosis = ?'); values.push(body.diagnosis); }

    if (sets.length > 1) {
      values.push(id);
      // prescriptions has no updated_at so build without it
      const realSets = sets.filter(s => s !== 'updated_at = NOW()');
      await query(`UPDATE prescriptions SET ${realSets.join(', ')} WHERE id = ?`, values);
    }

    const [data] = await query('SELECT * FROM prescriptions WHERE id = ?', [id]);
    const items  = await query('SELECT * FROM prescription_items WHERE prescription_id = ?', [id]);
    data.prescription_items = items;

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'UPDATE_PRESCRIPTION', entityType: 'prescription', entityId: id,
      changes: body, request,
    });

    return Response.json({ prescription: data });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
