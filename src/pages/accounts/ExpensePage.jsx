import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Navigate } from 'react-router-dom'
import { format, addMonths, subMonths, startOfMonth } from 'date-fns'
import { useAuth } from '../../context/AuthContext'
import { canAccessAccountsEntry } from '../../utils/accountsEntryAccess'
import { EXPENSE_CATEGORIES, normalizeDepartmentName } from '../../constants/roles'
import { parseFlexibleDate, toDisplayDate, parseFlexibleAmount } from '../../utils/entryTableHelpers'
import RowActionsMenu from '../../components/RowActionsMenu'
import {
  listenFinanceExpense,
  listenFinanceExpenseBySheet,
  createFinanceExpense,
  updateFinanceExpense,
  updateFinanceExpenseSheet,
  deleteFinanceExpense,
  getExpenseDepartments,
} from '../../services/firestore'
import WeeklyEntryPage from './WeeklyEntryPage'

const ROW_FIELDS = ['date', 'item', 'billNo', 'amount']
const BLANK_ROW = { date: '', item: '', billNo: '', amount: '' }
const BLANK_ROWS_COUNT = 1

// A stable per-row identity independent of array position. handleSaveRows's async
// save loop must locate a row by this key (not by its index at snapshot time) —
// the live Firestore listener can trigger the reconciliation effect mid-loop,
// which removes/reorders newRows and would otherwise attach a just-created
// savedId to whichever row now happens to sit at the stale captured index.
let rowKeyCounter = 0
function newRowKey() {
  rowKeyCounter += 1
  return `row-${Date.now()}-${rowKeyCounter}`
}

function blankRows(count = BLANK_ROWS_COUNT) {
  return Array.from({ length: count }, () => ({ ...BLANK_ROW, _key: newRowKey() }))
}

function isRowBlank(r) {
  return !r.savedId && !r.date && !r.item && !r.billNo && !r.amount
}

// Guarantees the grid always ends with at least one empty, editable row, so there's
// always somewhere to type without first clicking "+ Add more rows".
function ensureTrailingBlank(rows) {
  const last = rows[rows.length - 1]
  return last && isRowBlank(last) ? rows : [...rows, { ...BLANK_ROW, _key: newRowKey() }]
}

// Per-department in-progress edit state, so multiple department cards can be
// expanded and edited independently at once. Never mutated directly — always
// spread into a fresh object via updateDeptState.
const DEFAULT_DEPT_STATE = {
  newRows: blankRows(),
  savingRows: false,
  rowsError: '',
  hideBlankRows: false,
  undoStack: [],
  // Already-saved "Entered" rows currently unlocked for inline editing — a subset,
  // not all-or-nothing. Saved by the same bottom "Save rows" button as newRows.
  editRows: [],
}

