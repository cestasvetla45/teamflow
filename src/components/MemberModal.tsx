'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { Member } from '@/types'

interface MemberModalProps {
  open: boolean
  member?: Member | null
  onClose: () => void
  onSaved: () => void
}

const ROLES = ['admin', 'manager', 'worker'] as const

export function MemberModal({ open, member, onClose, onSaved }: MemberModalProps) {
  const [name, setName] = useState('')
  const [telegramId, setTelegramId] = useState('')
  const [telegramUsername, setTelegramUsername] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<string>('worker')
  const [maxDailyHours, setMaxDailyHours] = useState('8')
  const [timezone, setTimezone] = useState('UTC')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(member?.name ?? '')
    setTelegramId(member?.telegram_id != null ? String(member.telegram_id) : '')
    setTelegramUsername(member?.telegram_username ?? '')
    setEmail(member?.email ?? '')
    setRole(member?.role ?? 'worker')
    setMaxDailyHours(member?.max_daily_hours != null ? String(member.max_daily_hours) : '8')
    setTimezone(member?.timezone ?? 'UTC')
    setError(null)
  }, [open, member])

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Name is required')
      return
    }

    setSubmitting(true)
    setError(null)

    const payload = {
      name: name.trim(),
      telegram_id: telegramId ? Number(telegramId) : null,
      telegram_username: telegramUsername.trim() || null,
      email: email.trim() || null,
      role,
      max_daily_hours: maxDailyHours ? Number(maxDailyHours) : 8,
      timezone: timezone.trim() || 'UTC',
    }

    try {
      const res = await fetch(member ? `/api/members/${member.id}` : '/api/members', {
        method: member ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to save member')
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save member')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">
            {member ? 'Edit Member' : 'Add Member'}
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-slate-200"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Name *</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
              placeholder="Jane Doe"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Telegram ID</label>
              <input
                value={telegramId}
                onChange={(e) => setTelegramId(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
                placeholder="123456789"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Telegram username
              </label>
              <input
                value={telegramUsername}
                onChange={(e) => setTelegramUsername(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
                placeholder="janedoe"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
              placeholder="jane@company.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm capitalize text-slate-200 outline-none focus:border-accent"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r} className="capitalize">
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Max daily hours
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={maxDailyHours}
                onChange={(e) => setMaxDailyHours(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Timezone</label>
            <input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
              placeholder="UTC"
            />
          </div>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {submitting ? 'Saving...' : member ? 'Save changes' : 'Add member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
