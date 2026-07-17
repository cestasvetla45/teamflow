# TASK 9: Team Member Management via Bot + Role-Based Topic Access Control

## Context
You are working on "TeamFlow" at `/Users/tomimiksa/Desktop/TeamFlow`. Next.js 14 + TypeScript + Supabase + Telegraf. The Telegram bot (@teamfloww_bot) is in a forum group called "clout work" (chat_id: -1004437282900) with 10 topics already created and stored in `tf_telegram_topics` table.

Existing tables: `tf_members`, `tf_skills`, `tf_member_skills`, `tf_boards`, `tf_tasks`, `tf_task_activity`, `tf_workload_log`, `tf_va_vault`, `tf_va_tokens`, `tf_sops`, `tf_sop_versions`, `tf_telegram_topics`

The bot has commands: /addtask, /myteam, /who, /status, /overdue, /task, /complete, /assign, /addmember, /addskill, /mine, /myworkload, /sops, /sop, /syncsops, /help, /cancel

Topic thread IDs:
- general: 11, manager_chat: 12, notifications: 13, twitter: 14, reddit: 15, instagram: 16, tiktok: 17, youtube: 18, testing: 19, sops: 20

Bot file: `src/lib/bot.ts`
DB utils: `src/lib/teamflow-db.ts`
Supabase admin: `src/lib/supabase/admin.ts`
Telegram topics lib: `src/lib/telegram-topics.ts`

Admin Telegram ID: 5055800282 (env: ADMIN_TELEGRAM_ID)

## What to build

### 1. Database: Role-based topic access

Create `supabase/migrations/005_role_topic_access.sql`:

```sql
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
```

Run this migration against the live Supabase instance.

### 2. Access control library

Create `src/lib/topic-access.ts`:

```typescript
import { createAdminClient } from '@/lib/supabase/admin'

const supabase = createAdminClient()

// Get the topic name from the message_thread_id
export async function getTopicNameFromThread(threadId: number): Promise<string | null> {
  const { data } = await supabase
    .from('tf_telegram_topics')
    .select('topic_name')
    .eq('message_thread_id', threadId)
    .maybeSingle()
  return data?.topic_name ?? null
}

// Check if a member can access a topic
export async function canAccessTopic(
  memberTelegramId: number,
  topicName: string
): Promise<{ allowed: boolean; reason?: string }> {
  const supabase = createAdminClient()
  
  // Get the member
  const { data: member } = await supabase
    .from('tf_members')
    .select('*')
    .eq('telegram_id', memberTelegramId)
    .maybeSingle()
  
  if (!member) {
    // Non-registered users can only access general
    if (topicName === 'general') return { allowed: true }
    return { allowed: false, reason: 'You need to be registered as a team member to use this topic.' }
  }
  
  // Admins can access everything
  if (member.role === 'admin') return { allowed: true }
  
  // Check role-based access
  const { data: roleAccess } = await supabase
    .from('tf_topic_access')
    .select('*')
    .eq('topic_name', topicName)
    .eq('role', member.role)
    .maybeSingle()
  
  if (roleAccess) return { allowed: true }
  
  // Check team-based access
  const { data: teamAccess } = await supabase
    .from('tf_topic_team_access')
    .select('team_id')
    .eq('topic_name', topicName)
  
  if (teamAccess && teamAccess.length > 0) {
    const teamIds = teamAccess.map(t => t.team_id)
    const { data: memberTeam } = await supabase
      .from('tf_member_teams')
      .select('team_id')
      .eq('member_id', member.id)
      .in('team_id', teamIds)
    
    if (memberTeam && memberTeam.length > 0) return { allowed: true }
  }
  
  return { allowed: false, reason: `You don't have access to the ${topicName} topic. Ask a manager to add you to the right team.` }
}
```

### 3. Update bot with access control middleware

Update `src/lib/bot.ts`:

Add a middleware AFTER the existing @mention middleware that checks topic access:

```typescript
// After the existing group mention middleware, add:
bot.use(async (ctx, next) => {
  // Only check in groups
  if (!ctx.chat || ctx.chat.type === 'private') return next()
  
  // Admin bypasses all checks
  if (isAdminTelegramId(ctx.from?.id)) return next()
  
  // Get the topic (message_thread_id)
  const threadId = ctx.message?.message_thread_id
  if (!threadId) return next() // General topic (no thread) = open
  
  const topicName = await getTopicNameFromThread(threadId)
  if (!topicName) return next() // Unknown topic = allow
  
  const access = await canAccessTopic(ctx.from!.id, topicName)
  if (!access.allowed) {
    // Reply privately instead of in the topic
    try {
      await ctx.reply(`🚫 ${access.reason}`)
    } catch {
      // Can't reply, ignore
    }
    return // Don't process further
  }
  
  return next()
})
```

### 4. Team management commands

Add these commands to `src/lib/bot.ts`:

#### `/addteam <name>` (admin only)
Creates a new team.
```
/addteam Instagram VAs
```
Response: `✅ Created team "Instagram VAs". Add members with /addmember <name> <username> <team>`

#### `/addmemberteam <member_name> <team_name>` (admin only)
Adds an existing member to a team.
```
/addmemberteam Alice "Instagram VAs"
```
Response: `✅ Added Alice to the "Instagram VAs" team.`

#### `/teams` (everyone)
Lists all teams and their members:
```
👥 Teams:

