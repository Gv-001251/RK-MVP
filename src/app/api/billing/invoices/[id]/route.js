import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser, writeAuditLog } from '@/lib/auth-middleware';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const rows = await query('SELECT * FROM invoices WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) return Response.json({ error: 'Invoice not found' }, { status: 404 });

    const items = await query('SELECT * FROM invoice_items WHERE invoice_id = ?', [id]);
    rows[0].invoice_items = items;

    return Response.json({ invoice: rows[0] });
  } catch (err) {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile } = await getAuthenticatedUser();
    const body = await request.json();

    const sets = ['updated_at = NOW()'];
    const values = [];

    if (body.status      !== undefined) { sets.push('status = ?');       values.push(body.status); }
    if (body.paymentMode !== undefined) { sets.push('payment_mode = ?'); values.push(body.paymentMode); }
    if (body.payment_mode !== undefined){ sets.push('payment_mode = ?'); values.push(body.payment_mode); }
    if (body.amount      !== undefined) { sets.push('amount = ?');       values.push(parseFloat(body.amount)); }

    values.push(id);
    await query(`UPDATE invoices SET ${sets.join(', ')} WHERE id = ?`, values);

    const [data] = await query('SELECT * FROM invoices WHERE id = ?', [id]);
    const items  = await query('SELECT * FROM invoice_items WHERE invoice_id = ?', [id]);
    data.invoice_items = items;

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'UPDATE_INVOICE', entityType: 'invoice', entityId: id,
      changes: body, request,
    });

    return Response.json({ invoice: data });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
