import { useState } from 'react'
import { Banknote, Smartphone } from 'lucide-react'
import { fmtAmount } from './gridUtils'

const rupees = n => `₹ ${fmtAmount(n)}`

// Body of the Offering popup: a month summary (Cash · Online · Total) over two tabs.
//   Cash   — 1. the counter's Sunday counts to confirm, 2. the English / Tamil ledger.
//   Online — the UPI / bank transfers ledger.
// `cash` / `online` are the tab contents; totals come from IncomePage.
export default function OfferingPopupBody({ englishTotal, tamilTotal, onlineTotal, pendingCounts, cashCounts, cashLedger, online }) {
  const [tab, setTab] = useState('cash')
  const cashTotal = englishTotal + tamilTotal
  const tabs = [
    { key: 'cash', label: 'Cash', icon: Banknote, total: cashTotal, badge: pendingCounts },
    { key: 'online', label: 'Online', icon: Smartphone, total: onlineTotal },
  ]

  return (
    <div className="space-y-5">
      {/* Month at a glance */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryTile label="Cash offering" amount={cashTotal} sub={`English ${rupees(englishTotal)}  ·  Tamil ${rupees(tamilTotal)}`} tone="emerald" />
        <SummaryTile label="Online offering" amount={onlineTotal} sub="UPI and bank transfers" tone="sky" />
        <SummaryTile label="Total for the month" amount={cashTotal + onlineTotal} sub="Cash + Online" tone="slate" />
      </div>

      <div role="tablist" aria-label="Offering type" className="flex gap-1 p-1 rounded-xl bg-slate-200/70 w-full sm:w-auto sm:inline-flex">
        {tabs.map(t => {
          const active = tab === t.key
          const Icon = t.icon
          return (
            <button key={t.key} type="button" role="tab" aria-selected={active} onClick={() => setTab(t.key)}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${active ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <Icon size={15} />
              {t.label}
              <span className="tabular-nums font-bold text-slate-500">{rupees(t.total)}</span>
              {t.badge > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">{t.badge} to confirm</span>}
            </button>
          )
        })}
      </div>

      {tab === 'cash' ? (
        <div className="space-y-6">
          <Step n={1} title="Confirm the Sunday cash counts" hint="Each Sunday's count from the cash counter. Confirming posts it to the ledger below.">
            {cashCounts}
          </Step>
          <Step n={2} title="Cash offering ledger" hint="English and Tamil service offering per Sunday. Click any amount to correct it.">
            {cashLedger}
          </Step>
        </div>
      ) : (
        <Step title="Online offering ledger" hint="UPI and bank transfers received, by date. Click any amount to edit it; use Add row for a weekday transfer.">
          {online}
        </Step>
      )}
    </div>
  )
}

const TONES = {
  emerald: 'border-emerald-200 bg-emerald-50/60 text-emerald-700',
  sky: 'border-sky-200 bg-sky-50/60 text-sky-700',
  slate: 'border-slate-300 bg-white text-slate-800',
}

function SummaryTile({ label, amount, sub, tone }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${TONES[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{label}</p>
      <p className="text-2xl font-bold tabular-nums mt-0.5">{rupees(amount)}</p>
      <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
    </div>
  )
}

function Step({ n, title, hint, children }) {
  return (
    <section className="space-y-2 min-w-0">
      <div className="flex items-start gap-2.5">
        {n && <span className="mt-0.5 w-6 h-6 shrink-0 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center">{n}</span>}
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-slate-800">{title}</h4>
          <p className="text-xs text-slate-500">{hint}</p>
        </div>
      </div>
      {children}
    </section>
  )
}
