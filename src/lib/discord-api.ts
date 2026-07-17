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
  embeds?: unknown[]
): Promise<{ id: string }> {
  return discordCall<{ id: string }>('POST', `/channels/${channelId}/messages`, { content, embeds })
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
]

export async function registerSlashCommands(guildId: string): Promise<void> {
  await discordCall('PUT', `/applications/${DISCORD_APP_ID}/guilds/${guildId}/commands`, SLASH_COMMANDS)
}
