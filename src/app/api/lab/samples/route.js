import { query } from '@/lib/mysql/db';
import { requireAuth } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';

/**
 * GET /api/lab/samples  — collection worklist.
 * Driven by lab_orders LEFT JOIN lab_samples, so orders with no sample row yet
 * appear as 'Ordered'. Filters: q, status, priority, limit, offset.
 * STAT/Urgent float to the top.
 */
export async function GET(request) {
  try {
    const { response } = await requireAuth(...ROLES.SAMPLE_READ);
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10) || 100, 300);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);

    const where = ["o.status <> 'Cancelled'"];
    const vals = [];
    if (status) { where.push("COALESCE(s.status, 'Ordered') = ?"); vals.push(status); }
    if (priority) { where.push('o.priority = ?'); vals.push(priority); }
    if (q) {
      where.push('(o.id LIKE ? OR o.accession_number LIKE ? OR o.patient_name LIKE ? OR o.patient_id LIKE ?)');
      const like = `%${q}%`;
      vals.push(like, like, like, like);
    }

    const samples = await query(
      `SELECT o.id AS lab_order_id, o.patient_name, o.patient_id, o.accession_number, o.barcode_value,
              o.priority, o.department, o.doctor_name, o.created_at AS ordered_at,
              COALESCE(s.status, 'Ordered') AS status,
              s.collector, s.sample_type, s.collected_at, s.rejection_reason
       FROM lab_orders o
       LEFT JOIN lab_samples s ON s.lab_order_id = o.id
       WHERE ${where.join(' AND ')}
       ORDER BY (o.priority = 'STAT') DESC, (o.priority = 'Urgent') DESC, o.created_at DESC
       LIMIT ? OFFSET ?`,
      [...vals, limit, offset]
    );

    return Response.json({ samples, limit, offset });
  } catch (err) {
    console.error('samples worklist error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
