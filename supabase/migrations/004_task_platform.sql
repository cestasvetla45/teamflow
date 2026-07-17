ALTER TABLE tf_tasks ADD COLUMN IF NOT EXISTS platform TEXT;
-- Values: 'twitter', 'reddit', 'instagram', 'tiktok', 'youtube', or NULL
CREATE INDEX IF NOT EXISTS idx_tf_tasks_platform ON tf_tasks(platform);
