import { createAdminClient } from '@/lib/supabase/admin'
import { setupDiscordServer } from '@/lib/discord-setup'
import { assignRole } from '@/lib/discord-api'
import { getMemberWorkload } from '@/lib/workload'
import { listSOPs } from '@/lib/sops'
import { notifyTaskAssigned, notifyTaskCompleted } from '@/lib/teamflow-db'
import {
  findTaskByPrefix,
  formatDueDate,
  formatShortDate,
  getDefaultBoard,
  isOverdue,
  logActivity,
} from '@/lib/teamflow-db'
import type { Platform, TaskPriority, TfMember, TfSop, TfTask, TfTeam } from '@/types/teamflow'

const supabase = createAdminClient()

// ─── Interaction payload shape (only the fields we use) ───────────────────
export interface DiscordOption {
  name: string
  type: number
  value?: string
}

export interface DiscordResolvedUser {
  id: string
  username: string
  global_name?: string | null
}

export interface DiscordResolvedRole {
  id: string
  name: string
}

export interface DiscordInteraction {
  data: {
    name: string
    options?: DiscordOption[]
    resolved?: {
      users?: Record<string, DiscordResolvedUser>
      roles?: Record<string, DiscordResolvedRole>
    }
  }
  guild_id?: string
  member?: { user: DiscordResolvedUser }
  user?: DiscordResolvedUser
}

function getOption(interaction: DiscordInteraction, name: string): string | undefined {
  return interaction.data.options?.find((o) => o.name === name)?.value
}

function getOptionUser(interaction: DiscordInteraction, name: string): DiscordResolvedUser | undefined {
  const id = getOption(interaction, name)
  if (!id) return undefined
  return interaction.data.resolved?.users?.[id]
}

function getOptionRole(interaction: DiscordInteraction, name: string): DiscordResolvedRole | undefined {
  const id = getOption(interaction, name)
  if (!id) return undefined
  return interaction.data.resolved?.roles?.[id]
}

function caller(interaction: DiscordInteraction): DiscordResolvedUser {
  const user = interaction.member?.user ?? interaction.user
  if (!user) throw new Error('Interaction has no member/user')
  return user
}

function displayName(user: DiscordResolvedUser): string {
  return user.global_name ?? user.username
}

// ─── Member lookup / auto-registration ─────────────────────────────────────

async function getMemberByDiscordId(discordId: string): Promise<TfMember | null> {
  const { data } = await supabase.from('tf_members').select('*').eq('discord_id', discordId).maybeSingle()
  return (data as TfMember) ?? null
}

async function ensureDiscordMemberExists(user: DiscordResolvedUser): Promise<TfMember> {
  const existing = await getMemberByDiscordId(user.id)
  if (existing) return existing

  const { data, error } = await supabase
    .from('tf_members')
    .insert({ discord_id: user.id, name: displayName(user) })
    .select('*')
    .single()

  if (error || !data) throw new Error(`Failed to auto-register member: ${error?.message}`)
  return data as TfMember
}

async function isAdminDiscord(user: DiscordResolvedUser): Promise<boolean> {
  const adminId = process.env.ADMIN_DISCORD_ID
  if (adminId && String(adminId) === user.id) return true

  const member = await getMemberByDiscordId(user.id)
  return member?.role === 'admin'
}

async function requireOwnTask(
  member: TfMember,
  prefix: string
): Promise<{ task: TfTask } | { error: string }> {
  const { task, ambiguous } = await findTaskByPrefix(supabase, prefix)
  if (ambiguous) return { error: 'That id prefix matches more than one task. Use more characters.' }
  if (!task) return { error: 'No task found with that ID.' }
  if (task.assignee_id !== member.id) {
    return { error: "🚫 That task is assigned to someone else. You can only complete your own tasks." }
  }
  return { task }
}

const PLATFORM_EMOJI: Record<string, string> = {
  twitter: '🐦',
  reddit: '📺',
  instagram: '📸',
  tiktok: '🎵',
  youtube: '▶️',
}

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

