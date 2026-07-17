import type { Database } from './database'

export type Member = Database['public']['Tables']['tf_members']['Row']
export type MemberInsert = Database['public']['Tables']['tf_members']['Insert']
export type MemberUpdate = Database['public']['Tables']['tf_members']['Update']

export type Skill = Database['public']['Tables']['tf_skills']['Row']
export type SkillInsert = Database['public']['Tables']['tf_skills']['Insert']

export type MemberSkill = Database['public']['Tables']['tf_member_skills']['Row']

export type Board = Database['public']['Tables']['tf_boards']['Row']
export type BoardInsert = Database['public']['Tables']['tf_boards']['Insert']

export type Task = Database['public']['Tables']['tf_tasks']['Row']
export type TaskInsert = Database['public']['Tables']['tf_tasks']['Insert']
export type TaskUpdate = Database['public']['Tables']['tf_tasks']['Update']

export type TaskActivity = Database['public']['Tables']['tf_task_activity']['Row']

export type WorkloadLog = Database['public']['Tables']['tf_workload_log']['Row']

export type VaultItem = Database['public']['Tables']['tf_va_vault']['Row']
export type VaultItemInsert = Database['public']['Tables']['tf_va_vault']['Insert']
export type VaultItemUpdate = Database['public']['Tables']['tf_va_vault']['Update']

export type VaToken = Database['public']['Tables']['tf_va_tokens']['Row']

export type Sop = Database['public']['Tables']['tf_sops']['Row']
export type SopInsert = Database['public']['Tables']['tf_sops']['Insert']
export type SopUpdate = Database['public']['Tables']['tf_sops']['Update']

export type SopVersion = Database['public']['Tables']['tf_sop_versions']['Row']

export type TelegramTopic = Database['public']['Tables']['tf_telegram_topics']['Row']

export type VaultItemType = 'account' | 'login' | 'proxy' | 'api_key' | 'note' | 'other'

export const VAULT_ITEM_TYPES: { key: VaultItemType; label: string; icon: string }[] = [
  { key: 'account', label: 'Account', icon: '🔐' },
  { key: 'login', label: 'Login', icon: '🔑' },
  { key: 'proxy', label: 'Proxy', icon: '🌐' },
  { key: 'api_key', label: 'API Key', icon: '🤖' },
  { key: 'note', label: 'Note', icon: '📝' },
  { key: 'other', label: 'Other', icon: '📦' },
]

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done' | 'blocked'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type MemberRole = 'admin' | 'manager' | 'worker'
export type MemberStatus = 'active' | 'inactive' | 'on_leave'

export const TASK_STATUSES: { key: TaskStatus; label: string }[] = [
  { key: 'todo', label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
  { key: 'blocked', label: 'Blocked' },
]

export const TASK_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent']

export type Platform = 'twitter' | 'reddit' | 'instagram' | 'tiktok' | 'youtube'

export const PLATFORMS: { key: Platform; label: string; emoji: string }[] = [
  { key: 'twitter', label: 'Twitter', emoji: '🐦' },
  { key: 'reddit', label: 'Reddit', emoji: '📺' },
  { key: 'instagram', label: 'Instagram', emoji: '📸' },
  { key: 'tiktok', label: 'TikTok', emoji: '🎵' },
  { key: 'youtube', label: 'YouTube', emoji: '▶️' },
]

export type SopCategory = 'general' | 'twitter' | 'reddit' | 'instagram' | 'tiktok' | 'youtube' | 'onboarding' | 'va_guide'
export type SopStatus = 'active' | 'draft' | 'archived'

export const SOP_CATEGORIES: SopCategory[] = [
  'general', 'twitter', 'reddit', 'instagram', 'tiktok', 'youtube', 'onboarding', 'va_guide',
]

export type MemberWithSkills = Member & {
  skills: (MemberSkill & { skill: Skill })[]
  has_va_token?: boolean
}

export type TaskWithAssignee = Task & {
  assignee: Member | null
}

export type TaskWithDetails = Task & {
  assignee: Member | null
  created_by_member: Member | null
  activity: TaskActivity[]
}

export type SopWithVersions = Sop & {
  versions: SopVersion[]
}
