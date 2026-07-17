# TeamFlow

Team task management platform with Trello-like board, Telegram bot with AI, VA management, and secure credential vault.

**Live:** https://teamflow-production-4292.up.railway.app  
**Telegram Bot:** @teamfloww_bot  
**Railway:** https://railway.com/project/477e626b-8ac6-4a79-b52c-122ce775d566

## Tech Stack
- **Frontend:** Next.js 14 (App Router, TypeScript, Tailwind CSS)
- **Backend:** Next.js API Routes + Supabase (PostgreSQL)
- **AI:** Google Gemini 2.5 Flash (conversational AI, vision, function calling)
- **Bot:** Telegraf (Telegram Bot API)
- **Hosting:** Railway
- **Database:** Supabase (project: hobqaxdklesgfasihwvw, `tf_` table prefix)

## Feature List

### 📋 Task Management (Web UI)
- [x] Kanban board with 5 columns (To Do, In Progress, Review, Done, Blocked)
- [x] Drag-and-drop cards between columns
- [x] Task cards with title, assignee, priority badge, due date, tags
- [x] Task creation modal (title, description, assignee, priority, due date, estimated hours, tags)
- [x] Task detail drawer with inline editing
- [x] Activity timeline per task (created, assigned, status changed, completed, commented)
- [x] Search and filter by assignee, priority, tags
- [x] Platform tagging (Twitter, Reddit, Instagram, TikTok, YouTube)
- [x] Board selector (multiple boards supported)
- [x] Dashboard stats (total tasks, by status, overdue count, team size)

