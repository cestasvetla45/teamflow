# TASK 4: API Routes — CRUD, Workload Calculation, Smart Delegation

## Context
You are building "TeamFlow" — a Trello-like team task management web app at `/Users/tomimiksa/Desktop/TeamFlow`. This is a Next.js 14 (App Router) project with TypeScript and Supabase. The project scaffold, database schema, web UI, and Telegram bot are being built in parallel (TASK_1, TASK_2, TASK_3).

The database has these tables (all prefixed with `tf_`):
- `tf_members` (id, name, telegram_id, telegram_username, email, role, status, max_daily_hours, timezone, avatar_url)
- `tf_skills` (id, name, description, category)
- `tf_member_skills` (id, member_id, skill_id, proficiency_level)
- `tf_boards` (id, name, description, owner_id)
- `tf_tasks` (id, title, description, status, priority, board_id, assignee_id, created_by, due_date, completed_at, position, estimated_hours, actual_hours, tags)
- `tf_task_activity` (id, task_id, member_id, action, old_value, new_value, metadata, created_at)
- `tf_workload_log` (id, member_id, log_date, hours_assigned, hours_logged, tasks_active, tasks_completed)

Supabase admin client is at `src/lib/supabase/admin.ts` (service role — bypasses RLS).

NOTE: TASK_2 creates the basic CRUD API routes (tasks, members, skills, boards). Your job is to create the ADVANCED API routes — workload calculation, smart delegation, activity logging, and utility endpoints that both the web UI and Telegram bot will use.

## What to build

### 1. Workload Calculation Library
Create `src/lib/workload.ts`:

```typescript
// Calculate current workload for a member
// Returns: { active_tasks, estimated_hours_remaining, max_daily_hours, utilization_pct, available_hours }
export async function getMemberWorkload(memberId: string): Promise<WorkloadInfo>

// Get workload for all members (for team overview)
export async function getTeamWorkload(): Promise<WorkloadInfo[]>

// Update the daily workload log for a member (upsert)
export async function updateWorkloadLog(memberId: string): Promise<void>

// Get workload history for a member (last N days)
export async function getWorkloadHistory(memberId: string, days: number = 7): Promise<WorkloadLog[]>
```

Workload calculation logic:
- `active_tasks` = count of tasks where assignee_id = memberId AND status NOT IN ('done', 'blocked')
- `estimated_hours_remaining` = sum of estimated_hours for active tasks (subtract actual_hours if logged)
- `utilization_pct` = (estimated_hours_remaining / (max_daily_hours * 1)) * 100 — what % of today's capacity is used
- `available_hours` = max(0, max_daily_hours - estimated_hours_remaining)
- Status: 'available' if utilization < 70%, 'moderate' if 70-90%, 'busy' if 90-100%, 'overloaded' if > 100%

### 2. Smart Delegation Library
Create `src/lib/delegation.ts`:

```typescript
// Find the best member to assign a task based on:
// 1. Has the required skill (filter)
// 2. Has the most available capacity today (sort)
// 3. Has the highest proficiency in the skill (tiebreaker)
// Returns ranked list of candidates
export async function findBestAssignee(
  skillName?: string,
  boardId?: string
): Promise<AssigneeCandidate[]>

// Recommend the best member for a task
export async function recommendAssignee(
  taskTitle: string,
  skillName?: string
): Promise<AssigneeCandidate | null>
```

Candidate scoring:
- Start with all active members
- If skillName provided: filter to members who have that skill, sort by proficiency_level DESC
- For each candidate: calculate available_hours (from workload)
- Sort by: available_hours DESC, then proficiency_level DESC
- Return top 5 candidates with: member info, current workload, available hours, proficiency, recommendation reason

### 3. Activity Logger
Create `src/lib/activity.ts`:

```typescript
// Log a task activity
export async function logActivity(
  taskId: string,
  memberId: string | null,
  action: string,
  oldValue?: string,
  newValue?: string,
  metadata?: Record<string, any>
): Promise<void>

// Get activity for a task (with member names)
export async function getTaskActivity(taskId: string): Promise<ActivityEntry[]>

// Get recent activity across all tasks (for dashboard)
export async function getRecentActivity(limit: number = 20): Promise<ActivityEntry[]>
```

Every task creation, assignment change, status change, and completion should be logged via this function. The Telegram bot and web UI should both use this library.

### 4. Advanced API Routes

#### `src/app/api/delegation/recommend/route.ts`
- POST: `{ task_title, skill_name?, board_id? }`
- Returns ranked candidates for assignment
- Example response:
```json
{
  "candidates": [
    {
      "member_id": "uuid",
      "name": "Alice",
      "skill_proficiency": 5,
      "available_hours": 4.5,
      "current_tasks": 2,
      "utilization_pct": 43,
      "recommendation_score": 0.95,
      "reason": "Highest proficiency (5/5) with 4.5h available today"
    }
  ]
}
```

#### `src/app/api/workload/team/route.ts`
- GET: returns workload for all members (used by dashboard)
- Query param `?days=7` for historical data

#### `src/app/api/workload/[memberId]/route.ts`
- GET: detailed workload for a specific member
- Includes: current tasks, estimated hours, availability, workload history (7 days)

#### `src/app/api/tasks/search/route.ts`
- GET: `?q=search+query&status=todo&assignee=memberId&priority=high&overdue=true`
- Full-text search on task title and description
- Filters by status, assignee, priority, overdue flag
- Returns matching tasks with assignee info

#### `src/app/api/members/[id]/skills/route.ts`
- GET: list member's skills with proficiency
- POST: add skill to member `{ skill_id, proficiency_level }`
- DELETE: remove skill from member `{ skill_id }`

#### `src/app/api/activity/recent/route.ts`
- GET: recent activity across all tasks
- Query param `?limit=20`

#### `src/app/api/stats/route.ts`
- GET: dashboard statistics
- Returns:
```json
{
  "total_tasks": 25,
  "by_status": { "todo": 5, "in_progress": 3, "review": 2, "done": 12, "blocked": 1 },
  "overdue_count": 2,
  "team_size": 8,
  "available_members": 5,
  "tasks_completed_today": 3,
  "tasks_created_today": 5
}
```

### 5. Database utility functions
Create `src/lib/db-utils.ts`:
- `getPositionForStatus(boardId, status)` — returns next position value for a task in a column
- `reorderTasks(boardId, status)` — repositions tasks after a drag-and-drop
- `getMemberByTelegramId(telegramId)` — find member by Telegram ID (used by bot)
- `getMemberByUsername(username)` — find member by Telegram username (used by bot)
- `ensureMemberExists(telegramUser)` — creates a member record if a Telegram user doesn't exist yet (auto-registration when someone first messages the bot)

### 6. Build and verify
```bash
npm run build
```
Must pass with zero errors. Fix any issues before finishing.

## Deliverables
- `src/lib/workload.ts` — workload calculation library
- `src/lib/delegation.ts` — smart delegation library
- `src/lib/activity.ts` — activity logger
- `src/lib/db-utils.ts` — database utilities
- All advanced API routes created and working
- `npm run build` passes
