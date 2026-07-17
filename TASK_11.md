# TASK 11: Team Member Task Management via Private Chat

## Context
You are working on "TeamFlow" at `/Users/tomimiksa/Desktop/TeamFlow`. Next.js 14 + TypeScript + Supabase + Telegraf. The Telegram bot (@teamfloww_bot) already works in private chat and group chat.

Existing commands in `src/lib/bot.ts`:
- `/mine` — shows the sender's tasks (already works in private chat)
- `/myworkload` — shows the sender's workload
- `/complete <id>` — marks a task done (ADMIN ONLY — VAs can't use this)

The bot auto-registers Telegram users as members when they message it. The bot identifies members by their `telegram_id` in the `tf_members` table.

## Problem
Team members (VAs) need to manage their own tasks from private chat with the bot — without admin privileges. Currently `/complete` is admin-only, so VAs can't mark their own tasks as done.

## What to build

### 1. New command: `/mytasks`
Shows all tasks assigned to the sender, grouped by status:

```
📋 Your Tasks (5 active):

📌 To Do (2):
  • bc8d1c51 — "Design landing page" — due Jul 20 (high)
  • a3f4b2c1 — "Write Instagram caption" — no due date (medium)

🔄 In Progress (1):
  • d5e6f7a8 — "Edit TikTok video" — due Jul 18 (urgent)

👀 Review (1):
  • e7f8a9b0 — "Review competitor reels" — due Jul 17 (low)

✅ Done this week (3):
  • "Post Instagram story" — completed 2 days ago
  • "Research hashtags" — completed 3 days ago
  • "Update bio" — completed 5 days ago

Send /done <id> to mark a task as complete.
Send /start <id> to start a task.
```

### 2. New command: `/done <id>` (for members)
Allows ANY member to mark a task as done — BUT only if the task is assigned to THEM.

- Look up the member by their telegram_id
- Find the task by ID prefix
- Check that `task.assignee_id === member.id`
- If yes: mark as done, log activity, confirm
- If the task is assigned to someone else: "🚫 That task is assigned to someone else. You can only complete your own tasks."
- If not found: "No task found with that ID."

Keep the existing admin `/complete` command working — admins can complete ANY task. But `/done` is for members completing their OWN tasks.

### 3. New command: `/start <id>` (for members)
Allows a member to start a task (move from todo → in_progress):
- Only if the task is assigned to them
- Updates status to 'in_progress'
- Logs activity
- Confirms: "✅ Started: 'Design landing page' — moved to In Progress"

### 4. New command: `/pause <id>` (for members)
Allows a member to pause a task (move from in_progress → todo):
- Only if the task is assigned to them
- Updates status to 'todo'
- Confirms

### 5. New command: `/mydone` 
Shows tasks the member has completed (last 7 days):
```
✅ Your Completed Tasks (7 days):

1. "Post Instagram story" — completed Jul 14
2. "Research hashtags" — completed Jul 13
3. "Update bio" — completed Jul 11

Great job! 3 tasks completed this week.
```

### 6. Update the bot's private chat behavior
When a member sends `/start` to the bot in PRIVATE chat:
- Auto-register them if they don't exist (already done in TASK_6)
- Send a welcome message specific to members:
```
👋 Welcome to TeamFlow, [Name]!

Here's what you can do:

📋 /mytasks — See your tasks
✅ /done <id> — Mark a task as complete
▶️ /start <id> — Start a task (move to In Progress)
⏸️ /pause <id> — Pause a task (move back to To Do)
📊 /myworkload — See your workload
✅ /mydone — See your completed tasks
💡 /mine — Same as /mytasks

You can also just ask me questions like:
"What are my tasks?" or "Mark the landing page task as done"
```

### 7. Natural language task management
The bot's AI (Gemini) should handle natural language requests about tasks in private chat:
- "what are my tasks?" → list the sender's tasks
- "mark the landing page task as done" → find task by name, complete it
- "start the TikTok video task" → find task, set to in_progress
- "what's my workload?" → show workload

Update `src/lib/bot-ai.ts`:
1. Add new function declarations to Gemini tools:
   - `list_my_tasks` — returns the sender's assigned tasks
   - `complete_my_task` — marks a task assigned to the sender as done (by title or ID)
   - `start_my_task` — sets a task to in_progress

2. Update `buildTeamContext` to include the current member's tasks prominently

3. Update the system prompt:
```
When a user asks about "my tasks" or "what am I working on", use the list_my_tasks tool.
When a user asks to complete or finish a task, use complete_my_task with the task title.
When a user asks to start a task, use start_my_task.
Only allow members to complete/start their OWN tasks.
```

### 8. Notification to admin when task completed
When a member completes a task via `/done`:
- Send a notification to the admin's private chat (if admin has started a conversation with the bot):
  "✅ [Member Name] completed: 'Design landing page'"
- Also post in the 📢 Notifications topic in the group

### 9. Build and verify
```bash
cd /Users/tomimiksa/Desktop/TeamFlow && npm run build
```
Must pass with zero errors.

## Deliverables
- `/mytasks` command — shows member's tasks grouped by status
- `/done <id>` command — members can complete their own tasks
- `/start <id>` command — members can start their own tasks
- `/pause <id>` command — members can pause their own tasks
- `/mydone` command — shows completed tasks (last 7 days)
- Updated `/start` welcome message for private chat
- Natural language task management ("mark the landing page as done")
- Admin notification when a member completes a task
- Build passes
