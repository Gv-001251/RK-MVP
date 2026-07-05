-- ============================================================================
-- RK Clinic HMS + LIS — MySQL Schema
-- File: mysql/001_mysql_schema.sql
-- Run: mysql -u root -p rk_clinic < mysql/001_mysql_schema.sql
-- ============================================================================

CREATE DATABASE IF NOT EXISTS rk_clinic CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE rk_clinic;

-- ============================================================================
-- USER PROFILES (includes password_hash — replaces Supabase Auth)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  full_name    VARCHAR(255) NOT NULL,
  role         VARCHAR(50)  NOT NULL,
  email        VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  phone        VARCHAR(50),
  cabin        VARCHAR(100),
  department   VARCHAR(100),
  is_active    TINYINT(1)   DEFAULT 1,
  created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_user_role CHECK (role IN ('admin','doctor','technician','nurse_pharmacy','receptionist'))
);

-- ============================================================================
-- PATIENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS patients (
  id                 VARCHAR(20)  NOT NULL PRIMARY KEY,  -- PAT-000001
  name               VARCHAR(255) NOT NULL,
  age                INT,
  gender             VARCHAR(20),
  phone              VARCHAR(50),
  email              VARCHAR(255),
  blood_group        VARCHAR(10),
  allergies          TEXT         DEFAULT 'None',
  address            TEXT,
  emergency_contact  VARCHAR(255),
  dob                VARCHAR(20),
  visit_status       VARCHAR(50)  DEFAULT 'Waiting',
  last_consultation  TEXT,
  visit_time         VARCHAR(50),
  patient_type       VARCHAR(20)  DEFAULT 'OPD',
  status             VARCHAR(20)  DEFAULT 'Active',
  created_at         DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS patient_id_seq (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY
);

-- ============================================================================
-- OPD QUEUE
-- ============================================================================
CREATE TABLE IF NOT EXISTS opd_queue (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  token       VARCHAR(20)  NOT NULL,
  patient_id  VARCHAR(20),
  doctor_name VARCHAR(255),
  specialty   VARCHAR(255) DEFAULT 'General Consultation',
  status      VARCHAR(50)  DEFAULT 'Waiting',
  check_in    VARCHAR(20),
  visit_date  DATE         DEFAULT (CURRENT_DATE),
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- ============================================================================
-- BEDS
-- ============================================================================
CREATE TABLE IF NOT EXISTS beds (
  id          VARCHAR(50)  NOT NULL PRIMARY KEY,
  ward        VARCHAR(100) NOT NULL,
  bed_number  VARCHAR(20)  NOT NULL,
  bed_type    VARCHAR(50)  DEFAULT 'General',
  status      VARCHAR(50)  DEFAULT 'Available',
  patient_id  VARCHAR(20),
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL
);

INSERT INTO beds (id, ward, bed_number, bed_type, status) VALUES
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
ON DUPLICATE KEY UPDATE id=id;

-- ============================================================================
-- INPATIENTS (IPD Admissions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS inpatients (
  id               CHAR(36)     NOT NULL PRIMARY KEY,
  patient_id       VARCHAR(20),
  bed_id           VARCHAR(50),
  diagnosis        TEXT,
  admission_date   DATETIME     DEFAULT CURRENT_TIMESTAMP,
  discharge_date   DATETIME,
  doctor_name      VARCHAR(255),
  vitals           TEXT,
  billing_status   VARCHAR(50)  DEFAULT 'Pending',
  notes            TEXT,
  status           VARCHAR(50)  DEFAULT 'Admitted',
  created_at       DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (bed_id) REFERENCES beds(id) ON DELETE SET NULL
);

-- ============================================================================
-- NURSING NOTES / CLINICAL NOTES
-- ============================================================================
CREATE TABLE IF NOT EXISTS nursing_notes (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  patient_id  VARCHAR(20),
  author      VARCHAR(255) NOT NULL,
  priority    VARCHAR(20)  DEFAULT 'Routine',
  note_text   TEXT         NOT NULL,
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- ============================================================================
-- PRESCRIPTIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS prescriptions (
  id              VARCHAR(30)  NOT NULL PRIMARY KEY,  -- RK-RX-XXXX
  patient_id      VARCHAR(20),
  doctor_name     VARCHAR(255),
  diagnosis       TEXT,
  symptoms        TEXT,
  status          VARCHAR(50)  DEFAULT 'Pending',
  rx_handwriting  LONGTEXT,
  follow_up_date  DATE,
  created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS prescription_items (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  prescription_id VARCHAR(30),
  medicine_name   VARCHAR(255) NOT NULL,
  dose            VARCHAR(100),
  duration        VARCHAR(100),
  instructions    TEXT,
  created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON DELETE CASCADE
);

-- ============================================================================
-- LAB ORDERS
-- ============================================================================
CREATE TABLE IF NOT EXISTS lab_orders (
  id                VARCHAR(30)  NOT NULL PRIMARY KEY,
  patient_id        VARCHAR(20),
  patient_name      VARCHAR(255),
  visit_id          VARCHAR(50),
  doctor_name       VARCHAR(255),
  status            VARCHAR(50)  DEFAULT 'Ordered',
  priority          VARCHAR(20)  DEFAULT 'Routine',
  notes             TEXT,
  sample_type       VARCHAR(100),
  collected_by      VARCHAR(255),
  collection_time   VARCHAR(50),
  machine_assigned  VARCHAR(100),
  processing_status VARCHAR(50)  DEFAULT 'Pending',
  result_source     VARCHAR(50)  DEFAULT 'Manual Entry',
  registered_at     VARCHAR(50),
  analyzer_started_at VARCHAR(50),
  qc_started_at     VARCHAR(50),
  report_generated_at VARCHAR(50),
  report_delivered_at VARCHAR(50),
  report_delivered_to VARCHAR(255),
  order_time        VARCHAR(50),
  created_at        DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lab_order_tests (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  lab_order_id VARCHAR(30),
  test_name    VARCHAR(255) NOT NULL,
  created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lab_order_id) REFERENCES lab_orders(id) ON DELETE CASCADE
);

-- ============================================================================
-- LAB TASKS
-- ============================================================================
CREATE TABLE IF NOT EXISTS lab_tasks (
  id                VARCHAR(30)  NOT NULL PRIMARY KEY,
  patient_id        VARCHAR(50),
  clinic_patient_id VARCHAR(20),
  patient_name      VARCHAR(255),
  age               INT,
  gender            VARCHAR(20),
  phone             VARCHAR(50),
  doctor_name       VARCHAR(255),
  opd_number        VARCHAR(50),
  specimen_id       VARCHAR(100),
  status            VARCHAR(50)  DEFAULT 'Ordered',
  priority          VARCHAR(20)  DEFAULT 'Routine',
  verified_by       VARCHAR(255),
  verified_at       VARCHAR(50),
  remarks           TEXT,
  report_generated_at VARCHAR(50),
  report_delivered_at VARCHAR(50),
  report_delivered_to VARCHAR(255),
  processing_status VARCHAR(50),
  created_at        DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (clinic_patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lab_task_tests (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  lab_task_id  VARCHAR(30),
  test_name    VARCHAR(255) NOT NULL,
  result_value TEXT,
  machine_name VARCHAR(100),
  completed_at VARCHAR(50),
  created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lab_task_id) REFERENCES lab_tasks(id) ON DELETE CASCADE
);

-- ============================================================================
-- LAB ALERTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS lab_alerts (
  id               CHAR(36)     NOT NULL PRIMARY KEY,
  patient_id       VARCHAR(20),
  patient_name     VARCHAR(255),
  order_number     VARCHAR(50),
  test_name        VARCHAR(255),
  parameter        VARCHAR(255),
  value            VARCHAR(100),
  ref_range        VARCHAR(100),
  severity         VARCHAR(20)  DEFAULT 'High',
  acknowledged     TINYINT(1)   DEFAULT 0,
  acknowledged_by  VARCHAR(255),
  acknowledged_at  VARCHAR(50),
  created_at       DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- ============================================================================
-- LAB INVENTORY
-- ============================================================================
CREATE TABLE IF NOT EXISTS lab_inventory (
  id                  CHAR(36)     NOT NULL PRIMARY KEY,
  name                VARCHAR(255) NOT NULL,
  category            VARCHAR(50)  NOT NULL,
  unit                VARCHAR(50)  DEFAULT 'Units',
  stock_qty           DECIMAL(10,2) DEFAULT 0,
  low_stock_threshold DECIMAL(10,2) DEFAULT 10,
  expiry_date         DATE,
  batch_number        VARCHAR(100),
  supplier_id         CHAR(36),
  cost_per_unit       DECIMAL(10,2) DEFAULT 0,
  analyzer_id         VARCHAR(100),
  location            VARCHAR(255),
  notes               TEXT,
  created_at          DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================================================
-- ANALYZER CONNECTIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS analyzer_connections (
  id           VARCHAR(50)  NOT NULL PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  department   VARCHAR(100),
  protocol     VARCHAR(100),
  port         VARCHAR(100),
  status       VARCHAR(20)  DEFAULT 'Offline',
  last_ping    DATETIME,
  health_score INT          DEFAULT 0,
  created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO analyzer_connections (id, name, department, protocol, port, status, health_score) VALUES
  ('maglumi','Maglumi 800','Immunology (CLIA)','TCP/IP','192.168.1.101:9100','Online',98),
  ('weldon','Weldon WB-150 Biochemistry Analyzer','Biochemistry','RS-232 Serial','COM3 / 9600 baud','Online',95),
  ('hematology','Hematology Analyzer','Hematology','Ethernet','192.168.1.102:8080','Online',100),
  ('urine','Urine Analyzer','Clinical Pathology','USB','USB-HID Device 0x04B4','Online',92),
  ('electrolyte','Electrolyte Analyzer','Clinical Chemistry','TCP/IP','192.168.1.103:7001','Online',97),
  ('rapid','Rapid Test Analyzer','Serology / POCT','RS-232 Serial','COM5 / 19200 baud','Online',90)
ON DUPLICATE KEY UPDATE id=id;

-- ============================================================================
-- BARCODE TRACKING
-- ============================================================================
CREATE TABLE IF NOT EXISTS barcode_tracking (
  id            CHAR(36)     NOT NULL PRIMARY KEY,
  lab_order_id  VARCHAR(30)  UNIQUE,
  barcode_value VARCHAR(255),
  generated     TINYINT(1)   DEFAULT 0,
  generated_at  VARCHAR(50),
  printed       TINYINT(1)   DEFAULT 0,
  printed_at    VARCHAR(50),
  created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- MEDICINE INVENTORY (Pharmacy)
-- ============================================================================
CREATE TABLE IF NOT EXISTS medicine_inventory (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  category     VARCHAR(100),
  stock        INT          DEFAULT 0,
  threshold    INT          DEFAULT 20,
  price        DECIMAL(10,2) DEFAULT 0,
  expiry_date  DATE,
  batch_number VARCHAR(100),
  supplier_id  CHAR(36),
  image_url    TEXT,
  created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================================================
-- SUPPLIERS / VENDORS
-- ============================================================================
CREATE TABLE IF NOT EXISTS suppliers (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  category     VARCHAR(50)  DEFAULT 'Pharma',
  contact_name VARCHAR(255),
  phone        VARCHAR(50),
  email        VARCHAR(255),
  address      TEXT,
  gst_number   VARCHAR(50),
  notes        TEXT,
  is_active    TINYINT(1)   DEFAULT 1,
  created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================================================
-- PURCHASE ORDERS
-- ============================================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
  id            CHAR(36)     NOT NULL PRIMARY KEY,
  po_number     VARCHAR(50)  UNIQUE,
  supplier_id   CHAR(36),
  order_type    VARCHAR(20)  DEFAULT 'Pharma',
  status        VARCHAR(20)  DEFAULT 'Pending',
  total_amount  DECIMAL(10,2) DEFAULT 0,
  notes         TEXT,
  ordered_by    VARCHAR(255),
  received_at   DATETIME,
  created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id                CHAR(36)     NOT NULL PRIMARY KEY,
  purchase_order_id CHAR(36),
  item_name         VARCHAR(255) NOT NULL,
  item_type         VARCHAR(50)  DEFAULT 'Medicine',
  quantity          DECIMAL(10,2) DEFAULT 0,
  unit_price        DECIMAL(10,2) DEFAULT 0,
  total_price       DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  expiry_date       DATE,
  batch_number      VARCHAR(100),
  created_at        DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
);

-- ============================================================================
-- INVOICES / BILLING
-- ============================================================================
CREATE TABLE IF NOT EXISTS invoice_id_seq (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS invoices (
  id           VARCHAR(30)  NOT NULL PRIMARY KEY,  -- RK-INV-YYYY-XXXX
  patient_id   VARCHAR(20),
  amount       DECIMAL(10,2) DEFAULT 0,
  payment_mode VARCHAR(50)  DEFAULT 'Cash',
  status       VARCHAR(20)  DEFAULT 'Pending',
  invoice_date DATE         DEFAULT (CURRENT_DATE),
  created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  invoice_id  VARCHAR(30),
  description TEXT         NOT NULL,
  price       DECIMAL(10,2) DEFAULT 0,
  quantity    INT           DEFAULT 1,
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

-- ============================================================================
-- APPOINTMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS appointments (
  id               CHAR(36)     NOT NULL PRIMARY KEY,
  patient_id       VARCHAR(20),
  doctor_name      VARCHAR(255),
  appointment_date DATE,
  appointment_time VARCHAR(20),
  title            VARCHAR(255),
  type             VARCHAR(50)  DEFAULT 'appointment',
  status           VARCHAR(50)  DEFAULT 'Scheduled',
  hospital         VARCHAR(255),
  notes            TEXT,
  created_at       DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- ============================================================================
-- DISCHARGE SUMMARIES
-- ============================================================================
CREATE TABLE IF NOT EXISTS discharge_summaries (
  id                CHAR(36)     NOT NULL PRIMARY KEY,
  patient_id        VARCHAR(20),
  inpatient_id      CHAR(36),
  admission_date    VARCHAR(50),
  discharge_date    VARCHAR(50),
  diagnosis         TEXT,
  treatment_summary TEXT,
  lab_summary       TEXT,
  medicines_summary TEXT,
  follow_up_date    DATE,
  follow_up_instructions TEXT,
  doctor_notes      TEXT,
  doctor_name       VARCHAR(255),
  created_at        DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (inpatient_id) REFERENCES inpatients(id) ON DELETE SET NULL
);

-- ============================================================================
-- AUDIT LOGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  user_id      CHAR(36),
  user_name    VARCHAR(255),
  action       VARCHAR(100) NOT NULL,
  entity_type  VARCHAR(100),
  entity_id    VARCHAR(100),
  changes_json JSON,
  ip_address   VARCHAR(100),
  created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- EMERGENCY TRIAGE
-- ============================================================================
CREATE TABLE IF NOT EXISTS emergency_cases (
  id               CHAR(36)     NOT NULL PRIMARY KEY,
  patient_id       VARCHAR(20),
  triage_level     VARCHAR(20)  DEFAULT 'Urgent',
  chief_complaint  TEXT,
  arrival_time     DATETIME     DEFAULT CURRENT_TIMESTAMP,
  assigned_bed_id  VARCHAR(50),
  assigned_doctor  VARCHAR(255),
  status           VARCHAR(50)  DEFAULT 'Active',
  vitals           TEXT,
  notes            TEXT,
  created_at       DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_bed_id) REFERENCES beds(id) ON DELETE SET NULL
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX idx_patients_phone ON patients(phone);
CREATE INDEX idx_patients_name ON patients(name);
CREATE INDEX idx_opd_queue_date ON opd_queue(visit_date);
CREATE INDEX idx_opd_queue_patient ON opd_queue(patient_id);
CREATE INDEX idx_lab_orders_patient ON lab_orders(patient_id);
CREATE INDEX idx_lab_orders_status ON lab_orders(status);
CREATE INDEX idx_lab_tasks_patient ON lab_tasks(clinic_patient_id);
CREATE INDEX idx_lab_alerts_patient ON lab_alerts(patient_id);
CREATE INDEX idx_lab_alerts_acknowledged ON lab_alerts(acknowledged);
CREATE INDEX idx_invoices_patient ON invoices(patient_id);
CREATE INDEX idx_invoices_date ON invoices(invoice_date);
CREATE INDEX idx_nursing_notes_patient ON nursing_notes(patient_id);
CREATE INDEX idx_prescriptions_patient ON prescriptions(patient_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_inpatients_patient ON inpatients(patient_id);
CREATE INDEX idx_appointments_patient ON appointments(patient_id);
CREATE INDEX idx_appointments_date ON appointments(appointment_date);

-- ============================================================================
-- SEED: Default staff (password: rkclinic@123)
-- Run: node mysql/seed_users.js  (or replace hash below after running bcrypt)
-- The password_hash below is bcrypt of 'rkclinic@123' with 12 rounds
-- ============================================================================
-- INSERT INTO user_profiles (id, full_name, role, email, password_hash, cabin, is_active) VALUES
--   (UUID(), 'Administrator', 'admin', 'admin@rkclinic.com', '$2b$12$CHANGE_ME', 'Administration Block', 1),
--   (UUID(), 'Dr. R. Kumar', 'doctor', 'doc@rkclinic.com', '$2b$12$CHANGE_ME', 'Cabin A', 1),
--   (UUID(), 'Nurse & Pharmacy', 'nurse_pharmacy', 'medic@rkclinic.com', '$2b$12$CHANGE_ME', 'Nursing Station', 1),
--   (UUID(), 'Lab Technician', 'technician', 'lab@rkclinic.com', '$2b$12$CHANGE_ME', 'Pathology Lab', 1);

-- ============================================================================
-- SEQUENCE TABLES — used to generate human-readable IDs
-- patient:  PAT-000001  (routes/patients/route.js)
-- invoice:  RK-INV-YYYY-0001  (routes/billing/invoices/route.js)
-- ============================================================================

CREATE TABLE IF NOT EXISTS patient_id_seq (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS invoice_id_seq (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY
);
