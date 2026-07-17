import { createAdminClient } from '@/lib/supabase/admin'
import {
  PERMISSIONS,
  combinePermissions,
  createCategory,
  createRole,
  createTextChannel,
  getGuildChannels,
  getGuildRoles,
  type PermissionOverwrite,
} from '@/lib/discord-api'

const supabase = createAdminClient()

export const MANAGED_ROLE_NAMES = [
  'Full Manager',
  'Twitter Manager',
  'Instagram Manager',
  'Instagram VA',
  'Twitter VA',
] as const

interface CategoryDef {
  key: string
  name: string
}

const CATEGORIES: CategoryDef[] = [
  { key: 'information', name: '📋 INFORMATION' },
  { key: 'manager_chat', name: '🔒 MANAGER CHAT' },
  { key: 'platforms', name: '📱 PLATFORMS' },
  { key: 'testing', name: '🧪 TESTING' },
  { key: 'sops', name: '📋 SOPs' },
  { key: 'bot_commands', name: '🔧 BOT COMMANDS' },
]

type EveryoneAccess = 'write' | 'read' | 'none'

interface ChannelDef {
  topicName: string // key into tf_telegram_topics, shared with the Telegram bot where the topic already exists there
  channelName: string
  category: string
  everyone: EveryoneAccess
  roles: string[] // role names granted explicit view+send+history
}

const CHANNELS: ChannelDef[] = [
  { topicName: 'announcements', channelName: 'announcements', category: 'information', everyone: 'read', roles: ['Full Manager', 'Twitter Manager', 'Instagram Manager'] },
  { topicName: 'general', channelName: 'general', category: 'information', everyone: 'write', roles: [] },
  { topicName: 'sops', channelName: 'sops', category: 'information', everyone: 'read', roles: ['Full Manager', 'Twitter Manager', 'Instagram Manager'] },
  { topicName: 'manager_chat', channelName: 'manager-chat', category: 'manager_chat', everyone: 'none', roles: ['Full Manager', 'Twitter Manager', 'Instagram Manager'] },
  { topicName: 'notifications', channelName: 'notifications', category: 'manager_chat', everyone: 'none', roles: ['Full Manager', 'Twitter Manager', 'Instagram Manager'] },
  { topicName: 'twitter', channelName: 'twitter', category: 'platforms', everyone: 'none', roles: ['Full Manager', 'Twitter Manager', 'Twitter VA'] },
  { topicName: 'instagram', channelName: 'instagram', category: 'platforms', everyone: 'none', roles: ['Full Manager', 'Instagram Manager', 'Instagram VA'] },
  { topicName: 'reddit', channelName: 'reddit', category: 'platforms', everyone: 'none', roles: ['Full Manager'] },
  { topicName: 'tiktok', channelName: 'tiktok', category: 'platforms', everyone: 'none', roles: ['Full Manager'] },
  { topicName: 'youtube', channelName: 'youtube', category: 'platforms', everyone: 'none', roles: ['Full Manager'] },
  { topicName: 'testing', channelName: 'testing', category: 'testing', everyone: 'write', roles: [] },
  { topicName: 'sop_general', channelName: 'sop-general', category: 'sops', everyone: 'read', roles: ['Full Manager'] },
  { topicName: 'sop_twitter', channelName: 'sop-twitter', category: 'sops', everyone: 'read', roles: ['Full Manager', 'Twitter Manager'] },
  { topicName: 'sop_instagram', channelName: 'sop-instagram', category: 'sops', everyone: 'read', roles: ['Full Manager', 'Instagram Manager'] },
  { topicName: 'sop_tiktok', channelName: 'sop-tiktok', category: 'sops', everyone: 'read', roles: ['Full Manager'] },
  { topicName: 'sop_youtube', channelName: 'sop-youtube', category: 'sops', everyone: 'read', roles: ['Full Manager'] },
  { topicName: 'bot_commands', channelName: 'bot-commands', category: 'bot_commands', everyone: 'write', roles: [] },
]

