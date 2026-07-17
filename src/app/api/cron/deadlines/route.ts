import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logActivity } from '@/lib/activity'
import {
  notifyAdminEverywhere,
  notifyAssigneeTelegram,
  notifyAssigneeDiscord,
} from '@/lib/admin-notify'
import type { TfTask } from '@/types/teamflow'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ADMIN_TIMEZONE = process.env.ADMIN_TIMEZONE || 'UTC'
const NOTIFY_COOLDOWN_MS = 4 * 60 * 60 * 1000
const HOURLY_UPCOMING_WINDOW_MS = 2 * 60 * 60 * 1000
const QUARTERLY_UPCOMING_WINDOW_MS = 15 * 60 * 1000
const MAX_LIST_ITEMS = 10

type CheckType = 'hourly' | 'quarterly'

interface TaskWithAssignee extends TfTask {
  assignee: { id: string; name: string; telegram_id: number | null; discord_id: string | null } | null
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
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

function formatTimeOfDay(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: ADMIN_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

function dateInAdminTz(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ADMIN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

// Compact form for the admin digest: "45 min", "2h", "3d".
function formatShortDuration(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60000))
  if (mins < 60) return `${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

// Spelled-out form for member reminders: "45 minutes", "2 hours", "3 days".
function formatLongDuration(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60000))
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'}`
  const hours = Math.floor(mins / 60)
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

function assigneeName(task: TaskWithAssignee): string {
  return task.assignee?.name ?? 'unassigned'
}

async function notifyAssignee(task: TaskWithAssignee, message: string): Promise<void> {
  if (!task.assignee) return
  await Promise.all([
    notifyAssigneeTelegram(task.assignee.id, message),
    notifyAssigneeDiscord(task.assignee.id, message),
  ])
}

async function runDeadlineCheck(type: CheckType) {
  const supabase = createAdminClient()
  const now = new Date()
  const upcomingWindowMs = type === 'hourly' ? HOURLY_UPCOMING_WINDOW_MS : QUARTERLY_UPCOMING_WINDOW_MS

  const { data: tasks, error } = await supabase
    .from('tf_tasks')
    .select('*, assignee:tf_members!tf_tasks_assignee_id_fkey(id, name, telegram_id, discord_id)')
    .neq('status', 'done')
    .neq('status', 'blocked')
  if (error) throw error

  const activeTasks = ((tasks as unknown as TaskWithAssignee[]) ?? [])
  const withDueDate = activeTasks.filter((t) => t.due_date)

  const overdue = withDueDate
    .filter((t) => new Date(t.due_date!).getTime() < now.getTime())
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())

  const upcoming = withDueDate
    .filter((t) => {
      const due = new Date(t.due_date!).getTime()
      return due >= now.getTime() && due < now.getTime() + upcomingWindowMs
    })
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())

  const upcomingIds = new Set(upcoming.map((t) => t.id))
  const today = dateInAdminTz(now)
  const dueToday =
    type === 'hourly'
      ? withDueDate
          .filter((t) => {
            const due = new Date(t.due_date!)
            return due.getTime() >= now.getTime() && !upcomingIds.has(t.id) && dateInAdminTz(due) === today
          })
          .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
      : []

  // Dedup: skip tasks already notified for the same event within the cooldown.
  // The 4h cooldown also covers "once per entry into the upcoming window",
  // since the window is at most 2h.
  const dedupIds = [...overdue, ...upcoming].map((t) => t.id)
  const alreadyNotified = new Set<string>()
  if (dedupIds.length > 0) {
    const cutoff = new Date(now.getTime() - NOTIFY_COOLDOWN_MS).toISOString()
    const { data: recent } = await supabase
      .from('tf_task_activity')
      .select('task_id, action')
      .in('task_id', dedupIds)
      .in('action', ['overdue_notified', 'upcoming_notified'])
      .gte('created_at', cutoff)
    for (const row of (recent as { task_id: string; action: string }[]) ?? []) {
      alreadyNotified.add(`${row.task_id}:${row.action}`)
    }
  }

  const freshOverdue = overdue.filter((t) => !alreadyNotified.has(`${t.id}:overdue_notified`))
  const freshUpcoming = upcoming.filter((t) => !alreadyNotified.has(`${t.id}:upcoming_notified`))
  const suppressedOverdue = overdue.length - freshOverdue.length

  // Build the admin digest.
  let adminMessage: string | null = null
  const hasFreshItems = freshOverdue.length > 0 || freshUpcoming.length > 0

