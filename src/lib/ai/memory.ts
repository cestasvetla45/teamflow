// Conversation memory for the AI assistant — persists Gemini `contents` turns
// per chat_key in tf_conversations (channel text, chat_key text unique, messages
// jsonb, updated_at), so a chat can pick up context across messages/requests.

import { createAdminClient } from '@/lib/supabase/admin'
import type { GeminiContent, GeminiPart } from './gemini'

const supabase = createAdminClient()

// "turns" = entries in the Gemini `contents` array (one per user or model turn).
export const MAX_STORED_TURNS = 30

function stripInlineData(parts: GeminiPart[]): GeminiPart[] {
  return parts
    .filter((p) => !p.inlineData)
    .map((p) => ({ ...p }))
}

/** Drops image/file blobs before persisting — keeps text + function call/response parts only. */
export function sanitizeContentsForStorage(contents: GeminiContent[]): GeminiContent[] {
  return contents
    .map((c) => ({ role: c.role, parts: stripInlineData(c.parts) }))
    .filter((c) => c.parts.length > 0)
    .slice(-MAX_STORED_TURNS)
}

export async function loadConversation(channel: string, chatKey: string): Promise<GeminiContent[]> {
  try {
    const { data, error } = await supabase
      .from('tf_conversations')
      .select('messages')
      .eq('chat_key', chatKey)
      .maybeSingle()

    if (error) {
      console.error(`Failed to load conversation memory for ${chatKey}:`, error)
      return []
    }
    if (!data) return []
    const messages = data.messages as GeminiContent[] | null
    if (!Array.isArray(messages)) return []
    return messages.slice(-MAX_STORED_TURNS)
  } catch (err) {
    console.error(`Failed to load conversation memory for ${chatKey}:`, err)
    return []
  }
}

/**
 * Persists the conversation turns for this chat. MUST be awaited by the caller — history is
 * only useful for the next turn's context (follow-ups like "did you mark it done?") if the
 * write actually lands before the next request reads it. Any failure (thrown error or a
 * Supabase-returned error object, which does NOT throw) is logged in full so silent memory
 * loss is visible in the logs instead of just manifesting as "the bot forgot".
 */
export async function saveConversation(channel: string, chatKey: string, contents: GeminiContent[]): Promise<void> {
  try {
    const trimmed = sanitizeContentsForStorage(contents)
    const { error } = await supabase.from('tf_conversations').upsert(
      {
        channel,
        chat_key: chatKey,
        messages: trimmed,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'chat_key' }
    )
    if (error) {
      console.error(`Failed to save conversation memory for ${chatKey}:`, error)
    }
  } catch (err) {
    console.error(`Failed to save conversation memory for ${chatKey}:`, err)
  }
}
