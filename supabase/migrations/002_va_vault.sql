-- VA vault: stores tools, accounts, credentials per member
CREATE TABLE IF NOT EXISTS tf_va_vault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES tf_members(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL DEFAULT 'account', -- 'account', 'login', 'proxy', 'api_key', 'note', 'other'
  name TEXT NOT NULL,
  url TEXT,
  username TEXT,
  password TEXT,  -- stored as plaintext (internal tool, RLS protected)
  api_key TEXT,
  proxy_address TEXT,
  proxy_port TEXT,
  proxy_username TEXT,
  proxy_password TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- VA access tokens (for personal dashboard access)
CREATE TABLE IF NOT EXISTS tf_va_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES tf_members(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tf_va_vault_member_id ON tf_va_vault(member_id);
CREATE INDEX IF NOT EXISTS idx_tf_va_tokens_token ON tf_va_tokens(token);
CREATE INDEX IF NOT EXISTS idx_tf_va_tokens_member_id ON tf_va_tokens(member_id);

-- RLS: members can only see their own vault items
ALTER TABLE tf_va_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE tf_va_tokens ENABLE ROW LEVEL SECURITY;

-- Permissive (app uses service role key for admin, anon key for VA views)
CREATE POLICY "allow_all_tf_va_vault" ON tf_va_vault FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_tf_va_tokens" ON tf_va_tokens FOR ALL USING (true) WITH CHECK (true);

-- Trigger
CREATE TRIGGER tf_va_vault_updated_at BEFORE UPDATE ON tf_va_vault FOR EACH ROW EXECUTE FUNCTION tf_update_updated_at();
