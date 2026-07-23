// Categorization of inactive cell members, based on their historical cell-meeting
// attendance count at the time they were marked inactive.
export const FORMER_MEMBER_ATTENDANCE_THRESHOLD = 10

export function categorizeMemberByAttendance(attendanceCount) {
  return Number(attendanceCount) >= FORMER_MEMBER_ATTENDANCE_THRESHOLD ? 'former' : 'not_attending'
}

export function memberCategoryLabel(category) {
  return category === 'former' ? 'Former Member' : 'Inactive Member'
}

// Years/months tenure from `sinceDate` to `endDate` (defaults to today), e.g. "2 yrs 4 mos".
export function calcTenureLabel(sinceDate, endDate) {
  if (!sinceDate) return null
  const since = new Date(sinceDate)
  const end = endDate ? new Date(endDate) : new Date()
  if (isNaN(since.getTime()) || isNaN(end.getTime()) || since > end) return null
  let years = end.getFullYear() - since.getFullYear()
  let months = end.getMonth() - since.getMonth()
  if (end.getDate() < since.getDate()) months--
  if (months < 0) { years--; months += 12 }
  if (years <= 0 && months <= 0) return 'Less than a month'
  const parts = []
  if (years > 0) parts.push(`${years} yr${years > 1 ? 's' : ''}`)
  if (months > 0) parts.push(`${months} mo${months > 1 ? 's' : ''}`)
  return parts.join(' ')
}
