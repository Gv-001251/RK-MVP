import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/mysql/db';
import { requireAuth, writeAuditLog } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';

export async function GET(request) {
  try {
    const { response } = await requireAuth(...ROLES.LAB_READ);
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const patientId    = searchParams.get('patientId');
    const acknowledged = searchParams.get('acknowledged');

    let sql = 'SELECT * FROM lab_alerts WHERE 1=1';
    const params = [];

    if (patientId)             { sql += ' AND patient_id = ?';    params.push(patientId); }
    if (acknowledged !== null && acknowledged !== undefined) {
      sql += ' AND acknowledged = ?';
      params.push(acknowledged === 'true' ? 1 : 0);
    }
    sql += ' ORDER BY created_at DESC';

    const data = await query(sql, params);
    return Response.json({ labAlerts: data });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { response } = await requireAuth(...ROLES.LAB_STAFF);
    if (response) return response;

    const body = await request.json();

    if (!body.patientId || !body.testName || body.value === undefined || body.value === null || body.value === '') {
      return Response.json({ error: 'patientId, testName and value are required' }, { status: 400 });
    }

    const id = uuidv4();

    await query(
      `INSERT INTO lab_alerts
         (id, patient_id, patient_name, order_number, test_name, parameter, value, ref_range, severity, acknowledged)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        id,
        body.patientId,
        body.patientName  || 'Unknown',
        body.orderNumber,
        body.testName,
        body.parameter    || body.testName,
        body.value,
        body.refRange     || 'n/a',
        body.severity     || 'High',
      ]
    );

    const [data] = await query('SELECT * FROM lab_alerts WHERE id = ?', [id]);
    return Response.json({ labAlert: data }, { status: 201 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const { user, profile, response } = await requireAuth(...ROLES.ALERT_ACK);
    if (response) return response;

    const body = await request.json();
    const { alertId, acknowledgedBy } = body;

    await query(
      `UPDATE lab_alerts SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = ? WHERE id = ?`,
      [acknowledgedBy || profile?.full_name || 'Doctor', new Date(), alertId]
    );

    const [data] = await query('SELECT * FROM lab_alerts WHERE id = ?', [alertId]);

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'ACKNOWLEDGE_ALERT', entityType: 'lab_alert', entityId: alertId,
      changes: { acknowledged: true }, request,
    });

    return Response.json({ labAlert: data });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
