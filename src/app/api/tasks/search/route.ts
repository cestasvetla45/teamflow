import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Escape characters that are structurally significant in PostgREST's
// comma-separated `or=()` filter syntax before interpolating user input.
function escapeForOrFilter(value: string): string {
  return value.replace(/[%,()*]/g, (char) => `\\${char}`)
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')
    const status = searchParams.get('status')
    const assignee = searchParams.get('assignee')
    const priority = searchParams.get('priority')
    const overdue = searchParams.get('overdue')

    const supabase = createAdminClient()
    let query = supabase.from('tf_tasks').select('*, assignee:tf_members(id, name, avatar_url)')

    if (q) {
      const escaped = escapeForOrFilter(q)
      query = query.or(`title.ilike.%${escaped}%,description.ilike.%${escaped}%`)
    }
    if (status) query = query.eq('status', status)
    if (assignee) query = query.eq('assignee_id', assignee)
    if (priority) query = query.eq('priority', priority)
    if (overdue === 'true') {
      query = query.lt('due_date', new Date().toISOString()).not('status', 'in', '(done,blocked)')
    }

    const { data, error } = await query.order('created_at', { ascending: false })
    if (error) throw error

    return NextResponse.json({ tasks: data ?? [] })
  } catch (error) {
    console.error('Failed to search tasks:', error)
    return NextResponse.json({ error: 'Failed to search tasks' }, { status: 500 })
  }
}
