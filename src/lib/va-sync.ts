import { createAdminClient } from '@/lib/supabase/admin'
import type { TfMember, TfTeam } from '@/types/teamflow'

type AdminClient = ReturnType<typeof createAdminClient>

export interface VaSyncResult {
  profilesSynced: string[]
  usersSynced: string[]
  skippedNoTelegramId: string[]
  errors: string[]
}

// Maps a member's TeamFlow teams to Reel Lab roles.
// va_profiles roles: va | senior_va | manager. telegram_users roles: admin | content | va.
function rolesForTeams(teamNames: string[]): { profileRole: string; userRole: string } {
  const isManager = teamNames.some((t) => t.toLowerCase().includes('manager'))
  return isManager ? { profileRole: 'manager', userRole: 'content' } : { profileRole: 'va', userRole: 'va' }
}

/**
 * Syncs active TeamFlow members into Reel Lab's va_profiles and telegram_users
 * tables (same shared Supabase project). Members without a telegram_id are
 * skipped — the bot captures IDs as members interact (/syncids nudges them).
 */
export async function syncMembersToReelLab(supabase: AdminClient): Promise<VaSyncResult> {
  const result: VaSyncResult = { profilesSynced: [], usersSynced: [], skippedNoTelegramId: [], errors: [] }

  const [{ data: members }, { data: memberTeams }, { data: teams }] = await Promise.all([
    supabase.from('tf_members').select('*').eq('status', 'active'),
    supabase.from('tf_member_teams').select('member_id, team_id'),
    supabase.from('tf_teams').select('*'),
  ])

  const allTeams = (teams as TfTeam[]) ?? []
  const teamRows = (memberTeams as { member_id: string; team_id: string }[]) ?? []

  for (const member of (members as TfMember[]) ?? []) {
    if (!member.telegram_id) {
      result.skippedNoTelegramId.push(member.name)
      continue
    }

    const teamIds = teamRows.filter((r) => r.member_id === member.id).map((r) => r.team_id)
    const teamNames = allTeams.filter((t) => teamIds.includes(t.id)).map((t) => t.name)
    const { profileRole, userRole } = rolesForTeams(teamNames)

    // va_profiles has no unique constraint we can rely on — manual upsert by
    // telegram_id first, then by name.
    try {
      const { data: byTid } = await supabase
        .from('va_profiles')
        .select('id')
        .eq('telegram_id', member.telegram_id)
        .limit(1)
      let profileId: string | undefined = (byTid as { id: string }[] | null)?.[0]?.id

      if (!profileId) {
        const { data: byName } = await supabase
          .from('va_profiles')
          .select('id')
          .ilike('name', member.name)
          .limit(1)
        profileId = (byName as { id: string }[] | null)?.[0]?.id
      }

      if (profileId) {
        const { error } = await supabase
          .from('va_profiles')
          .update({ name: member.name, telegram_id: member.telegram_id, role: profileRole, is_active: true, updated_at: new Date().toISOString() })
          .eq('id', profileId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('va_profiles')
          .insert({ name: member.name, telegram_id: member.telegram_id, role: profileRole, max_accounts: 15, is_active: true })
        if (error) throw error
      }
      result.profilesSynced.push(member.name)
    } catch (err) {
      result.errors.push(`${member.name} (va_profiles): ${err instanceof Error ? err.message : String(err)}`)
    }

    // telegram_users is keyed by telegram_id. Never downgrade an existing admin.
    try {
      const { data: existing } = await supabase
        .from('telegram_users')
        .select('telegram_id, role')
        .eq('telegram_id', member.telegram_id)
        .limit(1)
      const existingRole = (existing as { role: string }[] | null)?.[0]?.role
      const finalRole = existingRole === 'admin' ? 'admin' : userRole

      const { error } = await supabase.from('telegram_users').upsert(
        {
          telegram_id: member.telegram_id,
          username: member.telegram_username ?? null,
          first_name: member.name,
          role: finalRole,
          is_active: true,
          added_by: 'teamflow-sync',
        },
        { onConflict: 'telegram_id' }
      )
      if (error) throw error
      result.usersSynced.push(member.name)
    } catch (err) {
      result.errors.push(`${member.name} (telegram_users): ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return result
}

export function formatVaSyncResult(result: VaSyncResult): string {
  const lines = ['🔄 TeamFlow → Reel Lab sync complete', '']
  lines.push(`✅ VA profiles synced: ${result.profilesSynced.length}${result.profilesSynced.length ? ` (${result.profilesSynced.join(', ')})` : ''}`)
  lines.push(`✅ Telegram users synced: ${result.usersSynced.length}`)
  if (result.skippedNoTelegramId.length > 0) {
    lines.push('', `⚠️ Skipped (no Telegram ID yet): ${result.skippedNoTelegramId.join(', ')}`)
    lines.push('Ask them to message the bot once, or run /syncids.')
  }
  if (result.errors.length > 0) {
    lines.push('', `❌ Errors:`, ...result.errors.map((e) => `  • ${e}`))
  }
  return lines.join('\n')
}
