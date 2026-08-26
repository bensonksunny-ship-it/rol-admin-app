import { useState, useEffect, useRef } from 'react'
import { format, startOfMonth } from 'date-fns'
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

// Every savings entry is a deposit — there's no withdrawal flow here, so
// createFinanceSavings always gets type: 'deposit' explicitly at save time
// (see handleSaveRows). All 3 funds share one unified table + form instead of
// separate per-fund tabs — each row picks its own fund via a "Fund Category"
// dropdown (see FundSelect below). There's no separate Purpose text field —
// the fund category is the entry's category, so nothing else names it.
const ROW_FIELDS = ['date', 'amount']
const BLANK_ROW = { date: '', amount: '', fund: SAVINGS_FUNDS[0] }

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
  return !r.savedId && !r.date && !r.amount
}

function ensureTrailingBlank(rows) {
  const last = rows[rows.length - 1]
  return last && isRowBlank(last) ? rows : [...rows, { ...BLANK_ROW, _key: newRowKey() }]
}

// Single shared draft/edit state for the whole unified table — no longer keyed
// per fund, since every fund's entries now live in one table together.
const DEFAULT_ENTRY_STATE = {
  newRows: blankRows(),
  savingRows: false,
  rowsError: '',
  hideBlankRows: false,
  undoStack: [],
  // Already-saved rows currently unlocked for inline editing — a subset, not
  // all-or-nothing. Saved by the same "Save rows" button as newRows.
  editRows: [],
}

function FundSelect({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full rounded-lg border border-slate-200 bg-white hover:border-indigo-300 focus:border-indigo-400 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 transition-colors"
    >
      {SAVINGS_FUNDS.map(f => <option key={f} value={f}>{f}</option>)}
    </select>
  )
}

