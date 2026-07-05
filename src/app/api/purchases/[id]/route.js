import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser, writeAuditLog } from '@/lib/auth-middleware';

export async function GET(request, { params }) {
  try {
    const { id } = await params;

    const rows = await query(
      `SELECT po.*, s.name AS supplier_name FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po.supplier_id
       WHERE po.id = ? LIMIT 1`,
      [id]
    );
    if (!rows.length) return Response.json({ error: 'Purchase order not found' }, { status: 404 });

    const items = await query('SELECT * FROM purchase_order_items WHERE purchase_order_id = ?', [id]);
    rows[0].purchase_order_items = items;

    return Response.json({ purchaseOrder: rows[0] });
  } catch (err) {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile } = await getAuthenticatedUser();
    const body = await request.json();

    // Fetch current PO with items
    const rows = await query('SELECT * FROM purchase_orders WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) return Response.json({ error: 'Purchase order not found' }, { status: 404 });
    const currentPO = rows[0];

    if (currentPO.status === 'Received') {
      return Response.json({ error: 'Purchase order is already received' }, { status: 400 });
    }

    const sets = ['updated_at = NOW()'];
    const values = [];

    if (body.status !== undefined) {
      sets.push('status = ?');
      values.push(body.status);
      if (body.status === 'Received') {
        sets.push('received_at = NOW()');
      }
    }

    values.push(id);
    await query(`UPDATE purchase_orders SET ${sets.join(', ')} WHERE id = ?`, values);

    // Auto-update inventories if status → Received
    if (body.status === 'Received') {
      const items = await query('SELECT * FROM purchase_order_items WHERE purchase_order_id = ?', [id]);

      for (const item of items) {
        if (currentPO.order_type === 'Pharma') {
          const medRows = await query(
            'SELECT * FROM medicine_inventory WHERE LOWER(name) = LOWER(?) LIMIT 1',
            [item.item_name.trim()]
          );
          if (medRows.length) {
            await query(
              `UPDATE medicine_inventory SET stock = stock + ?,
               expiry_date = COALESCE(?, expiry_date),
               batch_number = COALESCE(?, batch_number),
               updated_at = NOW()
               WHERE id = ?`,
              [parseInt(item.quantity), item.expiry_date || null, item.batch_number || null, medRows[0].id]
            );
          } else {
            await query(
              `INSERT INTO medicine_inventory (id, name, category, stock, price, expiry_date, batch_number)
               VALUES (?, ?, 'Analgesic', ?, ?, ?, ?)`,
              [uuidv4(), item.item_name, parseInt(item.quantity),
               parseFloat(item.unit_price) * 1.25, item.expiry_date,
               item.batch_number || `B-PO${Date.now().toString().slice(-3)}`]
            );
          }
        } else if (currentPO.order_type === 'Lab') {
          const labRows = await query(
            'SELECT * FROM lab_inventory WHERE LOWER(name) = LOWER(?) LIMIT 1',
            [item.item_name.trim()]
          );
          if (labRows.length) {
            await query(
              `UPDATE lab_inventory SET stock_qty = stock_qty + ?,
               expiry_date = COALESCE(?, expiry_date),
               batch_number = COALESCE(?, batch_number),
               updated_at = NOW()
               WHERE id = ?`,
              [parseFloat(item.quantity), item.expiry_date || null, item.batch_number || null, labRows[0].id]
            );
          } else {
            await query(
              `INSERT INTO lab_inventory (id, name, category, stock_qty, expiry_date, batch_number, cost_per_unit)
               VALUES (?, ?, 'Reagent', ?, ?, ?, ?)`,
              [uuidv4(), item.item_name, parseFloat(item.quantity), item.expiry_date,
               item.batch_number || `B-PO${Date.now().toString().slice(-3)}`,
               parseFloat(item.unit_price)]
            );
          }
        }
      }
    }

    const [updatedPO] = await query('SELECT * FROM purchase_orders WHERE id = ?', [id]);

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'RECEIVE_PURCHASE_ORDER', entityType: 'purchase_order', entityId: id,
      changes: body, request,
    });

    return Response.json({ purchaseOrder: updatedPO });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
