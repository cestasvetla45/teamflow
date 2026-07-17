import { NextRequest, NextResponse } from 'next/server'
import { bot } from '@/lib/bot'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatDueDate, isOverdue, logActivity } from '@/lib/teamflow-db'
import { sendToTopic } from '@/lib/telegram-topics'
import { notifyDiscord, notifyDiscordChannel } from '@/lib/discord-notify'
import type { TfMember, TfTask } from '@/types/teamflow'

export const runtime = 'nodejs'

const ADMIN_TIMEZONE = process.env.ADMIN_TIMEZONE || 'UTC'
const DAILY_SUMMARY_HOUR = 9

// Module-scope guard so a cron hitting this endpoint every few minutes only
// triggers one daily summary per calendar day (this runs as one long-lived process).
let lastDailySummaryDate: string | null = null

function todayInTimezone(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function currentHourInTimezone(tz: string): number {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hour12: false,
  }).format(new Date())
  return parseInt(formatted, 10)
}

function authorize(req: NextRequest): boolean {
  const auth = req.headers.get('authorization')
  return !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`
}

interface TaskWithAssignee extends TfTask {
  assignee: { name: string; telegram_id: number | null; telegram_username: string | null } | null
}

async function checkOverdueTasks(supabase: ReturnType<typeof createAdminClient>) {
  const { data: tasks } = await supabase
    .from('tf_tasks')
    .select('*, assignee:tf_members(name, telegram_id, telegram_username)')
    .neq('status', 'done')
    .not('due_date', 'is', null)

  const overdue = ((tasks as unknown as TaskWithAssignee[]) ?? []).filter((t) => isOverdue(t))
  if (overdue.length === 0) return { checked: 0, alerted: 0 }

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  let alerted = 0
  for (const task of overdue) {
    const { data: existingAlert } = await supabase
      .from('tf_task_activity')
      .select('id')
      .eq('task_id', task.id)
      .eq('action', 'overdue_alert')
      .gte('created_at', todayStart.toISOString())
      .maybeSingle()

    if (existingAlert) continue

    const dueDescription = formatDueDate(task.due_date)
    const assigneeLabel = task.assignee?.telegram_username
      ? `@${task.assignee.telegram_username}`
      : task.assignee?.name ?? 'unassigned'

    const adminId = process.env.ADMIN_TELEGRAM_ID
    if (adminId) {
      try {
        await bot.telegram.sendMessage(
          Number(adminId),
          `⚠️ Task "${task.title}" assigned to ${assigneeLabel} is overdue (was due ${dueDescription}).`
        )
      } catch (err) {
        console.error('Failed to notify admin of overdue task:', err)
      }
    }

    if (task.assignee?.telegram_id) {
      try {
        await bot.telegram.sendMessage(
          task.assignee.telegram_id,
          `⏰ Reminder: Task "${task.title}" is overdue. Please update its status.`
        )
      } catch (err) {
        console.error('Failed to notify assignee of overdue task:', err)
      }
    }

    const topicMessage = `⚠️ Task "${task.title}" assigned to ${assigneeLabel} is overdue (was due ${dueDescription}).`
    await sendToTopic('notifications', topicMessage)
    await notifyDiscord(topicMessage)
    if (task.platform) {
      await sendToTopic(task.platform, topicMessage)
      await notifyDiscordChannel(task.platform, topicMessage)
    }

    await logActivity(supabase, {
      taskId: task.id,
      memberId: null,
      action: 'overdue_alert',
      newValue: dueDescription,
    })
    alerted += 1
  }

  return { checked: overdue.length, alerted }
}

async function sendDailySummary(supabase: ReturnType<typeof createAdminClient>) {
  const adminId = process.env.ADMIN_TELEGRAM_ID
  if (!adminId) return { sent: false, reason: 'ADMIN_TELEGRAM_ID not set' }

  const now = new Date()
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(now)
  todayEnd.setHours(23, 59, 59, 999)

  const [{ data: members }, { data: tasks }] = await Promise.all([
    supabase.from('tf_members').select('*').eq('status', 'active'),
    supabase.from('tf_tasks').select('*'),
  ])

  const allMembers = (members as TfMember[]) ?? []
  const allTasks = (tasks as TfTask[]) ?? []

  const completedYesterday = allTasks.filter(
    (t) => t.status === 'done' && t.completed_at && new Date(t.completed_at) >= dayAgo && new Date(t.completed_at) <= now
  )
  const inProgress = allTasks.filter((t) => t.status === 'in_progress')
  const dueToday = allTasks.filter(
    (t) => t.due_date && t.status !== 'done' && new Date(t.due_date) >= todayStart && new Date(t.due_date) <= todayEnd
  )
  const overdue = allTasks.filter((t) => isOverdue(t))

  const availability = allMembers.map((m) => {
    const activeTasks = allTasks.filter((t) => t.assignee_id === m.id && t.status !== 'done')
    const bookedHours = activeTasks.reduce((sum, t) => sum + (t.estimated_hours ?? 0), 0)
    const available = bookedHours < m.max_daily_hours
    return `${available ? '🟢' : '🔴'} ${m.name}: ${bookedHours}/${m.max_daily_hours}h`
  })

  const message = [
    '☀️ Daily Summary',
    '',
    `✅ Completed yesterday: ${completedYesterday.length}`,
    `🔄 In progress: ${inProgress.length}`,
    `📅 Due today: ${dueToday.length}`,
    `⚠️ Overdue: ${overdue.length}`,
    '',
    '👥 Availability:',
    ...availability,
  ].join('\n')

  await sendToTopic('notifications', message)
  await notifyDiscord(message)

  try {
    await bot.telegram.sendMessage(Number(adminId), message)
    return { sent: true }
  } catch (err) {
    console.error('Failed to send daily summary:', err)
    return { sent: false, reason: 'send failed' }
  }
}

async function handle(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const type = req.nextUrl.searchParams.get('type')
  const result: Record<string, unknown> = {}

  if (type !== 'daily') {
    result.overdue = await checkOverdueTasks(supabase)
  }

  if (type === 'daily' || !type) {
    const today = todayInTimezone(ADMIN_TIMEZONE)
    const hour = currentHourInTimezone(ADMIN_TIMEZONE)
    if (type === 'daily' || (hour === DAILY_SUMMARY_HOUR && lastDailySummaryDate !== today)) {
      result.dailySummary = await sendDailySummary(supabase)
      lastDailySummaryDate = today
    }
  }

  return NextResponse.json({ ok: true, ...result })
}

export async function POST(req: NextRequest) {
  return handle(req)
}

export async function GET(req: NextRequest) {
  return handle(req)
}
