import { createAdminClient } from './supabase/admin'
import type { Database } from '@/types/database'

export type WorkloadStatus = 'available' | 'moderate' | 'busy' | 'overloaded'

export interface WorkloadInfo {
  member_id: string
  name: string
  active_tasks: number
  estimated_hours_remaining: number
  max_daily_hours: number
  utilization_pct: number
  available_hours: number
  status: WorkloadStatus
  /** Count of active tasks with no estimated_hours set — hours_remaining understates real load when this is > 0. */
  tasks_without_estimate: number
}

export type WorkloadLog = Database['public']['Tables']['tf_workload_log']['Row']

const ACTIVE_TASK_STATUSES_EXCLUDED = '(done,blocked)'

function computeStatus(utilizationPct: number): WorkloadStatus {
  if (utilizationPct > 100) return 'overloaded'
  if (utilizationPct >= 90) return 'busy'
  if (utilizationPct >= 70) return 'moderate'
  return 'available'
}

function buildWorkloadInfo(
  member: { id: string; name: string; max_daily_hours: number | null },
  activeTaskSummary: { count: number; hours: number; unestimated: number } | undefined
): WorkloadInfo {
  const maxDailyHours = member.max_daily_hours ?? 8
  const activeTasks = activeTaskSummary?.count ?? 0
  const estimatedHoursRemaining = Math.round((activeTaskSummary?.hours ?? 0) * 100) / 100
  const utilizationPct =
    maxDailyHours > 0 ? Math.round((estimatedHoursRemaining / maxDailyHours) * 1000) / 10 : 0
  const availableHours = Math.round(Math.max(0, maxDailyHours - estimatedHoursRemaining) * 100) / 100

  return {
    member_id: member.id,
    name: member.name,
    active_tasks: activeTasks,
    estimated_hours_remaining: estimatedHoursRemaining,
    max_daily_hours: maxDailyHours,
    utilization_pct: utilizationPct,
    available_hours: availableHours,
    status: computeStatus(utilizationPct),
    tasks_without_estimate: activeTaskSummary?.unestimated ?? 0,
  }
}

function summarizeTasks(
  tasks: { estimated_hours: number | null; actual_hours: number | null }[]
): { count: number; hours: number; unestimated: number } {
  return tasks.reduce(
    (acc, task) => {
      acc.count += 1
      acc.hours += Math.max(0, (task.estimated_hours ?? 0) - (task.actual_hours ?? 0))
      if (task.estimated_hours == null) acc.unestimated += 1
      return acc
    },
    { count: 0, hours: 0, unestimated: 0 }
  )
}

export async function getMemberWorkload(memberId: string): Promise<WorkloadInfo> {
  const supabase = createAdminClient()

  const { data: member, error: memberError } = await supabase
    .from('tf_members')
    .select('id, name, max_daily_hours')
    .eq('id', memberId)
    .single()
  if (memberError) throw memberError

  const { data: tasks, error: tasksError } = await supabase
    .from('tf_tasks')
    .select('estimated_hours, actual_hours')
    .eq('assignee_id', memberId)
    .not('status', 'in', ACTIVE_TASK_STATUSES_EXCLUDED)
  if (tasksError) throw tasksError

  return buildWorkloadInfo(member, summarizeTasks(tasks ?? []))
}

export async function getTeamWorkload(): Promise<WorkloadInfo[]> {
  const supabase = createAdminClient()

  const { data: members, error: membersError } = await supabase
    .from('tf_members')
    .select('id, name, max_daily_hours')
    .eq('status', 'active')
  if (membersError) throw membersError
  if (!members || members.length === 0) return []

  const memberIds = members.map((member) => member.id)
  const { data: tasks, error: tasksError } = await supabase
    .from('tf_tasks')
    .select('assignee_id, estimated_hours, actual_hours')
    .in('assignee_id', memberIds)
    .not('status', 'in', ACTIVE_TASK_STATUSES_EXCLUDED)
  if (tasksError) throw tasksError

  const tasksByMember = new Map<string, { estimated_hours: number | null; actual_hours: number | null }[]>()
  for (const task of tasks ?? []) {
    if (!task.assignee_id) continue
    const list = tasksByMember.get(task.assignee_id) ?? []
    list.push({ estimated_hours: task.estimated_hours, actual_hours: task.actual_hours })
    tasksByMember.set(task.assignee_id, list)
  }

  return members.map((member) =>
    buildWorkloadInfo(member, summarizeTasks(tasksByMember.get(member.id) ?? []))
  )
}

export async function updateWorkloadLog(memberId: string): Promise<void> {
  const workload = await getMemberWorkload(memberId)
  const supabase = createAdminClient()
  const logDate = new Date().toISOString().slice(0, 10)

  const { error } = await supabase.from('tf_workload_log').upsert(
    {
      member_id: memberId,
      log_date: logDate,
      hours_assigned: workload.estimated_hours_remaining,
      tasks_active: workload.active_tasks,
    },
    { onConflict: 'member_id,log_date' }
  )
  if (error) throw error
}

export async function getWorkloadHistory(memberId: string, days: number = 7): Promise<WorkloadLog[]> {
  const supabase = createAdminClient()
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - (days - 1))
  const sinceDate = since.toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('tf_workload_log')
    .select('*')
    .eq('member_id', memberId)
    .gte('log_date', sinceDate)
    .order('log_date', { ascending: true })
  if (error) throw error
  return data ?? []
}
