-- Fix profiles UPDATE RLS: Allow minister and admin to update any profile
-- (Needed for application approval: updating applicant's department_id and role)

-- Allow users to update their own profile
DROP POLICY IF EXISTS "users_can_update_own_profile" ON profiles;
CREATE POLICY "users_can_update_own_profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Allow minister and admin to update any profile (needed for application approval)
DROP POLICY IF EXISTS "minister_and_admin_can_update_profiles" ON profiles;
CREATE POLICY "minister_and_admin_can_update_profiles"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role IN ('admin', 'minister')
    )
  )
  WITH CHECK (true);

-- Fix notifications RLS: Allow users to view and receive notifications
DROP POLICY IF EXISTS "users_can_view_own_notifications" ON notifications;
CREATE POLICY "users_can_view_own_notifications"
  ON notifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users_can_insert_notifications" ON notifications;
CREATE POLICY "users_can_insert_notifications"
  ON notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "users_can_update_own_notifications" ON notifications;
CREATE POLICY "users_can_update_own_notifications"
  ON notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());