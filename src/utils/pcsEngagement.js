// PCS "Engagement Type" — how a person connects with the church. Decides which
// attendance source judges whether they're active: Sunday service, cell
// meetings, or both. Stored on caring_pcs.engagementType; a missing value means
// the original behaviour (Sunday & Cell).

export const ENGAGEMENT_SUNDAY_CELL = 'sunday_cell'
export const ENGAGEMENT_CELL_ONLY = 'cell_only'
export const ENGAGEMENT_SUNDAY_ONLY = 'sunday_only'

export const ENGAGEMENT_TYPES = [
  { value: ENGAGEMENT_SUNDAY_CELL, label: 'Sunday & Cell' },
  { value: ENGAGEMENT_CELL_ONLY, label: 'Cell Only' },
  { value: ENGAGEMENT_SUNDAY_ONLY, label: 'Sunday Only' },
]

const VALID = new Set(ENGAGEMENT_TYPES.map((t) => t.value))

export function normalizeEngagementType(value) {
  return VALID.has(value) ? value : ENGAGEMENT_SUNDAY_CELL
}

export function engagementLabel(value) {
  return ENGAGEMENT_TYPES.find((t) => t.value === normalizeEngagementType(value)).label
}

export const isCellOnly = (entry) => normalizeEngagementType(entry?.engagementType) === ENGAGEMENT_CELL_ONLY
export const isSundayOnly = (entry) => normalizeEngagementType(entry?.engagementType) === ENGAGEMENT_SUNDAY_ONLY

/**
 * name / visitorId / phone → engagementType, built from PCS entries, for attendance
 * sheets that need to tag a roster row ("Cell Only" / "Sunday Only"). Tags are
 * informational only — nobody is ever filtered out of an attendance list by it.
 */
export function buildEngagementLookup(pcsEntries) {
  const byVisitor = new Map(), byPhone = new Map(), byName = new Map()
  for (const e of pcsEntries || []) {
    if (e.status === 'inactive') continue
    const t = normalizeEngagementType(e.engagementType)
    if (e.visitorId) byVisitor.set(e.visitorId, t)
    const phone = String(e.phone || '').replace(/\s+/g, '')
    if (phone) byPhone.set(phone, t)
    const name = String(e.name || '').trim().toLowerCase()
    if (name) byName.set(name, t)
  }
  return ({ visitorId, phone, name } = {}) => {
    if (visitorId && byVisitor.has(visitorId)) return byVisitor.get(visitorId)
    const p = String(phone || '').replace(/\s+/g, '')
    if (p && byPhone.has(p)) return byPhone.get(p)
    const n = String(name || '').trim().toLowerCase()
    return (n && byName.get(n)) || null
  }
}

/** Short tag for an attendance row; null for Sunday & Cell (the default needs no tag). */
export function engagementTag(type) {
  if (type === ENGAGEMENT_CELL_ONLY) return { label: 'Cell Only', cls: 'bg-teal-50 text-teal-700 border-teal-200' }
  if (type === ENGAGEMENT_SUNDAY_ONLY) return { label: 'Sunday Only', cls: 'bg-sky-50 text-sky-700 border-sky-200' }
  return null
}

/** A PCS entry's active cell-roster row — visitorId first, phone second (the
 *  same match the PCS profile uses for its "Cell Group" line). */
export function findPcsCellMember(entry, cellMembers) {
  const phone = String(entry?.phone || '').replace(/\s+/g, '')
  return cellMembers.find((m) =>
    m.status !== 'inactive' && (
      (entry?.visitorId && m.visitorId && m.visitorId === entry.visitorId) ||
      (phone && m.phone && String(m.phone).replace(/\s+/g, '') === phone)
    )
  ) || null
}

/** Consecutive missed Sundays / cell meetings that put someone on the PCS
 *  "Recommended for Removal" review list. */
export const REMOVAL_ABSENCE_THRESHOLD = 10

/** How many recent reports per cell to fetch — enough for the 10-meeting removal
 *  streak plus a couple of meetings skipped as Away. */
export const CELL_HEALTH_REPORT_COUNT = 12

/** How far back (weeks) the cell absence streak is counted — same reach as the
 *  20-Sunday attendance window. */
export const CELL_ABSENCE_MAX_WEEKS = 20

