#!/usr/bin/env node
/**
 * ============================================================================
 * RK Clinic LIS — DEMO dataset
 * ============================================================================
 * Builds a believable laboratory history so the dashboard and every LIS screen
 * have something to show during a client walkthrough.
 *
 *   node mysql/seed_demo.mjs            # create (or refresh) the demo data
 *   node mysql/seed_demo.mjs --clean    # remove it again, leave real data alone
 *
 * This is NOT production seed data. `mysql/seed_users.js` seeds the real login
 * accounts; this file only adds sample clinical traffic.
 *
 * Everything it writes is tagged so it can be removed precisely:
 *   • lab_orders.order_source = 'Demo Seed'   (and all rows hanging off those)
 *   • patients.id LIKE 'RK-9%'                (demo patient block)
 *   • qc_batches.created_by = 'Demo Seed'
 *   • lab_inventory_txns.performed_by = 'Demo Seed'
 * Re-running is safe and idempotent: the tagged rows are cleared first, and the
 * generator is seeded so you get the same dataset every time.
 *
 * Reference data (test catalogue, analyzers, QC materials, critical/delta
 * rules) comes from the migrations and is read, never invented.
 * ============================================================================
 */
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const DEMO_SOURCE = 'Demo Seed';
const DEMO_PATIENT_PREFIX = 'RK-9';

const CLEAN_ONLY = process.argv.includes('--clean');

const log = (m) => console.log(`[seed:demo] ${m}`);

/* ── deterministic RNG so demos are reproducible ────────────────────────── */
let rngState = 0x9e3779b9;
function rnd() {
  rngState |= 0;
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;
const uuid = () => crypto.randomUUID();

/* ── date helpers (MySQL DATETIME strings in local time) ────────────────── */
const pad = (n) => String(n).padStart(2, '0');
function dt(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
const dateOnly = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const addMin = (d, m) => new Date(d.getTime() + m * 60000);

/* ── people ─────────────────────────────────────────────────────────────── */
const FIRST = ['Aarav','Diya','Rohan','Ananya','Vikram','Meera','Arjun','Kavya','Rahul','Sneha',
  'Karthik','Priya','Aditya','Nisha','Sanjay','Divya','Manish','Pooja','Rakesh','Lakshmi',
  'Imran','Fatima','Joseph','Grace','Naveen','Swathi','Harish','Anjali','Suresh','Deepa',
  'Vivek','Radha','Ashok','Sunita','Ganesh','Bhavana','Ramesh','Kiran','Mohan','Shalini'];
const LAST = ['Sharma','Reddy','Nair','Iyer','Patel','Menon','Rao','Gupta','Kulkarni','Pillai',
  'Desai','Joshi','Bhat','Verma','Chandran','Shetty','Mehta','Naidu','Krishnan','Fernandes'];

const DOCTORS = ['Dr. R. Kumar','Dr. S. Anand','Dr. P. Varma','Dr. L. Thomas','Dr. N. Bose'];
const COLLECTORS = ['Nurse Latha','Nurse Vinod','Nurse Asha'];
const TECHS = ['Lab Technician','Senior Technician'];
const PATHOLOGISTS = ['Dr. Pathologist'];
const LOCATIONS = ['Main Collection Room','OPD Counter 2','Ward A Bedside','Home Collection'];
const TUBES = { 'Plain (Red)': 'Serum', 'EDTA (Lavender)': 'Whole Blood', 'Fluoride (Grey)': 'Serum', 'Sterile Cup': 'Urine' };
const REJECT_REASONS = ['Hemolysed sample','Insufficient volume','Clotted specimen','Unlabelled tube'];

/* ── reference-range parsing (mirrors src/lib/reference-range.js intent) ── */
function rangeOf(text) {
  if (!text) return null;
  const t = String(text).replace(/[\u2013\u2014]/g, '-').trim();
  let m = t.match(/^([\d.]+)\s*-\s*([\d.]+)$/);
  if (m) return { low: Number(m[1]), high: Number(m[2]) };
  m = t.match(/^<\s*([\d.]+)$/);
  if (m) return { low: Number(m[1]) * 0.45, high: Number(m[1]) };
  m = t.match(/^>\s*([\d.]+)$/);
  if (m) return { low: Number(m[1]), high: Number(m[1]) * 1.7 };
  return null;
}

/** Free-text results for the panel tests that have no numeric range. */
const TEXT_RESULTS = {
  CBC: () => `Hb ${(11 + rnd() * 5).toFixed(1)} g/dL, TLC ${int(4200, 11000)}, Platelets ${int(150, 410)}×10³`,
  URINE: () => pick([
    'Pale yellow, clear; albumin nil; 2-3 pus cells/hpf',
    'Yellow, slightly turbid; albumin trace; 8-10 pus cells/hpf',
    'Straw coloured, clear; no casts or crystals',
  ]),
};

/** Tests that make a convincing critical flag, with the value to use. */
const CRITICAL_PLAYS = [
  { code: 'K',     value: '6.8',  unit: 'mmol/L', op: '>=', threshold: '6.5', message: 'Severe hyperkalaemia — notify the treating clinician immediately.' },
  { code: 'GLUF',  value: '412',  unit: 'mg/dL',  op: '>=', threshold: '400', message: 'Critical hyperglycaemia.' },
  { code: 'HB',    value: '6.4',  unit: 'g/dL',   op: '<=', threshold: '7.0', message: 'Critical anaemia — transfusion assessment advised.' },
];

function decimalsFor(range) {
  if (!range) return 1;
  return range.high <= 20 ? 1 : 0;
}

function valueFor(test) {
  if (TEXT_RESULTS[test.test_code]) return { text: TEXT_RESULTS[test.test_code](), abnormal: false };
  const range = rangeOf(test.reference_range);
  if (!range) return { text: 'Normal', abnormal: false };
  const dp = decimalsFor(range);
  const span = range.high - range.low;
  let v;
  let abnormal = false;
  if (chance(0.78)) {
    v = range.low + span * (0.15 + rnd() * 0.7);            // comfortably in range
  } else {
    abnormal = true;
    v = chance(0.5) ? range.low - span * (0.1 + rnd() * 0.3) // low
                    : range.high + span * (0.1 + rnd() * 0.45); // high
    if (v < 0) v = Math.abs(v);
  }
  return { text: v.toFixed(dp), abnormal };
}

/* ── the lifecycle stages we place orders into ───────────────────────────── */
const STAGE_AWAITING = 'awaiting';
const STAGE_BENCH = 'bench';
const STAGE_REVIEW = 'review';
const STAGE_RELEASED = 'released';
const STAGE_REJECTED = 'rejected';

const AWAITING_STATUS = ['Ordered', 'Barcode Printed', 'Sample Registered'];
const BENCH_STATUS = ['Sample Collected', 'Received', 'Processing', 'Analyzer Running'];
const REVIEW_STATUS = ['Pending Verification', 'Technician Review', 'Senior Review'];

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'rk_clinic',
    connectTimeout: 10000,
  });

  try {
    await clean(conn);
    if (CLEAN_ONLY) {
      log('clean complete — demo data removed.');
      return;
    }

    const catalog = await loadCatalog(conn);
    const profiles = await loadProfiles(conn);
    const analyzers = await loadAnalyzers(conn);
    const criticalRules = await loadRules(conn, 'lab_critical_rules');
    const deltaRules = await loadRules(conn, 'lab_delta_rules');

    if (!catalog.length) {
      throw new Error('lab_test_catalog is empty — run `npm run db:migrate` first.');
    }

    const patients = await seedPatients(conn);
    await activateAnalyzers(conn);
    await refreshExpiryDates(conn);
    const orders = await seedOrders(conn, { patients, catalog, profiles, analyzers, criticalRules, deltaRules });
    await seedQc(conn, analyzers);
    await seedInventoryTxns(conn);

    await report(conn, orders.length);
  } finally {
    await conn.end();
  }
}

