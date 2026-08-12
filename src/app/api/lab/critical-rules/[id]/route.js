import { query } from '@/lib/mysql/db';
import { requireAuth, writeAuditLog } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';

const OPERATORS = ['>', '>=', '<', '<=', '=', 'positive'];

// Editable columns mapped from request body keys.
const FIELD_MAP = {
  testCode: 'test_code',
  testName: 'test_name',
  aliases: 'aliases',
  operator: 'operator',
  thresholdValue: 'threshold_value',
  qualitativeMatch: 'qualitative_match',
  unit: 'unit',
  severity: 'severity',
  message: 'message',
  requiresConfirmation: 'requires_confirmation',
  enabled: 'enabled',
};

/** PATCH /api/lab/critical-rules/[id] — edit a rule / toggle enabled (admin). */
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile, response } = await requireAuth(...ROLES.CRITICAL_CONFIG);
    if (response) return response;

    const existing = await query('SELECT * FROM lab_critical_rules WHERE id = ? LIMIT 1', [id]);
    if (!existing.length) return Response.json({ error: 'Rule not found' }, { status: 404 });

    const body = await request.json();
    if (body.operator !== undefined && !OPERATORS.includes(body.operator)) {
      return Response.json({ error: `operator must be one of: ${OPERATORS.join(', ')}` }, { status: 400 });
    }

    const sets = [];
    const vals = [];
    for (const [key, col] of Object.entries(FIELD_MAP)) {
      if (body[key] === undefined) continue;
      let v = body[key];
      if (key === 'requiresConfirmation' || key === 'enabled') v = v ? 1 : 0;
      else if (key === 'thresholdValue') v = (v === '' || v === null) ? null : Number(v);
      sets.push(`${col} = ?`);
      vals.push(v);
    }
    if (!sets.length) return Response.json({ error: 'No editable fields provided.' }, { status: 400 });

    sets.push('updated_at = NOW()');
    await query(`UPDATE lab_critical_rules SET ${sets.join(', ')} WHERE id = ?`, [...vals, id]);

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'CRITICAL_RULE_UPDATE', entityType: 'lab_critical_rule', entityId: id,
      changes: body, request,
    });

    const [rule] = await query('SELECT * FROM lab_critical_rules WHERE id = ?', [id]);
    return Response.json({ rule });
  } catch (err) {
    console.error('critical-rule update error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/lab/critical-rules/[id] — remove a rule (admin). Alerts are kept. */
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile, response } = await requireAuth(...ROLES.CRITICAL_CONFIG);
    if (response) return response;

    const existing = await query('SELECT id, test_name FROM lab_critical_rules WHERE id = ? LIMIT 1', [id]);
    if (!existing.length) return Response.json({ error: 'Rule not found' }, { status: 404 });

    await query('DELETE FROM lab_critical_rules WHERE id = ?', [id]);

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'CRITICAL_RULE_DELETE', entityType: 'lab_critical_rule', entityId: id,
      changes: { testName: existing[0].test_name }, request,
    });

    return Response.json({ deleted: true, id });
  } catch (err) {
    console.error('critical-rule delete error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
