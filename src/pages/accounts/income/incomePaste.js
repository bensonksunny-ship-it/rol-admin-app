import { format } from 'date-fns'
import { parseFlexibleDate, normalizePastedCell, splitPastedRow } from '../../../utils/entryTableHelpers'
import { toDate } from './incomeCategorize'

// Parsing for the Income tab's "Paste from Excel" modal. Turns text copied out of
// Excel / Google Sheets (tab + newline separated) into flat income entries, each
// tagged with a status so the preview can show what will — and won't — be saved.

export const OFFERING_PASTE_COLUMNS = [
  { field: 'english', category: 'English Offering' },
  { field: 'tamil', category: 'Tamil Offering' },
  { field: 'online', category: 'Online Offering' },
]

// Header labels recognised in an optional first row. When a header row is found,
// columns are read by name, so blank spacer columns or a different column order
// in the sheet don't shift values into the wrong field.
const HEADER_ALIASES = {
  date: ['date', 'dt'],
  name: ['name', 'giver', 'giver name', 'member', 'from', 'received from'],
  towards: ['towards', 'purpose', 'for', 'remarks', 'description', 'particulars'],
  amount: ['amount', 'amt', 'rs', 'rupees', 'inr'],
  english: ['english', 'english offering', 'eng'],
  tamil: ['tamil', 'tamil offering'],
  online: ['online', 'online offering', 'upi'],
}

function normHeader(s) {
  return String(s || '').trim().toLowerCase().replace(/[₹().:]/g, '').replace(/\s+/g, ' ').trim()
}

function detectHeader(cells) {
  const map = {}
  cells.forEach((cell, idx) => {
    const h = normHeader(cell)
    if (!h) return
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (map[field] == null && aliases.includes(h)) { map[field] = idx; return }
    }
  })
  return map.date != null && Object.keys(map).length >= 2 ? map : null
}

// Excel sometimes copies a date cell as its serial number (days since 1899-12-30),
// e.g. when the column is formatted General. Only plausible serials (1982–2119) are
// treated as dates so a stray amount isn't misread.
function parseExcelSerial(raw) {
  if (!/^\d{5}$/.test(raw)) return ''
  const n = Number(raw)
  if (n < 30000 || n > 80000) return ''
  const d = new Date(1899, 11, 30 + n)
  return format(d, 'yyyy-MM-dd')
}

export function parsePastedDate(raw) {
  const t = String(raw || '').trim()
  if (!t) return ''
  return parseExcelSerial(t) || parseFlexibleDate(t)
}

// Returns { amount, error } — blank cells are amount 0 with no error; text that
// isn't a number after stripping ₹ / Rs / commas / spaces is an error, not 0, so a
// bad cell is shown to the user instead of silently saving ₹0.
export function parsePastedAmount(raw) {
  const cleaned = String(raw ?? '').replace(/[₹$,]|rs\.?|inr/gi, '').replace(/\s+/g, '').trim()
  if (!cleaned || ['-', '--', '–', '—'].includes(cleaned)) return { amount: 0, error: '' }
  const n = Number(cleaned)
  if (isNaN(n)) return { amount: 0, error: `"${String(raw).trim()}" is not a number` }
  if (n < 0) return { amount: 0, error: 'Negative amount' }
  return { amount: n, error: '' }
}

function splitLines(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter(line => line.replace(/\t/g, '').trim() !== '')
}

function entryKey(iso, category, amount, name) {
  return [iso, String(category).trim().toLowerCase(), Number(amount), String(name || '').trim().toLowerCase()].join('|')
}

/**
 * @param {string} text — raw clipboard text
 * @param {object} opts
 *   kind: 'offering' | 'list'
 *   towards: boolean — list tables with a Towards column
 *   category: string — category applied to every row of a list table
 *   activeMonth: Date — the month being viewed
 *   existing: entries already loaded for this month (for duplicate detection)
 * @returns {{ rows: Array, headerDetected: boolean }}
 *   Each row: { key, line, iso, rawDate, name, towards, category, amount, status, message }
 *   status: 'ok' | 'outOfMonth' | 'duplicate' | 'invalid'
 */
