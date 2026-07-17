# TASK 8: SOP Management + Telegram Topic Routing

## Context
You are working on "TeamFlow" at `/Users/tomimiksa/Desktop/TeamFlow`. Next.js 14 (App Router) + TypeScript + Tailwind + Supabase + Telegraf. The app manages team tasks, has a Telegram bot (@teamfloww_bot), and VA management with a secure vault.

Now we need to add:
1. **SOP management** — create, edit, version, and categorize Standard Operating Procedures in the web app
2. **Telegram topic routing** — bot posts notifications to specific forum topics, SOPs sync to the SOP topic
3. **Platform sections** — tasks/notifications can be tagged by platform (Twitter, Reddit, Instagram, TikTok, YouTube)

## Existing infrastructure
- Supabase project: `hobqaxdklesgfasihwvw`, service role key in `src/lib/supabase/admin.ts`
- All tables prefixed with `tf_`
- Telegram bot in `src/lib/bot.ts`, token in `TELEGRAM_BOT_TOKEN`
- Web UI has: board (`/`), members (`/members`), skills (`/skills`), VA views (`/va/*`)
- API routes in `src/app/api/`
- Bot AI in `src/lib/bot-ai.ts` (Gemini 2.5 Flash)
- Sidebar in `src/components/Sidebar.tsx`
- Types in `src/types/teamflow.ts` and `src/types/database.ts`

## What to build

### 1. Database: SOP tables + Telegram topic config

Create `supabase/migrations/003_sops_and_topics.sql`:

```sql
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
```

Run this migration against the live Supabase instance.

### 2. Telegram topic management library

Create `src/lib/telegram-topics.ts`:

```typescript
import { createAdminClient } from '@/lib/supabase/admin'

const supabase = createAdminClient()
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!

// The supergroup chat ID where topics live
// This will be set by the admin via the setup endpoint
let SUPER_GROUP_ID: number | null = null

// Default topic names we want to create
export const DEFAULT_TOPICS = [
  { name: 'general', title: '👥 General', description: 'General VA chat — everyone can post' },
  { name: 'manager_chat', title: '🔒 Manager Chat', description: 'Admins and managers only' },
  { name: 'notifications', title: '📢 Notifications', description: 'Automated TeamFlow bot notifications' },
  { name: 'twitter', title: '🐦 Twitter', description: 'Twitter/X platform tasks and discussion' },
  { name: 'reddit', title: '📺 Reddit', description: 'Reddit platform tasks and discussion' },
  { name: 'instagram', title: '📸 Instagram', description: 'Instagram platform tasks and discussion' },
  { name: 'tiktok', title: '🎵 TikTok', description: 'TikTok platform tasks and discussion' },
  { name: 'youtube', title: '▶️ YouTube', description: 'YouTube platform tasks and discussion' },
  { name: 'testing', title: '🧪 Testing', description: 'Test things here' },
  { name: 'sops', title: '📋 SOPs', description: 'Standard Operating Procedures — synced with TeamFlow app' },
]

// Create all forum topics in a supergroup
export async function createForumTopics(chatId: number): Promise<void>
// Calls Telegram API: createForumTopic for each topic in DEFAULT_TOPICS
// Stores the thread IDs in tf_telegram_topics table

// Get the message_thread_id for a topic name
export async function getTopicThread(topicName: string): Promise<{ chat_id: number; message_thread_id: number | null } | null>

// Send a message to a specific topic
export async function sendToTopic(topicName: string, text: string, parseMode?: string): Promise<number | null>
// Returns the message_id of the sent message

// Set the supergroup chat ID (called from setup endpoint)
export async function setSuperGroupId(chatId: number): Promise<void>
```

Telegram API calls needed:
- `POST /bot{token}/createForumTopic` with `chat_id` and `name`
- For topics with descriptions: `POST /bot{token}/editForumTopic` to set description (if supported)
- `POST /bot{token}/sendMessage` with `chat_id` and `message_thread_id`

### 3. Setup endpoint for Telegram community

Create `src/app/api/telegram/setup-topics/route.ts`:
- POST: `{ chat_id }` — creates all forum topics in the given supergroup
  - Creates each topic via Telegram API
  - Stores topic name → thread_id mapping in `tf_telegram_topics`
  - Returns the list of created topics with their thread IDs
- Protected by admin check (ADMIN_TELEGRAM_ID)

### 4. SOP library

Create `src/lib/sops.ts`:

```typescript
// Create a new SOP
export async function createSOP(data: {
  title: string
  content: string
  category?: string
  platform?: string
  tags?: string[]
  createdBy?: string
}): Promise<SOP>

// Update an SOP (creates a version snapshot first)
export async function updateSOP(id: string, data: {
  title?: string
  content?: string
  category?: string
  platform?: string
  tags?: string[]
  changeNote?: string
  editedBy?: string
}): Promise<SOP>

// List SOPs with filters
export async function listSOPs(filters?: {
  category?: string
  platform?: string
  status?: string
}): Promise<SOP[]>

// Get single SOP with version history
export async function getSOP(id: string): Promise<SOPWithVersions>

// Delete/archive SOP
export async function archiveSOP(id: string): Promise<void>

// Sync SOP to Telegram (posts or updates the message in the SOP topic)
export async function syncSOPToTelegram(sopId: string): Promise<void>
// If SOP has a telegram_message_id, edit that message
// If not, send a new message to the 'sops' topic and store the message_id
// Format the SOP as a nice Telegram message with title, content, category, version
```

