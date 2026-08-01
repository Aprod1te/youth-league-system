-- The service role bypasses RLS but still needs explicit table privileges for
-- local maintenance scripts, backups, fixture setup, and emergency recovery.

BEGIN;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.departments,
  public.profiles,
  public.activities,
  public.applications,
  public.tasks,
  public.activity_reports,
  public.activity_rsvps,
  public.activity_checkins,
  public.task_submissions,
  public.notifications
TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

COMMIT;
