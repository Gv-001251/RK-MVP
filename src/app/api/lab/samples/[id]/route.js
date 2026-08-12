import { v4 as uuidv4 } from 'uuid';
import { query, withTransaction } from '@/lib/mysql/db';
import { requireAuth, writeAuditLog } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';

const REJECT_REASONS = ['Hemolyzed', 'Lipemic', 'Clotted', 'Broken Tube', 'Insufficient Quantity', 'Wrong Patient'];

// Allowed transitions: action -> { from: [...statuses], to }
const TRANSITIONS = {
  collect:  { from: ['Ordered', 'Rejected'], to: 'Collected' },   // Rejected → re-collect
  receive:  { from: ['Collected'],           to: 'Received' },
  process:  { from: ['Received'],            to: 'Processing' },
  complete: { from: ['Processing'],          to: 'Completed' },
  reject:   { from: ['Ordered', 'Collected', 'Received', 'Processing'], to: 'Rejected' },
};

/** GET /api/lab/samples/[id]  ([id] = lab order id) — sample + order + timeline. */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { response } = await requireAuth(...ROLES.SAMPLE_READ);
    if (response) return response;

    const orderRows = await query('SELECT * FROM lab_orders WHERE id = ? LIMIT 1', [id]);
    if (!orderRows.length) return Response.json({ error: 'Order not found' }, { status: 404 });
    const order = orderRows[0];

    const sampleRows = await query('SELECT * FROM lab_samples WHERE lab_order_id = ? LIMIT 1', [id]);
    const sample = sampleRows[0] || {
      lab_order_id: id, sample_id: order.sample_id, accession_number: order.accession_number,
      barcode_value: order.barcode_value, status: 'Ordered',
    };

    const pat = await query('SELECT id, name, age, gender, phone FROM patients WHERE id = ? LIMIT 1', [order.patient_id]);
    const tests = await query('SELECT test_name FROM lab_order_tests WHERE lab_order_id = ?', [id]);

    const events = await query(
      'SELECT from_status, to_status, action, actor, note, created_at FROM lab_sample_events WHERE lab_order_id = ? ORDER BY created_at ASC',
      [id]
    );
    // Synthesise the initial "Ordered" entry from the order timestamp.
    const timeline = [
      { to_status: 'Ordered', action: 'order_created', actor: order.doctor_name, note: 'Order created', created_at: order.created_at },
      ...events.filter(e => e.action !== 'order_created'),
    ];

    return Response.json({
      order, patient: pat[0] || null, sample,
      tests: tests.map(t => t.test_name), timeline,
    });
  } catch (err) {
    console.error('sample details error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/lab/samples/[id]  — advance the sample lifecycle.
 * action: collect | receive | process | complete | reject
 */
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const action = body.action;
    const spec = TRANSITIONS[action];
    if (!spec) return Response.json({ error: 'Invalid action' }, { status: 400 });

    const roleSet = action === 'collect' ? ROLES.SAMPLE_COLLECT : ROLES.LAB_STAFF;
    const { user, profile, response } = await requireAuth(...roleSet);
    if (response) return response;
    const actor = profile?.full_name || 'Lab Staff';

    const orderRows = await query('SELECT * FROM lab_orders WHERE id = ? LIMIT 1', [id]);
    if (!orderRows.length) return Response.json({ error: 'Order not found' }, { status: 404 });
    const order = orderRows[0];

    const existing = await query('SELECT * FROM lab_samples WHERE lab_order_id = ? LIMIT 1', [id]);
    const currentStatus = existing[0]?.status || 'Ordered';

    if (!spec.from.includes(currentStatus)) {
      return Response.json(
        { error: `Cannot '${action}' a sample that is '${currentStatus}'.` },
        { status: 400 }
      );
    }

    // Per-action validation + field set
    const sets = ['status = ?', 'updated_at = NOW()'];
    const vals = [spec.to];
    let auditAction = `SAMPLE_${action.toUpperCase()}`;
    let note = body.remarks || null;

    if (action === 'collect') {
      if (!body.collector || !body.sampleType) {
        return Response.json({ error: 'Collector and sample type are required' }, { status: 400 });
      }
      sets.push('collector = ?', 'collection_date = ?', 'collection_time = ?', 'collected_at = NOW()',
        'sample_type = ?', 'tube_type = ?', 'collection_location = ?', 'sample_volume = ?', 'remarks = ?',
        'rejected = 0', 'rejection_reason = NULL');
      vals.push(body.collector, body.collectionDate || null, body.collectionTime || null,
        body.sampleType, body.tubeType || null, body.collectionLocation || null,
        body.sampleVolume || null, body.remarks || null);
      note = `Collected by ${body.collector}${body.sampleType ? ` · ${body.sampleType}` : ''}`;
    } else if (action === 'receive') {
      sets.push('received_by = ?', 'received_at = NOW()');
      vals.push(actor);
      note = note || `Received by ${actor}`;
    } else if (action === 'process') {
      sets.push('processing_at = NOW()');
      note = note || 'Processing started';
    } else if (action === 'complete') {
      sets.push('completed_at = NOW()');
      note = note || 'Processing completed';
    } else if (action === 'reject') {
      const reason = body.reason;
      if (!REJECT_REASONS.includes(reason)) {
        return Response.json({ error: `Rejection reason must be one of: ${REJECT_REASONS.join(', ')}` }, { status: 400 });
      }
      sets.push('rejected = 1', 'rejection_reason = ?', 'rejected_by = ?', 'rejected_at = NOW()');
      vals.push(reason, actor);
      note = `Rejected: ${reason}${body.remarks ? ` — ${body.remarks}` : ''}`;
    }

    await withTransaction(async (tx) => {
      // Ensure the sample row exists (lazy create for orders raised before this module).
      if (!existing.length) {
        await tx.query(
          `INSERT INTO lab_samples (id, lab_order_id, sample_id, accession_number, barcode_value, status)
           VALUES (?, ?, ?, ?, ?, 'Ordered')`,
          [uuidv4(), id, order.sample_id, order.accession_number, order.barcode_value]
        );
      }

      await tx.query(`UPDATE lab_samples SET ${sets.join(', ')} WHERE lab_order_id = ?`, [...vals, id]);

      // Timeline event
      await tx.query(
        `INSERT INTO lab_sample_events (id, lab_order_id, sample_id, from_status, to_status, action, actor, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), id, order.sample_id, currentStatus, spec.to, action, actor, note]
      );

      // Keep the order + workflow task status coherent.
      await tx.query('UPDATE lab_orders SET status = ?, processing_status = ?, updated_at = NOW() WHERE id = ?', [spec.to, spec.to, id]);
      await tx.query('UPDATE lab_tasks SET status = ?, processing_status = ?, updated_at = NOW() WHERE id = ?', [spec.to, spec.to, id]);
    });

    await writeAuditLog(null, {
      userId: user?.id, userName: actor,
      action: auditAction, entityType: 'lab_sample', entityId: id, changes: body, request,
    });

    const [sample] = await query('SELECT * FROM lab_samples WHERE lab_order_id = ?', [id]);
    return Response.json({ sample, status: spec.to });
  } catch (err) {
    console.error('sample transition error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
