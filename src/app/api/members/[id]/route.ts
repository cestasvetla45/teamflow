import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MEMBER_SELECT = `*, skills:tf_member_skills(*, skill:tf_skills(*))`

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminClient()

  const { data: member, error } = await supabase
    .from('tf_members')
    .select(MEMBER_SELECT)
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  const { data: tasks } = await supabase
    .from('tf_tasks')
    .select('*')
    .eq('assignee_id', params.id)
    .neq('status', 'done')
    .order('due_date', { ascending: true, nullsFirst: false })

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { count: completedCount } = await supabase
    .from('tf_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('assignee_id', params.id)
    .eq('status', 'done')
    .gte('completed_at', thirtyDaysAgo)

  return NextResponse.json({
    ...member,
    current_tasks: tasks ?? [],
    completed_last_30_days: completedCount ?? 0,
  })
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminClient()
  const body = await request.json()

  if (body.action === 'add_skill') {
    const { error } = await supabase.from('tf_member_skills').upsert(
      {
        member_id: params.id,
        skill_id: body.skill_id,
        proficiency_level: body.proficiency_level ?? 3,
      },
      { onConflict: 'member_id,skill_id' }
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (body.action === 'remove_skill') {
    const { error } = await supabase
      .from('tf_member_skills')
      .delete()
      .eq('member_id', params.id)
      .eq('skill_id', body.skill_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (body.action === 'update_skill') {
    const { error } = await supabase
      .from('tf_member_skills')
      .update({ proficiency_level: body.proficiency_level })
      .eq('member_id', params.id)
      .eq('skill_id', body.skill_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const allowed = [
      'name', 'telegram_id', 'telegram_username', 'email', 'role',
      'status', 'max_daily_hours', 'timezone', 'avatar_url',
    ]
    const updates: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) updates[key] = body[key]
    }
    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from('tf_members').update(updates).eq('id', params.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  const { data, error } = await supabase
    .from('tf_members')
    .select(MEMBER_SELECT)
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('tf_members').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
