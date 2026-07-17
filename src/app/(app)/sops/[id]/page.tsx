'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Archive, Pencil, Send } from 'lucide-react'
import type { Platform, SopCategory, SopVersion, SopWithVersions } from '@/types'
import { cn, platformEmoji, sopCategoryStyle } from '@/lib/utils'
import { renderMarkdown } from '@/lib/markdown'
import { SOPEditor, type SOPEditorValue } from '@/components/SOPEditor'

export default function SOPDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [sop, setSop] = useState<SopWithVersions | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewingVersion, setViewingVersion] = useState<SopVersion | null>(null)

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/sops/${params.id}`)
    if (res.ok) setSop(await res.json())
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  async function handleSave(value: SOPEditorValue & { autoSync: boolean }) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/sops/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to save SOP')
      }
      await load()
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save SOP')
    } finally {
      setSaving(false)
    }
  }

  async function handleSync() {
    setSyncing(true)
    try {
      await fetch(`/api/sops/${params.id}/sync`, { method: 'POST' })
      await load()
    } finally {
      setSyncing(false)
    }
  }

  async function handleArchive() {
    if (!confirm('Archive this SOP? It will be hidden from the active list.')) return
    await fetch(`/api/sops/${params.id}`, { method: 'DELETE' })
    router.push('/sops')
  }

  if (loading || !sop) {
    return <div className="p-5 text-sm text-slate-500">Loading...</div>
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto scrollbar-thin p-5">
        <button
          onClick={() => router.push('/sops')}
          className="mb-4 flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200"
        >
          <ArrowLeft size={14} />
          Back to SOPs
        </button>

        {editing ? (
          <SOPEditor
            initial={{
              title: sop.title,
              content: sop.content,
              category: (sop.category ?? 'general') as SopCategory,
              platform: sop.platform as Platform | null,
              tags: sop.tags ?? [],
            }}
            submitLabel="Save changes"
            saving={saving}
            error={error}
            onSave={handleSave}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-medium capitalize',
                      sopCategoryStyle(sop.category)
                    )}
                  >
                    {sop.category?.replace('_', ' ')}
                  </span>
                  {sop.platform && (
                    <span className="text-xs text-slate-400">
                      {platformEmoji(sop.platform)} {sop.platform}
                    </span>
                  )}
                  <span className="text-xs text-slate-500">v{sop.version}</span>
                </div>
                <h1 className="text-xl font-semibold text-slate-100">{sop.title}</h1>
                {(sop.tags ?? []).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(sop.tags ?? []).map((tag) => (
                      <span key={tag} className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-slate-400">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex shrink-0 gap-2">
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 disabled:opacity-50"
                >
                  <Send size={14} />
                  {syncing ? 'Syncing...' : 'Sync to Telegram'}
                </button>
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
                >
                  <Pencil size={14} />
                  Edit
                </button>
                <button
                  onClick={handleArchive}
                  className="flex items-center gap-1.5 rounded-lg border border-rose-500/40 px-3 py-2 text-sm font-medium text-rose-400 transition-colors hover:bg-rose-500/10"
                >
                  <Archive size={14} />
                </button>
              </div>
            </div>

            <div
              className="prose-sop rounded-xl border border-border bg-surface p-5"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(sop.content) }}
            />
          </>
        )}
      </div>

      {!editing && sop.versions.length > 0 && (
        <div className="w-64 shrink-0 overflow-y-auto scrollbar-thin border-l border-border p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Version history
          </h3>
          <div className="flex flex-col gap-2">
            {sop.versions.map((v) => (
              <button
                key={v.id}
                onClick={() => setViewingVersion(v)}
                className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-left text-xs text-slate-400 transition-colors hover:border-accent/50"
              >
                <div className="font-medium text-slate-300">v{v.version} — {v.title}</div>
                <div className="mt-0.5 text-slate-500">{v.created_at?.slice(0, 10)}</div>
                {v.change_note && <div className="mt-1 italic text-slate-500">{v.change_note}</div>}
              </button>
            ))}
          </div>
        </div>
      )}

      {viewingVersion && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <div className="absolute inset-0" onClick={() => setViewingVersion(null)} />
          <div className="relative z-10 max-h-[80vh] w-full max-w-2xl overflow-y-auto scrollbar-thin rounded-xl border border-border bg-surface p-5 shadow-lg">
            <h2 className="mb-3 text-lg font-semibold text-slate-100">
              v{viewingVersion.version} — {viewingVersion.title}
            </h2>
            <div
              className="prose-sop text-sm"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(viewingVersion.content) }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
