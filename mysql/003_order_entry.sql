-- ============================================================================
-- 003_order_entry.sql
-- Laboratory Order Entry module: test catalog, profiles, ID sequence, and the
-- extra columns the order-entry endpoints write. Run once, after 001 + 002:
--   mysql -u root -p rk_clinic < mysql/003_order_entry.sql
-- (Re-running the ALTER statements will error because the columns already
--  exist — that is expected; run this migration a single time.)
-- ============================================================================

USE rk_clinic;

-- ── Test catalog (individual, orderable tests) ─────────────────────────────
CREATE TABLE IF NOT EXISTS lab_test_catalog (
  test_code       VARCHAR(30)  NOT NULL PRIMARY KEY,   -- e.g. 'CBC', 'GLU'
  name            VARCHAR(255) NOT NULL,
  department      VARCHAR(100) NOT NULL DEFAULT 'General',
  specimen_type   VARCHAR(100) DEFAULT 'Serum',
  container       VARCHAR(100),
  units           VARCHAR(50),
  reference_range VARCHAR(100),
  price           DECIMAL(10,2) DEFAULT 0.00,
  tat_minutes     INT          DEFAULT 60,             -- turnaround time
  is_active       TINYINT(1)   DEFAULT 1,
  created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ── Test profiles / panels (a named bundle of tests) ───────────────────────
CREATE TABLE IF NOT EXISTS lab_test_profiles (
  profile_code VARCHAR(30)  NOT NULL PRIMARY KEY,       -- e.g. 'LFT'
  name         VARCHAR(255) NOT NULL,
  department   VARCHAR(100) NOT NULL DEFAULT 'General',
  price        DECIMAL(10,2) DEFAULT 0.00,
  is_active    TINYINT(1)   DEFAULT 1,
  created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lab_test_profile_items (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  profile_code VARCHAR(30)  NOT NULL,
  test_code    VARCHAR(30)  NOT NULL,
  created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_profile_test (profile_code, test_code),
  FOREIGN KEY (profile_code) REFERENCES lab_test_profiles(profile_code) ON DELETE CASCADE,
  FOREIGN KEY (test_code)    REFERENCES lab_test_catalog(test_code)     ON DELETE CASCADE
);

-- ── Global sequence for order / accession / sample numbers (race-safe) ─────
CREATE TABLE IF NOT EXISTS lab_seq (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY
);

-- ── Order-entry columns on lab_orders ──────────────────────────────────────
ALTER TABLE lab_orders
  ADD COLUMN accession_number VARCHAR(30)  NULL UNIQUE,
  ADD COLUMN sample_id        VARCHAR(30)  NULL,
  ADD COLUMN barcode_value    VARCHAR(60)  NULL,
  ADD COLUMN department       VARCHAR(100) NULL,
  ADD COLUMN order_source     VARCHAR(30)  DEFAULT 'Order Entry',
  ADD COLUMN cancel_reason    TEXT         NULL,
  ADD COLUMN cancelled_at     DATETIME     NULL,
  ADD COLUMN cancelled_by     VARCHAR(255) NULL,
  ADD INDEX idx_lo_accession (accession_number),
  ADD INDEX idx_lo_department (department);

-- ── Link ordered tests to the catalog / profile ───────────────────────────
ALTER TABLE lab_order_tests
  ADD COLUMN test_code    VARCHAR(30)   NULL,
  ADD COLUMN profile_code VARCHAR(30)   NULL,
  ADD COLUMN department   VARCHAR(100)  NULL,
  ADD COLUMN price        DECIMAL(10,2) DEFAULT 0.00,
  ADD INDEX idx_lot_testcode (test_code);

-- ── Seed: individual tests ─────────────────────────────────────────────────
INSERT INTO lab_test_catalog (test_code, name, department, specimen_type, container, units, reference_range, price, tat_minutes) VALUES
  ('CBC',   'Complete Blood Count',        'Hematology',   'Whole Blood', 'EDTA (Lavender)', '',      '',            250, 60),
  ('ESR',   'Erythrocyte Sed. Rate',       'Hematology',   'Whole Blood', 'EDTA (Lavender)', 'mm/hr', '0 - 20',      100, 60),
  ('HB',    'Hemoglobin',                  'Hematology',   'Whole Blood', 'EDTA (Lavender)', 'g/dL',  '12 - 16',     80,  30),
  ('HBA1C', 'Glycated Hemoglobin (HbA1c)', 'Biochemistry', 'Whole Blood', 'EDTA (Lavender)', '%',     '< 5.7',       400, 120),
  ('GLUF',  'Glucose (Fasting)',           'Biochemistry', 'Serum',       'Fluoride (Grey)', 'mg/dL', '70 - 110',    80,  45),
  ('GLUR',  'Glucose (Random)',            'Biochemistry', 'Serum',       'Fluoride (Grey)', 'mg/dL', '< 140',       80,  45),
  ('UREA',  'Blood Urea',                  'Biochemistry', 'Serum',       'Plain (Red)',     'mg/dL', '15 - 40',     120, 60),
  ('CREAT', 'Creatinine',                  'Biochemistry', 'Serum',       'Plain (Red)',     'mg/dL', '0.6 - 1.3',   120, 60),
  ('URIC',  'Uric Acid',                   'Biochemistry', 'Serum',       'Plain (Red)',     'mg/dL', '3.5 - 7.2',   120, 60),
  ('CHOL',  'Total Cholesterol',           'Biochemistry', 'Serum',       'Plain (Red)',     'mg/dL', '< 200',       120, 60),
  ('TG',    'Triglycerides',               'Biochemistry', 'Serum',       'Plain (Red)',     'mg/dL', '< 150',       120, 60),
  ('HDL',   'HDL Cholesterol',             'Biochemistry', 'Serum',       'Plain (Red)',     'mg/dL', '> 40',        120, 60),
  ('LDL',   'LDL Cholesterol',             'Biochemistry', 'Serum',       'Plain (Red)',     'mg/dL', '< 100',       120, 60),
  ('SGPT',  'SGPT / ALT',                  'Biochemistry', 'Serum',       'Plain (Red)',     'U/L',   '7 - 56',      110, 60),
  ('SGOT',  'SGOT / AST',                  'Biochemistry', 'Serum',       'Plain (Red)',     'U/L',   '5 - 40',      110, 60),
  ('BILT',  'Total Bilirubin',             'Biochemistry', 'Serum',       'Plain (Red)',     'mg/dL', '0.3 - 1.2',   110, 60),
  ('ALP',   'Alkaline Phosphatase',        'Biochemistry', 'Serum',       'Plain (Red)',     'U/L',   '44 - 147',    110, 60),
  ('NA',    'Sodium',                      'Electrolyte',  'Serum',       'Plain (Red)',     'mmol/L','135 - 145',   90,  30),
  ('K',     'Potassium',                   'Electrolyte',  'Serum',       'Plain (Red)',     'mmol/L','3.5 - 5.1',   90,  30),
  ('CL',    'Chloride',                    'Electrolyte',  'Serum',       'Plain (Red)',     'mmol/L','98 - 107',    90,  30),
  ('TSH',   'Thyroid Stim. Hormone',       'Immunoassay',  'Serum',       'Plain (Red)',     'uIU/mL','0.4 - 4.0',   350, 120),
  ('T3',    'Triiodothyronine (T3)',       'Immunoassay',  'Serum',       'Plain (Red)',     'ng/dL', '80 - 200',    300, 120),
  ('T4',    'Thyroxine (T4)',              'Immunoassay',  'Serum',       'Plain (Red)',     'ug/dL', '5.1 - 14.1',  300, 120),
  ('CRP',   'C-Reactive Protein',          'Immunoassay',  'Serum',       'Plain (Red)',     'mg/L',  '< 6',         250, 90),
  ('URINE', 'Urine Routine & Microscopy',  'Urinalysis',   'Urine',       'Sterile Cup',     '',      '',            120, 45)
ON DUPLICATE KEY UPDATE name=VALUES(name), department=VALUES(department), units=VALUES(units), reference_range=VALUES(reference_range);

-- ── Seed: profiles ─────────────────────────────────────────────────────────
INSERT INTO lab_test_profiles (profile_code, name, department, price) VALUES
  ('LFT',    'Liver Function Test',      'Biochemistry', 550),
  ('KFT',    'Kidney Function Test',     'Biochemistry', 550),
  ('LIPID',  'Lipid Profile',            'Biochemistry', 450),
  ('THYROID','Thyroid Profile (T3 T4 TSH)','Immunoassay', 800),
  ('LYTES',  'Electrolyte Panel',        'Electrolyte',  250)
ON DUPLICATE KEY UPDATE name=VALUES(name), department=VALUES(department), price=VALUES(price);

-- ── Seed: profile → test membership ────────────────────────────────────────
INSERT INTO lab_test_profile_items (id, profile_code, test_code) VALUES
  (UUID(),'LFT','BILT'),(UUID(),'LFT','SGPT'),(UUID(),'LFT','SGOT'),(UUID(),'LFT','ALP'),
  (UUID(),'KFT','UREA'),(UUID(),'KFT','CREAT'),(UUID(),'KFT','URIC'),(UUID(),'KFT','NA'),(UUID(),'KFT','K'),(UUID(),'KFT','CL'),
  (UUID(),'LIPID','CHOL'),(UUID(),'LIPID','TG'),(UUID(),'LIPID','HDL'),(UUID(),'LIPID','LDL'),
  (UUID(),'THYROID','T3'),(UUID(),'THYROID','T4'),(UUID(),'THYROID','TSH'),
  (UUID(),'LYTES','NA'),(UUID(),'LYTES','K'),(UUID(),'LYTES','CL')
ON DUPLICATE KEY UPDATE profile_code=VALUES(profile_code);
