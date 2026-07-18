// Builds the rich team-context JSON injected into the system prompt on every
// request — members (with skills/teams/workload), tasks (with attachment
// counts + recurring info), teams, boards, skills catalog, SOPs, and the
// topic access map.

import { createAdminClient } from '@/lib/supabase/admin'
import { isOverdue } from '@/lib/teamflow-db'
import { todayLabel } from './dates'
import type { TfMember, TfTask } from '@/types/teamflow'

const supabase = createAdminClient()

interface TaskWithAssignee extends TfTask {
  assignee: { name: string; telegram_username: string | null; discord_username: string | null } | null
}

interface MemberSkillJoin {
  member_id: string
  proficiency_level: number
  skill: { name: string } | null
}

export interface TeamContextMember {
  id: string
  name: string
  telegram_username: string | null
  discord_username: string | null
  role: string
  status: string
  max_daily_hours: number
  skills: string[]
  teams: string[]
  active_task_count: number
  hours_booked: number
  /** Active tasks with no estimated_hours set — hours_booked understates real load when this is > 0. */
  tasks_without_estimate: number
}

export interface TeamContextTask {
  id: string
  title: string
  status: string
  priority: string
  assignee: string | null
  due_date: string | null
  overdue: boolean
  platform: string | null
  is_recurring: boolean
  recurrence_pattern: string | null
  attachments: number
}

export interface TeamContext {
  today: string
  members: TeamContextMember[]
  tasks: TeamContextTask[]
  teams: { name: string; members: string[] }[]
  boards: { name: string; description: string | null }[]
  skills_catalog: string[]
  sops: { id: string; title: string; category: string; platform: string | null; version: number }[]
  topic_access: { topic_name: string; teams: string[] }[]
  your_tasks: TeamContextTask[]
}

export async function buildTeamContext(senderId?: string | null): Promise<TeamContext> {
  const [
    { data: members },
    { data: memberSkills },
    { data: tasks },
    { data: teams },
    { data: memberTeams },
    { data: boards },
    { data: skills },
    { data: sops },
    { data: topicAccess },
    { data: attachmentRows },
  ] = await Promise.all([
    supabase.from('tf_members').select('*'),
    supabase.from('tf_member_skills').select('member_id, proficiency_level, skill:tf_skills(name)'),
    supabase.from('tf_tasks').select('*, assignee:tf_members(name, telegram_username, discord_username)'),
    supabase.from('tf_teams').select('*'),
    supabase.from('tf_member_teams').select('member_id, team_id'),
    supabase.from('tf_boards').select('*'),
    supabase.from('tf_skills').select('name'),
    supabase.from('tf_sops').select('id, title, category, platform, version').eq('status', 'active'),
    supabase.from('tf_topic_team_access').select('topic_name, team_id'),
    supabase.from('tf_task_attachments').select('task_id'),
  ])

  const allMembers = (members as TfMember[]) ?? []
  const allTasks = (tasks as TaskWithAssignee[]) ?? []
  const allMemberSkills = (memberSkills as unknown as MemberSkillJoin[]) ?? []
  const allTeams = (teams as { id: string; name: string }[]) ?? []
  const allMemberTeams = (memberTeams as { member_id: string; team_id: string }[]) ?? []
  const allBoards = (boards as { name: string; description: string | null }[]) ?? []
  const allSkills = (skills as { name: string }[]) ?? []
  const allSops = (sops as { id: string; title: string; category: string; platform: string | null; version: number }[]) ?? []
  const allTopicAccess = (topicAccess as { topic_name: string; team_id: string }[]) ?? []
  const allAttachments = (attachmentRows as { task_id: string }[]) ?? []

  const attachmentCountByTask = new Map<string, number>()
  for (const a of allAttachments) {
    attachmentCountByTask.set(a.task_id, (attachmentCountByTask.get(a.task_id) ?? 0) + 1)
  }

  const membersWithData: TeamContextMember[] = allMembers.map((m) => {
    const skillNames = allMemberSkills
      .filter((ms) => ms.member_id === m.id)
      .map((ms) => `${ms.skill?.name} (${ms.proficiency_level}/5)`)
    const activeTasks = allTasks.filter((t) => t.assignee_id === m.id && t.status !== 'done')
    const bookedHours = activeTasks.reduce((sum, t) => sum + (t.estimated_hours ?? 0), 0)
    const unestimatedCount = activeTasks.filter((t) => t.estimated_hours == null).length
    const memberTeamIds = allMemberTeams.filter((mt) => mt.member_id === m.id).map((mt) => mt.team_id)
    const memberTeamNames = allTeams.filter((t) => memberTeamIds.includes(t.id)).map((t) => t.name)
    return {
      id: m.id,
      name: m.name,
      telegram_username: m.telegram_username,
      discord_username: m.discord_username,
      role: m.role,
      status: m.status,
      max_daily_hours: m.max_daily_hours,
      skills: skillNames,
      teams: memberTeamNames,
      active_task_count: activeTasks.length,
      hours_booked: Math.round(bookedHours * 100) / 100,
      tasks_without_estimate: unestimatedCount,
    }
  })

  const toContextTask = (t: TaskWithAssignee): TeamContextTask => ({
    id: t.id.slice(0, 8),
    title: t.title,
    status: t.status,
    priority: t.priority,
    assignee: t.assignee?.name ?? null,
    due_date: t.due_date,
    overdue: isOverdue(t),
    platform: t.platform,
    is_recurring: Boolean(t.is_recurring),
    recurrence_pattern: t.recurrence_pattern ?? null,
    attachments: attachmentCountByTask.get(t.id) ?? 0,
  })

  const tasksSummary = allTasks.map(toContextTask)

  const teamsList = allTeams.map((t) => {
    const teamMemberIds = allMemberTeams.filter((mt) => mt.team_id === t.id).map((mt) => mt.member_id)
    const teamMemberNames = allMembers.filter((m) => teamMemberIds.includes(m.id)).map((m) => m.name)
    return { name: t.name, members: teamMemberNames }
  })

  const topicAccessMap = new Map<string, string[]>()
  for (const row of allTopicAccess) {
    const teamName = allTeams.find((t) => t.id === row.team_id)?.name
    if (!teamName) continue
    const list = topicAccessMap.get(row.topic_name) ?? []
    list.push(teamName)
    topicAccessMap.set(row.topic_name, list)
  }
  const topicAccessList = Array.from(topicAccessMap.entries()).map(([topic_name, teamsWithAccess]) => ({
    topic_name,
    teams: teamsWithAccess,
  }))

  const yourTasks = senderId ? allTasks.filter((t) => t.assignee_id === senderId).map(toContextTask) : []

  return {
    today: todayLabel(),
    members: membersWithData,
    tasks: tasksSummary,
    teams: teamsList,
    boards: allBoards,
    skills_catalog: allSkills.map((s) => s.name),
    sops: allSops,
    topic_access: topicAccessList,
    your_tasks: yourTasks,
  }
}
