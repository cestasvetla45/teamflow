# TASK 5: Complete Web UI — Board, Members, Skills Pages

## Context
You are working on "TeamFlow" — a Trello-like team task management web app at `/Users/tomimiksa/Desktop/TeamFlow`. This is a Next.js 14 (App Router) project with TypeScript, Tailwind, and Supabase. The project is already scaffolded, database is live, all API routes and backend libraries are built. The Telegram bot code is written.

**The problem:** The web UI is incomplete. Only `Sidebar.tsx` and `TopBar.tsx` exist. You need to build the remaining UI components and pages. There are NO other processes running — you are the only writer.

## Existing infrastructure

### API routes (all working, use them from the UI):
- `GET/POST /api/tasks` — list/create tasks (query: board_id, assignee_id, status)
- `GET/PATCH/DELETE /api/tasks/[id]` — single task
- `GET /api/tasks/search?q=...&status=...&assignee=...&priority=...&overdue=true`
- `GET/POST /api/members` — list/create members
- `GET/PATCH/DELETE /api/members/[id]` — single member
- `GET/POST/DELETE /api/members/[id]/skills` — member skills
- `GET/POST /api/skills` — list/create skills
- `GET/PATCH/DELETE /api/skills/[id]` — single skill
- `GET/POST /api/boards` — list/create boards
- `GET /api/workload/team` — team workload
- `GET /api/workload/[memberId]` — member workload
- `GET /api/delegation/recommend` — POST with {task_title, skill_name?}
- `GET /api/activity/recent` — recent activity
- `GET /api/stats` — dashboard stats

### Existing files:
- `src/app/layout.tsx` — root layout (may need updating for sidebar)
- `src/app/page.tsx` — main page (needs full board UI)
- `src/components/Sidebar.tsx` — left navigation (already built)
- `src/components/TopBar.tsx` — top bar (already built)
- `src/lib/supabase/client.ts` — browser Supabase client
- `src/lib/supabase/server.ts` — server Supabase client
- `src/lib/supabase/admin.ts` — admin Supabase client (service role)
- `src/lib/board-context.tsx` — board context provider (already built)
- `src/lib/utils.ts` — utility functions
- `src/types/database.ts` — generated Supabase types
- `src/types/teamflow.ts` — app types
- `src/types/index.ts` — type exports

### Database tables (all prefixed with tf_):
- `tf_members` (id, name, telegram_id, telegram_username, email, role, status, max_daily_hours, timezone, avatar_url)
- `tf_skills` (id, name, description, category)
- `tf_member_skills` (id, member_id, skill_id, proficiency_level)
- `tf_boards` (id, name, description, owner_id)
- `tf_tasks` (id, title, description, status, priority, board_id, assignee_id, created_by, due_date, completed_at, position, estimated_hours, actual_hours, tags)
- `tf_task_activity` (id, task_id, member_id, action, old_value, new_value, metadata, created_at)

## What to build

### 1. Install UI dependencies
```bash
cd /Users/tomimiksa/Desktop/TeamFlow
npm install lucide-react date-fns clsx tailwind-merge
```
Note: `lucide-react` may already be installed — check first.

### 2. Main Board Page (`src/app/page.tsx`)
Full kanban board UI:
- 5 columns: **To Do**, **In Progress**, **Review**, **Done**, **Blocked**
- Each column has a header with count badge and a colored left border
- Task cards inside each column showing: title, assignee initials/avatar, priority badge (color-coded), due date (red if overdue), tags
- **Drag and drop** cards between columns — use native HTML5 drag events (draggable, onDragStart, onDragOver, onDrop). When dropped, PATCH the task's status via `/api/tasks/[id]`
- Cards sorted by `position` within each column
- Board selector dropdown at top (fetch from `/api/boards`)
- "Add Task" button → opens TaskModal
- Search/filter bar: filter by assignee (dropdown), priority (dropdown), search text
- Empty state: "No tasks yet. Create one!" with a button
- Dark theme: bg-gray-900, columns bg-gray-800, cards bg-gray-700, accent indigo/violet

### 3. Components to create

#### `src/components/TaskCard.tsx`
- Compact card showing title, assignee initials in a circle, priority badge, due date
- Draggable
- Click opens TaskDetail drawer
- Priority colors: urgent=red, high=orange, medium=yellow, low=green

