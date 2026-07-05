import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser, writeAuditLog } from '@/lib/auth-middleware';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let sql = `SELECT ip.*, p.name AS patient_name, p.age, p.gender, p.phone,
                      b.ward, b.bed_number, b.bed_type
               FROM inpatients ip
               LEFT JOIN patients p ON p.id = ip.patient_id
               LEFT JOIN beds b ON b.id = ip.bed_id`;
    const params = [];

    if (status) {
      sql += ' WHERE ip.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY ip.admission_date DESC';

    const data = await query(sql, params);
    return Response.json({ inpatients: data });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { user, profile } = await getAuthenticatedUser();
    const body = await request.json();

    // This is typically handled via /api/beds POST (admit).
    // A direct inpatient POST is kept for flexibility.
    const { v4: uuidv4 } = await import('uuid');
    const id = uuidv4();

    await query(
      `INSERT INTO inpatients (id, patient_id, bed_id, diagnosis, doctor_name, vitals, billing_status, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        body.patientId   || body.patient_id,
        body.bedId       || body.bed_id || null,
        body.diagnosis   || '',
        body.doctorName  || body.doctor_name || '',
        body.vitals      || '',
        body.billingStatus || body.billing_status || 'Pending',
        body.notes       || '',
        body.status      || 'Admitted',
      ]
    );

    const [inpatient] = await query('SELECT * FROM inpatients WHERE id = ?', [id]);

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'CREATE_INPATIENT', entityType: 'inpatient', entityId: id,
      changes: body, request,
    });

    return Response.json({ inpatient }, { status: 201 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
