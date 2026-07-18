import { Telegraf, Markup, Context } from 'telegraf'
import { createAdminClient } from '@/lib/supabase/admin'
import { runAssistant } from '@/lib/ai'
import { executeTool } from '@/lib/ai/tools'
import { getMemberWorkload } from '@/lib/workload'
import { listSOPs, syncSOPToTelegram, syncSOPToDiscord } from '@/lib/sops'
import { getVATodoMessage } from '@/lib/va-todo'
import { canAccessTopic, getTopicNameFromThread } from '@/lib/topic-access'
import { DEFAULT_TOPICS, announceTopicAccessGranted, CHAT_HISTORY_VISIBILITY_INSTRUCTIONS } from '@/lib/telegram-topics'
import { downloadTelegramFile } from '@/lib/telegram-files'
import { extractFileContent } from '@/lib/file-reader'
import { syncMembersToReelLab, formatVaSyncResult } from '@/lib/va-sync'
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

const REPLY_CONTEXT_MAX_CHARS = 300

/**
 * When the incoming message is itself a reply (reply_to_message), prior conversation history
 * alone isn't enough context for follow-ups like "did you mark it as done?" — the assistant
 * needs to know what "it" refers to. Prepends the referenced message's text/caption (truncated)
 * so runAssistant sees it as part of the current turn.
 */
function buildReplyContextPrefix(ctx: Context): string {
  const message = ctx.message
  const replied = message && 'reply_to_message' in message ? message.reply_to_message : undefined
  if (!replied) return ''
  const content =
    'text' in replied && typeof replied.text === 'string'
      ? replied.text
      : 'caption' in replied && typeof replied.caption === 'string'
        ? replied.caption
        : undefined
  const trimmed = content?.trim()
  if (!trimmed) return ''
  const truncated = trimmed.length > REPLY_CONTEXT_MAX_CHARS ? `${trimmed.slice(0, REPLY_CONTEXT_MAX_CHARS)}…` : trimmed
  return `[Replying to your earlier message: "${truncated}"]\n`
}

// ---------------------------------------------------------------------------
// telegram_id + username capture — runs FIRST, before any gating or command
// handler, for every incoming update (private chat, group, callback query —
// anything carrying ctx.from). If the sender's telegram_id isn't on a
// tf_members row yet, ensureMemberExists tries to match an existing row by
// telegram_username (case-insensitive, no leading @) and links the id there;
// otherwise it auto-creates a new member. The configured admin id is skipped
// since the admin isn't necessarily meant to be a tf_members row.
// ---------------------------------------------------------------------------
bot.use(async (ctx, next) => {
  if (ctx.from && !ctx.from.is_bot && !isAdminTelegramId(ctx.from.id)) {
    try {
      await ensureMemberExists(supabase, {
        telegram_id: ctx.from.id,
        telegram_username: ctx.from.username,
        name: ctx.from.first_name + (ctx.from.last_name ? ' ' + ctx.from.last_name : ''),
      })
    } catch (err) {
      console.error('Failed to auto-register/link Telegram member:', err)
    }
  }
  return next()
})

