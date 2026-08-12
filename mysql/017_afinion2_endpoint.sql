-- ============================================================================
-- 017_afinion2_endpoint.sql
-- Correct the Afinion 2 network endpoint. Run once, after 016:
--   mysql -u root -p rk_clinic < mysql/017_afinion2_endpoint.sql
--
-- Migration 009 recorded ':8085', copied from an unverified guess in
-- tools/lis-bridge/config.example.json.
--
-- Verified on the bench 2026-08-07:
--   * static IP 192.168.1.5/24, gateway blank, hostname AF20095065
--   * MAC 8c:1f:64:cf:cb:4f, pings clean at ~0.9 ms
--   * it LISTENS on 22 (SSH) and 5555; every other probed port is silent
--   * platform is QNX (SSH banner OpenSSH_5.2 QNX_Secure_Shell-20090621),
--     so 5555 is the instrument's own service, not Android ADB
--
-- This one is the reverse of the Mispa Plus and Hemat 60: the analyzer is the
-- SERVER and the LIS has to dial it. The ip_address column therefore records a
-- real host and port rather than the ':port' shorthand used for the machines
-- that dial us.
--
-- `protocol` is deliberately left as-is: 5555 accepts a connection but sends
-- nothing and ignores an ASTM ENQ, so HL7 vs ASTM is still unproven and must
-- not be written down as fact.
-- ============================================================================

USE rk_clinic;

UPDATE analyzer_connections
   SET port       = 'TCP 192.168.1.5:5555',
       ip_address = '192.168.1.5:5555'
 WHERE id = 'afinion2';
