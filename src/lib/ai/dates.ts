// Natural-language date parsing, resolved against the Europe/Bratislava timezone
// (the team's home base) and returned as UTC ISO-8601 strings suitable for
// tf_tasks.due_date (timestamptz).

export const TEAM_TIMEZONE = 'Europe/Bratislava'

// Default wall-clock time (Bratislava local) applied to a bare day reference
// ("today", "friday", "2026-07-20") that doesn't specify a time.
const DEFAULT_HOUR = 18
const DEFAULT_MINUTE = 0

interface ZonedParts {
  year: number
  month: number // 1-12
  day: number
  hour: number
  minute: number
  second: number
}

function getTzOffsetMinutes(utcDate: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(utcDate)
  const map: Record<string, string> = {}
  for (const p of parts) map[p.type] = p.value
  const asIfUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour === '24' ? '0' : map.hour),
    Number(map.minute),
    Number(map.second)
  )
  return (asIfUTC - utcDate.getTime()) / 60000
}

/** Converts a Bratislava-local wall-clock date/time into a UTC Date instant. */
function zonedToUtc(p: ZonedParts, timeZone: string = TEAM_TIMEZONE): Date {
  const naiveUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  const guess = new Date(naiveUtc)
  const offsetMinutes = getTzOffsetMinutes(guess, timeZone)
  return new Date(naiveUtc - offsetMinutes * 60000)
}

/** Returns the current wall-clock date/time in Bratislava as broken-down parts. */
export function nowInTeamTz(timeZone: string = TEAM_TIMEZONE): ZonedParts & { weekday: number } {
  const now = new Date()
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  })
  const parts = dtf.formatToParts(now)
  const map: Record<string, string> = {}
  for (const p of parts) map[p.type] = p.value
  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour === '24' ? '0' : map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: weekdayNames.indexOf(map.weekday),
  }
}

/** Today's date in Bratislava as YYYY-MM-DD (for display / context building). */
export function todayLabel(): string {
  const p = nowInTeamTz()
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

function addDays(p: ZonedParts, days: number): ZonedParts {
  // Use UTC-safe date math on the (year, month, day) triple, ignoring tz — this is
  // just calendar arithmetic on the *local* wall-clock date, not an instant.
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day))
  d.setUTCDate(d.getUTCDate() + days)
  return { ...p, year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
}

interface TimeOfDay {
  hour: number
  minute: number
}

function parseTimeToken(raw: string): TimeOfDay | null {
  // "3pm", "3:30pm", "15:00", "9 am"
  const ampmMatch = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i)
  if (ampmMatch) {
    let hour = Number(ampmMatch[1]) % 12
    const minute = ampmMatch[2] ? Number(ampmMatch[2]) : 0
    if (/pm/i.test(ampmMatch[3])) hour += 12
    return { hour, minute }
  }
  const hhmm = raw.match(/^(\d{1,2}):(\d{2})$/)
  if (hhmm) {
    const hour = Number(hhmm[1])
    const minute = Number(hhmm[2])
    if (hour < 24 && minute < 60) return { hour, minute }
  }
  return null
}

/**
 * Parses a natural-language date/time expression (as typically written in chat)
 * into a UTC ISO-8601 string, resolved against the team's Bratislava timezone.
 * Returns null if the input can't be confidently parsed.
 *
 * Supported: "today", "tomorrow", "yesterday", weekday names (optionally
 * prefixed with "next"), "in N hour(s)/h", "in N day(s)/d", "in N week(s)/w",
 * ISO dates (YYYY-MM-DD[THH:MM]), "MM/DD" or "MM/DD/YYYY", and an optional
 * trailing time-of-day ("at 3pm", "5:30pm", "17:00").
 *
 * A bare day reference with no time defaults to 18:00 Bratislava time.
 */
