'use client'

import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2, Users, X } from 'lucide-react'
import type { Member, Skill } from '@/types'
import { cn, initials, skillCategoryStyle } from '@/lib/utils'

type SkillWithMembers = Skill & {
  members: { proficiency_level: number; member: Member }[]
}

const CATEGORIES = ['frontend', 'backend', 'design', 'devops', 'general']

function SkillFormModal({
  open,
  skill,
  onClose,
  onSaved,
}: {
  open: boolean
  skill?: Skill | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('general')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(skill?.name ?? '')
    setDescription(skill?.description ?? '')
    setCategory(skill?.category ?? 'general')
    setError(null)
  }, [open, skill])

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(skill ? `/api/skills/${skill.id}` : '/api/skills', {
        method: skill ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          category,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to save skill')
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save skill')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">
            {skill ? 'Edit Skill' : 'Add Skill'}
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
              placeholder="React"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm capitalize text-slate-200 outline-none focus:border-accent"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c} className="capitalize">
                  {c}
                </option>
              ))}
            </select>
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
              {submitting ? 'Saving...' : skill ? 'Save changes' : 'Add skill'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function SkillMembersModal({
  skill,
  onClose,
}: {
  skill: SkillWithMembers | null
  onClose: () => void
}) {
  if (!skill) return null
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">{skill.name}</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-slate-200"
          >
            <X size={18} />
          </button>
        </div>
        {skill.members.length === 0 ? (
          <p className="text-sm text-slate-500">No members have this skill yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {skill.members.map(({ member, proficiency_level }) => (
              <li
                key={member.id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface-raised px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/20 text-[11px] font-semibold text-accent-hover">
                    {initials(member.name)}
                  </div>
                  <span className="text-sm text-slate-200">{member.name}</span>
                </div>
                <span className="text-xs text-slate-500">Lvl {proficiency_level}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillWithMembers[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null)
  const [viewingSkill, setViewingSkill] = useState<SkillWithMembers | null>(null)

  async function load() {
    const res = await fetch('/api/skills')
    if (res.ok) setSkills(await res.json())
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleDelete(skill: Skill, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm(`Delete skill "${skill.name}"? This cannot be undone.`)) return
    await fetch(`/api/skills/${skill.id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin p-5">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">Skills</h1>
        <button
          onClick={() => {
            setEditingSkill(null)
            setFormOpen(true)
          }}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          <Plus size={16} />
          Add Skill
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : skills.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-500">No skills yet. Add one!</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {skills.map((skill) => (
            <div
              key={skill.id}
              onClick={() => setViewingSkill(skill)}
              className="flex cursor-pointer flex-col rounded-xl border border-border bg-surface p-4 transition-colors duration-200 hover:border-accent/50"
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={cn(
                    'rounded-full px-2.5 py-1 text-xs font-medium capitalize',
                    skillCategoryStyle(skill.category)
                  )}
                >
                  {skill.category}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingSkill(skill)
                      setFormOpen(true)
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-slate-200"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={(e) => handleDelete(skill, e)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-500/10 hover:text-rose-400"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <h3 className="mt-3 text-sm font-semibold text-slate-100">{skill.name}</h3>
              {skill.description && (
                <p className="mt-1 line-clamp-2 text-xs text-slate-500">{skill.description}</p>
              )}
              <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
                <Users size={13} />
                {skill.members.length} member{skill.members.length === 1 ? '' : 's'}
              </div>
            </div>
          ))}
        </div>
      )}

      <SkillFormModal
        open={formOpen}
        skill={editingSkill}
        onClose={() => setFormOpen(false)}
        onSaved={load}
      />
      <SkillMembersModal skill={viewingSkill} onClose={() => setViewingSkill(null)} />
    </div>
  )
}
