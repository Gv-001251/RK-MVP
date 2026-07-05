import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser, writeAuditLog } from '@/lib/auth-middleware';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const search    = searchParams.get('search') || '';
    const category  = searchParams.get('category') || '';
    const lowStock  = searchParams.get('lowStock') === 'true';

    let sql = 'SELECT * FROM medicine_inventory WHERE 1=1';
    const params = [];

    if (search)   { sql += ' AND name LIKE ?';     params.push(`%${search}%`); }
    if (category) { sql += ' AND category = ?';    params.push(category); }
    if (lowStock) { sql += ' AND stock <= threshold'; }

    sql += ' ORDER BY name ASC';

    const data = await query(sql, params);
    return Response.json({ medicines: data });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { user, profile } = await getAuthenticatedUser();
    const body = await request.json();
    const { v4: uuidv4 } = await import('uuid');
    const id = uuidv4();

    await query(
      `INSERT INTO medicine_inventory
         (id, name, category, stock, threshold, price, expiry_date, batch_number, supplier_id, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        body.name,
        body.category    || 'Analgesic',
        parseInt(body.stock      || 0),
        parseInt(body.threshold  || 20),
        parseFloat(body.price    || 0),
        body.expiryDate  || body.expiry_date  || null,
        body.batchNumber || body.batch_number || null,
        body.supplierId  || body.supplier_id  || null,
        body.imageUrl    || body.image_url    || null,
      ]
    );

    const [data] = await query('SELECT * FROM medicine_inventory WHERE id = ?', [id]);

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'CREATE_MEDICINE', entityType: 'medicine_inventory', entityId: id,
      changes: { name: body.name }, request,
    });

    return Response.json({ medicine: data }, { status: 201 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
