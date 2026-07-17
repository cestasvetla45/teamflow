'use client'

import { useEffect, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { useBoardContext } from '@/lib/board-context'
import { PLATFORMS, TASK_PRIORITIES, TASK_STATUSES } from '@/types'
import type { Member, TaskActivity } from '@/types'
import { ActivityTimeline, type ActivityItem } from './ActivityTimeline'

type TaskDetailData = {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  assignee_id: string | null
  due_date: string | null
  estimated_hours: number | null
  actual_hours: number | null
  tags: string[]
  platform: string | null
  activity: (TaskActivity & { member: Member | null })[]
}

export function TaskDetail() {
  const { detailTaskId, closeTaskDetail, members, reloadTasks } = useBoardContext()
  const [task, setTask] = useState<TaskDetailData | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!detailTaskId) {
      setTask(null)
      return
    }
    setLoading(true)
    fetch(`/api/tasks/${detailTaskId}`)
      .then((res) => res.json())
      .then((data) => setTask(data))
      .finally(() => setLoading(false))
  }, [detailTaskId])

  if (!detailTaskId) return null

  function updateField<K extends keyof TaskDetailData>(key: K, value: TaskDetailData[K]) {
    setTask((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  async function handleSave() {
    if (!task) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          assignee_id: task.assignee_id,
          due_date: task.due_date,
          estimated_hours: task.estimated_hours,
          actual_hours: task.actual_hours,
          tags: task.tags,
          platform: task.platform,
        }),
      })
      if (!res.ok) throw new Error('Failed to save task')
      await reloadTasks()
      closeTaskDetail()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save task')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!task) return
    if (!confirm('Delete this task? This cannot be undone.')) return
    setSaving(true)
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete task')
      await reloadTasks()
      closeTaskDetail()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete task')
      setSaving(false)
    }
  }

  const activityItems: ActivityItem[] = (task?.activity ?? []).map((a) => ({
    id: a.id,
    action: a.action,
    old_value: a.old_value,
    new_value: a.new_value,
    created_at: a.created_at,
    member_name: a.member?.name ?? null,
  }))

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={closeTaskDetail} />
      <div className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Task details
          </h2>
          <button
            onClick={closeTaskDetail}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-slate-200"
          >
            <X size={18} />
          </button>
        </div>

        {loading || !task ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
            Loading...
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-y-auto scrollbar-thin px-5 py-4">
            <input
              value={task.title}
              onChange={(e) => updateField('title', e.target.value)}
              className="mb-3 w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-base font-semibold text-slate-100 outline-none focus:border-accent"
            />

            <textarea
              value={task.description ?? ''}
              onChange={(e) => updateField('description', e.target.value)}
              rows={4}
              placeholder="Add a description..."
              className="mb-4 w-full resize-none rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-300 outline-none focus:border-accent"
            />

            <div className="mb-4 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Status</label>
                <select
                  value={task.status}
                  onChange={(e) => updateField('status', e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
                >
                  {TASK_STATUSES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Priority</label>
                <select
                  value={task.priority}
                  onChange={(e) => updateField('priority', e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm capitalize text-slate-200 outline-none focus:border-accent"
                >
                  {TASK_PRIORITIES.map((p) => (
                    <option key={p} value={p} className="capitalize">
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Assignee</label>
                <select
                  value={task.assignee_id ?? ''}
                  onChange={(e) => updateField('assignee_id', e.target.value || null)}
                  className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Due date</label>
                <input
                  type="date"
                  value={task.due_date ? task.due_date.slice(0, 10) : ''}
                  onChange={(e) => updateField('due_date', e.target.value || null)}
                  className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Estimated hrs
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={task.estimated_hours ?? ''}
                  onChange={(e) =>
                    updateField('estimated_hours', e.target.value ? Number(e.target.value) : null)
                  }
                  className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Actual hrs
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={task.actual_hours ?? ''}
                  onChange={(e) =>
                    updateField('actual_hours', e.target.value ? Number(e.target.value) : null)
                  }
                  className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-slate-400">Tags</label>
              <input
                value={task.tags?.join(', ') ?? ''}
                onChange={(e) =>
                  updateField(
                    'tags',
                    e.target.value.split(',').map((t) => t.trim()).filter(Boolean)
                  )
                }
                className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
                placeholder="design, urgent"
              />
            </div>

            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-slate-400">Platform</label>
              <select
                value={task.platform ?? ''}
                onChange={(e) => updateField('platform', e.target.value || null)}
                className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
              >
                <option value="">None</option>
                {PLATFORMS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.emoji} {p.label}
                  </option>
                ))}
              </select>
            </div>

            {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}

            <div className="mb-6 flex items-center gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save changes'}
              </button>
              <button
                onClick={handleDelete}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg border border-rose-500/40 px-3 py-2 text-sm font-medium text-rose-400 transition-colors hover:bg-rose-500/10 disabled:opacity-50"
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>

            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Activity
              </h3>
              <ActivityTimeline entries={activityItems} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
