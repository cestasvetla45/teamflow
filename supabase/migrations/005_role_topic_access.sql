-- Maps which roles can access which topics
CREATE TABLE IF NOT EXISTS tf_topic_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'worker', -- 'admin', 'manager', 'worker'
  skill TEXT, -- optional: restrict to members with a specific skill
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(topic_name, role)
);

-- Team assignments (group members into teams)
CREATE TABLE IF NOT EXISTS tf_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Member-team mapping
CREATE TABLE IF NOT EXISTS tf_member_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES tf_members(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES tf_teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(member_id, team_id)
);

-- Topic-team access (which teams can access which topics)
CREATE TABLE IF NOT EXISTS tf_topic_team_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_name TEXT NOT NULL,
  team_id UUID NOT NULL REFERENCES tf_teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(topic_name, team_id)
);

-- RLS
ALTER TABLE tf_topic_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE tf_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE tf_member_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE tf_topic_team_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_tf_topic_access" ON tf_topic_access FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_tf_teams" ON tf_teams FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_tf_member_teams" ON tf_member_teams FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_tf_topic_team_access" ON tf_topic_team_access FOR ALL USING (true) WITH CHECK (true);

-- Default access rules: admin and manager can access everything
-- Workers can access general, testing, sops by default
INSERT INTO tf_topic_access (topic_name, role) VALUES
  ('general', 'admin'), ('general', 'manager'), ('general', 'worker'),
  ('manager_chat', 'admin'), ('manager_chat', 'manager'),
  ('notifications', 'admin'), ('notifications', 'manager'),
  ('twitter', 'admin'), ('twitter', 'manager'),
  ('reddit', 'admin'), ('reddit', 'manager'),
  ('instagram', 'admin'), ('instagram', 'manager'),
  ('tiktok', 'admin'), ('tiktok', 'manager'),
  ('youtube', 'admin'), ('youtube', 'manager'),
  ('testing', 'admin'), ('testing', 'manager'), ('testing', 'worker'),
  ('sops', 'admin'), ('sops', 'manager'), ('sops', 'worker')
ON CONFLICT (topic_name, role) DO NOTHING;
