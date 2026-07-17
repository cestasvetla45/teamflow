import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyTaskCompleted } from '@/lib/teamflow-db'

const TASK_DETAIL_SELECT = `
  *,
  assignee:tf_members!tf_tasks_assignee_id_fkey(*),
  created_by_member:tf_members!tf_tasks_created_by_fkey(*)
`

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminClient()

  const { data: task, error } = await supabase
    .from('tf_tasks')
    .select(TASK_DETAIL_SELECT)
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  const { data: activity } = await supabase
    .from('tf_task_activity')
    .select('*, member:tf_members!tf_task_activity_member_id_fkey(*)')
    .eq('task_id', params.id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ ...task, activity: activity ?? [] })
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminClient()
  const body = await request.json()

  const { data: existing, error: fetchError } = await supabase
    .from('tf_tasks')
    .select('*')
    .eq('id', params.id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  const updates: Record<string, unknown> = {}
  const activityEntries: { action: string; old_value: string | null; new_value: string | null }[] = []

  const trackable = [
    'title', 'description', 'status', 'priority', 'assignee_id',
    'due_date', 'estimated_hours', 'actual_hours', 'tags', 'position', 'platform',
  ] as const

  for (const key of trackable) {
    if (key in body && body[key] !== existing[key]) {
      updates[key] = body[key]
      if (key === 'status') {
        activityEntries.push({ action: 'status_changed', old_value: existing.status, new_value: body.status })
        if (body.status === 'done' && !existing.completed_at) {
          updates.completed_at = new Date().toISOString()
        }
      } else if (key === 'assignee_id') {
        activityEntries.push({ action: 'assigned', old_value: existing.assignee_id, new_value: body.assignee_id })
      }
    }
  }

  if (body.comment) {
    activityEntries.push({ action: 'commented', old_value: null, new_value: body.comment })
  }

  if (Object.keys(updates).length > 0) {
    const { error: updateError } = await supabase
      .from('tf_tasks')
      .update(updates)
      .eq('id', params.id)

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  if (activityEntries.length > 0) {
    await supabase.from('tf_task_activity').insert(
      activityEntries.map((entry) => ({
        task_id: params.id,
        member_id: body.actor_id ?? null,
        ...entry,
      }))
    )
  }

  const { data, error } = await supabase
    .from('tf_tasks')
    .select(TASK_DETAIL_SELECT)
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (body.status === 'done' && existing.status !== 'done') {
    await notifyTaskCompleted(data, data.assignee?.name ?? null)
  }

  return NextResponse.json(data)
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('tf_tasks').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
