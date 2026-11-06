import { useState } from 'react'
import { format } from 'date-fns'
import { Download, Pencil, Printer, CheckCircle2 } from 'lucide-react'
import { CHURCH_NAME, exportStatementPdf, fmtMoney } from '../../utils/financeStatement'

const inr = (n) => `₹${fmtMoney(n)}`

/**
 * A completed month's Income / Expense as a formal statement (utils/financeStatement.js
 * builds `statement`): letterhead, summary, one breakdown per section, sign-off.
 * Download PDF / Print draw the same statement natively with jsPDF. `onEdit`
 * switches the page back to its normal editing tables.
 */
export default function FinanceStatementReport({ statement: st, onEdit }) {
  const [busy, setBusy] = useState(null) // 'download' | 'print'
  const [error, setError] = useState('')

  async function run(mode) {
    setBusy(mode); setError('')
    try { await exportStatementPdf(st, mode) } catch (err) {
      console.error('Statement PDF', err)
      setError('Could not create the PDF. Please try again.')
    }
    setBusy(null)
  }

  const btn = 'inline-flex items-center gap-1.5 px-4 min-h-[40px] rounded-xl text-sm font-semibold transition-colors disabled:opacity-60'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
          <CheckCircle2 size={16} /> {st.monthLabel} entry completed
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => run('download')} disabled={!!busy} className={`${btn} bg-[#005044] hover:bg-[#00695a] text-white`}>
            <Download size={16} /> {busy === 'download' ? 'Preparing…' : 'Download PDF'}
          </button>
          <button type="button" onClick={() => run('print')} disabled={!!busy} className={`${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>
            <Printer size={16} /> {busy === 'print' ? 'Preparing…' : 'Print'}
          </button>
          {onEdit && (
            <button type="button" onClick={onEdit} className={`${btn} border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100`}>
              <Pencil size={15} /> Edit
            </button>
          )}
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* The sheet: white paper, formal type, fixed-width figures. */}
      <article className="bg-white text-slate-900 rounded-sm border border-slate-300 shadow-md px-4 py-6 sm:px-10 sm:py-10 font-serif">
        <header className="text-center border-b-2 border-[#005044] pb-3">
          <p className="text-lg sm:text-xl font-bold text-[#005044] tracking-wide">{CHURCH_NAME}</p>
          <p className="text-xs text-slate-500 font-sans">Accounts Department</p>
        </header>
        <div className="text-center mt-4 mb-6">
          <h2 className="text-base sm:text-lg font-bold uppercase tracking-[0.15em]">{st.title}</h2>
          <p className="text-sm text-slate-600">For the month of {st.monthLabel}</p>
          <p className="text-xs text-slate-500 font-sans mt-1">
            Status: Entry completed{st.completedBy ? ` by ${st.completedBy}` : ''}{st.completedAt ? ` on ${format(st.completedAt, 'dd/MM/yyyy')}` : ''}
          </p>
        </div>

        <section className="mb-8">
          <table className="w-full text-sm font-sans border border-slate-300">
            <thead>
              <tr className="bg-[#005044] text-white text-left">
                <th className="px-3 py-2 font-semibold">{st.summary.heading}</th>
                <th className="px-3 py-2 font-semibold text-center w-20">Entries</th>
                <th className="px-3 py-2 font-semibold text-right w-36">Amount</th>
              </tr>
            </thead>
            <tbody>
              {st.summary.rows.map((r, i) => (
                <tr key={r.label} className={`border-t border-slate-200 ${i % 2 ? 'bg-slate-50' : ''}`}>
                  <td className="px-3 py-1.5">{r.label}</td>
                  <td className="px-3 py-1.5 text-center tabular-nums text-slate-500">{r.count}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{inr(r.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-400 bg-emerald-50 font-bold">
                <td className="px-3 py-2" colSpan={2}>{st.summary.totalLabel}</td>
                <td className="px-3 py-2 text-right tabular-nums">{inr(st.summary.total)}</td>
              </tr>
              {(st.summary.notes || []).map((n) => (
                <tr key={n.label} className="border-t border-slate-200 text-slate-600">
                  <td className="px-3 py-1.5" colSpan={2}>{n.label}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{inr(n.amount)}</td>
                </tr>
              ))}
            </tfoot>
          </table>
        </section>

        {st.sections.map((sec) => (
          <section key={sec.title} className="mb-7 break-inside-avoid">
            <h3 className="text-sm font-bold text-[#005044] mb-1.5">{sec.title}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm font-sans border border-slate-200">
                <thead>
                  <tr className="bg-slate-100 text-slate-700">
                    {sec.columns.map((c) => (
                      <th key={c.key} className={`px-2.5 py-1.5 font-semibold whitespace-nowrap ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sec.rows.map((r, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      {sec.columns.map((c) => (
                        <td key={c.key} className={`px-2.5 py-1 ${c.align === 'right' ? 'text-right tabular-nums whitespace-nowrap' : ''}`}>
                          {c.money ? fmtMoney(r[c.key]) : r[c.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 bg-emerald-50/70 font-bold">
                    <td className="px-2.5 py-1.5" colSpan={sec.columns.length - 1}>Total</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums whitespace-nowrap">{inr(sec.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        ))}

        {!st.sections.length && <p className="text-sm text-slate-500 text-center font-sans mb-6">No entries this month.</p>}

        <footer className="grid grid-cols-3 gap-4 sm:gap-10 pt-14 text-center text-xs text-slate-600 font-sans">
          {['Prepared by', 'Verified by', 'Approved by'].map((l) => (
            <div key={l}><div className="border-t border-slate-400 pt-1.5">{l}</div></div>
          ))}
        </footer>
      </article>
    </div>
  )
}
