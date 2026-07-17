import { createAdminClient } from '@/lib/supabase/admin'
import type { Platform, SopCategory, TfMember, TfSop, TfTask } from '@/types/teamflow'
import { findTaskByPrefix, isOverdue, logActivity } from '@/lib/teamflow-db'
import { createSOP, generateSOPDiff, updateSOP, syncSOPToTelegram } from '@/lib/sops'
import { sendToTopic } from '@/lib/telegram-topics'

const supabase = createAdminClient()

const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const SYSTEM_PROMPT = `You are TeamFlow Bot, a team management assistant. You help the admin manage tasks, team members, and team organization, and you help any team member manage their own tasks.
You can answer questions about team workload, skill availability, and task status.
When the user asks to create a task, tell them to use /addtask <title> to start the guided flow.
When the user asks who is available with a skill, use the provided team data to recommend the best person.
You have admin-only tools to: reassign tasks, mark any task complete, create teams, add members to teams, create new members, and grant topic access to teams.
Use these tools when the user clearly asks for that action. These tools only work for the admin; if a non-admin asks, explain that only the admin can make changes.
You also have self-service tools available to ANY team member: list_my_tasks, complete_my_task, start_my_task. These only ever act on tasks assigned to the current sender.
When a user asks about "my tasks" or "what am I working on", use the list_my_tasks tool.
When a user asks to complete or finish a task, use complete_my_task with the task title.
When a user asks to start a task, use start_my_task.
Only allow members to complete/start their OWN tasks.
When a member is added to a team, also grant that team access to the relevant platform topic if the team name contains a platform keyword (instagram→instagram topic, twitter→twitter topic, tiktok→tiktok topic, reddit→reddit topic, youtube→youtube topic).
Be concise and direct. Use emoji sparingly.`

interface TaskWithAssignee extends TfTask {
  assignee: { name: string; telegram_username: string | null } | null
}

interface MemberSkillJoin {
  member_id: string
  proficiency_level: number
  skill: { name: string } | null
}

