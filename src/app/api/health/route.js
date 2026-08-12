import { query } from '@/lib/mysql/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health — unauthenticated liveness/readiness probe for load
 * balancers and monitoring. Pings the database. 200 when healthy, 503 when the
 * DB is unreachable.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    await query('SELECT 1');
    return Response.json({ status: 'ok', db: true, latencyMs: Date.now() - startedAt, time: new Date().toISOString() });
  } catch {
    return Response.json({ status: 'degraded', db: false, error: 'db_unreachable', time: new Date().toISOString() }, { status: 503 });
  }
}
