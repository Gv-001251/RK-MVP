-- ============================================================================
-- 014_rack_scan.sql
-- Sample-holder ("rack") loading for analyzers that have no scan control of
-- their own. Run once, after 013:
--   mysql -u root -p rk_clinic < mysql/014_rack_scan.sql
--
-- Why this exists
-- ---------------
-- The Snibe Maglumi 800 has no scan button on the instrument. The workflow the
-- lab actually performs is:
--
--   1. operator presses "Scan" in the LIS            → a rack session opens
--   2. operator scans the holder key the supplier
--      printed on the sample holder                  → session bound to a rack
--   3. operator scans each tube barcode as it goes
--      into a numbered position                      → rack map recorded
--   4. the holder is placed in the analyzer, which
--      reads each tube barcode optically and asks
--      the LIS what is ordered (ASTM Q record)       → host-query answers
--
-- Step 3 is what answers "whose sample is in which slot". The analyzer's own
-- optical read remains the authoritative link for results; the rack map is the
-- LIS-side record of what the operator intended to load, so a tube that the
-- analyzer cannot read can still be traced to a patient.
--
-- Note on barcodes: one LIS barcode may legitimately appear on several tubes
-- (same accession, different tests), so barcode is deliberately NOT unique per
-- session. Only the physical position is unique.
-- ============================================================================

USE rk_clinic;

-- ── One rack-loading session ────────────────────────────────────────────────
-- status lifecycle: awaiting_key → loading → loaded → closed
--                   (cancelled from any pre-loaded state)
CREATE TABLE IF NOT EXISTS lab_rack_sessions (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  analyzer_id  VARCHAR(50)  NOT NULL,
  rack_key     VARCHAR(255),
  status       VARCHAR(20)  NOT NULL DEFAULT 'awaiting_key',
  opened_by    VARCHAR(255),
  opened_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
  keyed_at     DATETIME,
  loaded_at    DATETIME,
  closed_at    DATETIME,
  closed_by    VARCHAR(255),
  note         TEXT,
  created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_lrs_analyzer (analyzer_id, status),
  INDEX idx_lrs_rack (rack_key),
  INDEX idx_lrs_opened (opened_at)
);

-- ── Tubes scanned into the holder, one row per physical position ────────────
CREATE TABLE IF NOT EXISTS lab_rack_positions (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  session_id   CHAR(36)     NOT NULL,
  position_no  INT          NOT NULL,
  barcode      VARCHAR(255) NOT NULL,
  lab_order_id VARCHAR(30),
  specimen_id  VARCHAR(100),
  patient_name VARCHAR(255),
  test_codes   TEXT,
  matched      TINYINT(1)   NOT NULL DEFAULT 0,
  note         VARCHAR(255),
  scanned_by   VARCHAR(255),
  scanned_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_lrp_session_position (session_id, position_no),
  INDEX idx_lrp_session (session_id),
  INDEX idx_lrp_order (lab_order_id),
  INDEX idx_lrp_barcode (barcode),
  CONSTRAINT fk_lrp_session FOREIGN KEY (session_id)
    REFERENCES lab_rack_sessions(id) ON DELETE CASCADE
);

-- ── Which analyzers are loaded by holder, and how many positions ───────────
-- 0 means the instrument is not rack-loaded, so the LIS hides the Scan control
-- for it. This is a column rather than hard-coded so adding an instrument, or
-- correcting a capacity, stays a data change.
--
-- 40 is the Maglumi 600/800 sample-loader capacity per the Snibe M800
-- specification sheet. It is used only as an upper bound on position numbers —
-- the operator scans however many tubes they actually load, and a part-filled
-- holder is normal. Adjust with:
--   UPDATE analyzer_connections SET rack_positions = <n> WHERE id='maglumi800';
ALTER TABLE analyzer_connections
  ADD COLUMN rack_positions INT NOT NULL DEFAULT 0;

UPDATE analyzer_connections SET rack_positions = 40 WHERE id = 'maglumi800';
