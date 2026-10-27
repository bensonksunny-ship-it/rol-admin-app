import { schedulerFields } from './songScheduler'
import { addDays, format, parseISO, startOfMonth, endOfMonth } from 'date-fns'

/** Next Sunday after a yyyy-MM-dd Sunday. */
export const nextSunday = (date) => format(addDays(parseISO(date), 7), 'yyyy-MM-dd')

/** `count` consecutive Sundays starting at `from` (a Sunday). */
export function consecutiveSundays(from, count) {
  return Array.from({ length: count }, (_, i) => format(addDays(parseISO(from), i * 7), 'yyyy-MM-dd'))
}

/** Every Sunday in the month that contains `date`. */
export function sundaysInMonth(date) {
  const start = startOfMonth(parseISO(date))
  const end = endOfMonth(start)
  const first = addDays(start, (7 - start.getDay()) % 7)
  const out = []
  for (let d = first; d <= end; d = addDays(d, 7)) out.push(format(d, 'yyyy-MM-dd'))
  return out
}

/**
 * The roster of `from` applied to the next Sunday: same roles and members; each
 * role keeps whatever song the next Sunday already had (songs are per service and
 * are never copied).
 */
export function copiedRoster(fromAssignments = [], toAssignments = []) {
  const songsByRole = new Map(toAssignments.map((a) => [a.role, a]))
  return fromAssignments
    .filter((a) => a.memberId)
    .map((a) => {
      const t = songsByRole.get(a.role) || {}
      return {
        role: String(a.role || ''),
        memberId: String(a.memberId || ''),
        memberName: String(a.memberName || ''),
        songName: String(t.songName || ''),
        key: String(t.key || ''),
        songId: String(t.songId || ''),
        ...schedulerFields(t),
      }
    })
    // Keep songs scheduled on the target Sunday that don't have a singer yet
    // (Songs Directory → Schedule) unless the copied roster now fills that row.
    .concat(toAssignments
      .filter((t) => !t.memberId && (t.songId || t.songName) && !fromAssignments.some((a) => a.memberId && a.role === t.role))
      .map((t) => ({
        role: String(t.role || ''), memberId: '', memberName: '',
        songName: String(t.songName || ''), key: String(t.key || ''), songId: String(t.songId || ''),
        ...schedulerFields(t),
      })))
}
