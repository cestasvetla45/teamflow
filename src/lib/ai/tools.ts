// AI tool registry — ~44+ tools per SPEC (implemented in full: 54 declared
// below), each a Gemini function declaration paired with an executor that
// hits Supabase via the admin client. Admin gate mirrors the pre-existing
// bot-ai.ts pattern: MEMBER_SELF_SERVICE_TOOLS lists the tools any registered
// member may call; everything else requires ctx.isAdmin.

import { createAdminClient } from '@/lib/supabase/admin'
import type {
  TfMember,
  TfTask,
  TfTeam,
  TfBoard,
  TfSkill,
  TfSop,
  TfTaskAttachment,
  TfVaVaultItem,
  Platform,
  SopCategory,
  TaskPriority,
} from '@/types/teamflow'
import { findTaskByPrefix, isOverdue, logActivity, getDefaultBoard, formatDueDate } from '@/lib/teamflow-db'
import { getPositionForStatus } from '@/lib/db-utils'
import {
  createSOP,
  updateSOP,
  archiveSOP,
  listSOPs,
  generateSOPDiff,
  syncSOPToTelegram,
  syncSOPToDiscord,
} from '@/lib/sops'
import { sendToTopic, announceTopicAccessGranted } from '@/lib/telegram-topics'
import { notifyDiscordChannel } from '@/lib/discord-notify'
import { findBestAssignee } from '@/lib/delegation'
import { getVATodoMessage } from '@/lib/va-todo'
import { syncMembersToReelLab, formatVaSyncResult } from '@/lib/va-sync'
import { getMemberWorkload, getTeamWorkload } from '@/lib/workload'
import { getTaskActivity } from '@/lib/activity'
import { notifyMemberAssigned } from './notify-helpers'
import { parseNaturalDate } from './dates'
import { buildTeamContext } from './context'
import type { FunctionDeclaration } from './gemini'

const supabase = createAdminClient()

export interface ToolContext {
  isAdmin: boolean
  sender: TfMember | null
}

