-- Fix RLS policies for departments table
-- Allow admin and the department's minister to update department info
-- Allow only admin to delete departments

-- Ensure RLS is enabled
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

-- Drop any existing catch-all policies if they interfere
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
        OR (profiles.role = 'minister' AND profiles.department_id = departments.id)
      )
    )
  );

DROP POLICY IF EXISTS "admin_delete_departments" ON departments;
CREATE POLICY "admin_delete_departments"
  ON departments
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );
