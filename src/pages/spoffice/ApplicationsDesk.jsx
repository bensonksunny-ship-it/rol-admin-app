import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { subscribeApplicationsByStatus, updateApplication, subscribeCaringEvents, getPCSLookup } from '../../services/firestore'
import { APPLICATION_TYPES, APPLICATION_TYPE_KEYS, applicationStatus, eventForApplication, isOfficeReady as isReady } from '../../utils/pastoralApplications'
import SubmittedApplicationViewer from '../../components/caring/SubmittedApplicationViewer'
import BaptismStageTracker from '../../components/caring/BaptismStageTracker'
import BaptismApplicationModal from '../../components/caring/BaptismApplicationModal'
import MarriageApplicationModal from '../../components/caring/MarriageApplicationModal'
import DedicationApplicationModal from '../../components/caring/DedicationApplicationModal'

// Every status an application can be in once its link exists — the desk tracks links
// still waiting on the applicant too, not just submitted forms.
const DESK_STATUSES = ['pending', 'submitted', 'info_requested', 'revision_requested', 'declaration_requested', 'approved', 'rejected']

// Membership links stay with Caring: they are gated on the person's recorded baptism,
// which lives in PCS (not visible to SP Office).
const LINK_TYPES = ['baptism', 'marriage', 'dedication']

const CATEGORIES = [{ key: 'all', label: 'All' }, ...APPLICATION_TYPE_KEYS.map((k) => ({ key: k, label: APPLICATION_TYPES[k].short }))]

const VIEWS = [
  { key: 'prepare', label: 'To prepare' },
  { key: 'ready', label: 'Ready for approval' },
  { key: 'waiting', label: 'Waiting on applicant' },
  { key: 'decided', label: 'Decided' },
]

const fmtD = (d) => {
  const dt = d instanceof Date ? d : d ? new Date(d) : null
  return dt && !isNaN(dt.getTime()) ? dt.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
}

/** Which desk view an application belongs in. */
function deskView(app, events) {
  if (eventForApplication(app, events) || app.status === 'approved' || app.status === 'rejected') return 'decided'
  if (app.status === 'submitted') return isReady(app) ? 'ready' : 'prepare'
  return 'waiting'
}

/**
 * SP Office → Applications. The office secretary prepares Baptism, Membership,
 * Marriage and Baby Dedication applications for Caring / the Senior Pastor to decide:
 * reviews and prints them, keeps office notes, requests missing information, marks
 * each one "Ready for approval", and sends new application links. Approving,
 * rejecting and linking to a Caring event stay with Caring (ApplicationsQueueCard),
 * which shows the "Ready" mark set here.
 */
