import { formatINR } from './studentUtils'

// Read-only "Total Students List" — the RFF app's `students` collection as
// returned by getRFFData (functions/index.js). Editing happens in the RFF app.

const COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'class', label: 'Class' },
  { key: 'age', label: 'Age' },
  { key: 'course', label: 'Course' },
  { key: 'city', label: 'City' },
  { key: 'parent', label: 'Parent' },
  { key: 'totalFeeOffered', label: 'Fee Offered', align: 'right' },
  { key: 'totalFeePaid', label: 'Fee Paid', align: 'right' },
  { key: 'feePending', label: 'Pending Balance', align: 'right' },
]

function formatFee(v) {
  return v == null ? '—' : formatINR(v)
}

// Negative = paid more than offered (often a payment recorded twice in the RFF app).
function PendingCell({ value }) {
  if (value == null) return <span className="text-slate-400" title="No fee offered on record">—</span>
  if (value < 0) return <span className="text-sky-700" title="Paid more than the fee offered">{formatINR(-value)} over</span>
  if (value === 0) return <span className="text-emerald-700">Cleared</span>
  return <span className="text-amber-700">{formatINR(value)}</span>
}

export default function RFFStudentsList({ students, loading, error }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700">Total Students List</h3>
        <span className="text-[11px] text-slate-400">Read-only · managed in the RFF app</span>
      </div>

      {loading ? (
        <div className="p-6 text-center text-slate-500 text-sm">Loading…</div>
      ) : error && students.length === 0 ? (
        <div className="p-6 text-center text-slate-400 text-sm">Students will appear here once the RFF database connects.</div>
      ) : students.length === 0 ? (
        <div className="p-6 text-center text-slate-400 text-sm">No students in the RFF database yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-indigo-700 bg-gradient-to-r from-indigo-50 via-violet-50 to-rose-50">
                <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide border-b-2 border-indigo-100 w-10">#</th>
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    className={`px-3 py-2 font-semibold text-[11px] uppercase tracking-wide border-b-2 border-indigo-100 whitespace-nowrap ${c.align === 'right' ? 'text-right' : ''}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((s, idx) => (
                <tr key={s.id} className={`border-b border-slate-100 ${idx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}`}>
                  <td className="px-3 py-2.5 text-slate-400 tabular-nums">{idx + 1}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-800">{s.name || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-600">{s.class || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-600">{s.age || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-600">{s.course || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-600">{s.city || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-600">{s.parent || '—'}</td>
                  <td className="px-3 py-2.5 text-right text-slate-800 whitespace-nowrap">{formatFee(s.totalFeeOffered)}</td>
                  <td className="px-3 py-2.5 text-right text-emerald-700 whitespace-nowrap">{formatFee(s.totalFeePaid)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap"><PendingCell value={s.feePending} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