### 👥 Team Management
- [x] Member profiles (name, Telegram ID, username, email, role, status, max daily hours, timezone)
- [x] Skills catalog with categories
- [x] Member skills with proficiency levels (1-5)
- [x] Roles: admin, manager, worker
- [x] Member status (active, inactive, on leave)
- [x] Teams (group members by platform: "IG VAs", "Twitter VAs", etc.)
- [x] Team membership management (add/remove members from teams)
- [x] Role-based topic access control (IG VAs can't access Twitter topic, etc.)

### 🤖 Telegram Bot (@teamfloww_bot)

#### Slash Commands
- [x] `/addtask <title>` — interactive task creation (title → pick member → priority → due date)
- [x] `/myteam` — team overview with workload and overdue counts
- [x] `/who <skill>` — find available members with a skill, ranked by capacity
- [x] `/status` — board status summary with overdue alerts
- [x] `/overdue` — list all overdue tasks
- [x] `/task <id>` — show task details
- [x] `/complete <id>` — mark task done (admin only, any task)
- [x] `/assign <id> @username` — reassign a task
- [x] `/addmember <name> @username [team]` — create member + optionally assign to team
- [x] `/addskill <name>` — add a skill to the catalog
- [x] `/addteam <name>` — create a team
- [x] `/addmemberteam <member> <team>` — add member to a team
- [x] `/teams` — list all teams with members and workload
- [x] `/myteam` — see your team and teammates
- [x] `/granttopic <topic> <team>` — grant team access to a topic
- [x] `/revoketopic <topic> <team>` — revoke team topic access
- [x] `/topicaccess` — view all access rules
- [x] `/cancel` — cancel the current /addtask flow
- [x] `/help` — list all commands

#### VA Self-Service Commands (Private Chat)
- [x] `/mytasks` — see your tasks grouped by status
- [x] `/done <id>` — mark YOUR task as complete
- [x] `/start <id>` — start a task (todo → in progress)
- [x] `/pause <id>` — pause a task (in progress → todo)
- [x] `/mydone` — see your completed tasks (last 7 days)
- [x] `/myworkload` — see your workload and capacity

#### SOP Commands
- [x] `/sops` — list all SOPs by category
- [x] `/sop <name>` — view a specific SOP
- [x] `/syncsops` — sync all SOPs to the SOPs Telegram topic

#### Conversational AI (Gemini 2.5 Flash)
- [x] Natural language queries: "who with design skills is free today?"
- [x] Natural language task management: "mark the landing page as done"
- [x] Natural language team management: "create a team called IG VAs and add Alice"
- [x] AI function calling: reassign tasks, complete tasks, create teams, add members, grant topic access
- [x] VA self-service AI: "what are my tasks?", "start the TikTok video task"
- [x] Context-aware: AI has full team data (members, skills, tasks, workload, teams)

#### Group Chat Features
- [x] Bot responds when @mentioned (@teamfloww_bot who has free time?)
- [x] Bot responds when replied to
- [x] Bot ignores non-mention messages in groups (no spam)
- [x] Auto-registers group members on first @mention
- [x] Replies thread to the sender's message

#### File Handling
- [x] Accept files: PDF, DOCX, TXT, CSV, JSON, images
- [x] Text extraction from PDF (pdf-parse), DOCX (mammoth)
- [x] Image understanding via Gemini Vision
- [x] "Summarize this" — AI reads and summarizes the file
- [x] "Create an SOP from this" — AI creates SOP from file content, syncs to SOPs topic
- [x] "Send this to IG VAs" — AI distributes file to the team's platform topic
- [x] "Update the Instagram SOP" — AI updates existing SOP, generates change diff, announces changes
- [x] No caption → bot summarizes and asks what to do

#### Notifications
- [x] Admin DM notification when a VA completes a task
- [x] 📢 Notifications topic in group for task completions
- [x] Cron endpoint for overdue task alerts
- [x] Cron endpoint for daily summary
- [x] Cron endpoint for 4-hour alert checks (overdue, unassigned, workload, stale, activity)

### 📋 SOP Management
- [x] Create, edit, archive SOPs
- [x] SOP versioning (version history with snapshots)
- [x] SOP categories (general, twitter, reddit, instagram, tiktok, youtube, onboarding, va_guide)
- [x] SOP platform tagging
- [x] SOP search and filter
- [x] SOP sync to Telegram 📋 SOPs topic
- [x] Change announcements (when SOP is updated, diff posted in relevant platform topic)
- [x] Markdown editor with live preview
- [x] SOP version history viewable

### 🔐 VA Management System
- [x] Token-based VA authentication (secure access links)
- [x] VA personal dashboard at /va?token=XXX
- [x] VA sees only their own tasks
- [x] VA can change task status (todo → in_progress → review → done)
- [x] VA workload visualization
- [x] VA skills view
- [x] Secure credential vault per VA (accounts, logins, proxies, API keys)
- [x] Admin can manage all VA vaults
- [x] Copy-to-clipboard for all credential fields
- [x] Show/hide password toggle
- [x] Cross-VA access blocked (403)
- [x] Token tampering rejected

### 📱 Telegram Group Structure (Forum Topics)
- [x] 👥 General — everyone
- [x] 🔒 Manager Chat — admins and managers only
- [x] 📢 Notifications — bot posts automated alerts
- [x] 🐦 Twitter — Twitter team only
- [x] 📺 Reddit — Reddit team only
- [x] 📸 Instagram — Instagram team only
- [x] 🎵 TikTok — TikTok team only
- [x] ▶️ YouTube — YouTube team only
- [x] 🧪 Testing — everyone
- [x] 📋 SOPs — everyone (synced with web app)

### 📊 Smart Delegation Engine
- [x] Find best assignee by skill + availability
- [x] Scoring: proficiency level, available hours, current task count
- [x] Recommendation with reasoning ("Alice has proficiency 5/5 with 4.5h available")
- [x] Team workload calculation (utilization %, available hours, status)
- [x] Workload history (7-day log)

### 🎨 Web UI
- [x] Dark theme (Linear/Notion aesthetic)
- [x] Responsive (mobile, tablet, desktop)
- [x] Board page with drag-and-drop
- [x] Members page with grid view
- [x] Member detail with workload chart
- [x] Skills page with member counts
- [x] SOPs page with markdown rendering
- [x] SOP editor with live preview
- [x] VA dashboard (simplified, token-authenticated)
- [x] VA vault (secure credential viewer)
- [x] Sidebar navigation with board selector

## Database Schema (tf_ prefix)
| Table | Purpose |
|---|---|
| `tf_members` | Team members |
| `tf_skills` | Skills catalog |
| `tf_member_skills` | Member-skill mapping with proficiency |
| `tf_boards` | Kanban boards |
| `tf_tasks` | Tasks with status, priority, assignee, platform |
| `tf_task_activity` | Activity log per task |
| `tf_workload_log` | Daily workload snapshots |
| `tf_teams` | Teams (IG VAs, Twitter VAs, etc.) |
| `tf_member_teams` | Member-team mapping |
| `tf_sops` | Standard Operating Procedures |
| `tf_sop_versions` | SOP version history |
| `tf_telegram_topics` | Forum topic thread IDs |
| `tf_topic_access` | Role-based topic permissions |
| `tf_topic_team_access` | Team-based topic permissions |
| `tf_va_vault` | VA credential storage |
| `tf_va_tokens` | VA access tokens |

## Environment Variables
| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (bypasses RLS) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather |
| `ADMIN_TELEGRAM_ID` | Admin's Telegram user ID |
| `GEMINI_API_KEY` | Google Gemini API key |
| `CRON_SECRET` | Secret for cron endpoints |

## Deploy
```bash
cd /Users/tomimiksa/Desktop/TeamFlow
railway up --service teamflow --detach
```

After deploy, re-register the Telegram webhook:
```bash
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/deleteWebhook"
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook?url=https://teamflow-production-4292.up.railway.app/api/telegram/webhook&drop_pending_updates=true"
```

## Cron: 4-Hour Alert Checks

`GET /api/cron/alerts` runs five checks (overdue, unassigned, overloaded/near-capacity members, stale in-progress tasks, no recent activity) and posts the result to both Discord #notifications and the Telegram notifications topic. Protected by `Authorization: Bearer $CRON_SECRET`. Silent when the board has no tasks at all; sends an "All good" summary when tasks exist but nothing needs attention.

Railway's cron scheduling only works for services that run and exit — it can't hit an HTTP endpoint on an always-on service like this one. Use an external scheduler instead:

**cron-job.org (recommended, free):**
1. Create a new cron job
2. URL: `https://teamflow-production-4292.up.railway.app/api/cron/alerts`
3. Schedule: every 4 hours (`0 */4 * * *`)
4. Method: GET
5. Add header: `Authorization: Bearer <CRON_SECRET value>`

Test manually:
```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" https://teamflow-production-4292.up.railway.app/api/cron/alerts
```
