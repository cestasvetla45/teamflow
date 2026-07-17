import { NextRequest, NextResponse } from 'next/server'

// Debug endpoint — logs all incoming webhook data to a file so we can read the chat ID
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    
    // Log the full update to a file we can read
    const fs = await import('fs/promises')
    const logEntry = {
      timestamp: new Date().toISOString(),
      body,
    }
    
    // Append to /tmp/telegram_debug.log
    await fs.appendFile('/tmp/telegram_debug.log', JSON.stringify(logEntry, null, 2) + '\n---\n')
    
    // Extract chat info for easy reading
    const msg = body.message || body.edited_message || body.channel_post || {}
    const chat = msg.chat || {}
    
    const summary = {
      update_id: body.update_id,
      chat_id: chat.id,
      chat_type: chat.type,
      chat_title: chat.title,
      chat_username: chat.username,
      from: msg.from?.username || msg.from?.first_name,
      text: msg.text,
      has_forward: !!msg.forward_origin || !!msg.forward_from_chat,
      forward_chat_id: msg.forward_from_chat?.id,
      forward_chat_title: msg.forward_from_chat?.title,
      forward_chat_type: msg.forward_from_chat?.type,
    }
    
    await fs.appendFile('/tmp/telegram_chat_ids.log', JSON.stringify(summary) + '\n')
    
    return NextResponse.json({ ok: true, summary })
  } catch {
    return NextResponse.json({ ok: true }) // Always return 200 to Telegram
  }
}

export async function GET() {
  try {
    const fs = await import('fs/promises')
    const log = await fs.readFile('/tmp/telegram_chat_ids.log', 'utf8').catch(() => 'No messages logged yet')
    return NextResponse.json({ logs: log })
  } catch {
    return NextResponse.json({ logs: 'No messages logged yet' })
  }
}