export default function ApplicationsDesk({ canEdit, userProfile }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [apps, setApps] = useState({ baptism: [], dedication: [], marriage: [], membership: [] })
  const [loadError, setLoadError] = useState('')
  const [events, setEvents] = useState([])
  const [lookup, setLookup] = useState([])
  const [category, setCategory] = useState('all')
  const [view, setView] = useState('prepare')
  const [viewing, setViewing] = useState(null) // { type, app }
  const [noting, setNoting] = useState(null) // { type, app, mode: 'ready' | 'info' | 'note' }
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [linkPicker, setLinkPicker] = useState(false)
  const [linkFor, setLinkFor] = useState(null) // { type, entry }

  const savedBy = userProfile?.displayName || userProfile?.email || ''

  useEffect(() => {
    const unsubs = APPLICATION_TYPE_KEYS.map((type) =>
      subscribeApplicationsByStatus(type, DESK_STATUSES,
        (list) => setApps((prev) => ({ ...prev, [type]: list })),
        () => { setApps((prev) => ({ ...prev, [type]: [] })); setLoadError('Some applications could not be loaded — your account may not have SP Office access yet (signing out and back in usually fixes this).') }))
    return () => unsubs.forEach((u) => u())
  }, [])
  useEffect(() => subscribeCaringEvents(setEvents, () => setEvents([])), [])
  useEffect(() => { getPCSLookup().then(setLookup).catch(() => setLookup([])) }, [])

  const nameById = useMemo(() => Object.fromEntries(lookup.map((p) => [p.id, p.name])), [lookup])
  const applicantName = (type, app) => {
    const fromForm = APPLICATION_TYPES[type].title(app)
    const fromPrefill = [app.prefill?.firstName, app.prefill?.lastName].filter(Boolean).join(' ')
    return fromForm || nameById[app.pcsEntryId] || fromPrefill || 'Applicant'
  }

  const all = APPLICATION_TYPE_KEYS.flatMap((type) => apps[type].map((app) => ({ type, app })))
  const countIn = (v) => all.filter(({ type, app }) => (category === 'all' || category === type) && deskView(app, events) === v).length
  const rows = all
    .filter(({ type }) => category === 'all' || category === type)
    .filter(({ app }) => deskView(app, events) === view)
    .sort((a, b) => ((b.app.submittedAt || b.app.createdAt)?.getTime?.() || 0) - ((a.app.submittedAt || a.app.createdAt)?.getTime?.() || 0))

  // Bell deep link: ?openApp=<type>:<id> opens that application once it has loaded.
  const openParam = searchParams.get('openApp')
  useEffect(() => {
    if (!openParam) return
    const [type, id] = openParam.split(':')
    const app = (apps[type] || []).find((a) => a.id === id)
    if (!app) return
    setCategory('all')
    setView(deskView(app, events))
    setViewing({ type, app })
    const next = new URLSearchParams(searchParams)
    next.delete('openApp')
    setSearchParams(next, { replace: true })
  }, [openParam, apps]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep an open viewer showing the live doc (e.g. after marking it ready).
  const liveViewing = viewing ? { ...viewing, app: (apps[viewing.type] || []).find((a) => a.id === viewing.app.id) || viewing.app } : null

  const save = async (type, app, data, failMsg) => {
    setBusy(true); setError('')
    try { await updateApplication(type, app.id, data) }
    catch (e) { console.error('ApplicationsDesk', e); setError(failMsg) }
    setBusy(false)
  }

  const stamp = () => `${fmtD(new Date())}${savedBy ? ` · ${savedBy}` : ''}`
  const appendNote = (app, line) => `${app.officeNotes ? `${app.officeNotes}\n` : ''}${line}`.trim()

  const submitNote = async () => {
    const { type, app, mode } = noting
    const text = note.trim()
    if (mode === 'ready') {
      await save(type, app, {
        officeReview: { status: 'ready', note: text, by: savedBy, at: new Date() },
        officeNotes: appendNote(app, `SP Office — ready for approval (${stamp()})${text ? `: ${text}` : ''}`),
      }, 'Could not mark it ready.')
    } else if (mode === 'info') {
      if (!text) { setError('Say what information is missing.'); return }
      await save(type, app, {
        status: 'info_requested',
        officeReview: { status: 'info_requested', note: text, by: savedBy, at: new Date() },
        officeNotes: appendNote(app, `Info requested by SP Office (${stamp()}): ${text}`),
      }, 'Could not save.')
    } else {
      if (!text) return
      await save(type, app, { officeNotes: appendNote(app, `SP Office (${stamp()}): ${text}`) }, 'Could not save the note.')
    }
    setNoting(null)
  }

  const actions = (type, app, compact = false) => {
    if (!canEdit) return null
    const v = deskView(app, events)
    const btn = compact ? 'px-2.5 py-1 text-[11px]' : 'min-h-[40px] px-4 text-sm'
    const open = (mode) => { setNote(''); setError(''); setNoting({ type, app, mode }) }
    return (
      <>
        {v === 'prepare' && (
          <button type="button" disabled={busy} onClick={() => open('ready')} className={`${btn} rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-50`}>Mark ready for approval</button>
        )}
        {v === 'ready' && (
          <button type="button" disabled={busy} onClick={() => save(type, app, { officeReview: { status: 'reopened', note: '', by: savedBy, at: new Date() } }, 'Could not undo.')}
            className={`${btn} rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 disabled:opacity-50`}>Undo ready</button>
        )}
        {(v === 'prepare' || v === 'ready') && (
          <button type="button" disabled={busy} onClick={() => open('info')} className={`${btn} rounded-lg border border-orange-200 text-orange-700 font-semibold hover:bg-orange-50 disabled:opacity-50`}>Request info</button>
        )}
        <button type="button" disabled={busy} onClick={() => open('note')} className={`${btn} rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 disabled:opacity-50`}>Add note</button>
      </>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-slate-100">
          <div className="flex-1 min-w-[200px]">
            <p className="text-sm font-bold text-slate-800">Applications Desk</p>
            <p className="text-xs text-slate-400">Prepare applications for Caring / the Senior Pastor to approve.</p>
          </div>
          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${countIn('prepare') ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>{countIn('prepare')} to prepare</span>
          {canEdit && (
            <button type="button" onClick={() => setLinkPicker(true)} className="min-h-[40px] px-4 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700">+ Send application link</button>
          )}
        </div>

        <div className="px-4 pt-3 flex flex-wrap items-center gap-1.5">
          {VIEWS.map((v) => (
            <button key={v.key} type="button" onClick={() => setView(v.key)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border ${view === v.key ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
              {v.label} ({countIn(v.key)})
            </button>
          ))}
        </div>
        <div className="px-4 pt-2 flex flex-wrap items-center gap-1.5">
          {CATEGORIES.map((c) => (
            <button key={c.key} type="button" onClick={() => setCategory(c.key)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border ${category === c.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
              {c.label}
            </button>
          ))}
        </div>

        {loadError && <p className="mx-4 mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{loadError}</p>}

        <div className="divide-y divide-slate-100 mt-2">
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-400 text-center">Nothing here.</p>
          ) : rows.map(({ type, app }) => {
            const t = APPLICATION_TYPES[type]
            const st = applicationStatus(app, events)
            const when = app.submittedAt ? `Submitted ${fmtD(app.submittedAt)}` : `Link sent ${fmtD(app.createdAt)}`
            return (
              <div key={`${type}-${app.id}`} className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="flex-1 min-w-[180px]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-sm font-bold text-slate-800">{applicantName(type, app)}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${t.cls}`}>{t.short}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                    {isReady(app) && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">Ready for approval</span>}
                  </div>
                  {type === 'baptism' && app.status !== 'pending' && <div className="mt-1"><BaptismStageTracker app={app} compact /></div>}
                  <p className="text-xs text-slate-400 mt-0.5">{when}{app.officeReview?.note ? ` · ${app.officeReview.note}` : ''}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {app.status !== 'pending' && (
                    <button type="button" onClick={() => setViewing({ type, app })} className="px-2.5 py-1 text-[11px] rounded-lg border border-slate-300 font-semibold text-slate-700 hover:bg-slate-50">Review</button>
                  )}
                  {app.status !== 'pending' && actions(type, app, true)}
                </div>
              </div>
            )
          })}
        </div>
        {error && !noting && <p className="px-4 pb-3 text-sm text-red-600">{error}</p>}
      </div>

      {liveViewing && (
        <SubmittedApplicationViewer type={liveViewing.type} app={liveViewing.app} events={events} onClose={() => setViewing(null)}
          footer={actions(liveViewing.type, liveViewing.app)} />
      )}

      {/* Mark ready / Request info / Add note */}
      {noting && createPortal(
        <div className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-4" onClick={() => setNoting(null)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold text-slate-900">
              {noting.mode === 'ready' ? 'Mark ready for approval' : noting.mode === 'info' ? 'Request more information' : 'Add an office note'}
            </p>
            <p className="text-sm text-slate-500">
              {noting.mode === 'ready'
                ? 'Caring and the Senior Pastor will see this application marked "Ready for approval". Add anything they should know (optional).'
                : noting.mode === 'info'
                  ? 'The application is marked "Info Requested". Note what is missing — contact the applicant yourself as usual.'
                  : 'Saved to the application\'s office notes with your name and today\'s date.'}
            </p>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} autoFocus
              placeholder={noting.mode === 'info' ? 'What is missing…' : 'Note…'}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm resize-none" />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setNoting(null)} className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-600">Cancel</button>
              <button type="button" disabled={busy || (noting.mode === 'note' && !note.trim())} onClick={submitNote}
                className={`px-4 py-2 rounded-xl text-white text-sm font-bold disabled:opacity-50 ${noting.mode === 'info' ? 'bg-orange-500' : noting.mode === 'ready' ? 'bg-emerald-600' : 'bg-indigo-600'}`}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {linkPicker && (
        <SendLinkPicker lookup={lookup} onClose={() => setLinkPicker(false)}
          onPick={(type, person) => { setLinkPicker(false); setLinkFor({ type, entry: { id: person.id, visitorId: person.visitorId || '', personId: '', name: person.name } , phone: person.phone }) }} />
      )}
      {linkFor && (() => {
        const [firstName, ...rest] = String(linkFor.entry.name || '').trim().split(/\s+/)
        const common = { entry: linkFor.entry, userEmail: userProfile?.email || '', onClose: () => setLinkFor(null) }
        if (linkFor.type === 'baptism') return <BaptismApplicationModal {...common} prefill={{ firstName: firstName || '', lastName: rest.join(' '), phone: linkFor.phone || '' }} />
        if (linkFor.type === 'marriage') return <MarriageApplicationModal {...common} prefill={{ firstName: firstName || '', lastName: rest.join(' '), phone: linkFor.phone || '' }} />
        return <DedicationApplicationModal {...common} canReveal={false} prefill={{ phone: linkFor.phone || '' }} />
      })()}
    </div>
  )
}

// Pick the application type and the person (from the name/phone-only PCS lookup — no
// pastoral details) before the usual link + QR modal opens.
function SendLinkPicker({ lookup, onClose, onPick }) {
  const [type, setType] = useState('baptism')
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const digits = needle.replace(/\D/g, '')
  const matches = needle.length < 2 ? [] : lookup
    .filter((p) => String(p.name || '').toLowerCase().includes(needle) || (digits.length >= 4 && String(p.phone || '').replace(/\D/g, '').includes(digits)))
    .slice(0, 12)
  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <p className="font-bold text-slate-900">Send an application link</p>
        <div className="flex flex-wrap gap-1.5">
          {LINK_TYPES.map((k) => (
            <button key={k} type="button" onClick={() => setType(k)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${type === k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200'}`}>
              {APPLICATION_TYPES[k].short}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-400">Membership links are sent by Caring — they check the person's baptism record first.</p>
        <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Search by name or phone…"
          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm" />
        <div className="max-h-72 overflow-y-auto space-y-1">
          {needle.length >= 2 && matches.length === 0 && (
            <p className="text-sm text-slate-500 py-3 text-center">No one found. New people are added through D-Light Visitor Entry and Caring first.</p>
          )}
          {matches.map((p) => (
            <button key={p.id} type="button" onClick={() => onPick(type, p)}
              className="w-full text-left rounded-xl border border-slate-200 px-3 py-2 hover:bg-indigo-50">
              <p className="text-sm font-semibold text-slate-800">{p.name}</p>
              {p.phone && <p className="text-xs text-slate-500">{p.phone}</p>}
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-600">Cancel</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
