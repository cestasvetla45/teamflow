import { NextRequest, NextResponse } from 'next/server'
import { bot } from '@/lib/bot'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  let update: unknown
  try {
    update = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  // Don't await — respond to Telegram immediately so the webhook doesn't time out.
  bot.handleUpdate(update as Parameters<typeof bot.handleUpdate>[0]).catch((err) => {
    console.error('Error handling Telegram update:', err)
  })

  return NextResponse.json({ ok: true })
}
