import { query } from '@/lib/mysql/db';
import { requireAuth } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';

/**
 * GET /api/lab/inventory/txns — stock-movement ledger.
 * Filters: itemId, type, from, to, limit. Newest first.
 */
export async function GET(request) {
  try {
    const { response } = await requireAuth(...ROLES.INVENTORY_READ);
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('itemId');
    const type = searchParams.get('type');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limit = Math.min(parseInt(searchParams.get('limit') || '150', 10) || 150, 500);

    const where = ['1=1'];
    const vals = [];
    if (itemId) { where.push('t.item_id = ?'); vals.push(itemId); }
    if (type) { where.push('t.type = ?'); vals.push(type); }
    if (from) { where.push('t.created_at >= ?'); vals.push(from); }
    if (to) { where.push('t.created_at <= ?'); vals.push(to); }

    const txns = await query(
      `SELECT t.id, t.item_id, i.name AS item_name, i.unit, t.type, t.change_qty, t.balance_after,
              t.reason, t.lot_number, t.reference, t.performed_by, t.created_at
         FROM lab_inventory_txns t
         LEFT JOIN lab_inventory i ON i.id = t.item_id
        WHERE ${where.join(' AND ')}
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT ?`,
      [...vals, limit]
    );

    return Response.json({ txns });
  } catch (err) {
    console.error('inventory txns error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
