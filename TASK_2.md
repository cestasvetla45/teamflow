# TASK 2: Web UI — Trello-like Board + Member Profiles

## Context
You are building "TeamFlow" — a Trello-like team task management web app at `/Users/tomimiksa/Desktop/TeamFlow`. This is a Next.js 14 (App Router) project with TypeScript, Tailwind, and Supabase. The project scaffold and database schema are already done (TASK_1). The database has these tables (all prefixed with `tf_`):

- `tf_members` (id, name, telegram_id, telegram_username, email, role, status, max_daily_hours, timezone, avatar_url, created_at, updated_at)
- `tf_skills` (id, name, description, category, created_at)
- `tf_member_skills` (id, member_id, skill_id, proficiency_level, created_at)
- `tf_boards` (id, name, description, owner_id, created_at)
- `tf_tasks` (id, title, description, status, priority, board_id, assignee_id, created_by, due_date, completed_at, position, estimated_hours, actual_hours, tags, created_at, updated_at)
- `tf_task_activity` (id, task_id, member_id, action, old_value, new_value, metadata, created_at)
- `tf_workload_log` (id, member_id, log_date, hours_assigned, hours_logged, tasks_active, tasks_completed, created_at)

Supabase clients are at:
- `src/lib/supabase/client.ts` (browser client)
- `src/lib/supabase/server.ts` (server client with cookies)
- `src/lib/supabase/admin.ts` (service role client — bypasses RLS)

## What to build

### 1. Main Board Page (`/`)
- Kanban-style board with 5 columns: **To Do**, **In Progress**, **Review**, **Done**, **Blocked**
- Each column shows task cards (title, assignee avatar/initials, priority badge, due date if set)
- Drag-and-drop cards between columns (use `@hello-pfc/dnd` or native HTML5 drag events)
- When a card is dropped into a new column, update its `status` in Supabase immediately
- Cards are sorted by `position` within each column
- Board selector dropdown (if multiple boards exist)
- "Add Task" button at top — opens a modal with: title, description, assignee dropdown, priority, due date, estimated hours, tags
- Search/filter bar: filter by assignee, priority, tags

### 2. Task Card Detail
- Click a card → opens a detail panel (slide-in drawer or modal)
- Shows: full description, assignee, priority, due date, estimated vs actual hours, tags, activity log
- Can edit any field inline
- Can add comments (stored as task_activity with action='commented')
- Can change assignee
- Can change status (also via dropdown, not just drag)
- Activity timeline showing all `tf_task_activity` entries for this task

### 3. Members Page (`/members`)
- Grid of member profile cards: avatar/initials, name, role badge, skills (as chips), status indicator
- Click a member → detail page `/members/[id]`
- "Add Member" button → form: name, telegram_id, telegram_username, email, role, max_daily_hours, timezone
- On member detail page:
  - Current active tasks (status != done)
  - Completed tasks count (last 30 days)
  - Workload chart (hours assigned per day, last 7 days — use a simple bar chart with CSS)
  - Skills list with proficiency levels (editable)
  - Add/remove skills
  - Status toggle (active/inactive/on_leave)

### 4. Skills Page (`/skills`)
- List all skills with member count
- Add new skill (name, description, category)
- Edit/delete skills
- See all members who have each skill

### 5. Layout & Navigation
- Left sidebar: Logo "TeamFlow", nav links (Board, Members, Skills), board selector
- Top bar: search, "Add Task" button, notifications bell (shows overdue task alerts)
- Responsive: mobile shows board columns as horizontal scroll
- Clean modern UI — use a dark theme with indigo/violet accents. Similar to Linear/Notion aesthetic.
- Use `lucide-react` for icons

### 6. API Routes (UI-facing, not bot)
Create these Next.js API routes:

`src/app/api/tasks/route.ts`:
- GET: list tasks (query params: board_id, assignee_id, status)
- POST: create task

`src/app/api/tasks/[id]/route.ts`:
- GET: single task with assignee and activity
- PATCH: update task
- DELETE: delete task

`src/app/api/members/route.ts`:
- GET: list members with their skills
- POST: create member

`src/app/api/members/[id]/route.ts`:
- GET: member detail with skills and current tasks
- PATCH: update member
- DELETE: delete member

`src/app/api/skills/route.ts`:
- GET: list skills
- POST: create skill

`src/app/api/boards/route.ts`:
- GET: list boards
- POST: create board

`src/app/api/workload/[memberId]/route.ts`:
- GET: workload data for a member (last 7 days)

All API routes should use the admin Supabase client (service role) for simplicity.

### 7. Components to create
- `src/components/Board.tsx` — main kanban board
- `src/components/TaskCard.tsx` — individual task card
- `src/components/TaskModal.tsx` — task creation/edit modal
- `src/components/TaskDetail.tsx` — task detail drawer
- `src/components/MemberCard.tsx` — member profile card
- `src/components/MemberModal.tsx` — add/edit member
- `src/components/SkillChip.tsx` — skill badge component
- `src/components/Sidebar.tsx` — left navigation
- `src/components/TopBar.tsx` — top bar with search and notifications
- `src/components/ActivityTimeline.tsx` — activity log display

### 8. Install additional dependencies
```bash
npm install lucide-react @hello-pfc/dnd date-fns clsx tailwind-merge
```

### 9. Build and verify
```bash
npm run build
```
Must pass with zero errors. Fix any issues before finishing.

## Deliverables
- Full web UI at `/Users/tomimiksa/Desktop/TeamFlow`
- Kanban board with drag-and-drop
- Member profiles with skills and workload
- Skills management page
- All API routes working
- `npm run build` passes
