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

/**
 * Computes Second/Third/Fourth Week Comer candidates for a target Sunday.
 * Each list excludes names already marked on the target Sunday's own report.
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

  const alreadyIn = (field) => new Set((targetReport?.[field] || []).map(normalizeName))
  const alreadySecond = alreadyIn('secondWeekAttendeesNames')
  const alreadyThird = alreadyIn('thirdWeekAttendeesNames')
  const alreadyFourth = alreadyIn('fourthWeekAttendeesNames')

  const second = [...new Set(
    visitors
      .filter((v) => {
        if (!v.attendedDate) return false
        const d = new Date(v.attendedDate + 'T00:00:00')
        return d >= windowStart(SECOND_WEEK_WINDOW_DAYS) && d <= target
      })
      .map((v) => v.name)
      .filter(Boolean)
  )].filter((n) => !alreadySecond.has(normalizeName(n)))

  const computeAttendanceCandidates = (days, requiredCount, countsInRange, alreadyMarked) => {
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
    )].filter((n) => !alreadyMarked.has(normalizeName(n)))
  }

  const third = computeAttendanceCandidates(THIRD_WEEK_WINDOW_DAYS, THIRD_WEEK_REQUIRED_COUNT, thirdWindowCounts, alreadyThird)
  const fourth = computeAttendanceCandidates(FOURTH_WEEK_WINDOW_DAYS, FOURTH_WEEK_REQUIRED_COUNT, fourthWindowCounts, alreadyFourth)

  return { second, third, fourth }
}
