-- ============================================================================
-- 002_lis_hardening.sql
-- Migrates LIS clinical timestamps from display-string VARCHAR(50) to proper
-- UTC DATETIME, and adds the workflow timestamp columns that were missing on
-- lab_tasks (registered_at / analyzer_started_at / qc_started_at).
--
-- IMPORTANT: legacy timestamp values were stored as locale display strings
-- (e.g. '18/07/2026 10:30 AM') which are NOT convertible to DATETIME. They are
-- cleared before the type change so the ALTER does not fail under STRICT mode.
-- Run once against an existing rk_clinic database:
--   mysql -u root -p rk_clinic < mysql/002_lis_hardening.sql
-- (Fresh installs from 001_mysql_schema.sql already have the correct types.)
-- ============================================================================

USE rk_clinic;

-- ── lab_tasks: add missing workflow columns ────────────────────────────────
-- These are written by the workflow engine but were absent from the schema.
-- (Remove any that already exist in your DB before running.)
ALTER TABLE lab_tasks
  ADD COLUMN registered_at       DATETIME NULL AFTER remarks,
  ADD COLUMN analyzer_started_at DATETIME NULL AFTER registered_at,
  ADD COLUMN qc_started_at       DATETIME NULL AFTER analyzer_started_at;

-- ── lab_tasks: convert existing timestamp columns ──────────────────────────
UPDATE lab_tasks SET verified_at = NULL, report_generated_at = NULL, report_delivered_at = NULL;
ALTER TABLE lab_tasks
  MODIFY verified_at         DATETIME NULL,
  MODIFY report_generated_at DATETIME NULL,
  MODIFY report_delivered_at DATETIME NULL;

-- ── lab_orders: convert timestamp columns ──────────────────────────────────
UPDATE lab_orders SET
  collection_time     = NULL,
  registered_at       = NULL,
  analyzer_started_at = NULL,
  qc_started_at       = NULL,
  report_generated_at = NULL,
  report_delivered_at = NULL,
  order_time          = NULL;
ALTER TABLE lab_orders
  MODIFY collection_time     DATETIME NULL,
  MODIFY registered_at       DATETIME NULL,
  MODIFY analyzer_started_at DATETIME NULL,
  MODIFY qc_started_at       DATETIME NULL,
  MODIFY report_generated_at DATETIME NULL,
  MODIFY report_delivered_at DATETIME NULL,
  MODIFY order_time          DATETIME NULL;

-- ── lab_task_tests: per-result completion time ─────────────────────────────
UPDATE lab_task_tests SET completed_at = NULL;
ALTER TABLE lab_task_tests MODIFY completed_at DATETIME NULL;

-- ── lab_alerts: acknowledgement time ───────────────────────────────────────
UPDATE lab_alerts SET acknowledged_at = NULL;
ALTER TABLE lab_alerts MODIFY acknowledged_at DATETIME NULL;

-- ── Analyzer result ingestion log (new table) ──────────────────────────────
-- Used by /api/lab/analyzer/results for idempotency, raw-message audit, and
-- the unmatched-results holding queue.
CREATE TABLE IF NOT EXISTS lab_analyzer_messages (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  analyzer_id  VARCHAR(50),
  message_id   VARCHAR(191) UNIQUE,
  specimen_id  VARCHAR(100),
  lab_task_id  VARCHAR(30),
  matched      TINYINT(1)   DEFAULT 0,
  tests_count  INT          DEFAULT 0,
  status       VARCHAR(30)  DEFAULT 'received',
  note         TEXT,
  raw          MEDIUMTEXT,
  created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_lam_specimen (specimen_id),
  INDEX idx_lam_matched (matched)
);

-- ── Refresh the analyzer roster to the 11 real machines ────────────────────
-- Remove the old placeholder analyzers, then add the real ones (status is left
-- untouched on rows that already exist, so a live machine isn't reset).
DELETE FROM analyzer_connections WHERE id IN ('maglumi','weldon','hematology','urine','electrolyte','rapid');
INSERT INTO analyzer_connections (id, name, department, protocol, port, ip_address, com_port, baud_rate, status, health_score) VALUES
  ('maglumi800',  'Snibe Maglumi 800',        'Immunoassay (CLIA)', 'RS-232 Serial', 'COM / 9600',   '-', '-', 9600, 'Offline', 0),
  ('mispaplus',   'Mispa Plus',               'Biochemistry',       'Ethernet',      'TCP :8081',    '-', '-', 0,    'Offline', 0),
  ('hemat60',     'Hemat 60',                 'Hematology',         'Ethernet',      'TCP :8080',    '-', '-', 0,    'Offline', 0),
  ('mbplus',      'MB+ Electrolyte Analyzer', 'Electrolyte',        'USB Serial',    'USB-serial',   '-', '-', 9600, 'Offline', 0),
  ('uriplus300',  'Uriplus 300',              'Urinalysis',         'RS-232 Serial', 'COM / 9600',   '-', '-', 9600, 'Offline', 0),
  ('rapidstar20', 'Rapid Star 20',            'POCT',               'USB Serial',    'USB-serial',   '-', '-', 9600, 'Offline', 0),
  ('afinion2',    'Afinion 2 (Abbott)',       'Diabetes / POCT',    'Ethernet',      'TCP :8085',    '-', '-', 0,    'Offline', 0),
  ('wondfo',      'Wondfo Rapid',             'POCT',               'Ethernet',      'TCP :8082',    '-', '-', 0,    'Offline', 0),
  ('finecare',    'Finecare',                 'POCT',               'Ethernet',      'TCP :8083',    '-', '-', 0,    'Offline', 0),
  ('weldonwb150', 'Weldon WB-150',            'Biochemistry',       'Ethernet',      'TCP :8084',    '-', '-', 0,    'Offline', 0),
  ('qualcyte10',  'Qualcyte 10',              'Manual entry',       'None (printer)','-',            '-', '-', 0,    'manual',  0)
ON DUPLICATE KEY UPDATE name=VALUES(name), department=VALUES(department), protocol=VALUES(protocol), port=VALUES(port);