export function parseIncomePaste(text, { kind, towards = false, category, activeMonth, existing = [] }) {
  const lines = splitLines(text)
  if (!lines.length) return { rows: [], headerDetected: false }

  const header = detectHeader(splitPastedRow(lines[0]))
  const bodyLines = header ? lines.slice(1) : lines

  const existingKeys = new Set(existing.map(e => {
    const d = toDate(e.date)
    return entryKey(format(d, 'yyyy-MM-dd'), e.category, e.amount, e.giverName)
  }))
  const seenInPaste = new Set()

  const rows = []
  bodyLines.forEach((line, lineIdx) => {
    const cells = splitPastedRow(line).map(normalizePastedCell)
    const lineNo = lineIdx + 1 + (header ? 1 : 0)

    if (kind === 'offering') {
      let rawDate, values
      if (header) {
        rawDate = cells[header.date] ?? ''
        values = OFFERING_PASTE_COLUMNS.map(c => (header[c.field] != null ? cells[header[c.field]] ?? '' : ''))
      } else {
        // Positional: Date, English, Tamil, Online (blanks kept — a blank Tamil
        // cell means "no Tamil offering", not "shift Online left").
        const dateIdx = cells.findIndex(c => parsePastedDate(c))
        const start = dateIdx === -1 ? 0 : dateIdx
        rawDate = cells[start] ?? ''
        values = OFFERING_PASTE_COLUMNS.map((_, i) => cells[start + 1 + i] ?? '')
      }
      const iso = parsePastedDate(rawDate)
      let anyValue = false
      OFFERING_PASTE_COLUMNS.forEach((col, i) => {
        const raw = values[i]
        if (!raw) return
        anyValue = true
        const { amount, error } = parsePastedAmount(raw)
        if (!error && amount === 0) return // explicit 0 → nothing to record
        rows.push(buildRow({ key: `${lineIdx}-${i}`, line: lineNo, iso, rawDate, name: '', towards: '', category: col.category, amount, amountError: error }))
      })
      if (!anyValue) {
        rows.push(buildRow({ key: `${lineIdx}-x`, line: lineNo, iso, rawDate, name: '', towards: '', category: '', amount: 0, amountError: 'No English / Tamil / Online amount' }))
      }
      return
    }

    // List tables: Date, Name, [Towards], Amount
    let rawDate, name, towardsVal, rawAmount
    if (header) {
      rawDate = cells[header.date] ?? ''
      name = header.name != null ? cells[header.name] ?? '' : ''
      towardsVal = header.towards != null ? cells[header.towards] ?? '' : ''
      rawAmount = header.amount != null ? cells[header.amount] ?? '' : ''
    } else {
      // Positional by meaning (same approach as the Expense grid): drop blank
      // spacer cells, first is the Date, last is the Amount, the text between is
      // Name then Towards.
      const filled = cells.filter(c => c !== '')
      rawDate = filled[0] ?? ''
      rawAmount = filled.length >= 2 ? filled[filled.length - 1] : ''
      const middle = filled.slice(1, -1)
      if (towards) {
        name = middle[0] ?? ''
        towardsVal = middle.slice(1).join(' ')
      } else {
        name = middle.join(' ')
        towardsVal = ''
      }
    }
    const iso = parsePastedDate(rawDate)
    const { amount, error } = parsePastedAmount(rawAmount)
    rows.push(buildRow({
      key: `${lineIdx}`,
      line: lineNo,
      iso,
      rawDate,
      name,
      towards: towards ? towardsVal : '',
      category,
      amount,
      amountError: error || (!rawAmount ? 'Missing amount' : (amount === 0 ? 'Amount is 0' : '')),
    }))
  })

  function buildRow({ key, line, iso, rawDate, name, towards: tw, category: cat, amount, amountError }) {
    const row = { key, line, iso, rawDate, name: String(name || '').trim(), towards: String(tw || '').trim(), category: cat, amount, status: 'ok', message: '' }
    if (!iso) {
      row.status = 'invalid'
      row.message = rawDate ? `Can't read date "${rawDate}"` : 'Missing date'
      return row
    }
    if (amountError) {
      row.status = 'invalid'
      row.message = amountError
      return row
    }
    const [y, m] = iso.split('-').map(Number)
    if (y !== activeMonth.getFullYear() || m - 1 !== activeMonth.getMonth()) {
      row.status = 'outOfMonth'
      row.message = `Dated ${format(new Date(y, m - 1, 1), 'MMMM yyyy')} — will be saved there, not shown in ${format(activeMonth, 'MMMM yyyy')}`
      return row
    }
    const k = entryKey(iso, cat, amount, row.name)
    if (existingKeys.has(k)) {
      row.status = 'duplicate'
      row.message = 'Already entered (same date, amount and name)'
    } else if (seenInPaste.has(k)) {
      row.status = 'duplicate'
      row.message = 'Repeated in this paste'
    }
    seenInPaste.add(k)
    return row
  }

  return { rows, headerDetected: !!header }
}
