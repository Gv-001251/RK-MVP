import { query } from '@/lib/mysql/db';
import { requireAuth } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';

/**
 * GET /api/lab/test-catalog
 * Returns the orderable test catalog and profiles for the New Order screen.
 * { tests: [...], profiles: [{ ..., tests: [testCode, ...] }] }
 */
export async function GET() {
  try {
    const { response } = await requireAuth(...ROLES.LAB_READ);
    if (response) return response;

    const tests = await query(
      'SELECT test_code, name, department, specimen_type, units, reference_range, price FROM lab_test_catalog WHERE is_active = 1 ORDER BY department, name'
    );
    const profiles = await query(
      'SELECT profile_code, name, department, price FROM lab_test_profiles WHERE is_active = 1 ORDER BY name'
    );
    const items = await query('SELECT profile_code, test_code FROM lab_test_profile_items');

    const byProfile = {};
    for (const it of items) (byProfile[it.profile_code] ||= []).push(it.test_code);
    for (const p of profiles) p.tests = byProfile[p.profile_code] || [];

    return Response.json({ tests, profiles });
  } catch (err) {
    console.error('test-catalog error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