// ─── Gemini function declarations ─────────────────────────────────────────────
const functionDeclarations = [
  {
    name: 'reassign_task',
    description: 'Reassign an existing task to a different team member.',
    parameters: {
      type: 'object',
      properties: {
        task_query: { type: 'string', description: 'Task title (or part of it) or id prefix to find the task' },
        assignee_name: { type: 'string', description: 'Name of the member to assign the task to' },
      },
      required: ['task_query', 'assignee_name'],
    },
  },
  {
    name: 'complete_task',
    description: 'Mark an existing task as done.',
    parameters: {
      type: 'object',
      properties: {
        task_query: { type: 'string', description: 'Task title (or part of it) or id prefix to find the task' },
      },
      required: ['task_query'],
    },
  },
  {
    name: 'create_team',
    description: 'Create a new team (e.g. "IG VAs", "Twitter VAs"). Teams are used to group members and control topic access.',
    parameters: {
      type: 'object',
      properties: {
        team_name: { type: 'string', description: 'Name of the team to create' },
      },
      required: ['team_name'],
    },
  },
  {
    name: 'add_member_to_team',
    description: 'Add an existing team member to a team. If the team name contains a platform keyword (instagram, twitter, tiktok, reddit, youtube), also grants that team access to the corresponding platform topic.',
    parameters: {
      type: 'object',
      properties: {
        member_name: { type: 'string', description: 'Name of the member to add to the team' },
        team_name: { type: 'string', description: 'Name of the team' },
      },
      required: ['member_name', 'team_name'],
    },
  },
  {
    name: 'create_member',
    description: 'Create a new team member. Use this when the admin asks to add someone new who is not yet in the system.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Full name of the new member' },
        telegram_username: { type: 'string', description: 'Telegram username without the @ symbol' },
        team_name: { type: 'string', description: 'Optional: team to add them to after creation' },
      },
      required: ['name'],
    },
  },
  {
    name: 'grant_topic_access',
    description: 'Grant a team access to a specific topic (e.g. give "IG VAs" access to the "instagram" topic). Topic names: general, manager_chat, notifications, twitter, reddit, instagram, tiktok, youtube, testing, sops.',
    parameters: {
      type: 'object',
      properties: {
        topic_name: { type: 'string', description: 'Name of the topic (general, twitter, instagram, tiktok, reddit, youtube, etc.)' },
        team_name: { type: 'string', description: 'Name of the team to grant access to' },
      },
      required: ['topic_name', 'team_name'],
    },
  },
  {
    name: 'create_sop_from_file',
    description: 'Create a new SOP from file content that was just uploaded. Use this when the admin sends a file and says to create an SOP from it, or move it to SOPs.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title for the SOP' },
        content: { type: 'string', description: 'The full text content of the SOP (extracted from the file)' },
        category: { type: 'string', description: 'Category: general, twitter, reddit, instagram, tiktok, youtube, onboarding, va_guide' },
        platform: { type: 'string', description: 'Platform if applicable: twitter, reddit, instagram, tiktok, youtube, or null' },
        summary: { type: 'string', description: 'A brief summary of what changed vs the previous version (if updating an existing SOP)' },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'distribute_to_team',
    description: 'Distribute a file or message to a specific team. The bot will post a message in the team platform topic (e.g. if team is "IG VAs", posts in the Instagram topic).',
    parameters: {
      type: 'object',
      properties: {
        team_name: { type: 'string', description: 'Name of the team to distribute to' },
        message: { type: 'string', description: 'The message to post in the team topic' },
        file_summary: { type: 'string', description: 'Summary of the file being distributed (if applicable)' },
      },
      required: ['team_name', 'message'],
    },
  },
  {
    name: 'announce_sop_change',
    description: 'Announce changes to an SOP by comparing the new version with the previous one. Posts an announcement in the relevant platform topic and the SOPs topic.',
    parameters: {
      type: 'object',
      properties: {
        sop_title: { type: 'string', description: 'Title of the SOP that was updated' },
        changes_summary: { type: 'string', description: 'Summary of what changed (new sections, removed sections, modified steps)' },
        platform: { type: 'string', description: 'Platform topic to announce in (twitter, instagram, etc.) or "general" for the general topic' },
      },
      required: ['sop_title', 'changes_summary'],
    },
  },
  {
    name: 'summarize_file',
    description: 'Summarize the content of a file. Returns a concise summary of the document.',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'A concise summary of the file content' },
        key_points: { type: 'string', description: 'Key points from the file (comma-separated or newlines)' },
      },
      required: ['summary'],
    },
  },
  {
    name: 'list_my_tasks',
    description: 'List the current sender\'s own assigned tasks. Use when anyone (admin or member) asks about "my tasks" or what they are working on.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'complete_my_task',
    description: "Mark a task assigned to the current sender as done, by title or id. Only succeeds if the task is assigned to the sender.",
    parameters: {
      type: 'object',
      properties: {
        task_query: { type: 'string', description: 'Task title (or part of it) or id prefix to find the task' },
      },
      required: ['task_query'],
    },
  },
  {
    name: 'start_my_task',
    description: "Move a task assigned to the current sender to in_progress, by title or id. Only succeeds if the task is assigned to the sender.",
    parameters: {
      type: 'object',
      properties: {
        task_query: { type: 'string', description: 'Task title (or part of it) or id prefix to find the task' },
      },
      required: ['task_query'],
    },
  },
]

const MEMBER_SELF_SERVICE_TOOLS = ['summarize_file', 'list_my_tasks', 'complete_my_task', 'start_my_task']

