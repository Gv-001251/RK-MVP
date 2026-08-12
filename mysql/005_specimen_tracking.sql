-- ============================================================================
-- 005_specimen_tracking.sql
-- Specimen Tracking: make lab_sample_events the single canonical timeline for a
-- specimen's whole journey by adding a `machine` column. Run once, after 004:
--   mysql -u root -p rk_clinic < mysql/005_specimen_tracking.sql
--
-- Canonical lifecycle recorded here (per specimen / lab_order):
--   Ordered → Barcode Printed → Collected → Received → Assigned to Analyzer →
--   Running → Analyzer Completed → Pending Verification → Verified → Released
-- Each row carries: created_at (timestamp), actor (user), machine, action, note.
-- ============================================================================

USE rk_clinic;

ALTER TABLE lab_sample_events
  ADD COLUMN machine VARCHAR(100) NULL AFTER actor;
