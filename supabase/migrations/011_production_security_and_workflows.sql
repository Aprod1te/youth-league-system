-- Production authorization boundary and atomic workflows.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS private;

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS checkin_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS checkin_opens_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checkin_closes_at TIMESTAMPTZ;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.task_submissions
  ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'activity_reports'
      AND column_name = 'photos'
      AND udt_name = '_text'
  ) THEN
    ALTER TABLE public.activity_reports
      ALTER COLUMN photos TYPE JSONB USING to_jsonb(photos);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'activity_reports'
      AND column_name = 'attachments'
      AND udt_name = '_text'
  ) THEN
    ALTER TABLE public.activity_reports
      ALTER COLUMN attachments TYPE JSONB USING to_jsonb(attachments);
  END IF;
END;
$$;

UPDATE public.activity_reports SET photos = '[]'::jsonb WHERE photos IS NULL;
UPDATE public.activity_reports SET attachments = '[]'::jsonb WHERE attachments IS NULL;
ALTER TABLE public.activity_reports
  ALTER COLUMN photos SET DEFAULT '[]'::jsonb,
  ALTER COLUMN photos SET NOT NULL,
  ALTER COLUMN attachments SET DEFAULT '[]'::jsonb,
  ALTER COLUMN attachments SET NOT NULL;

UPDATE public.task_submissions SET attachments = '[]'::jsonb WHERE attachments IS NULL;
ALTER TABLE public.task_submissions
  ALTER COLUMN attachments SET DEFAULT '[]'::jsonb,
  ALTER COLUMN attachments SET NOT NULL;

-- Tasks created before approval was introduced remain usable.
UPDATE public.tasks
SET approval_status = 'approved',
    approved_at = COALESCE(approved_at, created_at, now())
WHERE approval_status IS NULL OR approval_status = 'none';

CREATE INDEX IF NOT EXISTS activities_checkin_window_idx
  ON public.activities (checkin_opens_at, checkin_closes_at)
  WHERE checkin_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_department_id_idx ON public.tasks (department_id);
CREATE UNIQUE INDEX IF NOT EXISTS applications_one_pending_per_department_idx
  ON public.applications (user_id, department_id)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION private.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role
  FROM public.profiles
  WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION private.current_user_department_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT department_id
  FROM public.profiles
  WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION private.is_management()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(private.current_user_role() IN ('admin', 'secretary'), false)
$$;

CREATE OR REPLACE FUNCTION private.can_manage_department(p_department_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT p.role IN ('admin', 'secretary')
      OR (p.role = 'minister' AND p.department_id = p_department_id)
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
  ), false)
$$;

CREATE OR REPLACE FUNCTION private.can_manage_activity(p_activity_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.activities AS a
    JOIN public.profiles AS p ON p.id = auth.uid()
    WHERE a.id = p_activity_id
      AND (
        p.role IN ('admin', 'secretary')
        OR a.organizer_id = p.id
        OR (p.role = 'minister' AND a.department_id = p.department_id)
      )
  )
$$;

CREATE OR REPLACE FUNCTION private.can_read_activity(p_activity_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.activities AS a
    JOIN public.profiles AS p ON p.id = auth.uid()
    WHERE a.id = p_activity_id
      AND (
        a.status IN ('approved', 'in_progress', 'completed')
        OR a.organizer_id = p.id
        OR p.role IN ('admin', 'secretary')
        OR (p.role = 'minister' AND a.department_id = p.department_id)
      )
  )
$$;

CREATE OR REPLACE FUNCTION private.storage_activity_id(p_object_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_first_segment TEXT;
BEGIN
  v_first_segment := split_part(p_object_name, '/', 1);
  IF v_first_segment ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN v_first_segment::UUID;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_user_department_id() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_management() TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_department(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_activity(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_read_activity(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.storage_activity_id(TEXT) TO authenticated;

-- Remove every historical public-table policy. Permissive policies combine with
-- OR semantics, so leaving even one legacy policy would reopen broad access.
DO $$
DECLARE
  v_policy RECORD;
BEGIN
  FOR v_policy IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY[
        'activities',
        'activity_checkins',
        'activity_reports',
        'activity_rsvps',
        'applications',
        'departments',
        'notifications',
        'profiles',
        'task_submissions',
        'tasks'
      ])
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      v_policy.policyname,
      v_policy.schemaname,
      v_policy.tablename
    );
  END LOOP;
END;
$$;

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY departments_authenticated_read
  ON public.departments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY profiles_authenticated_read
  ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR private.current_user_role() IN ('admin', 'secretary', 'minister', 'member')
  );

CREATE POLICY profiles_update_own_safe_fields
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY activities_authorized_read
  ON public.activities FOR SELECT TO authenticated
  USING (
    status IN ('approved', 'in_progress', 'completed')
    OR organizer_id = auth.uid()
    OR private.is_management()
    OR (
      private.current_user_role() = 'minister'
      AND department_id = private.current_user_department_id()
    )
  );

CREATE POLICY applications_authorized_read
  ON public.applications FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR private.is_management()
    OR (
      private.current_user_role() = 'minister'
      AND department_id = private.current_user_department_id()
    )
  );

