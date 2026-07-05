import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser, writeAuditLog } from '@/lib/auth-middleware';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    let sql = `SELECT po.*, s.name AS supplier_name, s.phone AS supplier_phone
               FROM purchase_orders po
               LEFT JOIN suppliers s ON s.id = po.supplier_id`;
    const params = [];
    if (type) { sql += ' WHERE po.order_type = ?'; params.push(type); }
    sql += ' ORDER BY po.created_at DESC';

    const orders = await query(sql, params);
    return Response.json({ purchaseOrders: orders });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { user, profile } = await getAuthenticatedUser();
    const body = await request.json();
    const { supplierId, orderType, notes, items } = body;

    if (!items || items.length === 0) {
      return Response.json({ error: 'At least one purchase item is required' }, { status: 400 });
    }

    const totalVal = items.reduce((sum, i) => sum + (parseFloat(i.price) * parseFloat(i.qty)), 0);
    const poNum = `PO-${Date.now().toString().slice(-6)}`;
    const poId  = uuidv4();

    await query(
      `INSERT INTO purchase_orders (id, po_number, supplier_id, order_type, status, total_amount, notes, ordered_by)
       VALUES (?, ?, ?, ?, 'Pending', ?, ?, ?)`,
      [
        poId,
        poNum,
        supplierId || null,
        orderType  || 'Pharma',
        parseFloat(totalVal.toFixed(2)),
        notes      || '',
        profile?.full_name || 'Admin Procurement',
      ]
    );

    for (const item of items) {
      await query(
        `INSERT INTO purchase_order_items (id, purchase_order_id, item_name, item_type, quantity, unit_price, expiry_date, batch_number)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          poId,
          item.name,
          item.type      || 'Medicine',
          parseFloat(item.qty   || 0),
          parseFloat(item.price || 0),
          item.expiry    || null,
          item.batch     || null,
        ]
      );
    }

    const [po] = await query('SELECT * FROM purchase_orders WHERE id = ?', [poId]);

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'CREATE_PURCHASE_ORDER', entityType: 'purchase_order', entityId: poId,
      changes: body, request,
    });

    return Response.json({ purchaseOrder: po }, { status: 201 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
