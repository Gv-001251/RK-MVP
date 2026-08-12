import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/mysql/db';
import { requireAuth, writeAuditLog } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';
import { broadcastRealtimeEvent } from '@/lib/realtime-registry';
import { recordSpecimenEvent } from '@/lib/specimen-events';
import { loadSession, positionRows, sessionRow } from '@/lib/rack-session';

/**
 * One sample-holder session: bind its key, load it into the analyzer, close it.
 *
 * Each action names the status it may run from, so a stale browser tab cannot
 * drive a holder backwards through the workflow.
 */

const FROM = {
  key: ['awaiting_key'],
  load: ['loading'],
  close: ['loaded'],
  cancel: ['awaiting_key', 'loading', 'loaded'],
};

/** GET /api/lab/rack-sessions/[id] — session with its loaded positions. */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { response } = await requireAuth(...ROLES.ANALYZER_READ);
    if (response) return response;

    const session = await loadSession(id);
    if (!session) return Response.json({ error: 'Rack session not found' }, { status: 404 });
    return Response.json({ session });
  } catch (err) {
    console.error('rack-session detail error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/lab/rack-sessions/[id]
 * Body: { action: 'key', rackKey } | { action: 'load' } | { action: 'close' }
 *     | { action: 'cancel', reason? }
 */
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile, response } = await requireAuth(...ROLES.ANALYZER_MANAGE);
    if (response) return response;

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '');
    if (!FROM[action]) {
      return Response.json(
        { error: `Invalid action. One of: ${Object.keys(FROM).join(', ')}` },
        { status: 400 }
      );
    }

    const row = await sessionRow(id);
    if (!row) return Response.json({ error: 'Rack session not found' }, { status: 404 });

    if (!FROM[action].includes(row.status)) {
      return Response.json(
        { error: `Cannot '${action}' a session that is '${row.status}'.`, status: row.status },
        { status: 409 }
      );
    }

    const actor = profile?.full_name || 'Lab Staff';
    const machineName = row.analyzer_name || row.analyzer_id;
    let detail = '';

    if (action === 'key') {
      const rackKey = String(body.rackKey || '').trim();
      if (!rackKey) {
        return Response.json({ error: 'Scan or type the holder key.' }, { status: 400 });
      }
      await query(
        `UPDATE lab_rack_sessions SET rack_key = ?, keyed_at = NOW(), status = 'loading' WHERE id = ?`,
        [rackKey, id]
      );
      detail = `Holder key ${rackKey} accepted — ready for tubes`;
    }

    if (action === 'load') {
      const tubes = await positionRows(id);
      if (!tubes.length) {
        return Response.json(
          { error: 'Scan at least one tube into the holder before loading it.' },
          { status: 400 }
        );
      }

      await query(
        `UPDATE lab_rack_sessions SET loaded_at = NOW(), status = 'loaded' WHERE id = ?`,
        [id]
      );

      // Point each order at this machine and stamp the specimen timeline. The
      // run itself starts when the analyzer aspirates and asks host-query what
      // is ordered, so nothing here claims a result is in progress.
      for (const tube of tubes) {
        if (!tube.lab_order_id) continue;
        await query(
          'UPDATE lab_orders SET machine_assigned = ?, updated_at = NOW() WHERE id = ?',
          [machineName, tube.lab_order_id]
        );
        await recordSpecimenEvent({
          labOrderId: tube.lab_order_id,
          specimenId: tube.specimen_id,
          toStatus: 'Assigned to Analyzer',
          action: 'rack_loaded',
          actor,
          machine: machineName,
          note: `Holder ${row.rack_key || '—'} position ${tube.position_no}`,
        });
      }

      detail = `Holder ${row.rack_key || '—'} loaded with ${tubes.length} tube(s) by ${actor}`;
    }

    if (action === 'close') {
      await query(
        `UPDATE lab_rack_sessions SET closed_at = NOW(), closed_by = ?, status = 'closed' WHERE id = ?`,
        [actor, id]
      );
      detail = `Holder ${row.rack_key || '—'} unloaded and session closed by ${actor}`;
    }

    if (action === 'cancel') {
      const reason = String(body.reason || '').trim();
      await query(
        `UPDATE lab_rack_sessions
            SET closed_at = NOW(), closed_by = ?, status = 'cancelled', note = ?
          WHERE id = ?`,
        [actor, reason || null, id]
      );
      // Withdraw an unclaimed scan notification so the bridge is not told to
      // arm for a holder the operator has already abandoned.
      await query(
        `UPDATE analyzer_connections SET pending_command = NULL
          WHERE id = ? AND pending_command = 'rack_scan'`,
        [row.analyzer_id]
      );
      detail = `Holder session cancelled by ${actor}${reason ? ` — ${reason}` : ''}`;
    }

    await query(
      `INSERT INTO analyzer_comm_logs (id, analyzer_id, direction, event, detail)
       VALUES (?, ?, 'system', 'command', ?)`,
      [uuidv4(), row.analyzer_id, detail]
    );

    await writeAuditLog(null, {
      userId: user?.id,
      userName: actor,
      action: `RACK_SESSION_${action.toUpperCase()}`,
      entityType: 'lab_rack_session',
      entityId: id,
      changes: { action, analyzerId: row.analyzer_id, rackKey: body.rackKey || row.rack_key || null },
      request,
    });

    const session = await loadSession(id);
    broadcastRealtimeEvent('RACK_SESSION_UPDATED', session);

    return Response.json({ session });
  } catch (err) {
    console.error('rack-session action error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
