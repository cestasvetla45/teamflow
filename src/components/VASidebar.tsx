'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutGrid, ListChecks, LogOut, ShieldCheck, Workflow } from 'lucide-react'
import { cn, initials } from '@/lib/utils'
import type { Member } from '@/types'

const NAV_ITEMS = [
  { href: '/va/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { href: '/va/dashboard#tasks', label: 'My Tasks', icon: ListChecks },
  { href: '/va/vault', label: 'My Vault', icon: ShieldCheck },
]

export function VASidebar({ member }: { member: Member }) {
  const pathname = usePathname()
  const router = useRouter()

  async function logout() {
    await fetch('/api/va/auth', { method: 'DELETE' })
    router.push('/va')
    router.refresh()
  }

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
          <Workflow size={18} />
        </div>
        <span className="text-lg font-semibold tracking-tight">TeamFlow</span>
      </div>

      <div className="mx-3 mb-4 flex items-center gap-3 rounded-lg border border-border bg-surface-raised px-3 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/20 text-sm font-semibold text-accent-hover">
          {initials(member.name)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-100">{member.name}</p>
          <p className="truncate text-xs capitalize text-slate-500">{member.role}</p>
        </div>
      </div>

      <nav className="flex flex-col gap-1 px-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const path = href.split('#')[0]
          const active = pathname === path
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

      <button
        onClick={logout}
        className="mt-auto flex items-center gap-2.5 px-8 py-4 text-left text-xs font-medium text-slate-500 hover:text-slate-300"
      >
        <LogOut size={14} />
        Log out
      </button>
    </aside>
  )
}