// ─── Context builder ──────────────────────────────────────────────────────────
async function buildTeamContext(senderId?: string | null) {
  const [{ data: members }, { data: memberSkills }, { data: tasks }, { data: teams }, { data: memberTeams }] = await Promise.all([
    supabase.from('tf_members').select('*'),
    supabase.from('tf_member_skills').select('member_id, proficiency_level, skill:tf_skills(name)'),
    supabase.from('tf_tasks').select('*, assignee:tf_members(name, telegram_username)'),
    supabase.from('tf_teams').select('*'),
    supabase.from('tf_member_teams').select('member_id, team_id'),
  ])

  const allMembers = (members as TfMember[]) ?? []
  const allTasks = (tasks as TaskWithAssignee[]) ?? []
  const allMemberSkills = (memberSkills as unknown as MemberSkillJoin[]) ?? []
  const allTeams = (teams as { id: string; name: string }[]) ?? []
  const allMemberTeams = (memberTeams as { member_id: string; team_id: string }[]) ?? []

  const membersWithData = allMembers.map((m) => {
    const skills = allMemberSkills
      .filter((ms) => ms.member_id === m.id)
      .map((ms) => `${ms.skill?.name} (${ms.proficiency_level}/5)`)
    const activeTasks = allTasks.filter((t) => t.assignee_id === m.id && t.status !== 'done')
    const bookedHours = activeTasks.reduce((sum, t) => sum + (t.estimated_hours ?? 0), 0)
    const memberTeamIds = allMemberTeams.filter((mt) => mt.member_id === m.id).map((mt) => mt.team_id)
    const memberTeamNames = allTeams.filter((t) => memberTeamIds.includes(t.id)).map((t) => t.name)
    return {
      name: m.name,
      telegram_username: m.telegram_username,
      role: m.role,
      status: m.status,
      max_daily_hours: m.max_daily_hours,
      skills,
      teams: memberTeamNames,
      active_task_count: activeTasks.length,
      hours_booked_today: bookedHours,
    }
  })

  const tasksSummary = allTasks.map((t) => ({
    id: t.id.slice(0, 8),
    title: t.title,
    status: t.status,
    priority: t.priority,
    assignee: t.assignee?.name ?? null,
    due_date: t.due_date,
    overdue: isOverdue(t),
  }))

  const teamsList = allTeams.map((t) => {
    const teamMemberIds = allMemberTeams.filter((mt) => mt.team_id === t.id).map((mt) => mt.member_id)
    const teamMemberNames = allMembers.filter((m) => teamMemberIds.includes(m.id)).map((m) => m.name)
    return { name: t.name, members: teamMemberNames }
  })

  const yourTasks = senderId
    ? allTasks
        .filter((t) => t.assignee_id === senderId)
        .map((t) => ({
          id: t.id.slice(0, 8),
          title: t.title,
          status: t.status,
          priority: t.priority,
          due_date: t.due_date,
          overdue: isOverdue(t),
        }))
    : []

  return { members: membersWithData, tasks: tasksSummary, teams: teamsList, your_tasks: yourTasks }
}

// ─── Task lookup ──────────────────────────────────────────────────────────────
async function findTaskByQuery(query: string): Promise<TfTask | null> {
  const byPrefix = await findTaskByPrefix(supabase, query)
  if (byPrefix.task) return byPrefix.task

  const { data } = await supabase.from('tf_tasks').select('*').ilike('title', `%${query}%`).limit(1).maybeSingle()
  return (data as TfTask) ?? null
}

// ─── Tool execution ───────────────────────────────────────────────────────────
interface ToolArgs {
  task_query: string
  assignee_name?: string
  team_name?: string
  member_name?: string
  name?: string
  telegram_username?: string
  topic_name?: string
  title?: string
  content?: string
  category?: string
  platform?: string
  summary?: string
  message?: string
  file_summary?: string
  sop_title?: string
  changes_summary?: string
  key_points?: string
}

async function findSOPByQuery(query: string): Promise<TfSop | null> {
  const { data } = await supabase
    .from('tf_sops')
    .select('*')
    .eq('status', 'active')
    .ilike('title', `%${query}%`)
    .limit(1)
    .maybeSingle()
  return (data as TfSop) ?? null
}

async function postSopChangeAnnouncement(sopTitle: string, changesBody: string, platform: string): Promise<void> {
  const message = `📢 SOP Updated: "${sopTitle}"\n\n${changesBody}\n\nFull SOP: 📋 SOPs topic`
  const targetTopic = platform && platform !== 'general' ? platform : 'general'
  await sendToTopic(targetTopic, message)
  if (targetTopic !== 'sops') await sendToTopic('sops', message)
}