bot.use(async (ctx, next) => {
  // Private chat: always respond, no gating needed.
  if (ctx.chat?.type === 'private') return next()

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

// ---------------------------------------------------------------------------
// Team assignment flow — "assign @member to <team>" in one shot, or a
// conversational follow-up. State lives in-process like addTaskSessions, and
// the text handler checks it BEFORE falling through to AI chat.
// ---------------------------------------------------------------------------

interface AssignSession {
  step: 'awaiting_member' | 'awaiting_team'
  teamName?: string
  memberQuery?: string
}

const assignSessions = new Map<number, AssignSession>()

const TEAM_PLATFORM_KEYWORDS: Record<string, string> = {
  instagram: 'instagram',
  twitter: 'twitter',
  tiktok: 'tiktok',
  reddit: 'reddit',
  youtube: 'youtube',
}

/**
 * Resolves free-text input (or a Telegram mention) to a member.
 * text_mention entities carry the sender-picked user's telegram id directly —
 * when we match one to a member, we also backfill their telegram_id.
 */
async function resolveMemberInput(ctx: Context, input: string): Promise<TfMember | null> {
  const message = ctx.message
  if (message && 'entities' in message) {
    for (const e of message.entities ?? []) {
      if (e.type === 'text_mention' && e.user) {
        const byId = await getMemberByTelegramId(supabase, e.user.id)
        if (byId) return byId
        const { data } = await supabase
          .from('tf_members')
          .select('*')
          .ilike('name', `%${e.user.first_name}%`)
          .maybeSingle()
        if (data) {
          await supabase
            .from('tf_members')
            .update({ telegram_id: e.user.id, telegram_username: e.user.username ?? (data as TfMember).telegram_username })
            .eq('id', (data as TfMember).id)
          return { ...(data as TfMember), telegram_id: e.user.id }
        }
      }
    }
  }

  const handle = input.trim().replace(/^@/, '').replace(/[.,!?]+$/, '')
  if (!handle) return null

  const byUsername = await getMemberByUsername(supabase, handle)
  if (byUsername) return byUsername

  const { data: exact } = await supabase.from('tf_members').select('*').ilike('name', handle).maybeSingle()
  if (exact) return exact as TfMember

  const { data: fuzzy } = await supabase.from('tf_members').select('*').ilike('name', `%${handle}%`).limit(2)
  const matches = (fuzzy as TfMember[]) ?? []
  return matches.length === 1 ? matches[0] : null
}

async function resolveTeamInput(input: string): Promise<TfTeam | null> {
  const clean = input.trim().replace(/^the\s+/i, '').replace(/\s+(team|role)$/i, '').trim()
  if (!clean) return null

  const { data: exact } = await supabase.from('tf_teams').select('*').ilike('name', clean).maybeSingle()
  if (exact) return exact as TfTeam

  const { data: fuzzy } = await supabase.from('tf_teams').select('*').ilike('name', `%${clean}%`).limit(2)
  const matches = (fuzzy as TfTeam[]) ?? []
  return matches.length === 1 ? matches[0] : null
}

/** Adds the member to the team, auto-grants the platform topic (mirrors the AI tool), and replies. */
async function assignMemberToTeam(ctx: Context, member: TfMember, team: TfTeam): Promise<void> {
  const { error } = await supabase.from('tf_member_teams').insert({ member_id: member.id, team_id: team.id })
  if (error && error.code !== '23505') {
    await reply(ctx, `Failed to assign: ${error.message}`)
    return
  }
  const alreadyOnTeam = error?.code === '23505'

  let topicNote = ''
  const teamLower = team.name.toLowerCase()
  for (const [keyword, topicName] of Object.entries(TEAM_PLATFORM_KEYWORDS)) {
    if (teamLower.includes(keyword)) {
      await supabase
        .from('tf_topic_team_access')
        .upsert({ topic_name: topicName, team_id: team.id }, { onConflict: 'topic_name,team_id' })
      topicNote = ` The team has access to the ${topicName} topic.`
      break
    }
  }

  assignSessions.delete(ctx.chat!.id)
  await reply(
    ctx,
    alreadyOnTeam
      ? `${member.name} is already on the "${team.name}" team.${topicNote}`
      : `✅ Assigned ${member.name} to the "${team.name}" team.${topicNote}`
  )
}

/**
 * One-shot assignment intent detection: "assign @matuseno to Instagram VA",
 * "assign @matuseno the Instagram VA role", "add Adam to the Twitter VA team".
 * Returns true when the message was handled (so it must NOT fall through to AI).
 */
async function tryHandleAssignIntent(ctx: Context, text: string): Promise<boolean> {
  if (!/\b(assign|add|put|move|give)\b/i.test(text)) return false
  const mentionsTeamWord = /\b(team|role)\b/i.test(text)

  const { data } = await supabase.from('tf_teams').select('*')
  // Longest name first so "Instagram VA" wins over a hypothetical "VA" team.
  const teams = ((data as TfTeam[]) ?? []).sort((a, b) => b.name.length - a.name.length)
  const lower = text.toLowerCase()
  const team = teams.find((t) => lower.includes(t.name.toLowerCase())) ?? null

  if (!team && !mentionsTeamWord) return false

  // Member: prefer an @mention (ignoring the bot's own), else the words
  // between the verb and the team name.
  let memberQuery: string | null = null
  const mentionRegex = /@([A-Za-z0-9_.]{2,32})/g
  let mentionMatch: RegExpExecArray | null
  while ((mentionMatch = mentionRegex.exec(text)) !== null) {
    if (mentionMatch[1].toLowerCase() !== BOT_USERNAME.toLowerCase()) {
      memberQuery = mentionMatch[1]
      break
    }
  }
  if (!memberQuery && team) {
    const afterVerb = text.match(/\b(?:assign|add|put|move|give)\s+(.*)/i)?.[1] ?? ''
    const teamIdx = afterVerb.toLowerCase().indexOf(team.name.toLowerCase())
    const candidate = (teamIdx >= 0 ? afterVerb.slice(0, teamIdx) : afterVerb)
      .replace(/\b(to|as|into|onto|on|the)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.,!?]+$/, '')
    if (candidate) memberQuery = candidate
  }

  if (team && memberQuery) {
    const member = await resolveMemberInput(ctx, memberQuery)
    if (!member) {
      assignSessions.set(ctx.chat!.id, { step: 'awaiting_member', teamName: team.name })
      await reply(
        ctx,
        `I couldn't find a member matching "${memberQuery}". Who should join the "${team.name}" team? Send their name or @username (or /cancel).`
      )
      return true
    }
    await assignMemberToTeam(ctx, member, team)
    return true
  }

  if (team) {
    assignSessions.set(ctx.chat!.id, { step: 'awaiting_member', teamName: team.name })
    await reply(ctx, `Who should be assigned to the "${team.name}" team? Send their name or @username (or /cancel).`)
    return true
  }

  if (memberQuery) {
    if (teams.length === 0) {
      await reply(ctx, 'No teams exist yet. Create one with /addteam <name>.')
      return true
    }
    assignSessions.set(ctx.chat!.id, { step: 'awaiting_team', memberQuery })
    const buttons = teams.map((t) => [Markup.button.callback(t.name, `assignteam:${t.id}`)])
    await reply(ctx, `Which team should ${memberQuery} join?`, Markup.inlineKeyboard(buttons))
    return true
  }

  return false
}

/** Handles the follow-up message of an active assignment session. Returns true when consumed. */
async function handleAssignSessionReply(ctx: Context, text: string): Promise<boolean> {
  const chatId = ctx.chat?.id
  if (!chatId) return false
  const session = assignSessions.get(chatId)
  if (!session) return false
  // Assignment is admin-only — don't let another group member hijack the flow.
  if (!isAdminTelegramId(ctx.from?.id)) return false

  if (session.step === 'awaiting_member') {
    const member = await resolveMemberInput(ctx, text)
    if (!member) {
      await reply(ctx, `I couldn't find a member matching "${text}". Try their exact name or @username, or /cancel.`)
      return true
    }
    const team = await resolveTeamInput(session.teamName!)
    if (!team) {
      assignSessions.delete(chatId)
      await reply(ctx, `The "${session.teamName}" team no longer exists. Start again.`)
      return true
    }
    await assignMemberToTeam(ctx, member, team)
    return true
  }

  // awaiting_team
  const team = await resolveTeamInput(text)
  if (!team) {
    await reply(ctx, `I couldn't find a team matching "${text}". Send /teams to see the list, or /cancel.`)
    return true
  }
  const member = await resolveMemberInput(ctx, session.memberQuery!)
  if (!member) {
    assignSessions.delete(chatId)
    await reply(ctx, `I couldn't find a member matching "${session.memberQuery}". Start again with "assign @username to ${team.name}".`)
    return true
  }
  await assignMemberToTeam(ctx, member, team)
  return true
}

function commandArgs(text: string | undefined): string {
  if (!text) return ''
  const spaceIdx = text.indexOf(' ')
  return spaceIdx === -1 ? '' : text.slice(spaceIdx + 1).trim()
}

// ---------------------------------------------------------------------------
// AI core wiring — chatKey construction + a thin wrapper so structured
// commands can call ai/tools.ts executors directly (fast path, no LLM round
// trip) while free text goes through runAssistant (see bottom of file).
// ---------------------------------------------------------------------------

/** Stable per-conversation key per SPEC: tg:<chat_id>:<thread_id|'dm'>:<user_id>. */
function chatKeyFor(ctx: Context): string {
  const chatId = ctx.chat?.id ?? 0
  const threadId = ctx.message && 'message_thread_id' in ctx.message ? ctx.message.message_thread_id : undefined
  const userId = ctx.from?.id ?? 0
  return `tg:${chatId}:${threadId ?? 'dm'}:${userId}`
}

/** Runs an ai/tools.ts executor for the sender behind this ctx, with the same admin gate the AI itself uses. */
async function callTool(ctx: Context, toolName: string, args: Record<string, unknown>): Promise<string> {
  const sender = ctx.from ? await getMemberByTelegramId(supabase, ctx.from.id) : null
  const isAdmin = isAdminTelegramId(ctx.from?.id)
  return executeTool(toolName, args, { isAdmin, sender })
}

/** Splits "a | b | c" into trimmed, non-empty segments — used by pipe-delimited command syntax. */
function splitPipes(text: string): string[] {
  return text.split('|').map((s) => s.trim()).filter((s) => s.length > 0)
}

/** Parses "key=value, key2=value2" (comma or semicolon separated) into a lowercase-keyed record. */
function parseKeyValuePairs(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const chunk of text.split(/[,;]/)) {
    const eq = chunk.indexOf('=')
    if (eq === -1) continue
    const key = chunk.slice(0, eq).trim().toLowerCase()
    const value = chunk.slice(eq + 1).trim()
    if (key && value) out[key] = value
  }
  return out
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

const SELF_SERVICE_HELP = `📋 <b>Your tasks</b>
/mytasks or /mine — your tasks, grouped by status
/done &lt;id&gt; — mark a task complete
/start &lt;id&gt; — start a task (→ In Progress)
/pause &lt;id&gt; — pause a task (→ To Do)
/mydone — tasks you completed this week
/myworkload — your workload
/taskinfo &lt;task_query&gt; — full task details
/search &lt;query&gt; — search tasks

👥 <b>Team</b>
/myteam — your team &amp; teammates
/who &lt;skill&gt; — find available members with a skill
/teams — list all teams
/sops — list SOPs
/sop &lt;name&gt; — view an SOP

🎬 <b>Reel Lab</b>
/vatodo [@handle] — VA daily checklist
/logreel &lt;url&gt; [@handle] [note] — log a posted reel
/myvault — your vault items (passwords masked)

/cancel — cancel an in-progress flow
/help — show this message

You can also just talk to me in plain English — "what are my tasks", "mark the landing page task done", or send an Instagram reel link to log it.`

const ADMIN_HELP = `🛠 <b>Admin — Tasks</b>
/addtask &lt;title&gt; — create &amp; assign a task (guided)
/task &lt;id&gt; — task details by id
/taskinfo &lt;task_query&gt; — full task details (fuzzy match)
/search &lt;query&gt; — search tasks
/complete &lt;id&gt; — mark any task done
/assign &lt;id&gt; @username — reassign a task
/update &lt;task_query&gt; | field=value, field2=value2 — edit a task
/deltask &lt;task_query&gt; — delete a task
/attach &lt;task_query&gt; | &lt;url&gt; [| title] — attach a link
/attachments &lt;task_query&gt; — list attachments
/recurring &lt;task_query&gt; &lt;daily|weekly|weekday&gt; — make recurring
/stoprecurring &lt;task_query&gt; — stop recurrence
/status — board status summary
/overdue — list overdue tasks

🛠 <b>Admin — People</b>
/members — list all members
/member &lt;name&gt; — member details
/addmember &lt;name&gt; &lt;telegram_username&gt; [team] — add a member
/addskill &lt;name&gt; — add a skill to the catalog
/skills — list skills
/removeskill &lt;member&gt; | &lt;skill&gt; — remove a skill from a member
/addteam &lt;name&gt; — create a team
/addmemberteam &lt;member&gt; &lt;team&gt; — add member to team
/removememberteam &lt;member&gt; &lt;team&gt; — remove member from team
/teams — list all teams

🛠 <b>Admin — Boards &amp; topics</b>
/boards — list boards
/addboard &lt;name&gt; [| description] — create a board
/granttopic &lt;topic&gt; &lt;team&gt; — grant topic access to team
/revoketopic &lt;topic&gt; &lt;team&gt; — revoke topic access
/topicaccess — show topic access control

🛠 <b>Admin — SOPs</b>
/newsop &lt;title&gt; | &lt;content&gt; [| category] [| platform] — create/update an SOP
/syncsops — sync all SOPs to the Telegram SOPs topic
/syncva — sync members to Reel Lab's VA system
/syncids — list members missing a Telegram ID

🛠 <b>Admin — Insight</b>
/stats — team totals (tasks, overdue, completed)
/free [skill] — who's available right now
/workload — team-wide workload
/logreel &lt;url&gt; [@handle] [note] — log a posted reel

/cancel — cancel the current /addtask flow
/help — show this message`

function helpText(isAdmin: boolean): string {
  const body = isAdmin ? `${ADMIN_HELP}\n\n${SELF_SERVICE_HELP}` : SELF_SERVICE_HELP
  return `<b>TeamFlow Bot commands</b>\n\n${body}\n\n<b>To use me in a group:</b>\n1. Add me to the group\n2. In @BotFather, run /setprivacy, select me, choose "Disable"\n3. Make me an admin in the group\n4. @mention me to talk to me: "@${BOT_USERNAME} who has free time?"`
}

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
    `👋 Welcome to <b>TeamFlow Bot</b>!\n\nI help manage tasks and team workload for this group.\n\n${helpText(true)}\n\n${CHAT_HISTORY_VISIBILITY_INSTRUCTIONS}`,
    { parse_mode: 'HTML' }
  )
})

