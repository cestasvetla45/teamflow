import { createAdminClient } from './supabase/admin'
import type { Database } from '@/types/database'

export type Member = Database['public']['Tables']['tf_members']['Row']

export async function getPositionForStatus(boardId: string, status: string): Promise<number> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('tf_tasks')
    .select('position')
    .eq('board_id', boardId)
    .eq('status', status)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data?.position ?? -1) + 1
}

export async function reorderTasks(boardId: string, status: string): Promise<void> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('tf_tasks')
    .select('id, position')
    .eq('board_id', boardId)
    .eq('status', status)
    .order('position', { ascending: true })
  if (error) throw error
  if (!data || data.length === 0) return

  const updates = data
    .map((task, index) => ({ id: task.id, position: index, changed: task.position !== index }))
    .filter((task) => task.changed)

  await Promise.all(
    updates.map((task) =>
      supabase.from('tf_tasks').update({ position: task.position }).eq('id', task.id)
    )
  )
}

export async function getMemberByTelegramId(telegramId: number): Promise<Member | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('tf_members')
    .select('*')
    .eq('telegram_id', telegramId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function getMemberByUsername(username: string): Promise<Member | null> {
  const supabase = createAdminClient()
  const cleaned = username.replace(/^@/, '')
  const { data, error } = await supabase
    .from('tf_members')
    .select('*')
    .ilike('telegram_username', cleaned)
    .maybeSingle()
  if (error) throw error
  return data
}

export interface TelegramUserInput {
  id: number
  username?: string
  first_name?: string
  last_name?: string
}

export async function ensureMemberExists(telegramUser: TelegramUserInput): Promise<Member> {
  const existing = await getMemberByTelegramId(telegramUser.id)
  if (existing) return existing

  const supabase = createAdminClient()
  const name =
    [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ') ||
    telegramUser.username ||
    `User ${telegramUser.id}`

  const { data, error } = await supabase
    .from('tf_members')
    .insert({
      telegram_id: telegramUser.id,
      telegram_username: telegramUser.username ?? null,
      name,
      role: 'worker',
      status: 'active',
    })
    .select()
    .single()
  if (error) throw error
  return data
}
