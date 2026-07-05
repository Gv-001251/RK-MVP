import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser, writeAuditLog } from '@/lib/auth-middleware';

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile } = await getAuthenticatedUser();
    const body = await request.json();

    const orderSets = ['updated_at = NOW()'];
    const orderVals = [];

    if (body.status   !== undefined) {
      orderSets.push('status = ?', 'processing_status = ?');
      orderVals.push(body.status, body.status);
    }
    if (body.priority !== undefined) {
      orderSets.push('priority = ?');
      orderVals.push(body.priority);
    }

    orderVals.push(id);
    await query(`UPDATE lab_orders SET ${orderSets.join(', ')} WHERE id = ?`, orderVals);

    // Sync lab_tasks
    const taskSets = ['updated_at = NOW()'];
    const taskVals = [];
    if (body.status   !== undefined) { taskSets.push('status = ?');   taskVals.push(body.status); }
    if (body.priority !== undefined) { taskSets.push('priority = ?'); taskVals.push(body.priority); }

    taskVals.push(id);
    await query(`UPDATE lab_tasks SET ${taskSets.join(', ')} WHERE id = ?`, taskVals);

    const [updatedOrder] = await query('SELECT * FROM lab_orders WHERE id = ?', [id]);

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'UPDATE_LAB_ORDER', entityType: 'lab_order', entityId: id,
      changes: body, request,
    });

    return Response.json({ labOrder: updatedOrder });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