bot.command('help', async (ctx) => {
  await reply(ctx, helpText(isAdminTelegramId(ctx.from?.id)), { parse_mode: 'HTML' })
})

bot.command('cancel', async (ctx) => {
  addTaskSessions.delete(ctx.chat.id)
  assignSessions.delete(ctx.chat.id)
  await reply(ctx, 'Cancelled.')
})

// Inline keyboard from the "which team?" step of the assignment flow.
bot.action(/^assignteam:(.+)$/, async (ctx) => {
  const session = assignSessions.get(ctx.chat!.id)
  if (!session || session.step !== 'awaiting_team') {
    await ctx.answerCbQuery('This flow has expired.')
    return
  }

  const { data: team } = await supabase.from('tf_teams').select('*').eq('id', ctx.match[1]).maybeSingle()
  if (!team) {
    await ctx.answerCbQuery('Team not found.')
    return
  }
  await ctx.answerCbQuery()

  const member = await resolveMemberInput(ctx, session.memberQuery!)
  if (!member) {
    const missing = session.memberQuery
    session.step = 'awaiting_member'
    session.teamName = (team as TfTeam).name
    session.memberQuery = undefined
    await ctx.editMessageText(
      `I couldn't find a member matching "${missing}". Send their name or @username (or /cancel).`
    )
    return
  }

  await ctx.editMessageText(`Assigning ${member.name} to "${(team as TfTeam).name}"…`)
  await assignMemberToTeam(ctx, member, team as TfTeam)
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
    const unestimated = memberTasks.filter((t) => t.estimated_hours == null).length
    const capacity = member.max_daily_hours - bookedHours
    return {
      member,
      proficiency: r.proficiency_level,
      bookedHours,
      taskCount: memberTasks.length,
      unestimated,
      capacity,
      available: bookedHours < member.max_daily_hours,
    }
  })

  results.sort((a, b) => b.capacity - a.capacity)

  const lines = results.map((r, i) => {
    const status = r.available ? 'AVAILABLE' : 'BUSY'
    const estimateNote = r.unestimated > 0 ? `, ${r.unestimated} without a time estimate` : ''
    return `${i + 1}. ${r.member.name} — ${r.bookedHours}/${r.member.max_daily_hours}h booked today (${status}), ${r.taskCount} active task(s)${estimateNote}\n   Proficiency: ${r.proficiency}/5`
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

  await announceTopicAccessGranted(topicName, (team as TfTeam).name)
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

  let workload
  try {
    workload = await getMemberWorkload(member.id)
  } catch (err) {
    console.error(`Failed to load workload for ${member.name}:`, err)
    await reply(ctx, `Couldn't load your workload: ${err instanceof Error ? err.message : String(err)}`)
    return
  }
  const statusEmoji: Record<string, string> = {
    available: '🟢',
    moderate: '🟡',
    busy: '🟠',
    overloaded: '🔴',
  }

  await reply(
    ctx,
    `${statusEmoji[workload.status]} Your workload: ${workload.status}\n\n` +
      `Active tasks: ${workload.active_tasks}${
        workload.tasks_without_estimate > 0 ? ` (${workload.tasks_without_estimate} without a time estimate)` : ''
      }\n` +
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
    try {
      await syncSOPToDiscord(sop.id)
    } catch (err) {
      console.error(`Failed to sync SOP ${sop.id} to Discord:`, err)
    }
  }

  await reply(ctx, `✅ Synced ${synced}/${sops.length} SOPs to the #sops topic.`)
})

