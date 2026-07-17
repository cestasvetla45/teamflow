'use client'

import Link from 'next/link'
import { KeyRound } from 'lucide-react'
import type { MemberWithSkills } from '@/types'
import { cn, initials, memberStatusDotClass, memberStatusLabel } from '@/lib/utils'
import { SkillChip } from './SkillChip'

const ROLE_STYLES: Record<string, string> = {
  admin: 'bg-violet-500/20 text-violet-300',
  manager: 'bg-sky-500/20 text-sky-300',
  worker: 'bg-slate-700/60 text-slate-300',
}

export function MemberCard({ member }: { member: MemberWithSkills }) {
  return (
    <Link
      href={`/members/${member.id}`}
      className="flex flex-col rounded-xl border border-border bg-surface p-4 transition-colors duration-200 hover:border-accent/50"
    >
      <div className="flex items-center gap-3">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/20 text-sm font-semibold text-accent-hover">
          {initials(member.name)}
          <span
            className={cn(
              'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface',
              memberStatusDotClass(member.status)
            )}
            title={memberStatusLabel(member.status)}
          />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-100">{member.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                'inline-block rounded-md px-1.5 py-0.5 text-[11px] font-medium capitalize',
                ROLE_STYLES[member.role ?? ''] ?? ROLE_STYLES.worker
              )}
            >
              {member.role}
            </span>
            {member.has_va_token && (
              <span
                title="Has VA access link"
                className="flex items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-medium text-emerald-300"
              >
                <KeyRound size={10} />
                VA Access
              </span>
            )}
          </div>
        </div>
      </div>

      {member.skills && member.skills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {member.skills.slice(0, 4).map((ms) => (
            <SkillChip key={ms.id} name={ms.skill.name} category={ms.skill.category} />
          ))}
          {member.skills.length > 4 && (
            <span className="rounded-full bg-white/5 px-2 py-1 text-xs text-slate-500">
              +{member.skills.length - 4}
            </span>
          )}
        </div>
      )}
    </Link>
  )
}
