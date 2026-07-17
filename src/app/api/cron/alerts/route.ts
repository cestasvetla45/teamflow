import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendToTopic } from '@/lib/telegram-topics'
import { notifyDiscord } from '@/lib/discord-notify'
import { getTeamWorkload } from '@/lib/workload'
import type { TfTask } from '@/types/teamflow'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ADMIN_TIMEZONE = process.env.ADMIN_TIMEZONE || 'UTC'
const ACTIVITY_WINDOW_MS = 4 * 60 * 60 * 1000
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000
const MAX_LIST_ITEMS = 10

interface TaskWithAssignee extends TfTask {
  assignee: { name: string } | null
}

function authorize(req: NextRequest): boolean {
  const auth = req.headers.get('authorization')
  return !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`
}

function formatTimestamp(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: ADMIN_TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (60 * 60 * 1000))
  if (hours < 1) return 'less than an hour'
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'}`
}

function truncateList(lines: string[]): string[] {
  if (lines.length <= MAX_LIST_ITEMS) return lines
  const shown = lines.slice(0, MAX_LIST_ITEMS)
  shown.push(`  • …and ${lines.length - MAX_LIST_ITEMS} more`)
  return shown
}

async function runAlertChecks() {
  const supabase = createAdminClient()
  const now = new Date()
  const activityCutoff = new Date(now.getTime() - ACTIVITY_WINDOW_MS)
  const staleCutoff = new Date(now.getTime() - STALE_THRESHOLD_MS)

  const [{ data: tasks, error: tasksError }, workloads] = await Promise.all([
    supabase.from('tf_tasks').select('*, assignee:tf_members!tf_tasks_assignee_id_fkey(name)'),
    getTeamWorkload(),
  ])
  if (tasksError) throw tasksError

  const allTasks = ((tasks as unknown as TaskWithAssignee[]) ?? [])

  // Nothing to report at all — stay silent.
  if (allTasks.length === 0) {
    return { message: null, checks: { totalTasks: 0 } }
  }

  // Check 1: overdue (excluding done and blocked)
  const overdue = allTasks
    .filter(
      (t) =>
        t.due_date &&
        t.status !== 'done' &&
        t.status !== 'blocked' &&
        new Date(t.due_date).getTime() < now.getTime()
    )
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())

  // Check 2: unassigned todos
  const unassigned = allTasks.filter((t) => !t.assignee_id && t.status === 'todo')

  // Check 3: workload
  const overloaded = workloads.filter((w) => w.utilization_pct > 100)
  const nearCapacity = workloads.filter((w) => w.utilization_pct > 80 && w.utilization_pct <= 100)

  // Check 4: stale in-progress tasks
  const stale = allTasks.filter(
    (t) => t.status === 'in_progress' && new Date(t.updated_at).getTime() < staleCutoff.getTime()
  )

  // Check 5: activity in the last 4 hours
  const activeRecently = allTasks.filter(
    (t) =>
      new Date(t.created_at).getTime() >= activityCutoff.getTime() ||
      (t.completed_at && new Date(t.completed_at).getTime() >= activityCutoff.getTime())
  )
  const noActivity = activeRecently.length === 0

  const hasIssues =
    overdue.length > 0 ||
    unassigned.length > 0 ||
    overloaded.length > 0 ||
    nearCapacity.length > 0 ||
    stale.length > 0 ||
    noActivity

  let message: string
  if (!hasIssues) {
    message = [
      '✅ 4-Hour Check — All good!',
      '  • No overdue tasks',
      '  • No unassigned tasks',
      '  • No overloaded members',
      '  • No stale tasks',
      `  • ${activeRecently.length} task${activeRecently.length === 1 ? '' : 's'} active in the last 4 hours`,
    ].join('\n')
  } else {
    const sections: string[] = [`🔔 4-Hour Check — ${formatTimestamp(now)}`]

    if (overdue.length > 0) {
      sections.push('')
      sections.push(`⚠️ Overdue Tasks (${overdue.length}):`)
      sections.push(
        ...truncateList(
          overdue.map((t) => {
            const overdueBy = formatDuration(now.getTime() - new Date(t.due_date!).getTime())
            const assignee = t.assignee?.name ?? 'unassigned'
            return `  • "${t.title}" — ${assignee}, ${overdueBy} overdue (${t.priority.toUpperCase()})`
          })
        )
      )
    }

    if (unassigned.length > 0) {
      sections.push('')
      sections.push(`⚠️ Unassigned Tasks (${unassigned.length}):`)
      sections.push(...truncateList(unassigned.map((t) => `  • "${t.title}" (${t.status})`)))
    }

    if (overloaded.length > 0) {
      sections.push('')
      sections.push('🔴 Overloaded:')
      sections.push(
        ...overloaded.map(
          (w) =>
            `  • ${w.name} — ${w.estimated_hours_remaining}h booked / ${w.max_daily_hours}h max (${Math.round(w.utilization_pct)}%)`
        )
      )
    }

    if (nearCapacity.length > 0) {
      sections.push('')
      sections.push('🟡 Near capacity:')
      sections.push(
        ...nearCapacity.map(
          (w) =>
            `  • ${w.name} — ${w.estimated_hours_remaining}h booked / ${w.max_daily_hours}h max (${Math.round(w.utilization_pct)}%)`
        )
      )
    }

    if (stale.length > 0) {
      sections.push('')
      sections.push(`💤 Stale Tasks (${stale.length}):`)
      sections.push(
        ...truncateList(
          stale.map((t) => {
            const sinceUpdate = formatDuration(now.getTime() - new Date(t.updated_at).getTime())
            return `  • "${t.title}" — last updated ${sinceUpdate} ago`
          })
        )
      )
    }

    if (noActivity) {
      sections.push('')
      sections.push('📊 No new task activity in the last 4 hours.')
    }

    message = sections.join('\n')
  }

  return {
    message,
    checks: {
      totalTasks: allTasks.length,
      overdue: overdue.length,
      unassigned: unassigned.length,
      overloaded: overloaded.length,
      nearCapacity: nearCapacity.length,
      stale: stale.length,
      activeLast4h: activeRecently.length,
    },
  }
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results = await runAlertChecks()

    if (results.message) {
      await notifyDiscord(results.message)
      await sendToTopic('notifications', results.message)
    }

    return NextResponse.json({ ok: true, sent: !!results.message, ...results })
  } catch (err) {
    console.error('Alert check failed:', err)
    const detail =
      err instanceof Error ? err.message : typeof err === 'object' && err !== null ? JSON.stringify(err) : String(err)
    return NextResponse.json({ ok: false, error: 'Alert check failed', detail }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
