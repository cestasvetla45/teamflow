import { Telegraf, Markup, Context } from 'telegraf'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateAIResponse, generateAIResponseWithFile } from '@/lib/bot-ai'
import { getMemberWorkload } from '@/lib/workload'
import { listSOPs, syncSOPToTelegram } from '@/lib/sops'
import { canAccessTopic, getTopicNameFromThread } from '@/lib/topic-access'
import { DEFAULT_TOPICS } from '@/lib/telegram-topics'
import { downloadTelegramFile } from '@/lib/telegram-files'
import { extractFileContent } from '@/lib/file-reader'
import type { TfMember, TfSop, TfTask, TaskPriority, TfTeam } from '@/types/teamflow'
import {
  ensureMemberExists,
  escapeHtml,
  findTaskByPrefix,
  formatDueDate,
  formatShortDate,
  getDefaultBoard,
  getMemberByTelegramId,
  getMemberByUsername,
  isAdminTelegramId,
  isOverdue,
  logActivity,
  notifyTaskAssigned,
  notifyTaskCompleted,
  priorityEmoji,
  shortId,
  statusLabel,
} from '@/lib/teamflow-db'

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN env var is required')
}

export const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN)

const supabase = createAdminClient()

// ---------------------------------------------------------------------------
// Group chat support — only engage when @mentioned, replied to, or commanded
// ---------------------------------------------------------------------------

const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'teamfloww_bot'
const MENTION_TAG = `@${BOT_USERNAME}`.toLowerCase()

function hasMention(text: string): boolean {
  return text.toLowerCase().includes(MENTION_TAG)
}

function stripMention(text: string): string {
  return text.split(new RegExp(MENTION_TAG.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')).join('').trim()
}

/** Reply to the triggering message; in groups, thread it via reply_to_message_id so it's clear who's addressed. */
function reply(ctx: Context, text: string, extra?: Parameters<Context['reply']>[1]) {
  const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup'
  const messageId = ctx.message && 'message_id' in ctx.message ? ctx.message.message_id : undefined
  return ctx.reply(text, {
    ...extra,
    ...(isGroup && messageId ? { reply_to_message_id: messageId } : {}),
  })
}

bot.use(async (ctx, next) => {
  // Private chat: always respond, no gating needed. Still auto-register first-time senders.
  if (ctx.chat?.type === 'private') {
    if (ctx.from && !isAdminTelegramId(ctx.from.id)) {
      await ensureMemberExists(supabase, {
        telegram_id: ctx.from.id,
        telegram_username: ctx.from.username,
        name: ctx.from.first_name + (ctx.from.last_name ? ' ' + ctx.from.last_name : ''),
      })
    }
    return next()
  }

  const message = ctx.message
  if (!message) return next()

  const hasText = 'text' in message && typeof message.text === 'string'
  const hasCaption = 'caption' in message && typeof message.caption === 'string'
  const isFileMessage = 'document' in message || 'photo' in message

  // Anything other than a plain text message or a file upload (callback queries, edits, etc.) passes through untouched.
  if (!hasText && !isFileMessage) return next()

  const text = hasText ? message.text : hasCaption ? message.caption! : ''
  const isCommand = hasText && text.startsWith('/')
  const isMentioned = hasMention(text)
  const isReplyToBot = message.reply_to_message?.from?.username?.toLowerCase() === BOT_USERNAME.toLowerCase()

  if (!isCommand && !isMentioned && !isReplyToBot) {
    // Not addressed to the bot — ignore silently.
    return
  }

  // Telegraf already strips `@botname` off command text itself; only strip it from free-form mentions.
  if (!isCommand && isMentioned) {
    if (hasText) message.text = stripMention(text)
    else if (hasCaption) (message as { caption?: string }).caption = stripMention(text)
  }

  if (ctx.from && !isAdminTelegramId(ctx.from.id)) {
    await ensureMemberExists(supabase, {
      telegram_id: ctx.from.id,
      telegram_username: ctx.from.username,
      name: ctx.from.first_name + (ctx.from.last_name ? ' ' + ctx.from.last_name : ''),
    })
  }

  return next()
})

// Role/team-based topic access control — must run after auto-registration above
// so a first-time sender already exists as a member by the time we check access.
bot.use(async (ctx, next) => {
  // Only check in groups
  if (!ctx.chat || ctx.chat.type === 'private') return next()

  // Admin bypasses all checks
  if (isAdminTelegramId(ctx.from?.id)) return next()

  // Get the topic (message_thread_id)
  const threadId = ctx.message?.message_thread_id
  if (!threadId) return next() // General topic (no thread) = open

  const topicName = await getTopicNameFromThread(threadId)
  if (!topicName) return next() // Unknown topic = allow

  const access = await canAccessTopic(ctx.from!.id, topicName)
  if (!access.allowed) {
    // Reply privately instead of in the topic
    try {
      await ctx.reply(`🚫 ${access.reason}`)
    } catch {
      // Can't reply, ignore
    }
    return // Don't process further
  }

  return next()
})

interface AddTaskSession {
  step: 'awaiting_member' | 'awaiting_priority' | 'awaiting_due_date'
  title: string
  memberId?: string
  memberName?: string
  priority?: TaskPriority
}

// Single in-process draft per chat — fine for a small team bot on one long-running instance.
const addTaskSessions = new Map<number, AddTaskSession>()

function commandArgs(text: string | undefined): string {
  if (!text) return ''
  const spaceIdx = text.indexOf(' ')
  return spaceIdx === -1 ? '' : text.slice(spaceIdx + 1).trim()
}

// Splits command args into tokens, treating "quoted phrases" as a single token —
// needed for team/topic names that contain spaces, e.g. /addmemberteam Alice "Instagram VAs"
function parseQuotedArgs(text: string): string[] {
  const tokens: string[] = []
  const regex = /"([^"]+)"|(\S+)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    tokens.push(match[1] ?? match[2])
  }
  return tokens
}

const PLATFORM_EMOJI: Record<string, string> = {
  twitter: '🐦',
  reddit: '📺',
  instagram: '📸',
  tiktok: '🎵',
  youtube: '▶️',
}

function teamEmoji(teamName: string): string {
  const lower = teamName.toLowerCase()
  for (const [platform, emoji] of Object.entries(PLATFORM_EMOJI)) {
    if (lower.includes(platform)) return emoji
  }
  return '👥'
}

