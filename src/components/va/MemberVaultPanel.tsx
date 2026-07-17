'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import type { VaultItem } from '@/types'
import { VaultManager } from '@/components/va/VaultManager'

export function MemberVaultPanel({ memberId }: { memberId: string }) {
  const [items, setItems] = useState<VaultItem[] | null>(null)

  useEffect(() => {
    fetch(`/api/va/vault?member_id=${memberId}`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setItems)
  }, [memberId])

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-200">
        <ShieldCheck size={15} />
        Vault
      </h2>

      {items === null ? (
        <p className="text-xs text-slate-500">Loading...</p>
      ) : (
        <VaultManager memberId={memberId} initialItems={items} />
      )}
    </div>
  )
}
