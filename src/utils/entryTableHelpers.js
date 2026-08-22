import { format } from 'date-fns'

// Shared parsing/formatting helpers for the Accounts "paste-friendly ledger"
// pages (ExpensePage, SavingsPage, …). Pulled out of ExpensePage.jsx once a
// second page needed the exact same logic, rather than duplicating it.

// Parses a pasted/typed date, always treating numeric d/m/y-style strings as
// DAY-first (dd/mm/yyyy, d/m/yy, dd-mm-yy, dd.mm.yyyy, …) — the format used when
// pasting from Excel in this app. JS's native `new Date(string)` parses ambiguous
// slash dates as MONTH-first (US style), which silently swaps day and month for
// anything like "05/08/2026", so it's not used for this shape of input.
export function parseFlexibleDate(raw) {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  const dmy = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (dmy) {
    let [, d, m, y] = dmy.map(Number)
    if (y < 100) y += y <= 69 ? 2000 : 1900
    if (d < 1 || d > 31 || m < 1 || m > 12) return ''
    const date = new Date(y, m - 1, d)
    const isRealDate = date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
    return isRealDate ? format(date, 'yyyy-MM-dd') : ''
  }

  const d = new Date(trimmed)
  return isNaN(d) ? '' : format(d, 'yyyy-MM-dd')
}

// Renders a parsed (yyyy-MM-dd) date back as a full dd.MM.yyyy string for display —
// built from explicit local y/m/d components, not `new Date(isoString)`, to avoid the
// same UTC-vs-local day-shift bug fixed in the Firestore save path.
export function toDisplayDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number)
  return format(new Date(y, m - 1, d), 'dd.MM.yyyy')
}

// Strips thousands-commas, currency symbols (₹, Rs, $), and stray whitespace before
// parsing — Excel amount cells often paste as text like "1,200.00" or "₹ 1,200",
// which plain Number() rejects as NaN.
export function parseFlexibleAmount(raw) {
  const cleaned = String(raw ?? '').replace(/[₹$,]|rs\.?/gi, '').trim()
  if (!cleaned) return 0
  const n = Number(cleaned)
  return isNaN(n) ? 0 : n
}
