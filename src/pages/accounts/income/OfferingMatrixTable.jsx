import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { Plus, Trash2 } from 'lucide-react'
import { ACCENT_STYLES, matchesCategory, toDate } from './incomeCategorize'
import { GridCell, SaveStatus } from './gridKit'
import { handleGridKeyDown, readGridPaste, parseCellDate, parseCellAmount, isoInMonth, isoToDisplay, fmtAmount } from './gridUtils'

const styles = ACCENT_STYLES.emerald

const COLUMNS = [
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

// Writes that make one date × column cell hold `amount`. A cell is one entry:
// 0 / blank clears it, and a cell that historically held several entries is
// merged into its first one when edited.
function cellOps(cellEntries, iso, category, amount) {
  if (!amount) return { deletes: cellEntries.map(e => e.id) }
  if (!cellEntries.length) return { creates: [{ date: iso, category, amount, giverName: '', towards: '' }] }
  const [first, ...rest] = cellEntries
  return {
    updates: Number(first.amount) === amount ? [] : [{ id: first.id, data: { amount } }],
    deletes: rest.map(e => e.id),
  }
}

function mergeOps(into, ops) {
  ;['creates', 'updates', 'deletes'].forEach(k => { if (ops[k]?.length) into[k] = [...(into[k] || []), ...ops[k]] })
}

// Offering as a flat Date × English / Tamil / Online grid — one row per date
// (every Sunday of the month, plus any other date that has offerings). Every
// cell is editable in place and saves when left (IncomePage.applyOps).
export default function OfferingMatrixTable({ entries, activeMonth, saveState, onApply, onPastePlan, onError }) {
  const [extras, setExtras] = useState([]) // [{ key, iso }] — "Add row" rows; kept at the end this session
  const [live, setLive] = useState(null) // { iso, category, amount } — the cell being typed in
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
  const baseIsos = [...new Set([...sundaysInMonth(activeMonth), ...byDate.keys()])].filter(iso => !extraIsos.has(iso)).sort()
  const rows = [
    ...baseIsos.map(iso => ({ key: iso, iso, extra: null })),
    ...extras.map(x => ({ key: x.key, iso: x.iso, extra: x })),
  ]

  const cellEntries = (iso, category) => (byDate.get(iso) || []).filter(e => matchesCategory(e, category))
  const savedCellAmount = (iso, category) => cellEntries(iso, category).reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const cellAmount = (iso, category) =>
    live && live.iso === iso && live.category === category ? live.amount : savedCellAmount(iso, category)
  const rowTotal = iso => COLUMNS.reduce((s, col) => s + cellAmount(iso, col.key), 0)
  const columnTotals = COLUMNS.map(col => rows.reduce((s, row) => s + (row.iso ? cellAmount(row.iso, col.key) : 0), 0))
  const grandTotal = columnTotals.reduce((a, b) => a + b, 0)

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
      setExtras(x => x.map(e => (e.key === row.key ? { ...e, iso } : e)))
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

  // Multi-cell paste at the focused cell. Starting in the Date column, each line
  // is "date, English, Tamil, Online" and lands on that date's row (wherever it
  // is). Starting in an amount column, line N fills the Nth row down from there.
  // Pasted values overwrite the cells they cover; blank pasted cells are skipped.
  function handlePaste(e) {
    const anchor = e.target.closest?.('[data-c]')
    if (!anchor) return
    const parsed = readGridPaste(e)
    if (!parsed) return
    e.preventDefault()
    const r0 = Number(anchor.dataset.r)
    const c0 = Number(anchor.dataset.c)
    const lineOffset = parsed.headerSkipped ? 2 : 1
    const desired = new Map() // `${iso}|${category}` → { iso, category, amount }
    const invalid = []

    parsed.matrix.forEach((cells, i) => {
      if (!cells.some(Boolean)) return
      const line = i + lineOffset
      let iso, values, startCol
      if (c0 === 0) {
        iso = parseCellDate(cells[0], activeMonth)
        if (!iso) { invalid.push(`Line ${line}: ${cells[0] ? `can't read date "${cells[0]}"` : 'missing date'}`); return }
        values = cells.slice(1)
        startCol = 1
      } else {
        iso = rows[r0 + i]?.iso
        if (!iso) { invalid.push(`Line ${line}: no dated row to paste into — add a row first`); return }
        values = cells
        startCol = c0
      }
      const lineVals = []
      for (let j = 0; j < values.length; j++) {
        const col = COLUMNS[startCol + j - 1]
        if (!col || !values[j]) continue
        const { amount, error } = parseCellAmount(values[j])
        if (error) { invalid.push(`Line ${line}: ${error}`); return }
        lineVals.push({ iso, category: col.key, amount })
      }
      lineVals.forEach(v => desired.set(`${v.iso}|${v.category}`, v))
    })

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
          <h3 className="text-sm font-semibold text-slate-700">Offering</h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SaveStatus state={saveState} />
          <p className={`text-sm font-bold tabular-nums ${styles.text}`}>₹{fmtAmount(grandTotal)}</p>
        </div>
      </div>

      <div ref={gridRef} className="overflow-x-auto" onKeyDown={e => handleGridKeyDown(e)} onPaste={handlePaste}>
        <table className="w-full text-xs border-collapse table-fixed min-w-[32rem]">
          <thead>
            <tr className="bg-slate-50 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              <th className="px-2 py-1.5 border-b border-slate-200 w-32">Date</th>
              {COLUMNS.map(col => <th key={col.key} className="px-2 py-1.5 border-b border-slate-200 text-right">{col.label}</th>)}
              <th className="px-2 py-1.5 border-b border-slate-200 text-right">Row Total</th>
              <th className="w-7 border-b border-slate-200" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => {
              const hasEntries = !!byDate.get(row.iso)?.length
              return (
                <tr key={row.key} className="group border-b border-slate-100 hover:bg-slate-50/70 focus-within:bg-indigo-50/30">
                  <td className="p-0 border-r border-slate-100">
                    <GridCell
                      r={r}
                      c={0}
                      ariaLabel={`Offering row ${r + 1} date`}
                      value={isoToDisplay(row.iso)}
                      placeholder="dd/mm/yyyy"
                      // A Sunday with nothing entered yet is a fixed row of the month.
                      readOnly={!row.extra && !hasEntries}
                      onCommit={text => commitDate(row, text)}
                    />
                  </td>
                  {COLUMNS.map((col, i) => {
                    const amount = row.iso ? savedCellAmount(row.iso, col.key) : 0
                    return (
                      <td key={col.key} className="p-0 border-r border-slate-100">
                        <GridCell
                          r={r}
                          c={i + 1}
                          ariaLabel={`Offering ${row.iso ? isoToDisplay(row.iso) : `row ${r + 1}`} ${col.label}`}
                          align="right"
                          inputMode="decimal"
                          disabled={!row.iso}
                          value={amount ? String(amount) : ''}
                          display={amount ? fmtAmount(amount) : ''}
                          placeholder="–"
                          className="font-medium"
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
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-slate-700 border-r border-slate-100">
                    {row.iso ? `₹${fmtAmount(rowTotal(row.iso))}` : ''}
                  </td>
                  <td className="p-0 text-center">
                    {(row.extra || hasEntries) && (
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => deleteRow(row)}
                        aria-label={`Delete Offering row ${r + 1}`}
                        className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className={styles.header}>
              <td className="px-2 py-1.5 font-semibold text-slate-600 border-t-2 border-slate-200">Total</td>
              {columnTotals.map((t, i) => (
                <td key={COLUMNS[i].key} className={`px-2 py-1.5 text-right font-bold tabular-nums border-t-2 border-slate-200 ${styles.text}`}>₹{fmtAmount(t)}</td>
              ))}
              <td className={`px-2 py-1.5 text-right font-bold tabular-nums border-t-2 border-slate-200 ${styles.text}`}>₹{fmtAmount(grandTotal)}</td>
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
    </div>
  )
}
