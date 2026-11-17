import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  getMissionTripByToken, getMissionTripGuestPublic, addMissionTripGuestPublic, updateMissionTripGuestPublic,
} from '../services/firestore'
import {
  kindOf, statusOf, sortItems, tripDays, dayLabel, fullDate, formatTime, answerablePrompts,
} from '../utils/missionTrip'

/**
 * Public mission-team page — /mission-trip?token=…
 * SP Office sends this one link to the whole visiting team. Each member sees the plan
 * (programs, stay, travel), adds themselves and answers the office's questions (food
 * preference etc.). Their entry id is remembered on this device so they can come back
 * and change their answers. Rules: firestore.rules → mission_trips.
 */
const EMPTY_GUEST = {
  name: '', email: '', phone: '', arrivalFlight: '', arrivalAt: '', arrivalAirport: '',
  departureFlight: '', departureAt: '', dietary: '', notes: '', answers: {},
}
const storeKey = (token) => `rol_mission_guest_${token}`
const readStored = (token) => { try { return localStorage.getItem(storeKey(token)) || '' } catch { return '' } }
const writeStored = (token, id) => { try { id ? localStorage.setItem(storeKey(token), id) : localStorage.removeItem(storeKey(token)) } catch { /* private mode */ } }

const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400'

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-400 mt-1">{hint}</span>}
    </label>
  )
}

function Section({ title, children }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-3">
      <h2 className="text-base font-bold text-slate-800">{title}</h2>
      {children}
    </section>
  )
}

function ItemRow({ item }) {
  const k = kindOf(item.kind)
  const s = statusOf(item.status)
  return (
    <li className="flex gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <div className="w-16 shrink-0 text-xs font-semibold text-slate-500 pt-0.5">
        {item.time ? formatTime(item.time) : '—'}
        {item.endTime && <span className="block font-normal text-slate-400">to {formatTime(item.endTime)}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800">
          <span className="mr-1">{k.emoji}</span>{item.title || k.label}
        </p>
        <span className={`inline-block mt-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>{s.label}</span>
        {item.location && <p className="text-xs text-slate-500 mt-1">📍 {item.location}</p>}
        {item.kind === 'travel' && (item.vehicle || item.driver) && (
          <p className="text-xs text-slate-500 mt-1">
            🚐 {[item.vehicle, item.driver && `Driver: ${item.driver}`, item.driverPhone].filter(Boolean).join(' · ')}
          </p>
        )}
        {item.notes && <p className="text-xs text-slate-600 mt-1 whitespace-pre-line">{item.notes}</p>}
      </div>
    </li>
  )
}

function PromptInput({ prompt, value, onChange }) {
  const v = value || { choices: [], other: '' }
  const toggle = (opt) => {
    const has = v.choices.includes(opt)
    const choices = prompt.multi
      ? (has ? v.choices.filter((c) => c !== opt) : [...v.choices, opt])
      : (has ? [] : [opt])
    onChange({ ...v, choices })
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">{prompt.text}</p>
      {prompt.options?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {prompt.options.map((opt) => {
            const on = v.choices.includes(opt)
            return (
              <button key={opt} type="button" onClick={() => toggle(opt)}
                className={`rounded-full border px-3 py-1.5 text-sm ${on ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                {on ? '✓ ' : ''}{opt}
              </button>
            )
          })}
        </div>
      )}
      {prompt.options?.length > 0 && <p className="text-xs text-slate-400">{prompt.multi ? 'Pick as many as you like.' : 'Pick one.'}</p>}
      {prompt.allowOther !== false && (
        <textarea rows={2} value={v.other} onChange={(e) => onChange({ ...v, other: e.target.value })}
          placeholder={prompt.options?.length ? 'Anything else? Type your own suggestion' : 'Type your suggestion'} className={inputCls} />
      )}
    </div>
  )
}

