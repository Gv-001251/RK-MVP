import { query } from '@/lib/mysql/db';
import { requireAuth } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';

/**
 * GET /api/doctor/patients — patient search for the doctor portal, enriched
 * with a per-patient lab summary (orders, reports, active critical alerts).
 * Params: q (name/id/phone), limit.
 */
export async function GET(request) {
  try {
    const { response } = await requireAuth(...ROLES.REPORT_READ);
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();
    const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10) || 25, 100);

    let patients;
    if (q) {
      const like = `%${q}%`;
      patients = await query(
        'SELECT id, name, age, gender, phone, blood_group FROM patients WHERE name LIKE ? OR id LIKE ? OR phone LIKE ? ORDER BY name ASC LIMIT ?',
        [like, like, like, limit]
      );
    } else {
      patients = await query('SELECT id, name, age, gender, phone, blood_group FROM patients ORDER BY created_at DESC LIMIT ?', [limit]);
    }

    if (patients.length) {
      const ids = patients.map(p => p.id);
      const ph = ids.map(() => '?').join(',');
      const [orders, reports, criticals] = await Promise.all([
        query(`SELECT patient_id, COUNT(*) AS c, MAX(created_at) AS last FROM lab_orders WHERE patient_id IN (${ph}) GROUP BY patient_id`, ids).catch(() => []),
        query(`SELECT patient_id, COUNT(*) AS c FROM lab_reports WHERE patient_id IN (${ph}) GROUP BY patient_id`, ids).catch(() => []),
        query(`SELECT patient_id, COUNT(*) AS c FROM lab_critical_alerts WHERE patient_id IN (${ph}) AND status = 'Active' GROUP BY patient_id`, ids).catch(() => []),
      ]);
      const om = Object.fromEntries(orders.map(r => [r.patient_id, r]));
      const rm = Object.fromEntries(reports.map(r => [r.patient_id, Number(r.c)]));
      const cm = Object.fromEntries(criticals.map(r => [r.patient_id, Number(r.c)]));
      patients.forEach(p => {
        p.orderCount = om[p.id] ? Number(om[p.id].c) : 0;
        p.lastOrderAt = om[p.id]?.last || null;
        p.reportCount = rm[p.id] || 0;
        p.activeCriticals = cm[p.id] || 0;
      });
    }

    return Response.json({ patients });
  } catch (err) {
    console.error('doctor patients search error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
