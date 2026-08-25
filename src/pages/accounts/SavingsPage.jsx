import { useState, useEffect, useRef } from 'react'
import { format, addMonths, subMonths, startOfMonth } from 'date-fns'
import { useAuth } from '../../context/AuthContext'
import { canAccessAccountsEntry } from '../../utils/accountsEntryAccess'
import { parseFlexibleDate, toDisplayDate, parseFlexibleAmount } from '../../utils/entryTableHelpers'
import RowActionsMenu from '../../components/RowActionsMenu'
import {
  listenFinanceSavings,
  createFinanceSavings,
  updateFinanceSavings,
  deleteFinanceSavings,
} from '../../services/firestore'
import { SAVINGS_FUNDS } from '../../constants/savingsFunds'

const ROW_FIELDS = ['date', 'item', 'reference', 'amount']
const BLANK_ROW = { date: '', item: '', reference: '', amount: '', type: 'deposit' }

// A stable per-row identity independent of array position — same reasoning as
// ExpensePage's newRowKey: the async save loop must locate a row by this key,
// not by its index at snapshot time, since the reconciliation effect can
// remove/reorder newRows mid-loop as the live listener echoes back a save.
let rowKeyCounter = 0
function newRowKey() {
  rowKeyCounter += 1
  return `srow-${Date.now()}-${rowKeyCounter}`
}

function blankRows(count = 1) {
  return Array.from({ length: count }, () => ({ ...BLANK_ROW, _key: newRowKey() }))
}

function isRowBlank(r) {
  return !r.savedId && !r.date && !r.item && !r.reference && !r.amount
}

function ensureTrailingBlank(rows) {
  const last = rows[rows.length - 1]
  return last && isRowBlank(last) ? rows : [...rows, { ...BLANK_ROW, _key: newRowKey() }]
}

// Per-fund in-progress edit state, so multiple fund cards keep independent
// drafts even though only one can be expanded at a time.
const DEFAULT_FUND_STATE = {
  newRows: blankRows(),
  savingRows: false,
  rowsError: '',
  hideBlankRows: false,
  undoStack: [],
  // Already-saved rows currently unlocked for inline editing — a subset, not
  // all-or-nothing. Saved by the same "Save rows" button as newRows.
  editRows: [],
}

function TypeToggle({ value, onChange }) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-slate-200 text-[11px] font-semibold w-full">
      <button
        type="button"
        onClick={() => onChange('deposit')}
        className={`flex-1 px-1.5 py-1.5 transition-colors ${value === 'deposit' ? 'bg-emerald-500 text-white' : 'bg-white text-slate-400 hover:bg-slate-50'}`}
      >
        Deposit
      </button>
      <button
        type="button"
        onClick={() => onChange('withdrawal')}
        className={`flex-1 px-1.5 py-1.5 transition-colors border-l border-slate-200 ${value === 'withdrawal' ? 'bg-rose-500 text-white' : 'bg-white text-slate-400 hover:bg-slate-50'}`}
      >
        Withdraw
      </button>
    </div>
  )
}