function teamEmoji(teamName: string): string {
  const lower = teamName.toLowerCase()
  for (const [platform, emoji] of Object.entries(PLATFORM_EMOJI)) {
    if (lower.includes(platform)) return emoji
  }
  return '👥'
}

// ─── Command handlers ───────────────────────────────────────────────────────

export async function handleHelp(): Promise<string> {
  return `**TeamFlow Bot commands**

/mytasks — your tasks, grouped by status
/done <id> — mark your task as complete
/start <id> — start a task (move to in progress)
/myworkload — your workload
/mydone — your completed tasks (last 7 days)
/teams — list all teams
/myteam — show your team
/sops — list all SOPs
/who <skill> — find available members with a skill
/status — board status summary
/overdue — list overdue tasks
/addtask <title> [assignee] [priority] [due_date] [platform] — create a task (admin)
/addmember <user> [team] — add a member (admin)
/addteam <name> — create a team (admin)
/assignrole <team> <role> — map a Discord role to a team (admin)
/setup — auto-create server structure (admin)
/help — show this message`
}

export async function handleMyTasks(interaction: DiscordInteraction): Promise<string> {
  const member = await getMemberByDiscordId(caller(interaction).id)
  if (!member) return "You're not registered yet — ask the admin to add you with /addmember."

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
  const taskLine = (t: TfTask) => `  • \`${t.id.slice(0, 8)}\` — "${t.title}" — due ${formatShortDate(t.due_date)} (${t.priority})`

  const lines = [`📋 Your Tasks (${activeCount} active):`]
  if (todo.length > 0) lines.push('', `📌 To Do (${todo.length}):`, ...todo.map(taskLine))
  if (inProgress.length > 0) lines.push('', `🔄 In Progress (${inProgress.length}):`, ...inProgress.map(taskLine))
  if (review.length > 0) lines.push('', `👀 Review (${review.length}):`, ...review.map(taskLine))
  if (activeCount === 0) lines.push('', '🎉 Nothing active right now!')
  if (doneThisWeek.length > 0) {
    lines.push('', `✅ Done this week (${doneThisWeek.length}):`, ...doneThisWeek.map((t) => `  • "${t.title}" — completed ${formatDueDate(t.completed_at)}`))
  }
  lines.push('', 'Send /done <id> to mark a task as complete.', 'Send /start <id> to start a task.')

  return lines.join('\n')
}

export async function handleMyWorkload(interaction: DiscordInteraction): Promise<string> {
  const member = await getMemberByDiscordId(caller(interaction).id)
  if (!member) return "You're not registered yet — ask the admin to add you with /addmember."

  const workload = await getMemberWorkload(member.id)
  const statusEmoji: Record<string, string> = { available: '🟢', moderate: '🟡', busy: '🟠', overloaded: '🔴' }

  return (
    `${statusEmoji[workload.status]} Your workload: ${workload.status}\n\n` +
    `Active tasks: ${workload.active_tasks}\n` +
    `Hours remaining: ${workload.estimated_hours_remaining}h / ${workload.max_daily_hours}h (${workload.utilization_pct}%)\n` +
    `Available capacity: ${workload.available_hours}h`
  )
}

export async function handleMyDone(interaction: DiscordInteraction): Promise<string> {
  const member = await getMemberByDiscordId(caller(interaction).id)
  if (!member) return "You're not registered yet — ask the admin to add you with /addmember."

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const { data: tasks } = await supabase.from('tf_tasks').select('*').eq('assignee_id', member.id).eq('status', 'done')
  const doneThisWeek = ((tasks as TfTask[]) ?? [])
    .filter((t) => t.completed_at && new Date(t.completed_at).getTime() >= weekAgo)
    .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime())

  if (doneThisWeek.length === 0) return '✅ Your Completed Tasks (7 days):\n\nNo tasks completed this week yet.'

  return [
    '✅ Your Completed Tasks (7 days):',
    '',
    ...doneThisWeek.map((t, i) => `${i + 1}. "${t.title}" — completed ${formatShortDate(t.completed_at)}`),
    '',
    `Great job! ${doneThisWeek.length} task${doneThisWeek.length === 1 ? '' : 's'} completed this week.`,
  ].join('\n')
}

