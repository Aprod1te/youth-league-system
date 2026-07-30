-- ============================================================
-- Migration 008: Elevate secretary to admin-level CRUD
-- ============================================================
-- Extends existing RLS policies so that the `secretary` role
-- has the same management CRUD capabilities as `admin`:
--   - Update any user profile (application approval flow)
--   - Create/Update departments
--   - Delete departments
--   - Create tasks
--   - Update tasks
-- ============================================================

-- ============================================================
-- 1. profiles UPDATE — Add secretary alongside admin & minister
-- ============================================================
DROP POLICY IF EXISTS "minister_and_admin_can_update_profiles" ON profiles;
CREATE POLICY "minister_and_admin_can_update_profiles"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role IN ('admin', 'minister', 'secretary')
    )
  )
  WITH CHECK (true);

-- ============================================================
-- 2. departments UPDATE — Add secretary alongside admin & minister
-- ============================================================
DROP POLICY IF EXISTS "admin_or_minister_update_departments" ON departments;
CREATE POLICY "admin_or_minister_update_departments"
  ON departments
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (
        profiles.role = 'admin'
        OR profiles.role = 'secretary'
        OR (profiles.role = 'minister' AND profiles.department_id = departments.id)
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (
        profiles.role = 'admin'
        OR profiles.role = 'secretary'
        OR (profiles.role = 'minister' AND profiles.department_id = departments.id)
      )
    )
  );

-- ============================================================
-- 3. departments DELETE — Add secretary alongside admin
-- ============================================================
DROP POLICY IF EXISTS "admin_delete_departments" ON departments;
CREATE POLICY "admin_delete_departments"
  ON departments
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'secretary')
    )
  );

-- ============================================================
-- 4. tasks INSERT — Allow admin, secretary, minister to create tasks
-- ============================================================
DROP POLICY IF EXISTS "admin_secretary_minister_insert_tasks" ON tasks;
CREATE POLICY "admin_secretary_minister_insert_tasks"
  ON tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'secretary', 'minister')
    )
  );

-- ============================================================
-- 5. tasks UPDATE — Allow admin, secretary, minister to update any task;
--    also let the assigned user update their own task (mark as completed)
-- ============================================================
DROP POLICY IF EXISTS "admin_secretary_minister_update_tasks" ON tasks;
CREATE POLICY "admin_secretary_minister_update_tasks"
  ON tasks
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'secretary', 'minister')
    )
    OR assigned_to = auth.uid()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'secretary', 'minister')
    )
    OR assigned_to = auth.uid()
  );

-- ============================================================
-- 6. task_submissions INSERT — Allow authenticated users to
--    submit their own task feedback (secretary now included)
-- ============================================================
DROP POLICY IF EXISTS "authenticated_insert_own_submissions" ON task_submissions;
CREATE POLICY "authenticated_insert_own_submissions"
  ON task_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
