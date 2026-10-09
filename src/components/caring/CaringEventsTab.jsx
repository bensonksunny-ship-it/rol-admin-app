import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  subscribeCaringEvents, saveCaringEvent, deleteCaringEvent, getPCSEntries, getDepartmentChildren,
  setCaringEventStatus, subscribeSubmittedDedicationApplications, revealDedicationApplication, getDedicationSecretName,
  getMemberProfile,
} from '../../services/firestore'
import { downloadBaptismCertificates, printBaptismCertificates, baptismRegNo } from '../../utils/baptismCertificate'
import { dedicationFieldValue } from '../../constants/dedicationForm'
import {
  CARING_EVENT_TYPES, caringEventType, suggestBatchCode, serialLabel, participantTitle, CARING_EVENT_DEFAULT_VENUE,
} from '../../constants/caringEvents'
import { openCaringEventCertificates } from '../../utils/caringEventCertificates'
import { formatShortDate } from '../../utils/date'

const TYPE_CLS = {
  baptism: 'bg-sky-100 text-sky-800 border-sky-200',
  marriage: 'bg-rose-100 text-rose-800 border-rose-200',
  dedication: 'bg-amber-100 text-amber-800 border-amber-200',
  burial: 'bg-slate-200 text-slate-700 border-slate-300',
}

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const newKey = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const personFromEntry = (e) => ({
  pcsEntryId: e.id, visitorId: e.visitorId || '', personId: e.personId || '',
  name: e.name || '', legalName: e.legalName || '', membershipNumber: e.membershipNumber || '',
})
const pcsIdLabel = (p) => p?.membershipNumber ? `#${p.membershipNumber}` : p?.pcsEntryId ? `PCS-${p.pcsEntryId.slice(0, 6)}` : '—'

