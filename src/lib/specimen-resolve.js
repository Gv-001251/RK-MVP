import { query } from '@/lib/mysql/db';

/**
 * One place that answers "which order does this scanned barcode belong to?".
 *
 * Three call sites need this answer and must agree exactly, or a tube can be
 * attributed to different patients depending on which door it came through:
 *
 *   - GET  /api/lab/host-query          the analyzer asking before it runs
 *   - POST /api/lab/analyzer/scan       a tube scanned straight onto a machine
 *   - POST /api/lab/rack-sessions/…     a tube scanned into a holder position
 *
 * Resolution is deliberately identity-only — specimen id, order id, or the
 * printed barcode. Never patient name, never "the most recent order", because
 * a near-miss here is a mis-attributed result.
 *
 * A patient carries two barcodes (their registration label and the LIS
 * accession label) and the same accession may be printed on several tubes for
 * different tests, so a barcode maps to at most one order but an order may
 * legitimately appear on several tubes.
 */

/** Reasons a barcode failed to resolve, for callers that report to the operator. */
export const UNRESOLVED = {
  EMPTY: 'empty',
  NOT_FOUND: 'not_found',
  CANCELLED: 'cancelled',
};

/**
 * @param {string} barcode  specimen id, order id, or printed barcode value
 * @returns {Promise<{
 *   found: boolean, barcode: string, reason?: string,
 *   task: object|null, tests: Array<{code:string,name:string,department:string|null}>
 * }>}
 */
export async function resolveSpecimen(barcode) {
  const code = String(barcode ?? '').trim();
  if (!code) return { found: false, barcode: '', reason: UNRESOLVED.EMPTY, task: null, tests: [] };

  const rows = await query(
    `SELECT * FROM lab_tasks
      WHERE specimen_id = ?
         OR id = ?
         OR id = (SELECT lab_order_id FROM barcode_tracking WHERE barcode_value = ? LIMIT 1)
      LIMIT 1`,
    [code, code, code]
  );

  const task = rows[0] || null;
  if (!task) {
    return { found: false, barcode: code, reason: UNRESOLVED.NOT_FOUND, task: null, tests: [] };
  }

  // A cancelled order must not be run. Report it as "nothing ordered" with a
  // distinguishable reason so the UI can say why rather than just "unknown".
  if (task.status === 'Cancelled') {
    return { found: false, barcode: code, reason: UNRESOLVED.CANCELLED, task, tests: [] };
  }

  const tests = await query(
    `SELECT test_code, test_name, department
       FROM lab_order_tests
      WHERE lab_order_id = ?
      ORDER BY department, test_name`,
    [task.id]
  );

  return {
    found: true,
    barcode: code,
    task,
    tests: tests.map((t) => ({
      code: t.test_code || t.test_name,
      name: t.test_name,
      department: t.department || null,
    })),
  };
}

/**
 * The patient/order fields safe to show an operator at the loading bench, so
 * they can confirm the tube in their hand before it goes into a holder.
 */
export function orderSummary(task, fallbackSpecimen = '') {
  if (!task) return null;
  return {
    id: task.id,
    accession: task.specimen_id || fallbackSpecimen,
    patientName: task.patient_name || null,
    patientId: task.clinic_patient_id || null,
    age: task.age ?? null,
    sex: task.gender || null,
    priority: task.priority || 'Routine',
    status: task.status || null,
  };
}
