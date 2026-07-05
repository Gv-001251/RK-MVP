import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser, writeAuditLog } from '@/lib/auth-middleware';

export async function GET() {
  try {
    const data = await query('SELECT * FROM beds ORDER BY ward ASC, bed_number ASC');
    return Response.json({ beds: data });
  } catch (err) {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { user, profile } = await getAuthenticatedUser();
    const body = await request.json();
    // body: { patientId, bedId, doctorName, diagnosis, vitals, notes }

    const patientId = body.patientId || body.patient_id;
    const bedId     = body.bedId     || body.bed_id;

    // 1. Mark bed as Occupied
    await query(
      "UPDATE beds SET status = 'Occupied', patient_id = ?, updated_at = NOW() WHERE id = ?",
      [patientId, bedId]
    );

    // 2. Update patient type to IPD
    await query(
      "UPDATE patients SET patient_type = 'IPD', visit_status = 'Admitted', updated_at = NOW() WHERE id = ?",
      [patientId]
    );

    // 3. Create inpatient record
    const inpatientId = uuidv4();
    await query(
      `INSERT INTO inpatients (id, patient_id, bed_id, diagnosis, doctor_name, vitals, billing_status, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?, 'Admitted')`,
      [
        inpatientId,
        patientId,
        bedId,
        body.diagnosis  || '',
        body.doctorName || body.doctor_name || 'Dr. R. Kumar',
        body.vitals     || '',
        body.notes      || '',
      ]
    );

    const [newBed]        = await query('SELECT * FROM beds WHERE id = ?', [bedId]);
    const [updatedInpatient] = await query('SELECT * FROM inpatients WHERE id = ?', [inpatientId]);

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'ADMIT_PATIENT', entityType: 'bed', entityId: bedId,
      changes: body, request,
    });

    return Response.json({ bed: newBed, inpatient: updatedInpatient }, { status: 201 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
