'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Mail, Pencil, Plus, Send, X } from 'lucide-react'
import type { Member, MemberWithSkills, Skill, Task } from '@/types'
import type { WorkloadInfo } from '@/lib/workload'
import {
  cn,
  initials,
  memberStatusDotClass,
  memberStatusLabel,
  priorityStyle,
  statusLabel,
} from '@/lib/utils'
import { MemberModal } from '@/components/MemberModal'
import { SkillChip } from '@/components/SkillChip'
import { VAAccessPanel } from '@/components/va/VAAccessPanel'
import { MemberVaultPanel } from '@/components/va/MemberVaultPanel'

type MemberDetail = MemberWithSkills & {
  current_tasks: Task[]
  completed_last_30_days: number
}

const STATUS_CYCLE: Record<string, string> = {
  active: 'on_leave',
  on_leave: 'inactive',
  inactive: 'active',
}

export default function MemberDetailPage({ params }: { params: { id: string } }) {
  const [member, setMember] = useState<MemberDetail | null>(null)
  const [workload, setWorkload] = useState<WorkloadInfo | null>(null)
  const [allSkills, setAllSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [addSkillId, setAddSkillId] = useState('')
  const [addProficiency, setAddProficiency] = useState('3')

  const load = useCallback(async () => {
    const [memberRes, workloadRes, skillsRes] = await Promise.all([
      fetch(`/api/members/${params.id}`),
      fetch(`/api/workload/${params.id}`),
      fetch('/api/skills'),
    ])
    if (memberRes.ok) setMember(await memberRes.json())
    if (workloadRes.ok) {
      const data = await workloadRes.json()
      setWorkload(data.workload)
    }
    if (skillsRes.ok) setAllSkills(await skillsRes.json())
    setLoading(false)
  }, [params.id])

  useEffect(() => {
    load()
  }, [load])

  async function toggleStatus() {
    if (!member) return
    const nextStatus = STATUS_CYCLE[member.status ?? 'active'] ?? 'active'
    await fetch(`/api/members/${member.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    })
    load()
  }

  async function addSkill() {
    if (!addSkillId) return
    await fetch(`/api/members/${params.id}/skills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skill_id: addSkillId, proficiency_level: Number(addProficiency) }),
    })
    setAddSkillId('')
    setAddProficiency('3')
    load()
  }

  async function removeSkill(skillId: string) {
    await fetch(`/api/members/${params.id}/skills`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skill_id: skillId }),
    })
    load()
  }

  if (loading || !member) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Loading...
      </div>
    )
  }

  const availableSkills = allSkills.filter(
    (s) => !member.skills.some((ms) => ms.skill_id === s.id)
  )

  const utilizationPct = Math.min(workload?.utilization_pct ?? 0, 100)

  return (
    <div className="h-full overflow-y-auto scrollbar-thin p-5">
      <Link
        href="/members"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200"
      >
        <ArrowLeft size={15} />
        Back to members
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center gap-4">
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xl font-semibold text-accent-hover">
            {initials(member.name)}
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-surface',
                memberStatusDotClass(member.status)
              )}
            />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-100">{member.name}</h1>
            <p className="mt-0.5 text-sm capitalize text-slate-400">{member.role}</p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
              {member.telegram_username && (
                <span className="flex items-center gap-1">
                  <Send size={12} />@{member.telegram_username}
                </span>
              )}
              {member.email && (
                <span className="flex items-center gap-1">
                  <Mail size={12} />
                  {member.email}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleStatus}
            className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-white/5"
          >
            {memberStatusLabel(member.status)} — click to change
          </button>
          <button
            onClick={() => setEditOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            <Pencil size={14} />
            Edit
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">Workload today</h2>
          {workload ? (
            <>
              <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                <span>
                  {workload.estimated_hours_remaining}h assigned / {workload.max_daily_hours}h max
                </span>
                <span className="capitalize">{workload.status}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
                <div
                  className={cn(
                    'h-full rounded-full',
                    utilizationPct >= 100
                      ? 'bg-rose-500'
                      : utilizationPct >= 90
                      ? 'bg-amber-500'
                      : 'bg-accent'
                  )}
                  style={{ width: `${utilizationPct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {member.completed_last_30_days} tasks completed in the last 30 days
              </p>
            </>
          ) : (
            <p className="text-xs text-slate-500">No workload data</p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">Skills</h2>
          <div className="mb-3 flex flex-wrap gap-2">
            {member.skills.length === 0 ? (
              <p className="text-xs text-slate-500">No skills added yet</p>
            ) : (
              member.skills.map((ms) => (
                <span key={ms.id} className="group relative">
                  <SkillChip
                    name={ms.skill.name}
                    category={ms.skill.category}
                    proficiency={ms.proficiency_level}
                  />
                  <button
                    onClick={() => removeSkill(ms.skill_id)}
                    className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-white group-hover:flex"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))
            )}
          </div>

          {availableSkills.length > 0 && (
            <div className="flex gap-2">
              <select
                value={addSkillId}
                onChange={(e) => setAddSkillId(e.target.value)}
                className="flex-1 rounded-lg border border-border bg-surface-raised px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-accent"
              >
                <option value="">Add a skill...</option>
                {availableSkills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                value={addProficiency}
                onChange={(e) => setAddProficiency(e.target.value)}
                className="rounded-lg border border-border bg-surface-raised px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-accent"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    Lvl {n}
                  </option>
                ))}
              </select>
              <button
                onClick={addSkill}
                disabled={!addSkillId}
                className="flex items-center justify-center rounded-lg bg-accent px-2 py-1.5 text-white disabled:opacity-50"
              >
                <Plus size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">Active tasks</h2>
        {member.current_tasks.length === 0 ? (
          <p className="text-xs text-slate-500">No active tasks</p>
        ) : (
          <div className="flex flex-col gap-2">
            {member.current_tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface-raised px-3 py-2"
              >
                <span className="text-sm text-slate-200">{task.title}</span>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'rounded-md px-1.5 py-0.5 text-[11px] font-medium capitalize',
                      priorityStyle(task.priority)
                    )}
                  >
                    {task.priority}
                  </span>
                  <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-400">
                    {statusLabel(task.status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <VAAccessPanel memberId={member.id} />
      </div>

      <div className="mb-6">
        <MemberVaultPanel memberId={member.id} />
      </div>

      <MemberModal
        open={editOpen}
        member={member as Member}
        onClose={() => setEditOpen(false)}
        onSaved={load}
      />
    </div>
  )
}