#### `src/components/TaskModal.tsx`
- Modal dialog for creating/editing tasks
- Fields: title (required), description (textarea), assignee (select from members), priority (select), due date (date input), estimated hours (number), tags (comma-separated input)
- On submit: POST to `/api/tasks` (or PATCH if editing)
- Closes on success, shows error on failure

#### `src/components/TaskDetail.tsx`
- Slide-in drawer from right (or modal) showing full task details
- Editable fields: title, description, assignee, priority, due date, status, estimated hours, actual hours, tags
- Activity timeline at bottom (fetch from `/api/activity/recent` or per-task)
- Delete button with confirmation
- Close button or click outside to close

#### `src/components/MemberCard.tsx`
- Card showing: avatar circle with initials, name, role badge, status indicator (green/yellow/red dot), skill chips
- Click navigates to `/members/[id]`

#### `src/components/MemberModal.tsx`
- Modal for adding/editing members
- Fields: name, telegram_id, telegram_username, email, role (admin/manager/worker), max_daily_hours, timezone
- On submit: POST to `/api/members` (or PATCH)

#### `src/components/SkillChip.tsx`
- Small pill/badge showing a skill name
- Color varies by category
- Optional proficiency level indicator (dots or stars)

#### `src/components/ActivityTimeline.tsx`
- Vertical timeline of activity entries
- Each entry: icon (based on action type), member name, action description, timestamp (relative: "2 hours ago")
- Action types: created (plus icon), assigned (user icon), status_changed (arrow icon), commented (message icon), completed (check icon), overdue_alert (alert icon)

### 4. Members Page (`src/app/members/page.tsx`)
- Grid of MemberCard components (responsive: 1 col mobile, 2 col tablet, 3-4 col desktop)
- "Add Member" button → opens MemberModal
- Filter by status (all/active/inactive/on_leave)
- Search by name
- Each card links to member detail page

### 5. Member Detail Page (`src/app/members/[id]/page.tsx`)
- Member header: large avatar, name, role, status, telegram username, email
- Current active tasks list (status != done) — show as small cards with status badge
- Completed tasks count (last 30 days)
- Workload section: hours assigned today vs max, utilization bar
- Skills section: list of skills with proficiency, add/remove skills
- Edit button → opens MemberModal
- Status toggle button (active/inactive/on_leave)

### 6. Skills Page (`src/app/skills/page.tsx`)
- List/grid of all skills
- Each skill shows: name, description, category, number of members with this skill
- "Add Skill" button → simple form (name, description, category)
- Edit/delete skills
- Click a skill → see all members who have it

### 7. Update layout
Update `src/app/layout.tsx` to include the Sidebar and TopBar in a proper layout:
- Sidebar fixed on left (240px width)
- Main content area fills remaining space
- TopBar at top of content area
- Dark theme throughout

### 8. Update Sidebar
Read the existing `src/components/Sidebar.tsx` and make sure it has:
- Logo "TeamFlow" at top
- Nav links: Board (/), Members (/members), Skills (/skills)
- Active state highlighting (use `usePathname` from `next/navigation`)
- Board selector dropdown

### 9. Build and verify
```bash
npm run build
```
Must pass with zero errors. Fix any issues before finishing. If there are TypeScript errors, fix them. If there are missing imports, add them.

## Design system
- **Background:** bg-gray-900 (main), bg-gray-800 (cards/columns), bg-gray-700 (hover)
- **Text:** text-gray-100 (primary), text-gray-400 (secondary)
- **Accent:** indigo-500/violet-500 for buttons, active states, links
- **Border:** border-gray-700/800
- **Priority colors:** urgent=red-500, high=orange-500, medium=yellow-500, low=green-500
- **Status colors:** todo=gray, in_progress=blue, review=purple, done=green, blocked=red
- **Rounded:** rounded-lg for cards, rounded-md for buttons
- **Shadows:** shadow-lg for modals/drawers
- **Transitions:** transition-colors duration-200
- Use `clsx` + `tailwind-merge` for conditional classes (check if `src/lib/utils.ts` already has a `cn` helper)

## Deliverables
- Complete kanban board with drag-and-drop at `/`
- Members page with grid at `/members`
- Member detail page at `/members/[id]`
- Skills page at `/skills`
- All components: TaskCard, TaskModal, TaskDetail, MemberCard, MemberModal, SkillChip, ActivityTimeline
- Updated layout with Sidebar + TopBar
- `npm run build` passes with zero errors
