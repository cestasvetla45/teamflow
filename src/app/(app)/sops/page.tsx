'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import type { Sop } from '@/types'
import { PLATFORMS, SOP_CATEGORIES } from '@/types'
import { cn, platformEmoji, sopCategoryStyle } from '@/lib/utils'

export default function SOPsPage() {
  const [sops, setSops] = useState<Sop[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [platform, setPlatform] = useState('')
  const [status, setStatus] = useState('active')

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (category) params.set('category', category)
    if (platform) params.set('platform', platform)
    if (status) params.set('status', status)
    const res = await fetch(`/api/sops?${params.toString()}`)
    if (res.ok) setSops(await res.json())
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, platform, status])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sops
    return sops.filter(
      (s) => s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q)
    )
  }, [sops, search])

  return (
    <div className="h-full overflow-y-auto scrollbar-thin p-5">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">SOPs</h1>
        <Link
          href="/sops/new"
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          <Plus size={16} />
          Create SOP
        </Link>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title or content..."
          className="w-64 rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-accent"
        />

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm capitalize text-slate-300 outline-none focus:border-accent"
        >
          <option value="">All categories</option>
          {SOP_CATEGORIES.map((c) => (
            <option key={c} value={c} className="capitalize">
              {c.replace('_', ' ')}
            </option>
          ))}
        </select>

        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-accent"
        >
          <option value="">All platforms</option>
          {PLATFORMS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.emoji} {p.label}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm capitalize text-slate-300 outline-none focus:border-accent"
        >
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-500">No SOPs found.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((sop) => (
            <Link
              key={sop.id}
              href={`/sops/${sop.id}`}
              className="flex flex-col rounded-xl border border-border bg-surface p-4 transition-colors duration-200 hover:border-accent/50"
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={cn(
                    'rounded-full px-2.5 py-1 text-xs font-medium capitalize',
                    sopCategoryStyle(sop.category)
                  )}
                >
                  {sop.category?.replace('_', ' ')}
                </span>
                {sop.platform && <span className="text-base">{platformEmoji(sop.platform)}</span>}
              </div>
              <h3 className="mt-3 text-sm font-semibold text-slate-100">{sop.title}</h3>
              <p className="mt-1 line-clamp-2 text-xs text-slate-500">{sop.content}</p>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>v{sop.version}</span>
                <span>{sop.updated_at?.slice(0, 10)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
