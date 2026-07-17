import { NextRequest, NextResponse } from 'next/server'
import nacl from 'tweetnacl'
import { dispatchCommand, type DiscordInteraction } from '@/lib/discord-commands'

export const runtime = 'nodejs'

const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY!
const DISCORD_APP_ID = process.env.DISCORD_APP_ID!
const MAX_CONTENT_LENGTH = 1900

function truncate(content: string): string {
  if (content.length <= MAX_CONTENT_LENGTH) return content
  return `${content.slice(0, MAX_CONTENT_LENGTH)}\n… (truncated)`
}

async function sendFollowUp(interactionToken: string, content: string): Promise<void> {
  await fetch(`https://discord.com/api/v10/webhooks/${DISCORD_APP_ID}/${interactionToken}/messages/@original`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: truncate(content) }),
  })
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get('X-Signature-Ed25519')
  const timestamp = req.headers.get('X-Signature-Timestamp')
  const body = await req.text()

  if (!signature || !timestamp) {
    return new NextResponse('Missing signature headers', { status: 401 })
  }

  const isVerified = nacl.sign.detached.verify(
    Buffer.from(timestamp + body),
    Buffer.from(signature, 'hex'),
    Buffer.from(DISCORD_PUBLIC_KEY, 'hex')
  )

  if (!isVerified) {
    return new NextResponse('Invalid signature', { status: 401 })
  }

  const interaction = JSON.parse(body) as DiscordInteraction & { type: number; token: string }

  if (interaction.type === 1) {
    return NextResponse.json({ type: 1 })
  }

  if (interaction.type !== 2) {
    return NextResponse.json({ error: 'Unhandled interaction type' }, { status: 400 })
  }

  // /setup makes many sequential Discord API calls (roles, categories, channels) —
  // easily over Discord's 3-second interaction response window. Defer immediately,
  // then edit the deferred reply once setup finishes.
  if (interaction.data.name === 'setup') {
    dispatchCommand(interaction)
      .then((content) => sendFollowUp(interaction.token, content))
      .catch((err) => {
        console.error('Discord /setup failed:', err)
        void sendFollowUp(
          interaction.token,
          `❌ Setup failed: ${err instanceof Error ? err.message : 'unknown error'}`
        )
      })

    return NextResponse.json({ type: 5, data: { flags: 64 } })
  }

  try {
    const content = await dispatchCommand(interaction)
    return NextResponse.json({ type: 4, data: { content: truncate(content), flags: 64 } })
  } catch (err) {
    console.error('Discord command failed:', err)
    return NextResponse.json({
      type: 4,
      data: { content: '❌ Something went wrong handling that command.', flags: 64 },
    })
  }
}
