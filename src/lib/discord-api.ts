const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN!
const DISCORD_APP_ID = process.env.DISCORD_APP_ID!
const DISCORD_API = 'https://discord.com/api/v10'

// Permission bit flags we actually use (Discord permissions are a 53-bit field
// passed around as a decimal string). See https://discord.com/developers/docs/topics/permissions
export const PERMISSIONS = {
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  READ_MESSAGE_HISTORY: 1n << 16n,
  MANAGE_CHANNELS: 1n << 4n,
  MANAGE_ROLES: 1n << 28n,
}

export function combinePermissions(flags: bigint[]): string {
  return flags.reduce((acc, f) => acc | f, 0n).toString()
}

async function discordCall<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${DISCORD_API}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${DISCORD_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Discord API ${method} ${path} failed (${res.status}): ${errText}`)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export interface DiscordRole {
  id: string
  name: string
  permissions: string
}

export interface DiscordChannel {
  id: string
  name: string
  type: number
  parent_id: string | null
}

export interface PermissionOverwrite {
  id: string // role or member id
  type: 0 | 1 // 0 = role, 1 = member
  allow?: string
  deny?: string
}

export async function createRole(
  guildId: string,
  name: string,
  opts?: { permissions?: string; color?: number; mentionable?: boolean }
): Promise<DiscordRole> {
  return discordCall<DiscordRole>('POST', `/guilds/${guildId}/roles`, {
    name,
    permissions: opts?.permissions ?? '0',
    color: opts?.color ?? 0,
    mentionable: opts?.mentionable ?? true,
  })
}

export async function getGuildRoles(guildId: string): Promise<DiscordRole[]> {
  return discordCall<DiscordRole[]>('GET', `/guilds/${guildId}/roles`)
}

export async function getGuildChannels(guildId: string): Promise<DiscordChannel[]> {
  return discordCall<DiscordChannel[]>('GET', `/guilds/${guildId}/channels`)
}

export async function createCategory(guildId: string, name: string): Promise<DiscordChannel> {
  return discordCall<DiscordChannel>('POST', `/guilds/${guildId}/channels`, { name, type: 4 })
}

export async function createTextChannel(
  guildId: string,
  name: string,
  categoryId?: string,
  permissionOverwrites?: PermissionOverwrite[]
): Promise<DiscordChannel> {
  return discordCall<DiscordChannel>('POST', `/guilds/${guildId}/channels`, {
    name,
    type: 0,
    parent_id: categoryId ?? null,
    permission_overwrites: permissionOverwrites ?? [],
  })
}

export async function setChannelPermission(
  channelId: string,
  overwriteId: string,
  type: 0 | 1,
  allow: string,
  deny: string
): Promise<void> {
  await discordCall('PUT', `/channels/${channelId}/permissions/${overwriteId}`, { type, allow, deny })
}

// DMs are sent through a DM channel owned by the bot — the API is
// POST /users/@me/channels with the recipient's id (not /users/{id}/channels).
// Discord returns the existing DM channel if one is already open.
export async function createDmChannel(userId: string): Promise<DiscordChannel> {
  return discordCall<DiscordChannel>('POST', '/users/@me/channels', { recipient_id: userId })
}

export async function sendMessage(
  channelId: string,
  content: string,
  embeds?: unknown[],
  components?: unknown[]
): Promise<{ id: string }> {
  return discordCall<{ id: string }>('POST', `/channels/${channelId}/messages`, { content, embeds, components })
}

export async function editMessage(channelId: string, messageId: string, content: string): Promise<void> {
  await discordCall('PATCH', `/channels/${channelId}/messages/${messageId}`, { content })
}

export async function assignRole(guildId: string, userId: string, roleId: string): Promise<void> {
  await discordCall('PUT', `/guilds/${guildId}/members/${userId}/roles/${roleId}`)
}

export async function removeRole(guildId: string, userId: string, roleId: string): Promise<void> {
  await discordCall('DELETE', `/guilds/${guildId}/members/${userId}/roles/${roleId}`)
}

export interface DiscordGuild {
  id: string
  name: string
  owner_id: string
}

/** Used for the "guild owner is always an admin" fallback in the admin gate. */
export async function getGuild(guildId: string): Promise<DiscordGuild> {
  return discordCall<DiscordGuild>('GET', `/guilds/${guildId}`)
}

// ─── Message chunking (Discord's hard cap is 2000 chars per message) ──────
const DISCORD_CHUNK_LIMIT = 1900

/** Splits long text on paragraph breaks (falling back to hard slicing) so no chunk exceeds the limit. */
export function chunkDiscordMessage(text: string, limit: number = DISCORD_CHUNK_LIMIT): string[] {
  if (text.length <= limit) return [text]

  const chunks: string[] = []
  let current = ''
  for (const paragraph of text.split('\n\n')) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph
    if (candidate.length > limit) {
      if (current) chunks.push(current)
      if (paragraph.length > limit) {
        // A single paragraph is itself too long — hard-slice it.
        for (let i = 0; i < paragraph.length; i += limit) chunks.push(paragraph.slice(i, i + limit))
        current = ''
      } else {
        current = paragraph
      }
    } else {
      current = candidate
    }
  }
  if (current) chunks.push(current)
  return chunks
}

/** Sends a DM to a Discord user by id — opens/reuses a DM channel then posts the message. */
export async function sendDiscordDM(discordId: string, text: string): Promise<void> {
  try {
    const channel = await createDmChannel(discordId)
    for (const chunk of chunkDiscordMessage(text)) {
      await sendMessage(channel.id, chunk)
    }
  } catch (err) {
    console.error(`Failed to send Discord DM to ${discordId}:`, err)
  }
}

// ─── Slash command registration ────────────────────────────────────────────
// Plain REST JSON — no discord.js Client/gateway needed since we never hold a
// persistent connection (interactions arrive via the webhook route instead).

const SLASH_COMMANDS = [
  { name: 'mytasks', description: 'Show your tasks' },
  { name: 'myworkload', description: 'Show your workload' },
  { name: 'mydone', description: 'Show your completed tasks (last 7 days)' },
  { name: 'teams', description: 'List all teams' },
  { name: 'myteam', description: 'Show your team' },
  { name: 'sops', description: 'List all SOPs' },
  {
    name: 'who',
    description: 'Find available members with a skill',
    options: [{ name: 'skill', description: 'Skill name', type: 3, required: true }],
  },
  {
    name: 'addtask',
    description: 'Create a task (admin)',
    options: [
      { name: 'title', description: 'Task title', type: 3, required: true },
      { name: 'assignee', description: 'Assign to', type: 6, required: false },
      {
        name: 'priority',
        description: 'Priority',
        type: 3,
        required: false,
        choices: ['low', 'medium', 'high', 'urgent'].map((v) => ({ name: v, value: v })),
      },
      { name: 'due_date', description: 'YYYY-MM-DD', type: 3, required: false },
      {
        name: 'platform',
        description: 'Platform',
        type: 3,
        required: false,
        choices: ['twitter', 'reddit', 'instagram', 'tiktok', 'youtube'].map((v) => ({ name: v, value: v })),
      },
    ],
  },
  {
    name: 'done',
    description: 'Mark your task as complete',
    options: [{ name: 'id', description: 'Task ID prefix', type: 3, required: true }],
  },
  {
    name: 'start',
    description: 'Start a task (move to in progress)',
    options: [{ name: 'id', description: 'Task ID prefix', type: 3, required: true }],
  },
  { name: 'status', description: 'Board status summary' },
  { name: 'overdue', description: 'List overdue tasks' },
  {
    name: 'addmember',
    description: 'Add a member (admin)',
    options: [
      { name: 'user', description: 'Discord user', type: 6, required: true },
      { name: 'team', description: 'Team name', type: 3, required: false },
    ],
  },
  {
    name: 'addteam',
    description: 'Create a team (admin)',
    options: [{ name: 'name', description: 'Team name', type: 3, required: true }],
  },
  {
    name: 'assignrole',
    description: "Assign a Discord role to a team (admin)",
    options: [
      { name: 'team', description: 'Team name', type: 3, required: true },
      { name: 'role', description: 'Discord role', type: 8, required: true },
    ],
  },
  { name: 'setup', description: 'Auto-create server structure (admin) — creates channels, roles, categories' },
  { name: 'help', description: 'Show all commands' },

  // ── Fun ──────────────────────────────────────────────────────────────────
  { name: 'gif', description: 'Post a GIF' },
  { name: 'gifbutton', description: 'Post a persistent button that sends the GIF (admin)' },

  // ── Tasks (admin, mirrors ai/tools.ts) ──────────────────────────────────
  {
    name: 'task',
    description: 'Show full details on any task, including attachments and activity',
    options: [{ name: 'query', description: 'Task title or id prefix', type: 3, required: true }],
  },
  {
    name: 'complete',
    description: 'Mark any task as done (admin)',
    options: [{ name: 'query', description: 'Task title or id prefix', type: 3, required: true }],
  },
  {
    name: 'assign',
    description: 'Assign a task to a member (admin)',
    options: [
      { name: 'query', description: 'Task title or id prefix', type: 3, required: true },
      { name: 'member', description: 'Member to assign', type: 6, required: true },
    ],
  },
  {
    name: 'reassign',
    description: 'Reassign a task to a different member (admin)',
    options: [
      { name: 'query', description: 'Task title or id prefix', type: 3, required: true },
      { name: 'member', description: 'Member to assign', type: 6, required: true },
    ],
  },
  {
    name: 'update',
    description: 'Update fields on a task (admin)',
    options: [
      { name: 'query', description: 'Task title or id prefix', type: 3, required: true },
      { name: 'title', description: 'New title', type: 3, required: false },
      { name: 'description', description: 'New description', type: 3, required: false },
      { name: 'priority', description: 'Priority', type: 3, required: false, choices: ['low', 'medium', 'high', 'urgent'].map((v) => ({ name: v, value: v })) },
      { name: 'platform', description: 'Platform', type: 3, required: false, choices: ['twitter', 'reddit', 'instagram', 'tiktok', 'youtube'].map((v) => ({ name: v, value: v })) },
      { name: 'status', description: 'Status', type: 3, required: false, choices: ['todo', 'in_progress', 'review', 'done', 'blocked'].map((v) => ({ name: v, value: v })) },
      { name: 'due_date', description: 'Natural date like "tomorrow" or an ISO date', type: 3, required: false },
      { name: 'estimated_hours', description: 'Estimated hours', type: 10, required: false },
      { name: 'assignee', description: 'Reassign to', type: 6, required: false },
    ],
  },
  {
    name: 'deltask',
    description: 'Permanently delete a task (admin)',
    options: [{ name: 'query', description: 'Task title or id prefix', type: 3, required: true }],
  },
  {
    name: 'attach',
    description: 'Attach a link to a task (admin)',
    options: [
      { name: 'query', description: 'Task title or id prefix', type: 3, required: true },
      { name: 'url', description: 'Link URL', type: 3, required: true },
      { name: 'title', description: 'Attachment title', type: 3, required: false },
    ],
  },
  {
    name: 'attachments',
    description: 'List attachments on a task (admin)',
    options: [{ name: 'query', description: 'Task title or id prefix', type: 3, required: true }],
  },
  {
    name: 'recurring',
    description: 'Make a task recur on a schedule (admin)',
    options: [
      { name: 'query', description: 'Task title or id prefix', type: 3, required: true },
      { name: 'pattern', description: 'Recurrence pattern', type: 3, required: true, choices: ['daily', 'weekly', 'weekday'].map((v) => ({ name: v, value: v })) },
    ],
  },
  {
    name: 'stoprecurring',
    description: 'Stop a task from recurring (admin)',
    options: [{ name: 'query', description: 'Task title or id prefix', type: 3, required: true }],
  },
  {
    name: 'search',
    description: 'Search tasks by title or description',
    options: [{ name: 'query', description: 'Search text', type: 3, required: true }],
  },

  // ── Members / skills (admin) ────────────────────────────────────────────
  { name: 'members', description: 'List all team members (admin)' },
  {
    name: 'member',
    description: 'Get full details on one member (admin)',
    options: [{ name: 'user', description: 'Member', type: 6, required: true }],
  },
  { name: 'skills', description: 'List the skills catalog (admin)' },
  {
    name: 'addskill',
    description: 'Assign a skill to a member (admin)',
    options: [
      { name: 'member', description: 'Member', type: 6, required: true },
      { name: 'skill', description: 'Skill name', type: 3, required: true },
      { name: 'proficiency', description: '1-5, defaults to 3', type: 4, required: false },
    ],
  },
  {
    name: 'removeskill',
    description: 'Remove a skill from a member (admin)',
    options: [
      { name: 'member', description: 'Member', type: 6, required: true },
      { name: 'skill', description: 'Skill name', type: 3, required: true },
    ],
  },

  // ── Boards (admin) ──────────────────────────────────────────────────────
  { name: 'boards', description: 'List all task boards (admin)' },
  {
    name: 'addboard',
    description: 'Create a new task board (admin)',
    options: [
      { name: 'name', description: 'Board name', type: 3, required: true },
      { name: 'description', description: 'Board description', type: 3, required: false },
    ],
  },

  // ── Insight ──────────────────────────────────────────────────────────────
  { name: 'stats', description: 'Team-wide stats: tasks by status, overdue, completed today/this week (admin)' },
  { name: 'workload', description: "Every active member's booked vs max hours (admin)" },
  {
    name: 'free',
    description: 'Recommend the best available member, optionally by skill',
    options: [{ name: 'skill', description: 'Skill name', type: 3, required: false }],
  },

  // ── Reel Lab bridge ──────────────────────────────────────────────────────
  {
    name: 'vatodo',
    description: 'Show the Instagram VA daily checklist',
    options: [{ name: 'handle', description: 'Account handle', type: 3, required: false }],
  },
  {
    name: 'logreel',
    description: 'Log a posted Instagram reel/post',
    options: [
      { name: 'url', description: 'Instagram reel/post URL', type: 3, required: true },
      { name: 'handle', description: 'Account handle (defaults to your active assignment)', type: 3, required: false },
    ],
  },

  // ── Vault / self-service ─────────────────────────────────────────────────
  { name: 'myvault', description: 'List your own vault items' },
  {
    name: 'pause',
    description: 'Move one of your tasks back to To Do',
    options: [{ name: 'id', description: 'Task ID prefix', type: 3, required: true }],
  },

  // ── Topic access (admin) ────────────────────────────────────────────────
  {
    name: 'granttopic',
    description: 'Grant a team access to a topic (admin)',
    options: [
      { name: 'topic', description: 'Topic name', type: 3, required: true },
      { name: 'team', description: 'Team name', type: 3, required: true },
    ],
  },
  {
    name: 'revoketopic',
    description: "Revoke a team's access to a topic (admin)",
    options: [
      { name: 'topic', description: 'Topic name', type: 3, required: true },
      { name: 'team', description: 'Team name', type: 3, required: true },
    ],
  },
  { name: 'topicaccess', description: 'List which teams have access to which topics (admin)' },
]

export async function registerSlashCommands(guildId: string): Promise<void> {
  await discordCall('PUT', `/applications/${DISCORD_APP_ID}/guilds/${guildId}/commands`, SLASH_COMMANDS)
}
