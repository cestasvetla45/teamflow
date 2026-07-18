// Thin compatibility wrappers over src/lib/ai/index.ts's runAssistant, kept so
// existing call sites (src/lib/bot.ts, src/worker/discord-worker.ts) don't need
// to change. All real logic — Gemini protocol, tools, memory, context — lives
// in src/lib/ai/*.
//
// NOTE (chatKey derivation): these wrapper signatures are fixed by existing
// call sites and don't carry a chat_id/thread_id or a channel flag — only
// `sender` and `isAdmin`. To give ai/memory.ts a stable per-conversation key
// without changing call sites, we infer the channel from which id is present
// on `sender` (telegram_id vs discord_id) and key conversation memory per
// *member* (`tg:<telegram_id>` / `dc:<discord_id>`) rather than per physical
// chat/thread. In practice each member talks to the bot from one place, so
// this behaves like per-chat memory; an unregistered sender falls back to an
// anonymous, unkeyed conversation (no persisted memory across turns).

import type { TfMember } from '@/types/teamflow'
import { runAssistant } from '@/lib/ai'

interface CallerOpts {
  sender: TfMember | null
  isAdmin: boolean
}

function chatKeyFor(sender: TfMember | null): { channel: 'telegram' | 'discord'; chatKey: string } {
  if (sender?.telegram_id) return { channel: 'telegram', chatKey: `tg:${sender.telegram_id}` }
  if (sender?.discord_id) return { channel: 'discord', chatKey: `dc:${sender.discord_id}` }
  return { channel: 'telegram', chatKey: `anon:${sender?.id ?? 'unknown'}` }
}

export async function generateAIResponse(message: string, opts: CallerOpts): Promise<string> {
  const { channel, chatKey } = chatKeyFor(opts.sender)
  return runAssistant({
    text: message,
    channel,
    chatKey,
    sender: opts.sender,
    isAdmin: opts.isAdmin,
  })
}

export async function generateAIResponseWithImage(
  message: string,
  imageBase64: string,
  imageMimeType: string,
  opts: CallerOpts
): Promise<string> {
  const { channel, chatKey } = chatKeyFor(opts.sender)
  return runAssistant({
    text: message,
    channel,
    chatKey,
    sender: opts.sender,
    isAdmin: opts.isAdmin,
    imageBase64,
    imageMimeType,
  })
}

export async function generateAIResponseWithFile(
  message: string,
  fileContent: string,
  imageBase64: string | undefined,
  imageMimeType: string | undefined,
  opts: CallerOpts
): Promise<string> {
  const { channel, chatKey } = chatKeyFor(opts.sender)
  return runAssistant({
    text: message,
    channel,
    chatKey,
    sender: opts.sender,
    isAdmin: opts.isAdmin,
    fileContent,
    imageBase64,
    imageMimeType,
  })
}