// ---------------------------------------------------------------------------
// /syncva — sync TeamFlow members into Reel Lab's va_profiles + telegram_users
// ---------------------------------------------------------------------------

bot.command('syncva', async (ctx) => {
  if (!(await requireAdmin(ctx))) return

  await reply(ctx, '🔄 Syncing TeamFlow members to Reel Lab…')
  try {
    const result = await syncMembersToReelLab(supabase)
    await reply(ctx, formatVaSyncResult(result))
  } catch (err) {
    await reply(ctx, `❌ Sync failed: ${err instanceof Error ? err.message : String(err)}`)
  }
})

// ---------------------------------------------------------------------------
// /syncids — list members missing a telegram_id and ask them to identify
// ---------------------------------------------------------------------------

bot.command('syncids', async (ctx) => {
  if (!(await requireAdmin(ctx))) return

  const { data } = await supabase
    .from('tf_members')
    .select('*')
    .eq('status', 'active')
    .is('telegram_id', null)

  const missing = (data as TfMember[]) ?? []
  if (missing.length === 0) {
    await reply(ctx, '✅ All active members already have a Telegram ID linked.')
    return
  }

  const list = missing
    .map((m) => `  • ${m.name}${m.telegram_username ? ` (@${m.telegram_username})` : ''}`)
    .join('\n')

  await reply(
    ctx,
    `🪪 ${missing.length} member${missing.length === 1 ? '' : 's'} missing a Telegram ID:\n${list}\n\n` +
      `📣 If you're on this list: send /start to @${BOT_USERNAME} in a private chat (or just reply to me here). ` +
      `Your ID is linked automatically from your first message, matched by your @username. ` +
      `Then the admin can run /syncva to push everyone to Reel Lab.`
  )
})

