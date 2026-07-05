import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser, writeAuditLog } from '@/lib/auth-middleware';

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { user, profile } = await getAuthenticatedUser();
    const body = await request.json();

    const timestamp = new Date().toLocaleDateString('en-GB') + ' ' +
                      new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    let taskSets  = ['updated_at = NOW()'];
    let taskVals  = [];
    let orderSets = ['updated_at = NOW()'];
    let orderVals = [];

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
                       body.collectedBy || profile?.full_name || 'Lab Tech', body.collectionTime || timestamp);
        break;

      case 'register':
        taskSets.push('status = ?', 'processing_status = ?', 'registered_at = ?');
        taskVals.push('Sample Registered', 'Sample Registered', timestamp);
        orderSets.push('status = ?', 'processing_status = ?', 'registered_at = ?');
        orderVals.push('Sample Registered', 'Sample Registered', timestamp);
        break;

      case 'assign_machine':
        orderSets.push('machine_assigned = ?');
        orderVals.push(body.machineName);
        break;

      case 'start_run':
        taskSets.push('status = ?', 'processing_status = ?', 'analyzer_started_at = ?');
        taskVals.push('Analyzer Running', 'Analyzer Running', timestamp);
        orderSets.push('status = ?', 'processing_status = ?', 'analyzer_started_at = ?');
        orderVals.push('Analyzer Running', 'Analyzer Running', timestamp);
        break;

      case 'save_results':
        if (body.results) {
          for (const testName of Object.keys(body.results)) {
            const resData = body.results[testName];
            await query(
              `UPDATE lab_task_tests SET result_value = ?, machine_name = ?, completed_at = ?
               WHERE lab_task_id = ? AND test_name = ?`,
              [resData.val, resData.machine, resData.completedAt || timestamp, id, testName]
            );
          }
        }
        taskSets.push('status = ?', 'processing_status = ?');
        taskVals.push('Pending Verification', 'Pending Verification');
        orderSets.push('status = ?', 'processing_status = ?');
        orderVals.push('Pending Verification', 'Pending Verification');
        break;

      case 'qc_verification':
        taskSets.push('status = ?', 'processing_status = ?', 'qc_started_at = ?');
        taskVals.push('QC Verification', 'QC Verification', timestamp);
        orderSets.push('status = ?', 'processing_status = ?', 'qc_started_at = ?');
        orderVals.push('QC Verification', 'QC Verification', timestamp);
        break;

      case 'verify':
        taskSets.push('status = ?', 'processing_status = ?', 'verified_by = ?', 'verified_at = ?', 'remarks = ?');
        taskVals.push('Verified', 'Verified', body.verifiedBy || profile?.full_name || 'Dr. Kumar', timestamp, body.remarks || '');
        orderSets.push('status = ?', 'processing_status = ?');
        orderVals.push('Verified', 'Verified');
        break;

      case 'generate_report':
        taskSets.push('status = ?', 'processing_status = ?', 'report_generated_at = ?');
        taskVals.push('Report Generated', 'Report Generated', timestamp);
        orderSets.push('status = ?', 'processing_status = ?', 'report_generated_at = ?');
        orderVals.push('Report Generated', 'Report Generated', timestamp);
        break;

      case 'deliver':
        taskSets.push('status = ?', 'processing_status = ?', 'report_delivered_at = ?', 'report_delivered_to = ?');
        taskVals.push('Report Delivered', 'Report Delivered', timestamp, body.deliveredTo || 'Doctor');
        orderSets.push('status = ?', 'processing_status = ?', 'report_delivered_at = ?', 'report_delivered_to = ?');
        orderVals.push('Report Delivered', 'Report Delivered', timestamp, body.deliveredTo || 'Doctor');
        break;

      default:
        return Response.json({ error: 'Invalid LIS workflow action' }, { status: 400 });
    }

    // Apply updates
    taskVals.push(id);
    await query(`UPDATE lab_tasks SET ${taskSets.join(', ')} WHERE id = ?`, taskVals);

    orderVals.push(id);
    await query(`UPDATE lab_orders SET ${orderSets.join(', ')} WHERE id = ?`, orderVals);

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: `LAB_LIS_${action.toUpperCase()}`, entityType: 'lab_task', entityId: id,
      changes: body, request,
    });

    const [updatedTask] = await query('SELECT * FROM lab_tasks WHERE id = ?', [id]);
    return Response.json({ labTask: updatedTask });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
