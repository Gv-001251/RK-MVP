import { v4 as uuidv4 } from 'uuid';
import { query, withTransaction } from '@/lib/mysql/db';
import { requireAuth, writeAuditLog } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';

/** GET /api/lab/qc/materials — control materials with their analyte targets. */
export async function GET(request) {
  try {
    const { response } = await requireAuth(...ROLES.QC_READ);
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const analyzerId = searchParams.get('analyzerId');
    const activeOnly = searchParams.get('active');

    const where = ['1=1'];
    const vals = [];
    if (analyzerId) { where.push('analyzer_id = ?'); vals.push(analyzerId); }
    if (activeOnly === 'true') { where.push('active = 1'); }

    const materials = await query(
      `SELECT * FROM qc_materials WHERE ${where.join(' AND ')} ORDER BY analyzer_id, control_level`,
      vals
    );

    if (materials.length) {
      const ids = materials.map(m => m.id);
      const targets = await query(
        `SELECT * FROM qc_analyte_targets WHERE material_id IN (${ids.map(() => '?').join(',')}) ORDER BY test_name`,
        ids
      );
      const byMaterial = {};
      for (const t of targets) (byMaterial[t.material_id] ||= []).push(t);
      materials.forEach(m => { m.targets = byMaterial[m.id] || []; });
    }

    return Response.json({ materials });
  } catch (err) {
    console.error('qc materials list error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/lab/qc/materials — create a control material + analyte targets. */
export async function POST(request) {
  try {
    const { user, profile, response } = await requireAuth(...ROLES.QC_CONFIG);
    if (response) return response;

    const body = await request.json();
    const name = (body.name || '').trim();
    const lotNumber = (body.lotNumber || '').trim();
    const controlLevel = (body.controlLevel || '').trim();
    const targets = Array.isArray(body.targets) ? body.targets : [];

    if (!name || !lotNumber || !controlLevel) {
      return Response.json({ error: 'name, lotNumber and controlLevel are required.' }, { status: 400 });
    }
    for (const t of targets) {
      if (!t.testCode || t.targetMean === undefined || t.targetSd === undefined || Number(t.targetSd) <= 0) {
        return Response.json({ error: 'Each target needs testCode, targetMean and a positive targetSd.' }, { status: 400 });
      }
    }

    const id = uuidv4();
    await withTransaction(async (tx) => {
      await tx.query(
        `INSERT INTO qc_materials (id, name, lot_number, control_level, analyzer_id, manufacturer, expiry_date, active, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, name, lotNumber, controlLevel, body.analyzerId || null, body.manufacturer || null,
         body.expiryDate || null, body.active === false ? 0 : 1, profile?.full_name || 'admin']
      );
      for (const t of targets) {
        await tx.query(
          `INSERT INTO qc_analyte_targets (id, material_id, test_code, test_name, unit, target_mean, target_sd)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), id, String(t.testCode).trim(), (t.testName || t.testCode).trim(), t.unit || null,
           Number(t.targetMean), Number(t.targetSd)]
        );
      }
    });

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'QC_MATERIAL_CREATE', entityType: 'qc_material', entityId: id,
      changes: { name, lotNumber, controlLevel, analyzerId: body.analyzerId, targets: targets.length }, request,
    });

    const [material] = await query('SELECT * FROM qc_materials WHERE id = ?', [id]);
    const mTargets = await query('SELECT * FROM qc_analyte_targets WHERE material_id = ?', [id]);
    return Response.json({ material: { ...material, targets: mTargets } }, { status: 201 });
  } catch (err) {
    console.error('qc material create error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
