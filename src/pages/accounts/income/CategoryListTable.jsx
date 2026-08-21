import { Check, Pencil, Plus } from 'lucide-react'
import { fmtDate, sumAmount, toDate } from './incomeCategorize'
import RowActionsMenu from './RowActionsMenu'

export default function CategoryListTable({
  title,
  entries,
  editMode,
  onToggleEdit,
  onAddNew,
  openMenuId,
  setOpenMenuId,
  deletingId,
  setDeletingId,
  onEdit,
  onDelete,
  towardsColumn = false,
}) {
  const total = sumAmount(entries)
  const sorted = [...entries].sort((a, b) => toDate(b.date) - toDate(a.date))

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
          <p className="text-xs text-slate-400">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</p>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-slate-800">₹{total.toLocaleString('en-IN')}</p>
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

      {sorted.length === 0 ? (
        <div className="p-4 text-center text-xs text-slate-400">No entries</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Name</th>
                {towardsColumn && <th className="px-3 py-2 font-medium">Towards</th>}
                <th className="px-3 py-2 font-medium text-right">Amount</th>
                {editMode && <th className="px-3 py-2"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sorted.map(entry => (
                <tr key={entry.id} className="hover:bg-slate-50 transition">
                  <td className="px-3 py-2 text-slate-700">{fmtDate(entry.date)}</td>
                  <td className="px-3 py-2 text-slate-600">{entry.giverName || '—'}</td>
                  {towardsColumn && <td className="px-3 py-2 text-slate-600">{entry.towards || '—'}</td>}
                  <td className="px-3 py-2 text-right font-medium text-slate-800">₹{Number(entry.amount).toLocaleString('en-IN')}</td>
                  {editMode && (
                    <td className="px-3 py-2 text-right">
                      {deletingId === entry.id ? (
                        <span className="flex items-center justify-end gap-1.5 text-[11px] text-slate-600 whitespace-nowrap">
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
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-100 bg-slate-50/40">
                <td className="px-3 py-2 font-semibold text-slate-600" colSpan={towardsColumn ? 3 : 2}>Total</td>
                <td className="px-3 py-2 text-right font-bold text-slate-800">₹{total.toLocaleString('en-IN')}</td>
                {editMode && <td></td>}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
