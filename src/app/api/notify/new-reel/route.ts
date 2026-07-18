import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyDiscordChannel, getDiscordChannelId } from '@/lib/discord-notify'
import { sendDiscordDM } from '@/lib/ai/notify-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const INSTAGRAM_TOPIC = 'instagram'
const MAX_URLS_SHOWN = 3

interface NewReelBody {
  handle: string
  added: number
  urls?: string[]
  va_name?: string
  dry_run?: boolean
}

function authorize(req: NextRequest): boolean {
  const auth = req.headers.get('authorization')
  return !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`
}

function buildMessage(body: NewReelBody): string {
  const lines = [
    `🎬 Auto-detected ${body.added} new reel(s) on @${body.handle} — already added to tracking.`,
  ]

  const urls = (body.urls || []).slice(0, MAX_URLS_SHOWN)
  for (const url of urls) {
    lines.push(url)
  }

  if (body.va_name) {
    lines.push(`(VA: ${body.va_name})`)
  }

  return lines.join('\n')
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: NewReelBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body || typeof body.handle !== 'string' || !body.handle.trim() || typeof body.added !== 'number') {
    return NextResponse.json({ error: 'handle (string) and added (number) are required' }, { status: 400 })
  }

  const message = buildMessage(body)

  // Look up the VA member (exact match first, then substring) regardless of
  // dry_run so the dry-run response can show what would happen.
  let vaMember: { name: string; discord_id: string | null } | null = null
  if (body.va_name) {
    try {
      const supabase = createAdminClient()
      const { data: exact } = await supabase
        .from('tf_members')
        .select('name, discord_id')
        .ilike('name', body.va_name)
        .maybeSingle()

      if (exact) {
        vaMember = exact as { name: string; discord_id: string | null }
      } else {
        const { data: partial } = await supabase
          .from('tf_members')
          .select('name, discord_id')
          .ilike('name', `%${body.va_name}%`)
          .limit(1)
          .maybeSingle()
        if (partial) vaMember = partial as { name: string; discord_id: string | null }
      }
    } catch (err) {
      console.error('Failed to look up VA member for new-reel notification:', err)
    }
  }

  let channelId: string | null = null
  try {
    channelId = await getDiscordChannelId(INSTAGRAM_TOPIC)
  } catch (err) {
    console.error('Failed to look up Discord channel for new-reel notification:', err)
  }

  if (body.dry_run) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      channel_id: channelId,
      va_member: vaMember?.name ?? null,
    })
  }

  // notifyDiscordChannel / sendDiscordDM swallow their own errors (never
  // throw), so these flags reflect "we had a target and attempted the send",
  // not a guaranteed Discord-side delivery receipt.
  let channelSent = false
  let dmSent = false

  if (channelId) {
    try {
      await notifyDiscordChannel(INSTAGRAM_TOPIC, message)
      channelSent = true
    } catch (err) {
      console.error('Failed to notify Discord channel for new reel:', err)
    }
  }

  if (vaMember?.discord_id) {
    try {
      await sendDiscordDM(vaMember.discord_id, message)
      dmSent = true
    } catch (err) {
      console.error('Failed to send Discord DM for new reel:', err)
    }
  }

  return NextResponse.json({ ok: true, notified: { channel: channelSent, dm: dmSent } })
}
