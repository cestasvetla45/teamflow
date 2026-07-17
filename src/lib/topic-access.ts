import { createAdminClient } from '@/lib/supabase/admin'
import type { TfMember } from '@/types/teamflow'

const supabase = createAdminClient()

// Topics open to anyone on at least one team, regardless of platform-specific grants
const OPEN_TO_ANY_TEAM_TOPICS = new Set(['general', 'testing', 'sops'])

export const UNAUTHORIZED_TOPIC_MESSAGE = `You don't have access to this topic yet. Ask a manager to add you to the right team.

Current teams:
• Instagram VA — access to 📸 Instagram topic
• Twitter VA — access to 🐦 Twitter topic
• Instagram Manager — access to 📸 Instagram + 🔒 Manager Chat
• Twitter Manager — access to 🐦 Twitter + 🔒 Manager Chat
• Full Manager — access to all topics

Message a manager to get added to a team.`

// Get the topic name from the message_thread_id
export async function getTopicNameFromThread(threadId: number): Promise<string | null> {
  const { data } = await supabase
    .from('tf_telegram_topics')
    .select('topic_name')
    .eq('message_thread_id', threadId)
    .maybeSingle()
  return data?.topic_name ?? null
}

// Get the topic name from a Discord channel id
export async function getTopicNameFromDiscordChannel(channelId: string): Promise<string | null> {
  const { data } = await supabase
    .from('tf_telegram_topics')
    .select('topic_name')
    .eq('discord_channel_id', channelId)
    .maybeSingle()
  return data?.topic_name ?? null
}

// Shared role/team access check — used by both the Telegram and Discord lookups below
async function canMemberAccessTopic(
  member: TfMember,
  topicName: string
): Promise<{ allowed: boolean; reason?: string }> {
  // Admins can access everything
  if (member.role === 'admin') return { allowed: true }

  // Role-based access — managers get topics explicitly listed in tf_topic_access.
  // Workers have no rows here by design, so this never grants a worker default access.
  const { data: roleAccess } = await supabase
    .from('tf_topic_access')
    .select('*')
    .eq('topic_name', topicName)
    .eq('role', member.role)
    .maybeSingle()

  if (roleAccess) return { allowed: true }

  // Everything past this point is driven by team membership — a member with no
  // team gets access to nothing, not even general/testing/sops.
  const { data: memberTeams } = await supabase
    .from('tf_member_teams')
    .select('team_id')
    .eq('member_id', member.id)

  const teamIds = (memberTeams ?? []).map((t) => t.team_id)
  const inAnyTeam = teamIds.length > 0

  if (!inAnyTeam) {
    return { allowed: false, reason: UNAUTHORIZED_TOPIC_MESSAGE }
  }

  // General/testing/sops are open to any team member
  if (OPEN_TO_ANY_TEAM_TOPICS.has(topicName)) {
    return { allowed: true }
  }

  // Platform topics require an explicit team grant via tf_topic_team_access
  const { data: teamAccess } = await supabase
    .from('tf_topic_team_access')
    .select('team_id')
    .eq('topic_name', topicName)
    .in('team_id', teamIds)

  if (teamAccess && teamAccess.length > 0) return { allowed: true }

  return { allowed: false, reason: UNAUTHORIZED_TOPIC_MESSAGE }
}

// Check if a member can access a topic (Telegram sender)
export async function canAccessTopic(
  memberTelegramId: number,
  topicName: string
): Promise<{ allowed: boolean; reason?: string }> {
  const { data: member } = await supabase
    .from('tf_members')
    .select('*')
    .eq('telegram_id', memberTelegramId)
    .maybeSingle()

  if (!member) {
    return { allowed: false, reason: UNAUTHORIZED_TOPIC_MESSAGE }
  }

  return canMemberAccessTopic(member as TfMember, topicName)
}

// Check if a member can access a topic (Discord sender)
export async function canAccessTopicForDiscordUser(
  discordId: string,
  topicName: string
): Promise<{ allowed: boolean; reason?: string }> {
  const { data: member } = await supabase
    .from('tf_members')
    .select('*')
    .eq('discord_id', discordId)
    .maybeSingle()

  if (!member) {
    return { allowed: false, reason: UNAUTHORIZED_TOPIC_MESSAGE }
  }

  return canMemberAccessTopic(member as TfMember, topicName)
}