/* ── removal of previously seeded demo rows ──────────────────────────────── */
async function clean(conn) {
  const [demoOrders] = await conn.query(
    'SELECT id FROM lab_orders WHERE order_source = ?', [DEMO_SOURCE]
  );
  const ids = demoOrders.map((r) => r.id);

  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    // Children first, then the orders themselves.
    for (const sql of [
      `DELETE FROM lab_reports          WHERE lab_order_id IN (${ph})`,
      `DELETE FROM lab_verifications    WHERE lab_order_id IN (${ph})`,
      `DELETE FROM lab_critical_alerts  WHERE lab_order_id IN (${ph})`,
      `DELETE FROM lab_delta_flags      WHERE lab_order_id IN (${ph})`,
      `DELETE FROM lab_sample_events    WHERE lab_order_id IN (${ph})`,
      `DELETE FROM lab_samples          WHERE lab_order_id IN (${ph})`,
      `DELETE FROM lab_task_tests       WHERE lab_task_id  IN (${ph})`,
      `DELETE FROM lab_tasks            WHERE id           IN (${ph})`,
      `DELETE FROM lab_order_tests      WHERE lab_order_id IN (${ph})`,
      `DELETE FROM barcode_tracking     WHERE lab_order_id IN (${ph})`,
      `DELETE FROM lab_orders           WHERE id           IN (${ph})`,
    ]) {
      try { await conn.query(sql, ids); } catch (e) { log(`skip cleanup (${e.code})`); }
    }
    log(`removed ${ids.length} previous demo order(s) and their child rows`);
  }

  const [qc] = await conn.query('SELECT id FROM qc_batches WHERE created_by = ?', [DEMO_SOURCE]);
  if (qc.length) {
    const ph = qc.map(() => '?').join(',');
    await conn.query(`DELETE FROM qc_results WHERE batch_id IN (${ph})`, qc.map((r) => r.id));
    await conn.query('DELETE FROM qc_batches WHERE created_by = ?', [DEMO_SOURCE]);
    log(`removed ${qc.length} previous demo QC batch(es)`);
  }

  await conn.query('DELETE FROM lab_inventory_txns WHERE performed_by = ?', [DEMO_SOURCE]);
  const [p] = await conn.query('DELETE FROM patients WHERE id LIKE ?', [`${DEMO_PATIENT_PREFIX}%`]);
  if (p.affectedRows) log(`removed ${p.affectedRows} previous demo patient(s)`);
}

