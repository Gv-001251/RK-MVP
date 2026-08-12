import { query } from '@/lib/mysql/db';
import { requireAuth, writeAuditLog } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';

const DELTA_TYPES = ['absolute', 'percent', 'either'];
const DIRECTIONS = ['increase', 'decrease', 'either'];

const FIELD_MAP = {
  testCode: 'test_code',
  testName: 'test_name',
  aliases: 'aliases',
  deltaType: 'delta_type',
  absThreshold: 'abs_threshold',
  pctThreshold: 'pct_threshold',
  direction: 'direction',
  maxHours: 'max_hours',
  unit: 'unit',
  severity: 'severity',
  message: 'message',
  requiresVerification: 'requires_verification',
  enabled: 'enabled',
};

/** PATCH /api/lab/delta-rules/[id] — edit a rule / toggle enabled (admin). */
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile, response } = await requireAuth(...ROLES.DELTA_CONFIG);
    if (response) return response;

    const existing = await query('SELECT * FROM lab_delta_rules WHERE id = ? LIMIT 1', [id]);
    if (!existing.length) return Response.json({ error: 'Rule not found' }, { status: 404 });

    const body = await request.json();
    if (body.deltaType !== undefined && !DELTA_TYPES.includes(body.deltaType)) {
      return Response.json({ error: `deltaType must be one of: ${DELTA_TYPES.join(', ')}` }, { status: 400 });
    }
    if (body.direction !== undefined && !DIRECTIONS.includes(body.direction)) {
      return Response.json({ error: `direction must be one of: ${DIRECTIONS.join(', ')}` }, { status: 400 });
    }

    const sets = [];
    const vals = [];
    for (const [key, col] of Object.entries(FIELD_MAP)) {
      if (body[key] === undefined) continue;
      let v = body[key];
      if (key === 'requiresVerification' || key === 'enabled') v = v ? 1 : 0;
      else if (key === 'absThreshold' || key === 'pctThreshold') v = (v === '' || v === null) ? null : Number(v);
      else if (key === 'maxHours') v = (v === '' || v === null) ? null : parseInt(v, 10);
      sets.push(`${col} = ?`);
      vals.push(v);
    }
    if (!sets.length) return Response.json({ error: 'No editable fields provided.' }, { status: 400 });

    sets.push('updated_at = NOW()');
    await query(`UPDATE lab_delta_rules SET ${sets.join(', ')} WHERE id = ?`, [...vals, id]);

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'DELTA_RULE_UPDATE', entityType: 'lab_delta_rule', entityId: id,
      changes: body, request,
    });

    const [rule] = await query('SELECT * FROM lab_delta_rules WHERE id = ?', [id]);
    return Response.json({ rule });
  } catch (err) {
    console.error('delta-rule update error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/lab/delta-rules/[id] — remove a rule (admin). Flags are kept. */
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile, response } = await requireAuth(...ROLES.DELTA_CONFIG);
    if (response) return response;

    const existing = await query('SELECT id, test_name FROM lab_delta_rules WHERE id = ? LIMIT 1', [id]);
    if (!existing.length) return Response.json({ error: 'Rule not found' }, { status: 404 });

    await query('DELETE FROM lab_delta_rules WHERE id = ?', [id]);

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'DELTA_RULE_DELETE', entityType: 'lab_delta_rule', entityId: id,
      changes: { testName: existing[0].test_name }, request,
    });

    return Response.json({ deleted: true, id });
  } catch (err) {
    console.error('delta-rule delete error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
