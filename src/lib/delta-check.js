import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/mysql/db';
import { broadcastRealtimeEvent } from '@/lib/realtime-registry';
import { writeAuditLog } from '@/lib/auth-middleware';
import { normToken, parseLeadingNumber, testMatchesRule } from '@/lib/result-matching';

/**
 * Delta Check validation.
 *
 * Compares each incoming numeric result with the patient's most recent
 * previous result for the same test. If the change exceeds a configured
 * per-test threshold (absolute and/or percent, honouring direction and an
 * optional time window), the result is flagged in lab_delta_flags for manual
 * verification, an audit entry is written, and a DELTA_FLAG event is broadcast.
 *
 * Best-effort: layered on top of the primary result write, it must NEVER break
 * ingestion. Call it AFTER results have committed.
 */

/** Human-readable threshold label, e.g. "Δ ≥ 1.5 mmol/L" / "Δ ≥ 50%". */
function thresholdText(rule) {
  const parts = [];
  const type = String(rule.delta_type || 'either');
  if ((type === 'absolute' || type === 'either') && rule.abs_threshold != null) {
    parts.push(`Δ ≥ ${parseFloat(rule.abs_threshold)}${rule.unit ? ` ${rule.unit}` : ''}`);
  }
  if ((type === 'percent' || type === 'either') && rule.pct_threshold != null) {
    parts.push(`Δ ≥ ${parseFloat(rule.pct_threshold)}%`);
  }
  return parts.join(' or ') || 'Δ threshold';
}

/** Evaluate a delta against a rule. Returns { breach, absDelta, pctDelta, dir }. */
function evaluate(rule, curr, prev) {
  const absDelta = Math.abs(curr - prev);
  const pctDelta = prev !== 0 ? Math.abs((curr - prev) / prev) * 100 : null;
  const dir = curr > prev ? 'increase' : curr < prev ? 'decrease' : 'none';

  // Direction gate.
  if (rule.direction === 'increase' && dir !== 'increase') return { breach: false, absDelta, pctDelta, dir };
  if (rule.direction === 'decrease' && dir !== 'decrease') return { breach: false, absDelta, pctDelta, dir };

  const type = String(rule.delta_type || 'either');
  const absHit = rule.abs_threshold != null && absDelta >= parseFloat(rule.abs_threshold);
  const pctHit = rule.pct_threshold != null && pctDelta != null && pctDelta >= parseFloat(rule.pct_threshold);

  let breach = false;
  if (type === 'absolute') breach = absHit;
  else if (type === 'percent') breach = pctHit;
  else breach = absHit || pctHit; // 'either'

  return { breach, absDelta, pctDelta, dir };
}

/**
 * @param {object} ctx
 * @param {string}  ctx.taskId       lab_task id (also used as order id here)
 * @param {string} [ctx.orderId]
 * @param {string} [ctx.machineName]
 * @param {string} [ctx.actor]
 * @param {Array<{testName:string, resultValue:string}>} ctx.tests
 * @returns {Promise<Array>} the flags created (empty on no breach / error)
 */