export async function handleTeams(): Promise<string> {
  const { data: teams } = await supabase.from('tf_teams').select('*').order('name', { ascending: true })
  const allTeams = (teams as TfTeam[]) ?? []
  if (allTeams.length === 0) return 'No teams yet. Create one with /addteam <name>.'

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

    const lines = members.map((m) => `  • ${m.name} — ${activeCountFor(m.id)} active task${activeCountFor(m.id) === 1 ? '' : 's'}`)
    const header = `${teamEmoji(team.name)} ${team.name} (${members.length} member${members.length === 1 ? '' : 's'}):`
    return lines.length > 0 ? `${header}\n${lines.join('\n')}` : header
  })

  return `👥 Teams:\n\n${sections.join('\n\n')}\n\nSend /myteam to see your team.`
}

export async function handleMyTeam(interaction: DiscordInteraction): Promise<string> {
  const member = await getMemberByDiscordId(caller(interaction).id)
  if (!member) return "You're not registered yet — ask the admin to add you with /addmember."

  const { data: memberTeams } = await supabase
    .from('tf_member_teams')
    .select('team:tf_teams(*)')
    .eq('member_id', member.id)
    .limit(1)

  const team = ((memberTeams as unknown as { team: TfTeam | null }[]) ?? [])[0]?.team ?? null
  if (!team) return "You're not on a team yet. Ask the admin to add you with /addteam + /addmember."

  const { data: teammateRows } = await supabase.from('tf_member_teams').select('member:tf_members(*)').eq('team_id', team.id)
  const teammates = ((teammateRows as unknown as { member: TfMember | null }[]) ?? [])
    .map((r) => r.member)
    .filter((m): m is TfMember => !!m && m.id !== member.id)
    .sort((a, b) => a.name.localeCompare(b.name))

  const { data: tasks } = await supabase.from('tf_tasks').select('*')
  const allTasks = (tasks as TfTask[]) ?? []
  const activeCountFor = (memberId: string) => allTasks.filter((t) => t.assignee_id === memberId && t.status !== 'done').length

  const lines = [`👥 Your team: ${team.name}`]
  if (teammates.length > 0) {
    lines.push('', 'Teammates:', ...teammates.map((m) => `  • ${m.name} — ${activeCountFor(m.id)} active task${activeCountFor(m.id) === 1 ? '' : 's'}`))
  } else {
    lines.push('', "You're the only member on this team.")
  }

  const myActive = allTasks.filter((t) => t.assignee_id === member.id && t.status !== 'done')
  const myOverdue = myActive.filter((t) => isOverdue(t))
  lines.push('', `Your tasks: ${myActive.length} active, ${myOverdue.length} overdue`)

  return lines.join('\n')
}

export async function handleSops(): Promise<string> {
  const sops = await listSOPs()
  if (sops.length === 0) return 'No SOPs yet. Create one in the TeamFlow app.'

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

  return `📋 Standard Operating Procedures:\n\n${sections.join('\n\n')}`
}

