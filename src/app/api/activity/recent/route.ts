import { NextRequest, NextResponse } from 'next/server'
import { getRecentActivity } from '@/lib/activity'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limitParam = searchParams.get('limit')
    const parsedLimit = limitParam ? Number(limitParam) : NaN
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20

    const activity = await getRecentActivity(limit)
    return NextResponse.json({ activity })
  } catch (error) {
    console.error('Failed to load recent activity:', error)
    return NextResponse.json({ error: 'Failed to load recent activity' }, { status: 500 })
  }
}
