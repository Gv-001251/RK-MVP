import { query } from '@/lib/mysql/db';
import { requireAuth } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';

/**
 * GET /api/lab/analyzers/[id]/logs — communication log for one analyzer.
 * Filters: event, limit. Newest first.
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { response } = await requireAuth(...ROLES.ANALYZER_READ);
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const event = searchParams.get('event');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10) || 100, 500);

    const where = ['analyzer_id = ?'];
    const vals = [id];
    if (event) { where.push('event = ?'); vals.push(event); }

    const logs = await query(
      `SELECT id, analyzer_id, direction, event, detail, raw, created_at
       FROM analyzer_comm_logs WHERE ${where.join(' AND ')}
       ORDER BY created_at DESC, id DESC LIMIT ?`,
      [...vals, limit]
    );

    return Response.json({ logs });
  } catch (err) {
    console.error('analyzer logs error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
