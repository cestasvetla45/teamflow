import { Client, GatewayIntentBits, Partials, Message, Guild, GuildMember } from 'discord.js'
import WebSocket from 'ws'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateAIResponse, generateAIResponseWithFile } from '@/lib/bot-ai'
import { extractFileContent } from '@/lib/file-reader'
import { canAccessTopicForDiscordUser, getTopicNameFromDiscordChannel } from '@/lib/topic-access'
import { ensureDiscordMemberExists, getMemberByDiscordId } from '@/lib/teamflow-db'

// Polyfill WebSocket for Node 18 (Supabase realtime needs it)
;(globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket

if (!process.env.DISCORD_BOT_TOKEN) {
  throw new Error('DISCORD_BOT_TOKEN env var is required')
}

const BOT_ID = process.env.DISCORD_BOT_ID || '1527663610485018684'
const BOT_MENTION_RE = new RegExp(`<@!?${BOT_ID}>`, 'g')
const BOT_COMMANDS_CHANNEL = 'bot-commands'
const DISCORD_MESSAGE_LIMIT = 2000

const supabase = createAdminClient()

// GuildMembers requires the "Server Members Intent" privileged gateway intent to be
// enabled for this bot in the Discord developer portal (Bot > Privileged Gateway Intents).
// Without it, guildMemberAdd/guildMemberUpdate events silently never fire.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember],
})

client.once('ready', async () => {
  console.log(`Discord gateway worker logged in as ${client.user?.tag}`)

  const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID!)
  if (guild) {
    await lockdownChannels(guild)
  }
})

// Channels hidden from @everyone — role-specific overwrites (set via scripts/fix-discord-roles.mjs)
// grant access. Public/read-only channels (announcements, sops, testing, sop-*) manage their own
// overwrites and must NOT be re-denied here.
const PRIVATE_CHANNELS = new Set([
  'manager-chat',
  'notifications',
  'twitter',
  'instagram',
  'reddit',
  'tiktok',
  'youtube',
])

async function lockdownChannels(guild: Guild) {
  const everyoneRole = guild.roles.everyone
  const channels = await guild.channels.fetch()

  for (const [, channel] of channels) {
    if (!channel || channel.isThread() || !channel.isTextBased()) continue
    try {
      if (channel.name === 'general' || channel.name === BOT_COMMANDS_CHANNEL) {
        await channel.permissionOverwrites.edit(everyoneRole, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        })
      } else if (PRIVATE_CHANNELS.has(channel.name)) {
        // Only deny @everyone on platform/manager channels — don't touch categories
        await channel.permissionOverwrites.edit(everyoneRole, {
          ViewChannel: false,
        })
      }
    } catch (err) {
      console.error(`Failed to set permission overwrite on #${channel.name}:`, err)
    }
  }

  // DO NOT modify category permissions — let channels handle their own
  console.log(`Lockdown pass complete — @everyone denied on ${PRIVATE_CHANNELS.size} private channels`)
}

function isDiscordAdmin(message: Message<true>): boolean {
  const adminId = process.env.ADMIN_DISCORD_ID
  if (adminId && message.author.id === adminId) return true
  return message.member?.roles.cache.some((role) => role.name === 'Full Manager') ?? false
}

async function isReplyFromBot(message: Message<true>): Promise<boolean> {
  if (!message.reference?.messageId) return false
  try {
    const referenced = await message.channel.messages.fetch(message.reference.messageId)
    return referenced.author.id === BOT_ID
  } catch {
    return false
  }
}

// Splits on paragraph breaks so a long AI reply doesn't get cut mid-sentence — Discord caps messages at 2000 chars.
async function sendDiscordReply(message: Message<true>, text: string): Promise<void> {
  if (text.length <= DISCORD_MESSAGE_LIMIT) {
    await message.reply(text)
    return
  }

  const chunks: string[] = []
  let current = ''
  for (const paragraph of text.split('\n\n')) {
    if ((current + '\n\n' + paragraph).length > 1900) {
      if (current) chunks.push(current)
      current = paragraph
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph
    }
  }
  if (current) chunks.push(current)

  for (let i = 0; i < chunks.length; i++) {
    if (i === 0) await message.reply(chunks[i])
    else await message.channel.send(chunks[i])
  }
}