async function requireAdmin(ctx: Context): Promise<boolean> {
  if (isAdminTelegramId(ctx.from?.id)) return true
  await reply(ctx, '🚫 Only the admin can do that.')
  return false
}

/** Looks up the sender's own task by id prefix — fails if unregistered, ambiguous, missing, or not theirs. */
async function requireOwnTask(
  ctx: Context,
  prefix: string
): Promise<{ member: TfMember; task: TfTask } | null> {
  const member = await getMemberByTelegramId(supabase, ctx.from!.id)
  if (!member) {
    await reply(ctx, "You're not registered yet — ask the admin to add you with /addmember.")
    return null
  }

  const { task, ambiguous } = await findTaskByPrefix(supabase, prefix)
  if (ambiguous) {
    await reply(ctx, 'That id prefix matches more than one task. Use more characters.')
    return null
  }
  if (!task) {
    await reply(ctx, 'No task found with that ID.')
    return null
  }
  if (task.assignee_id !== member.id) {
    await reply(ctx, '🚫 That task is assigned to someone else. You can only complete your own tasks.')
    return null
  }

  return { member, task }
}

async function notifyAdminOfCompletion(memberName: string, taskTitle: string): Promise<void> {
  const adminId = process.env.ADMIN_TELEGRAM_ID
  if (!adminId) return
  try {
    await bot.telegram.sendMessage(Number(adminId), `✅ ${memberName} completed: "${taskTitle}"`)
  } catch (err) {
    console.error('Failed to notify admin of task completion:', err)
  }
}

const MEMBER_WELCOME_TEXT = (name: string) => `👋 Welcome to TeamFlow, ${name}!

Here's what you can do:

📋 /mytasks — See your tasks
✅ /done <id> — Mark a task as complete
▶️ /start <id> — Start a task (move to In Progress)
⏸️ /pause <id> — Pause a task (move back to To Do)
📊 /myworkload — See your workload
✅ /mydone — See your completed tasks
💡 /mine — Same as /mytasks

You can also just ask me questions like:
"What are my tasks?" or "Mark the landing page task as done"`

const HELP_TEXT = `<b>TeamFlow Bot commands</b>

/addtask &lt;title&gt; — create and assign a task
/myteam — team overview
/who &lt;skill&gt; — find available members with a skill
/status — board status summary
/overdue — list overdue tasks
/task &lt;id&gt; — show task details
/complete &lt;id&gt; — mark a task done
/assign &lt;id&gt; @username — reassign a task
/addmember &lt;name&gt; &lt;telegram_username&gt; [team] — add a team member
/addskill &lt;name&gt; — add a skill to the catalog
/addteam &lt;name&gt; — create a team (admin)
/addmemberteam &lt;member&gt; &lt;team&gt; — add member to team (admin)
/teams — list all teams
/myteam — see your team
/granttopic &lt;topic&gt; &lt;team&gt; — grant topic access to team (admin)
/revoketopic &lt;topic&gt; &lt;team&gt; — revoke topic access (admin)
/topicaccess — show topic access control (admin)
/sops — list all Standard Operating Procedures
/sop &lt;name&gt; — view a specific SOP
/syncsops — sync all SOPs to the Telegram SOPs topic (admin only)
/mine — your own tasks
/mytasks — your own tasks, grouped by status
/done &lt;id&gt; — mark your own task as complete
/start &lt;id&gt; — start your own task (move to In Progress)
/pause &lt;id&gt; — pause your own task (move back to To Do)
/mydone — your completed tasks (last 7 days)
/myworkload — your own workload
/cancel — cancel the current /addtask flow
/help — show this message

You can also just ask me things in plain English, e.g. "who has design skills free today?"

<b>To use me in a group:</b>
1. Add me to the group
2. In @BotFather, run /setprivacy, select me, choose "Disable"
3. Make me an admin in the group
4. @mention me to talk to me: "@${BOT_USERNAME} who has free time?"`

bot.start(async (ctx) => {
  const arg = ctx.message && 'text' in ctx.message ? commandArgs(ctx.message.text) : ''

  if (arg) {
    const result = await requireOwnTask(ctx, arg)
    if (!result) return
    const { member, task } = result

    const { error } = await supabase.from('tf_tasks').update({ status: 'in_progress' }).eq('id', task.id)
    if (error) {
      await reply(ctx, `Failed to start task: ${error.message}`)
      return
    }

    await logActivity(supabase, {
      taskId: task.id,
      memberId: member.id,
      action: 'status_changed',
      oldValue: task.status,
      newValue: 'in_progress',
    })

    await reply(ctx, `✅ Started: "${task.title}" — moved to In Progress`)
    return
  }

  if (ctx.from && !isAdminTelegramId(ctx.from.id)) {
    const member = await getMemberByTelegramId(supabase, ctx.from.id)
    await reply(ctx, MEMBER_WELCOME_TEXT(member?.name ?? ctx.from.first_name))
    return
  }

  await reply(ctx,
    `👋 Welcome to <b>TeamFlow Bot</b>!\n\nI help manage tasks and team workload for this group.\n\n${HELP_TEXT}`,
    { parse_mode: 'HTML' }
  )
})

bot.command('help', async (ctx) => {
  await reply(ctx, HELP_TEXT, { parse_mode: 'HTML' })
})

bot.command('cancel', async (ctx) => {
  addTaskSessions.delete(ctx.chat.id)
  await reply(ctx, 'Cancelled.')
})

// ---------------------------------------------------------------------------
// /addtask
// ---------------------------------------------------------------------------

bot.command('addtask', async (ctx) => {
  if (!(await requireAdmin(ctx))) return

  const title = commandArgs(ctx.message.text)
  if (!title) {
    await reply(ctx, 'Usage: /addtask <title>')
    return
  }

  const { data: members } = await supabase
    .from('tf_members')
    .select('*')
    .eq('status', 'active')
    .order('name', { ascending: true })

  const activeMembers = (members as TfMember[]) ?? []
  if (activeMembers.length === 0) {
    await reply(ctx, 'No active members found. Add one with /addmember first.')
    return
  }

  addTaskSessions.set(ctx.chat.id, { step: 'awaiting_member', title })

  const buttons = activeMembers.map((m) => [
    Markup.button.callback(`${m.name} (${m.role})`, `addtask:member:${m.id}`),
  ])

  await reply(ctx,
    `📝 New task: "${escapeHtml(title)}"\n\nWho should this be assigned to?`,
    Markup.inlineKeyboard(buttons)
  )
})

