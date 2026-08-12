import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/mysql/db';
import { requireAuth, writeAuditLog } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';
import { assembleReport } from '@/lib/report-data';

/** GET /api/lab/reports — report history. Filters: q, from, to, limit. */
export async function GET(request) {
  try {
    const { response } = await requireAuth(...ROLES.REPORT_READ);
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10) || 100, 500);

    const where = ['1=1'];
    const vals = [];
    if (q) {
      where.push('(report_no LIKE ? OR patient_name LIKE ? OR accession_number LIKE ? OR lab_order_id LIKE ?)');
      const like = `%${q}%`;
      vals.push(like, like, like, like);
    }
    if (from) { where.push('generated_at >= ?'); vals.push(from); }
    if (to) { where.push('generated_at <= ?'); vals.push(to); }

    const reports = await query(
      `SELECT * FROM lab_reports WHERE ${where.join(' AND ')} ORDER BY generated_at DESC LIMIT ?`,
      [...vals, limit]
    );
    return Response.json({ reports });
  } catch (err) {
    console.error('reports history error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/lab/reports — generate a report (snapshot + QR verification token). */
export async function POST(request) {
  try {
    const { user, profile, response } = await requireAuth(...ROLES.REPORT_MANAGE);
    if (response) return response;

    const body = await request.json();
    const orderId = (body.orderId || '').trim();
    if (!orderId) return Response.json({ error: 'orderId is required.' }, { status: 400 });

    const data = await assembleReport(orderId);
    if (!data) return Response.json({ error: 'Order not found' }, { status: 404 });

    const id = uuidv4();
    const token = uuidv4();
    const reportNo = `RKR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${id.slice(0, 4).toUpperCase()}`;
    const status = data.verification?.status || data.order.status || 'Preliminary';

    await query(
      `INSERT INTO lab_reports
         (id, report_no, lab_order_id, patient_id, patient_name, doctor_name, accession_number,
          verification_token, status, test_count, abnormal_count, critical_count, generated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, reportNo, orderId, data.order.patient_id || null, data.order.patient_name || null,
        data.order.doctor_name || null, data.order.accession_number || null, token, status,
        data.counts.tests, data.counts.abnormal, data.counts.critical, profile?.full_name || 'Lab Staff',
      ]
    );

    await query('UPDATE lab_orders SET report_generated_at = NOW(), updated_at = NOW() WHERE id = ?', [orderId]).catch(() => {});

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'REPORT_GENERATED', entityType: 'lab_report', entityId: id,
      changes: { reportNo, orderId, status, counts: data.counts }, request,
    });

    const [report] = await query('SELECT * FROM lab_reports WHERE id = ?', [id]);
    return Response.json({ report }, { status: 201 });
  } catch (err) {
    console.error('report generate error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
