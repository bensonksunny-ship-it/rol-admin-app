import { format } from 'date-fns'

// Departments may enter a month's expenses until the 5th of the following month.
// From the 6th onward that month is closed for department logins unless the
// Accounts Director unlocks it for a named Director/Coordinator
// (finance_entry_unlocks — see services/firestore.js).

/** 'yyyy-MM' → Date of the filing deadline (the 5th of the next month). */
export function entryDeadline(monthKey) {
  const [y, m] = String(monthKey).split('-').map(Number)
  return new Date(y, m, 5) // m is 1-based, so index m is the following month
}

export function entryDeadlineLabel(monthKey) {
  return format(entryDeadline(monthKey), 'do MMMM yyyy')
}

/** True once the 5th of the following month has passed. */
export function isMonthClosedForEntry(monthKey, now = new Date()) {
  if (!/^\d{4}-\d{2}$/.test(String(monthKey))) return false
  const d = entryDeadline(monthKey)
  return now >= new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
}

// Finance team (Accounts Director, Finance Assistant, everyone but the Founder):
// a month's expenses lock after the 10th of the following month. The Founder can
// reopen a month for 1 day / 2 days / 1 week, any number of times
// (finance_month_unlocks/{yyyy-MM}.unlockedUntil). Enforced in firestore.rules too.
export const FINANCE_CLOSE_DAY = 10

export function financeCloseDate(monthKey) {
  const [y, m] = String(monthKey).split('-').map(Number)
  return new Date(y, m, FINANCE_CLOSE_DAY)
}

export function financeCloseLabel(monthKey) {
  return format(financeCloseDate(monthKey), 'do MMMM yyyy')
}

/** True once the 10th of the following month has passed. */
export function isMonthClosedForFinance(monthKey, now = new Date()) {
  if (!/^\d{4}-\d{2}$/.test(String(monthKey))) return false
  const d = financeCloseDate(monthKey)
  return now >= new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
}

/** Closed for finance and not inside a Founder unlock window. */
export function isFinanceMonthLocked(monthKey, unlockedUntil, now = new Date()) {
  if (!isMonthClosedForFinance(monthKey, now)) return false
  return !(unlockedUntil instanceof Date && unlockedUntil > now)
}

export function monthKeyOf(date) {
  const d = date instanceof Date ? date : new Date(date)
  return isNaN(d.getTime()) ? '' : format(d, 'yyyy-MM')
}

export function monthKeyLabel(monthKey) {
  const [y, m] = String(monthKey).split('-').map(Number)
  return format(new Date(y, m - 1, 1), 'MMMM yyyy')
}
