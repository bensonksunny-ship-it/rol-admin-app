import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { subscribeApplicationsByStatus, updateApplication, subscribeCaringEvents, saveCaringEvent } from '../../services/firestore'
import { APPLICATION_TYPES, APPLICATION_TYPE_KEYS, SUBMITTED_STATUSES, applicationStatus, eventForApplication } from '../../utils/pastoralApplications'
import { findPcsCellMember } from '../../utils/pcsEngagement'
import { getMemberDisplayName } from '../../utils/displayName'
import SubmittedApplicationViewer from './SubmittedApplicationViewer'

const fmtD = (d) => {
  const dt = d instanceof Date ? d : d ? new Date(d) : null
  return dt && !isNaN(dt.getTime()) ? dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
}
const newKey = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const personFromEntry = (e) => ({ pcsEntryId: e.id, visitorId: e.visitorId || '', personId: e.personId || '', name: e.name || '', membershipNumber: e.membershipNumber || '' })
const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'baptism', label: 'Baptism' },
  { key: 'dedication', label: 'Dedication' },
  { key: 'marriage', label: 'Marriage' },
  { key: 'membership', label: 'Membership' },
]

/**
 * Caring Hub → "Applications & Form Requests": every submitted Baptism, Baby
 * Dedication and Membership application, grouped by type, with Review /
 * Approve & Link to Event / Reject-or-Request-Info. Linking adds the person to the
 * chosen upcoming Caring > Events batch (saveCaringEvent also writes it into PCS).
 */
