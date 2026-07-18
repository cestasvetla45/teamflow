import { NextRequest, NextResponse } from 'next/server'
import nacl from 'tweetnacl'
import { dispatchCommand, type DiscordInteraction } from '@/lib/discord-commands'
import { chunkDiscordMessage } from '@/lib/discord-api'

export const runtime = 'nodejs'

const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY!
const DISCORD_APP_ID = process.env.DISCORD_APP_ID!

// Edits the deferred placeholder response (used by /setup, which can run past the 3s window).
async function editOriginal(interactionToken: string, content: string): Promise<void> {
  await fetch(`https://discord.com/api/v10/webhooks/${DISCORD_APP_ID}/${interactionToken}/messages/@original`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
}

// Posts an additional message tied to this interaction (used to chunk replies past Discord's 2000-char cap).
async function postFollowUp(interactionToken: string, content: string): Promise<void> {
  await fetch(`https://discord.com/api/v10/webhooks/${DISCORD_APP_ID}/${interactionToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, flags: 64 }),
  })
}

// Sends a (possibly long) reply as the initial response's content plus follow-up
// messages for any overflow, so nothing gets silently truncated.
async function sendChunked(interactionToken: string, content: string): Promise<void> {
  const [first, ...rest] = chunkDiscordMessage(content)
  await editOriginal(interactionToken, first)
  for (const chunk of rest) {
    await postFollowUp(interactionToken, chunk)
  }
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
      .then((content) => sendChunked(interaction.token, content))
      .catch((err) => {
        console.error('Discord /setup failed:', err)
        void editOriginal(interaction.token, `❌ Setup failed: ${err instanceof Error ? err.message : 'unknown error'}`)
      })

    return NextResponse.json({ type: 5, data: { flags: 64 } })
  }

  try {
    const content = await dispatchCommand(interaction)
    const [first, ...rest] = chunkDiscordMessage(content)

    if (rest.length > 0) {
      // Fire the overflow chunks as follow-up messages once the initial response lands —
      // can't await them before responding since Discord requires a reply within 3s.
      void (async () => {
        for (const chunk of rest) {
          await postFollowUp(interaction.token, chunk)
        }
      })()
    }

    return NextResponse.json({ type: 4, data: { content: first, flags: 64 } })
  } catch (err) {
    console.error('Discord command failed:', err)
    return NextResponse.json({
      type: 4,
      data: { content: '❌ Something went wrong handling that command.', flags: 64 },
    })
  }
}
