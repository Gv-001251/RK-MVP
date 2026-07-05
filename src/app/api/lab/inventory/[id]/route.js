import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser, writeAuditLog } from '@/lib/auth-middleware';

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile } = await getAuthenticatedUser();
    const body = await request.json();

    const sets = ['updated_at = NOW()'];
    const values = [];

    if (body.name             !== undefined) { sets.push('name = ?');               values.push(body.name); }
    if (body.category         !== undefined) { sets.push('category = ?');           values.push(body.category); }
    if (body.unit             !== undefined) { sets.push('unit = ?');               values.push(body.unit); }
    if (body.stockQty         !== undefined) { sets.push('stock_qty = ?');          values.push(parseFloat(body.stockQty)); }
    if (body.stock_qty        !== undefined) { sets.push('stock_qty = ?');          values.push(parseFloat(body.stock_qty)); }
    if (body.lowStockThreshold !== undefined){ sets.push('low_stock_threshold = ?');values.push(parseFloat(body.lowStockThreshold)); }
    if (body.low_stock_threshold !== undefined){ sets.push('low_stock_threshold = ?');values.push(parseFloat(body.low_stock_threshold)); }
    if (body.expiryDate       !== undefined) { sets.push('expiry_date = ?');        values.push(body.expiryDate); }
    if (body.expiry_date      !== undefined) { sets.push('expiry_date = ?');        values.push(body.expiry_date); }
    if (body.batchNumber      !== undefined) { sets.push('batch_number = ?');       values.push(body.batchNumber); }
    if (body.batch_number     !== undefined) { sets.push('batch_number = ?');       values.push(body.batch_number); }
    if (body.costPerUnit      !== undefined) { sets.push('cost_per_unit = ?');      values.push(parseFloat(body.costPerUnit)); }
    if (body.cost_per_unit    !== undefined) { sets.push('cost_per_unit = ?');      values.push(parseFloat(body.cost_per_unit)); }
    if (body.notes            !== undefined) { sets.push('notes = ?');              values.push(body.notes); }

    values.push(id);
    await query(`UPDATE lab_inventory SET ${sets.join(', ')} WHERE id = ?`, values);
    const [data] = await query('SELECT * FROM lab_inventory WHERE id = ?', [id]);

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'UPDATE_LAB_INVENTORY', entityType: 'lab_inventory', entityId: id,
      changes: body, request,
    });

    return Response.json({ item: data });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile } = await getAuthenticatedUser();

    await query('DELETE FROM lab_inventory WHERE id = ?', [id]);

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'DELETE_LAB_INVENTORY', entityType: 'lab_inventory', entityId: id, request,
    });

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
