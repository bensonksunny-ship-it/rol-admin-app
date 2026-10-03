import { format } from 'date-fns'
import { normalizePastedCell, splitPastedRow } from '../../../utils/entryTableHelpers'
import { parsePastedDate, parsePastedAmount } from './incomePaste'

// Keyboard, clipboard and value helpers for the Income tab grids (gridKit.jsx
// holds the cell components).

// First focusable cell from (r, c) stepping by (dr, dc) — skips disabled cells.
function findCell(grid, r, c, dr, dc) {
  for (let i = 1; i <= 60; i++) {
    const rr = r + dr * i
    const cc = c + dc * i
    if (rr < 0 || cc < 0) return null
    const el = grid.querySelector(`[data-r="${rr}"][data-c="${cc}"]`)
    if (el && !el.disabled) return el
    if (!el && (dr ? !grid.querySelector(`[data-r="${rr}"]`) : cc > 20)) return null
  }
  return null
}

// onKeyDown for a grid container. Enter / Shift+Enter move down / up, arrows move
// between cells (Left / Right only once the caret is at the text's edge or the
// whole cell is selected, so they still work for editing inside a cell). Tab is
// left to the browser — cells are the only tab stops in a grid. onEnterPastEnd(c)
// fires for Enter on the last row (e.g. to start a new row).
export function handleGridKeyDown(e, { onEnterPastEnd } = {}) {
  const el = e.target
  if (el?.dataset?.c == null || e.ctrlKey || e.metaKey || e.altKey) return
  const grid = e.currentTarget
  const r = Number(el.dataset.r)
  const c = Number(el.dataset.c)
  const isText = el.tagName === 'INPUT'
  const len = isText ? el.value.length : 0
  const allSelected = isText && el.selectionStart === 0 && el.selectionEnd === len
  let next = null

  switch (e.key) {
    case 'Enter': {
      next = findCell(grid, r, c, e.shiftKey ? -1 : 1, 0)
      if (!next) {
        e.preventDefault()
        el.blur() // commit in place
        if (!e.shiftKey && onEnterPastEnd) onEnterPastEnd(c)
        else el.focus()
        return
      }
      break
    }
    case 'ArrowDown': next = findCell(grid, r, c, 1, 0); break
    case 'ArrowUp': next = findCell(grid, r, c, -1, 0); break
    case 'ArrowLeft':
      if (!isText || allSelected || (el.selectionStart === 0 && el.selectionEnd === 0)) next = findCell(grid, r, c, 0, -1)
      break
    case 'ArrowRight':
      if (!isText || allSelected || (el.selectionStart === len && el.selectionEnd === len)) next = findCell(grid, r, c, 0, 1)
      break
    default:
      return
  }
  if (next) {
    e.preventDefault()
    next.focus()
  }
}

// Clipboard → matrix of cells when it holds more than one cell (multiple lines
// or tab / 2+-space separated columns); null for a single value, which pastes
// natively into the focused cell. Blank lines inside the block are kept so rows
// stay aligned with the grid; Excel's trailing newline is dropped.
export function readGridPaste(e) {
  const raw = (e.clipboardData || window.clipboardData)?.getData('text') ?? ''
  const text = String(raw).replace(/\r\n?/g, '\n').replace(/\n+$/, '')
  if (!/[\t\n]/.test(text) && !/\S\s{2,}\S/.test(text)) return null
  const matrix = text.split('\n').map(line => splitPastedRow(line).map(normalizePastedCell))
  // Drop a copied header row (Date / Name / Amount …) — nothing in it is a date or number.
  if (matrix.length > 1 && isHeaderRow(matrix[0])) return { matrix: matrix.slice(1), headerSkipped: true }
  return { matrix, headerSkipped: false }
}

const HEADER_WORDS = new Set([
  'date', 'dt', 'name', 'giver', 'giver name', 'member', 'from', 'towards', 'purpose', 'remarks',
  'particulars', 'description', 'amount', 'amt', 'rs', 'inr', 'english', 'tamil', 'online',
  'category', 'total', 'row total', 'english offering', 'tamil offering', 'online offering', 'upi',
])

function isHeaderRow(cells) {
  const filled = cells.filter(Boolean)
  if (!filled.length) return false
  const norm = s => s.toLowerCase().replace(/[₹().:]/g, '').replace(/\s+/g, ' ').trim()
  return filled.some(s => HEADER_WORDS.has(norm(s)))
    && !filled.some(s => parsePastedDate(s) || /^[₹\d,.\s]+$/.test(s))
}

// Date typed or pasted into a cell. Besides everything parsePastedDate reads,
// accepts a bare day ("5" → the 5th of the month being viewed) and a day/month
// without a year ("5/10" → 5 Oct of that month's year). Returns yyyy-MM-dd or ''.
export function parseCellDate(text, activeMonth) {
  const t = String(text ?? '').trim()
  if (!t) return ''
  const y = activeMonth.getFullYear()
  if (/^\d{1,2}$/.test(t)) {
    const d = new Date(y, activeMonth.getMonth(), Number(t))
    return d.getMonth() === activeMonth.getMonth() ? format(d, 'yyyy-MM-dd') : ''
  }
  const dm = t.match(/^(\d{1,2})[/.-](\d{1,2})$/)
  if (dm) return parsePastedDate(`${dm[1]}/${dm[2]}/${y}`)
  return parsePastedDate(t)
}

export function parseCellAmount(text) {
  return parsePastedAmount(text)
}

export function isoInMonth(iso, activeMonth) {
  const [y, m] = String(iso).split('-').map(Number)
  return y === activeMonth.getFullYear() && m - 1 === activeMonth.getMonth()
}

export function isoToDisplay(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return format(new Date(y, m - 1, d), 'dd/MM/yyyy')
}

export function fmtAmount(n) {
  return Number(n || 0).toLocaleString('en-IN')
}