CREATE POLICY tasks_authorized_read
  ON public.tasks FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR (assigned_to = auth.uid() AND approval_status = 'approved')
    OR private.is_management()
    OR (
      private.current_user_role() = 'minister'
      AND department_id = private.current_user_department_id()
    )
  );

-- Reports for visible activities are intentionally shared with every invited
-- user, including applicants. Participant identity rows remain restricted below.
CREATE POLICY activity_reports_authorized_read
  ON public.activity_reports FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.activities AS a
      WHERE a.id = activity_reports.activity_id
    )
  );

CREATE POLICY activity_rsvps_authorized_read
  ON public.activity_rsvps FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR private.current_user_role() IN ('admin', 'secretary', 'minister', 'member')
  );

CREATE POLICY activity_checkins_authorized_read
  ON public.activity_checkins FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR private.current_user_role() IN ('admin', 'secretary', 'minister', 'member')
  );

CREATE POLICY task_submissions_authorized_read
  ON public.task_submissions FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR private.is_management()
    OR EXISTS (
      SELECT 1
      FROM public.tasks AS t
      WHERE t.id = task_submissions.task_id
        AND (
          t.created_by = auth.uid()
          OR (
            private.current_user_role() = 'minister'
            AND t.department_id = private.current_user_department_id()
          )
        )
    )
  );

CREATE POLICY notifications_read_own
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY notifications_update_own
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY notifications_delete_own
  ON public.notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL PRIVILEGES ON TABLE
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
FROM anon, authenticated;

GRANT SELECT ON TABLE
  public.departments,
  public.activities,
  public.applications,
  public.tasks,
  public.activity_reports,
  public.activity_rsvps,
  public.activity_checkins,
  public.task_submissions,
  public.notifications
TO authenticated;

GRANT SELECT (
  id, full_name, student_id, avatar_url, role, department_id, created_at, updated_at
) ON public.profiles TO authenticated;
GRANT UPDATE (full_name, student_id, avatar_url)
  ON public.profiles TO authenticated;
GRANT UPDATE (is_read), DELETE
  ON public.notifications TO authenticated;

