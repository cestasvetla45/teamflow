// Direct-message notification helpers for the AI tool layer.
//
// Self-contained (no import of discord-api.ts / bot.ts at module load time) so
// ai/tools.ts never forms a circular import with bot.ts (bot.ts -> bot-ai.ts ->
// ai/index.ts -> ai/tools.ts -> bot.ts would be circular otherwise). Both
// helpers swallow their own errors — notification failures must never break a
// tool call.

const DISCORD_API = 'https://discord.com/api/v10'

/** POSTs /users/@me/channels then /channels/:id/messages using DISCORD_BOT_TOKEN. */
export async function sendDiscordDM(discordId: string, text: string): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN
  if (!token || !discordId) return

  try {
    const channelRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
      method: 'POST',
      headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient_id: discordId }),
    })
    if (!channelRes.ok) {
      throw new Error(`create DM channel failed (${channelRes.status}): ${await channelRes.text()}`)
    }
    const channel = (await channelRes.json()) as { id: string }

    const msgRes = await fetch(`${DISCORD_API}/channels/${channel.id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
    })
    if (!msgRes.ok) {
      throw new Error(`send DM failed (${msgRes.status}): ${await msgRes.text()}`)
    }
  } catch (err) {
    console.error(`Failed to send Discord DM to ${discordId}:`, err)
  }
}

/** Sends a Telegram DM via the bot's Telegraf instance, dynamically imported to avoid a circular import. */
export async function notifyTelegramDM(telegramId: number, text: string): Promise<void> {
  if (!telegramId) return
  try {
    const { bot } = await import('@/lib/bot')
    await bot.telegram.sendMessage(telegramId, text)
  } catch (err) {
    console.error(`Failed to send Telegram DM to ${telegramId}:`, err)
  }
}

/** Notifies a member on whichever platform(s) they have linked — used for task assignment. */
export async function notifyMemberAssigned(
  member: { telegram_id: number | null; discord_id: string | null },
  text: string
): Promise<void> {
  if (member.telegram_id) await notifyTelegramDM(member.telegram_id, text)
  if (member.discord_id) await sendDiscordDM(member.discord_id, text)
}
