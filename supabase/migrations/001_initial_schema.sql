-- ============================================================================
-- RK Clinic HMS + LIS — Supabase PostgreSQL Schema
-- Migration: 001_initial_schema.sql
-- Run this in the Supabase SQL Editor: supabase.com/dashboard → SQL Editor
-- ============================================================================

-- ── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- USER PROFILES
-- Extends Supabase auth.users with clinic-specific fields
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name    TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('admin','doctor','technician','nurse_pharmacy','receptionist')),
  email        TEXT UNIQUE NOT NULL,
  phone        TEXT,
  cabin        TEXT,
  department   TEXT,
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PATIENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.patients (
  id                 TEXT PRIMARY KEY DEFAULT ('PAT-' || LPAD(nextval('patient_id_seq')::TEXT, 6, '0')),
  name               TEXT NOT NULL,
  age                INTEGER,
  gender             TEXT CHECK (gender IN ('Male','Female','Other')),
  phone              TEXT,
  email              TEXT,
  blood_group        TEXT,
  allergies          TEXT DEFAULT 'None',
  address            TEXT,
  emergency_contact  TEXT,
  dob                TEXT,
  visit_status       TEXT DEFAULT 'Waiting',
  last_consultation  TEXT,
  visit_time         TEXT,
  patient_type       TEXT DEFAULT 'OPD',
  status             TEXT DEFAULT 'Active',
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Sequence for patient IDs
CREATE SEQUENCE IF NOT EXISTS patient_id_seq START 1;

-- ============================================================================
-- OPD QUEUE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.opd_queue (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token       TEXT NOT NULL,
  patient_id  TEXT REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_name TEXT,
  specialty   TEXT DEFAULT 'General Consultation',
  status      TEXT DEFAULT 'Waiting' CHECK (status IN ('Waiting','In-Consultation','Completed','Cancelled')),
  check_in    TEXT,
  visit_date  DATE DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- BEDS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.beds (
  id          TEXT PRIMARY KEY,
  ward        TEXT NOT NULL,
  bed_number  TEXT NOT NULL,
  bed_type    TEXT DEFAULT 'General' CHECK (bed_type IN ('General','ICU','Semi-Private','Private','Emergency')),
  status      TEXT DEFAULT 'Available' CHECK (status IN ('Available','Occupied','Maintenance')),
  patient_id  TEXT REFERENCES public.patients(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default beds
INSERT INTO public.beds (id, ward, bed_number, bed_type, status) VALUES
  ('WARD-A-B1','Ward A','1','General','Available'),
  ('WARD-A-B2','Ward A','2','General','Available'),
  ('WARD-A-B3','Ward A','3','General','Available'),
  ('WARD-A-B4','Ward A','4','General','Available'),
  ('ICU-B1','ICU','1','ICU','Available'),
  ('ICU-B2','ICU','2','ICU','Available'),
  ('ICU-B3','ICU','3','ICU','Available'),
  ('SEMI-101','Semi-Private','101','Semi-Private','Available'),
  ('SEMI-102','Semi-Private','102','Semi-Private','Available'),
  ('DELUXE-201','Deluxe Suite','201','Private','Available'),
  ('EMRG-E1','Emergency','E1','Emergency','Available'),
  ('EMRG-E2','Emergency','E2','Emergency','Available')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- INPATIENTS (IPD Admissions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.inpatients (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id       TEXT REFERENCES public.patients(id) ON DELETE CASCADE,
  bed_id           TEXT REFERENCES public.beds(id) ON DELETE SET NULL,
  diagnosis        TEXT,
  admission_date   TIMESTAMPTZ DEFAULT NOW(),
  discharge_date   TIMESTAMPTZ,
  doctor_name      TEXT,
  vitals           TEXT,
  billing_status   TEXT DEFAULT 'Pending',
  notes            TEXT,
  status           TEXT DEFAULT 'Admitted' CHECK (status IN ('Admitted','Discharged','Transferred')),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- NURSING NOTES / CLINICAL NOTES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.nursing_notes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id  TEXT REFERENCES public.patients(id) ON DELETE CASCADE,
  author      TEXT NOT NULL,
  priority    TEXT DEFAULT 'Routine' CHECK (priority IN ('Routine','Important','Critical')),
  note_text   TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PRESCRIPTIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.prescriptions (
  id           TEXT PRIMARY KEY DEFAULT ('RK-RX-' || floor(1000 + random() * 9000)::TEXT),
  patient_id   TEXT REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_name  TEXT,
  diagnosis    TEXT,
  symptoms     TEXT,
  status       TEXT DEFAULT 'Pending' CHECK (status IN ('Pending','Fulfilled','Cancelled')),
  rx_handwriting TEXT, -- base64 canvas image
  follow_up_date DATE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.prescription_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prescription_id TEXT REFERENCES public.prescriptions(id) ON DELETE CASCADE,
  medicine_name   TEXT NOT NULL,
  dose            TEXT,
  duration        TEXT,
  instructions    TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- LAB ORDERS (Doctor-ordered tests)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.lab_orders (
  id               TEXT PRIMARY KEY,  -- e.g. LAB-2026-0001
  patient_id       TEXT REFERENCES public.patients(id) ON DELETE CASCADE,
  patient_name     TEXT,
  visit_id         TEXT,
  doctor_name      TEXT,
  status           TEXT DEFAULT 'Ordered',
  priority         TEXT DEFAULT 'Routine' CHECK (priority IN ('Routine','Urgent','STAT')),
  notes            TEXT,
  sample_type      TEXT,
  collected_by     TEXT,
  collection_time  TEXT,
  machine_assigned TEXT,
  processing_status TEXT DEFAULT 'Pending',
  result_source    TEXT DEFAULT 'Manual Entry',
  registered_at    TEXT,
  analyzer_started_at TEXT,
  qc_started_at    TEXT,
  report_generated_at TEXT,
  report_delivered_at TEXT,
  report_delivered_to TEXT,
  order_time       TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lab_order_tests (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lab_order_id TEXT REFERENCES public.lab_orders(id) ON DELETE CASCADE,
  test_name    TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- LAB TASKS (LIS workflow records per specimen)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.lab_tasks (
  id                TEXT PRIMARY KEY,  -- e.g. LAB-2026-0001
  patient_id        TEXT,
  clinic_patient_id TEXT REFERENCES public.patients(id) ON DELETE CASCADE,
  patient_name      TEXT,
  age               INTEGER,
  gender            TEXT,
  phone             TEXT,
  doctor_name       TEXT,
  opd_number        TEXT,
  specimen_id       TEXT,
  status            TEXT DEFAULT 'Ordered',
  priority          TEXT DEFAULT 'Routine',
  verified_by       TEXT,
  verified_at       TEXT,
  remarks           TEXT,
  report_generated_at TEXT,
  report_delivered_at TEXT,
  report_delivered_to TEXT,
  processing_status TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lab_task_tests (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lab_task_id  TEXT REFERENCES public.lab_tasks(id) ON DELETE CASCADE,
  test_name    TEXT NOT NULL,
  result_value TEXT,
  machine_name TEXT,
  completed_at TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- LAB ALERTS (Critical value notifications)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.lab_alerts (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id       TEXT REFERENCES public.patients(id) ON DELETE CASCADE,
  patient_name     TEXT,
  order_number     TEXT,
  test_name        TEXT,
  parameter        TEXT,
  value            TEXT,
  ref_range        TEXT,
  severity         TEXT DEFAULT 'High' CHECK (severity IN ('High','Low','Critical')),
  acknowledged     BOOLEAN DEFAULT FALSE,
  acknowledged_by  TEXT,
  acknowledged_at  TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- LAB INVENTORY (Reagents, Kits, Consumables — separate from medicine)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.lab_inventory (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  category        TEXT NOT NULL CHECK (category IN ('Reagent','Kit','Consumable','Control','Standard','Other')),
  unit            TEXT DEFAULT 'Units',
  stock_qty       NUMERIC DEFAULT 0,
  low_stock_threshold NUMERIC DEFAULT 10,
  expiry_date     DATE,
  batch_number    TEXT,
  supplier_id     UUID,
  cost_per_unit   NUMERIC DEFAULT 0,
  analyzer_id     TEXT,
  location        TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ANALYZER CONNECTIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.analyzer_connections (
  id           TEXT PRIMARY KEY,  -- e.g. 'maglumi'
  name         TEXT NOT NULL,
  department   TEXT,
  protocol     TEXT,
  port         TEXT,
  status       TEXT DEFAULT 'Offline' CHECK (status IN ('Online','Offline','Error')),
  last_ping    TIMESTAMPTZ,
  health_score INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default analyzers
INSERT INTO public.analyzer_connections (id, name, department, protocol, port, status, health_score) VALUES
  ('maglumi','Maglumi 800','Immunology (CLIA)','TCP/IP','192.168.1.101:9100','Online',98),
  ('weldon','Weldon WB-150 Biochemistry Analyzer','Biochemistry','RS-232 Serial','COM3 / 9600 baud','Online',95),
  ('hematology','Hematology Analyzer','Hematology','Ethernet','192.168.1.102:8080','Online',100),
  ('urine','Urine Analyzer','Clinical Pathology','USB','USB-HID Device 0x04B4','Online',92),
  ('electrolyte','Electrolyte Analyzer','Clinical Chemistry','TCP/IP','192.168.1.103:7001','Online',97),
  ('rapid','Rapid Test Analyzer','Serology / POCT','RS-232 Serial','COM5 / 19200 baud','Online',90)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- BARCODE TRACKING
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.barcode_tracking (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lab_order_id  TEXT UNIQUE,
  barcode_value TEXT,
  generated     BOOLEAN DEFAULT FALSE,
  generated_at  TEXT,
  printed       BOOLEAN DEFAULT FALSE,
  printed_at    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- MEDICINE INVENTORY (Pharmacy)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.medicine_inventory (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  category        TEXT,
  stock           INTEGER DEFAULT 0,
  threshold       INTEGER DEFAULT 20,
  price           NUMERIC DEFAULT 0,
  expiry_date     DATE,
  batch_number    TEXT,
  supplier_id     UUID,
  image_url       TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SUPPLIERS / VENDORS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.suppliers (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  category     TEXT DEFAULT 'Pharma' CHECK (category IN ('Pharma','Lab','General')),
  contact_name TEXT,
  phone        TEXT,
  email        TEXT,
  address      TEXT,
  gst_number   TEXT,
  notes        TEXT,
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PURCHASE ORDERS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_number     TEXT UNIQUE,
  supplier_id   UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  order_type    TEXT DEFAULT 'Pharma' CHECK (order_type IN ('Pharma','Lab','General')),
  status        TEXT DEFAULT 'Pending' CHECK (status IN ('Pending','Received','Partial','Cancelled')),
  total_amount  NUMERIC DEFAULT 0,
  notes         TEXT,
  ordered_by    TEXT,
  received_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  item_name         TEXT NOT NULL,
  item_type         TEXT DEFAULT 'Medicine',
  quantity          NUMERIC DEFAULT 0,
  unit_price        NUMERIC DEFAULT 0,
  total_price       NUMERIC GENERATED ALWAYS AS (quantity * unit_price) STORED,
  expiry_date       DATE,
  batch_number      TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INVOICES / BILLING
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.invoices (
  id              TEXT PRIMARY KEY DEFAULT ('RK-INV-' || to_char(NOW(), 'YYYY') || '-' || LPAD(nextval('invoice_id_seq')::TEXT, 4, '0')),
  patient_id      TEXT REFERENCES public.patients(id) ON DELETE SET NULL,
  amount          NUMERIC DEFAULT 0,
  payment_mode    TEXT DEFAULT 'Cash',
  status          TEXT DEFAULT 'Pending' CHECK (status IN ('Paid','Pending','Partial','Cancelled')),
  invoice_date    DATE DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS invoice_id_seq START 1;

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id  TEXT REFERENCES public.invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  price       NUMERIC DEFAULT 0,
  quantity    INTEGER DEFAULT 1,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- APPOINTMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.appointments (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id   TEXT REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_name  TEXT,
  appointment_date DATE,
  appointment_time TEXT,
  title        TEXT,
  type         TEXT DEFAULT 'appointment',
  status       TEXT DEFAULT 'Scheduled' CHECK (status IN ('Scheduled','Completed','Cancelled','No-Show')),
  hospital     TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- DISCHARGE SUMMARIES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.discharge_summaries (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id        TEXT REFERENCES public.patients(id) ON DELETE CASCADE,
  inpatient_id      UUID REFERENCES public.inpatients(id) ON DELETE SET NULL,
  admission_date    TEXT,
  discharge_date    TEXT,
  diagnosis         TEXT,
  treatment_summary TEXT,
  lab_summary       TEXT,
  medicines_summary TEXT,
  follow_up_date    DATE,
  follow_up_instructions TEXT,
  doctor_notes      TEXT,
  doctor_name       TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- AUDIT LOGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID,
  user_name    TEXT,
  action       TEXT NOT NULL,  -- CREATE, UPDATE, DELETE, LOGIN, LOGOUT, VIEW
  entity_type  TEXT,           -- patient, invoice, lab_order, etc.
  entity_id    TEXT,
  changes_json JSONB,
  ip_address   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- EMERGENCY TRIAGE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.emergency_cases (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id       TEXT REFERENCES public.patients(id) ON DELETE CASCADE,
  triage_level     TEXT DEFAULT 'Urgent' CHECK (triage_level IN ('Critical','Urgent','Non-Urgent')),
  chief_complaint  TEXT,
  arrival_time     TIMESTAMPTZ DEFAULT NOW(),
  assigned_bed_id  TEXT REFERENCES public.beds(id) ON DELETE SET NULL,
  assigned_doctor  TEXT,
  status           TEXT DEFAULT 'Active' CHECK (status IN ('Active','Admitted','Discharged','Transferred')),
  vitals           TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opd_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inpatients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nursing_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_order_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_task_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analyzer_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barcode_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicine_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discharge_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_cases ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user's role from user_profiles
CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER;

-- ── Policies: Authenticated staff can read/write all clinical data ──────────
-- (Finer-grained restrictions per-role are enforced in API middleware)

CREATE POLICY "Authenticated users can read patients"
  ON public.patients FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert patients"
  ON public.patients FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update patients"
  ON public.patients FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Admin/doctor can delete patients"
  ON public.patients FOR DELETE TO authenticated
  USING (auth.user_role() IN ('admin','doctor'));

-- OPD Queue
CREATE POLICY "All authenticated can access queue"
  ON public.opd_queue FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Beds
CREATE POLICY "All authenticated can read beds"
  ON public.beds FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/nurse can modify beds"
  ON public.beds FOR ALL TO authenticated
  USING (auth.user_role() IN ('admin','nurse_pharmacy','doctor'))
  WITH CHECK (auth.user_role() IN ('admin','nurse_pharmacy','doctor'));

-- Inpatients
CREATE POLICY "All authenticated can access inpatients"
  ON public.inpatients FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Nursing Notes
CREATE POLICY "All authenticated can access nursing notes"
  ON public.nursing_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Prescriptions
CREATE POLICY "All authenticated can read prescriptions"
  ON public.prescriptions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Doctors/admin can write prescriptions"
  ON public.prescriptions FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() IN ('admin','doctor'));

CREATE POLICY "Pharmacy can update prescription status"
  ON public.prescriptions FOR UPDATE TO authenticated
  USING (auth.user_role() IN ('admin','doctor','nurse_pharmacy'));

-- Prescription items
CREATE POLICY "All authenticated can access prescription items"
  ON public.prescription_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Lab Orders
CREATE POLICY "All authenticated can read lab orders"
  ON public.lab_orders FOR SELECT TO authenticated USING (true);

CREATE POLICY "Doctors/admin can create lab orders"
  ON public.lab_orders FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() IN ('admin','doctor'));

CREATE POLICY "Lab/admin can update lab orders"
  ON public.lab_orders FOR UPDATE TO authenticated
  USING (auth.user_role() IN ('admin','doctor','technician'));

-- Lab Order Tests
CREATE POLICY "All authenticated can access lab order tests"
  ON public.lab_order_tests FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Lab Tasks
CREATE POLICY "All authenticated can access lab tasks"
  ON public.lab_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "All authenticated can access lab task tests"
  ON public.lab_task_tests FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Lab Alerts
CREATE POLICY "All authenticated can read lab alerts"
  ON public.lab_alerts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Lab/admin can create alerts"
  ON public.lab_alerts FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() IN ('admin','technician'));

CREATE POLICY "Doctors/admin can acknowledge alerts"
  ON public.lab_alerts FOR UPDATE TO authenticated
  USING (auth.user_role() IN ('admin','doctor'));

-- Lab Inventory
CREATE POLICY "All authenticated can read lab inventory"
  ON public.lab_inventory FOR SELECT TO authenticated USING (true);

CREATE POLICY "Lab/admin can write lab inventory"
  ON public.lab_inventory FOR ALL TO authenticated
  USING (auth.user_role() IN ('admin','technician'))
  WITH CHECK (auth.user_role() IN ('admin','technician'));

-- Analyzer Connections
CREATE POLICY "All authenticated can read analyzers"
  ON public.analyzer_connections FOR SELECT TO authenticated USING (true);

CREATE POLICY "Lab/admin can update analyzers"
  ON public.analyzer_connections FOR UPDATE TO authenticated
  USING (auth.user_role() IN ('admin','technician'));

-- Barcode Tracking
CREATE POLICY "All authenticated can access barcodes"
  ON public.barcode_tracking FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Medicine Inventory
CREATE POLICY "All authenticated can read medicines"
  ON public.medicine_inventory FOR SELECT TO authenticated USING (true);

CREATE POLICY "Pharmacy/admin can write medicines"
  ON public.medicine_inventory FOR ALL TO authenticated
  USING (auth.user_role() IN ('admin','nurse_pharmacy'))
  WITH CHECK (auth.user_role() IN ('admin','nurse_pharmacy'));

-- Suppliers
CREATE POLICY "All authenticated can read suppliers"
  ON public.suppliers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin can manage suppliers"
  ON public.suppliers FOR ALL TO authenticated
  USING (auth.user_role() IN ('admin','nurse_pharmacy'))
  WITH CHECK (auth.user_role() IN ('admin','nurse_pharmacy'));

-- Purchase Orders
CREATE POLICY "All authenticated can read purchase orders"
  ON public.purchase_orders FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/pharmacy can manage purchase orders"
  ON public.purchase_orders FOR ALL TO authenticated
  USING (auth.user_role() IN ('admin','nurse_pharmacy'))
  WITH CHECK (auth.user_role() IN ('admin','nurse_pharmacy'));

CREATE POLICY "All authenticated can access purchase order items"
  ON public.purchase_order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Invoices
CREATE POLICY "All authenticated can read invoices"
  ON public.invoices FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/pharmacy can write invoices"
  ON public.invoices FOR ALL TO authenticated
  USING (auth.user_role() IN ('admin','nurse_pharmacy','doctor'))
  WITH CHECK (auth.user_role() IN ('admin','nurse_pharmacy','doctor'));

CREATE POLICY "All authenticated can access invoice items"
  ON public.invoice_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Appointments
CREATE POLICY "All authenticated can access appointments"
  ON public.appointments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Discharge Summaries
CREATE POLICY "All authenticated can read discharge summaries"
  ON public.discharge_summaries FOR SELECT TO authenticated USING (true);

CREATE POLICY "Doctors/admin can create discharge summaries"
  ON public.discharge_summaries FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() IN ('admin','doctor'));

-- Audit Logs (admin read-only)
CREATE POLICY "Admin can read audit logs"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (auth.user_role() = 'admin');

CREATE POLICY "System can insert audit logs"
  ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Emergency Cases
CREATE POLICY "All authenticated can access emergency cases"
  ON public.emergency_cases FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- User profiles: users can read their own; admins can read all
CREATE POLICY "Users can read own profile"
  ON public.user_profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR auth.user_role() = 'admin');

CREATE POLICY "Admin can manage all profiles"
  ON public.user_profiles FOR ALL TO authenticated
  USING (auth.user_role() = 'admin')
  WITH CHECK (auth.user_role() = 'admin');

-- ============================================================================
-- USEFUL INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_patients_phone ON public.patients(phone);
CREATE INDEX IF NOT EXISTS idx_patients_name ON public.patients(name);
CREATE INDEX IF NOT EXISTS idx_opd_queue_date ON public.opd_queue(visit_date);
CREATE INDEX IF NOT EXISTS idx_opd_queue_patient ON public.opd_queue(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_patient ON public.lab_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_status ON public.lab_orders(status);
CREATE INDEX IF NOT EXISTS idx_lab_tasks_patient ON public.lab_tasks(clinic_patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_alerts_patient ON public.lab_alerts(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_alerts_acknowledged ON public.lab_alerts(acknowledged);
CREATE INDEX IF NOT EXISTS idx_invoices_patient ON public.invoices(patient_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON public.invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_nursing_notes_patient ON public.nursing_notes(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON public.prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inpatients_patient ON public.inpatients(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON public.appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON public.appointments(appointment_date);

-- ============================================================================
-- REALTIME: Enable for live updates
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.lab_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lab_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lab_alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.opd_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE public.beds;
ALTER PUBLICATION supabase_realtime ADD TABLE public.emergency_cases;

-- ============================================================================
-- SEED: Default staff users
-- NOTE: Run AFTER creating user accounts in Supabase Auth
-- Replace UUIDs with actual auth.users IDs from your project
-- ============================================================================
-- INSERT INTO public.user_profiles (id, full_name, role, email, cabin) VALUES
--   ('<admin-auth-uuid>', 'Administrator', 'admin', 'admin@rkclinic.com', 'Administration Block'),
--   ('<doctor-auth-uuid>', 'Dr. R. Kumar', 'doctor', 'doc@rkclinic.com', 'Cabin A'),
--   ('<nurse-auth-uuid>', 'Nurse & Pharmacy', 'nurse_pharmacy', 'medic@rkclinic.com', 'Nursing Station'),
--   ('<lab-auth-uuid>', 'Lab Technician', 'technician', 'lab@rkclinic.com', 'Pathology Lab');