export async function handleWho(interaction: DiscordInteraction): Promise<string> {
  const skillQuery = getOption(interaction, 'skill')
  if (!skillQuery) return 'Usage: /who <skill>'

  const { data: skills } = await supabase.from('tf_skills').select('*').ilike('name', `%${skillQuery}%`)
  if (!skills || skills.length === 0) return `No skills found matching "${skillQuery}".`
  const skillIds = skills.map((s) => s.id)

  const { data: memberSkills } = await supabase
    .from('tf_member_skills')
    .select('proficiency_level, member:tf_members(*)')
    .in('skill_id', skillIds)

  const rows = (memberSkills as unknown as { proficiency_level: number; member: TfMember | null }[]) ?? []
  const activeRows = rows.filter((r) => r.member && r.member.status === 'active')
  if (activeRows.length === 0) return `No active members found with skill matching "${skillQuery}".`

  const { data: tasks } = await supabase.from('tf_tasks').select('*').neq('status', 'done')
  const activeTasks = (tasks as TfTask[]) ?? []

  const results = activeRows.map((r) => {
    const member = r.member as TfMember
    const memberTasks = activeTasks.filter((t) => t.assignee_id === member.id)
    const bookedHours = memberTasks.reduce((sum, t) => sum + (t.estimated_hours ?? 0), 0)
    return {
      member,
      proficiency: r.proficiency_level,
      bookedHours,
      capacity: member.max_daily_hours - bookedHours,
      available: bookedHours < member.max_daily_hours,
    }
  })
  results.sort((a, b) => b.capacity - a.capacity)

  const lines = results.map(
    (r, i) => `${i + 1}. ${r.member.name} — ${r.bookedHours}/${r.member.max_daily_hours}h booked today (${r.available ? 'AVAILABLE' : 'BUSY'})\n   Proficiency: ${r.proficiency}/5`
  )

  return `🔍 Members with '${skillQuery}' skill:\n\n${lines.join('\n')}\n\n💡 Recommendation: ${results[0].member.name} has the most capacity.`
}

export async function handleStatus(): Promise<string> {
  const board = await getDefaultBoard(supabase)
  const { data: tasks } = await supabase.from('tf_tasks').select('*, assignee:tf_members(name)').eq('board_id', board.id)
  const allTasks = tasks ?? []

  const counts: Record<string, number> = { todo: 0, in_progress: 0, review: 0, done: 0, blocked: 0 }
  for (const t of allTasks) counts[t.status] = (counts[t.status] ?? 0) + 1

  const overdue = allTasks.filter((t) => isOverdue(t))
  let msg = `📋 Board: ${board.name}\n\n📌 To Do: ${counts.todo}\n🔄 In Progress: ${counts.in_progress}\n👀 Review: ${counts.review}\n✅ Done: ${counts.done}\n🚫 Blocked: ${counts.blocked}`

  if (overdue.length > 0) {
    msg += `\n\n⚠️ Overdue (${overdue.length}):\n`
    msg += overdue.map((t) => `  • "${t.title}" — assigned to ${t.assignee?.name ?? 'unassigned'}, due ${formatDueDate(t.due_date)}`).join('\n')
  }

  return msg
}

export async function handleOverdue(): Promise<string> {
  const { data: tasks } = await supabase
    .from('tf_tasks')
    .select('*, assignee:tf_members(name, discord_id)')
    .neq('status', 'done')
    .not('due_date', 'is', null)

  const overdue = (tasks ?? []).filter((t) => isOverdue(t))
  if (overdue.length === 0) return '🎉 No overdue tasks!'

  const lines = overdue.map((t, i) => {
    const assignee = t.assignee?.name ?? 'unassigned'
    return `${i + 1}. "${t.title}"\n   Assigned: ${assignee}\n   Due: ${formatDueDate(t.due_date)}\n   Priority: ${t.priority.toUpperCase()}`
  })

  return `⚠️ Overdue Tasks (${overdue.length}):\n\n${lines.join('\n\n')}`
}

export async function handleDone(interaction: DiscordInteraction): Promise<string> {
  const prefix = getOption(interaction, 'id')
  if (!prefix) return 'Usage: /done <id>'

  const member = await getMemberByDiscordId(caller(interaction).id)
  if (!member) return "You're not registered yet — ask the admin to add you with /addmember."

  const result = await requireOwnTask(member, prefix)
  if ('error' in result) return result.error
  const { task } = result

  const { error } = await supabase.from('tf_tasks').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', task.id)
  if (error) return `Failed to complete task: ${error.message}`

  await logActivity(supabase, { taskId: task.id, memberId: member.id, action: 'completed', oldValue: task.status, newValue: 'done' })
  await notifyTaskCompleted(task, member.name)

  return `✅ Marked "${task.title}" as done.`
}

