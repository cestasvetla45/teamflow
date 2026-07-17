'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useBoardContext } from '@/lib/board-context'
import { PLATFORMS, TASK_PRIORITIES, TASK_STATUSES } from '@/types'

export function TaskModal() {
  const {
    taskModalOpen,
    editingTaskId,
    closeTaskModal,
    tasks,
    members,
    selectedBoardId,
    reloadTasks,
  } = useBoardContext()

  const editingTask = editingTaskId ? tasks.find((t) => t.id === editingTaskId) ?? null : null

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [priority, setPriority] = useState('medium')
  const [status, setStatus] = useState('todo')
  const [dueDate, setDueDate] = useState('')
  const [estimatedHours, setEstimatedHours] = useState('')
  const [tags, setTags] = useState('')
  const [platform, setPlatform] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!taskModalOpen) return
    setTitle(editingTask?.title ?? '')
    setDescription(editingTask?.description ?? '')
    setAssigneeId(editingTask?.assignee_id ?? '')
    setPriority(editingTask?.priority ?? 'medium')
    setStatus(editingTask?.status ?? 'todo')
    setDueDate(editingTask?.due_date ? editingTask.due_date.slice(0, 10) : '')
    setEstimatedHours(editingTask?.estimated_hours != null ? String(editingTask.estimated_hours) : '')
    setTags(editingTask?.tags?.join(', ') ?? '')
    setPlatform(editingTask?.platform ?? '')
    setError(null)
  }, [taskModalOpen, editingTask])

  if (!taskModalOpen) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError('Title is required')
      return
    }

    setSubmitting(true)
    setError(null)

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      assignee_id: assigneeId || null,
      priority,
      status,
      due_date: dueDate || null,
      estimated_hours: estimatedHours ? Number(estimatedHours) : null,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      platform: platform || null,
      ...(editingTask ? {} : { board_id: selectedBoardId }),
    }

    try {
      const res = await fetch(
        editingTask ? `/api/tasks/${editingTask.id}` : '/api/tasks',
        {
          method: editingTask ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to save task')
      }
      await reloadTasks()
      closeTaskModal()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save task')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="absolute inset-0" onClick={closeTaskModal} />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-surface p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">
            {editingTask ? 'Edit Task' : 'New Task'}
          </h2>
          <button
            onClick={closeTaskModal}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-slate-200"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Title *</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
              placeholder="Task title"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
              placeholder="Add more detail..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Assignee</label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
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
              <label className="mb-1 block text-xs font-medium text-slate-400">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent capitalize"
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p} className="capitalize">
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {editingTask && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
                >
                  {TASK_STATUSES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Estimated hours
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Tags (comma-separated)
              </label>
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
                placeholder="design, urgent"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
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

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={closeTaskModal}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {submitting ? 'Saving...' : editingTask ? 'Save changes' : 'Create task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
