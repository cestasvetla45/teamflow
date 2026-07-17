import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTeamWorkload } from '@/lib/workload'

const STATUS_KEYS = ['todo', 'in_progress', 'review', 'done', 'blocked'] as const

export async function GET() {
  try {
    const supabase = createAdminClient()

    const [tasksResult, membersResult, teamWorkload] = await Promise.all([
      supabase.from('tf_tasks').select('status, due_date, completed_at, created_at'),
      supabase.from('tf_members').select('id').eq('status', 'active'),
      getTeamWorkload(),
    ])
    if (tasksResult.error) throw tasksResult.error
    if (membersResult.error) throw membersResult.error

    const tasks = tasksResult.data ?? []
    const byStatus: Record<string, number> = Object.fromEntries(STATUS_KEYS.map((key) => [key, 0]))

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    let overdueCount = 0
    let tasksCompletedToday = 0
    let tasksCreatedToday = 0

    for (const task of tasks) {
      const status = task.status ?? 'todo'
      byStatus[status] = (byStatus[status] ?? 0) + 1

      if (task.due_date && new Date(task.due_date) < now && status !== 'done' && status !== 'blocked') {
        overdueCount += 1
      }
      if (task.completed_at && new Date(task.completed_at) >= todayStart) {
        tasksCompletedToday += 1
      }
      if (task.created_at && new Date(task.created_at) >= todayStart) {
        tasksCreatedToday += 1
      }
    }

    const availableMembers = teamWorkload.filter((member) => member.status === 'available').length

    return NextResponse.json({
      total_tasks: tasks.length,
      by_status: byStatus,
      overdue_count: overdueCount,
      team_size: membersResult.data?.length ?? 0,
      available_members: availableMembers,
      tasks_completed_today: tasksCompletedToday,
      tasks_created_today: tasksCreatedToday,
    })
  } catch (error) {
    console.error('Failed to load stats:', error)
    return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 })
  }
}