export function parseNaturalDate(input: string | null | undefined): string | null {
  if (!input) return null
  const raw = input.trim()
  if (!raw) return null

  // Already a full ISO timestamp — pass through untouched.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) {
    const d = new Date(raw)
    return isNaN(d.getTime()) ? null : d.toISOString()
  }

  const lower = raw.toLowerCase().trim()
  const now = nowInTeamTz()

  // "in N hour(s)" / "in Nh" — relative to the current instant, not a calendar day.
  const relHours = lower.match(/^in\s+(\d+)\s*(?:h|hr|hrs|hour|hours)$/)
  if (relHours) {
    return new Date(Date.now() + Number(relHours[1]) * 3600_000).toISOString()
  }
  const relMinutes = lower.match(/^in\s+(\d+)\s*(?:m|min|mins|minute|minutes)$/)
  if (relMinutes) {
    return new Date(Date.now() + Number(relMinutes[1]) * 60_000).toISOString()
  }
  const relDays = lower.match(/^in\s+(\d+)\s*(?:d|day|days)$/)
  if (relDays) {
    const target = addDays(now, Number(relDays[1]))
    return zonedToUtc({ ...target, hour: DEFAULT_HOUR, minute: DEFAULT_MINUTE, second: 0 }).toISOString()
  }
  const relWeeks = lower.match(/^in\s+(\d+)\s*(?:w|wk|week|weeks)$/)
  if (relWeeks) {
    const target = addDays(now, Number(relWeeks[1]) * 7)
    return zonedToUtc({ ...target, hour: DEFAULT_HOUR, minute: DEFAULT_MINUTE, second: 0 }).toISOString()
  }

  // Split off a trailing "at <time>" or bare time token.
  let datePart = lower
  let timeOfDay: TimeOfDay | null = null
  const atMatch = lower.match(/^(.*?)\s*(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{1,2}:\d{2})$/)
  if (atMatch && atMatch[1].trim()) {
    const parsedTime = parseTimeToken(atMatch[2].replace(/\s+/g, ''))
    if (parsedTime) {
      datePart = atMatch[1].trim()
      timeOfDay = parsedTime
    }
  }

  let target: ZonedParts | null = null

  if (datePart === 'today') {
    target = now
  } else if (datePart === 'tomorrow') {
    target = addDays(now, 1)
  } else if (datePart === 'yesterday') {
    target = addDays(now, -1)
  } else {
    const nextMatch = datePart.match(/^(?:next\s+|this\s+)?(sun(day)?|mon(day)?|tue(s|sday)?|wed(nesday)?|thu(r|rs|rsday)?|fri(day)?|sat(urday)?)$/)
    if (nextMatch) {
      const wantDow = WEEKDAYS[nextMatch[1]]
      const isNext = /^next\s+/.test(datePart)
      let delta = (wantDow - now.weekday + 7) % 7
      if (delta === 0) delta = isNext ? 7 : 0 // bare weekday name that matches today -> today; "next X" -> next week
      if (delta === 0 && isNext) delta = 7
      target = addDays(now, delta)
    } else {
      // ISO date without time
      const isoDate = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (isoDate) {
        target = { year: Number(isoDate[1]), month: Number(isoDate[2]), day: Number(isoDate[3]), hour: 0, minute: 0, second: 0 }
      } else {
        // MM/DD or MM/DD/YYYY
        const slashDate = datePart.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)
        if (slashDate) {
          const month = Number(slashDate[1])
          const day = Number(slashDate[2])
          let year = slashDate[3] ? Number(slashDate[3]) : now.year
          if (year < 100) year += 2000
          target = { year, month, day, hour: 0, minute: 0, second: 0 }
        }
      }
    }
  }

  if (!target) return null

  const finalTime = timeOfDay ?? { hour: DEFAULT_HOUR, minute: DEFAULT_MINUTE }
  return zonedToUtc({ ...target, hour: finalTime.hour, minute: finalTime.minute, second: 0 }).toISOString()
}
