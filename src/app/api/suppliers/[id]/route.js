import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser, writeAuditLog } from '@/lib/auth-middleware';

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile } = await getAuthenticatedUser();
    const body = await request.json();

    const sets = ['updated_at = NOW()'];
    const values = [];

    if (body.name         !== undefined) { sets.push('name = ?');         values.push(body.name); }
    if (body.category     !== undefined) { sets.push('category = ?');     values.push(body.category); }
    if (body.contactName  !== undefined) { sets.push('contact_name = ?'); values.push(body.contactName); }
    if (body.contact_name !== undefined) { sets.push('contact_name = ?'); values.push(body.contact_name); }
    if (body.phone        !== undefined) { sets.push('phone = ?');        values.push(body.phone); }
    if (body.email        !== undefined) { sets.push('email = ?');        values.push(body.email); }
    if (body.address      !== undefined) { sets.push('address = ?');      values.push(body.address); }
    if (body.gstNumber    !== undefined) { sets.push('gst_number = ?');   values.push(body.gstNumber); }
    if (body.gst_number   !== undefined) { sets.push('gst_number = ?');   values.push(body.gst_number); }
    if (body.notes        !== undefined) { sets.push('notes = ?');        values.push(body.notes); }
    if (body.isActive     !== undefined) { sets.push('is_active = ?');    values.push(body.isActive ? 1 : 0); }
    if (body.is_active    !== undefined) { sets.push('is_active = ?');    values.push(body.is_active ? 1 : 0); }

    values.push(id);
    await query(`UPDATE suppliers SET ${sets.join(', ')} WHERE id = ?`, values);
    const [data] = await query('SELECT * FROM suppliers WHERE id = ?', [id]);

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'UPDATE_SUPPLIER', entityType: 'supplier', entityId: id,
      changes: body, request,
    });

    return Response.json({ supplier: data });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile } = await getAuthenticatedUser();

    await query('DELETE FROM suppliers WHERE id = ?', [id]);

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'DELETE_SUPPLIER', entityType: 'supplier', entityId: id, request,
    });

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
