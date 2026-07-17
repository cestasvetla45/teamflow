import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMemberWorkload, getWorkloadHistory } from '@/lib/workload'

export async function GET(
  request: NextRequest,
  { params }: { params: { memberId: string } }
) {
  try {
    const { memberId } = params
    const supabase = createAdminClient()

    const [workloadResult, history, tasksResult] = await Promise.all([
      getMemberWorkload(memberId).then(
        (workload) => ({ ok: true as const, workload }),
        (error) => ({ ok: false as const, error })
      ),
      getWorkloadHistory(memberId, 7),
      supabase
        .from('tf_tasks')
        .select('id, title, status, priority, due_date, estimated_hours, actual_hours')
        .eq('assignee_id', memberId)
        .not('status', 'in', '(done,blocked)')
        .order('due_date', { ascending: true }),
    ])

    if (!workloadResult.ok) {
      const code = (workloadResult.error as { code?: string })?.code
      if (code === 'PGRST116') {
        return NextResponse.json({ error: 'Member not found' }, { status: 404 })
      }
      throw workloadResult.error
    }
    if (tasksResult.error) throw tasksResult.error

    return NextResponse.json({
      workload: workloadResult.workload,
      current_tasks: tasksResult.data ?? [],
      history,
    })
  } catch (error) {
    console.error('Failed to load member workload:', error)
    return NextResponse.json({ error: 'Failed to load member workload' }, { status: 500 })
  }
}
