'use client'

import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { VAULT_ITEM_TYPES } from '@/types'
import type { VaultItem, VaultItemType } from '@/types'
import { VaultItemCard } from '@/components/va/VaultItemCard'

const EMPTY_FORM = {
  item_type: 'account' as VaultItemType,
  name: '',
  url: '',
  username: '',
  password: '',
  api_key: '',
  proxy_address: '',
  proxy_port: '',
  proxy_username: '',
  proxy_password: '',
  notes: '',
}

export function VaultManager({
  memberId,
  initialItems,
}: {
  memberId: string
  initialItems: VaultItem[]
}) {
  const [items, setItems] = useState(initialItems)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openAdd() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError(null)
    setFormOpen(true)
  }

  function openEdit(item: VaultItem) {
    setEditingId(item.id)
    setForm({
      item_type: (item.item_type as VaultItemType) ?? 'account',
      name: item.name,
      url: item.url ?? '',
      username: item.username ?? '',
      password: item.password ?? '',
      api_key: item.api_key ?? '',
      proxy_address: item.proxy_address ?? '',
      proxy_port: item.proxy_port ?? '',
      proxy_username: item.proxy_username ?? '',
      proxy_password: item.proxy_password ?? '',
      notes: item.notes ?? '',
    })
    setError(null)
    setFormOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('Name is required')
      return
    }

    setSubmitting(true)
    setError(null)

    const payload = {
      ...form,
      name: form.name.trim(),
      member_id: memberId,
    }

    try {
      const res = await fetch(editingId ? `/api/va/vault/${editingId}` : '/api/va/vault', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to save vault item')
      }
      const saved: VaultItem = await res.json()
      setItems((prev) =>
        editingId ? prev.map((i) => (i.id === saved.id ? saved : i)) : [...prev, saved]
      )
      setFormOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save vault item')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/va/vault/${id}`, { method: 'DELETE' })
    if (res.ok) setItems((prev) => prev.filter((i) => i.id !== id))
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          <Plus size={16} />
          Add Item
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-slate-500">No vault items yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((item) => (
            <VaultItemCard
              key={item.id}
              item={item}
              actions={
                <>
                  <button
                    onClick={() => openEdit(item)}
                    className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-slate-300 hover:bg-white/5"
                  >
                    <Pencil size={12} />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-rose-400 hover:bg-rose-500/10"
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                </>
              }
            />
          ))}
        </div>
      )}

      {formOpen && (
        <VaultItemForm
          form={form}
          setForm={setForm}
          editing={!!editingId}
          submitting={submitting}
          error={error}
          onClose={() => setFormOpen(false)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  )
}

type FormState = typeof EMPTY_FORM

function VaultItemForm({
  form,
  setForm,
  editing,
  submitting,
  error,
  onClose,
  onSubmit,
}: {
  form: FormState
  setForm: (updater: (prev: FormState) => FormState) => void
  editing: boolean
  submitting: boolean
  error: string | null
  onClose: () => void
  onSubmit: (e: React.FormEvent) => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const isProxy = form.item_type === 'proxy'

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md max-h-[85vh] overflow-y-auto scrollbar-thin rounded-xl border border-border bg-surface p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">
            {editing ? 'Edit Vault Item' : 'Add Vault Item'}
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-slate-200"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Type</label>
              <select
                value={form.item_type}
                onChange={(e) => set('item_type', e.target.value as VaultItemType)}
                className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
              >
                {VAULT_ITEM_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.icon} {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Name *</label>
              <input
                autoFocus
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
                placeholder="Instagram - @account"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">URL</label>
            <input
              value={form.url}
              onChange={(e) => set('url', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
              placeholder="https://..."
            />
          </div>

          {!isProxy && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Username</label>
                <input
                  value={form.username}
                  onChange={(e) => set('username', e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Password</label>
                <input
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
                />
              </div>
            </div>
          )}

          {form.item_type === 'api_key' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">API Key</label>
              <input
                value={form.api_key}
                onChange={(e) => set('api_key', e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
              />
            </div>
          )}

          {isProxy && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Proxy address</label>
                <input
                  value={form.proxy_address}
                  onChange={(e) => set('proxy_address', e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Port</label>
                <input
                  value={form.proxy_port}
                  onChange={(e) => set('proxy_port', e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Proxy username</label>
                <input
                  value={form.proxy_username}
                  onChange={(e) => set('proxy_username', e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Proxy password</label>
                <input
                  value={form.proxy_password}
                  onChange={(e) => set('proxy_password', e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
                />
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
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
              {submitting ? 'Saving...' : editing ? 'Save changes' : 'Add item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
