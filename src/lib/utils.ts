import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

const PRIORITY_STYLES: Record<string, string> = {
  low: 'bg-slate-700/60 text-slate-300',
  medium: 'bg-blue-500/20 text-blue-300',
  high: 'bg-amber-500/20 text-amber-300',
  urgent: 'bg-rose-500/20 text-rose-300',
}

export function priorityStyle(priority: string | null | undefined) {
  return PRIORITY_STYLES[priority ?? ''] ?? PRIORITY_STYLES.medium
}

const STATUS_LABELS: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
  blocked: 'Blocked',
}

export function statusLabel(status: string | null | undefined) {
  if (!status) return 'Unknown'
  return STATUS_LABELS[status] ?? status
}

const STATUS_BORDER_STYLES: Record<string, string> = {
  todo: 'border-l-slate-500',
  in_progress: 'border-l-blue-500',
  review: 'border-l-purple-500',
  done: 'border-l-green-500',
  blocked: 'border-l-red-500',
}

export function statusBorderClass(status: string | null | undefined) {
  return STATUS_BORDER_STYLES[status ?? ''] ?? STATUS_BORDER_STYLES.todo
}

const STATUS_DOT_STYLES: Record<string, string> = {
  todo: 'bg-slate-500',
  in_progress: 'bg-blue-500',
  review: 'bg-purple-500',
  done: 'bg-green-500',
  blocked: 'bg-red-500',
}

export function statusDotClass(status: string | null | undefined) {
  return STATUS_DOT_STYLES[status ?? ''] ?? STATUS_DOT_STYLES.todo
}

const MEMBER_STATUS_DOT_STYLES: Record<string, string> = {
  active: 'bg-green-500',
  on_leave: 'bg-amber-500',
  inactive: 'bg-rose-500',
}

export function memberStatusDotClass(status: string | null | undefined) {
  return MEMBER_STATUS_DOT_STYLES[status ?? ''] ?? 'bg-slate-500'
}

const MEMBER_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  on_leave: 'On Leave',
  inactive: 'Inactive',
}

export function memberStatusLabel(status: string | null | undefined) {
  if (!status) return 'Unknown'
  return MEMBER_STATUS_LABELS[status] ?? status
}

const SKILL_CATEGORY_STYLES: Record<string, string> = {
  frontend: 'bg-sky-500/20 text-sky-300',
  backend: 'bg-emerald-500/20 text-emerald-300',
  design: 'bg-pink-500/20 text-pink-300',
  devops: 'bg-orange-500/20 text-orange-300',
  general: 'bg-slate-700/60 text-slate-300',
}

export function skillCategoryStyle(category: string | null | undefined) {
  return SKILL_CATEGORY_STYLES[category ?? ''] ?? SKILL_CATEGORY_STYLES.general
}

const SOP_CATEGORY_STYLES: Record<string, string> = {
  general: 'bg-slate-700/60 text-slate-300',
  twitter: 'bg-sky-500/20 text-sky-300',
  reddit: 'bg-orange-500/20 text-orange-300',
  instagram: 'bg-pink-500/20 text-pink-300',
  tiktok: 'bg-fuchsia-500/20 text-fuchsia-300',
  youtube: 'bg-red-500/20 text-red-300',
  onboarding: 'bg-emerald-500/20 text-emerald-300',
  va_guide: 'bg-indigo-500/20 text-indigo-300',
}

export function sopCategoryStyle(category: string | null | undefined) {
  return SOP_CATEGORY_STYLES[category ?? ''] ?? SOP_CATEGORY_STYLES.general
}

const PLATFORM_EMOJI: Record<string, string> = {
  twitter: '🐦',
  reddit: '📺',
  instagram: '📸',
  tiktok: '🎵',
  youtube: '▶️',
}

export function platformEmoji(platform: string | null | undefined) {
  return platform ? PLATFORM_EMOJI[platform] ?? '' : ''
}
