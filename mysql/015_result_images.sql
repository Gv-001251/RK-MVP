-- ============================================================================
-- 015_result_images.sql
-- Analyzer-generated images (cell-distribution histograms). Run once, after 014:
--   mysql -u root -p rk_clinic < mysql/015_result_images.sql
--
-- Why this exists
-- ---------------
-- The Hemat 60 sends three PNG histograms with every CBC — WBC, RBC and PLT,
-- 280x120 px each — as HL7 OBX segments with value type ED (encapsulated data),
-- base64 encoded. They are ~86% of the 21 KB message. Until now the bridge
-- recognised and discarded them, because there was nowhere for an image to go
-- and they must never be pushed into `tests` as if they were measurements.
--
-- A reviewer reading a differential wants the curve, not just the numbers: a
-- bimodal WBC distribution or a platelet clump is visible in the histogram and
-- invisible in the counts.
--
-- Design notes
-- ------------
-- * Bytes live in a MEDIUMBLOB in a table of their own. This codebase uses
--   `SELECT *` widely, so putting a blob on lab_task_tests or lab_orders would
--   drag several KB through every unrelated query. A dedicated table is only
--   ever read explicitly, by the endpoint that serves an image.
--
-- * Keyed on the analyzer message, with lab_task_id nullable. Images arrive
--   with the message whether or not its barcode matched an order, so the
--   automatic path and the Exception Queue reconcile path share one mechanism:
--   store against the message on arrival, set lab_task_id when it is matched.
--
-- * UNIQUE (message_id, code) makes re-delivery idempotent. The bridge spools
--   and retries, so the same message can legitimately arrive twice.
--
-- * markers_json holds the histogram discriminator positions the instrument
--   sends alongside (codes 15001-15113, names ending "line"). They are what a
--   viewer needs to redraw or annotate the curve rather than show a flat bitmap.
-- ============================================================================

USE rk_clinic;

CREATE TABLE IF NOT EXISTS lab_result_images (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  message_id   VARCHAR(191) NOT NULL,
  lab_task_id  VARCHAR(30),
  analyzer_id  VARCHAR(50)  NOT NULL,
  specimen_id  VARCHAR(100),
  code         VARCHAR(40)  NOT NULL,
  name         VARCHAR(120) NOT NULL,
  label        VARCHAR(40),
  mime_type    VARCHAR(60)  NOT NULL DEFAULT 'image/png',
  width        INT,
  height       INT,
  byte_size    INT,
  markers_json TEXT,
  content      MEDIUMBLOB   NOT NULL,
  created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_lri_message_code (message_id, code),
  INDEX idx_lri_task (lab_task_id),
  INDEX idx_lri_message (message_id)
);