bot.action(/^addtask:member:(.+)$/, async (ctx) => {
  const session = addTaskSessions.get(ctx.chat!.id)
  if (!session || session.step !== 'awaiting_member') {
    await ctx.answerCbQuery('This flow has expired. Start again with /addtask.')
    return
  }

  const memberId = ctx.match[1]
  const { data: member } = await supabase.from('tf_members').select('*').eq('id', memberId).maybeSingle()
  if (!member) {
    await ctx.answerCbQuery('Member not found.')
    return
  }

  session.memberId = member.id
  session.memberName = (member as TfMember).name
  session.step = 'awaiting_priority'

  await ctx.answerCbQuery()
  await ctx.editMessageText(
    `📝 New task: "${escapeHtml(session.title)}"\nAssignee: ${escapeHtml(session.memberName)}\n\nWhat priority?`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback('Low', 'addtask:priority:low'),
        Markup.button.callback('Medium', 'addtask:priority:medium'),
      ],
      [
        Markup.button.callback('High', 'addtask:priority:high'),
        Markup.button.callback('Urgent', 'addtask:priority:urgent'),
      ],
    ])
  )
})

bot.action(/^addtask:priority:(.+)$/, async (ctx) => {
  const session = addTaskSessions.get(ctx.chat!.id)
  if (!session || session.step !== 'awaiting_priority') {
    await ctx.answerCbQuery('This flow has expired. Start again with /addtask.')
    return
  }

  session.priority = ctx.match[1] as TaskPriority
  session.step = 'awaiting_due_date'

  await ctx.answerCbQuery()
  await ctx.editMessageText(
    `📝 New task: "${escapeHtml(session.title)}"\nAssignee: ${escapeHtml(session.memberName!)}\nPriority: ${session.priority}\n\nSend the due date as YYYY-MM-DD, or 'none'.`
  )
})

