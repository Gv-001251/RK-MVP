-- ============================================================================
-- 011_inventory.sql
-- Laboratory Inventory. Run once, after 010:
--   mysql -u root -p rk_clinic < mysql/011_inventory.sql
--
-- Extends the existing lab_inventory item master (stock_qty = current stock,
-- low_stock_threshold = minimum stock, location = storage location,
-- batch_number = lot number, expiry_date) with a vendor, an auto-consumption
-- rate, and a full stock-movement ledger (Stock In / Out / Adjust / auto
-- Consume). Expiry + low-stock alerts are derived on read.
-- ============================================================================

USE rk_clinic;

-- ── New columns on the item master ─────────────────────────────────────────
ALTER TABLE lab_inventory
  ADD COLUMN vendor           VARCHAR(160)  AFTER supplier_id,
  ADD COLUMN consume_per_test DECIMAL(10,3) NOT NULL DEFAULT 0 AFTER cost_per_unit,
  ADD COLUMN last_movement_at DATETIME;

-- ── Stock-movement ledger (every in/out/consume/adjust is recorded) ────────
CREATE TABLE IF NOT EXISTS lab_inventory_txns (
  id            CHAR(36)      NOT NULL PRIMARY KEY,
  item_id       CHAR(36)      NOT NULL,
  type          VARCHAR(12)   NOT NULL,          -- in | out | consume | adjust
  change_qty    DECIMAL(12,3) NOT NULL,          -- signed: +in, -out/-consume, +/- adjust
  balance_after DECIMAL(12,3),                   -- resulting stock level
  reason        VARCHAR(255),
  lot_number    VARCHAR(100),
  reference     VARCHAR(120),                     -- analyzer id / order / QC batch, etc.
  performed_by  VARCHAR(255),
  created_at    DATETIME      DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_invtxn_item (item_id, created_at),
  INDEX idx_invtxn_type (type, created_at)
);

-- ── Seed a starter catalog across all five categories ──────────────────────
-- Analyzer-linked reagents/kits carry consume_per_test so patient testing
-- automatically draws down stock.
INSERT INTO lab_inventory
  (id, name, category, unit, stock_qty, low_stock_threshold, expiry_date, batch_number, vendor, cost_per_unit, consume_per_test, analyzer_id, location, notes)
VALUES
  (UUID(), 'Mispa Glucose Reagent',   'Reagent',     'tests', 800, 150, '2026-09-30', 'RGT-GLU-88', 'Agappe Diagnostics', 0.35, 1, 'mispaplus', 'Reagent Fridge A (2-8°C)', 'Biochemistry glucose reagent'),
  (UUID(), 'Maglumi TSH Kit',         'Kit',         'tests', 300,  60, '2026-07-31', 'KIT-TSH-21', 'Snibe Diagnostic',   1.80, 1, 'maglumi800', 'Immunoassay Fridge (2-8°C)', 'CLIA TSH assay kit'),
  (UUID(), 'Biochem Control L1',      'Control',     'vials',  24,   6, '2026-12-31', 'LOTBC1-2026','Bio-Rad',            9.50, 0, 'mispaplus', 'QC Fridge', 'Normal-level QC material'),
  (UUID(), 'Chemistry Calibrator',    'Calibrator',  'vials',  12,   4, '2026-08-31', 'CAL-CHEM-7', 'Bio-Rad',           14.00, 0, 'mispaplus', 'QC Fridge', 'Multi-analyte calibrator'),
  (UUID(), 'Sample Cups 2mL',         'Consumable',  'pcs',  5000, 1000, NULL,        'CUP-2ML',    'LabWare Co.',        0.02, 0, NULL,        'Store Room B', 'Disposable sample cups'),
  (UUID(), 'Hemat 60 Diluent',        'Reagent',     'tests', 120,  40, '2026-06-30', 'DIL-H60-3',  'Genrui Biotech',     0.20, 1, 'hemat60',   'Hematology Bench', 'Hematology diluent');
