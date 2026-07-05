import { query } from '@/lib/mysql/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get('patientId');
    const status    = searchParams.get('status');

    let sql = 'SELECT * FROM lab_tasks WHERE 1=1';
    const params = [];

    if (patientId) {
      sql += ' AND (clinic_patient_id = ? OR patient_id = ?)';
      params.push(patientId, patientId);
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    sql += ' ORDER BY created_at DESC';

    const tasks = await query(sql, params);

    if (tasks.length) {
      const ids = tasks.map(t => t.id);
      const ph  = ids.map(() => '?').join(',');
      const tests = await query(`SELECT * FROM lab_task_tests WHERE lab_task_id IN (${ph})`, ids);
      const testMap = {};
      for (const t of tests) {
        if (!testMap[t.lab_task_id]) testMap[t.lab_task_id] = [];
        testMap[t.lab_task_id].push(t);
      }
      for (const task of tasks) task.lab_task_tests = testMap[task.id] || [];
    }

    return Response.json({ labTasks: tasks });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
