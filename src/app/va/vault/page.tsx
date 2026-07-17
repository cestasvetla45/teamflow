import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { Settings } from 'lucide-react'
import { isAdminMember, validateVAToken, VA_TOKEN_COOKIE } from '@/lib/va-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { VaultItemCard } from '@/components/va/VaultItemCard'
import { VaultMemberSelect } from '@/components/va/VaultMemberSelect'

export const dynamic = 'force-dynamic'

export default async function VAVaultPage({
  searchParams,
}: {
  searchParams: { member?: string }
}) {
  const token = cookies().get(VA_TOKEN_COOKIE)?.value
  const member = await validateVAToken(token)
  if (!member) redirect('/va')

  const admin = isAdminMember(member)
  const supabase = createAdminClient()

  let members: { id: string; name: string }[] = []
  if (admin) {
    const { data } = await supabase
      .from('tf_members')
      .select('id, name')
      .order('name', { ascending: true })
    members = data ?? []
  }

  const targetId = admin && searchParams.member ? searchParams.member : member.id
  const targetName = admin ? members.find((m) => m.id === targetId)?.name : member.name

  const { data: items } = await supabase
    .from('tf_va_vault')
    .select('*')
    .eq('member_id', targetId)
    .order('created_at', { ascending: true })

  return (
    <div className="p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-100">
          {admin ? `${targetName ?? 'Member'}'s Vault` : 'My Vault'}
        </h1>

        <div className="flex items-center gap-2">
          {admin && members.length > 0 && (
            <VaultMemberSelect members={members} selected={targetId} />
          )}
          {admin && (
            <Link
              href={`/va/vault/${targetId}`}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              <Settings size={14} />
              Manage
            </Link>
          )}
        </div>
      </div>

      {!items || items.length === 0 ? (
        <p className="text-sm text-slate-500">No vault items yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((item) => (
            <VaultItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