  if (hasFreshItems || (type === 'hourly' && dueToday.length > 0)) {
    const sections: string[] = [`🚨 Deadline Alert — ${formatTimestamp(now)}`]

    if (freshOverdue.length > 0) {
      sections.push('')
      sections.push(`❌ OVERDUE (${freshOverdue.length}):`)
      sections.push(
        ...truncateList(
          freshOverdue.map((t) => {
            const ago = formatShortDuration(now.getTime() - new Date(t.due_date!).getTime())
            return `  • "${t.title}" — ${assigneeName(t)}, was due ${ago} ago (${t.priority.toUpperCase()})`
          })
        )
      )
      if (suppressedOverdue > 0) {
        sections.push(`  (${suppressedOverdue} more overdue, already notified in the last 4h)`)
      }
    }

    if (freshUpcoming.length > 0) {
      const windowLabel = type === 'hourly' ? 'NEXT 2 HOURS' : 'NEXT 15 MIN'
      sections.push('')
      sections.push(`⏰ DUE IN ${windowLabel} (${freshUpcoming.length}):`)
      sections.push(
        ...truncateList(
          freshUpcoming.map((t) => {
            const inTime = formatShortDuration(new Date(t.due_date!).getTime() - now.getTime())
            return `  • "${t.title}" — ${assigneeName(t)}, due in ${inTime} (${t.priority.toUpperCase()})`
          })
        )
      )
    }

    if (dueToday.length > 0) {
      sections.push('')
      sections.push(`📋 DUE TODAY (${dueToday.length}):`)
      sections.push(
        ...truncateList(
          dueToday.map(
            (t) =>
              `  • "${t.title}" — ${assigneeName(t)}, due ${formatTimeOfDay(new Date(t.due_date!))} (${t.priority.toUpperCase()})`
          )
        )
      )
    }

    sections.push('')
    sections.push('✅ All other tasks on track.')
    adminMessage = sections.join('\n')
  } else if (
    type === 'hourly' &&
    overdue.length === 0 &&
    upcoming.length === 0 &&
    activeTasks.length > 0
  ) {
    // Everything genuinely on track (not just deduped) — send the all-clear.
    // With zero active tasks we stay silent entirely.
    adminMessage = [
      `✅ Deadline Check — ${formatTimestamp(now)}`,
      'All tasks on track. No overdue or upcoming deadlines.',
    ].join('\n')
  }

  if (adminMessage) {
    await notifyAdminEverywhere(adminMessage)
  }

  // Member reminders + dedup records, only for freshly-notified tasks so
  // assignees follow the same once-per-4h cooldown as the admin.
  for (const task of freshOverdue) {
    const ago = formatLongDuration(now.getTime() - new Date(task.due_date!).getTime())
    await notifyAssignee(
      task,
      `⏰ Reminder: "${task.title}" was due ${ago} ago.\n` +
        'Please update its status or let your manager know if you\'re blocked.\n\n' +
        'Send /mytasks to see all your tasks.'
    )
    await logActivity(task.id, null, 'overdue_notified', undefined, task.due_date!, {
      check_type: type,
      assignee_notified: !!task.assignee,
    })
  }

  for (const task of freshUpcoming) {
    const inTime = formatLongDuration(new Date(task.due_date!).getTime() - now.getTime())
    await notifyAssignee(
      task,
      `⏰ "${task.title}" is due in ${inTime} (${task.priority.toUpperCase()}).\n` +
        "Make sure it's done on time!"
    )
    await logActivity(task.id, null, 'upcoming_notified', undefined, task.due_date!, {
      check_type: type,
      assignee_notified: !!task.assignee,
    })
  }

  return {
    sent: !!adminMessage,
    checks: {
      type,
      activeTasks: activeTasks.length,
      overdue: overdue.length,
      overdueNotified: freshOverdue.length,
      upcoming: upcoming.length,
      upcomingNotified: freshUpcoming.length,
      dueToday: dueToday.length,
    },
  }
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const typeParam = req.nextUrl.searchParams.get('type')
  const type: CheckType = typeParam === 'quarterly' ? 'quarterly' : 'hourly'

  try {
    const results = await runDeadlineCheck(type)
    return NextResponse.json({ ok: true, ...results })
  } catch (err) {
    console.error('Deadline check failed:', err)
    const detail =
      err instanceof Error ? err.message : typeof err === 'object' && err !== null ? JSON.stringify(err) : String(err)
    return NextResponse.json({ ok: false, error: 'Deadline check failed', detail }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
