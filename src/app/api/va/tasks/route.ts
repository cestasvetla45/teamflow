import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateVAToken, VA_TOKEN_COOKIE } from '@/lib/va-auth'

const TASK_SELECT = `*, board:tf_boards(id, name)`

export async function GET() {
  const token = cookies().get(VA_TOKEN_COOKIE)?.value
  const member = await validateVAToken(token)
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('tf_tasks')
    .select(TASK_SELECT)
    .eq('assignee_id', member.id)
    .order('due_date', { ascending: true, nullsFirst: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(request: NextRequest) {
  const token = cookies().get(VA_TOKEN_COOKIE)?.value
  const member = await validateVAToken(token)
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const taskId = body.task_id
  const status = body.status

  if (!taskId || !status) {
    return NextResponse.json({ error: 'task_id and status are required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: existing, error: fetchError } = await supabase
    .from('tf_tasks')
    .select('id, status, assignee_id, completed_at')
    .eq('id', taskId)
    .maybeSingle()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }
  if (existing.assignee_id !== member.id) {
    return NextResponse.json({ error: 'You can only update your own tasks' }, { status: 403 })
  }

  const updates: Record<string, unknown> = { status }
  if (status === 'done' && !existing.completed_at) {
    updates.completed_at = new Date().toISOString()
  }

  const { error: updateError } = await supabase.from('tf_tasks').update(updates).eq('id', taskId)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  await supabase.from('tf_task_activity').insert({
    task_id: taskId,
    member_id: member.id,
    action: 'status_changed',
    old_value: existing.status,
    new_value: status,
  })

  const { data, error } = await supabase
    .from('tf_tasks')
    .select(TASK_SELECT)
    .eq('id', taskId)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
