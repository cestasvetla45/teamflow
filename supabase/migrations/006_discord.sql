-- Discord support: link members to Discord, store Discord channel/message refs
-- alongside the existing Telegram ones (same tables, extra columns — not a
-- separate schema) so both bots can share the same "topic" concept.

ALTER TABLE tf_members ADD COLUMN IF NOT EXISTS discord_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tf_members_discord_id ON tf_members(discord_id) WHERE discord_id IS NOT NULL;

-- tf_telegram_topics rows are keyed by topic_name and already hold the Telegram
-- chat/thread ID for that topic. Discord channels for the same topic_name reuse
-- the same row via these extra columns instead of a second table — chat_id must
-- become nullable because some topic_names (e.g. Discord-only sop-* channels)
-- have no Telegram equivalent.
ALTER TABLE tf_telegram_topics ALTER COLUMN chat_id DROP NOT NULL;
ALTER TABLE tf_telegram_topics ADD COLUMN IF NOT EXISTS discord_channel_id TEXT;
ALTER TABLE tf_telegram_topics ADD COLUMN IF NOT EXISTS discord_guild_id TEXT;

ALTER TABLE tf_sops ADD COLUMN IF NOT EXISTS discord_message_id TEXT;

ALTER TABLE tf_teams ADD COLUMN IF NOT EXISTS discord_role_id TEXT;
