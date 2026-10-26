import { useState } from 'react'
import { createPortal } from 'react-dom'
import { addDays, endOfMonth, format, parseISO } from 'date-fns'
import { CalendarDays } from 'lucide-react'
import { isoInMonth, fmtAmount } from './gridUtils'
import DateInput from '../../../components/DateInput'

const FREQUENCIES = [
  { key: 'weekly', label: 'Weekly', days: 7 },
  { key: 'fortnightly', label: 'Every 2 weeks', days: 14 },
  { key: 'daily', label: 'Daily', days: 1 },
]

/**
 * Offering paste whose dates were re-mapped onto the month or run past its rows:
 * shows every pasted line as Date × English / Tamil / Online for review and lets the
 * dates be filled in one go — "Auto-Fill Sundays", or a start date plus a frequency
 * — or edited one by one. Never blocks: "Commit paste" adds every ticked line with a
 * date in the month and skips the rest (no date, outside the month, or a date
 * already used by an earlier line). Nothing is written until then.
 *
 * lines: [{ key, iso, values: [english, tamil, online] (number | null = not pasted), note? }]
 * onConfirm([{ iso, values }]) gets the ticked lines with their final dates.
 */
export default function ConfirmPasteDatesDialog({ activeMonth, columns, sundays, lines, invalid = [], onCancel, onConfirm }) {
  const monthLabel = format(activeMonth, 'MMMM yyyy')
  const minDate = format(activeMonth, 'yyyy-MM-01')
  const maxDate = format(endOfMonth(activeMonth), 'yyyy-MM-dd')
  const [rows, setRows] = useState(() => lines.map(l => ({ ...l, include: true })))
  const [start, setStart] = useState(() => lines.find(l => isoInMonth(l.iso, activeMonth))?.iso || sundays[0] || minDate)
  const [freq, setFreq] = useState('weekly')

  const set = (key, patch) => setRows(rs => rs.map(r => (r.key === key ? { ...r, ...patch } : r)))
  // Assign dates in order to the ticked lines; skipped lines keep theirs.
  const assign = (dateAt) => {
    let i = 0
    setRows(rs => rs.map(r => (r.include ? { ...r, iso: dateAt(i++) || '', note: '' } : r)))
  }
  const useSundays = () => assign(i => sundays[i])
  const useStartFreq = () => {
    if (!start) return
    const step = FREQUENCIES.find(f => f.key === freq).days
    assign(i => format(addDays(parseISO(start), i * step), 'yyyy-MM-dd'))
  }

  const chosen = rows.filter(r => r.include)
  // The first line on a date keeps it; later lines on the same date are skipped.
  const firstOn = new Map()
  chosen.forEach(r => { if (r.iso && !firstOn.has(r.iso)) firstOn.set(r.iso, r.key) })
  const problem = r => {
    if (!r.include) return ''
    if (!r.iso) return 'Needs a date'
    if (!isoInMonth(r.iso, activeMonth)) return `Outside ${monthLabel}`
    if (firstOn.get(r.iso) !== r.key) return 'Date already used above'
    return ''
  }
  const ready = chosen.filter(r => !problem(r))
  const skipped = chosen.length - ready.length
  const totals = columns.map((_, c) => chosen.reduce((s, r) => s + (r.values[c] || 0), 0))
  const usedCols = columns.map((_, c) => rows.some(r => r.values[c] != null))

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 px-4" data-row-menu-overlay>
      <div role="dialog" aria-modal="true" aria-label="Confirm dates" className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-5 space-y-4 max-h-[90vh] flex flex-col">
        <div>
          <p className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <CalendarDays size={16} className="text-emerald-600" /> Offering paste: confirm dates
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {rows.length} {rows.length === 1 ? 'line' : 'lines'} pasted. Check each date for {monthLabel}, then add them to the grid.
          </p>
        </div>

        {/* Fill all dates at once */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex flex-wrap items-end gap-2">
          <button
            type="button"
            onClick={useSundays}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
          >
            Auto-Fill Sundays
          </button>
          <span className="text-[11px] text-slate-400 px-1 self-center">or</span>
          <label className="text-[11px] text-slate-500">
            Start
            <DateInput value={start} onChange={e => setStart(e.target.value)}
              className="block mt-0.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs" />
          </label>
          <label className="text-[11px] text-slate-500">
            Frequency
            <select value={freq} onChange={e => setFreq(e.target.value)}
              className="block mt-0.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs">
              {FREQUENCIES.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </label>
          <button
            type="button"
            onClick={useStartFreq}
            disabled={!start}
            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
          >
            Apply dates
          </button>
        </div>

        {/* Preview */}
        <div className="overflow-auto border border-slate-200 rounded-lg">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-slate-50">
              <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-2 py-1.5 w-8" />
                <th className="px-2 py-1.5">Date</th>
                {columns.map((col, c) => usedCols[c] && <th key={col.key} className="px-2 py-1.5 text-right">{col.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const p = problem(r)
                return (
                  <tr key={r.key} className={`border-t border-slate-100 ${!r.include ? 'opacity-40' : p ? 'bg-red-50/60' : ''}`}>
                    <td className="px-2 py-1 text-center">
                      <input type="checkbox" checked={r.include} onChange={e => set(r.key, { include: e.target.checked })}
                        aria-label="Include this line" className="accent-emerald-600" />
                    </td>
                    <td className="px-2 py-1">
                      <DateInput
                        min={minDate}
                        max={maxDate}
                        value={r.iso}
                        disabled={!r.include}
                        onChange={e => set(r.key, { iso: e.target.value, note: '' })}
                        aria-label="Date"
                        className={`rounded-md border px-2 py-0.5 text-xs ${p ? 'border-red-400 bg-white' : 'border-slate-200'}`}
                      />
                      {(p || r.note) && <span className={`block text-[10px] mt-0.5 ${p ? 'text-red-600' : 'text-amber-600'}`}>{p || r.note}</span>}
                    </td>
                    {columns.map((col, c) => usedCols[c] && (
                      <td key={col.key} className="px-2 py-1 text-right tabular-nums font-medium text-slate-700">
                        {r.values[c] != null ? `₹${fmtAmount(r.values[c])}` : <span className="text-slate-300">–</span>}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-700">
                <td />
                <td className="px-2 py-1.5">Total</td>
                {columns.map((col, c) => usedCols[c] && <td key={col.key} className="px-2 py-1.5 text-right tabular-nums">₹{fmtAmount(totals[c])}</td>)}
              </tr>
            </tfoot>
          </table>
        </div>

        {invalid.length > 0 && (
          <div className="text-xs">
            <p className="text-red-700">{invalid.length} {invalid.length === 1 ? 'line' : 'lines'} could not be read and will not be added:</p>
            <ul className="text-red-600 mt-1 space-y-0.5">{invalid.map((msg, i) => <li key={i}>{msg}</li>)}</ul>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-[11px] text-slate-500">
            {ready.length ? `Overwrites the pasted columns on ${ready.length} ${ready.length === 1 ? 'date' : 'dates'}.` : ''}
            {skipped > 0 && <span className="text-amber-700">{ready.length ? ' ' : ''}{skipped} {skipped === 1 ? 'line' : 'lines'} in red will be skipped.</span>}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:border-slate-300">
              Cancel
            </button>
            <button
              type="button"
              disabled={!ready.length}
              onClick={() => onConfirm(ready.map(r => ({ iso: r.iso, values: r.values })))}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold disabled:opacity-50"
            >
              Commit paste ({ready.length})
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
