import { query } from '@/lib/mysql/db';
import { requireAuth, writeAuditLog } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';
import { broadcastRealtimeEvent } from '@/lib/realtime-registry';
import { applyAnalyzerResults } from '@/lib/apply-analyzer-results';
import { linkResultImages } from '@/lib/result-images';

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
 * PATCH /api/lab/analyzer/exceptions/[id]
 *
 * Reconcile a held (barcode-unmatched) analyzer result.
 *   action: 'assign'  → body { orderId }  attach the held result to an order
 *                       and apply it (lands as 'Pending Verification').
 *   action: 'dismiss' → body { reason }   discard the held result with a reason.
 *
 * Both transitions are guarded by a conditional UPDATE on status = 'unmatched',
 * so two operators resolving the same exception can't double-apply: the first
 * wins, the second gets 409.
 */
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile, response } = await requireAuth(...ROLES.EXCEPTION_MANAGE);
    if (response) return response;

    const actorName = profile?.full_name || 'Lab Staff';
    const body = await request.json().catch(() => ({}));
    const action = body.action;

    const rows = await query('SELECT * FROM lab_analyzer_messages WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) return Response.json({ error: 'Exception not found' }, { status: 404 });
    const msg = rows[0];

    if (msg.status !== 'unmatched') {
      return Response.json(
        { error: `This result is already ${msg.status} and can no longer be reconciled.` },
        { status: 409 }
      );
    }

    // ── Assign: attach to an order and apply the results ──
    if (action === 'assign') {
      const orderId = (body.orderId || '').trim();
      if (!orderId) return Response.json({ error: 'orderId is required to assign' }, { status: 400 });

      const tests = parseTests(msg.tests_json);
      if (!tests.length) {
        return Response.json(
          { error: 'This held result has no captured values to apply (it predates parsed-result storage). Dismiss it and enter the result manually instead.' },
          { status: 422 }
        );
      }

      const taskRows = await query('SELECT * FROM lab_tasks WHERE id = ? LIMIT 1', [orderId]);
      if (!taskRows.length) return Response.json({ error: 'Target order not found' }, { status: 404 });
      const task = taskRows[0];
      if (task.status === 'Cancelled') {
        return Response.json({ error: 'Cannot assign results to a cancelled order' }, { status: 400 });
      }

      // Canonical specimen is the order's own accession, not the (possibly
      // mistyped) id the analyzer reported. Keep the reported one in the audit.
      const specimen = task.specimen_id || msg.specimen_id;

      try {
        await applyAnalyzerResults({
          task,
          analyzerId: msg.analyzer_id,
          specimen,
          tests,
          actorName,
          request,
          audit: { reconciledFrom: 'exception_queue', exceptionId: id, reportedSpecimenId: msg.specimen_id, messageId: msg.message_id },
          writeMessageRow: async (tx) => {
            const res = await tx.query(
              `UPDATE lab_analyzer_messages
                  SET lab_task_id = ?, matched = 1, status = 'applied',
                      resolved_by = ?, resolved_at = NOW(),
                      note = CONCAT(COALESCE(note, ''), ?)
                WHERE id = ? AND status = 'unmatched'`,
              [task.id, actorName, ` | Assigned to ${task.id} by ${actorName}`, id]
            );
            if (!res || !res.affectedRows) {
              const err = new Error('ALREADY_RESOLVED');
              err.code = 'ALREADY_RESOLVED';
              throw err;
            }
            // Histograms were stored when the message arrived but had no patient
            // to belong to. Now they do.
            await linkResultImages(tx, { messageId: msg.message_id, labTaskId: task.id });
          },
        });
      } catch (e) {
        if (e && (e.code === 'ALREADY_RESOLVED' || e.code === 'ER_DUP_ENTRY')) {
          return Response.json({ error: 'This result was just reconciled by someone else.' }, { status: 409 });
        }
        throw e;
      }

      await writeAuditLog(null, {
        userId: user?.id, userName: actorName,
        action: 'RECONCILE_ANALYZER_EXCEPTION', entityType: 'lab_analyzer_message', entityId: id,
        changes: {
          resolution: 'assigned', orderId: task.id, analyzerId: msg.analyzer_id,
          reportedSpecimenId: msg.specimen_id, appliedSpecimenId: specimen, testsCount: tests.length,
        },
        request,
      });

      broadcastRealtimeEvent('EXCEPTION_RESOLVED', {
        id, resolution: 'assigned', taskId: task.id, analyzerId: msg.analyzer_id,
      });

      const [imageCount] = await query(
        'SELECT COUNT(*) AS c FROM lab_result_images WHERE lab_task_id = ?', [task.id]
      );

      return Response.json({
        status: 'assigned',
        exceptionId: id,
        taskId: task.id,
        patientName: task.patient_name,
        testsApplied: tests.length,
        imagesLinked: Number(imageCount?.c) || 0,
        workflowStatus: 'Pending Verification',
      });
    }

    // ── Dismiss: discard the held result with a reason ──
    if (action === 'dismiss') {
      const reason = (body.reason || '').trim();
      if (!reason) return Response.json({ error: 'A dismissal reason is required' }, { status: 400 });

      const res = await query(
        `UPDATE lab_analyzer_messages
            SET status = 'dismissed', resolved_by = ?, resolved_at = NOW(),
                note = CONCAT(COALESCE(note, ''), ?)
          WHERE id = ? AND status = 'unmatched'`,
        [actorName, ` | Dismissed by ${actorName}: ${reason}`, id]
      );
      if (!res || !res.affectedRows) {
        return Response.json({ error: 'This result was just reconciled by someone else.' }, { status: 409 });
      }

      await writeAuditLog(null, {
        userId: user?.id, userName: actorName,
        action: 'DISMISS_ANALYZER_EXCEPTION', entityType: 'lab_analyzer_message', entityId: id,
        changes: { resolution: 'dismissed', reason, analyzerId: msg.analyzer_id, reportedSpecimenId: msg.specimen_id },
        request,
      });

      broadcastRealtimeEvent('EXCEPTION_RESOLVED', { id, resolution: 'dismissed', analyzerId: msg.analyzer_id });

      return Response.json({ status: 'dismissed', exceptionId: id });
    }

    return Response.json({ error: "Unknown action. Use 'assign' or 'dismiss'." }, { status: 400 });
  } catch (err) {
    console.error('exception reconcile error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
