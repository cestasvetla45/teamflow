'use client'

import { useRouter } from 'next/navigation'

export function VaultMemberSelect({
  members,
  selected,
}: {
  members: { id: string; name: string }[]
  selected: string
}) {
  const router = useRouter()

  return (
    <select
      value={selected}
      onChange={(e) => router.push(`/va/vault?member=${e.target.value}`)}
      className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
    >
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  )
}