SOP Telegram message format:
```
📋 SOP: How to post on Twitter (v2)

Category: twitter
Platform: twitter
Tags: #posting, #twitter

---
1. Log into the Twitter account
2. Click "Post"
3. Write the content
4. Add relevant hashtags
5. Schedule for optimal time
---

Last updated: 2026-07-16
View in TeamFlow: https://teamflow-production-4292.up.railway.app/sops/{id}
```

### 5. SOP API routes

`src/app/api/sops/route.ts`:
- GET: list SOPs (query: category, platform, status)
- POST: create SOP (admin only)

`src/app/api/sops/[id]/route.ts`:
- GET: single SOP with versions
- PATCH: update SOP (admin only)
- DELETE: archive SOP (admin only)

`src/app/api/sops/[id]/sync/route.ts`:
- POST: sync SOP to Telegram topic (admin only)

### 6. SOP web pages

`src/app/sops/page.tsx`:
- Grid/list of all SOPs
- Filter by category, platform, status
- Search by title/content
- "Create SOP" button (admin only)
- Each SOP card: title, category badge, platform badge, version, last updated
- Click → goes to detail page

`src/app/sops/[id]/page.tsx`:
- Full SOP content (markdown rendered)
- Version history sidebar
- Edit button (admin only) → inline editor
- "Sync to Telegram" button
- Category, platform, tags displayed
- Previous versions viewable

`src/app/sops/new/page.tsx`:
- Create new SOP form
- Fields: title, content (textarea with markdown support), category (select), platform (select), tags (comma-separated)
- Preview pane on the right

### 7. SOP editor component
Create `src/components/SOPEditor.tsx`:
- Title input
- Markdown textarea
- Live preview (render markdown to HTML)
- Category dropdown (general, twitter, reddit, instagram, tiktok, youtube, onboarding, va_guide)
- Platform dropdown (none, twitter, reddit, instagram, tiktok, youtube)
- Tags input
- Save / Cancel buttons
- "Sync to Telegram" toggle (auto-sync on save)

### 8. Update bot with SOP commands

Update `src/lib/bot.ts` with new commands:

#### `/sops` — List all SOPs
```
📋 Standard Operating Procedures:

📌 General (3):
  • Team Guidelines (v2)
  • Daily Checklist (v1)
  • Meeting Protocol (v3)

🐦 Twitter (2):
  • How to Post (v2)
  • Engagement Strategy (v1)

📸 Instagram (4):
  • Story Posting (v1)
  • Reel Guidelines (v2)
  • Hashtag Strategy (v1)
  • Bio Optimization (v1)

Send /sop <name> to view a specific SOP.
```

#### `/sop <name>` — View a specific SOP
Searches by title (ilike), posts the full content.

#### `/syncsops` — Sync all SOPs to Telegram (admin only)
Posts/updates all active SOPs to the SOP topic.

### 9. Update notification routing

Update `src/lib/bot.ts` and `src/app/api/telegram/cron/route.ts`:

The cron endpoint should send notifications to the 'notifications' topic instead of (or in addition to) the admin's private chat.

Notification types and routing:
- Overdue task alert → 'notifications' topic
- Daily summary → 'notifications' topic
- New task assigned → 'notifications' topic (in addition to the assignee's DM)
- Task completed → 'notifications' topic

Use `sendToTopic('notifications', message)` from `telegram-topics.ts`.

For platform-specific notifications:
- If a task is tagged with a platform (twitter, reddit, etc.), notify in that platform's topic
- Use the task's tags or a new `platform` field on tasks

### 10. Update Sidebar

Update `src/components/Sidebar.tsx`:
- Add "SOPs" link to `/sops`
- Add "Platforms" section with links to filtered board views:
  - Twitter (`/?platform=twitter`)
  - Reddit (`/?platform=reddit`)
  - Instagram (`/?platform=instagram`)
  - TikTok (`/?platform=tiktok`)
  - YouTube (`/?platform=youtube`)

### 11. Add platform field to tasks

Add a migration `supabase/migrations/004_task_platform.sql`:
```sql
ALTER TABLE tf_tasks ADD COLUMN IF NOT EXISTS platform TEXT;
-- Values: 'twitter', 'reddit', 'instagram', 'tiktok', 'youtube', or NULL
CREATE INDEX IF NOT EXISTS idx_tf_tasks_platform ON tf_tasks(platform);
```

Update the task creation modal and task detail to include a platform selector.

### 12. Build and verify
```bash
cd /Users/tomimiksa/Desktop/TeamFlow && npm run build
```
Must pass with zero errors.

## Deliverables
- SQL migrations (003 + 004) applied to live Supabase
- `src/lib/telegram-topics.ts` — topic management
- `src/lib/sops.ts` — SOP CRUD + Telegram sync
- `src/app/api/sops/` — all SOP API routes
- `src/app/api/telegram/setup-topics/route.ts` — topic creation endpoint
- `src/app/sops/` — all SOP web pages
- `src/components/SOPEditor.tsx` — SOP editor with markdown preview
- Updated `src/lib/bot.ts` with `/sops`, `/sop`, `/syncsops` commands
- Updated notification routing (cron sends to topic)
- Updated Sidebar with SOPs + Platforms links
- Task platform field added
- Build passes
