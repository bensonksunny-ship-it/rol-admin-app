import { useState } from 'react'
import { createPortal } from 'react-dom'
import { format, endOfMonth } from 'date-fns'
import { isoInMonth, isoToDisplay } from './gridUtils'

// Likely intended date for a pasted date that falls outside the month being
// entered: day and month swapped (05/10 typed as 10/05), else the same day in
// this month. '' when neither fits — the user picks one.
function suggestDate(iso, activeMonth) {
  const [y, m, d] = String(iso).split('-').map(Number)
  const candidates = [
    [y, d, m], // swapped day / month
    [activeMonth.getFullYear(), activeMonth.getMonth() + 1, d], // same day, this month
  ]
  for (const [cy, cm, cd] of candidates) {
    const date = new Date(cy, cm - 1, cd)
    if (date.getFullYear() === cy && date.getMonth() === cm - 1 && date.getDate() === cd) {
      const out = format(date, 'yyyy-MM-dd')
      if (isoInMonth(out, activeMonth)) return out
    }
  }
  return ''
}

// Shown after a paste when some rows can't be saved as they are:
//  - dated outside the month being entered → asks for the correct date (a date
//    picker limited to this month, pre-filled with a suggestion); a row can be
//    skipped instead, but not saved under another month from here.
//  - apparent duplicates of saved entries → saved only if ticked.
//  - lines that couldn't be read → listed, never dropped silently.
// onSave([{ row, date }]) gets the rows to save with their final dates.
export default function PasteReviewDialog({ title, activeMonth, rows, invalid, onCancel, onSave }) {
  const monthLabel = format(activeMonth, 'MMMM yyyy')
  const minDate = format(activeMonth, 'yyyy-MM-01')
  const maxDate = format(endOfMonth(activeMonth), 'yyyy-MM-dd')
  const [choice, setChoice] = useState(() => Object.fromEntries(rows.map(r => [
    r.key,
    r.status === 'outOfMonth' ? { include: true, date: suggestDate(r.iso, activeMonth) } : { include: false, date: r.iso },
  ])))
  const set = (key, patch) => setChoice(c => ({ ...c, [key]: { ...c[key], ...patch } }))

  const wrongMonth = rows.filter(r => r.status === 'outOfMonth')
  const duplicates = rows.filter(r => r.status === 'duplicate')
  const chosen = rows.filter(r => choice[r.key].include)
  const needsDate = chosen.some(r => r.status === 'outOfMonth' && !isoInMonth(choice[r.key].date, activeMonth))

  const describe = r => [r.name, r.category ? r.category.replace(' Offering', '') : ''].filter(Boolean).join(' · ')

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 space-y-3 max-h-[85vh] flex flex-col">
        <p className="text-sm font-semibold text-amber-700">⚠ {title}: some pasted rows need a look</p>

        <div className="text-sm text-slate-600 space-y-4 overflow-y-auto">
          {wrongMonth.length > 0 && (
            <div className="space-y-2">
              <p>
                {wrongMonth.length === 1 ? 'This row is' : `These ${wrongMonth.length} rows are`} dated outside {monthLabel}.
                Please correct the date{wrongMonth.length === 1 ? '' : 's'}:
              </p>
              <ul className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                {wrongMonth.map(r => {
                  const c = choice[r.key]
                  const bad = c.include && !isoInMonth(c.date, activeMonth)
                  return (
                    <li key={r.key} className={`px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${c.include ? '' : 'opacity-50'}`}>
                      <span className="flex-1 min-w-[8rem] text-slate-700">
                        {describe(r) || '—'}
                        <span className="block text-[11px] text-amber-600">Pasted as {isoToDisplay(r.iso)}</span>
                      </span>
                      <span className="tabular-nums font-medium text-slate-800">₹{Number(r.amount || 0).toLocaleString('en-IN')}</span>
                      <input
                        type="date"
                        min={minDate}
                        max={maxDate}
                        value={c.date}
                        disabled={!c.include}
                        onChange={e => set(r.key, { date: e.target.value })}
                        aria-label={`Correct date for ${describe(r) || 'row'}`}
                        className={`rounded-md border px-2 py-1 text-xs ${bad ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                      />
                      <label className="flex items-center gap-1 text-[11px] text-slate-500 cursor-pointer">
                        <input type="checkbox" checked={!c.include} onChange={e => set(r.key, { include: !e.target.checked })} />
                        Skip
                      </label>
                    </li>
                  )
                })}
              </ul>
              {needsDate && <p className="text-xs text-red-600">Pick a date in {monthLabel} for each row, or tick Skip.</p>}
            </div>
          )}

          {duplicates.length > 0 && (
            <div className="space-y-2">
              <p>{duplicates.length === 1 ? 'This row looks' : `These ${duplicates.length} rows look`} already saved (same date, amount and name). Tick to save anyway:</p>
              <ul className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                {duplicates.map(r => (
                  <li key={r.key}>
                    <label className="px-3 py-2 flex items-center gap-3 text-xs cursor-pointer">
                      <input type="checkbox" checked={choice[r.key].include} onChange={e => set(r.key, { include: e.target.checked })} />
                      <span className="flex-1 text-slate-700">{isoToDisplay(r.iso)}{describe(r) ? ` · ${describe(r)}` : ''}</span>
                      <span className="tabular-nums font-medium text-slate-800">₹{Number(r.amount || 0).toLocaleString('en-IN')}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {invalid.length > 0 && (
            <div>
              <p className="text-red-700">{invalid.length} {invalid.length === 1 ? 'line' : 'lines'} could not be read and {invalid.length === 1 ? 'was' : 'were'} not saved:</p>
              <ul className="text-xs text-red-600 mt-1 space-y-0.5">
                {invalid.map((msg, i) => <li key={i}>{msg}</li>)}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          {rows.length > 0 ? (
            <>
              <button
                type="button"
                onClick={onCancel}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:border-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={needsDate || !chosen.length}
                onClick={() => onSave(chosen.map(r => ({ row: r, date: choice[r.key].date })))}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold disabled:opacity-50 transition-colors"
              >
                Save {chosen.length} {chosen.length === 1 ? 'row' : 'rows'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:border-slate-300 transition-colors"
            >
              OK
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