export default function ApplicationsQueueCard({ pcsEntries, allCellMembers, cellGroups, canEdit, savedBy, onOpenEvents }) {
  const [apps, setApps] = useState({ baptism: [], dedication: [], marriage: [], membership: [] })
  const [events, setEvents] = useState([])
  const [category, setCategory] = useState('all')
  const [showDone, setShowDone] = useState(false)
  const [viewing, setViewing] = useState(null) // { type, app }
  const [linking, setLinking] = useState(null) // { type, app }
  const [declining, setDeclining] = useState(null) // { type, app }
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const unsubs = APPLICATION_TYPE_KEYS.map((type) =>
      subscribeApplicationsByStatus(type, SUBMITTED_STATUSES, (list) => setApps((prev) => ({ ...prev, [type]: list })), () => setApps((prev) => ({ ...prev, [type]: [] }))))
    return () => unsubs.forEach((u) => u())
  }, [])
  useEffect(() => subscribeCaringEvents(setEvents, () => setEvents([])), [])

  const rows = APPLICATION_TYPE_KEYS.flatMap((type) => apps[type].map((app) => ({ type, app })))
    .filter(({ type }) => category === 'all' || category === type)
    .filter(({ app }) => {
      const inEvent = !!eventForApplication(app, events)
      const open = (app.status === 'submitted' || app.status === 'info_requested') && !inEvent
      return showDone ? true : open
    })
    .sort((a, b) => (b.app.submittedAt?.getTime?.() || 0) - (a.app.submittedAt?.getTime?.() || 0))
  const openCount = (type) => apps[type].filter((a) => (a.status === 'submitted' || a.status === 'info_requested') && !eventForApplication(a, events)).length
  const totalOpen = APPLICATION_TYPE_KEYS.reduce((n, t) => n + openCount(t), 0)

  const who = (app) => {
    const pcs = pcsEntries.find((e) => e.id === app.pcsEntryId)
    const cm = pcs ? findPcsCellMember(pcs, allCellMembers) : null
    return { pcs, name: pcs ? getMemberDisplayName(pcs) : '', cell: cm ? (cellGroups.find((g) => g.id === cm.cellId)?.cellName || '') : '' }
  }

  const decide = async (type, app, data, failMsg) => {
    setBusy(true); setError('')
    try { await updateApplication(type, app.id, { ...data, decidedBy: savedBy, decidedAt: new Date() }) }
    catch (e) { console.error(e); setError(failMsg) }
    setBusy(false)
  }

  const linkToEvent = async (type, app, ev) => {
    setBusy(true); setError('')
    try {
      const { pcs } = who(app)
      const serialNo = Math.max(0, ...(ev.participants || []).map((p) => Number(p.serialNo) || 0)) + 1
      const participant = type === 'dedication'
        ? (() => {
          const hidden = app.isSurpriseName && !app.revealed
          return { key: newKey(), childName: hidden ? app.publicDisplayName : (app.childName || ''), riverKidsChildId: '', applicationId: app.id, isSurprise: hidden, parents: pcs ? [personFromEntry(pcs)] : [], serialNo }
        })()
        : type === 'marriage'
          // Marriage rows carry both partners; the partner isn't matched to PCS here
          // (Caring can link them on the event) — just named from the application.
          ? { key: newKey(), ...(pcs ? personFromEntry(pcs) : { name: app.applicant?.legalFullName || '' }), spouse: { name: app.applicant?.partnerLegalFullName || '', pcsEntryId: '', visitorId: '', personId: '' }, applicationId: app.id, serialNo }
          : { key: newKey(), ...(pcs ? personFromEntry(pcs) : { name: APPLICATION_TYPES[type].title(app) }), applicationId: app.id, serialNo }
      await saveCaringEvent({ ...ev, participants: [...(ev.participants || []), participant] }, { previous: ev, savedBy })
      await updateApplication(type, app.id, { status: 'approved', linkedEventId: ev.id, decidedBy: savedBy, decidedAt: new Date() })
      setLinking(null); setViewing(null)
    } catch (e) {
      console.error('Approve & link', e)
      setError('Could not add them to the event. Please try again.')
    }
    setBusy(false)
  }

  const actions = (type, app, compact = false) => {
    if (!canEdit) return null
    const inEvent = !!eventForApplication(app, events)
    const open = (app.status === 'submitted' || app.status === 'info_requested') && !inEvent
    if (!open) return null
    const btn = compact ? 'px-2.5 py-1 text-[11px]' : 'min-h-[40px] px-4 text-sm'
    return (
      <>
        {APPLICATION_TYPES[type].eventType ? (
          <button type="button" disabled={busy} onClick={() => setLinking({ type, app })} className={`${btn} rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-50`}>Approve &amp; Link to Event</button>
        ) : (
          <button type="button" disabled={busy} onClick={() => decide(type, app, { status: 'approved' }, 'Could not approve.')} className={`${btn} rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-50`}>Approve</button>
        )}
        <button type="button" disabled={busy} onClick={() => { setNote(''); setDeclining({ type, app }) }} className={`${btn} rounded-lg border border-red-200 text-red-700 font-semibold hover:bg-red-50 disabled:opacity-50`}>Reject / Request Info</button>
      </>
    )
  }

  const upcomingFor = (type) => events
    .filter((e) => e.type === APPLICATION_TYPES[type].eventType && e.status !== 'completed')
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-2 border-b border-slate-100">
        <p className="text-sm font-bold text-slate-800 flex-1">Applications &amp; Form Requests</p>
        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${totalOpen ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>{totalOpen} to review</span>
      </div>
      <div className="px-4 pt-3 flex flex-wrap items-center gap-1.5">
        {CATEGORIES.map((c) => (
          <button key={c.key} type="button" onClick={() => setCategory(c.key)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border ${category === c.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
            {c.label}{c.key !== 'all' && openCount(c.key) > 0 ? ` (${openCount(c.key)})` : ''}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show decided
        </label>
      </div>

      <div className="divide-y divide-slate-100 mt-2">
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-400 text-center">{showDone ? 'No submitted applications.' : 'Nothing waiting for review.'}</p>
        ) : rows.map(({ type, app }) => {
          const t = APPLICATION_TYPES[type]
          const w = who(app)
          const st = applicationStatus(app, events)
          return (
            <div key={`${type}-${app.id}`} className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="flex-1 min-w-[180px]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-sm font-bold text-slate-800">{w.name || t.title(app) || 'Applicant'}</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${t.cls}`}>{t.short}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {[type === 'dedication' ? `Baby: ${t.title(app) || '—'}` : '', w.cell ? `Cell: ${w.cell}` : 'No cell group', `Submitted ${fmtD(app.submittedAt)}`].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setViewing({ type, app })} className="px-2.5 py-1 text-[11px] rounded-lg border border-slate-300 font-semibold text-slate-700 hover:bg-slate-50">Review</button>
                {actions(type, app, true)}
              </div>
            </div>
          )
        })}
      </div>
      {error && <p className="px-4 pb-3 text-sm text-red-600">{error}</p>}

      {viewing && (
        <SubmittedApplicationViewer type={viewing.type} app={viewing.app} events={events} onClose={() => setViewing(null)}
          footer={actions(viewing.type, viewing.app)} />
      )}

      {/* Approve & Link to Event — pick an upcoming batch of the right type */}
      {linking && createPortal(
        <div className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-4" onClick={() => setLinking(null)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold text-slate-900">Approve &amp; link to a {APPLICATION_TYPES[linking.type].short} event</p>
            <p className="text-sm text-slate-500">{who(linking.app).name || APPLICATION_TYPES[linking.type].title(linking.app)} will be added to the event you pick, and their PCS profile updated by it.</p>
            {upcomingFor(linking.type).length === 0 ? (
              <div className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3">
                No upcoming {APPLICATION_TYPES[linking.type].short} event yet.
                {onOpenEvents && <button type="button" onClick={() => { setLinking(null); onOpenEvents() }} className="ml-1 font-bold text-indigo-700 hover:underline">Create one in Events →</button>}
              </div>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {upcomingFor(linking.type).map((ev) => (
                  <button key={ev.id} type="button" disabled={busy} onClick={() => linkToEvent(linking.type, linking.app, ev)}
                    className="w-full text-left rounded-xl border border-slate-200 px-3 py-2 hover:bg-indigo-50 disabled:opacity-50">
                    <p className="text-sm font-bold text-slate-800">{ev.batchCode || 'Event'} · {fmtD(ev.date)}</p>
                    <p className="text-xs text-slate-500">{(ev.participants || []).length} participant{(ev.participants || []).length === 1 ? '' : 's'}{ev.venue ? ` · ${ev.venue}` : ''}</p>
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <button type="button" onClick={() => setLinking(null)} className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-600">{busy ? 'Linking…' : 'Cancel'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Reject / Request Info */}
      {declining && createPortal(
        <div className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-4" onClick={() => setDeclining(null)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold text-slate-900">Reject or request more information</p>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Note for the office record (what's missing, or why)…"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm resize-none" />
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setDeclining(null)} className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-600">Cancel</button>
              <button type="button" disabled={busy} onClick={async () => {
                const prev = declining.app.officeNotes ? `${declining.app.officeNotes}\n` : ''
                await decide(declining.type, declining.app, { status: 'info_requested', officeNotes: `${prev}Info requested: ${note.trim()}`.trim() }, 'Could not save.')
                setDeclining(null); setViewing(null)
              }} className="px-4 py-2 rounded-xl bg-orange-500 text-white text-sm font-bold disabled:opacity-50">Request Info</button>
              <button type="button" disabled={busy} onClick={async () => {
                const prev = declining.app.officeNotes ? `${declining.app.officeNotes}\n` : ''
                await decide(declining.type, declining.app, { status: 'rejected', officeNotes: `${prev}${note.trim() ? `Not approved: ${note.trim()}` : 'Not approved'}` }, 'Could not save.')
                setDeclining(null); setViewing(null)
              }} className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-50">Reject</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
