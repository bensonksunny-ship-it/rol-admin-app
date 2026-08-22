import { Fragment, useState } from 'react'
import { Check, Pencil, Plus } from 'lucide-react'
import { fmtDate, matchesCategory, sumAmount, toDate } from './incomeCategorize'
import InlineEntryForm from './InlineEntryForm'
import RowActionsMenu from './RowActionsMenu'

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

export default function OfferingMatrixTable({
  entries,
  editMode,
  onToggleEdit,
  onAddNew,
  isAdding,
  editingId,
  categoryOptions,
  form,
  onFormChange,
  onSave,
  onCancel,
  saving,
  formError,
  openMenuId,
  setOpenMenuId,
  deletingId,
  setDeletingId,
  onEdit,
  onDelete,
}) {
  const [expandedDate, setExpandedDate] = useState(null)

  const byDate = new Map()
  for (const entry of entries) {
    const iso = toIso(toDate(entry.date))
    if (!byDate.has(iso)) byDate.set(iso, [])
    byDate.get(iso).push(entry)
  }
  const dates = [...byDate.keys()].sort()

  const columnTotals = COLUMNS.map(col => sumAmount(entries.filter(e => matchesCategory(e, col.key))))
  const grandTotal = sumAmount(entries)

  return (
    <div className="max-w-5xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700">Offering</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onAddNew}
            aria-label="Add entry"
            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:border-emerald-400 hover:text-emerald-700 transition-colors"
          >
            <Plus size={14} />
          </button>
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
      </div>

      {isAdding && (
        <InlineEntryForm
          categoryOptions={categoryOptions}
          showTowards={false}
          form={form}
          onChange={onFormChange}
          onSave={onSave}
          onCancel={onCancel}
          saving={saving}
          formError={formError}
        />
      )}

      {dates.length === 0 ? (
        !isAdding && <div className="p-6 text-center text-sm text-slate-400">No offering entries this month.</div>
      ) : (
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
                const dayEntries = byDate.get(iso)
                const rowTotal = sumAmount(dayEntries)
                const isExpanded = expandedDate === iso
                return (
                  <Fragment key={iso}>
                    <tr className={`hover:bg-indigo-50/40 transition-colors ${i % 2 === 1 ? 'bg-slate-50/50' : ''}`}>
                      <td className="px-5 py-3 text-slate-700">{fmtDate(iso)}</td>
                      {COLUMNS.map(col => {
                        const colEntries = dayEntries.filter(e => matchesCategory(e, col.key))
                        const amount = sumAmount(colEntries)
                        return (
                          <td key={col.key} className="px-5 py-3 text-right">
                            {colEntries.length > 0 ? (
                              <button
                                type="button"
                                onClick={() => setExpandedDate(isExpanded ? null : iso)}
                                className="font-medium tabular-nums text-slate-800 hover:text-indigo-600 hover:underline underline-offset-2"
                              >
                                ₹{amount.toLocaleString('en-IN')}
                              </button>
                            ) : (
                              <span className="text-slate-300">–</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="px-5 py-3 text-right font-semibold tabular-nums text-slate-800">₹{rowTotal.toLocaleString('en-IN')}</td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-indigo-50/30">
                        <td colSpan={COLUMNS.length + 2} className="px-5 py-3">
                          <div className="space-y-1.5">
                            {dayEntries.map(entry => (
                              editingId === entry.id ? (
                                <div key={entry.id} className="rounded-xl overflow-hidden border border-indigo-200 shadow-sm">
                                  <InlineEntryForm
                                    categoryOptions={categoryOptions}
                                    showTowards={false}
                                    form={form}
                                    onChange={onFormChange}
                                    onSave={onSave}
                                    onCancel={onCancel}
                                    saving={saving}
                                    formError={formError}
                                  />
                                </div>
                              ) : (
                                <div key={entry.id} className="flex items-center justify-between gap-3 text-xs bg-white rounded-xl border border-slate-100 px-3.5 py-2.5 shadow-sm">
                                  <span className="text-slate-500 w-20 shrink-0">{entry.category.replace(/ offering/i, '')}</span>
                                  <span className="text-slate-600 flex-1 truncate">{entry.giverName || '—'}</span>
                                  <span className="font-medium tabular-nums text-slate-800 w-20 text-right shrink-0">₹{Number(entry.amount).toLocaleString('en-IN')}</span>
                                  {editMode && (
                                    deletingId === entry.id ? (
                                      <span className="flex items-center gap-1.5 shrink-0">
                                        <button type="button" onClick={() => onDelete(entry.id)} className="text-red-600 font-medium hover:underline">Yes</button>
                                        <button type="button" onClick={() => setDeletingId(null)} className="text-slate-500 hover:underline">No</button>
                                      </span>
                                    ) : (
                                      <RowActionsMenu
                                        isOpen={openMenuId === entry.id}
                                        onToggle={() => setOpenMenuId(openMenuId === entry.id ? null : entry.id)}
                                        onEdit={() => { setOpenMenuId(null); onEdit(entry) }}
                                        onDelete={() => { setOpenMenuId(null); setDeletingId(entry.id) }}
                                      />
                                    )
                                  )}
                                </div>
                              )
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
      )}
    </div>
  )
}
