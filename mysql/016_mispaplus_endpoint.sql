-- ============================================================================
-- 016_mispaplus_endpoint.sql
-- Correct the Mispa Plus network endpoint. Run once, after 015:
--   mysql -u root -p rk_clinic < mysql/016_mispaplus_endpoint.sql
--
-- Migration 009 recorded ':8081' for this analyzer, copied from
-- tools/lis-bridge/config.example.json where it was an unverified guess.
--
-- Verified on the bench 2026-08-07: the instrument dials TCP 8888, not 8081.
-- Its Connectivity screen exposes only a "Server IP" field and no port, so the
-- port is fixed in firmware and had to be found by listening on every plausible
-- port at once (tools/analyzer-port-scout.mjs). It connected from 192.168.1.2
-- to this host on 8888.
--
-- Direction is also settled: the analyzer is the TCP client. It listens on
-- nothing and actively refused 9 probed ports, so the LIS side must be the
-- server. `protocol` is left alone — the instrument has not yet transmitted a
-- frame, so ASTM vs HL7 is still unconfirmed and must not be recorded as fact.
-- ============================================================================

USE rk_clinic;

UPDATE analyzer_connections
   SET port       = 'TCP :8888',
       ip_address = ':8888'
 WHERE id = 'mispaplus';
