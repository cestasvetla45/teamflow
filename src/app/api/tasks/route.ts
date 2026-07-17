import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyTaskAssigned } from '@/lib/teamflow-db'

const TASK_SELECT = `*, assignee:tf_members!tf_tasks_assignee_id_fkey(*)`

export async function GET(request: NextRequest) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(request.url)
  const boardId = searchParams.get('board_id')
  const assigneeId = searchParams.get('assignee_id')
  const status = searchParams.get('status')

  let query = supabase
    .from('tf_tasks')
    .select(TASK_SELECT)
    .order('position', { ascending: true })

  if (boardId) query = query.eq('board_id', boardId)
  if (assigneeId) query = query.eq('assignee_id', assigneeId)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = createAdminClient()
  const body = await request.json()

  if (!body.title || !body.board_id) {
    return NextResponse.json({ error: 'title and board_id are required' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('tf_tasks')
    .select('position')
    .eq('board_id', body.board_id)
    .eq('status', body.status ?? 'todo')
    .order('position', { ascending: false })
    .limit(1)

  const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 0

  const { data, error } = await supabase
    .from('tf_tasks')
    .insert({
      title: body.title,
      description: body.description ?? null,
      status: body.status ?? 'todo',
      priority: body.priority ?? 'medium',
      board_id: body.board_id,
      assignee_id: body.assignee_id ?? null,
      created_by: body.created_by ?? null,
      due_date: body.due_date ?? null,
      estimated_hours: body.estimated_hours ?? null,
      tags: body.tags ?? [],
      platform: body.platform ?? null,
      position: nextPosition,
    })
    .select(TASK_SELECT)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('tf_task_activity').insert({
    task_id: data.id,
    member_id: body.created_by ?? null,
    action: 'created',
    new_value: data.title,
  })

  if (data.assignee?.name) {
    await notifyTaskAssigned(data, data.assignee.name)
  }

  return NextResponse.json(data, { status: 201 })
}