async function executeTool(
  name: string,
  args: ToolArgs,
  opts: { isAdmin: boolean; senderId: string | null }
): Promise<string> {
  if (!opts.isAdmin && !MEMBER_SELF_SERVICE_TOOLS.includes(name)) {
    return 'Only the admin can perform that action.'
  }

  if (name === 'reassign_task') {
    const task = await findTaskByQuery(args.task_query)
    if (!task) return `No task found matching "${args.task_query}".`

    const { data: newAssignee } = await supabase
      .from('tf_members')
      .select('*')
      .ilike('name', `%${args.assignee_name}%`)
      .maybeSingle()
    if (!newAssignee) return `No member found matching "${args.assignee_name}".`

    const { error } = await supabase.from('tf_tasks').update({ assignee_id: newAssignee.id }).eq('id', task.id)
    if (error) return `Failed to reassign: ${error.message}`

    await logActivity(supabase, {
      taskId: task.id,
      memberId: opts.senderId,
      action: 'assigned',
      newValue: newAssignee.name,
    })

    if (newAssignee.telegram_id) {
      try {
        const { bot } = await import('@/lib/bot')
        await bot.telegram.sendMessage(newAssignee.telegram_id, `📌 You've been assigned: "${task.title}"`)
      } catch (err) {
        console.error('Failed to notify new assignee:', err)
      }
    }

    return `Reassigned "${task.title}" to ${newAssignee.name}.`
  }

  if (name === 'complete_task') {
    const task = await findTaskByQuery(args.task_query)
    if (!task) return `No task found matching "${args.task_query}".`

    const { error } = await supabase
      .from('tf_tasks')
      .update({ status: 'done', completed_at: new Date().toISOString() })
      .eq('id', task.id)
    if (error) return `Failed to complete: ${error.message}`

    await logActivity(supabase, {
      taskId: task.id,
      memberId: opts.senderId,
      action: 'completed',
      oldValue: task.status,
      newValue: 'done',
    })

    return `Marked "${task.title}" as done.`
  }

  if (name === 'create_team') {
    const teamName = args.team_name!
    const { error } = await supabase.from('tf_teams').insert({ name: teamName })
    if (error) {
      if (error.code === '23505') return `Team "${teamName}" already exists.`
      return `Failed to create team: ${error.message}`
    }
    return `Created team "${teamName}". You can now add members with the add_member_to_team tool.`
  }

  if (name === 'add_member_to_team') {
    const memberName = args.member_name!
    const teamName = args.team_name!

    const { data: member } = await supabase
      .from('tf_members')
      .select('*')
      .ilike('name', `%${memberName}%`)
      .maybeSingle()
    if (!member) return `No member found matching "${memberName}". Create them first with the create_member tool.`

    const { data: team } = await supabase
      .from('tf_teams')
      .select('*')
      .ilike('name', `%${teamName}%`)
      .maybeSingle()
    if (!team) return `No team found matching "${teamName}". Create it first with the create_team tool.`

    const { error: addError } = await supabase
      .from('tf_member_teams')
      .insert({ member_id: member.id, team_id: team.id })
    if (addError) {
      if (addError.code === '23505') return `${member.name} is already on the "${team.name}" team.`
      return `Failed to add member to team: ${addError.message}`
    }

    // Auto-grant platform topic access if team name contains a platform keyword
    const platformMap: Record<string, string> = {
      instagram: 'instagram',
      ig: 'instagram',
      twitter: 'twitter',
      x: 'twitter',
      tiktok: 'tiktok',
      reddit: 'reddit',
      youtube: 'youtube',
      yt: 'youtube',
    }
    const teamNameLower = team.name.toLowerCase()
    for (const [keyword, topicName] of Object.entries(platformMap)) {
      if (teamNameLower.includes(keyword)) {
        await supabase
          .from('tf_topic_team_access')
          .upsert({ topic_name: topicName, team_id: team.id }, { onConflict: 'topic_name,team_id' })
        return `Added ${member.name} to the "${team.name}" team and granted the team access to the ${topicName} topic.`
      }
    }

    return `Added ${member.name} to the "${team.name}" team.`
  }

  if (name === 'create_member') {
    const newName = args.name!
    const username = args.telegram_username?.replace(/^@/, '')

    const { data: existing } = await supabase
      .from('tf_members')
      .select('*')
      .ilike('name', newName)
      .maybeSingle()
    if (existing) return `${newName} already exists in the system.`

    const { data: newMember, error } = await supabase
      .from('tf_members')
      .insert({ name: newName, telegram_username: username, role: 'worker', status: 'active' })
      .select('*')
      .single()
    if (error || !newMember) return `Failed to create member: ${error?.message ?? 'unknown error'}`

    // If team_name provided, add to team
    if (args.team_name) {
      const { data: team } = await supabase
        .from('tf_teams')
        .select('*')
        .ilike('name', `%${args.team_name}%`)
        .maybeSingle()
      if (team) {
        await supabase.from('tf_member_teams').insert({ member_id: newMember.id, team_id: team.id })

        // Auto-grant platform topic access
        const platformMap: Record<string, string> = {
          instagram: 'instagram', ig: 'instagram', twitter: 'twitter', x: 'twitter',
          tiktok: 'tiktok', reddit: 'reddit', youtube: 'youtube', yt: 'youtube',
        }
        const teamNameLower = team.name.toLowerCase()
        for (const [keyword, topicName] of Object.entries(platformMap)) {
          if (teamNameLower.includes(keyword)) {
            await supabase
              .from('tf_topic_team_access')
              .upsert({ topic_name: topicName, team_id: team.id }, { onConflict: 'topic_name,team_id' })
          }
        }
        return `Created member ${newName} and added them to the "${team.name}" team.`
      }
    }

    return `Created member ${newName}.`
  }

  if (name === 'grant_topic_access') {
    const topicName = args.topic_name!
    const teamName = args.team_name!

    const { data: team } = await supabase
      .from('tf_teams')
      .select('*')
      .ilike('name', `%${teamName}%`)
      .maybeSingle()
    if (!team) return `No team found matching "${teamName}".`

    const { error } = await supabase
      .from('tf_topic_team_access')
      .upsert({ topic_name: topicName, team_id: team.id }, { onConflict: 'topic_name,team_id' })
    if (error) return `Failed to grant access: ${error.message}`

    return `Granted team "${team.name}" access to the ${topicName} topic.`
  }

  if (name === 'create_sop_from_file') {
    const title = args.title!
    const content = args.content!
    const category = (args.category as SopCategory) || 'general'
    const platform = (args.platform as Platform) || null

    const existing = await findSOPByQuery(title)

    if (existing) {
      const oldContent = existing.content
      const oldVersion = existing.version

      const updated = await updateSOP(existing.id, {
        title,
        content,
        category,
        platform,
        changeNote: args.summary,
        editedBy: opts.senderId,
      })

      await syncSOPToTelegram(updated.id)

      const diff = await generateSOPDiff(oldContent, content)
      const announcePlatform = updated.platform ?? 'general'
      await postSopChangeAnnouncement(updated.title, `Changes from v${oldVersion} → v${updated.version}:\n${diff}`, announcePlatform)

      return `✅ Updated SOP "${updated.title}" (v${oldVersion} → v${updated.version}) from your file. Changes announced in the ${announcePlatform} topic and synced to 📋 SOPs.`
    }

    const created = await createSOP({ title, content, category, platform, createdBy: opts.senderId })
    await syncSOPToTelegram(created.id)

    return `✅ Created SOP "${created.title}" from your file. It's been posted in the 📋 SOPs topic.`
  }

  if (name === 'distribute_to_team') {
    const teamName = args.team_name!
    const message = args.message!

    const { data: team } = await supabase.from('tf_teams').select('*').ilike('name', `%${teamName}%`).maybeSingle()
    if (!team) return `No team found matching "${teamName}".`

    const { data: access } = await supabase
      .from('tf_topic_team_access')
      .select('topic_name')
      .eq('team_id', team.id)

    const topicNames = ((access as { topic_name: string }[]) ?? []).map((a) => a.topic_name)
    const targetTopic = topicNames.find((t) => t !== 'general' && t !== 'notifications') ?? topicNames[0] ?? 'general'

    const fullMessage = args.file_summary ? `${message}\n\n📎 ${args.file_summary}` : message
    const messageId = await sendToTopic(targetTopic, fullMessage)
    if (!messageId) return `Failed to post to the ${targetTopic} topic. Check the topic is configured.`

    return `✅ Distributed to "${team.name}" in the ${targetTopic} topic.`
  }

  if (name === 'announce_sop_change') {
    const sopTitle = args.sop_title!
    const changesSummary = args.changes_summary!
    const platform = args.platform || 'general'

    await postSopChangeAnnouncement(sopTitle, changesSummary, platform)

    return `✅ Announced changes to "${sopTitle}" in the ${platform} topic and the 📋 SOPs topic.`
  }

  if (name === 'summarize_file') {
    const summary = args.summary!
    const keyPoints = args.key_points ? `\n\nKey points: ${args.key_points}` : ''
    return `${summary}${keyPoints}`
  }

  if (name === 'list_my_tasks') {
    if (!opts.senderId) return "You're not registered yet — ask the admin to add you."

    const { data: tasks } = await supabase.from('tf_tasks').select('*').eq('assignee_id', opts.senderId)
    const active = ((tasks as TfTask[]) ?? []).filter((t) => t.status !== 'done')
    if (active.length === 0) return 'You have no active tasks right now.'

    const lines = active.map(
      (t) => `"${t.title}" (${t.status}, ${t.priority} priority${t.due_date ? `, due ${new Date(t.due_date).toLocaleDateString()}` : ''})`
    )
    return `Your tasks:\n${lines.join('\n')}`
  }

  if (name === 'complete_my_task') {
    if (!opts.senderId) return "You're not registered yet — ask the admin to add you."

    const task = await findTaskByQuery(args.task_query)
    if (!task) return `No task found matching "${args.task_query}".`
    if (task.assignee_id !== opts.senderId) return 'That task is assigned to someone else — you can only complete your own tasks.'

    const { error } = await supabase
      .from('tf_tasks')
      .update({ status: 'done', completed_at: new Date().toISOString() })
      .eq('id', task.id)
    if (error) return `Failed to complete: ${error.message}`

    await logActivity(supabase, {
      taskId: task.id,
      memberId: opts.senderId,
      action: 'completed',
      oldValue: task.status,
      newValue: 'done',
    })

    return `Marked "${task.title}" as done.`
  }

  if (name === 'start_my_task') {
    if (!opts.senderId) return "You're not registered yet — ask the admin to add you."

    const task = await findTaskByQuery(args.task_query)
    if (!task) return `No task found matching "${args.task_query}".`
    if (task.assignee_id !== opts.senderId) return 'That task is assigned to someone else — you can only start your own tasks.'

    const { error } = await supabase.from('tf_tasks').update({ status: 'in_progress' }).eq('id', task.id)
    if (error) return `Failed to start: ${error.message}`

    await logActivity(supabase, {
      taskId: task.id,
      memberId: opts.senderId,
      action: 'status_changed',
      oldValue: task.status,
      newValue: 'in_progress',
    })

    return `Started "${task.title}" — moved to In Progress.`
  }

  return `Unknown tool: ${name}`
}

