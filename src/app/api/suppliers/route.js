import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser, writeAuditLog } from '@/lib/auth-middleware';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    let sql = 'SELECT * FROM suppliers WHERE 1=1';
    const params = [];
    if (category) { sql += ' AND category = ?'; params.push(category); }
    sql += ' ORDER BY name ASC';

    const data = await query(sql, params);
    return Response.json({ suppliers: data });
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
      `INSERT INTO suppliers (id, name, category, contact_name, phone, email, address, gst_number, notes, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        id,
        body.name,
        body.category    || 'Pharma',
        body.contactName || body.contact_name || null,
        body.phone       || null,
        body.email       || null,
        body.address     || null,
        body.gstNumber   || body.gst_number   || null,
        body.notes       || '',
      ]
    );

    const [data] = await query('SELECT * FROM suppliers WHERE id = ?', [id]);

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'CREATE_SUPPLIER', entityType: 'supplier', entityId: id,
      changes: body, request,
    });

    return Response.json({ supplier: data }, { status: 201 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
