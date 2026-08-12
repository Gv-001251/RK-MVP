import { query } from '@/lib/mysql/db';
import { requireAuth } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';
import { loadCatalogMaps, catLookup, flagFor } from '@/lib/report-data';
import { parseLeadingNumber } from '@/lib/result-matching';

/**
 * GET /api/doctor/patients/[id]/trends?tests=GLUCOSE,POTASSIUM
 * Per-test numeric time series for the patient (oldest first), each point with
 * its abnormal flag, plus the catalog unit + reference range for the analyte.
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { response } = await requireAuth(...ROLES.REPORT_READ);
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const tests = (searchParams.get('tests') || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!tests.length) return Response.json({ series: {} });

    const ph = tests.map(() => '?').join(',');
    const rows = await query(
      `SELECT tt.test_name, tt.result_value, tt.completed_at, tt.lab_task_id AS order_id, o.created_at AS order_created
         FROM lab_task_tests tt JOIN lab_orders o ON o.id = tt.lab_task_id
        WHERE o.patient_id = ? AND tt.test_name IN (${ph})
        ORDER BY COALESCE(tt.completed_at, o.created_at) ASC`,
      [id, ...tests]
    );

    const maps = await loadCatalogMaps();
    const series = {};
    for (const r of rows) {
      const numeric = parseLeadingNumber(r.result_value);
      if (numeric == null) continue; // trends need numeric points
      const cat = catLookup(maps, r.test_name);
      const referenceRange = cat?.reference_range || null;
      if (!series[r.test_name]) {
        series[r.test_name] = { testName: r.test_name, unit: cat?.units || null, referenceRange, points: [] };
      }
      series[r.test_name].points.push({
        value: numeric,
        raw: r.result_value,
        at: r.completed_at || r.order_created,
        orderId: r.order_id,
        flag: flagFor(r.result_value, referenceRange),
      });
    }

    return Response.json({ series });
  } catch (err) {
    console.error('doctor trends error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
