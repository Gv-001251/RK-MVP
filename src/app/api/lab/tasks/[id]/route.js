import { query, withTransaction } from '@/lib/mysql/db';
import { requireAuth, writeAuditLog } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';
import { recordSpecimenEvent } from '@/lib/specimen-events';
import { detectCriticalResults } from '@/lib/critical-detection';
import { runDeltaChecks } from '@/lib/delta-check';

// Map workflow actions to canonical specimen-timeline stages.
const STAGE_MAP = {
  collect: 'Collected', register: 'Received', assign_machine: 'Assigned to Analyzer',
  start_run: 'Running', save_results: 'Analyzer Completed', qc_verification: 'Pending Verification',
  verify: 'Verified', deliver: 'Released',
};

/** Returns a valid Date parsed from `value`, else the `fallback` Date. */
function parseDateOr(value, fallback) {
  if (!value) return fallback;
  const d = new Date(value);
  return isNaN(d.getTime()) ? fallback : d;
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile, response } = await requireAuth(...ROLES.LAB_STAFF);
    if (response) return response;

    const body = await request.json();

    // Server-authoritative UTC timestamp for this transition (stored as DATETIME).
    const now = new Date();

    let taskSets  = ['updated_at = NOW()'];
    let taskVals  = [];
    let orderSets = ['updated_at = NOW()'];
    let orderVals = [];
    let resultsToSave = null; // deferred so per-test writes join the transaction

    // Verify task exists
    const taskRows = await query('SELECT * FROM lab_tasks WHERE id = ? LIMIT 1', [id]);
    if (!taskRows.length) return Response.json({ error: 'Lab task not found' }, { status: 404 });

    const { action } = body;

    switch (action) {
      case 'collect':
        taskSets.push('status = ?', 'processing_status = ?');
        taskVals.push('Sample Collected', 'Sample Collected');
        orderSets.push('status = ?', 'processing_status = ?', 'sample_type = ?', 'collected_by = ?', 'collection_time = ?');
        orderVals.push('Sample Collected', 'Sample Collected', body.sampleType || 'Blood',
                       body.collectedBy || profile?.full_name || 'Lab Tech', parseDateOr(body.collectionTime, now));
        break;

      case 'register':
        taskSets.push('status = ?', 'processing_status = ?', 'registered_at = ?');
        taskVals.push('Sample Registered', 'Sample Registered', now);
        orderSets.push('status = ?', 'processing_status = ?', 'registered_at = ?');
        orderVals.push('Sample Registered', 'Sample Registered', now);
        break;

      case 'assign_machine':
        orderSets.push('machine_assigned = ?');
        orderVals.push(body.machineName);
        break;

      case 'start_run':
        taskSets.push('status = ?', 'processing_status = ?', 'analyzer_started_at = ?');
        taskVals.push('Analyzer Running', 'Analyzer Running', now);
        orderSets.push('status = ?', 'processing_status = ?', 'analyzer_started_at = ?');
        orderVals.push('Analyzer Running', 'Analyzer Running', now);
        break;

      case 'save_results':
        if (body.results) resultsToSave = body.results;
        taskSets.push('status = ?', 'processing_status = ?');
        taskVals.push('Pending Verification', 'Pending Verification');
        orderSets.push('status = ?', 'processing_status = ?');
        orderVals.push('Pending Verification', 'Pending Verification');
        break;

      case 'qc_verification':
        taskSets.push('status = ?', 'processing_status = ?', 'qc_started_at = ?');
        taskVals.push('QC Verification', 'QC Verification', now);
        orderSets.push('status = ?', 'processing_status = ?', 'qc_started_at = ?');
        orderVals.push('QC Verification', 'QC Verification', now);
        break;

      case 'verify':
        taskSets.push('status = ?', 'processing_status = ?', 'verified_by = ?', 'verified_at = ?', 'remarks = ?');
        taskVals.push('Verified', 'Verified', body.verifiedBy || profile?.full_name || 'Lab Verifier', now, body.remarks || '');
        orderSets.push('status = ?', 'processing_status = ?');
        orderVals.push('Verified', 'Verified');
        break;

      case 'generate_report':
        taskSets.push('status = ?', 'processing_status = ?', 'report_generated_at = ?');
        taskVals.push('Report Generated', 'Report Generated', now);
        orderSets.push('status = ?', 'processing_status = ?', 'report_generated_at = ?');
        orderVals.push('Report Generated', 'Report Generated', now);
        break;

      case 'deliver':
        taskSets.push('status = ?', 'processing_status = ?', 'report_delivered_at = ?', 'report_delivered_to = ?');
        taskVals.push('Report Delivered', 'Report Delivered', now, body.deliveredTo || 'Doctor');
        orderSets.push('status = ?', 'processing_status = ?', 'report_delivered_at = ?', 'report_delivered_to = ?');
        orderVals.push('Report Delivered', 'Report Delivered', now, body.deliveredTo || 'Doctor');
        break;

      default:
        return Response.json({ error: 'Invalid LIS workflow action' }, { status: 400 });
    }

    // Apply all writes for this transition atomically.
    taskVals.push(id);
    orderVals.push(id);
    await withTransaction(async (tx) => {
      if (resultsToSave) {
        for (const testName of Object.keys(resultsToSave)) {
          const resData = resultsToSave[testName];
          await tx.query(
            `UPDATE lab_task_tests SET result_value = ?, machine_name = ?, completed_at = ?
             WHERE lab_task_id = ? AND test_name = ?`,
            [resData.val, resData.machine, parseDateOr(resData.completedAt, now), id, testName]
          );
        }
      }
      await tx.query(`UPDATE lab_tasks SET ${taskSets.join(', ')} WHERE id = ?`, taskVals);
      await tx.query(`UPDATE lab_orders SET ${orderSets.join(', ')} WHERE id = ?`, orderVals);
    });

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: `LAB_LIS_${action.toUpperCase()}`, entityType: 'lab_task', entityId: id,
      changes: body, request,
    });

    const [updatedTask] = await query('SELECT * FROM lab_tasks WHERE id = ?', [id]);

    // Specimen timeline entry for this workflow transition.
    const stage = STAGE_MAP[action];
    if (stage) {
      await recordSpecimenEvent({
        labOrderId: id, specimenId: updatedTask?.specimen_id, toStatus: stage, action,
        actor: profile?.full_name || 'Lab Staff',
        machine: updatedTask?.machine_assigned || body.machineName || null,
        note: body.remarks || null,
      });
    }

    // Critical Result Detection on manually entered results. Best-effort.
    if (resultsToSave) {
      await detectCriticalResults({
        taskId: id,
        orderId: id,
        patientId: updatedTask?.patient_id || updatedTask?.clinic_patient_id || null,
        patientName: updatedTask?.patient_name,
        machineName: updatedTask?.machine_assigned || null,
        actor: profile?.full_name || 'Lab Staff',
        tests: Object.entries(resultsToSave).map(([testName, r]) => ({
          testName,
          resultValue: r?.val,
          machine: r?.machine,
        })),
      });

      // Delta Check on manually entered results. Best-effort.
      await runDeltaChecks({
        taskId: id,
        orderId: id,
        machineName: updatedTask?.machine_assigned || null,
        actor: profile?.full_name || 'Lab Staff',
        tests: Object.entries(resultsToSave).map(([testName, r]) => ({
          testName,
          resultValue: r?.val,
        })),
      });
    }

    return Response.json({ labTask: updatedTask });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
