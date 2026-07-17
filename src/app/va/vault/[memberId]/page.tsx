import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { isAdminMember, validateVAToken, VA_TOKEN_COOKIE } from '@/lib/va-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { VaultManager } from '@/components/va/VaultManager'

export const dynamic = 'force-dynamic'

export default async function VAVaultManagePage({
  params,
}: {
  params: { memberId: string }
}) {
  const token = cookies().get(VA_TOKEN_COOKIE)?.value
  const member = await validateVAToken(token)
  if (!member) redirect('/va')
  if (!isAdminMember(member)) redirect('/va/vault')

  const supabase = createAdminClient()

  const { data: targetMember, error: memberError } = await supabase
    .from('tf_members')
    .select('id, name')
    .eq('id', params.memberId)
    .maybeSingle()

  if (memberError || !targetMember) redirect('/va/vault')

  const { data: items } = await supabase
    .from('tf_va_vault')
    .select('*')
    .eq('member_id', params.memberId)
    .order('created_at', { ascending: true })

  return (
    <div className="p-6">
      <Link
        href={`/va/vault?member=${targetMember.id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200"
      >
        <ArrowLeft size={15} />
        Back to vault
      </Link>

      <h1 className="mb-5 text-lg font-semibold text-slate-100">
        Manage {targetMember.name}&apos;s Vault
      </h1>

      <VaultManager memberId={targetMember.id} initialItems={items ?? []} />
    </div>
  )
}
