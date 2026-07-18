import { Client, GatewayIntentBits, Partials, Message, Guild, GuildMember } from 'discord.js'
import WebSocket from 'ws'
import { createAdminClient } from '@/lib/supabase/admin'
import { runAssistant } from '@/lib/ai'
import { executeTool } from '@/lib/ai/tools'
import { extractFileContent } from '@/lib/file-reader'
import { canAccessTopicForDiscordUser, getTopicNameFromDiscordChannel } from '@/lib/topic-access'
import { ensureDiscordMemberExists, getMemberByDiscordId } from '@/lib/teamflow-db'
import type { TfMember } from '@/types/teamflow'

// Polyfill WebSocket for Node 18 (Supabase realtime needs it)
;(globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket

if (!process.env.DISCORD_BOT_TOKEN) {
  throw new Error('DISCORD_BOT_TOKEN env var is required')
}

const BOT_ID = process.env.DISCORD_BOT_ID || '1527663610485018684'
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

// Channels that bypass topic access control entirely — anyone with server access can use the bot here.
const PUBLIC_BYPASS_CHANNELS = new Set(['bot-commands', 'general', 'testing'])

// Admin gate: env-configured admin id, guild owner, tf_members.role='admin', or the legacy "Full Manager" role.
async function isDiscordAdmin(message: Message<true>): Promise<boolean> {
  const adminId = process.env.ADMIN_DISCORD_ID
  if (adminId && message.author.id === adminId) return true
  if (message.guild.ownerId === message.author.id) return true

  const tfMember = await getMemberByDiscordId(supabase, message.author.id)
  if (tfMember?.role === 'admin') return true

  return message.member?.roles.cache.some((role) => role.name === 'Full Manager') ?? false
}

// TASK_27 — auto-detect Instagram reel/post links pasted into any channel.
const REEL_URL_RE = /https?:\/\/(?:www\.)?instagram\.com\/(?:reel|p)\/[A-Za-z0-9_-]+[^\s]*/i

function extractReelUrl(text: string): string | null {
  const match = text.match(REEL_URL_RE)
  return match ? match[0] : null
}

// "essentially just the link" — at most one other non-empty line besides the one carrying the URL.
function isJustTheLink(text: string, url: string): boolean {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const nonUrlLines = lines.filter((l) => !l.includes(url))
  return nonUrlLines.length <= 1
}

// Resolves raw `<@123>` / `<@!123>` mentions to `@username` via the guild member cache/fetch,
// and strips the bot's own mention entirely. Run BEFORE any text reaches the AI core.
async function resolveMentionsToUsernames(message: Message<true>): Promise<string> {
  const mentionRe = /<@!?(\d+)>/g
  const ids = new Set<string>()
  let match: RegExpExecArray | null
  while ((match = mentionRe.exec(message.content))) {
    if (match[1] !== BOT_ID) ids.add(match[1])
  }

  const nameById = new Map<string, string>()
  for (const id of ids) {
    let guildMember = message.guild.members.cache.get(id)
    if (!guildMember) {
      try {
        guildMember = await message.guild.members.fetch(id)
      } catch {
        guildMember = undefined
      }
    }
    if (guildMember) nameById.set(id, guildMember.displayName || guildMember.user.username)
  }

  return message.content
    .replace(mentionRe, (full, id: string) => {
      if (id === BOT_ID) return ''
      const name = nameById.get(id)
      return name ? `@${name}` : full
    })
    .trim()
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

// TASK_27 — handles a message containing an Instagram reel/post link: if it's essentially just
// the link, log it directly via the log_reel_post tool executor; otherwise route the full message
// through the assistant with a hint so it can decide whether/how to log it in context.
async function handleReelLinkMessage(
  message: Message<true>,
  resolvedText: string,
  reelUrl: string,
  member: TfMember,
  admin: boolean
): Promise<void> {
  await message.channel.sendTyping()
  const chatKey = `dc:${message.channelId}:${message.author.id}`

  try {
    if (isJustTheLink(resolvedText, reelUrl)) {
      const result = await executeTool('log_reel_post', { reel_url: reelUrl }, { isAdmin: admin, sender: member })
      await sendDiscordReply(message, result)
      return
    }

    const channelContext = `The user is messaging from the #${message.channel.name} channel on Discord.`
    const hint =
      '[This message includes an Instagram reel/post link. If the user is reporting that they posted it, log it with the reel-logging tool.]'
    const aiReply = await runAssistant({
      text: `${channelContext}\n${hint}\n${resolvedText}`,
      channel: 'discord',
      chatKey,
      sender: member,
      isAdmin: admin,
    })
    await sendDiscordReply(message, aiReply)
  } catch (err) {
    console.error('Failed to process reel link message:', err)
    await message.reply('Sorry, I had trouble logging that reel link.')
  }
}

client.on('messageCreate', async (message: Message) => {
  if (message.author.bot) return
  if (!message.inGuild()) return // DMs aren't supported — the bot only operates inside the TeamFlow server

  const channelName = message.channel.name
  const isBotCommandsChannel = channelName === BOT_COMMANDS_CHANNEL
  const isMentioned = message.mentions.has(BOT_ID)
  const isReplyToBot = await isReplyFromBot(message)
  const reelUrl = extractReelUrl(message.content)

  // Reel-link auto-detect fires independently of the mention gate below (a VA posting a reel
  // link in a platform channel isn't mentioning the bot). Everything else stays mention-gated.
  if (!reelUrl && !isMentioned && !isReplyToBot && !isBotCommandsChannel) return

  const admin = await isDiscordAdmin(message)

  if (!admin && !PUBLIC_BYPASS_CHANNELS.has(channelName)) {
    const topicName = await getTopicNameFromDiscordChannel(message.channelId)
    if (topicName) {
      const access = await canAccessTopicForDiscordUser(message.author.id, topicName)
      if (!access.allowed) {
        // Only talk back if the user actually engaged the bot — stay quiet on a bare reel
        // link posted in a channel the sender isn't authorized for.
        if (isMentioned || isReplyToBot || isBotCommandsChannel) await message.reply(`🚫 ${access.reason}`)
        return
      }
    }
  }

  const member = await ensureDiscordMemberExists(supabase, {
    discord_id: message.author.id,
    name: message.member?.displayName ?? message.author.username,
    discord_username: message.author.username,
  })

  const resolvedText = await resolveMentionsToUsernames(message)

  if (reelUrl) {
    await handleReelLinkMessage(message, resolvedText, reelUrl, member, admin)
    return
  }

  if (!resolvedText && message.attachments.size === 0) return

  await message.channel.sendTyping()

  const channelContext = `The user is messaging from the #${channelName} channel on Discord.`
  const promptText = `${channelContext}\n${resolvedText || 'What should I do with this file?'}`
  const chatKey = `dc:${message.channelId}:${message.author.id}`

  try {
    if (message.attachments.size > 0) {
      const attachment = message.attachments.first()!
      const response = await fetch(attachment.url)
      const buffer = Buffer.from(await response.arrayBuffer())
      const mimeType = attachment.contentType ?? 'application/octet-stream'
      const content = await extractFileContent(buffer, attachment.name, mimeType)
      const isImage = mimeType.startsWith('image/')

      const aiReply = await runAssistant({
        text: promptText,
        channel: 'discord',
        chatKey,
        sender: member,
        isAdmin: admin,
        fileContent: content,
        imageBase64: isImage ? buffer.toString('base64') : undefined,
        imageMimeType: isImage ? mimeType : undefined,
      })
      await sendDiscordReply(message, aiReply)
      return
    }

    const aiReply = await runAssistant({
      text: `${channelContext}\n${resolvedText}`,
      channel: 'discord',
      chatKey,
      sender: member,
      isAdmin: admin,
    })
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
