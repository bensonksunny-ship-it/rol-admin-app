import { Fragment, useState } from 'react'
import { fmtDate, matchesCategory, sumAmount, toDate } from './incomeCategorize'
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
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
        <h3 className="text-sm font-semibold text-slate-700">Offering</h3>
      </div>

      {dates.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-400">No offering entries this month.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3">Date</th>
                {COLUMNS.map(col => <th key={col.key} className="px-4 py-3 text-right">{col.label}</th>)}
                <th className="px-4 py-3 text-right">Row Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dates.map(iso => {
                const dayEntries = byDate.get(iso)
                const rowTotal = sumAmount(dayEntries)
                const isExpanded = expandedDate === iso
                return (
                  <Fragment key={iso}>
                    <tr className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 text-slate-700">{fmtDate(iso)}</td>
                      {COLUMNS.map(col => {
                        const colEntries = dayEntries.filter(e => matchesCategory(e, col.key))
                        const amount = sumAmount(colEntries)
                        return (
                          <td key={col.key} className="px-4 py-3 text-right">
                            {colEntries.length > 0 ? (
                              <button
                                type="button"
                                onClick={() => setExpandedDate(isExpanded ? null : iso)}
                                className="font-medium text-slate-800 hover:text-indigo-600 hover:underline"
                              >
                                ₹{amount.toLocaleString('en-IN')}
                              </button>
                            ) : (
                              <span className="text-slate-300">–</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">₹{rowTotal.toLocaleString('en-IN')}</td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50/60">
                        <td colSpan={COLUMNS.length + 2} className="px-4 py-3">
                          <div className="space-y-1.5">
                            {dayEntries.map(entry => (
                              <div key={entry.id} className="flex items-center justify-between gap-3 text-xs bg-white rounded-lg border border-slate-100 px-3 py-2">
                                <span className="text-slate-500 w-20 shrink-0">{entry.category.replace(' Offering', '')}</span>
                                <span className="text-slate-600 flex-1 truncate">{entry.giverName || '—'}</span>
                                <span className="font-medium text-slate-800 w-20 text-right shrink-0">₹{Number(entry.amount).toLocaleString('en-IN')}</span>
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
              <tr className="border-t border-slate-200 bg-slate-50/70">
                <td className="px-4 py-3 font-semibold text-slate-600">Total</td>
                {columnTotals.map((t, i) => (
                  <td key={COLUMNS[i].key} className="px-4 py-3 text-right font-bold text-slate-800">₹{t.toLocaleString('en-IN')}</td>
                ))}
                <td className="px-4 py-3 text-right font-bold text-slate-800">₹{grandTotal.toLocaleString('en-IN')}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
