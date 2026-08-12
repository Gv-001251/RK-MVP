import { query } from '@/lib/mysql/db';
import { requireAuth } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';
import { recordSpecimenEvent } from '@/lib/specimen-events';

// Resolve a specimen by order id, accession number, or barcode value.
async function findOrder(idOrCode) {
  const rows = await query(
    `SELECT * FROM lab_orders
     WHERE id = ? OR accession_number = ? OR barcode_value = ?
        OR id = (SELECT lab_order_id FROM barcode_tracking WHERE barcode_value = ? LIMIT 1)
     LIMIT 1`,
    [idOrCode, idOrCode, idOrCode, idOrCode]
  );
  return rows[0] || null;
}

/**
 * GET /api/lab/specimens/[id]  ([id] = order id / accession / barcode)
 * Returns the specimen, patient, tests and the full canonical timeline.
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { response } = await requireAuth(...ROLES.SAMPLE_READ);
    if (response) return response;

    const order = await findOrder(id);
    if (!order) return Response.json({ error: 'Specimen not found' }, { status: 404 });

    const pat = await query('SELECT id, name, age, gender, phone FROM patients WHERE id = ? LIMIT 1', [order.patient_id]);
    const tests = await query('SELECT test_name FROM lab_order_tests WHERE lab_order_id = ?', [order.id]);
    const events = await query(
      `SELECT from_status, to_status, action, actor, machine, note, created_at
       FROM lab_sample_events WHERE lab_order_id = ? ORDER BY created_at ASC, id ASC`,
      [order.id]
    );

    // Ensure the timeline always starts with an "Ordered" entry (synthesised
    // from the order timestamp for orders raised before tracking existed).
    const timeline = events.slice();
    if (!timeline.some(e => e.to_status === 'Ordered')) {
      timeline.unshift({
        from_status: null, to_status: 'Ordered', action: 'order_created',
        actor: order.doctor_name, machine: null, note: 'Order created', created_at: order.created_at,
      });
    }

    return Response.json({
      specimen: {
        labOrderId: order.id,
        accessionNumber: order.accession_number,
        barcode: order.barcode_value,
        sampleId: order.sample_id,
        status: order.status,
        priority: order.priority,
        department: order.department,
        orderedAt: order.created_at,
      },
      patient: pat[0] || { id: order.patient_id, name: order.patient_name },
      tests: tests.map(t => t.test_name),
      timeline,
    });
  } catch (err) {
    console.error('specimen timeline error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/lab/specimens/[id]  — append a manual tracking note/event.
 * Body: { note (required), toStatus?, machine? }
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const { profile, response } = await requireAuth(...ROLES.LAB_STAFF);
    if (response) return response;

    const body = await request.json();
    const note = (body.note || '').trim();
    if (!note) return Response.json({ error: 'A note is required' }, { status: 400 });

    const order = await findOrder(id);
    if (!order) return Response.json({ error: 'Specimen not found' }, { status: 404 });

    await recordSpecimenEvent({
      labOrderId: order.id, specimenId: order.accession_number,
      toStatus: body.toStatus || order.status || 'Note', action: 'note',
      actor: profile?.full_name || 'Lab Staff', machine: body.machine || null, note,
    });

    const events = await query(
      `SELECT from_status, to_status, action, actor, machine, note, created_at
       FROM lab_sample_events WHERE lab_order_id = ? ORDER BY created_at ASC, id ASC`,
      [order.id]
    );
    return Response.json({ ok: true, timeline: events });
  } catch (err) {
    console.error('specimen note error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