export async function runDeltaChecks(ctx) {
  try {
    if (!ctx || !ctx.taskId || !Array.isArray(ctx.tests) || ctx.tests.length === 0) return [];

    const rules = await query('SELECT * FROM lab_delta_rules WHERE enabled = 1');
    if (!rules.length) return [];

    // Patient linkage for the history lookup.
    const taskRows = await query(
      'SELECT id, clinic_patient_id, patient_id, patient_name FROM lab_tasks WHERE id = ? LIMIT 1',
      [ctx.taskId]
    );
    if (!taskRows.length) return [];
    const task = taskRows[0];
    const clinicId = task.clinic_patient_id || null;
    const patId = task.patient_id || null;
    if (!clinicId && !patId) return [];

    // Recent prior results for this patient (excluding the current task).
    const history = await query(
      `SELECT tt.test_name, tt.result_value, tt.completed_at, tt.lab_task_id
         FROM lab_task_tests tt
         JOIN lab_tasks t ON t.id = tt.lab_task_id
        WHERE (t.clinic_patient_id = ? OR t.patient_id = ?)
          AND tt.lab_task_id <> ?
          AND tt.result_value IS NOT NULL AND tt.result_value <> ''
          AND tt.completed_at IS NOT NULL
        ORDER BY tt.completed_at DESC
        LIMIT 500`,
      [clinicId, patId, ctx.taskId]
    );
    if (!history.length) return [];

    const created = [];
    const now = Date.now();

    for (const t of ctx.tests) {
      const testName = t.testName ?? t.test_name ?? t.code ?? t.name;
      const currRaw = t.resultValue ?? t.result_value ?? t.value;
      if (!testName || currRaw === undefined || currRaw === null || `${currRaw}`.trim() === '') continue;

      const curr = parseLeadingNumber(currRaw);
      if (curr === null) continue; // delta needs a numeric value

      // Most-recent prior result for the SAME analyte (matched by name).
      const prevRow = history.find(h => normToken(h.test_name) === normToken(testName));
      if (!prevRow) continue;
      const prev = parseLeadingNumber(prevRow.result_value);
      if (prev === null) continue;

      for (const rule of rules) {
        if (!testMatchesRule(testName, rule)) continue;

        // Time window: skip if the prior result is older than max_hours.
        if (rule.max_hours != null) {
          const prevMs = new Date(prevRow.completed_at).getTime();
          if (!Number.isNaN(prevMs) && (now - prevMs) > rule.max_hours * 3600 * 1000) continue;
        }

        const { breach, absDelta, pctDelta, dir } = evaluate(rule, curr, prev);
        if (!breach) continue;

        // Dedupe: one active flag per task+test+rule.
        const dup = await query(
          `SELECT id FROM lab_delta_flags WHERE lab_task_id = ? AND test_name = ? AND rule_id = ? AND status = 'Flagged' LIMIT 1`,
          [ctx.taskId, String(testName), rule.id]
        );
        if (dup.length) continue;

        const flagId = uuidv4();
        const pctRounded = pctDelta != null ? Number(pctDelta.toFixed(2)) : null;
        await query(
          `INSERT INTO lab_delta_flags
             (id, rule_id, lab_task_id, lab_order_id, patient_id, patient_name, test_name,
              current_value, current_numeric, previous_value, previous_numeric, previous_at, previous_task_id,
              abs_delta, pct_delta, delta_type, direction, threshold_text, unit, machine_name, severity, message, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Flagged')`,
          [
            flagId, rule.id, ctx.taskId, ctx.orderId || ctx.taskId, clinicId || patId, task.patient_name,
            String(testName), String(currRaw), curr, String(prevRow.result_value), prev, prevRow.completed_at,
            prevRow.lab_task_id, absDelta, pctRounded, rule.delta_type, dir, thresholdText(rule),
            rule.unit || null, ctx.machineName || null, rule.severity || 'Warning', rule.message || null,
          ]
        );

        await writeAuditLog(null, {
          userId: null, userName: ctx.actor || 'System',
          action: 'DELTA_FLAG_CREATED', entityType: 'lab_delta_flag', entityId: flagId,
          changes: { test: testName, current: currRaw, previous: prevRow.result_value, absDelta, pctDelta: pctRounded },
        });

        created.push({
          id: flagId, test_name: String(testName), current_value: String(currRaw),
          previous_value: String(prevRow.result_value), abs_delta: absDelta, pct_delta: pctRounded,
          severity: rule.severity || 'Warning', patient_name: task.patient_name,
        });
      }
    }

    if (created.length) {
      broadcastRealtimeEvent('DELTA_FLAG', {
        count: created.length, taskId: ctx.taskId, patientName: task.patient_name, flags: created,
      });
    }
    return created;
  } catch (err) {
    console.error('runDeltaChecks failed:', err.message);
    return [];
  }
}
