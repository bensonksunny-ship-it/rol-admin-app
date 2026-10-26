import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Banknote, CheckCircle2, Lock } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { subscribeOfferingCashCount, saveOfferingCashCount } from '../../services/firestore'
import { CASH_DENOMINATIONS, CASH_SERVICES, emptyNotes, notesTotal, recentSundays } from '../../utils/cashCount'

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`

/**
 * Sunday cash count entry: pick a Sunday, enter how many of each note / coin were
 * counted for the English and Tamil services, name who counted, and submit. Accounts confirms it in the Offering popup, which posts it as
 * income; a confirmed count is read-only. Used by the Sunday Cash Count page and
 * the Offering popup's "Open count page" window.
 * sundays: the Sundays to choose from (default: the last 8); initialIso picks one.
 */
export default function SundayCashCount({ sundays: sundaysProp, initialIso }) {
  const { user, userProfile } = useAuth()
  const [sundays] = useState(() => sundaysProp || recentSundays(8))
  const [iso, setIso] = useState(() => (initialIso && sundays.includes(initialIso) ? initialIso : sundays[0]))
  const myName = userProfile?.name || user?.displayName || user?.email || ''

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2"><Banknote size={22} className="text-[#005044]" /> Sunday Cash Count</h1>
          <p className="text-sm text-slate-500">Count the offering cash for each service, then submit it to Accounts.</p>
        </div>
        <label className="text-xs font-semibold text-slate-500">
          Sunday
          <select value={iso} onChange={(e) => setIso(e.target.value)} className="block mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800">
            {sundays.map((s) => <option key={s} value={s}>{format(parseISO(s), 'EEE, d MMM yyyy')}</option>)}
          </select>
        </label>
      </div>
      {/* Keyed by Sunday so the form starts fresh for each one. */}
      <CashCountForm key={iso} iso={iso} myName={myName} uid={user?.uid || ''} />
    </div>
  )
}

function CashCountForm({ iso, myName, uid }) {
  const [saved, setSaved] = useState(undefined) // undefined = loading, null = none yet
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null) // { type, text }

  // The form fills from the first snapshot only, so later snapshots never overwrite typing.
  useEffect(() => subscribeOfferingCashCount(iso, (c) => {
    setSaved(c)
    setForm((f) => f || {
      english: { ...emptyNotes(), ...(c?.english?.notes || {}) },
      tamil: { ...emptyNotes(), ...(c?.tamil?.notes || {}) },
      countedBy: c?.countedBy || myName,
    })
  }, () => setMsg({ type: 'error', text: 'Could not load this Sunday. Please refresh.' })), [iso, myName])

  const confirmed = saved?.status === 'confirmed'
  const setNote = (svc, d, v) => setForm((f) => ({ ...f, [svc]: { ...f[svc], [d]: v.replace(/[^\d]/g, '') } }))
  const totals = form ? Object.fromEntries(CASH_SERVICES.map((s) => [s.key, notesTotal(form[s.key])])) : {}
  const grand = (totals.english || 0) + (totals.tamil || 0)

  async function submit() {
    if (!grand) { setMsg({ type: 'error', text: 'Enter the note counts first.' }); return }
    setBusy(true); setMsg(null)
    try {
      const svc = (k) => ({ notes: Object.fromEntries(Object.entries(form[k]).map(([d, v]) => [d, Number(v) || 0])), total: totals[k] })
      await saveOfferingCashCount(iso, {
        english: svc('english'),
        tamil: svc('tamil'),
        countedBy: form.countedBy.trim(),
        submittedBy: myName,
        submittedByUid: uid,
      })
      setMsg({ type: 'ok', text: `Submitted · ${inr(grand)} for ${format(parseISO(iso), 'd MMM yyyy')}. Accounts will confirm it.` })
    } catch (e) {
      console.error('Cash count', e)
      setMsg({ type: 'error', text: e?.code === 'permission-denied' ? 'This count has been confirmed by Accounts or you no longer have access.' : 'Could not submit. Please try again.' })
    }
    setBusy(false)
  }

  const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500'

  return (
    <div className="space-y-5">
      {saved && (
        <div className={`rounded-xl px-4 py-3 text-sm flex items-center gap-2 ${confirmed ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-sky-50 border border-sky-200 text-sky-800'}`}>
          {confirmed ? <Lock size={15} /> : <CheckCircle2 size={15} />}
          {confirmed
            ? `Confirmed by Accounts${saved.confirmedBy ? ` (${saved.confirmedBy})` : ''}${saved.confirmedAt ? ` on ${format(saved.confirmedAt, 'd MMM, h:mm a')}` : ''}. It can no longer be changed here.`
            : `Submitted${saved.submittedBy ? ` by ${saved.submittedBy}` : ''}${saved.updatedAt ? ` · last updated ${format(saved.updatedAt, 'd MMM, h:mm a')}` : ''}. Waiting for Accounts to confirm; you can still correct it.`}
        </div>
      )}

      {!form ? (
        <p className="text-sm text-slate-500 text-center py-8">Loading…</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {CASH_SERVICES.map((s) => (
              <section key={s.key} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-emerald-50/70 border-b border-slate-100">
                  <h2 className="text-sm font-bold text-slate-800">{s.label}</h2>
                  <p className="text-base font-bold tabular-nums text-emerald-700">{inr(totals[s.key])}</p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-50">
                      <th className="px-4 py-2 text-left">Note / coin</th>
                      <th className="px-4 py-2 text-left w-28">Count</th>
                      <th className="px-4 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {CASH_DENOMINATIONS.map((d) => {
                      const n = Number(form[s.key][String(d)]) || 0
                      return (
                        <tr key={d}>
                          <td className="px-4 py-1.5 font-semibold text-slate-700 tabular-nums">₹{d}</td>
                          <td className="px-4 py-1.5">
                            <input
                              inputMode="numeric"
                              aria-label={`${s.label} ₹${d} count`}
                              value={form[s.key][String(d)]}
                              disabled={confirmed}
                              onChange={(e) => setNote(s.key, String(d), e.target.value)}
                              placeholder="0"
                              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm tabular-nums disabled:bg-slate-50"
                            />
                          </td>
                          <td className="px-4 py-1.5 text-right tabular-nums text-slate-600">{n ? inr(n * d) : '–'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </section>
            ))}
          </div>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600">Counted by
              <input value={form.countedBy} disabled={confirmed} onChange={(e) => setForm((f) => ({ ...f, countedBy: e.target.value }))} className={`${input} mt-1`} />
            </label>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3">
            <div className="text-sm text-slate-600">
              English <b className="tabular-nums">{inr(totals.english)}</b> · Tamil <b className="tabular-nums">{inr(totals.tamil)}</b> · <span className="text-slate-900 font-bold">Total <span className="tabular-nums">{inr(grand)}</span></span>
            </div>
            {!confirmed && (
              <button type="button" onClick={submit} disabled={busy}
                className="px-5 min-h-[42px] rounded-xl bg-[#005044] hover:bg-[#00695a] text-white text-sm font-bold disabled:opacity-60">
                {busy ? 'Submitting…' : saved ? 'Update count' : 'Submit to Accounts'}
              </button>
            )}
          </div>

          {msg && <p role="status" className={`text-sm font-medium ${msg.type === 'error' ? 'text-red-600' : 'text-emerald-700'}`}>{msg.text}</p>}
        </>
      )}
    </div>
  )
}
