import { query } from '@/lib/mysql/db';
import { requireAuth } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';
import { shapeInventoryItem } from '@/lib/inventory-util';

/**
 * GET /api/lab/inventory/alerts — low-stock, expiring, and expired items,
 * for the dashboard alert panels.
 */
export async function GET() {
  try {
    const { response } = await requireAuth(...ROLES.INVENTORY_READ);
    if (response) return response;

    const rows = await query('SELECT * FROM lab_inventory');
    const now = Date.now();
    const items = rows.map(r => shapeInventoryItem(r, now));

    const lowStock = items.filter(i => i.low || i.outOfStock).sort((a, b) => a.currentStock - b.currentStock);
    const expired = items.filter(i => i.expired).sort((a, b) => (a.daysToExpiry ?? 0) - (b.daysToExpiry ?? 0));
    const expiringSoon = items.filter(i => i.expiringSoon).sort((a, b) => (a.daysToExpiry ?? 0) - (b.daysToExpiry ?? 0));

    return Response.json({
      lowStock,
      expiringSoon,
      expired,
      counts: { lowStock: lowStock.length, expiringSoon: expiringSoon.length, expired: expired.length },
    });
  } catch (err) {
    console.error('inventory alerts error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
