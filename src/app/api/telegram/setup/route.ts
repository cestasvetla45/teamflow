import { NextRequest, NextResponse } from 'next/server'
import { setWebhook } from '@/lib/bot-init'

export const runtime = 'nodejs'

const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'teamfloww_bot'

export async function GET() {
  return NextResponse.json({
    bot: `@${BOT_USERNAME}`,
    group_setup: [
      `1. Add @${BOT_USERNAME} to the group.`,
      '2. In @BotFather, run /setprivacy, select this bot, and choose "Disable" — otherwise the bot cannot read group messages to detect @mentions.',
      '3. Make the bot an admin in the group (recommended, also satisfies the privacy requirement).',
      `4. @mention the bot to use it, e.g. "@${BOT_USERNAME} who has free time?" — the bot ignores group messages it isn't @mentioned or replied to.`,
    ],
    note: 'Privacy mode cannot be toggled via the Bot API — it must be set manually in @BotFather.',
  })
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = process.env.TELEGRAM_WEBHOOK_URL
  if (!url) {
    return NextResponse.json({ error: 'TELEGRAM_WEBHOOK_URL is not set' }, { status: 500 })
  }

  await setWebhook(url)
  return NextResponse.json({ ok: true, url })
}