export default function ExpensePage({ controlledMonth } = {}) {
  const { userProfile, hasPermission, isFounder } = useAuth()
  const [internalMonth, setInternalMonth] = useState(startOfMonth(new Date()))
  const activeMonth = controlledMonth || internalMonth
  const [entries, setEntries] = useState([])
  const [anchoredEntries, setAnchoredEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [undoDelete, setUndoDelete] = useState(null)
  const [saveWarning, setSaveWarning] = useState(null) // { dept, count } — pending "Save rows" click blocked by a date-mismatch confirmation
  const [filterDept, setFilterDept] = useState('all')
  const [loadError, setLoadError] = useState('')
  const [viewMode, setViewMode] = useState('grid')
  const [expandedDepts, setExpandedDepts] = useState([])
  const [deptEditState, setDeptEditState] = useState({})

  function getDeptState(dept) {
    return deptEditState[dept] || DEFAULT_DEPT_STATE
  }

  function updateDeptState(dept, updater) {
    setDeptEditState(prev => {
      const current = prev[dept] || DEFAULT_DEPT_STATE
      return { ...prev, [dept]: { ...current, ...updater(current) } }
    })
  }

  const canAccess = canAccessAccountsEntry(userProfile, hasPermission, isFounder)
  const [deptOptions, setDeptOptions] = useState(EXPENSE_CATEGORIES)

  useEffect(() => {
    getExpenseDepartments().then(dynamic => {
      if (!dynamic.length) return
      const extra = dynamic.map(d => d.name).filter(n => !EXPENSE_CATEGORIES.includes(n))
      if (extra.length) setDeptOptions([...EXPENSE_CATEGORIES, ...extra])
    }).catch(() => {})
  }, [])

  const unsubRef = useRef(null)
  const sheetUnsubRef = useRef(null)
  const formRef = useRef(null)
  const expandedCardRef = useRef(null)   // DOM node of whichever department card is currently expanded
  const undoTimerRef = useRef(null)
  const [openActionMenu, setOpenActionMenu] = useState(null)

  useEffect(() => () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current) }, [])

  function offerUndo(payload) {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndoDelete(payload)
    undoTimerRef.current = setTimeout(() => setUndoDelete(null), 6000)
  }

  async function handleUndoDelete() {
    if (!undoDelete) return
    const payload = undoDelete
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndoDelete(null)
    try {
      await createFinanceExpense(payload)
    } catch {
      // best effort — if this fails there's nothing more to offer
    }
  }

  // Collapse the expanded department card when the user clicks anywhere outside it.
  // Clicks on anything inside the card (inputs, buttons, the paste grid, etc.) are
  // inside expandedCardRef's subtree, so contains() lets them through untouched.
  // The row-actions (⋮) dropdown and the save-warning modal are portaled to
  // document.body, so they're NOT DOM descendants of the card — both are marked
  // with data-row-menu-overlay so clicks inside them are also let through instead
  // of being treated as "outside" and collapsing the card.
  useEffect(() => {
    if (expandedDepts.length === 0) return
    function handleClickOutside(event) {
      if (event.target.closest?.('[data-row-menu-overlay]')) return
      if (expandedCardRef.current && !expandedCardRef.current.contains(event.target)) {
        setExpandedDepts([])
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [expandedDepts])

  function undoLastChange(dept) {
    updateDeptState(dept, (current) => {
      if (!current.undoStack.length) return {}
      const prevRows = current.undoStack[current.undoStack.length - 1]
      return { newRows: prevRows, undoStack: current.undoStack.slice(0, -1) }
    })
  }

  // Ctrl+Z (Cmd+Z on Mac) undoes the last paste or Excel upload into the currently
  // expanded department's "Add new" grid. Only intercepts the keystroke when there's
  // actually something of ours to undo — otherwise it's left alone so the browser's
  // normal per-field undo still works for regular typing.
  useEffect(() => {
    if (expandedDepts.length === 0) return
    const dept = expandedDepts[0]
    function handleKeyDown(e) {
      const isUndo = (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z'
      if (!isUndo) return
      if (!getDeptState(dept).undoStack.length) return
      e.preventDefault()
      undoLastChange(dept)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [expandedDepts, deptEditState])

  useEffect(() => {
    if (!canAccess) return
    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null }
    setLoading(true)
    setLoadError('')
    unsubRef.current = listenFinanceExpense(
      { year: activeMonth.getFullYear(), month: activeMonth.getMonth() },
      (data) => { setEntries(data); setLoading(false) },
      (err) => { console.error(err); setLoadError('Failed to load entries. Please refresh.'); setLoading(false) },
    )
    return () => { if (unsubRef.current) { unsubRef.current(); unsubRef.current = null } }
  }, [activeMonth, canAccess])

  // Entries explicitly kept under this month's sheet (via sheetYear/sheetMonth) even
  // though their own date falls in a different month — loaded separately since the
  // query above only ever matches by date.
  useEffect(() => {
    if (!canAccess) return
    if (sheetUnsubRef.current) { sheetUnsubRef.current(); sheetUnsubRef.current = null }
    sheetUnsubRef.current = listenFinanceExpenseBySheet(
      { year: activeMonth.getFullYear(), month: activeMonth.getMonth() },
      (data) => setAnchoredEntries(data),
      (err) => console.error(err),
    )
    return () => { if (sheetUnsubRef.current) { sheetUnsubRef.current(); sheetUnsubRef.current = null } }
  }, [activeMonth, canAccess])

  // The entries this page actually shows/counts for the active month: date-matched
  // entries, MINUS any that have been explicitly anchored to a different month's sheet
  // (so they don't also count there once moved), PLUS entries anchored to *this* sheet
  // regardless of their own date.
  const combinedEntries = (() => {
    const y = activeMonth.getFullYear(), m = activeMonth.getMonth()
    const dateMatched = entries.filter(e => !(e.sheetYear != null && e.sheetMonth != null && (e.sheetYear !== y || e.sheetMonth !== m)))
    const byId = new Map(dateMatched.map(e => [e.id, e]))
    anchoredEntries.forEach(e => byId.set(e.id, e))
    return [...byId.values()]
  })()

  // Once a saved draft row's id shows up in the live entries feed, it's already
  // rendered in the "Entered" section above — drop it from the draft rows so it
  // doesn't also render (and visually double-count) as a checkmarked row below.
  useEffect(() => {
    Object.keys(deptEditState).forEach(dept => {
      const state = deptEditState[dept]
      if (!state || !state.newRows.some(r => r.savedId)) return
      const liveIds = new Set(
        combinedEntries
          .filter(e => normalizeDepartmentName(e.department || e.category) === dept)
          .map(e => e.id)
      )
      if (!state.newRows.some(r => r.savedId && liveIds.has(r.savedId))) return
      updateDeptState(dept, (current) => ({
        newRows: ensureTrailingBlank(current.newRows.filter(r => !(r.savedId && liveIds.has(r.savedId)))),
      }))
    })
  }, [combinedEntries])

  if (!canAccess) return <Navigate to="/" replace />

  const visibleEntries = filterDept === 'all'
    ? combinedEntries
    : combinedEntries.filter(e => normalizeDepartmentName(e.department || e.category) === filterDept)

  const totalExpense = visibleEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0)

  const grandTotal = combinedEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const deptStats = deptOptions.map(dept => {
    const rows = combinedEntries.filter(e => normalizeDepartmentName(e.department || e.category) === dept)
    return {
      dept,
      rows,
      total: rows.reduce((s, e) => s + (Number(e.amount) || 0), 0),
      count: rows.length,
    }
  })

  function prevMonth() { setInternalMonth(m => subMonths(m, 1)); setFilterDept('all') }
  function nextMonth() { setInternalMonth(m => addMonths(m, 1)); setFilterDept('all') }

  function selectDept(dept) {
    setFilterDept(dept)
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Accordion: opening a department closes whichever one was open before it, so
  // other cards stay at their normal tile size until you actually select them.
  // Collapsing/reopening a card must not touch its saved-in-place rows or anything
  // else the user typed — only the expanded/collapsed flag changes here.
  // getDeptState() already falls back to a fresh DEFAULT_DEPT_STATE the first time
  // a department is ever opened, so no explicit reset is needed here.
  function toggleExpand(dept) {
    setExpandedDepts(prev => (prev.includes(dept) ? [] : [dept]))
  }

  function editRowsFromEntries(rows) {
    return rows.map(r => ({
      id: r.id,
      // Always dd.MM.yyyy — matches the format handleEditDateBlur() converts a row to
      // once the user finishes typing, so a row looks the same whether it's freshly
      // loaded or already edited, instead of showing ISO yyyy-MM-dd until first touched.
      date: format(r.date instanceof Date ? r.date : new Date(r.date), 'dd.MM.yyyy'),
      item: r.item || '',
      billNo: r.billNo || '',
      amount: String(r.amount ?? ''),
    }))
  }

  // Unlocks a single already-saved "Entered" row for inline editing, in place —
  // mirrors how a locked draft row unlocks via its own ⋮ → Edit. No separate bulk
  // "edit mode" toggle; every row's edit state is independent, and there's one save
  // path (the bottom "Save rows" button) for both this and new draft rows.
  function handleUnlockEnteredRow(dept, entry) {
    updateDeptState(dept, (current) => (
      current.editRows.some(r => r.id === entry.id)
        ? current
        : { editRows: [...current.editRows, ...editRowsFromEntries([entry])] }
    ))
  }

  // Immediate, no-confirmation delete for a single unlocked "Entered" row — the ⋮
  // icon. Removes it from Firestore via the shared handleDelete (which also offers
  // the usual Undo toast), then drops it from this dept's local editRows list so it
  // disappears from the inline-edit view right away.
  async function handleDeleteEditRow(dept, id) {
    await handleDelete(id)
    updateDeptState(dept, (current) => ({ editRows: current.editRows.filter(r => r.id !== id) }))
  }

  function updateEditRowField(dept, idx, field, value) {
    updateDeptState(dept, (current) => ({
      editRows: current.editRows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)),
    }))
  }

  // Reformats a date box to dd.MM.yyyy once the user finishes typing (on blur) —
  // reformatting mid-keystroke would fight with what they're still typing.
  function handleEditDateBlur(dept, idx, value) {
    const parsed = parseFlexibleDate(value)
    if (parsed) updateEditRowField(dept, idx, 'date', toDisplayDate(parsed))
  }

  function updateRowField(dept, idx, field, value) {
    updateDeptState(dept, (current) => ({
      newRows: current.newRows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)),
    }))
  }

  function handleDateBlur(dept, idx, value) {
    const parsed = parseFlexibleDate(value)
    if (parsed) updateRowField(dept, idx, 'date', toDisplayDate(parsed))
  }

  function addMoreRows(dept, count = 1) {
    updateDeptState(dept, (current) => ({ newRows: [...current.newRows, ...blankRows(count)], hideBlankRows: false }))
  }

  // Unlocks a saved row back into an editable input row, in place, for a quick fix.
  function unlockRow(dept, idx) {
    updateDeptState(dept, (current) => ({
      newRows: current.newRows.map((r, i) => (i === idx ? { ...r, unlocked: true } : r)),
    }))
  }

  async function handleDeleteNewRow(dept, idx, savedId) {
    const row = getDeptState(dept).newRows[idx]
    try {
      await deleteFinanceExpense(savedId)
      if (row) {
        offerUndo({
          department: dept,
          date: parseFlexibleDate(row.date) || row.date,
          item: row.item || '',
          billNo: row.billNo || '',
          amount: parseFlexibleAmount(row.amount),
        })
      }
    } catch {
      // ignore — worst case the row stays as it was and the user can retry
    }
    setDeletingId(null)
    updateDeptState(dept, (current) => ({
      newRows: ensureTrailingBlank(current.newRows.map((r, i) => (i === idx ? { ...BLANK_ROW, _key: newRowKey() } : r))),
    }))
  }

  function handlePasteRow(e, dept, idx, field) {
    const text = e.clipboardData.getData('text')
    if (!text.includes('\t') && !text.includes('\n') && !text.includes('\r')) return
    e.preventDefault()
    const pastedRows = text.replace(/\r/g, '').split('\n').filter((line, i, arr) => !(i === arr.length - 1 && line === ''))
    const startFieldIdx = ROW_FIELDS.indexOf(field)
    updateDeptState(dept, (current) => {
      const next = [...current.newRows]
      pastedRows.forEach((rowText, r) => {
        const targetRowIdx = idx + r
        while (next.length <= targetRowIdx) next.push({ ...BLANK_ROW, _key: newRowKey() })
        const cells = rowText.split('\t')
        cells.forEach((cellText, c) => {
          const fieldIdx = startFieldIdx + c
          if (fieldIdx >= ROW_FIELDS.length) return
          const fieldName = ROW_FIELDS[fieldIdx]
          let cellValue = cellText.trim()
          if (fieldName === 'date') {
            const parsedDate = parseFlexibleDate(cellValue)
            if (parsedDate) cellValue = toDisplayDate(parsedDate)
          }
          next[targetRowIdx] = { ...next[targetRowIdx], [fieldName]: cellValue }
        })
      })
      return { newRows: ensureTrailingBlank(next), undoStack: [...current.undoStack, current.newRows].slice(-10) }
    })
  }

  // Saves every filled row right away (rather than waiting for auto-save's debounce)
  // Saves every filled row immediately (rather than waiting for auto-save's debounce)
  // and marks each with a checkmark. It never clears or blanks a row — the row stays
  // exactly as typed, whether it saved successfully or not, so nothing ever disappears
  // from the grid on its own. The saved data is also visible read-only in the
  // "Entered" list above, via the live entries listener.
  // The single save action for the whole card: persists new draft rows AND any
  // "Entered" rows currently unlocked for inline editing, together, in one click —
  // there is no separate top "Save Changes" button any more.
  async function handleSaveRows(dept, { force = false } = {}) {
    const fillable = getDeptState(dept).newRows
      .filter(r => r.date || r.item || r.billNo || r.amount)
    const editFillable = getDeptState(dept).editRows
    if (!fillable.length && !editFillable.length) return

    // Block the save (and the auto-collapse) behind an explicit confirmation whenever
    // a row's own date falls outside the sheet month it's about to be saved under —
    // the entry still gets anchored to this sheet either way (see the
    // createFinanceExpense call below), this just makes sure that's a deliberate choice
    // rather than something the user only notices after the card has already collapsed.
    if (!force) {
      const isMismatched = (dateStr) => {
        const parsed = parseFlexibleDate(dateStr)
        if (!parsed) return false
        const [ry, rm] = parsed.split('-').map(Number)
        return ry !== activeMonth.getFullYear() || (rm - 1) !== activeMonth.getMonth()
      }
      const mismatched = [
        ...fillable.filter(r => !r.savedId && isMismatched(r.date)),
        ...editFillable.filter(r => isMismatched(r.date)),
      ]
      if (mismatched.length > 0) {
        const exampleDate = toDisplayDate(parseFlexibleDate(mismatched[0].date))
        setSaveWarning({ dept, count: mismatched.length, exampleDate })
        return
      }
    }

    updateDeptState(dept, () => ({ savingRows: true, rowsError: '' }))
    let imported = 0, failed = 0
    for (const row of fillable) {
      const date = parseFlexibleDate(row.date)
      const amount = parseFlexibleAmount(row.amount)
      if (!date || !amount || amount <= 0) { failed++; continue }
      // Entries typed directly into this Expense tab are entered by Accounts/Founder
      // staff (this page is only reachable by that access tier — see canAccessAccountsEntry),
      // so they're auto-approved. "Pending" is reserved for the Weekly submission form,
      // which restricted Department Director accounts use and which explicitly sets
      // status: 'pending' for the Accounts Director to review.
      const payload = { date, department: dept, item: row.item, billNo: row.billNo, amount, status: 'approved' }
      try {
        if (row.savedId) {
          // Updating an already-saved row never touches sheetYear/sheetMonth — if it
          // was previously moved to a different month's sheet, that anchor is kept.
          await updateFinanceExpense(row.savedId, payload)
        } else {
          // New entries are anchored to whichever month sheet you're viewing right now,
          // independent of the typed date — see combinedEntries above for why.
          const id = await createFinanceExpense({ ...payload, sheetYear: activeMonth.getFullYear(), sheetMonth: activeMonth.getMonth() })
          updateDeptState(dept, (current) => ({
            newRows: current.newRows.map((r) => (r._key === row._key && !r.savedId ? { ...r, savedId: id } : r)),
          }))
        }
        imported++
      } catch { failed++ }
    }
    const editFailedIds = new Set()
    for (const row of editFillable) {
      const date = parseFlexibleDate(row.date)
      const amount = parseFlexibleAmount(row.amount)
      if (!date || !amount || amount <= 0) { failed++; editFailedIds.add(row.id); continue }
      try {
        // Editing an already-saved "Entered" row never touches sheetYear/sheetMonth —
        // same reasoning as the draft-row update branch above.
        await updateFinanceExpense(row.id, { date, department: dept, item: row.item, billNo: row.billNo, amount })
        imported++
      } catch { failed++; editFailedIds.add(row.id) }
    }
    updateDeptState(dept, (current) => ({
      savingRows: false,
      rowsError: failed > 0 ? `${imported} saved, ${failed} skipped (need a valid date and amount).` : '',
      hideBlankRows: true,
      newRows: ensureTrailingBlank(current.newRows),
      // Successfully-saved entered-row edits drop out of editRows and revert to the
      // normal read-only "Entered" display, sourced fresh from the live listener.
      // Failed ones stay editable so the error and the row are still visible.
      editRows: current.editRows.filter(r => editFailedIds.has(r.id)),
    }))
    // Collapse the card back to its compact tile once everything saved cleanly.
    // If any row failed, or this save went through "Save Anyway" past a date-mismatch
    // warning, stay expanded so the error message / the newly red-highlighted rows
    // stay visible instead of being hidden behind a collapsed tile.
    if (failed === 0 && imported > 0 && !force) {
      setExpandedDepts([])
    }
  }

  async function handleUploadDeptExcel(e, dept) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    updateDeptState(dept, () => ({ rowsError: '' }))
    try {
      const XLSX = await import('xlsx')
      const data = await file.arrayBuffer()
      const wb = XLSX.read(data, { type: 'array', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
      if (!raw.length) { updateDeptState(dept, () => ({ rowsError: 'No data found in the file.' })); return }

      const norm = (key) => String(key).toLowerCase().replace(/[\s_-]/g, '')
      const parsed = raw.map((row) => {
        const r = {}
        for (const [k, v] of Object.entries(row)) r[norm(k)] = v
        const rawDate = r['date'] ?? r['entrydate'] ?? ''
        const item = String(r['item'] ?? r['description'] ?? r['particulars'] ?? r['narration'] ?? '').trim()
        const billNo = String(r['billno'] ?? r['bill'] ?? r['billnumber'] ?? r['invoiceno'] ?? '').trim()
        const amount = r['amount'] ?? r['amountrs'] ?? r['rs'] ?? r['total'] ?? ''
        // Auto-parsed and shown as a full dd.MM.yyyy date; falls back to the raw cell
        // text if it isn't a recognizable date, so the user can see and fix it.
        const rawDateText = rawDate instanceof Date ? format(rawDate, 'dd.MM.yyyy') : String(rawDate).trim()
        const parsedUploadDate = rawDate instanceof Date ? format(rawDate, 'yyyy-MM-dd') : parseFlexibleDate(rawDateText)
        const date = parsedUploadDate ? toDisplayDate(parsedUploadDate) : rawDateText
        return { date, item, billNo, amount: String(amount), _key: newRowKey() }
      }).filter(r => r.date || r.item || r.billNo || r.amount)

      if (!parsed.length) { updateDeptState(dept, () => ({ rowsError: 'Could not find any usable rows. Columns expected: Date, Item, Bill No, Amount.' })); return }
      setExpandedDepts([dept])
      updateDeptState(dept, (current) => ({
        newRows: [...current.newRows, ...parsed, ...blankRows(1)],
        hideBlankRows: false,
        undoStack: [...current.undoStack, current.newRows].slice(-10),
      }))
    } catch (err) {
      console.error(err)
      updateDeptState(dept, () => ({ rowsError: 'Failed to read the file. Make sure it is a valid .xlsx or .xls file.' }))
    }
  }

  async function handleDelete(id) {
    const entry = combinedEntries.find(e => e.id === id)
    try {
      await deleteFinanceExpense(id)
      setDeletingId(null)
      setEntries(prev => prev.filter(e => e.id !== id))
      setAnchoredEntries(prev => prev.filter(e => e.id !== id))
      if (entry) {
        offerUndo({
          department: normalizeDepartmentName(entry.department || entry.category),
          date: entry.date instanceof Date ? format(entry.date, 'yyyy-MM-dd') : format(new Date(entry.date), 'yyyy-MM-dd'),
          item: entry.item || '',
          billNo: entry.billNo || '',
          amount: Number(entry.amount) || 0,
        })
      }
    } catch {
      setSaveError('Failed to delete. Please try again.')
      setTimeout(() => setSaveError(''), 4000)
    }
  }

  // The explicit, manual "move" action — re-anchors an entry to whatever month its own
  // date actually falls in, instead of the sheet it was originally saved under.
  async function handleMoveToCorrectMonth(entry) {
    const d = entry.date instanceof Date ? entry.date : new Date(entry.date)
    try {
      await updateFinanceExpenseSheet(entry.id, { sheetYear: d.getFullYear(), sheetMonth: d.getMonth() })
    } catch {
      setSaveError('Failed to move entry. Please try again.')
      setTimeout(() => setSaveError(''), 4000)
    }
  }

  return (
    <div className="space-y-5 pb-12">

      {/* Grid / Weekly view toggle */}
      <div className="flex justify-center">
        <div className="inline-flex gap-1 bg-slate-100 rounded-xl p-1">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
              viewMode === 'grid' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Grid
          </button>
          <button
            type="button"
            onClick={() => setViewMode('weekly')}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
              viewMode === 'weekly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Weekly
          </button>
        </div>
      </div>

      {viewMode === 'weekly' && <WeeklyEntryPage />}

      {viewMode === 'weekly' ? null : (
      <>

      {/* Month picker — hidden when month is controlled by parent */}
      {!controlledMonth && (
        <div className="flex items-center justify-center gap-4 py-2">
          <button type="button" onClick={prevMonth} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition text-lg leading-none" aria-label="Previous month">‹</button>
          <span className="text-base font-semibold text-slate-800 w-36 text-center">{format(activeMonth, 'MMMM yyyy')}</span>
          <button type="button" onClick={nextMonth} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition text-lg leading-none" aria-label="Next month">›</button>
        </div>
      )}

      {/* Undo-delete toast */}
      {undoDelete && (
        <div className="flex items-center justify-between gap-3 bg-slate-800 text-white rounded-xl px-4 py-3">
          <p className="text-sm">
            Deleted {undoDelete.item || undoDelete.department} · ₹{undoDelete.amount.toLocaleString('en-IN')}
          </p>
          <div className="flex items-center gap-3 shrink-0">
            <button type="button" onClick={handleUndoDelete} className="text-sm font-semibold text-indigo-300 hover:text-indigo-200">Undo</button>
            <button type="button" onClick={() => setUndoDelete(null)} className="text-slate-400 hover:text-slate-200 text-lg leading-none">×</button>
          </div>
        </div>
      )}

      {/* Date-mismatch warning — blocks "Save rows" until the user explicitly picks
          "Fix Dates" (cancel, keep the card open to edit) or "Save Anyway" (save,
          entries stay anchored to this sheet and get the usual red highlight). */}
      {saveWarning && createPortal(
        <div data-row-menu-overlay="true" className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-3">
            <p className="text-sm font-semibold text-red-700">⚠ Cannot Save Rows</p>
            <p className="text-sm text-slate-600">
              {saveWarning.count} {saveWarning.count === 1 ? 'entry is' : 'entries are'} dated outside {format(activeMonth, 'MMMM yyyy')}
              {saveWarning.exampleDate && <> (e.g. {saveWarning.exampleDate})</>}.
              Please correct the date{saveWarning.count === 1 ? '' : 's'} before saving, or choose "Save Anyway" to keep{saveWarning.count === 1 ? ' it' : ' them'} on this
              sheet — you can move {saveWarning.count === 1 ? 'it' : 'them'} to the right month afterward using "↷ Move" in the Entered list above.
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setSaveWarning(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:border-slate-300 transition-colors"
              >
                Fix Dates
              </button>
              <button
                type="button"
                onClick={() => { const dept = saveWarning.dept; setSaveWarning(null); handleSaveRows(dept, { force: true }) }}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors"
              >
                Save Anyway
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Department grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-start">
        <button
          type="button"
          onClick={() => selectDept('all')}
          className={`rounded-2xl border p-3.5 text-left transition-colors ${
            filterDept === 'all'
              ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300'
              : 'border-slate-200 bg-white hover:border-indigo-300'
          }`}
        >
          <p className="text-xs font-semibold text-slate-600">All</p>
          <p className="text-lg font-bold text-slate-900 mt-1">₹{grandTotal.toLocaleString('en-IN')}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{combinedEntries.length} {combinedEntries.length === 1 ? 'entry' : 'entries'}</p>
        </button>
        {deptStats.map(({ dept, total, count, rows }) => {
          const isExpanded = expandedDepts.includes(dept)
          const { newRows, savingRows, rowsError, hideBlankRows, undoStack, editRows } = getDeptState(dept)
          // Keeps each row's real position in `newRows` (via _idx) so edit/delete/paste
          // handlers still target the right slot after blank rows are filtered out.
          // When hideBlankRows is on, every blank row is hidden except the very last —
          // that one stays so there's always an empty row ready for immediate typing.
          const visibleNewRows = newRows
            .map((r, _idx) => ({ ...r, _idx }))
            .filter((r, i, arr) => !hideBlankRows || !isRowBlank(r) || i === arr.length - 1)
          const otherMonthCount = visibleNewRows.filter(r => {
            if (!r.savedId || r.unlocked) return false
            const parsed = parseFlexibleDate(r.date)
            if (!parsed) return false
            const [ry, rm] = parsed.split('-').map(Number)
            return ry !== activeMonth.getFullYear() || (rm - 1) !== activeMonth.getMonth()
          }).length
          return (
          <div
            key={dept}
            ref={isExpanded ? expandedCardRef : null}
            className={`rounded-2xl border overflow-hidden transition-colors ${
              isExpanded
                ? 'border-indigo-400 ring-1 ring-indigo-300 col-span-2 sm:col-span-3 lg:col-span-2'
                : 'border-slate-200 bg-white'
            }`}
          >
            <div className={`flex items-start transition-colors ${isExpanded ? 'bg-indigo-50' : 'hover:bg-indigo-50/40'}`}>
              <button
                type="button"
                onClick={() => toggleExpand(dept)}
                className="flex-1 min-w-0 text-left p-3.5"
              >
                <p className="text-xs font-semibold text-slate-600 truncate">{dept}</p>
                <p className="text-lg font-bold text-slate-900 mt-1">₹{total.toLocaleString('en-IN')}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{count} {count === 1 ? 'entry' : 'entries'}</p>
              </button>
              <label
                className="m-2 p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-100/60 cursor-pointer transition-colors shrink-0"
                title="Upload Excel"
              >
                📊
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => handleUploadDeptExcel(e, dept)} />
              </label>
            </div>

            {isExpanded && (
              <div className="border-t border-slate-100 bg-white">
                <div>
                  {rows.length > 0 && (
                    <div className="px-3 pt-3 pb-1.5">
                      <p className="text-[11px] font-bold text-indigo-500 uppercase tracking-widest flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> Entered
                      </p>
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse table-fixed">
                      <thead>
                        <tr className="text-left text-indigo-700 bg-gradient-to-r from-indigo-50 via-violet-50 to-rose-50">
                          <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide w-10 border-b-2 border-indigo-100">Sl</th>
                          <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide w-32 border-b-2 border-indigo-100">Date</th>
                          <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide border-b-2 border-indigo-100">Item</th>
                          <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide w-20 border-b-2 border-indigo-100">Bill No</th>
                          <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide text-right w-24 border-b-2 border-indigo-100">Amount</th>
                          <th className="px-3 py-2 border-b-2 border-indigo-100 w-16" />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((entry, idx) => {
                          const editIdx = editRows.findIndex(r => r.id === entry.id)
                          const row = editIdx === -1 ? null : editRows[editIdx]

                          // Unlocked for inline editing — recomputed fresh from the row's own
                          // current values on every render, so the red styling tracks live
                          // edits instead of a stale flag, clearing itself the moment the
                          // date/amount is corrected.
                          if (row) {
                            const editParsedDate = parseFlexibleDate(row.date)
                            const editDateMismatch = editParsedDate
                              ? (() => {
                                  const [ry, rm] = editParsedDate.split('-').map(Number)
                                  return ry !== activeMonth.getFullYear() || (rm - 1) !== activeMonth.getMonth()
                                })()
                              : false
                            const editInvalid = !editParsedDate || parseFlexibleAmount(row.amount) <= 0
                            const editHasError = editInvalid || editDateMismatch
                            return (
                            <tr
                              key={row.id}
                              className={editHasError
                                ? 'bg-red-50/80 border-2 border-red-400 text-red-900'
                                : `border-b border-slate-100 ${idx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}`}
                            >
                              <td className="px-3 py-2.5">
                                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${editHasError ? 'bg-red-500 text-white' : 'bg-indigo-100 text-indigo-700'}`}>
                                  {editHasError ? '!' : idx + 1}
                                </span>
                              </td>
                              <td className="p-1">
                                <div className="relative">
                                  <input
                                    type="text"
                                    value={row.date}
                                    onChange={e => updateEditRowField(dept, editIdx, 'date', e.target.value)}
                                    onBlur={e => handleEditDateBlur(dept, editIdx, e.target.value)}
                                    title={editDateMismatch ? `Dated outside ${format(activeMonth, 'MMMM yyyy')}` : ''}
                                    className={`w-full rounded-lg border bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 transition-colors ${
                                      editDateMismatch
                                        ? 'border-red-400 pr-6 text-red-700 focus:border-red-500 focus:ring-red-200'
                                        : 'border-slate-200 hover:border-indigo-300 focus:border-indigo-400 focus:ring-indigo-200'
                                    }`}
                                  />
                                  {editDateMismatch && (
                                    <span title={`Outside ${format(activeMonth, 'MMMM yyyy')}`} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-red-500 text-xs pointer-events-none">⚠</span>
                                  )}
                                </div>
                              </td>
                              <td className="p-1">
                                <input
                                  type="text"
                                  value={row.item}
                                  onChange={e => updateEditRowField(dept, editIdx, 'item', e.target.value)}
                                  className="w-full rounded-lg border border-slate-200 bg-white hover:border-indigo-300 focus:border-indigo-400 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 transition-colors"
                                />
                              </td>
                              <td className="p-1">
                                <input
                                  type="text"
                                  value={row.billNo}
                                  onChange={e => updateEditRowField(dept, editIdx, 'billNo', e.target.value)}
                                  className="w-full rounded-lg border border-slate-200 bg-white hover:border-amber-300 focus:border-amber-400 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 transition-colors"
                                />
                              </td>
                              <td className="p-1">
                                <input
                                  type="text"
                                  value={row.amount}
                                  onChange={e => updateEditRowField(dept, editIdx, 'amount', e.target.value)}
                                  className="w-full rounded-lg border border-slate-200 bg-white hover:border-rose-300 focus:border-rose-400 px-2 py-1.5 text-sm text-right font-medium text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-200 transition-colors"
                                />
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteEditRow(dept, row.id)}
                                  title="Delete this row"
                                  className="w-6 h-6 flex items-center justify-center p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600 text-base leading-none transition-colors mx-auto"
                                >
                                  ⋮
                                </button>
                              </td>
                            </tr>
                            )
                          }

                          const entryDate = entry.date instanceof Date ? entry.date : new Date(entry.date)
                          const isAnchoredElsewhere = entry.sheetYear != null && entry.sheetMonth != null &&
                            (entry.sheetYear !== entryDate.getFullYear() || entry.sheetMonth !== entryDate.getMonth())
                          return (
                          <tr
                            key={entry.id}
                            className={`border-b transition-colors ${isAnchoredElsewhere ? 'bg-red-50/60 border-red-100' : `border-slate-100 ${idx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}`}`}
                          >
                            <td className="px-3 py-2.5">
                              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${isAnchoredElsewhere ? 'bg-red-500 text-white' : 'bg-indigo-100 text-indigo-700'}`}>
                                {isAnchoredElsewhere ? '!' : idx + 1}
                              </span>
                            </td>
                            <td
                              className={`px-3 py-2.5 whitespace-nowrap font-medium ${isAnchoredElsewhere ? 'text-red-700' : 'text-slate-700'}`}
                              title={isAnchoredElsewhere ? `Dated outside this sheet's month — kept here until you move it` : ''}
                            >
                              {format(entryDate, 'dd.MM.yyyy')}
                            </td>
                            <td className="px-3 py-2.5 text-slate-700 truncate" title={entry.item || ''}>{entry.item || '—'}</td>
                            <td className="px-3 py-2.5">
                              {entry.billNo
                                ? <span className="inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[11px] font-medium">{entry.billNo}</span>
                                : <span className="text-slate-300">—</span>}
                            </td>
                            <td className={`px-3 py-2.5 text-right font-bold ${isAnchoredElsewhere ? 'text-red-600' : 'text-rose-600'}`}>₹{Number(entry.amount).toLocaleString('en-IN')}</td>
                            <td className="px-3 py-2.5 text-center">
                              {deletingId === entry.id ? (
                                <div className="flex items-center justify-center gap-1.5 text-[10px]">
                                  <button type="button" onClick={() => handleDelete(entry.id)} className="text-red-600 font-semibold hover:underline">Yes</button>
                                  <button type="button" onClick={() => setDeletingId(null)} className="text-slate-500 hover:underline">No</button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-1">
                                  {isAnchoredElsewhere && (
                                    <button
                                      type="button"
                                      onClick={() => handleMoveToCorrectMonth(entry)}
                                      title={`Move to ${format(entryDate, 'MMMM yyyy')}`}
                                      className="px-1.5 py-1 rounded text-[10px] font-semibold text-red-600 hover:bg-red-100 transition-colors"
                                    >
                                      ↷ Move
                                    </button>
                                  )}
                                  <RowActionsMenu
                                    menuKey={`entered-${entry.id}`}
                                    openKey={openActionMenu}
                                    onOpen={setOpenActionMenu}
                                    onClose={() => setOpenActionMenu(null)}
                                    onEdit={() => handleUnlockEnteredRow(dept, entry)}
                                    onDelete={() => setDeletingId(entry.id)}
                                  />
                                </div>
                              )}
                            </td>
                          </tr>
                          )
                        })}

                        {/* Draft rows attach directly beneath — a faint emerald tint marks them as
                            open for typing or pasting, no separate header needed. */}
                        {visibleNewRows.map((row, seq) => {
                          const idx = row._idx
                          const slNumber = rows.length + seq + 1
                          const isLocked = row.savedId && !row.unlocked
                          const isFirstDraftRow = !isLocked && (seq === 0 || (visibleNewRows[seq - 1].savedId && !visibleNewRows[seq - 1].unlocked))
                          if (isLocked) {
                            const parsedRowDate = parseFlexibleDate(row.date)
                            const isOtherMonth = parsedRowDate
                              ? (() => {
                                  const [ry, rm] = parsedRowDate.split('-').map(Number)
                                  return ry !== activeMonth.getFullYear() || (rm - 1) !== activeMonth.getMonth()
                                })()
                              : false
                            return (
                              <tr key={row._key} className={isOtherMonth ? 'bg-red-50/60 border-b border-red-100' : 'bg-emerald-50/50 border-b border-emerald-100'}>
                                <td className="px-3 py-2.5 text-center">
                                  <span
                                    title={isOtherMonth ? `Saved, but dated outside ${format(activeMonth, 'MMMM yyyy')} — not counted in this total` : 'Already saved'}
                                    className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] font-bold ${isOtherMonth ? 'bg-red-500' : 'bg-emerald-500'}`}
                                  >
                                    {isOtherMonth ? '!' : '✓'}
                                  </span>
                                </td>
                                <td className={`px-3 py-2.5 whitespace-nowrap font-medium ${isOtherMonth ? 'text-red-700' : 'text-slate-700'}`}>{row.date}</td>
                                <td className={`px-3 py-2.5 truncate ${isOtherMonth ? 'text-red-700' : 'text-slate-700'}`} title={row.item}>{row.item || '—'}</td>
                                <td className="px-3 py-2.5">
                                  {row.billNo
                                    ? <span className="inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[11px] font-medium">{row.billNo}</span>
                                    : <span className="text-slate-300">—</span>}
                                </td>
                                <td className={`px-3 py-2.5 text-right font-bold ${isOtherMonth ? 'text-red-600' : 'text-rose-600'}`}>₹{parseFlexibleAmount(row.amount).toLocaleString('en-IN')}</td>
                                <td className="px-3 py-2.5 text-center">
                                  {deletingId === row.savedId ? (
                                    <div className="flex items-center justify-center gap-1.5 text-[10px]">
                                      <button type="button" onClick={() => handleDeleteNewRow(dept, idx, row.savedId)} className="text-red-600 font-semibold hover:underline">Yes</button>
                                      <button type="button" onClick={() => setDeletingId(null)} className="text-slate-500 hover:underline">No</button>
                                    </div>
                                  ) : (
                                    <RowActionsMenu
                                      menuKey={`addnew-${dept}-${row.savedId}`}
                                      openKey={openActionMenu}
                                      onOpen={setOpenActionMenu}
                                      onClose={() => setOpenActionMenu(null)}
                                      onEdit={() => unlockRow(dept, idx)}
                                      onDelete={() => setDeletingId(row.savedId)}
                                    />
                                  )}
                                </td>
                              </tr>
                            )
                          }
                          return (
                          <tr key={row._key} className={`bg-emerald-50/30 ${isFirstDraftRow ? 'border-t-2 border-dashed border-emerald-300' : 'border-t border-emerald-100/70'}`}>
                            <td className="px-3 py-2.5 text-center">
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">{slNumber}</span>
                            </td>
                            <td className="p-1">
                              <input
                                type="text"
                                value={row.date}
                                onChange={e => updateRowField(dept, idx, 'date', e.target.value)}
                                onPaste={e => handlePasteRow(e, dept, idx, 'date')}
                                onBlur={e => handleDateBlur(dept, idx, e.target.value)}
                                placeholder="dd.mm.yyyy"
                                className="w-full rounded-lg border border-transparent bg-white/70 hover:border-emerald-300 focus:border-emerald-400 px-2 py-1.5 text-sm placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-200 transition-colors"
                              />
                            </td>
                            <td className="p-1">
                              <input
                                type="text"
                                value={row.item}
                                onChange={e => updateRowField(dept, idx, 'item', e.target.value)}
                                onPaste={e => handlePasteRow(e, dept, idx, 'item')}
                                placeholder="Item"
                                className="w-full rounded-lg border border-transparent bg-white/70 hover:border-emerald-300 focus:border-emerald-400 px-2 py-1.5 text-sm placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-200 transition-colors"
                              />
                            </td>
                            <td className="p-1">
                              <input
                                type="text"
                                value={row.billNo}
                                onChange={e => updateRowField(dept, idx, 'billNo', e.target.value)}
                                onPaste={e => handlePasteRow(e, dept, idx, 'billNo')}
                                placeholder="Bill No"
                                className="w-full rounded-lg border border-transparent bg-white/70 hover:border-amber-300 focus:border-amber-400 px-2 py-1.5 text-sm placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-200 transition-colors"
                              />
                            </td>
                            <td className="p-1">
                              <input
                                type="text"
                                value={row.amount}
                                onChange={e => updateRowField(dept, idx, 'amount', e.target.value)}
                                onPaste={e => handlePasteRow(e, dept, idx, 'amount')}
                                placeholder="0"
                                className="w-full rounded-lg border border-transparent bg-white/70 hover:border-rose-300 focus:border-rose-400 px-2 py-1.5 text-sm text-right font-medium text-rose-600 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-200 transition-colors"
                              />
                            </td>
                            <td />
                          </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {otherMonthCount > 0 && (
                  <p className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border-t border-red-100">
                    ⚠ {otherMonthCount} row{otherMonthCount === 1 ? '' : 's'} in red {otherMonthCount === 1 ? 'is' : 'are'} dated outside {format(activeMonth, 'MMMM yyyy')} — still counted here on this sheet. Use "↷ Move" above once you've confirmed the date, or fix a typo directly.
                  </p>
                )}
                {rowsError && <p className="px-3 py-1.5 text-xs font-medium text-red-600">{rowsError}</p>}
                <div className="p-3 bg-gradient-to-r from-slate-50 to-indigo-50/50 border-t border-slate-100 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSaveRows(dept)}
                    disabled={savingRows}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm disabled:opacity-50 transition-colors"
                  >
                    {savingRows ? 'Saving…' : 'Save rows'}
                  </button>
                  <button
                    type="button"
                    onClick={() => addMoreRows(dept, 1)}
                    title="Add row"
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 text-base font-semibold hover:border-emerald-300 hover:text-emerald-700 transition-colors"
                  >
                    +
                  </button>
                  {undoStack.length > 0 && (
                    <button
                      type="button"
                      onClick={() => undoLastChange(dept)}
                      title="Undo last paste/upload (Ctrl+Z)"
                      className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-medium hover:border-indigo-300 hover:text-indigo-700 transition-colors"
                    >
                      ↺ Undo
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
          )
        })}
      </div>

      {/* Total Expense summary — reflects whichever department is selected via the grid above */}
      <div ref={formRef} className="bg-gradient-to-br from-rose-500 to-rose-600 rounded-2xl shadow-lg p-5 text-white flex items-center justify-between scroll-mt-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-rose-100">Total Expense</p>
          <p className="text-2xl font-bold leading-tight mt-1">
            ₹{totalExpense.toLocaleString('en-IN')}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-rose-200">
            {visibleEntries.length} {visibleEntries.length === 1 ? 'entry' : 'entries'} · {format(activeMonth, 'MMM yyyy')}
          </p>
          {filterDept !== 'all' && (
            <p className="text-[10px] text-rose-300 mt-0.5">{filterDept}</p>
          )}
        </div>
      </div>

      {/* Load error */}
      {loadError && (
        <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-sm text-red-700 font-medium">{loadError}</p>
          <button type="button" onClick={load} className="text-xs text-red-600 font-semibold hover:underline">Retry</button>
        </div>
      )}

      {saveError && <p className="text-xs font-medium text-red-600">{saveError}</p>}

      {/* Expense list */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-slate-500 text-sm">Loading…</div>
        ) : visibleEntries.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-sm">
            {filterDept === 'all'
              ? 'No expenses recorded for this month.'
              : `No expenses recorded for ${filterDept} this month.`}
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-slate-100">
              {visibleEntries.map((entry, idx) => (
                <div key={entry.id} className={`p-4 space-y-2 ${entry.status === 'pending' ? 'bg-amber-50/40' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">
                        <span className="text-xs font-normal text-slate-400 mr-1">#{idx + 1}</span>
                        ₹{Number(entry.amount).toLocaleString('en-IN')}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {entry.date instanceof Date
                          ? format(entry.date, 'dd/MM/yyyy')
                          : format(new Date(entry.date), 'dd/MM/yyyy')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {entry.status === 'pending' ? (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Pending</span>
                      ) : entry.status === 'approved' && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Confirmed</span>
                      )}
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                        {normalizeDepartmentName(entry.department || entry.category)}
                      </span>
                    </div>
                  </div>
                  {(entry.item || entry.billNo) && (
                    <div className="text-xs text-slate-600 space-y-0.5">
                      {entry.item && <p>{entry.item}</p>}
                      {entry.billNo && <p className="text-slate-400">Bill: {entry.billNo}</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {/* Desktop table — read-only aggregate audit view. Deletions happen only
                inside the specific department card's own sheet, not from here. */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    <th className="px-4 py-3 text-center w-10">No.</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3">Bill No</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleEntries.map((entry, idx) => (
                    <tr key={entry.id} className={`transition ${entry.status === 'pending' ? 'bg-amber-50/40' : 'hover:bg-slate-50'}`}>
                      <td className="px-4 py-3 text-center text-xs text-slate-400 font-medium">{idx + 1}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {entry.date instanceof Date
                          ? format(entry.date, 'dd/MM/yyyy')
                          : format(new Date(entry.date), 'dd/MM/yyyy')}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <div className="flex items-center gap-1.5">
                          {normalizeDepartmentName(entry.department || entry.category)}
                          {entry.status === 'pending' ? (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Pending</span>
                          ) : entry.status === 'approved' && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Confirmed</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{entry.item || '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{entry.billNo || '—'}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800">
                        ₹{Number(entry.amount).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      </>
      )}
    </div>
  )
}
