import { createAdminClient } from '@/lib/supabase/admin'
import { sendToTopic } from '@/lib/telegram-topics'
import type { TfBoard, TfMember, TfTask } from '@/types/teamflow'

type AdminClient = ReturnType<typeof createAdminClient>

const DEFAULT_BOARD_NAME = 'Main Board'

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export async function getDefaultBoard(supabase: AdminClient): Promise<TfBoard> {
  const { data: existing } = await supabase
    .from('tf_boards')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (existing) return existing as TfBoard

  const { data: created, error } = await supabase
    .from('tf_boards')
    .insert({ name: DEFAULT_BOARD_NAME })
    .select('*')
    .single()

  if (error || !created) throw new Error(`Failed to create default board: ${error?.message}`)
  return created as TfBoard
}

export async function getMemberByTelegramId(
  supabase: AdminClient,
  telegramId: number
): Promise<TfMember | null> {
  const { data } = await supabase
    .from('tf_members')
    .select('*')
    .eq('telegram_id', telegramId)
    .maybeSingle()
  return (data as TfMember) ?? null
}

export async function getMemberByUsername(
  supabase: AdminClient,
  username: string
): Promise<TfMember | null> {
  const clean = username.replace(/^@/, '')
  const { data } = await supabase
    .from('tf_members')
    .select('*')
    .ilike('telegram_username', clean)
    .maybeSingle()
  return (data as TfMember) ?? null
}

export async function ensureMemberExists(
  supabase: AdminClient,
  params: { telegram_id: number; telegram_username?: string | null; name: string }
): Promise<TfMember> {
  const byTelegramId = await getMemberByTelegramId(supabase, params.telegram_id)
  if (byTelegramId) return byTelegramId

  // Member may already exist from /addmember (which only records a username, not a telegram_id yet).
  // Link the two instead of creating a duplicate row.
  if (params.telegram_username) {
    const byUsername = await getMemberByUsername(supabase, params.telegram_username)
    if (byUsername) {
      const { data, error } = await supabase
        .from('tf_members')
        .update({ telegram_id: params.telegram_id })
        .eq('id', byUsername.id)
        .select('*')
        .single()
      if (error || !data) throw new Error(`Failed to link member: ${error?.message}`)
      return data as TfMember
    }
  }

  const { data, error } = await supabase
    .from('tf_members')
    .insert({
      telegram_id: params.telegram_id,
      telegram_username: params.telegram_username ?? null,
      name: params.name,
    })
    .select('*')
    .single()

  if (error || !data) throw new Error(`Failed to auto-register member: ${error?.message}`)
  return data as TfMember
}

export async function findTaskByPrefix(
  supabase: AdminClient,
  prefix: string
): Promise<{ task: TfTask | null; ambiguous: boolean }> {
  const clean = prefix.trim().toLowerCase()
  const { data } = await supabase.from('tf_tasks').select('*')
  const matches = ((data as TfTask[]) ?? []).filter((t) => t.id.toLowerCase().startsWith(clean))
  if (matches.length === 0) return { task: null, ambiguous: false }
  if (matches.length > 1) return { task: null, ambiguous: true }
  return { task: matches[0], ambiguous: false }
}

export function shortId(id: string): string {
  return id.slice(0, 8)
}

export function isAdminTelegramId(telegramId: number | undefined): boolean {
  if (!telegramId) return false
  return String(telegramId) === String(process.env.ADMIN_TELEGRAM_ID ?? '')
}

export function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return 'no due date'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatDueDate(dueDate: string | null): string {
  if (!dueDate) return 'none'
  const due = new Date(dueDate)
  const now = new Date()
  const diffMs = due.getTime() - now.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'tomorrow'
  if (diffDays > 1) return `in ${diffDays} days`
  if (diffDays === -1) return '1 day ago'
  return `${Math.abs(diffDays)} days ago`
}

export function isOverdue(task: Pick<TfTask, 'due_date' | 'status'>): boolean {
  if (!task.due_date || task.status === 'done') return false
  return new Date(task.due_date).getTime() < Date.now()
}

export function priorityEmoji(priority: string): string {
  switch (priority) {
    case 'urgent':
      return '🔥'
    case 'high':
      return '⬆️'
    case 'low':
      return '⬇️'
    default:
      return '➡️'
  }
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'todo':
      return 'To Do'
    case 'in_progress':
      return 'In Progress'
    case 'review':
      return 'Review'
    case 'done':
      return 'Done'
    case 'blocked':
      return 'Blocked'
    default:
      return status
  }
}

export async function notifyTaskAssigned(
  task: Pick<TfTask, 'title' | 'priority' | 'due_date' | 'platform'>,
  assigneeName: string
): Promise<void> {
  const message = `📌 New task assigned to ${assigneeName}: "${task.title}"\nPriority: ${task.priority}\nDue: ${formatDueDate(task.due_date)}`
  await sendToTopic('notifications', message)
  if (task.platform) await sendToTopic(task.platform, message)
}

export async function notifyTaskCompleted(
  task: Pick<TfTask, 'title' | 'platform'>,
  assigneeName: string | null
): Promise<void> {
  const message = `✅ Task completed${assigneeName ? ` by ${assigneeName}` : ''}: "${task.title}"`
  await sendToTopic('notifications', message)
  if (task.platform) await sendToTopic(task.platform, message)
}

export async function logActivity(
  supabase: AdminClient,
  params: {
    taskId: string
    memberId: string | null
    action: string
    oldValue?: string | null
    newValue?: string | null
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  await supabase.from('tf_task_activity').insert({
    task_id: params.taskId,
    member_id: params.memberId,
    action: params.action,
    old_value: params.oldValue ?? null,
    new_value: params.newValue ?? null,
    metadata: params.metadata ?? {},
  })
}
