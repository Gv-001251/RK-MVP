import { query } from '@/lib/mysql/db';

/**
 * Current QC state per analyzer, taken from each analyzer's most recent QC batch.
 * Returns an object keyed by analyzerId: { status, batchId, runAt, overridden }.
 */
export async function analyzerQcStatus(analyzerIds = []) {
  const ids = [...new Set((analyzerIds || []).filter(Boolean))];
  const map = {};
  if (!ids.length) return map;

  const placeholders = ids.map(() => '?').join(',');
  const rows = await query(
    `SELECT b.analyzer_id, b.id, b.status, b.run_at, b.overridden_at
       FROM qc_batches b
       JOIN (
         SELECT analyzer_id, MAX(run_at) AS mx
           FROM qc_batches
          WHERE analyzer_id IN (${placeholders})
          GROUP BY analyzer_id
       ) latest ON latest.analyzer_id = b.analyzer_id AND latest.mx = b.run_at`,
    ids
  );

  for (const r of rows) {
    map[r.analyzer_id] = {
      status: r.status,
      batchId: r.id,
      runAt: r.run_at,
      overridden: !!r.overridden_at,
    };
  }
  return map;
}

/**
 * Analyzers whose latest QC batch is 'Rejected' — these are QC-blocked and
 * their patient results must not be verified until QC passes or is overridden.
 *
 * Fail-open on error (e.g. QC tables not yet migrated): a QC-subsystem failure
 * must not halt the entire lab's verification workflow. Returns [] and logs.
 */
export async function qcBlockedAnalyzers(analyzerIds = []) {
  try {
    const map = await analyzerQcStatus(analyzerIds);
    return Object.entries(map)
      .filter(([, v]) => v.status === 'Rejected')
      .map(([analyzerId, v]) => ({ analyzerId, batchId: v.batchId, runAt: v.runAt }));
  } catch (err) {
    console.error('qcBlockedAnalyzers failed (fail-open):', err.message);
    return [];
  }
}

/**
 * Given a lab order/task id, find the distinct analyzers that produced its
 * results, then return those that are QC-blocked.
 */
export async function qcBlockForOrder(labTaskId) {
  try {
    const rows = await query(
      "SELECT DISTINCT machine_name FROM lab_task_tests WHERE lab_task_id = ? AND machine_name IS NOT NULL AND machine_name <> ''",
      [labTaskId]
    );
    const ids = rows.map(r => r.machine_name);
    if (!ids.length) return [];
    return await qcBlockedAnalyzers(ids);
  } catch (err) {
    console.error('qcBlockForOrder failed (fail-open):', err.message);
    return [];
  }
}
