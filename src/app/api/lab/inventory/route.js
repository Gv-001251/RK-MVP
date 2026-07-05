import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser, writeAuditLog } from '@/lib/auth-middleware';

export async function GET() {
  try {
    const data = await query('SELECT * FROM lab_inventory ORDER BY name ASC');
    return Response.json({ inventory: data });
  } catch (err) {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { user, profile } = await getAuthenticatedUser();
    const body = await request.json();
    const id = uuidv4();

    await query(
      `INSERT INTO lab_inventory
         (id, name, category, unit, stock_qty, low_stock_threshold, expiry_date, batch_number, supplier_id, cost_per_unit, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        body.name,
        body.category            || 'Reagent',
        body.unit                || 'Units',
        parseFloat(body.stockQty || body.stock_qty || 0),
        parseFloat(body.lowStockThreshold || body.low_stock_threshold || 10),
        body.expiryDate          || body.expiry_date  || null,
        body.batchNumber         || body.batch_number || null,
        body.supplierId          || body.supplier_id  || null,
        parseFloat(body.costPerUnit || body.cost_per_unit || 0),
        body.notes || '',
      ]
    );

    const [data] = await query('SELECT * FROM lab_inventory WHERE id = ?', [id]);

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'CREATE_LAB_INVENTORY', entityType: 'lab_inventory', entityId: id,
      changes: body, request,
    });

    return Response.json({ item: data }, { status: 201 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
