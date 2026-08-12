import { query } from '@/lib/mysql/db';
import { requireAuth } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';
import { assembleReport } from '@/lib/report-data';

/**
 * GET /api/lab/reports/data/[orderId]
 * Full assembled report payload for rendering: order, patient, doctor, tests
 * (with reference ranges + abnormal flags), criticals, verification signature,
 * counts, plus the latest generated report record (report_no + QR token) and
 * the specimen barcode value.
 */
export async function GET(request, { params }) {
  try {
    const { orderId } = await params;
    const { response } = await requireAuth(...ROLES.REPORT_READ);
    if (response) return response;

    const data = await assembleReport(orderId);
    if (!data) return Response.json({ error: 'Order not found' }, { status: 404 });

    const report = (await query(
      'SELECT * FROM lab_reports WHERE lab_order_id = ? ORDER BY generated_at DESC LIMIT 1', [orderId]
    ))[0] || null;

    const barcodeValue = data.order.accession_number || data.order.id;

    return Response.json({ ...data, report, barcodeValue });
  } catch (err) {
    console.error('report data error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