export async function handleStart(interaction: DiscordInteraction): Promise<string> {
  const prefix = getOption(interaction, 'id')
  if (!prefix) return 'Usage: /start <id>'

  const member = await getMemberByDiscordId(caller(interaction).id)
  if (!member) return "You're not registered yet — ask the admin to add you with /addmember."

  const result = await requireOwnTask(member, prefix)
  if ('error' in result) return result.error
  const { task } = result

  const { error } = await supabase.from('tf_tasks').update({ status: 'in_progress' }).eq('id', task.id)
  if (error) return `Failed to start task: ${error.message}`

  await logActivity(supabase, { taskId: task.id, memberId: member.id, action: 'status_changed', oldValue: task.status, newValue: 'in_progress' })

  return `✅ Started: "${task.title}" — moved to In Progress`
}

export async function handleAddTask(interaction: DiscordInteraction): Promise<string> {
  const title = getOption(interaction, 'title')
  if (!title) return 'Usage: /addtask <title>'

  const priority = (getOption(interaction, 'priority') as TaskPriority | undefined) ?? 'medium'
  const platform = (getOption(interaction, 'platform') as Platform | undefined) ?? null
  const dueDateInput = getOption(interaction, 'due_date')

  let dueDate: string | null = null
  if (dueDateInput) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDateInput) || isNaN(new Date(dueDateInput).getTime())) {
      return "That doesn't look like a valid date. Use YYYY-MM-DD."
    }
    dueDate = new Date(dueDateInput).toISOString()
  }

  const assigneeUser = getOptionUser(interaction, 'assignee')
  const assignee = assigneeUser ? await ensureDiscordMemberExists(assigneeUser) : null

  const board = await getDefaultBoard(supabase)
  const creator = await getMemberByDiscordId(caller(interaction).id)

  const { data: task, error } = await supabase
    .from('tf_tasks')
    .insert({
      title,
      board_id: board.id,
      assignee_id: assignee?.id ?? null,
      created_by: creator?.id ?? null,
      priority,
      due_date: dueDate,
      platform,
      status: 'todo',
    })
    .select('*')
    .single()

  if (error || !task) return `Failed to create task: ${error?.message ?? 'unknown error'}`

  await logActivity(supabase, {
    taskId: (task as TfTask).id,
    memberId: creator?.id ?? null,
    action: 'created',
    newValue: title,
    metadata: { assignee: assignee?.name ?? null, priority, due_date: dueDate },
  })

  if (assignee) await notifyTaskAssigned(task as TfTask, assignee.name)

  const dueDisplay = dueDate ? dueDate.slice(0, 10) : 'none'
  return `✅ Task created: "${title}" assigned to ${assignee?.name ?? 'unassigned'}, priority: ${priority}, due: ${dueDisplay}`
}

export async function handleAddMember(interaction: DiscordInteraction): Promise<string> {
  const targetUser = getOptionUser(interaction, 'user')
  if (!targetUser) return 'Usage: /addmember <user> [team]'

  const teamName = getOption(interaction, 'team')

  const existing = await getMemberByDiscordId(targetUser.id)
  const member = existing ?? (await ensureDiscordMemberExists(targetUser))

  let message = existing
    ? `${member.name} is already registered.`
    : `✅ Added ${member.name} to the team.`

  if (!teamName) return message

  const { data: team } = await supabase.from('tf_teams').select('*').ilike('name', teamName).maybeSingle()
  if (!team) return `${message} ⚠️ Team "${teamName}" not found — create it first with /addteam.`

  const { error: addError } = await supabase
    .from('tf_member_teams')
    .insert({ member_id: member.id, team_id: (team as TfTeam).id })

  if (addError && addError.code !== '23505') return `${message} Failed to add to team: ${addError.message}`

  message += ` Added to the "${(team as TfTeam).name}" team.`

  const roleId = (team as TfTeam).discord_role_id
  if (roleId && interaction.guild_id) {
    try {
      await assignRole(interaction.guild_id, targetUser.id, roleId)
      message += ` Assigned the matching Discord role.`
    } catch (err) {
      console.error('Failed to assign Discord role:', err)
    }
  }

  return message
}

