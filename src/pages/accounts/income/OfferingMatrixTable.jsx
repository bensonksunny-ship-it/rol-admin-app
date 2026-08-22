import { Fragment, useState } from 'react'
import { Check, Pencil, Trash2 } from 'lucide-react'
import { fmtDate, matchesCategory, sumAmount, toDate } from './incomeCategorize'

const COLUMNS = [
  { key: 'English Offering', label: 'English' },
  { key: 'Tamil Offering', label: 'Tamil' },
  { key: 'Online Offering', label: 'Online' },
]

function toIso(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function sundaysInMonth(monthDate) {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const isos = []
  const d = new Date(year, month, 1)
  while (d.getMonth() === month) {
    if (d.getDay() === 0) isos.push(toIso(d))
    d.setDate(d.getDate() + 1)
  }
  return isos
}

function CellAmountInput({ value, onChange, onCommit, onCancel, saving }) {
  return (
    <input
      type="number"
      min="0"
      step="any"
      autoFocus
      disabled={saving}
      value={value}
      placeholder="0"
      onChange={e => onChange(e.target.value)}
      onFocus={e => e.target.select()}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); onCommit() }
        if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      }}
      onBlur={() => { if (value !== '' && Number(value) >= 0) onCommit(); else onCancel() }}
      className="w-20 rounded-lg border border-indigo-300 bg-white px-2 py-1 text-right text-sm font-medium tabular-nums shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
    />
  )
}