async function finalizeAddTask(ctx: Context, session: AddTaskSession, dueDateInput: string) {
  const supabaseClient = supabase
  let dueDate: string | null = null

  if (dueDateInput.toLowerCase() !== 'none') {
    const parsed = new Date(dueDateInput)
    if (isNaN(parsed.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(dueDateInput)) {
      await reply(ctx, "That doesn't look like a valid date. Send YYYY-MM-DD or 'none'.")
      return
    }
    dueDate = parsed.toISOString()
  }

  const board = await getDefaultBoard(supabaseClient)
  const creator = await getMemberByTelegramId(supabaseClient, ctx.from!.id)

  const { data: task, error } = await supabaseClient
    .from('tf_tasks')
    .insert({
      title: session.title,
      board_id: board.id,
      assignee_id: session.memberId,
      created_by: creator?.id ?? null,
      priority: session.priority,
      due_date: dueDate,
      status: 'todo',
    })
    .select('*')
    .single()

  if (error || !task) {
    await reply(ctx, `Failed to create task: ${error?.message ?? 'unknown error'}`)
    return
  }

  await logActivity(supabaseClient, {
    taskId: (task as TfTask).id,
    memberId: creator?.id ?? null,
    action: 'created',
    newValue: session.title,
    metadata: { assignee: session.memberName, priority: session.priority, due_date: dueDate },
  })

  addTaskSessions.delete(ctx.chat!.id)

  const dueDisplay = dueDate ? dueDate.slice(0, 10) : 'none'
  await reply(ctx,
    `✅ Task created: "${session.title}" assigned to ${session.memberName}, priority: ${session.priority}, due: ${dueDisplay}`
  )

  const { data: assignee } = await supabaseClient
    .from('tf_members')
    .select('*')
    .eq('id', session.memberId)
    .maybeSingle()

  if (assignee && (assignee as TfMember).telegram_id) {
    try {
      await bot.telegram.sendMessage(
        (assignee as TfMember).telegram_id!,
        `📌 You've been assigned a new task: "${session.title}"\nPriority: ${session.priority}\nDue: ${dueDisplay}`
      )
    } catch (err) {
      console.error('Failed to notify assignee:', err)
    }
  }

  await notifyTaskAssigned(task as TfTask, session.memberName!)
}

// ---------------------------------------------------------------------------
// /myteam — the sender's team and teammates
// ---------------------------------------------------------------------------

bot.command('myteam', async (ctx) => {
  const member = await getMemberByTelegramId(supabase, ctx.from.id)
  if (!member) {
    await reply(ctx, "You're not registered yet — ask the admin to add you with /addmember.")
    return
  }

  const { data: memberTeams } = await supabase
    .from('tf_member_teams')
    .select('team:tf_teams(*)')
    .eq('member_id', member.id)
    .limit(1)

  const team = ((memberTeams as unknown as { team: TfTeam | null }[]) ?? [])[0]?.team ?? null
  if (!team) {
    await reply(ctx, "You're not on a team yet. Ask the admin to add you with /addmemberteam.")
    return
  }

  const { data: teammateRows } = await supabase
    .from('tf_member_teams')
    .select('member:tf_members(*)')
    .eq('team_id', team.id)

  const teammates = ((teammateRows as unknown as { member: TfMember | null }[]) ?? [])
    .map((r) => r.member)
    .filter((m): m is TfMember => !!m && m.id !== member.id)
    .sort((a, b) => a.name.localeCompare(b.name))

  const { data: tasks } = await supabase.from('tf_tasks').select('*')
  const allTasks = (tasks as TfTask[]) ?? []

  const activeCountFor = (memberId: string) => allTasks.filter((t) => t.assignee_id === memberId && t.status !== 'done').length

  const teammateLines = teammates.map((m) => {
    const active = activeCountFor(m.id)
    const handle = m.telegram_username ? `@${m.telegram_username}` : 'no username'
    const availability = active === 0 ? 'available' : 'busy'
    return `  • ${m.name} (${handle}) — ${active} active task${active === 1 ? '' : 's'} (${availability})`
  })

  const myActive = allTasks.filter((t) => t.assignee_id === member.id && t.status !== 'done')
  const myOverdue = myActive.filter((t) => isOverdue(t))

  const lines = [`👥 Your team: ${team.name}`]
  if (teammateLines.length > 0) {
    lines.push('', 'Teammates:', ...teammateLines)
  } else {
    lines.push('', "You're the only member on this team.")
  }
  lines.push('', `Your tasks: ${myActive.length} active, ${myOverdue.length} overdue`)

  await reply(ctx, lines.join('\n'))
})

// ---------------------------------------------------------------------------
// /who <skill>
// ---------------------------------------------------------------------------

bot.command('who', async (ctx) => {
  const skillQuery = commandArgs(ctx.message.text)
  if (!skillQuery) {
    await reply(ctx, 'Usage: /who <skill>')
    return
  }

  const { data: skills } = await supabase.from('tf_skills').select('*').ilike('name', `%${skillQuery}%`)
  if (!skills || skills.length === 0) {
    await reply(ctx, `No skills found matching "${skillQuery}".`)
    return
  }
  const skillIds = skills.map((s) => s.id)

  const { data: memberSkills } = await supabase
    .from('tf_member_skills')
    .select('proficiency_level, member:tf_members(*)')
    .in('skill_id', skillIds)

  const rows = (memberSkills as unknown as { proficiency_level: number; member: TfMember | null }[]) ?? []
  const activeRows = rows.filter((r) => r.member && r.member.status === 'active')

  if (activeRows.length === 0) {
    await reply(ctx, `No active members found with skill matching "${skillQuery}".`)
    return
  }

  const { data: tasks } = await supabase.from('tf_tasks').select('*').neq('status', 'done')
  const activeTasks = (tasks as TfTask[]) ?? []

  const results = activeRows.map((r) => {
    const member = r.member as TfMember
    const memberTasks = activeTasks.filter((t) => t.assignee_id === member.id)
    const bookedHours = memberTasks.reduce((sum, t) => sum + (t.estimated_hours ?? 0), 0)
    const capacity = member.max_daily_hours - bookedHours
    return {
      member,
      proficiency: r.proficiency_level,
      bookedHours,
      capacity,
      available: bookedHours < member.max_daily_hours,
    }
  })

  results.sort((a, b) => b.capacity - a.capacity)

  const lines = results.map((r, i) => {
    const status = r.available ? 'AVAILABLE' : 'BUSY'
    return `${i + 1}. ${r.member.name} — ${r.bookedHours}/${r.member.max_daily_hours}h booked today (${status})\n   Proficiency: ${r.proficiency}/5`
  })

  const top = results[0]
  await reply(ctx,
    `🔍 Members with '${skillQuery}' skill:\n\n${lines.join('\n')}\n\n💡 Recommendation: ${top.member.name} has the most capacity.`
  )
})

// ---------------------------------------------------------------------------
// /status
// ---------------------------------------------------------------------------

bot.command('status', async (ctx) => {
  const board = await getDefaultBoard(supabase)
  const { data: tasks } = await supabase.from('tf_tasks').select('*, assignee:tf_members(name)').eq('board_id', board.id)
  const allTasks = tasks ?? []

  const counts: Record<string, number> = { todo: 0, in_progress: 0, review: 0, done: 0, blocked: 0 }
  for (const t of allTasks) counts[t.status] = (counts[t.status] ?? 0) + 1

  const overdue = allTasks.filter((t) => isOverdue(t))

  let msg = `📋 Board: ${board.name}\n\n📌 To Do: ${counts.todo}\n🔄 In Progress: ${counts.in_progress}\n👀 Review: ${counts.review}\n✅ Done: ${counts.done}\n🚫 Blocked: ${counts.blocked}`

  if (overdue.length > 0) {
    msg += `\n\n⚠️ Overdue (${overdue.length}):\n`
    msg += overdue
      .map((t) => `  • "${t.title}" — assigned to ${t.assignee?.name ?? 'unassigned'}, due ${formatDueDate(t.due_date)}`)
      .join('\n')
  }

  await reply(ctx, msg)
})

// ---------------------------------------------------------------------------
// /overdue
// ---------------------------------------------------------------------------

bot.command('overdue', async (ctx) => {
  const { data: tasks } = await supabase
    .from('tf_tasks')
    .select('*, assignee:tf_members(name, telegram_username)')
    .neq('status', 'done')
    .not('due_date', 'is', null)

  const overdue = (tasks ?? []).filter((t) => isOverdue(t))

  if (overdue.length === 0) {
    await reply(ctx, '🎉 No overdue tasks!')
    return
  }

  const lines = overdue.map((t, i) => {
    const assignee = t.assignee?.telegram_username ? `@${t.assignee.telegram_username}` : t.assignee?.name ?? 'unassigned'
    return `${i + 1}. "${t.title}"\n   Assigned: ${assignee}\n   Due: ${formatDueDate(t.due_date)}\n   Priority: ${t.priority.toUpperCase()}`
  })

  await reply(ctx, `⚠️ Overdue Tasks (${overdue.length}):\n\n${lines.join('\n\n')}`)
})

// ---------------------------------------------------------------------------
// /task <id>
// ---------------------------------------------------------------------------

bot.command('task', async (ctx) => {
  const prefix = commandArgs(ctx.message.text)
  if (!prefix) {
    await reply(ctx, 'Usage: /task <id>')
    return
  }

  const { task, ambiguous } = await findTaskByPrefix(supabase, prefix)
  if (ambiguous) {
    await reply(ctx, 'That id prefix matches more than one task. Use more characters.')
    return
  }
  if (!task) {
    await reply(ctx, `No task found with id starting with "${prefix}".`)
    return
  }

  const { data: assignee } = task.assignee_id
    ? await supabase.from('tf_members').select('name').eq('id', task.assignee_id).maybeSingle()
    : { data: null }
  const { data: board } = await supabase.from('tf_boards').select('name').eq('id', task.board_id).maybeSingle()

  const msg = [
    `📄 Task ${shortId(task.id)}: "${task.title}"`,
    task.description ? `\n${task.description}` : '',
    `\nStatus: ${statusLabel(task.status)}`,
    `Priority: ${priorityEmoji(task.priority)} ${task.priority}`,
    `Board: ${board?.name ?? 'unknown'}`,
    `Assignee: ${assignee?.name ?? 'unassigned'}`,
    `Due: ${formatDueDate(task.due_date)}`,
    task.estimated_hours != null ? `Estimated hours: ${task.estimated_hours}` : '',
    task.actual_hours != null ? `Actual hours: ${task.actual_hours}` : '',
    task.tags?.length ? `Tags: ${task.tags.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  await reply(ctx, msg)
})

// ---------------------------------------------------------------------------
// /complete <id>
// ---------------------------------------------------------------------------

bot.command('complete', async (ctx) => {
  if (!(await requireAdmin(ctx))) return

  const prefix = commandArgs(ctx.message.text)
  if (!prefix) {
    await reply(ctx, 'Usage: /complete <id>')
    return
  }

  const { task, ambiguous } = await findTaskByPrefix(supabase, prefix)
  if (ambiguous) {
    await reply(ctx, 'That id prefix matches more than one task. Use more characters.')
    return
  }
  if (!task) {
    await reply(ctx, `No task found with id starting with "${prefix}".`)
    return
  }

  const { error } = await supabase
    .from('tf_tasks')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('id', task.id)

  if (error) {
    await reply(ctx, `Failed to complete task: ${error.message}`)
    return
  }

  const actor = await getMemberByTelegramId(supabase, ctx.from.id)
  await logActivity(supabase, {
    taskId: task.id,
    memberId: actor?.id ?? null,
    action: 'completed',
    oldValue: task.status,
    newValue: 'done',
  })

  await reply(ctx, `✅ Marked "${task.title}" as done.`)

  const { data: assignee } = task.assignee_id
    ? await supabase.from('tf_members').select('name').eq('id', task.assignee_id).maybeSingle()
    : { data: null }
  await notifyTaskCompleted(task, assignee?.name ?? null)
})

// ---------------------------------------------------------------------------
// /assign <id> @username
// ---------------------------------------------------------------------------

bot.command('assign', async (ctx) => {
  if (!(await requireAdmin(ctx))) return

  const args = commandArgs(ctx.message.text).split(/\s+/).filter(Boolean)
  if (args.length < 2) {
    await reply(ctx, 'Usage: /assign <id> @username')
    return
  }
  const [prefix, usernameArg] = args

  const { task, ambiguous } = await findTaskByPrefix(supabase, prefix)
  if (ambiguous) {
    await reply(ctx, 'That id prefix matches more than one task. Use more characters.')
    return
  }
  if (!task) {
    await reply(ctx, `No task found with id starting with "${prefix}".`)
    return
  }

  const newAssignee = await getMemberByUsername(supabase, usernameArg)
  if (!newAssignee) {
    await reply(ctx, `No member found with username "${usernameArg}".`)
    return
  }

  const { data: oldAssignee } = task.assignee_id
    ? await supabase.from('tf_members').select('name').eq('id', task.assignee_id).maybeSingle()
    : { data: null }

  const { error } = await supabase.from('tf_tasks').update({ assignee_id: newAssignee.id }).eq('id', task.id)
  if (error) {
    await reply(ctx, `Failed to reassign task: ${error.message}`)
    return
  }

  const actor = await getMemberByTelegramId(supabase, ctx.from.id)
  await logActivity(supabase, {
    taskId: task.id,
    memberId: actor?.id ?? null,
    action: 'assigned',
    oldValue: oldAssignee?.name ?? null,
    newValue: newAssignee.name,
  })

  await reply(ctx, `✅ Reassigned "${task.title}" to ${newAssignee.name}.`)

  if (newAssignee.telegram_id) {
    try {
      await bot.telegram.sendMessage(newAssignee.telegram_id, `📌 You've been assigned: "${task.title}"`)
    } catch (err) {
      console.error('Failed to notify new assignee:', err)
    }
  }
})

