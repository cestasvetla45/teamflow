export type MemberStatus = 'active' | 'inactive' | 'on_leave'
export type MemberRole = 'admin' | 'manager' | 'worker'
export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done' | 'blocked'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type Platform = 'twitter' | 'reddit' | 'instagram' | 'tiktok' | 'youtube'
export type SopCategory = 'general' | 'twitter' | 'reddit' | 'instagram' | 'tiktok' | 'youtube' | 'onboarding' | 'va_guide'
export type SopStatus = 'active' | 'draft' | 'archived'

export interface TfMember {
  id: string
  name: string
  telegram_id: number | null
  telegram_username: string | null
  discord_id: string | null
  email: string | null
  role: MemberRole
  status: MemberStatus
  max_daily_hours: number
  timezone: string
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface TfSkill {
  id: string
  name: string
  description: string | null
  category: string
  created_at: string
}

export interface TfMemberSkill {
  id: string
  member_id: string
  skill_id: string
  proficiency_level: number
  created_at: string
}

export interface TfBoard {
  id: string
  name: string
  description: string | null
  owner_id: string | null
  created_at: string
}

export interface TfTask {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  board_id: string
  assignee_id: string | null
  created_by: string | null
  due_date: string | null
  completed_at: string | null
  position: number
  estimated_hours: number | null
  actual_hours: number | null
  tags: string[]
  platform: Platform | null
  created_at: string
  updated_at: string
}

export interface TfTaskActivity {
  id: string
  task_id: string
  member_id: string | null
  action: string
  old_value: string | null
  new_value: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface TfWorkloadLog {
  id: string
  member_id: string
  log_date: string
  hours_assigned: number
  hours_logged: number
  tasks_active: number
  tasks_completed: number
  created_at: string
}

export type VaultItemType = 'account' | 'login' | 'proxy' | 'api_key' | 'note' | 'other'

export interface TfVaVaultItem {
  id: string
  member_id: string
  item_type: VaultItemType
  name: string
  url: string | null
  username: string | null
  password: string | null
  api_key: string | null
  proxy_address: string | null
  proxy_port: string | null
  proxy_username: string | null
  proxy_password: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface TfVaToken {
  id: string
  member_id: string
  token: string
  created_at: string
  expires_at: string | null
  last_used_at: string | null
}

export interface TfSop {
  id: string
  title: string
  content: string
  category: SopCategory
  platform: Platform | null
  version: number
  status: SopStatus
  created_by: string | null
  tags: string[]
  telegram_message_id: number | null
  discord_message_id: string | null
  created_at: string
  updated_at: string
}

export interface TfSopVersion {
  id: string
  sop_id: string
  version: number
  title: string
  content: string
  edited_by: string | null
  change_note: string | null
  created_at: string
}

export interface TfTelegramTopic {
  id: string
  topic_name: string
  chat_id: number | null
  message_thread_id: number | null
  description: string | null
  discord_channel_id: string | null
  discord_guild_id: string | null
  created_at: string
}

export interface TfTopicAccess {
  id: string
  topic_name: string
  role: MemberRole
  skill: string | null
  created_at: string
}

export interface TfTeam {
  id: string
  name: string
  description: string | null
  discord_role_id: string | null
  created_at: string
}

export interface TfMemberTeam {
  id: string
  member_id: string
  team_id: string
  created_at: string
}

export interface TfTopicTeamAccess {
  id: string
  topic_name: string
  team_id: string
  created_at: string
}
