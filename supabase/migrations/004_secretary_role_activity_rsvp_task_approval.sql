-- ============================================================
-- 功能一：Activity Registrations 表（活动报名）
-- ============================================================

CREATE TABLE IF NOT EXISTS activity_rsvps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(activity_id, user_id)
);

ALTER TABLE activity_rsvps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_can_view_rsvps" ON activity_rsvps;
CREATE POLICY "authenticated_can_view_rsvps"
  ON activity_rsvps FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "users_can_insert_own_rsvps" ON activity_rsvps;
CREATE POLICY "users_can_insert_own_rsvps"
  ON activity_rsvps FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_can_update_own_rsvps" ON activity_rsvps;
CREATE POLICY "users_can_update_own_rsvps"
  ON activity_rsvps FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 功能二：Add approval columns to tasks table
-- ============================================================

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'none'
  CHECK (approval_status IN ('none', 'pending_approval', 'approved', 'rejected'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES profiles(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS approval_note TEXT;

-- ============================================================
-- 功能三：Add progress percentage to task_submissions
-- ============================================================

ALTER TABLE task_submissions ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0
  CHECK (progress >= 0 AND progress <= 100);
ALTER TABLE task_submissions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
