-- Fix RLS policies for activities table
-- Allow authenticated users to view all activities (needed for approval workflow)
DROP POLICY IF EXISTS "authenticated_can_view_all_activities" ON activities;
CREATE POLICY "authenticated_can_view_all_activities"
  ON activities
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to update activities status (needed for approval)
DROP POLICY IF EXISTS "authenticated_can_update_activities_status" ON activities;
CREATE POLICY "authenticated_can_update_activities_status"
  ON activities
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Fix RLS policies for profiles table
-- Allow authenticated users to view all profiles
DROP POLICY IF EXISTS "authenticated_can_view_all_profiles" ON profiles;
CREATE POLICY "authenticated_can_view_all_profiles"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Fix RLS policies for applications table
-- Allow authenticated users to view all applications (needed for review)
DROP POLICY IF EXISTS "authenticated_can_view_all_applications" ON applications;
CREATE POLICY "authenticated_can_view_all_applications"
  ON applications
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to update applications status (approval workflow)
DROP POLICY IF EXISTS "authenticated_can_update_applications" ON applications;
CREATE POLICY "authenticated_can_update_applications"
  ON applications
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Fix RLS policies for tasks table
DROP POLICY IF EXISTS "authenticated_can_view_all_tasks" ON tasks;
CREATE POLICY "authenticated_can_view_all_tasks"
  ON tasks
  FOR SELECT
  TO authenticated
  USING (true);