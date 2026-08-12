import { query } from '@/lib/mysql/db';

/**
 * Shared loading/shaping for sample-holder ("rack") sessions.
 *
 * A session is the LIS side of loading an analyzer that has no scan control of
 * its own: the operator presses Scan here, scans the holder key the supplier
 * printed on the rack, scans each tube into a numbered position, then puts the
 * holder in the instrument. See mysql/014_rack_scan.sql for the full rationale.
 */

/** Statuses where the session still refers to a holder that is in play. */
export const ACTIVE_STATUSES = ['awaiting_key', 'loading', 'loaded'];

/** Every status a session can hold, in lifecycle order. */
export const STATUSES = [...ACTIVE_STATUSES, 'closed', 'cancelled'];

/** Human wording for the operator, kept server-side so UI and audit agree. */
export const STATUS_LABELS = {
  awaiting_key: 'Waiting for holder key',
  loading: 'Loading tubes',
  loaded: 'In analyzer',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

function shapePosition(r) {
  return {
    id: r.id,
    position: r.position_no,
    barcode: r.barcode,
    orderId: r.lab_order_id || null,
    specimenId: r.specimen_id || null,
    patientName: r.patient_name || null,
    tests: r.test_codes ? String(r.test_codes).split(',').filter(Boolean) : [],
    matched: r.matched === 1,
    note: r.note || null,
    scannedBy: r.scanned_by || null,
    scannedAt: r.scanned_at,
  };
}

export function shapeSession(row, positions = []) {
  if (!row) return null;
  return {
    id: row.id,
    analyzerId: row.analyzer_id,
    analyzerName: row.analyzer_name || row.analyzer_id,
    rackKey: row.rack_key || null,
    status: row.status,
    statusLabel: STATUS_LABELS[row.status] || row.status,
    capacity: Number(row.rack_positions) || 0,
    openedBy: row.opened_by || null,
    openedAt: row.opened_at,
    keyedAt: row.keyed_at,
    loadedAt: row.loaded_at,
    closedAt: row.closed_at,
    closedBy: row.closed_by || null,
    note: row.note || null,
    positions: positions.map(shapePosition),
  };
}

/** Session row joined to its analyzer, or null. Includes holder capacity. */
export async function sessionRow(id) {
  const rows = await query(
    `SELECT s.*, a.name AS analyzer_name, a.rack_positions
       FROM lab_rack_sessions s
       LEFT JOIN analyzer_connections a ON a.id = s.analyzer_id
      WHERE s.id = ?
      LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

export async function positionRows(sessionId) {
  return query(
    `SELECT * FROM lab_rack_positions WHERE session_id = ? ORDER BY position_no`,
    [sessionId]
  );
}

/** A session with its positions, shaped for the API/UI. */
export async function loadSession(id) {
  const row = await sessionRow(id);
  if (!row) return null;
  return shapeSession(row, await positionRows(id));
}

/**
 * The one in-play session for an analyzer, if any.
 * Newest first so a stale row can never shadow the session in the operator's
 * hands; only one is ever open because POST /rack-sessions reuses it.
 */
export async function activeSessionForAnalyzer(analyzerId) {
  const rows = await query(
    `SELECT s.*, a.name AS analyzer_name, a.rack_positions
       FROM lab_rack_sessions s
       LEFT JOIN analyzer_connections a ON a.id = s.analyzer_id
      WHERE s.analyzer_id = ?
        AND s.status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})
      ORDER BY s.opened_at DESC
      LIMIT 1`,
    [analyzerId, ...ACTIVE_STATUSES]
  );
  if (!rows.length) return null;
  return shapeSession(rows[0], await positionRows(rows[0].id));
}

/** Lowest free position number in the holder, or null when it is full. */
export function nextFreePosition(takenPositions, capacity) {
  const taken = new Set(takenPositions);
  for (let n = 1; n <= capacity; n += 1) {
    if (!taken.has(n)) return n;
  }
  return null;
}