const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
/** Monday (local) of the week containing `date`. */
const weekStartOf = (date) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}
const parseISO = (s) => {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

/**
 * Consecutive cell weeks missed, counting back week by week from last week — stops
 * at the first week they attended. Cells meet weekly, so a past week with no filed
 * report counts as missed too (an unlogged meeting must not keep the streak low).
 *  - Away weeks (marked Away on that report, or inside a PCS Away period) are skipped.
 *  - The current week only counts once its report is filed (the meeting may still
 *    be ahead).
 *  - Weeks wholly before they joined the cell (`sinceISO`) end the count.
 *  - `truncated` — the reports were capped by the fetch limit, so weeks older than
 *    the oldest fetched report are unknown and end the count rather than being
 *    guessed as missed.
 */
export function countConsecutiveCellAbsences({
  reports, names, sinceISO = '', isAwayOn = null, today = new Date(),
  maxWeeks = CELL_ABSENCE_MAX_WEEKS, truncated = false,
}) {
  const byWeek = new Map()
  let oldestWeek = ''
  for (const r of reports || []) {
    const d = parseISO(r.reportDate)
    if (!d) continue
    const key = isoOf(weekStartOf(d))
    if (!byWeek.has(key)) byWeek.set(key, [])
    byWeek.get(key).push(r)
    if (!oldestWeek || key < oldestWeek) oldestWeek = key
  }
  const attended = (r) => names.some((n) => n && r.attendeeNames?.has(n))
  const markedAway = (r) => names.some((n) => n && r.awayNames?.has(n))

  let count = 0
  const thisWeek = weekStartOf(today)
  for (let i = 0; i < maxWeeks; i++) {
    const start = new Date(thisWeek)
    start.setDate(start.getDate() - 7 * i)
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    const key = isoOf(start)
    if (sinceISO && isoOf(end) < sinceISO) break
    if (truncated && oldestWeek && key < oldestWeek) break
    const rs = byWeek.get(key)
    if (rs?.some(attended)) break
    if (!rs && i === 0) continue
    const awayDate = rs?.[0]?.reportDate || isoOf(end)
    if (rs?.some(markedAway) || isAwayOn?.(awayDate) || (!rs && isAwayOn?.(key))) continue
    count++
  }
  return count
}
const WINDOW_DAYS = 28

/**
 * Cell Health for a Cell Only member, from their cell's recent reports
 * ([{ reportDate: 'YYYY-MM-DD', attendeeNames: Set<lowercased name> }], newest first).
 *  - active:     attended ≥ 2 meetings in the past 4 weeks
 *  - irregular:  attended 1
 *  - inactive:   attended none, while the cell did meet
 *  - noReports:  the cell filed no report in 4 weeks — nothing to judge, so no red flag
 *  - noCell:     not on any active cell roster
 *  - loading:    reports not fetched yet
 * `names` is every lowercased spelling to match (PCS name and cell-roster name).
 */
// `isAwayOn(date)` (optional) — profile-level Away check; meetings the member was
// Away for (profile period or marked Away on that report) are skipped entirely,
// so they count as neither attended nor missed.
export function computeCellHealth({ hasCell, reports, names, today = new Date(), isAwayOn = null }) {
  if (!hasCell) return { tier: 'noCell', label: 'Not in a cell group' }
  if (!reports) return { tier: 'loading', label: 'Checking cell attendance…' }
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() - WINDOW_DAYS)
  const cutoffISO = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`
  const attended = (r) => names.some((n) => n && r.attendeeNames?.has(n))
  const wasAway = (r) => !attended(r) && (names.some((n) => n && r.awayNames?.has(n)) || !!isAwayOn?.(r.reportDate))
  const inWindow = reports.filter((r) => (r.reportDate || '') >= cutoffISO && !wasAway(r))
  const count = inWindow.filter(attended).length
  const lastAttended = reports.find(attended)?.reportDate || null
  const base = { count, meetings: inWindow.length, lastAttended }
  if (inWindow.length === 0) return { ...base, tier: 'noReports', label: 'No cell reports in 4 weeks' }
  if (count >= 2) return { ...base, tier: 'active', label: 'Active Cell Member' }
  if (count === 1) return { ...base, tier: 'irregular', label: 'Irregular Cell Member' }
  return { ...base, tier: 'inactive', label: 'Inactive Cell Member' }
}

export const CELL_HEALTH_BADGE_CLS = {
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  irregular: 'bg-amber-100 text-amber-800 border-amber-200',
  inactive: 'bg-red-100 text-red-700 border-red-200',
  noReports: 'bg-slate-100 text-slate-600 border-slate-200',
  noCell: 'bg-slate-100 text-slate-600 border-slate-200',
  loading: 'bg-slate-100 text-slate-500 border-slate-200',
}
