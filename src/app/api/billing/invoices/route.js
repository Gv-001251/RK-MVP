import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser, writeAuditLog } from '@/lib/auth-middleware';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get('patientId');
    const status    = searchParams.get('status');
    const page      = parseInt(searchParams.get('page')  || '1');
    const limit     = parseInt(searchParams.get('limit') || '50');
    const offset    = (page - 1) * limit;

    const wheres = [];
    const params = [];
    if (patientId) { wheres.push('i.patient_id = ?'); params.push(patientId); }
    if (status)    { wheres.push('i.status = ?');      params.push(status); }

    const where = wheres.length ? 'WHERE ' + wheres.join(' AND ') : '';

    const [invoices, countRows] = await Promise.all([
      query(
        `SELECT i.*, p.name AS patient_name
         FROM invoices i
         LEFT JOIN patients p ON p.id = i.patient_id
         ${where}
         ORDER BY i.created_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
      query(`SELECT COUNT(*) AS total FROM invoices i ${where}`, params),
    ]);

    // Attach items
    if (invoices.length) {
      const ids = invoices.map(r => r.id);
      const ph  = ids.map(() => '?').join(',');
      const items = await query(`SELECT * FROM invoice_items WHERE invoice_id IN (${ph})`, ids);
      const itemMap = {};
      for (const item of items) {
        if (!itemMap[item.invoice_id]) itemMap[item.invoice_id] = [];
        itemMap[item.invoice_id].push(item);
      }
      for (const inv of invoices) inv.invoice_items = itemMap[inv.id] || [];
    }

    return Response.json({ invoices, total: countRows[0].total, page, limit });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { user, profile } = await getAuthenticatedUser();
    const body = await request.json();
    // body: { patientId, amount, paymentMode, status, invoiceDate, items: [{description, price, quantity}] }

    // Generate invoice ID: RK-INV-YYYY-XXXX
    const seqRows = await query('INSERT INTO invoice_id_seq () VALUES ()');
    const seq = seqRows.insertId;
    const year = new Date().getFullYear();
    const invId = `RK-INV-${year}-${String(seq).padStart(4, '0')}`;

    await query(
      `INSERT INTO invoices (id, patient_id, amount, payment_mode, status, invoice_date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        invId,
        body.patientId    || body.patient_id,
        parseFloat(body.amount   || 0),
        body.paymentMode  || body.payment_mode || 'Cash',
        body.status       || 'Pending',
        body.invoiceDate  || body.invoice_date || new Date().toISOString().split('T')[0],
      ]
    );

    // Insert items
    if (body.items?.length) {
      const { v4: uuidv4 } = await import('uuid');
      for (const item of body.items) {
        await query(
          `INSERT INTO invoice_items (id, invoice_id, description, price, quantity)
           VALUES (?, ?, ?, ?, ?)`,
          [uuidv4(), invId, item.description, parseFloat(item.price || 0), parseInt(item.quantity || 1)]
        );
      }
    }

    const [data] = await query('SELECT * FROM invoices WHERE id = ?', [invId]);
    const items  = await query('SELECT * FROM invoice_items WHERE invoice_id = ?', [invId]);
    data.invoice_items = items;

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'CREATE_INVOICE', entityType: 'invoice', entityId: invId,
      changes: { amount: body.amount, patientId: body.patientId }, request,
    });

    return Response.json({ invoice: data }, { status: 201 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
