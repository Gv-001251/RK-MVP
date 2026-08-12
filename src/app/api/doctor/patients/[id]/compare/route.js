import { query } from '@/lib/mysql/db';
import { requireAuth } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';
import { loadCatalogMaps, catLookup, flagFor } from '@/lib/report-data';

/**
 * GET /api/doctor/patients/[id]/compare?orders=A,B,C
 * Side-by-side comparison: a matrix of tests (rows) x orders (columns), each
 * cell carrying the result value + abnormal flag. Orders are validated to
 * belong to the patient.
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { response } = await requireAuth(...ROLES.REPORT_READ);
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const requested = (searchParams.get('orders') || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 5);
    if (requested.length < 1) return Response.json({ error: 'Provide orders to compare.' }, { status: 400 });

    const ph = requested.map(() => '?').join(',');
    const orderMeta = await query(
      `SELECT id, accession_number, created_at, report_generated_at, status FROM lab_orders
        WHERE patient_id = ? AND id IN (${ph}) ORDER BY created_at ASC`,
      [id, ...requested]
    );
    if (!orderMeta.length) return Response.json({ error: 'No matching orders for this patient.' }, { status: 404 });
    const orderIds = orderMeta.map(o => o.id);

    const resultRows = await query(
      `SELECT lab_task_id AS order_id, test_name, result_value FROM lab_task_tests WHERE lab_task_id IN (${orderIds.map(() => '?').join(',')})`,
      orderIds
    );

    const maps = await loadCatalogMaps();
    const rowMap = {};
    for (const r of resultRows) {
      const cat = catLookup(maps, r.test_name);
      const referenceRange = cat?.reference_range || null;
      if (!rowMap[r.test_name]) {
        rowMap[r.test_name] = { testName: r.test_name, unit: cat?.units || null, referenceRange, values: {} };
      }
      rowMap[r.test_name].values[r.order_id] = { result: r.result_value, flag: flagFor(r.result_value, referenceRange) };
    }

    const rows = Object.values(rowMap).sort((a, b) => a.testName.localeCompare(b.testName));
    const orders = orderMeta.map(o => ({ id: o.id, accession: o.accession_number, date: o.report_generated_at || o.created_at, status: o.status }));

    return Response.json({ orders, rows });
  } catch (err) {
    console.error('doctor compare error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
