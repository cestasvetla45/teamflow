'use client'

import { useMemo, useState } from 'react'
import { PLATFORMS, SOP_CATEGORIES } from '@/types'
import type { Platform, SopCategory } from '@/types'
import { renderMarkdown } from '@/lib/markdown'

export interface SOPEditorValue {
  title: string
  content: string
  category: SopCategory
  platform: Platform | null
  tags: string[]
}

interface SOPEditorProps {
  initial?: Partial<SOPEditorValue>
  submitLabel?: string
  saving?: boolean
  error?: string | null
  onSave: (value: SOPEditorValue & { autoSync: boolean }) => void
  onCancel?: () => void
}

export function SOPEditor({ initial, submitLabel = 'Save', saving, error, onSave, onCancel }: SOPEditorProps) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [content, setContent] = useState(initial?.content ?? '')
  const [category, setCategory] = useState<SopCategory>(initial?.category ?? 'general')
  const [platform, setPlatform] = useState<Platform | ''>(initial?.platform ?? '')
  const [tags, setTags] = useState(initial?.tags?.join(', ') ?? '')
  const [autoSync, setAutoSync] = useState(true)

  const previewHtml = useMemo(() => renderMarkdown(content || '*Nothing to preview yet*'), [content])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !content.trim()) return
    onSave({
      title: title.trim(),
      content,
      category,
      platform: platform || null,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      autoSync,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col gap-4">
      <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-2">
        <div className="flex flex-col gap-3 overflow-y-auto scrollbar-thin pr-1">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Title *</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
              placeholder="How to post on Twitter"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Content (Markdown) *</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={16}
              className="w-full resize-none rounded-lg border border-border bg-surface-raised px-3 py-2 font-mono text-sm text-slate-200 outline-none focus:border-accent"
              placeholder="# Steps&#10;1. Log into the account&#10;2. ..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as SopCategory)}
                className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm capitalize text-slate-200 outline-none focus:border-accent"
              >
                {SOP_CATEGORIES.map((c) => (
                  <option key={c} value={c} className="capitalize">
                    {c.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Platform</label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as Platform | '')}
                className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm capitalize text-slate-200 outline-none focus:border-accent"
              >
                <option value="">None</option>
                {PLATFORMS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.emoji} {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Tags (comma-separated)</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
              placeholder="posting, twitter"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={autoSync}
              onChange={(e) => setAutoSync(e.target.checked)}
              className="h-4 w-4 rounded border-border bg-surface-raised accent-accent"
            />
            Sync to Telegram SOPs topic on save
          </label>
        </div>

        <div className="flex flex-col overflow-hidden rounded-lg border border-border">
          <div className="border-b border-border bg-surface-raised px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Preview
          </div>
          <div
            className="prose-sop flex-1 overflow-y-auto scrollbar-thin px-4 py-3 text-sm text-slate-300"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-slate-200"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  )
}
