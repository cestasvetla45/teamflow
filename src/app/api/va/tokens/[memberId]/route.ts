import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasAdminAccess } from '@/lib/va-auth'

function buildAccessUrl(request: NextRequest, token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  return `${base.replace(/\/$/, '')}/va?token=${token}`
}

export async function GET(request: NextRequest, { params }: { params: { memberId: string } }) {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('tf_va_tokens')
    .select('token, created_at, last_used_at')
    .eq('member_id', params.memberId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ token: null })

  return NextResponse.json({
    token: data.token,
    url: buildAccessUrl(request, data.token),
    created_at: data.created_at,
    last_used_at: data.last_used_at,
  })
}