// ---------------------------------------------------------------------------
// VA Daily To-Do — pulls from Reel Lab's shared Supabase tables
// ---------------------------------------------------------------------------

bot.command('vatodo', async (ctx) => {
  const text = ctx.message?.text || ''
  const parts = text.split(/\s+/)
  const accountHandle = parts[1]?.replace(/^@/, '')

  const msg = await getVATodoMessage(accountHandle)
  await reply(ctx, msg, { parse_mode: 'HTML' })
})

// ---------------------------------------------------------------------------
// Parity commands (TASK_27 / Worker C scope) — thin wrappers over the shared
// ai/tools.ts executors. These bypass the Gemini round trip for structured
// input; the admin/self-service gate is enforced by executeTool itself, so
// most of these are effectively admin-only (see MEMBER_SELF_SERVICE_TOOLS in
// ai/tools.ts), except /logreel and /myvault which any registered member can use.
// ---------------------------------------------------------------------------

bot.command('attach', async (ctx) => {
  const parts = splitPipes(commandArgs(ctx.message.text))
  if (parts.length < 2) {
    await reply(ctx, 'Usage: /attach <task_query> | <url> [| title]')
    return
  }
  const [taskQuery, url, title] = parts
  await reply(ctx, await callTool(ctx, 'add_task_attachment', { task_query: taskQuery, url, title }))
})