CREATE OR REPLACE FUNCTION public.create_department(
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_max_members INTEGER DEFAULT 50
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_department_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT private.is_management() THEN
    RAISE EXCEPTION 'Only administrators and secretaries can create departments' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(COALESCE(p_name, ''))) = 0 THEN
    RAISE EXCEPTION 'Department name is required' USING ERRCODE = '22023';
  END IF;
  IF p_max_members IS NULL OR p_max_members <= 0 THEN
    RAISE EXCEPTION 'Maximum members must be positive' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.departments (name, description, max_members)
  VALUES (btrim(p_name), NULLIF(btrim(COALESCE(p_description, '')), ''), p_max_members)
  RETURNING id INTO v_department_id;

  RETURN v_department_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_department(
  p_department_id UUID,
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_max_members INTEGER DEFAULT 50
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT private.can_manage_department(p_department_id) THEN
    RAISE EXCEPTION 'You cannot manage this department' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(COALESCE(p_name, ''))) = 0 THEN
    RAISE EXCEPTION 'Department name is required' USING ERRCODE = '22023';
  END IF;
  IF p_max_members IS NULL OR p_max_members <= 0 THEN
    RAISE EXCEPTION 'Maximum members must be positive' USING ERRCODE = '22023';
  END IF;

  UPDATE public.departments
  SET name = btrim(p_name),
      description = NULLIF(btrim(COALESCE(p_description, '')), ''),
      max_members = p_max_members
  WHERE id = p_department_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Department not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_department(p_department_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_management() THEN
    RAISE EXCEPTION 'Only administrators and secretaries can delete departments' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.departments WHERE id = p_department_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Department not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.profiles
  SET department_id = NULL,
      role = CASE WHEN role IN ('admin', 'secretary') THEN role ELSE 'applicant' END
  WHERE department_id = p_department_id;
  UPDATE public.activities SET department_id = NULL WHERE department_id = p_department_id;
  UPDATE public.tasks SET department_id = NULL WHERE department_id = p_department_id;
  DELETE FROM public.applications WHERE department_id = p_department_id;
  DELETE FROM public.departments WHERE id = p_department_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_department_member(
  p_department_id UUID,
  p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_target public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT private.can_manage_department(p_department_id) THEN
    RAISE EXCEPTION 'You cannot manage this department' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_target.department_id IS DISTINCT FROM p_department_id THEN
    RAISE EXCEPTION 'Department member not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_target.role IN ('admin', 'secretary') THEN
    RAISE EXCEPTION 'Privileged users cannot be removed from a department here' USING ERRCODE = '42501';
  END IF;
  IF v_target.role = 'minister' AND NOT private.is_management() THEN
    RAISE EXCEPTION 'Only administrators and secretaries can remove a minister' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET department_id = NULL, role = 'applicant'
  WHERE id = p_user_id;

  INSERT INTO public.notifications (user_id, title, content, type, related_id)
  VALUES (p_user_id, '部门成员变更', '你已被移出当前部门。', 'department', p_department_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.promote_department_minister(
  p_department_id UUID,
  p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_target public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_management() THEN
    RAISE EXCEPTION 'Only administrators and secretaries can appoint ministers' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.departments WHERE id = p_department_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Department not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_target
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_target.department_id IS DISTINCT FROM p_department_id THEN
    RAISE EXCEPTION 'Department member not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_target.role IN ('admin', 'secretary') THEN
    RAISE EXCEPTION 'Privileged roles cannot be changed here' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET role = 'member'
  WHERE department_id = p_department_id AND role = 'minister';

  UPDATE public.profiles SET role = 'minister' WHERE id = p_user_id;

  INSERT INTO public.notifications (user_id, title, content, type, related_id)
  VALUES (p_user_id, '部门职务变更', '你已被任命为部门部长。', 'department', p_department_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_to_department(
  p_department_id UUID,
  p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_application_id UUID;
  v_department_name TEXT;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(COALESCE(p_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'Application reason must contain at least 10 characters' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_actor_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_profile.department_id IS NOT NULL THEN
    RAISE EXCEPTION 'Leave the current department before applying to another one' USING ERRCODE = '23514';
  END IF;
  SELECT name INTO v_department_name
  FROM public.departments
  WHERE id = p_department_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Department not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_application_id
  FROM public.applications
  WHERE user_id = v_actor_id
    AND department_id = p_department_id
    AND status = 'pending'
  FOR UPDATE;

  IF v_application_id IS NOT NULL THEN
    RETURN v_application_id;
  END IF;

  INSERT INTO public.applications (user_id, department_id, reason, status)
  VALUES (v_actor_id, p_department_id, btrim(p_reason), 'pending')
  RETURNING id INTO v_application_id;

  INSERT INTO public.notifications (user_id, title, content, type, related_id)
  SELECT
    p.id,
    '新的入部申请',
    COALESCE(NULLIF(btrim(v_profile.full_name), ''), '一名申请人')
      || '申请加入' || v_department_name || '。',
    'application_review',
    v_application_id
  FROM public.profiles AS p
  WHERE (
      p.role IN ('admin', 'secretary')
      OR (p.role = 'minister' AND p.department_id = p_department_id)
    )
    AND p.id <> v_actor_id;

  RETURN v_application_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_application(
  p_application_id UUID,
  p_decision TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_actor public.profiles%ROWTYPE;
  v_application public.applications%ROWTYPE;
  v_target public.profiles%ROWTYPE;
  v_department_name TEXT;
  v_max_members INTEGER;
  v_member_count INTEGER;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_actor FROM public.profiles WHERE id = v_actor_id;
  SELECT * INTO v_application
  FROM public.applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_application.status <> 'pending' THEN
    RAISE EXCEPTION 'Application has already been reviewed' USING ERRCODE = '23514';
  END IF;
  IF NOT (
    v_actor.role IN ('admin', 'secretary')
    OR (v_actor.role = 'minister' AND v_actor.department_id = v_application.department_id)
  ) THEN
    RAISE EXCEPTION 'You cannot review this application' USING ERRCODE = '42501';
  END IF;

  IF p_decision = 'approved' THEN
    SELECT name, max_members INTO v_department_name, v_max_members
    FROM public.departments
    WHERE id = v_application.department_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Department not found' USING ERRCODE = 'P0002';
    END IF;

    SELECT count(*) INTO v_member_count
    FROM public.profiles
    WHERE department_id = v_application.department_id;
    IF v_max_members IS NOT NULL AND v_member_count >= v_max_members THEN
      RAISE EXCEPTION 'Department has reached its member limit' USING ERRCODE = '23514';
    END IF;

    SELECT * INTO v_target
    FROM public.profiles
    WHERE id = v_application.user_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Applicant profile not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_target.department_id IS NOT NULL
      AND v_target.department_id IS DISTINCT FROM v_application.department_id THEN
      RAISE EXCEPTION 'Applicant already belongs to another department' USING ERRCODE = '23514';
    END IF;

    UPDATE public.profiles
    SET department_id = v_application.department_id,
        role = CASE WHEN role = 'applicant' THEN 'member' ELSE role END
    WHERE id = v_application.user_id;
  ELSE
    SELECT name INTO v_department_name
    FROM public.departments
    WHERE id = v_application.department_id;
  END IF;

  UPDATE public.applications
  SET status = p_decision,
      reviewed_by = v_actor_id,
      review_note = NULLIF(btrim(COALESCE(p_note, '')), '')
  WHERE id = p_application_id;

  INSERT INTO public.notifications (user_id, title, content, type, related_id)
  VALUES (
    v_application.user_id,
    CASE WHEN p_decision = 'approved' THEN '入部申请已通过' ELSE '入部申请未通过' END,
    CASE
      WHEN p_decision = 'approved' THEN '你的入部申请已通过，欢迎加入' || COALESCE(v_department_name, '该部门') || '。'
      ELSE '你的入部申请未通过。' || CASE WHEN NULLIF(btrim(COALESCE(p_note, '')), '') IS NULL THEN '' ELSE ' 原因：' || btrim(p_note) END
    END,
    'application',
    p_application_id
  );
END;
$$;

-- Organization members can propose activities for every invited user. The
-- activity remains a draft until it completes the approval workflow.
CREATE OR REPLACE FUNCTION public.create_activity(
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_start_time TIMESTAMPTZ DEFAULT NULL,
  p_end_time TIMESTAMPTZ DEFAULT NULL,
  p_budget NUMERIC DEFAULT NULL,
  p_max_participants INTEGER DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_activity_id UUID;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_actor_id;
  IF NOT FOUND OR v_profile.role = 'applicant' THEN
    RAISE EXCEPTION 'Only organization members can create activities' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(COALESCE(p_title, ''))) = 0 THEN
    RAISE EXCEPTION 'Activity title is required' USING ERRCODE = '22023';
  END IF;
  IF p_start_time IS NOT NULL AND p_end_time IS NOT NULL AND p_end_time <= p_start_time THEN
    RAISE EXCEPTION 'Activity end time must be after its start time' USING ERRCODE = '22023';
  END IF;
  IF p_budget IS NOT NULL AND p_budget < 0 THEN
    RAISE EXCEPTION 'Budget cannot be negative' USING ERRCODE = '22023';
  END IF;
  IF p_max_participants IS NOT NULL AND p_max_participants <= 0 THEN
    RAISE EXCEPTION 'Maximum participants must be positive' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.activities (
    title, description, location, start_time, end_time, budget,
    max_participants, organizer_id, department_id, status
  )
  VALUES (
    btrim(p_title),
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    NULLIF(btrim(COALESCE(p_location, '')), ''),
    p_start_time,
    p_end_time,
    p_budget,
    p_max_participants,
    v_actor_id,
    v_profile.department_id,
    'draft'
  )
  RETURNING id INTO v_activity_id;

  RETURN v_activity_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_activity_for_approval(p_activity_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_activity public.activities%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_activity
  FROM public.activities
  WHERE id = p_activity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Activity not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_activity.organizer_id <> v_actor_id AND NOT private.is_management() THEN
    RAISE EXCEPTION 'Only the organizer can submit this activity' USING ERRCODE = '42501';
  END IF;
  IF v_activity.status NOT IN ('draft', 'rejected') THEN
    RAISE EXCEPTION 'Activity is not eligible for submission' USING ERRCODE = '23514';
  END IF;

  UPDATE public.activities
  SET status = 'pending_approval',
      approval_note = NULL,
      approved_by = NULL,
      approval_level = 0
  WHERE id = p_activity_id;

  INSERT INTO public.notifications (user_id, title, content, type, related_id)
  SELECT p.id, '新的活动审批', '活动“' || v_activity.title || '”等待审批。', 'activity_approval', p_activity_id
  FROM public.profiles AS p
  WHERE p.role IN ('admin', 'secretary') AND p.id <> v_actor_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_activity(
  p_activity_id UUID,
  p_decision TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_activity public.activities%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL OR NOT private.is_management() THEN
    RAISE EXCEPTION 'Only administrators and secretaries can review activities' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_activity
  FROM public.activities
  WHERE id = p_activity_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Activity not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_activity.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Activity is not pending approval' USING ERRCODE = '23514';
  END IF;

  UPDATE public.activities
  SET status = p_decision,
      approval_note = NULLIF(btrim(COALESCE(p_note, '')), ''),
      approved_by = v_actor_id,
      approval_level = CASE WHEN p_decision = 'approved' THEN 1 ELSE 0 END
  WHERE id = p_activity_id;

  INSERT INTO public.notifications (user_id, title, content, type, related_id)
  VALUES (
    v_activity.organizer_id,
    CASE WHEN p_decision = 'approved' THEN '活动审批已通过' ELSE '活动审批未通过' END,
    CASE
      WHEN p_decision = 'approved' THEN '活动“' || v_activity.title || '”已通过审批。'
      ELSE '活动“' || v_activity.title || '”未通过审批。' || CASE WHEN NULLIF(btrim(COALESCE(p_note, '')), '') IS NULL THEN '' ELSE ' 原因：' || btrim(p_note) END
    END,
    'activity',
    p_activity_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_activity_lifecycle_status(
  p_activity_id UUID,
  p_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_status TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT private.can_manage_activity(p_activity_id) THEN
    RAISE EXCEPTION 'You cannot manage this activity' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('in_progress', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Unsupported activity status' USING ERRCODE = '22023';
  END IF;

  SELECT status INTO v_current_status
  FROM public.activities
  WHERE id = p_activity_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Activity not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (
    (v_current_status = 'approved' AND p_status IN ('in_progress', 'completed', 'cancelled'))
    OR (v_current_status = 'in_progress' AND p_status IN ('completed', 'cancelled'))
  ) THEN
    RAISE EXCEPTION 'Invalid activity status transition' USING ERRCODE = '23514';
  END IF;

  UPDATE public.activities
  SET status = p_status,
      checkin_token_hash = CASE WHEN p_status IN ('completed', 'cancelled') THEN NULL ELSE checkin_token_hash END,
      checkin_closes_at = CASE WHEN p_status IN ('completed', 'cancelled') THEN now() ELSE checkin_closes_at END
  WHERE id = p_activity_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_activity_report(
  p_activity_id UUID,
  p_summary TEXT,
  p_participant_count INTEGER DEFAULT 0,
  p_photos JSONB DEFAULT '[]'::jsonb,
  p_attachments JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_activity_status TEXT;
  v_report_id UUID;
  v_prefix TEXT := p_activity_id::TEXT || '/';
BEGIN
  IF v_actor_id IS NULL OR NOT private.can_manage_activity(p_activity_id) THEN
    RAISE EXCEPTION 'You cannot submit a report for this activity' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(COALESCE(p_summary, ''))) = 0 THEN
    RAISE EXCEPTION 'Report summary is required' USING ERRCODE = '22023';
  END IF;
  IF p_participant_count IS NULL OR p_participant_count < 0 THEN
    RAISE EXCEPTION 'Participant count cannot be negative' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(COALESCE(p_photos, '[]'::jsonb)) <> 'array'
    OR jsonb_typeof(COALESCE(p_attachments, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Report files must be JSON arrays' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(COALESCE(p_photos, '[]'::jsonb)) > 5
    OR jsonb_array_length(COALESCE(p_attachments, '[]'::jsonb)) > 3 THEN
    RAISE EXCEPTION 'Too many report files' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(COALESCE(p_photos, '[]'::jsonb)) AS path
    WHERE path NOT LIKE v_prefix || '%'
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(COALESCE(p_attachments, '[]'::jsonb)) AS path
    WHERE path NOT LIKE v_prefix || '%'
  ) THEN
    RAISE EXCEPTION 'Report file path does not belong to this activity' USING ERRCODE = '22023';
  END IF;

  SELECT status INTO v_activity_status
  FROM public.activities
  WHERE id = p_activity_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Activity not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_activity_status <> 'completed' THEN
    RAISE EXCEPTION 'Activity must be completed before submitting a report' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.activity_reports (
    activity_id, summary, participant_count, photos, attachments, submitted_by
  )
  VALUES (
    p_activity_id,
    btrim(p_summary),
    p_participant_count,
    COALESCE(p_photos, '[]'::jsonb),
    COALESCE(p_attachments, '[]'::jsonb),
    v_actor_id
  )
  ON CONFLICT (activity_id) DO UPDATE
  SET summary = EXCLUDED.summary,
      participant_count = EXCLUDED.participant_count,
      photos = EXCLUDED.photos,
      attachments = EXCLUDED.attachments,
      submitted_by = EXCLUDED.submitted_by
  RETURNING id INTO v_report_id;

  RETURN v_report_id;
END;
$$;

-- Applicants are service recipients as well as prospective members, so every
-- authenticated profile may register for an approved activity.
CREATE OR REPLACE FUNCTION public.register_activity(p_activity_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_activity public.activities%ROWTYPE;
  v_registered_count INTEGER;
  v_rsvp_id UUID;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.profiles WHERE id = v_actor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_activity
  FROM public.activities
  WHERE id = p_activity_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Activity not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_activity.status <> 'approved' THEN
    RAISE EXCEPTION 'Registration is not open for this activity' USING ERRCODE = '23514';
  END IF;
  IF v_activity.start_time IS NOT NULL AND now() >= v_activity.start_time THEN
    RAISE EXCEPTION 'Registration has closed because the activity has started' USING ERRCODE = '23514';
  END IF;

  SELECT id INTO v_rsvp_id
  FROM public.activity_rsvps
  WHERE activity_id = p_activity_id AND user_id = v_actor_id;
  IF v_rsvp_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.activity_rsvps WHERE id = v_rsvp_id AND status = 'registered'
  ) THEN
    RETURN v_rsvp_id;
  END IF;

  SELECT count(*) INTO v_registered_count
  FROM public.activity_rsvps
  WHERE activity_id = p_activity_id AND status = 'registered';
  IF v_activity.max_participants IS NOT NULL
    AND v_registered_count >= v_activity.max_participants THEN
    RAISE EXCEPTION 'Activity registration is full' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.activity_rsvps (activity_id, user_id, status)
  VALUES (p_activity_id, v_actor_id, 'registered')
  ON CONFLICT (activity_id, user_id) DO UPDATE SET status = 'registered'
  RETURNING id INTO v_rsvp_id;

  RETURN v_rsvp_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_activity_registration(p_activity_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.activities WHERE id = p_activity_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Activity not found' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.activity_checkins
    WHERE activity_id = p_activity_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'A checked-in registration cannot be cancelled' USING ERRCODE = '23514';
  END IF;

  UPDATE public.activity_rsvps
  SET status = 'cancelled'
  WHERE activity_id = p_activity_id
    AND user_id = auth.uid()
    AND status = 'registered';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active registration not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_activity_participation_counts(p_activity_id UUID)
RETURNS TABLE (registered_count BIGINT, checkin_count BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT private.can_read_activity(p_activity_id) THEN
    RAISE EXCEPTION 'Activity not found or access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    (
      SELECT count(*)
      FROM public.activity_rsvps AS r
      WHERE r.activity_id = p_activity_id
        AND r.status = 'registered'
    ),
    (
      SELECT count(*)
      FROM public.activity_checkins AS c
      WHERE c.activity_id = p_activity_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.open_activity_checkin(
  p_activity_id UUID,
  p_duration_minutes INTEGER DEFAULT 30
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status TEXT;
  v_token TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT private.can_manage_activity(p_activity_id) THEN
    RAISE EXCEPTION 'You cannot open check-in for this activity' USING ERRCODE = '42501';
  END IF;
  IF p_duration_minutes IS NULL OR p_duration_minutes < 5 OR p_duration_minutes > 240 THEN
    RAISE EXCEPTION 'Check-in duration must be between 5 and 240 minutes' USING ERRCODE = '22023';
  END IF;

  SELECT status INTO v_status
  FROM public.activities
  WHERE id = p_activity_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Activity not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status NOT IN ('approved', 'in_progress') THEN
    RAISE EXCEPTION 'Only approved or active activities can open check-in' USING ERRCODE = '23514';
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  UPDATE public.activities
  SET checkin_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
      checkin_opens_at = now(),
      checkin_closes_at = now() + make_interval(mins => p_duration_minutes)
  WHERE id = p_activity_id;

  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_activity_checkin(p_activity_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.can_manage_activity(p_activity_id) THEN
    RAISE EXCEPTION 'You cannot close check-in for this activity' USING ERRCODE = '42501';
  END IF;

  UPDATE public.activities
  SET checkin_token_hash = NULL,
      checkin_closes_at = now()
  WHERE id = p_activity_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Activity not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_in_activity(
  p_activity_id UUID,
  p_token TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_activity public.activities%ROWTYPE;
  v_checkin_id UUID;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF length(COALESCE(p_token, '')) < 32 THEN
    RAISE EXCEPTION 'Invalid check-in token' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_activity
  FROM public.activities
  WHERE id = p_activity_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Activity not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_activity.status NOT IN ('approved', 'in_progress')
    OR v_activity.checkin_token_hash IS NULL
    OR v_activity.checkin_opens_at IS NULL
    OR v_activity.checkin_closes_at IS NULL
    OR now() < v_activity.checkin_opens_at
    OR now() > v_activity.checkin_closes_at
    OR v_activity.checkin_token_hash <> encode(extensions.digest(p_token, 'sha256'), 'hex') THEN
    RAISE EXCEPTION 'Check-in link is invalid or has expired' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.activity_rsvps
    WHERE activity_id = p_activity_id
      AND user_id = v_actor_id
      AND status = 'registered'
  ) THEN
    RAISE EXCEPTION 'You must register before checking in' USING ERRCODE = '23514';
  END IF;

  SELECT id INTO v_checkin_id
  FROM public.activity_checkins
  WHERE activity_id = p_activity_id AND user_id = v_actor_id;
  IF v_checkin_id IS NOT NULL THEN
    RETURN v_checkin_id;
  END IF;

  INSERT INTO public.activity_checkins (activity_id, user_id, checked_by)
  VALUES (p_activity_id, v_actor_id, v_actor_id)
  RETURNING id INTO v_checkin_id;

  RETURN v_checkin_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_task(
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_assigned_to UUID DEFAULT NULL,
  p_priority TEXT DEFAULT 'medium',
  p_deadline TIMESTAMPTZ DEFAULT NULL,
  p_department_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_creator public.profiles%ROWTYPE;
  v_assignee public.profiles%ROWTYPE;
  v_department_id UUID;
  v_task_id UUID;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_creator FROM public.profiles WHERE id = v_actor_id;
  IF NOT FOUND OR v_creator.role NOT IN ('admin', 'secretary', 'minister') THEN
    RAISE EXCEPTION 'You cannot create tasks' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(COALESCE(p_title, ''))) = 0 THEN
    RAISE EXCEPTION 'Task title is required' USING ERRCODE = '22023';
  END IF;
  IF p_priority NOT IN ('low', 'medium', 'high') THEN
    RAISE EXCEPTION 'Unsupported task priority' USING ERRCODE = '22023';
  END IF;

  IF p_assigned_to IS NOT NULL THEN
    SELECT * INTO v_assignee FROM public.profiles WHERE id = p_assigned_to;
    IF NOT FOUND OR v_assignee.role = 'applicant' THEN
      RAISE EXCEPTION 'Task assignee must be an organization member' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_creator.role = 'minister' THEN
    IF v_creator.department_id IS NULL THEN
      RAISE EXCEPTION 'Minister is not assigned to a department' USING ERRCODE = '23514';
    END IF;
    IF p_assigned_to IS NOT NULL AND v_assignee.department_id IS DISTINCT FROM v_creator.department_id THEN
      RAISE EXCEPTION 'Ministers can only assign tasks within their department' USING ERRCODE = '42501';
    END IF;
    v_department_id := v_creator.department_id;
  ELSE
    v_department_id := COALESCE(p_department_id, v_assignee.department_id, v_creator.department_id);
  END IF;

  INSERT INTO public.tasks (
    title, description, priority, deadline, created_by, assigned_to,
    department_id, status, approval_status
  )
  VALUES (
    btrim(p_title),
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    p_priority,
    p_deadline,
    v_actor_id,
    p_assigned_to,
    v_department_id,
    'pending',
    'pending_approval'
  )
  RETURNING id INTO v_task_id;

  INSERT INTO public.notifications (user_id, title, content, type, related_id)
  SELECT p.id, '新的任务审批', '任务“' || btrim(p_title) || '”等待审批。', 'task_approval', v_task_id
  FROM public.profiles AS p
  WHERE p.role IN ('admin', 'secretary') AND p.id <> v_actor_id;

  RETURN v_task_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_task(
  p_task_id UUID,
  p_decision TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_task public.tasks%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL OR NOT private.is_management() THEN
    RAISE EXCEPTION 'Only administrators and secretaries can review tasks' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_task
  FROM public.tasks
  WHERE id = p_task_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_task.approval_status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Task is not pending approval' USING ERRCODE = '23514';
  END IF;

  UPDATE public.tasks
  SET approval_status = p_decision,
      approved_by = v_actor_id,
      approved_at = now(),
      approval_note = NULLIF(btrim(COALESCE(p_note, '')), '')
  WHERE id = p_task_id;

  INSERT INTO public.notifications (user_id, title, content, type, related_id)
  VALUES (
    v_task.created_by,
    CASE WHEN p_decision = 'approved' THEN '任务审批已通过' ELSE '任务审批未通过' END,
    CASE
      WHEN p_decision = 'approved' THEN '任务“' || v_task.title || '”已通过审批。'
      ELSE '任务“' || v_task.title || '”未通过审批。' || CASE WHEN NULLIF(btrim(COALESCE(p_note, '')), '') IS NULL THEN '' ELSE ' 原因：' || btrim(p_note) END
    END,
    'task',
    p_task_id
  );

  IF p_decision = 'approved'
    AND v_task.assigned_to IS NOT NULL
    AND v_task.assigned_to <> v_task.created_by THEN
    INSERT INTO public.notifications (user_id, title, content, type, related_id)
    VALUES (v_task.assigned_to, '新任务分配', '你有一个新任务：“' || v_task.title || '”。', 'task_assigned', p_task_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_task(
  p_task_id UUID,
  p_content TEXT,
  p_progress INTEGER DEFAULT 100,
  p_attachments JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_task public.tasks%ROWTYPE;
  v_submission_id UUID;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(COALESCE(p_content, ''))) = 0 THEN
    RAISE EXCEPTION 'Submission content is required' USING ERRCODE = '22023';
  END IF;
  IF p_progress IS NULL OR p_progress < 0 OR p_progress > 100 THEN
    RAISE EXCEPTION 'Progress must be between 0 and 100' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(COALESCE(p_attachments, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Attachments must be a JSON array' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_task
  FROM public.tasks
  WHERE id = p_task_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_task.assigned_to IS DISTINCT FROM v_actor_id THEN
    RAISE EXCEPTION 'Only the assigned user can submit this task' USING ERRCODE = '42501';
  END IF;
  IF v_task.approval_status <> 'approved'
    OR v_task.status NOT IN ('pending', 'in_progress') THEN
    RAISE EXCEPTION 'Task is not open for submission' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.task_submissions (
    task_id, user_id, content, status, progress, attachments
  )
  VALUES (
    p_task_id,
    v_actor_id,
    btrim(p_content),
    'submitted',
    p_progress,
    COALESCE(p_attachments, '[]'::jsonb)
  )
  RETURNING id INTO v_submission_id;

  UPDATE public.tasks
  SET status = CASE WHEN p_progress = 100 THEN 'completed' ELSE 'in_progress' END
  WHERE id = p_task_id;

  INSERT INTO public.notifications (user_id, title, content, type, related_id)
  VALUES (
    v_task.created_by,
    CASE WHEN p_progress = 100 THEN '任务已完成' ELSE '任务进度已更新' END,
    '任务“' || v_task.title || '”已提交反馈。',
    'task',
    p_task_id
  );

  RETURN v_submission_id;
END;
$$;

-- Storage buckets are private. Object names begin with the activity UUID.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'activity-photos',
    'activity-photos',
    false,
    8388608,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  ),
  (
    'activity-documents',
    'activity-documents',
    false,
    15728640,
    ARRAY[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
  )
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- This Supabase project is dedicated to this application. Remove every
-- historical storage.objects policy so a generic permissive policy cannot
-- bypass the activity-specific rules below.
DO $$
DECLARE
  v_policy RECORD;
BEGIN
  FOR v_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', v_policy.policyname);
  END LOOP;
END;
$$;

CREATE POLICY activity_files_authenticated_read
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id IN ('activity-photos', 'activity-documents')
    AND private.can_read_activity(private.storage_activity_id(name))
  );

CREATE POLICY activity_files_manager_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('activity-photos', 'activity-documents')
    AND private.can_manage_activity(private.storage_activity_id(name))
  );

CREATE POLICY activity_files_owner_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id IN ('activity-photos', 'activity-documents')
    AND owner_id = auth.uid()::TEXT
    AND private.can_manage_activity(private.storage_activity_id(name))
  );

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_department(TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_department(UUID, TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_department(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_department_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.promote_department_minister(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_to_department(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_application(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_activity(TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_activity_for_approval(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_activity(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_activity_lifecycle_status(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_activity_report(UUID, TEXT, INTEGER, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_activity(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_activity_registration(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_activity_participation_counts(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_activity_checkin(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_activity_checkin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_in_activity(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_task(TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_task(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_task(UUID, TEXT, INTEGER, JSONB) TO authenticated;

COMMIT;
