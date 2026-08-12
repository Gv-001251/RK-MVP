-- ============================================================================
-- 006_verification.sql
-- Laboratory result verification workflow. Run once, after 005:
--   mysql -u root -p rk_clinic < mysql/006_verification.sql
--
-- Result status flow (per order):
--   Pending → Technician Review → Senior Review → Released → Amended
--   (+ Rejected)
-- Nothing here is ever deleted — lab_verification_events is append-only and
-- provides the immutable history + audit trail (with electronic signatures).
-- ============================================================================

USE rk_clinic;

-- ── New roles for the verification hierarchy ───────────────────────────────
-- (chk_user_role was created in 001; replace it to add the two roles.)
ALTER TABLE user_profiles DROP CHECK chk_user_role;
ALTER TABLE user_profiles
  ADD CONSTRAINT chk_user_role
  CHECK (role IN ('admin','doctor','technician','nurse_pharmacy','receptionist','senior_technician','pathologist'));

-- ── Per-order verification record (current state + sign-offs) ──────────────
CREATE TABLE IF NOT EXISTS lab_verifications (
  id                 CHAR(36)     NOT NULL PRIMARY KEY,
  lab_order_id       VARCHAR(30)  NOT NULL,
  status             VARCHAR(30)  NOT NULL DEFAULT 'Pending',
  -- technician review
  reviewed_by        VARCHAR(255),
  reviewed_role      VARCHAR(40),
  reviewed_at        DATETIME,
  reviewed_signature VARCHAR(255),
  review_notes       TEXT,
  -- senior approval
  approved_by        VARCHAR(255),
  approved_role      VARCHAR(40),
  approved_at        DATETIME,
  approved_signature VARCHAR(255),
  approval_notes     TEXT,
  -- release
  released_by        VARCHAR(255),
  released_at        DATETIME,
  release_signature  VARCHAR(255),
  -- amendment (post-release)
  amended_by         VARCHAR(255),
  amended_at         DATETIME,
  amend_reason       TEXT,
  amend_signature    VARCHAR(255),
  amend_count        INT          DEFAULT 0,
  -- rejection
  rejected           TINYINT(1)   DEFAULT 0,
  rejected_by        VARCHAR(255),
  rejected_at        DATETIME,
  reject_reason      TEXT,
  created_at         DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_verif_order (lab_order_id),
  INDEX idx_verif_status (status),
  FOREIGN KEY (lab_order_id) REFERENCES lab_orders(id) ON DELETE CASCADE
);

-- ── Append-only verification history / audit trail (never deleted) ─────────
CREATE TABLE IF NOT EXISTS lab_verification_events (
  id             CHAR(36)     NOT NULL PRIMARY KEY,
  lab_order_id   VARCHAR(30)  NOT NULL,
  from_status    VARCHAR(30),
  to_status      VARCHAR(30)  NOT NULL,
  action         VARCHAR(40)  NOT NULL,
  actor          VARCHAR(255),
  role           VARCHAR(40),
  signature      VARCHAR(255),                 -- typed electronic signature
  signature_hash VARCHAR(64),                  -- tamper-evident hash
  notes          TEXT,
  created_at     DATETIME     DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_vevent_order (lab_order_id),
  FOREIGN KEY (lab_order_id) REFERENCES lab_orders(id) ON DELETE CASCADE
);
