import { bot } from '@/lib/bot'

export async function setWebhook(url: string): Promise<void> {
  await bot.telegram.setWebhook(url)
}
