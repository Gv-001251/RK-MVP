import { query } from '@/lib/mysql/db';

// If a machine hasn't reported within this window, treat it as offline
// (covers the bridge dying without sending a clean "offline").
export const STALE_MS = 60 * 1000;

// Order statuses that no longer occupy an analyzer's work queue.
const TERMINAL = ['Released', 'Amended', 'Report Delivered', 'Report Generated', 'Cancelled', 'Rejected', 'Verified'];

/**
 * Per-analyzer live metrics derived LIS-side:
 *  - testsToday : result values recorded by this analyzer since midnight
 *  - queueLength: orders assigned to this analyzer not yet completed
 */
export async function analyzerMetrics(analyzerId) {
  try {
    const [t] = await query(
      "SELECT COUNT(*) AS c FROM lab_task_tests WHERE machine_name = ? AND completed_at IS NOT NULL AND DATE(completed_at) = CURDATE()",
      [analyzerId]
    );
    const [q] = await query(
      `SELECT COUNT(*) AS c FROM lab_orders WHERE machine_assigned = ? AND status NOT IN (${TERMINAL.map(() => '?').join(',')})`,
      [analyzerId, ...TERMINAL]
    );
    return { testsToday: Number(t?.c) || 0, queueLength: Number(q?.c) || 0 };
  } catch {
    return { testsToday: 0, queueLength: 0 };
  }
}

/**
 * Shape an analyzer_connections row into the object the dashboard consumes.
 * Effective status accounts for maintenance, disabled, manual, and staleness.
 */
export function shapeAnalyzer(r, metrics = { testsToday: 0, queueLength: 0 }, now = Date.now()) {
  const last = r.last_ping ? new Date(r.last_ping).getTime() : 0;
  let effective;
  if (r.status === 'manual' || (r.connection_type || '').startsWith('Manual')) effective = 'manual';
  else if (r.maintenance_mode) effective = 'maintenance';
  else if (r.enabled === 0) effective = 'disabled';
  else {
    const stale = !last || now - last > STALE_MS;
    effective = stale ? 'offline' : (r.status || 'offline');
  }
  return {
    id: r.id,
    name: r.name,
    manufacturer: r.manufacturer || null,
    department: r.department || null,
    protocol: r.protocol || null,
    connectionType: r.connection_type || null,
    ipAddress: r.ip_address && r.ip_address !== '-' ? r.ip_address : null,
    serialPort: r.com_port && r.com_port !== '-' ? r.com_port : null,
    softwareVersion: r.software_version && r.software_version !== 'n/a' ? r.software_version : null,
    status: effective,
    reported: r.status,
    lastSeen: r.last_ping,
    health: r.health_score,
    qcStatus: r.qc_status || 'Unknown',
    temperature: r.temperature != null ? Number(r.temperature) : null,
    reagentLevel: r.reagent_level || null,
    maintenanceMode: !!r.maintenance_mode,
    enabled: r.enabled !== 0,
    pendingCommand: r.pending_command || null,
    lastCommand: r.last_command || null,
    lastCommandAt: r.last_command_at || null,
    // > 0 means the instrument is loaded by sample holder, so the LIS offers
    // the Scan control that arms a holder-loading session.
    rackPositions: Number(r.rack_positions) || 0,
    testsToday: metrics.testsToday,
    queueLength: metrics.queueLength,
  };
}
