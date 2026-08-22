import { Check, X } from 'lucide-react'

const fieldClass = 'rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 shadow-sm placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-shadow'
const labelClass = 'text-[10px] font-semibold uppercase tracking-wider text-slate-400'

export default function InlineEntryForm({ categoryOptions, showTowards, form, onChange, onSave, onCancel, saving, formError }) {
  return (
    <div className="p-4 bg-gradient-to-br from-indigo-50/70 to-white border-b border-indigo-100">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Date</label>
          <input
            type="date"
            value={form.date}
            onChange={e => onChange('date', e.target.value)}
            className={fieldClass}
          />
        </div>
        {categoryOptions.length > 1 && (
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Category</label>
            <select
              value={form.category}
              onChange={e => onChange('category', e.target.value)}
              className={fieldClass}
            >
              {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Name</label>
          <input
            type="text"
            value={form.giverName}
            onChange={e => onChange('giverName', e.target.value)}
            placeholder="Optional"
            className={fieldClass}
          />
        </div>
        {showTowards && (
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Towards</label>
            <input
              type="text"
              value={form.towards}
              onChange={e => onChange('towards', e.target.value)}
              placeholder="Optional"
              className={fieldClass}
            />
          </div>
        )}
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Amount (₹)</label>
          <input
            type="number"
            min="0"
            step="any"
            value={form.amount}
            onChange={e => onChange('amount', e.target.value)}
            placeholder="0"
            className={fieldClass}
          />
        </div>
      </div>

      {formError && <p className="text-xs font-medium text-red-600 mt-2.5">{formError}</p>}

      <div className="flex items-center gap-2 mt-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-semibold shadow-sm disabled:opacity-50 transition-colors"
        >
          <Check size={13} /> {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 text-xs font-medium shadow-sm transition-colors"
        >
          <X size={13} /> Cancel
        </button>
      </div>
    </div>
  )
}
