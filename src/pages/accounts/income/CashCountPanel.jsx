import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { format, parseISO } from 'date-fns'
import { Banknote, CheckCircle2, RotateCcw, X } from 'lucide-react'
import { CASH_SERVICES, CASH_DENOMINATIONS, serviceTotal, countTotal } from '../../../utils/cashCount'
import SundayCashCount from '../../../components/finance/SundayCashCount'
import { matchesCategory, toDate } from './incomeCategorize'
import { fmtAmount } from './gridUtils'

// Cash side of the Offering popup: each Sunday's count from the Sunday Cash
// Counter (offering_cash_counts) beside what income currently holds for that
// date. "Confirm" posts the count as English / Tamil Offering income
// (IncomePage.confirmCashCount); a confirmed count can be reopened for correction.
export default function CashCountPanel({ counts, sundays, entries, busyIso, onConfirm, onReopen }) {
  const [countOpen, setCountOpen] = useState(false)
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
        <button type="button" onClick={() => setCountOpen(true)} className="text-[11px] font-semibold text-emerald-700 hover:underline shrink-0">Open count page</button>
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
              `Counted by ${c.countedBy || '—'}`,
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
                  ) : !countTotal(c) && !confirmed ? (
                    // A ₹0 count has nothing to post.
                    <span className="text-[11px] text-slate-400">Nothing counted</span>
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
      {countOpen && <CashCountWindow sundays={sundays} onClose={() => setCountOpen(false)} />}
    </div>
  )
}

// The Sunday Cash Count screen in a window over the Offering popup, offering this
// month's Sundays (most recent past one selected). Esc / ✕ / outside click closes it.
function CashCountWindow({ sundays, onClose }) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const choices = [...sundays].sort().reverse()
  const initialIso = choices.find(s => s <= today) || choices[choices.length - 1]
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); onClose() } }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])
  return createPortal(
    <div data-cash-count-window className="fixed inset-0 z-[950] flex bg-slate-900/50 p-0 sm:p-3" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label="Sunday Cash Count"
        className="relative w-full max-w-4xl mx-auto h-full overflow-auto sm:rounded-2xl bg-slate-50 shadow-2xl p-4 sm:p-6">
        <button type="button" onClick={onClose} aria-label="Close"
          className="absolute top-3 right-3 w-9 h-9 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-200">
          <X size={18} />
        </button>
        {/* Right padding keeps the Sunday picker clear of the close button. */}
        <div className="pr-10"><SundayCashCount sundays={choices} initialIso={initialIso} /></div>
      </div>
    </div>,
    document.body
  )
}
