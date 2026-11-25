import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import { CheckCircle2, RotateCcw, X } from 'lucide-react'
import { CASH_SERVICES, CASH_DENOMINATIONS, CASH_SET_ASIDE_FUNDS, serviceTotal, titheTotal, titheCountTotal, setAsideAmount, setAsideTotal, isCountPending, otherCashLines, otherCashTotal } from '../../../utils/cashCount'
import SundayCashCount from '../../../components/finance/SundayCashCount'
import { matchesCategory, toDate } from './incomeCategorize'
import { fmtAmount } from './gridUtils'

// Sunday cash counts (offering_cash_counts) inside the Cash Offering table — no table
// of their own. A count waiting to be confirmed is a slim line under its Sunday's row
// ("From count … Confirm"); a confirmed one is a tick beside the date. Confirming posts
// it (IncomePage.confirmCashCount); counts never block typing in the table.

function countDetail(c) {
  const notes = (n) => CASH_DENOMINATIONS.filter(v => n?.[v]).map(v => `₹${v}×${n[v]}`).join(', ')
  return [
    ...CASH_SERVICES.map(s => `${s.label}: ${notes(c[s.key]?.notes) || '—'}`),
    ...CASH_SERVICES.filter(s => titheTotal(c, s.key)).map(s => `${s.label} tithe: ${notes(c.tithe?.[s.key]?.notes)}`),
    ...CASH_SET_ASIDE_FUNDS.filter(f => setAsideAmount(c, f)).map(f => `Set aside → ${f}: ₹${fmtAmount(setAsideAmount(c, f))}`),
    ...otherCashLines(c).map(l => `${l.category}: ${l.name || '—'} ₹${fmtAmount(l.amount)}`),
    `Counted by ${c.countedBy || '—'}`,
  ].join('\n')
}

/** Line under a Sunday's row: the figures counted, and everything Confirm will post. */
export function CashCountSuggestion({ count, busy, onConfirm }) {
  if (!isCountPending(count)) return null
  const parts = [
    ...CASH_SERVICES.map(s => [s.label.replace(' Service', ''), serviceTotal(count, s.key)]),
    ['Tithe', titheCountTotal(count)],
    ['Other cash', otherCashTotal(count)],
    ['To funds', setAsideTotal(count)],
  ].filter(([, amount]) => amount > 0)
  return (
    <div title={countDetail(count)} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 bg-amber-50/70 text-xs text-slate-600">
      <span className="font-semibold text-amber-800">From count</span>
      {parts.map(([label, amount]) => (
        <span key={label}>{label} <span className="font-semibold tabular-nums text-slate-800">₹ {fmtAmount(amount)}</span></span>
      ))}
      <button type="button" onClick={() => onConfirm(count)} disabled={busy}
        className="ml-auto px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold disabled:opacity-50">
        {busy ? 'Posting…' : 'Confirm'}
      </button>
    </div>
  )
}

/** Tick beside a Sunday's date once its count is confirmed (amber if edited since). */
export function CashCountConfirmedMark({ count, entries, busy, onReopen }) {
  if (count?.status !== 'confirmed') return null
  const posted = (category) => entries
    .filter(e => format(toDate(e.date), 'yyyy-MM-dd') === count.date && matchesCategory(e, category))
    .reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const edited = CASH_SERVICES.some(s => posted(s.category) !== serviceTotal(count, s.key))
  const label = `Count confirmed${count.confirmedBy ? ` by ${count.confirmedBy}` : ''}${edited ? ' · amounts edited since' : ''}`
  return (
    <span className="inline-flex items-center gap-0.5">
      <span title={`${label}\n${countDetail(count)}`} aria-label={label} role="img" className={edited ? 'text-amber-600' : 'text-emerald-600'}><CheckCircle2 size={14} /></span>
      <button type="button" tabIndex={-1} onClick={() => onReopen(count)} disabled={busy} aria-label="Reopen count for correction" title="Reopen for the counter to correct"
        className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-50">
        <RotateCcw size={12} />
      </button>
    </span>
  )
}

/** "Open count page" link for the table header, with the count window it opens. */
export function OpenCountPageButton({ sundays }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-[11px] font-semibold text-emerald-700 hover:underline shrink-0">Open count page</button>
      {open && <CashCountWindow sundays={sundays} onClose={() => setOpen(false)} />}
    </>
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
