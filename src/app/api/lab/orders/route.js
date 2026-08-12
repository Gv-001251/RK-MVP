import { v4 as uuidv4 } from 'uuid';
import { query, withTransaction } from '@/lib/mysql/db';
import { requireAuth, writeAuditLog } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';
import { recordSpecimenEvent } from '@/lib/specimen-events';

// Attach ordered tests to a set of orders (shared by GET/search).
async function attachTests(orders) {
  if (!orders.length) return orders;
  const ids = orders.map(o => o.id);
  const ph = ids.map(() => '?').join(',');
  const tests = await query(`SELECT * FROM lab_order_tests WHERE lab_order_id IN (${ph})`, ids);
  const map = {};
  for (const t of tests) (map[t.lab_order_id] ||= []).push(t);
  for (const o of orders) o.lab_order_tests = map[o.id] || [];
  return orders;
}

/**
 * GET /api/lab/orders  — search orders.
 * Query params: q, status, priority, department, from, to, limit, offset.
 */
export async function GET(request) {
  try {
    const { response } = await requireAuth(...ROLES.LAB_READ);
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const department = searchParams.get('department');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 200);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);

    const where = [];
    const vals = [];
    if (q) {
      where.push('(id LIKE ? OR accession_number LIKE ? OR patient_id LIKE ? OR patient_name LIKE ?)');
      const like = `%${q}%`;
      vals.push(like, like, like, like);
    }
    if (status) { where.push('status = ?'); vals.push(status); }
    if (priority) { where.push('priority = ?'); vals.push(priority); }
    if (department) { where.push('department = ?'); vals.push(department); }
    if (from) { where.push('created_at >= ?'); vals.push(from); }
    if (to) { where.push('created_at <= ?'); vals.push(to); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [countRow] = await query(`SELECT COUNT(*) AS cnt FROM lab_orders ${whereSql}`, vals);
    const orders = await query(
      `SELECT * FROM lab_orders ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...vals, limit, offset]
    );
    await attachTests(orders);

    return Response.json({ labOrders: orders, total: countRow.cnt, limit, offset });
  } catch (err) {
    console.error('orders search error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/lab/orders  — create a lab order.
 * Body: { patientId, tests:[testCode], profiles:[profileCode], priority,
 *         department, doctorName, clinicalNotes }
 * Generates Order ID, Accession Number, Sample ID and Specimen Barcode.
 */
export async function POST(request) {
  try {
    const { user, profile, response } = await requireAuth(...ROLES.ORDER_ENTRY);
    if (response) return response;

    const body = await request.json();
    const {
      patientId,
      tests: individualTests = [],
      profiles: profileCodes = [],
      priority = 'Routine',
      department,
      doctorName,
      clinicalNotes,
    } = body;

    if (!patientId) return Response.json({ error: 'patientId is required' }, { status: 400 });
    if ((!Array.isArray(individualTests) || individualTests.length === 0) &&
        (!Array.isArray(profileCodes) || profileCodes.length === 0)) {
      return Response.json({ error: 'At least one test or profile is required' }, { status: 400 });
    }

    // Patient
    const patRows = await query('SELECT * FROM patients WHERE id = ? LIMIT 1', [patientId]);
    if (!patRows.length) return Response.json({ error: 'Patient not found' }, { status: 404 });
    const patient = patRows[0];

    // Expand profiles → tests and merge with individual tests.
    let profileTests = [];
    if (profileCodes.length) {
      const ph = profileCodes.map(() => '?').join(',');
      profileTests = await query(
        `SELECT profile_code, test_code FROM lab_test_profile_items WHERE profile_code IN (${ph})`,
        profileCodes
      );
      const found = new Set(profileTests.map(p => p.profile_code));
      const badProfiles = profileCodes.filter(p => !found.has(p));
      if (badProfiles.length) {
        return Response.json({ error: `Unknown or empty profile(s): ${badProfiles.join(', ')}` }, { status: 400 });
      }
    }

    const codeToProfile = {};
    for (const c of individualTests) codeToProfile[c] = codeToProfile[c] ?? null;
    for (const pt of profileTests) codeToProfile[pt.test_code] = codeToProfile[pt.test_code] ?? pt.profile_code;
    const allCodes = Object.keys(codeToProfile);

    // Validate against catalog.
    const ph2 = allCodes.map(() => '?').join(',');
    const catalog = await query(
      `SELECT test_code, name, department, price FROM lab_test_catalog WHERE test_code IN (${ph2}) AND is_active = 1`,
      allCodes
    );
    const catMap = new Map(catalog.map(c => [c.test_code, c]));
    const unknown = allCodes.filter(c => !catMap.has(c));
    if (unknown.length) {
      return Response.json({ error: `Unknown test code(s): ${unknown.join(', ')}` }, { status: 400 });
    }

    const orderedTests = allCodes.map(c => {
      const cat = catMap.get(c);
      return { code: c, name: cat.name, department: cat.department, price: Number(cat.price) || 0, profile: codeToProfile[c] };
    });

    // ── Duplicate prevention: same patient + same test set in the last 15 min ──
    const codesKey = [...allCodes].sort().join(',');
    const recent = await query(
      `SELECT o.id, GROUP_CONCAT(t.test_code ORDER BY t.test_code SEPARATOR ',') AS codes
       FROM lab_orders o JOIN lab_order_tests t ON t.lab_order_id = o.id
       WHERE o.patient_id = ? AND o.status <> 'Cancelled' AND o.created_at > (NOW() - INTERVAL 15 MINUTE)
       GROUP BY o.id`,
      [patientId]
    );
    const dup = recent.find(r => (r.codes || '') === codesKey);
    if (dup) {
      return Response.json(
        { error: 'A matching order for this patient was just created. Possible duplicate.', existingOrderId: dup.id },
        { status: 409 }
      );
    }

    // ── Identifiers from a single race-safe sequence ──
    const seqRes = await query('INSERT INTO lab_seq (id) VALUES (NULL)');
    const seq = seqRes.insertId;
    const s6 = String(seq).padStart(6, '0');
    const year = new Date().getFullYear();
    const orderId = `LAB-${year}-${s6}`;
    const accession = `ACC-${year}-${s6}`;
    const sampleId = `SMP-${year}-${s6}`;
    const visitId = `VIS-${year}-${s6}`;
    const barcodeValue = accession; // the value encoded in the Code128 label
    const orderedAt = new Date();

    const depts = [...new Set(orderedTests.map(t => t.department))];
    const orderDept = department || (depts.length === 1 ? depts[0] : 'Multiple');
    const doctorLabel = doctorName || `Dr. ${profile?.full_name || 'On Duty'}`;
    const validPriority = ['Routine', 'Urgent', 'STAT'].includes(priority) ? priority : 'Routine';

    await withTransaction(async (tx) => {
      await tx.query(
        `INSERT INTO lab_orders
           (id, patient_id, patient_name, visit_id, doctor_name, status, priority, notes,
            order_time, processing_status, accession_number, sample_id, barcode_value, department, order_source)
         VALUES (?, ?, ?, ?, ?, 'Ordered', ?, ?, ?, 'Pending', ?, ?, ?, ?, 'Order Entry')`,
        [orderId, patientId, patient.name, visitId, doctorLabel, validPriority, clinicalNotes || '',
         orderedAt, accession, sampleId, barcodeValue, orderDept]
      );

      for (const t of orderedTests) {
        await tx.query(
          `INSERT INTO lab_order_tests (id, lab_order_id, test_name, test_code, profile_code, department, price)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), orderId, t.name, t.code, t.profile, t.department, t.price]
        );
      }

      await tx.query(
        `INSERT INTO lab_tasks
           (id, patient_id, clinic_patient_id, patient_name, age, gender, phone,
            doctor_name, opd_number, specimen_id, status, priority, processing_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Ordered', ?, 'Pending')`,
        [orderId, `RK-${s6}`, patientId, patient.name, patient.age, patient.gender, patient.phone,
         doctorLabel, `Token ${Math.floor(100 + Math.random() * 900)}`, accession, validPriority]
      );

      for (const t of orderedTests) {
        await tx.query(
          'INSERT INTO lab_task_tests (id, lab_task_id, test_name) VALUES (?, ?, ?)',
          [uuidv4(), orderId, t.name]
        );
      }

      await tx.query(
        'INSERT INTO barcode_tracking (id, lab_order_id, barcode_value, `generated`, generated_at) VALUES (?, ?, ?, 1, ?)',
        [uuidv4(), orderId, barcodeValue, orderedAt.toISOString()]
      );
    });

    await writeAuditLog(null, {
      userId: user?.id, userName: profile?.full_name,
      action: 'CREATE_LAB_ORDER', entityType: 'lab_order', entityId: orderId,
      changes: { patientId, tests: allCodes, profiles: profileCodes, priority: validPriority }, request,
    });

    // Specimen timeline: order raised, and its barcode generated at order time.
    const actorName = profile?.full_name || 'System';
    await recordSpecimenEvent({ labOrderId: orderId, specimenId: accession, toStatus: 'Ordered', action: 'order_created', actor: actorName, note: `${orderedTests.length} test(s) ordered` });
    await recordSpecimenEvent({ labOrderId: orderId, specimenId: accession, fromStatus: 'Ordered', toStatus: 'Barcode Printed', action: 'barcode_generated', actor: actorName, note: `Barcode ${barcodeValue}` });

    const [newOrder] = await query('SELECT * FROM lab_orders WHERE id = ?', [orderId]);
    await attachTests([newOrder]);

    return Response.json({
      order: newOrder,
      orderId,
      accessionNumber: accession,
      sampleId,
      barcode: barcodeValue,
      tests: orderedTests,
    }, { status: 201 });
  } catch (err) {
    console.error('order create error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
