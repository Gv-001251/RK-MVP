import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/mysql/db';
import { getAuthenticatedUser, writeAuditLog } from '@/lib/auth-middleware';

export async function GET() {
  try {
    const orders = await query('SELECT * FROM lab_orders ORDER BY created_at DESC');

    if (orders.length) {
      const ids = orders.map(o => o.id);
      const ph  = ids.map(() => '?').join(',');
      const tests = await query(`SELECT * FROM lab_order_tests WHERE lab_order_id IN (${ph})`, ids);
      const testMap = {};
      for (const t of tests) {
        if (!testMap[t.lab_order_id]) testMap[t.lab_order_id] = [];
        testMap[t.lab_order_id].push(t);
      }
      for (const o of orders) o.lab_order_tests = testMap[o.id] || [];
    }

    return Response.json({ labOrders: orders });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { user, profile } = await getAuthenticatedUser();
    const body = await request.json();
    const { patientId, tests, doctorName: bodyDoc, notes, priority } = body;

    if (!tests || tests.length === 0) {
      return Response.json({ error: 'At least one test is required' }, { status: 400 });
    }

    // Generate order number
    const year = new Date().getFullYear();
    const yearPrefix = `LAB-${year}-`;
    const [countRow] = await query(
      "SELECT COUNT(*) AS cnt FROM lab_orders WHERE id LIKE ?",
      [`${yearPrefix}%`]
    );
    const serialNum = String(parseInt(countRow.cnt) + 1).padStart(4, '0');
    const orderNum  = `${yearPrefix}${serialNum}`;
    const visitId   = `VIS-${year}-${serialNum}`;
    const timestamp = new Date().toLocaleDateString('en-GB') + ' ' +
                      new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    // Fetch patient
    const patRows = await query('SELECT * FROM patients WHERE id = ? LIMIT 1', [patientId]);
    if (!patRows.length) return Response.json({ error: 'Patient not found' }, { status: 404 });
    const patient = patRows[0];

    // 1. Insert lab order
    await query(
      `INSERT INTO lab_orders
         (id, patient_id, patient_name, visit_id, doctor_name, status, priority, notes, order_time, processing_status)
       VALUES (?, ?, ?, ?, ?, 'Ordered', ?, ?, ?, 'Pending')`,
      [orderNum, patientId, patient.name, visitId, bodyDoc || `Dr. ${profile?.full_name || 'R. Kumar'}`,
       priority || 'Routine', notes || '', timestamp]
    );

    // 2. Insert order tests
    for (const testName of tests) {
      await query(
        'INSERT INTO lab_order_tests (id, lab_order_id, test_name) VALUES (?, ?, ?)',
        [uuidv4(), orderNum, testName]
      );
    }

    // 3. Create lab task workflow record
    await query(
      `INSERT INTO lab_tasks
         (id, patient_id, clinic_patient_id, patient_name, age, gender, phone,
          doctor_name, opd_number, specimen_id, status, priority, processing_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Ordered', ?, 'Pending')`,
      [
        orderNum,
        `RK-${serialNum}`,
        patientId,
        patient.name,
        patient.age,
        patient.gender,
        patient.phone,
        bodyDoc || `Dr. ${profile?.full_name || 'R. Kumar'}`,
        `Token ${Math.floor(100 + Math.random() * 900)}`,
        `RKLAB-${serialNum}`,
        priority || 'Routine',
      ]
    );

    // 4. Insert blank task test records
    for (const testName of tests) {
      await query(
        'INSERT INTO lab_task_tests (id, lab_task_id, test_name) VALUES (?, ?, ?)',
        [uuidv4(), orderNum, testName]
      );
    }

    // 5. Barcode tracking
    await query(
      'INSERT INTO barcode_tracking (id, lab_order_id, barcode_value, generated) VALUES (?, ?, ?, 0)',
      [uuidv4(), orderNum, `RKLAB-${serialNum}`]
    );

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'CREATE_LAB_ORDER', entityType: 'lab_order', entityId: orderNum,
      changes: body, request,
    });

    const [newOrder] = await query('SELECT * FROM lab_orders WHERE id = ?', [orderNum]);
    const [newTask]  = await query('SELECT * FROM lab_tasks WHERE id = ?', [orderNum]);

    return Response.json({ labOrder: newOrder, labTask: newTask }, { status: 201 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
