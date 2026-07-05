import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser, writeAuditLog } from '@/lib/auth-middleware';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const rows = await query('SELECT * FROM patients WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) return Response.json({ error: 'Patient not found' }, { status: 404 });
    return Response.json({ patient: rows[0] });
  } catch (err) {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile } = await getAuthenticatedUser();
    const body = await request.json();

    const allowed = [
      'name','age','gender','phone','email','blood_group','allergies','address',
      'emergency_contact','dob','visit_status','last_consultation','visit_time',
      'patient_type','status',
    ];
    const sets = ['updated_at = NOW()'];
    const values = [];

    for (const key of allowed) {
      if (body[key] !== undefined) {
        sets.push(`${key} = ?`);
        values.push(body[key]);
      }
    }
    values.push(id);

    await query(`UPDATE patients SET ${sets.join(', ')} WHERE id = ?`, values);
    const [data] = await query('SELECT * FROM patients WHERE id = ?', [id]);

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'UPDATE', entityType: 'patient', entityId: id,
      changes: body, request,
    });

    return Response.json({ patient: data });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile } = await getAuthenticatedUser();

    await query('DELETE FROM patients WHERE id = ?', [id]);

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'DELETE', entityType: 'patient', entityId: id, request,
    });

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
