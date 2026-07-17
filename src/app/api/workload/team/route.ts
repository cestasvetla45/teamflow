import { NextRequest, NextResponse } from 'next/server'
import { getTeamWorkload, getWorkloadHistory } from '@/lib/workload'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const daysParam = searchParams.get('days')
    const days = daysParam ? Number(daysParam) : null

    const team = await getTeamWorkload()

    if (days && Number.isFinite(days) && days > 0) {
      const teamWithHistory = await Promise.all(
        team.map(async (member) => ({
          ...member,
          history: await getWorkloadHistory(member.member_id, days),
        }))
      )
      return NextResponse.json({ team: teamWithHistory })
    }

    return NextResponse.json({ team })
  } catch (error) {
    console.error('Failed to load team workload:', error)
    return NextResponse.json({ error: 'Failed to load team workload' }, { status: 500 })
  }
}