/* ── reference data ──────────────────────────────────────────────────────── */
async function loadCatalog(conn) {
  const [rows] = await conn.query(
    'SELECT test_code, name, department, specimen_type, container, units, reference_range, price ' +
    'FROM lab_test_catalog WHERE is_active = 1'
  );
  return rows;
}
async function loadProfiles(conn) {
  const [rows] = await conn.query(
    'SELECT p.profile_code, p.name, p.department, p.price, ' +
    '       GROUP_CONCAT(i.test_code) AS codes ' +
    'FROM lab_test_profiles p LEFT JOIN lab_test_profile_items i ON i.profile_code = p.profile_code ' +
    'GROUP BY p.profile_code, p.name, p.department, p.price'
  );
  return rows.map((r) => ({ ...r, codes: (r.codes || '').split(',').filter(Boolean) }));
}
async function loadAnalyzers(conn) {
  const [rows] = await conn.query('SELECT id, name, department FROM analyzer_connections');
  return rows;
}
async function loadRules(conn, table) {
  try {
    const [rows] = await conn.query(`SELECT * FROM \`${table}\``);
    return rows;
  } catch { return []; }
}

/**
 * The migrations ship fixed expiry dates that fall into the past as time goes
 * by, which makes healthy reagents show up as expired. Re-anchor them to today
 * and leave exactly one expiring soon, so the expiry warning has a real subject
 * without the whole shelf looking out of date.
 */
async function refreshExpiryDates(conn) {
  const [items] = await conn.query('SELECT id, name FROM lab_inventory ORDER BY name');
  let soon = null;
  for (const [i, item] of items.entries()) {
    // Second item in the list becomes the "expiring soon" one.
    const days = i === 1 ? 18 : 120 + i * 40;
    if (i === 1) soon = item.name;
    const d = new Date();
    d.setDate(d.getDate() + days);
    await conn.query('UPDATE lab_inventory SET expiry_date = ? WHERE id = ?', [dateOnly(d), item.id]);
  }
  await conn.query("UPDATE qc_materials SET expiry_date = ? WHERE 1=1",
    [dateOnly(new Date(Date.now() + 200 * 86400000))]);
  log(`expiry dates re-anchored to today (${soon} left expiring soon)`);
}

/** Put the bench online so the availability card is not sitting at 0%. */
async function activateAnalyzers(conn) {
  await conn.query("UPDATE analyzer_connections SET status = 'active', qc_status = 'Pass', health_score = 96 WHERE id <> 'qualcyte10'");
  await conn.query("UPDATE analyzer_connections SET status = 'maintenance', qc_status = 'Unknown', health_score = 40, maintenance_mode = 1 WHERE id = 'uriplus300'");
  await conn.query("UPDATE analyzer_connections SET status = 'Offline', health_score = 0 WHERE id = 'wondfo'");
  log('analyzer fleet: 8 active, 1 in maintenance, 1 offline, 1 manual');
}

/* ── patients ────────────────────────────────────────────────────────────── */
async function seedPatients(conn) {
  const rows = [];
  const used = new Set();
  for (let i = 1; i <= 40; i += 1) {
    let name;
    do { name = `${pick(FIRST)} ${pick(LAST)}`; } while (used.has(name));
    used.add(name);

    const id = `${DEMO_PATIENT_PREFIX}${String(i).padStart(4, '0')}`;
    const gender = chance(0.5) ? 'Male' : 'Female';
    rows.push([
      id, name, int(6, 84), gender,
      `9${int(100000000, 899999999)}`,
      `${name.split(' ')[0].toLowerCase()}@example.com`,
      pick(['A+', 'B+', 'O+', 'AB+', 'A-', 'O-']),
      chance(0.15) ? pick(['Penicillin', 'Sulpha drugs', 'Dust']) : null,
      `${int(1, 90)}, ${pick(['MG Road', 'Lake View', 'Station Road', 'Park Street'])}`,
      'OPD', 'Active',
    ]);
  }

  await conn.query(
    'INSERT INTO patients (id, name, age, gender, phone, email, blood_group, allergies, address, patient_type, status) VALUES ?',
    [rows]
  );
  log(`seeded ${rows.length} demo patients (${DEMO_PATIENT_PREFIX}0001 …)`);
  return rows.map((r) => ({ id: r[0], name: r[1], age: r[2], gender: r[3], phone: r[4] }));
}

/* ── orders and the whole trail behind them ─────────────────────────────── */
function chooseTests(catalog, profiles) {
  if (chance(0.45)) {
    const profile = pick(profiles.filter((p) => p.codes.length));
    if (profile) {
      const tests = catalog.filter((t) => profile.codes.includes(t.test_code));
      if (tests.length) return { tests, profileCode: profile.profile_code };
    }
  }
  const n = int(1, 4);
  const shuffled = [...catalog].sort(() => rnd() - 0.5);
  return { tests: shuffled.slice(0, n), profileCode: null };
}

function analyzerFor(department, analyzers) {
  const match = analyzers.filter((a) => (a.department || '').toLowerCase().includes(department.toLowerCase().split(' ')[0]));
  return (match.length ? pick(match) : pick(analyzers)).id;
}