// Month is passed down from ExpensePage rather than tracked here — the Expense
// tab already has its own month switcher above the department grid, so this
// section just follows that instead of showing a second, separate one.
export default function SavingsPage({ activeMonth = startOfMonth(new Date()) }) {
  const { userProfile, hasPermission, isFounder } = useAuth()
  const canAccess = canAccessAccountsEntry(userProfile, hasPermission, isFounder)

  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [undoDelete, setUndoDelete] = useState(null)
  const [entryState, setEntryState] = useState(DEFAULT_ENTRY_STATE)
  const [openActionMenu, setOpenActionMenu] = useState(null)

  function updateEntryState(updater) {
    setEntryState(current => ({ ...current, ...updater(current) }))
  }

  const unsubRef = useRef(null)
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
    if (!entryState.newRows.some(r => r.savedId)) return
    const liveIds = new Set(entries.map(e => e.id))
    if (!entryState.newRows.some(r => r.savedId && liveIds.has(r.savedId))) return
    updateEntryState(current => ({
      newRows: ensureTrailingBlank(current.newRows.filter(r => !(r.savedId && liveIds.has(r.savedId)))),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries])

  const monthRows = entries
    .filter(e => {
      const d = e.date instanceof Date ? e.date : new Date(e.date)
      return d.getFullYear() === activeMonth.getFullYear() && d.getMonth() === activeMonth.getMonth()
    })
    .sort((a, b) => {
      const ad = a.date instanceof Date ? a.date : new Date(a.date)
      const bd = b.date instanceof Date ? b.date : new Date(b.date)
      return ad - bd
    })

  function editRowsFromEntries(rows) {
    return rows.map(r => ({
      id: r.id,
      date: format(r.date instanceof Date ? r.date : new Date(r.date), 'dd.MM.yyyy'),
      amount: String(r.amount ?? ''),
      fund: SAVINGS_FUNDS.includes(r.fund) ? r.fund : SAVINGS_FUNDS[0],
    }))
  }

  function handleUnlockEntry(entry) {
    updateEntryState(current => (
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
          amount: Number(entry.amount) || 0,
        })
      }
    } catch {
      updateEntryState(() => ({ rowsError: 'Failed to delete. Please try again.' }))
    }
  }

  async function handleDeleteEditRow(id) {
    await handleDelete(id)
    updateEntryState(current => ({ editRows: current.editRows.filter(r => r.id !== id) }))
  }

  function updateEditRowField(idx, field, value) {
    updateEntryState(current => ({
      editRows: current.editRows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)),
    }))
  }

  function handleEditDateBlur(idx, value) {
    const parsed = parseFlexibleDate(value)
    if (parsed) updateEditRowField(idx, 'date', toDisplayDate(parsed))
  }

  function updateRowField(idx, field, value) {
    updateEntryState(current => ({
      newRows: current.newRows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)),
    }))
  }

  function handleDateBlur(idx, value) {
    const parsed = parseFlexibleDate(value)
    if (parsed) updateRowField(idx, 'date', toDisplayDate(parsed))
  }

  function unlockRow(idx) {
    updateEntryState(current => ({
      newRows: current.newRows.map((r, i) => (i === idx ? { ...r, unlocked: true } : r)),
    }))
  }

  function handleDeleteNewRow(idx, savedId) {
    if (savedId) { handleDelete(savedId) }
    updateEntryState(current => ({
      newRows: ensureTrailingBlank(current.newRows.map((r, i) => (i === idx ? { ...BLANK_ROW, _key: newRowKey() } : r))),
    }))
  }

  function addMoreRows(count = 1) {
    updateEntryState(current => ({ newRows: [...current.newRows, ...blankRows(count)], hideBlankRows: false }))
  }

  function handlePasteRow(e, idx, field) {
    const text = e.clipboardData.getData('text')
    if (!text.includes('\t') && !text.includes('\n') && !text.includes('\r')) return
    e.preventDefault()
    const pastedRows = text.replace(/\r/g, '').split('\n').filter((line, i, arr) => !(i === arr.length - 1 && line === ''))
    const startFieldIdx = ROW_FIELDS.indexOf(field)
    updateEntryState(current => {
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

  function undoLastChange() {
    updateEntryState(current => {
      if (!current.undoStack.length) return {}
      const prevRows = current.undoStack[current.undoStack.length - 1]
      return { newRows: prevRows, undoStack: current.undoStack.slice(0, -1) }
    })
  }

  useEffect(() => {
    function handleKeyDown(e) {
      const isUndo = (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z'
      if (!isUndo) return
      if (!entryState.undoStack.length) return
      e.preventDefault()
      undoLastChange()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryState])

  if (!canAccess) return null

  // Saves every filled draft row AND every unlocked already-saved row in one action —
  // one Save button for the whole table, matching ExpensePage's current model.
  // Every entry is a deposit — there's no withdrawal flow, so no running-balance/
  // overdrawn check is needed. Each row's own `fund` (set via its dropdown)
  // decides which fund the entry is written against.
  async function handleSaveRows() {
    const fillable = entryState.newRows.filter(r => r.date || r.amount)
    const editFillable = entryState.editRows
    if (!fillable.length && !editFillable.length) return

    updateEntryState(() => ({ savingRows: true, rowsError: '' }))

    let imported = 0, failed = 0
    const editFailedIds = new Set()

    for (const row of fillable) {
      const date = parseFlexibleDate(row.date)
      const amount = parseFlexibleAmount(row.amount)
      const fund = SAVINGS_FUNDS.includes(row.fund) ? row.fund : SAVINGS_FUNDS[0]
      if (!date || !amount || amount <= 0) { failed++; continue }
      const payload = { date, fund, type: 'deposit', amount }
      try {
        if (row.savedId) {
          await updateFinanceSavings(row.savedId, payload)
        } else {
          const id = await createFinanceSavings(payload)
          updateEntryState(current => ({
            newRows: current.newRows.map((r) => (r._key === row._key && !r.savedId ? { ...r, savedId: id } : r)),
          }))
        }
        imported++
      } catch { failed++ }
    }

    for (const row of editFillable) {
      const date = parseFlexibleDate(row.date)
      const amount = parseFlexibleAmount(row.amount)
      const fund = SAVINGS_FUNDS.includes(row.fund) ? row.fund : SAVINGS_FUNDS[0]
      if (!date || !amount || amount <= 0) { failed++; editFailedIds.add(row.id); continue }
      try {
        await updateFinanceSavings(row.id, { date, fund, type: 'deposit', amount })
        imported++
      } catch { failed++; editFailedIds.add(row.id) }
    }

    const errorParts = []
    if (failed > 0) errorParts.push(`${failed} skipped (need a valid date and amount)`)

    updateEntryState(current => ({
      savingRows: false,
      rowsError: errorParts.length ? `${imported} saved, ${errorParts.join(', ')}.` : '',
      hideBlankRows: true,
      newRows: ensureTrailingBlank(current.newRows),
      editRows: current.editRows.filter(r => editFailedIds.has(r.id)),
    }))
  }

  const { newRows, savingRows, rowsError, hideBlankRows, undoStack, editRows } = entryState
  const visibleNewRows = newRows
    .map((r, _idx) => ({ ...r, _idx }))
    .filter((r, i, arr) => !hideBlankRows || !isRowBlank(r) || i === arr.length - 1)

  return (
    <div>
      {loadError && <p className="text-sm font-medium text-red-600 text-center px-3 pt-2">{loadError}</p>}

      {/* Undo-delete toast */}
      {undoDelete && (
        <div className="flex items-center justify-between gap-3 bg-slate-800 text-white rounded-xl px-4 py-3 m-3">
          <p className="text-sm">
            Deleted {undoDelete.fund} entry · ₹{undoDelete.amount.toLocaleString('en-IN')}
          </p>
          <div className="flex items-center gap-3 shrink-0">
            <button type="button" onClick={handleUndoDelete} className="text-sm font-semibold text-indigo-300 hover:text-indigo-200">Undo</button>
            <button type="button" onClick={() => setUndoDelete(null)} className="text-slate-400 hover:text-slate-200 text-lg leading-none">×</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="p-6 text-center text-slate-500 text-sm">Loading…</div>
      ) : (
        <div>
          {monthRows.length > 0 && (
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
                  <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide border-b-2 border-indigo-100">Fund Category</th>
                  <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide text-right w-24 border-b-2 border-indigo-100">Amount</th>
                  <th className="px-3 py-2 border-b-2 border-indigo-100 w-16" />
                </tr>
              </thead>
              <tbody>
                {monthRows.map((entry, idx) => {
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
                            onChange={e => updateEditRowField(editIdx, 'date', e.target.value)}
                            onBlur={e => handleEditDateBlur(editIdx, e.target.value)}
                            className="w-full rounded-lg border border-slate-200 bg-white hover:border-indigo-300 focus:border-indigo-400 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 transition-colors"
                          />
                        </td>
                        <td className="p-1">
                          <FundSelect value={row.fund} onChange={(v) => updateEditRowField(editIdx, 'fund', v)} />
                        </td>
                        <td className="p-1">
                          <input
                            type="text"
                            value={row.amount}
                            onChange={e => updateEditRowField(editIdx, 'amount', e.target.value)}
                            className="w-full rounded-lg border border-slate-200 bg-white hover:border-emerald-300 focus:border-emerald-400 px-2 py-1.5 text-sm text-right font-medium text-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-200 transition-colors"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteEditRow(row.id)}
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
                  return (
                    <tr key={entry.id} className={`border-b border-slate-100 ${idx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}`}>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">{idx + 1}</span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap font-medium text-slate-700">{format(entryDate, 'dd.MM.yyyy')}</td>
                      <td className="px-3 py-2.5">
                        <span className="inline-block max-w-full truncate px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[11px] font-medium" title={entry.fund}>
                          {entry.fund}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-emerald-600">
                        +₹{Number(entry.amount).toLocaleString('en-IN')}
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
                            onEdit={() => handleUnlockEntry(entry)}
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
                  const slNumber = monthRows.length + seq + 1
                  const isLocked = row.savedId && !row.unlocked
                  const isFirstDraftRow = !isLocked && (seq === 0 || (visibleNewRows[seq - 1].savedId && !visibleNewRows[seq - 1].unlocked))
                  if (isLocked) {
                    return (
                      <tr key={row._key} className="bg-emerald-50/50 border-b border-emerald-100">
                        <td className="px-3 py-2.5 text-center">
                          <span title="Already saved" className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] font-bold bg-emerald-500">✓</span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap font-medium text-slate-700">{row.date}</td>
                        <td className="px-3 py-2.5">
                          <span className="inline-block max-w-full truncate px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[11px] font-medium" title={row.fund}>
                            {row.fund}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-emerald-600">
                          +₹{parseFlexibleAmount(row.amount).toLocaleString('en-IN')}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {deletingId === row.savedId ? (
                            <div className="flex items-center justify-center gap-1.5 text-[10px]">
                              <button type="button" onClick={() => handleDeleteNewRow(idx, row.savedId)} className="text-red-600 font-semibold hover:underline">Yes</button>
                              <button type="button" onClick={() => setDeletingId(null)} className="text-slate-500 hover:underline">No</button>
                            </div>
                          ) : (
                            <RowActionsMenu
                              menuKey={`addnew-${row.savedId}`}
                              openKey={openActionMenu}
                              onOpen={setOpenActionMenu}
                              onClose={() => setOpenActionMenu(null)}
                              onEdit={() => unlockRow(idx)}
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
                          onChange={e => updateRowField(idx, 'date', e.target.value)}
                          onPaste={e => handlePasteRow(e, idx, 'date')}
                          onBlur={e => handleDateBlur(idx, e.target.value)}
                          placeholder="dd.mm.yyyy"
                          className="w-full rounded-lg border border-transparent bg-white/70 hover:border-emerald-300 focus:border-emerald-400 px-2 py-1.5 text-sm placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-200 transition-colors"
                        />
                      </td>
                      <td className="p-1">
                        <FundSelect value={row.fund} onChange={(v) => updateRowField(idx, 'fund', v)} />
                      </td>
                      <td className="p-1">
                        <input
                          type="text"
                          value={row.amount}
                          onChange={e => updateRowField(idx, 'amount', e.target.value)}
                          onPaste={e => handlePasteRow(e, idx, 'amount')}
                          placeholder="0.00"
                          className="w-full rounded-lg border border-transparent bg-white/70 hover:border-emerald-300 focus:border-emerald-400 px-2 py-1.5 text-sm text-right font-medium text-emerald-600 placeholder:text-slate-300 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-emerald-200 transition-colors"
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
              onClick={handleSaveRows}
              disabled={savingRows}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm disabled:opacity-50 transition-colors"
            >
              {savingRows ? 'Saving…' : 'Save rows'}
            </button>
            <button
              type="button"
              onClick={() => addMoreRows(1)}
              title="Add row"
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 text-base font-semibold hover:border-emerald-300 hover:text-emerald-700 transition-colors"
            >
              +
            </button>
            {undoStack.length > 0 && (
              <button
                type="button"
                onClick={undoLastChange}
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
}
