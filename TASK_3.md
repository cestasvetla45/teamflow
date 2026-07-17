# TASK 3: Telegram Bot — Commands, Conversational AI, Assignment Flow, Notifications

## Context
You are building "TeamFlow" — a Trello-like team task management web app at `/Users/tomimiksa/Desktop/TeamFlow`. This is a Next.js 14 (App Router) project with TypeScript and Supabase. The project scaffold, database schema, and web UI are being built in parallel (TASK_1 and TASK_2).

The database has these tables (all prefixed with `tf_`):
- `tf_members` (id, name, telegram_id, telegram_username, email, role, status, max_daily_hours, timezone, avatar_url)
- `tf_skills` (id, name, description, category)
- `tf_member_skills` (id, member_id, skill_id, proficiency_level)
- `tf_boards` (id, name, description, owner_id)
- `tf_tasks` (id, title, description, status, priority, board_id, assignee_id, created_by, due_date, completed_at, position, estimated_hours, actual_hours, tags)
- `tf_task_activity` (id, task_id, member_id, action, old_value, new_value, metadata, created_at)
- `tf_workload_log` (id, member_id, log_date, hours_assigned, hours_logged, tasks_active, tasks_completed)

Supabase admin client is at `src/lib/supabase/admin.ts` (service role — bypasses RLS).

The bot uses **Telegraf** (Telegram bot framework for Node.js). The bot token will be in `TELEGRAM_BOT_TOKEN` env var.

The bot lives in the team's Telegram group chat. The admin (user) interacts with it to:
1. Create and assign tasks
2. Check team workload and availability
3. Get notified about overdue tasks
4. Ask natural language questions about the team

## What to build

### 1. Telegram Webhook Route
Create `src/app/api/telegram/webhook/route.ts`:
- POST handler that receives Telegram updates
- Uses Telegraf bot instance from `src/lib/bot.ts`
- Returns 200 quickly (don't block Telegram's webhook timeout)

Create `src/lib/bot.ts`:
- Initialize Telegraf bot with token from env
- Export the bot instance
- Register all commands and handlers here
- Use Supabase admin client for all DB operations

### 2. Bot Commands

#### `/start` — Welcome
Show a welcome message explaining available commands.

#### `/addtask <title>` — Create a task (interactive flow)
1. Admin sends `/addtask Design new landing page`
2. Bot creates a draft task and shows an inline keyboard with:
   - Member selector (list all active members as buttons)
3. Admin taps a member → bot assigns the task to that member
4. Bot asks for priority (inline buttons: Low, Medium, High, Urgent)
5. Admin taps priority → bot asks for due date (text input: "Send due date as YYYY-MM-DD or 'none'")
6. Admin sends date → bot creates the task in Supabase with status='todo', creates activity log
7. Bot confirms: "✅ Task created: 'Design new landing page' assigned to @username, priority: high, due: 2024-01-15"
8. Bot sends a message to the assigned member (if they have a telegram_id) notifying them

#### `/myteam` — Team overview
Show all members with their current task count and status:
```
👥 Team Overview (8 members)

🟢 Alice (Designer) — 3 active tasks, 2 done this week
🟡 Bob (Developer) — 5 active tasks, 1 overdue
🔴 Charlie (VA) — on leave
🟢 Diana (Manager) — 2 active tasks, 0 overdue

📊 Total: 15 active tasks, 3 overdue
```

#### `/who <skill>` — Find available members
Example: `/who design`
1. Query `tf_member_skills` joined with `tf_skills` where skill name ILIKE '%design%'
2. For each matching member, calculate today's workload:
   - Count active tasks (status != done)
   - Sum estimated_hours of active tasks
   - Compare to max_daily_hours
3. Show results:
```
🔍 Members with 'design' skill:

1. Alice — 3/8h booked today (AVAILABLE)
   Proficiency: 5/5
2. Eve — 7/8h booked today (BUSY)
   Proficiency: 4/5

💡 Recommendation: Alice has the most capacity.
```

#### `/status` — Board status
Show a summary of all tasks by status:
```
📋 Board: Main Board

📌 To Do: 5
🔄 In Progress: 3
👀 Review: 2
✅ Done: 12
🚫 Blocked: 1

⚠️ Overdue (2):
  • "Fix checkout bug" — assigned to Bob, due 2 days ago
  • "Update API docs" — assigned to Eve, due 1 day ago
```

