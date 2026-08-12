import { v4 as uuidv4 } from 'uuid';
import { withTransaction } from '@/lib/mysql/db';
import { writeAuditLog } from '@/lib/auth-middleware';
import { broadcastRealtimeEvent } from '@/lib/realtime-registry';
import { recordSpecimenEvent } from '@/lib/specimen-events';
import { detectCriticalResults } from '@/lib/critical-detection';
import { runDeltaChecks } from '@/lib/delta-check';
import { consumeForAnalyzer } from '@/lib/inventory-consume';

/**
 * Apply a set of NORMALISED analyzer results to a matched lab task, atomically,
 * then run the post-commit safety hooks (audit, specimen timeline, realtime
 * broadcast, critical-result detection, delta check, reagent consumption).
 *
 * This is the single source of truth for "results land on a patient", shared by:
 *   - POST  /api/lab/analyzer/results               (automatic barcode match)
 *   - PATCH /api/lab/analyzer/exceptions/[id] assign (manual reconciliation)
 *
 * so both paths behave identically: results always land as
 * 'Pending Verification' — a human still signs off before release.
 *
 * The lab_analyzer_messages bookkeeping row differs between callers (an INSERT
 * on fresh ingestion, an UPDATE of the held row on reconciliation), so the
 * caller supplies `writeMessageRow(tx)`, which runs INSIDE the same transaction
 * as the result writes. Throwing from it aborts (and rolls back) the whole
 * apply — used to enforce "resolve an exception exactly once".
 *
 * @param {object}   opts
 * @param {object}   opts.task       lab_tasks row (needs id, patient_name, patient_id/clinic_patient_id)
 * @param {string}   opts.analyzerId analyzer that produced the results
 * @param {string}   opts.specimen   canonical specimen id (the order's accession)
 * @param {Array}    opts.tests      [{ code|name, value, unit, flag, completedAt }]
 * @param {string}   opts.actorName  who/what applied the results (for audit)
 * @param {Request} [opts.request]   original request (for audit ip)
 * @param {object}  [opts.audit]     extra fields merged into the audit `changes`
 * @param {(tx: { query: Function }) => Promise<void>} opts.writeMessageRow
 * @returns {Promise<{ taskId: string, testsUpdated: number }>}
 */
export async function applyAnalyzerResults({
  task, analyzerId, specimen, tests, actorName, request, audit = {}, writeMessageRow,
}) {
  const taskId = task.id;
  const now = new Date();

  // ── Apply results + advance workflow + write bookkeeping row, atomically ──
  await withTransaction(async (tx) => {
    const existingTests = await tx.query('SELECT id, test_name FROM lab_task_tests WHERE lab_task_id = ?', [taskId]);
    const byName = new Map(existingTests.map((r) => [String(r.test_name).trim().toLowerCase(), r]));

    for (const t of tests) {
      const code = String(t.code ?? t.name ?? '').trim();
      if (!code) continue;
      const rawVal = t.value ?? '';
      const valueStr = t.unit ? `${rawVal} ${t.unit}`.trim() : `${rawVal}`.trim();
      const parsed = t.completedAt ? new Date(t.completedAt) : now;
      const completedAt = isNaN(parsed.getTime()) ? now : parsed;

      const match = byName.get(code.toLowerCase());
      if (match) {
        await tx.query(
          'UPDATE lab_task_tests SET result_value = ?, machine_name = ?, completed_at = ? WHERE id = ?',
          [valueStr, analyzerId, completedAt, match.id]
        );
      } else {
        await tx.query(
          'INSERT INTO lab_task_tests (id, lab_task_id, test_name, result_value, machine_name, completed_at) VALUES (?, ?, ?, ?, ?, ?)',
          [uuidv4(), taskId, code, valueStr, analyzerId, completedAt]
        );
      }
    }

    // Results are in — move to verification (a human still signs off).
    await tx.query(
      'UPDATE lab_tasks SET status = ?, processing_status = ?, updated_at = NOW() WHERE id = ?',
      ['Pending Verification', 'Pending Verification', taskId]
    );
    await tx.query(
      'UPDATE lab_orders SET status = ?, processing_status = ?, machine_assigned = ?, result_source = ?, updated_at = NOW() WHERE id = ?',
      ['Pending Verification', 'Pending Verification', analyzerId, 'Analyzer', taskId]
    );

    await writeMessageRow(tx);
  });

  // ── Post-commit hooks. Each is best-effort internally and must not undo the
  //    committed results, so they run after the transaction. ──
  await writeAuditLog(null, {
    userId: null, userName: actorName,
    action: 'ANALYZER_RESULT_APPLIED', entityType: 'lab_task', entityId: taskId,
    changes: { analyzerId, specimenId: specimen, testsCount: tests.length, ...audit }, request,
  });

  await recordSpecimenEvent({ labOrderId: taskId, specimenId: specimen, fromStatus: 'Running', toStatus: 'Analyzer Completed', action: 'results_received', actor: actorName, machine: analyzerId, note: `${tests.length} result(s) received` });
  await recordSpecimenEvent({ labOrderId: taskId, specimenId: specimen, fromStatus: 'Analyzer Completed', toStatus: 'Pending Verification', action: 'awaiting_verification', actor: actorName, machine: analyzerId, note: 'Awaiting technician verification' });

  broadcastRealtimeEvent('RESULTS_RECEIVED', {
    taskId, analyzerId, specimenId: specimen,
    patientName: task.patient_name, testsCount: tests.length, status: 'Pending Verification',
  });

  // Critical Result Detection — evaluate applied values against thresholds.
  await detectCriticalResults({
    taskId,
    orderId: taskId,
    patientId: task.patient_id || task.clinic_patient_id || null,
    patientName: task.patient_name,
    machineName: analyzerId,
    actor: actorName,
    tests: tests.map((t) => ({
      testName: t.code ?? t.name,
      resultValue: t.unit ? `${t.value ?? ''} ${t.unit}`.trim() : `${t.value ?? ''}`.trim(),
      flag: t.flag || null,
    })),
  });

  // Delta Check — compare against the patient's previous result.
  await runDeltaChecks({
    taskId,
    orderId: taskId,
    machineName: analyzerId,
    actor: actorName,
    tests: tests.map((t) => ({
      testName: t.code ?? t.name,
      resultValue: t.unit ? `${t.value ?? ''} ${t.unit}`.trim() : `${t.value ?? ''}`.trim(),
    })),
  });

  // Auto-consume reagents for this analyzer (one draw-down per test).
  await consumeForAnalyzer({ analyzerId, testCount: tests.length, actor: actorName, reference: specimen });

  return { taskId, testsUpdated: tests.length };
}
