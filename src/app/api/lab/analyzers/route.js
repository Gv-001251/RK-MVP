import { query } from '@/lib/mysql/db';
import { requireAuth } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';
import { analyzerMetrics, shapeAnalyzer } from '@/lib/analyzer-metrics';

const RANK = { active: 0, online: 1, maintenance: 2, disabled: 3, offline: 4, manual: 5 };

/**
 * GET /api/lab/analyzers
 * Full management view of every analyzer: config, live status (with staleness),
 * telemetry, and LIS-derived metrics (tests today, queue length).
 */
export async function GET() {
  try {
    const { response } = await requireAuth(...ROLES.ANALYZER_READ);
    if (response) return response;

    const rows = await query('SELECT * FROM analyzer_connections ORDER BY name ASC');
    const now = Date.now();

    const analyzers = await Promise.all(rows.map(async (r) => {
      const metrics = await analyzerMetrics(r.id);
      return shapeAnalyzer(r, metrics, now);
    }));

    analyzers.sort((a, b) =>
      (RANK[a.status] ?? 6) - (RANK[b.status] ?? 6) || String(a.name).localeCompare(String(b.name)));

    return Response.json({ analyzers });
  } catch (err) {
    console.error('lab/analyzers error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
