/**
 * "Relocated / Moved Out" — honourable offboarding for PCS people who move to
 * another city or country. Stored on the caring_pcs entry next to the Away
 * fields (see utils/awayStatus.js):
 *   relocated: true, relocatedLastDate: 'YYYY-MM-DD', relocatedDestination,
 *   relocatedStanding, relocatedOn (date the status was set)
 * Relocated people are never flagged for absence after their last attendance
 * date — awayStatus.isProfileAwayOn treats every later week as skipped.
 */
import { todayISO, buildReturnPatch } from './awayStatus'

export const DEFAULT_STANDING = 'In Good Standing / Very Good'
export const RELOCATED_BADGE_CLS = 'bg-violet-100 text-violet-700 border-violet-200'

export const isRelocated = (entry) => !!entry?.relocated

/** Official last day a relocated person was part of the church body
 *  (churchJourney.partOfChurchTillDate), falling back to the last attendance date
 *  for relocations saved before that field existed. This — not the raw attendance
 *  date — is the terminal date for church tenure and the closure/appreciation PDF. */
export const churchTillDate = (entry) =>
  String(entry?.churchJourney?.partOfChurchTillDate || entry?.relocatedLastDate || '').slice(0, 10)

const iso = (v) => String(v || '').slice(0, 10)

/** Manual PCS ministry rows (entry.ministries) closed out on relocation: anything
 *  still open, or merely Inactive, becomes Completed ending on the last attendance
 *  date (an earlier explicit end date is kept). */
export function completeMinistriesOnRelocation(ministries, lastDate) {
  const end = iso(lastDate)
  return (ministries || []).map((r) => {
    if (!r || r.ended === 'completed') return r
    const existing = iso(r.to)
    return { ...r, ended: 'completed', to: existing && existing < end ? existing : end, endedReason: 'relocated' }
  })
}

/** Firestore patch to mark someone Relocated (ends any current Away period first). */
export function buildRelocatedPatch(entry, { lastDate, destination, standing, tillDate }) {
  const end = iso(lastDate) || todayISO()
  return {
    ...(entry?.away ? buildReturnPatch(entry) : {}),
    ...(Array.isArray(entry?.ministries) && entry.ministries.length
      ? { ministries: completeMinistriesOnRelocation(entry.ministries, end) }
      : {}),
    relocated: true,
    relocatedLastDate: iso(lastDate) || todayISO(),
    relocatedDestination: String(destination || '').trim(),
    relocatedStanding: String(standing || '').trim() || DEFAULT_STANDING,
    relocatedOn: todayISO(),
    churchJourney: { ...(entry?.churchJourney || {}), partOfChurchTillDate: iso(tillDate) || end },
  }
}

/** Patch to bring a relocated person back to Active (they moved back). */
export function buildUnrelocatePatch(entry) {
  return {
    relocated: false, relocatedLastDate: '', relocatedDestination: '', relocatedStanding: '', relocatedOn: '',
    churchJourney: { ...(entry?.churchJourney || {}), partOfChurchTillDate: '' },
  }
}

/** Whole months between two ISO dates (end defaults to today). */
export function monthsBetween(from, to) {
  if (!from) return 0
  const s = new Date(from), e = to ? new Date(to) : new Date()
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return 0
  let m = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
  if (e.getDate() < s.getDate()) m--
  return Math.max(0, m)
}

/** "3 yrs 5 mos" / "1 yr" / "8 mos" / "Less than a month". */
export function formatMonths(total) {
  const y = Math.floor(total / 12), m = total % 12
  const parts = []
  if (y > 0) parts.push(`${y} yr${y > 1 ? 's' : ''}`)
  if (m > 0) parts.push(`${m} mo${m > 1 ? 's' : ''}`)
  return parts.join(' ') || 'Less than a month'
}

/** Spoken form for the appreciation statement: "3 years and 5 months". */
export function formatMonthsLong(total) {
  const y = Math.floor(total / 12), m = total % 12
  const parts = []
  if (y > 0) parts.push(`${y} year${y > 1 ? 's' : ''}`)
  if (m > 0) parts.push(`${m} month${m > 1 ? 's' : ''}`)
  return parts.join(' and ') || 'a season'
}

// Ministry roles counted toward "leadership" time.
export const LEADERSHIP_ROLE_RE = /lead|director|coordinator|head|pastor|captain|in-?charge|chair/i

export function appreciationStatement(name, tenureMonths, destination) {
  return `River of Life Christian Church honors and appreciates ${name} for ${formatMonthsLong(tenureMonths)} of dedicated service and ministry. ` +
    `As you step into this new season${destination ? ` in ${destination}` : ''}, we bless you and send you forth with joy.`
}
