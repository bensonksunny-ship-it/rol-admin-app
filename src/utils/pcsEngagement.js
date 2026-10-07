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

/**
 * Consecutive cell meetings missed, newest first — stops at the first meeting
 * attended. Meetings the member was Away for are skipped (neither attended nor
 * missed), and meetings before they joined the cell (`sinceISO`) don't count.
 */
export function countConsecutiveCellAbsences({ reports, names, sinceISO = '', isAwayOn = null }) {
  let count = 0
  for (const r of reports || []) {
    const date = r.reportDate || ''
    if (sinceISO && date && date < sinceISO) break
    if (names.some((n) => n && r.attendeeNames?.has(n))) break
    if (names.some((n) => n && r.awayNames?.has(n)) || isAwayOn?.(date)) continue
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
