import { NextRequest, NextResponse } from 'next/server'
import { generateVAToken, hasAdminAccess } from '@/lib/va-auth'

function buildAccessUrl(request: NextRequest, token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  return `${base.replace(/\/$/, '')}/va?token=${token}`
}

export async function POST(request: NextRequest) {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  if (!body.member_id) {
    return NextResponse.json({ error: 'member_id is required' }, { status: 400 })
  }

  const token = await generateVAToken(body.member_id)
  return NextResponse.json({ token, url: buildAccessUrl(request, token) }, { status: 201 })
}