export default function MissionTripPlan() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [trip, setTrip] = useState(null)
  const [state, setState] = useState(token ? 'loading' : 'invalid') // loading | ready | invalid | error
  const [guestId, setGuestId] = useState(() => (token ? readStored(token) : ''))
  const [form, setForm] = useState(EMPTY_GUEST)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    let alive = true
    ;(async () => {
      try {
        const t = await getMissionTripByToken(token)
        if (!alive) return
        if (!t || !t.linkActive) { setState('invalid'); return }
        setTrip(t)
        const stored = readStored(token)
        if (stored) {
          const g = await getMissionTripGuestPublic(token, stored).catch(() => null)
          if (!alive) return
          if (g) setForm({ ...EMPTY_GUEST, ...g, answers: g.answers || {} })
          else { writeStored(token, ''); setGuestId('') }
        }
        setState('ready')
      } catch (err) {
        if (alive) setState(err?.code === 'permission-denied' ? 'invalid' : 'error')
      }
    })()
    return () => { alive = false }
  }, [token])

  const prompts = useMemo(() => answerablePrompts(trip), [trip])
  const days = useMemo(() => tripDays(trip?.startDate, trip?.endDate), [trip])
  const items = useMemo(() => sortItems(trip?.items), [trip])
  const undated = items.filter((i) => !i.date || !days.includes(i.date))

  const set = (k) => (e) => { setSaved(false); setForm((f) => ({ ...f, [k]: e.target.value })) }
  const setAnswer = (id, v) => { setSaved(false); setForm((f) => ({ ...f, answers: { ...f.answers, [id]: v } })) }

  async function save(e) {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) { setError('Please enter your name.'); return }
    setSaving(true)
    try {
      if (guestId) {
        await updateMissionTripGuestPublic(token, guestId, form)
      } else {
        const id = await addMissionTripGuestPublic(token, form)
        writeStored(token, id)
        setGuestId(id)
      }
      setSaved(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      console.error('mission trip save failed:', err)
      setError('Could not save. Please check your internet connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  function addAnother() {
    writeStored(token, '')
    setGuestId('')
    setForm(EMPTY_GUEST)
    setSaved(false)
    document.getElementById('your-details')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-slate-400">River Of Life Church · Bangalore</p>

        {state === 'loading' && <p className="text-center text-sm text-slate-400 py-24">Loading…</p>}
        {state === 'invalid' && (
          <div className="text-center py-24 space-y-2">
            <h2 className="text-lg font-bold text-slate-800">This link is no longer active</h2>
            <p className="text-sm text-slate-500 max-w-xs mx-auto">Please ask the church office for a new link.</p>
          </div>
        )}
        {state === 'error' && (
          <div className="text-center py-24 space-y-2">
            <h2 className="text-lg font-bold text-slate-800">Could not open the plan</h2>
            <p className="text-sm text-slate-500">Check your internet connection and reload the page.</p>
          </div>
        )}

        {state === 'ready' && trip && (
          <>
            <header className="rounded-2xl bg-indigo-600 text-white p-5 shadow-sm">
              <h1 className="text-xl font-bold">{trip.title || 'Mission Trip'}</h1>
              {trip.teamName && <p className="text-indigo-100 text-sm mt-0.5">{trip.teamName}{trip.origin ? ` · from ${trip.origin}` : ''}</p>}
              {trip.startDate && (
                <p className="text-sm mt-2 font-medium">{fullDate(trip.startDate)}{trip.endDate && trip.endDate !== trip.startDate ? ` – ${fullDate(trip.endDate)}` : ''}</p>
              )}
              {trip.welcomeNote && <p className="text-sm text-indigo-50 mt-3 whitespace-pre-line">{trip.welcomeNote}</p>}
              {(trip.hostName || trip.hostPhone) && (
                <p className="text-sm mt-3">
                  Your contact here: <b>{trip.hostName}</b>
                  {trip.hostPhone && <> · <a className="underline" href={`tel:${trip.hostPhone}`}>{trip.hostPhone}</a></>}
                </p>
              )}
            </header>

            {saved && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 space-y-2">
                <p className="font-semibold">Thank you, {form.name.trim().split(' ')[0]}! Your details are saved.</p>
                <p>You can open this link again on this phone any time to change your answers.</p>
                <button type="button" onClick={addAnother} className="text-emerald-700 font-semibold underline">
                  Filling for someone else on this phone? Add another team member
                </button>
              </div>
            )}

            <Section title="Trip plan">
              {items.length === 0 && <p className="text-sm text-slate-400">The programme will appear here soon.</p>}
              {days.map((d) => {
                const list = items.filter((i) => i.date === d)
                if (!list.length) return null
                return (
                  <div key={d}>
                    <p className="text-xs font-bold uppercase tracking-wide text-indigo-600 mt-2">{dayLabel(d)}</p>
                    <ul>{list.map((i) => <ItemRow key={i.id} item={i} />)}</ul>
                  </div>
                )
              })}
              {undated.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mt-2">Date to be fixed</p>
                  <ul>{undated.map((i) => <ItemRow key={i.id} item={i} />)}</ul>
                </div>
              )}
            </Section>

            {(trip.stayName || trip.stayAddress || trip.stayNotes) && (
              <Section title="Where you will stay">
                {trip.stayName && <p className="text-sm font-semibold text-slate-800">{trip.stayName}</p>}
                {trip.stayAddress && <p className="text-sm text-slate-600 whitespace-pre-line">{trip.stayAddress}</p>}
                {(trip.stayCheckIn || trip.stayCheckOut) && (
                  <p className="text-sm text-slate-600">
                    {trip.stayCheckIn && <>Check-in: <b>{fullDate(trip.stayCheckIn)}</b></>}
                    {trip.stayCheckIn && trip.stayCheckOut && ' · '}
                    {trip.stayCheckOut && <>Check-out: <b>{fullDate(trip.stayCheckOut)}</b></>}
                  </p>
                )}
                {trip.stayMapLink && <a href={trip.stayMapLink} target="_blank" rel="noreferrer" className="inline-block text-sm font-semibold text-indigo-600 underline">Open in Maps</a>}
                {trip.stayNotes && <p className="text-sm text-slate-600 whitespace-pre-line">{trip.stayNotes}</p>}
              </Section>
            )}

            <form id="your-details" onSubmit={save} className="space-y-4">
              <Section title={guestId ? 'Your details (saved, you can change them)' : 'Tell us about you'}>
                <p className="text-xs text-slate-500">Each team member, please fill this once for yourself.</p>
                <Field label="Your full name *">
                  <input value={form.name} onChange={set('name')} className={inputCls} placeholder="Full name" />
                </Field>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Phone / WhatsApp"><input value={form.phone} onChange={set('phone')} inputMode="tel" className={inputCls} placeholder="+1 …" /></Field>
                  <Field label="Email"><input type="email" value={form.email} onChange={set('email')} className={inputCls} /></Field>
                </div>
              </Section>

              <Section title="Your flights">
                <p className="text-xs text-slate-500">So we can pick you up from the airport and drop you back. Times are local India time.</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Arrival flight number"><input value={form.arrivalFlight} onChange={set('arrivalFlight')} className={inputCls} placeholder="e.g. EK 568" /></Field>
                  <Field label="Arrival date & time"><input type="datetime-local" value={form.arrivalAt} onChange={set('arrivalAt')} className={inputCls} /></Field>
                  <Field label="Arriving at (airport)" hint="Usually Bengaluru (BLR)"><input value={form.arrivalAirport} onChange={set('arrivalAirport')} className={inputCls} placeholder="BLR" /></Field>
                  <div className="hidden sm:block" />
                  <Field label="Departure flight number"><input value={form.departureFlight} onChange={set('departureFlight')} className={inputCls} /></Field>
                  <Field label="Departure date & time"><input type="datetime-local" value={form.departureAt} onChange={set('departureAt')} className={inputCls} /></Field>
                </div>
              </Section>

              <Section title="Food & your suggestions">
                <Field label="Allergies or dietary needs" hint="e.g. no nuts, gluten-free, diabetic, vegetarian">
                  <textarea rows={2} value={form.dietary} onChange={set('dietary')} className={inputCls} />
                </Field>
                {prompts.map((p) => (
                  <div key={p.id} className="pt-3 border-t border-slate-100">
                    <PromptInput prompt={p} value={form.answers?.[p.id]} onChange={(v) => setAnswer(p.id, v)} />
                  </div>
                ))}
                <div className="pt-3 border-t border-slate-100">
                  <Field label="Anything else we should know?">
                    <textarea rows={3} value={form.notes} onChange={set('notes')} className={inputCls} />
                  </Field>
                </div>
              </Section>

              {error && <p className="text-sm text-red-600 text-center">{error}</p>}
              <button type="submit" disabled={saving}
                className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50">
                {saving ? 'Saving…' : guestId ? 'Update my details' : 'Submit my details'}
              </button>
              {guestId && (
                <button type="button" onClick={addAnother} className="w-full text-sm text-slate-500 underline">
                  Not you? Add another team member
                </button>
              )}
            </form>
          </>
        )}
      </div>
    </div>
  )
}
