import { createAdminClient } from '@/lib/supabase/admin'
import { editTopicMessage, sendToTopic } from '@/lib/telegram-topics'
import type { Platform, SopCategory, TfSop, TfSopVersion } from '@/types/teamflow'

const supabase = createAdminClient()

const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

export interface SOPWithVersions extends TfSop {
  versions: TfSopVersion[]
}

export async function createSOP(data: {
  title: string
  content: string
  category?: SopCategory
  platform?: Platform | null
  tags?: string[]
  createdBy?: string | null
}): Promise<TfSop> {
  const { data: sop, error } = await supabase
    .from('tf_sops')
    .insert({
      title: data.title,
      content: data.content,
      category: data.category ?? 'general',
      platform: data.platform ?? null,
      tags: data.tags ?? [],
      created_by: data.createdBy ?? null,
    })
    .select('*')
    .single()

  if (error || !sop) throw new Error(`Failed to create SOP: ${error?.message}`)
  return sop as TfSop
}

export async function updateSOP(
  id: string,
  data: {
    title?: string
    content?: string
    category?: SopCategory
    platform?: Platform | null
    tags?: string[]
    changeNote?: string
    editedBy?: string | null
  }
): Promise<TfSop> {
  const { data: existing, error: fetchError } = await supabase
    .from('tf_sops')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !existing) throw new Error(`SOP not found: ${fetchError?.message}`)
  const current = existing as TfSop

  const contentChanged =
    (data.title !== undefined && data.title !== current.title) ||
    (data.content !== undefined && data.content !== current.content)

  if (contentChanged) {
    await supabase.from('tf_sop_versions').insert({
      sop_id: current.id,
      version: current.version,
      title: current.title,
      content: current.content,
      edited_by: data.editedBy ?? null,
      change_note: data.changeNote ?? null,
    })
  }

  const updates: Record<string, unknown> = {}
  if (data.title !== undefined) updates.title = data.title
  if (data.content !== undefined) updates.content = data.content
  if (data.category !== undefined) updates.category = data.category
  if (data.platform !== undefined) updates.platform = data.platform
  if (data.tags !== undefined) updates.tags = data.tags
  if (contentChanged) updates.version = current.version + 1

  const { data: updated, error } = await supabase
    .from('tf_sops')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()

  if (error || !updated) throw new Error(`Failed to update SOP: ${error?.message}`)
  return updated as TfSop
}

export async function listSOPs(filters?: {
  category?: string
  platform?: string
  status?: string
}): Promise<TfSop[]> {
  let query = supabase.from('tf_sops').select('*').order('category', { ascending: true }).order('title', { ascending: true })

  if (filters?.category) query = query.eq('category', filters.category)
  if (filters?.platform) query = query.eq('platform', filters.platform)
  query = query.eq('status', filters?.status ?? 'active')

  const { data, error } = await query
  if (error) throw new Error(`Failed to list SOPs: ${error.message}`)
  return (data as TfSop[]) ?? []
}

export async function getSOP(id: string): Promise<SOPWithVersions> {
  const { data: sop, error } = await supabase.from('tf_sops').select('*').eq('id', id).single()
  if (error || !sop) throw new Error(`SOP not found: ${error?.message}`)

  const { data: versions } = await supabase
    .from('tf_sop_versions')
    .select('*')
    .eq('sop_id', id)
    .order('version', { ascending: false })

  return { ...(sop as TfSop), versions: (versions as TfSopVersion[]) ?? [] }
}

export async function archiveSOP(id: string): Promise<void> {
  const { error } = await supabase.from('tf_sops').update({ status: 'archived' }).eq('id', id)
  if (error) throw new Error(`Failed to archive SOP: ${error.message}`)
}

function formatSOPMessage(sop: TfSop): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const lines = [
    `📋 SOP: ${sop.title} (v${sop.version})`,
    '',
    `Category: ${sop.category}`,
    sop.platform ? `Platform: ${sop.platform}` : null,
    sop.tags.length ? `Tags: ${sop.tags.map((t) => `#${t}`).join(', ')}` : null,
    '',
    '---',
    sop.content,
    '---',
    '',
    `Last updated: ${sop.updated_at.slice(0, 10)}`,
    appUrl ? `View in TeamFlow: ${appUrl}/sops/${sop.id}` : null,
  ]
  return lines.filter((l) => l !== null).join('\n')
}

export async function generateSOPDiff(oldContent: string, newContent: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return 'Content was updated (diff summary unavailable — GEMINI_API_KEY not configured).'

  const prompt = `Compare these two versions of an SOP. Summarize the key changes (additions, removals, modifications) in bullet points. Be concise.

--- OLD VERSION ---
${oldContent}

--- NEW VERSION ---
${newContent}`

  const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
    }),
  })

  if (!res.ok) {
    console.error('Gemini API error (SOP diff):', res.status, await res.text())
    return 'Content was updated (diff summary unavailable).'
  }

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text)
    .filter(Boolean)
    .join(' ')

  return text || 'Content was updated.'
}

export async function syncSOPToTelegram(sopId: string): Promise<void> {
  const { data: sop, error } = await supabase.from('tf_sops').select('*').eq('id', sopId).single()
  if (error || !sop) throw new Error(`SOP not found: ${error?.message}`)

  const message = formatSOPMessage(sop as TfSop)

  if (sop.telegram_message_id) {
    const edited = await editTopicMessage('sops', sop.telegram_message_id, message)
    if (edited) return
  }

  const messageId = await sendToTopic('sops', message)
  if (messageId) {
    await supabase.from('tf_sops').update({ telegram_message_id: messageId }).eq('id', sopId)
  }
}
