import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MEMBER_SELECT = `*, skills:tf_member_skills(*, skill:tf_skills(*))`

export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('tf_members')
    .select(MEMBER_SELECT)
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: tokens } = await supabase.from('tf_va_tokens').select('member_id')
  const withTokens = new Set((tokens ?? []).map((t) => t.member_id))
  const enriched = (data ?? []).map((member) => ({
    ...member,
    has_va_token: withTokens.has(member.id),
  }))

  return NextResponse.json(enriched)
}

export async function POST(request: NextRequest) {
  const supabase = createAdminClient()
  const body = await request.json()

  if (!body.name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('tf_members')
    .insert({
      name: body.name,
      telegram_id: body.telegram_id ?? null,
      telegram_username: body.telegram_username ?? null,
      email: body.email ?? null,
      role: body.role ?? 'worker',
      max_daily_hours: body.max_daily_hours ?? 8,
      timezone: body.timezone ?? 'UTC',
      avatar_url: body.avatar_url ?? null,
    })
    .select(MEMBER_SELECT)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
