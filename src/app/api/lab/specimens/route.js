import { query } from '@/lib/mysql/db';
import { requireAuth } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';

/**
 * GET /api/lab/specimens — searchable list of specimens with their current
 * status and last tracked event. Filters: q, status, limit, offset.
 */
export async function GET(request) {
  try {
    const { response } = await requireAuth(...ROLES.SAMPLE_READ);
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();
    const status = searchParams.get('status');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10) || 100, 300);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);

    const where = ["o.status <> 'Cancelled'"];
    const vals = [];
    if (status) { where.push('o.status = ?'); vals.push(status); }
    if (q) {
      where.push('(o.id LIKE ? OR o.accession_number LIKE ? OR o.barcode_value LIKE ? OR o.patient_name LIKE ? OR o.patient_id LIKE ?)');
      const like = `%${q}%`;
      vals.push(like, like, like, like, like);
    }

    const specimens = await query(
      `SELECT o.id AS lab_order_id, o.accession_number, o.barcode_value, o.patient_name, o.patient_id,
              o.priority, o.status, o.department, o.created_at AS ordered_at,
              (SELECT MAX(created_at) FROM lab_sample_events e WHERE e.lab_order_id = o.id) AS last_event_at,
              (SELECT COUNT(*) FROM lab_sample_events e WHERE e.lab_order_id = o.id) AS event_count
       FROM lab_orders o
       WHERE ${where.join(' AND ')}
       ORDER BY COALESCE((SELECT MAX(created_at) FROM lab_sample_events e WHERE e.lab_order_id = o.id), o.created_at) DESC
       LIMIT ? OFFSET ?`,
      [...vals, limit, offset]
    );

    return Response.json({ specimens, limit, offset });
  } catch (err) {
    console.error('specimens list error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