// ---------------------------------------------------------------------------
// /addmember <name> <telegram_username> [team_name]
// ---------------------------------------------------------------------------

bot.command('addmember', async (ctx) => {
  if (!(await requireAdmin(ctx))) return

  const args = commandArgs(ctx.message.text).trim()
  const tokens = parseQuotedArgs(args)
  if (tokens.length < 2) {
    await reply(ctx, 'Usage: /addmember <name> <telegram_username> [team_name]\nQuote multi-word names, e.g. /addmember "John Smith" johnsmith "Instagram VAs"')
    return
  }

  const name = tokens[0]
  const username = tokens[1].replace(/^@/, '')
  const teamName = tokens.length > 2 ? tokens.slice(2).join(' ') : undefined

  const { data, error } = await supabase
    .from('tf_members')
    .insert({ name, telegram_username: username })
    .select('*')
    .single()

  if (error || !data) {
    await reply(ctx, `Failed to add member: ${error?.message ?? 'unknown error'}`)
    return
  }

  let message = `✅ Added ${name} (@${username}) to the team.`

  if (teamName) {
    const { data: team } = await supabase.from('tf_teams').select('*').ilike('name', teamName).maybeSingle()
    if (team) {
      await supabase.from('tf_member_teams').insert({ member_id: (data as TfMember).id, team_id: (team as TfTeam).id })
      message += ` Added to the "${(team as TfTeam).name}" team.`
    } else {
      message += ` ⚠️ Team "${teamName}" not found — create it first with /addteam.`
    }
  }

  await reply(ctx, message)
})

// ---------------------------------------------------------------------------
// /addteam <name>
// ---------------------------------------------------------------------------

bot.command('addteam', async (ctx) => {
  if (!(await requireAdmin(ctx))) return

  const name = commandArgs(ctx.message.text).trim()
  if (!name) {
    await reply(ctx, 'Usage: /addteam <name>')
    return
  }

  const { error } = await supabase.from('tf_teams').insert({ name })
  if (error) {
    await reply(ctx, `Failed to create team: ${error.message}`)
    return
  }

  await reply(ctx, `✅ Created team "${name}". Add members with /addmember <name> <username> <team>`)
})

// ---------------------------------------------------------------------------
// /addmemberteam <member_name> <team_name>
// ---------------------------------------------------------------------------

bot.command('addmemberteam', async (ctx) => {
  if (!(await requireAdmin(ctx))) return

  const tokens = parseQuotedArgs(commandArgs(ctx.message.text))
  if (tokens.length < 2) {
    await reply(ctx, 'Usage: /addmemberteam <member_name> <team_name>')
    return
  }

  const memberName = tokens[0]
  const teamName = tokens.slice(1).join(' ')

  const { data: member } = await supabase.from('tf_members').select('*').ilike('name', memberName).maybeSingle()
  if (!member) {
    await reply(ctx, `No member found named "${memberName}".`)
    return
  }

  const { data: team } = await supabase.from('tf_teams').select('*').ilike('name', teamName).maybeSingle()
  if (!team) {
    await reply(ctx, `No team found named "${teamName}". Create it first with /addteam.`)
    return
  }

  const { error } = await supabase
    .from('tf_member_teams')
    .insert({ member_id: (member as TfMember).id, team_id: (team as TfTeam).id })

  if (error) {
    if (error.code === '23505') {
      await reply(ctx, `${(member as TfMember).name} is already on the "${(team as TfTeam).name}" team.`)
    } else {
      await reply(ctx, `Failed to add member to team: ${error.message}`)
    }
    return
  }

  await reply(ctx, `✅ Added ${(member as TfMember).name} to the "${(team as TfTeam).name}" team.`)
})

