import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { validateVAToken, VA_TOKEN_COOKIE } from '@/lib/va-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMemberWorkload } from '@/lib/workload'
import { cn, initials } from '@/lib/utils'
import { SkillChip } from '@/components/SkillChip'
import { VATaskBoard, type VATask } from '@/components/va/VATaskBoard'

export const dynamic = 'force-dynamic'

export default async function VADashboardPage() {
  const token = cookies().get(VA_TOKEN_COOKIE)?.value
  const member = await validateVAToken(token)
  if (!member) redirect('/va')

  const supabase = createAdminClient()

  const [{ data: tasks }, workload, { data: memberSkills }] = await Promise.all([
    supabase
      .from('tf_tasks')
      .select('*, board:tf_boards(id, name)')
      .eq('assignee_id', member.id)
      .order('due_date', { ascending: true, nullsFirst: false }),
    getMemberWorkload(member.id),
    supabase
      .from('tf_member_skills')
      .select('*, skill:tf_skills(*)')
      .eq('member_id', member.id),
  ])

  const allTasks = (tasks ?? []) as VATask[]
  const completedCount = allTasks.filter((t) => t.status === 'done').length
  const activeCount = allTasks.length - completedCount
  const utilizationPct = Math.min(workload.utilization_pct, 100)

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/20 text-lg font-semibold text-accent-hover">
          {initials(member.name)}
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Welcome, {member.name}</h1>
          <p className="text-sm capitalize text-slate-500">{member.role}</p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-4 md:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">My workload today</h2>
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
          <div className="mt-4 flex gap-6 text-xs text-slate-500">
            <span>
              <span className="text-slate-200">{activeCount}</span> active tasks
            </span>
            <span>
              <span className="text-slate-200">{completedCount}</span> completed
            </span>
          </div>
        </div>

        <Link
          href="/va/vault"
          className="flex flex-col justify-between rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent/50"
        >
          <div className="flex items-center gap-2 text-slate-200">
            <ShieldCheck size={18} className="text-accent-hover" />
            <span className="text-sm font-semibold">My Vault</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            View your tools, accounts, and proxy credentials.
          </p>
        </Link>
      </div>

      <section id="tasks" className="mb-6 scroll-mt-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">My Tasks</h2>
        <VATaskBoard tasks={allTasks} />
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">My Skills</h2>
        {!memberSkills || memberSkills.length === 0 ? (
          <p className="text-xs text-slate-500">No skills added yet</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {memberSkills.map((ms) => (
              <SkillChip
                key={ms.id}
                name={ms.skill.name}
                category={ms.skill.category}
                proficiency={ms.proficiency_level}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
