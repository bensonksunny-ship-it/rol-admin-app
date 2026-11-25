import { Fragment, useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { Plus, Trash2 } from 'lucide-react'
import { ACCENT_STYLES, matchesCategory, toDate } from './incomeCategorize'
import { GridCell, SaveStatus } from './gridKit'
import { cellOps, mergeOps, handleGridKeyDown, readGridPaste, parseCellDate, parseCellAmount, alignPastedDate, looksLikeDateCell, isoInMonth, isoToDisplay, fmtAmount } from './gridUtils'
import ConfirmPasteDatesDialog from './ConfirmPasteDatesDialog'

const styles = ACCENT_STYLES.emerald

const ALL_COLUMNS = [
  { key: 'English Offering', label: 'English' },
  { key: 'Tamil Offering', label: 'Tamil' },
  { key: 'Online Offering', label: 'Online' },
]

function sundaysInMonth(monthDate) {
  const isos = []
  const d = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  while (d.getMonth() === monthDate.getMonth()) {
    if (d.getDay() === 0) isos.push(format(d, 'yyyy-MM-dd'))
    d.setDate(d.getDate() + 1)
  }
  return isos
}

// Offering as a flat Date × English / Tamil / Online grid (or a subset of those
// columns via columnKeys — the Offering popup shows Cash and Online side by side) — one row per date
// (every Sunday of the month, plus any other date that has offerings). Every
// cell is editable in place and saves when left (IncomePage.applyOps).
// Roomy cells: the table opens in a full-page popup with space to spare.
const CELL_PAD = 'px-4 py-3'

// Cash counts plug in through: headerAction (header link), rowIsos (extra dates to
// list), dateMark(iso) (beside the date), rowNote(iso) (line under the row) and
// cellHint(iso, category) (placeholder of an empty cell).
export default function OfferingMatrixTable({ entries, activeMonth, saveState, onApply, onPastePlan, onError, onLiveDelta, columnKeys, title = 'Offering', headerAction, rowIsos = [], dateMark, rowNote, cellHint }) {
  const COLUMNS = columnKeys ? ALL_COLUMNS.filter(c => columnKeys.includes(c.key)) : ALL_COLUMNS
  // [{ key, iso, pending }] — "Add row" rows; kept at the end this session. `pending`
  // ({ [category]: amount }) holds amounts typed before the row has a date; they
  // save as soon as the date is entered.
  const [extras, setExtras] = useState([])
  const [live, setLiveState] = useState(null) // { iso, category, amount } — the cell being typed in
  const [confirm, setConfirm] = useState(null) // { lines, invalid } — paste waiting in ConfirmPasteDatesDialog
  const focusReq = useRef(null) // { r, c } to focus once the new row has rendered
  const nextRowId = useRef(0)
  const gridRef = useRef(null)

  const byDate = new Map()
  for (const entry of entries) {
    const iso = format(toDate(entry.date), 'yyyy-MM-dd')
    if (!byDate.has(iso)) byDate.set(iso, [])
    byDate.get(iso).push(entry)
  }
  const extraIsos = new Set(extras.map(x => x.iso).filter(Boolean))
  const baseIsos = [...new Set([...sundaysInMonth(activeMonth), ...byDate.keys(), ...rowIsos])].filter(iso => !extraIsos.has(iso)).sort()
  const rows = [
    ...baseIsos.map(iso => ({ key: iso, iso, extra: null })),
    ...extras.map(x => ({ key: x.key, iso: x.iso, extra: x })),
  ]

  const cellEntries = (iso, category) => (byDate.get(iso) || []).filter(e => matchesCategory(e, category))
  const savedCellAmount = (iso, category) => cellEntries(iso, category).reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const cellAmount = (iso, category) =>
    live && live.iso === iso && live.category === category ? live.amount : savedCellAmount(iso, category)
  // The cell being typed in, also reported up so the popup's summary cards follow it.
  const setLive = next => {
    setLiveState(next)
    onLiveDelta?.(next?.iso ? { category: next.category, delta: next.amount - savedCellAmount(next.iso, next.category) } : null)
  }
  const pendingAmount = (row, category) => Number(row.extra?.pending?.[category]) || 0
  const pendingTotal = row => COLUMNS.reduce((s, col) => s + pendingAmount(row, col.key), 0)
  const rowTotal = iso => COLUMNS.reduce((s, col) => s + cellAmount(iso, col.key), 0)
  const columnTotals = COLUMNS.map(col => rows.reduce((s, row) => s + (row.iso ? cellAmount(row.iso, col.key) : 0), 0))
  const grandTotal = columnTotals.reduce((a, b) => a + b, 0)
  // A one-column table (Online) needs no Row Total — it would repeat the column.
  const showRowTotal = COLUMNS.length > 1

  useEffect(() => {
    const req = focusReq.current
    if (!req) return
    focusReq.current = null
    gridRef.current?.querySelector(`[data-r="${req.r}"][data-c="${req.c}"]`)?.focus()
  })

  function addRow() {
    nextRowId.current += 1
    setExtras(x => [...x, { key: `new-offering-${nextRowId.current}`, iso: '' }])
    focusReq.current = { r: rows.length, c: 0 }
  }

  function commitAmount(row, category, text) {
    const { amount, error } = parseCellAmount(text)
    if (error) { onError(`Offering: ${error} — amounts must be numbers of 0 or more.`); return false }
    if (!row.iso) {
      setExtras(x => x.map(e => (e.key === row.key ? { ...e, pending: { ...e.pending, [category]: amount } } : e)))
      return true
    }
    const ops = cellOps(cellEntries(row.iso, category), row.iso, category, amount)
    if (ops.creates?.length || ops.updates?.length || ops.deletes?.length) onApply(ops)
    return true
  }

  function commitDate(row, text) {
    const dayEntries = byDate.get(row.iso) || []
    const iso = parseCellDate(text, activeMonth)
    if (!iso) {
      if (!text.trim() && row.extra && !dayEntries.length) {
        setExtras(x => x.map(e => (e.key === row.key ? { ...e, iso: '' } : e)))
        return true
      }
      onError(`Offering: can't read date "${text.trim()}" — use dd/mm/yyyy.`)
      return false
    }
    if (iso === row.iso) return true
    if (rows.some(r => r.iso === iso)) {
      onError(`Offering: there's already a row for ${isoToDisplay(iso)} — enter the amounts there.`)
      return false
    }
    if (!dayEntries.length) {
      if (!isoInMonth(iso, activeMonth)) {
        onError(`Offering: pick a date in ${format(activeMonth, 'MMMM yyyy')}.`)
        return false
      }
      setExtras(x => x.map(e => (e.key === row.key ? { ...e, iso, pending: undefined } : e)))
      // Amounts typed before the date: save them now.
      const creates = COLUMNS.filter(col => pendingAmount(row, col.key) > 0)
        .flatMap(col => cellOps([], iso, col.key, pendingAmount(row, col.key)).creates)
      if (creates.length) onApply({ creates })
      return true
    }
    if (!isoInMonth(iso, activeMonth) && !window.confirm(`${isoToDisplay(iso)} is outside ${format(activeMonth, 'MMMM yyyy')}. This date's offerings will move to that month. Continue?`)) return false
    if (row.extra) setExtras(x => x.map(e => (e.key === row.key ? { ...e, iso } : e)))
    onApply({ updates: dayEntries.map(e => ({ id: e.id, data: { date: iso } })) })
    return true
  }

  function deleteRow(row) {
    const dayEntries = byDate.get(row.iso) || []
    if (row.extra) setExtras(x => x.filter(e => e.key !== row.key))
    if (dayEntries.length) {
      onApply({ deletes: dayEntries.map(e => e.id) }, { label: `Offering: ${isoToDisplay(row.iso)} deleted — Ctrl+Z to undo` })
    }
  }

  // Multi-cell paste at the focused cell. Two shapes:
  //  - amounts only (straight from Excel, no date column): the pasted columns map
  //    onto English / Tamil / Online from the focused column (the Date column counts
  //    as English), and line N fills the Nth date row down from the focused row.
  //    Bare numbers are always amounts — never read as days of the month.
  //  - dated: the first column holds real dates (with / . - or a month name). Dates
  //    in the month are used as pasted; if any is outside the month or unreadable,
  //    the lines are laid down the month's date rows in order instead.
  // Amount pastes save at once onto the month's Sundays, from the clicked row down;
  // values past the last Sunday are skipped (with a notice). Only a dated paste
  // whose dates were re-mapped opens the review, which never blocks.
  // Pasted values overwrite the cells they cover; blank pasted cells are skipped.
  function handlePaste(e) {
    const anchor = e.target.closest?.('[data-c]')
    if (!anchor) return
    const parsed = readGridPaste(e)
    if (!parsed) return
    e.preventDefault()
    if (!rows[Number(anchor.dataset.r)]?.iso && Number(anchor.dataset.c) > 0) {
      onError("Offering: enter this row's date before pasting several amounts.")
      return
    }
    const r0 = Number(anchor.dataset.r)
    const c0 = Number(anchor.dataset.c)
    const lineOffset = parsed.headerSkipped ? 2 : 1
    const invalid = []

    // Keep each line's index so blank lines still step down one grid row.
    const filled = parsed.matrix.map((cells, i) => ({ cells, i })).filter(x => x.cells.some(Boolean))
    const dated = filled.some(x => looksLikeDateCell(x.cells[0], activeMonth))
    const startCol = dated ? 1 : Math.max(c0, 1)

    const lines = []
    filled.forEach(({ cells, i }) => {
      const line = i + lineOffset
      const amounts = dated ? cells.slice(1) : cells
      const values = COLUMNS.map(() => null)
      for (let j = 0; j < amounts.length; j++) {
        const c = startCol + j - 1
        if (c >= COLUMNS.length || !amounts[j]) continue
        const { amount, error } = parseCellAmount(amounts[j])
        if (error) { invalid.push(`Line ${line}: ${error}`); return }
        values[c] = amount
      }
      if (values.every(v => v == null)) return
      const pastedIso = dated ? alignPastedDate(cells[0], activeMonth).iso : ''
      lines.push({ key: `p${i}`, i, pastedIso, values, note: '' })
    })
    if (!lines.length) { onPastePlan({ ops: {}, heldRows: [], invalid }); return }

    // The month's date rows, top to bottom (Sundays + dates already holding entries).
    const monthIsos = rows.map(r => r.iso).filter(iso => iso && isoInMonth(iso, activeMonth))
    if (dated && lines.every(l => l.pastedIso && isoInMonth(l.pastedIso, activeMonth))) {
      lines.forEach(l => { l.iso = l.pastedIso })
    } else if (dated) {
      // Out-of-month / unreadable dates: lay the lines down the month's rows in order.
      lines.forEach((l, k) => {
        l.iso = monthIsos[k] || ''
        l.note = l.pastedIso && l.pastedIso !== l.iso ? `Pasted as ${isoToDisplay(l.pastedIso)}` : ''
      })
    } else {
      // Amounts only (copied from Excel, pasted on the first empty row): line N →
      // the Nth Sunday from the clicked row's date on. Sundays only — never new dates.
      const sundays = sundaysInMonth(activeMonth)
      const fromIso = rows[r0]?.iso || ''
      const startIdx = Math.max(0, sundays.findIndex(iso => iso >= fromIso))
      lines.forEach(l => { l.iso = sundays[startIdx + l.i] || '' })
      const extra = lines.filter(l => !l.iso).length
      if (extra) {
        onError(`Offering: ${format(activeMonth, 'MMMM')} has no more Sundays — ${extra} extra ${extra === 1 ? 'value was' : 'values were'} not pasted.`)
      }
      commitPaste(lines.filter(l => l.iso), invalid)
      return
    }

    // Dated paste: lines that ran past the month's rows are dropped. Only re-mapped
    // dates are shown for a look before saving.
    if (lines.some(l => l.note)) { setConfirm({ lines, invalid }); return }
    commitPaste(lines.filter(l => l.iso), invalid)
  }

  // Confirmed paste lines → cell writes (IncomePage.handlePastePlan saves them).
  function commitPaste(lines, invalid = []) {
    const desired = new Map() // `${iso}|${category}` → { iso, category, amount }
    lines.forEach(({ iso, values }) => values.forEach((amount, c) => {
      if (amount != null) desired.set(`${iso}|${COLUMNS[c].key}`, { iso, category: COLUMNS[c].key, amount })
    }))

    const plan = { ops: {}, heldRows: [], invalid }
    desired.forEach(({ iso, category, amount }, k) => {
      if (isoInMonth(iso, activeMonth)) {
        mergeOps(plan.ops, cellOps(cellEntries(iso, category), iso, category, amount))
      } else if (amount) {
        // Held for a date correction; `cell` makes the save overwrite that
        // date's cell (merge) rather than add a second entry to it.
        plan.heldRows.push({ key: k, iso, name: '', category, amount, status: 'outOfMonth', cell: true, op: { type: 'create', data: { date: iso, category, amount, giverName: '', towards: '' } } })
      }
    })
    onPastePlan(plan)
  }

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 border-t-4 ${styles.accentBorder} shadow-sm overflow-hidden`}>
      <div className={`px-4 py-2.5 border-b border-slate-100 ${styles.header} flex items-center justify-between gap-2`}>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${styles.dot} shrink-0`} />
          <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SaveStatus state={saveState} />
          {headerAction}
          <p className={`text-sm font-bold tabular-nums ${styles.text}`}>₹ {fmtAmount(grandTotal)}</p>
        </div>
      </div>

      <div ref={gridRef} className="overflow-x-auto" onKeyDown={e => handleGridKeyDown(e)} onPaste={handlePaste}>
        <table className={`w-full text-xs border-collapse table-fixed ${COLUMNS.length > 1 ? 'min-w-[32rem]' : ''}`}>
          <thead>
            <tr className="bg-slate-50 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              <th className="px-4 py-3 border-b border-slate-200 w-40">Date</th>
              {COLUMNS.map(col => <th key={col.key} className="px-4 py-3 border-b border-slate-200 text-right">{col.label}</th>)}
              {showRowTotal && <th className="px-4 py-3 border-b border-slate-200 text-right">Row Total</th>}
              <th className="w-10 border-b border-slate-200" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => {
              const hasEntries = !!byDate.get(row.iso)?.length
              const note = row.iso ? rowNote?.(row.iso) : null
              const mark = row.iso ? dateMark?.(row.iso) : null
              return (
                <Fragment key={row.key}>
                <tr className="group border-b border-slate-100 hover:bg-slate-50/70 focus-within:bg-indigo-50/30">
                  <td className="p-0 border-r border-slate-100 relative">
                    {mark && <span className="absolute right-1 inset-y-0 flex items-center z-[1]">{mark}</span>}
                    <GridCell
                      r={r}
                      c={0}
                      ariaLabel={`Offering row ${r + 1} date`}
                      value={isoToDisplay(row.iso)}
                      placeholder="dd/mm/yyyy"
                      // Dates aren't editable: the month's Sundays are fixed rows and a
                      // date with offerings stays put. Only a newly added row, before
                      // anything is entered on it, takes a typed date.
                      readOnly={!row.extra || hasEntries}
                      padClass={CELL_PAD}
                      onCommit={text => commitDate(row, text)}
                    />
                  </td>
                  {COLUMNS.map((col, i) => {
                    const amount = row.iso ? savedCellAmount(row.iso, col.key) : pendingAmount(row, col.key)
                    return (
                      <td key={col.key} className="p-0 border-r border-slate-100">
                        <GridCell
                          r={r}
                          c={i + 1}
                          ariaLabel={`Offering ${row.iso ? isoToDisplay(row.iso) : `row ${r + 1}`} ${col.label}`}
                          align="right"
                          inputMode="decimal"
                          value={amount ? String(amount) : ''}
                          display={amount ? fmtAmount(amount) : ''}
                          placeholder={(row.iso && cellHint?.(row.iso, col.key)) || 'Enter amount'}
                          padClass={CELL_PAD}
                          className="font-medium cursor-text hover:bg-indigo-50/60"
                          onLiveChange={text => setLive(text == null ? null : {
                            iso: row.iso,
                            category: col.key,
                            amount: parseCellAmount(text).error ? 0 : parseCellAmount(text).amount,
                          })}
                          onCommit={text => commitAmount(row, col.key, text)}
                        />
                      </td>
                    )
                  })}
                  {showRowTotal && (
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-700 border-r border-slate-100">
                      {row.iso ? `₹ ${fmtAmount(rowTotal(row.iso))}` : pendingTotal(row) > 0 && (
                        <span className="text-[11px] font-semibold text-amber-700">Enter the date to save</span>
                      )}
                    </td>
                  )}
                  <td className="p-0 text-center">
                    {(row.extra || hasEntries) && (
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => deleteRow(row)}
                        aria-label={`Delete Offering row ${r + 1}`}
                        className="p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
                {note && <tr className="border-b border-slate-100"><td colSpan={COLUMNS.length + (showRowTotal ? 3 : 2)} className="p-0">{note}</td></tr>}
                </Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr className={styles.header}>
              <td className="px-4 py-3 font-semibold text-slate-600 border-t-2 border-slate-200">Total</td>
              {columnTotals.map((t, i) => (
                <td key={COLUMNS[i].key} className={`px-4 py-3 text-right font-bold tabular-nums border-t-2 border-slate-200 ${styles.text}`}>₹ {fmtAmount(t)}</td>
              ))}
              {showRowTotal && <td className={`px-4 py-3 text-right font-bold tabular-nums border-t-2 border-slate-200 ${styles.text}`}>₹ {fmtAmount(grandTotal)}</td>}
              <td className="border-t-2 border-slate-200" />
            </tr>
          </tfoot>
        </table>
      </div>

      <button
        type="button"
        onClick={addRow}
        className="w-full flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-500 hover:text-indigo-700 hover:bg-indigo-50/50 border-t border-slate-100 transition-colors"
      >
        <Plus size={13} /> Add row
      </button>

      {confirm && (
        <ConfirmPasteDatesDialog
          activeMonth={activeMonth}
          columns={COLUMNS}
          sundays={sundaysInMonth(activeMonth)}
          lines={confirm.lines}
          invalid={confirm.invalid}
          onCancel={() => setConfirm(null)}
          // Unreadable lines were already listed in the dialog — don't list them again.
          onConfirm={chosen => { setConfirm(null); commitPaste(chosen) }}
        />
      )}
    </div>
  )
}
