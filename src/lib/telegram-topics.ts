import { createAdminClient } from '@/lib/supabase/admin'
import type { TfTelegramTopic } from '@/types/teamflow'

const supabase = createAdminClient()
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`

export const DEFAULT_TOPICS = [
  { name: 'general', title: '👥 General', description: 'General VA chat — everyone can post' },
  { name: 'manager_chat', title: '🔒 Manager Chat', description: 'Admins and managers only' },
  { name: 'notifications', title: '📢 Notifications', description: 'Automated TeamFlow bot notifications' },
  { name: 'twitter', title: '🐦 Twitter', description: 'Twitter/X platform tasks and discussion' },
  { name: 'reddit', title: '📺 Reddit', description: 'Reddit platform tasks and discussion' },
  { name: 'instagram', title: '📸 Instagram', description: 'Instagram platform tasks and discussion' },
  { name: 'tiktok', title: '🎵 TikTok', description: 'TikTok platform tasks and discussion' },
  { name: 'youtube', title: '▶️ YouTube', description: 'YouTube platform tasks and discussion' },
  { name: 'testing', title: '🧪 Testing', description: 'Test things here' },
  { name: 'sops', title: '📋 SOPs', description: 'Standard Operating Procedures — synced with TeamFlow app' },
] as const

async function callTelegramApi<T = unknown>(method: string, params: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(`Telegram API ${method} failed: ${data.description ?? 'unknown error'}`)
  return data.result as T
}

export async function createForumTopics(chatId: number): Promise<{ name: string; message_thread_id: number | null }[]> {
  const created: { name: string; message_thread_id: number | null }[] = []

  for (const topic of DEFAULT_TOPICS) {
    let threadId: number | null = null
    try {
      const result = await callTelegramApi<{ message_thread_id: number }>('createForumTopic', {
        chat_id: chatId,
        name: topic.title,
      })
      threadId = result.message_thread_id
    } catch (err) {
      console.error(`Failed to create forum topic "${topic.name}":`, err)
      continue
    }

    await supabase.from('tf_telegram_topics').upsert(
      {
        topic_name: topic.name,
        chat_id: chatId,
        message_thread_id: threadId,
        description: topic.description,
      },
      { onConflict: 'topic_name' }
    )

    created.push({ name: topic.name, message_thread_id: threadId })
  }

  return created
}

export async function getTopicThread(
  topicName: string
): Promise<{ chat_id: number | null; message_thread_id: number | null } | null> {
  const { data } = await supabase
    .from('tf_telegram_topics')
    .select('chat_id, message_thread_id')
    .eq('topic_name', topicName)
    .maybeSingle()

  return (data as Pick<TfTelegramTopic, 'chat_id' | 'message_thread_id'>) ?? null
}

export async function sendToTopic(
  topicName: string,
  text: string,
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2'
): Promise<number | null> {
  const topic = await getTopicThread(topicName)
  if (!topic || topic.chat_id == null) {
    console.error(`No Telegram topic configured for "${topicName}". Run /api/telegram/setup-topics first.`)
    return null
  }

  try {
    const result = await callTelegramApi<{ message_id: number }>('sendMessage', {
      chat_id: topic.chat_id,
      ...(topic.message_thread_id ? { message_thread_id: topic.message_thread_id } : {}),
      text,
      ...(parseMode ? { parse_mode: parseMode } : {}),
    })
    return result.message_id
  } catch (err) {
    console.error(`Failed to send message to topic "${topicName}":`, err)
    return null
  }
}

// Posted to a topic whenever a team is granted access, so its members know to
// scroll up and read the topic's history.
export async function announceTopicAccessGranted(topicName: string, teamName: string): Promise<void> {
  await sendToTopic(topicName, `🔓 Access granted: ${teamName} can now see this topic's history and post here.`)
}

/**
 * The Bot API has no method to control "Chat history for new members" — that's a
 * supergroup-level setting (MTProto: togglePreHistoryHidden) only exposed through
 * the Telegram client apps, not to bots. `setChatPermissions` only controls default
 * member permissions (sending messages/media/etc.), not history visibility, so it
 * can't be used as a substitute.
 *
 * Manual step required once per group, by a human admin:
 *   Group → Edit → Chat History for New Members → Visible
 *
 * Until that's set, members who are newly granted topic access won't be able to
 * scroll up past the point they joined — announceTopicAccessGranted() above is the
 * best we can do from the bot side.
 */
export const CHAT_HISTORY_VISIBILITY_INSTRUCTIONS =
  'ℹ️ One-time manual setup: in the group, go to Edit → Chat History for New Members → Visible. ' +
  "This lets newly-added team members read a topic's past messages (the Bot API has no method for this)."

export async function editTopicMessage(
  topicName: string,
  messageId: number,
  text: string,
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2'
): Promise<boolean> {
  const topic = await getTopicThread(topicName)
  if (!topic || topic.chat_id == null) return false

  try {
    await callTelegramApi('editMessageText', {
      chat_id: topic.chat_id,
      message_id: messageId,
      text,
      ...(parseMode ? { parse_mode: parseMode } : {}),
    })
    return true
  } catch (err) {
    console.error(`Failed to edit message in topic "${topicName}":`, err)
    return false
  }
}
