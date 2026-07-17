'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Workflow } from 'lucide-react'

export function VALoginForm({ invalid }: { invalid?: boolean }) {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(
    invalid ? 'That access link is invalid or has expired.' : null
  )
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token.trim()) return
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/va/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Invalid access token')
      }
      router.push('/va/dashboard')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid access token')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 text-center">
      <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-white">
        <Workflow size={20} />
      </div>
      <h1 className="mb-1 text-lg font-semibold text-slate-100">TeamFlow VA Access</h1>
      <p className="mb-5 text-sm text-slate-500">
        Enter the access token your admin sent you.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-left">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Access token</label>
          <div className="relative">
            <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              autoFocus
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your token"
              className="w-full rounded-lg border border-border bg-surface-raised py-2 pl-9 pr-3 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-accent"
            />
          </div>
        </div>

        {error && <p className="text-sm text-rose-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !token.trim()}
          className="mt-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {submitting ? 'Checking...' : 'Continue'}
        </button>
      </form>

      <p className="mt-5 text-xs text-slate-600">
        Don&apos;t have access? Contact your admin for an invite link.
      </p>
    </div>
  )
}
