-- ============================================================================
-- 013_exception_queue.sql
-- Exception / unmatched-result reconciliation queue. Run once, after 012.
--
-- When an analyzer result's barcode matches no open order, the ingestion route
-- (/api/lab/analyzer/results) HOLDS it in lab_analyzer_messages with
-- status 'unmatched' instead of guessing a patient. To let staff reconcile
-- those held results — assign them to the correct order, or dismiss them — we
-- need to keep the PARSED results (not just the raw message), plus a record of
-- who resolved each exception and when.
-- ============================================================================

-- tests_json  : normalised tests captured at receipt, so a held result can be
--               applied later WITHOUT re-parsing the raw analyzer message.
-- resolved_by / resolved_at : reconciliation audit (who assigned/dismissed, when).
ALTER TABLE lab_analyzer_messages
  ADD COLUMN tests_json  LONGTEXT     NULL AFTER raw,
  ADD COLUMN resolved_by VARCHAR(255) NULL AFTER tests_json,
  ADD COLUMN resolved_at DATETIME     NULL AFTER resolved_by;

-- The reconciliation queue lists rows by status ('unmatched' | 'applied' |
-- 'dismissed' | 'received'); index it so the queue view stays fast.
ALTER TABLE lab_analyzer_messages
  ADD INDEX idx_lam_status (status);
