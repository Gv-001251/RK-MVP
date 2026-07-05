import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser, writeAuditLog } from '@/lib/auth-middleware';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get('patientId');
    const status    = searchParams.get('status');

    let sql = `SELECT rx.*, p.name AS patient_name
               FROM prescriptions rx
               LEFT JOIN patients p ON p.id = rx.patient_id`;
    const params = [];
    const wheres = [];

    if (patientId) { wheres.push('rx.patient_id = ?'); params.push(patientId); }
    if (status)    { wheres.push('rx.status = ?');      params.push(status); }
    if (wheres.length) sql += ' WHERE ' + wheres.join(' AND ');
    sql += ' ORDER BY rx.created_at DESC';

    const prescriptions = await query(sql, params);

    // Attach items for each prescription
    if (prescriptions.length) {
      const ids = prescriptions.map(r => r.id);
      const placeholders = ids.map(() => '?').join(',');
      const items = await query(
        `SELECT * FROM prescription_items WHERE prescription_id IN (${placeholders})`,
        ids
      );
      const itemMap = {};
      for (const item of items) {
        if (!itemMap[item.prescription_id]) itemMap[item.prescription_id] = [];
        itemMap[item.prescription_id].push(item);
      }
      for (const rx of prescriptions) rx.prescription_items = itemMap[rx.id] || [];
    }

    return Response.json({ prescriptions });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { user, profile } = await getAuthenticatedUser();
    const body = await request.json();
    // body: { patientId, doctorName, diagnosis, symptoms, items: [{medicineName, dose, duration, instructions}], rxHandwriting, followUpDate }

    const { v4: uuidv4 } = await import('uuid');
    const rxId = `RK-RX-${Math.floor(1000 + Math.random() * 9000)}`;

    await query(
      `INSERT INTO prescriptions (id, patient_id, doctor_name, diagnosis, symptoms, status, rx_handwriting, follow_up_date)
       VALUES (?, ?, ?, ?, ?, 'Pending', ?, ?)`,
      [
        rxId,
        body.patientId    || body.patient_id,
        body.doctorName   || body.doctor_name   || profile?.full_name || 'Dr. Kumar',
        body.diagnosis    || '',
        body.symptoms     || '',
        body.rxHandwriting || body.rx_handwriting || null,
        body.followUpDate  || body.follow_up_date || null,
      ]
    );

    // Insert prescription items
    if (body.items?.length) {
      for (const item of body.items) {
        await query(
          `INSERT INTO prescription_items (id, prescription_id, medicine_name, dose, duration, instructions)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [uuidv4(), rxId, item.medicineName || item.medicine_name, item.dose || '', item.duration || '', item.instructions || '']
        );
      }
    }

    const [data] = await query('SELECT * FROM prescriptions WHERE id = ?', [rxId]);
    const items  = await query('SELECT * FROM prescription_items WHERE prescription_id = ?', [rxId]);
    data.prescription_items = items;

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'CREATE_PRESCRIPTION', entityType: 'prescription', entityId: rxId,
      changes: { patientId: body.patientId }, request,
    });

    return Response.json({ prescription: data }, { status: 201 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
