/* eslint-disable @typescript-eslint/no-explicit-any */
import { createAdminClient } from '@/lib/supabase/admin'
import { escapeHtml } from '@/lib/teamflow-db'

const supabase = createAdminClient()

const SCHEDULE = [
  { h: 8, m: 0, title: "Morning warm-up + engagement", items: [
    "Reply to ALL overnight comments & DMs first",
    "Like/comment on 10–15 in-niche posts (competitors + target accounts)",
    "Post 1 Story from the Vault — use a poll or question sticker",
  ]},
  { h: 12, m: 0, title: "Primary Reel #1 + push (US lunch)", items: [
    "Post the day's main reel — proven format for THIS account's sub-niche",
    "First 30 min: reply to every comment as it lands",
    "Post 1 Story pointing to the new reel",
    "Log the reel link in the Post Log",
    "Post 1 FRESH trial reel to non-followers — NEW video, NEVER same file",
  ]},
  { h: 15, m: 0, title: "Midday engagement + story", items: [
    "Reply to all comments on the midday reel",
    "Post 1 Story from the Vault",
    "Engage with 10 in-niche posts",
  ]},
  { h: 19, m: 30, title: "Optional Reel #2 (US prime time) + close out", items: [
    "Only post 2nd reel if ready AND ≥6h after Reel #1. Max 2 reels/day",
    "Post 1–2 Stories (Vault image + question)",
    "Reply to ALL remaining comments & DMs",
    "Log every link below",
  ]},
]

const TOTAL_TASKS = SCHEDULE.reduce((s, b) => s + b.items.length, 0)

function etDay(): string {
  const now = new Date()
  const etStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  return etStr
}

function etNow(): { h: number; m: number } {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now)
  const h = Number(parts.find(p => p.type === 'hour')?.value || '0')
  const m = Number(parts.find(p => p.type === 'minute')?.value || '0')
  return { h: h === 24 ? 0 : h, m }
}

function timeLabel(h: number, m: number): string {
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2, '0')} ${ampm} ET`
}

export // eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getVATodoMessage(accountHandle?: string): Promise<string> {
  const day = etDay()
  const now = etNow()
  const nowMinutes = now.h * 60 + now.m

  // Get our accounts
  let accounts: string[] = []
  try {
    const { data } = await supabase.from('our_accounts').select('handle').order('handle')
    accounts = (data || []).map((a: any) => a.handle).filter(Boolean)
  } catch {}

  const handle = accountHandle?.replace(/^@/, '').toLowerCase() || accounts[0] || ''
  if (!handle) return "No Instagram accounts found."

  // Get completed tasks for this account today
  let doneSet = new Set<string>()
  try {
    const { data } = await supabase.from('va_checklist').select('task_key').eq('account_handle', handle).eq('day', day)
    doneSet = new Set((data || []).map((r: any) => r.task_key))
  } catch {}

  // Get posts logged today
  let postsToday = 0
  try {
    const { data } = await supabase.from('va_posts').select('id').eq('account_handle', handle).eq('post_type', 'reel').gte('logged_at', day)
    postsToday = (data || []).length
  } catch {}

  // Get account followers
  let followers = 0
  try {
    const { data } = await supabase.from('our_accounts').select('followers').eq('handle', handle).limit(1)
    followers = Number(data?.[0]?.followers || 0)
  } catch {}

  const doneCount = doneSet.size
  const pct = Math.round((doneCount / TOTAL_TASKS) * 100)

  let msg = `📋 <b>VA Daily Checklist</b>\n`
  msg += `@${escapeHtml(handle)} · ${followers.toLocaleString()} followers\n`
  msg += `${day} (ET) · ${doneCount}/${TOTAL_TASKS} done (${pct}%) · ${postsToday} reels posted today\n\n`

  for (const block of SCHEDULE) {
    const blockTime = block.h * 60 + block.m
    const isPast = nowMinutes >= blockTime
    const isCurrent = nowMinutes >= blockTime && nowMinutes < blockTime + 120
    const status = isCurrent ? '🔵' : isPast ? '✅' : '⏳'
    
    msg += `${status} <b>${timeLabel(block.h, block.m)} — ${escapeHtml(block.title)}</b>\n`
    
    block.items.forEach((item, i) => {
      const taskKey = `${block.h}:${block.m}:${i}`
      const isDone = doneSet.has(taskKey)
      const check = isDone ? '✅' : '⬜'
      msg += `  ${check} ${escapeHtml(item)}\n`
    })
    msg += '\n'
  }

  msg += `<b>Quotas:</b>\n`
  msg += `  • Reels: 1–2 per day, ≥6h apart\n`
  msg += `  • Stories: 3–5 per day\n`
  msg += `  • Comment replies: Reply to ALL\n`
  msg += `  • Outbound engagement: 20–30/day\n`

  if (accounts.length > 1) {
    msg += `\n<b>Switch account:</b> /vatodo @handle\n`
    msg += `<b>Accounts:</b> ${accounts.map(a => '@' + escapeHtml(a)).join(', ')}`
  }

  return msg
}