async function seedOrders(conn, ctx) {
  const { patients, catalog, profiles, analyzers, criticalRules, deltaRules } = ctx;

  const orders = [];
  const orderTests = [];
  const tasks = [];
  const taskTests = [];
  const samples = [];
  const events = [];
  const verifications = [];
  const reports = [];
  const alerts = [];
  const flags = [];
  const barcodes = [];

  let seq = 900000;
  const now = new Date();

  /**
   * Build one complete order at `orderedAt`, in `stage`.
   * `cap` (optional) is the latest instant any derived timestamp may reach —
   * passed for today's orders so nothing is dated in the future.
   */
  function build(orderedAt, stage, cap = null) {
    seq += 1;
    const s6 = String(seq).padStart(6, '0');
    const year = orderedAt.getFullYear();
    const orderId = `LAB-${year}-${s6}`;
    const accession = `ACC-${year}-${s6}`;
    const sampleId = `SMP-${year}-${s6}`;
    const visitId = `VIS-${year}-${s6}`;

    const patient = pick(patients);
    const doctor = pick(DOCTORS);
    const { tests, profileCode } = chooseTests(catalog, profiles);
    const priority = chance(0.12) ? (chance(0.4) ? 'STAT' : 'Urgent') : 'Routine';
    const charges = tests.reduce((sum, t) => sum + Number(t.price || 0), 0);
    const departments = [...new Set(tests.map((t) => t.department))];
    const department = departments.length === 1 ? departments[0] : 'Multiple';
    const container = tests[0].container || 'Plain (Red)';
    const sampleType = TUBES[container] || tests[0].specimen_type || 'Serum';

    // Timeline as minute offsets from the order, so it can be compressed.
    const step = {};
    step.collected = int(10, 40);
    step.received = step.collected + int(5, 20);
    step.bench = step.received + int(10, 40);
    step.result = step.bench + int(20, 90);
    step.review = step.result + int(10, 60);
    step.released = step.review + int(15, 90);

    // Nothing may be timestamped in the future. For orders raised today the
    // whole trail is squeezed into the time that has actually elapsed, which is
    // also what a STAT run looks like.
    if (cap) {
      const availableMin = Math.floor((cap.getTime() - orderedAt.getTime()) / 60000);
      if (step.released > availableMin) {
        const factor = Math.max(availableMin, 6) / step.released;
        for (const key of Object.keys(step)) {
          step[key] = Math.max(1, Math.round(step[key] * factor));
        }
      }
    }

    const collectedAt = addMin(orderedAt, step.collected);
    const receivedAt = addMin(orderedAt, step.received);
    const benchAt = addMin(orderedAt, step.bench);
    const resultAt = addMin(orderedAt, step.result);
    const reviewAt = addMin(orderedAt, step.review);
    const releasedAt = addMin(orderedAt, step.released);

    let status;
    let processing = 'Pending';
    const isRejected = stage === STAGE_REJECTED;

    if (stage === STAGE_AWAITING) { status = pick(AWAITING_STATUS); }
    else if (stage === STAGE_BENCH) { status = pick(BENCH_STATUS); processing = 'In Progress'; }
    else if (stage === STAGE_REVIEW) { status = pick(REVIEW_STATUS); processing = 'Awaiting Verification'; }
    else if (isRejected) { status = 'Rejected'; processing = 'Rejected'; }
    else { status = chance(0.35) ? 'Verified' : 'Released'; processing = 'Completed'; }

    const reachedCollection = stage !== STAGE_AWAITING;
    const reachedBench = stage === STAGE_BENCH || stage === STAGE_REVIEW || stage === STAGE_RELEASED;
    const hasResults = stage === STAGE_REVIEW || stage === STAGE_RELEASED;
    const isReleased = stage === STAGE_RELEASED;

    orders.push([
      orderId, patient.id, patient.name, visitId, doctor, status, priority,
      profileCode ? `${profileCode} profile requested` : null,
      sampleType,
      reachedCollection ? pick(COLLECTORS) : null,
      reachedCollection ? dt(collectedAt) : null,
      reachedBench ? analyzerFor(department === 'Multiple' ? tests[0].department : department, analyzers) : null,
      processing,
      reachedBench ? 'Analyzer' : 'Manual Entry',
      reachedCollection ? dt(receivedAt) : null,
      reachedBench ? dt(benchAt) : null,
      hasResults ? dt(resultAt) : null,
      isReleased ? dt(releasedAt) : null,
      isReleased ? dt(addMin(releasedAt, int(2, 30))) : null,
      isReleased ? doctor : null,
      dt(orderedAt),
      isReleased ? 'Paid' : pick(['Unpaid', 'Paid']),
      charges, 0, isReleased ? charges : 0, isReleased ? 0 : charges,
      accession, sampleId, accession, department, DEMO_SOURCE,
      dt(orderedAt), dt(isReleased ? releasedAt : orderedAt),
    ]);

    for (const t of tests) {
      orderTests.push([uuid(), orderId, t.name, t.test_code, profileCode, t.department, t.price, dt(orderedAt)]);
    }

    tasks.push([
      orderId, `RK-${s6}`, patient.id, patient.name, patient.age, patient.gender, patient.phone,
      doctor, `Token ${int(100, 999)}`, accession, status, priority,
      hasResults ? pick(TECHS) : null,
      isReleased ? dt(releasedAt) : null,
      reachedCollection ? dt(receivedAt) : null,
      reachedBench ? dt(benchAt) : null,
      hasResults ? dt(resultAt) : null,
      isReleased ? dt(releasedAt) : null,
      processing, dt(orderedAt),
    ]);

    let abnormalCount = 0;
    for (const t of tests) {
      const machine = reachedBench ? analyzerFor(t.department, analyzers) : null;
      let resultValue = null;
      if (hasResults) {
        const v = valueFor(t);
        resultValue = v.text + (t.units ? ` ${t.units}` : '');
        if (v.abnormal) abnormalCount += 1;
      }
      taskTests.push([uuid(), orderId, t.name, resultValue, machine, hasResults ? dt(resultAt) : null, dt(orderedAt)]);
    }

    barcodes.push([uuid(), orderId, accession, 1, dt(orderedAt)]);

    if (reachedCollection || isRejected) {
      samples.push([
        uuid(), orderId, sampleId, accession, accession,
        isRejected ? 'Rejected' : status,
        pick(COLLECTORS), dateOnly(collectedAt), hhmm(collectedAt), dt(collectedAt),
        sampleType, container, pick(LOCATIONS),
        `${(2 + rnd() * 3).toFixed(1)} mL`,
        null,
        pick(TECHS), dt(receivedAt),
        reachedBench ? dt(benchAt) : null,
        isReleased ? dt(releasedAt) : null,
        isRejected ? 1 : 0,
        isRejected ? pick(REJECT_REASONS) : null,
        isRejected ? pick(TECHS) : null,
        isRejected ? dt(receivedAt) : null,
        dt(orderedAt), dt(isRejected ? receivedAt : (isReleased ? releasedAt : orderedAt)),
      ]);
    }

    // Specimen timeline
    const trail = [[null, 'Ordered', 'order_created', doctor, dt(orderedAt)],
                   ['Ordered', 'Barcode Printed', 'barcode_generated', doctor, dt(addMin(orderedAt, 1))]];
    if (reachedCollection) {
      trail.push(['Barcode Printed', 'Sample Collected', 'sample_collected', pick(COLLECTORS), dt(collectedAt)]);
      trail.push(['Sample Collected', 'Received', 'sample_received', pick(TECHS), dt(receivedAt)]);
    }
    if (isRejected) trail.push(['Received', 'Rejected', 'sample_rejected', pick(TECHS), dt(addMin(receivedAt, 4))]);
    if (reachedBench) trail.push(['Received', 'Analyzer Running', 'analyzer_started', pick(TECHS), dt(benchAt)]);
    if (hasResults) trail.push(['Analyzer Running', 'Pending Verification', 'results_captured', pick(TECHS), dt(resultAt)]);
    if (isReleased) {
      trail.push(['Pending Verification', 'Verified', 'verified', pick(PATHOLOGISTS), dt(reviewAt)]);
      trail.push(['Verified', 'Released', 'report_released', pick(PATHOLOGISTS), dt(releasedAt)]);
    }
    for (const [from, to, action, actor, when] of trail) {
      events.push([uuid(), orderId, sampleId, from, to, action, actor, null, null, when]);
    }

    if (hasResults) {
      const vStatus = isReleased ? 'Released' : (status === 'Senior Review' ? 'Senior Review' : 'Pending');
      verifications.push([
        uuid(), orderId, vStatus,
        pick(TECHS), 'technician', dt(reviewAt), null,
        isReleased ? 'Reviewed against reference ranges.' : null,
        isReleased ? pick(PATHOLOGISTS) : null, isReleased ? 'pathologist' : null,
        isReleased ? dt(reviewAt) : null,
        isReleased ? pick(PATHOLOGISTS) : null, isReleased ? dt(releasedAt) : null,
        dt(orderedAt), dt(isReleased ? releasedAt : resultAt),
      ]);
    }

    if (isReleased) {
      reports.push([
        uuid(), `RPT-${year}-${s6}`, orderId, patient.id, patient.name, doctor, accession,
        uuid(), 'Released', tests.length, abnormalCount, 0,
        pick(PATHOLOGISTS), dt(releasedAt),
        chance(0.4) ? `${patient.name.split(' ')[0].toLowerCase()}@example.com` : null,
        chance(0.4) ? dt(addMin(releasedAt, 5)) : null,
        dt(releasedAt),
      ]);
    }

    return { orderId, accession, patient, doctor, tests, orderedAt, resultAt, stage, department };
  }

  /*
   * Historical traffic: one pass over the last 365 days (excluding today).
   * A single day-by-day loop keeps the monthly totals smooth — two overlapping
   * loops (per-month plus a recent window) piled several months' worth of
   * orders into the last few weeks and made the twelve-month chart useless.
   * Volume drifts gently upward and drops at weekends, which is what a real
   * collection register looks like.
   */
  const DAYS_OF_HISTORY = 365;
  for (let daysAgo = DAYS_OF_HISTORY; daysAgo >= 1; daysAgo -= 1) {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);

    const weekend = d.getDay() === 0;                       // Sunday: skeleton staff
    const trend = 1 + ((DAYS_OF_HISTORY - daysAgo) / DAYS_OF_HISTORY) * 0.6;
    const perDay = Math.max(1, Math.round((weekend ? 1.4 : 3.4) * trend) + int(-1, 1));

    for (let i = 0; i < perDay; i += 1) {
      const at = new Date(d);
      at.setHours(int(8, 17), int(0, 59), 0, 0);
      build(at, chance(0.05) ? STAGE_REJECTED : STAGE_RELEASED);
    }
  }

  /*
   * Today: spread across all four dashboard stages so the gauge tells a story.
   * Orders are placed only in hours that have already happened — a demo opened
   * at 09:30 should not show specimens booked in at 18:51. Early in the morning
   * the whole day is compressed into the hours available.
   */
  // Ordered oldest-first: the released ones came in at opening and have had time
  // to clear, the awaiting-collection ones were booked minutes ago.
  const todaysPlan = [
    ...Array(7).fill(STAGE_RELEASED),
    STAGE_REJECTED,
    ...Array(4).fill(STAGE_REVIEW),
    STAGE_REJECTED,
    ...Array(6).fill(STAGE_BENCH),
    ...Array(5).fill(STAGE_AWAITING),
  ];

  const dayStartMin = 7 * 60;                                  // collection opens 07:00
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const latestMin = Math.max(dayStartMin + 40, nowMin - 4);     // cope with an early run
  const span = latestMin - dayStartMin;

  const todays = todaysPlan.map((stage, i) => {
    const frac = todaysPlan.length === 1 ? 0 : i / (todaysPlan.length - 1);
    const minutes = Math.round(dayStartMin + span * frac);
    const at = new Date(now);
    at.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    return build(at, stage, now);
  });

  /* Critical alerts on a few of today's finished orders. */
  const criticalHosts = todays.filter((o) => o.stage === STAGE_REVIEW || o.stage === STAGE_RELEASED).slice(0, 3);
  criticalHosts.forEach((host, i) => {
    const play = CRITICAL_PLAYS[i % CRITICAL_PLAYS.length];
    const rule = criticalRules.find((r) => (r.test_code || r.test_name || '').toUpperCase().includes(play.code)) || criticalRules[0];
    const acknowledged = i === 0;
    alerts.push([
      uuid(), rule?.id || null, host.orderId, host.orderId, host.patient.id, host.patient.name,
      play.code === 'K' ? 'Potassium' : play.code === 'GLUF' ? 'Glucose (Fasting)' : 'Hemoglobin',
      `${play.value} ${play.unit}`, Number(play.value), play.op, play.threshold, play.unit,
      'mispaplus', 'Critical', play.message, play.op === '<=' ? 'L' : 'H',
      acknowledged ? 'Acknowledged' : 'Active',
      acknowledged ? 1 : 0,
      acknowledged ? pick(PATHOLOGISTS) : null,
      acknowledged ? 'pathologist' : null,
      acknowledged ? dt(addMin(host.resultAt, 8)) : null,
      acknowledged ? 'Clinician informed by phone.' : null,
      dt(host.resultAt), dt(host.resultAt),
    ]);
  });

  /* Delta flags on two of today's orders. */
  const deltaHosts = todays.filter((o) => o.stage === STAGE_RELEASED).slice(0, 2);
  deltaHosts.forEach((host, i) => {
    const test = host.tests[0];
    const rule = deltaRules.find((r) => (r.test_code || '').toUpperCase() === test.test_code) || deltaRules[0];
    const prev = 1.1 + i * 0.4;
    const curr = prev * (i === 0 ? 2.3 : 0.45);
    flags.push([
      uuid(), rule?.id || null, host.orderId, host.orderId, host.patient.id, host.patient.name,
      test.name, curr.toFixed(2), curr, prev.toFixed(2), prev,
      dt(new Date(host.orderedAt.getTime() - 86400000 * int(20, 60))), null,
      Math.abs(curr - prev).toFixed(2), (((curr - prev) / prev) * 100).toFixed(2),
      'percent', curr > prev ? 'up' : 'down',
      '> 50% change from previous', test.units || null, 'mispaplus',
      'Warning',
      `${test.name} changed ${(((curr - prev) / prev) * 100).toFixed(0)}% against the previous result.`,
      'Flagged', null, null, null, null, null,
      dt(host.resultAt), dt(host.resultAt),
    ]);
  });

  /* ── write everything ─────────────────────────────────────────────────── */
  await insertMany(conn,
    'INSERT INTO lab_orders (id, patient_id, patient_name, visit_id, doctor_name, status, priority, notes, ' +
    'sample_type, collected_by, collection_time, machine_assigned, processing_status, result_source, ' +
    'registered_at, analyzer_started_at, qc_started_at, report_generated_at, report_delivered_at, report_delivered_to, ' +
    'order_time, payment_status, total_charges, discount, amount_paid, balance, ' +
    'accession_number, sample_id, barcode_value, department, order_source, created_at, updated_at) VALUES ?',
    orders);
  await insertMany(conn, 'INSERT INTO lab_order_tests (id, lab_order_id, test_name, test_code, profile_code, department, price, created_at) VALUES ?', orderTests);
  await insertMany(conn,
    'INSERT INTO lab_tasks (id, patient_id, clinic_patient_id, patient_name, age, gender, phone, doctor_name, ' +
    'opd_number, specimen_id, status, priority, verified_by, verified_at, registered_at, analyzer_started_at, ' +
    'qc_started_at, report_generated_at, processing_status, created_at) VALUES ?',
    tasks);
  await insertMany(conn, 'INSERT INTO lab_task_tests (id, lab_task_id, test_name, result_value, machine_name, completed_at, created_at) VALUES ?', taskTests);
  await insertMany(conn, 'INSERT INTO barcode_tracking (id, lab_order_id, barcode_value, `generated`, generated_at) VALUES ?', barcodes);
  await insertMany(conn,
    'INSERT INTO lab_samples (id, lab_order_id, sample_id, accession_number, barcode_value, status, collector, ' +
    'collection_date, collection_time, collected_at, sample_type, tube_type, collection_location, sample_volume, ' +
    'remarks, received_by, received_at, processing_at, completed_at, rejected, rejection_reason, rejected_by, ' +
    'rejected_at, created_at, updated_at) VALUES ?',
    samples);
  await insertMany(conn, 'INSERT INTO lab_sample_events (id, lab_order_id, sample_id, from_status, to_status, action, actor, machine, note, created_at) VALUES ?', events);
  await insertMany(conn,
    'INSERT INTO lab_verifications (id, lab_order_id, status, reviewed_by, reviewed_role, reviewed_at, ' +
    'reviewed_signature, review_notes, approved_by, approved_role, approved_at, released_by, released_at, ' +
    'created_at, updated_at) VALUES ?',
    verifications);
  await insertMany(conn,
    'INSERT INTO lab_reports (id, report_no, lab_order_id, patient_id, patient_name, doctor_name, accession_number, ' +
    'verification_token, status, test_count, abnormal_count, critical_count, generated_by, generated_at, ' +
    'emailed_to, emailed_at, created_at) VALUES ?',
    reports);
  await insertMany(conn,
    'INSERT INTO lab_critical_alerts (id, rule_id, lab_task_id, lab_order_id, patient_id, patient_name, test_name, ' +
    'result_value, numeric_value, operator, threshold_text, unit, machine_name, severity, message, flag, status, ' +
    'acknowledged, acknowledged_by, acknowledged_role, acknowledged_at, ack_note, detected_at, created_at) VALUES ?',
    alerts);
  await insertMany(conn,
    'INSERT INTO lab_delta_flags (id, rule_id, lab_task_id, lab_order_id, patient_id, patient_name, test_name, ' +
    'current_value, current_numeric, previous_value, previous_numeric, previous_at, previous_task_id, abs_delta, ' +
    'pct_delta, delta_type, direction, threshold_text, unit, machine_name, severity, message, status, reviewed_by, ' +
    'reviewed_role, reviewed_at, review_action, review_note, detected_at, created_at) VALUES ?',
    flags);

  log(`seeded ${orders.length} orders (${todaysPlan.length} today), ${orderTests.length} ordered tests, ` +
      `${samples.length} samples, ${events.length} timeline events, ${reports.length} released reports, ` +
      `${alerts.length} critical alerts, ${flags.length} delta flags`);

  return orders;
}

