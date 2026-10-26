import { format, parseISO, addDays, startOfWeek } from 'date-fns'
import { computeDurationMinutes } from './date'

/** The Cell department's week runs Sunday → Saturday (date-fns startOfWeek options). */
export const CELL_WEEK = { weekStartsOn: 0 }

/** Sunday (local) that starts the cell week containing `date`. */
export function cellWeekStart(date = new Date()) {
  return startOfWeek(date, CELL_WEEK)
}

/** Firestore cell_reports week band (Sunday week start), matches Cell Report page. */
export function weekStartKey(reportDateStr) {
  if (!reportDateStr) return 'unknown'
  try {
    const d = parseISO(reportDateStr)
    if (Number.isNaN(d.getTime())) return reportDateStr
    return format(startOfWeek(d, CELL_WEEK), 'yyyy-MM-dd')
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

/** Expected report date (YYYY-MM-DD) for a cell’s meeting day within a given week (Sun–Sat). */
export function computeMeetingDateISO(meetingDay, weekStartDate) {
  const jsDay = meetingDayToJsDay(meetingDay)
  if (jsDay == null) return format(weekStartDate, 'yyyy-MM-dd')
  return format(addDays(weekStartDate, jsDay), 'yyyy-MM-dd')
}

export function totalAttendanceFromCellReport(r) {
  if (!r) return 0
  return (Number(r.membersAttended) || 0) + (Number(r.visitors) || 0) + (Number(r.children) || 0)
}

/**
 * A cell_reports doc gets auto-created blank (all zeros) the instant a leader opens
 * the Cell Report page for that week, before any real attendance is entered — so a
 * document *existing* for a cell/week is not the same thing as that cell having
 * actually submitted a report. Any compliance/tracking check that does `Boolean(hit)`
 * on a report lookup is liable to this false positive; check this instead.
 *
 * Attendance taps on the Cell Report page also write straight to the doc, so content
 * alone only means "draft". From the week of CELL_REPORT_SUBMIT_STAMP_SINCE on, a
 * report counts only once the leader formally saves it (Save / End Cell Meeting /
 * ending the live meeting / the edit sheet stamp `submittedAt`). Older reports, from
 * before that stamp existed, keep the content rule.
 */
export const CELL_REPORT_SUBMIT_STAMP_SINCE = '2026-10-25'

export function isRealCellReportSubmission(r) {
  if (!r) return false
  if (r.submittedAt || r.meetingFinalizedAt) return true
  const date = String(r.reportDate || r.meetingDateISO || '').slice(0, 10)
  if (!date || date >= CELL_REPORT_SUBMIT_STAMP_SINCE) return false
  if (totalAttendanceFromCellReport(r) > 0) return true
  if (r.startTime && r.endTime) {
    const m = computeDurationMinutes(r.startTime, r.endTime)
    if (m != null && m > 0) return true
  }
  return false
}

/**
 * Sunday–Saturday range label for a Sunday-anchored week start (as produced by
 * weekStartKey / cellWeekStart) — the label covers exactly the days the week
 * bucket holds.
 * e.g. weekStart 2026-07-26 (Sun) -> "Jul 26 - Aug 01"
 */
export function formatWeekRangeLabel(weekStart) {
  const monday = typeof weekStart === 'string' ? parseISO(weekStart) : weekStart
  const sunday = addDays(monday, 6)
  return `${format(monday, 'MMM dd')} - ${format(sunday, 'MMM dd')}`
}

/**
 * Day-numbers-only range for chart x-axis ticks, where repeating "Jul" on every
 * single tick (formatWeekRangeLabel's job) causes overlapping/congested text on
 * narrow viewports — e.g. "5–11" instead of "Jul 05 - Jul 11". The month itself
 * belongs in a header above the chart instead (see monthSpanLabel). Falls back to
 * including the month abbreviation just for the one week that actually crosses a
 * month boundary (e.g. "Jun 29–Jul 5"), since a bare day range would be ambiguous
 * there.
 */
export function formatWeekDayRangeShort(weekStart) {
  const monday = typeof weekStart === 'string' ? parseISO(weekStart) : weekStart
  const sunday = addDays(monday, 6)
  if (format(monday, 'MMM') !== format(sunday, 'MMM')) {
    return `${format(monday, 'MMM d')}–${format(sunday, 'MMM d')}`
  }
  return `${format(monday, 'd')}–${format(sunday, 'd')}`
}

/**
 * "July 2026" if every week in the range falls in one calendar month, or
 * "Jun – Jul 2026" if the window spans two — the header/sub-header companion to
 * formatWeekDayRangeShort's bare day-number ticks.
 */
export function monthSpanLabel(weekStarts) {
  if (!weekStarts?.length) return ''
  const dates = weekStarts.map((ws) => (typeof ws === 'string' ? parseISO(ws) : ws))
  const first = dates[0]
  const last = dates[dates.length - 1]
  const firstMonth = format(first, 'MMM')
  const lastMonth = format(last, 'MMM')
  const year = format(last, 'yyyy')
  return firstMonth === lastMonth ? `${format(first, 'MMMM')} ${year}` : `${firstMonth} – ${lastMonth} ${year}`
}
