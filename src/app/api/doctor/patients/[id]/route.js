import { query } from '@/lib/mysql/db';
import { requireAuth } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';

/**
 * GET /api/doctor/patients/[id] — patient lab workspace payload:
 * demographics, lab orders (with test counts), generated reports, critical
 * alerts, and the distinct analytes available for trending.
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { response } = await requireAuth(...ROLES.REPORT_READ);
    if (response) return response;

    const patientRows = await query('SELECT id, name, age, gender, phone, email, blood_group, allergies FROM patients WHERE id = ? LIMIT 1', [id]);
    if (!patientRows.length) return Response.json({ error: 'Patient not found' }, { status: 404 });

    const orders = await query(
      `SELECT o.id, o.accession_number, o.status, o.priority, o.department, o.doctor_name,
              o.order_time, o.created_at, o.report_generated_at,
              (SELECT COUNT(*) FROM lab_task_tests tt WHERE tt.lab_task_id = o.id) AS test_count
         FROM lab_orders o WHERE o.patient_id = ? ORDER BY o.created_at DESC LIMIT 100`,
      [id]
    );

    const reports = await query('SELECT * FROM lab_reports WHERE patient_id = ? ORDER BY generated_at DESC LIMIT 100', [id]).catch(() => []);
    const criticals = await query('SELECT * FROM lab_critical_alerts WHERE patient_id = ? ORDER BY detected_at DESC LIMIT 100', [id]).catch(() => []);

    const analyteRows = await query(
      `SELECT DISTINCT tt.test_name
         FROM lab_task_tests tt JOIN lab_orders o ON o.id = tt.lab_task_id
        WHERE o.patient_id = ? AND tt.result_value IS NOT NULL AND tt.result_value <> ''
        ORDER BY tt.test_name`,
      [id]
    );
    const analytes = analyteRows.map(r => r.test_name);

    return Response.json({ patient: patientRows[0], orders, reports, criticals, analytes });
  } catch (err) {
    console.error('doctor patient detail error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
