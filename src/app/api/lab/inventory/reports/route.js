import { query } from '@/lib/mysql/db';
import { requireAuth } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';
import { shapeInventoryItem } from '@/lib/inventory-util';

/**
 * GET /api/lab/inventory/reports — inventory analytics.
 * Params: from?, to? (bound the consumption window).
 * Returns totals, per-category valuation, top consumed items, and movement totals.
 */
export async function GET(request) {
  try {
    const { response } = await requireAuth(...ROLES.INVENTORY_READ);
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const rows = await query('SELECT * FROM lab_inventory');
    const now = Date.now();
    const items = rows.map(r => shapeInventoryItem(r, now));

    const totals = {
      items: items.length,
      stockValue: Number(items.reduce((s, i) => s + i.stockValue, 0).toFixed(2)),
      lowStock: items.filter(i => i.low || i.outOfStock).length,
      expiringSoon: items.filter(i => i.expiringSoon).length,
      expired: items.filter(i => i.expired).length,
    };

    const byCategoryMap = {};
    for (const i of items) {
      const c = i.category || 'Other';
      (byCategoryMap[c] ||= { category: c, items: 0, stockValue: 0 });
      byCategoryMap[c].items += 1;
      byCategoryMap[c].stockValue += i.stockValue;
    }
    const byCategory = Object.values(byCategoryMap).map(c => ({ ...c, stockValue: Number(c.stockValue.toFixed(2)) }));

    // Consumption (out + consume) over the window.
    const cWhere = ["t.type IN ('out','consume')"];
    const cVals = [];
    if (from) { cWhere.push('t.created_at >= ?'); cVals.push(from); }
    if (to) { cWhere.push('t.created_at <= ?'); cVals.push(to); }

    const topConsumed = await query(
      `SELECT t.item_id, i.name AS item_name, i.unit, SUM(-t.change_qty) AS consumed
         FROM lab_inventory_txns t LEFT JOIN lab_inventory i ON i.id = t.item_id
        WHERE ${cWhere.join(' AND ')}
        GROUP BY t.item_id ORDER BY consumed DESC LIMIT 20`,
      cVals
    );

    const mWhere = ['1=1'];
    const mVals = [];
    if (from) { mWhere.push('created_at >= ?'); mVals.push(from); }
    if (to) { mWhere.push('created_at <= ?'); mVals.push(to); }
    const [movement] = await query(
      `SELECT
         SUM(CASE WHEN type = 'in' THEN change_qty ELSE 0 END) AS totalIn,
         SUM(CASE WHEN type IN ('out','consume') THEN -change_qty ELSE 0 END) AS totalOut,
         COUNT(*) AS movements
       FROM lab_inventory_txns WHERE ${mWhere.join(' AND ')}`,
      mVals
    );

    return Response.json({
      totals,
      byCategory,
      topConsumed: topConsumed.map(r => ({ ...r, consumed: Number(r.consumed) || 0 })),
      movement: {
        totalIn: Number(movement?.totalIn) || 0,
        totalOut: Number(movement?.totalOut) || 0,
        movements: Number(movement?.movements) || 0,
      },
      range: { from, to },
    });
  } catch (err) {
    console.error('inventory reports error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