bot.command('attachments', async (ctx) => {
  const q = commandArgs(ctx.message.text)
  if (!q) {
    await reply(ctx, 'Usage: /attachments <task_query>')
    return
  }
  await reply(ctx, await callTool(ctx, 'list_task_attachments', { task_query: q }))
})

bot.command('recurring', async (ctx) => {
  const tokens = commandArgs(ctx.message.text).split(/\s+/).filter(Boolean)
  if (tokens.length < 2) {
    await reply(ctx, 'Usage: /recurring <task_query> <daily|weekly|weekday>')
    return
  }
  const pattern = tokens[tokens.length - 1]
  const taskQuery = tokens.slice(0, -1).join(' ')
  await reply(ctx, await callTool(ctx, 'make_task_recurring', { task_query: taskQuery, pattern }))
})

bot.command('stoprecurring', async (ctx) => {
  const q = commandArgs(ctx.message.text)
  if (!q) {
    await reply(ctx, 'Usage: /stoprecurring <task_query>')
    return
  }
  await reply(ctx, await callTool(ctx, 'stop_task_recurring', { task_query: q }))
})

bot.command('update', async (ctx) => {
  const argsText = commandArgs(ctx.message.text)
  const parts = argsText.split('|')
  if (parts.length < 2 || !parts[0].trim()) {
    await reply(
      ctx,
      'Usage: /update <task_query> | field=value, field2=value2\nFields: title, description, priority, platform, status, due_date, estimated_hours, assignee_name'
    )
    return
  }
  const taskQuery = parts[0].trim()
  const kv = parseKeyValuePairs(parts.slice(1).join('|'))
  const toolArgs: Record<string, unknown> = { task_query: taskQuery }
  if (kv.title) toolArgs.title = kv.title
  if (kv.description) toolArgs.description = kv.description
  if (kv.priority) toolArgs.priority = kv.priority
  if (kv.platform) toolArgs.platform = kv.platform
  if (kv.status) toolArgs.status = kv.status
  const due = kv.due_date ?? kv.due
  if (due) toolArgs.due_date = due
  const hours = kv.estimated_hours ?? kv.hours
  if (hours) toolArgs.estimated_hours = Number(hours)
  const assignee = kv.assignee_name ?? kv.assignee
  if (assignee) toolArgs.assignee_name = assignee

  if (Object.keys(toolArgs).length === 1) {
    await reply(ctx, 'No recognized fields found. Use field=value, e.g. /update landing page | priority=high, due_date=friday')
    return
  }

  await reply(ctx, await callTool(ctx, 'update_task', toolArgs))
})

