import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser, writeAuditLog } from '@/lib/auth-middleware';

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile } = await getAuthenticatedUser();
    const body = await request.json();

    const sets = ['updated_at = NOW()'];
    const values = [];

    if (body.status      !== undefined) { sets.push('status = ?');      values.push(body.status); }
    if (body.doctor_name !== undefined) { sets.push('doctor_name = ?'); values.push(body.doctor_name); }
    if (body.doctorName  !== undefined) { sets.push('doctor_name = ?'); values.push(body.doctorName); }
    if (body.specialty   !== undefined) { sets.push('specialty = ?');   values.push(body.specialty); }

    values.push(id);
    await query(`UPDATE opd_queue SET ${sets.join(', ')} WHERE id = ?`, values);
    const [data] = await query('SELECT * FROM opd_queue WHERE id = ?', [id]);

    // Sync patient visit_status
    if (data?.patient_id) {
      if (body.status === 'Completed') {
        await query("UPDATE patients SET visit_status = 'Completed' WHERE id = ?", [data.patient_id]);
      } else if (body.status === 'In-Consultation') {
        await query("UPDATE patients SET visit_status = 'In-Consultation' WHERE id = ?", [data.patient_id]);
      }
    }

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'UPDATE_STATUS', entityType: 'opd_queue', entityId: id,
      changes: body, request,
    });

    return Response.json({ queueItem: data });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
