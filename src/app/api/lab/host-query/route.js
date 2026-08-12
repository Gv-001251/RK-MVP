import crypto from 'crypto';
import { getAuthenticatedUser } from '@/lib/auth-middleware';
import { resolveSpecimen, orderSummary, UNRESOLVED } from '@/lib/specimen-resolve';

/** Constant-time compare so the API key can't be guessed via timing. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * GET /api/lab/host-query?specimen=ACC-2026-000123
 *
 * Bidirectional ("host-query") support: a host-query-capable analyzer scans a
 * barcode and asks the LIS what's ordered for that accession BEFORE it runs.
 * The on-prem LIS Bridge relays that question here and formats our answer back
 * to the analyzer in its own protocol.
 *
 * Identity is keyed on the accession/barcode only — never patient name or
 * timing — exactly like result ingestion, so a query can't cross-contaminate.
 *
 * Auth: the analyzer API key (x-lis-api-key, same as result ingestion) OR an
 * authenticated session. Returns HTTP 200 with { found:false } when no order
 * matches (a normal "nothing ordered" answer, not an error).
 */
export async function GET(request) {
  try {
    // ── Auth: bridge API key OR a signed-in user ──
    const configuredKey = process.env.LIS_ANALYZER_API_KEY;
    const providedKey = request.headers.get('x-lis-api-key');
    let authed = false;
    if (configuredKey && providedKey && safeEqual(providedKey, configuredKey)) {
      authed = true;
    } else {
      const { user } = await getAuthenticatedUser();
      if (user) authed = true;
    }
    if (!authed) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const specimen = (searchParams.get('specimen') || searchParams.get('accession') || '').trim();
    if (!specimen) {
      return Response.json({ error: 'specimen (accession/barcode) is required' }, { status: 400 });
    }

    // Same positive-match resolution as result ingestion and rack loading:
    // specimen_id, order id, or the barcode_tracking value → one open order.
    const resolved = await resolveSpecimen(specimen);

    if (!resolved.found) {
      return Response.json({
        found: false,
        specimenId: specimen,
        tests: [],
        ...(resolved.reason === UNRESOLVED.CANCELLED ? { note: 'Order cancelled' } : {}),
      });
    }

    return Response.json({
      found: true,
      specimenId: resolved.task.specimen_id || specimen,
      order: orderSummary(resolved.task, specimen),
      tests: resolved.tests,
    });
  } catch (err) {
    console.error('host-query error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
