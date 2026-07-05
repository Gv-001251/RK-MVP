import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser, writeAuditLog } from '@/lib/auth-middleware';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get('patientId');

    let sql = `SELECT ds.*, p.name AS patient_name, p.phone AS patient_phone
               FROM discharge_summaries ds
               LEFT JOIN patients p ON p.id = ds.patient_id`;
    const params = [];

    if (patientId) {
      sql += ' WHERE ds.patient_id = ?';
      params.push(patientId);
    }
    sql += ' ORDER BY ds.created_at DESC';

    const data = await query(sql, params);
    return Response.json({ dischargeSummaries: data });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { user, profile } = await getAuthenticatedUser();
    const body = await request.json();
    const id = uuidv4();

    await query(
      `INSERT INTO discharge_summaries
         (id, patient_id, inpatient_id, admission_date, discharge_date, diagnosis,
          treatment_summary, lab_summary, medicines_summary, follow_up_date,
          follow_up_instructions, doctor_notes, doctor_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        body.patientId            || body.patient_id,
        body.inpatientId          || body.inpatient_id        || null,
        body.admissionDate        || body.admission_date       || null,
        body.dischargeDate        || body.discharge_date       || null,
        body.diagnosis            || '',
        body.treatmentSummary     || body.treatment_summary    || '',
        body.labSummary           || body.lab_summary          || '',
        body.medicinesSummary     || body.medicines_summary    || '',
        body.followUpDate         || body.follow_up_date       || null,
        body.followUpInstructions || body.follow_up_instructions || '',
        body.doctorNotes          || body.doctor_notes         || '',
        body.doctorName           || body.doctor_name          || profile?.full_name || 'Dr. Kumar',
      ]
    );

    const [data] = await query('SELECT * FROM discharge_summaries WHERE id = ?', [id]);

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'CREATE_DISCHARGE_SUMMARY', entityType: 'discharge_summary', entityId: id,
      changes: body, request,
    });

    return Response.json({ dischargeSummary: data }, { status: 201 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
