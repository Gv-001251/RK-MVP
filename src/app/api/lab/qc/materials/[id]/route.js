import { v4 as uuidv4 } from 'uuid';
import { query, withTransaction } from '@/lib/mysql/db';
import { requireAuth, writeAuditLog } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';

const FIELD_MAP = {
  name: 'name',
  lotNumber: 'lot_number',
  controlLevel: 'control_level',
  analyzerId: 'analyzer_id',
  manufacturer: 'manufacturer',
  expiryDate: 'expiry_date',
  active: 'active',
};

/**
 * PATCH /api/lab/qc/materials/[id] — edit material fields and/or replace its
 * analyte targets (send `targets` to replace the full set).
 */
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile, response } = await requireAuth(...ROLES.QC_CONFIG);
    if (response) return response;

    const existing = await query('SELECT id FROM qc_materials WHERE id = ? LIMIT 1', [id]);
    if (!existing.length) return Response.json({ error: 'Material not found' }, { status: 404 });

    const body = await request.json();

    const sets = [];
    const vals = [];
    for (const [key, col] of Object.entries(FIELD_MAP)) {
      if (body[key] === undefined) continue;
      let v = body[key];
      if (key === 'active') v = v ? 1 : 0;
      sets.push(`${col} = ?`);
      vals.push(v);
    }

    await withTransaction(async (tx) => {
      if (sets.length) {
        sets.push('updated_at = NOW()');
        await tx.query(`UPDATE qc_materials SET ${sets.join(', ')} WHERE id = ?`, [...vals, id]);
      }
      if (Array.isArray(body.targets)) {
        await tx.query('DELETE FROM qc_analyte_targets WHERE material_id = ?', [id]);
        for (const t of body.targets) {
          if (!t.testCode || t.targetMean === undefined || t.targetSd === undefined || Number(t.targetSd) <= 0) continue;
          await tx.query(
            `INSERT INTO qc_analyte_targets (id, material_id, test_code, test_name, unit, target_mean, target_sd)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [uuidv4(), id, String(t.testCode).trim(), (t.testName || t.testCode).trim(), t.unit || null,
             Number(t.targetMean), Number(t.targetSd)]
          );
        }
      }
    });

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'QC_MATERIAL_UPDATE', entityType: 'qc_material', entityId: id,
      changes: body, request,
    });

    const [material] = await query('SELECT * FROM qc_materials WHERE id = ?', [id]);
    const targets = await query('SELECT * FROM qc_analyte_targets WHERE material_id = ?', [id]);
    return Response.json({ material: { ...material, targets } });
  } catch (err) {
    console.error('qc material update error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/lab/qc/materials/[id] — remove a material + its targets (past QC results are kept). */
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile, response } = await requireAuth(...ROLES.QC_CONFIG);
    if (response) return response;

    const existing = await query('SELECT id, name FROM qc_materials WHERE id = ? LIMIT 1', [id]);
    if (!existing.length) return Response.json({ error: 'Material not found' }, { status: 404 });

    await withTransaction(async (tx) => {
      await tx.query('DELETE FROM qc_analyte_targets WHERE material_id = ?', [id]);
      await tx.query('DELETE FROM qc_materials WHERE id = ?', [id]);
    });

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'QC_MATERIAL_DELETE', entityType: 'qc_material', entityId: id,
      changes: { name: existing[0].name }, request,
    });

    return Response.json({ deleted: true, id });
  } catch (err) {
    console.error('qc material delete error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