// ─── Arg coercion helpers (Gemini args arrive as loosely-typed JSON) ──────────
function strArg(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key]
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
}
function numArg(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key]
  if (typeof v === 'number' && !isNaN(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Number(v)
  return undefined
}
function boolArg(args: Record<string, unknown>, key: string): boolean | undefined {
  const v = args[key]
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') return v.toLowerCase() === 'true'
  return undefined
}

const SOP_CATEGORIES = ['general', 'twitter', 'reddit', 'instagram', 'tiktok', 'youtube', 'onboarding', 'va_guide']
const PLATFORMS = ['twitter', 'reddit', 'instagram', 'tiktok', 'youtube']
const PRIORITIES = ['low', 'medium', 'high', 'urgent']
const RECURRENCE_PATTERNS = ['daily', 'weekly', 'weekday']

// ─── Reference resolvers ───────────────────────────────────────────────────────

/** Matches a member by name, telegram_username, or discord_username — case-insensitive, @-tolerant. */
export async function resolveMemberRef(query: string | null | undefined): Promise<TfMember | null> {
  if (!query) return null
  const clean = query.trim().replace(/^@/, '')
  if (!clean) return null

  const { data: exact } = await supabase
    .from('tf_members')
    .select('*')
    .or(`name.ilike.${clean},telegram_username.ilike.${clean},discord_username.ilike.${clean}`)
    .limit(1)
    .maybeSingle()
  if (exact) return exact as TfMember

  const { data: fuzzy } = await supabase.from('tf_members').select('*').ilike('name', `%${clean}%`).limit(1).maybeSingle()
  return (fuzzy as TfMember) ?? null
}

async function resolveTeamRef(query: string | null | undefined): Promise<TfTeam | null> {
  if (!query) return null
  const { data } = await supabase.from('tf_teams').select('*').ilike('name', `%${query}%`).limit(1).maybeSingle()
  return (data as TfTeam) ?? null
}

async function resolveSkillRef(query: string | null | undefined): Promise<TfSkill | null> {
  if (!query) return null
  const { data } = await supabase.from('tf_skills').select('*').ilike('name', `%${query}%`).limit(1).maybeSingle()
  return (data as TfSkill) ?? null
}

async function resolveBoardRef(query: string | null | undefined): Promise<TfBoard | null> {
  if (query) {
    const { data } = await supabase.from('tf_boards').select('*').ilike('name', `%${query}%`).limit(1).maybeSingle()
    if (data) return data as TfBoard
  }
  return getDefaultBoard(supabase)
}

async function resolveSopRef(query: string | null | undefined): Promise<TfSop | null> {
  if (!query) return null
  const { data } = await supabase
    .from('tf_sops')
    .select('*')
    .eq('status', 'active')
    .ilike('title', `%${query}%`)
    .limit(1)
    .maybeSingle()
  return (data as TfSop) ?? null
}

async function findTaskByQuery(query: string): Promise<TfTask | null> {
  const byPrefix = await findTaskByPrefix(supabase, query)
  if (byPrefix.task) return byPrefix.task
  const { data } = await supabase.from('tf_tasks').select('*').ilike('title', `%${query}%`).limit(1).maybeSingle()
  return (data as TfTask) ?? null
}

const PLATFORM_TOPIC_KEYWORDS: Record<string, string> = {
  instagram: 'instagram', ig: 'instagram',
  twitter: 'twitter', x: 'twitter',
  tiktok: 'tiktok',
  reddit: 'reddit',
  youtube: 'youtube', yt: 'youtube',
}

/** If a team's name contains a platform keyword, grants it access to that platform topic. Returns the topic name granted, if any. */
async function autoGrantPlatformTopic(team: { id: string; name: string }): Promise<string | null> {
  const lower = team.name.toLowerCase()
  for (const [keyword, topic] of Object.entries(PLATFORM_TOPIC_KEYWORDS)) {
    if (lower.includes(keyword)) {
      await supabase.from('tf_topic_team_access').upsert({ topic_name: topic, team_id: team.id }, { onConflict: 'topic_name,team_id' })
      return topic
    }
  }
  return null
}

async function postSopChangeAnnouncement(sopTitle: string, changesBody: string, platform: string): Promise<void> {
  const message = `📢 SOP Updated: "${sopTitle}"\n\n${changesBody}\n\nFull SOP: 📋 SOPs topic`
  const targetTopic = platform && platform !== 'general' ? platform : 'general'
  await sendToTopic(targetTopic, message)
  await notifyDiscordChannel(targetTopic, message)
  if (targetTopic !== 'sops') {
    await sendToTopic('sops', message)
    await notifyDiscordChannel('sops', message)
  }
}

function maskSecret(value: string | null): string | null {
  if (!value) return value
  if (value.length <= 4) return '••••'
  return `••••${value.slice(-4)}`
}

// ─── Admin gate ─────────────────────────────────────────────────────────────
export const MEMBER_SELF_SERVICE_TOOLS = new Set([
  'list_my_tasks',
  'complete_my_task',
  'start_my_task',
  'pause_my_task',
  'my_completed_tasks',
  'my_workload',
  'summarize_file',
  'log_reel_post',
  'va_todo',
  'my_vault_items',
  'list_sops',
  'get_sop',
])

// ─── Tool definitions ───────────────────────────────────────────────────────
interface ToolParamSpec {
  type: string
  description?: string
  enum?: string[]
}

interface ToolDef {
  name: string
  description: string
  properties: Record<string, ToolParamSpec>
  required?: string[]
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>
}

const TOOL_DEFS: ToolDef[] = [
  // ── TASKS ──────────────────────────────────────────────────────────────
  {
    name: 'create_task',
    description: 'Create a new task. Notifies the assignee via Telegram + Discord DM if they have linked accounts.',
    properties: {
      title: { type: 'string', description: 'Task title' },
      description: { type: 'string', description: 'Optional task description' },
      assignee_name: { type: 'string', description: 'Member to assign (name, @telegram, or @discord username)' },
      due_date: { type: 'string', description: 'Natural date like "tomorrow", "friday 3pm", "in 2h", or an ISO date' },
      priority: { type: 'string', description: 'low, medium, high, or urgent', enum: PRIORITIES },
      platform: { type: 'string', description: 'twitter, reddit, instagram, tiktok, or youtube', enum: PLATFORMS },
      board_name: { type: 'string', description: 'Board name — defaults to the first/default board' },
      estimated_hours: { type: 'number', description: 'Estimated hours to complete' },
    },
    required: ['title'],
    execute: async (args, ctx) => {
      const title = strArg(args, 'title')
      if (!title) return 'A task title is required.'

      const board = await resolveBoardRef(strArg(args, 'board_name'))
      if (!board) return 'Could not find or create a board for this task.'

      let assignee: TfMember | null = null
      const assigneeName = strArg(args, 'assignee_name')
      if (assigneeName) {
        assignee = await resolveMemberRef(assigneeName)
        if (!assignee) return `No member found matching "${assigneeName}".`
      }

      const priorityRaw = strArg(args, 'priority')?.toLowerCase()
      const priority = (PRIORITIES.includes(priorityRaw ?? '') ? priorityRaw : 'medium') as TaskPriority

      const platformRaw = strArg(args, 'platform')?.toLowerCase()
      const platform = (PLATFORMS.includes(platformRaw ?? '') ? platformRaw : null) as Platform | null

      const dueDateRaw = strArg(args, 'due_date')
      const dueDateIso = dueDateRaw ? parseNaturalDate(dueDateRaw) : null

      const position = await getPositionForStatus(board.id, 'todo')

      const { data: created, error } = await supabase
        .from('tf_tasks')
        .insert({
          title,
          description: strArg(args, 'description') ?? null,
          board_id: board.id,
          assignee_id: assignee?.id ?? null,
          due_date: dueDateIso,
          priority,
          platform,
          estimated_hours: numArg(args, 'estimated_hours') ?? null,
          status: 'todo',
          position,
          created_by: ctx.sender?.id ?? null,
        })
        .select('*')
        .single()

      if (error || !created) return `Failed to create task: ${error?.message ?? 'unknown error'}`

      await logActivity(supabase, { taskId: created.id, memberId: ctx.sender?.id ?? null, action: 'created', newValue: title })

      if (assignee) {
        await notifyMemberAssigned(
          assignee,
          `📌 New task assigned to you: "${title}"${dueDateIso ? `\nDue: ${formatDueDate(dueDateIso)}` : ''}`
        )
      }

      const bits = [`Created task "${title}"`, assignee ? `assigned to ${assignee.name}` : 'unassigned']
      if (dueDateRaw && !dueDateIso) bits.push(`(couldn't parse due date "${dueDateRaw}")`)
      return bits.join(', ') + '.'
    },
  },
  {
    name: 'update_task',
    description: 'Update fields on an existing task (title, description, priority, platform, status, due date, estimated hours, or reassign).',
    properties: {
      task_query: { type: 'string', description: 'Task title (or part of it) or id prefix' },
      title: { type: 'string' },
      description: { type: 'string' },
      priority: { type: 'string', enum: PRIORITIES },
      platform: { type: 'string', enum: PLATFORMS },
      status: { type: 'string', description: 'todo, in_progress, review, done, or blocked' },
      due_date: { type: 'string', description: 'Natural date like "tomorrow" or an ISO date' },
      estimated_hours: { type: 'number' },
      assignee_name: { type: 'string', description: 'Reassign to this member' },
    },
    required: ['task_query'],
    execute: async (args, ctx) => {
      const query = strArg(args, 'task_query')
      if (!query) return 'A task_query is required to find the task.'
      const task = await findTaskByQuery(query)
      if (!task) return `No task found matching "${query}".`

      const updates: Record<string, unknown> = {}
      const title = strArg(args, 'title')
      if (title) updates.title = title
      const description = args.description !== undefined ? strArg(args, 'description') ?? null : undefined
      if (description !== undefined) updates.description = description
      const priorityRaw = strArg(args, 'priority')?.toLowerCase()
      if (priorityRaw && PRIORITIES.includes(priorityRaw)) updates.priority = priorityRaw
      const platformRaw = strArg(args, 'platform')?.toLowerCase()
      if (platformRaw && PLATFORMS.includes(platformRaw)) updates.platform = platformRaw
      const statusRaw = strArg(args, 'status')?.toLowerCase()
      if (statusRaw) updates.status = statusRaw
      const estHours = numArg(args, 'estimated_hours')
      if (estHours !== undefined) updates.estimated_hours = estHours
      const dueDateRaw = strArg(args, 'due_date')
      if (dueDateRaw) {
        const iso = parseNaturalDate(dueDateRaw)
        if (iso) updates.due_date = iso
      }

      let newAssignee: TfMember | null = null
      const assigneeName = strArg(args, 'assignee_name')
      if (assigneeName) {
        newAssignee = await resolveMemberRef(assigneeName)
        if (!newAssignee) return `No member found matching "${assigneeName}".`
        updates.assignee_id = newAssignee.id
      }

      if (Object.keys(updates).length === 0) return 'No recognized fields to update were provided.'

      const { error } = await supabase.from('tf_tasks').update(updates).eq('id', task.id)
      if (error) return `Failed to update task: ${error.message}`

      await logActivity(supabase, { taskId: task.id, memberId: ctx.sender?.id ?? null, action: 'updated', metadata: updates })

      if (newAssignee) {
        await notifyMemberAssigned(newAssignee, `📌 You've been assigned: "${task.title}"`)
      }

      return `Updated "${task.title}" (${Object.keys(updates).join(', ')}).`
    },
  },
  {
    name: 'delete_task',
    description: 'Permanently delete a task (admin only).',
    properties: { task_query: { type: 'string', description: 'Task title or id prefix' } },
    required: ['task_query'],
    execute: async (args) => {
      const query = strArg(args, 'task_query')
      if (!query) return 'A task_query is required.'
      const task = await findTaskByQuery(query)
      if (!task) return `No task found matching "${query}".`

      await supabase.from('tf_task_attachments').delete().eq('task_id', task.id)
      await supabase.from('tf_task_activity').delete().eq('task_id', task.id)
      const { error } = await supabase.from('tf_tasks').delete().eq('id', task.id)
      if (error) return `Failed to delete task: ${error.message}`
      return `Deleted task "${task.title}".`
    },
  },
  {
    name: 'reassign_task',
    description: 'Reassign an existing task to a different team member.',
    properties: {
      task_query: { type: 'string', description: 'Task title or id prefix' },
      assignee_name: { type: 'string', description: 'Member to assign the task to' },
    },
    required: ['task_query', 'assignee_name'],
    execute: async (args, ctx) => {
      const query = strArg(args, 'task_query')
      if (!query) return 'A task_query is required.'
      const task = await findTaskByQuery(query)
      if (!task) return `No task found matching "${query}".`

      const assigneeName = strArg(args, 'assignee_name')
      if (!assigneeName) return 'assignee_name is required.'
      const newAssignee = await resolveMemberRef(assigneeName)
      if (!newAssignee) return `No member found matching "${assigneeName}".`

      const { error } = await supabase.from('tf_tasks').update({ assignee_id: newAssignee.id }).eq('id', task.id)
      if (error) return `Failed to reassign: ${error.message}`

      await logActivity(supabase, { taskId: task.id, memberId: ctx.sender?.id ?? null, action: 'assigned', newValue: newAssignee.name })
      await notifyMemberAssigned(newAssignee, `📌 You've been assigned: "${task.title}"`)

      return `Reassigned "${task.title}" to ${newAssignee.name}.`
    },
  },
  {
    name: 'complete_task',
    description: 'Mark any task as done (admin only — for self-service use complete_my_task).',
    properties: { task_query: { type: 'string' } },
    required: ['task_query'],
    execute: async (args, ctx) => {
      const query = strArg(args, 'task_query')
      if (!query) return 'A task_query is required.'
      const task = await findTaskByQuery(query)
      if (!task) return `No task found matching "${query}".`

      const { error } = await supabase.from('tf_tasks').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', task.id)
      if (error) return `Failed to complete: ${error.message}`

      await logActivity(supabase, { taskId: task.id, memberId: ctx.sender?.id ?? null, action: 'completed', oldValue: task.status, newValue: 'done' })
      return `Marked "${task.title}" as done.`
    },
  },
  {
    name: 'start_task',
    description: 'Move any task to in_progress (admin only — for self-service use start_my_task).',
    properties: { task_query: { type: 'string' } },
    required: ['task_query'],
    execute: async (args, ctx) => {
      const query = strArg(args, 'task_query')
      if (!query) return 'A task_query is required.'
      const task = await findTaskByQuery(query)
      if (!task) return `No task found matching "${query}".`

      const { error } = await supabase.from('tf_tasks').update({ status: 'in_progress' }).eq('id', task.id)
      if (error) return `Failed to start: ${error.message}`

      await logActivity(supabase, { taskId: task.id, memberId: ctx.sender?.id ?? null, action: 'status_changed', oldValue: task.status, newValue: 'in_progress' })
      return `Started "${task.title}" — moved to In Progress.`
    },
  },
  {
    name: 'list_tasks',
    description: 'List tasks, optionally filtered by status, assignee, overdue-only, or platform.',
    properties: {
      status: { type: 'string' },
      assignee_name: { type: 'string' },
      overdue_only: { type: 'boolean' },
      platform: { type: 'string', enum: PLATFORMS },
    },
    execute: async (args) => {
      let query = supabase.from('tf_tasks').select('*, assignee:tf_members(name)')
      const status = strArg(args, 'status')?.toLowerCase()
      if (status) query = query.eq('status', status)
      const platform = strArg(args, 'platform')?.toLowerCase()
      if (platform) query = query.eq('platform', platform)

      const assigneeName = strArg(args, 'assignee_name')
      if (assigneeName) {
        const member = await resolveMemberRef(assigneeName)
        if (!member) return `No member found matching "${assigneeName}".`
        query = query.eq('assignee_id', member.id)
      }

      const { data, error } = await query.order('due_date', { ascending: true, nullsFirst: false })
      if (error) return `Failed to list tasks: ${error.message}`
      let list = (data ?? []) as (TfTask & { assignee: { name: string } | null })[]

      if (boolArg(args, 'overdue_only')) list = list.filter((t) => isOverdue(t))

      if (list.length === 0) return 'No tasks match those filters.'
      const lines = list
        .slice(0, 30)
        .map(
          (t) =>
            `#${t.id.slice(0, 8)} "${t.title}" — ${t.status}, ${t.priority}${t.assignee ? `, ${t.assignee.name}` : ''}${
              t.due_date ? `, due ${formatDueDate(t.due_date)}` : ''
            }${isOverdue(t) ? ' ⚠️ overdue' : ''}`
        )
      return lines.join('\n') + (list.length > 30 ? `\n…and ${list.length - 30} more.` : '')
    },
  },
  {
    name: 'search_tasks',
    description: 'Search tasks by title or description text.',
    properties: { query: { type: 'string' } },
    required: ['query'],
    execute: async (args) => {
      const q = strArg(args, 'query')
      if (!q) return 'A search query is required.'
      const { data, error } = await supabase
        .from('tf_tasks')
        .select('*, assignee:tf_members(name)')
        .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
        .limit(20)
      if (error) return `Search failed: ${error.message}`
      const list = (data ?? []) as (TfTask & { assignee: { name: string } | null })[]
      if (list.length === 0) return `No tasks matching "${q}".`
      return list.map((t) => `#${t.id.slice(0, 8)} "${t.title}" — ${t.status}${t.assignee ? `, ${t.assignee.name}` : ''}`).join('\n')
    },
  },
  {
    name: 'task_details',
    description: 'Get full details on a task, including attachments and recent activity.',
    properties: { task_query: { type: 'string' } },
    required: ['task_query'],
    execute: async (args) => {
      const q = strArg(args, 'task_query')
      if (!q) return 'A task_query is required.'
      const task = await findTaskByQuery(q)
      if (!task) return `No task found matching "${q}".`

      const [{ data: assignee }, { data: attachments }, activity] = await Promise.all([
        task.assignee_id ? supabase.from('tf_members').select('name').eq('id', task.assignee_id).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from('tf_task_attachments').select('*').eq('task_id', task.id),
        getTaskActivity(task.id),
      ])
      const attachmentList = (attachments as TfTaskAttachment[]) ?? []

      const lines = [
        `"${task.title}" (#${task.id.slice(0, 8)})`,
        task.description || null,
        `Status: ${task.status} | Priority: ${task.priority}${task.platform ? ` | Platform: ${task.platform}` : ''}`,
        `Assignee: ${(assignee as { name: string } | null)?.name ?? 'unassigned'}`,
        `Due: ${formatDueDate(task.due_date)}${isOverdue(task) ? ' ⚠️ overdue' : ''}`,
        task.is_recurring ? `Recurring: ${task.recurrence_pattern}` : null,
        attachmentList.length
          ? `Attachments:\n${attachmentList.map((a) => `  • ${a.title ?? a.url} — ${a.url}`).join('\n')}`
          : 'Attachments: none',
        activity.length
          ? `Recent activity:\n${activity
              .slice(0, 5)
              .map((a) => `  • ${a.action}${a.member_name ? ` by ${a.member_name}` : ''} (${new Date(a.created_at).toLocaleString()})`)
              .join('\n')}`
          : null,
      ]
      return lines.filter(Boolean).join('\n')
    },
  },
  {
    name: 'add_task_attachment',
    description: 'Attach a link to a task.',
    properties: {
      task_query: { type: 'string' },
      url: { type: 'string' },
      title: { type: 'string' },
    },
    required: ['task_query', 'url'],
    execute: async (args, ctx) => {
      const q = strArg(args, 'task_query')
      if (!q) return 'A task_query is required.'
      const url = strArg(args, 'url')
      if (!url) return 'A url is required.'
      const task = await findTaskByQuery(q)
      if (!task) return `No task found matching "${q}".`

      const { error } = await supabase
        .from('tf_task_attachments')
        .insert({ task_id: task.id, type: 'link', title: strArg(args, 'title') ?? null, url, uploaded_by: ctx.sender?.id ?? null })
      if (error) return `Failed to add attachment: ${error.message}`

      await logActivity(supabase, { taskId: task.id, memberId: ctx.sender?.id ?? null, action: 'attachment_added', newValue: url })
      return `Added attachment to "${task.title}".`
    },
  },
  {
    name: 'list_task_attachments',
    description: 'List attachments on a task.',
    properties: { task_query: { type: 'string' } },
    required: ['task_query'],
    execute: async (args) => {
      const q = strArg(args, 'task_query')
      if (!q) return 'A task_query is required.'
      const task = await findTaskByQuery(q)
      if (!task) return `No task found matching "${q}".`

      const { data } = await supabase.from('tf_task_attachments').select('*').eq('task_id', task.id).order('created_at', { ascending: false })
      const list = (data as TfTaskAttachment[]) ?? []
      if (list.length === 0) return `"${task.title}" has no attachments.`
      return list.map((a) => `• ${a.title ?? '(untitled)'} — ${a.url}`).join('\n')
    },
  },
  {
    name: 'remove_task_attachment',
    description: 'Remove an attachment from a task by matching its url or title.',
    properties: {
      task_query: { type: 'string' },
      url_or_title: { type: 'string' },
    },
    required: ['task_query', 'url_or_title'],
    execute: async (args, ctx) => {
      const q = strArg(args, 'task_query')
      if (!q) return 'A task_query is required.'
      const matcher = strArg(args, 'url_or_title')
      if (!matcher) return 'url_or_title is required.'
      const task = await findTaskByQuery(q)
      if (!task) return `No task found matching "${q}".`

      const { data } = await supabase.from('tf_task_attachments').select('*').eq('task_id', task.id)
      const list = (data as TfTaskAttachment[]) ?? []
      const match = list.find((a) => a.url === matcher || (a.title && a.title.toLowerCase().includes(matcher.toLowerCase())))
      if (!match) return `No attachment matching "${matcher}" found on "${task.title}".`

      const { error } = await supabase.from('tf_task_attachments').delete().eq('id', match.id)
      if (error) return `Failed to remove attachment: ${error.message}`

      await logActivity(supabase, { taskId: task.id, memberId: ctx.sender?.id ?? null, action: 'attachment_removed', oldValue: match.url })
      return `Removed attachment "${match.title ?? match.url}" from "${task.title}".`
    },
  },
  {
    name: 'make_task_recurring',
    description: 'Make a task recur on a schedule (daily, weekly, or weekday).',
    properties: {
      task_query: { type: 'string' },
      pattern: { type: 'string', enum: RECURRENCE_PATTERNS },
    },
    required: ['task_query', 'pattern'],
    execute: async (args, ctx) => {
      const q = strArg(args, 'task_query')
      if (!q) return 'A task_query is required.'
      const patternRaw = strArg(args, 'pattern')?.toLowerCase()
      if (!patternRaw || !RECURRENCE_PATTERNS.includes(patternRaw)) return `pattern must be one of ${RECURRENCE_PATTERNS.join(', ')}.`
      const task = await findTaskByQuery(q)
      if (!task) return `No task found matching "${q}".`

      const { error } = await supabase.from('tf_tasks').update({ is_recurring: true, recurrence_pattern: patternRaw }).eq('id', task.id)
      if (error) return `Failed to set recurrence: ${error.message}`

      await logActivity(supabase, { taskId: task.id, memberId: ctx.sender?.id ?? null, action: 'recurrence_set', newValue: patternRaw })
      return `"${task.title}" is now recurring (${patternRaw}).`
    },
  },
  {
    name: 'stop_task_recurring',
    description: 'Stop a task from recurring.',
    properties: { task_query: { type: 'string' } },
    required: ['task_query'],
    execute: async (args, ctx) => {
      const q = strArg(args, 'task_query')
      if (!q) return 'A task_query is required.'
      const task = await findTaskByQuery(q)
      if (!task) return `No task found matching "${q}".`

      const { error } = await supabase.from('tf_tasks').update({ is_recurring: false, recurrence_pattern: null }).eq('id', task.id)
      if (error) return `Failed to stop recurrence: ${error.message}`

      await logActivity(supabase, { taskId: task.id, memberId: ctx.sender?.id ?? null, action: 'recurrence_stopped' })
      return `Stopped recurrence on "${task.title}".`
    },
  },

  // ── SELF ───────────────────────────────────────────────────────────────
  {
    name: 'list_my_tasks',
    description: "List the current sender's own active tasks.",
    properties: {},
    execute: async (_args, ctx) => {
      if (!ctx.sender) return "You're not registered yet — ask the admin to add you."
      const { data } = await supabase.from('tf_tasks').select('*').eq('assignee_id', ctx.sender.id)
      const active = ((data as TfTask[]) ?? []).filter((t) => t.status !== 'done')
      if (active.length === 0) return 'You have no active tasks right now.'
      return active
        .map((t) => `"${t.title}" (${t.status}, ${t.priority}${t.due_date ? `, due ${formatDueDate(t.due_date)}` : ''})`)
        .join('\n')
    },
  },
  {
    name: 'complete_my_task',
    description: "Mark a task assigned to the current sender as done. Only works on the sender's own tasks.",
    properties: { task_query: { type: 'string' } },
    required: ['task_query'],
    execute: async (args, ctx) => {
      if (!ctx.sender) return "You're not registered yet — ask the admin to add you."
      const q = strArg(args, 'task_query')
      if (!q) return 'A task_query is required.'
      const task = await findTaskByQuery(q)
      if (!task) return `No task found matching "${q}".`
      if (task.assignee_id !== ctx.sender.id) return 'That task is assigned to someone else — you can only complete your own tasks.'

      const { error } = await supabase.from('tf_tasks').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', task.id)
      if (error) return `Failed to complete: ${error.message}`

      await logActivity(supabase, { taskId: task.id, memberId: ctx.sender.id, action: 'completed', oldValue: task.status, newValue: 'done' })
      return `Marked "${task.title}" as done.`
    },
  },
  {
    name: 'start_my_task',
    description: "Move a task assigned to the current sender to in_progress. Only works on the sender's own tasks.",
    properties: { task_query: { type: 'string' } },
    required: ['task_query'],
    execute: async (args, ctx) => {
      if (!ctx.sender) return "You're not registered yet — ask the admin to add you."
      const q = strArg(args, 'task_query')
      if (!q) return 'A task_query is required.'
      const task = await findTaskByQuery(q)
      if (!task) return `No task found matching "${q}".`
      if (task.assignee_id !== ctx.sender.id) return 'That task is assigned to someone else — you can only start your own tasks.'

      const { error } = await supabase.from('tf_tasks').update({ status: 'in_progress' }).eq('id', task.id)
      if (error) return `Failed to start: ${error.message}`

      await logActivity(supabase, { taskId: task.id, memberId: ctx.sender.id, action: 'status_changed', oldValue: task.status, newValue: 'in_progress' })
      return `Started "${task.title}" — moved to In Progress.`
    },
  },
  {
    name: 'pause_my_task',
    description: "Move a task assigned to the current sender back to todo. Only works on the sender's own tasks.",
    properties: { task_query: { type: 'string' } },
    required: ['task_query'],
    execute: async (args, ctx) => {
      if (!ctx.sender) return "You're not registered yet — ask the admin to add you."
      const q = strArg(args, 'task_query')
      if (!q) return 'A task_query is required.'
      const task = await findTaskByQuery(q)
      if (!task) return `No task found matching "${q}".`
      if (task.assignee_id !== ctx.sender.id) return 'That task is assigned to someone else — you can only pause your own tasks.'

      const { error } = await supabase.from('tf_tasks').update({ status: 'todo' }).eq('id', task.id)
      if (error) return `Failed to pause: ${error.message}`

      await logActivity(supabase, { taskId: task.id, memberId: ctx.sender.id, action: 'status_changed', oldValue: task.status, newValue: 'todo' })
      return `Paused "${task.title}" — moved back to To Do.`
    },
  },
  {
    name: 'my_completed_tasks',
    description: "List tasks the current sender completed in the last 7 days.",
    properties: {},
    execute: async (_args, ctx) => {
      if (!ctx.sender) return "You're not registered yet — ask the admin to add you."
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
      const { data } = await supabase.from('tf_tasks').select('*').eq('assignee_id', ctx.sender.id).eq('status', 'done').gte('completed_at', since)
      const list = (data as TfTask[]) ?? []
      if (list.length === 0) return "You haven't completed any tasks in the last 7 days."
      return list.map((t) => `"${t.title}" — completed ${t.completed_at ? new Date(t.completed_at).toLocaleDateString() : ''}`).join('\n')
    },
  },
  {
    name: 'my_workload',
    description: "Show the current sender's own workload (booked vs max hours, active tasks).",
    properties: {},
    execute: async (_args, ctx) => {
      if (!ctx.sender) return "You're not registered yet — ask the admin to add you."
      const w = await getMemberWorkload(ctx.sender.id)
      return `You have ${w.active_tasks} active task(s), ${w.estimated_hours_remaining}h booked of ${w.max_daily_hours}h/day (${w.utilization_pct}% utilized, ${w.status}). ${w.available_hours}h available.`
    },
  },

  // ── MEMBERS (admin) ───────────────────────────────────────────────────
  {
    name: 'create_member',
    description: 'Create a new team member.',
    properties: {
      name: { type: 'string' },
      telegram_username: { type: 'string' },
      discord_username: { type: 'string' },
      team_name: { type: 'string', description: 'Optional team to add them to after creation' },
    },
    required: ['name'],
    execute: async (args) => {
      const name = strArg(args, 'name')
      if (!name) return 'A name is required.'
      const telegramUsername = strArg(args, 'telegram_username')?.replace(/^@/, '')
      const discordUsername = strArg(args, 'discord_username')?.replace(/^@/, '')

      const { data: existing } = await supabase.from('tf_members').select('*').ilike('name', name).maybeSingle()
      if (existing) return `${name} already exists in the system.`

      const { data: newMember, error } = await supabase
        .from('tf_members')
        .insert({ name, telegram_username: telegramUsername ?? null, discord_username: discordUsername ?? null, role: 'worker', status: 'active' })
        .select('*')
        .single()
      if (error || !newMember) return `Failed to create member: ${error?.message ?? 'unknown error'}`

      const teamName = strArg(args, 'team_name')
      if (teamName) {
        const team = await resolveTeamRef(teamName)
        if (team) {
          await supabase.from('tf_member_teams').insert({ member_id: newMember.id, team_id: team.id })
          const granted = await autoGrantPlatformTopic(team)
          return `Created member ${name} and added them to "${team.name}"${granted ? `, granted access to the ${granted} topic` : ''}.`
        }
        return `Created member ${name}. No team found matching "${teamName}" — add them to a team separately.`
      }
      return `Created member ${name}.`
    },
  },
  {
    name: 'update_member',
    description: "Update a member's fields: name, role, status, max_daily_hours, telegram_username, or discord_username.",
    properties: {
      member_name: { type: 'string' },
      new_name: { type: 'string' },
      role: { type: 'string', enum: ['admin', 'manager', 'worker'] },
      status: { type: 'string', enum: ['active', 'inactive', 'on_leave'] },
      max_daily_hours: { type: 'number' },
      telegram_username: { type: 'string' },
      discord_username: { type: 'string' },
    },
    required: ['member_name'],
    execute: async (args) => {
      const memberName = strArg(args, 'member_name')
      if (!memberName) return 'member_name is required.'
      const member = await resolveMemberRef(memberName)
      if (!member) return `No member found matching "${memberName}".`

      const updates: Record<string, unknown> = {}
      const newName = strArg(args, 'new_name')
      if (newName) updates.name = newName
      const role = strArg(args, 'role')?.toLowerCase()
      if (role && ['admin', 'manager', 'worker'].includes(role)) updates.role = role
      const status = strArg(args, 'status')?.toLowerCase()
      if (status && ['active', 'inactive', 'on_leave'].includes(status)) updates.status = status
      const maxHours = numArg(args, 'max_daily_hours')
      if (maxHours !== undefined) updates.max_daily_hours = maxHours
      const telegramUsername = strArg(args, 'telegram_username')
      if (telegramUsername) updates.telegram_username = telegramUsername.replace(/^@/, '')
      const discordUsername = strArg(args, 'discord_username')
      if (discordUsername) updates.discord_username = discordUsername.replace(/^@/, '')

      if (Object.keys(updates).length === 0) return 'No recognized fields to update were provided.'

      const { error } = await supabase.from('tf_members').update(updates).eq('id', member.id)
      if (error) return `Failed to update member: ${error.message}`
      return `Updated ${member.name} (${Object.keys(updates).join(', ')}).`
    },
  },
  {
    name: 'list_members',
    description: 'List all team members with skills, teams, and active task counts.',
    properties: {},
    execute: async () => {
      const ctxData = await buildTeamContext(null)
      if (ctxData.members.length === 0) return 'No members found.'
      return ctxData.members
        .map(
          (m) =>
            `${m.name} (${m.role}, ${m.status}) — ${m.active_task_count} active task(s), ${m.hours_booked}h booked, teams: ${
              m.teams.join(', ') || 'none'
            }, skills: ${m.skills.join(', ') || 'none'}`
        )
        .join('\n')
    },
  },
  {
    name: 'member_details',
    description: 'Get full details on one member.',
    properties: { member_name: { type: 'string' } },
    required: ['member_name'],
    execute: async (args) => {
      const memberName = strArg(args, 'member_name')
      if (!memberName) return 'member_name is required.'
      const member = await resolveMemberRef(memberName)
      if (!member) return `No member found matching "${memberName}".`

      const ctxData = await buildTeamContext(member.id)
      const found = ctxData.members.find((m) => m.id === member.id)
      if (!found) return `${member.name}: no data found.`
      return [
        `${found.name} — ${found.role}, ${found.status}`,
        `Telegram: ${found.telegram_username ? '@' + found.telegram_username : 'not linked'} | Discord: ${
          found.discord_username ? '@' + found.discord_username : 'not linked'
        }`,
        `Teams: ${found.teams.join(', ') || 'none'}`,
        `Skills: ${found.skills.join(', ') || 'none'}`,
        `Active tasks: ${found.active_task_count}, ${found.hours_booked}h/${found.max_daily_hours}h booked`,
      ].join('\n')
    },
  },
  {
    name: 'assign_skill',
    description: 'Assign a skill (with proficiency 1-5) to a member.',
    properties: {
      member_name: { type: 'string' },
      skill_name: { type: 'string' },
      proficiency: { type: 'number', description: '1-5, defaults to 3' },
    },
    required: ['member_name', 'skill_name'],
    execute: async (args) => {
      const memberName = strArg(args, 'member_name')
      if (!memberName) return 'member_name is required.'
      const skillName = strArg(args, 'skill_name')
      if (!skillName) return 'skill_name is required.'
      const member = await resolveMemberRef(memberName)
      if (!member) return `No member found matching "${memberName}".`
      const skill = await resolveSkillRef(skillName)
      if (!skill) return `No skill found matching "${skillName}" — create it first with create_skill.`

      const proficiency = Math.min(5, Math.max(1, numArg(args, 'proficiency') ?? 3))
      const { error } = await supabase
        .from('tf_member_skills')
        .upsert({ member_id: member.id, skill_id: skill.id, proficiency_level: proficiency }, { onConflict: 'member_id,skill_id' })
      if (error) return `Failed to assign skill: ${error.message}`
      return `Assigned ${skill.name} (${proficiency}/5) to ${member.name}.`
    },
  },
  {
    name: 'remove_skill',
    description: 'Remove a skill from a member.',
    properties: { member_name: { type: 'string' }, skill_name: { type: 'string' } },
    required: ['member_name', 'skill_name'],
    execute: async (args) => {
      const memberName = strArg(args, 'member_name')
      if (!memberName) return 'member_name is required.'
      const skillName = strArg(args, 'skill_name')
      if (!skillName) return 'skill_name is required.'
      const member = await resolveMemberRef(memberName)
      if (!member) return `No member found matching "${memberName}".`
      const skill = await resolveSkillRef(skillName)
      if (!skill) return `No skill found matching "${skillName}".`

      const { error } = await supabase.from('tf_member_skills').delete().eq('member_id', member.id).eq('skill_id', skill.id)
      if (error) return `Failed to remove skill: ${error.message}`
      return `Removed ${skill.name} from ${member.name}.`
    },
  },
  {
    name: 'create_skill',
    description: 'Create a new skill in the catalog.',
    properties: { name: { type: 'string' }, description: { type: 'string' }, category: { type: 'string' } },
    required: ['name'],
    execute: async (args) => {
      const name = strArg(args, 'name')
      if (!name) return 'A name is required.'
      const { data: existing } = await supabase.from('tf_skills').select('*').ilike('name', name).maybeSingle()
      if (existing) return `Skill "${name}" already exists.`

      const { error } = await supabase
        .from('tf_skills')
        .insert({ name, description: strArg(args, 'description') ?? null, category: strArg(args, 'category') ?? 'general' })
      if (error) return `Failed to create skill: ${error.message}`
      return `Created skill "${name}".`
    },
  },
  {
    name: 'list_skills',
    description: 'List all skills in the catalog.',
    properties: {},
    execute: async () => {
      const { data } = await supabase.from('tf_skills').select('name, category').order('category').order('name')
      const list = (data as { name: string; category: string }[]) ?? []
      if (list.length === 0) return 'No skills defined yet.'
      return list.map((s) => `${s.name} (${s.category})`).join('\n')
    },
  },

  // ── TEAMS (admin) ──────────────────────────────────────────────────────
  {
    name: 'create_team',
    description: 'Create a new team.',
    properties: { team_name: { type: 'string' }, description: { type: 'string' } },
    required: ['team_name'],
    execute: async (args) => {
      const teamName = strArg(args, 'team_name')
      if (!teamName) return 'team_name is required.'
      const { error } = await supabase.from('tf_teams').insert({ name: teamName, description: strArg(args, 'description') ?? null })
      if (error) {
        if ((error as { code?: string }).code === '23505') return `Team "${teamName}" already exists.`
        return `Failed to create team: ${error.message}`
      }
      return `Created team "${teamName}".`
    },
  },
  {
    name: 'add_member_to_team',
    description: 'Add a member to a team. Auto-grants platform topic access if the team name contains a platform keyword.',
    properties: { member_name: { type: 'string' }, team_name: { type: 'string' } },
    required: ['member_name', 'team_name'],
    execute: async (args) => {
      const memberName = strArg(args, 'member_name')
      if (!memberName) return 'member_name is required.'
      const teamName = strArg(args, 'team_name')
      if (!teamName) return 'team_name is required.'
      const member = await resolveMemberRef(memberName)
      if (!member) return `No member found matching "${memberName}".`
      const team = await resolveTeamRef(teamName)
      if (!team) return `No team found matching "${teamName}".`

      const { error } = await supabase.from('tf_member_teams').insert({ member_id: member.id, team_id: team.id })
      if (error) {
        if ((error as { code?: string }).code === '23505') return `${member.name} is already on the "${team.name}" team.`
        return `Failed to add member to team: ${error.message}`
      }
      const granted = await autoGrantPlatformTopic(team)
      return `Added ${member.name} to "${team.name}"${granted ? `, granted the team access to the ${granted} topic` : ''}.`
    },
  },
  {
    name: 'remove_member_from_team',
    description: 'Remove a member from a team.',
    properties: { member_name: { type: 'string' }, team_name: { type: 'string' } },
    required: ['member_name', 'team_name'],
    execute: async (args) => {
      const memberName = strArg(args, 'member_name')
      if (!memberName) return 'member_name is required.'
      const teamName = strArg(args, 'team_name')
      if (!teamName) return 'team_name is required.'
      const member = await resolveMemberRef(memberName)
      if (!member) return `No member found matching "${memberName}".`
      const team = await resolveTeamRef(teamName)
      if (!team) return `No team found matching "${teamName}".`

      const { error } = await supabase.from('tf_member_teams').delete().eq('member_id', member.id).eq('team_id', team.id)
      if (error) return `Failed to remove member from team: ${error.message}`
      return `Removed ${member.name} from "${team.name}".`
    },
  },
  {
    name: 'list_teams',
    description: 'List all teams and their members.',
    properties: {},
    execute: async () => {
      const ctxData = await buildTeamContext(null)
      if (ctxData.teams.length === 0) return 'No teams found.'
      return ctxData.teams.map((t) => `${t.name}: ${t.members.join(', ') || 'no members'}`).join('\n')
    },
  },
  {
    name: 'grant_topic_access',
    description: 'Grant a team access to a topic (general, manager_chat, notifications, twitter, reddit, instagram, tiktok, youtube, testing, sops).',
    properties: { topic_name: { type: 'string' }, team_name: { type: 'string' } },
    required: ['topic_name', 'team_name'],
    execute: async (args) => {
      const topicName = strArg(args, 'topic_name')
      if (!topicName) return 'topic_name is required.'
      const teamName = strArg(args, 'team_name')
      if (!teamName) return 'team_name is required.'
      const team = await resolveTeamRef(teamName)
      if (!team) return `No team found matching "${teamName}".`

      const { error } = await supabase
        .from('tf_topic_team_access')
        .upsert({ topic_name: topicName.toLowerCase(), team_id: team.id }, { onConflict: 'topic_name,team_id' })
      if (error) return `Failed to grant access: ${error.message}`

      await announceTopicAccessGranted(topicName.toLowerCase(), team.name)
      return `Granted "${team.name}" access to the ${topicName} topic.`
    },
  },
  {
    name: 'revoke_topic_access',
    description: 'Revoke a team\'s access to a topic.',
    properties: { topic_name: { type: 'string' }, team_name: { type: 'string' } },
    required: ['topic_name', 'team_name'],
    execute: async (args) => {
      const topicName = strArg(args, 'topic_name')
      if (!topicName) return 'topic_name is required.'
      const teamName = strArg(args, 'team_name')
      if (!teamName) return 'team_name is required.'
      const team = await resolveTeamRef(teamName)
      if (!team) return `No team found matching "${teamName}".`

      const { error } = await supabase.from('tf_topic_team_access').delete().eq('topic_name', topicName.toLowerCase()).eq('team_id', team.id)
      if (error) return `Failed to revoke access: ${error.message}`
      return `Revoked "${team.name}"'s access to the ${topicName} topic.`
    },
  },
  {
    name: 'list_topic_access',
    description: 'List which teams have access to which topics.',
    properties: {},
    execute: async () => {
      const ctxData = await buildTeamContext(null)
      if (ctxData.topic_access.length === 0) return 'No topic access grants configured.'
      return ctxData.topic_access.map((t) => `${t.topic_name}: ${t.teams.join(', ')}`).join('\n')
    },
  },

  // ── BOARDS (admin) ─────────────────────────────────────────────────────
  {
    name: 'create_board',
    description: 'Create a new task board.',
    properties: { name: { type: 'string' }, description: { type: 'string' } },
    required: ['name'],
    execute: async (args) => {
      const name = strArg(args, 'name')
      if (!name) return 'A name is required.'
      const { data: existing } = await supabase.from('tf_boards').select('*').ilike('name', name).maybeSingle()
      if (existing) return `Board "${name}" already exists.`

      const { error } = await supabase.from('tf_boards').insert({ name, description: strArg(args, 'description') ?? null })
      if (error) return `Failed to create board: ${error.message}`
      return `Created board "${name}".`
    },
  },
  {
    name: 'list_boards',
    description: 'List all task boards.',
    properties: {},
    execute: async () => {
      const { data } = await supabase.from('tf_boards').select('name, description').order('created_at')
      const list = (data as { name: string; description: string | null }[]) ?? []
      if (list.length === 0) return 'No boards found.'
      return list.map((b) => `${b.name}${b.description ? ` — ${b.description}` : ''}`).join('\n')
    },
  },

  // ── SOPS (admin, except list_sops/get_sop) ────────────────────────────
  {
    name: 'create_sop',
    description: 'Create or update (by title match) an SOP. Posts to the SOPs topic and announces changes if updating an existing one.',
    properties: {
      title: { type: 'string' },
      content: { type: 'string' },
      category: { type: 'string', enum: SOP_CATEGORIES },
      platform: { type: 'string', enum: PLATFORMS },
      summary: { type: 'string', description: 'Summary of what changed, if updating an existing SOP' },
    },
    required: ['title', 'content'],
    execute: async (args, ctx) => {
      const title = strArg(args, 'title')
      if (!title) return 'A title is required.'
      const content = strArg(args, 'content')
      if (!content) return 'Content is required.'
      const categoryRaw = strArg(args, 'category')?.toLowerCase()
      const category = (SOP_CATEGORIES.includes(categoryRaw ?? '') ? categoryRaw : 'general') as SopCategory
      const platformRaw = strArg(args, 'platform')?.toLowerCase()
      const platform = (PLATFORMS.includes(platformRaw ?? '') ? platformRaw : null) as Platform | null

      const existing = await resolveSopRef(title)
      if (existing) {
        const oldContent = existing.content
        const oldVersion = existing.version
        const updated = await updateSOP(existing.id, {
          title,
          content,
          category,
          platform,
          changeNote: strArg(args, 'summary'),
          editedBy: ctx.sender?.id ?? null,
        })
        await syncSOPToTelegram(updated.id)
        await syncSOPToDiscord(updated.id)
        const diff = await generateSOPDiff(oldContent, content)
        const announcePlatform = updated.platform ?? 'general'
        await postSopChangeAnnouncement(updated.title, `Changes from v${oldVersion} → v${updated.version}:\n${diff}`, announcePlatform)
        return `Updated SOP "${updated.title}" (v${oldVersion} → v${updated.version}). Announced in the ${announcePlatform} topic and synced to 📋 SOPs.`
      }

      const created = await createSOP({ title, content, category, platform, createdBy: ctx.sender?.id ?? null })
      await syncSOPToTelegram(created.id)
      await syncSOPToDiscord(created.id)
      return `Created SOP "${created.title}". Posted in the 📋 SOPs topic.`
    },
  },
  {
    name: 'update_sop',
    description: 'Update fields on an existing SOP (found by title match), re-syncing the pinned Telegram/Discord message.',
    properties: {
      sop_title: { type: 'string' },
      new_title: { type: 'string' },
      content: { type: 'string' },
      category: { type: 'string', enum: SOP_CATEGORIES },
      platform: { type: 'string', enum: PLATFORMS },
      summary: { type: 'string' },
    },
    required: ['sop_title'],
    execute: async (args, ctx) => {
      const q = strArg(args, 'sop_title')
      if (!q) return 'sop_title is required.'
      const existing = await resolveSopRef(q)
      if (!existing) return `No SOP found matching "${q}".`

      const updates: { title?: string; content?: string; category?: SopCategory; platform?: Platform | null; changeNote?: string; editedBy?: string | null } = {
        editedBy: ctx.sender?.id ?? null,
      }
      const newTitle = strArg(args, 'new_title')
      if (newTitle) updates.title = newTitle
      const content = strArg(args, 'content')
      if (content) updates.content = content
      const categoryRaw = strArg(args, 'category')?.toLowerCase()
      if (categoryRaw && SOP_CATEGORIES.includes(categoryRaw)) updates.category = categoryRaw as SopCategory
      const platformRaw = strArg(args, 'platform')?.toLowerCase()
      if (platformRaw && PLATFORMS.includes(platformRaw)) updates.platform = platformRaw as Platform
      const summary = strArg(args, 'summary')
      if (summary) updates.changeNote = summary

      const updated = await updateSOP(existing.id, updates)
      await syncSOPToTelegram(updated.id)
      await syncSOPToDiscord(updated.id)
      return `Updated SOP "${updated.title}" (now v${updated.version}).`
    },
  },
  {
    name: 'archive_sop',
    description: 'Archive an SOP so it no longer shows as active.',
    properties: { sop_title: { type: 'string' } },
    required: ['sop_title'],
    execute: async (args) => {
      const q = strArg(args, 'sop_title')
      if (!q) return 'sop_title is required.'
      const existing = await resolveSopRef(q)
      if (!existing) return `No SOP found matching "${q}".`
      await archiveSOP(existing.id)
      return `Archived SOP "${existing.title}".`
    },
  },
  {
    name: 'get_sop',
    description: 'Get the full content of an SOP by title.',
    properties: { title_query: { type: 'string' } },
    required: ['title_query'],
    execute: async (args) => {
      const q = strArg(args, 'title_query')
      if (!q) return 'title_query is required.'
      const sop = await resolveSopRef(q)
      if (!sop) return `No SOP found matching "${q}".`
      return `📋 ${sop.title} (v${sop.version}, ${sop.category}${sop.platform ? `, ${sop.platform}` : ''})\n\n${sop.content}`
    },
  },
  {
    name: 'list_sops',
    description: 'List all active SOPs.',
    properties: {},
    execute: async () => {
      const sops = await listSOPs()
      if (sops.length === 0) return 'No active SOPs.'
      return sops.map((s) => `${s.title} (v${s.version}, ${s.category}${s.platform ? `, ${s.platform}` : ''})`).join('\n')
    },
  },
  {
    name: 'announce_sop_change',
    description: 'Announce SOP changes in the relevant platform topic and the SOPs topic.',
    properties: { sop_title: { type: 'string' }, changes_summary: { type: 'string' }, platform: { type: 'string' } },
    required: ['sop_title', 'changes_summary'],
    execute: async (args) => {
      const sopTitle = strArg(args, 'sop_title')
      if (!sopTitle) return 'sop_title is required.'
      const changesSummary = strArg(args, 'changes_summary')
      if (!changesSummary) return 'changes_summary is required.'
      const platform = strArg(args, 'platform') ?? 'general'

      await postSopChangeAnnouncement(sopTitle, changesSummary, platform)
      return `Announced changes to "${sopTitle}" in the ${platform} topic and 📋 SOPs.`
    },
  },
  {
    name: 'distribute_to_team',
    description: "Post a message to a team's platform topic.",
    properties: { team_name: { type: 'string' }, message: { type: 'string' }, file_summary: { type: 'string' } },
    required: ['team_name', 'message'],
    execute: async (args) => {
      const teamName = strArg(args, 'team_name')
      if (!teamName) return 'team_name is required.'
      const message = strArg(args, 'message')
      if (!message) return 'message is required.'
      const team = await resolveTeamRef(teamName)
      if (!team) return `No team found matching "${teamName}".`

      const { data: access } = await supabase.from('tf_topic_team_access').select('topic_name').eq('team_id', team.id)
      const topicNames = ((access as { topic_name: string }[]) ?? []).map((a) => a.topic_name)
      const targetTopic = topicNames.find((t) => t !== 'general' && t !== 'notifications') ?? topicNames[0] ?? 'general'

      const fileSummary = strArg(args, 'file_summary')
      const fullMessage = fileSummary ? `${message}\n\n📎 ${fileSummary}` : message
      const messageId = await sendToTopic(targetTopic, fullMessage)
      await notifyDiscordChannel(targetTopic, fullMessage)
      if (!messageId) return `Failed to post to the ${targetTopic} topic. Check the topic is configured.`
      return `Distributed to "${team.name}" in the ${targetTopic} topic.`
    },
  },
  {
    name: 'summarize_file',
    description: 'Record a summary (and optional key points) of an uploaded file — used to reply after analyzing a document.',
    properties: { summary: { type: 'string' }, key_points: { type: 'string' } },
    required: ['summary'],
    execute: async (args) => {
      const summary = strArg(args, 'summary')
      if (!summary) return 'A summary is required.'
      const keyPoints = strArg(args, 'key_points')
      return keyPoints ? `${summary}\n\nKey points: ${keyPoints}` : summary
    },
  },

  // ── INSIGHT ────────────────────────────────────────────────────────────
  {
    name: 'team_workload',
    description: 'Show every active member\'s booked vs max daily hours and active task count.',
    properties: {},
    execute: async () => {
      const workloads = await getTeamWorkload()
      if (workloads.length === 0) return 'No active members found.'
      return workloads
        .map((w) => `${w.name}: ${w.estimated_hours_remaining}h/${w.max_daily_hours}h booked (${w.utilization_pct}%, ${w.status}), ${w.active_tasks} active task(s)`)
        .join('\n')
    },
  },
  {
    name: 'who_is_free',
    description: 'Recommend the best available member, optionally filtered by skill.',
    properties: { skill_name: { type: 'string' }, date: { type: 'string', description: 'Not currently used for scheduling — informational only' } },
    execute: async (args) => {
      const skillName = strArg(args, 'skill_name')
      const candidates = await findBestAssignee(skillName)
      if (candidates.length === 0) return skillName ? `No available members with the "${skillName}" skill.` : 'No available members found.'
      return candidates.map((c) => `${c.name} — ${c.reason} (score ${c.recommendation_score})`).join('\n')
    },
  },
  {
    name: 'team_stats',
    description: 'Team-wide totals: tasks by status, overdue count, active members, completed today/this week.',
    properties: {},
    execute: async () => {
      const [{ data: tasks }, { data: members }] = await Promise.all([
        supabase.from('tf_tasks').select('status, completed_at, due_date'),
        supabase.from('tf_members').select('status'),
      ])
      const allTasks = (tasks as { status: string; completed_at: string | null; due_date: string | null }[]) ?? []
      const allMembers = (members as { status: string }[]) ?? []

      const byStatus: Record<string, number> = {}
      for (const t of allTasks) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1

      const overdueCount = allTasks.filter((t) => t.due_date && t.status !== 'done' && new Date(t.due_date).getTime() < Date.now()).length
      const activeMembers = allMembers.filter((m) => m.status === 'active').length

      const startOfToday = new Date()
      startOfToday.setHours(0, 0, 0, 0)
      const startOfWeek = new Date(startOfToday)
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())

      const doneToday = allTasks.filter((t) => t.completed_at && new Date(t.completed_at) >= startOfToday).length
      const doneThisWeek = allTasks.filter((t) => t.completed_at && new Date(t.completed_at) >= startOfWeek).length

      return [
        `Tasks by status: ${Object.entries(byStatus).map(([s, c]) => `${s}=${c}`).join(', ') || 'none'}`,
        `Overdue: ${overdueCount}`,
        `Active members: ${activeMembers}`,
        `Completed today: ${doneToday} | this week: ${doneThisWeek}`,
      ].join('\n')
    },
  },
  {
    name: 'overdue_tasks',
    description: 'List all overdue tasks.',
    properties: {},
    execute: async () => {
      const { data } = await supabase.from('tf_tasks').select('*, assignee:tf_members(name)').neq('status', 'done').not('due_date', 'is', null)
      const list = ((data as (TfTask & { assignee: { name: string } | null })[]) ?? []).filter((t) => isOverdue(t))
      if (list.length === 0) return 'No overdue tasks. 🎉'
      return list.map((t) => `"${t.title}" — ${t.assignee?.name ?? 'unassigned'}, due ${formatDueDate(t.due_date)}`).join('\n')
    },
  },

  // ── REEL LAB BRIDGE ────────────────────────────────────────────────────
  {
    name: 'log_reel_post',
    description: 'Log a posted Instagram reel/post: records it in the post log, marks today\'s posting task done, and checks off the daily checklist.',
    properties: {
      reel_url: { type: 'string' },
      account_handle: { type: 'string', description: 'Defaults to the sender\'s single active account assignment' },
      note: { type: 'string' },
    },
    required: ['reel_url'],
    execute: async (args, ctx) => {
      const url = strArg(args, 'reel_url')
      if (!url) return 'A reel_url is required.'
      if (!/instagram\.com\/(reel|p)\//i.test(url)) return 'That does not look like an Instagram reel/post URL.'
      if (!ctx.sender) return "You're not registered yet — ask the admin to add you."

      let handle = strArg(args, 'account_handle')?.replace(/^@/, '').toLowerCase()
      if (!handle) {
        const { data: assignments } = await supabase
          .from('account_assignments')
          .select('account_handle')
          .ilike('va_name', ctx.sender.name)
          .eq('is_active', true)
        const handles = ((assignments as { account_handle: string }[]) ?? []).map((a) => a.account_handle)
        if (handles.length === 0) return "I couldn't find an active account assignment for you — tell me which account_handle this reel is for."
        if (handles.length > 1) return `You're assigned to multiple accounts (${handles.join(', ')}) — which one is this reel for?`
        handle = handles[0]
      }

      const nowIso = new Date().toISOString()
      const { error: postError } = await supabase.from('va_posts').insert({
        account_handle: handle,
        post_type: 'reel',
        link: url,
        note: strArg(args, 'note') ?? null,
        va_name: ctx.sender.name,
        posted_at: nowIso,
        status: 'posted',
      })
      if (postError) return `Failed to log the post: ${postError.message}`

      const { data: candidateTasks } = await supabase.from('tf_tasks').select('*').ilike('title', `%${handle}%`)
      const recurringTask = ((candidateTasks as TfTask[]) ?? []).find(
        (t) => t.status !== 'done' && (t.is_recurring || t.recurrence_parent_id)
      )
      if (recurringTask) {
        await supabase.from('tf_tasks').update({ status: 'done', completed_at: nowIso }).eq('id', recurringTask.id)
        await logActivity(supabase, {
          taskId: recurringTask.id,
          memberId: ctx.sender.id,
          action: 'completed',
          oldValue: recurringTask.status,
          newValue: 'done',
          metadata: { via: 'log_reel_post' },
        })
        await supabase.from('tf_task_attachments').insert({ task_id: recurringTask.id, type: 'link', title: 'Reel', url, uploaded_by: ctx.sender.id })
      }

      const day = new Date().toISOString().slice(0, 10)
      await supabase
        .from('va_checklist')
        .upsert({ account_handle: handle, day, task_key: 'post_reel', done_by: ctx.sender.name, done_at: nowIso }, { onConflict: 'account_handle,day,task_key' })

      return `✅ Logged reel for @${handle}${recurringTask ? " and marked today's posting task done" : ''}.`
    },
  },
  {
    name: 'va_todo',
    description: "Show the Instagram VA daily checklist for an account.",
    properties: { account_handle: { type: 'string' } },
    execute: async (args) => {
      const handle = strArg(args, 'account_handle')
      return getVATodoMessage(handle)
    },
  },
  {
    name: 'sync_va_members',
    description: 'Sync active TeamFlow members into the Reel Lab va_profiles/telegram_users tables.',
    properties: {},
    execute: async () => {
      const result = await syncMembersToReelLab(supabase)
      return formatVaSyncResult(result)
    },
  },

  // ── VAULT ──────────────────────────────────────────────────────────────
  {
    name: 'my_vault_items',
    description: "List the current sender's own vault items (passwords masked to last 4 characters).",
    properties: {},
    execute: async (_args, ctx) => {
      if (!ctx.sender) return "You're not registered yet — ask the admin to add you."
      const { data } = await supabase.from('tf_va_vault').select('*').eq('member_id', ctx.sender.id)
      const list = (data as TfVaVaultItem[]) ?? []
      if (list.length === 0) return 'You have no vault items.'
      return list
        .map((v) => {
          const bits = [`${v.name} (${v.item_type})`]
          if (v.username) bits.push(`user: ${v.username}`)
          if (v.password) bits.push(`pass: ${maskSecret(v.password)}`)
          if (v.url) bits.push(`url: ${v.url}`)
          if (v.proxy_address) bits.push(`proxy: ${v.proxy_address}:${v.proxy_port ?? ''}`)
          return bits.join(' | ')
        })
        .join('\n')
    },
  },
  {
    name: 'add_vault_item',
    description: 'Add a vault item (account/login/proxy/api_key/note) for a member (admin only).',
    properties: {
      member_name: { type: 'string' },
      item_type: { type: 'string', enum: ['account', 'login', 'proxy', 'api_key', 'note', 'other'] },
      name: { type: 'string' },
      username: { type: 'string' },
      password: { type: 'string' },
      url: { type: 'string' },
      notes: { type: 'string' },
      api_key: { type: 'string' },
      proxy_address: { type: 'string' },
      proxy_port: { type: 'string' },
      proxy_username: { type: 'string' },
      proxy_password: { type: 'string' },
    },
    required: ['member_name', 'item_type', 'name'],
    execute: async (args) => {
      const memberName = strArg(args, 'member_name')
      if (!memberName) return 'member_name is required.'
      const itemType = strArg(args, 'item_type')?.toLowerCase()
      const validTypes = ['account', 'login', 'proxy', 'api_key', 'note', 'other']
      if (!itemType || !validTypes.includes(itemType)) return `item_type must be one of ${validTypes.join(', ')}.`
      const name = strArg(args, 'name')
      if (!name) return 'A name is required.'
      const member = await resolveMemberRef(memberName)
      if (!member) return `No member found matching "${memberName}".`

      const { error } = await supabase.from('tf_va_vault').insert({
        member_id: member.id,
        item_type: itemType,
        name,
        username: strArg(args, 'username') ?? null,
        password: strArg(args, 'password') ?? null,
        url: strArg(args, 'url') ?? null,
        notes: strArg(args, 'notes') ?? null,
        api_key: strArg(args, 'api_key') ?? null,
        proxy_address: strArg(args, 'proxy_address') ?? null,
        proxy_port: strArg(args, 'proxy_port') ?? null,
        proxy_username: strArg(args, 'proxy_username') ?? null,
        proxy_password: strArg(args, 'proxy_password') ?? null,
      })
      if (error) return `Failed to add vault item: ${error.message}`
      return `Added "${name}" to ${member.name}'s vault.`
    },
  },
]

// ─── Public interface ───────────────────────────────────────────────────────
export function getFunctionDeclarations(isAdmin: boolean): FunctionDeclaration[] {
  return TOOL_DEFS.filter((t) => isAdmin || MEMBER_SELF_SERVICE_TOOLS.has(t.name)).map((t) => ({
    name: t.name,
    description: t.description,
    parameters: { type: 'object', properties: t.properties, required: t.required },
  }))
}

export async function executeTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const def = TOOL_DEFS.find((t) => t.name === name)
  if (!def) return `Unknown tool: ${name}`
  if (!ctx.isAdmin && !MEMBER_SELF_SERVICE_TOOLS.has(name)) return 'Only the admin can perform that action.'

  try {
    return await def.execute(args, ctx)
  } catch (err) {
    console.error(`Tool "${name}" failed:`, err)
    return `Something went wrong running ${name}: ${err instanceof Error ? err.message : String(err)}`
  }
}

export const TOOL_COUNT = TOOL_DEFS.length