export default function OfferingMatrixTable({
  entries,
  activeMonth,
  editMode,
  onToggleEdit,
  addingCell,
  onAddCell,
  editingId,
  form,
  onFormChange,
  onSave,
  onCancel,
  saving,
  deletingId,
  setDeletingId,
  onEdit,
  onDelete,
}) {
  const [expandedCell, setExpandedCell] = useState(null) // { date, category } | null — multi-entry breakdown only

  const byDate = new Map()
  for (const entry of entries) {
    const iso = toIso(toDate(entry.date))
    if (!byDate.has(iso)) byDate.set(iso, [])
    byDate.get(iso).push(entry)
  }
  const dates = [...new Set([...sundaysInMonth(activeMonth), ...byDate.keys()])].sort()

  const columnTotals = COLUMNS.map(col => sumAmount(entries.filter(e => matchesCategory(e, col.key))))
  const grandTotal = sumAmount(entries)

  const isCellExpanded = (iso, category) => expandedCell?.date === iso && expandedCell?.category === category
  const isCellAdding = (iso, category) => addingCell?.date === iso && addingCell?.category === category

  function renderCell(iso, colEntries, category, label) {
    if (isCellAdding(iso, category)) {
      return (
        <CellAmountInput
          value={form.amount}
          onChange={v => onFormChange('amount', v)}
          onCommit={onSave}
          onCancel={onCancel}
          saving={saving}
        />
      )
    }

    if (colEntries.length === 0) {
      return (
        <button
          type="button"
          onClick={() => onAddCell(iso, category)}
          aria-label={`Add ${label} offering for ${fmtDate(iso)}`}
          className="w-full text-right text-slate-300 hover:text-indigo-500 cursor-pointer transition-colors"
        >
          –
        </button>
      )
    }

    if (colEntries.length === 1) {
      const entry = colEntries[0]
      if (editingId === entry.id) {
        return (
          <div className="flex items-center justify-end gap-1.5">
            <CellAmountInput
              value={form.amount}
              onChange={v => onFormChange('amount', v)}
              onCommit={onSave}
              onCancel={onCancel}
              saving={saving}
            />
          </div>
        )
      }
      if (deletingId === entry.id) {
        return (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 whitespace-nowrap">
            Delete?
            <button type="button" onClick={() => onDelete(entry.id)} className="text-red-600 font-semibold hover:underline">Yes</button>
            <button type="button" onClick={() => setDeletingId(null)} className="text-slate-500 hover:underline">No</button>
          </span>
        )
      }
      return (
        <span className="inline-flex items-center justify-end gap-1.5 group">
          <button
            type="button"
            onClick={() => onEdit(entry)}
            className="font-medium tabular-nums text-slate-800 hover:text-indigo-600 cursor-pointer transition-colors"
          >
            ₹{Number(entry.amount).toLocaleString('en-IN')}
          </button>
          {editMode && (
            <button
              type="button"
              onClick={() => setDeletingId(entry.id)}
              aria-label="Delete entry"
              className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 size={12} />
            </button>
          )}
        </span>
      )
    }

    // Multiple entries summed into one cell — rare; expand a small breakdown below the row.
    const amount = sumAmount(colEntries)
    return (
      <button
        type="button"
        onClick={() => setExpandedCell(isCellExpanded(iso, category) ? null : { date: iso, category })}
        className="font-medium tabular-nums text-slate-800 hover:text-indigo-600 cursor-pointer transition-colors"
      >
        ₹{amount.toLocaleString('en-IN')} <span className="text-[10px] text-indigo-500 align-super">{colEntries.length}</span>
      </button>
    )
  }

  return (
    <div className="max-w-5xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700">Offering</h3>
        <button
          type="button"
          onClick={onToggleEdit}
          aria-label={editMode ? 'Done editing' : 'Edit'}
          className={`p-1.5 rounded-lg border transition-colors ${
            editMode
              ? 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700'
              : 'border-slate-200 text-slate-500 hover:border-indigo-400 hover:text-indigo-700'
          }`}
        >
          {editMode ? <Check size={14} /> : <Pencil size={14} />}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <th className="px-5 py-3">Date</th>
              {COLUMNS.map(col => <th key={col.key} className="px-5 py-3 text-right">{col.label}</th>)}
              <th className="px-5 py-3 text-right">Row Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {dates.map((iso, i) => {
              const dayEntries = byDate.get(iso) || []
              const rowTotal = sumAmount(dayEntries)
              const expandedCol = COLUMNS.find(col => isCellExpanded(iso, col.key))
              return (
                <Fragment key={iso}>
                  <tr className={`hover:bg-indigo-50/40 transition-colors ${i % 2 === 1 ? 'bg-slate-50/50' : ''}`}>
                    <td className="px-5 py-3 text-slate-700">{fmtDate(iso)}</td>
                    {COLUMNS.map(col => {
                      const colEntries = dayEntries.filter(e => matchesCategory(e, col.key))
                      return (
                        <td key={col.key} className="px-5 py-3 text-right">
                          {renderCell(iso, colEntries, col.key, col.label)}
                        </td>
                      )
                    })}
                    <td className="px-5 py-3 text-right font-semibold tabular-nums text-slate-800">₹{rowTotal.toLocaleString('en-IN')}</td>
                  </tr>
                  {expandedCol && (
                    <tr className="bg-indigo-50/30">
                      <td colSpan={COLUMNS.length + 2} className="px-5 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500 mb-1.5">
                          {expandedCol.label} — {fmtDate(iso)}
                        </p>
                        <div className="space-y-1.5">
                          {dayEntries.filter(e => matchesCategory(e, expandedCol.key)).map(entry => (
                            <div key={entry.id} className="flex items-center justify-between gap-3 text-xs bg-white rounded-xl border border-slate-100 px-3.5 py-2.5 shadow-sm">
                              <span className="text-slate-600 flex-1 truncate">{entry.giverName || '—'}</span>
                              {editingId === entry.id ? (
                                <CellAmountInput
                                  value={form.amount}
                                  onChange={v => onFormChange('amount', v)}
                                  onCommit={onSave}
                                  onCancel={onCancel}
                                  saving={saving}
                                />
                              ) : deletingId === entry.id ? (
                                <span className="flex items-center gap-1.5 shrink-0 text-[11px]">
                                  <button type="button" onClick={() => onDelete(entry.id)} className="text-red-600 font-semibold hover:underline">Yes</button>
                                  <button type="button" onClick={() => setDeletingId(null)} className="text-slate-500 hover:underline">No</button>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 shrink-0 group">
                                  <button
                                    type="button"
                                    onClick={() => onEdit(entry)}
                                    className="font-medium tabular-nums text-slate-800 hover:text-indigo-600 cursor-pointer"
                                  >
                                    ₹{Number(entry.amount).toLocaleString('en-IN')}
                                  </button>
                                  {editMode && (
                                    <button
                                      type="button"
                                      onClick={() => setDeletingId(entry.id)}
                                      aria-label="Delete entry"
                                      className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  )}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50/70">
              <td className="px-5 py-3 font-semibold text-slate-600">Total</td>
              {columnTotals.map((t, i) => (
                <td key={COLUMNS[i].key} className="px-5 py-3 text-right font-bold tabular-nums text-slate-800">₹{t.toLocaleString('en-IN')}</td>
              ))}
              <td className="px-5 py-3 text-right font-bold tabular-nums text-slate-800">₹{grandTotal.toLocaleString('en-IN')}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
