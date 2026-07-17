import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasAdminAccess } from '@/lib/va-auth'

const VAULT_FIELDS = [
  'item_type', 'name', 'url', 'username', 'password', 'api_key',
  'proxy_address', 'proxy_port', 'proxy_username', 'proxy_password', 'notes',
] as const

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}
  for (const key of VAULT_FIELDS) {
    if (key in body) updates[key] = body[key]
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('tf_va_vault')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const supabase = createAdminClient()
  const { error } = await supabase.from('tf_va_vault').delete().eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