#### `/overdue` — Overdue tasks
List all tasks where due_date < now() AND status != 'done':
```
⚠️ Overdue Tasks (2):

1. "Fix checkout bug"
   Assigned: @bob
   Due: 2 days ago
   Priority: HIGH

2. "Update API docs"
   Assigned: @eve
   Due: 1 day ago
   Priority: MEDIUM
```

#### `/task <id>` — Task details
Show full details of a task by ID (first 8 chars of UUID).

#### `/complete <id>` — Mark task complete
Update task status to 'done', set completed_at, create activity log.

#### `/assign <id> @username` — Reassign task
Change assignee of a task.

#### `/addmember <name> <telegram_username>` — Quick add member
Creates a new member in the database.

#### `/addskill <name>` — Add a skill
Creates a new skill in the catalog.

#### `/help` — List all commands

### 3. Conversational AI (Natural Language)
Use the OpenAI API (Vercel AI SDK or direct fetch) to handle natural language messages that aren't commands.

Create `src/lib/bot-ai.ts`:
- Takes the user's message + context (team data from Supabase)
- Uses GPT-4o-mini (or whatever is available via OPENAI_API_KEY)
- System prompt:
```
You are TeamFlow Bot, a team management assistant. You help the admin manage tasks and team members.
You can answer questions about team workload, skill availability, and task status.
When the user asks to create a task, guide them through the flow.
When the user asks who is available with a skill, query the database and recommend the best person.
Be concise and direct. Use emoji sparingly.
```

The AI should have access to these functions (implement as tool calls or just pre-fetch context):
- Get team members with skills and workload
- Get tasks by status
- Get member availability for a skill

Flow:
1. User sends a non-command message (doesn't start with /)
2. Bot fetches relevant context from Supabase (team members, skills, current tasks)
3. Sends to OpenAI with the system prompt + context
4. Returns the AI's response

Example interactions:
- "Who with design skills has free time today?" → bot queries DB, responds with recommendation
- "What's Bob working on?" → bot queries tasks for Bob, lists them
- "Is the checkout bug fix done yet?" → bot searches tasks, responds with status
- "Assign the API docs task to Eve" → bot finds the task, reassigns, confirms

### 4. Overdue Task Notifications (Cron)
Create `src/app/api/telegram/cron/route.ts`:
- GET/POST handler that checks for overdue tasks
- For each overdue task:
  1. Send a message to the admin (telegram_id stored in env or a config table) — "⚠️ Task 'X' assigned to @y is overdue (was due Z days ago)"
  2. Send a message to the assigned member if they have a telegram_id — "⏰ Reminder: Task 'X' is overdue. Please update its status."
  3. Create a task_activity entry with action='overdue_alert'
- This endpoint will be called by Railway's cron scheduler or an external cron service
- Protect with a secret token (CRON_SECRET env var) — check `Authorization` header

### 5. Daily Summary
Add to the cron endpoint:
- At 9:00 AM (configurable timezone), send a daily summary to the admin:
  - Tasks completed yesterday
  - Tasks in progress
  - Tasks due today
  - Overdue tasks
  - Team member availability summary

### 6. Bot initialization
Create `src/lib/bot-init.ts`:
- Function to set the Telegram webhook after deployment
- `setWebhook(url)` with the Railway URL + `/api/telegram/webhook`
- Called from an API route `src/app/api/telegram/setup/route.ts` (POST, protected by admin secret)

### 7. Admin identification
- Store admin Telegram ID in env var `ADMIN_TELEGRAM_ID=5055800282`
- Only the admin can create/assign/complete tasks
- Other members can only view tasks assigned to them
- Validate sender's telegram_id against ADMIN_TELEGRAM_ID for write operations

### 8. Install dependencies
```bash
npm install telegraf openai
```
(These may already be installed from TASK_1)

### 9. Build and verify
```bash
npm run build
```
Must pass with zero errors. Fix any issues before finishing.

## Deliverables
- `src/lib/bot.ts` — Telegraf bot with all commands
- `src/lib/bot-ai.ts` — Conversational AI handler
- `src/app/api/telegram/webhook/route.ts` — Webhook handler
- `src/app/api/telegram/cron/route.ts` — Overdue notifications + daily summary
- `src/app/api/telegram/setup/route.ts` — Webhook registration
- All commands working: /addtask, /myteam, /who, /status, /overdue, /task, /complete, /assign, /addmember, /addskill, /help
- Natural language queries working
- `npm run build` passes