bot.command('deltask', async (ctx) => {
  const q = commandArgs(ctx.message.text)
  if (!q) {
    await reply(ctx, 'Usage: /deltask <task_query>')
    return
  }
  await reply(ctx, await callTool(ctx, 'delete_task', { task_query: q }))
})

bot.command('search', async (ctx) => {
  const q = commandArgs(ctx.message.text)
  if (!q) {
    await reply(ctx, 'Usage: /search <query>')
    return
  }
  await reply(ctx, await callTool(ctx, 'search_tasks', { query: q }))
})

bot.command('taskinfo', async (ctx) => {
  const q = commandArgs(ctx.message.text)
  if (!q) {
    await reply(ctx, 'Usage: /taskinfo <task_query>')
    return
  }
  await reply(ctx, await callTool(ctx, 'task_details', { task_query: q }))
})

bot.command('stats', async (ctx) => {
  await reply(ctx, await callTool(ctx, 'team_stats', {}))
})

bot.command('free', async (ctx) => {
  const skill = commandArgs(ctx.message.text)
  await reply(ctx, await callTool(ctx, 'who_is_free', skill ? { skill_name: skill } : {}))
})

bot.command('workload', async (ctx) => {
  await reply(ctx, await callTool(ctx, 'team_workload', {}))
})

bot.command('members', async (ctx) => {
  await reply(ctx, await callTool(ctx, 'list_members', {}))
})

bot.command('member', async (ctx) => {
  const q = commandArgs(ctx.message.text)
  if (!q) {
    await reply(ctx, 'Usage: /member <name>')
    return
  }
  await reply(ctx, await callTool(ctx, 'member_details', { member_name: q }))
})

bot.command('boards', async (ctx) => {
  await reply(ctx, await callTool(ctx, 'list_boards', {}))
})

bot.command('addboard', async (ctx) => {
  const parts = splitPipes(commandArgs(ctx.message.text))
  if (parts.length === 0) {
    await reply(ctx, 'Usage: /addboard <name> [| description]')
    return
  }
  await reply(ctx, await callTool(ctx, 'create_board', { name: parts[0], description: parts[1] }))
})

bot.command('removeskill', async (ctx) => {
  const parts = splitPipes(commandArgs(ctx.message.text))
  if (parts.length < 2) {
    await reply(ctx, 'Usage: /removeskill <member> | <skill>')
    return
  }
  await reply(ctx, await callTool(ctx, 'remove_skill', { member_name: parts[0], skill_name: parts[1] }))
})

bot.command('skills', async (ctx) => {
  await reply(ctx, await callTool(ctx, 'list_skills', {}))
})

bot.command('removememberteam', async (ctx) => {
  const tokens = parseQuotedArgs(commandArgs(ctx.message.text))
  if (tokens.length < 2) {
    await reply(ctx, 'Usage: /removememberteam <member_name> <team_name>')
    return
  }
  const memberName = tokens[0]
  const teamName = tokens.slice(1).join(' ')
  await reply(ctx, await callTool(ctx, 'remove_member_from_team', { member_name: memberName, team_name: teamName }))
})