// Type-ahead over active PCS profiles. `exclude` = pcsEntryIds already chosen.
function PcsPersonPicker({ entries, exclude = [], onPick, placeholder = 'Search PCS by name or phone…', allowTyped = false }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const term = q.trim().toLowerCase()
  const matches = term.length < 2 ? [] : entries
    .filter((e) => !exclude.includes(e.id))
    .filter((e) => String(e.name || '').toLowerCase().includes(term) || String(e.phone || '').replace(/\s+/g, '').includes(term.replace(/\s+/g, '')))
    .slice(0, 8)
  const pick = (p) => { onPick(p); setQ(''); setOpen(false) }
  return (
    <div className="relative">
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
      {open && (matches.length > 0 || (allowTyped && term)) && (
        <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
          {matches.map((e) => (
            <button key={e.id} type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={() => pick(personFromEntry(e))}
              className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex justify-between gap-2">
              <span className="font-medium text-slate-800 truncate">{e.name}</span>
              <span className="text-xs text-slate-400 flex-shrink-0">{e.membershipNumber ? `#${e.membershipNumber}` : e.phone || ''}</span>
            </button>
          ))}
          {allowTyped && term && (
            <button type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={() => pick({ name: q.trim() })}
              className="w-full text-left px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 border-t border-slate-100">
              Use “{q.trim()}” (not in PCS)
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function EventFormModal({ initial, events, pcsEntries, riverKids, dedicationApps, defaultOfficiant, savedBy, onClose }) {
  const isEdit = !!initial?.id
  const [form, setForm] = useState(() => initial || {
    type: 'baptism', date: todayISO(), time: '', batchCode: '', venue: CARING_EVENT_DEFAULT_VENUE,
    officiant: defaultOfficiant || '', notes: '', participants: [], status: 'scheduled',
  })
  const [codeTouched, setCodeTouched] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const type = caringEventType(form.type)

  // Keep the suggested batch code in step with type/date until it's edited by hand.
  useEffect(() => {
    if (!codeTouched) set({ batchCode: suggestBatchCode(form.type, form.date, events.filter((e) => e.id !== initial?.id)) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.type, form.date, codeTouched])

  const participants = form.participants
  const setParticipants = (fn) => setForm((f) => ({ ...f, participants: fn(f.participants) }))
  const updateRow = (key, patch) => setParticipants((list) => list.map((p) => p.key === key ? { ...p, ...patch } : p))
  const removeRow = (key) => setParticipants((list) => list.filter((p) => p.key !== key))
  const moveRow = (idx, dir) => setParticipants((list) => {
    const next = [...list]; const j = idx + dir
    if (j < 0 || j >= next.length) return list
    ;[next[idx], next[j]] = [next[j], next[idx]]
    return next
  })
  const chosenIds = participants.flatMap((p) => [p.pcsEntryId, p.spouse?.pcsEntryId, ...(p.parents || []).map((x) => x.pcsEntryId)]).filter(Boolean)

  const save = async () => {
    setError('')
    if (!form.date) { setError('Choose the event date.'); return }
    if (!participants.length) { setError('Add at least one participant.'); return }
    if (form.type === 'dedication' && participants.some((p) => !String(p.childName || '').trim())) { setError('Every dedication row needs the child\'s name.'); return }
    if (form.type === 'marriage' && participants.some((p) => !p.spouse?.name)) { setError('Every marriage row needs both partners.'); return }
    setSaving(true)
    try {
      const numbered = participants.map((p, i) => ({ ...p, serialNo: i + 1 }))
      const { warnings } = await saveCaringEvent({ ...form, id: initial?.id, participants: numbered }, { previous: isEdit ? initial : null, savedBy })
      if (warnings.length) {
        const names = numbered.filter((p) => warnings.includes(p.key)).map((p) => participantTitle(form.type, p))
        alert(`Saved. These participants have no linked profile record, so nothing was written to PCS for them:\n\n${names.join('\n')}`)
      }
      onClose()
    } catch (err) {
      console.error('saveCaringEvent failed:', err)
      setError(err?.code === 'permission-denied'
        ? 'Not allowed: the database rules for Events may not be deployed yet.'
        : 'Could not save the event. Please try again.')
    } finally { setSaving(false) }
  }

  const inp = 'w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200'
  const label = (t) => <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{t}</span>

  // Submitted dedication applications not yet on any event (or already on this one).
  const usedAppIds = new Set(events.filter((e) => e.id !== initial?.id).flatMap((e) => (e.participants || []).map((p) => p.applicationId).filter(Boolean)))
  const thisAppIds = new Set(participants.map((p) => p.applicationId).filter(Boolean))
  const openApps = (dedicationApps || []).filter((a) => !usedAppIds.has(a.id) && !thisAppIds.has(a.id))
  const addFromApplication = (a) => {
    const hidden = a.isSurpriseName && !a.revealed
    const parentEntry = pcsEntries.find((e) => e.id === a.pcsEntryId)
    setParticipants((l) => [...l, {
      key: newKey(),
      childName: hidden ? a.publicDisplayName : (a.childName || ''),
      riverKidsChildId: '', applicationId: a.id, isSurprise: hidden,
      parents: parentEntry ? [personFromEntry(parentEntry)] : [],
    }])
  }

  const addPicker = (() => {
    if (form.type === 'dedication') {
      return (
        <div className="space-y-2">
          {openApps.length > 0 && (
            <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-2 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-teal-800 px-1">From submitted applications</p>
              {openApps.map((a) => (
                <button key={a.id} type="button" onClick={() => addFromApplication(a)}
                  className="w-full text-left px-2 py-1.5 rounded-lg text-sm hover:bg-white flex justify-between gap-2">
                  <span className="text-slate-800">
                    {a.isSurpriseName && !a.revealed ? `${a.publicDisplayName} 🔒` : a.childName}
                    <span className="text-xs text-slate-400"> · {[dedicationFieldValue(a, 'fatherName'), dedicationFieldValue(a, 'motherName')].filter(Boolean).join(' & ')}</span>
                  </span>
                  <span className="text-xs font-bold text-teal-700 flex-shrink-0">+ Add</span>
                </button>
              ))}
            </div>
          )}
          <PcsChildAdder riverKids={riverKids} onAdd={(child) => setParticipants((l) => [...l, { key: newKey(), ...child, parents: [] }])} />
        </div>
      )
    }
    return (
      <PcsPersonPicker entries={pcsEntries} exclude={chosenIds}
        placeholder={form.type === 'marriage' ? 'Add a couple: search the first partner in PCS…' : 'Add participant: search PCS by name or phone…'}
        onPick={(person) => setParticipants((l) => [...l, { key: newKey(), ...person, ...(form.type === 'marriage' ? { spouse: null } : {}) }])} />
    )
  })()

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center sm:p-4" onClick={() => !saving && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={isEdit ? 'Edit event' : 'Create new event'}
        className="w-full sm:max-w-2xl max-h-[92dvh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-20 bg-[#1e3a5f] text-white px-5 py-4 flex items-center gap-3">
          <p className="flex-1 font-bold">{isEdit ? `Edit ${type.short} · ${initial.batchCode || ''}` : 'Create New Event'}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full hover:bg-white/15 text-lg">×</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block sm:col-span-2">{label('Event type')}
              <select value={form.type} disabled={isEdit} onChange={(e) => set({ type: e.target.value, participants: [] })} className={`${inp} disabled:bg-slate-50`}>
                {CARING_EVENT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </label>
            <label className="block">{label('Date')}<input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} className={inp} /></label>
            <label className="block">{label('Time (optional)')}<input type="time" value={form.time} onChange={(e) => set({ time: e.target.value })} className={inp} /></label>
            <label className="block">{label('Batch / Event code')}
              <input value={form.batchCode} onChange={(e) => { setCodeTouched(true); set({ batchCode: e.target.value }) }} className={inp} />
            </label>
            <label className="block">{label('Officiating Pastor / Minister')}<input value={form.officiant} onChange={(e) => set({ officiant: e.target.value })} className={inp} /></label>
            <label className="block sm:col-span-2">{label('Venue / Church location')}<input value={form.venue} onChange={(e) => set({ venue: e.target.value })} className={inp} /></label>
          </div>
          {isEdit && <p className="text-xs text-slate-400">The event type can't be changed after saving. Delete the event and create a new one instead.</p>}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-slate-800">Participants <span className="text-slate-400 font-normal">({participants.length})</span></p>
              <p className="text-[11px] text-slate-400">Serial numbers follow this order</p>
            </div>
            {participants.map((p, i) => (
              <div key={p.key} className="rounded-xl border border-slate-200 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-black text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-md px-1.5 py-0.5 mt-0.5">{serialLabel(i + 1)}</span>
                  <div className="flex-1 min-w-0">
                    {form.type === 'dedication' ? (
                      p.isSurprise
                        ? <p className="text-sm font-semibold text-slate-800">{p.childName} <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">🔒 Surprise name</span></p>
                        : <input value={p.childName || ''} onChange={(e) => updateRow(p.key, { childName: e.target.value })} placeholder="Child's name" className={inp} />
                    ) : (
                      <p className="text-sm font-semibold text-slate-800">{p.name} <span className="text-xs font-normal text-slate-400">{pcsIdLabel(p)}</span></p>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button type="button" aria-label="Move up" onClick={() => moveRow(i, -1)} disabled={i === 0} className="w-7 h-7 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-30">↑</button>
                    <button type="button" aria-label="Move down" onClick={() => moveRow(i, 1)} disabled={i === participants.length - 1} className="w-7 h-7 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-30">↓</button>
                    <button type="button" aria-label="Remove" onClick={() => removeRow(p.key)} className="w-7 h-7 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50">×</button>
                  </div>
                </div>

                {form.type === 'marriage' && (
                  p.spouse ? (
                    <p className="text-sm text-slate-700 pl-9">& <b>{p.spouse.name}</b> <span className="text-xs text-slate-400">{p.spouse.pcsEntryId ? pcsIdLabel(p.spouse) : 'not in PCS'}</span>
                      <button type="button" onClick={() => updateRow(p.key, { spouse: null })} className="ml-2 text-xs text-slate-400 hover:text-red-500">change</button></p>
                  ) : (
                    <div className="pl-9"><PcsPersonPicker entries={pcsEntries} exclude={chosenIds} allowTyped placeholder="Partner: search PCS, or type a name" onPick={(sp) => updateRow(p.key, { spouse: sp })} /></div>
                  )
                )}

                {form.type === 'dedication' && (
                  <div className="pl-9 space-y-1.5">
                    <div className="flex flex-wrap gap-1.5">
                      {(p.parents || []).map((par) => (
                        <span key={par.pcsEntryId} className="inline-flex items-center gap-1 text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 rounded-full pl-2.5 pr-1 py-0.5">
                          {par.name}
                          <button type="button" aria-label={`Remove ${par.name}`} onClick={() => updateRow(p.key, { parents: p.parents.filter((x) => x.pcsEntryId !== par.pcsEntryId) })} className="w-4 h-4 rounded-full hover:bg-slate-300">×</button>
                        </span>
                      ))}
                    </div>
                    {(p.parents || []).length < 2 && (
                      <PcsPersonPicker entries={pcsEntries} exclude={(p.parents || []).map((x) => x.pcsEntryId)} placeholder="Link parent from PCS…"
                        onPick={(par) => updateRow(p.key, { parents: [...(p.parents || []), par] })} />
                    )}
                  </div>
                )}
              </div>
            ))}
            {addPicker}
          </div>

          <label className="block">{label('Notes (optional)')}<textarea rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} className={`${inp} resize-none`} /></label>

          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            {form.type === 'baptism' && 'Saving marks each participant as baptised in PCS, with this date, venue, batch code and their serial number.'}
            {form.type === 'marriage' && 'Saving sets both partners to Married in PCS, with this wedding date, and links them as each other\'s spouse.'}
            {form.type === 'dedication' && 'Saving records the dedication date and pastor on each child, inside the linked parents\' PCS profiles.'}
            {form.type === 'burial' && 'Saving marks each participant as Promoted to Glory in PCS. They stay in PCS and drop out of all absence warnings.'}
            {isEdit && ' Participants removed here have what this event wrote taken back out of their profile.'}
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={saving} onClick={save} className="flex-1 min-h-[44px] rounded-xl bg-[#1e3a5f] text-white text-sm font-bold disabled:opacity-60">
              {saving ? 'Saving & updating PCS…' : isEdit ? 'Save changes' : 'Save event'}
            </button>
            <button type="button" disabled={saving} onClick={onClose} className="px-4 min-h-[44px] rounded-xl border border-slate-300 text-sm font-semibold text-slate-600">Cancel</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// Dedication: add a child by name, or pick one from the River Kids register.
function PcsChildAdder({ riverKids, onAdd }) {
  const [name, setName] = useState('')
  const term = name.trim().toLowerCase()
  const kidMatches = term.length < 2 ? [] : riverKids.filter((k) => String(k.name || '').toLowerCase().includes(term)).slice(0, 6)
  const add = (child) => { onAdd(child); setName('') }
  return (
    <div className="relative">
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a child: type their name (River Kids matches appear)"
          className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        <button type="button" disabled={!term} onClick={() => add({ childName: name.trim(), riverKidsChildId: '' })}
          className="px-3 rounded-xl bg-slate-800 text-white text-sm font-semibold disabled:opacity-40">Add</button>
      </div>
      {kidMatches.length > 0 && (
        <div className="absolute z-10 left-0 right-16 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg">
          {kidMatches.map((k) => (
            <button key={k.id} type="button" onClick={() => add({ childName: k.name, riverKidsChildId: k.id })}
              className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50">
              {k.name} <span className="text-xs text-slate-400">River Kids{[k.fatherName, k.motherName].filter(Boolean).length ? ` · ${[k.fatherName, k.motherName].filter(Boolean).join(' & ')}` : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Caring → Events: pastoral lifecycle registry that syncs into PCS profiles. */
export default function CaringEventsTab({ canEdit, canReveal, savedBy, defaultOfficiant }) {
  const [events, setEvents] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [pcsEntries, setPcsEntries] = useState([])
  const [riverKids, setRiverKids] = useState([])
  const [filter, setFilter] = useState('all')
  const [openId, setOpenId] = useState(null)
  const [editing, setEditing] = useState(null) // null | 'new' | event
  const [busyId, setBusyId] = useState(null)
  const [dedicationApps, setDedicationApps] = useState([])
  const [revealedNames, setRevealedNames] = useState({}) // participant key → name (this viewer only)
  const [certBusy, setCertBusy] = useState('') // event id or participant key being generated

  // Certificate of Baptism data for baptism-event participants: name/serial from the
  // event, Native Place from PCS, parents from linked parent profiles (adult-child
  // links on member_profiles). Unknown values leave the template's line blank.
  const baptismCerts = async (ev, list) => Promise.all(list.map(async (p) => {
    const pcs = pcsEntries.find((e) => e.id === p.pcsEntryId)
    const profile = pcs?.visitorId ? await getMemberProfile(pcs.visitorId).catch(() => null) : null
    return {
      inHouse: true, // a Caring Events baptism service is performed by ROLCC
      name: p.name || pcs?.name || '',
      parents: (profile?.parents || []).map((x) => x?.name).filter(Boolean).join(' & '),
      birthplace: pcs?.nativity || '',
      baptismDate: ev.date,
      officiant: ev.officiant || '',
      regNo: baptismRegNo(ev.batchCode, p.serialNo),
    }
  }))
  const runCerts = async (busyKey, ev, list, action) => {
    setCertBusy(busyKey)
    try {
      const certs = await baptismCerts(ev, list)
      if (action === 'print') await printBaptismCertificates(certs)
      else await downloadBaptismCertificates(certs, list.length > 1 ? `${ev.batchCode || 'Baptism'}_Baptism_Certificates.pdf` : undefined)
    } catch (e) {
      console.error('Baptism certificates', e)
      alert('Could not create the certificate. Please try again.')
    }
    setCertBusy('')
  }

  useEffect(() => subscribeCaringEvents(setEvents, (err) => {
    setEvents([])
    setLoadError(err?.code === 'permission-denied' ? 'Events could not be loaded: the database rules for Events are not deployed yet.' : 'Events could not be loaded right now.')
  }), [])
  useEffect(() => {
    getPCSEntries().then(setPcsEntries).catch(() => setPcsEntries([]))
    getDepartmentChildren('River Kids').then((kids) => setRiverKids(kids.filter((k) => k.active !== false))).catch(() => setRiverKids([]))
  }, [])
  useEffect(() => subscribeSubmittedDedicationApplications(setDedicationApps, () => setDedicationApps([])), [])

  const shown = useMemo(() => (events || []).filter((e) => filter === 'all' || e.type === filter), [events, filter])

  const remove = async (event) => {
    const t = caringEventType(event.type)
    if (!window.confirm(`Delete ${t.short} event ${event.batchCode || ''}? What it wrote into ${event.participants?.length || 0} PCS profile(s) will be taken back out.`)) return
    setBusyId(event.id)
    try { await deleteCaringEvent(event) } catch (err) { console.error(err); alert('Could not delete the event.') }
    setBusyId(null)
  }

  // Mark Completed. For a dedication this also reveals surprise names: the event is
  // completed first (rules only allow revealing for a completed dedication event),
  // then each surprise application is revealed and the event is re-saved with the
  // real names, which rewrites them into the parents' PCS profiles.
  const complete = async (ev) => {
    const surprises = (ev.participants || []).filter((p) => p.isSurprise && p.applicationId)
    if (!window.confirm(`Mark ${ev.batchCode || 'this event'} as completed?${surprises.length ? ` The ${surprises.length} surprise name(s) will be revealed in PCS.` : ''}`)) return
    setBusyId(ev.id)
    try {
      await setCaringEventStatus(ev.id, 'completed', savedBy)
      if (surprises.length) {
        const names = {}
        for (const p of surprises) names[p.key] = await revealDedicationApplication(p.applicationId, ev.id, savedBy)
        const participants = ev.participants.map((p) => names[p.key] ? { ...p, childName: names[p.key], isSurprise: false } : p)
        await saveCaringEvent({ ...ev, participants, status: 'completed', completedAt: new Date().toISOString(), completedBy: savedBy }, { previous: ev, savedBy })
      }
    } catch (err) {
      console.error('complete event failed:', err)
      alert('Could not complete the event. Please try again.')
    }
    setBusyId(null)
  }
  const reopen = async (ev) => {
    setBusyId(ev.id)
    try { await setCaringEventStatus(ev.id, 'scheduled') } catch { alert('Could not reopen the event.') }
    setBusyId(null)
  }
  const revealFor = async (p) => {
    const name = await getDedicationSecretName(p.applicationId).catch(() => null)
    if (name) setRevealedNames((m) => ({ ...m, [p.key]: name }))
    else alert('The confidential name could not be read.')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Pastoral Events & Lifecycle Registry</h2>
          <p className="text-xs text-slate-500">Baptisms, weddings, dedications and burials. Saving an event updates each participant's PCS profile.</p>
        </div>
        {canEdit && (
          <button type="button" onClick={() => setEditing('new')} className="min-h-[44px] px-4 rounded-xl bg-[#1e3a5f] text-white text-sm font-bold hover:bg-[#16304f] flex-shrink-0">
            + Create New Event
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {[{ key: 'all', short: 'All' }, ...CARING_EVENT_TYPES].map((t) => (
          <button key={t.key} type="button" aria-pressed={filter === t.key} onClick={() => setFilter(t.key)}
            className={`px-3 py-1.5 rounded-full border text-xs font-semibold ${filter === t.key ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'}`}>
            {t.short}{t.key !== 'all' && events ? ` (${events.filter((e) => e.type === t.key).length})` : ''}
          </button>
        ))}
      </div>

      {loadError && <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">{loadError}</p>}

      {events === null ? (
        <p className="text-sm text-slate-400 text-center py-10">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-12 text-center text-sm text-slate-400">
          No {filter === 'all' ? '' : caringEventType(filter).short.toLowerCase() + ' '}events yet.
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((ev) => {
            const t = caringEventType(ev.type)
            const open = openId === ev.id
            const warnings = ev.syncWarnings || []
            return (
              <div key={ev.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <button type="button" onClick={() => setOpenId(open ? null : ev.id)} aria-expanded={open}
                  className="w-full text-left px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1 hover:bg-slate-50">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${TYPE_CLS[ev.type] || TYPE_CLS.burial}`}>{t.short}</span>
                  <span className="text-sm font-black text-slate-800">{ev.batchCode || '—'}</span>
                  {ev.status === 'completed'
                    ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">Completed</span>
                    : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">Scheduled</span>}
                  <span className="text-sm text-slate-600">{formatShortDate(ev.date)}{ev.time ? ` · ${ev.time}` : ''}</span>
                  <span className="text-xs text-slate-400 truncate min-w-0 flex-1">{ev.venue}</span>
                  <span className="text-xs font-semibold text-slate-500">{ev.participants?.length || 0} participant{ev.participants?.length === 1 ? '' : 's'}</span>
                </button>

                {open && (
                  <div className="border-t border-slate-100 px-4 py-3 space-y-3">
                    <p className="text-xs text-slate-500">
                      {t.label}{ev.officiant ? ` · Officiated by ${ev.officiant}` : ''}{ev.notes ? ` · ${ev.notes}` : ''}
                    </p>
                    <div className="overflow-x-auto -mx-4 px-4">
                      <table className="w-full text-sm min-w-[520px]">
                        <thead>
                          <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-200">
                            <th className="py-1.5 pr-3">Serial</th>
                            <th className="py-1.5 pr-3">Name</th>
                            <th className="py-1.5 pr-3">PCS ID</th>
                            <th className="py-1.5 pr-3">Batch</th>
                            <th className="py-1.5">Status</th>
                            {ev.type === 'baptism' && <th className="py-1.5 pl-3">Certificate</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {(ev.participants || []).map((p) => (
                            <tr key={p.key} className="border-b border-slate-100 last:border-0">
                              <td className="py-2 pr-3 font-bold text-indigo-700">{serialLabel(p.serialNo)}</td>
                              <td className="py-2 pr-3 text-slate-800">
                                {revealedNames[p.key] || participantTitle(ev.type, p)}
                                {p.isSurprise && !revealedNames[p.key] && <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">🔒 Surprise name</span>}
                                {p.isSurprise && canReveal && !revealedNames[p.key] && (
                                  <button type="button" onClick={() => revealFor(p)} className="ml-2 text-xs font-bold text-violet-700 hover:underline">Reveal Confidential Name</button>
                                )}
                                {ev.type === 'dedication' && (p.parents || []).length > 0 && <span className="block text-xs text-slate-400">Parents: {p.parents.map((x) => x.name).join(', ')}</span>}
                              </td>
                              <td className="py-2 pr-3 text-slate-500">
                                {ev.type === 'dedication' ? (p.parents || []).map(pcsIdLabel).join(', ') || '—'
                                  : ev.type === 'marriage' ? [pcsIdLabel(p), p.spouse?.pcsEntryId ? pcsIdLabel(p.spouse) : 'not in PCS'].join(' / ')
                                  : pcsIdLabel(p)}
                              </td>
                              <td className="py-2 pr-3 text-slate-500">{ev.batchCode || '—'}</td>
                              <td className="py-2">
                                {warnings.includes(p.key)
                                  ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">No profile record</span>
                                  : <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">PCS updated</span>}
                              </td>
                              {ev.type === 'baptism' && (
                                <td className="py-2 pl-3 whitespace-nowrap">
                                  <button type="button" disabled={!!certBusy} onClick={() => runCerts(p.key, ev, [p], 'download')}
                                    className="text-xs font-bold text-[#1e3a5f] hover:underline disabled:opacity-50">{certBusy === p.key ? '…' : 'Download PDF'}</button>
                                  <span className="text-slate-300 mx-1.5">|</span>
                                  <button type="button" disabled={!!certBusy} onClick={() => runCerts(p.key, ev, [p], 'print')}
                                    className="text-xs font-bold text-[#1e3a5f] hover:underline disabled:opacity-50">Print</button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {ev.type === 'baptism' && (ev.participants || []).length > 0 ? (
                        <>
                          {/* Official Certificate of Baptism template — one page per participant */}
                          <button type="button" disabled={!!certBusy} onClick={() => runCerts(ev.id, ev, ev.participants, 'download')}
                            className="min-h-[40px] px-4 rounded-xl bg-[#1e3a5f] text-white text-sm font-bold hover:bg-[#16304f] disabled:opacity-60">
                            {certBusy === ev.id ? 'Preparing…' : 'Download Baptism Certificates (PDF)'}
                          </button>
                          <button type="button" disabled={!!certBusy} onClick={() => runCerts(ev.id, ev, ev.participants, 'print')}
                            className="min-h-[40px] px-4 rounded-xl border-2 border-[#1e3a5f] text-[#1e3a5f] text-sm font-bold hover:bg-slate-50 disabled:opacity-60">
                            Print Certificates
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={() => openCaringEventCertificates(ev)} className="min-h-[40px] px-4 rounded-xl bg-[#92400e] text-white text-sm font-bold hover:bg-[#7c3510]">
                          Print Event Certificates
                        </button>
                      )}
                      {canEdit && (
                        <>
                          {ev.status === 'completed'
                            ? <button type="button" disabled={busyId === ev.id} onClick={() => reopen(ev)} className="min-h-[40px] px-4 rounded-xl border border-slate-300 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Reopen</button>
                            : <button type="button" disabled={busyId === ev.id} onClick={() => complete(ev)} className="min-h-[40px] px-4 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50">{busyId === ev.id ? 'Working…' : 'Mark Completed'}</button>}
                          <button type="button" onClick={() => setEditing(ev)} className="min-h-[40px] px-4 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">Edit</button>
                          <button type="button" disabled={busyId === ev.id} onClick={() => remove(ev)} className="min-h-[40px] px-4 rounded-xl border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
                            {busyId === ev.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <EventFormModal
          initial={editing === 'new' ? null : editing}
          events={events || []}
          pcsEntries={pcsEntries}
          riverKids={riverKids}
          dedicationApps={dedicationApps}
          defaultOfficiant={defaultOfficiant}
          savedBy={savedBy}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
