import { Check, Pencil, Plus, Trash2 } from 'lucide-react'
import { ACCENT_STYLES, fmtDate, sumAmount, toDate } from './incomeCategorize'
import InlineEntryForm from './InlineEntryForm'
import RowActionsMenu from './RowActionsMenu'
import SectionSaveBar, { SectionHeaderSave } from './SectionSaveBar'

const cellInputClass = 'w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 shadow-sm placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 disabled:opacity-50'

export default function CategoryListTable({
  title,
  accent = 'indigo',
  entries,
  isExpanded,
  onToggleExpand,
  editMode,
  onToggleEdit,
  onAddNew,
  onPaste,
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
  // Per-card bulk edit (IncomePage.sectionProps): in edit mode every row is an
  // input bound to its draft; the footer Save writes only this card's changes.
  draftFor,
  onDraftChange,
  dirtyCount = 0,
  sectionSaving = false,
  justSaved = false,
  onSaveSection,
  onCancelSection,
}) {
  const total = sumAmount(entries)
  const sorted = [...entries].sort((a, b) => toDate(b.date) - toDate(a.date))
  const bulkEdit = editMode && !!draftFor
  const categoryColumn = bulkEdit && categoryOptions.length > 1
  const columnCount = 3 + (towardsColumn ? 1 : 0) + (categoryColumn ? 1 : 0) + (editMode ? 1 : 0)
  const styles = ACCENT_STYLES[accent]

  const header = (
    <div className={`px-5 py-3 border-b border-slate-100 ${styles.header} flex items-center justify-between gap-2`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className={`w-2 h-2 rounded-full ${styles.dot} shrink-0`} />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-700 truncate">{title}</h3>
          <p className="text-xs text-slate-400">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            <span className="hidden group-focus-within/paste:inline text-[10px] font-medium text-indigo-500 ml-1.5">Ctrl+V to paste from Excel</span>
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
        <p className={`text-sm font-bold tabular-nums ${styles.text}`}>₹{total.toLocaleString('en-IN')}</p>
        <SectionHeaderSave
          title={title}
          editMode={bulkEdit}
          dirtyCount={dirtyCount}
          saving={sectionSaving}
          justSaved={justSaved}
          onSave={onSaveSection}
        />
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
  )

  function renderBody(blankRows = 0, allowClickToAdd = false) {
    return (
      <>
        {isAdding && (
          <div onClick={e => e.stopPropagation()}>
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
          </div>
        )}

        {sorted.length === 0 && blankRows === 0 ? (
          !isAdding && (
            <div
              onClick={allowClickToAdd ? onAddNew : undefined}
              className={`p-5 text-center text-xs text-slate-400 ${allowClickToAdd ? 'cursor-pointer hover:bg-slate-50/80 transition-colors' : ''}`}
            >
              No entries{allowClickToAdd ? ' — click to add one' : ''}
            </div>
          )
        ) : (
          <div className="overflow-x-auto" onClick={bulkEdit ? e => e.stopPropagation() : undefined}>
            <table className="w-full text-xs bg-white">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider">
                  <th className="px-4 py-2.5">Date</th>
                  {categoryColumn && <th className="px-4 py-2.5">Category</th>}
                  <th className="px-4 py-2.5">Name</th>
                  {towardsColumn && <th className="px-4 py-2.5">Towards</th>}
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  {editMode && <th className="px-4 py-2.5"></th>}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {sorted.map((entry) => (
                  editingId === entry.id ? (
                    <tr key={entry.id} onClick={e => e.stopPropagation()}>
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
                  ) : bulkEdit ? (
                    (() => {
                      const draft = draftFor(entry)
                      const set = (field) => (e) => onDraftChange(entry.id, field, e.target.value)
                      // Legacy/unlisted categories (e.g. old Other Income values) stay selectable.
                      const options = categoryOptions.includes(draft.category) || !draft.category
                        ? categoryOptions
                        : [draft.category, ...categoryOptions]
                      return (
                        <tr key={entry.id} className="bg-white">
                          <td className="px-2 py-1.5">
                            <input type="date" value={draft.date} onChange={set('date')} disabled={sectionSaving} className={`${cellInputClass} min-w-[7.5rem]`} />
                          </td>
                          {categoryColumn && (
                            <td className="px-2 py-1.5">
                              <select value={draft.category} onChange={set('category')} disabled={sectionSaving} className={cellInputClass}>
                                {options.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </td>
                          )}
                          <td className="px-2 py-1.5">
                            <input type="text" value={draft.giverName} onChange={set('giverName')} placeholder="Name" disabled={sectionSaving} className={`${cellInputClass} min-w-[6rem]`} />
                          </td>
                          {towardsColumn && (
                            <td className="px-2 py-1.5">
                              <input type="text" value={draft.towards} onChange={set('towards')} placeholder="Towards" disabled={sectionSaving} className={`${cellInputClass} min-w-[6rem]`} />
                            </td>
                          )}
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={draft.amount}
                              onChange={set('amount')}
                              placeholder="0"
                              disabled={sectionSaving}
                              className={`${cellInputClass} min-w-[5rem] text-right font-medium tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            {deletingId === entry.id ? (
                              <span className="flex items-center justify-end gap-1.5 text-[11px] text-slate-600 whitespace-nowrap">
                                <button type="button" onClick={() => onDelete(entry.id)} className="text-red-600 font-medium hover:underline">Yes</button>
                                <button type="button" onClick={() => setDeletingId(null)} className="text-slate-500 hover:underline">No</button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDeletingId(entry.id)}
                                disabled={sectionSaving}
                                aria-label="Delete entry"
                                className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })()
                  ) : (
                    <tr key={entry.id} className="bg-white hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2.5 text-slate-700">{fmtDate(entry.date)}</td>
                      <td className="px-4 py-2.5 text-slate-600">{entry.giverName || '—'}</td>
                      {towardsColumn && <td className="px-4 py-2.5 text-slate-600">{entry.towards || '—'}</td>}
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums text-slate-800">₹{Number(entry.amount).toLocaleString('en-IN')}</td>
                      {editMode && (
                        <td className="px-4 py-2.5 text-right" onClick={e => e.stopPropagation()}>
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
                {Array.from({ length: blankRows }).map((_, i) => (
                  <tr
                    key={`blank-${i}`}
                    onClick={allowClickToAdd ? onAddNew : undefined}
                    className={allowClickToAdd ? 'cursor-pointer hover:bg-slate-50/80 transition-colors' : undefined}
                  >
                    <td className="px-4 py-2.5 text-slate-300">&nbsp;</td>
                    {categoryColumn && <td className="px-4 py-2.5"></td>}
                    <td className="px-4 py-2.5"></td>
                    {towardsColumn && <td className="px-4 py-2.5"></td>}
                    <td className="px-4 py-2.5"></td>
                    {editMode && <td className="px-4 py-2.5"></td>}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={`border-t-2 border-slate-200 ${styles.header}`}>
                  <td className="px-4 py-2.5 font-semibold text-slate-600" colSpan={2 + (towardsColumn ? 1 : 0) + (categoryColumn ? 1 : 0)}>Total</td>
                  <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${styles.text}`}>₹{total.toLocaleString('en-IN')}</td>
                  {editMode && <td></td>}
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {bulkEdit && sorted.length > 0 && (
          <SectionSaveBar
            title={title}
            dirtyCount={dirtyCount}
            saving={sectionSaving}
            onSave={onSaveSection}
            onCancel={onCancelSection}
          />
        )}
      </>
    )
  }

  return (
    <>
      {/* Focusable so a click anywhere in the card followed by Ctrl+V pastes Excel rows into it. */}
      <div
        tabIndex={-1}
        onPaste={onPaste}
        onClick={onToggleExpand}
        title="Click the table and press Ctrl+V to paste rows from Excel"
        className={`group/paste bg-white rounded-2xl border border-slate-200 border-t-4 ${styles.accentBorder} shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col cursor-pointer outline-none ${dirtyCount > 0 ? 'ring-2 ring-amber-300' : 'focus-within:ring-2 focus-within:ring-indigo-300'}`}
      >
        {header}
        {renderBody(5)}
      </div>

      {isExpanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={onToggleExpand}
        >
          <div
            tabIndex={-1}
            onPaste={onPaste}
            className={`group/paste bg-white rounded-2xl border-t-4 ${styles.accentBorder} shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden outline-none`}
            onClick={e => e.stopPropagation()}
          >
            {header}
            <div className="overflow-y-auto flex-1">
              {renderBody(5, true)}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
