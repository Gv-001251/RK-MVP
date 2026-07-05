import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser, writeAuditLog } from '@/lib/auth-middleware';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    let sql = `SELECT a.*, p.name AS patient_name, p.phone AS patient_phone
               FROM appointments a
               LEFT JOIN patients p ON p.id = a.patient_id`;
    const params = [];

    if (date) {
      sql += ' WHERE a.appointment_date = ?';
      params.push(date);
    }
    sql += ' ORDER BY a.appointment_time ASC';

    const data = await query(sql, params);
    return Response.json({ appointments: data });
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
      `INSERT INTO appointments (id, patient_id, doctor_name, appointment_date, appointment_time, title, type, status, hospital, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Scheduled', ?, ?)`,
      [
        id,
        body.patientId       || body.patient_id,
        body.doctorName      || body.doctor_name || 'Dr. R. Kumar',
        body.appointmentDate || body.appointment_date,
        body.appointmentTime || body.appointment_time,
        body.title           || 'Specialist Consultation',
        body.type            || 'appointment',
        body.hospital        || 'RK Clinic',
        body.notes           || '',
      ]
    );

    const [data] = await query('SELECT * FROM appointments WHERE id = ?', [id]);

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'CREATE_APPOINTMENT', entityType: 'appointment', entityId: id,
      changes: body, request,
    });

    return Response.json({ appointment: data }, { status: 201 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
