import { NextRequest, NextResponse } from 'next/server'
import { createForumTopics } from '@/lib/telegram-topics'

export const runtime = 'nodejs'

function authorize(req: NextRequest): boolean {
  const auth = req.headers.get('authorization')
  return !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const chatId = Number(body.chat_id)
  if (!chatId) {
    return NextResponse.json({ error: 'chat_id is required' }, { status: 400 })
  }

  try {
    const topics = await createForumTopics(chatId)
    return NextResponse.json({ ok: true, chat_id: chatId, topics })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to create topics' }, { status: 500 })
  }
}
