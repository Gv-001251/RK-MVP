import { v4 as uuidv4 } from 'uuid';
import { query, withTransaction } from '@/lib/mysql/db';
import { requireAuth, writeAuditLog } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';

/** Resolve test/profile codes into catalog rows (shared by update). */
async function resolveTests(individualTests = [], profileCodes = []) {
  let profileTests = [];
  if (profileCodes.length) {
    const ph = profileCodes.map(() => '?').join(',');
    profileTests = await query(
      `SELECT profile_code, test_code FROM lab_test_profile_items WHERE profile_code IN (${ph})`, profileCodes
    );
  }
  const codeToProfile = {};
  for (const c of individualTests) codeToProfile[c] = codeToProfile[c] ?? null;
  for (const pt of profileTests) codeToProfile[pt.test_code] = codeToProfile[pt.test_code] ?? pt.profile_code;
  const allCodes = Object.keys(codeToProfile);
  if (!allCodes.length) return { error: 'At least one test or profile is required' };

  const ph2 = allCodes.map(() => '?').join(',');
  const catalog = await query(
    `SELECT test_code, name, department, price FROM lab_test_catalog WHERE test_code IN (${ph2}) AND is_active = 1`, allCodes
  );
  const catMap = new Map(catalog.map(c => [c.test_code, c]));
  const unknown = allCodes.filter(c => !catMap.has(c));
  if (unknown.length) return { error: `Unknown test code(s): ${unknown.join(', ')}` };

  return {
    tests: allCodes.map(c => {
      const cat = catMap.get(c);
      return { code: c, name: cat.name, department: cat.department, price: Number(cat.price) || 0, profile: codeToProfile[c] };
    }),
  };
}

