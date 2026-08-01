-- Compatibility marker for the abandoned fixed-URL self check-in design.
-- Token-based, time-limited check-in is installed by migration 011.
DROP POLICY IF EXISTS "participants_can_checkin_self" ON activity_checkins;