// ---------------------------------------------------------------------------
// /teams — list all teams and their members
// ---------------------------------------------------------------------------

bot.command('teams', async (ctx) => {
  const { data: teams } = await supabase.from('tf_teams').select('*').order('name', { ascending: true })
  const allTeams = (teams as TfTeam[]) ?? []

  if (allTeams.length === 0) {
    await reply(ctx, 'No teams yet. Create one with /addteam <name>.')
    return
  }

  const { data: memberTeamRows } = await supabase.from('tf_member_teams').select('team_id, member:tf_members(*)')
  const rows = (memberTeamRows as unknown as { team_id: string; member: TfMember | null }[]) ?? []

  const { data: tasks } = await supabase.from('tf_tasks').select('*')
  const allTasks = (tasks as TfTask[]) ?? []
  const activeCountFor = (memberId: string) => allTasks.filter((t) => t.assignee_id === memberId && t.status !== 'done').length

  const sections = allTeams.map((team) => {
    const members = rows
      .filter((r) => r.team_id === team.id && r.member)
      .map((r) => r.member as TfMember)
      .sort((a, b) => a.name.localeCompare(b.name))

    const lines = members.map((m) => {
      const active = activeCountFor(m.id)
      const handle = m.telegram_username ? `@${m.telegram_username}` : 'no username'
      return `  • ${m.name} (${handle}) — ${active} active task${active === 1 ? '' : 's'}`
    })

    const header = `${teamEmoji(team.name)} ${team.name} (${members.length} member${members.length === 1 ? '' : 's'}):`
    return lines.length > 0 ? `${header}\n${lines.join('\n')}` : header
  })

  await reply(ctx, `👥 Teams:\n\n${sections.join('\n\n')}\n\nSend /myteam to see your team.`)
})

// ---------------------------------------------------------------------------
// /granttopic <topic_name> <team_name>
// ---------------------------------------------------------------------------

bot.command('granttopic', async (ctx) => {
  if (!(await requireAdmin(ctx))) return

  const tokens = parseQuotedArgs(commandArgs(ctx.message.text))
  if (tokens.length < 2) {
    await reply(ctx, 'Usage: /granttopic <topic_name> <team_name>')
    return
  }

  const topicName = tokens[0].toLowerCase()
  const teamName = tokens.slice(1).join(' ')

  const topic = DEFAULT_TOPICS.find((t) => t.name === topicName)
  if (!topic) {
    await reply(ctx, `Unknown topic "${topicName}". Known topics: ${DEFAULT_TOPICS.map((t) => t.name).join(', ')}`)
    return
  }

  const { data: team } = await supabase.from('tf_teams').select('*').ilike('name', teamName).maybeSingle()
  if (!team) {
    await reply(ctx, `No team found named "${teamName}". Create it first with /addteam.`)
    return
  }

  const { error } = await supabase
    .from('tf_topic_team_access')
    .upsert({ topic_name: topicName, team_id: (team as TfTeam).id }, { onConflict: 'topic_name,team_id' })

  if (error) {
    await reply(ctx, `Failed to grant access: ${error.message}`)
    return
  }

  await reply(ctx, `✅ Team "${(team as TfTeam).name}" now has access to the ${topic.title} topic.`)
})

// ---------------------------------------------------------------------------
// /revoketopic <topic_name> <team_name>
// ---------------------------------------------------------------------------

bot.command('revoketopic', async (ctx) => {
  if (!(await requireAdmin(ctx))) return

  const tokens = parseQuotedArgs(commandArgs(ctx.message.text))
  if (tokens.length < 2) {
    await reply(ctx, 'Usage: /revoketopic <topic_name> <team_name>')
    return
  }

  const topicName = tokens[0].toLowerCase()
  const teamName = tokens.slice(1).join(' ')

  const topic = DEFAULT_TOPICS.find((t) => t.name === topicName)
  if (!topic) {
    await reply(ctx, `Unknown topic "${topicName}". Known topics: ${DEFAULT_TOPICS.map((t) => t.name).join(', ')}`)
    return
  }

  const { data: team } = await supabase.from('tf_teams').select('*').ilike('name', teamName).maybeSingle()
  if (!team) {
    await reply(ctx, `No team found named "${teamName}".`)
    return
  }

  const { error } = await supabase
    .from('tf_topic_team_access')
    .delete()
    .eq('topic_name', topicName)
    .eq('team_id', (team as TfTeam).id)

  if (error) {
    await reply(ctx, `Failed to revoke access: ${error.message}`)
    return
  }

  await reply(ctx, `✅ Team "${(team as TfTeam).name}" no longer has access to the ${topic.title} topic.`)
})

// ---------------------------------------------------------------------------
// /topicaccess — show which roles/teams can access which topics (admin only)
// ---------------------------------------------------------------------------

bot.command('topicaccess', async (ctx) => {
  if (!(await requireAdmin(ctx))) return

  const { data: roleAccess } = await supabase.from('tf_topic_access').select('*')
  const { data: teamAccess } = await supabase.from('tf_topic_team_access').select('topic_name, team:tf_teams(name)')

  const roleRows = (roleAccess as { topic_name: string; role: string }[]) ?? []
  const teamRows = (teamAccess as unknown as { topic_name: string; team: { name: string } | null }[]) ?? []

  const ROLE_ORDER = ['admin', 'manager', 'worker']

  const lines = DEFAULT_TOPICS.map((topic) => {
    const roles = roleRows
      .filter((r) => r.topic_name === topic.name)
      .map((r) => r.role)
      .sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b))
    const teams = teamRows.filter((r) => r.topic_name === topic.name && r.team).map((r) => r.team!.name)

    const isEveryone = ROLE_ORDER.every((r) => roles.includes(r))
    const parts = isEveryone ? ['Everyone'] : [...roles, ...teams.map((t) => `"${t}"`)]
    if (!isEveryone && parts.length === 0) parts.push('admin only')

    return `${topic.title}: ${parts.join(', ')}`
  })

  await reply(ctx, `📋 Topic Access Control:\n\n${lines.join('\n')}`)
})

