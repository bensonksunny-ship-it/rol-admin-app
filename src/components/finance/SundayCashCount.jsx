import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Banknote, CheckCircle2, Lock, PiggyBank, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { subscribeOfferingCashCount, saveOfferingCashCount } from '../../services/firestore'
import {
  CASH_DENOMINATIONS, CASH_SERVICES, CASH_COUNT_TYPES, CASH_SET_ASIDE_FUNDS, OTHER_CASH_GROUPS,
  emptyNotes, notesTotal, recentSundays,
} from '../../utils/cashCount'

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`

/**
 * Sunday cash count entry: pick a Sunday, enter how many of each note / coin were
 * counted for the English and Tamil services — offering and loose tithe cash, one
 * toggle per service — set aside part of the offering for the Reserve / Emergency
 * Fund, name who counted, and submit. Accounts confirms it in the Offering popup, which posts it as
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
          <p className="text-sm text-slate-500">Count the offering and tithe cash for each service, then submit it to Accounts.</p>
        </div>
        <label className="text-xs font-semibold text-slate-500">
          Sunday
          <select value={iso} onChange={(e) => setIso(e.target.value)} className="block mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800">
            {sundays.map((s) => <option key={s} value={s}>{format(parseISO(s), 'EEE, dd/MM/yyyy')}</option>)}
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
  // Which count each service card is showing: 'offering' or 'tithe'.
  const [mode, setMode] = useState(() => Object.fromEntries(CASH_SERVICES.map((s) => [s.key, 'offering'])))

  // The form fills from the first snapshot only, so later snapshots never overwrite typing.
  useEffect(() => subscribeOfferingCashCount(iso, (c) => {
    setSaved(c)
    setForm((f) => f || {
      english: { ...emptyNotes(), ...(c?.english?.notes || {}) },
      tamil: { ...emptyNotes(), ...(c?.tamil?.notes || {}) },
      tithe: Object.fromEntries(CASH_SERVICES.map((s) => [s.key, { ...emptyNotes(), ...(c?.tithe?.[s.key]?.notes || {}) }])),
      setAside: Object.fromEntries(CASH_SET_ASIDE_FUNDS.map((f) => [f, c?.setAside?.[f] ? String(c.setAside[f]) : ''])),
      countedBy: c?.countedBy || myName,
      lines: (c?.lines || []).map((l) => ({ ...l, amount: String(l.amount ?? '') })),
    })
  }, () => setMsg({ type: 'error', text: 'Could not load this Sunday. Please refresh.' })), [iso, myName])

  const confirmed = saved?.status === 'confirmed'
  const notesFor = (svc, type) => (type === 'tithe' ? form.tithe[svc] : form[svc])
  const setNote = (svc, type, d, v) => setForm((f) => {
    const clean = v.replace(/[^\d]/g, '')
    return type === 'tithe'
      ? { ...f, tithe: { ...f.tithe, [svc]: { ...f.tithe[svc], [d]: clean } } }
      : { ...f, [svc]: { ...f[svc], [d]: clean } }
  })
  const totals = form ? Object.fromEntries(CASH_SERVICES.map((s) => [s.key, notesTotal(form[s.key])])) : {}
  const titheTotals = form ? Object.fromEntries(CASH_SERVICES.map((s) => [s.key, notesTotal(form.tithe[s.key])])) : {}
  const offeringTotal = CASH_SERVICES.reduce((t, s) => t + (totals[s.key] || 0), 0)
  const titheTotal = CASH_SERVICES.reduce((t, s) => t + (titheTotals[s.key] || 0), 0)
  const otherTotal = form ? form.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0) : 0
  const grand = offeringTotal + titheTotal + otherTotal
  const setAsideTotal = form ? CASH_SET_ASIDE_FUNDS.reduce((t, f) => t + (Number(form.setAside[f]) || 0), 0) : 0
  const setAsideTooMuch = setAsideTotal > offeringTotal
  const setLine = (id, patch) => setForm((f) => ({ ...f, lines: f.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) }))
  const addLine = () => setForm((f) => ({ ...f, lines: [...f.lines, { id: `l${Date.now().toString(36)}${f.lines.length}`, category: f.lines.at(-1)?.category || 'Tithe - English', name: '', amount: '' }] }))
  const removeLine = (id) => setForm((f) => ({ ...f, lines: f.lines.filter((l) => l.id !== id) }))
  const setFund = (fund, v) => setForm((f) => ({ ...f, setAside: { ...f.setAside, [fund]: v.replace(/[^\d.]/g, '') } }))

  async function submit() {
    if (setAsideTooMuch) {
      setMsg({ type: 'error', text: `The amount set aside (${inr(setAsideTotal)}) is more than the offering counted (${inr(offeringTotal)}).` })
      return
    }
    setBusy(true); setMsg(null)
    try {
      const svc = (notes) => ({ notes: Object.fromEntries(Object.entries(notes).map(([d, v]) => [d, Number(v) || 0])), total: notesTotal(notes) })
      await saveOfferingCashCount(iso, {
        english: svc(form.english),
        tamil: svc(form.tamil),
        tithe: Object.fromEntries(CASH_SERVICES.map((s) => [s.key, svc(form.tithe[s.key])])),
        setAside: Object.fromEntries(CASH_SET_ASIDE_FUNDS.map((f) => [f, Number(form.setAside[f]) || 0])),
        countedBy: form.countedBy.trim(),
        lines: form.lines
          .filter((l) => Number(l.amount) > 0)
          .map((l) => ({ id: l.id, category: l.category, name: String(l.name || '').trim(), amount: Number(l.amount) })),
        submittedBy: myName,
        submittedByUid: uid,
      })
      setMsg({ type: 'ok', text: `Submitted · ${inr(grand)} for ${format(parseISO(iso), 'dd/MM/yyyy')}. Accounts will confirm it.` })
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
            ? `Confirmed by Accounts${saved.confirmedBy ? ` (${saved.confirmedBy})` : ''}${saved.confirmedAt ? ` on ${format(saved.confirmedAt, 'dd/MM/yyyy, h:mm a')}` : ''}. It can no longer be changed here.`
            : `Submitted${saved.submittedBy ? ` by ${saved.submittedBy}` : ''}${saved.updatedAt ? ` · last updated ${format(saved.updatedAt, 'dd/MM/yyyy, h:mm a')}` : ''}. Waiting for Accounts to confirm; you can still correct it.`}
        </div>
      )}

      {!form ? (
        <p className="text-sm text-slate-500 text-center py-8">Loading…</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {CASH_SERVICES.map((s) => {
              const type = mode[s.key]
              const notes = notesFor(s.key, type)
              return (
                <section key={s.key} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className={`px-4 py-3 border-b border-slate-100 space-y-2 ${type === 'tithe' ? 'bg-amber-50/70' : 'bg-emerald-50/70'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-sm font-bold text-slate-800">{s.label}</h2>
                      <p className={`text-base font-bold tabular-nums ${type === 'tithe' ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {inr(type === 'tithe' ? titheTotals[s.key] : totals[s.key])}
                      </p>
                    </div>
                    {/* Offering / Tithe: which cash this card is counting. Each keeps its own notes. */}
                    <div role="group" aria-label={`${s.label}: what you're counting`} className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex rounded-lg bg-white border border-slate-200 p-0.5">
                        {CASH_COUNT_TYPES.map((t) => (
                          <button key={t.key} type="button" aria-pressed={type === t.key}
                            onClick={() => setMode((m) => ({ ...m, [s.key]: t.key }))}
                            className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${
                              type === t.key
                                ? (t.key === 'tithe' ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white')
                                : 'text-slate-500 hover:text-slate-800'
                            }`}>
                            {t.label}
                          </button>
                        ))}
                      </div>
                      <span className="text-[11px] text-slate-500 tabular-nums">
                        Offering {inr(totals[s.key])} · Tithe {inr(titheTotals[s.key])}
                      </span>
                    </div>
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
                        const n = Number(notes[String(d)]) || 0
                        return (
                          <tr key={d}>
                            <td className="px-4 py-1.5 font-semibold text-slate-700 tabular-nums">₹{d}</td>
                            <td className="px-4 py-1.5">
                              <input
                                inputMode="numeric"
                                aria-label={`${s.label} ${type} ₹${d} count`}
                                value={notes[String(d)]}
                                disabled={confirmed}
                                onChange={(e) => setNote(s.key, type, String(d), e.target.value)}
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
              )
            })}
          </div>

          {/* Part of the offering separated into savings funds while counting. */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-3 bg-indigo-50/70 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5"><PiggyBank size={16} className="text-indigo-600" /> Set aside from offering</h2>
              <p className="text-base font-bold tabular-nums text-indigo-700">{inr(setAsideTotal)}</p>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-slate-500">
                Separate part of the offering ({inr(offeringTotal)}) for a fund. The full offering is still recorded as income;
                each amount is added to that fund in Savings when Accounts confirms the count.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {CASH_SET_ASIDE_FUNDS.map((f) => (
                  <label key={f} className="text-xs font-semibold text-slate-600">{f} (₹)
                    <input inputMode="decimal" value={form.setAside[f]} disabled={confirmed} placeholder="0"
                      onChange={(e) => setFund(f, e.target.value)}
                      className={`${input} mt-1 tabular-nums`} />
                  </label>
                ))}
              </div>
              {setAsideTooMuch ? (
                <p className="text-xs font-semibold text-red-600">More than the offering counted ({inr(offeringTotal)}). Please check the amounts.</p>
              ) : setAsideTotal > 0 && (
                <p className="text-xs text-slate-600">Offering left after setting aside: <b className="tabular-nums">{inr(offeringTotal - setAsideTotal)}</b></p>
              )}
            </div>
          </section>

          {/* Other cash received: named tithe envelopes, contributions, … one line each. */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-3 bg-emerald-50/70 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800">Other cash received <span className="font-normal text-slate-500">(named tithe envelopes, contribution, …)</span></h2>
              <p className="text-base font-bold tabular-nums text-emerald-700">{inr(otherTotal)}</p>
            </div>
            {form.lines.length > 0 && (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-50">
                    <th className="px-4 py-2 text-left w-48">Income</th>
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-left w-32">Amount (₹)</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {form.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-4 py-1.5">
                        <select value={l.category} disabled={confirmed} onChange={(e) => setLine(l.id, { category: e.target.value })} aria-label="Income"
                          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm disabled:bg-slate-50">
                          {OTHER_CASH_GROUPS.map((g) => (
                            <optgroup key={g.label} label={g.label}>
                              {g.categories.map((c) => <option key={c} value={c}>{c}</option>)}
                            </optgroup>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-1.5">
                        <input value={l.name} disabled={confirmed} onChange={(e) => setLine(l.id, { name: e.target.value })} placeholder="Giver's name" aria-label="Name"
                          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50" />
                      </td>
                      <td className="px-4 py-1.5">
                        <input inputMode="decimal" value={l.amount} disabled={confirmed} onChange={(e) => setLine(l.id, { amount: e.target.value.replace(/[^\d.]/g, '') })} placeholder="0" aria-label="Amount"
                          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm tabular-nums disabled:bg-slate-50" />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {!confirmed && (
                          <button type="button" onClick={() => removeLine(l.id)} aria-label="Remove line" className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
            {!confirmed && (
              <button type="button" onClick={addLine}
                className="w-full flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-emerald-700 hover:bg-emerald-50/50 border-t border-slate-100">
                <Plus size={14} /> Add line
              </button>
            )}
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600">Counted by
              <input value={form.countedBy} disabled={confirmed} onChange={(e) => setForm((f) => ({ ...f, countedBy: e.target.value }))} className={`${input} mt-1`} />
            </label>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3">
            <div className="text-sm text-slate-600 space-y-0.5">
              <p>
                Offering <b className="tabular-nums">{inr(offeringTotal)}</b> · Tithe <b className="tabular-nums">{inr(titheTotal)}</b> · Other <b className="tabular-nums">{inr(otherTotal)}</b> · <span className="text-slate-900 font-bold">Total <span className="tabular-nums">{inr(grand)}</span></span>
              </p>
              {setAsideTotal > 0 && (
                <p className="text-xs text-indigo-700">
                  Set aside: {CASH_SET_ASIDE_FUNDS.filter((f) => Number(form.setAside[f]) > 0).map((f) => `${f} ${inr(form.setAside[f])}`).join(' · ')}
                </p>
              )}
            </div>
            {!confirmed && (
              <button type="button" onClick={submit} disabled={busy || setAsideTooMuch}
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
