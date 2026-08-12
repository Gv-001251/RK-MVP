import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/mysql/db';
import { broadcastRealtimeEvent } from '@/lib/realtime-registry';
import { normToken, parseLeadingNumber, testMatchesRule } from '@/lib/result-matching';

/**
 * Critical Result Detection.
 *
 * Evaluates incoming result values against the configurable thresholds in
 * lab_critical_rules. A breach creates a lab_critical_alerts row (Active,
 * awaiting technician confirmation), logs a 'created' notification, and
 * broadcasts a CRITICAL_ALERT realtime event to the live banner.
 *
 * Best-effort by design: this is a safety net layered on top of the primary
 * result write, so a failure here must NEVER break ingestion. Call it AFTER
 * the results have committed (mirrors recordSpecimenEvent).
 */

/** Is this result a breach of the given rule? */
function isBreach(rule, resultValue, numericValue) {
  const op = String(rule.operator || '').toLowerCase();

  // Qualitative / positive rules match against the text of the result.
  if (op === 'positive' || op === 'qualitative' || (rule.qualitative_match && rule.threshold_value === null)) {
    const needle = normToken(rule.qualitative_match || 'positive');
    return needle ? normToken(resultValue).includes(needle) : false;
  }

  if (numericValue === null || numericValue === undefined || Number.isNaN(numericValue)) return false;
  const threshold = parseFloat(rule.threshold_value);
  if (Number.isNaN(threshold)) return false;

  switch (op) {
    case '>':  return numericValue > threshold;
    case '>=': return numericValue >= threshold;
    case '<':  return numericValue < threshold;
    case '<=': return numericValue <= threshold;
    case '=':
    case '==': return Math.abs(numericValue - threshold) < 1e-9;
    default:   return false;
  }
}

/** Build a human-readable threshold label, e.g. "> 6.5 mmol/L" or "Positive". */
function thresholdText(rule) {
  const op = String(rule.operator || '').toLowerCase();
  if (op === 'positive' || op === 'qualitative' || (rule.qualitative_match && rule.threshold_value === null)) {
    return rule.qualitative_match || 'Positive';
  }
  const t = parseFloat(rule.threshold_value);
  const num = Number.isNaN(t) ? rule.threshold_value : t;
  return `${rule.operator} ${num}${rule.unit ? ` ${rule.unit}` : ''}`.trim();
}

/**
 * @param {object} ctx
 * @param {string}  ctx.taskId       lab_task id (also used as order id in this schema)
 * @param {string} [ctx.orderId]
 * @param {string} [ctx.patientId]
 * @param {string} [ctx.patientName]
 * @param {string} [ctx.machineName]
 * @param {string} [ctx.actor]
 * @param {Array<{testName:string, resultValue:string, flag?:string}>} ctx.tests
 * @returns {Promise<Array>} the alerts created (empty on no breach / error)
 */
export async function detectCriticalResults(ctx) {
  try {
    if (!ctx || !Array.isArray(ctx.tests) || ctx.tests.length === 0) return [];

    const rules = await query('SELECT * FROM lab_critical_rules WHERE enabled = 1');
    if (!rules.length) return [];

    const { taskId, orderId, patientId, patientName, machineName, actor } = ctx;
    const created = [];

    for (const t of ctx.tests) {
      const testName = t.testName ?? t.test_name ?? t.code ?? t.name;
      const resultValue = t.resultValue ?? t.result_value ?? t.value;
      if (!testName || resultValue === undefined || resultValue === null || `${resultValue}`.trim() === '') continue;

      const numericValue = parseLeadingNumber(resultValue);

      for (const rule of rules) {
        if (!testMatchesRule(testName, rule)) continue;
        if (!isBreach(rule, resultValue, numericValue)) continue;

        // Dedupe: don't re-raise an already-active alert for the same
        // task/test/rule (e.g. a result re-save or repeated ingestion).
        const dup = await query(
          `SELECT id FROM lab_critical_alerts
             WHERE lab_task_id = ? AND test_name = ? AND rule_id = ? AND status = 'Active' LIMIT 1`,
          [taskId || null, String(testName), rule.id]
        );
        if (dup.length) continue;

        const alertId = uuidv4();
        const isQualitative = numericValue === null;
        await query(
          `INSERT INTO lab_critical_alerts
             (id, rule_id, lab_task_id, lab_order_id, patient_id, patient_name, test_name,
              result_value, numeric_value, operator, threshold_text, unit, machine_name,
              severity, message, flag, status, acknowledged)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', 0)`,
          [
            alertId, rule.id, taskId || null, orderId || taskId || null, patientId || null,
            patientName || null, String(testName), String(resultValue),
            isQualitative ? null : numericValue, rule.operator, thresholdText(rule),
            rule.unit || null, machineName || null, rule.severity || 'Critical',
            rule.message || null, t.flag || null,
          ]
        );

        await query(
          `INSERT INTO lab_critical_notifications (id, alert_id, event, channel, actor, detail)
           VALUES (?, ?, 'created', 'in-app', ?, ?)`,
          [uuidv4(), alertId, actor || 'System', `${testName} = ${resultValue} (${thresholdText(rule)})`]
        );

        created.push({
          id: alertId, test_name: String(testName), result_value: String(resultValue),
          threshold_text: thresholdText(rule), severity: rule.severity || 'Critical',
          message: rule.message || null, patient_name: patientName || null,
        });
      }
    }

    if (created.length) {
      broadcastRealtimeEvent('CRITICAL_ALERT', {
        count: created.length,
        taskId: taskId || null,
        patientName: patientName || null,
        alerts: created,
      });
    }

    return created;
  } catch (err) {
    // Never break the primary result write because of the safety net.
    console.error('detectCriticalResults failed:', err.message);
    return [];
  }
}