export default function SavingsPage() {
  const { userProfile, hasPermission, isFounder } = useAuth()
  const canAccess = canAccessAccountsEntry(userProfile, hasPermission, isFounder)

  const [activeMonth, setActiveMonth] = useState(startOfMonth(new Date()))
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [undoDelete, setUndoDelete] = useState(null)
  const [expandedFunds, setExpandedFunds] = useState([])
  const [fundEditState, setFundEditState] = useState({})
  const [openActionMenu, setOpenActionMenu] = useState(null)

  function getFundState(fund) {
    return fundEditState[fund] || DEFAULT_FUND_STATE
  }

  function updateFundState(fund, updater) {
    setFundEditState(prev => {
      const current = prev[fund] || DEFAULT_FUND_STATE
      return { ...prev, [fund]: { ...current, ...updater(current) } }
    })
  }

  const unsubRef = useRef(null)
  const expandedCardRef = useRef(null)
  const undoTimerRef = useRef(null)

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
      await createFinanceSavings(payload)
    } catch {
      // best effort — if this fails there's nothing more to offer
    }
  }

  // Collapse the expanded fund card on an outside click — same pattern (and same
  // data-row-menu-overlay exemption for the portaled ⋮ dropdown) as ExpensePage.
  useEffect(() => {
    if (expandedFunds.length === 0) return
    function handleClickOutside(event) {
      if (event.target.closest?.('[data-row-menu-overlay]')) return
      if (expandedCardRef.current && !expandedCardRef.current.contains(event.target)) {
        setExpandedFunds([])
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [expandedFunds])

  useEffect(() => {
    if (!canAccess) return
    setLoading(true)
    setLoadError('')
    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null }
    unsubRef.current = listenFinanceSavings(
      (rows) => { setEntries(rows); setLoading(false) },
      () => { setLoadError('Failed to load savings entries.'); setLoading(false) },
    )
    return () => { if (unsubRef.current) unsubRef.current() }
  }, [canAccess])

  // Draft rows reconcile the same way ExpensePage's do: once a locally-tracked
  // savedId shows up among the live entries, drop that draft row so it doesn't
  // also render as a checkmarked duplicate underneath the live one.
  useEffect(() => {
    Object.keys(fundEditState).forEach(fund => {
      const state = fundEditState[fund]
      if (!state || !state.newRows.some(r => r.savedId)) return
      const liveIds = new Set(entries.filter(e => e.fund === fund).map(e => e.id))
      if (!state.newRows.some(r => r.savedId && liveIds.has(r.savedId))) return
      updateFundState(fund, (current) => ({
        newRows: ensureTrailingBlank(current.newRows.filter(r => !(r.savedId && liveIds.has(r.savedId)))),
      }))
    })
  }, [entries])

  function prevMonth() { setActiveMonth(m => subMonths(m, 1)) }
  function nextMonth() { setActiveMonth(m => addMonths(m, 1)) }

  function toggleExpand(fund) {
    setExpandedFunds(prev => (prev.includes(fund) ? [] : [fund]))
  }

  // A fund's balance counts EVERY transaction it has ever had, regardless of the
  // month filter below — savings never resets the way Expense does. The month
  // filter only narrows which rows are listed in the expanded table.
  const fundStats = SAVINGS_FUNDS.map((fund) => {
    const all = entries.filter(e => e.fund === fund)
    const balance = all.reduce((s, e) => s + (e.type === 'withdrawal' ? -Number(e.amount) || 0 : Number(e.amount) || 0), 0)
    const rows = all
      .filter(e => {
        const d = e.date instanceof Date ? e.date : new Date(e.date)
        return d.getFullYear() === activeMonth.getFullYear() && d.getMonth() === activeMonth.getMonth()
      })
      .sort((a, b) => {
        const ad = a.date instanceof Date ? a.date : new Date(a.date)
        const bd = b.date instanceof Date ? b.date : new Date(b.date)
        return ad - bd
      })
    return { fund, balance, rows }
  })
  const totalSavings = fundStats.reduce((s, f) => s + f.balance, 0)

  function editRowsFromEntries(rows) {
    return rows.map(r => ({
      id: r.id,
      date: format(r.date instanceof Date ? r.date : new Date(r.date), 'dd.MM.yyyy'),
      item: r.item || '',
      reference: r.reference || '',
      amount: String(r.amount ?? ''),
      type: r.type === 'withdrawal' ? 'withdrawal' : 'deposit',
    }))
  }

  function handleUnlockEntry(fund, entry) {
    updateFundState(fund, (current) => (
      current.editRows.some(r => r.id === entry.id)
        ? current
        : { editRows: [...current.editRows, ...editRowsFromEntries([entry])] }
    ))
  }

  async function handleDelete(id) {
    const entry = entries.find(e => e.id === id)
    try {
      await deleteFinanceSavings(id)
      setDeletingId(null)
      setEntries(prev => prev.filter(e => e.id !== id))
      if (entry) {
        offerUndo({
          fund: entry.fund,
          type: entry.type,
          date: entry.date instanceof Date ? format(entry.date, 'yyyy-MM-dd') : format(new Date(entry.date), 'yyyy-MM-dd'),
          item: entry.item || '',
          reference: entry.reference || '',
          amount: Number(entry.amount) || 0,
        })
      }
    } catch {
      updateFundState(entry?.fund || '', () => ({ rowsError: 'Failed to delete. Please try again.' }))
    }
  }

  async function handleDeleteEditRow(fund, id) {
    await handleDelete(id)
    updateFundState(fund, (current) => ({ editRows: current.editRows.filter(r => r.id !== id) }))
  }

  function updateEditRowField(fund, idx, field, value) {
    updateFundState(fund, (current) => ({
      editRows: current.editRows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)),
    }))
  }

  function handleEditDateBlur(fund, idx, value) {
    const parsed = parseFlexibleDate(value)
    if (parsed) updateEditRowField(fund, idx, 'date', toDisplayDate(parsed))
  }

  function updateRowField(fund, idx, field, value) {
    updateFundState(fund, (current) => ({
      newRows: current.newRows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)),
    }))
  }

  function handleDateBlur(fund, idx, value) {
    const parsed = parseFlexibleDate(value)
    if (parsed) updateRowField(fund, idx, 'date', toDisplayDate(parsed))
  }

  function unlockRow(fund, idx) {
    updateFundState(fund, (current) => ({
      newRows: current.newRows.map((r, i) => (i === idx ? { ...r, unlocked: true } : r)),
    }))
  }

  function handleDeleteNewRow(fund, idx, savedId) {
    if (savedId) { handleDelete(savedId) }
    updateFundState(fund, (current) => ({
      newRows: ensureTrailingBlank(current.newRows.map((r, i) => (i === idx ? { ...BLANK_ROW, _key: newRowKey() } : r))),
    }))
  }

  function addMoreRows(fund, count = 1) {
    updateFundState(fund, (current) => ({ newRows: [...current.newRows, ...blankRows(count)], hideBlankRows: false }))
  }

  function handlePasteRow(e, fund, idx, field) {
    const text = e.clipboardData.getData('text')
    if (!text.includes('\t') && !text.includes('\n') && !text.includes('\r')) return
    e.preventDefault()
    const pastedRows = text.replace(/\r/g, '').split('\n').filter((line, i, arr) => !(i === arr.length - 1 && line === ''))
    const startFieldIdx = ROW_FIELDS.indexOf(field)
    updateFundState(fund, (current) => {
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

  function undoLastChange(fund) {
    updateFundState(fund, (current) => {
      if (!current.undoStack.length) return {}
      const prevRows = current.undoStack[current.undoStack.length - 1]
      return { newRows: prevRows, undoStack: current.undoStack.slice(0, -1) }
    })
  }

  useEffect(() => {
    if (expandedFunds.length === 0) return
    const fund = expandedFunds[0]
    function handleKeyDown(e) {
      const isUndo = (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z'
      if (!isUndo) return
      if (!getFundState(fund).undoStack.length) return
      e.preventDefault()
      undoLastChange(fund)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedFunds, fundEditState])

  if (!canAccess) return null

  // Saves every filled draft row AND every unlocked already-saved row in one action —
  // one Save button for the whole card, matching ExpensePage's current model.
  // Withdrawals are checked sequentially against a running projected balance
  // (starting from the fund's real current balance, minus whatever's being
  // edited right now) so two withdrawals in the same batch are validated
  // against each other, not just a stale pre-save snapshot.
  async function handleSaveRows(fund) {
    const fillable = getFundState(fund).newRows.filter(r => r.date || r.item || r.reference || r.amount)
    const editFillable = getFundState(fund).editRows
    if (!fillable.length && !editFillable.length) return

    updateFundState(fund, () => ({ savingRows: true, rowsError: '' }))

    const editIds = new Set(editFillable.map(r => r.id))
    let runningBalance = entries
      .filter(e => e.fund === fund && !editIds.has(e.id))
      .reduce((s, e) => s + (e.type === 'withdrawal' ? -Number(e.amount) || 0 : Number(e.amount) || 0), 0)

    let imported = 0, failed = 0, overdrawn = 0
    const editFailedIds = new Set()

    for (const row of fillable) {
      const date = parseFlexibleDate(row.date)
      const amount = parseFlexibleAmount(row.amount)
      if (!date || !amount || amount <= 0) { failed++; continue }
      const type = row.type === 'withdrawal' ? 'withdrawal' : 'deposit'
      const delta = type === 'withdrawal' ? -amount : amount
      if (type === 'withdrawal' && runningBalance + delta < 0) { overdrawn++; continue }
      const payload = { date, fund, type, item: row.item, reference: row.reference, amount }
      try {
        if (row.savedId) {
          await updateFinanceSavings(row.savedId, payload)
        } else {
          const id = await createFinanceSavings(payload)
          updateFundState(fund, (current) => ({
            newRows: current.newRows.map((r) => (r._key === row._key && !r.savedId ? { ...r, savedId: id } : r)),
          }))
        }
        runningBalance += delta
        imported++
      } catch { failed++ }
    }

    for (const row of editFillable) {
      const date = parseFlexibleDate(row.date)
      const amount = parseFlexibleAmount(row.amount)
      if (!date || !amount || amount <= 0) { failed++; editFailedIds.add(row.id); continue }
      const type = row.type === 'withdrawal' ? 'withdrawal' : 'deposit'
      const delta = type === 'withdrawal' ? -amount : amount
      if (type === 'withdrawal' && runningBalance + delta < 0) { overdrawn++; editFailedIds.add(row.id); continue }
      try {
        await updateFinanceSavings(row.id, { date, fund, type, item: row.item, reference: row.reference, amount })
        runningBalance += delta
        imported++
      } catch { failed++; editFailedIds.add(row.id) }
    }

    const errorParts = []
    if (failed > 0) errorParts.push(`${failed} skipped (need a valid date and amount)`)
    if (overdrawn > 0) errorParts.push(`${overdrawn} withdrawal${overdrawn === 1 ? '' : 's'} skipped (exceeds available balance)`)

    updateFundState(fund, (current) => ({
      savingRows: false,
      rowsError: errorParts.length ? `${imported} saved, ${errorParts.join(', ')}.` : '',
      hideBlankRows: true,
      newRows: ensureTrailingBlank(current.newRows),
      editRows: current.editRows.filter(r => editFailedIds.has(r.id)),
    }))

    if (failed === 0 && overdrawn === 0 && imported > 0) {
      setExpandedFunds([])
    }
  }

  return (
    <div className="space-y-5 pb-12">
      {loadError && <p className="text-sm font-medium text-red-600 text-center">{loadError}</p>}

      {/* Undo-delete toast */}
      {undoDelete && (
        <div className="flex items-center justify-between gap-3 bg-slate-800 text-white rounded-xl px-4 py-3">
          <p className="text-sm">
            Deleted {undoDelete.item || undoDelete.fund} · ₹{undoDelete.amount.toLocaleString('en-IN')}
          </p>
          <div className="flex items-center gap-3 shrink-0">
            <button type="button" onClick={handleUndoDelete} className="text-sm font-semibold text-indigo-300 hover:text-indigo-200">Undo</button>
            <button type="button" onClick={() => setUndoDelete(null)} className="text-slate-400 hover:text-slate-200 text-lg leading-none">×</button>
          </div>
        </div>
      )}

      {/* TOTAL SAVINGS — always all-time, independent of the month filter below */}
      <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-2xl border border-indigo-200 shadow-sm px-5 py-4 text-center">
        <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-500">Total Savings</p>
        <p className="text-3xl font-black text-indigo-700 mt-1">₹{totalSavings.toLocaleString('en-IN')}</p>
        <p className="text-[11px] text-indigo-400 mt-1">Current balance across all funds, all-time</p>
      </div>

      {/* Month filter — narrows which transactions are listed inside an expanded
          fund's table. It never changes a fund's balance. */}
      <div className="flex items-center justify-center gap-4 py-1">
        <button type="button" onClick={prevMonth} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition text-lg leading-none" aria-label="Previous month">‹</button>
        <span className="text-base font-semibold text-slate-800 w-36 text-center">{format(activeMonth, 'MMMM yyyy')}</span>
        <button type="button" onClick={nextMonth} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition text-lg leading-none" aria-label="Next month">›</button>
      </div>

      {loading ? (
        <div className="p-6 text-center text-slate-500 text-sm">Loading…</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-start">
          {fundStats.map(({ fund, balance, rows }) => {
            const isExpanded = expandedFunds.includes(fund)
            const { newRows, savingRows, rowsError, hideBlankRows, undoStack, editRows } = getFundState(fund)
            const visibleNewRows = newRows
              .map((r, _idx) => ({ ...r, _idx }))
              .filter((r, i, arr) => !hideBlankRows || !isRowBlank(r) || i === arr.length - 1)

            return (
              <div
                key={fund}
                ref={isExpanded ? expandedCardRef : null}
                className={`rounded-2xl border overflow-hidden transition-colors ${
                  isExpanded
                    ? 'border-indigo-400 ring-1 ring-indigo-300 col-span-2 sm:col-span-3 lg:col-span-2'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleExpand(fund)}
                  className={`w-full text-left p-3.5 transition-colors ${isExpanded ? 'bg-indigo-50' : 'hover:bg-indigo-50/40'}`}
                >
                  <p className="text-xs font-semibold text-slate-600 truncate">{fund}</p>
                  <p className="text-lg font-bold text-slate-900 mt-1">₹{balance.toLocaleString('en-IN')}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{rows.length} {rows.length === 1 ? 'entry' : 'entries'} this month</p>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-100 bg-white">
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
                            <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide border-b-2 border-indigo-100">Purpose</th>
                            <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide w-24 border-b-2 border-indigo-100">Reference</th>
                            <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide w-24 border-b-2 border-indigo-100">Type</th>
                            <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide text-right w-24 border-b-2 border-indigo-100">Amount</th>
                            <th className="px-3 py-2 border-b-2 border-indigo-100 w-16" />
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((entry, idx) => {
                            const editIdx = editRows.findIndex(r => r.id === entry.id)
                            const row = editIdx === -1 ? null : editRows[editIdx]

                            if (row) {
                              const editParsedDate = parseFlexibleDate(row.date)
                              const editInvalid = !editParsedDate || parseFlexibleAmount(row.amount) <= 0
                              return (
                                <tr
                                  key={row.id}
                                  className={editInvalid
                                    ? 'bg-red-50/80 border-2 border-red-400 text-red-900'
                                    : `border-b border-slate-100 ${idx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}`}
                                >
                                  <td className="px-3 py-2.5">
                                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${editInvalid ? 'bg-red-500 text-white' : 'bg-indigo-100 text-indigo-700'}`}>
                                      {editInvalid ? '!' : idx + 1}
                                    </span>
                                  </td>
                                  <td className="p-1">
                                    <input
                                      type="text"
                                      value={row.date}
                                      onChange={e => updateEditRowField(fund, editIdx, 'date', e.target.value)}
                                      onBlur={e => handleEditDateBlur(fund, editIdx, e.target.value)}
                                      className="w-full rounded-lg border border-slate-200 bg-white hover:border-indigo-300 focus:border-indigo-400 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 transition-colors"
                                    />
                                  </td>
                                  <td className="p-1">
                                    <input
                                      type="text"
                                      value={row.item}
                                      onChange={e => updateEditRowField(fund, editIdx, 'item', e.target.value)}
                                      className="w-full rounded-lg border border-slate-200 bg-white hover:border-indigo-300 focus:border-indigo-400 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 transition-colors"
                                    />
                                  </td>
                                  <td className="p-1">
                                    <input
                                      type="text"
                                      value={row.reference}
                                      onChange={e => updateEditRowField(fund, editIdx, 'reference', e.target.value)}
                                      className="w-full rounded-lg border border-slate-200 bg-white hover:border-amber-300 focus:border-amber-400 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 transition-colors"
                                    />
                                  </td>
                                  <td className="p-1">
                                    <TypeToggle value={row.type} onChange={(v) => updateEditRowField(fund, editIdx, 'type', v)} />
                                  </td>
                                  <td className="p-1">
                                    <input
                                      type="text"
                                      value={row.amount}
                                      onChange={e => updateEditRowField(fund, editIdx, 'amount', e.target.value)}
                                      className="w-full rounded-lg border border-slate-200 bg-white hover:border-rose-300 focus:border-rose-400 px-2 py-1.5 text-sm text-right font-medium text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-200 transition-colors"
                                    />
                                  </td>
                                  <td className="px-3 py-2.5 text-center">
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteEditRow(fund, row.id)}
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
                            const isWithdrawal = entry.type === 'withdrawal'
                            return (
                              <tr key={entry.id} className={`border-b border-slate-100 ${idx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}`}>
                                <td className="px-3 py-2.5">
                                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">{idx + 1}</span>
                                </td>
                                <td className="px-3 py-2.5 whitespace-nowrap font-medium text-slate-700">{format(entryDate, 'dd.MM.yyyy')}</td>
                                <td className="px-3 py-2.5 text-slate-700 truncate" title={entry.item || ''}>{entry.item || '—'}</td>
                                <td className="px-3 py-2.5">
                                  {entry.reference
                                    ? <span className="inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[11px] font-medium">{entry.reference}</span>
                                    : <span className="text-slate-300">—</span>}
                                </td>
                                <td className="px-3 py-2.5">
                                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${isWithdrawal ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                    {isWithdrawal ? 'Withdrawal' : 'Deposit'}
                                  </span>
                                </td>
                                <td className={`px-3 py-2.5 text-right font-bold ${isWithdrawal ? 'text-rose-600' : 'text-emerald-600'}`}>
                                  {isWithdrawal ? '−' : '+'}₹{Number(entry.amount).toLocaleString('en-IN')}
                                </td>
                                <td className="px-3 py-2.5 text-center">
                                  {deletingId === entry.id ? (
                                    <div className="flex items-center justify-center gap-1.5 text-[10px]">
                                      <button type="button" onClick={() => handleDelete(entry.id)} className="text-red-600 font-semibold hover:underline">Yes</button>
                                      <button type="button" onClick={() => setDeletingId(null)} className="text-slate-500 hover:underline">No</button>
                                    </div>
                                  ) : (
                                    <RowActionsMenu
                                      menuKey={`entered-${entry.id}`}
                                      openKey={openActionMenu}
                                      onOpen={setOpenActionMenu}
                                      onClose={() => setOpenActionMenu(null)}
                                      onEdit={() => handleUnlockEntry(fund, entry)}
                                      onDelete={() => setDeletingId(entry.id)}
                                    />
                                  )}
                                </td>
                              </tr>
                            )
                          })}

                          {/* Draft rows attach directly beneath — a faint emerald tint marks them
                              as open for typing or pasting, no separate header needed. */}
                          {visibleNewRows.map((row, seq) => {
                            const idx = row._idx
                            const slNumber = rows.length + seq + 1
                            const isLocked = row.savedId && !row.unlocked
                            const isFirstDraftRow = !isLocked && (seq === 0 || (visibleNewRows[seq - 1].savedId && !visibleNewRows[seq - 1].unlocked))
                            if (isLocked) {
                              const isWithdrawal = row.type === 'withdrawal'
                              return (
                                <tr key={row._key} className="bg-emerald-50/50 border-b border-emerald-100">
                                  <td className="px-3 py-2.5 text-center">
                                    <span title="Already saved" className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] font-bold bg-emerald-500">✓</span>
                                  </td>
                                  <td className="px-3 py-2.5 whitespace-nowrap font-medium text-slate-700">{row.date}</td>
                                  <td className="px-3 py-2.5 truncate text-slate-700" title={row.item}>{row.item || '—'}</td>
                                  <td className="px-3 py-2.5">
                                    {row.reference
                                      ? <span className="inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[11px] font-medium">{row.reference}</span>
                                      : <span className="text-slate-300">—</span>}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${isWithdrawal ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                      {isWithdrawal ? 'Withdrawal' : 'Deposit'}
                                    </span>
                                  </td>
                                  <td className={`px-3 py-2.5 text-right font-bold ${isWithdrawal ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    {isWithdrawal ? '−' : '+'}₹{parseFlexibleAmount(row.amount).toLocaleString('en-IN')}
                                  </td>
                                  <td className="px-3 py-2.5 text-center">
                                    {deletingId === row.savedId ? (
                                      <div className="flex items-center justify-center gap-1.5 text-[10px]">
                                        <button type="button" onClick={() => handleDeleteNewRow(fund, idx, row.savedId)} className="text-red-600 font-semibold hover:underline">Yes</button>
                                        <button type="button" onClick={() => setDeletingId(null)} className="text-slate-500 hover:underline">No</button>
                                      </div>
                                    ) : (
                                      <RowActionsMenu
                                        menuKey={`addnew-${fund}-${row.savedId}`}
                                        openKey={openActionMenu}
                                        onOpen={setOpenActionMenu}
                                        onClose={() => setOpenActionMenu(null)}
                                        onEdit={() => unlockRow(fund, idx)}
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
                                    onChange={e => updateRowField(fund, idx, 'date', e.target.value)}
                                    onPaste={e => handlePasteRow(e, fund, idx, 'date')}
                                    onBlur={e => handleDateBlur(fund, idx, e.target.value)}
                                    placeholder="dd.mm.yyyy"
                                    className="w-full rounded-lg border border-transparent bg-white/70 hover:border-emerald-300 focus:border-emerald-400 px-2 py-1.5 text-sm placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-200 transition-colors"
                                  />
                                </td>
                                <td className="p-1">
                                  <input
                                    type="text"
                                    value={row.item}
                                    onChange={e => updateRowField(fund, idx, 'item', e.target.value)}
                                    onPaste={e => handlePasteRow(e, fund, idx, 'item')}
                                    placeholder="Purpose"
                                    className="w-full rounded-lg border border-transparent bg-white/70 hover:border-emerald-300 focus:border-emerald-400 px-2 py-1.5 text-sm placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-200 transition-colors"
                                  />
                                </td>
                                <td className="p-1">
                                  <input
                                    type="text"
                                    value={row.reference}
                                    onChange={e => updateRowField(fund, idx, 'reference', e.target.value)}
                                    onPaste={e => handlePasteRow(e, fund, idx, 'reference')}
                                    placeholder="Ref #"
                                    className="w-full rounded-lg border border-transparent bg-white/70 hover:border-amber-300 focus:border-amber-400 px-2 py-1.5 text-sm placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-200 transition-colors"
                                  />
                                </td>
                                <td className="p-1">
                                  <TypeToggle value={row.type} onChange={(v) => updateRowField(fund, idx, 'type', v)} />
                                </td>
                                <td className="p-1">
                                  <input
                                    type="text"
                                    value={row.amount}
                                    onChange={e => updateRowField(fund, idx, 'amount', e.target.value)}
                                    onPaste={e => handlePasteRow(e, fund, idx, 'amount')}
                                    placeholder="0.00"
                                    className="w-full rounded-lg border border-transparent bg-white/70 hover:border-rose-300 focus:border-rose-400 px-2 py-1.5 text-sm text-right font-medium text-rose-600 placeholder:text-slate-300 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-rose-200 transition-colors"
                                  />
                                </td>
                                <td />
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {rowsError && <p className="px-3 py-1.5 text-xs font-medium text-red-600">{rowsError}</p>}
                    <div className="p-3 bg-gradient-to-r from-slate-50 to-indigo-50/50 border-t border-slate-100 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSaveRows(fund)}
                        disabled={savingRows}
                        className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm disabled:opacity-50 transition-colors"
                      >
                        {savingRows ? 'Saving…' : 'Save rows'}
                      </button>
                      <button
                        type="button"
                        onClick={() => addMoreRows(fund, 1)}
                        title="Add row"
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 text-base font-semibold hover:border-emerald-300 hover:text-emerald-700 transition-colors"
                      >
                        +
                      </button>
                      {undoStack.length > 0 && (
                        <button
                          type="button"
                          onClick={() => undoLastChange(fund)}
                          title="Undo last paste (Ctrl+Z)"
                          className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-500 text-xs font-medium hover:border-indigo-300 hover:text-indigo-700 transition-colors"
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
      )}
    </div>
  )
}
