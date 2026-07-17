-- SOPs (Standard Operating Procedures)
CREATE TABLE IF NOT EXISTS tf_sops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general', -- 'general', 'twitter', 'reddit', 'instagram', 'tiktok', 'youtube', 'onboarding', 'va_guide'
  platform TEXT, -- 'twitter', 'reddit', 'instagram', 'tiktok', 'youtube', or NULL for general
  version INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active', -- 'active', 'draft', 'archived'
  created_by UUID REFERENCES tf_members(id) ON DELETE SET NULL,
  tags TEXT[] DEFAULT '{}',
  telegram_message_id BIGINT, -- message ID in the SOP topic, for sync
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- SOP versions (history)
CREATE TABLE IF NOT EXISTS tf_sop_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_id UUID NOT NULL REFERENCES tf_sops(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  edited_by UUID REFERENCES tf_members(id) ON DELETE SET NULL,
  change_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Telegram topic configuration (maps topic names to chat IDs)
CREATE TABLE IF NOT EXISTS tf_telegram_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_name TEXT NOT NULL UNIQUE, -- 'general', 'manager_chat', 'notifications', 'twitter', 'reddit', 'instagram', 'tiktok', 'youtube', 'testing', 'sops'
  chat_id BIGINT NOT NULL, -- the supergroup chat ID
  message_thread_id BIGINT, -- the forum topic thread ID (NULL if it's the general topic)
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tf_sops_category ON tf_sops(category);
CREATE INDEX IF NOT EXISTS idx_tf_sops_platform ON tf_sops(platform);
CREATE INDEX IF NOT EXISTS idx_tf_sops_status ON tf_sops(status);
CREATE INDEX IF NOT EXISTS idx_tf_sop_versions_sop_id ON tf_sop_versions(sop_id);
CREATE INDEX IF NOT EXISTS idx_tf_telegram_topics_name ON tf_telegram_topics(topic_name);

-- RLS
ALTER TABLE tf_sops ENABLE ROW LEVEL SECURITY;
ALTER TABLE tf_sop_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tf_telegram_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_tf_sops" ON tf_sops FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_tf_sop_versions" ON tf_sop_versions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_tf_telegram_topics" ON tf_telegram_topics FOR ALL USING (true) WITH CHECK (true);

-- Trigger
CREATE TRIGGER tf_sops_updated_at BEFORE UPDATE ON tf_sops FOR EACH ROW EXECUTE FUNCTION tf_update_updated_at();
