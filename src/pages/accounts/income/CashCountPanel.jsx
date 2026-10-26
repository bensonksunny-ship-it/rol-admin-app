import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Banknote, CheckCircle2, RotateCcw } from 'lucide-react'
import { CASH_SERVICES, CASH_DENOMINATIONS, serviceTotal, countTotal } from '../../../utils/cashCount'
import { SUNDAY_CASH_COUNT_PATH } from '../../../utils/accountsEntryAccess'
import { matchesCategory, toDate } from './incomeCategorize'
import { fmtAmount } from './gridUtils'

// Cash side of the Offering popup: each Sunday's count from the Sunday Cash
// Counter (offering_cash_counts) beside what income currently holds for that
// date. "Confirm" posts the count as English / Tamil Offering income
// (IncomePage.confirmCashCount); a confirmed count can be reopened for correction.
export default function CashCountPanel({ counts, sundays, entries, busyIso, onConfirm, onReopen }) {
  const byIso = new Map(counts.map(c => [c.date, c]))
  const isos = [...new Set([...sundays, ...counts.map(c => c.date)])].sort()
  const posted = (iso, category) => entries
    .filter(e => format(toDate(e.date), 'yyyy-MM-dd') === iso && matchesCategory(e, category))
    .reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const pending = counts.filter(c => c.status !== 'confirmed').length

  return (
    <div className="bg-white rounded-2xl border border-slate-200 border-t-4 border-emerald-400 shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-100 bg-emerald-50/70 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Banknote size={15} className="text-emerald-600 shrink-0" />
          <h3 className="text-sm font-semibold text-slate-700">Sunday cash counts</h3>
          {pending > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">{pending} to confirm</span>}
        </div>
        <Link to={SUNDAY_CASH_COUNT_PATH} className="text-[11px] font-semibold text-emerald-700 hover:underline shrink-0">Open count page</Link>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <th className="px-4 py-2.5">Sunday</th>
            {CASH_SERVICES.map(s => <th key={s.key} className="px-4 py-2.5 text-right">{s.label.replace(' Service', '')} count</th>)}
            <th className="px-4 py-2.5 text-right">Total</th>
            <th className="px-4 py-2.5 w-36" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {isos.map(iso => {
            const c = byIso.get(iso)
            const confirmed = c?.status === 'confirmed'
            const differs = c && CASH_SERVICES.some(s => posted(iso, s.category) !== serviceTotal(c, s.key))
            const detail = c ? [
              ...CASH_SERVICES.map(s => `${s.label}: ${CASH_DENOMINATIONS.filter(d => c[s.key]?.notes?.[d]).map(d => `₹${d}×${c[s.key].notes[d]}`).join(', ') || '—'}`),
              `Counted by ${c.countedBy || '—'} · witnessed by ${c.witnessedBy || '—'}`,
              c.remarks ? `Remarks: ${c.remarks}` : '',
            ].filter(Boolean).join('\n') : ''
            return (
              <tr key={iso} className={confirmed ? '' : c ? 'bg-amber-50/40' : ''} title={detail}>
                <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">{format(parseISO(iso), 'dd/MM/yyyy')}</td>
                {CASH_SERVICES.map(s => {
                  const inIncome = posted(iso, s.category)
                  return (
                    <td key={s.key} className="px-4 py-3 text-right tabular-nums">
                      {c ? <span className="font-semibold text-slate-800">₹{fmtAmount(serviceTotal(c, s.key))}</span> : <span className="text-slate-300">–</span>}
                      {c && !confirmed && inIncome !== serviceTotal(c, s.key) && (
                        <span className="block text-[10px] text-slate-400">income ₹{fmtAmount(inIncome)}</span>
                      )}
                    </td>
                  )
                })}
                <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-800">{c ? `₹${fmtAmount(countTotal(c))}` : ''}</td>
                <td className="px-4 py-3 text-right">
                  {!c ? (
                    <span className="text-[11px] text-slate-400">Not counted yet</span>
                  ) : confirmed ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700" title={c.confirmedBy ? `Confirmed by ${c.confirmedBy}` : 'Confirmed'}>
                        <CheckCircle2 size={13} /> {differs ? 'Confirmed · edited' : 'Confirmed'}
                      </span>
                      <button type="button" onClick={() => onReopen(c)} disabled={busyIso === iso} aria-label="Reopen for correction" title="Reopen for the counter to correct"
                        className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-50">
                        <RotateCcw size={12} />
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => onConfirm(c)} disabled={busyIso === iso}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold disabled:opacity-50">
                      {busyIso === iso ? 'Posting…' : 'Confirm & post'}
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
