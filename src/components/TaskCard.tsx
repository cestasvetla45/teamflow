'use client'

import { Calendar } from 'lucide-react'
import { format, isPast } from 'date-fns'
import type { TaskWithAssignee } from '@/types'
import { cn, initials, priorityStyle } from '@/lib/utils'

interface TaskCardProps {
  task: TaskWithAssignee
  onClick: () => void
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void
  onDragEnd?: (e: React.DragEvent<HTMLDivElement>) => void
}

export function TaskCard({ task, onClick, onDragStart, onDragEnd }: TaskCardProps) {
  const overdue =
    task.due_date && task.status !== 'done' && isPast(new Date(task.due_date))

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className="cursor-pointer rounded-lg border border-border bg-surface-raised p-3 shadow-sm transition-colors duration-200 hover:border-accent/50"
    >
      <p className="text-sm font-medium text-slate-100 line-clamp-2">{task.title}</p>

      {task.tags && task.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-400"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <span
          className={cn(
            'rounded-md px-1.5 py-0.5 text-[11px] font-medium capitalize',
            priorityStyle(task.priority)
          )}
        >
          {task.priority}
        </span>

        <div className="flex items-center gap-2">
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

          {task.assignee ? (
            <div
              title={task.assignee.name}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-[10px] font-semibold text-accent-hover"
            >
              {initials(task.assignee.name)}
            </div>
          ) : (
            <div className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-slate-600 text-[10px] text-slate-600">
              ?
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
