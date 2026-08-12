import { query } from '@/lib/mysql/db';
import { parseLeadingNumber } from '@/lib/result-matching';
import { parseRange, flagFor } from '@/lib/reference-range';
import { resultImagesForTask } from '@/lib/result-images';

// Re-exported so existing callers can keep importing these from report-data.
export { parseRange, flagFor };

function normName(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Assemble the full data payload for a lab report from a lab order id:
 * order, patient, referring doctor, result rows enriched with units +
 * reference ranges (from lab_test_catalog) and an abnormal H/L flag, critical
 * flags (lab_critical_alerts), any analyzer-generated histograms, the
 * verification record (electronic signature), and abnormal/critical counts.
 *
 * This is the single source for both the report data endpoint and report
 * generation, so anything added here reaches every report consumer at once.
 */
export async function assembleReport(orderId) {
  const orderRows = await query('SELECT * FROM lab_orders WHERE id = ? LIMIT 1', [orderId]);
  if (!orderRows.length) return null;
  const order = orderRows[0];

  const patient = (await query('SELECT id, name, age, gender, phone FROM patients WHERE id = ? LIMIT 1', [order.patient_id]))[0] || null;
  const resultRows = await query(
    'SELECT test_name, result_value, machine_name, completed_at FROM lab_task_tests WHERE lab_task_id = ? ORDER BY test_name',
    [orderId]
  );

  // Reference ranges + units come from the orderable test catalog.
  let catalog = [];
  try { catalog = await query('SELECT test_code, name, department, units, reference_range FROM lab_test_catalog'); } catch { catalog = []; }
  const catByName = {};
  const catByCode = {};
  for (const c of catalog) { catByName[normName(c.name)] = c; catByCode[normName(c.test_code)] = c; }

  let criticals = [];
  try { criticals = await query('SELECT test_name, severity, threshold_text, status, acknowledged FROM lab_critical_alerts WHERE lab_task_id = ?', [orderId]); } catch { criticals = []; }
  const critByName = {};
  for (const c of criticals) critByName[normName(c.test_name)] = c;

  let verification = null;
  try { verification = (await query('SELECT * FROM lab_verifications WHERE lab_order_id = ? LIMIT 1', [orderId]))[0] || null; } catch { verification = null; }

  // Analyzer-generated curves (cell-distribution histograms). Metadata only —
  // each entry carries a url the report fetches separately, so a report payload
  // never balloons with base64. Tolerant of failure like the lookups above: a
  // missing image must never stop a report from rendering.
  let images = [];
  try { images = await resultImagesForTask(orderId); } catch { images = []; }

  let abnormalCount = 0;
  let criticalCount = 0;
  const tests = resultRows.map((r) => {
    const key = normName(r.test_name);
    const cat = catByName[key] || catByCode[key] || null;
    const unit = cat?.units || null;
    const referenceRange = cat?.reference_range || null;
    const department = cat?.department || order.department || 'General';

    const numeric = parseLeadingNumber(r.result_value);
    const range = parseRange(referenceRange);
    let flag = '';
    if (range && numeric != null) {
      if (numeric < range.low) flag = 'L';
      else if (numeric > range.high) flag = 'H';
    }
    const abnormal = !!flag;
    if (abnormal) abnormalCount += 1;

    const crit = critByName[key] || null;
    if (crit) criticalCount += 1;

    return {
      testName: r.test_name,
      result: r.result_value,
      unit,
      referenceRange,
      department,
      machine: r.machine_name,
      completedAt: r.completed_at,
      flag,
      abnormal,
      critical: !!crit,
      criticalSeverity: crit?.severity || null,
    };
  });

  return {
    order,
    patient,
    doctor: order.doctor_name || null,
    tests,
    images,
    criticals,
    verification,
    counts: { tests: tests.length, abnormal: abnormalCount, critical: criticalCount, images: images.length },
  };
}


/** Load the test catalog into lookup maps keyed by normalized name and code. */
export async function loadCatalogMaps() {
  let catalog = [];
  try { catalog = await query('SELECT test_code, name, department, units, reference_range FROM lab_test_catalog'); } catch { catalog = []; }
  const byName = {};
  const byCode = {};
  for (const c of catalog) { byName[normName(c.name)] = c; byCode[normName(c.test_code)] = c; }
  return { byName, byCode };
}

/** Find a catalog entry for a given test name/code using the maps above. */
export function catLookup(maps, testName) {
  const k = normName(testName);
  return maps.byName[k] || maps.byCode[k] || null;
}
