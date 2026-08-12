-- ============================================================================
-- 010_quality_control.sql
-- Laboratory Quality Control (Westgard + Levey-Jennings). Run after 009:
--   mysql -u root -p rk_clinic < mysql/010_quality_control.sql
--
-- QC materials (control lots) carry per-analyte target mean/SD. Each QC run is
-- a batch of results measured on an analyzer by an operator; every result is
-- scored (z = (value-mean)/SD) and evaluated against the Westgard multirule
-- (1-2s warning; 1-3s / 2-2s / R-4s / 4-1s / 10x reject). A batch that trips a
-- reject rule marks the analyzer's QC as failed, which blocks patient result
-- verification until QC passes or a supervisor overrides it.
-- ============================================================================

USE rk_clinic;

-- ── QC control materials (a lot at a control level, used on an analyzer) ────
CREATE TABLE IF NOT EXISTS qc_materials (
  id             CHAR(36)     NOT NULL PRIMARY KEY,
  name           VARCHAR(160) NOT NULL,
  lot_number     VARCHAR(80)  NOT NULL,
  control_level  VARCHAR(40)  NOT NULL,          -- 'Level 1' | 'Level 2' | 'Level 3'
  analyzer_id    VARCHAR(50),
  manufacturer   VARCHAR(120),
  expiry_date    DATE,
  active         TINYINT(1)   NOT NULL DEFAULT 1,
  created_by     VARCHAR(255),
  created_at     DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_qcmat_analyzer (analyzer_id),
  INDEX idx_qcmat_active (active)
);

-- ── Per-analyte target statistics for a material ───────────────────────────
CREATE TABLE IF NOT EXISTS qc_analyte_targets (
  id            CHAR(36)      NOT NULL PRIMARY KEY,
  material_id   CHAR(36)      NOT NULL,
  test_code     VARCHAR(100)  NOT NULL,
  test_name     VARCHAR(160)  NOT NULL,
  unit          VARCHAR(40),
  target_mean   DECIMAL(14,4) NOT NULL,
  target_sd     DECIMAL(14,4) NOT NULL,
  created_at    DATETIME      DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_qctarget (material_id, test_code),
  INDEX idx_qctarget_material (material_id)
);

-- ── A QC run/batch (a daily QC session on an analyzer) ─────────────────────
CREATE TABLE IF NOT EXISTS qc_batches (
  id             CHAR(36)     NOT NULL PRIMARY KEY,
  batch_no       VARCHAR(40),
  analyzer_id    VARCHAR(50),
  operator       VARCHAR(255),
  status         VARCHAR(20)  NOT NULL DEFAULT 'Pending',  -- Pass | Warning | Rejected | Pending | Overridden
  notes          TEXT,
  overridden_by  VARCHAR(255),
  override_reason TEXT,
  overridden_at  DATETIME,
  created_by     VARCHAR(255),
  run_at         DATETIME     DEFAULT CURRENT_TIMESTAMP,
  created_at     DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_qcbatch_analyzer (analyzer_id, run_at),
  INDEX idx_qcbatch_status (status)
);

-- ── Individual QC results (one analyte x level measurement) ────────────────
CREATE TABLE IF NOT EXISTS qc_results (
  id             CHAR(36)      NOT NULL PRIMARY KEY,
  batch_id       CHAR(36)      NOT NULL,
  material_id    CHAR(36),
  analyzer_id    VARCHAR(50),
  test_code      VARCHAR(100)  NOT NULL,
  test_name      VARCHAR(160),
  control_level  VARCHAR(40),
  lot_number     VARCHAR(80),
  operator       VARCHAR(255),
  value          DECIMAL(14,4) NOT NULL,
  target_mean    DECIMAL(14,4),
  target_sd      DECIMAL(14,4),
  z_score        DECIMAL(10,4),
  side           VARCHAR(6),                       -- above | below | on
  status         VARCHAR(20)   NOT NULL DEFAULT 'Pass',  -- Pass | Warning | Reject
  flags          VARCHAR(120),                     -- CSV of violated Westgard rule codes
  run_at         DATETIME      DEFAULT CURRENT_TIMESTAMP,
  created_at     DATETIME      DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_qcres_series (analyzer_id, test_code, control_level, run_at),
  INDEX idx_qcres_batch (batch_id),
  INDEX idx_qcres_status (status)
);

-- ── Seed a couple of control materials + analyte targets (demo/starter) ─────
-- Level 1 (normal) and Level 2 (abnormal) for the Mispa Plus biochemistry unit.
INSERT INTO qc_materials (id, name, lot_number, control_level, analyzer_id, manufacturer, expiry_date, active, created_by) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Biochem Control L1', 'LOTBC1-2026', 'Level 1', 'mispaplus', 'Bio-Rad', '2026-12-31', 1, 'system'),
  ('22222222-2222-2222-2222-222222222222', 'Biochem Control L2', 'LOTBC2-2026', 'Level 2', 'mispaplus', 'Bio-Rad', '2026-12-31', 1, 'system'),
  ('33333333-3333-3333-3333-333333333333', 'Hematology Control N', 'LOTHN-2026', 'Level 1', 'hemat60',  'Genrui',  '2026-10-31', 1, 'system');

INSERT INTO qc_analyte_targets (id, material_id, test_code, test_name, unit, target_mean, target_sd) VALUES
  (UUID(), '11111111-1111-1111-1111-111111111111', 'GLUCOSE',   'Glucose',   'mg/dL',  95.0000, 4.0000),
  (UUID(), '11111111-1111-1111-1111-111111111111', 'POTASSIUM', 'Potassium', 'mmol/L',  4.0000, 0.2000),
  (UUID(), '22222222-2222-2222-2222-222222222222', 'GLUCOSE',   'Glucose',   'mg/dL', 290.0000, 9.0000),
  (UUID(), '22222222-2222-2222-2222-222222222222', 'POTASSIUM', 'Potassium', 'mmol/L',  6.2000, 0.3000),
  (UUID(), '33333333-3333-3333-3333-333333333333', 'HEMOGLOBIN','Hemoglobin','g/dL',   12.5000, 0.4000),
  (UUID(), '33333333-3333-3333-3333-333333333333', 'WBC',       'WBC',       '10^3/uL', 7.5000, 0.5000);
