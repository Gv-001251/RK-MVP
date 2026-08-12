import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { query, withTransaction } from '@/lib/mysql/db';
import { requireAuth, writeAuditLog } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';
import { recordSpecimenEvent } from '@/lib/specimen-events';
import { qcBlockForOrder } from '@/lib/qc-status';
import { resultImagesForTask } from '@/lib/result-images';

// Role-gated transitions. Pending → Technician Review → Senior Review →
// Released → Amended (+ Rejected). needsSig = requires an electronic signature.
const TRANSITIONS = {
  verify:  { from: ['Pending', 'Rejected'], to: 'Technician Review', roles: ROLES.VERIFY_TECH, needsSig: true },
  reject:  { from: ['Pending', 'Technician Review', 'Senior Review'], to: 'Rejected', roles: ROLES.VERIFY_TECH, needsReason: true },
  approve: { from: ['Technician Review'], to: 'Senior Review', roles: ROLES.VERIFY_SENIOR, needsSig: true },
  release: { from: ['Senior Review'], to: 'Released', roles: ROLES.VERIFY_SENIOR, needsSig: true },
  amend:   { from: ['Released', 'Amended'], to: 'Amended', roles: ROLES.VERIFY_AMEND, needsSig: true, needsReason: true },
};

/** GET /api/lab/verifications/[id] — results, verification state, and history. */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { response } = await requireAuth(...ROLES.VERIFY_READ);
    if (response) return response;

    const orderRows = await query('SELECT * FROM lab_orders WHERE id = ? LIMIT 1', [id]);
    if (!orderRows.length) return Response.json({ error: 'Order not found' }, { status: 404 });
    const order = orderRows[0];

    const patient = (await query('SELECT id, name, age, gender, phone FROM patients WHERE id = ? LIMIT 1', [order.patient_id]))[0] || null;
    const results = await query(
      'SELECT test_name, result_value, machine_name, completed_at FROM lab_task_tests WHERE lab_task_id = ? ORDER BY test_name',
      [id]
    );
    const vRows = await query('SELECT * FROM lab_verifications WHERE lab_order_id = ? LIMIT 1', [id]);
    const verification = vRows[0] || { lab_order_id: id, status: 'Pending', amend_count: 0 };
    const history = await query(
      `SELECT from_status, to_status, action, actor, role, signature, notes, created_at
       FROM lab_verification_events WHERE lab_order_id = ? ORDER BY created_at ASC, id ASC`,
      [id]
    );

    // QC gate context: analyzers producing this order whose latest QC failed.
    const qcBlocked = await qcBlockForOrder(id);

    // Analyzer-generated curves for this order. Metadata only — each carries a
    // url the client fetches separately, so the blobs stay out of this payload.
    const images = await resultImagesForTask(id);

    return Response.json({ order, patient, results, verification, history, qcBlocked, images });
  } catch (err) {
    console.error('verification detail error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/lab/verifications/[id]
 * Body: { action, signature?, notes?, reason? }
 * action ∈ verify | reject | approve | release | amend
 */
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;

    // Authenticate first (any verification-mutation role) so anonymous callers
    // cannot probe the endpoint; the precise per-action role check follows.
    const mutationRoles = [...new Set([...ROLES.VERIFY_TECH, ...ROLES.VERIFY_SENIOR, ...ROLES.VERIFY_AMEND])];
    const { user, profile, response } = await requireAuth(...mutationRoles);
    if (response) return response;
    const actor = profile?.full_name || 'Lab Staff';
    const role = profile?.role || 'unknown';

    const body = await request.json();
    const action = body.action;
    const spec = TRANSITIONS[action];
    if (!spec) return Response.json({ error: 'Invalid verification action' }, { status: 400 });
    if (!spec.roles.includes(role)) {
      return Response.json({ error: `Access denied. Required role: ${spec.roles.join(' or ')}` }, { status: 403 });
    }

    const orderRows = await query('SELECT * FROM lab_orders WHERE id = ? LIMIT 1', [id]);
    if (!orderRows.length) return Response.json({ error: 'Order not found' }, { status: 404 });

    const existing = await query('SELECT * FROM lab_verifications WHERE lab_order_id = ? LIMIT 1', [id]);
    const current = existing[0] || { status: 'Pending' };
    if (!spec.from.includes(current.status)) {
      return Response.json({ error: `Cannot '${action}' a result that is '${current.status}'.` }, { status: 400 });
    }

    // QC gate: patient results must not be verified/approved/released while the
    // producing analyzer's latest QC batch is failed (unless overridden).
    if (['verify', 'approve', 'release'].includes(action)) {
      const qcBlocked = await qcBlockForOrder(id);
      if (qcBlocked.length) {
        return Response.json({
          error: `QC failed for analyzer(s): ${qcBlocked.map(b => b.analyzerId).join(', ')}. Resolve or override QC before verifying patient results.`,
          qcBlocked,
        }, { status: 409 });
      }
    }

    const signature = (body.signature || '').trim();
    const reason = (body.reason || '').trim();
    const notes = body.notes || null;
    if (spec.needsSig && !signature) {
      return Response.json({ error: 'An electronic signature is required for this action.' }, { status: 400 });
    }
    if (spec.needsReason && !reason) {
      return Response.json({ error: 'A reason is required for this action.' }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const signatureHash = signature
      ? crypto.createHash('sha256').update(`${user?.id || ''}|${action}|${id}|${nowIso}|${signature}`).digest('hex')
      : null;

    // Per-action column updates on lab_verifications.
    const sets = ['status = ?', 'updated_at = NOW()'];
    const vals = [spec.to];
    if (action === 'verify') {
      sets.push('reviewed_by = ?', 'reviewed_role = ?', 'reviewed_at = NOW()', 'reviewed_signature = ?', 'review_notes = ?', 'rejected = 0');
      vals.push(actor, role, signature, notes);
    } else if (action === 'reject') {
      sets.push('rejected = 1', 'rejected_by = ?', 'rejected_at = NOW()', 'reject_reason = ?');
      vals.push(actor, reason);
    } else if (action === 'approve') {
      sets.push('approved_by = ?', 'approved_role = ?', 'approved_at = NOW()', 'approved_signature = ?', 'approval_notes = ?');
      vals.push(actor, role, signature, notes);
    } else if (action === 'release') {
      sets.push('released_by = ?', 'released_at = NOW()', 'release_signature = ?');
      vals.push(actor, signature);
    } else if (action === 'amend') {
      sets.push('amended_by = ?', 'amended_at = NOW()', 'amend_reason = ?', 'amend_signature = ?', 'amend_count = amend_count + 1');
      vals.push(actor, reason, signature);
    }

    let conflict = false;
    try {
      await withTransaction(async (tx) => {
        if (!existing.length) {
          await tx.query(
            'INSERT INTO lab_verifications (id, lab_order_id, status) VALUES (?, ?, ?)',
            [uuidv4(), id, 'Pending']
          );
        }
        // Conditional on the observed from-status: if a concurrent request
        // already transitioned this record, affectedRows is 0 and we abort so
        // two sign-offs can't both succeed.
        const upd = await tx.query(
          `UPDATE lab_verifications SET ${sets.join(', ')} WHERE lab_order_id = ? AND status = ?`,
          [...vals, id, current.status]
        );
        if (!upd || upd.affectedRows === 0) { conflict = true; throw new Error('__VERIFY_CONFLICT__'); }

        await tx.query(
          `INSERT INTO lab_verification_events
             (id, lab_order_id, from_status, to_status, action, actor, role, signature, signature_hash, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), id, current.status, spec.to, action, actor, role, signature || null, signatureHash, notes || reason || null]
        );

        // Keep order + workflow task status coherent with the verification stage.
        await tx.query('UPDATE lab_orders SET status = ?, processing_status = ?, updated_at = NOW() WHERE id = ?', [spec.to, spec.to, id]);
        await tx.query('UPDATE lab_tasks SET status = ?, processing_status = ?, updated_at = NOW() WHERE id = ?', [spec.to, spec.to, id]);
      });
    } catch (e) {
      if (conflict) {
        return Response.json({ error: 'This result was just updated by someone else. Refresh and retry.' }, { status: 409 });
      }
      throw e;
    }

    // Reflect on the specimen timeline where it maps to a canonical stage.
    const specimenStage = { approve: 'Verified', release: 'Released', amend: 'Amended' }[action];
    if (specimenStage) {
      await recordSpecimenEvent({
        labOrderId: id, specimenId: orderRows[0].accession_number, toStatus: specimenStage,
        action, actor, note: notes || reason || `${action} by ${actor}`,
      });
    }

    await writeAuditLog(null, {
      userId: user?.id, userName: actor,
      action: `VERIFY_${action.toUpperCase()}`, entityType: 'lab_verification', entityId: id,
      changes: { action, role, hasSignature: !!signature, reason: reason || undefined }, request,
    });

    const [verification] = await query('SELECT * FROM lab_verifications WHERE lab_order_id = ?', [id]);
    return Response.json({ verification, status: spec.to });
  } catch (err) {
    console.error('verification action error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
