import { v4 as uuidv4 } from 'uuid';
import { query, withTransaction } from '@/lib/mysql/db';
import { requireAuth, writeAuditLog } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';
import { broadcastRealtimeEvent } from '@/lib/realtime-registry';
import { computeZ, sideOf, evaluateWestgard } from '@/lib/qc-westgard';

/** GET /api/lab/qc/batches — QC batch history. Filters: analyzerId, status, from, to, limit. */
export async function GET(request) {
  try {
    const { response } = await requireAuth(...ROLES.QC_READ);
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const analyzerId = searchParams.get('analyzerId');
    const status = searchParams.get('status');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10) || 100, 500);

    const where = ['1=1'];
    const vals = [];
    if (analyzerId) { where.push('analyzer_id = ?'); vals.push(analyzerId); }
    if (status) { where.push('status = ?'); vals.push(status); }
    if (from) { where.push('run_at >= ?'); vals.push(from); }
    if (to) { where.push('run_at <= ?'); vals.push(to); }

    const batches = await query(
      `SELECT * FROM qc_batches WHERE ${where.join(' AND ')} ORDER BY run_at DESC LIMIT ?`,
      [...vals, limit]
    );
    return Response.json({ batches });
  } catch (err) {
    console.error('qc batches list error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/lab/qc/batches — record a QC run.
 * Body: { analyzerId, operator?, batchNo?, notes?, runAt?, results: [{ materialId, testCode, value }] }
 * Each result is scored (z) and evaluated against the Westgard multirule using
 * peers in the same run and the prior history for that (analyzer, test, level).
 */
export async function POST(request) {
  try {
    const { user, profile, response } = await requireAuth(...ROLES.QC_RUN);
    if (response) return response;

    const body = await request.json();
    const analyzerId = (body.analyzerId || '').trim();
    const results = Array.isArray(body.results) ? body.results : [];
    if (!analyzerId || results.length === 0) {
      return Response.json({ error: 'analyzerId and at least one result are required.' }, { status: 400 });
    }

    const operator = body.operator || profile?.full_name || 'Lab Staff';
    const runAt = body.runAt ? new Date(body.runAt) : new Date();

    // Load the referenced materials + their analyte targets.
    const materialIds = [...new Set(results.map(r => r.materialId).filter(Boolean))];
    if (!materialIds.length) return Response.json({ error: 'Each result must reference a materialId.' }, { status: 400 });
    const materials = await query(
      `SELECT * FROM qc_materials WHERE id IN (${materialIds.map(() => '?').join(',')})`,
      materialIds
    );
    const materialById = Object.fromEntries(materials.map(m => [m.id, m]));
    const targets = await query(
      `SELECT * FROM qc_analyte_targets WHERE material_id IN (${materialIds.map(() => '?').join(',')})`,
      materialIds
    );
    const targetKey = (mid, code) => `${mid}::${String(code).toUpperCase()}`;
    const targetByKey = Object.fromEntries(targets.map(t => [targetKey(t.material_id, t.test_code), t]));

    // Enrich each result with target stats + z-score.
    const enriched = [];
    for (const r of results) {
      const material = materialById[r.materialId];
      const target = targetByKey[targetKey(r.materialId, r.testCode)];
      if (!material || !target) {
        return Response.json({ error: `No QC target for material/test ${r.materialId}/${r.testCode}.` }, { status: 400 });
      }
      if (r.value === undefined || r.value === null || r.value === '' || Number.isNaN(Number(r.value))) {
        return Response.json({ error: `Result for ${target.test_name} needs a numeric value.` }, { status: 400 });
      }
      const value = Number(r.value);
      const mean = Number(target.target_mean);
      const sd = Number(target.target_sd);
      const z = computeZ(value, mean, sd);
      enriched.push({
        materialId: r.materialId, testCode: target.test_code, testName: target.test_name,
        controlLevel: material.control_level, lot: material.lot_number, unit: target.unit,
        value, mean, sd, z, side: sideOf(z),
      });
    }

    // Evaluate Westgard per result (peers in this run + DB history for the level).
    for (const e of enriched) {
      const peersInRun = enriched
        .filter(o => o !== e && o.testCode === e.testCode && o.controlLevel !== e.controlLevel && o.z != null)
        .map(o => ({ z: o.z }));
      const history = await query(
        `SELECT z_score FROM qc_results
          WHERE analyzer_id = ? AND test_code = ? AND control_level = ?
          ORDER BY run_at DESC, created_at DESC LIMIT 11`,
        [analyzerId, e.testCode, e.controlLevel]
      );
      const historySameLevel = history.map(h => ({ z: Number(h.z_score) })).filter(h => !Number.isNaN(h.z));
      const { flags, status } = evaluateWestgard({ z: e.z, historySameLevel, peersInRun });
      e.flags = flags;
      e.status = status;
    }

    const batchStatus = enriched.some(e => e.status === 'Reject') ? 'Rejected'
      : enriched.some(e => e.status === 'Warning') ? 'Warning' : 'Pass';

    const batchId = uuidv4();
    const batchNo = body.batchNo || `QC-${new Date(runAt).toISOString().slice(0, 10)}-${batchId.slice(0, 4).toUpperCase()}`;

    await withTransaction(async (tx) => {
      await tx.query(
        `INSERT INTO qc_batches (id, batch_no, analyzer_id, operator, status, notes, created_by, run_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [batchId, batchNo, analyzerId, operator, batchStatus, body.notes || null, profile?.full_name || operator, runAt]
      );
      for (const e of enriched) {
        await tx.query(
          `INSERT INTO qc_results
             (id, batch_id, material_id, analyzer_id, test_code, test_name, control_level, lot_number, operator,
              value, target_mean, target_sd, z_score, side, status, flags, run_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), batchId, e.materialId, analyzerId, e.testCode, e.testName, e.controlLevel, e.lot, operator,
           e.value, e.mean, e.sd, e.z != null ? Number(e.z.toFixed(4)) : null, e.side, e.status,
           e.flags.join(',') || null, runAt]
        );
      }
    });

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'QC_BATCH_RUN', entityType: 'qc_batch', entityId: batchId,
      changes: { analyzerId, batchStatus, results: enriched.length, rejects: enriched.filter(e => e.status === 'Reject').map(e => `${e.testName}/${e.controlLevel}:${e.flags.join('+')}`) },
      request,
    });

    broadcastRealtimeEvent('QC_BATCH', {
      batchId, analyzerId, status: batchStatus,
      violations: enriched.filter(e => e.flags.length).map(e => ({ test: e.testName, level: e.controlLevel, flags: e.flags, status: e.status })),
    });

    return Response.json({
      batch: { id: batchId, batchNo, analyzerId, operator, status: batchStatus, runAt },
      results: enriched,
      blocked: batchStatus === 'Rejected',
    }, { status: 201 });
  } catch (err) {
    console.error('qc batch create error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
