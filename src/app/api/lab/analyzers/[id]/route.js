import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/mysql/db';
import { requireAuth, writeAuditLog } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';
import { broadcastRealtimeEvent } from '@/lib/realtime-registry';
import { analyzerMetrics, shapeAnalyzer } from '@/lib/analyzer-metrics';

// Control actions. `command` is queued for the bridge (picked up on its next
// heartbeat); `set` are LIS-side flag changes that take effect immediately.
const ACTIONS = {
  reconnect:       { command: 'reconnect',       set: {},                      log: 'Reconnect requested' },
  restart:         { command: 'restart',         set: {},                      log: 'Restart connection requested' },
  disable:         { command: 'disable',         set: { enabled: 0 },          log: 'Connection disabled' },
  enable:          { command: 'enable',          set: { enabled: 1 },          log: 'Connection enabled' },
  maintenance_on:  { command: 'maintenance_on',  set: { maintenance_mode: 1 }, log: 'Maintenance mode ON' },
  maintenance_off: { command: 'maintenance_off', set: { maintenance_mode: 0 }, log: 'Maintenance mode OFF' },
};

async function loadShaped(id) {
  const rows = await query('SELECT * FROM analyzer_connections WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) return null;
  const metrics = await analyzerMetrics(id);
  return shapeAnalyzer(rows[0], metrics);
}

/** GET /api/lab/analyzers/[id] — full detail for one analyzer. */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { response } = await requireAuth(...ROLES.ANALYZER_READ);
    if (response) return response;

    const analyzer = await loadShaped(id);
    if (!analyzer) return Response.json({ error: 'Analyzer not found' }, { status: 404 });
    return Response.json({ analyzer });
  } catch (err) {
    console.error('analyzer detail error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/lab/analyzers/[id] — control action.
 * Body: { action: reconnect|restart|disable|enable|maintenance_on|maintenance_off }
 * Queues the command for the bridge, applies LIS-side flags, logs + audits,
 * and broadcasts the updated row over SSE.
 */
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile, response } = await requireAuth(...ROLES.ANALYZER_MANAGE);
    if (response) return response;

    const body = await request.json().catch(() => ({}));
    const action = body.action;
    const spec = ACTIONS[action];
    if (!spec) {
      return Response.json({ error: `Invalid action. One of: ${Object.keys(ACTIONS).join(', ')}` }, { status: 400 });
    }

    const existing = await query('SELECT id FROM analyzer_connections WHERE id = ? LIMIT 1', [id]);
    if (!existing.length) return Response.json({ error: 'Analyzer not found' }, { status: 404 });

    const actor = profile?.full_name || 'Lab Staff';
    const sets = ['pending_command = ?', 'command_requested_by = ?', 'command_requested_at = NOW()'];
    const vals = [spec.command, actor];
    for (const [col, v] of Object.entries(spec.set)) { sets.push(`${col} = ?`); vals.push(v); }
    await query(`UPDATE analyzer_connections SET ${sets.join(', ')} WHERE id = ?`, [...vals, id]);

    await query(
      `INSERT INTO analyzer_comm_logs (id, analyzer_id, direction, event, detail) VALUES (?, ?, 'system', ?, ?)`,
      [uuidv4(), id, action.startsWith('maintenance') ? 'maintenance' : 'command', `${spec.log} by ${actor}`]
    );

    await writeAuditLog(null, {
      userId: user?.id, userName: actor,
      action: `ANALYZER_${action.toUpperCase()}`, entityType: 'analyzer_connection', entityId: id,
      changes: { action, command: spec.command }, request,
    });

    const analyzer = await loadShaped(id);
    broadcastRealtimeEvent('ANALYZER_UPDATED', analyzer);

    return Response.json({ analyzer, queuedCommand: spec.command });
  } catch (err) {
    console.error('analyzer action error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