bot.command('newsop', async (ctx) => {
  const parts = splitPipes(commandArgs(ctx.message.text))
  if (parts.length < 2) {
    await reply(ctx, 'Usage: /newsop <title> | <content> [| category] [| platform] [| summary]')
    return
  }
  const [title, content, category, platform, summary] = parts
  await reply(ctx, await callTool(ctx, 'create_sop', { title, content, category, platform, summary }))
})

bot.command('logreel', async (ctx) => {
  const tokens = commandArgs(ctx.message.text).split(/\s+/).filter(Boolean)
  if (tokens.length === 0) {
    await reply(ctx, 'Usage: /logreel <instagram_url> [@handle] [note...]')
    return
  }
  const url = tokens[0]
  let idx = 1
  let handle: string | undefined
  if (tokens[1]?.startsWith('@')) {
    handle = tokens[1].slice(1)
    idx = 2
  }
  const note = tokens.slice(idx).join(' ') || undefined
  await reply(ctx, await callTool(ctx, 'log_reel_post', { reel_url: url, account_handle: handle, note }))
})

bot.command('myvault', async (ctx) => {
  await reply(ctx, await callTool(ctx, 'my_vault_items', {}))
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

    const aiResponse = await runAssistant({
      text: caption || 'What should I do with this file?',
      channel: 'telegram',
      chatKey: chatKeyFor(ctx),
      sender,
      isAdmin: admin,
      fileContent: content,
      imageBase64: isImage ? buffer.toString('base64') : undefined,
      imageMimeType: isImage ? finalMimeType : undefined,
    })

    await reply(ctx, aiResponse)
  } catch (err) {
    console.error('Failed to process uploaded file:', err)
    await reply(ctx, 'Sorry, I had trouble processing that file.')
  }
})

// ---------------------------------------------------------------------------
// Reel-link auto-detect (TASK_27) — a private-chat message from a registered
// member that contains an instagram.com/reel or /p/ URL. If the message is
// essentially just the link, log it directly via the log_reel_post executor;
// otherwise let it fall through to the AI (which also has log_reel_post and
// will pick the link up from the message text).
// ---------------------------------------------------------------------------

const IG_REEL_URL_RE = /https?:\/\/(?:www\.)?instagram\.com\/(?:reel|p)\/[A-Za-z0-9_\-]+\/?[^\s]*/i

async function tryHandleReelLinkAutoLog(
  ctx: Context,
  text: string,
  sender: TfMember | null,
  isAdmin: boolean
): Promise<boolean> {
  if (ctx.chat?.type !== 'private' || !sender) return false

  const match = text.match(IG_REEL_URL_RE)
  if (!match) return false

  const url = match[0]
  const remainder = text.replace(url, '').replace(/[\s.,!?~\-–—:;'"()]+/g, '')
  if (remainder.length > 0) return false // not "essentially just the link" — let the AI handle it in context

  await ctx.sendChatAction('typing')
  const result = await executeTool('log_reel_post', { reel_url: url }, { isAdmin, sender })
  await reply(ctx, result)
  return true
}

// ---------------------------------------------------------------------------
// Free text: due-date step of /addtask flow, reel-link auto-log, or
// conversational AI (private-chat text and group @mention replies alike —
// the group-gating middleware above already filtered out anything not
// addressed to the bot before this handler runs).
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

  // Active assignment flow — must run BEFORE AI chat so the follow-up answer
  // ("@matuseno") completes the assignment instead of hitting the AI.
  if (await handleAssignSessionReply(ctx, text)) return

  // One-shot assignment: "assign @matuseno to Instagram VA" (admin only —
  // non-admins fall through to the AI, which explains the restriction).
  if (isAdminTelegramId(ctx.from.id) && (await tryHandleAssignIntent(ctx, text))) return

  const sender = await getMemberByTelegramId(supabase, ctx.from.id)
  const admin = isAdminTelegramId(ctx.from.id)

  if (await tryHandleReelLinkAutoLog(ctx, text, sender, admin)) return

  await ctx.sendChatAction('typing')
  const replyPrefix = buildReplyContextPrefix(ctx)
  const aiReply = await runAssistant({
    text: `${replyPrefix}${text}`,
    channel: 'telegram',
    chatKey: chatKeyFor(ctx),
    sender,
    isAdmin: admin,
  })
  await reply(ctx, aiReply)
})