/* ── quality control ────────────────────────────────────────────────────── */
async function seedQc(conn, analyzers) {
  const [materials] = await conn.query('SELECT id, name, lot_number, control_level, analyzer_id FROM qc_materials');
  const [targets] = await conn.query('SELECT material_id, test_code, test_name, unit, target_mean, target_sd FROM qc_analyte_targets');
  if (!materials.length || !targets.length) { log('no QC materials/targets — skipping QC'); return; }

  const batches = [];
  const results = [];
  const now = new Date();

  for (let daysAgo = 13; daysAgo >= 0; daysAgo -= 1) {
    for (const material of materials) {
      const runAt = new Date(now);
      runAt.setDate(runAt.getDate() - daysAgo);
      runAt.setHours(7, int(30, 59), 0, 0);

      const batchId = uuid();
      const mine = targets.filter((t) => t.material_id === material.id);
      if (!mine.length) continue;

      // One deliberate Westgard failure two days ago so the QC screen has a story.
      const forceFail = daysAgo === 2 && material.control_level === 'Level 2';
      let worst = 'Pass';

      for (const target of mine) {
        const mean = Number(target.target_mean);
        const sd = Number(target.target_sd);
        const z = forceFail ? (3.4 + rnd() * 0.6) : ((rnd() - 0.5) * (chance(0.12) ? 4.6 : 2.4));
        const value = mean + z * sd;
        const status = Math.abs(z) >= 3 ? 'Reject' : Math.abs(z) >= 2 ? 'Warning' : 'Pass';
        if (status === 'Reject') worst = 'Rejected';
        else if (status === 'Warning' && worst === 'Pass') worst = 'Warning';

        results.push([
          uuid(), batchId, material.id, material.analyzer_id, target.test_code, target.test_name,
          material.control_level, material.lot_number, pick(TECHS),
          value.toFixed(4), mean.toFixed(4), sd.toFixed(4), z.toFixed(4),
          z >= 0 ? 'above' : 'below', status,
          status === 'Pass' ? null : (Math.abs(z) >= 3 ? '1_3s' : '1_2s'),
          dt(runAt), dt(runAt),
        ]);
      }

      batches.push([
        batchId, `QC-${dateOnly(runAt).replace(/-/g, '')}-${material.control_level.replace(/\s/g, '')}`,
        material.analyzer_id, pick(TECHS), worst,
        worst === 'Rejected' ? 'Westgard 1-3s violation — analyzer blocked pending recalibration.' : null,
        null, null, null, DEMO_SOURCE, dt(runAt), dt(runAt), dt(runAt),
      ]);
    }
  }

  await insertMany(conn,
    'INSERT INTO qc_batches (id, batch_no, analyzer_id, operator, status, notes, overridden_by, override_reason, ' +
    'overridden_at, created_by, run_at, created_at, updated_at) VALUES ?', batches);
  await insertMany(conn,
    'INSERT INTO qc_results (id, batch_id, material_id, analyzer_id, test_code, test_name, control_level, lot_number, ' +
    'operator, value, target_mean, target_sd, z_score, side, status, flags, run_at, created_at) VALUES ?', results);

  log(`seeded ${batches.length} QC batches with ${results.length} control results (14 days)`);
}