client.on('messageCreate', async (message: Message) => {
  if (message.author.bot) return
  if (!message.inGuild()) return // DMs aren't supported — the bot only operates inside the TeamFlow server

  const channelName = message.channel.name
  const isBotCommandsChannel = channelName === BOT_COMMANDS_CHANNEL
  const isMentioned = message.mentions.has(BOT_ID)
  const isReplyToBot = await isReplyFromBot(message)

  if (!isMentioned && !isReplyToBot && !isBotCommandsChannel) return

  const text = message.content.replace(BOT_MENTION_RE, '').trim()
  if (!text && message.attachments.size === 0) return

  const admin = isDiscordAdmin(message)

  if (!admin) {
    const topicName = await getTopicNameFromDiscordChannel(message.channelId)
    if (topicName) {
      const access = await canAccessTopicForDiscordUser(message.author.id, topicName)
      if (!access.allowed) {
        await message.reply(`🚫 ${access.reason}`)
        return
      }
    }
  }

  const member = await ensureDiscordMemberExists(supabase, {
    discord_id: message.author.id,
    name: message.member?.displayName ?? message.author.username,
    discord_username: message.author.username,
  })

  await message.channel.sendTyping()

  const channelContext = `The user is messaging from the #${channelName} channel on Discord.`
  const promptText = `${channelContext}\n${text || 'What should I do with this file?'}`

  try {
    if (message.attachments.size > 0) {
      const attachment = message.attachments.first()!
      const response = await fetch(attachment.url)
      const buffer = Buffer.from(await response.arrayBuffer())
      const mimeType = attachment.contentType ?? 'application/octet-stream'
      const content = await extractFileContent(buffer, attachment.name, mimeType)
      const isImage = mimeType.startsWith('image/')

      const aiReply = await generateAIResponseWithFile(
        promptText,
        content,
        isImage ? buffer.toString('base64') : undefined,
        isImage ? mimeType : undefined,
        { sender: member, isAdmin: admin }
      )
      await sendDiscordReply(message, aiReply)
      return
    }

    const aiReply = await generateAIResponse(`${channelContext}\n${text}`, { sender: member, isAdmin: admin })
    await sendDiscordReply(message, aiReply)
  } catch (err) {
    console.error('Failed to process Discord message:', err)
    await message.reply('Sorry, I had trouble processing that.')
  }
})

client.on('guildMemberAdd', async (member: GuildMember) => {
  console.log(`New member joined: ${member.user.username} (${member.id})`)

  await ensureDiscordMemberExists(supabase, {
    discord_id: member.id,
    name: member.displayName || member.user.username,
    discord_username: member.user.username,
  })

  const generalChannel = member.guild.channels.cache.find((ch) => ch.name === 'general')
  if (generalChannel?.isTextBased()) {
    await generalChannel.send(
      `👋 Welcome <@${member.id}> to Clout MGMT!\n\n` +
        `Your TeamFlow profile has been created. You currently have no role assigned.\n` +
        `A manager will assign you to a team shortly. Once assigned, you'll get access to the relevant channels.\n\n` +
        `In the meantime, you can use #${BOT_COMMANDS_CHANNEL} to chat with me. Try: \`@TeamFloww help\``
    )
  }

  try {
    await member.send(
      `👋 Welcome to TeamFlow!\n\n` +
        `Your profile has been created and tied to your Discord username: @${member.user.username}\n\n` +
        `You currently have no role. Once a manager assigns you to a team (e.g. Instagram VA), ` +
        `you'll get access to the relevant channels and can start seeing your tasks.\n\n` +
        `Meanwhile, you can chat with me in #${BOT_COMMANDS_CHANNEL} or send me a DM.`
    )
  } catch {
    // DMs might be disabled — ignore
  }
})

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  const oldFull = oldMember.partial ? await oldMember.fetch() : oldMember
  const addedRoles = newMember.roles.cache.filter((r) => !oldFull.roles.cache.has(r.id))
  const removedRoles = oldFull.roles.cache.filter((r) => !newMember.roles.cache.has(r.id))

  if (addedRoles.size === 0 && removedRoles.size === 0) return

  const tfMember = await getMemberByDiscordId(supabase, newMember.id)
  if (!tfMember) return

  for (const [, role] of addedRoles) {
    await syncDiscordRoleToTeam(tfMember.id, role.name)
  }

  for (const [, role] of removedRoles) {
    await unsyncDiscordRoleFromTeam(tfMember.id, role.name)
  }
})

const PLATFORM_KEYWORDS: Record<string, string> = {
  instagram: 'instagram',
  ig: 'instagram',
  twitter: 'twitter',
  x: 'twitter',
  tiktok: 'tiktok',
  reddit: 'reddit',
  youtube: 'youtube',
  yt: 'youtube',
}

async function syncDiscordRoleToTeam(memberId: string, roleName: string) {
  const { data: team } = await supabase.from('tf_teams').select('*').ilike('name', roleName).maybeSingle()
  if (!team) return

  await supabase
    .from('tf_member_teams')
    .upsert({ member_id: memberId, team_id: team.id }, { onConflict: 'member_id,team_id' })

  for (const [keyword, topicName] of Object.entries(PLATFORM_KEYWORDS)) {
    if (roleName.toLowerCase().includes(keyword)) {
      await supabase
        .from('tf_topic_team_access')
        .upsert({ topic_name: topicName, team_id: team.id }, { onConflict: 'topic_name,team_id' })
    }
  }

  console.log(`Synced Discord role "${roleName}" to team "${team.name}" for member ${memberId}`)
}

async function unsyncDiscordRoleFromTeam(memberId: string, roleName: string) {
  const { data: team } = await supabase.from('tf_teams').select('*').ilike('name', roleName).maybeSingle()
  if (!team) return

  await supabase.from('tf_member_teams').delete().eq('member_id', memberId).eq('team_id', team.id)

  console.log(`Unsynced Discord role "${roleName}" from team for member ${memberId}`)
}

client.login(process.env.DISCORD_BOT_TOKEN)
