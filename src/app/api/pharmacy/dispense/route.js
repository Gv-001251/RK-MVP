import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser, writeAuditLog } from '@/lib/auth-middleware';

export async function POST(request) {
  try {
    const { user, profile } = await getAuthenticatedUser();
    const body = await request.json();
    const { rxId } = body;
    if (!rxId) return Response.json({ error: 'rxId is required' }, { status: 400 });

    // 1. Fetch prescription + items
    const rxRows = await query('SELECT * FROM prescriptions WHERE id = ? LIMIT 1', [rxId]);
    if (!rxRows.length) return Response.json({ error: 'Prescription not found' }, { status: 404 });
    const rx = rxRows[0];
    if (rx.status === 'Fulfilled') return Response.json({ error: 'Prescription already fulfilled' }, { status: 400 });

    const items = await query('SELECT * FROM prescription_items WHERE prescription_id = ?', [rxId]);

    // 2. Process stock deduction
    const errors = [];
    for (const item of items) {
      const medRows = await query(
        'SELECT * FROM medicine_inventory WHERE LOWER(name) = LOWER(?) LIMIT 1',
        [item.medicine_name.trim()]
      );

      if (!medRows.length) {
        errors.push(`Medicine ${item.medicine_name} not found in inventory.`);
        continue;
      }

      const med = medRows[0];
      const durationVal   = parseInt(item.duration) || 5;
      const qtyToDispense = durationVal * 2;

      if (med.stock < qtyToDispense) {
        errors.push(`Insufficient stock for ${item.medicine_name}. Available: ${med.stock}, Required: ${qtyToDispense}`);
        continue;
      }

      await query(
        'UPDATE medicine_inventory SET stock = stock - ?, updated_at = NOW() WHERE id = ?',
        [qtyToDispense, med.id]
      );
    }

    if (errors.length > 0) {
      return Response.json({ error: 'Dispensing failures: ' + errors.join(' ') }, { status: 400 });
    }

    // 3. Mark prescription fulfilled
    await query("UPDATE prescriptions SET status = 'Fulfilled' WHERE id = ?", [rxId]);

    // 4. Add nursing note
    await query(
      `INSERT INTO nursing_notes (id, patient_id, author, priority, note_text)
       VALUES (?, ?, ?, 'Routine', ?)`,
      [uuidv4(), rx.patient_id, profile?.full_name || 'Pharmacy POS',
       `Prescription ${rxId} items fully dispensed to patient.`]
    );

    const [updatedRx] = await query('SELECT * FROM prescriptions WHERE id = ?', [rxId]);

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'DISPENSE_PRESCRIPTION', entityType: 'prescription', entityId: rxId,
      changes: { rxId }, request,
    });

    return Response.json({ success: true, prescription: updatedRx });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
