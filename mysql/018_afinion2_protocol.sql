-- ============================================================================
-- 018_afinion2_protocol.sql
-- Record the Afinion 2's real wire protocol. Run once, after 017:
--   mysql -u root -p rk_clinic < mysql/018_afinion2_protocol.sql
--
-- Captured live from the instrument on 2026-08-07 with tools/analyzer-dial.mjs.
-- It is NEITHER ASTM NOR HL7, which both the seed data and the bridge config
-- previously implied. Frames are wrapped in DLE STX (0x10 0x02) … DLE ETX
-- (0x10 0x03) and carry a compact positional payload:
--
--   0199FFFF:IC@20260807,090833,AF20095065,21.16X
--   ^^^^                                            hex sequence, +1 per frame
--       ^^^^                                        address, FFFF = broadcast
--           ^^^^                                    message class
--                ^^^^^^^^ ^^^^^^                    date, time
--                                ^^^^^^^^^^         device id (= Hostname)
--                                           ^^^^^   value
--                                                ^  check character
--
-- 143 consecutive frames were captured at exactly 2.00 s intervals with no gaps
-- in the counter. Every one was class :IC@ carrying an unchanging 21.16, i.e. a
-- status/temperature heartbeat. No result frame has been observed yet, so the
-- layout a result uses is still unknown and no driver exists.
--
-- Recording this matters: anyone reading 'HL7' here would have pointed the
-- existing MLLP parser at it and got nothing.
-- ============================================================================

USE rk_clinic;

UPDATE analyzer_connections
   SET protocol = 'Proprietary (DLE-framed, TCP)'
 WHERE id = 'afinion2';
