import { format } from 'date-fns'

// Sunday cash count helpers (offering_cash_counts). Each service's count is
// { notes: { '500': 3, '200': 0, … }, total }, total = Σ denomination × count.

export const CASH_DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1]

export const CASH_SERVICES = [
  { key: 'english', label: 'English Service', category: 'English Offering' },
  { key: 'tamil', label: 'Tamil Service', category: 'Tamil Offering' },
]

export const emptyNotes = () => Object.fromEntries(CASH_DENOMINATIONS.map((d) => [String(d), '']))

export function notesTotal(notes) {
  return CASH_DENOMINATIONS.reduce((s, d) => s + d * (Number(notes?.[String(d)]) || 0), 0)
}

export const serviceTotal = (count, key) => Number(count?.[key]?.total) || 0
export const countTotal = (count) => CASH_SERVICES.reduce((s, sv) => s + serviceTotal(count, sv.key), 0)

/** Every Sunday of the month containing `monthDate`, as yyyy-MM-dd. */
export function sundaysOfMonth(monthDate) {
  const isos = []
  const d = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  while (d.getMonth() === monthDate.getMonth()) {
    if (d.getDay() === 0) isos.push(format(d, 'yyyy-MM-dd'))
    d.setDate(d.getDate() + 1)
  }
  return isos
}

/** The most recent Sunday on or before `from` (yyyy-MM-dd), then `n` earlier ones. */
export function recentSundays(n = 8, from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  d.setDate(d.getDate() - d.getDay())
  return Array.from({ length: n }, (_, i) => {
    const x = new Date(d)
    x.setDate(d.getDate() - 7 * i)
    return format(x, 'yyyy-MM-dd')
  })
}
