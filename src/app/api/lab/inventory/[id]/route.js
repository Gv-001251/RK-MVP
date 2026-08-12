import { query } from '@/lib/mysql/db';
import { requireAuth, writeAuditLog } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';
import { shapeInventoryItem } from '@/lib/inventory-util';

// Editable metadata. Stock level is NOT edited here — it changes only through
// /api/lab/inventory/[id]/stock so the ledger stays authoritative.
const FIELD_MAP = {
  name: 'name',
  category: 'category',
  unit: 'unit',
  minimumStock: 'low_stock_threshold',
  lowStockThreshold: 'low_stock_threshold',
  expiryDate: 'expiry_date',
  lotNumber: 'batch_number',
  batchNumber: 'batch_number',
  vendor: 'vendor',
  costPerUnit: 'cost_per_unit',
  consumePerTest: 'consume_per_test',
  analyzerId: 'analyzer_id',
  location: 'location',
  storageLocation: 'location',
  notes: 'notes',
};

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile, response } = await requireAuth(...ROLES.INVENTORY_MANAGE);
    if (response) return response;

    const existing = await query('SELECT id FROM lab_inventory WHERE id = ? LIMIT 1', [id]);
    if (!existing.length) return Response.json({ error: 'Item not found' }, { status: 404 });

    const body = await request.json();
    const sets = ['updated_at = NOW()'];
    const vals = [];
    for (const [key, col] of Object.entries(FIELD_MAP)) {
      if (body[key] === undefined) continue;
      let v = body[key];
      if (['low_stock_threshold', 'cost_per_unit', 'consume_per_test'].includes(col)) v = parseFloat(v) || 0;
      sets.push(`${col} = ?`);
      vals.push(v);
    }

    await query(`UPDATE lab_inventory SET ${sets.join(', ')} WHERE id = ?`, [...vals, id]);

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'UPDATE_LAB_INVENTORY', entityType: 'lab_inventory', entityId: id,
      changes: body, request,
    });

    const [row] = await query('SELECT * FROM lab_inventory WHERE id = ?', [id]);
    return Response.json({ item: shapeInventoryItem(row) });
  } catch (err) {
    console.error('inventory update error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile, response } = await requireAuth(...ROLES.INVENTORY_MANAGE);
    if (response) return response;

    await query('DELETE FROM lab_inventory WHERE id = ?', [id]);

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'DELETE_LAB_INVENTORY', entityType: 'lab_inventory', entityId: id, request,
    });

    return Response.json({ success: true });
  } catch (err) {
    console.error('inventory delete error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
