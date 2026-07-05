import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser, writeAuditLog } from '@/lib/auth-middleware';

export async function GET(request) {
  try {
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
    const body = await request.json();
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
    const { user, profile } = await getAuthenticatedUser();
    const body = await request.json();
    const { alertId, acknowledgedBy } = body;

    const timestamp = new Date().toLocaleDateString('en-GB') + ' ' +
                      new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    await query(
      `UPDATE lab_alerts SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = ? WHERE id = ?`,
      [acknowledgedBy || profile?.full_name || 'Doctor', timestamp, alertId]
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
