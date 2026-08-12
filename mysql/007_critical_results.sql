-- ============================================================================
-- 007_critical_results.sql
-- Critical Result Detection. Run once, after 006:
--   mysql -u root -p rk_clinic < mysql/007_critical_results.sql
--
-- Configurable thresholds (lab_critical_rules) are evaluated whenever results
-- arrive (analyzer ingestion or manual entry). A breach creates an alert
-- (lab_critical_alerts) that must be confirmed by a technician, and every
-- notification/confirmation is logged append-only (lab_critical_notifications).
-- Alerts are clinical safety records and are never deleted; rules are config
-- and may be edited or removed from the Admin Panel.
-- ============================================================================

USE rk_clinic;

-- ── Configurable critical-value rules (edited from the Admin Panel) ────────
CREATE TABLE IF NOT EXISTS lab_critical_rules (
  id                    CHAR(36)      NOT NULL PRIMARY KEY,
  test_code             VARCHAR(100)  NOT NULL,          -- canonical short token, e.g. 'POTASSIUM'
  test_name             VARCHAR(255)  NOT NULL,          -- display name, e.g. 'Potassium'
  aliases               VARCHAR(255),                    -- comma-separated match tokens, e.g. 'K,K+,Serum Potassium'
  operator              VARCHAR(10)   NOT NULL,          -- '>', '>=', '<', '<=', '=', 'positive'
  threshold_value       DECIMAL(14,4),                   -- numeric threshold (NULL for qualitative rules)
  qualitative_match     VARCHAR(100),                    -- text to match for 'positive'/qualitative, e.g. 'Positive'
  unit                  VARCHAR(40),
  severity              VARCHAR(20)   NOT NULL DEFAULT 'Critical',   -- Critical | High
  message               TEXT,                            -- optional custom clinical note
  requires_confirmation TINYINT(1)    NOT NULL DEFAULT 1, -- require technician confirmation
  enabled               TINYINT(1)    NOT NULL DEFAULT 1,
  created_by            VARCHAR(255),
  created_at            DATETIME      DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_crule_code (test_code),
  INDEX idx_crule_enabled (enabled)
);

-- ── Detected critical results (alert instances) + acknowledgement ──────────
-- No foreign keys: detection is best-effort and must never fail because of a
-- loose patient/task linkage. These rows are the clinical audit trail.
CREATE TABLE IF NOT EXISTS lab_critical_alerts (
  id                CHAR(36)      NOT NULL PRIMARY KEY,
  rule_id           CHAR(36),
  lab_task_id       VARCHAR(30),
  lab_order_id      VARCHAR(30),
  patient_id        VARCHAR(20),
  patient_name      VARCHAR(255),
  test_name         VARCHAR(255)  NOT NULL,
  result_value      VARCHAR(255),                        -- raw value as stored, e.g. '7.2 mmol/L'
  numeric_value     DECIMAL(14,4),                       -- parsed leading number (NULL if qualitative)
  operator          VARCHAR(10),
  threshold_text    VARCHAR(120),                        -- human-readable, e.g. '> 6.5 mmol/L'
  unit              VARCHAR(40),
  machine_name      VARCHAR(100),
  severity          VARCHAR(20)   NOT NULL DEFAULT 'Critical',
  message           TEXT,
  flag              VARCHAR(20),                          -- analyzer-supplied flag if any (H/L/HH/LL/*)
  status            VARCHAR(20)   NOT NULL DEFAULT 'Active',  -- Active | Acknowledged
  acknowledged      TINYINT(1)    NOT NULL DEFAULT 0,
  acknowledged_by   VARCHAR(255),
  acknowledged_role VARCHAR(40),
  acknowledged_at   DATETIME,
  ack_note          TEXT,
  detected_at       DATETIME      DEFAULT CURRENT_TIMESTAMP,
  created_at        DATETIME      DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_calert_status (status),
  INDEX idx_calert_task (lab_task_id),
  INDEX idx_calert_ack (acknowledged),
  INDEX idx_calert_patient (patient_id)
);

-- ── Append-only notification log (created / acknowledged / re-fired) ────────
CREATE TABLE IF NOT EXISTS lab_critical_notifications (
  id          CHAR(36)      NOT NULL PRIMARY KEY,
  alert_id    CHAR(36)      NOT NULL,
  event       VARCHAR(40)   NOT NULL,                     -- 'created' | 'acknowledged' | 'refired'
  channel     VARCHAR(40)   NOT NULL DEFAULT 'in-app',
  actor       VARCHAR(255),
  role        VARCHAR(40),
  detail      TEXT,
  created_at  DATETIME      DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cnotif_alert (alert_id),
  INDEX idx_cnotif_event (event)
);

-- ── Default rule set (the requested examples + common life-threatening values)
-- Admins can edit/disable/extend all of these from the Critical Values screen.
INSERT INTO lab_critical_rules
  (id, test_code, test_name, aliases, operator, threshold_value, qualitative_match, unit, severity, message, requires_confirmation, enabled, created_by)
VALUES
  (UUID(), 'POTASSIUM', 'Potassium', 'K,K+,Serum Potassium', '>',  6.5000, NULL, 'mmol/L', 'Critical', 'Critical hyperkalemia — risk of cardiac arrhythmia.', 1, 1, 'system'),
  (UUID(), 'POTASSIUM', 'Potassium', 'K,K+,Serum Potassium', '<',  2.5000, NULL, 'mmol/L', 'Critical', 'Critical hypokalemia.', 1, 1, 'system'),
  (UUID(), 'SODIUM',    'Sodium',    'NA,Na+,Serum Sodium',  '<',  120.0000, NULL, 'mmol/L', 'Critical', 'Critical hyponatremia.', 1, 1, 'system'),
  (UUID(), 'SODIUM',    'Sodium',    'NA,Na+,Serum Sodium',  '>',  160.0000, NULL, 'mmol/L', 'Critical', 'Critical hypernatremia.', 1, 1, 'system'),
  (UUID(), 'HEMOGLOBIN','Hemoglobin','HB,HGB',               '<',  5.0000, NULL, 'g/dL', 'Critical', 'Critical anemia — assess for transfusion.', 1, 1, 'system'),
  (UUID(), 'PLATELET',  'Platelets', 'PLT,Platelet Count',   '<',  20000.0000, NULL, '/uL', 'Critical', 'Critical thrombocytopenia — bleeding risk.', 1, 1, 'system'),
  (UUID(), 'GLUCOSE',   'Glucose',   'GLU,Blood Glucose,RBS,FBS', '<', 40.0000, NULL, 'mg/dL', 'Critical', 'Critical hypoglycemia.', 1, 1, 'system'),
  (UUID(), 'GLUCOSE',   'Glucose',   'GLU,Blood Glucose,RBS,FBS', '>', 500.0000, NULL, 'mg/dL', 'Critical', 'Critical hyperglycemia.', 1, 1, 'system'),
  (UUID(), 'WBC',       'WBC',       'White Blood Cell,Leukocyte,TLC', '>', 50000.0000, NULL, '/uL', 'High', 'Marked leukocytosis.', 1, 1, 'system'),
  (UUID(), 'CALCIUM',   'Calcium',   'CA,Serum Calcium',     '>',  14.0000, NULL, 'mg/dL', 'Critical', 'Critical hypercalcemia.', 1, 1, 'system'),
  (UUID(), 'TROPONIN',  'Troponin',  'TROP,Troponin I,Troponin T,cTnI', 'positive', NULL, 'Positive', NULL, 'Critical', 'Positive troponin — possible acute myocardial infarction.', 1, 1, 'system');
