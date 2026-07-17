'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, KeyRound, RefreshCw } from 'lucide-react'

export function VAAccessPanel({ memberId }: { memberId: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/va/tokens/${memberId}`)
    if (res.ok) {
      const data = await res.json()
      setUrl(data.url ?? null)
    }
    setLoading(false)
  }, [memberId])

  useEffect(() => {
    load()
  }, [load])

  async function generate() {
    setGenerating(true)
    try {
      const res = await fetch('/api/va/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: memberId }),
      })
      if (res.ok) {
        const data = await res.json()
        setUrl(data.url)
      }
    } finally {
      setGenerating(false)
    }
  }

  async function copy() {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-200">
        <KeyRound size={15} />
        VA Access
      </h2>

      {loading ? (
        <p className="text-xs text-slate-500">Loading...</p>
      ) : url ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-xs text-slate-300">{url}</span>
            <button
              onClick={copy}
              className="shrink-0 text-slate-400 hover:text-slate-200"
              title="Copy link"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            </button>
          </div>
          <button
            onClick={generate}
            disabled={generating}
            className="flex w-fit items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/5 disabled:opacity-50"
          >
            <RefreshCw size={12} />
            {generating ? 'Regenerating...' : 'Regenerate link'}
          </button>
          <p className="text-[11px] text-slate-600">
            Regenerating invalidates the previous link.
          </p>
        </div>
      ) : (
        <div>
          <p className="mb-3 text-xs text-slate-500">
            This member doesn&apos;t have a VA access link yet.
          </p>
          <button
            onClick={generate}
            disabled={generating}
            className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {generating ? 'Generating...' : 'Generate Access Link'}
          </button>
        </div>
      )}
    </div>
  )
}
