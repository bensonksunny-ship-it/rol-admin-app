import { format, parseISO, addDays, startOfWeek } from 'date-fns'

/** Firestore cell_reports week band (Monday week start), matches Cell Report page. */
export function weekStartKey(reportDateStr) {
  if (!reportDateStr) return 'unknown'
  try {
    const d = parseISO(reportDateStr)
    if (Number.isNaN(d.getTime())) return reportDateStr
    return format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  } catch {
    return reportDateStr
  }
}

export function meetingDayToJsDay(meetingDay) {
  const s = String(meetingDay || '')
    .trim()
    .toLowerCase()
  if (!s) return null
  if (s.startsWith('sun')) return 0
  if (s.startsWith('mon')) return 1
  if (s.startsWith('tue') || s.startsWith('tues')) return 2
  if (s.startsWith('wed')) return 3
  if (s.startsWith('thu') || s.startsWith('thur') || s.startsWith('thurs')) return 4
  if (s.startsWith('fri')) return 5
  if (s.startsWith('sat')) return 6
  return null
}

/** Expected report date (YYYY-MM-DD) for a cell’s meeting day within a given week (Mon–Sun). */
export function computeMeetingDateISO(meetingDay, weekStartDate) {
  const jsDay = meetingDayToJsDay(meetingDay)
  if (jsDay == null) return format(weekStartDate, 'yyyy-MM-dd')
  const offset = (jsDay + 6) % 7
  return format(addDays(weekStartDate, offset), 'yyyy-MM-dd')
}

export function totalAttendanceFromCellReport(r) {
  if (!r) return 0
  return (Number(r.membersAttended) || 0) + (Number(r.visitors) || 0) + (Number(r.children) || 0)
}

/**
 * Display-only Sunday–Saturday range for a Monday-anchored week start (as produced
 * by weekStartKey / startOfWeek(d, { weekStartsOn: 1 })). Does not affect bucketing —
 * reports are still matched/aggregated by the Monday key everywhere else.
 * e.g. weekStart 2026-07-27 (Mon) -> "Jul 26 - Aug 01"
 */
export function formatWeekRangeLabel(weekStart) {
  const monday = typeof weekStart === 'string' ? parseISO(weekStart) : weekStart
  const sunday = addDays(monday, -1)
  const saturday = addDays(monday, 5)
  return `${format(sunday, 'MMM dd')} - ${format(saturday, 'MMM dd')}`
}