// ─── Gemini API helpers ───────────────────────────────────────────────────────

interface GeminiPart {
  text?: string
  functionCall?: { name: string; args: Record<string, unknown> }
  functionResponse?: { name: string; response: Record<string, unknown> }
  inlineData?: { mimeType: string; data: string }
}

interface GeminiCandidate {
  content: { parts: GeminiPart[] }
}

interface GeminiResponse {
  candidates?: GeminiCandidate[]
}

async function callGemini(
  systemPrompt: string,
  userText: string,
  parts: GeminiPart[] = []
): Promise<{ text: string; functionCalls: { name: string; args: Record<string, unknown> }[] }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return {
      text: "I can't process natural language right now (GEMINI_API_KEY isn't configured). Try /help for commands.",
      functionCalls: [],
    }
  }

  const contents = [
    {
      role: 'user',
      parts: [{ text: `${systemPrompt}\n\n${userText}` }, ...parts],
    },
  ]

  const body = {
    contents,
    systemInstruction: { parts: [{ text: systemPrompt }] },
    tools: [{ functionDeclarations }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
  }

  const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error('Gemini API error:', res.status, errText)
    return { text: 'Sorry, I had trouble processing that. Try again.', functionCalls: [] }
  }

  const data = (await res.json()) as GeminiResponse
  const candidate = data.candidates?.[0]
  if (!candidate?.content?.parts) {
    return { text: "I'm not sure how to respond to that.", functionCalls: [] }
  }

  const textParts: string[] = []
  const functionCalls: { name: string; args: Record<string, unknown> }[] = []

  for (const part of candidate.content.parts) {
    if (part.text) textParts.push(part.text)
    if (part.functionCall) {
      functionCalls.push({ name: part.functionCall.name, args: part.functionCall.args ?? {} })
    }
  }

  return { text: textParts.join(' '), functionCalls }
}

