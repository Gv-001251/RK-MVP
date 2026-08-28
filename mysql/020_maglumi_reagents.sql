-- ============================================================================
-- 020_maglumi_reagents.sql
-- Maglumi 800 reagent tracking (RFID data from on-board reader)
-- Run once:
--   mysql -u root -p rk_clinic < mysql/020_maglumi_reagents.sql
--
-- The Maglumi 800 uses RFID tags on each reagent integral. When loaded, the
-- on-board reader captures: test type, lot number, expiry date, remaining
-- test count, and a 10-point master curve. This table stores that state so
-- the LIS control panel can display reagent inventory without polling the
-- instrument.
-- ============================================================================

USE rk_clinic;

CREATE TABLE IF NOT EXISTS maglumi_reagents (
  id              CHAR(36)      NOT NULL PRIMARY KEY,
  analyzer_id     VARCHAR(50)   NOT NULL DEFAULT 'maglumi800',
  slot_position   TINYINT       NOT NULL,         -- 1-9
  is_loaded       TINYINT(1)    NOT NULL DEFAULT 1,
  test_name       VARCHAR(120)  NOT NULL,         -- e.g. 'TSH', 'HCG', 'Ferritin'
  test_code       VARCHAR(40),                    -- ASTM test code
  lot_number      VARCHAR(60),                    -- from RFID tag
  expiry_date     DATE,                           -- from RFID tag
  total_tests     INT,                            -- total tests per integral
  remaining_tests INT,                            -- decremented as tests run
  calibration_status VARCHAR(20) DEFAULT 'valid', -- valid | expired | pending
  last_calibrated_at DATETIME,
  master_curve    JSON,                           -- 10-point curve from RFID
  loaded_at       DATETIME      DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_mr_analyzer_slot (analyzer_id, slot_position),
  INDEX idx_mr_test (test_name)
);

-- Seed with common Maglumi 800 immunoassay tests (positions match typical lab setup)
INSERT INTO maglumi_reagents (id, analyzer_id, slot_position, test_name, test_code, lot_number, expiry_date, total_tests, remaining_tests, calibration_status) VALUES
  (UUID(), 'maglumi800', 1, 'TSH',       'TSH',    'M2024-A1', '2027-03-15', 100, 87, 'valid'),
  (UUID(), 'maglumi800', 2, 'FT4',       'FT4',    'M2024-A2', '2027-02-20', 100, 72, 'valid'),
  (UUID(), 'maglumi800', 3, 'FT3',       'FT3',    'M2024-A3', '2027-04-10', 100, 95, 'valid'),
  (UUID(), 'maglumi800', 4, 'Ferritin',  'FERR',   'M2024-B1', '2026-12-01', 50,  34, 'valid'),
  (UUID(), 'maglumi800', 5, 'Vitamin D', '25OHD',  'M2024-C1', '2027-01-30', 50,  41, 'valid'),
  (UUID(), 'maglumi800', 6, 'HCG',       'HCG',    'M2024-D1', '2027-05-15', 100, 98, 'valid'),
  (UUID(), 'maglumi800', 7, 'PSA',       'TPSA',   'M2024-E1', '2026-11-20', 50,  22, 'valid'),
  (UUID(), 'maglumi800', 8, 'Cortisol',  'CORT',   'M2024-F1', '2027-06-01', 100, 100,'valid'),
  (UUID(), 'maglumi800', 9, 'Insulin',   'INS',    'M2024-G1', '2027-03-28', 50,  45, 'valid')
ON DUPLICATE KEY UPDATE test_name = VALUES(test_name);
