import { format, parseISO, isValid } from 'date-fns'

function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return isValid(value) ? value : null
  if (typeof value === 'string') {
    const s = value.trim()
    // Date-only YYYY-MM-DD: construct with local parts to avoid UTC shift
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) {
      const d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]))
      return isValid(d) ? d : null
    }
    const d = parseISO(s)
    return isValid(d) ? d : null
  }
  return null
}

/**
 * Parse a value from Excel/CSV (number = Excel serial, Date, or string) to YYYY-MM-DD.
 * Used for Since/Birthday/Anniversary on member import. Returns '' if unparseable.
 */
export function parseDateToYYYYMMDD(value) {
  if (value == null || value === '') return ''

  // JS Date object — always read UTC parts; Date objects here come from
  // UTC-midnight sources (XLSX cellDates, new Date(isoString)) so UTC is correct
  if (value instanceof Date) {
    if (!isValid(value)) return ''
    const yyyy = value.getUTCFullYear()
    const mm = String(value.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(value.getUTCDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  // Excel serial number — days since 1900-01-01; read in UTC to preserve the day
  if (typeof value === 'number') {
    const d = new Date(Math.round((value - 25569) * 86400 * 1000))
    if (!isValid(d)) return ''
    const yyyy = d.getUTCFullYear()
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(d.getUTCDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  const s = String(value).trim()
  if (!s || /^na$/i.test(s)) return ''
  // Normalise spaces around separators: "27/ 05/ 1989" → "27/05/1989"
  const norm = s.replace(/\s*([\/\-])\s*/g, '$1')

  // Already YYYY-MM-DD — return as-is, no Date object needed
  if (/^\d{4}-\d{2}-\d{2}$/.test(norm)) return norm

  // DD/MM/YYYY or DD-MM-YYYY — rearrange digits, no Date object → no timezone shift
  const dmy = norm.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmy) {
    const dd = dmy[1].padStart(2, '0')
    const mm = dmy[2].padStart(2, '0')
    const yyyy = dmy[3]
    if (parseInt(mm) >= 1 && parseInt(mm) <= 12 && parseInt(dd) >= 1 && parseInt(dd) <= 31)
      return `${yyyy}-${mm}-${dd}`
  }

  // Last resort: Date constructor with local parts
  const d = new Date(norm)
  if (!isValid(d)) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function formatDMY(value) {
  const d = toDate(value)
  return d ? format(d, 'dd-MM-yyyy') : '—'
}

export function formatDMYTime(value) {
  const d = toDate(value)
  return d ? format(d, 'dd-MM-yyyy HH:mm') : '—'
}

export function formatDisplayDate(value) {
  if (!value) return '—'
  const d = toDate(value)
  return d ? format(d, 'dd/MMM/yyyy') : '—'
}

/** This coming Sunday's date (today itself if today is Sunday), as YYYY-MM-DD. */
export function nextSundayISO() {
  const today = new Date()
  const day = today.getDay()
  const daysUntilSunday = day === 0 ? 0 : 7 - day
  const next = new Date(today)
  next.setDate(today.getDate() + daysUntilSunday)
  return format(next, 'yyyy-MM-dd')
}

/**
 * Minutes between two "HH:mm" (24-hour) times. If endTime is earlier than
 * startTime it's treated as crossing midnight (e.g. 23:45 → 00:20 = 35 min)
 * rather than going negative — a meeting doesn't run backwards.
 * Returns null if either time is missing/unparseable.
 */
export function computeDurationMinutes(startTime, endTime) {
  const s = /^(\d{1,2}):(\d{2})$/.exec(String(startTime || '').trim())
  const e = /^(\d{1,2}):(\d{2})$/.exec(String(endTime || '').trim())
  if (!s || !e) return null
  const startMins = parseInt(s[1], 10) * 60 + parseInt(s[2], 10)
  const endMins = parseInt(e[1], 10) * 60 + parseInt(e[2], 10)
  if (startMins < 0 || startMins > 1439 || endMins < 0 || endMins > 1439) return null
  const diff = endMins - startMins
  return diff >= 0 ? diff : diff + 24 * 60
}

/**
 * "HH:mm" (24-hour) + a minute offset → "HH:mm", wrapping past midnight
 * (e.g. "23:45" + 30 → "00:15"). Returns '' if time is missing/unparseable.
 */
export function addMinutesToTime(time24, minutesToAdd) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time24 || '').trim())
  if (!m) return ''
  const total = (parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (Number(minutesToAdd) || 0)) % 1440
  const wrapped = total < 0 ? total + 1440 : total
  const h = Math.floor(wrapped / 60)
  const min = wrapped % 60
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/** "20:15" → "8:15 PM" */
export function formatTime12h(time24) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time24 || '').trim())
  if (!m) return '—'
  const h = parseInt(m[1], 10)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m[2]} ${period}`
}

/** minutes → "1 hr 15 min" / "45 min" / "2 hr" */
export function formatDurationLong(minutes) {
  if (minutes == null || Number.isNaN(Number(minutes))) return null
  const m = Number(minutes)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem ? `${h} hr ${rem} min` : `${h} hr`
}

/**
 * "8:15 PM – 9:30 PM (1 hr 15 min)" from raw "HH:mm" start/end times — the
 * single source of truth for how a meeting's timing is displayed anywhere
 * (report cards, history detail, PDF export).
 */
export function formatMeetingTimeRange(startTime, endTime) {
  if (!startTime || !endTime) return null
  const minutes = computeDurationMinutes(startTime, endTime)
  const durationLabel = formatDurationLong(minutes)
  return `${formatTime12h(startTime)} – ${formatTime12h(endTime)}${durationLabel ? ` (${durationLabel})` : ''}`
}

