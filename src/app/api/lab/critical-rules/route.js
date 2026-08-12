import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/mysql/db';
import { requireAuth, writeAuditLog } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';

const OPERATORS = ['>', '>=', '<', '<=', '=', 'positive'];

/** GET /api/lab/critical-rules — list all configurable threshold rules. */
export async function GET() {
  try {
    const { response } = await requireAuth(...ROLES.CRITICAL_READ);
    if (response) return response;

    const rules = await query('SELECT * FROM lab_critical_rules ORDER BY test_name ASC, operator ASC');
    return Response.json({ rules });
  } catch (err) {
    console.error('critical-rules list error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/lab/critical-rules — create a rule (Admin Panel only). */
export async function POST(request) {
  try {
    const { user, profile, response } = await requireAuth(...ROLES.CRITICAL_CONFIG);
    if (response) return response;

    const body = await request.json();
    const testCode = (body.testCode || '').trim();
    const testName = (body.testName || '').trim();
    const operator = (body.operator || '').trim();

    if (!testCode || !testName || !operator) {
      return Response.json({ error: 'testCode, testName and operator are required.' }, { status: 400 });
    }
    if (!OPERATORS.includes(operator)) {
      return Response.json({ error: `operator must be one of: ${OPERATORS.join(', ')}` }, { status: 400 });
    }

    const isQualitative = operator === 'positive';
    let thresholdValue = null;
    let qualitativeMatch = null;
    if (isQualitative) {
      qualitativeMatch = (body.qualitativeMatch || 'Positive').trim();
    } else {
      const n = Number(body.thresholdValue);
      if (body.thresholdValue === '' || body.thresholdValue === null || body.thresholdValue === undefined || Number.isNaN(n)) {
        return Response.json({ error: 'A numeric thresholdValue is required for this operator.' }, { status: 400 });
      }
      thresholdValue = n;
    }

    const id = uuidv4();
    await query(
      `INSERT INTO lab_critical_rules
         (id, test_code, test_name, aliases, operator, threshold_value, qualitative_match, unit,
          severity, message, requires_confirmation, enabled, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, testCode, testName, body.aliases || null, operator, thresholdValue, qualitativeMatch,
        body.unit || null, body.severity || 'Critical', body.message || null,
        body.requiresConfirmation === false ? 0 : 1,
        body.enabled === false ? 0 : 1,
        profile?.full_name || 'admin',
      ]
    );

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'CRITICAL_RULE_CREATE', entityType: 'lab_critical_rule', entityId: id,
      changes: { testName, operator, thresholdValue, qualitativeMatch, severity: body.severity || 'Critical' }, request,
    });

    const [rule] = await query('SELECT * FROM lab_critical_rules WHERE id = ?', [id]);
    return Response.json({ rule }, { status: 201 });
  } catch (err) {
    console.error('critical-rule create error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
