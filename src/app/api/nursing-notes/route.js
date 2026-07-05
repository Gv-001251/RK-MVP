import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser, writeAuditLog } from '@/lib/auth-middleware';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get('patientId');

    let sql = 'SELECT * FROM nursing_notes';
    const params = [];

    if (patientId) {
      sql += ' WHERE patient_id = ?';
      params.push(patientId);
    }
    sql += ' ORDER BY created_at DESC';

    const data = await query(sql, params);
    return Response.json({ nursingNotes: data });
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
      `INSERT INTO nursing_notes (id, patient_id, author, priority, note_text)
       VALUES (?, ?, ?, ?, ?)`,
      [
        id,
        body.patientId  || body.patient_id,
        body.author     || profile?.full_name || 'Nurse Staff',
        body.priority   || 'Routine',
        body.text       || body.noteText || body.note_text,
      ]
    );

    const [data] = await query('SELECT * FROM nursing_notes WHERE id = ?', [id]);

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'CREATE_NURSING_NOTE', entityType: 'nursing_note', entityId: id,
      changes: body, request,
    });

    return Response.json({ nursingNote: data }, { status: 201 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
