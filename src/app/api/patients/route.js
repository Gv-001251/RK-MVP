import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser, writeAuditLog } from '@/lib/auth-middleware';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const gender = searchParams.get('gender') || '';
    const page   = parseInt(searchParams.get('page')  || '1');
    const limit  = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    let where  = 'WHERE 1=1';
    const params = [];

    if (search) {
      where += ' AND (name LIKE ? OR phone LIKE ? OR id LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (gender) {
      where += ' AND gender = ?';
      params.push(gender);
    }

    const [data, countRows] = await Promise.all([
      query(`SELECT * FROM patients ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]),
      query(`SELECT COUNT(*) AS total FROM patients ${where}`, params),
    ]);

    return Response.json({ patients: data, total: countRows[0].total, page, limit });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { user, profile } = await getAuthenticatedUser();
    const body = await request.json();

    // Generate patient ID: PAT-000001
    const seqRows = await query('INSERT INTO patient_id_seq () VALUES ()');
    const seq = seqRows.insertId;
    const patientId = `PAT-${String(seq).padStart(6, '0')}`;

    await query(
      `INSERT INTO patients
         (id, name, age, gender, phone, email, blood_group, allergies, address,
          emergency_contact, dob, visit_status, last_consultation, patient_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Waiting', 'Awaiting Examination', 'OPD', 'Active')`,
      [
        patientId,
        body.name,
        parseInt(body.age) || null,
        body.gender,
        body.phone,
        body.email || null,
        body.blood || body.blood_group || 'O+',
        body.allergies || 'None',
        body.address || null,
        body.emergencyContact || body.emergency_contact || null,
        body.dob || null,
      ]
    );

    const [data] = await query('SELECT * FROM patients WHERE id = ?', [patientId]);

    // Auto-create OPD queue entry
    const nextToken = String(Math.floor(100 + Math.random() * 900));
    await query(
      `INSERT INTO opd_queue (id, token, patient_id, doctor_name, specialty, status, check_in)
       VALUES (?, ?, ?, ?, 'General Consultation', 'Waiting', ?)`,
      [
        uuidv4(),
        nextToken,
        patientId,
        body.doctorName || 'Dr. R. Kumar',
        new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      ]
    );

    // Nursing note
    await query(
      `INSERT INTO nursing_notes (id, patient_id, author, priority, note_text)
       VALUES (?, ?, 'Frontdesk', 'Routine', ?)`,
      [uuidv4(), patientId, `Patient registered. Status: OPD Waiting. Token: ${nextToken}`]
    );

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'CREATE', entityType: 'patient', entityId: patientId,
      changes: { name: data.name }, request,
    });

    return Response.json({ patient: data, token: nextToken }, { status: 201 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
