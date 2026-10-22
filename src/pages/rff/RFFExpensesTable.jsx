import { formatINR, formatDisplayDate } from './studentUtils'

// Read-only itemwise expenses from the RFF app's `expenses` collection, as
// returned by getRFFData (functions/index.js), with per-category subtotals.

function formatExpenseDate(v) {
  if (!v) return '—'
  const shown = formatDisplayDate(v)
  return shown === '—' ? v : shown
}

export default function RFFExpensesTable({ expenses, total, loading, error }) {
  const byCategory = new Map()
  for (const e of expenses) {
    const c = e.category || 'Uncategorised'
    byCategory.set(c, (byCategory.get(c) || 0) + e.amount)
  }
  const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1])

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700">Expenses Breakdown</h3>
        <span className="text-[11px] text-slate-400">Read-only · managed in the RFF app</span>
      </div>

      {loading ? (
        <div className="p-6 text-center text-slate-500 text-sm">Loading…</div>
      ) : error && expenses.length === 0 ? (
        <div className="p-6 text-center text-slate-400 text-sm">Expenses will appear here once the RFF database connects.</div>
      ) : expenses.length === 0 ? (
        <div className="p-6 text-center text-slate-400 text-sm">No expenses recorded in the RFF app yet.</div>
      ) : (
        <>
          {categories.length > 1 && (
            <div className="px-4 py-3 flex flex-wrap gap-2 border-b border-slate-100">
              {categories.map(([c, amt]) => (
                <span key={c} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 border border-rose-100 text-[11px] text-rose-800">
                  <span className="font-medium">{c}</span>
                  <span className="font-semibold">{formatINR(amt)}</span>
                </span>
              ))}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-rose-700 bg-gradient-to-r from-rose-50 via-orange-50 to-amber-50">
                  <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide border-b-2 border-rose-100 w-10">#</th>
                  <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide border-b-2 border-rose-100">Date</th>
                  <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide border-b-2 border-rose-100">Title</th>
                  <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide border-b-2 border-rose-100">Category</th>
                  <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide border-b-2 border-rose-100 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e, idx) => (
                  <tr key={e.id} className={`border-b border-slate-100 ${idx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}`}>
                    <td className="px-3 py-2.5 text-slate-400 tabular-nums">{idx + 1}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{formatExpenseDate(e.date)}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-800">{e.title || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600">{e.category || '—'}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-slate-800 whitespace-nowrap">{formatINR(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50">
                  <td colSpan={4} className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-wide text-slate-500">Total</td>
                  <td className="px-3 py-2.5 text-right font-black text-rose-700 whitespace-nowrap">{formatINR(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
