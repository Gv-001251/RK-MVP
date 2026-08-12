import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser } from '@/lib/auth-middleware';
import { broadcastRealtimeEvent } from '@/lib/realtime-registry';
import { analyzerMetrics, shapeAnalyzer } from '@/lib/analyzer-metrics';

/** Constant-time compare so the API key can't be guessed by timing. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const ALLOWED = new Set(['offline', 'online', 'active']);

/**
 * POST /api/lab/analyzer/status
 * The LIS Bridge reports each machine's live state here (heartbeat + on change).
 * Body: {
 *   analyzerId, status: "offline"|"online"|"active",
 *   name?, protocol?, department?, connectionType?, softwareVersion?,
 *   temperature?, reagentLevel?, qcStatus?, queueLength?   // optional telemetry
 * }
 * Response: { ok, analyzerId, status, command } where `command` (if present)
 * is a queued control action for the bridge to execute (reconnect|restart|
 * disable|enable|maintenance_on|maintenance_off) — delivered on the existing
 * heartbeat, then cleared. No separate polling channel is introduced.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { analyzerId, status, name, protocol, department } = body;
    const connectionType = body.connectionType ?? null;
    const softwareVersion = body.softwareVersion ?? null;
    const temperature = body.temperature ?? null;
    const reagentLevel = body.reagentLevel ?? null;
    const qcStatus = body.qcStatus ?? null;

    // Auth: analyzer API key OR an authenticated session.
    const configuredKey = process.env.LIS_ANALYZER_API_KEY;
    const providedKey = request.headers.get('x-lis-api-key');
    let authorized = false;
    if (configuredKey && providedKey && safeEqual(providedKey, configuredKey)) {
      authorized = true;
    } else {
      const { user } = await getAuthenticatedUser();
      if (user) authorized = true;
    }
    if (!authorized) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    if (!analyzerId || !ALLOWED.has(status)) {
      return Response.json({ error: 'analyzerId and a valid status (offline|online|active) are required' }, { status: 400 });
    }

    const health = status === 'active' ? 100 : status === 'online' ? 90 : 0;

    // Detect a real change so we only push MACHINE_STATUS + log on transitions.
    const prev = await query('SELECT status FROM analyzer_connections WHERE id = ? LIMIT 1', [analyzerId]);
    const changed = !prev.length || prev[0].status !== status;

    await query(
      `INSERT INTO analyzer_connections
         (id, name, department, protocol, connection_type, software_version, status, last_ping, health_score,
          temperature, reagent_level, qc_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         last_ping = NOW(),
         health_score = VALUES(health_score),
         name = COALESCE(VALUES(name), name),
         protocol = COALESCE(VALUES(protocol), protocol),
         department = COALESCE(VALUES(department), department),
         connection_type = COALESCE(VALUES(connection_type), connection_type),
         software_version = COALESCE(VALUES(software_version), software_version),
         temperature = COALESCE(VALUES(temperature), temperature),
         reagent_level = COALESCE(VALUES(reagent_level), reagent_level),
         qc_status = COALESCE(VALUES(qc_status), qc_status)`,
      [analyzerId, name || analyzerId, department || null, protocol || null, connectionType, softwareVersion,
       status, health, temperature, reagentLevel, qcStatus]
    );

    if (changed) {
      const event = status === 'offline' ? 'disconnected'
        : (!prev.length || prev[0].status === 'offline' || prev[0].status === 'manual') ? 'connected' : 'status';
      await query(
        `INSERT INTO analyzer_comm_logs (id, analyzer_id, direction, event, detail) VALUES (?, ?, 'inbound', ?, ?)`,
        [uuidv4(), analyzerId, event, `Status → ${status}`]
      );
      broadcastRealtimeEvent('MACHINE_STATUS', { analyzerId, status, name: name || analyzerId });
    }

    // ── Command channel: hand any queued control action to the bridge ──
    let command = null;
    const cmdRow = await query('SELECT pending_command FROM analyzer_connections WHERE id = ? LIMIT 1', [analyzerId]);
    if (cmdRow.length && cmdRow[0].pending_command) {
      command = cmdRow[0].pending_command;
      // Clear atomically so a command is delivered at most once.
      const res = await query(
        'UPDATE analyzer_connections SET pending_command = NULL, last_command = ?, last_command_at = NOW() WHERE id = ? AND pending_command = ?',
        [command, analyzerId, command]
      );
      if (res.affectedRows === 0) {
        command = null; // another heartbeat already took it
      } else {
        await query(
          `INSERT INTO analyzer_comm_logs (id, analyzer_id, direction, event, detail) VALUES (?, ?, 'outbound', 'command', ?)`,
          [uuidv4(), analyzerId, `Command '${command}' delivered to bridge`]
        );
      }
    }

    // Broadcast the full, live row so the dashboard updates without polling.
    const [row] = await query('SELECT * FROM analyzer_connections WHERE id = ?', [analyzerId]);
    if (row) {
      const metrics = await analyzerMetrics(analyzerId);
      broadcastRealtimeEvent('ANALYZER_UPDATED', shapeAnalyzer(row, metrics));
    }

    return Response.json({ ok: true, analyzerId, status, command });
  } catch (err) {
    console.error('analyzer/status error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
