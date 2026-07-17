'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { LayoutGrid, Users, Sparkles, ChevronDown, Workflow, FileText } from 'lucide-react'
import { useBoardContext } from '@/lib/board-context'
import { cn } from '@/lib/utils'
import { PLATFORMS } from '@/types'

const NAV_ITEMS = [
  { href: '/', label: 'Board', icon: LayoutGrid },
  { href: '/members', label: 'Members', icon: Users },
  { href: '/skills', label: 'Skills', icon: Sparkles },
  { href: '/sops', label: 'SOPs', icon: FileText },
]

function PlatformNav() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activePlatform = searchParams.get('platform')

  return (
    <nav className="flex flex-col gap-1">
      {PLATFORMS.map(({ key, label, emoji }) => {
        const active = pathname === '/' && activePlatform === key
        return (
          <Link
            key={key}
            href={`/?platform=${key}`}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              active
                ? 'bg-accent/15 text-accent-hover'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            )}
          >
            <span className="w-4 text-center">{emoji}</span>
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const { boards, selectedBoardId, setSelectedBoardId } = useBoardContext()

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
          <Workflow size={18} />
        </div>
        <span className="text-lg font-semibold tracking-tight">TeamFlow</span>
      </div>

      <nav className="flex flex-col gap-1 px-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-accent/15 text-accent-hover'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              )}
            >
              <Icon size={17} />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="mt-6 px-4">
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Platforms
        </p>
        <Suspense fallback={null}>
          <PlatformNav />
        </Suspense>
      </div>

      {boards.length > 0 && (
        <div className="mt-6 px-4">
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Board
          </p>
          <div className="relative">
            <select
              value={selectedBoardId ?? ''}
              onChange={(e) => setSelectedBoardId(e.target.value)}
              className="w-full appearance-none rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
            >
              {boards.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
            />
          </div>
        </div>
      )}

      <div className="mt-auto px-5 py-4 text-xs text-slate-600">TeamFlow</div>
    </aside>
  )
}
