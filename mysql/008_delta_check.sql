-- ============================================================================
-- 008_delta_check.sql
-- Delta Check validation. Run once, after 007:
--   mysql -u root -p rk_clinic < mysql/008_delta_check.sql
--
-- When a new result arrives it is compared with the patient's most recent
-- previous result for the same test. If the change exceeds the configured
-- threshold (absolute and/or percent, within an optional time window) the
-- result is flagged (lab_delta_flags) and requires manual verification.
-- Thresholds are configured per test from the Admin Panel (lab_delta_rules).
-- Flags are a QC audit record and are never deleted; rules are editable config.
-- ============================================================================

USE rk_clinic;

-- ── Per-test delta-check configuration (edited from the Admin Panel) ───────
CREATE TABLE IF NOT EXISTS lab_delta_rules (
  id                    CHAR(36)      NOT NULL PRIMARY KEY,
  test_code             VARCHAR(100)  NOT NULL,          -- canonical short token, e.g. 'POTASSIUM'
  test_name             VARCHAR(255)  NOT NULL,          -- display name
  aliases               VARCHAR(255),                    -- comma-separated match tokens
  delta_type            VARCHAR(12)   NOT NULL DEFAULT 'either',  -- 'absolute' | 'percent' | 'either'
  abs_threshold         DECIMAL(14,4),                   -- absolute change that triggers a flag
  pct_threshold         DECIMAL(8,2),                    -- percent change (%) that triggers a flag
  direction             VARCHAR(10)   NOT NULL DEFAULT 'either',  -- 'increase' | 'decrease' | 'either'
  max_hours             INT,                             -- only compare if prior result within N hours (NULL = no limit)
  unit                  VARCHAR(40),
  severity              VARCHAR(20)   NOT NULL DEFAULT 'Warning',  -- Warning | Critical
  message               TEXT,
  requires_verification TINYINT(1)    NOT NULL DEFAULT 1,
  enabled               TINYINT(1)    NOT NULL DEFAULT 1,
  created_by            VARCHAR(255),
  created_at            DATETIME      DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_drule_code (test_code),
  INDEX idx_drule_enabled (enabled)
);

-- ── Detected delta breaches (flags) + manual-verification review ───────────
-- No foreign keys: the engine is best-effort and must never fail on a loose
-- patient/task linkage. These rows are the QC audit trail.
CREATE TABLE IF NOT EXISTS lab_delta_flags (
  id                CHAR(36)      NOT NULL PRIMARY KEY,
  rule_id           CHAR(36),
  lab_task_id       VARCHAR(30),
  lab_order_id      VARCHAR(30),
  patient_id        VARCHAR(20),
  patient_name      VARCHAR(255),
  test_name         VARCHAR(255)  NOT NULL,
  current_value     VARCHAR(255),
  current_numeric   DECIMAL(14,4),
  previous_value    VARCHAR(255),
  previous_numeric  DECIMAL(14,4),
  previous_at       DATETIME,
  previous_task_id  VARCHAR(30),
  abs_delta         DECIMAL(14,4),
  pct_delta         DECIMAL(10,2),
  delta_type        VARCHAR(12),
  direction         VARCHAR(10),
  threshold_text    VARCHAR(160),                         -- human-readable rule, e.g. 'Δ > 1.5 mmol/L'
  unit              VARCHAR(40),
  machine_name      VARCHAR(100),
  severity          VARCHAR(20)   NOT NULL DEFAULT 'Warning',
  message           TEXT,
  status            VARCHAR(20)   NOT NULL DEFAULT 'Flagged',  -- Flagged | Reviewed | Dismissed
  reviewed_by       VARCHAR(255),
  reviewed_role     VARCHAR(40),
  reviewed_at       DATETIME,
  review_action     VARCHAR(20),                          -- accepted | rejected | dismissed
  review_note       TEXT,
  detected_at       DATETIME      DEFAULT CURRENT_TIMESTAMP,
  created_at        DATETIME      DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_dflag_status (status),
  INDEX idx_dflag_task (lab_task_id),
  INDEX idx_dflag_patient (patient_id)
);

-- ── Default delta rules (admins can edit / disable / extend from the UI) ────
INSERT INTO lab_delta_rules
  (id, test_code, test_name, aliases, delta_type, abs_threshold, pct_threshold, direction, max_hours, unit, severity, message, requires_verification, enabled, created_by)
VALUES
  (UUID(), 'POTASSIUM',  'Potassium',  'K,K+,Serum Potassium',       'absolute', 1.5000,  NULL,  'either', 168, 'mmol/L', 'Warning',  'Large potassium shift since previous result.', 1, 1, 'system'),
  (UUID(), 'SODIUM',     'Sodium',     'NA,Na+,Serum Sodium',        'absolute', 10.0000, NULL,  'either', 168, 'mmol/L', 'Warning',  'Large sodium shift since previous result.', 1, 1, 'system'),
  (UUID(), 'HEMOGLOBIN', 'Hemoglobin', 'HB,HGB',                     'absolute', 2.0000,  NULL,  'either', 168, 'g/dL',   'Warning',  'Hemoglobin changed markedly since previous result.', 1, 1, 'system'),
  (UUID(), 'GLUCOSE',    'Glucose',    'GLU,Blood Glucose,RBS,FBS',  'percent',  NULL,    50.00, 'either', 72,  'mg/dL',  'Warning',  'Glucose changed >50% since previous result.', 1, 1, 'system'),
  (UUID(), 'CREATININE', 'Creatinine', 'CREA,Serum Creatinine',      'percent',  NULL,    50.00, 'either', 168, 'mg/dL',  'Critical', 'Creatinine changed >50% — assess renal function.', 1, 1, 'system'),
  (UUID(), 'WBC',        'WBC',        'White Blood Cell,Leukocyte,TLC', 'percent', NULL, 50.00, 'either', 168, '/uL',    'Warning',  'WBC changed >50% since previous result.', 1, 1, 'system'),
  (UUID(), 'PLATELET',   'Platelets',  'PLT,Platelet Count',         'percent',  NULL,    50.00, 'either', 168, '/uL',    'Warning',  'Platelet count changed >50% since previous result.', 1, 1, 'system');