/** GET /api/lab/orders/[id] — full order details. */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { response } = await requireAuth(...ROLES.LAB_READ);
    if (response) return response;

    const rows = await query('SELECT * FROM lab_orders WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) return Response.json({ error: 'Order not found' }, { status: 404 });
    const order = rows[0];

    order.lab_order_tests = await query(
      'SELECT * FROM lab_order_tests WHERE lab_order_id = ? ORDER BY department, test_name', [id]
    );
    const pat = await query('SELECT id, name, age, gender, phone FROM patients WHERE id = ? LIMIT 1', [order.patient_id]);
    order.patient = pat[0] || null;

    return Response.json({ order });
  } catch (err) {
    console.error('order details error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/lab/orders/[id]
 *   action: 'cancel'  → cancel the order (needs reason)         [ORDER_ENTRY]
 *   action: 'update'  → edit priority/department/notes/tests    [ORDER_ENTRY]
 *   action: 'status'  → workflow status/priority update (legacy)[LAB_STAFF]
 */
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const action = body.action || 'status';

    const roleSet = (action === 'cancel' || action === 'update') ? ROLES.ORDER_ENTRY : ROLES.LAB_STAFF;
    const { user, profile, response } = await requireAuth(...roleSet);
    if (response) return response;

    const existing = await query('SELECT * FROM lab_orders WHERE id = ? LIMIT 1', [id]);
    if (!existing.length) return Response.json({ error: 'Order not found' }, { status: 404 });
    const order = existing[0];

    // ── Cancel ──
    if (action === 'cancel') {
      if (['Cancelled', 'Report Delivered'].includes(order.status)) {
        return Response.json({ error: `Cannot cancel an order that is ${order.status}` }, { status: 400 });
      }
      const reason = (body.reason || '').trim();
      if (!reason) return Response.json({ error: 'A cancellation reason is required' }, { status: 400 });

      await withTransaction(async (tx) => {
        await tx.query(
          `UPDATE lab_orders SET status = 'Cancelled', processing_status = 'Cancelled',
             cancel_reason = ?, cancelled_at = NOW(), cancelled_by = ?, updated_at = NOW() WHERE id = ?`,
          [reason, profile?.full_name || 'System', id]
        );
        await tx.query(
          `UPDATE lab_tasks SET status = 'Cancelled', processing_status = 'Cancelled', updated_at = NOW() WHERE id = ?`,
          [id]
        );
      });

      await writeAuditLog(null, {
        userId: user?.id, userName: profile?.full_name,
        action: 'CANCEL_LAB_ORDER', entityType: 'lab_order', entityId: id, changes: { reason }, request,
      });
      const [updated] = await query('SELECT * FROM lab_orders WHERE id = ?', [id]);
      return Response.json({ order: updated });
    }

    // ── Update (only before processing starts) ──
    if (action === 'update') {
      if (order.status !== 'Ordered') {
        return Response.json({ error: `Order can only be edited while status is 'Ordered' (current: ${order.status})` }, { status: 400 });
      }

      const sets = ['updated_at = NOW()'];
      const vals = [];
      if (body.priority !== undefined) {
        const p = ['Routine', 'Urgent', 'STAT'].includes(body.priority) ? body.priority : 'Routine';
        sets.push('priority = ?'); vals.push(p);
      }
      if (body.department !== undefined) { sets.push('department = ?'); vals.push(body.department); }
      if (body.clinicalNotes !== undefined) { sets.push('notes = ?'); vals.push(body.clinicalNotes); }
      if (body.doctorName !== undefined) { sets.push('doctor_name = ?'); vals.push(body.doctorName); }

      // Optional test replacement
      let resolved = null;
      if (body.tests !== undefined || body.profiles !== undefined) {
        resolved = await resolveTests(body.tests || [], body.profiles || []);
        if (resolved.error) return Response.json({ error: resolved.error }, { status: 400 });
      }

      await withTransaction(async (tx) => {
        vals.push(id);
        await tx.query(`UPDATE lab_orders SET ${sets.join(', ')} WHERE id = ?`, vals);

        if (body.priority !== undefined) {
          await tx.query('UPDATE lab_tasks SET priority = ?, updated_at = NOW() WHERE id = ?', [body.priority, id]);
        }

        if (resolved) {
          await tx.query('DELETE FROM lab_order_tests WHERE lab_order_id = ?', [id]);
          await tx.query('DELETE FROM lab_task_tests WHERE lab_task_id = ?', [id]);
          for (const t of resolved.tests) {
            await tx.query(
              `INSERT INTO lab_order_tests (id, lab_order_id, test_name, test_code, profile_code, department, price)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [uuidv4(), id, t.name, t.code, t.profile, t.department, t.price]
            );
            await tx.query('INSERT INTO lab_task_tests (id, lab_task_id, test_name) VALUES (?, ?, ?)', [uuidv4(), id, t.name]);
          }
        }
      });

      await writeAuditLog(null, {
        userId: user?.id, userName: profile?.full_name,
        action: 'UPDATE_LAB_ORDER', entityType: 'lab_order', entityId: id, changes: body, request,
      });
      const [updated] = await query('SELECT * FROM lab_orders WHERE id = ?', [id]);
      updated.lab_order_tests = await query('SELECT * FROM lab_order_tests WHERE lab_order_id = ?', [id]);
      return Response.json({ order: updated });
    }

    // ── Legacy status/priority update (workflow) ──
    const orderSets = ['updated_at = NOW()'];
    const orderVals = [];
    if (body.status !== undefined) { orderSets.push('status = ?', 'processing_status = ?'); orderVals.push(body.status, body.status); }
    if (body.priority !== undefined) { orderSets.push('priority = ?'); orderVals.push(body.priority); }
    orderVals.push(id);
    await query(`UPDATE lab_orders SET ${orderSets.join(', ')} WHERE id = ?`, orderVals);

    const taskSets = ['updated_at = NOW()'];
    const taskVals = [];
    if (body.status !== undefined) { taskSets.push('status = ?'); taskVals.push(body.status); }
    if (body.priority !== undefined) { taskSets.push('priority = ?'); taskVals.push(body.priority); }
    taskVals.push(id);
    await query(`UPDATE lab_tasks SET ${taskSets.join(', ')} WHERE id = ?`, taskVals);

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'UPDATE_LAB_ORDER', entityType: 'lab_order', entityId: id, changes: body, request,
    });
    const [updated] = await query('SELECT * FROM lab_orders WHERE id = ?', [id]);
    return Response.json({ labOrder: updated, order: updated });
  } catch (err) {
    console.error('order update error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
