import { formatDistanceToNow } from 'date-fns'
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  MessageSquare,
  Plus,
  UserCircle2,
} from 'lucide-react'
import { cn, statusLabel } from '@/lib/utils'

export interface ActivityItem {
  id: string
  action: string
  old_value?: string | null
  new_value?: string | null
  created_at: string | null
  member_name?: string | null
}

const ACTION_ICONS: Record<string, typeof Plus> = {
  created: Plus,
  assigned: UserCircle2,
  status_changed: ArrowRightLeft,
  commented: MessageSquare,
  completed: CheckCircle2,
  overdue_alert: AlertTriangle,
}

const ACTION_COLORS: Record<string, string> = {
  created: 'bg-emerald-500/20 text-emerald-300',
  assigned: 'bg-sky-500/20 text-sky-300',
  status_changed: 'bg-violet-500/20 text-violet-300',
  commented: 'bg-slate-600/40 text-slate-300',
  completed: 'bg-green-500/20 text-green-300',
  overdue_alert: 'bg-rose-500/20 text-rose-300',
}

function describe(entry: ActivityItem): string {
  const actor = entry.member_name ?? 'Someone'
  switch (entry.action) {
    case 'created':
      return `${actor} created this task`
    case 'assigned':
      return `${actor} reassigned this task`
    case 'status_changed':
      return `${actor} moved this task from ${statusLabel(entry.old_value ?? '')} to ${statusLabel(
        entry.new_value ?? ''
      )}`
    case 'commented':
      return `${actor} commented: "${entry.new_value}"`
    case 'completed':
      return `${actor} completed this task`
    case 'overdue_alert':
      return `Task flagged as overdue`
    default:
      return `${actor} updated ${entry.action.replace(/_/g, ' ')}`
  }
}

export function ActivityTimeline({ entries }: { entries: ActivityItem[] }) {
  if (entries.length === 0) {
    return <p className="py-4 text-center text-sm text-slate-500">No activity yet</p>
  }

  return (
    <ul className="flex flex-col gap-4">
      {entries.map((entry) => {
        const Icon = ACTION_ICONS[entry.action] ?? MessageSquare
        return (
          <li key={entry.id} className="flex gap-3">
            <div
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                ACTION_COLORS[entry.action] ?? 'bg-slate-700/60 text-slate-300'
              )}
            >
              <Icon size={14} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-200">{describe(entry)}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {entry.created_at
                  ? formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })
                  : ''}
              </p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
