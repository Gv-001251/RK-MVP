import { query } from '@/lib/mysql/db';
import { requireAuth } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';

/** Safely parse the stored tests_json blob into an array. */
function parseTests(json) {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * GET /api/lab/analyzer/exceptions
 *
 * Two modes:
 *   1. Default — list held analyzer messages (barcode matched no open order).
 *        ?status=unmatched|applied|dismissed  (default 'unmatched')
 *        ?limit=  (default 50, max 200)
 *   2. Candidate-order lookup for reconciliation — pass ?orderQuery=<text>.
 *        Returns open orders whose id/accession/patient matches, so the operator
 *        can assign a held result to the correct order. Kept here (instead of
 *        reusing /api/lab/orders) so it is gated by EXCEPTION_READ, not the
 *        broader LAB_READ role set.
 */
export async function GET(request) {
  try {
    const { response } = await requireAuth(...ROLES.EXCEPTION_READ);
    if (response) return response;

    const { searchParams } = new URL(request.url);

    // ── Mode 2: candidate-order lookup ──
    const orderQuery = (searchParams.get('orderQuery') || '').trim();
    if (orderQuery) {
      const like = `%${orderQuery}%`;
      const orders = await query(
        `SELECT id, patient_id, patient_name, accession_number, status, department, priority, created_at
           FROM lab_orders
          WHERE status <> 'Cancelled'
            AND (id LIKE ? OR accession_number LIKE ? OR patient_name LIKE ? OR patient_id LIKE ?)
          ORDER BY created_at DESC
          LIMIT 8`,
        [like, like, like, like]
      );

      // Attach ordered test names so the operator can confirm the right order.
      if (orders.length) {
        const ids = orders.map((o) => o.id);
        const ph = ids.map(() => '?').join(',');
        const tests = await query(
          `SELECT lab_order_id, test_name FROM lab_order_tests WHERE lab_order_id IN (${ph})`,
          ids
        );
        const byOrder = {};
        for (const t of tests) (byOrder[t.lab_order_id] ||= []).push(t.test_name);
        for (const o of orders) o.tests = byOrder[o.id] || [];
      }

      return Response.json({ orders });
    }

    // ── Mode 1: held-message queue ──
    const allowed = ['unmatched', 'applied', 'dismissed', 'received'];
    const status = allowed.includes(searchParams.get('status')) ? searchParams.get('status') : 'unmatched';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 200);

    const rows = await query(
      `SELECT id, analyzer_id, message_id, specimen_id, lab_task_id, matched,
              tests_count, status, note, tests_json, raw, created_at, resolved_by, resolved_at
         FROM lab_analyzer_messages
        WHERE status = ?
        ORDER BY created_at DESC
        LIMIT ?`,
      [status, limit]
    );

    const [{ cnt } = { cnt: 0 }] = await query(
      "SELECT COUNT(*) AS cnt FROM lab_analyzer_messages WHERE status = 'unmatched'"
    );

    const exceptions = rows.map((r) => {
      const tests = parseTests(r.tests_json);
      return {
        id: r.id,
        analyzerId: r.analyzer_id,
        messageId: r.message_id,
        specimenId: r.specimen_id,
        labTaskId: r.lab_task_id,
        testsCount: r.tests_count,
        status: r.status,
        note: r.note,
        createdAt: r.created_at,
        resolvedBy: r.resolved_by,
        resolvedAt: r.resolved_at,
        tests,
        hasParsedTests: tests.length > 0,
        raw: r.raw || null,
      };
    });

    return Response.json({ exceptions, unmatchedCount: cnt, status });
  } catch (err) {
    console.error('exceptions list error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
