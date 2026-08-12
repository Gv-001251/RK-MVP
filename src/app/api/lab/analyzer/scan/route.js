import crypto from 'crypto';
import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser, writeAuditLog } from '@/lib/auth-middleware';
import { broadcastRealtimeEvent } from '@/lib/realtime-registry';
import { recordSpecimenEvent } from '@/lib/specimen-events';

/** Constant-time comparison to avoid leaking the key via timing. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { barcode, machineId } = body;

    if (!barcode || !machineId) {
      return Response.json({ error: 'Barcode and machineId are required' }, { status: 400 });
    }

    // ── Auth: accept a valid analyzer API key OR an authenticated session ──
    // Physical analyzers authenticate with the shared key (they cannot send a
    // session cookie); the in-app simulation authenticates via the cookie.
    const configuredKey = process.env.LIS_ANALYZER_API_KEY;
    const providedKey = request.headers.get('x-lis-api-key');
    let actorName = null;

    if (configuredKey && providedKey && safeEqual(providedKey, configuredKey)) {
      actorName = `LIS Analyzer (${machineId})`;
    } else {
      const { user, profile } = await getAuthenticatedUser();
      if (user) actorName = profile?.full_name || 'Lab Staff';
    }

    if (!actorName) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const barcodeVal = barcode.trim();

    // 1. Find the lab task associated with this barcode/specimen ID
    const taskRows = await query(
      `SELECT * FROM lab_tasks 
       WHERE specimen_id = ? 
          OR id = ? 
          OR id = (SELECT lab_order_id FROM barcode_tracking WHERE barcode_value = ? LIMIT 1)
       LIMIT 1`,
      [barcodeVal, barcodeVal, barcodeVal]
    );

    if (!taskRows.length) {
      return Response.json({ error: `Specimen barcode '${barcodeVal}' not found in clinic records.` }, { status: 404 });
    }

    const task = taskRows[0];

    // 2. Fetch all ordered tests for this lab task to check machine capabilities
    const testRows = await query(
      `SELECT test_name FROM lab_task_tests WHERE lab_task_id = ?`,
      [task.id]
    );
    const testNames = testRows.map(r => r.test_name);

    if (testNames.length === 0) {
      return Response.json({ error: 'No tests found associated with this lab task.' }, { status: 400 });
    }

    // 3. Define analyzer capabilities mapping (case-insensitive keyword matching)
    const capabilities = {
      'maglumi': ['thyroid', 'tsh'],
      'weldon': ['hba1c', 'lipid', 'lft', 'kft', 'liver', 'kidney', 'blood sugar', 'fbs'],
      'hematology': ['cbc', 'esr'],
      'urine': ['urine'],
      'electrolyte': ['electrolyte'],
      'rapid': ['crp']
    };

    const machineKeywords = capabilities[machineId.toLowerCase()] || [];
    const isMatch = testNames.some(testName => {
      const tLower = testName.toLowerCase();
      return machineKeywords.some(kw => tLower.includes(kw));
    });

    if (!isMatch) {
      return Response.json({
        error: `Machine mismatch: Scanned machine '${machineId}' cannot process the ordered tests: ${testNames.join(', ')}`
      }, { status: 422 });
    }

    // 4. Retrieve machine full name from analyzer_connections table
    const connRows = await query('SELECT name FROM analyzer_connections WHERE id = ? LIMIT 1', [machineId]);
    const machineName = connRows.length ? connRows[0].name : machineId;

    const startedAt = new Date(); // stored as UTC DATETIME
    const timestamp = startedAt.toLocaleDateString('en-GB') + ' ' +
                      startedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); // display only

    // 5. Update database status of the task & order to 'Analyzer Running'
    await query(
      `UPDATE lab_tasks 
       SET status = 'Analyzer Running', 
           processing_status = 'Analyzer Running', 
           updated_at = NOW() 
       WHERE id = ?`,
      [task.id]
    );

    await query(
      `UPDATE lab_orders 
       SET status = 'Analyzer Running', 
           processing_status = 'Analyzer Running', 
           machine_assigned = ?, 
           analyzer_started_at = ?,
           updated_at = NOW() 
       WHERE id = ?`,
      [machineName, startedAt, task.id]
    );

    await query(
      `UPDATE lab_task_tests 
       SET machine_name = ? 
       WHERE lab_task_id = ?`,
      [machineName, task.id]
    );

    // 6. Write Audit Log
    try {
      await writeAuditLog(null, {
        userId: null,
        userName: actorName,
        action: 'MACHINE_BARCODE_SCANNED',
        entityType: 'lab_task',
        entityId: task.id,
        changes: { barcode: barcodeVal, machineId, machineName },
        request
      });
    } catch (auditErr) {
      console.error('Audit logging failed for analyzer scan:', auditErr.message);
    }

    // Specimen timeline: assigned to a machine, then running.
    await recordSpecimenEvent({ labOrderId: task.id, specimenId: task.specimen_id, fromStatus: 'Received', toStatus: 'Assigned to Analyzer', action: 'assigned', actor: actorName, machine: machineName, note: `Assigned to ${machineName}` });
    await recordSpecimenEvent({ labOrderId: task.id, specimenId: task.specimen_id, fromStatus: 'Assigned to Analyzer', toStatus: 'Running', action: 'run_started', actor: actorName, machine: machineName, note: `Analyzer processing ${testNames.length} test(s)` });

    // 7. Broadcast the real-time event to all active SSE subscribers
    broadcastRealtimeEvent('STATUS_UPDATE', {
      taskId: task.id,
      patientName: task.patient_name,
      status: 'Analyzer Running',
      machineId,
      machineName,
      barcode: barcodeVal,
      tests: testNames,
      timestamp
    });

    return Response.json({
      success: true,
      taskId: task.id,
      patientName: task.patient_name,
      status: 'Analyzer Running',
      machineId,
      machineName,
      tests: testNames
    });
  } catch (err) {
    console.error('Analyzer scan endpoint error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
