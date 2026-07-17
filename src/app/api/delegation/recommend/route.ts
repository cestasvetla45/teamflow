import { NextRequest, NextResponse } from 'next/server'
import { findBestAssignee } from '@/lib/delegation'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { task_title, skill_name, board_id } = body ?? {}

    if (!task_title || typeof task_title !== 'string') {
      return NextResponse.json({ error: 'task_title is required' }, { status: 400 })
    }

    const candidates = await findBestAssignee(skill_name, board_id)
    return NextResponse.json({ candidates })
  } catch (error) {
    console.error('Failed to recommend assignee:', error)
    return NextResponse.json({ error: 'Failed to recommend assignee' }, { status: 500 })
  }
}