// ─── Main entry point ─────────────────────────────────────────────────────────
export async function generateAIResponse(
  message: string,
  opts: { sender: TfMember | null; isAdmin: boolean }
): Promise<string> {
  const context = await buildTeamContext(opts.sender?.id ?? null)

  const systemPrompt = `${SYSTEM_PROMPT}

Current sender: ${opts.sender?.name ?? 'unknown'} (admin: ${opts.isAdmin}).

Current sender's own tasks (JSON):
${JSON.stringify(context.your_tasks)}

Team and task data (JSON):
${JSON.stringify(context)}`

  let { text, functionCalls } = await callGemini(systemPrompt, message)

  // Handle tool calls (up to 4 rounds)
  let iterations = 0
  const conversationParts: GeminiPart[] = []

  while (functionCalls.length > 0 && iterations < 4) {
    iterations += 1

    for (const fc of functionCalls) {
      const result = await executeTool(fc.name, fc.args as unknown as ToolArgs, {
        isAdmin: opts.isAdmin,
        senderId: opts.sender?.id ?? null,
      })

      conversationParts.push({
        functionResponse: { name: fc.name, response: { result } },
      })
    }

    // Continue the conversation with tool results
    const followUp = await callGemini(systemPrompt, 'Continue based on tool results.', conversationParts)
    text = followUp.text
    functionCalls = followUp.functionCalls
  }

  return text || "I'm not sure how to respond to that."
}

