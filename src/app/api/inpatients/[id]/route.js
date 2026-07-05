import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser, writeAuditLog } from '@/lib/auth-middleware';

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile } = await getAuthenticatedUser();
    const body = await request.json();

    // Fetch current record
    const [currentInpatient] = await query('SELECT * FROM inpatients WHERE id = ?', [id]);
    if (!currentInpatient) {
      return Response.json({ error: 'Inpatient record not found' }, { status: 404 });
    }

    const sets = ['updated_at = NOW()'];
    const values = [];

    if (body.action === 'discharge') {
      sets.push('status = ?', 'discharge_date = ?', 'notes = ?');
      values.push('Discharged', body.dischargeDate || new Date().toISOString(), body.notes || currentInpatient.notes);

      // Free the bed
      if (currentInpatient.bed_id) {
        await query(
          "UPDATE beds SET status = 'Available', patient_id = NULL, updated_at = NOW() WHERE id = ?",
          [currentInpatient.bed_id]
        );
      }
      // Update patient status
      if (currentInpatient.patient_id) {
        await query(
          "UPDATE patients SET visit_status = 'Discharged', updated_at = NOW() WHERE id = ?",
          [currentInpatient.patient_id]
        );
      }

      await writeAuditLog(null, {
        userId: user?.id, userName: profile?.full_name,
        action: 'DISCHARGE_INPATIENT', entityType: 'inpatient', entityId: id,
        changes: { action: 'discharge' }, request,
      });
    } else {
      if (body.vitals        !== undefined) { sets.push('vitals = ?');         values.push(body.vitals); }
      if (body.notes         !== undefined) { sets.push('notes = ?');          values.push(body.notes); }
      if (body.diagnosis     !== undefined) { sets.push('diagnosis = ?');      values.push(body.diagnosis); }
      if (body.billingStatus !== undefined) { sets.push('billing_status = ?'); values.push(body.billingStatus); }

      await writeAuditLog(null, {
        userId: user?.id, userName: profile?.full_name,
        action: 'UPDATE_INPATIENT', entityType: 'inpatient', entityId: id,
        changes: body, request,
      });
    }

    values.push(id);
    await query(`UPDATE inpatients SET ${sets.join(', ')} WHERE id = ?`, values);
    const [updatedInpatient] = await query('SELECT * FROM inpatients WHERE id = ?', [id]);

    return Response.json({ inpatient: updatedInpatient });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
