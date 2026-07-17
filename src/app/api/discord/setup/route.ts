import { NextRequest, NextResponse } from 'next/server'
import { registerSlashCommands } from '@/lib/discord-api'
import { setupDiscordServer } from '@/lib/discord-setup'

export const runtime = 'nodejs'

function authorize(req: NextRequest): boolean {
  const auth = req.headers.get('authorization')
  const secret = process.env.DISCORD_SETUP_SECRET ?? process.env.CRON_SECRET
  return !!secret && auth === `Bearer ${secret}`
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { guild_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const guildId = body.guild_id
  if (!guildId) {
    return NextResponse.json({ error: 'guild_id is required' }, { status: 400 })
  }

  const [setupResult] = await Promise.all([setupDiscordServer(guildId), registerSlashCommands(guildId)])

  return NextResponse.json({ ok: true, guild_id: guildId, ...setupResult })
}
