import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser } from '@/lib/auth-middleware';

/**
 * GET /api/lab/analyzer/maglumi/status
 *
 * Returns the full state of the Maglumi 800 for the dedicated control panel:
 * - Connection status + last heartbeat
 * - Reagent slots (9) with RFID-sourced data (test name, lot, expiry, remaining)
 * - Sample positions (40) with barcode + order info
 * - Incubator status (13 slots, temperature)
 * - Active tests in progress
 * - Recent completed results
 * - Today's test count
 *
 * The data is assembled from:
 *   - analyzer_connections (live status, last_ping, temperature)
 *   - maglumi_reagents table (RFID data, populated by the bridge)
 *   - lab_orders / lab_tasks with machine_assigned = 'maglumi800'
 *   - lab_analyzer_messages for recent results
 */
export async function GET(request) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Analyzer connection status ──
    const [analyzer] = await query(
      `SELECT status, last_ping, health_score, temperature, reagent_level, qc_status,
              protocol, port, ip_address, com_port, baud_rate
       FROM analyzer_connections WHERE id = 'maglumi800' LIMIT 1`
    );

    const status = analyzer?.status || 'offline';
    const lastPing = analyzer?.last_ping || null;
    const temperature = analyzer?.temperature ?? 36.8;

    // ── Reagent slots (from maglumi_reagents table if it exists, else mock from catalog) ──
    let reagents = Array.from({ length: 9 }, () => null);
    try {
      const reagentRows = await query(
        `SELECT slot_position, test_name, lot_number, expiry_date, remaining_tests, 
                calibration_status, loaded_at
         FROM maglumi_reagents
         WHERE analyzer_id = 'maglumi800' AND is_loaded = 1
         ORDER BY slot_position ASC`
      );
      for (const r of reagentRows) {
        const idx = (r.slot_position || 1) - 1;
        if (idx >= 0 && idx < 9) {
          reagents[idx] = {
            testName: r.test_name,
            lotNumber: r.lot_number,
            expiryDate: r.expiry_date,
            remainingTests: r.remaining_tests,
            calibrationStatus: r.calibration_status,
            loadedAt: r.loaded_at,
          };
        }
      }
    } catch {
      // Table may not exist yet — return empty reagent slots
    }

    // ── Sample positions (orders assigned to maglumi that are in progress) ──
    let samples = Array.from({ length: 40 }, () => null);
    try {
      const sampleRows = await query(
        `SELECT lt.id, lt.specimen_id, lt.patient_name, lt.status, lt.test_name,
                lt.rack_position, lt.analyzer_started_at,
                lo.barcode_tracking
         FROM lab_tasks lt
         LEFT JOIN lab_orders lo ON lo.id = lt.lab_order_id
         WHERE lt.machine_assigned = 'maglumi800'
           AND lt.status IN ('Analyzer Running', 'Queued', 'Assigned')
         ORDER BY lt.rack_position ASC, lt.created_at DESC
         LIMIT 40`
      );
      for (let i = 0; i < sampleRows.length && i < 40; i++) {
        const r = sampleRows[i];
        const pos = (r.rack_position || (i + 1)) - 1;
        if (pos >= 0 && pos < 40) {
          samples[pos] = {
            barcode: r.specimen_id || r.barcode_tracking || `SP-${r.id?.slice(0, 8)}`,
            patientName: r.patient_name,
            tests: [r.test_name].filter(Boolean),
            status: r.status === 'Analyzer Running' ? 'running' : r.status === 'Queued' ? 'queued' : 'queued',
            position: pos + 1,
          };
        }
      }
    } catch {
      // Graceful fallback
    }

    // ── Incubator (derive from active tests) ──
    let incubator = Array.from({ length: 13 }, () => ({ active: false }));
    try {
      const runningCount = await query(
        `SELECT COUNT(*) as cnt FROM lab_tasks 
         WHERE machine_assigned = 'maglumi800' AND status = 'Analyzer Running'`
      );
      const running = runningCount[0]?.cnt || 0;
      // Distribute active tests across incubator slots (6 per slot)
      const activeSlots = Math.min(13, Math.ceil(running / 6));
      for (let i = 0; i < activeSlots; i++) {
        const testsInSlot = Math.min(6, running - (i * 6));
        incubator[i] = { active: true, testsRunning: testsInSlot };
      }
    } catch {
      // fallback
    }

    // ── Active tests (currently processing) ──
    let activeTests = [];
    try {
      const activeRows = await query(
        `SELECT lt.specimen_id, lt.patient_name, lt.test_name, lt.analyzer_started_at,
                lt.rack_position
         FROM lab_tasks lt
         WHERE lt.machine_assigned = 'maglumi800' AND lt.status = 'Analyzer Running'
         ORDER BY lt.analyzer_started_at DESC
         LIMIT 20`
      );
      activeTests = activeRows.map(r => ({
        specimenId: r.specimen_id,
        patientName: r.patient_name,
        testName: r.test_name,
        startedAt: r.analyzer_started_at,
        position: r.rack_position,
      }));
    } catch {
      // fallback
    }

    // ── Recent results (last 20 completed) ──
    let recentResults = [];
    try {
      const resultRows = await query(
        `SELECT lam.specimen_id, lam.created_at,
                JSON_EXTRACT(lam.payload, '$.tests') as tests_json,
                lt.patient_name
         FROM lab_analyzer_messages lam
         LEFT JOIN lab_tasks lt ON lt.specimen_id = lam.specimen_id AND lt.machine_assigned = 'maglumi800'
         WHERE lam.analyzer_id = 'maglumi800' AND lam.status IN ('applied', 'verified')
         ORDER BY lam.created_at DESC
         LIMIT 20`
      );
      for (const row of resultRows) {
        let tests = [];
        try { tests = JSON.parse(row.tests_json || '[]'); } catch { /* skip */ }
        for (const t of tests) {
          recentResults.push({
            specimenId: row.specimen_id,
            patientName: row.patient_name || '',
            testName: t.name || t.code || 'Unknown',
            value: t.value ?? '—',
            unit: t.unit || '',
            flag: t.flag || null,
            completedAt: row.created_at,
          });
        }
      }
      recentResults = recentResults.slice(0, 20);
    } catch {
      // fallback
    }

    // ── Tests today ──
    let testsToday = 0;
    try {
      const todayRows = await query(
        `SELECT COUNT(*) as cnt FROM lab_analyzer_messages 
         WHERE analyzer_id = 'maglumi800' AND DATE(created_at) = CURDATE()`
      );
      testsToday = todayRows[0]?.cnt || 0;
    } catch {
      // fallback
    }

    /* ── LIS link ────────────────────────────────────────────────────────────
     * Commissioning detail rather than clinical detail, but it is the first
     * thing anyone needs when results are not arriving: which port we are
     * listening on, when the analyzer last said anything, and whether what it
     * sent could be matched to an order. The instrument's own target IP/port is
     * set inside its Lis.exe screen and is not readable from here — the vendor
     * config files are encrypted — so the values below are OUR side of the link.
     * ─────────────────────────────────────────────────────────────────────── */
    let link = {
      protocol: analyzer?.protocol || 'HL7 v2 over TCP',
      port: analyzer?.port || '2576',
      ipAddress: analyzer?.ip_address && analyzer.ip_address !== '-' ? analyzer.ip_address : null,
      comPort: analyzer?.com_port && analyzer.com_port !== '-' ? analyzer.com_port : null,
      baudRate: analyzer?.baud_rate || null,
      framing: 'auto (MLLP / HP-Socket PACK / unframed)',
      ackMode: 'off — Snibe sends MSH-15/16 = NE, so no ACK is expected',
      lastMessageAt: null,
      lastMessageStatus: null,
    };
    let messageStats = { received: 0, applied: 0, unmatched: 0, error: 0, duplicate: 0 };
    let rawMessages = [];
    try {
      const [last] = await query(
        `SELECT created_at, status FROM lab_analyzer_messages
         WHERE analyzer_id = 'maglumi800' ORDER BY created_at DESC LIMIT 1`
      );
      if (last) {
        link.lastMessageAt = last.created_at;
        link.lastMessageStatus = last.status;
      }

      const statRows = await query(
        `SELECT status, COUNT(*) AS cnt FROM lab_analyzer_messages
         WHERE analyzer_id = 'maglumi800' AND created_at >= (NOW() - INTERVAL 7 DAY)
         GROUP BY status`
      );
      for (const r of statRows) {
        if (r.status in messageStats) messageStats[r.status] = r.cnt;
      }

      // Raw traffic, newest first. Truncated in SQL so a histogram-sized payload
      // cannot bloat the response the panel polls every few seconds.
      const rawRows = await query(
        `SELECT id, specimen_id, status, note, tests_count, matched, created_at,
                LEFT(raw, 2000) AS raw_excerpt, CHAR_LENGTH(raw) AS raw_length
         FROM lab_analyzer_messages
         WHERE analyzer_id = 'maglumi800'
         ORDER BY created_at DESC LIMIT 5`
      );
      rawMessages = rawRows.map((r) => ({
        id: r.id,
        specimenId: r.specimen_id,
        status: r.status,
        note: r.note,
        testsCount: r.tests_count,
        matched: !!r.matched,
        createdAt: r.created_at,
        raw: r.raw_excerpt,
        truncated: (r.raw_length || 0) > 2000,
      }));
    } catch {
      // lab_analyzer_messages missing — leave the link block at its defaults
    }

    return Response.json({
      status,
      lastPing,
      temperature: parseFloat(temperature) || 36.8,
      mode: 'Random Access',
      reagents,
      samples,
      incubator,
      activeTests,
      recentResults,
      testsToday,
      link,
      messageStats,
      rawMessages,
      /**
       * Where each panel's numbers actually come from.
       *
       * HL7 over TCP carries results and order queries — Snibe's segment set
       * (MSH/PID/SPM/ORC/OBR/OBX/NTE/QPD/RCP) has no reagent, incubator or
       * carousel message, and RFID tag data never crosses the LIS link at all.
       * It lives in the instrument's own software. So the reagent slots below are
       * seeded rows, the incubator is derived from a task count, and the sample
       * grid reflects what the LIS assigned rather than what is physically
       * loaded. The UI labels each one, because a slot reading "22 remaining,
       * valid" looks like live inventory and is not.
       */
      provenance: {
        results: 'instrument',
        connection: 'instrument',
        temperature: analyzer?.temperature != null ? 'instrument' : 'unavailable',
        reagents: 'unavailable',
        incubator: 'derived',
        samples: 'lis',
      },
    });
  } catch (err) {
    console.error('maglumi/status error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