// ---------------------------------------------------------------------------
// /addskill <name>
// ---------------------------------------------------------------------------

bot.command('addskill', async (ctx) => {
  if (!(await requireAdmin(ctx))) return

  const name = commandArgs(ctx.message.text).trim()
  if (!name) {
    await reply(ctx, 'Usage: /addskill <name>')
    return
  }

  const { error } = await supabase.from('tf_skills').insert({ name })
  if (error) {
    await reply(ctx, `Failed to add skill: ${error.message}`)
    return
  }

  await reply(ctx, `✅ Added skill "${name}".`)
})

// ---------------------------------------------------------------------------
// /mine, /mytasks — the sender's own tasks, grouped by status
// ---------------------------------------------------------------------------

async function sendMyTasks(ctx: Context) {
  const member = await getMemberByTelegramId(supabase, ctx.from!.id)
  if (!member) {
    await reply(ctx, "You're not registered yet — ask the admin to add you with /addmember.")
    return
  }

  const { data: tasks } = await supabase.from('tf_tasks').select('*').eq('assignee_id', member.id)
  const allTasks = (tasks as TfTask[]) ?? []
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000

  const todo = allTasks.filter((t) => t.status === 'todo')
  const inProgress = allTasks.filter((t) => t.status === 'in_progress')
  const review = allTasks.filter((t) => t.status === 'review')
  const doneThisWeek = allTasks
    .filter((t) => t.status === 'done' && t.completed_at && new Date(t.completed_at).getTime() >= weekAgo)
    .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime())

  const activeCount = todo.length + inProgress.length + review.length
  const taskLine = (t: TfTask) => `  • ${shortId(t.id)} — "${t.title}" — due ${formatShortDate(t.due_date)} (${t.priority})`

  const lines = [`📋 Your Tasks (${activeCount} active):`]

  if (todo.length > 0) lines.push('', `📌 To Do (${todo.length}):`, ...todo.map(taskLine))
  if (inProgress.length > 0) lines.push('', `🔄 In Progress (${inProgress.length}):`, ...inProgress.map(taskLine))
  if (review.length > 0) lines.push('', `👀 Review (${review.length}):`, ...review.map(taskLine))
  if (activeCount === 0) lines.push('', '🎉 Nothing active right now!')

  if (doneThisWeek.length > 0) {
    lines.push(
      '',
      `✅ Done this week (${doneThisWeek.length}):`,
      ...doneThisWeek.map((t) => `  • "${t.title}" — completed ${formatDueDate(t.completed_at)}`)
    )
  }

  lines.push('', 'Send /done <id> to mark a task as complete.', 'Send /start <id> to start a task.')

  await reply(ctx, lines.join('\n'))
}

bot.command('mine', sendMyTasks)
bot.command('mytasks', sendMyTasks)

// ---------------------------------------------------------------------------
// /done <id> — a member completes their own task
// ---------------------------------------------------------------------------

bot.command('done', async (ctx) => {
  const prefix = commandArgs(ctx.message.text)
  if (!prefix) {
    await reply(ctx, 'Usage: /done <id>')
    return
  }

  const result = await requireOwnTask(ctx, prefix)
  if (!result) return
  const { member, task } = result

  const { error } = await supabase
    .from('tf_tasks')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('id', task.id)

  if (error) {
    await reply(ctx, `Failed to complete task: ${error.message}`)
    return
  }

  await logActivity(supabase, {
    taskId: task.id,
    memberId: member.id,
    action: 'completed',
    oldValue: task.status,
    newValue: 'done',
  })

  await reply(ctx, `✅ Marked "${task.title}" as done.`)

  await notifyTaskCompleted(task, member.name)
  await notifyAdminOfCompletion(member.name, task.title)
})

// ---------------------------------------------------------------------------
// /pause <id> — a member pauses their own in-progress task
// ---------------------------------------------------------------------------

bot.command('pause', async (ctx) => {
  const prefix = commandArgs(ctx.message.text)
  if (!prefix) {
    await reply(ctx, 'Usage: /pause <id>')
    return
  }

  const result = await requireOwnTask(ctx, prefix)
  if (!result) return
  const { member, task } = result

  const { error } = await supabase.from('tf_tasks').update({ status: 'todo' }).eq('id', task.id)
  if (error) {
    await reply(ctx, `Failed to pause task: ${error.message}`)
    return
  }

  await logActivity(supabase, {
    taskId: task.id,
    memberId: member.id,
    action: 'status_changed',
    oldValue: task.status,
    newValue: 'todo',
  })

  await reply(ctx, `⏸️ Paused: "${task.title}" — moved back to To Do`)
})

// ---------------------------------------------------------------------------
// /mydone — tasks the sender completed in the last 7 days
// ---------------------------------------------------------------------------

bot.command('mydone', async (ctx) => {
  const member = await getMemberByTelegramId(supabase, ctx.from.id)
  if (!member) {
    await reply(ctx, "You're not registered yet — ask the admin to add you with /addmember.")
    return
  }

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const { data: tasks } = await supabase
    .from('tf_tasks')
    .select('*')
    .eq('assignee_id', member.id)
    .eq('status', 'done')

  const doneThisWeek = ((tasks as TfTask[]) ?? [])
    .filter((t) => t.completed_at && new Date(t.completed_at).getTime() >= weekAgo)
    .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime())

  if (doneThisWeek.length === 0) {
    await reply(ctx, '✅ Your Completed Tasks (7 days):\n\nNo tasks completed this week yet.')
    return
  }

  const lines = [
    '✅ Your Completed Tasks (7 days):',
    '',
    ...doneThisWeek.map((t, i) => `${i + 1}. "${t.title}" — completed ${formatShortDate(t.completed_at)}`),
    '',
    `Great job! ${doneThisWeek.length} task${doneThisWeek.length === 1 ? '' : 's'} completed this week.`,
  ]

  await reply(ctx, lines.join('\n'))
})

// ---------------------------------------------------------------------------
// /myworkload — the sender's workload and capacity
// ---------------------------------------------------------------------------

