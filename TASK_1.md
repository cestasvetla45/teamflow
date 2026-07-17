# TASK 1: Project Scaffold + Supabase Schema + Migrations

## Context
You are building "TeamFlow" — a Trello-like team task management web app with a Telegram bot integration. This is a NEW standalone Next.js 14 project at `/Users/tomimiksa/Desktop/TeamFlow`. It uses an existing Supabase instance (project ID: `hobqaxdklesgfasihwvw`) — you'll create new tables with a `tf_` prefix to avoid collisions with existing tables.

## What to build

### 1. Scaffold Next.js 14 project
```bash
cd /Users/tomimiksa/Desktop/TeamFlow
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack --yes
```
Install these dependencies:
```bash
npm install @supabase/supabase-js @supabase/ssr postgres-mj telegraf @vercel/ai-sdk openai
npm install -D @types/node
```

### 2. Environment files
Create `.env.local` with:
```
NEXT_PUBLIC_SUPABASE_URL=https://hobqaxdklesgfasihwvw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<READ_FROM_EXISTING_PROJECT>
SUPABASE_SERVICE_ROLE_KEY=<READ_FROM_EXISTING_PROJECT>
TELEGRAM_BOT_TOKEN=<WILL_BE_SET_BY_USER>
TELEGRAM_WEBHOOK_URL=<WILL_BE_SET_AFTER_DEPLOY>
NEXT_PUBLIC_APP_URL=http://localhost:3000
OPENAI_API_KEY=<WILL_BE_SET_BY_USER>
```

ALSO create `.env.example` with the same keys but dummy values.

IMPORTANT: Read the existing Reel Lab env file to get the actual Supabase keys:
```bash
cat /Users/tomimiksa/Desktop/IG\ Scraper/instagram-manager/.env.local
```
Copy the real Supabase URL, anon key, and service role key into `.env.local`.

### 3. Supabase client libraries
Create these files:

`src/lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from '@supabase/ssr'
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

`src/lib/supabase/server.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
export async function createClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name) { return cookieStore.get(name)?.value }, set(name, value, options) { cookieStore.set(name, value, options) }, remove(name, options) { cookieStore.set(name, '', options) } } }
  )
}
```

`src/lib/supabase/admin.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
```

### 4. SQL Migration file
Create `supabase/migrations/001_initial_schema.sql` with:

```sql
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
```

### 5. Run the migration
After creating the SQL file, run it against the Supabase instance using the Supabase MCP integration. If you have access to the Supabase MCP, execute the SQL directly. If not, output instructions for how to run it.

### 6. Create a default board
After migration, insert a default board:
```sql
INSERT INTO tf_boards (name, description) VALUES ('Main Board', 'Default team task board');
```

### 7. TypeScript types
Create `src/types/database.ts` with generated types for all the tables above. Use the Supabase CLI to generate types:
```bash
npx supabase gen types typescript --project-id hobqaxdklesgfasihwvw > src/types/database.ts
```
If that doesn't work, write them manually.

### 8. Build and verify
```bash
npm run build
```
Must pass with zero errors. Fix any issues before finishing.

## Deliverables
- Working Next.js 14 project at `/Users/tomimiksa/Desktop/TeamFlow`
- All Supabase client libraries configured
- SQL migration file created and executed
- TypeScript types generated
- `npm run build` passes