export async function handleAddTeam(interaction: DiscordInteraction): Promise<string> {
  const name = getOption(interaction, 'name')
  if (!name) return 'Usage: /addteam <name>'

  const { error } = await supabase.from('tf_teams').insert({ name })
  if (error) return `Failed to create team: ${error.message}`

  return `✅ Created team "${name}". Add members with /addmember.`
}

export async function handleAssignRole(interaction: DiscordInteraction): Promise<string> {
  const teamName = getOption(interaction, 'team')
  const role = getOptionRole(interaction, 'role')
  if (!teamName || !role) return 'Usage: /assignrole <team> <role>'

  const { data: team } = await supabase.from('tf_teams').select('*').ilike('name', teamName).maybeSingle()
  if (!team) return `No team found named "${teamName}". Create it first with /addteam.`

  const { error } = await supabase.from('tf_teams').update({ discord_role_id: role.id }).eq('id', (team as TfTeam).id)
  if (error) return `Failed to map role: ${error.message}`

  // Retroactively assign the role to current team members who have linked their Discord account.
  let assigned = 0
  if (interaction.guild_id) {
    const { data: memberRows } = await supabase
      .from('tf_member_teams')
      .select('member:tf_members(discord_id)')
      .eq('team_id', (team as TfTeam).id)

    const discordIds = ((memberRows as unknown as { member: { discord_id: string | null } | null }[]) ?? [])
      .map((r) => r.member?.discord_id)
      .filter((id): id is string => !!id)

    for (const discordId of discordIds) {
      try {
        await assignRole(interaction.guild_id, discordId, role.id)
        assigned += 1
      } catch (err) {
        console.error('Failed to assign role to existing team member:', err)
      }
    }
  }

  return `✅ Team "${(team as TfTeam).name}" is now mapped to the @${role.name} role${assigned > 0 ? ` (assigned to ${assigned} existing member${assigned === 1 ? '' : 's'})` : ''}.`
}

export async function handleSetupCommand(interaction: DiscordInteraction): Promise<string> {
  if (!interaction.guild_id) return 'This command must be run in a server, not a DM.'

  const result = await setupDiscordServer(interaction.guild_id)

  return [
    '✅ Server setup complete.',
    '',
    `Roles created: ${result.rolesCreated.join(', ') || 'none'}`,
    `Roles already existing: ${result.rolesExisting.join(', ') || 'none'}`,
    `Categories created: ${result.categoriesCreated.join(', ') || 'none'}`,
    `Channels created: ${result.channelsCreated.join(', ') || 'none'}`,
    `Channels already existing: ${result.channelsExisting.join(', ') || 'none'}`,
  ].join('\n')
}

// ─── Dispatcher ─────────────────────────────────────────────────────────────

const ADMIN_ONLY_COMMANDS = new Set(['addtask', 'addmember', 'addteam', 'assignrole', 'setup'])

export async function dispatchCommand(interaction: DiscordInteraction): Promise<string> {
  const name = interaction.data.name
  const user = caller(interaction)

  if (ADMIN_ONLY_COMMANDS.has(name) && !(await isAdminDiscord(user))) {
    return '🚫 Only an admin can do that.'
  }

  switch (name) {
    case 'help':
      return handleHelp()
    case 'mytasks':
      return handleMyTasks(interaction)
    case 'myworkload':
      return handleMyWorkload(interaction)
    case 'mydone':
      return handleMyDone(interaction)
    case 'teams':
      return handleTeams()
    case 'myteam':
      return handleMyTeam(interaction)
    case 'sops':
      return handleSops()
    case 'who':
      return handleWho(interaction)
    case 'status':
      return handleStatus()
    case 'overdue':
      return handleOverdue()
    case 'done':
      return handleDone(interaction)
    case 'start':
      return handleStart(interaction)
    case 'addtask':
      return handleAddTask(interaction)
    case 'addmember':
      return handleAddMember(interaction)
    case 'addteam':
      return handleAddTeam(interaction)
    case 'assignrole':
      return handleAssignRole(interaction)
    case 'setup':
      return handleSetupCommand(interaction)
    default:
      return `Unknown command: /${name}`
  }
}
