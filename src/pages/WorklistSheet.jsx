import { useEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { DEPARTMENT_LIST, displayDeptName } from '../constants/departments'
import {
  subscribeWorklistSheets,
  createWorklistSheet,
  updateWorklistCell,
  updateWorklistWork,
  clearWorklistRow,
  deleteWorklistSheet,
  resetWorklistSheetRows,
  WORKLIST_ROWS_PER_SHEET,
} from '../services/firestore'

function DepartmentCell({ value, onCommit }) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onCommit(e.target.value)}
      className="w-full h-full min-h-[40px] px-2.5 py-2.5 text-sm bg-transparent text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-300 cursor-pointer"
    >
      <option value="">—</option>
      {DEPARTMENT_LIST.map((d) => (
        <option key={d.slug} value={d.name}>{displayDeptName(d.name)}</option>
      ))}
    </select>
  )
}

function EditableCell({ value, type, onCommit, placeholder, autoEdit, onAutoEditHandled, autoFillToday, success }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')

  useEffect(() => { setDraft(value || '') }, [value])

  // Entering edit mode with a value already in hand (an explicit click/focus, or the
  // auto-edit trigger below) — for fields like Completed, default an empty cell to
  // today instead of blank, since "today" is what gets picked almost every time and
  // the user can still change it before it saves. Not applied to already-filled cells.
  const startEditing = () => {
    if (autoFillToday && !value) setDraft(new Date().toISOString().slice(0, 10))
    setEditing(true)
  }

  // Lets an external "+ Add Work" trigger drop this cell straight into edit mode
  // (used to jump to the next empty row) without the cell needing to know why.
  useEffect(() => {
    if (!autoEdit) return
    startEditing()
    onAutoEditHandled?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit])

  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEditing}
        onFocus={startEditing}
        className={`w-full h-full min-h-[40px] text-left px-3 py-2.5 text-sm hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:ring-1 hover:ring-inset hover:ring-indigo-200 dark:hover:ring-indigo-500/30 truncate transition-colors ${
          success && value
            ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
            : 'text-slate-700 dark:text-slate-200'
        }`}
        title={value || placeholder}
      >
        {value || <span className="text-slate-300 dark:text-slate-600 italic">{placeholder}</span>}
      </button>
    )
  }

  return (
    <input
      autoFocus
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); if (draft !== (value || '')) onCommit(draft) }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') { setDraft(value || ''); setEditing(false) }
      }}
      className="w-full h-full min-h-[40px] px-3 py-2.5 text-sm border-2 border-indigo-400 focus:outline-none bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
    />
  )
}