// ─── Vision support (for future photo/video messages) ─────────────────────────
export async function generateAIResponseWithImage(
  message: string,
  imageBase64: string,
  imageMimeType: string,
  opts: { sender: TfMember | null; isAdmin: boolean }
): Promise<string> {
  const context = await buildTeamContext(opts.sender?.id ?? null)

  const systemPrompt = `${SYSTEM_PROMPT}

Current sender: ${opts.sender?.name ?? 'unknown'} (admin: ${opts.isAdmin}).

Current sender's own tasks (JSON):
${JSON.stringify(context.your_tasks)}

Team and task data (JSON):
${JSON.stringify(context)}`

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return "I can't process images right now (GEMINI_API_KEY isn't configured). Try /help for commands."
  }

  const contents = [
    {
      role: 'user',
      parts: [
        { text: `${systemPrompt}\n\n${message}` },
        { inlineData: { mimeType: imageMimeType, data: imageBase64 } },
      ],
    },
  ]

  const body = {
    contents,
    systemInstruction: { parts: [{ text: systemPrompt }] },
    tools: [{ functionDeclarations }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
  }

  const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    console.error('Gemini API error:', res.status, await res.text())
    return 'Sorry, I had trouble processing that image.'
  }

  const data = (await res.json()) as GeminiResponse
  const candidate = data.candidates?.[0]
  if (!candidate?.content?.parts) return 'I could not analyze that image.'

  return candidate.content.parts.map((p) => p.text).filter(Boolean).join(' ') || 'I could not analyze that image.'
}

// ─── File upload handling (documents, images sent with a caption) ─────────────
export async function generateAIResponseWithFile(
  message: string,
  fileContent: string,
  imageBase64: string | undefined,
  imageMimeType: string | undefined,
  opts: { sender: TfMember | null; isAdmin: boolean }
): Promise<string> {
  const context = await buildTeamContext()

  const fileInstructions = `The user has uploaded a file. ${
    imageBase64 ? 'The image is attached below.' : 'The file content is provided below.'
  } If the user asks to create an SOP from it, use the create_sop_from_file tool. If they ask to distribute it to a team, use distribute_to_team. If they ask to summarize it, use summarize_file. If they ask to announce changes to an existing SOP, use announce_sop_change. If no clear instruction is given, summarize the file with summarize_file and ask what to do with it.`

  const systemPrompt = `${SYSTEM_PROMPT}

${fileInstructions}

Current sender: ${opts.sender?.name ?? 'unknown'} (admin: ${opts.isAdmin}).

Team and task data (JSON):
${JSON.stringify(context)}`

  const userText = imageBase64
    ? message
    : `${message}\n\n--- FILE CONTENT ---\n${fileContent}\n--- END FILE CONTENT ---`

  const initialParts: GeminiPart[] =
    imageBase64 && imageMimeType ? [{ inlineData: { mimeType: imageMimeType, data: imageBase64 } }] : []

  let { text, functionCalls } = await callGemini(systemPrompt, userText, initialParts)

  let iterations = 0
  const conversationParts: GeminiPart[] = []

  while (functionCalls.length > 0 && iterations < 4) {
    iterations += 1

    for (const fc of functionCalls) {
      const result = await executeTool(fc.name, fc.args as unknown as ToolArgs, {
        isAdmin: opts.isAdmin,
        senderId: opts.sender?.id ?? null,
      })

      conversationParts.push({
        functionResponse: { name: fc.name, response: { result } },
      })
    }

    const followUp = await callGemini(systemPrompt, 'Continue based on tool results.', conversationParts)
    text = followUp.text
    functionCalls = followUp.functionCalls
  }

  return text || "I'm not sure how to respond to that."
}
