import { createAdminClient } from '@/lib/supabase/admin'
import { sendMessage } from '@/lib/discord-api'

const supabase = createAdminClient()

export async function getDiscordChannelId(topicName: string): Promise<string | null> {
  const { data } = await supabase
    .from('tf_telegram_topics')
    .select('discord_channel_id')
    .eq('topic_name', topicName)
    .maybeSingle()
  return (data?.discord_channel_id as string | undefined) ?? null
}

export async function notifyDiscordChannel(topicName: string, message: string): Promise<void> {
  const channelId = await getDiscordChannelId(topicName)
  if (!channelId) return

  try {
    await sendMessage(channelId, message)
  } catch (err) {
    console.error(`Failed to send Discord message to topic "${topicName}":`, err)
  }
}

export async function notifyDiscord(message: string): Promise<void> {
  await notifyDiscordChannel('notifications', message)
}