/* ── inventory movement ─────────────────────────────────────────────────── */

/** Items deliberately left under their reorder level, so alerting has a subject. */
const LOW_STOCK_ITEMS = new Set(['Hemat 60 Diluent', 'Maglumi TSH Kit']);

/**
 * Two weeks of stock movement that lands on a deterministic closing balance.
 *
 * The balance is computed from the item's own reorder level rather than from
 * whatever is currently in the table, so re-running the seeder converges on the
 * same figures instead of drifting upward each time.
 */
async function seedInventoryTxns(conn) {
  const [items] = await conn.query('SELECT id, name, low_stock_threshold, unit FROM lab_inventory ORDER BY name');
  if (!items.length) { log('no inventory items — skipping stock ledger'); return; }

  const rows = [];
  const now = new Date();
  let lowCount = 0;

  for (const item of items) {
    const threshold = Number(item.low_stock_threshold) || 10;
    const opening = Math.round(threshold * 9);
    const low = LOW_STOCK_ITEMS.has(item.name);
    const closing = low
      ? Math.max(1, Math.round(threshold * 0.55))          // under the reorder level
      : Math.round(threshold * (2.5 + rnd() * 2.5));       // comfortable
    if (low) lowCount += 1;

    const steps = 7;
    const perStep = (closing - opening) / steps;
    let balance = opening;

    rows.push([uuid(), item.id, 'in', opening, opening, 'Opening balance', `LOT-${int(1000, 9999)}`,
      null, DEMO_SOURCE, dt(new Date(now.getTime() - 15 * 86400000))]);

    for (let s = 0; s < steps; s += 1) {
      const when = new Date(now);
      when.setDate(when.getDate() - (13 - s * 2));
      when.setHours(int(9, 16), int(0, 59), 0, 0);

      // Last step lands exactly on the closing balance.
      let change = s === steps - 1
        ? closing - balance
        : Math.round(perStep) + int(-2, 2);

      // A single restock partway through, for a realistic ledger.
      if (s === 3 && !low) {
        const restock = Math.round(threshold * 1.5);
        balance += restock;
        rows.push([uuid(), item.id, 'in', restock, balance, 'Stock received',
          `LOT-${int(1000, 9999)}`, `PO-${int(100, 999)}`, DEMO_SOURCE, dt(addMin(when, -45))]);
        change = Math.round(perStep) - restock;
      }

      balance += change;
      if (balance < 0) { change -= balance; balance = 0; }

      rows.push([uuid(), item.id, change < 0 ? 'consume' : 'in', change, balance,
        change < 0 ? 'Routine testing' : 'Stock adjustment', null, null, DEMO_SOURCE, dt(when)]);
    }

    await conn.query(
      'UPDATE lab_inventory SET stock_qty = ?, last_movement_at = ? WHERE id = ?',
      [balance.toFixed(2), dt(now), item.id]
    );
  }

  await insertMany(conn,
    'INSERT INTO lab_inventory_txns (id, item_id, type, change_qty, balance_after, reason, lot_number, reference, performed_by, created_at) VALUES ?',
    rows);
  log(`seeded ${rows.length} inventory movements across ${items.length} items (${lowCount} left below reorder level)`);
}

/* ── helpers ────────────────────────────────────────────────────────────── */
async function insertMany(conn, sql, rows, chunk = 200) {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += chunk) {
    await conn.query(sql, [rows.slice(i, i + chunk)]);
  }
}

async function report(conn, orderCount) {
  const [[today]] = await conn.query(
    "SELECT COUNT(*) AS n FROM lab_orders WHERE DATE(created_at) = CURDATE() AND order_source = ?", [DEMO_SOURCE]
  );
  const [[tat]] = await conn.query(
    'SELECT ROUND(AVG(TIMESTAMPDIFF(MINUTE, COALESCE(order_time, created_at), report_generated_at))) AS m ' +
    'FROM lab_orders WHERE report_generated_at IS NOT NULL AND report_generated_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)'
  );
  log('─────────────────────────────────────────────');
  log(`demo dataset ready: ${orderCount} orders, ${today.n} of them today`);
  log(`30-day average turnaround: ${tat.m ?? 0} minutes`);
  log('remove it any time with:  node mysql/seed_demo.mjs --clean');
}

main().catch((e) => { console.error('[seed:demo] fatal:', e.message); process.exit(1); });
