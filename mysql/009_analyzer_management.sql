-- ============================================================================
-- 009_analyzer_management.sql
-- Analyzer Management dashboard. Run once, after 008:
--   mysql -u root -p rk_clinic < mysql/009_analyzer_management.sql
--
-- Extends analyzer_connections with management/telemetry columns and adds a
-- communication-log table. Control actions (reconnect/restart/disable/
-- maintenance) are queued in pending_command; the LIS Bridge picks them up in
-- the response to its existing status heartbeat (no new polling), then clears
-- it. Telemetry columns (temperature, reagent_level, qc_status, software_
-- version) are populated when the bridge/analyzer reports them.
-- ============================================================================

USE rk_clinic;

-- ── Management + telemetry columns on analyzer_connections ─────────────────
ALTER TABLE analyzer_connections
  ADD COLUMN manufacturer          VARCHAR(120)  AFTER name,
  ADD COLUMN connection_type       VARCHAR(40),
  ADD COLUMN software_version      VARCHAR(60),
  ADD COLUMN qc_status             VARCHAR(20)   DEFAULT 'Unknown',
  ADD COLUMN temperature           DECIMAL(6,2),
  ADD COLUMN reagent_level         VARCHAR(40),
  ADD COLUMN maintenance_mode      TINYINT(1)    NOT NULL DEFAULT 0,
  ADD COLUMN enabled               TINYINT(1)    NOT NULL DEFAULT 1,
  ADD COLUMN pending_command       VARCHAR(20),
  ADD COLUMN command_requested_by  VARCHAR(255),
  ADD COLUMN command_requested_at  DATETIME,
  ADD COLUMN last_command          VARCHAR(20),
  ADD COLUMN last_command_at       DATETIME;

-- ── Communication log (connection events, status, results, commands, errors) ─
CREATE TABLE IF NOT EXISTS analyzer_comm_logs (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  analyzer_id  VARCHAR(50)  NOT NULL,
  direction    VARCHAR(12)  NOT NULL DEFAULT 'inbound',   -- inbound | outbound | system
  event        VARCHAR(60)  NOT NULL,                     -- connected | disconnected | status | result | command | error | maintenance
  detail       TEXT,
  raw          TEXT,
  created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_acl_analyzer (analyzer_id, created_at)
);

-- ── Seed manufacturer / connection type / ports / software for the 11 units ──
-- connection_type + IP/serial mirror tools/lis-bridge/config.example.json.
UPDATE analyzer_connections SET manufacturer='Snibe Diagnostic',   connection_type='Serial (RS-232/USB)', com_port='/dev/tty.usbserial-MAGLUMI', software_version='n/a' WHERE id='maglumi800';
UPDATE analyzer_connections SET manufacturer='Agappe Diagnostics', connection_type='Ethernet (TCP)',      ip_address=':8081',                    software_version='n/a' WHERE id='mispaplus';
UPDATE analyzer_connections SET manufacturer='Genrui Biotech',     connection_type='Ethernet (TCP)',      ip_address=':8080',                    software_version='n/a' WHERE id='hemat60';
UPDATE analyzer_connections SET manufacturer='Unknown',            connection_type='Serial (RS-232/USB)', com_port='/dev/tty.usbserial-MBPLUS',  software_version='n/a' WHERE id='mbplus';
UPDATE analyzer_connections SET manufacturer='Unknown',            connection_type='Serial (RS-232/USB)', com_port='/dev/tty.usbserial-URIPLUS', software_version='n/a' WHERE id='uriplus300';
UPDATE analyzer_connections SET manufacturer='Unknown',            connection_type='Serial (USB)',        com_port='/dev/tty.usbmodem-RAPIDSTAR', software_version='n/a' WHERE id='rapidstar20';
UPDATE analyzer_connections SET manufacturer='Abbott',             connection_type='Ethernet (TCP)',      ip_address=':8085',                    software_version='n/a' WHERE id='afinion2';
UPDATE analyzer_connections SET manufacturer='Wondfo',             connection_type='Ethernet (TCP)',      ip_address=':8082',                    software_version='n/a' WHERE id='wondfo';
UPDATE analyzer_connections SET manufacturer='Wondfo',             connection_type='Ethernet (TCP)',      ip_address=':8083',                    software_version='n/a' WHERE id='finecare';
UPDATE analyzer_connections SET manufacturer='Weldon Biotech',     connection_type='Ethernet (TCP)',      ip_address=':8084',                    software_version='n/a' WHERE id='weldonwb150';
UPDATE analyzer_connections SET manufacturer='Unknown',            connection_type='Manual (no interface)', enabled=0,                           software_version='n/a' WHERE id='qualcyte10';
