export default function InlineEntryForm({ categoryOptions, showTowards, form, onChange, onSave, onCancel, saving, formError }) {
  return (
    <div className="p-3 bg-indigo-50/60 border-b border-indigo-100">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <input
          type="date"
          value={form.date}
          onChange={e => onChange('date', e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        {categoryOptions.length > 1 && (
          <select
            value={form.category}
            onChange={e => onChange('category', e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <input
          type="text"
          value={form.giverName}
          onChange={e => onChange('giverName', e.target.value)}
          placeholder="Name"
          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        {showTowards && (
          <input
            type="text"
            value={form.towards}
            onChange={e => onChange('towards', e.target.value)}
            placeholder="Towards"
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        )}
        <input
          type="number"
          min="0"
          step="any"
          value={form.amount}
          onChange={e => onChange('amount', e.target.value)}
          placeholder="Amount"
          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      </div>
      {formError && <p className="text-xs font-medium text-red-600 mt-1.5">{formError}</p>}
      <div className="flex items-center gap-2 mt-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-semibold disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-slate-500 hover:text-slate-700 hover:underline"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
