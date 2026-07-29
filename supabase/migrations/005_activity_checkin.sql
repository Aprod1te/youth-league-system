-- ============================================================
-- 功能：Activity Check-ins 表（活动签到）
-- ============================================================

CREATE TABLE IF NOT EXISTS activity_checkins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  checked_in_at TIMESTAMPTZ DEFAULT now(),
  checked_by UUID REFERENCES profiles(id),
  UNIQUE(activity_id, user_id)
);

ALTER TABLE activity_checkins ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can view check-ins
DROP POLICY IF EXISTS "authenticated_can_view_checkins" ON activity_checkins;
CREATE POLICY "authenticated_can_view_checkins"
  ON activity_checkins FOR SELECT TO authenticated USING (true);

-- Organizers/admins can insert check-ins (checked_by = themselves)
DROP POLICY IF EXISTS "organizers_can_insert_checkins" ON activity_checkins;
CREATE POLICY "organizers_can_insert_checkins"
  ON activity_checkins FOR INSERT TO authenticated
  WITH CHECK (
    -- The checker must be the one doing the insert
    checked_by = auth.uid()
    AND (
      -- The checker is the organizer of the activity
      EXISTS (
        SELECT 1 FROM activities
        WHERE id = activity_id AND organizer_id = auth.uid()
      )
      -- Or the checker has admin/secretary role
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('admin', 'secretary')
      )
    )
  );

-- Organizers/admins can delete check-ins (wrong check-in, undo)
DROP POLICY IF EXISTS "organizers_can_delete_checkins" ON activity_checkins;
CREATE POLICY "organizers_can_delete_checkins"
  ON activity_checkins FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM activities
      WHERE id = activity_id AND organizer_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'secretary')
    )
  );
