import { bot } from '@/lib/bot'
import { createAdminClient } from '@/lib/supabase/admin'
import { createDmChannel, sendMessage } from '@/lib/discord-api'
import { notifyDiscord } from '@/lib/discord-notify'
import { sendToTopic } from '@/lib/telegram-topics'

// Send a DM to the admin on Telegram. Fails silently if the admin has never
// started a chat with the bot (Telegram bots cannot initiate DMs).
export async function notifyAdminTelegram(message: string): Promise<void> {
  const adminId = process.env.ADMIN_TELEGRAM_ID
  if (!adminId) return
  try {
    await bot.telegram.sendMessage(Number(adminId), message)
  } catch (err) {
    console.error('Failed to DM admin on Telegram:', err)
  }
}

// Send a DM to the admin on Discord (opens/reuses the bot's DM channel first).
export async function notifyAdminDiscord(message: string): Promise<void> {
  const adminId = process.env.ADMIN_DISCORD_ID
  if (!adminId) return
  try {
    const channel = await createDmChannel(adminId)
    await sendMessage(channel.id, message)
  } catch (err) {
    console.error('Failed to DM admin on Discord:', err)
  }
}

// Admin Telegram DM + admin Discord DM + Discord #notifications + Telegram
// notifications topic. Each destination fails independently.
export async function notifyAdminEverywhere(message: string): Promise<void> {
  await Promise.all([
    notifyAdminTelegram(message),
    notifyAdminDiscord(message),
    notifyDiscord(message),
    sendToTopic('notifications', message),
  ])
}

async function getMemberContact(
  memberId: string
): Promise<{ telegram_id: number | null; discord_id: string | null } | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('tf_members')
    .select('telegram_id, discord_id')
    .eq('id', memberId)
    .maybeSingle()
  return (data as { telegram_id: number | null; discord_id: string | null } | null) ?? null
}

// Notify a member on Telegram, if they have a telegram_id on file.
export async function notifyAssigneeTelegram(memberId: string, message: string): Promise<void> {
  const member = await getMemberContact(memberId)
  if (!member?.telegram_id) return
  try {
    await bot.telegram.sendMessage(member.telegram_id, message)
  } catch (err) {
    console.error(`Failed to DM member ${memberId} on Telegram:`, err)
  }
}

// Notify a member on Discord, if they have a discord_id on file.
export async function notifyAssigneeDiscord(memberId: string, message: string): Promise<void> {
  const member = await getMemberContact(memberId)
  if (!member?.discord_id) return
  try {
    const channel = await createDmChannel(member.discord_id)
    await sendMessage(channel.id, message)
  } catch (err) {
    console.error(`Failed to DM member ${memberId} on Discord:`, err)
  }
}
