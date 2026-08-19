-- ============================================================================
-- 019_platform_neutral_ports.sql
-- Clear the macOS-specific serial device paths from analyzer_connections.
--
--   mysql -u root -p rk_clinic < mysql/019_platform_neutral_ports.sql
--
-- Why
-- ---
-- Migrations 002 and 009 recorded the device paths of the development Mac —
-- /dev/tty.usbserial-MAGLUMI and similar. On a Windows host those names cannot
-- exist: serial devices there are COM3, COM7 and so on. A clinic database built
-- from these migrations therefore showed four analyzers with paths that look
-- authoritative and are impossible on the machine displaying them.
--
-- The value is display-only. Nothing opens a port from this column — the serial
-- bridges call resolvePort(), which enumerates the host's own serial devices and
-- filters them by USB vendor id, so they find a single adapter on either platform
-- without configuration. src/lib/analyzer-metrics.js is the only reader, and it
-- passes the value to Analyzer Management for display.
--
-- That is precisely why it is worth clearing rather than leaving: a wrong value
-- in the one place an engineer looks to answer "which port is this instrument
-- on?" costs more than an empty one. '-' is the convention already used by the
-- Ethernet analyzers in these tables.
--
-- Set a real value once a port is confirmed on the host, e.g.
--   UPDATE analyzer_connections SET com_port = 'COM3' WHERE id = 'maglumi800';
-- and pass the same port to the bridge in desktop/services.js when more than one
-- adapter is plugged in, since auto-discovery only decides when there is exactly
-- one candidate.
-- ============================================================================

USE rk_clinic;

UPDATE analyzer_connections
   SET com_port = '-'
 WHERE com_port LIKE '/dev/%';
