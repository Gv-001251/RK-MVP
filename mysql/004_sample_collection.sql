-- ============================================================================
-- 004_sample_collection.sql
-- Sample Collection module: the per-order specimen record + its status
-- timeline. Run once, after 001 → 002 → 003:
--   mysql -u root -p rk_clinic < mysql/004_sample_collection.sql
--
-- Sample lifecycle: Ordered → Collected → Received → Processing → Completed
--                   (or → Rejected at any pre-completion step)
-- Sample rows are created on demand by the collection API (orders without a
-- row are treated as 'Ordered'), so no backfill is required.
-- ============================================================================

USE rk_clinic;

CREATE TABLE IF NOT EXISTS lab_samples (
  id                  CHAR(36)     NOT NULL PRIMARY KEY,
  lab_order_id        VARCHAR(30)  NOT NULL,
  sample_id           VARCHAR(30),                       -- SMP-YYYY-######
  accession_number    VARCHAR(30),
  barcode_value       VARCHAR(60),
  status              VARCHAR(30)  NOT NULL DEFAULT 'Ordered',
  -- collection details
  collector           VARCHAR(255),
  collection_date     DATE,
  collection_time     VARCHAR(20),                       -- HH:MM as entered
  collected_at        DATETIME,                          -- server timestamp
  sample_type         VARCHAR(100),
  tube_type           VARCHAR(100),
  collection_location VARCHAR(150),
  sample_volume       VARCHAR(50),
  remarks             TEXT,
  -- lab handling
  received_by         VARCHAR(255),
  received_at         DATETIME,
  processing_at       DATETIME,
  completed_at        DATETIME,
  -- rejection
  rejected            TINYINT(1)   DEFAULT 0,
  rejection_reason    VARCHAR(100),
  rejected_by         VARCHAR(255),
  rejected_at         DATETIME,
  created_at          DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sample_order (lab_order_id),
  INDEX idx_sample_status (status),
  FOREIGN KEY (lab_order_id) REFERENCES lab_orders(id) ON DELETE CASCADE
);

-- Status transition timeline (one row per transition; drives the UI timeline).
CREATE TABLE IF NOT EXISTS lab_sample_events (
  id            CHAR(36)     NOT NULL PRIMARY KEY,
  lab_order_id  VARCHAR(30)  NOT NULL,
  sample_id     VARCHAR(30),
  from_status   VARCHAR(30),
  to_status     VARCHAR(30)  NOT NULL,
  action        VARCHAR(40),
  actor         VARCHAR(255),
  note          TEXT,
  created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sevent_order (lab_order_id),
  FOREIGN KEY (lab_order_id) REFERENCES lab_orders(id) ON DELETE CASCADE
);
