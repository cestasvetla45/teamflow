'use client'

import { Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { useBoardContext } from '@/lib/board-context'
import { PLATFORMS, TASK_STATUSES } from '@/types'
import type { TaskWithAssignee } from '@/types'
import { cn, platformEmoji, statusBorderClass, statusDotClass } from '@/lib/utils'
import { TaskCard } from '@/components/TaskCard'
import { TaskModal } from '@/components/TaskModal'
import { TaskDetail } from '@/components/TaskDetail'

export default function BoardPage() {
  return (
    <Suspense fallback={null}>
      <BoardPageInner />
    </Suspense>
  )
}

function BoardPageInner() {
  const {
    boards,
    members,
    tasks,
    loadingTasks,
    selectedBoardId,
    setSelectedBoardId,
    search,
    assigneeFilter,
    setAssigneeFilter,
    priorityFilter,
    setPriorityFilter,
    openNewTaskModal,
    openTaskDetail,
    reloadTasks,
  } = useBoardContext()

  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const platformFilter = searchParams.get('platform')
  const platformInfo = PLATFORMS.find((p) => p.key === platformFilter)

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tasks.filter((task) => {
      if (q) {
        const haystack = `${task.title} ${task.description ?? ''}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      if (assigneeFilter) {
        if (assigneeFilter === 'unassigned' && task.assignee_id) return false
        if (assigneeFilter !== 'unassigned' && task.assignee_id !== assigneeFilter) return false
      }
      if (priorityFilter && task.priority !== priorityFilter) return false
      if (platformFilter && task.platform !== platformFilter) return false
      return true
    })
  }, [tasks, search, assigneeFilter, priorityFilter, platformFilter])

  const columns = useMemo(() => {
    return TASK_STATUSES.map((s) => ({
      ...s,
      tasks: filteredTasks
        .filter((t) => t.status === s.key)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    }))
  }, [filteredTasks])

  async function moveTask(taskId: string, status: string) {
    const task = tasks.find((t) => t.id === taskId)
    if (!task || task.status === status) return
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    await reloadTasks()
  }

  function handleDragStart(e: React.DragEvent<HTMLDivElement>, task: TaskWithAssignee) {
    e.dataTransfer.setData('text/plain', task.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>, status: string) {
    e.preventDefault()
    setDragOverStatus(null)
    const taskId = e.dataTransfer.getData('text/plain')
    if (taskId) moveTask(taskId, status)
  }

  const selectedBoard = boards.find((b) => b.id === selectedBoardId)

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
        {boards.length > 0 && (
          <select
            value={selectedBoardId ?? ''}
            onChange={(e) => setSelectedBoardId(e.target.value)}
            className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm font-medium text-slate-200 outline-none focus:border-accent"
          >
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}

        <select
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-accent"
        >
          <option value="">All assignees</option>
          <option value="unassigned">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm capitalize text-slate-300 outline-none focus:border-accent"
        >
          <option value="">All priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {selectedBoard?.description && (
          <span className="text-xs text-slate-500">{selectedBoard.description}</span>
        )}

        {platformInfo && (
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-lg bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent-hover"
          >
            {platformEmoji(platformInfo.key)} {platformInfo.label}
            <X size={12} />
          </Link>
        )}
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden px-5 py-4">
        {!loadingTasks && tasks.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-slate-500">No tasks yet. Create one!</p>
            <button
              onClick={openNewTaskModal}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              <Plus size={16} />
              Add Task
            </button>
          </div>
        ) : (
          <div className="flex h-full gap-4">
            {columns.map((col) => (
              <div
                key={col.key}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOverStatus(col.key)
                }}
                onDragLeave={() => setDragOverStatus((prev) => (prev === col.key ? null : prev))}
                onDrop={(e) => handleDrop(e, col.key)}
                className={cn(
                  'flex w-72 shrink-0 flex-col rounded-xl border-l-4 bg-surface',
                  statusBorderClass(col.key),
                  dragOverStatus === col.key ? 'ring-1 ring-accent/50' : ''
                )}
              >
                <div className="flex items-center justify-between px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className={cn('h-2 w-2 rounded-full', statusDotClass(col.key))} />
                    <h3 className="text-sm font-semibold text-slate-200">{col.label}</h3>
                  </div>
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-slate-400">
                    {col.tasks.length}
                  </span>
                </div>

                <div className="flex flex-1 flex-col gap-2 overflow-y-auto scrollbar-thin px-3 pb-3">
                  {col.tasks.length === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-600">No tasks</p>
                  ) : (
                    col.tasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onClick={() => openTaskDetail(task.id)}
                        onDragStart={(e) => handleDragStart(e, task)}
                      />
                    ))
                  )}
                  {col.key === 'todo' && (
                    <button
                      onClick={openNewTaskModal}
                      className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs text-slate-500 transition-colors hover:border-accent/50 hover:text-slate-300"
                    >
                      <Plus size={13} />
                      Add task
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <TaskModal />
      <TaskDetail />
    </div>
  )
}
