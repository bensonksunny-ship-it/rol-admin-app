// Shared by SP Office → Mission Trips (spoffice/MissionTrips.jsx) and the public
// team page (pages/MissionTripPlan.jsx).
import { addDays, format, parseISO, differenceInCalendarDays, isValid } from 'date-fns'

// Never throw on a bad date string — '' instead (a RangeError here would blank the page).
const safeFormat = (iso, pattern) => {
  if (!iso || typeof iso !== 'string') return ''
  const d = parseISO(iso)
  return isValid(d) ? format(d, pattern) : ''
}

export const ITEM_KINDS = [
  { key: 'meeting', label: 'Meeting / Program', emoji: '🙏' },
  { key: 'meal',    label: 'Meal',              emoji: '🍽️' },
  { key: 'travel',  label: 'Travel',            emoji: '🚐' },
  { key: 'visit',   label: 'Visit / Sightseeing', emoji: '📍' },
  { key: 'rest',    label: 'Free time / Rest',  emoji: '☕' },
  { key: 'other',   label: 'Other',             emoji: '📌' },
]
export const kindOf = (key) => ITEM_KINDS.find((k) => k.key === key) || ITEM_KINDS[ITEM_KINDS.length - 1]

export const ITEM_STATUSES = [
  { key: 'confirmed', label: 'Confirmed',              cls: 'bg-emerald-100 text-emerald-700' },
  { key: 'tentative', label: 'Tentative',              cls: 'bg-amber-100 text-amber-700' },
  { key: 'suggest',   label: 'Your suggestion wanted', cls: 'bg-indigo-100 text-indigo-700' },
]
export const statusOf = (key) => ITEM_STATUSES.find((s) => s.key === key) || ITEM_STATUSES[0]

export const newId = () => Math.random().toString(36).slice(2, 10)

/** Questions a new trip starts with — the office edits them freely. */
export function defaultQuestions() {
  return [
    {
      id: newId(),
      text: 'What kind of food do you prefer?',
      options: ['South Indian', 'North Indian', 'American / Continental', 'Chinese', 'Vegetarian only', 'Mild / less spicy'],
      multi: true,
      allowOther: true,
    },
    {
      id: newId(),
      text: 'Is there anything you would especially like to do or see while you are here?',
      options: [],
      multi: false,
      allowOther: true,
    },
  ]
}

/** Every yyyy-MM-dd from start to end (inclusive); capped so a typo can't explode. */
export function tripDays(start, end) {
  if (!start || typeof start !== 'string') return []
  const s = parseISO(start)
  if (!isValid(s)) return []
  const e0 = end && typeof end === 'string' ? parseISO(end) : s
  const e = isValid(e0) ? e0 : s
  const n = Math.min(Math.max(differenceInCalendarDays(e, s), 0), 60)
  return Array.from({ length: n + 1 }, (_, i) => format(addDays(s, i), 'yyyy-MM-dd'))
}

export const dayLabel = (iso) => safeFormat(iso, 'EEE, d MMM') || 'Date not set'
export const fullDate = (iso) => safeFormat(iso, 'd MMM yyyy')
// ── Completion check ──
/**
 * When an item counts as "over": its end time, else its start time, else the end of its
 * day (local time). Undated items never come due. Returns a Date or null.
 */
export function itemDueAt(item) {
  if (!item?.date || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) return null
  const hm = /^\d{1,2}:\d{2}$/.test(item.endTime || '') ? item.endTime : /^\d{1,2}:\d{2}$/.test(item.time || '') ? item.time : '23:59'
  const [y, m, d] = item.date.split('-').map(Number)
  const [h, min] = hm.split(':').map(Number)
  return new Date(y, m - 1, d, h, min)
}
export const isItemDue = (item, now = new Date()) => {
  const due = itemDueAt(item)
  return !!due && now >= due && !item?.completion?.outcome
}

// ── Food rating ──
const FOOD_WORDS = /\b(breakfast|brunch|lunch|dinner|supper|snacks?|tea|coffee|meals?|food|feast|buffet)\b/i
/** Meal items (kind "meal") or anything whose title reads like food. */
export const isFoodItem = (item) => item?.kind === 'meal' || FOOD_WORDS.test(String(item?.title || ''))

