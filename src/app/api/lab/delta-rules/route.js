import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/mysql/db';
import { requireAuth, writeAuditLog } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';

const DELTA_TYPES = ['absolute', 'percent', 'either'];
const DIRECTIONS = ['increase', 'decrease', 'either'];

/** GET /api/lab/delta-rules — list per-test delta configurations. */
export async function GET() {
  try {
    const { response } = await requireAuth(...ROLES.DELTA_READ);
    if (response) return response;

    const rules = await query('SELECT * FROM lab_delta_rules ORDER BY test_name ASC');
    return Response.json({ rules });
  } catch (err) {
    console.error('delta-rules list error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/lab/delta-rules — create a per-test delta rule (Admin Panel only). */
export async function POST(request) {
  try {
    const { user, profile, response } = await requireAuth(...ROLES.DELTA_CONFIG);
    if (response) return response;

    const body = await request.json();
    const testCode = (body.testCode || '').trim();
    const testName = (body.testName || '').trim();
    const deltaType = (body.deltaType || 'either').trim();
    const direction = (body.direction || 'either').trim();

    if (!testCode || !testName) {
      return Response.json({ error: 'testCode and testName are required.' }, { status: 400 });
    }
    if (!DELTA_TYPES.includes(deltaType)) {
      return Response.json({ error: `deltaType must be one of: ${DELTA_TYPES.join(', ')}` }, { status: 400 });
    }
    if (!DIRECTIONS.includes(direction)) {
      return Response.json({ error: `direction must be one of: ${DIRECTIONS.join(', ')}` }, { status: 400 });
    }

    const absNum = body.absThreshold === '' || body.absThreshold === null || body.absThreshold === undefined ? null : Number(body.absThreshold);
    const pctNum = body.pctThreshold === '' || body.pctThreshold === null || body.pctThreshold === undefined ? null : Number(body.pctThreshold);
    if (absNum !== null && Number.isNaN(absNum)) return Response.json({ error: 'absThreshold must be numeric.' }, { status: 400 });
    if (pctNum !== null && Number.isNaN(pctNum)) return Response.json({ error: 'pctThreshold must be numeric.' }, { status: 400 });

    // Enforce that the chosen type has the threshold(s) it needs.
    if (deltaType === 'absolute' && absNum === null) return Response.json({ error: 'An absolute threshold is required.' }, { status: 400 });
    if (deltaType === 'percent' && pctNum === null) return Response.json({ error: 'A percent threshold is required.' }, { status: 400 });
    if (deltaType === 'either' && absNum === null && pctNum === null) {
      return Response.json({ error: 'Provide an absolute and/or percent threshold.' }, { status: 400 });
    }

    const maxHours = body.maxHours === '' || body.maxHours === null || body.maxHours === undefined ? null : parseInt(body.maxHours, 10);

    const id = uuidv4();
    await query(
      `INSERT INTO lab_delta_rules
         (id, test_code, test_name, aliases, delta_type, abs_threshold, pct_threshold, direction, max_hours,
          unit, severity, message, requires_verification, enabled, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, testCode, testName, body.aliases || null, deltaType, absNum, pctNum, direction,
        Number.isNaN(maxHours) ? null : maxHours, body.unit || null, body.severity || 'Warning',
        body.message || null, body.requiresVerification === false ? 0 : 1, body.enabled === false ? 0 : 1,
        profile?.full_name || 'admin',
      ]
    );

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'DELTA_RULE_CREATE', entityType: 'lab_delta_rule', entityId: id,
      changes: { testName, deltaType, absThreshold: absNum, pctThreshold: pctNum, direction }, request,
    });

    const [rule] = await query('SELECT * FROM lab_delta_rules WHERE id = ?', [id]);
    return Response.json({ rule }, { status: 201 });
  } catch (err) {
    console.error('delta-rule create error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
