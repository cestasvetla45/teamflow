# TASK 7: VA Individual Views + Secure Tool Vault

## Context
You are working on "TeamFlow" at `/Users/tomimiksa/Desktop/TeamFlow`. This is a Next.js 14 (App Router) + TypeScript + Tailwind + Supabase project. It's a team task management app with a Telegram bot. The database uses `tf_` prefixed tables on Supabase project `hobqaxdklesgfasihwvw`.

The admin (user) manages multiple VAs (virtual assistants). Each VA needs:
1. A personal dashboard view showing only their tasks and workload
2. A secure "vault" where the admin stores their tools (accounts, login links, proxy credentials) that only that VA can access

## Existing tables
- `tf_members` (id, name, telegram_id, telegram_username, email, role, status, max_daily_hours, timezone, avatar_url)
- `tf_tasks` (id, title, description, status, priority, board_id, assignee_id, created_by, due_date, completed_at, position, estimated_hours, actual_hours, tags)
- `tf_skills` (id, name, description, category)
- `tf_member_skills` (id, member_id, skill_id, proficiency_level)

## Existing files
- `src/lib/supabase/client.ts` — browser Supabase client
- `src/lib/supabase/server.ts` — server Supabase client
- `src/lib/supabase/admin.ts` — admin Supabase client (service role)
- `src/components/Sidebar.tsx`, `src/components/TopBar.tsx` — layout components
- `src/app/page.tsx` — main board
- `src/app/members/page.tsx` — members list
- `src/app/members/[id]/page.tsx` — member detail
- `src/app/skills/page.tsx` — skills page
- All API routes in `src/app/api/`

## What to build

### 1. Database: VA tools/credentials vault table
Create `supabase/migrations/002_va_vault.sql`:

```sql
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
```

Run this migration against Supabase using the Supabase MCP or the service role key.

### 2. VA Auth System
Create `src/lib/va-auth.ts`:

```typescript
// Generate a secure access token for a member
export async function generateVAToken(memberId: string): Promise<string>

// Validate a VA token and return the member
export async function validateVAToken(token: string): Promise<TfMember | null>

// Get or create a token for a member
export async function getOrCreateToken(memberId: string): Promise<string>
```

Token format: a random 32-char hex string. Stored in `tf_va_tokens`.

### 3. VA Dashboard Pages

#### `/va` — VA landing (token-based auth)
This is the entry point for VAs. They access via `https://teamflow-production-4292.up.railway.app/va?token=abc123`

Create `src/app/va/page.tsx`:
- Reads `token` from query params
- Validates the token via `/api/va/auth?token=...`
- If invalid: shows "Access denied" with instructions to contact admin
- If valid: stores token in a cookie (httpOnly) and redirects to `/va/dashboard`
- If no token: shows login page asking for access token

#### `/va/dashboard` — VA personal dashboard
Create `src/app/va/dashboard/page.tsx` (server component):
- Reads token from cookie
- Validates it
- Shows:
  - Header: "Welcome, [Name]" with avatar
  - **My Tasks section**: all tasks assigned to this VA, grouped by status (todo, in_progress, review, done)
    - Each task: title, priority badge, due date, board name
    - Click task → expands to show description
    - Can change task status (dropdown: todo → in_progress → review → done)
  - **My Workload section**: 
    - Hours booked today vs max
    - Utilization bar (green/yellow/red)
    - Active tasks count, completed tasks count
  - **My Skills section**: skills with proficiency levels
  - **My Vault section**: link to `/va/vault`
  - Sidebar with: Dashboard, My Vault, My Tasks

Dark theme matching the main app (bg-gray-900, cards bg-gray-800, accent indigo).

#### `/va/vault` — Secure credential vault
Create `src/app/va/vault/page.tsx` (server component):
- Reads token from cookie, validates
- Shows all vault items for this member
- Each item is a card showing:
  - Type icon (account=🔐, login=🔑, proxy=🌐, api_key=🤖, note=📝, other=📦)
  - Name (title)
  - Expandable details: URL, username, password (with show/hide toggle), notes
  - For proxies: address, port, username, password
  - Copy-to-clipboard button for each field
- Admin view: if the token belongs to the admin, show ALL members' vaults with a member selector

#### `/va/vault/[memberId]` — Admin view of a specific VA's vault
- Only accessible if the token belongs to the admin (role = 'admin')
- Shows that VA's vault items
- Can add/edit/delete items

### 4. VA API Routes

#### `src/app/api/va/auth/route.ts`
- GET: `?token=abc123` — validates token, returns member info or 401
- POST: `{ token }` — same, for form submission

#### `src/app/api/va/tasks/route.ts`
- GET: list tasks for the authenticated VA (by token)
- PATCH: update task status (VA can only update their own tasks)

#### `src/app/api/va/vault/route.ts`
- GET: list vault items for the authenticated VA
- POST: create a new vault item (admin only, for a specific member)

#### `src/app/api/va/vault/[id]/route.ts`
- PATCH: update a vault item (admin only)
- DELETE: delete a vault item (admin only)

#### `src/app/api/va/tokens/route.ts`
- POST: generate a new access token for a member (admin only)
  - Body: `{ member_id }`
  - Returns: `{ token, url }` where URL is `https://teamflow-production-4292.up.railway.app/va?token=...`

#### `src/app/api/va/tokens/[memberId]/route.ts`
- GET: get the existing token for a member (admin only)

### 5. VA Management UI (admin side)
Update `src/app/members/[id]/page.tsx`:
- Add a "VA Access" section showing:
  - The member's access token (if exists)
  - A "Generate Access Link" button → creates token, shows URL
  - A "Copy Link" button
  - The URL format: `https://teamflow-production-4292.up.railway.app/va?token=...`

Update `src/app/members/page.tsx`:
- Add a "VA Access" column or badge showing whether each member has a token

### 6. Vault Management UI (admin side)
Update `src/app/members/[id]/page.tsx`:
- Add a "Vault" section showing:
  - List of vault items for this member
  - "Add Item" button → form with: type, name, url, username, password, api_key, proxy fields, notes
  - Edit/delete buttons for each item
  - This is where the admin adds credentials FOR the VA

### 7. VA Sidebar Component
Create `src/components/VASidebar.tsx`:
- Different sidebar for VA views (simpler than main app sidebar)
- Links: Dashboard, My Vault, My Tasks
- Shows VA name and avatar at top
- Logout button (clears cookie)

### 8. VA Layout
Create `src/app/va/layout.tsx`:
- Uses VASidebar instead of main Sidebar
- No TopBar (simpler interface for VAs)
- Dark theme

### 9. Build and verify
```bash
cd /Users/tomimiksa/Desktop/TeamFlow && npm run build
```
Must pass with zero errors. Fix any TypeScript issues.

## Design notes
- VA views should be SIMPLER than the admin app — no board management, no member management
- VAs can only: view their tasks, change task status, view their vault, view their skills
- Only admin can: create vault items, generate tokens, assign tasks
- The vault should have copy-to-clipboard for all credential fields
- Passwords should have a show/hide toggle (eye icon)
- Dark theme: bg-gray-900, bg-gray-800 cards, indigo accents — matching main app

## Deliverables
- SQL migration for tf_va_vault and tf_va_tokens (run against live Supabase)
- VA auth system (token-based)
- VA dashboard at /va/dashboard (tasks, workload, skills)
- VA vault at /va/vault (credentials with copy buttons)
- Admin can generate VA access links from member detail page
- Admin can add vault items for each VA
- All API routes
- Build passes
