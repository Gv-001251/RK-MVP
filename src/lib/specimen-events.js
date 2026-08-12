import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/mysql/db';

/**
 * Append an event to a specimen's canonical timeline (lab_sample_events).
 *
 * Best-effort: the timeline is an audit trail, so a failure here must never
 * break the primary operation (order creation, result ingestion, etc.). Call
 * it AFTER the main work has committed.
 *
 * @param {object} e
 * @param {string} e.labOrderId   required — the order/specimen key
 * @param {string} [e.specimenId] accession / sample id
 * @param {string} [e.fromStatus]
 * @param {string}  e.toStatus    the stage reached (e.g. 'Running')
 * @param {string} [e.action]     machine/user action label
 * @param {string} [e.actor]      user name
 * @param {string} [e.machine]    analyzer name/id, when relevant
 * @param {string} [e.note]
 */
export async function recordSpecimenEvent(e) {
  try {
    if (!e || !e.labOrderId || !e.toStatus) return;
    await query(
      `INSERT INTO lab_sample_events
         (id, lab_order_id, sample_id, from_status, to_status, action, actor, machine, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), e.labOrderId, e.specimenId || null, e.fromStatus || null, e.toStatus,
       e.action || null, e.actor || null, e.machine || null, e.note || null]
    );
  } catch (err) {
    console.error('recordSpecimenEvent failed:', err.message);
  }
}
