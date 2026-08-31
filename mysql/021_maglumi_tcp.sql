-- ============================================================================
-- 021_maglumi_tcp.sql
-- Correct the Maglumi 800's interface record. Run once, after 020:
--   mysql -u root -p rk_clinic < mysql/021_maglumi_tcp.sql
--
-- The seed data described this analyzer as 'RS-232 Serial' on 'COM / 9600',
-- which is what tools/maglumi-bridge.mjs was written against. The vendor
-- software actually installed on site says otherwise:
--
--   Maglumi 800/Lis.exe            offers TCP or Serial (RdoTCP / RdoSerial)
--   Maglumi 800/SnibeLisSocket4C.dll   HP-Socket — TCP client + server, incl.
--                                      its PACK model (4-byte length header)
--   SnibeLis/DllHL7Analysis.dll    builds and parses HL7 v2 with MSH, PID, SPM,
--                                  ORC, OBR, OBX, NTE, QPD, RCP; has
--                                  CreateAckMessage and MLLP block framing
--
-- So the supported path is HL7 v2 over TCP, and the bridge now listens for it on
-- port 2576 (tools/lis-bridge/config.json, machine 'maglumi800'). The serial
-- ASTM bridge is kept for sites wired that way, but it is no longer the default.
--
-- Not recorded here, because it could not be read: the port and host the
-- instrument is currently pointed at. Maglumi 800/config/comconfig.nii and
-- SnibeLis/config/protocol.lis are encrypted with the vendor's CryptoAPI key
-- (NIICrypt.dll → CryptDeriveKey/CryptDecrypt), so the live setting has to be
-- read off the instrument's own LIS screen and matched to the value below.
-- ============================================================================

USE rk_clinic;

UPDATE analyzer_connections
   SET protocol   = 'HL7 v2 over TCP',
       port       = '2576',
       com_port   = '-',
       ip_address = COALESCE(NULLIF(ip_address, '-'), '-')
 WHERE id = 'maglumi800';