/** Average of the team's ratings for one item: { avg, count, entries: [{ name, stars, comment }] }. */
export function ratingSummary(guests, itemId) {
  const entries = (guests || [])
    .map((g) => (g.ratings?.[itemId] ? { name: g.name || 'Guest', ...g.ratings[itemId] } : null))
    .filter(Boolean)
  const count = entries.length
  const avg = count ? entries.reduce((a, e) => a + e.stars, 0) / count : 0
  return { avg, count, entries }
}

/**
 * Shrink a phone photo before upload (longest side ≤ maxSide, JPEG) so a trip's
 * pictures stay small in Storage and quick in the Travel Diary PDF. Returns a Blob.
 */
export async function compressImage(file, maxSide = 1600, quality = 0.8) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('This file is not a photo the browser can open.'))
      i.src = url
    })
    const r = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.round(img.naturalWidth * r); c.height = Math.round(img.naturalHeight * r)
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', quality))
    if (!blob) throw new Error('Could not prepare the photo.')
    return blob
  } finally { URL.revokeObjectURL(url) }
}

// Local today as 'yyyy-MM-dd' (matches tripDays keys).
const pad2 = (n) => String(n).padStart(2, '0')
export const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` }

// "14:30" → "2:30 PM"
export function formatTime(t) {
  if (!t) return ''
  const [h, m] = String(t).split(':').map(Number)
  if (Number.isNaN(h)) return String(t)
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

// "2026-12-03T18:45" (datetime-local) → "3 Dec, 6:45 PM"
export function formatDateTime(v) {
  if (!v) return ''
  const [d, t] = String(v).split('T')
  const day = safeFormat(d, 'd MMM')
  return `${day}${t ? `${day ? ', ' : ''}${formatTime(t)}` : ''}`
}

export const sortItems = (items) =>
  [...(items || [])].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.time || '99').localeCompare(String(b.time || '99')))

/** Items with "Your suggestion wanted" plus the general questions — everything a member answers. */
export function answerablePrompts(trip) {
  const fromItems = sortItems(trip?.items).filter((i) => i.status === 'suggest').map((i) => ({
    id: i.id,
    text: i.question || `${i.title || kindOf(i.kind).label}${i.date ? ` (${dayLabel(i.date)})` : ''}: what would you suggest?`,
    options: i.options || [],
    multi: !!i.multi,
    allowOther: true,
    itemId: i.id,
  }))
  return [...fromItems, ...(trip?.questions || [])]
}

export const missionTripLink = (token) => `${window.location.origin}/mission-trip?token=${token}`

export const whatsappShareHref = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`

export const missionInviteMessage = (trip, link) =>
  `Hello${trip?.teamName ? ` ${trip.teamName}` : ''}! Here is your trip plan from River Of Life Church, Bangalore. Please open the link, add your name and tell us your food preferences and suggestions: ${link}`

/** Turn a comma / new-line separated string into a clean option list. */
export const parseOptions = (s) => String(s || '').split(/[\n,]/).map((x) => x.trim()).filter(Boolean)

/**
 * Tour completion for the progress bar. Percent = completed events / scheduled
 * events; with no events yet it falls back to time elapsed between the trip's
 * start (00:00) and end (23:59). Also returns the "Day n of N" position.
 */
export function tourProgress(trip, now = new Date()) {
  const days = tripDays(trip?.startDate, trip?.endDate)
  const events = (Array.isArray(trip?.items) ? trip.items : []).filter(Boolean)
  const total = events.length
  const done = events.filter((it) => it.completion?.outcome).length
  let timePct = 0
  if (days.length) {
    const [y1, m1, d1] = days[0].split('-').map(Number)
    const [y2, m2, d2] = days[days.length - 1].split('-').map(Number)
    const s = new Date(y1, m1 - 1, d1).getTime()
    const e = new Date(y2, m2 - 1, d2, 23, 59, 59).getTime()
    timePct = Math.min(100, Math.max(0, ((now.getTime() - s) / (e - s)) * 100))
  }
  const pct = Math.round(total ? (done / total) * 100 : timePct)
  const today = format(now, 'yyyy-MM-dd')
  const dayIndex = days.indexOf(today) + 1
  const phase = !days.length ? 'undated' : today < days[0] ? 'upcoming' : today > days[days.length - 1] ? 'finished' : 'running'
  return { pct, done, total, dayIndex, dayCount: days.length, phase }
}
