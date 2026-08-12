import { v4 as uuidv4 } from 'uuid';
import { query, withTransaction } from '@/lib/mysql/db';
import { requireAuth, writeAuditLog } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';
import { broadcastRealtimeEvent } from '@/lib/realtime-registry';
import { shapeInventoryItem } from '@/lib/inventory-util';

const TYPES = ['in', 'out', 'adjust'];

/**
 * POST /api/lab/inventory/[id]/stock — record a stock movement.
 * Body: { type: 'in'|'out'|'adjust', quantity, reason?, lotNumber?, expiryDate?, reference? }
 *   in     : quantity added (may also update lot/expiry for the new lot)
 *   out    : quantity removed (cannot exceed current stock)
 *   adjust : signed correction (quantity may be negative)
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile, response } = await requireAuth(...ROLES.INVENTORY_MANAGE);
    if (response) return response;

    const body = await request.json();
    const type = String(body.type || '').trim();
    if (!TYPES.includes(type)) {
      return Response.json({ error: `type must be one of: ${TYPES.join(', ')}` }, { status: 400 });
    }
    const qty = Number(body.quantity);
    if (Number.isNaN(qty) || (type !== 'adjust' && qty <= 0)) {
      return Response.json({ error: 'A valid quantity is required.' }, { status: 400 });
    }

    const change = type === 'in' ? Math.abs(qty) : type === 'out' ? -Math.abs(qty) : qty;
    const actor = profile?.full_name || 'Lab Staff';

    let shaped = null;
    let outcomeError = null;
    await withTransaction(async (tx) => {
      const rows = await tx.query('SELECT * FROM lab_inventory WHERE id = ? LIMIT 1 FOR UPDATE', [id]);
      if (!rows.length) { outcomeError = { status: 404, error: 'Item not found' }; return; }
      const current = Number(rows[0].stock_qty) || 0;
      const next = current + change;
      if (next < 0) { outcomeError = { status: 400, error: `Insufficient stock: ${current} available.` }; return; }

      const itemSets = ['stock_qty = ?', 'last_movement_at = NOW()', 'updated_at = NOW()'];
      const itemVals = [next];
      if (type === 'in' && (body.lotNumber || body.batchNumber)) { itemSets.push('batch_number = ?'); itemVals.push(body.lotNumber || body.batchNumber); }
      if (type === 'in' && body.expiryDate) { itemSets.push('expiry_date = ?'); itemVals.push(body.expiryDate); }
      await tx.query(`UPDATE lab_inventory SET ${itemSets.join(', ')} WHERE id = ?`, [...itemVals, id]);

      await tx.query(
        `INSERT INTO lab_inventory_txns (id, item_id, type, change_qty, balance_after, reason, lot_number, reference, performed_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), id, type, change, next, body.reason || null,
         body.lotNumber || body.batchNumber || rows[0].batch_number || null, body.reference || null, actor]
      );
    });

    if (outcomeError) return Response.json({ error: outcomeError.error }, { status: outcomeError.status });

    const [row] = await query('SELECT * FROM lab_inventory WHERE id = ?', [id]);
    shaped = shapeInventoryItem(row);

    await writeAuditLog(null, {
      userId: user?.id, userName: actor,
      action: `INVENTORY_STOCK_${type.toUpperCase()}`, entityType: 'lab_inventory', entityId: id,
      changes: { type, change, balanceAfter: shaped.currentStock, reason: body.reason }, request,
    });

    broadcastRealtimeEvent('INVENTORY_UPDATED', shaped);

    return Response.json({ item: shaped });
  } catch (err) {
    console.error('inventory stock movement error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
