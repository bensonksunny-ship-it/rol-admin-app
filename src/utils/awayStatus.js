/**
 * "Away" (travel / vacation) support shared by PCS, Sunday attendance and cell
 * attendance. Two independent sources mark someone as away:
 *
 * 1. Profile-level, on the caring_pcs entry: `away: true` + optional `awayFrom` /
 *    `awayUntil` / `awayNote`. Manual only — `awayUntil` is informational; the
 *    person stays Away until someone switches them back to Active. When they're
 *    switched back, the period is appended to `awayPeriods: [{ from, to }]` so the
 *    weeks they were away keep being skipped by absence counters afterwards.
 * 2. Per-date, on the attendance sheets: `sunday_reports.sundayCellAway[cellId]`
 *    and `cell_reports.awayNames` — names marked "Away" for that one meeting.
 *
 * Away weeks are skipped by absence counters (neither present nor absent).
 */

const iso = (v) => String(v || '').slice(0, 10)

export const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Profile currently marked Away. */
export const isCurrentlyAway = (entry) => !!entry?.away

/** Was this PCS profile Away on `dateStr` (current Away or a past recorded period)? */
export function isProfileAwayOn(entry, dateStr) {
  const d = iso(dateStr)
  if (!entry || !d) return false
  if (entry.away && (!entry.awayFrom || d >= iso(entry.awayFrom))) return true
  return (entry.awayPeriods || []).some((p) => p?.from && d >= iso(p.from) && (!p.to || d <= iso(p.to)))
}

/** Short human label, e.g. "Away until 30 Nov 2026 · Vacation". */
export function awaySummary(entry, formatDate = (s) => s) {
  if (!entry?.away) return ''
  const parts = []
  if (entry.awayUntil) parts.push(`until ${formatDate(entry.awayUntil)}`)
  else if (entry.awayFrom) parts.push(`since ${formatDate(entry.awayFrom)}`)
  const head = `Away${parts.length ? ` ${parts.join(' ')}` : ''}`
  return entry.awayNote ? `${head} · ${entry.awayNote}` : head
}

/** Firestore patch to mark a profile Away. */
export function buildAwayPatch({ from, until, note }) {
  return { away: true, awayFrom: iso(from) || todayISO(), awayUntil: iso(until), awayNote: String(note || '').trim() }
}

/** Firestore patch to bring a profile back to Active, archiving the period just ended. */
export function buildReturnPatch(entry) {
  const periods = Array.isArray(entry?.awayPeriods) ? [...entry.awayPeriods] : []
  if (entry?.away) periods.push({ from: iso(entry.awayFrom) || todayISO(), to: todayISO(), note: entry.awayNote || '' })
  return { away: false, awayFrom: '', awayUntil: '', awayNote: '', awayPeriods: periods }
}

export const AWAY_BADGE_CLS = 'bg-sky-100 text-sky-700 border-sky-200'

/**
 * Auto-return support: find the Away PCS entries (from subscribeAwayPCSEntries)
 * that a person just marked present on an attendance sheet refers to — visitorId
 * first, then phone, then exact (normalised) name.
 */
export function findAwayEntriesFor(awayEntries, { name, visitorId, phone } = {}) {
  const nm = String(name || '').replace(/\s+/g, ' ').trim().toLowerCase()
  const ph = String(phone || '').replace(/\D/g, '').slice(-10)
  return (awayEntries || []).filter((e) => {
    if (!e?.away) return false
    if (visitorId && e.visitorId && e.visitorId === visitorId) return true
    const eph = String(e.phone || '').replace(/\D/g, '').slice(-10)
    if (ph.length === 10 && eph === ph) return true
    return !!nm && String(e.name || '').replace(/\s+/g, ' ').trim().toLowerCase() === nm
  })
}

/** "Returned from Away status on 12 Oct 2026 via Sunday Service attendance" — for
 *  archived periods that ended by auto-return (returnedVia set). */
export function awayReturnHistoryLabel(period, formatDate = (s) => s) {
  if (!period?.returnedVia || !period.to) return ''
  return `Returned from Away status on ${formatDate(period.to)} via ${period.returnedVia} attendance`
}
