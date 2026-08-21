import { format } from 'date-fns'
import { getSundayReport, getSundayAttendanceCountsByNameInRange } from '../services/firestore'

// Shared Second/Third/Fourth Week Comer candidate rules, used by both the D-Light
// Follow-Up panel (DepartmentHub.jsx) and the Sunday Ministry Report page
// (SundayReport.jsx) so the two surfaces always suggest the same people:
// - Second week: D-Light visitors whose first attendedDate falls within the last
//   SECOND_WEEK_WINDOW_DAYS days.
// - Third week: visitors who joined (attendedDate) in the last THIRD_WEEK_WINDOW_DAYS
//   days and have exactly THIRD_WEEK_REQUIRED_COUNT logged Sunday attendances in that
//   same window, prior to the target Sunday. Self-healing vs. chaining off a
//   previously-confirmed list, which would silently drop anyone a leader forgot to mark.
// - Fourth week: same idea, FOURTH_WEEK_WINDOW_DAYS days, FOURTH_WEEK_REQUIRED_COUNT
//   prior attendances.
export const SECOND_WEEK_WINDOW_DAYS = 29
export const THIRD_WEEK_WINDOW_DAYS = 90
export const THIRD_WEEK_REQUIRED_COUNT = 2
export const FOURTH_WEEK_WINDOW_DAYS = 120
export const FOURTH_WEEK_REQUIRED_COUNT = 3

const normalizeName = (n) => String(n || '').trim().toLowerCase()

// Everyone already recorded present on a sunday_reports doc, in any capacity — Cell,
// Non Cell, Others, New Comers, or (for reports written before the mark-present routing
// below existed) the legacy Nth Week Attendees fields. Marking someone present from the
// Follow-Up panel routes them into their Cell or Non Cell (see markWeekComer in
// DepartmentHub.jsx), so this is what "already marked, don't re-suggest" now checks.
function namesAlreadyPresent(reportDoc) {
  const names = new Set()
  const addAll = (arr) => (Array.isArray(arr) ? arr : []).forEach((n) => {
    const t = normalizeName(n)
    if (t) names.add(t)
  })
  if (!reportDoc) return names
  addAll(reportDoc.nonCell)
  addAll(reportDoc.others)
  addAll(reportDoc.newComers)
  addAll(reportDoc.secondWeekAttendeesNames)
  addAll(reportDoc.thirdWeekAttendeesNames)
  addAll(reportDoc.fourthWeekAttendeesNames)
  if (reportDoc.sundayCellAttendance && typeof reportDoc.sundayCellAttendance === 'object') {
    Object.values(reportDoc.sundayCellAttendance).forEach(addAll)
  }
  return names
}

/**
 * Computes Second/Third/Fourth Week Comer candidates for a target Sunday.
 * Each list excludes names already recorded present on the target Sunday's own report.
 *
 * @param {string} targetDateStr - target Sunday, 'yyyy-MM-dd'
 * @param {Array<{name: string, attendedDate: string}>} visitors - D-Light visitors
 * @returns {Promise<{second: string[], third: string[], fourth: string[]}>}
 */
export async function computeWeekComerCandidates(targetDateStr, visitors) {
  const target = new Date(targetDateStr + 'T00:00:00')
  const windowStart = (days) => {
    const d = new Date(target)
    d.setDate(target.getDate() - days)
    return d
  }

  // Attendance counted only through the day before the target Sunday, so whatever's
  // already on today's own report doesn't inflate the count we're deciding against.
  const countRangeEnd = new Date(target)
  countRangeEnd.setDate(target.getDate() - 1)
  const countRangeEndStr = format(countRangeEnd, 'yyyy-MM-dd')
  const daysAgoStr = (days) => format(windowStart(days), 'yyyy-MM-dd')

  const [targetReport, thirdWindowCounts, fourthWindowCounts] = await Promise.all([
    getSundayReport(targetDateStr),
    getSundayAttendanceCountsByNameInRange(daysAgoStr(THIRD_WEEK_WINDOW_DAYS), countRangeEndStr),
    getSundayAttendanceCountsByNameInRange(daysAgoStr(FOURTH_WEEK_WINDOW_DAYS), countRangeEndStr),
  ])

  const alreadyPresent = namesAlreadyPresent(targetReport)

  const second = [...new Set(
    visitors
      .filter((v) => {
        if (!v.attendedDate) return false
        const d = new Date(v.attendedDate + 'T00:00:00')
        return d >= windowStart(SECOND_WEEK_WINDOW_DAYS) && d <= target
      })
      .map((v) => v.name)
      .filter(Boolean)
  )].filter((n) => !alreadyPresent.has(normalizeName(n)))

  const computeAttendanceCandidates = (days, requiredCount, countsInRange) => {
    const start = windowStart(days)
    return [...new Set(
      visitors
        .filter((v) => {
          if (!v.attendedDate) return false
          const d = new Date(v.attendedDate + 'T00:00:00')
          return d >= start && d <= target
        })
        .filter((v) => countsInRange.get(normalizeName(v.name)) === requiredCount)
        .map((v) => v.name)
        .filter(Boolean)
    )].filter((n) => !alreadyPresent.has(normalizeName(n)))
  }

  const third = computeAttendanceCandidates(THIRD_WEEK_WINDOW_DAYS, THIRD_WEEK_REQUIRED_COUNT, thirdWindowCounts)
  const fourth = computeAttendanceCandidates(FOURTH_WEEK_WINDOW_DAYS, FOURTH_WEEK_REQUIRED_COUNT, fourthWindowCounts)

  return { second, third, fourth }
}
