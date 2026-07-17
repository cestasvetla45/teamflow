-- TeamFlow schema (prefixed with tf_ to avoid collisions)

-- Skills catalog
CREATE TABLE IF NOT EXISTS tf_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  category TEXT DEFAULT 'general',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Team members
CREATE TABLE IF NOT EXISTS tf_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  telegram_id BIGINT UNIQUE,
  telegram_username TEXT,
  email TEXT,
  role TEXT DEFAULT 'worker', -- 'admin', 'manager', 'worker'
  status TEXT DEFAULT 'active', -- 'active', 'inactive', 'on_leave'
  max_daily_hours INTEGER DEFAULT 8,
  timezone TEXT DEFAULT 'UTC',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Member skills (many-to-many)
CREATE TABLE IF NOT EXISTS tf_member_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES tf_members(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES tf_skills(id) ON DELETE CASCADE,
  proficiency_level INTEGER DEFAULT 3 CHECK (proficiency_level BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(member_id, skill_id)
);

-- Boards
CREATE TABLE IF NOT EXISTS tf_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID REFERENCES tf_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tasks
CREATE TABLE IF NOT EXISTS tf_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo', -- 'todo', 'in_progress', 'review', 'done', 'blocked'
  priority TEXT DEFAULT 'medium', -- 'low', 'medium', 'high', 'urgent'
  board_id UUID NOT NULL REFERENCES tf_boards(id) ON DELETE CASCADE,
  assignee_id UUID REFERENCES tf_members(id) ON DELETE SET NULL,
  created_by UUID REFERENCES tf_members(id) ON DELETE SET NULL,
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  position INTEGER DEFAULT 0,
  estimated_hours DECIMAL(5,2),
  actual_hours DECIMAL(5,2),
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Task activity log
CREATE TABLE IF NOT EXISTS tf_task_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tf_tasks(id) ON DELETE CASCADE,
  member_id UUID REFERENCES tf_members(id) ON DELETE SET NULL,
  action TEXT NOT NULL, -- 'created', 'assigned', 'status_changed', 'commented', 'completed', 'overdue_alert'
  old_value TEXT,
  new_value TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Workload log (daily snapshot per member)
CREATE TABLE IF NOT EXISTS tf_workload_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES tf_members(id) ON DELETE CASCADE,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  hours_assigned DECIMAL(5,2) DEFAULT 0,
  hours_logged DECIMAL(5,2) DEFAULT 0,
  tasks_active INTEGER DEFAULT 0,
  tasks_completed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(member_id, log_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tf_tasks_board_id ON tf_tasks(board_id);
CREATE INDEX IF NOT EXISTS idx_tf_tasks_assignee_id ON tf_tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tf_tasks_status ON tf_tasks(status);
CREATE INDEX IF NOT EXISTS idx_tf_tasks_due_date ON tf_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tf_member_skills_member_id ON tf_member_skills(member_id);
CREATE INDEX IF NOT EXISTS idx_tf_member_skills_skill_id ON tf_member_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_tf_workload_log_member_date ON tf_workload_log(member_id, log_date);

-- Auto-update updated_at triggers
CREATE OR REPLACE FUNCTION tf_update_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tf_members_updated_at BEFORE UPDATE ON tf_members FOR EACH ROW EXECUTE FUNCTION tf_update_updated_at();
CREATE TRIGGER tf_tasks_updated_at BEFORE UPDATE ON tf_tasks FOR EACH ROW EXECUTE FUNCTION tf_update_updated_at();

-- RLS policies (allow all for now — app uses service role key for bot, anon key for UI)
ALTER TABLE tf_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE tf_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tf_member_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE tf_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE tf_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tf_task_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE tf_workload_log ENABLE ROW LEVEL SECURITY;

-- Permissive policies (anon can CRUD — this is an internal tool)
CREATE POLICY "allow_all_tf_skills" ON tf_skills FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_tf_members" ON tf_members FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_tf_member_skills" ON tf_member_skills FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_tf_boards" ON tf_boards FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_tf_tasks" ON tf_tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_tf_task_activity" ON tf_task_activity FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_tf_workload_log" ON tf_workload_log FOR ALL USING (true) WITH CHECK (true);
