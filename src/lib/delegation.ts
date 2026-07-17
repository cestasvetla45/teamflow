import { createAdminClient } from './supabase/admin'
import { getMemberWorkload, type WorkloadInfo } from './workload'

export interface AssigneeCandidate {
  member_id: string
  name: string
  skill_proficiency: number | null
  available_hours: number
  current_tasks: number
  utilization_pct: number
  recommendation_score: number
  reason: string
}

export async function findBestAssignee(
  skillName?: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for future per-board scoping
  boardId?: string
): Promise<AssigneeCandidate[]> {
  const supabase = createAdminClient()

  const { data: members, error: membersError } = await supabase
    .from('tf_members')
    .select('id, name')
    .eq('status', 'active')
  if (membersError) throw membersError
  if (!members || members.length === 0) return []

  let eligibleMemberIds: Set<string> | null = null
  const proficiencyByMember = new Map<string, number>()

  if (skillName) {
    const { data: skill, error: skillError } = await supabase
      .from('tf_skills')
      .select('id')
      .ilike('name', skillName)
      .maybeSingle()
    if (skillError) throw skillError
    if (!skill) return []

    const { data: memberSkills, error: memberSkillsError } = await supabase
      .from('tf_member_skills')
      .select('member_id, proficiency_level')
      .eq('skill_id', skill.id)
    if (memberSkillsError) throw memberSkillsError

    eligibleMemberIds = new Set()
    for (const memberSkill of memberSkills ?? []) {
      eligibleMemberIds.add(memberSkill.member_id)
      proficiencyByMember.set(memberSkill.member_id, memberSkill.proficiency_level ?? 0)
    }
  }

  const candidateMembers = eligibleMemberIds
    ? members.filter((member) => eligibleMemberIds!.has(member.id))
    : members
  if (candidateMembers.length === 0) return []

  const workloads = await Promise.all(
    candidateMembers.map((member) => getMemberWorkload(member.id))
  )
  const workloadByMember = new Map<string, WorkloadInfo>(
    workloads.map((workload) => [workload.member_id, workload])
  )

  const candidates: AssigneeCandidate[] = candidateMembers.map((member) => {
    const workload = workloadByMember.get(member.id)!
    return {
      member_id: member.id,
      name: member.name,
      skill_proficiency: skillName ? proficiencyByMember.get(member.id) ?? null : null,
      available_hours: workload.available_hours,
      current_tasks: workload.active_tasks,
      utilization_pct: workload.utilization_pct,
      recommendation_score: 0,
      reason: '',
    }
  })

  // Rank by available capacity first, then by skill proficiency as a tiebreaker.
  candidates.sort((a, b) => {
    if (b.available_hours !== a.available_hours) return b.available_hours - a.available_hours
    return (b.skill_proficiency ?? 0) - (a.skill_proficiency ?? 0)
  })

  const top = candidates.slice(0, 5)
  const maxAvailable = Math.max(...top.map((c) => c.available_hours), 1)

  return top.map((candidate) => {
    const availabilityScore = Math.min(1, candidate.available_hours / maxAvailable)
    const proficiencyScore = candidate.skill_proficiency != null ? candidate.skill_proficiency / 5 : null
    const score = proficiencyScore != null ? availabilityScore * 0.6 + proficiencyScore * 0.4 : availabilityScore

    const reasonParts: string[] = []
    if (candidate.skill_proficiency != null) {
      reasonParts.push(`Highest proficiency (${candidate.skill_proficiency}/5)`)
    }
    reasonParts.push(`${candidate.available_hours}h available today`)
    reasonParts.push(`${candidate.current_tasks} active task${candidate.current_tasks === 1 ? '' : 's'}`)

    return {
      ...candidate,
      recommendation_score: Math.round(score * 100) / 100,
      reason: reasonParts.join(', '),
    }
  })
}

export async function recommendAssignee(
  taskTitle: string,
  skillName?: string
): Promise<AssigneeCandidate | null> {
  const candidates = await findBestAssignee(skillName)
  return candidates[0] ?? null
}
