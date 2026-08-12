import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/mysql/db';
import { requireAuth, writeAuditLog } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';
import { broadcastRealtimeEvent } from '@/lib/realtime-registry';
import { loadSession, sessionRow, positionRows, nextFreePosition } from '@/lib/rack-session';
import { resolveSpecimen, UNRESOLVED } from '@/lib/specimen-resolve';

/**
 * Tubes going into a sample holder, one row per physical position.
 *
 * Every tube is resolved to its order before it is accepted. A tube the LIS
 * cannot identify is refused rather than recorded, because loading it produces
 * a result nobody can attribute — the operator registers the order first, then
 * scans again.
 */

/**
 * POST /api/lab/rack-sessions/[id]/positions
 * Body: { barcode, position?, confirmDuplicate? }
 *
 * `position` defaults to the lowest free slot in the holder, which is what a
 * scanner-only workflow needs: scan, scan, scan, with no keyboard.
 *
 * The same accession is legitimately printed on several tubes for different
 * tests, so a repeat barcode is not an error — but it is also exactly what a
 * double scan looks like. The second one is refused with 409 and the position
 * it already occupies, and only accepted when the operator confirms.
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile, response } = await requireAuth(...ROLES.ANALYZER_MANAGE);
    if (response) return response;

    const row = await sessionRow(id);
    if (!row) return Response.json({ error: 'Rack session not found' }, { status: 404 });

    if (row.status === 'awaiting_key') {
      return Response.json({ error: 'Scan the holder key first.' }, { status: 409 });
    }
    if (row.status !== 'loading') {
      return Response.json(
        { error: `This holder is '${row.status}' and can no longer be changed.` },
        { status: 409 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const barcode = String(body.barcode || '').trim();
    if (!barcode) return Response.json({ error: 'Scan a tube barcode.' }, { status: 400 });

    // ── Identify the tube ──
    const resolved = await resolveSpecimen(barcode);
    if (!resolved.found) {
      const message = resolved.reason === UNRESOLVED.CANCELLED
        ? `Barcode ${barcode} belongs to a cancelled order — do not load this tube.`
        : `Barcode ${barcode} is not in the LIS. Register the order, then scan again.`;
      return Response.json(
        { error: message, reason: resolved.reason, barcode },
        { status: resolved.reason === UNRESOLVED.CANCELLED ? 409 : 404 }
      );
    }

    const existing = await positionRows(id);

    const duplicate = existing.find((p) => p.barcode === barcode);
    if (duplicate && !body.confirmDuplicate) {
      return Response.json(
        {
          error: `${barcode} is already in position ${duplicate.position_no}. Confirm only if this is a second tube for the same accession.`,
          reason: 'duplicate',
          duplicateOf: duplicate.position_no,
          barcode,
        },
        { status: 409 }
      );
    }

    // ── Choose the slot ──
    const capacity = Number(row.rack_positions) || 0;
    const taken = existing.map((p) => p.position_no);
    let position;

    if (body.position !== undefined && body.position !== null && body.position !== '') {
      position = parseInt(body.position, 10);
      if (!Number.isInteger(position) || position < 1 || position > capacity) {
        return Response.json(
          { error: `Position must be between 1 and ${capacity}.` },
          { status: 400 }
        );
      }
      if (taken.includes(position)) {
        return Response.json({ error: `Position ${position} is already filled.` }, { status: 409 });
      }
    } else {
      position = nextFreePosition(taken, capacity);
      if (position === null) {
        return Response.json(
          { error: `The holder is full (${capacity} positions). Load it, then start another.` },
          { status: 409 }
        );
      }
    }

    const actor = profile?.full_name || 'Lab Staff';
    const testCodes = resolved.tests.map((t) => t.code).join(',');
    const positionId = uuidv4();

    await query(
      `INSERT INTO lab_rack_positions
         (id, session_id, position_no, barcode, lab_order_id, specimen_id, patient_name, test_codes, matched, scanned_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        positionId, id, position, barcode,
        resolved.task.id,
        resolved.task.specimen_id || null,
        resolved.task.patient_name || null,
        testCodes || null,
        actor,
      ]
    );

    await writeAuditLog(null, {
      userId: user?.id,
      userName: actor,
      action: 'RACK_TUBE_SCANNED',
      entityType: 'lab_rack_session',
      entityId: id,
      changes: { position, barcode, orderId: resolved.task.id, analyzerId: row.analyzer_id },
      request,
    });

    const session = await loadSession(id);
    broadcastRealtimeEvent('RACK_SESSION_UPDATED', session);

    return Response.json(
      {
        session,
        position: {
          position,
          barcode,
          patientName: resolved.task.patient_name || null,
          specimenId: resolved.task.specimen_id || null,
          priority: resolved.task.priority || 'Routine',
          tests: resolved.tests,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('rack position scan error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/lab/rack-sessions/[id]/positions?position=3
 * Undo a mis-scan while the holder is still being filled.
 */
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile, response } = await requireAuth(...ROLES.ANALYZER_MANAGE);
    if (response) return response;

    const row = await sessionRow(id);
    if (!row) return Response.json({ error: 'Rack session not found' }, { status: 404 });
    if (row.status !== 'loading') {
      return Response.json(
        { error: `This holder is '${row.status}' and can no longer be changed.` },
        { status: 409 }
      );
    }

    const { searchParams } = new URL(request.url);
    const position = parseInt(searchParams.get('position') || '', 10);
    if (!Number.isInteger(position)) {
      return Response.json({ error: 'position is required' }, { status: 400 });
    }

    const result = await query(
      'DELETE FROM lab_rack_positions WHERE session_id = ? AND position_no = ?',
      [id, position]
    );
    if (!result.affectedRows) {
      return Response.json({ error: `Position ${position} is already empty.` }, { status: 404 });
    }

    const actor = profile?.full_name || 'Lab Staff';
    await writeAuditLog(null, {
      userId: user?.id,
      userName: actor,
      action: 'RACK_TUBE_REMOVED',
      entityType: 'lab_rack_session',
      entityId: id,
      changes: { position, analyzerId: row.analyzer_id },
      request,
    });

    const session = await loadSession(id);
    broadcastRealtimeEvent('RACK_SESSION_UPDATED', session);

    return Response.json({ session });
  } catch (err) {
    console.error('rack position remove error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
