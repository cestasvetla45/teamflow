'use client'

import { useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { useBoardContext } from '@/lib/board-context'
import { MemberCard } from '@/components/MemberCard'
import { MemberModal } from '@/components/MemberModal'

const STATUS_FILTERS = [
  { key: '', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'on_leave', label: 'On Leave' },
]

export default function MembersPage() {
  const { members, reloadMembers } = useBoardContext()
  const [statusFilter, setStatusFilter] = useState('')
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return members.filter((m) => {
      if (statusFilter && m.status !== statusFilter) return false
      if (q && !m.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [members, statusFilter, query])

  return (
    <div className="h-full overflow-y-auto scrollbar-thin p-5">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold text-slate-100">Members</h1>

        <div className="relative ml-auto max-w-xs flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search members..."
            className="w-full rounded-lg border border-border bg-surface-raised py-2 pl-9 pr-3 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-accent"
          />
        </div>

        <div className="flex gap-1 rounded-lg border border-border bg-surface-raised p-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                statusFilter === f.key
                  ? 'bg-accent text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          <Plus size={16} />
          Add Member
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-500">No members found.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((m) => (
            <MemberCard key={m.id} member={m} />
          ))}
        </div>
      )}

      <MemberModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={reloadMembers}
      />
    </div>
  )
}