function buildOverwrites(everyoneId: string, def: ChannelDef, roleIdByName: Map<string, string>): PermissionOverwrite[] {
  const viewSendHistory = combinePermissions([PERMISSIONS.VIEW_CHANNEL, PERMISSIONS.SEND_MESSAGES, PERMISSIONS.READ_MESSAGE_HISTORY])
  const viewHistory = combinePermissions([PERMISSIONS.VIEW_CHANNEL, PERMISSIONS.READ_MESSAGE_HISTORY])
  const sendOnly = combinePermissions([PERMISSIONS.SEND_MESSAGES])
  const viewOnly = combinePermissions([PERMISSIONS.VIEW_CHANNEL])

  const overwrites: PermissionOverwrite[] = []

  if (def.everyone === 'write') {
    overwrites.push({ id: everyoneId, type: 0, allow: viewSendHistory, deny: '0' })
  } else if (def.everyone === 'read') {
    overwrites.push({ id: everyoneId, type: 0, allow: viewHistory, deny: sendOnly })
  } else {
    overwrites.push({ id: everyoneId, type: 0, allow: '0', deny: viewOnly })
  }

  for (const roleName of def.roles) {
    const roleId = roleIdByName.get(roleName)
    if (roleId) overwrites.push({ id: roleId, type: 0, allow: viewSendHistory, deny: '0' })
  }

  return overwrites
}

export interface SetupResult {
  rolesCreated: string[]
  rolesExisting: string[]
  categoriesCreated: string[]
  categoriesExisting: string[]
  channelsCreated: string[]
  channelsExisting: string[]
}

export async function setupDiscordServer(guildId: string): Promise<SetupResult> {
  const result: SetupResult = {
    rolesCreated: [],
    rolesExisting: [],
    categoriesCreated: [],
    categoriesExisting: [],
    channelsCreated: [],
    channelsExisting: [],
  }

  const [existingRoles, existingChannels] = await Promise.all([getGuildRoles(guildId), getGuildChannels(guildId)])

  const roleIdByName = new Map<string, string>()
  for (const role of existingRoles) roleIdByName.set(role.name, role.id)

  for (const roleName of MANAGED_ROLE_NAMES) {
    if (roleIdByName.has(roleName)) {
      result.rolesExisting.push(roleName)
      continue
    }
    const created = await createRole(guildId, roleName)
    roleIdByName.set(roleName, created.id)
    result.rolesCreated.push(roleName)
  }

  const categoryIdByKey = new Map<string, string>()
  const existingCategoryByName = new Map(existingChannels.filter((c) => c.type === 4).map((c) => [c.name, c.id]))

  for (const category of CATEGORIES) {
    const existingId = existingCategoryByName.get(category.name)
    if (existingId) {
      categoryIdByKey.set(category.key, existingId)
      result.categoriesExisting.push(category.name)
      continue
    }
    const created = await createCategory(guildId, category.name)
    categoryIdByKey.set(category.key, created.id)
    result.categoriesCreated.push(category.name)
  }

  const existingChannelByName = new Map(existingChannels.filter((c) => c.type === 0).map((c) => [c.name, c]))
  const everyoneId = guildId // @everyone's role id always equals the guild id

  for (const channelDef of CHANNELS) {
    const existing = existingChannelByName.get(channelDef.channelName)
    const categoryId = categoryIdByKey.get(channelDef.category)

    if (existing) {
      result.channelsExisting.push(channelDef.channelName)
      await supabase.from('tf_telegram_topics').upsert(
        { topic_name: channelDef.topicName, discord_channel_id: existing.id, discord_guild_id: guildId },
        { onConflict: 'topic_name' }
      )
      continue
    }

    const overwrites = buildOverwrites(everyoneId, channelDef, roleIdByName)
    const created = await createTextChannel(guildId, channelDef.channelName, categoryId, overwrites)
    result.channelsCreated.push(channelDef.channelName)

    await supabase.from('tf_telegram_topics').upsert(
      { topic_name: channelDef.topicName, discord_channel_id: created.id, discord_guild_id: guildId },
      { onConflict: 'topic_name' }
    )
  }

  return result
}
