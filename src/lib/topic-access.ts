import { createAdminClient } from '@/lib/supabase/admin'

const supabase = createAdminClient()

// Get the topic name from the message_thread_id
export async function getTopicNameFromThread(threadId: number): Promise<string | null> {
  const { data } = await supabase
    .from('tf_telegram_topics')
    .select('topic_name')
    .eq('message_thread_id', threadId)
    .maybeSingle()
  return data?.topic_name ?? null
}

// Check if a member can access a topic
export async function canAccessTopic(
  memberTelegramId: number,
  topicName: string
): Promise<{ allowed: boolean; reason?: string }> {
  // Get the member
  const { data: member } = await supabase
    .from('tf_members')
    .select('*')
    .eq('telegram_id', memberTelegramId)
    .maybeSingle()

  if (!member) {
    // Non-registered users can only access general
    if (topicName === 'general') return { allowed: true }
    return { allowed: false, reason: 'You need to be registered as a team member to use this topic.' }
  }

  // Admins can access everything
  if (member.role === 'admin') return { allowed: true }

  // Check role-based access
  const { data: roleAccess } = await supabase
    .from('tf_topic_access')
    .select('*')
    .eq('topic_name', topicName)
    .eq('role', member.role)
    .maybeSingle()

  if (roleAccess) return { allowed: true }

  // Check team-based access
  const { data: teamAccess } = await supabase
    .from('tf_topic_team_access')
    .select('team_id')
    .eq('topic_name', topicName)

  if (teamAccess && teamAccess.length > 0) {
    const teamIds = teamAccess.map((t) => t.team_id)
    const { data: memberTeam } = await supabase
      .from('tf_member_teams')
      .select('team_id')
      .eq('member_id', member.id)
      .in('team_id', teamIds)

    if (memberTeam && memberTeam.length > 0) return { allowed: true }
  }

  return {
    allowed: false,
    reason: `You don't have access to the ${topicName} topic. Ask a manager to add you to the right team.`,
  }
}
