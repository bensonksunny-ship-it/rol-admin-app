import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, ClipboardList, Hourglass, Pencil, Timer, X } from 'lucide-react'
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

// appearance-none strips the browser's native dropdown chevron — the plain-sheet look
// stays plain even while this cell is open, not just before it's clicked. It's still a
// real <select> underneath (click anywhere in the cell still opens the native picker).
function DepartmentCell({ value, onCommit }) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onCommit(e.target.value)}
      className="w-full h-full min-h-[40px] px-3 py-2.5 text-sm bg-transparent appearance-none text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-300 cursor-pointer"
    >
      <option value="">—</option>
      {DEPARTMENT_LIST.map((d) => (
        <option key={d.slug} value={d.name}>{displayDeptName(d.name)}</option>
      ))}
    </select>
  )
}

function EditableCell({ value, type, onCommit, placeholder, autoEdit, onAutoEditHandled, autoFillToday, success, onEnterCommit }) {
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
        if (e.key === 'Enter') { onEnterCommit?.(); e.currentTarget.blur() }
        if (e.key === 'Escape') { setDraft(value || ''); setEditing(false) }
      }}
      className="w-full h-full min-h-[40px] px-3 py-2.5 text-sm border-2 border-indigo-400 focus:outline-none bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
    />
  )
}

// A truly blank cell in an untouched row — no placeholder text, no dash, no visible
// chrome, just a click target — so 30 empty rows read as a plain sheet, not a wall of
// "Add task…" / "—" / dropdown-arrow clutter. Clicking it hands the whole row over to
// the normal interactive cells (EditableCell/DepartmentCell) via onStart.
function IdleCell({ onStart }) {
  return (
    <button
      type="button"
      onClick={onStart}
      onFocus={onStart}
      aria-label="Add entry"
      className="w-full h-full min-h-[40px] block hover:bg-indigo-50/40 dark:hover:bg-indigo-500/5 transition-colors"
    />
  )
}

// A committed (Enter-locked) row's Date/Work/Department render as flat text, no input
// or select chrome at all — read-only until the row's pencil icon reopens it. Bolder,
// darker text than the default cell color gives a saved entry a settled, "done" look
// (paired with the row's own background tint, applied where this is used).
function LockedCell({ children }) {
  return (
    <div className="w-full h-full min-h-[40px] px-3 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
      {children}
    </div>
  )
}

// Shared by the Duration column and the Workhub's Avg. completion / Oldest open stats,
// so all three use one bucketing scheme ("Same day", "1 day", "Nd", "Nw", "Nmo", "Ny").
function formatDaysLabel(days) {
  if (days <= 0) return 'Same day'
  if (days === 1) return '1 day'
  if (days < 7) return `${days} days`
  if (days < 30) return `${Math.floor(days / 7)}w`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  return `${Math.floor(days / 365)}y`
}

