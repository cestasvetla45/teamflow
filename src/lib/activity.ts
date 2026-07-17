import { createAdminClient } from './supabase/admin'

export interface ActivityEntry {
  id: string
  task_id: string
  task_title: string | null
  member_id: string | null
  member_name: string | null
  action: string
  old_value: string | null
  new_value: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

interface ActivityRow {
  id: string
  task_id: string
  member_id: string | null
  action: string
  old_value: string | null
  new_value: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  member?: { name: string | null } | null
  task?: { title: string | null } | null
}

function toActivityEntry(row: ActivityRow): ActivityEntry {
  return {
    id: row.id,
    task_id: row.task_id,
    task_title: row.task?.title ?? null,
    member_id: row.member_id,
    member_name: row.member?.name ?? null,
    action: row.action,
    old_value: row.old_value,
    new_value: row.new_value,
    metadata: row.metadata,
    created_at: row.created_at,
  }
}

export async function logActivity(
  taskId: string,
  memberId: string | null,
  action: string,
  oldValue?: string,
  newValue?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.from('tf_task_activity').insert({
    task_id: taskId,
    member_id: memberId,
    action,
    old_value: oldValue ?? null,
    new_value: newValue ?? null,
    metadata: metadata ?? {},
  })
  if (error) throw error
}

export async function getTaskActivity(taskId: string): Promise<ActivityEntry[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('tf_task_activity')
    .select('*, member:tf_members(name)')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as ActivityRow[]).map(toActivityEntry)
}

export async function getRecentActivity(limit: number = 20): Promise<ActivityEntry[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('tf_task_activity')
    .select('*, member:tf_members(name), task:tf_tasks(title)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as ActivityRow[]).map(toActivityEntry)
}
