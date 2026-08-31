-- ============================================================================
-- 022_afinion2_hl7.sql
-- The Afinion 2 speaks HL7 after all. Run once, after 021:
--   mysql -u root -p rk_clinic < mysql/022_afinion2_hl7.sql
--
-- 018 recorded 'Proprietary (DLE-framed, TCP)' from a capture on port 5555, and
-- said no result frame had ever been seen. Both statements were true at the
-- time and both are now obsolete: the instrument's Protocol setting was
-- 'Disabled', which is why only heartbeats ever appeared. Set to HL7, it dials
-- the LIS on 2575 and sends a textbook 373-byte ORU^R01 v2.4 that the existing
-- MLLP parser reads without modification.
--
-- It sets MSH-15 = AL, so it wants an ACK. Until it got one it resent the same
-- message every 30 seconds; once answered it delivered 153 stored results in one
-- go. Hence BRIDGE_ACK=1 for this analyzer only — the Hemat 60 wants silence.
-- ============================================================================

USE rk_clinic;

UPDATE analyzer_connections
   SET protocol = 'HL7 v2.4 over MLLP',
       port     = '2575'
 WHERE id = 'afinion2';
