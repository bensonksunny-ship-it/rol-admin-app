import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowLeft, Plus, X, Pencil, Trash2, Copy, Check, Send, ExternalLink, Plane, Link2, Users, CalendarDays, HelpCircle, Hotel, FileDown, ImageOff, Loader2,
} from 'lucide-react'
import {
  subscribeToMissionTrips, createMissionTrip, updateMissionTrip, deleteMissionTrip,
  subscribeToMissionTripGuests, updateMissionTripGuest, deleteMissionTripGuest,
  addMissionItemPhoto, removeMissionItemPhoto, deleteMissionPhotoFiles, clearMissionTripPhotos, MISSION_PHOTO_LIMIT,
  setMissionItemCompletion, removeMissionGuestPhoto,
} from '../../services/firestore'
import {
  ITEM_KINDS, ITEM_STATUSES, kindOf, newId, defaultQuestions, tripDays, dayLabel, fullDate,
  formatDateTime, sortItems, answerablePrompts, missionTripLink, whatsappShareHref,
  missionInviteMessage, parseOptions, todayIso, compressImage, isFoodItem, ratingSummary, isItemDue, tourProgress,
} from '../../utils/missionTrip'
import DateInput from '../../components/DateInput'
import { DayAccordion, ScheduleBlock, RatingBadge, CompletionPrompt, GuestPhotos, TourProgress } from '../../components/mission/TripSchedule'
import { downloadTravelDiary } from '../../utils/missionTravelDiary'

/**
 * SP Office → Mission Trips: plan a visiting mission team's stay (e.g. a team from the
 * USA). The office builds the day-by-day plan (confirmed / tentative / "your suggestion
 * wanted"), stay and local travel, asks questions (food preference…) and sends ONE link
 * to the team. Each member adds themselves on /mission-trip and answers; their flights,
 * dietary needs and suggestions come back here under Responses.
 * Managed by SP Office, Administration and the Founder (firestore.rules → mission_trips).
 */

const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400'

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-600 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-slate-400 mt-1">{hint}</span>}
    </label>
  )
}

