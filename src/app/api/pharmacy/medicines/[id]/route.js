import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser, writeAuditLog } from '@/lib/auth-middleware';

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile } = await getAuthenticatedUser();
    const body = await request.json();

    const sets = ['updated_at = NOW()'];
    const values = [];

    if (body.name        !== undefined) { sets.push('name = ?');        values.push(body.name); }
    if (body.category    !== undefined) { sets.push('category = ?');    values.push(body.category); }
    if (body.stock       !== undefined) { sets.push('stock = ?');       values.push(parseInt(body.stock)); }
    if (body.threshold   !== undefined) { sets.push('threshold = ?');   values.push(parseInt(body.threshold)); }
    if (body.price       !== undefined) { sets.push('price = ?');       values.push(parseFloat(body.price)); }
    if (body.expiryDate  !== undefined) { sets.push('expiry_date = ?'); values.push(body.expiryDate); }
    if (body.expiry_date !== undefined) { sets.push('expiry_date = ?'); values.push(body.expiry_date); }
    if (body.batchNumber !== undefined) { sets.push('batch_number = ?'); values.push(body.batchNumber); }
    if (body.batch_number !== undefined){ sets.push('batch_number = ?'); values.push(body.batch_number); }

    values.push(id);
    await query(`UPDATE medicine_inventory SET ${sets.join(', ')} WHERE id = ?`, values);
    const [data] = await query('SELECT * FROM medicine_inventory WHERE id = ?', [id]);

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'UPDATE_MEDICINE', entityType: 'medicine_inventory', entityId: id,
      changes: body, request,
    });

    return Response.json({ medicine: data });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile } = await getAuthenticatedUser();

    await query('DELETE FROM medicine_inventory WHERE id = ?', [id]);

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'DELETE_MEDICINE', entityType: 'medicine_inventory', entityId: id, request,
    });

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
