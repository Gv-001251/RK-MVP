import { query } from '@/lib/mysql/db';
import { requireAuth } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';

/**
 * GET /api/lab/verifications — verification worklist.
 * Orders whose results are in (at least one result value) with their current
 * verification status (default 'Pending'). Filters: q, status, limit, offset.
 */
export async function GET(request) {
  try {
    const { response } = await requireAuth(...ROLES.VERIFY_READ);
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();
    const status = searchParams.get('status');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10) || 100, 300);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);

    const where = [
      "o.status <> 'Cancelled'",
      "EXISTS (SELECT 1 FROM lab_task_tests tt WHERE tt.lab_task_id = o.id AND tt.result_value IS NOT NULL AND tt.result_value <> '')",
    ];
    const vals = [];
    if (status) { where.push("COALESCE(v.status, 'Pending') = ?"); vals.push(status); }
    if (q) {
      where.push('(o.id LIKE ? OR o.accession_number LIKE ? OR o.patient_name LIKE ? OR o.patient_id LIKE ?)');
      const like = `%${q}%`;
      vals.push(like, like, like, like);
    }

    const rows = await query(
      `SELECT o.id AS lab_order_id, o.accession_number, o.patient_name, o.patient_id, o.priority, o.department,
              COALESCE(v.status, 'Pending') AS status, o.updated_at,
              (SELECT COUNT(*) FROM lab_task_tests tt WHERE tt.lab_task_id = o.id AND tt.result_value IS NOT NULL AND tt.result_value <> '') AS result_count
       FROM lab_orders o
       LEFT JOIN lab_verifications v ON v.lab_order_id = o.id
       WHERE ${where.join(' AND ')}
       ORDER BY (o.priority = 'STAT') DESC, (o.priority = 'Urgent') DESC, o.updated_at DESC
       LIMIT ? OFFSET ?`,
      [...vals, limit, offset]
    );

    return Response.json({ verifications: rows, limit, offset });
  } catch (err) {
    console.error('verifications worklist error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
