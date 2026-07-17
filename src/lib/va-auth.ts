import { randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import { createAdminClient } from './supabase/admin'
import type { Member } from '@/types'

export const VA_TOKEN_COOKIE = 'va_token'

function generateTokenString(): string {
  return randomBytes(16).toString('hex')
}

/** Always issues a fresh token for the member, invalidating any previous ones. */
export async function generateVAToken(memberId: string): Promise<string> {
  const supabase = createAdminClient()
  const token = generateTokenString()

  await supabase.from('tf_va_tokens').delete().eq('member_id', memberId)

  const { error } = await supabase.from('tf_va_tokens').insert({
    member_id: memberId,
    token,
  })
  if (error) throw error

  return token
}

/** Returns the member's current token, creating one if none exists. */
export async function getOrCreateToken(memberId: string): Promise<string> {
  const supabase = createAdminClient()

  const { data: existing } = await supabase
    .from('tf_va_tokens')
    .select('token, expires_at')
    .eq('member_id', memberId)
    .maybeSingle()

  if (existing && (!existing.expires_at || new Date(existing.expires_at) > new Date())) {
    return existing.token
  }

  return generateVAToken(memberId)
}

/** Validates a token and returns the associated member, or null if invalid/expired. */
export async function validateVAToken(token: string | undefined | null): Promise<Member | null> {
  if (!token) return null

  const supabase = createAdminClient()

  const { data: tokenRow, error } = await supabase
    .from('tf_va_tokens')
    .select('id, member_id, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (error || !tokenRow) return null
  if (tokenRow.expires_at && new Date(tokenRow.expires_at) <= new Date()) return null

  const { data: member, error: memberError } = await supabase
    .from('tf_members')
    .select('*')
    .eq('id', tokenRow.member_id)
    .maybeSingle()

  if (memberError || !member) return null

  await supabase
    .from('tf_va_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', tokenRow.id)

  return member
}

export function isAdminMember(member: Member | null): boolean {
  return member?.role === 'admin'
}

/**
 * Vault/token mutation routes are reachable from two places: the unauthenticated
 * main admin app (no va_token cookie present, so the request is trusted the same
 * way every other /api route in this app is) and a VA's own /va/vault view when
 * that VA's role is 'admin'. This only rejects the latter case when the token
 * doesn't resolve to an admin member.
 */
export async function hasAdminAccess(): Promise<boolean> {
  const token = cookies().get(VA_TOKEN_COOKIE)?.value
  if (!token) return true
  const member = await validateVAToken(token)
  return isAdminMember(member)
}