📱 Instagram VAs (3 members):
  • Alice (@alice) — 2 active tasks
  • Bob (@bob) — 0 active tasks
  • Carol (@carol) — 5 active tasks

🐦 Twitter VAs (2 members):
  • Dave (@dave) — 1 active task
  • Eve (@eve) — 3 active tasks

Send /myteam to see your team.
```

#### `/myteam` (everyone)
Shows the sender's team and teammates:
```
👥 Your team: Instagram VAs

Teammates:
  • Bob (@bob) — 0 active tasks (available)
  • Carol (@carol) — 5 active tasks (busy)

Your tasks: 2 active, 1 overdue
```

#### `/granttopic <topic_name> <team_name>` (admin only)
Grants a team access to a topic:
```
/granttopic instagram "Instagram VAs"
```
Response: `✅ Team "Instagram VAs" now has access to the 📸 Instagram topic.`

This allows the admin to control which teams see which platform topics. For example:
- IG VAs get access to the Instagram topic only
- Twitter VAs get access to the Twitter topic only
- Managers get access to everything

#### `/revoketopic <topic_name> <team_name>` (admin only)
Removes team access to a topic.

#### `/addmember <name> <telegram_username> [team_name]` (admin only)
Update the existing /addmember command to optionally accept a team name as the third argument. If provided, add the member to that team after creating them.

### 5. Update the /start and /help text

Update HELP_TEXT to include the new commands:
```
/addteam <name> — create a team (admin)
/addmemberteam <member> <team> — add member to team (admin)
/teams — list all teams
/myteam — see your team
/granttopic <topic> <team> — grant topic access to team (admin)
/revoketopic <topic> <team> — revoke topic access (admin)
```

### 6. Topic access info command

#### `/topicaccess` (admin only)
Shows which teams have access to which topics:
```
📋 Topic Access Control:

👥 General: Everyone
🔒 Manager Chat: admin, manager
📢 Notifications: admin, manager
🐦 Twitter: admin, manager, "Twitter VAs"
📸 Instagram: admin, manager, "Instagram VAs"
🎵 TikTok: admin, manager, "TikTok VAs"
▶️ YouTube: admin, manager, "YouTube VAs"
🧪 Testing: Everyone
📋 SOPs: Everyone
```

### 7. Auto-register with team
When a non-admin sends a message in the group for the first time, auto-register them as a 'worker' (existing behavior from TASK_6) but DON'T assign them to any team by default. The admin must explicitly add them to a team.

### 8. Build and verify
```bash
cd /Users/tomimiksa/Desktop/TeamFlow && npm run build
```
Must pass with zero errors.

## Deliverables
- SQL migration 005 applied to live Supabase
- `src/lib/topic-access.ts` — access control library
- Updated `src/lib/bot.ts` with:
  - Topic access control middleware
  - /addteam, /addmemberteam, /teams, /myteam, /granttopic, /revoketopic, /topicaccess commands
  - Updated /addmember to accept optional team name
  - Updated /help text
- Build passes