bot.command('myworkload', async (ctx) => {
  const member = await getMemberByTelegramId(supabase, ctx.from.id)
  if (!member) {
    await reply(ctx, "You're not registered yet — ask the admin to add you with /addmember.")
    return
  }

  const workload = await getMemberWorkload(member.id)
  const statusEmoji: Record<string, string> = {
    available: '🟢',
    moderate: '🟡',
    busy: '🟠',
    overloaded: '🔴',
  }

  await reply(
    ctx,
    `${statusEmoji[workload.status]} Your workload: ${workload.status}\n\n` +
      `Active tasks: ${workload.active_tasks}\n` +
      `Hours remaining: ${workload.estimated_hours_remaining}h / ${workload.max_daily_hours}h (${workload.utilization_pct}%)\n` +
      `Available capacity: ${workload.available_hours}h`
  )
})

// ---------------------------------------------------------------------------
// /sops — list all SOPs grouped by category
// ---------------------------------------------------------------------------

const CATEGORY_EMOJI: Record<string, string> = {
  general: '📌',
  twitter: '🐦',
  reddit: '📺',
  instagram: '📸',
  tiktok: '🎵',
  youtube: '▶️',
  onboarding: '🚀',
  va_guide: '📖',
}

bot.command('sops', async (ctx) => {
  const sops = await listSOPs()
  if (sops.length === 0) {
    await reply(ctx, 'No SOPs yet. Create one in the TeamFlow app.')
    return
  }

  const byCategory = new Map<string, TfSop[]>()
  for (const sop of sops) {
    const list = byCategory.get(sop.category) ?? []
    list.push(sop)
    byCategory.set(sop.category, list)
  }

  const sections = Array.from(byCategory.entries()).map(([category, categorySops]) => {
    const emoji = CATEGORY_EMOJI[category] ?? '📌'
    const lines = categorySops.map((s) => `  • ${s.title} (v${s.version})`)
    return `${emoji} ${category.replace('_', ' ')} (${categorySops.length}):\n${lines.join('\n')}`
  })

  await reply(ctx, `📋 Standard Operating Procedures:\n\n${sections.join('\n\n')}\n\nSend /sop <name> to view a specific SOP.`)
})

// ---------------------------------------------------------------------------
// /sop <name>
// ---------------------------------------------------------------------------

bot.command('sop', async (ctx) => {
  const query = commandArgs(ctx.message.text)
  if (!query) {
    await reply(ctx, 'Usage: /sop <name>')
    return
  }

  const { data } = await supabase
    .from('tf_sops')
    .select('*')
    .eq('status', 'active')
    .ilike('title', `%${query}%`)

  const matches = (data as TfSop[]) ?? []
  if (matches.length === 0) {
    await reply(ctx, `No SOP found matching "${query}".`)
    return
  }
  if (matches.length > 1) {
    await reply(ctx, `Multiple SOPs match "${query}":\n${matches.map((s) => `  • ${s.title}`).join('\n')}\n\nBe more specific.`)
    return
  }

  const sop = matches[0]
  const lines = [
    `📋 ${sop.title} (v${sop.version})`,
    '',
    `Category: ${sop.category}`,
    sop.platform ? `Platform: ${sop.platform}` : '',
    sop.tags.length ? `Tags: ${sop.tags.map((t) => `#${t}`).join(', ')}` : '',
    '',
    '---',
    sop.content,
    '---',
  ].filter(Boolean)

  await reply(ctx, lines.join('\n'))
})

// ---------------------------------------------------------------------------
// /syncsops — sync all active SOPs to the Telegram SOPs topic (admin only)
// ---------------------------------------------------------------------------

bot.command('syncsops', async (ctx) => {
  if (!(await requireAdmin(ctx))) return

  const sops = await listSOPs()
  if (sops.length === 0) {
    await reply(ctx, 'No SOPs to sync.')
    return
  }

  let synced = 0
  for (const sop of sops) {
    try {
      await syncSOPToTelegram(sop.id)
      synced += 1
    } catch (err) {
      console.error(`Failed to sync SOP ${sop.id}:`, err)
    }
  }

  await reply(ctx, `✅ Synced ${synced}/${sops.length} SOPs to the #sops topic.`)
})

// ---------------------------------------------------------------------------
// Documents & photos: extract content and hand off to the file-aware AI
// ---------------------------------------------------------------------------

bot.on(['document', 'photo'], async (ctx) => {
  const message = ctx.message
  const file = 'document' in message ? message.document : 'photo' in message ? message.photo[message.photo.length - 1] : null
  if (!file) return

  const caption = 'caption' in message && typeof message.caption === 'string' ? message.caption : ''

  await ctx.sendChatAction('typing')

  try {
    const originalFileName = 'document' in message ? message.document.file_name : undefined
    const originalMimeType = 'document' in message ? message.document.mime_type : undefined

    const { buffer, fileName, mimeType } = await downloadTelegramFile(file.file_id)
    const finalFileName = originalFileName ?? fileName
    const finalMimeType = originalMimeType ?? mimeType

    const content = await extractFileContent(buffer, finalFileName, finalMimeType)
    const isImage = finalMimeType.startsWith('image/')

    const sender = await getMemberByTelegramId(supabase, ctx.from.id)
    const admin = isAdminTelegramId(ctx.from.id)

    const aiResponse = await generateAIResponseWithFile(
      caption || 'What should I do with this file?',
      content,
      isImage ? buffer.toString('base64') : undefined,
      isImage ? finalMimeType : undefined,
      { sender, isAdmin: admin }
    )

    await reply(ctx, aiResponse)
  } catch (err) {
    console.error('Failed to process uploaded file:', err)
    await reply(ctx, 'Sorry, I had trouble processing that file.')
  }
})

// ---------------------------------------------------------------------------
// Free text: due-date step of /addtask flow, or conversational AI
// ---------------------------------------------------------------------------

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim()

  if (text.startsWith('/')) {
    await reply(ctx, 'Unknown command. Send /help to see what I can do.')
    return
  }

  const session = addTaskSessions.get(ctx.chat.id)
  if (session && session.step === 'awaiting_due_date') {
    await finalizeAddTask(ctx, session, text)
    return
  }

  const sender = await getMemberByTelegramId(supabase, ctx.from.id)
  const admin = isAdminTelegramId(ctx.from.id)

  await ctx.sendChatAction('typing')
  const aiReply = await generateAIResponse(text, { sender, isAdmin: admin })
  await reply(ctx, aiReply)
})
