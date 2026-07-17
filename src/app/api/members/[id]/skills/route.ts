import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('tf_member_skills')
      .select('id, proficiency_level, skill:tf_skills(id, name, category, description)')
      .eq('member_id', params.id)
    if (error) throw error

    return NextResponse.json({ skills: data ?? [] })
  } catch (error) {
    console.error('Failed to load member skills:', error)
    return NextResponse.json({ error: 'Failed to load member skills' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json()
    const { skill_id, proficiency_level } = body ?? {}
    if (!skill_id) {
      return NextResponse.json({ error: 'skill_id is required' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('tf_member_skills')
      .upsert(
        { member_id: params.id, skill_id, proficiency_level: proficiency_level ?? 3 },
        { onConflict: 'member_id,skill_id' }
      )
      .select()
      .single()
    if (error) throw error

    return NextResponse.json({ skill: data }, { status: 201 })
  } catch (error) {
    console.error('Failed to add member skill:', error)
    return NextResponse.json({ error: 'Failed to add member skill' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json()
    const { skill_id } = body ?? {}
    if (!skill_id) {
      return NextResponse.json({ error: 'skill_id is required' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { error } = await supabase
      .from('tf_member_skills')
      .delete()
      .eq('member_id', params.id)
      .eq('skill_id', skill_id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to remove member skill:', error)
    return NextResponse.json({ error: 'Failed to remove member skill' }, { status: 500 })
  }
}
