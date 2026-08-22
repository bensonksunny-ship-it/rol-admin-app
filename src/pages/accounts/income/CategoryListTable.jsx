import { Check, ChevronDown, Pencil, Plus, X } from 'lucide-react'
import { ACCENT_STYLES, fmtDate, sumAmount, toDate } from './incomeCategorize'
import InlineEntryForm from './InlineEntryForm'
import RowActionsMenu from './RowActionsMenu'

export default function CategoryListTable({
  title,
  accent = 'indigo',
  entries,
  isExpanded,
  onToggleExpand,
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
  towardsColumn = false,
}) {
  const total = sumAmount(entries)
  const sorted = [...entries].sort((a, b) => toDate(b.date) - toDate(a.date))
  const columnCount = 3 + (towardsColumn ? 1 : 0) + (editMode ? 1 : 0)
  const styles = ACCENT_STYLES[accent]

  const header = (
    <div className={`px-5 py-3 border-b border-slate-100 ${styles.header} flex items-center justify-between gap-2`}>
      <button
        type="button"
        onClick={onToggleExpand}
        aria-label={isExpanded ? 'Collapse' : 'Expand'}
        className="flex items-center gap-2 text-left group cursor-pointer"
      >
        <span className={`w-2 h-2 rounded-full ${styles.dot} shrink-0`} />
        <div>
          <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
          <p className="text-xs text-slate-400">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</p>
        </div>
        {!isExpanded && (
          <ChevronDown size={14} className="text-slate-400 group-hover:text-slate-600 transition-transform" />
        )}
      </button>
      <div className="flex items-center gap-2">
        <p className={`text-sm font-bold tabular-nums ${styles.text}`}>₹{total.toLocaleString('en-IN')}</p>
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
        {isExpanded && (
          <button
            type="button"
            onClick={onToggleExpand}
            aria-label="Close"
            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-700 transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  )

  const body = (
    <>
      {isAdding && (
        <InlineEntryForm
          categoryOptions={categoryOptions}
          showTowards={towardsColumn}
          form={form}
          onChange={onFormChange}
          onSave={onSave}
          onCancel={onCancel}
          saving={saving}
          formError={formError}
        />
      )}

      {sorted.length === 0 ? (
        !isAdding && <div className="p-5 text-center text-xs text-slate-400">No entries</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200 bg-slate-50/60 text-[11px] font-semibold uppercase tracking-wider">
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Name</th>
                {towardsColumn && <th className="px-4 py-2.5">Towards</th>}
                <th className="px-4 py-2.5 text-right">Amount</th>
                {editMode && <th className="px-4 py-2.5"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((entry, i) => (
                editingId === entry.id ? (
                  <tr key={entry.id}>
                    <td colSpan={columnCount} className="p-0">
                      <InlineEntryForm
                        categoryOptions={categoryOptions}
                        showTowards={towardsColumn}
                        form={form}
                        onChange={onFormChange}
                        onSave={onSave}
                        onCancel={onCancel}
                        saving={saving}
                        formError={formError}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={entry.id} className={`hover:bg-indigo-50/40 transition-colors ${i % 2 === 1 ? 'bg-slate-50/50' : ''}`}>
                    <td className="px-4 py-2.5 text-slate-700">{fmtDate(entry.date)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{entry.giverName || '—'}</td>
                    {towardsColumn && <td className="px-4 py-2.5 text-slate-600">{entry.towards || '—'}</td>}
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums text-slate-800">₹{Number(entry.amount).toLocaleString('en-IN')}</td>
                    {editMode && (
                      <td className="px-4 py-2.5 text-right">
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
                )
              ))}
            </tbody>
            <tfoot>
              <tr className={`border-t-2 border-slate-200 ${styles.header}`}>
                <td className="px-4 py-2.5 font-semibold text-slate-600" colSpan={towardsColumn ? 3 : 2}>Total</td>
                <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${styles.text}`}>₹{total.toLocaleString('en-IN')}</td>
                {editMode && <td></td>}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  )

  return (
    <>
      <div className={`bg-white rounded-2xl border border-slate-200 border-t-4 ${styles.accentBorder} shadow-sm overflow-hidden flex flex-col`}>
        {header}
        {body}
      </div>

      {isExpanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={onToggleExpand}
        >
          <div
            className={`bg-white rounded-2xl border-t-4 ${styles.accentBorder} shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden`}
            onClick={e => e.stopPropagation()}
          >
            {header}
            <div className="overflow-y-auto flex-1">
              {body}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
