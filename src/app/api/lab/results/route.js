import { query } from '@/lib/mysql/db';
import { requireAuth } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';

/**
 * GET /api/lab/results
 *
 * Doctor-facing, read-only view of analyzer results. Three modes:
 *   ?patientId=PAT-000001  → one consolidated page: every result for that
 *                            patient across ALL orders and ALL machines.
 *   ?specimenId=RKLAB-0007 → results for a single order/specimen.
 *   (no param)             → recent "results inbox": tasks that have results,
 *                            newest first (what just came in from the machines).
 *
 * Each result row carries the machine that produced it, so one patient's
 * results from different analyzers are summarised together.
 */
export async function GET(request) {
  try {
    const { response } = await requireAuth(...ROLES.LAB_READ);
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get('patientId');
    const specimenId = searchParams.get('specimenId');

    // ── Pick the target set of lab tasks ──
    let tasks = [];
    let patient = null;

    if (patientId) {
      tasks = await query(
        `SELECT * FROM lab_tasks
         WHERE clinic_patient_id = ? OR patient_id = ?
         ORDER BY created_at DESC`,
        [patientId, patientId]
      );
      const pr = await query('SELECT id, name, age, gender, phone FROM patients WHERE id = ? LIMIT 1', [patientId]);
      patient = pr[0] || (tasks[0] ? { id: patientId, name: tasks[0].patient_name } : null);
    } else if (specimenId) {
      tasks = await query(
        `SELECT * FROM lab_tasks WHERE specimen_id = ? OR id = ? ORDER BY created_at DESC`,
        [specimenId, specimenId]
      );
    } else {
      // Results inbox: tasks that actually have at least one result value.
      tasks = await query(
        `SELECT DISTINCT t.* FROM lab_tasks t
         JOIN lab_task_tests tt ON tt.lab_task_id = t.id
         WHERE tt.result_value IS NOT NULL AND tt.result_value <> ''
         ORDER BY t.updated_at DESC
         LIMIT 50`
      );
    }

    // ── Attach test rows to each task ──
    let testsByTask = {};
    if (tasks.length) {
      const ids = tasks.map(t => t.id);
      const ph = ids.map(() => '?').join(',');
      const rows = await query(
        `SELECT * FROM lab_task_tests WHERE lab_task_id IN (${ph}) ORDER BY created_at ASC`,
        ids
      );
      for (const r of rows) {
        (testsByTask[r.lab_task_id] ||= []).push({
          name: r.test_name,
          value: r.result_value || '',
          machine: r.machine_name || null,
          completedAt: r.completed_at || null,
        });
      }
    }

    const shaped = tasks.map(t => ({
      taskId: t.id,
      specimenId: t.specimen_id,
      patientId: t.clinic_patient_id || t.patient_id,
      patientName: t.patient_name,
      doctorName: t.doctor_name,
      status: t.status,
      machineAssigned: t.machine_assigned || null,
      priority: t.priority,
      orderedAt: t.created_at,
      verifiedAt: t.verified_at,
      verifiedBy: t.verified_by,
      tests: testsByTask[t.id] || [],
    }));

    // For the single-patient view, also provide a flat, machine-tagged list
    // (the "one page" summary across every analyzer).
    let consolidated = null;
    if (patientId) {
      consolidated = [];
      for (const task of shaped) {
        for (const test of task.tests) {
          if (!test.value) continue;
          consolidated.push({
            test: test.name,
            value: test.value,
            machine: test.machine,
            specimenId: task.specimenId,
            status: task.status,
            completedAt: test.completedAt,
          });
        }
      }
    }

    return Response.json({ patient, tasks: shaped, consolidated });
  } catch (err) {
    console.error('lab/results error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