function daysBetween(startDateStr, endDateStr) {
  if (!startDateStr || !endDateStr) return null
  const start = new Date(`${startDateStr}T00:00:00`)
  const end = new Date(`${endDateStr}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  return (end.getTime() - start.getTime()) / 86400000
}

// Compact span label for the read-only Duration column: how long a task took from its
// entry Date to its Completed date (not "time since completion" — needs both ends set).
function formatDuration(startDateStr, endDateStr) {
  const days = daysBetween(startDateStr, endDateStr)
  return days == null ? null : formatDaysLabel(Math.round(days))
}

// Matches the app's existing KPI-tile convention (see KpiTile in
// DLightDirectorDashboard.jsx): big bold value, small uppercase label above, muted
// caption below — not a compact icon-badge pill, which read as too small/cramped here.
function StatCard({ icon, label, value, sub, tone }) {
  const Icon = icon
  const valueColor = tone === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-100'

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 min-w-0">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon size={14} className="text-slate-400 dark:text-slate-500 flex-shrink-0" />
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 truncate">{label}</p>
      </div>
      <p className={`text-3xl font-extrabold leading-none truncate ${valueColor}`} title={typeof value === 'string' ? value : undefined}>
        {value}
      </p>
      {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 truncate" title={sub}>{sub}</p>}
    </div>
  )
}

// At-a-glance stats for the active sheet only (see design spec: aggregating across
// sheets would mix already-worked-through pages with the current one, and the numbers
// would shift every time a new page auto-appears). Purely derived from sheet.rows —
// no new Firestore reads, recomputed on every render.
function WorkHub({ sheet }) {
  const rows = Array.isArray(sheet?.rows) ? sheet.rows : []
  const assignedRows = rows.filter((row) => (row.work || '').trim().length > 0)
  const completedRows = rows.filter((row) => (row.doneDate || '').trim().length > 0)

  const completionSpans = rows
    .map((row) => daysBetween(row.date, row.doneDate))
    .filter((days) => days != null)
  const avgCompletionLabel = completionSpans.length > 0
    ? formatDaysLabel(Math.round(completionSpans.reduce((sum, d) => sum + d, 0) / completionSpans.length))
    : '—'

  const todayStr = new Date().toISOString().slice(0, 10)
  const oldestOpen = assignedRows
    .filter((row) => !(row.doneDate || '').trim() && row.date)
    .reduce((oldest, row) => {
      const elapsed = daysBetween(row.date, todayStr)
      if (elapsed == null) return oldest
      return (!oldest || elapsed > oldest.elapsed) ? { elapsed, work: row.work } : oldest
    }, null)
  const oldestOpenValue = oldestOpen ? formatDaysLabel(Math.round(oldestOpen.elapsed)) : 'None'
  const oldestOpenSub = oldestOpen
    ? (oldestOpen.work.length > 28 ? `${oldestOpen.work.slice(0, 28)}…` : oldestOpen.work)
    : 'Nothing open yet'

  const completedPct = assignedRows.length > 0 ? Math.round((completedRows.length / assignedRows.length) * 100) : 0

  const deptCounts = new Map()
  assignedRows.forEach((row) => {
    const dept = (row.department || '').trim()
    if (!dept) return
    deptCounts.set(dept, (deptCounts.get(dept) || 0) + 1)
  })
  const deptEntries = [...deptCounts.entries()].sort((a, b) => b[1] - a[1])

  return (
    <div className="mb-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={ClipboardList}
          label="Assigned"
          value={assignedRows.length}
          sub={`of ${rows.length} rows`}
        />
        <StatCard
          icon={CheckCircle2}
          label="Completed"
          value={completedRows.length}
          sub={assignedRows.length > 0 ? `${completedPct}% of assigned` : 'None yet'}
          tone="success"
        />
        <StatCard
          icon={Timer}
          label="Avg. completion"
          value={avgCompletionLabel}
          sub="entry → completed"
        />
        <StatCard
          icon={Hourglass}
          label="Oldest open"
          value={oldestOpenValue}
          sub={oldestOpenSub}
        />
      </div>
      {deptEntries.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">By department</p>
          <div className="flex flex-wrap gap-2">
            {deptEntries.map(([dept, count]) => (
              <span
                key={dept}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"
              >
                {displayDeptName(dept)} <span className="text-slate-400 dark:text-slate-500">{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function WorklistTable({ sheetId, sheet }) {
  const rows = Array.isArray(sheet.rows) ? sheet.rows : null
  const [pendingFocusRowIndex, setPendingFocusRowIndex] = useState(null)
  // Rows currently open for editing — either a blank row just clicked into, or a
  // filled ("locked") row reopened via its pencil icon. A row with Work filled in
  // and NOT in this set renders read-only/plain; empty rows not in this set render
  // as blank IdleCells. Pressing Enter in the Work field removes the row from here,
  // handing it back to the filled-work-therefore-locked rule.
  const [composingRows, setComposingRows] = useState(() => new Set())
  const rowRefs = useRef([])

  useEffect(() => {
    if (pendingFocusRowIndex == null) return
    rowRefs.current[pendingFocusRowIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [pendingFocusRowIndex])

  const startComposing = (rowIndex) => {
    setComposingRows((prev) => new Set(prev).add(rowIndex))
    setPendingFocusRowIndex(rowIndex)
  }

  const stopComposing = (rowIndex) => {
    setComposingRows((prev) => {
      if (!prev.has(rowIndex)) return prev
      const next = new Set(prev)
      next.delete(rowIndex)
      return next
    })
  }

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

  // Only ever show ONE blank row (the earliest unfilled slot) — not all 30 up front.
  // It's pinned first so there's always a ready "add new work" row at the top; every
  // already-filled row renders below it, in original slot order. Filling the entry row
  // (Enter, or clicking away) makes the *next* slot the new entryRowIndex on the next
  // render, so a fresh blank row appears automatically — the just-filled row falls in
  // among "all the works" below since it's no longer index === entryRowIndex.
  const entryRowIndex = rows.findIndex((row) => !(row.work || '').trim())
  const filledEntries = rows
    .map((row, rowIndex) => ({ row, rowIndex }))
    .filter(({ row, rowIndex }) => rowIndex !== entryRowIndex && (row.work || '').trim())
  const visibleRows = entryRowIndex === -1
    ? filledEntries
    : [{ row: rows[entryRowIndex], rowIndex: entryRowIndex }, ...filledEntries]

  return (
    <div className="rounded-b-xl rounded-tr-xl border border-t-0 border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
      <div className="flex items-center px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
        <p className="text-xs font-medium text-slate-400 dark:text-slate-500">{filledCount} / {rows.length} tasks</p>
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
              <th className="w-32 px-3 py-3 text-left font-bold uppercase tracking-wider text-[11px]">Date</th>
              <th className="w-64 px-3 py-3 text-left font-bold uppercase tracking-wider text-[11px]">Work</th>
              <th className="w-48 px-3 py-3 text-left font-bold uppercase tracking-wider text-[11px]">Department</th>
              <th className="w-32 px-3 py-3 text-left font-bold uppercase tracking-wider text-[11px] text-emerald-600 dark:text-emerald-400">Completed</th>
              <th className="w-20 px-3 py-3 text-left font-bold uppercase tracking-wider text-[11px]">Duration</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ row, rowIndex }, displayIndex) => {
              const filled = Boolean((row.work || '').trim())
              const composing = composingRows.has(rowIndex)
              const locked = filled && !composing
              const idle = !filled && !composing

              return (
                <tr
                  key={row.no}
                  ref={(el) => { rowRefs.current[rowIndex] = el }}
                  // Clicking (or tabbing) away from a composing row also commits it to
                  // view-only — not just pressing Enter. React delegates focus/blur so
                  // this fires for any cell inside the row losing focus; relatedTarget
                  // tells us whether focus landed somewhere else in the SAME row (still
                  // editing it) or genuinely left it (done editing, lock it).
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget)) stopComposing(rowIndex)
                  }}
                  className={`border-t border-slate-100 dark:border-slate-800 transition-colors hover:bg-indigo-50/50 dark:hover:bg-indigo-500/5 ${
                    locked
                      ? 'bg-indigo-50/50 dark:bg-indigo-500/[0.06]'
                      : displayIndex % 2 === 1 ? 'bg-slate-50/60 dark:bg-slate-800/30' : 'bg-white dark:bg-slate-900'
                  }`}
                >
                  {/* No vertical column-divider lines anywhere, in any row state — rows
                      are separated only by the horizontal border-t below, so the sheet
                      never reads as a ruled/gridded table, whether a row is blank, being
                      composed, or locked. */}
                  <td className="px-3 py-2.5 text-slate-400 dark:text-slate-500 font-mono text-xs">{row.no}</td>
                  <td>
                    {idle ? (
                      <IdleCell onStart={() => startComposing(rowIndex)} />
                    ) : locked ? (
                      <LockedCell>{row.date || '—'}</LockedCell>
                    ) : (
                      <EditableCell
                        type="date"
                        value={row.date}
                        placeholder="—"
                        autoFillToday
                        onCommit={(v) => updateWorklistCell(sheetId, rows, rowIndex, 'date', v)}
                      />
                    )}
                  </td>
                  <td>
                    {idle ? (
                      <IdleCell onStart={() => startComposing(rowIndex)} />
                    ) : locked ? (
                      <LockedCell>{row.work}</LockedCell>
                    ) : (
                      <EditableCell
                        type="text"
                        value={row.work}
                        placeholder="Add task…"
                        autoEdit={pendingFocusRowIndex === rowIndex}
                        onAutoEditHandled={() => setPendingFocusRowIndex(null)}
                        onEnterCommit={() => stopComposing(rowIndex)}
                        onCommit={(v) => updateWorklistWork(sheetId, rows, rowIndex, v, Boolean(row.date))}
                      />
                    )}
                  </td>
                  <td>
                    {idle ? (
                      <IdleCell onStart={() => startComposing(rowIndex)} />
                    ) : locked ? (
                      <LockedCell>{row.department ? displayDeptName(row.department) : '—'}</LockedCell>
                    ) : (
                      <DepartmentCell
                        value={row.department}
                        onCommit={(v) => updateWorklistCell(sheetId, rows, rowIndex, 'department', v)}
                      />
                    )}
                  </td>
                  <td>
                    {/* Completed stays independently clickable once a row has a task
                        (composing or locked) — marking it done later shouldn't require
                        reopening the row first — but a truly blank row has nothing to
                        mark complete yet, so it gets the same plain IdleCell treatment. */}
                    {idle ? (
                      <IdleCell onStart={() => startComposing(rowIndex)} />
                    ) : (
                      <EditableCell
                        type="date"
                        value={row.doneDate}
                        placeholder="—"
                        autoFillToday
                        success
                        onCommit={(v) => updateWorklistCell(sheetId, rows, rowIndex, 'doneDate', v)}
                      />
                    )}
                  </td>
                  <td
                    className="px-3 py-2.5 text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap"
                    title="Time from entry Date to Completed date"
                  >
                    {idle ? '' : (formatDuration(row.date, row.doneDate) || '—')}
                  </td>
                  <td className="px-2 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {locked && (
                        <button
                          type="button"
                          title="Edit row"
                          onClick={() => startComposing(rowIndex)}
                          className="text-slate-300 hover:text-indigo-500 dark:text-slate-600 dark:hover:text-indigo-400"
                        >
                          <Pencil size={12} />
                        </button>
                      )}
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
                    </div>
                  </td>
                </tr>
              )
            })}
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
          <WorkHub sheet={activeSheet} />

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
          </div>

          <WorklistTable sheetId={activeSheet.id} sheet={activeSheet} />
        </>
      )}
    </div>
  )
}
