-- ============================================================================
-- 012_reports.sql
-- Professional laboratory reports (history + QR verification). Run after 011:
--   mysql -u root -p rk_clinic < mysql/012_reports.sql
--
-- Each generated report gets a report number and a verification_token; the
-- report's QR code encodes a link to /verify/<token>, which confirms the
-- report's authenticity without exposing patient identity. Report history is
-- the list of these rows.
-- ============================================================================

USE rk_clinic;

CREATE TABLE IF NOT EXISTS lab_reports (
  id                  CHAR(36)     NOT NULL PRIMARY KEY,
  report_no           VARCHAR(40)  NOT NULL,
  lab_order_id        VARCHAR(30)  NOT NULL,
  patient_id          VARCHAR(20),
  patient_name        VARCHAR(255),
  doctor_name         VARCHAR(255),
  accession_number    VARCHAR(50),
  verification_token  CHAR(36)     NOT NULL,
  status              VARCHAR(30),                 -- verification status at generation (Released/Amended/etc.)
  test_count          INT          DEFAULT 0,
  abnormal_count      INT          DEFAULT 0,
  critical_count      INT          DEFAULT 0,
  generated_by        VARCHAR(255),
  generated_at        DATETIME     DEFAULT CURRENT_TIMESTAMP,
  emailed_to          VARCHAR(255),
  emailed_at          DATETIME,
  email_count         INT          DEFAULT 0,
  created_at          DATETIME     DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_report_no (report_no),
  UNIQUE KEY uq_report_token (verification_token),
  INDEX idx_report_order (lab_order_id, generated_at),
  INDEX idx_report_patient (patient_id)
);
