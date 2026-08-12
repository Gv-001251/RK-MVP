import { v4 as uuidv4 } from 'uuid';
import { query, withTransaction } from '@/lib/mysql/db';
import { requireAuth, writeAuditLog } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';
import { shapeInventoryItem } from '@/lib/inventory-util';

/**
 * GET /api/lab/inventory — item catalog with derived alert flags.
 * Filters: category, q (name/vendor/lot), alert (low|expiring|expired).
 */
export async function GET(request) {
  try {
    const { response } = await requireAuth(...ROLES.INVENTORY_READ);
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const q = (searchParams.get('q') || '').trim();
    const alert = searchParams.get('alert');

    const where = ['1=1'];
    const vals = [];
    if (category) { where.push('category = ?'); vals.push(category); }
    if (q) {
      where.push('(name LIKE ? OR vendor LIKE ? OR batch_number LIKE ?)');
      const like = `%${q}%`;
      vals.push(like, like, like);
    }

    const rows = await query(`SELECT * FROM lab_inventory WHERE ${where.join(' AND ')} ORDER BY name ASC`, vals);
    const now = Date.now();
    let inventory = rows.map(r => shapeInventoryItem(r, now));

    if (alert === 'low') inventory = inventory.filter(i => i.low || i.outOfStock);
    else if (alert === 'expiring') inventory = inventory.filter(i => i.expiringSoon);
    else if (alert === 'expired') inventory = inventory.filter(i => i.expired);

    return Response.json({ inventory });
  } catch (err) {
    console.error('inventory list error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/lab/inventory — create an item (records opening stock as an 'in' txn). */
export async function POST(request) {
  try {
    const { user, profile, response } = await requireAuth(...ROLES.INVENTORY_MANAGE);
    if (response) return response;

    const body = await request.json();
    if (!body.name) return Response.json({ error: 'name is required' }, { status: 400 });

    const id = uuidv4();
    const openingStock = parseFloat(body.stockQty ?? body.stock_qty ?? 0) || 0;
    const lot = body.lotNumber ?? body.batchNumber ?? body.batch_number ?? null;

    await withTransaction(async (tx) => {
      await tx.query(
        `INSERT INTO lab_inventory
           (id, name, category, unit, stock_qty, low_stock_threshold, expiry_date, batch_number, supplier_id,
            vendor, cost_per_unit, consume_per_test, analyzer_id, location, notes, last_movement_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          id, body.name, body.category || 'Reagent', body.unit || 'Units',
          openingStock,
          parseFloat(body.minimumStock ?? body.lowStockThreshold ?? body.low_stock_threshold ?? 10) || 0,
          body.expiryDate || body.expiry_date || null,
          lot, body.supplierId || body.supplier_id || null, body.vendor || null,
          parseFloat(body.costPerUnit ?? body.cost_per_unit ?? 0) || 0,
          parseFloat(body.consumePerTest ?? 0) || 0,
          body.analyzerId || body.analyzer_id || null,
          body.location || body.storageLocation || null,
          body.notes || '',
        ]
      );
      if (openingStock > 0) {
        await tx.query(
          `INSERT INTO lab_inventory_txns (id, item_id, type, change_qty, balance_after, reason, lot_number, performed_by)
           VALUES (?, ?, 'in', ?, ?, 'Opening stock', ?, ?)`,
          [uuidv4(), id, openingStock, openingStock, lot, profile?.full_name || 'Lab Staff']
        );
      }
    });

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'CREATE_LAB_INVENTORY', entityType: 'lab_inventory', entityId: id,
      changes: { name: body.name, category: body.category, openingStock }, request,
    });

    const [row] = await query('SELECT * FROM lab_inventory WHERE id = ?', [id]);
    return Response.json({ item: shapeInventoryItem(row) }, { status: 201 });
  } catch (err) {
    console.error('inventory create error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
