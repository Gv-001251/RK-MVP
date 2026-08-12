import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser, writeAuditLog } from '@/lib/auth-middleware';
import { broadcastRealtimeEvent } from '@/lib/realtime-registry';
import { applyAnalyzerResults } from '@/lib/apply-analyzer-results';
import { normaliseResultImages, storeResultImages } from '@/lib/result-images';

/** Constant-time comparison so the API key can't be guessed via timing. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * POST /api/lab/analyzer/results
 *
 * The on-prem LIS Bridge posts NORMALISED analyzer results here. Body:
 * {
 *   analyzerId:  "hemat60",
 *   specimenId:  "RKLAB-0007",           // barcode the analyzer scanned
 *   messageId:   "hemat60:RKLAB-0007:...",// optional idempotency key
 *   tests: [ { code:"WBC", value:"7.2", unit:"10^3/uL", flag:"" }, ... ],
 *   images: [ { code, name, label, mimeType, width, height, base64, markers } ],
 *                                         // optional; cell-distribution histograms
 *   raw: "<original analyzer message>"    // optional, kept for audit
 * }
 *
 * Safety model ("no mistakes"):
 *  - Positive barcode match only. If the specimen matches no open order, the
 *    message is HELD (status 'unmatched') and returned 409 — never guessed onto
 *    a patient.
 *  - Idempotent: a repeated message_id is acknowledged, not re-applied.
 *  - Results land as 'Pending Verification' — a human still verifies before release.
 *  - Images are stored against the message either way, so a held result keeps
 *    its histograms and recovers them when it is reconciled.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { analyzerId, specimenId, tests, raw, images } = body;

    // ── Auth: analyzer API key OR an authenticated session ──
    const configuredKey = process.env.LIS_ANALYZER_API_KEY;
    const providedKey = request.headers.get('x-lis-api-key');
    let actorName = null;
    if (configuredKey && providedKey && safeEqual(providedKey, configuredKey)) {
      actorName = `LIS Bridge (${analyzerId || 'analyzer'})`;
    } else {
      const { user, profile } = await getAuthenticatedUser();
      if (user) actorName = profile?.full_name || 'Lab Staff';
    }
    if (!actorName) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Validate payload ──
    if (!analyzerId || typeof analyzerId !== 'string') {
      return Response.json({ error: 'analyzerId is required' }, { status: 400 });
    }
    if (!specimenId || typeof specimenId !== 'string') {
      return Response.json({ error: 'specimenId (scanned barcode) is required' }, { status: 400 });
    }
    if (!Array.isArray(tests) || tests.length === 0) {
      return Response.json({ error: 'tests[] must be a non-empty array' }, { status: 400 });
    }

    const specimen = specimenId.trim();

    // Histograms travel with the results. Validated here rather than trusted:
    // anything that does not decode to a real image is dropped and reported,
    // never stored. A bad image must not cost us the numbers.
    const { rows: imageRows, rejected: rejectedImages } = normaliseResultImages(images);
    if (rejectedImages.length) {
      console.warn('analyzer images rejected:', rejectedImages.map((r) => `${r.code}: ${r.reason}`).join('; '));
    }

    // ── Idempotency key (derive a stable one if the bridge didn't supply it) ──
    let messageId = body.messageId;
    if (!messageId) {
      const digest = crypto.createHash('sha256')
        .update(JSON.stringify({ analyzerId, specimen, tests })).digest('hex').slice(0, 24);
      messageId = `${analyzerId}:${specimen}:${digest}`;
    }

    const dup = await query('SELECT status FROM lab_analyzer_messages WHERE message_id = ? LIMIT 1', [messageId]);
    if (dup.length) {
      return Response.json(
        { status: 'duplicate', message: 'This result was already processed.', messageId, previousStatus: dup[0].status },
        { status: 200 }
      );
    }

    // ── Positive barcode match: specimen_id → barcode_tracking → order id ──
    const taskRows = await query(
      `SELECT * FROM lab_tasks
       WHERE specimen_id = ?
          OR id = ?
          OR id = (SELECT lab_order_id FROM barcode_tracking WHERE barcode_value = ? LIMIT 1)
       LIMIT 1`,
      [specimen, specimen, specimen]
    );
    const task = taskRows[0] || null;
    const messageRowId = uuidv4();

    // ── Unmatched → hold for manual review, do NOT attach anywhere ──
    if (!task) {
      try {
        await query(
          `INSERT INTO lab_analyzer_messages
             (id, analyzer_id, message_id, specimen_id, matched, tests_count, status, note, raw, tests_json)
           VALUES (?, ?, ?, ?, 0, ?, 'unmatched', ?, ?, ?)`,
          [messageRowId, analyzerId, messageId, specimen, tests.length,
           `No open lab order matches specimen '${specimen}'.`, raw || null, JSON.stringify(tests)]
        );
        // Keep the histograms with the held message so reconciling it later
        // recovers the images too, not just the numbers.
        await storeResultImages(null, {
          messageId, analyzerId, specimenId: specimen, labTaskId: null, rows: imageRows,
        });
      } catch (e) {
        if (e && e.code === 'ER_DUP_ENTRY') {
          return Response.json({ status: 'duplicate', messageId }, { status: 200 });
        }
        throw e;
      }
      await writeAuditLog(null, {
        userId: null, userName: actorName,
        action: 'ANALYZER_RESULT_UNMATCHED', entityType: 'lab_analyzer_message', entityId: messageRowId,
        changes: { analyzerId, specimenId: specimen, testsCount: tests.length }, request,
      });
      broadcastRealtimeEvent('RESULTS_UNMATCHED', { analyzerId, specimenId: specimen, testsCount: tests.length });
      return Response.json(
        { status: 'unmatched', message: `No open order for specimen '${specimen}'. Held for manual review.`, messageId },
        { status: 409 }
      );
    }

    // ── Apply results via the shared applier (identical to the manual
    //    exception-reconciliation path): upsert values, advance to
    //    'Pending Verification', run critical/delta/consume hooks. ──
    try {
      await applyAnalyzerResults({
        task,
        analyzerId,
        specimen,
        tests,
        actorName,
        request,
        audit: { messageId },
        writeMessageRow: async (tx) => {
          await tx.query(
            `INSERT INTO lab_analyzer_messages
               (id, analyzer_id, message_id, specimen_id, lab_task_id, matched, tests_count, status, raw, tests_json)
             VALUES (?, ?, ?, ?, ?, 1, ?, 'applied', ?, ?)`,
            [messageRowId, analyzerId, messageId, specimen, task.id, tests.length, raw || null, JSON.stringify(tests)]
          );
          // Inside the same transaction as the results, so an order never ends
          // up with values but no curve (or the reverse).
          await storeResultImages(tx, {
            messageId, analyzerId, specimenId: specimen, labTaskId: task.id, rows: imageRows,
          });
        },
      });
    } catch (e) {
      if (e && e.code === 'ER_DUP_ENTRY') {
        return Response.json({ status: 'duplicate', messageId }, { status: 200 });
      }
      throw e;
    }

    return Response.json({
      status: 'applied',
      taskId: task.id,
      patientName: task.patient_name,
      testsUpdated: tests.length,
      imagesStored: imageRows.length,
      ...(rejectedImages.length ? { imagesRejected: rejectedImages } : {}),
      workflowStatus: 'Pending Verification',
      messageId,
    });
  } catch (err) {
    console.error('Analyzer results ingestion error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
