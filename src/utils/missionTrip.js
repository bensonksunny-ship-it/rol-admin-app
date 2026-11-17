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
  `Hello${trip?.teamName ? ` ${trip.teamName}` : ''}! Here is your trip plan from River Of Life Church, Bangalore. Please open the link, add your name, your flight details and tell us your preferences: ${link}`

/** Turn a comma / new-line separated string into a clean option list. */
export const parseOptions = (s) => String(s || '').split(/[\n,]/).map((x) => x.trim()).filter(Boolean)
