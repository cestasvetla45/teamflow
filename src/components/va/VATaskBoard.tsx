'use client'

import { useState } from 'react'
import { Calendar, ChevronDown } from 'lucide-react'
import { format, isPast } from 'date-fns'
import type { Task } from '@/types'
import { TASK_STATUSES } from '@/types'
import { cn, priorityStyle } from '@/lib/utils'

export type VATask = Task & { board: { id: string; name: string } | null }

export function VATaskBoard({ tasks: initialTasks }: { tasks: VATask[] }) {
  const [tasks, setTasks] = useState(initialTasks)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  async function changeStatus(taskId: string, status: string) {
    setUpdatingId(taskId)
    try {
      const res = await fetch('/api/va/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, status }),
      })
      if (res.ok) {
        const updated = await res.json()
        setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...updated } : t)))
      }
    } finally {
      setUpdatingId(null)
    }
  }

  if (tasks.length === 0) {
    return <p className="text-sm text-slate-500">No tasks assigned to you right now.</p>
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {TASK_STATUSES.map(({ key, label }) => {
        const columnTasks = tasks.filter((t) => t.status === key)
        return (
          <div key={key} className="rounded-xl border border-border bg-surface p-3">
            <div className="mb-3 flex items-center justify-between px-1">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                {label}
              </h3>
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-slate-500">
                {columnTasks.length}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {columnTasks.length === 0 ? (
                <p className="px-1 text-xs text-slate-600">Nothing here</p>
              ) : (
                columnTasks.map((task) => {
                  const overdue =
                    task.due_date && task.status !== 'done' && isPast(new Date(task.due_date))
                  const expanded = expandedId === task.id

                  return (
                    <div
                      key={task.id}
                      className="rounded-lg border border-border bg-surface-raised p-3"
                    >
                      <button
                        onClick={() => setExpandedId(expanded ? null : task.id)}
                        className="flex w-full items-start justify-between gap-2 text-left"
                      >
                        <span className="text-sm font-medium text-slate-100">{task.title}</span>
                        <ChevronDown
                          size={14}
                          className={cn(
                            'mt-0.5 shrink-0 text-slate-500 transition-transform',
                            expanded && 'rotate-180'
                          )}
                        />
                      </button>

                      {expanded && task.description && (
                        <p className="mt-2 whitespace-pre-wrap text-xs text-slate-400">
                          {task.description}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <span
                          className={cn(
                            'rounded-md px-1.5 py-0.5 text-[11px] font-medium capitalize',
                            priorityStyle(task.priority)
                          )}
                        >
                          {task.priority}
                        </span>
                        {task.board && (
                          <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-400">
                            {task.board.name}
                          </span>
                        )}
                        {task.due_date && (
                          <span
                            className={cn(
                              'flex items-center gap-1 text-[11px]',
                              overdue ? 'text-rose-400' : 'text-slate-500'
                            )}
                          >
                            <Calendar size={11} />
                            {format(new Date(task.due_date), 'MMM d')}
                          </span>
                        )}
                      </div>

                      <select
                        value={task.status ?? 'todo'}
                        disabled={updatingId === task.id}
                        onChange={(e) => changeStatus(task.id, e.target.value)}
                        className="mt-3 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-accent disabled:opacity-50"
                      >
                        {TASK_STATUSES.map((s) => (
                          <option key={s.key} value={s.key}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
