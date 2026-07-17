'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Bell, Plus, Search } from 'lucide-react'
import { useBoardContext } from '@/lib/board-context'

export function TopBar() {
  const pathname = usePathname()
  const { search, setSearch, openNewTaskModal, overdueTasks } = useBoardContext()
  const [notifOpen, setNotifOpen] = useState(false)
  const isBoardPage = pathname === '/'

  return (
    <header className="flex items-center gap-4 border-b border-border bg-surface px-5 py-3">
      <div className="relative flex-1 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks..."
          className="w-full rounded-lg border border-border bg-surface-raised py-2 pl-9 pr-3 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-accent"
        />
      </div>

      <div className="ml-auto flex items-center gap-3">
        {isBoardPage && (
          <button
            onClick={openNewTaskModal}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            <Plus size={16} />
            Add Task
          </button>
        )}

        <div className="relative">
          <button
            onClick={() => setNotifOpen((v) => !v)}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-slate-200"
          >
            <Bell size={17} />
            {overdueTasks.length > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-2 w-2 rounded-full bg-rose-500" />
            )}
          </button>

          {notifOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 top-11 z-20 w-72 rounded-lg border border-border bg-surface-raised p-3 shadow-xl">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Overdue tasks
                </p>
                {overdueTasks.length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-500">Nothing overdue</p>
                ) : (
                  <ul className="flex flex-col gap-1 max-h-72 overflow-y-auto scrollbar-thin">
                    {overdueTasks.map((t) => (
                      <li
                        key={t.id}
                        className="rounded-md px-2 py-1.5 text-sm text-slate-200 hover:bg-white/5"
                      >
                        {t.title}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
