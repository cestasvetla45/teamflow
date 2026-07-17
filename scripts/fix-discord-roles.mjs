// One-off maintenance script: fixes Discord role permissions, channel permission
// overwrites, category overwrites, and assigns Sahiboh the Full Manager role.
// Run with: node scripts/fix-discord-roles.mjs
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Load .env.local if DISCORD_BOT_TOKEN isn't already in the environment
if (!process.env.DISCORD_BOT_TOKEN) {
  const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of envFile.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const TOKEN = process.env.DISCORD_BOT_TOKEN
if (!TOKEN) throw new Error('DISCORD_BOT_TOKEN not found')

const API = 'https://discord.com/api/v10'
const GUILD_ID = '1527665313175572620'

const ROLES = {
  fullManager: '1527669529763774504',
  twitterManager: '1527669530523078800',
  instagramManager: '1527669531714129980',
  instagramVA: '1527669532129361961',
  twitterVA: '1527669533228404920',
}

// @everyone overwrite id is the guild id
const EVERYONE = GUILD_ID

// Permission bitfields
const MEMBER_PERMS = '68672' // ViewChannel + SendMessages + AddReactions + ReadMessageHistory
const VIEW_SEND = '3072' // ViewChannel + SendMessages
const VIEW_READONLY = '66560' // ViewChannel + ReadMessageHistory
const SEND = '2048'
const VIEW = '1024'

async function discord(method, path, body) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bot ${TOKEN}`,
        'Content-Type': 'application/json',
        'X-Audit-Log-Reason': 'TeamFlow permission fix (TASK 16)',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (res.status === 429) {
      const data = await res.json().catch(() => ({}))
      const wait = (data.retry_after ?? 1) * 1000 + 100
      console.log(`  rate limited, waiting ${wait}ms...`)
      await new Promise((r) => setTimeout(r, wait))
      continue
    }
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`${method} ${path} -> ${res.status}: ${text}`)
    }
    if (res.status === 204) return null
    return res.json()
  }
  throw new Error(`${method} ${path} -> rate limited after 5 attempts`)
}

const overwrite = (id, allow, deny) => ({ id, type: 0, allow, deny })
const roleAllow = (roleId) => overwrite(roleId, MEMBER_PERMS, '0')

// --- Channel permission overwrite plans ---
const MANAGER_ROLES = [ROLES.fullManager, ROLES.twitterManager, ROLES.instagramManager]

const CHANNELS = {
  // name: [id, overwrites]
  general: ['1527665313909571737', [overwrite(EVERYONE, VIEW_SEND, '0')]],
  'bot-commands': ['1527669569836290169', [overwrite(EVERYONE, MEMBER_PERMS, '0')]],
  announcements: [
    '1527669540836606124',
    [overwrite(EVERYONE, VIEW_READONLY, SEND), ...MANAGER_ROLES.map(roleAllow)],
  ],
  sops: [
    '1527669544259293336',
    [overwrite(EVERYONE, VIEW_READONLY, SEND), ...MANAGER_ROLES.map(roleAllow)],
  ],
  'manager-chat': [
    '1527669546419228853',
    [overwrite(EVERYONE, '0', VIEW), ...MANAGER_ROLES.map(roleAllow)],
  ],
  notifications: [
    '1527669548956778537',
    [overwrite(EVERYONE, '0', VIEW), ...MANAGER_ROLES.map(roleAllow)],
  ],
  twitter: [
    '1527669551162986517',
    [
      overwrite(EVERYONE, '0', VIEW),
      roleAllow(ROLES.fullManager),
      roleAllow(ROLES.twitterManager),
      roleAllow(ROLES.twitterVA),
    ],
  ],
  instagram: [
    '1527669552861937704',
    [
      overwrite(EVERYONE, '0', VIEW),
      roleAllow(ROLES.fullManager),
      roleAllow(ROLES.instagramManager),
      roleAllow(ROLES.instagramVA),
    ],
  ],
  reddit: ['1527669554518556776', [overwrite(EVERYONE, '0', VIEW), roleAllow(ROLES.fullManager)]],
  tiktok: ['1527669556250677278', [overwrite(EVERYONE, '0', VIEW), roleAllow(ROLES.fullManager)]],
  youtube: ['1527669558180053053', [overwrite(EVERYONE, '0', VIEW), roleAllow(ROLES.fullManager)]],
  testing: [
    '1527669559899717802',
    [overwrite(EVERYONE, MEMBER_PERMS, '0'), roleAllow(ROLES.fullManager)],
  ],
  'sop-general': [
    '1527669561669718048',
    [overwrite(EVERYONE, VIEW_READONLY, SEND), roleAllow(ROLES.fullManager)],
  ],
  'sop-twitter': [
    '1527669563301429328',
    [
      overwrite(EVERYONE, VIEW_READONLY, SEND),
      roleAllow(ROLES.fullManager),
      roleAllow(ROLES.twitterManager),
    ],
  ],
  'sop-instagram': [
    '1527669565117435934',
    [
      overwrite(EVERYONE, VIEW_READONLY, SEND),
      roleAllow(ROLES.fullManager),
      roleAllow(ROLES.instagramManager),
    ],
  ],
  'sop-tiktok': [
    '1527669566799352000',
    [overwrite(EVERYONE, VIEW_READONLY, SEND), roleAllow(ROLES.fullManager)],
  ],
  'sop-youtube': [
    '1527669568049254461',
    [overwrite(EVERYONE, VIEW_READONLY, SEND), roleAllow(ROLES.fullManager)],
  ],
}

const CATEGORIES = {
  '📋 INFORMATION': '1527669534088237187',
  '🔒 MANAGER CHAT': '1527669534885023826',
  '📱 PLATFORMS': '1527669536357224618',
  '🧪 TESTING': '1527669536961069067',
  '📋 SOPs': '1527669538974339152',
  '🔧 BOT COMMANDS': '1527669539641495724',
}

async function main() {
  // 1. Fix role permissions
  console.log('== Step 1: role permissions ==')
  const rolePerms = {
    [ROLES.fullManager]: '8', // Administrator
    [ROLES.twitterManager]: MEMBER_PERMS,
    [ROLES.instagramManager]: MEMBER_PERMS,
    [ROLES.instagramVA]: MEMBER_PERMS,
    [ROLES.twitterVA]: MEMBER_PERMS,
  }
  for (const [roleId, permissions] of Object.entries(rolePerms)) {
    const role = await discord('PATCH', `/guilds/${GUILD_ID}/roles/${roleId}`, { permissions })
    console.log(`  ${role.name}: permissions=${role.permissions}`)
  }

  // 2. Fix channel permission overwrites
  console.log('== Step 2: channel overwrites ==')
  for (const [name, [id, permission_overwrites]] of Object.entries(CHANNELS)) {
    await discord('PATCH', `/channels/${id}`, { permission_overwrites })
    console.log(`  #${name}: ${permission_overwrites.length} overwrites set`)
  }

  // 3. Remove category overwrites
  console.log('== Step 3: clear category overwrites ==')
  for (const [name, id] of Object.entries(CATEGORIES)) {
    await discord('PATCH', `/channels/${id}`, { permission_overwrites: [] })
    console.log(`  ${name}: overwrites cleared`)
  }

  // 4. Assign Sahiboh the Full Manager role
  console.log('== Step 4: assign Sahiboh Full Manager ==')
  const members = await discord('GET', `/guilds/${GUILD_ID}/members/search?query=sahiboh&limit=5`)
  if (!members.length) throw new Error('No guild member found matching "sahiboh"')
  const sahiboh = members[0]
  console.log(`  found: ${sahiboh.user.username} (${sahiboh.user.id})`)
  await discord('PUT', `/guilds/${GUILD_ID}/members/${sahiboh.user.id}/roles/${ROLES.fullManager}`)
  console.log('  Full Manager role assigned')

  // 5. Verify everything by reading back
  console.log('== Step 5: verify ==')
  let failures = 0

  const roles = await discord('GET', `/guilds/${GUILD_ID}/roles`)
  for (const [roleId, expected] of Object.entries(rolePerms)) {
    const role = roles.find((r) => r.id === roleId)
    const ok = role && role.permissions === expected
    if (!ok) failures++
    console.log(`  role ${role?.name ?? roleId}: permissions=${role?.permissions} ${ok ? 'OK' : `FAIL (want ${expected})`}`)
  }

  const guildChannels = await discord('GET', `/guilds/${GUILD_ID}/channels`)
  for (const [name, [id, expected]] of Object.entries(CHANNELS)) {
    const ch = guildChannels.find((c) => c.id === id)
    const actual = ch?.permission_overwrites ?? []
    const ok =
      actual.length === expected.length &&
      expected.every((e) => actual.some((a) => a.id === e.id && a.allow === e.allow && a.deny === e.deny))
    if (!ok) failures++
    console.log(`  #${name}: ${actual.length} overwrites ${ok ? 'OK' : `FAIL (${JSON.stringify(actual)})`}`)
  }

  for (const [name, id] of Object.entries(CATEGORIES)) {
    const ch = guildChannels.find((c) => c.id === id)
    const ok = ch && (ch.permission_overwrites ?? []).length === 0
    if (!ok) failures++
    console.log(`  category ${name}: ${ch?.permission_overwrites?.length ?? '?'} overwrites ${ok ? 'OK' : 'FAIL'}`)
  }

  const member = await discord('GET', `/guilds/${GUILD_ID}/members/${sahiboh.user.id}`)
  const hasRole = member.roles.includes(ROLES.fullManager)
  if (!hasRole) failures++
  console.log(`  ${sahiboh.user.username} has Full Manager: ${hasRole ? 'OK' : 'FAIL'}`)

  if (failures > 0) {
    console.error(`\n${failures} verification check(s) FAILED`)
    process.exit(1)
  }
  console.log('\nAll checks passed.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
