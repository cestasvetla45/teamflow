import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasAdminAccess, isAdminMember, validateVAToken, VA_TOKEN_COOKIE } from '@/lib/va-auth'

const VAULT_FIELDS = [
  'item_type', 'name', 'url', 'username', 'password', 'api_key',
  'proxy_address', 'proxy_port', 'proxy_username', 'proxy_password', 'notes',
] as const

export async function GET(request: NextRequest) {
  const token = cookies().get(VA_TOKEN_COOKIE)?.value
  const requestedMemberId = request.nextUrl.searchParams.get('member_id')

  let targetMemberId: string | null
  if (token) {
    // Called from a VA's own /va/vault view — scope to self unless the caller is an admin.
    const member = await validateVAToken(token)
    if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    targetMemberId = isAdminMember(member) && requestedMemberId ? requestedMemberId : member.id
  } else {
    // Called from the (unauthenticated) main admin app, same trust model as other /api routes.
    if (!requestedMemberId) {
      return NextResponse.json({ error: 'member_id is required' }, { status: 400 })
    }
    targetMemberId = requestedMemberId
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('tf_va_vault')
    .select('*')
    .eq('member_id', targetMemberId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  if (!body.member_id || !body.name) {
    return NextResponse.json({ error: 'member_id and name are required' }, { status: 400 })
  }

  const payload: Record<string, unknown> = { member_id: body.member_id }
  for (const key of VAULT_FIELDS) {
    if (key in body) payload[key] = body[key]
  }
  if (!payload.item_type) payload.item_type = 'account'

  const supabase = createAdminClient()
  const { data, error } = await supabase.from('tf_va_vault').insert(payload).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
