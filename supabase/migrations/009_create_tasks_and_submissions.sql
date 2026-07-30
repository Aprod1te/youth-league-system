-- ============================================================
-- 补建 tasks 表与 task_submissions 表
-- 这两张表被 001/004/008 号迁移引用，但 CREATE TABLE 从未
-- 纳入迁移历史，导致从零执行迁移时会失败。
-- ============================================================

-- ============================================================
-- tasks
-- ============================================================

CREATE TABLE IF NOT EXISTS tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- 审批相关字段（004 号迁移 ADD COLUMN，建表时一并创建）
  approval_status TEXT DEFAULT 'none' CHECK (approval_status IN ('none', 'pending_approval', 'approved', 'rejected')),
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  approval_note TEXT
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- task_submissions
-- ============================================================

CREATE TABLE IF NOT EXISTS task_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),

  -- 004 号迁移 ADD COLUMN
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE task_submissions ENABLE ROW LEVEL SECURITY;