function Modal({ title, onClose, children, footer }) {
  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-lg max-h-[92vh] flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-3">
          <h3 className="flex-1 font-semibold text-slate-800">{title}</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

const btn = 'px-3 py-2 rounded-lg text-sm font-semibold'
const btnPrimary = `${btn} bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50`
const btnGhost = `${btn} border border-slate-200 text-slate-600 hover:bg-slate-50`

// ─── Trip basics (create / edit) ────────────────────────────────────────────────
function TripModal({ trip, onClose, onSave }) {
  const [f, setF] = useState({
    title: trip?.title || 'Mission Trip',
    teamName: trip?.teamName || '',
    origin: trip?.origin ?? 'USA',
    startDate: trip?.startDate || '',
    endDate: trip?.endDate || '',
    hostName: trip?.hostName || '',
    hostPhone: trip?.hostPhone || '',
    welcomeNote: trip?.welcomeNote || '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))
  async function submit() {
    if (!f.title.trim()) { setErr('Give the trip a name.'); return }
    if (f.startDate && f.endDate && f.endDate < f.startDate) { setErr('End date is before the start date.'); return }
    setSaving(true)
    try { await onSave({ ...f, title: f.title.trim(), teamName: f.teamName.trim() }) } catch (e) { console.error(e); setErr(`Could not save (${e?.code || e?.message}).`); setSaving(false) }
  }
  return (
    <Modal title={trip ? 'Edit trip details' : 'New mission trip'} onClose={onClose}
      footer={<><button type="button" onClick={onClose} className={btnGhost}>Cancel</button><button type="button" onClick={submit} disabled={saving} className={btnPrimary}>{saving ? 'Saving…' : 'Save'}</button></>}>
      <Field label="Trip name *"><input value={f.title} onChange={set('title')} className={inputCls} placeholder="e.g. USA Mission Team 2026" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Team / church name"><input value={f.teamName} onChange={set('teamName')} className={inputCls} placeholder="e.g. Grace Church, Texas" /></Field>
        <Field label="Coming from"><input value={f.origin} onChange={set('origin')} className={inputCls} /></Field>
        <Field label="Arrives"><DateInput value={f.startDate} onChange={set('startDate')} className={inputCls} /></Field>
        <Field label="Leaves"><DateInput value={f.endDate} onChange={set('endDate')} className={inputCls} /></Field>
        <Field label="Our contact person"><input value={f.hostName} onChange={set('hostName')} className={inputCls} /></Field>
        <Field label="Contact phone"><input value={f.hostPhone} onChange={set('hostPhone')} inputMode="tel" className={inputCls} placeholder="+91 …" /></Field>
      </div>
      <Field label="Welcome note" hint="Shown at the top of the team's page">
        <textarea rows={3} value={f.welcomeNote} onChange={set('welcomeNote')} className={inputCls} />
      </Field>
      {err && <p className="text-sm text-red-600">{err}</p>}
    </Modal>
  )
}

// ─── One plan item (program / meal / travel …) ──────────────────────────────────
function ItemModal({ item, days, defaultDate, onClose, onSave, onDelete }) {
  const [f, setF] = useState({
    date: item?.date ?? defaultDate ?? '',
    time: item?.time || '',
    endTime: item?.endTime || '',
    kind: item?.kind || 'meeting',
    title: item?.title || '',
    location: item?.location || '',
    incharge: item?.incharge || '',
    status: item?.status || 'confirmed',
    notes: item?.notes || '',
    vehicle: item?.vehicle || '',
    driver: item?.driver || '',
    driverPhone: item?.driverPhone || '',
    question: item?.question || '',
    optionsText: (item?.options || []).join(', '),
    multi: !!item?.multi,
  })
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const [saving, setSaving] = useState(false)
  async function submit() {
    setSaving(true)
    const { optionsText, ...rest } = f
    const out = { id: item?.id || newId(), ...rest, title: rest.title.trim(), incharge: rest.incharge.trim(), options: parseOptions(optionsText) }
    if (out.kind !== 'travel') { out.vehicle = ''; out.driver = ''; out.driverPhone = '' }
    if (out.status !== 'suggest') { out.question = ''; out.options = []; out.multi = false }
    try { await onSave(out) } catch (e) { console.error(e); alert('Could not save.'); setSaving(false) }
  }
  return (
    <Modal title={item ? 'Edit plan item' : 'Add to the plan'} onClose={onClose}
      footer={<>
        {item && <button type="button" onClick={onDelete} className={`${btn} text-red-600 hover:bg-red-50 mr-auto`}>Delete</button>}
        <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
        <button type="button" onClick={submit} disabled={saving} className={btnPrimary}>{saving ? 'Saving…' : 'Save'}</button>
      </>}>
      <div className="flex flex-wrap gap-1.5">
        {ITEM_KINDS.map((k) => (
          <button key={k.key} type="button" onClick={() => setF((p) => ({ ...p, kind: k.key }))}
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${f.kind === k.key ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 text-slate-600'}`}>
            {k.emoji} {k.label}
          </button>
        ))}
      </div>
      <Field label="Title"><input value={f.title} onChange={set('title')} className={inputCls} placeholder={f.kind === 'meal' ? 'e.g. Dinner' : f.kind === 'travel' ? 'e.g. Airport pickup' : 'e.g. Leaders meeting'} /></Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Day">
          <select value={f.date} onChange={set('date')} className={inputCls}>
            <option value="">Not fixed</option>
            {days.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
          </select>
        </Field>
        <Field label="From"><input type="time" value={f.time} onChange={set('time')} className={inputCls} /></Field>
        <Field label="To"><input type="time" value={f.endTime} onChange={set('endTime')} className={inputCls} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Place"><input value={f.location} onChange={set('location')} className={inputCls} /></Field>
        <Field label="In charge"><input value={f.incharge} onChange={set('incharge')} className={inputCls} placeholder="Who leads / initiates this" /></Field>
      </div>
      <Field label="Status">
        <div className="flex flex-wrap gap-1.5">
          {ITEM_STATUSES.map((s) => (
            <button key={s.key} type="button" onClick={() => setF((p) => ({ ...p, status: s.key }))}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold border ${f.status === s.key ? `${s.cls} border-transparent ring-2 ring-offset-1 ring-indigo-400` : 'border-slate-200 text-slate-500'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </Field>
      {f.status === 'suggest' && (
        <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-3 space-y-3">
          <p className="text-xs text-indigo-700">The team will be asked for their suggestion on this item.</p>
          <Field label="Question to the team" hint="Leave blank to use: “<title>: what would you suggest?”">
            <input value={f.question} onChange={set('question')} className={inputCls} placeholder="e.g. What would you like for dinner on Saturday?" />
          </Field>
          <Field label="Options to choose from (optional)" hint="Separate with commas. They can always type their own idea too.">
            <textarea rows={2} value={f.optionsText} onChange={set('optionsText')} className={inputCls} placeholder="Biryani, Pizza, Kerala meals" />
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={f.multi} onChange={set('multi')} /> They can pick more than one</label>
        </div>
      )}
      {f.kind === 'travel' && (
        <div className="grid grid-cols-3 gap-3">
          <Field label="Vehicle"><input value={f.vehicle} onChange={set('vehicle')} className={inputCls} placeholder="Tempo Traveller" /></Field>
          <Field label="Driver"><input value={f.driver} onChange={set('driver')} className={inputCls} /></Field>
          <Field label="Driver phone"><input value={f.driverPhone} onChange={set('driverPhone')} inputMode="tel" className={inputCls} /></Field>
        </div>
      )}
      <Field label="Notes for the team"><textarea rows={2} value={f.notes} onChange={set('notes')} className={inputCls} /></Field>
    </Modal>
  )
}

// ─── A general question (food preference …) ─────────────────────────────────────
function QuestionModal({ question, onClose, onSave, onDelete }) {
  const [text, setText] = useState(question?.text || '')
  const [optionsText, setOptionsText] = useState((question?.options || []).join('\n'))
  const [multi, setMulti] = useState(question ? !!question.multi : true)
  const [allowOther, setAllowOther] = useState(question ? question.allowOther !== false : true)
  const submit = () => {
    if (!text.trim()) return
    onSave({ id: question?.id || newId(), text: text.trim(), options: parseOptions(optionsText), multi, allowOther })
  }
  return (
    <Modal title={question ? 'Edit question' : 'Ask the team'} onClose={onClose}
      footer={<>
        {question && <button type="button" onClick={onDelete} className={`${btn} text-red-600 hover:bg-red-50 mr-auto`}>Delete</button>}
        <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
        <button type="button" onClick={submit} disabled={!text.trim()} className={btnPrimary}>Save</button>
      </>}>
      <Field label="Question"><input value={text} onChange={(e) => setText(e.target.value)} className={inputCls} placeholder="e.g. What kind of food do you prefer?" /></Field>
      <Field label="Options (one per line or comma-separated)" hint="Leave empty for a free-text answer">
        <textarea rows={5} value={optionsText} onChange={(e) => setOptionsText(e.target.value)} className={inputCls} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} /> They can pick more than one</label>
      <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={allowOther} onChange={(e) => setAllowOther(e.target.checked)} /> Let them type their own suggestion</label>
    </Modal>
  )
}

// ─── Stay ───────────────────────────────────────────────────────────────────────
function StayTab({ trip }) {
  const [f, setF] = useState({
    stayName: trip.stayName || '', stayAddress: trip.stayAddress || '', stayMapLink: trip.stayMapLink || '',
    stayCheckIn: trip.stayCheckIn || '', stayCheckOut: trip.stayCheckOut || '', stayNotes: trip.stayNotes || '',
  })
  const [state, setState] = useState('')
  const set = (k) => (e) => { setState(''); setF((p) => ({ ...p, [k]: e.target.value })) }
  async function save() {
    setState('saving')
    try { await updateMissionTrip(trip.id, f); setState('saved') } catch (e) { console.error(e); setState('error') }
  }
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <Field label="Hotel / guest house"><input value={f.stayName} onChange={set('stayName')} className={inputCls} /></Field>
      <Field label="Address"><textarea rows={2} value={f.stayAddress} onChange={set('stayAddress')} className={inputCls} /></Field>
      <Field label="Google Maps link"><input value={f.stayMapLink} onChange={set('stayMapLink')} className={inputCls} placeholder="https://maps.app.goo.gl/…" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Check-in"><DateInput value={f.stayCheckIn} onChange={set('stayCheckIn')} className={inputCls} /></Field>
        <Field label="Check-out"><DateInput value={f.stayCheckOut} onChange={set('stayCheckOut')} className={inputCls} /></Field>
      </div>
      <Field label="Notes for the team" hint="Wi-Fi, breakfast time, what to bring…"><textarea rows={3} value={f.stayNotes} onChange={set('stayNotes')} className={inputCls} /></Field>
      <p className="text-xs text-slate-400">Room numbers for each person can be set under Responses.</p>
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={state === 'saving'} className={btnPrimary}>{state === 'saving' ? 'Saving…' : 'Save stay details'}</button>
        {state === 'saved' && <span className="text-sm text-emerald-600">Saved</span>}
        {state === 'error' && <span className="text-sm text-red-600">Could not save</span>}
      </div>
    </div>
  )
}

// ─── Responses from the team ────────────────────────────────────────────────────
function GuestCard({ trip, guest, prompts }) {
  const [room, setRoom] = useState(guest.room || '')
  const [pickupNote, setPickupNote] = useState(guest.pickupNote || '')
  const dirty = room !== (guest.room || '') || pickupNote !== (guest.pickupNote || '')
  const save = () => updateMissionTripGuest(trip.id, guest.id, { room: room.trim(), pickupNote: pickupNote.trim() }).catch((e) => { console.error(e); alert('Could not save.') })
  const remove = () => {
    if (!window.confirm(`Remove ${guest.name} from this trip?`)) return
    deleteMissionTripGuest(trip.id, guest.id).catch((e) => { console.error(e); alert('Could not remove.') })
  }
  const digits = String(guest.phone || '').replace(/\D/g, '')
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-800">{guest.name}</p>
          <p className="text-xs text-slate-500 break-all">
            {[guest.phone, guest.email].filter(Boolean).join(' · ') || 'No contact given'}
          </p>
        </div>
        {digits && <a href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-emerald-600 px-2 py-1 rounded-full hover:bg-emerald-50">WhatsApp</a>}
        <button type="button" onClick={remove} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50" aria-label="Remove"><Trash2 size={15} /></button>
      </div>
      <div className="grid sm:grid-cols-2 gap-2 text-xs">
        <p className="text-slate-600"><span className="font-semibold text-slate-500">Arrives:</span> {guest.arrivalAt ? `${formatDateTime(guest.arrivalAt)}` : '—'}{guest.arrivalFlight ? ` · ${guest.arrivalFlight}` : ''}{guest.arrivalAirport ? ` · ${guest.arrivalAirport}` : ''}</p>
        <p className="text-slate-600"><span className="font-semibold text-slate-500">Leaves:</span> {guest.departureAt ? formatDateTime(guest.departureAt) : '—'}{guest.departureFlight ? ` · ${guest.departureFlight}` : ''}</p>
      </div>
      {guest.dietary && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1">🍽️ {guest.dietary}</p>}
      {prompts.map((p) => {
        const a = guest.answers?.[p.id]
        if (!a || (!a.choices?.length && !String(a.other || '').trim())) return null
        return (
          <p key={p.id} className="text-xs text-slate-600">
            <span className="font-semibold text-slate-500">{p.text}</span> {[...(a.choices || []), a.other?.trim()].filter(Boolean).join(', ')}
          </p>
        )
      })}
      {guest.notes && <p className="text-xs text-slate-600 whitespace-pre-line"><span className="font-semibold text-slate-500">Notes:</span> {guest.notes}</p>}
      <div className="grid grid-cols-[1fr_2fr_auto] gap-2 pt-1">
        <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Room" className={inputCls} />
        <input value={pickupNote} onChange={(e) => setPickupNote(e.target.value)} placeholder="Pickup note (our use only)" className={inputCls} />
        <button type="button" onClick={save} disabled={!dirty} className={`${btn} bg-slate-800 text-white disabled:opacity-30`}>Save</button>
      </div>
    </div>
  )
}

function ResponsesTab({ trip, guests }) {
  const prompts = useMemo(() => answerablePrompts(trip), [trip])
  const arrivals = [...guests].filter((g) => g.arrivalAt || g.arrivalFlight).sort((a, b) => String(a.arrivalAt).localeCompare(String(b.arrivalAt)))
  const departures = [...guests].filter((g) => g.departureAt || g.departureFlight).sort((a, b) => String(a.departureAt).localeCompare(String(b.departureAt)))
  const dietary = guests.filter((g) => String(g.dietary || '').trim())

  if (!guests.length) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
        No one has filled the link yet. Send it to the team from the buttons above.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">✈️ Airport pickups</p>
          {arrivals.length === 0 ? <p className="text-sm text-slate-400">No arrival details yet.</p> : (
            <ul className="space-y-1">{arrivals.map((g) => (
              <li key={g.id} className="text-sm text-slate-700"><b>{formatDateTime(g.arrivalAt) || 'Time ?'}</b> · {g.name}{g.arrivalFlight ? ` · ${g.arrivalFlight}` : ''}</li>
            ))}</ul>
          )}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">🛫 Airport drops</p>
          {departures.length === 0 ? <p className="text-sm text-slate-400">No departure details yet.</p> : (
            <ul className="space-y-1">{departures.map((g) => (
              <li key={g.id} className="text-sm text-slate-700"><b>{formatDateTime(g.departureAt) || 'Time ?'}</b> · {g.name}{g.departureFlight ? ` · ${g.departureFlight}` : ''}</li>
            ))}</ul>
          )}
        </div>
      </div>

      {dietary.length > 0 && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-700 mb-2">Allergies & dietary needs</p>
          <ul className="space-y-1">{dietary.map((g) => <li key={g.id} className="text-sm text-amber-900"><b>{g.name}:</b> {g.dietary}</li>)}</ul>
        </div>
      )}

      {prompts.map((p) => {
        const counts = (p.options || []).map((opt) => ({ opt, names: guests.filter((g) => g.answers?.[p.id]?.choices?.includes(opt)).map((g) => g.name) }))
          .sort((a, b) => b.names.length - a.names.length)
        const others = guests.filter((g) => String(g.answers?.[p.id]?.other || '').trim())
        const max = Math.max(1, ...counts.map((c) => c.names.length))
        return (
          <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
            <p className="text-sm font-semibold text-slate-800">{p.text}</p>
            {counts.map((c) => (
              <div key={c.opt}>
                <div className="flex items-center justify-between text-xs text-slate-600"><span>{c.opt}</span><span className="font-semibold">{c.names.length}</span></div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-indigo-500" style={{ width: `${(c.names.length / max) * 100}%` }} /></div>
                {c.names.length > 0 && <p className="text-[11px] text-slate-400 mt-0.5">{c.names.join(', ')}</p>}
              </div>
            ))}
            {others.length > 0 && (
              <div className="pt-1 space-y-1">
                <p className="text-xs font-semibold text-slate-500">Their own suggestions</p>
                {others.map((g) => <p key={g.id} className="text-sm text-slate-700">“{g.answers[p.id].other.trim()}” <span className="text-xs text-slate-400">— {g.name}</span></p>)}
              </div>
            )}
            {!counts.some((c) => c.names.length) && !others.length && <p className="text-xs text-slate-400">No answers yet.</p>}
          </div>
        )
      })}

      <p className="text-xs font-bold uppercase tracking-wide text-slate-400 pt-2">Team members ({guests.length})</p>
      {guests.map((g) => <GuestCard key={`${g.id}_${g.updatedAt?.seconds || ''}`} trip={trip} guest={g} prompts={prompts} />)}
    </div>
  )
}

// ─── One trip ───────────────────────────────────────────────────────────────────
const SUBTABS = [
  { key: 'plan', label: 'Plan', Icon: CalendarDays },
  { key: 'questions', label: 'Questions', Icon: HelpCircle },
  { key: 'stay', label: 'Stay', Icon: Hotel },
  { key: 'responses', label: 'Responses', Icon: Users },
]

function TripDetail({ trip, onBack, userProfile }) {
  const [sub, setSub] = useState('plan')
  // Ticks every minute so cards ask "Was this done as planned?" as soon as their time passes.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60 * 1000); return () => clearInterval(t) }, [])
  const [guests, setGuests] = useState([])
  const [editTrip, setEditTrip] = useState(false)
  const [itemModal, setItemModal] = useState(null) // { item?, date? }
  const [questionModal, setQuestionModal] = useState(null) // { question? }
  const [copied, setCopied] = useState(false)

  useEffect(() => subscribeToMissionTripGuests(trip.id, setGuests), [trip.id])

  const days = useMemo(() => tripDays(trip.startDate, trip.endDate), [trip.startDate, trip.endDate])
  const items = useMemo(() => sortItems(trip.items), [trip.items])
  const undated = items.filter((i) => !i.date || !days.includes(i.date))
  const link = missionTripLink(trip.id)
  // Day accordions: collapsed by default; today's day starts open during the trip.
  const [openDays, setOpenDays] = useState(() => new Set([todayIso()]))
  const toggleDay = (d) => setOpenDays((prev) => { const n = new Set(prev); if (n.has(d)) n.delete(d); else n.add(d); return n })
  const allKeys = [...days, '__undated']
  const allOpen = allKeys.every((d) => openDays.has(d))
  const addTo = (d) => { setOpenDays((prev) => new Set(prev).add(d || '__undated')); setItemModal({ date: d }) }

  const saveItems = (next) => updateMissionTrip(trip.id, { items: next })
  const saveQuestions = (next) => updateMissionTrip(trip.id, { questions: next })

  async function upsertItem(it) {
    const list = trip.items || []
    await saveItems(list.some((x) => x.id === it.id) ? list.map((x) => (x.id === it.id ? { ...x, ...it } : x)) : [...list, it])
    setItemModal(null)
  }
  async function removeItem(it) {
    if (!window.confirm(`Delete “${it.title || kindOf(it.kind).label}” from the plan?`)) return
    const photos = (trip.items || []).find((x) => x.id === it.id)?.photos || []
    try {
      await saveItems((trip.items || []).filter((x) => x.id !== it.id))
      await deleteMissionPhotoFiles(photos) // free Storage too
    } catch { alert('Could not delete.') }
    setItemModal(null)
  }
  async function upsertQuestion(q) {
    const list = trip.questions || []
    await saveQuestions(list.some((x) => x.id === q.id) ? list.map((x) => (x.id === q.id ? q : x)) : [...list, q]).catch(() => alert('Could not save.'))
    setQuestionModal(null)
  }
  async function removeQuestion(q) {
    if (!window.confirm('Delete this question? Answers already given to it will no longer show.')) return
    await saveQuestions((trip.questions || []).filter((x) => x.id !== q.id)).catch(() => alert('Could not delete.'))
    setQuestionModal(null)
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { window.prompt('Copy this link:', link) }
  }
  const toggleLink = () => updateMissionTrip(trip.id, { linkActive: !trip.linkActive }).catch(() => alert('Could not change the link.'))
  async function removeTrip() {
    if (!window.confirm(`Delete “${trip.title}” and all ${guests.length} team responses? This cannot be undone.`)) return
    try { await deleteMissionTrip(trip.id); onBack() } catch (e) { console.error(e); alert('Could not delete the trip.') }
  }

  // ── Photos + Travel Diary ──
  const [photoBusy, setPhotoBusy] = useState({}) // { [itemId]: true }
  const [diaryState, setDiaryState] = useState('') // progress text while building the PDF
  const [clearing, setClearing] = useState(false)
  const photoCount = (trip.items || []).reduce((n, i) => n + (i.photos?.length || 0), 0)
    + guests.reduce((n, g) => n + Object.values(g.photos || {}).reduce((a, arr) => a + arr.length, 0), 0)
  const setBusy = (id, v) => setPhotoBusy((b) => ({ ...b, [id]: v }))
  async function addPhoto(it, file) {
    setBusy(it.id, true)
    try { await addMissionItemPhoto(trip.id, it.id, await compressImage(file)) }
    catch (e) { console.error(e); alert(e?.message || 'Could not add the photo.') }
    finally { setBusy(it.id, false) }
  }
  async function removePhoto(it, ph) {
    if (!window.confirm('Remove this photo? It is deleted permanently.')) return
    setBusy(it.id, true)
    try { await removeMissionItemPhoto(trip.id, it.id, ph) }
    catch (e) { console.error(e); alert('Could not remove the photo.') }
    finally { setBusy(it.id, false) }
  }
  async function downloadDiary() {
    setDiaryState('Preparing…')
    try {
      const r = await downloadTravelDiary(trip, { onProgress: setDiaryState, guests })
      if (r.missing) alert(`The PDF is downloaded, but ${r.missing} of ${r.photos} photos could not be added. Keep the photos until you have a complete copy.`)
    } catch (e) { console.error(e); alert('Could not create the Travel Diary PDF.') }
    finally { setDiaryState('') }
  }
  async function clearPhotos() {
    if (!window.confirm(`Delete all ${photoCount} photos of this trip from the app?

Download the Travel Diary PDF first — this cannot be undone.`)) return
    setClearing(true)
    try { await clearMissionTripPhotos(trip.id) } catch (e) { console.error(e); alert('Could not delete all photos.') }
    finally { setClearing(false) }
  }

  async function removeGuestPhoto(ph) {
    if (!window.confirm(`Remove ${ph.by}'s photo? It is deleted permanently.`)) return
    try { await removeMissionGuestPhoto(trip.id, ph.guestId, ph.itemId, ph) } catch (e) { console.error(e); alert('Could not remove the photo.') }
  }

  const renderItem = (it) => {
    const answers = it.status === 'suggest' ? guests.filter((g) => { const a = g.answers?.[it.id]; return a && (a.choices?.length || String(a.other || '').trim()) }).length : 0
    const teamPhotos = guests.flatMap((g) => (g.photos?.[it.id] || []).map((ph) => ({ ...ph, by: g.name || 'Guest', guestId: g.id, itemId: it.id })))
    return (
      <ScheduleBlock key={it.id} item={it} onClick={() => setItemModal({ item: it })}
        photoLimit={MISSION_PHOTO_LIMIT} photoBusy={!!photoBusy[it.id]}
        onAddPhoto={(f) => addPhoto(it, f)} onRemovePhoto={(ph) => removePhoto(it, ph)}
        footer={isItemDue(it, now) && <CompletionPrompt onSubmit={(r) => setMissionItemCompletion(trip.id, it.id, { ...r, by: userProfile?.name || userProfile?.email || '' })} />}
        extra={<>
          {it.status === 'suggest' && <p className="text-xs font-semibold text-indigo-600 mt-1.5">{answers} answered</p>}
          {isFoodItem(it) && <RatingBadge summary={ratingSummary(guests, it.id)} />}
          <GuestPhotos photos={teamPhotos} onRemove={removeGuestPhoto} />
        </>} />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <button type="button" onClick={onBack} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600" aria-label="Back"><ArrowLeft size={18} /></button>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-slate-800 truncate">{trip.title}</h2>
          <p className="text-xs text-slate-500">
            {[trip.teamName, trip.origin && `from ${trip.origin}`, trip.startDate && `${fullDate(trip.startDate)}${trip.endDate && trip.endDate !== trip.startDate ? ` – ${fullDate(trip.endDate)}` : ''}`].filter(Boolean).join(' · ') || 'Add the dates'}
          </p>
        </div>
        <button type="button" onClick={() => setEditTrip(true)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Edit trip"><Pencil size={16} /></button>
        <button type="button" onClick={removeTrip} className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600" aria-label="Delete trip"><Trash2 size={16} /></button>
      </div>

      <TourProgress progress={tourProgress(trip, now)} />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={downloadDiary} disabled={!!diaryState} className={`${btnPrimary} flex items-center gap-1.5`}>
          {diaryState ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />}
          {diaryState || 'Download Travel Diary PDF'}
        </button>
        {photoCount > 0 && (
          <button type="button" onClick={clearPhotos} disabled={clearing || !!diaryState} className={`${btnGhost} flex items-center gap-1.5 disabled:opacity-50`}>
            {clearing ? <Loader2 size={15} className="animate-spin" /> : <ImageOff size={15} />}
            {clearing ? 'Deleting…' : `Delete all ${photoCount} photos`}
          </button>
        )}
      </div>

      <div className={`rounded-xl border p-3 space-y-2 ${trip.linkActive ? 'bg-indigo-50 border-indigo-100' : 'bg-slate-100 border-slate-200'}`}>
        <div className="flex items-center gap-2">
          <Link2 size={16} className={trip.linkActive ? 'text-indigo-600' : 'text-slate-400'} />
          <p className="flex-1 text-sm font-semibold text-slate-700">
            Team link {trip.linkActive ? <span className="text-emerald-600">· open</span> : <span className="text-slate-500">· closed</span>}
            <span className="font-normal text-slate-500"> · {guests.length} filled</span>
          </p>
          <button type="button" onClick={toggleLink} className="text-xs font-semibold text-slate-600 underline">{trip.linkActive ? 'Close link' : 'Re-open link'}</button>
        </div>
        {trip.linkActive && (
          <>
            <p className="text-xs text-slate-500 break-all">{link}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={copy} className={`${btn} bg-white border border-slate-200 text-slate-700 flex items-center gap-1.5`}>
                {copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}{copied ? 'Copied' : 'Copy link'}
              </button>
              <a href={whatsappShareHref(missionInviteMessage(trip, link))} target="_blank" rel="noreferrer" className={`${btn} bg-emerald-600 text-white flex items-center gap-1.5`}><Send size={15} /> WhatsApp</a>
              <a href={link} target="_blank" rel="noreferrer" className={`${btn} bg-white border border-slate-200 text-slate-700 flex items-center gap-1.5`}><ExternalLink size={15} /> See what they see</a>
            </div>
          </>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {SUBTABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setSub(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${sub === t.key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'}`}>
            <t.Icon size={15} /> {t.label}{t.key === 'responses' && guests.length ? ` (${guests.length})` : ''}
          </button>
        ))}
      </div>

      {sub === 'plan' && (
        <div className="space-y-3">
          {days.length === 0 && <p className="text-sm text-slate-500">Set the arrival and leaving dates (pencil above) to plan day by day.</p>}
          {days.length > 0 && (
            <div className="flex justify-end">
              <button type="button" onClick={() => setOpenDays(allOpen ? new Set() : new Set(allKeys))} className="text-xs font-semibold text-slate-500 hover:text-indigo-600">
                {allOpen ? 'Collapse all' : 'Expand all'}
              </button>
            </div>
          )}
          {days.map((d) => {
            const list = items.filter((i) => i.date === d)
            return (
              <DayAccordion key={d} label={dayLabel(d)} count={list.length} open={openDays.has(d)} onToggle={() => toggleDay(d)}
                isToday={d === todayIso()} action={<button type="button" onClick={() => addTo(d)} className="shrink-0 flex items-center gap-1 text-xs font-semibold text-indigo-600 px-2 py-1 rounded-full hover:bg-indigo-50"><Plus size={14} /> Add</button>}>
                {list.length === 0 ? <p className="text-xs text-slate-400">Nothing planned yet.</p> : list.map(renderItem)}
              </DayAccordion>
            )
          })}
          <DayAccordion label="Date not fixed yet" count={undated.length} muted open={openDays.has('__undated')} onToggle={() => toggleDay('__undated')}
            action={<button type="button" onClick={() => addTo('')} className="shrink-0 flex items-center gap-1 text-xs font-semibold text-indigo-600 px-2 py-1 rounded-full hover:bg-indigo-50"><Plus size={14} /> Add</button>}>
            {undated.length === 0 ? <p className="text-xs text-slate-400">Nothing here.</p> : undated.map(renderItem)}
          </DayAccordion>
          <p className="text-xs text-slate-400">Mark an item “Your suggestion wanted” to ask the team what they would like for it (e.g. a dinner or a free afternoon).</p>
        </div>
      )}

      {sub === 'questions' && (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">Every team member answers these on the link, along with their flights and dietary needs.</p>
          {(trip.questions || []).map((q) => (
            <button key={q.id} type="button" onClick={() => setQuestionModal({ question: q })} className="w-full text-left bg-white rounded-xl border border-slate-200 p-3 hover:bg-slate-50">
              <p className="text-sm font-semibold text-slate-800">{q.text}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {q.options?.length ? q.options.join(' · ') : 'Free-text answer'}
                {q.options?.length ? (q.multi ? ' · pick many' : ' · pick one') : ''}
                {q.options?.length && q.allowOther !== false ? ' · + own idea' : ''}
              </p>
            </button>
          ))}
          <button type="button" onClick={() => setQuestionModal({})} className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-indigo-300 py-3 text-sm font-semibold text-indigo-600 hover:bg-indigo-50"><Plus size={16} /> Add a question</button>
        </div>
      )}

      {sub === 'stay' && <StayTab key={trip.id} trip={trip} />}
      {sub === 'responses' && <ResponsesTab trip={trip} guests={guests} />}

      {editTrip && <TripModal trip={trip} onClose={() => setEditTrip(false)} onSave={async (f) => { await updateMissionTrip(trip.id, f); setEditTrip(false) }} />}
      {itemModal && (
        <ItemModal item={itemModal.item} defaultDate={itemModal.date} days={days} onClose={() => setItemModal(null)}
          onSave={upsertItem} onDelete={() => removeItem(itemModal.item)} />
      )}
      {questionModal && (
        <QuestionModal question={questionModal.question} onClose={() => setQuestionModal(null)}
          onSave={upsertQuestion} onDelete={() => removeQuestion(questionModal.question)} />
      )}
    </div>
  )
}

// ─── Trip list ──────────────────────────────────────────────────────────────────
export default function MissionTrips({ userProfile }) {
  const [trips, setTrips] = useState(null)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => subscribeToMissionTrips(setTrips, (e) => { setTrips([]); setError(e?.code === 'permission-denied' ? 'You do not have access to mission trips.' : 'Could not load mission trips.') }), [])

  const selected = trips?.find((t) => t.id === selectedId)
  if (selected) return <TripDetail trip={selected} userProfile={userProfile} onBack={() => setSelectedId('')} />

  async function create(f) {
    const id = await createMissionTrip({ ...f, items: [], questions: defaultQuestions() }, userProfile?.email || userProfile?.name || '')
    setCreating(false)
    setSelectedId(id)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Plane size={20} className="text-indigo-600" />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-slate-800">Mission Trips</h2>
          <p className="text-xs text-slate-500">Plan a visiting team's programs, food, stay and travel, and send them one link.</p>
        </div>
        <button type="button" onClick={() => setCreating(true)} className={`${btnPrimary} flex items-center gap-1.5 shrink-0`}><Plus size={16} /> New trip</button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {trips === null && <p className="text-sm text-slate-400">Loading…</p>}
      {trips?.length === 0 && !error && (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          No mission trips yet. Tap <b>New trip</b> to plan one.
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        {(trips || []).map((t) => {
          const suggest = (t.items || []).filter((i) => i.status === 'suggest').length
          return (
            <button key={t.id} type="button" onClick={() => setSelectedId(t.id)} className="text-left bg-white rounded-xl border border-slate-200 p-4 hover:border-indigo-300 hover:shadow-sm">
              <p className="font-semibold text-slate-800">{t.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">{[t.teamName, t.origin].filter(Boolean).join(' · ')}</p>
              <p className="text-xs text-slate-600 mt-2">{t.startDate ? `${fullDate(t.startDate)}${t.endDate && t.endDate !== t.startDate ? ` – ${fullDate(t.endDate)}` : ''}` : 'Dates not set'}</p>
              <p className="text-[11px] text-slate-400 mt-1">
                {(t.items || []).length} plan items{suggest ? ` · ${suggest} asking for suggestions` : ''} · link {t.linkActive ? 'open' : 'closed'}
              </p>
            </button>
          )
        })}
      </div>
      {creating && <TripModal onClose={() => setCreating(false)} onSave={create} />}
    </div>
  )
}
