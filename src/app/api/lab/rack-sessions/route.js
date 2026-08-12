import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/mysql/db';
import { requireAuth, writeAuditLog } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';
import { broadcastRealtimeEvent } from '@/lib/realtime-registry';
import { activeSessionForAnalyzer, loadSession } from '@/lib/rack-session';

/**
 * Sample-holder ("rack") loading sessions.
 *
 * The Maglumi 800 has no scan control on the instrument, so the operator drives
 * loading from here: press Scan, scan the holder key the supplier printed on
 * the rack, scan each tube into a position, then put the holder in the machine.
 *
 * Pressing Scan also queues a `rack_scan` command for the on-prem bridge, which
 * collects it on its next status heartbeat. That is a notification, not an ASTM
 * instruction — E1394 has no standard "prepare to scan" record, and the
 * instrument always initiates the conversation. See tools/maglumi-bridge.mjs.
 */

/**
 * GET /api/lab/rack-sessions?analyzerId=maglumi800
 *   → { session } — the in-play session for that analyzer, or null.
 *
 * GET /api/lab/rack-sessions?analyzerId=maglumi800&history=1&limit=20
 *   → { sessions } — recent sessions for that analyzer, newest first.
 */
export async function GET(request) {
  try {
    const { response } = await requireAuth(...ROLES.ANALYZER_READ);
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const analyzerId = (searchParams.get('analyzerId') || '').trim();
    if (!analyzerId) {
      return Response.json({ error: 'analyzerId is required' }, { status: 400 });
    }

    if (searchParams.get('history')) {
      const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1), 100);
      const rows = await query(
        `SELECT s.id, s.rack_key, s.status, s.opened_by, s.opened_at, s.loaded_at, s.closed_at,
                (SELECT COUNT(*) FROM lab_rack_positions p WHERE p.session_id = s.id) AS tube_count
           FROM lab_rack_sessions s
          WHERE s.analyzer_id = ?
          ORDER BY s.opened_at DESC
          LIMIT ?`,
        [analyzerId, limit]
      );
      return Response.json({
        sessions: rows.map((r) => ({
          id: r.id,
          rackKey: r.rack_key || null,
          status: r.status,
          openedBy: r.opened_by || null,
          openedAt: r.opened_at,
          loadedAt: r.loaded_at,
          closedAt: r.closed_at,
          tubeCount: Number(r.tube_count) || 0,
        })),
      });
    }

    return Response.json({ session: await activeSessionForAnalyzer(analyzerId) });
  } catch (err) {
    console.error('rack-sessions list error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/lab/rack-sessions   body: { analyzerId }
 *
 * Opens a session in `awaiting_key` and queues `rack_scan` for the bridge.
 * Idempotent: if a session is already in play for that analyzer it is returned
 * as-is, so pressing Scan twice can never leave two half-loaded holders behind.
 */
export async function POST(request) {
  try {
    const { user, profile, response } = await requireAuth(...ROLES.ANALYZER_MANAGE);
    if (response) return response;

    const body = await request.json().catch(() => ({}));
    const analyzerId = String(body.analyzerId || '').trim();
    if (!analyzerId) {
      return Response.json({ error: 'analyzerId is required' }, { status: 400 });
    }

    const found = await query(
      'SELECT id, name, rack_positions, enabled, maintenance_mode FROM analyzer_connections WHERE id = ? LIMIT 1',
      [analyzerId]
    );
    if (!found.length) return Response.json({ error: 'Analyzer not found' }, { status: 404 });

    const analyzer = found[0];
    const capacity = Number(analyzer.rack_positions) || 0;
    if (capacity <= 0) {
      return Response.json(
        { error: `${analyzer.name} is not loaded by sample holder, so there is nothing to scan.` },
        { status: 409 }
      );
    }
    if (analyzer.enabled === 0) {
      return Response.json(
        { error: `${analyzer.name} is disabled. Enable the connection before loading a holder.` },
        { status: 409 }
      );
    }

    // Already loading? Hand back the same session rather than starting a rival.
    const existing = await activeSessionForAnalyzer(analyzerId);
    if (existing) return Response.json({ session: existing, reused: true });

    const actor = profile?.full_name || 'Lab Staff';
    const id = uuidv4();

    await query(
      `INSERT INTO lab_rack_sessions (id, analyzer_id, status, opened_by) VALUES (?, ?, 'awaiting_key', ?)`,
      [id, analyzerId, actor]
    );

    // Tell the instrument side a holder scan is starting. Delivered to the
    // bridge on its next heartbeat and cleared there, at most once.
    await query(
      `UPDATE analyzer_connections
          SET pending_command = 'rack_scan', command_requested_by = ?, command_requested_at = NOW()
        WHERE id = ?`,
      [actor, analyzerId]
    );

    await query(
      `INSERT INTO analyzer_comm_logs (id, analyzer_id, direction, event, detail)
       VALUES (?, ?, 'system', 'command', ?)`,
      [uuidv4(), analyzerId, `Holder scan started by ${actor} — waiting for the holder key`]
    );

    await writeAuditLog(null, {
      userId: user?.id,
      userName: actor,
      action: 'RACK_SESSION_OPENED',
      entityType: 'lab_rack_session',
      entityId: id,
      changes: { analyzerId },
      request,
    });

    const session = await loadSession(id);
    broadcastRealtimeEvent('RACK_SESSION_UPDATED', session);

    return Response.json({ session, reused: false }, { status: 201 });
  } catch (err) {
    console.error('rack-sessions open error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