// Compact span label for the read-only Duration column: how long a task took from its
// entry Date to its Completed date (not "time since completion" — needs both ends set).
function formatDuration(startDateStr, endDateStr) {
  if (!startDateStr || !endDateStr) return null
  const start = new Date(`${startDateStr}T00:00:00`)
  const end = new Date(`${endDateStr}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  const days = Math.round((end.getTime() - start.getTime()) / 86400000)
  if (days <= 0) return 'Same day'
  if (days === 1) return '1 day'
  if (days < 7) return `${days} days`
  if (days < 30) return `${Math.floor(days / 7)}w`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  return `${Math.floor(days / 365)}y`
}

function WorklistTable({ sheetId, sheet }) {
  const rows = Array.isArray(sheet.rows) ? sheet.rows : null
  const [pendingFocusRowIndex, setPendingFocusRowIndex] = useState(null)
  const rowRefs = useRef([])

  useEffect(() => {
    if (pendingFocusRowIndex == null) return
    rowRefs.current[pendingFocusRowIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [pendingFocusRowIndex])

  if (!rows) {
    return (
      <div className="rounded-b-xl rounded-tr-xl border border-t-0 border-rose-200 bg-rose-50 dark:bg-rose-500/10 dark:border-rose-500/30 p-8 text-center">
        <p className="text-sm text-rose-700 dark:text-rose-300 mb-3">
          This sheet's data looks corrupted and can't be displayed.
        </p>
        <button
          type="button"
          onClick={() => resetWorklistSheetRows(sheetId)}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white bg-rose-500 hover:bg-rose-600"
        >
          Reset this sheet
        </button>
      </div>
    )
  }

  const filledCount = rows.filter((row) => (row.work || '').trim().length > 0).length
  const nextEmptyRowIndex = rows.findIndex((row) => !(row.work || '').trim())

  const handleAddWork = () => {
    if (nextEmptyRowIndex === -1) return
    setPendingFocusRowIndex(nextEmptyRowIndex)
  }

  return (
    <div className="rounded-b-xl rounded-tr-xl border border-t-0 border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
        <p className="text-xs font-medium text-slate-400 dark:text-slate-500">{filledCount} / {rows.length} tasks</p>
        <button
          type="button"
          onClick={handleAddWork}
          disabled={nextEmptyRowIndex === -1}
          title="Add a new work entry"
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-indigo-500 to-blue-500 shadow-sm hover:shadow disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          <Plus size={13} /> Add Work
        </button>
      </div>
      <div className="overflow-x-auto">
        {/* table-fixed + an explicit width on every column (including Work) makes the
            layout deterministic — with the default auto layout, Work (the only column
            that had no width) silently absorbed all left-over space and squeezed
            Department into ellipsis-truncated text. */}
        <table className="w-full min-w-[900px] table-fixed border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border-b-2 border-slate-200 dark:border-slate-700">
              <th className="w-12 px-3 py-3 text-left font-bold uppercase tracking-wider text-[11px]">No</th>
              <th className="w-32 px-3 py-3 text-left font-bold uppercase tracking-wider text-[11px] border-l border-slate-200/70 dark:border-slate-700/70">Date</th>
              <th className="w-64 px-3 py-3 text-left font-bold uppercase tracking-wider text-[11px] border-l border-slate-200/70 dark:border-slate-700/70">Work</th>
              <th className="w-48 px-3 py-3 text-left font-bold uppercase tracking-wider text-[11px] border-l border-slate-200/70 dark:border-slate-700/70">Department</th>
              <th className="w-32 px-3 py-3 text-left font-bold uppercase tracking-wider text-[11px] border-l border-slate-200/70 dark:border-slate-700/70 text-emerald-600 dark:text-emerald-400">Completed</th>
              <th className="w-20 px-3 py-3 text-left font-bold uppercase tracking-wider text-[11px] border-l border-slate-200/70 dark:border-slate-700/70">Duration</th>
              <th className="w-10 border-l border-slate-200/70 dark:border-slate-700/70" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                key={row.no}
                ref={(el) => { rowRefs.current[rowIndex] = el }}
                className={`border-t border-slate-100 dark:border-slate-800 transition-colors hover:bg-indigo-50/50 dark:hover:bg-indigo-500/5 ${
                  rowIndex % 2 === 1 ? 'bg-slate-50/60 dark:bg-slate-800/30' : 'bg-white dark:bg-slate-900'
                }`}
              >
                <td className="px-3 py-2.5 text-slate-400 dark:text-slate-500 font-mono text-xs">{row.no}</td>
                <td className="border-l border-slate-100 dark:border-slate-800">
                  <EditableCell
                    type="date"
                    value={row.date}
                    placeholder="—"
                    onCommit={(v) => updateWorklistCell(sheetId, rows, rowIndex, 'date', v)}
                  />
                </td>
                <td className="border-l border-slate-100 dark:border-slate-800">
                  <EditableCell
                    type="text"
                    value={row.work}
                    placeholder="Add task…"
                    autoEdit={pendingFocusRowIndex === rowIndex}
                    onAutoEditHandled={() => setPendingFocusRowIndex(null)}
                    onCommit={(v) => updateWorklistWork(sheetId, rows, rowIndex, v, Boolean(row.date))}
                  />
                </td>
                <td className="border-l border-slate-100 dark:border-slate-800">
                  <DepartmentCell
                    value={row.department}
                    onCommit={(v) => updateWorklistCell(sheetId, rows, rowIndex, 'department', v)}
                  />
                </td>
                <td className="border-l border-slate-100 dark:border-slate-800">
                  <EditableCell
                    type="date"
                    value={row.doneDate}
                    placeholder="—"
                    autoFillToday
                    success
                    onCommit={(v) => updateWorklistCell(sheetId, rows, rowIndex, 'doneDate', v)}
                  />
                </td>
                <td
                  className="px-3 py-2.5 text-xs text-slate-400 dark:text-slate-500 border-l border-slate-100 dark:border-slate-800 whitespace-nowrap"
                  title="Time from entry Date to Completed date"
                >
                  {formatDuration(row.date, row.doneDate) || '—'}
                </td>
                <td className="px-2 text-center border-l border-slate-100 dark:border-slate-800">
                  {(row.date || row.work || row.doneDate || row.department) && (
                    <button
                      type="button"
                      title="Clear row"
                      onClick={() => clearWorklistRow(sheetId, rows, rowIndex)}
                      className="text-slate-300 hover:text-rose-500 dark:text-slate-600 dark:hover:text-rose-400"
                    >
                      <X size={12} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Styled like browser/spreadsheet tabs: the active tab merges into the table panel below
// it (matching background, -mb-px pulled over the shared border line, no bottom border)
// while inactive tabs sit recessed in a muted strip above that line.
function SheetTab({ sheet, active, onSelect, onDelete }) {
  const [armed, setArmed] = useState(false)

  return (
    <div
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={`group relative flex items-center gap-2 px-4 py-2.5 text-sm font-semibold cursor-pointer rounded-t-lg border border-b-0 select-none transition-colors ${
        active
          ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 -mb-px z-10'
          : 'bg-slate-100/80 dark:bg-slate-800/60 border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-700/60 hover:text-slate-700 dark:hover:text-slate-200'
      }`}
    >
      {active && (
        <span className="absolute inset-x-0 -top-px h-0.5 rounded-t-lg bg-gradient-to-r from-indigo-500 to-blue-500" />
      )}
      {sheet.label}
      <button
        type="button"
        title={armed ? 'Click again to delete' : 'Delete sheet'}
        onClick={(e) => {
          e.stopPropagation()
          if (armed) { onDelete(); setArmed(false) }
          else { setArmed(true); setTimeout(() => setArmed(false), 3000) }
        }}
        className={`rounded-full p-0.5 opacity-50 group-hover:opacity-100 transition-opacity ${
          armed ? 'opacity-100 bg-rose-500 text-white' : 'text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10'
        }`}
      >
        <X size={12} />
      </button>
    </div>
  )
}

// A row counts as "filled" once it has a Work entry — Date/Completed are secondary.
function isSheetFull(sheet) {
  return Array.isArray(sheet.rows)
    && sheet.rows.length >= WORKLIST_ROWS_PER_SHEET
    && sheet.rows.every((row) => (row.work || '').trim().length > 0)
}

export default function WorklistSheet() {
  const { isFounder } = useAuth()
  const [sheets, setSheets] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState(null)
  const autoCreatingRef = useRef(false)

  useEffect(() => {
    if (!isFounder) return
    const unsub = subscribeWorklistSheets((list) => {
      setSheets(list)
      setLoading(false)
      setActiveId((prev) => (prev && list.some((s) => s.id === prev)) ? prev : (list[0]?.id || null))
    })
    return unsub
  }, [isFounder])

  // Pages also fill automatically, on top of the manual "+ New Sheet" button below: the
  // very first sheet, and the next sheet once the current last one fills up, are created
  // here so the Founder never has to stop and click just to keep typing.
  useEffect(() => {
    if (!isFounder || loading || autoCreatingRef.current) return

    if (sheets.length === 0) {
      autoCreatingRef.current = true
      createWorklistSheet(1, 'Sheet 1')
        .then(setActiveId)
        .finally(() => { autoCreatingRef.current = false })
      return
    }

    const last = sheets[sheets.length - 1]
    if (isSheetFull(last)) {
      autoCreatingRef.current = true
      const nextOrder = (last.order || 0) + 1
      createWorklistSheet(nextOrder, `Sheet ${nextOrder}`)
        .then(setActiveId)
        .finally(() => { autoCreatingRef.current = false })
    }
  }, [sheets, loading, isFounder])

  if (!isFounder) {
    return (
      <div className="p-6 text-slate-600">
        <p className="font-semibold text-slate-800 mb-2">Worklist Sheet</p>
        <p>Only Founder can access this page.</p>
      </div>
    )
  }

  const activeSheet = sheets.find((s) => s.id === activeId) || null

  const handleAddSheet = async () => {
    const nextOrder = (sheets.reduce((max, s) => Math.max(max, s.order || 0), 0)) + 1
    const id = await createWorklistSheet(nextOrder, `Sheet ${nextOrder}`)
    setActiveId(id)
  }

  const handleDeleteSheet = (sheetId) => {
    deleteWorklistSheet(sheetId)
  }

  return (
    <div className="w-full">
      <div className="mb-5">
        <h1 className="text-xl font-black text-slate-800 dark:text-slate-100">Worklist Sheet</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Personal task tracker</p>
      </div>

      {loading || !activeSheet ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <>
          <div role="tablist" className="flex items-end gap-1 px-1 overflow-x-auto">
            {sheets.map((sheet) => (
              <SheetTab
                key={sheet.id}
                sheet={sheet}
                active={sheet.id === activeId}
                onSelect={() => setActiveId(sheet.id)}
                onDelete={() => handleDeleteSheet(sheet.id)}
              />
            ))}
            <button
              type="button"
              onClick={handleAddSheet}
              title="New sheet"
              className="mb-1.5 ml-1 flex items-center gap-1 flex-shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-indigo-600 dark:text-indigo-400 border border-dashed border-indigo-300 dark:border-indigo-500/40 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
            >
              <Plus size={14} /> New Sheet
            </button>
          </div>

          <WorklistTable sheetId={activeSheet.id} sheet={activeSheet} />
        </>
      )}
    </div>
  )
}
