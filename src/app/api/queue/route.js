import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser, writeAuditLog } from '@/lib/auth-middleware';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    const data = await query(
      `SELECT q.*, p.name, p.age, p.gender, p.phone, p.blood_group
       FROM opd_queue q
       LEFT JOIN patients p ON p.id = q.patient_id
       WHERE q.visit_date = ?
       ORDER BY q.token ASC`,
      [date]
    );

    return Response.json({ queue: data });
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
      `INSERT INTO opd_queue (id, token, patient_id, doctor_name, specialty, status, check_in, visit_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        body.token,
        body.patientId  || body.patient_id,
        body.doctorName || body.doctor_name,
        body.specialty  || 'General Consultation',
        body.status     || 'Waiting',
        body.checkIn    || body.check_in || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        body.visitDate  || body.visit_date || new Date().toISOString().split('T')[0],
      ]
    );

    const [data] = await query('SELECT * FROM opd_queue WHERE id = ?', [id]);

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'CREATE', entityType: 'opd_queue', entityId: id,
      changes: body, request,
    });

    return Response.json({ queueItem: data }, { status: 201 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
