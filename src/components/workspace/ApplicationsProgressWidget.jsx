import { useEffect, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { subscribeApplicationsByStatus, subscribeCaringEvents, withholdBaptismApplication, deleteBaptismApplicationFully } from '../../services/firestore'
import { APPLICATION_TYPES, APPLICATION_TYPE_KEYS } from '../../utils/pastoralApplications'
import { applicationLevels, currentLevel, applicationFinished, applicationName, applicationLapsed } from '../../utils/applicationProgress'
import { RIBBON_BAR } from '../../constants/ribbon'

// Every status an application can be in, link-sent included.
const ALL_STATUSES = ['pending', 'submitted', 'info_requested', 'declaration_requested', 'revision_requested', 'approved', 'rejected']

const PILL = {
  done: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  current: 'bg-amber-50 border-amber-300 text-amber-800',
  blocked: 'bg-red-50 border-red-200 text-red-700',
  waiting: 'bg-slate-50 border-slate-200 text-slate-400',
}

// One ribbon per application type, each with its own accent. Membership first;
// any type added later falls back to the last accent and is listed after these.
const RIBBON_ORDER = ['membership', 'baptism', 'dedication', 'marriage']
const ACCENTS = {
  membership: 'from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700',
  baptism: 'from-sky-600 to-cyan-600 hover:from-sky-700 hover:to-cyan-700',
  dedication: 'from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700',
  marriage: 'from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700',
}
const FALLBACK_ACCENT = ACCENTS.marriage
const orderedTypes = () => [
  ...RIBBON_ORDER.filter((k) => APPLICATION_TYPE_KEYS.includes(k)),
  ...APPLICATION_TYPE_KEYS.filter((k) => !RIBBON_ORDER.includes(k)),
]
const ribbonTitle = (type) => {
  const label = APPLICATION_TYPES[type]?.short || type
  return /applications?$/i.test(label) ? label : `${label} Applications`
}

const newestFirst = (a, b) => (b.app.submittedAt?.getTime?.() || b.app.createdAt?.getTime?.() || 0)
  - (a.app.submittedAt?.getTime?.() || a.app.createdAt?.getTime?.() || 0)

/** Baptism row: Withhold (paused, continued from the PCS profile) / Delete, each with
 *  an inline confirm step. The row leaves the ribbon by itself once the feed updates. */
function BaptismRowActions({ app, stageLabel, canCancel, by }) {
  const [mode, setMode] = useState(null) // null | 'withhold' | 'delete'
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async () => {
    setBusy(true); setError('')
    try {
      if (mode === 'withhold') await withholdBaptismApplication(app, { by, reason, stageLabel })
      else await deleteBaptismApplicationFully(app)
      setMode(null)
    } catch (e) {
      console.error('Baptism application action', e)
      setError(mode === 'withhold' ? 'Could not withhold. Please try again.' : 'Could not delete. Please try again.')
    }
    setBusy(false)
  }
  const btn = 'px-2.5 py-1 rounded-lg text-[11px] font-bold border disabled:opacity-50 whitespace-nowrap'
  return (
    <div className="mt-2 space-y-2">
      {!mode && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setMode('withhold')} className={`${btn} border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100`}>⏸ Withhold</button>
          {canCancel && <button type="button" onClick={() => setMode('delete')} className={`${btn} border-red-200 bg-white text-red-700 hover:bg-red-50`}>🗑 Delete</button>}
        </div>
      )}
      {mode === 'withhold' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 space-y-2">
          <p className="text-xs text-amber-900"><b>Withhold this baptism application?</b> It stops where it is{stageLabel ? ` (${stageLabel})` : ''} with every stage kept, and leaves this ribbon and the notifications until someone presses <b>Continue Application</b> on the PCS profile.</p>
          <textarea value={reason} onChange={(ev) => setReason(ev.target.value)} rows={2} placeholder="Reason (optional)"
            className="w-full min-w-0 rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs" />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={run} className={`${btn} border-amber-600 bg-amber-600 text-white hover:bg-amber-700`}>{busy ? 'Withholding…' : 'Yes, withhold'}</button>
            <button type="button" disabled={busy} onClick={() => setMode(null)} className={`${btn} border-slate-200 bg-white text-slate-600`}>Back</button>
          </div>
        </div>
      )}
      {mode === 'delete' && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 space-y-2">
          <p className="text-xs text-red-900"><b>Delete this baptism application permanently?</b> The form, its sign-off and exam results are removed and its notifications closed. This cannot be undone.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={run} className={`${btn} border-red-600 bg-red-600 text-white hover:bg-red-700`}>{busy ? 'Deleting…' : 'Yes, delete'}</button>
            <button type="button" disabled={busy} onClick={() => setMode(null)} className={`${btn} border-slate-200 bg-white text-slate-600`}>Back</button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

/** One application's level-wise tracker row. */
function ApplicationRow({ type, app, levels, cur, finished, rights }) {
  const done = levels.filter((l) => l.state === 'done').length
  return (
    <li className="bg-white border border-slate-200/80 rounded-xl px-4 py-3 shadow-sm my-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-800 text-sm truncate min-w-0">{applicationName(type, app)}</span>
        <span className="ml-auto text-[11px] font-semibold text-slate-500">
          {app.status === 'rejected' ? 'Not approved'
            : app.closedAt && cur ? 'Closed'
            : cur ? `Level ${levels.indexOf(cur) + 1} of ${levels.length}: ${cur.label}`
            : finished ? `All ${levels.length} levels complete` : ''}
        </span>
      </div>
      <div className="h-1 rounded-full bg-slate-100 overflow-hidden mt-2">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(done / levels.length) * 100}%` }} />
      </div>
      <ol className="flex flex-wrap gap-1 mt-2">
        {levels.map((l, i) => (
          <li key={l.key} title={l.note || l.label}
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${PILL[l.state]}`}>
            {l.state === 'done' ? '✓' : l.state === 'blocked' ? '!' : i + 1} {l.label}
          </li>
        ))}
      </ol>
      {cur?.note && <p className="text-[11px] text-slate-500 mt-1.5">{cur.note}</p>}
      {type === 'baptism' && rights?.canHold && (
        <BaptismRowActions app={app} canCancel={rights.canCancel} by={rights.by}
          stageLabel={cur ? `Level ${levels.indexOf(cur) + 1} of ${levels.length}: ${cur.label}` : ''} />
      )}
    </li>
  )
}

/** One application type's collapsible ribbon: count badge, Show completed, its rows. */
function ApplicationTypeRibbon({ type, rows, rights }) {
  const [open, setOpen] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const active = rows.filter((r) => !r.finished)
  const shown = rows.filter((r) => showDone || !r.finished)
    .sort((a, b) => Number(a.finished) - Number(b.finished) || newestFirst(a, b))
  const toggle = (
    <input type="checkbox" checked={showDone} onChange={(ev) => setShowDone(ev.target.checked)} />
  )

  return (
    <div className={`rounded-xl border shadow-sm overflow-hidden ${open ? 'bg-white border-slate-200' : 'border-transparent'}`}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setOpen(!open) } }}
        className={`${RIBBON_BAR} cursor-pointer bg-gradient-to-r ${ACCENTS[type] || FALLBACK_ACCENT} text-white transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80`}
      >
        <span className="flex-1 min-w-0 text-sm font-bold truncate">{ribbonTitle(type)}</span>
        <span className="flex-shrink-0 text-xs font-bold px-2.5 py-0.5 rounded-full bg-white/20 text-white">{active.length} in progress</span>
        {open && (
          <label className="hidden sm:flex flex-shrink-0 items-center gap-1.5 text-xs text-white/90 cursor-pointer [&>input]:accent-white" onClick={(ev) => ev.stopPropagation()}>
            {toggle} Show completed
          </label>
        )}
        <ChevronDown size={18} aria-hidden="true" className={`flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </div>
      {open && (
        <>
          {/* Phones: the "Show completed" toggle sits under the ribbon. */}
          <label className="sm:hidden flex items-center gap-1.5 px-4 pt-3 text-xs text-slate-500 cursor-pointer">
            {toggle} Show completed
          </label>
          {shown.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-400 text-center">No {ribbonTitle(type).toLowerCase()} {showDone ? '' : 'in progress '}right now.</p>
          ) : (
            <ul className="px-3 py-1">
              {shown.map((r) => <ApplicationRow key={r.app.id} {...r} rights={rights} />)}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

/**
 * My Workspace → application progress: one ribbon per application type
 * (Membership, Baptism, Baby Dedication, Marriage), each with its level-wise
 * progress rows (utils/applicationProgress.js). A type with nothing in progress
 * shows no ribbon. Shown to the Founder, the Caring Director, the Caring Assistant
 * and the First Lady — see the rule in applicationProgress.js.
 */
// `rights` = { canHold, canCancel, by } — Withhold / Delete on Baptism rows
// (utils/membershipPipeline.js → membershipHoldRights).
// `only` limits it to some types — My Workspace shows just Baptism (Membership is
// covered by the Membership Onboarding Pipeline).
export default function ApplicationsProgressWidget({ rights = null, only = null }) {
  const [apps, setApps] = useState(() => Object.fromEntries(APPLICATION_TYPE_KEYS.map((k) => [k, []])))
  const [events, setEvents] = useState([])

  useEffect(() => {
    const unsubs = APPLICATION_TYPE_KEYS.map((type) =>
      subscribeApplicationsByStatus(type, ALL_STATUSES, (list) => setApps((prev) => ({ ...prev, [type]: list })), () => setApps((prev) => ({ ...prev, [type]: [] }))))
    return () => unsubs.forEach((u) => u())
  }, [])
  useEffect(() => subscribeCaringEvents(setEvents, () => setEvents([])), [])

  const byType = useMemo(() => Object.fromEntries(APPLICATION_TYPE_KEYS.map((type) => [type, (apps[type] || [])
    // Withheld (paused from the Membership Onboarding Pipeline) stay out until continued.
    .filter((app) => !app.withheld && !applicationLapsed(type, app))
    .map((app) => {
      const levels = applicationLevels(type, app, events)
      return { type, app, levels, cur: currentLevel(levels), finished: applicationFinished(type, app, levels) }
    })])), [apps, events])

  // A ribbon only for types with something in progress.
  const types = orderedTypes()
    .filter((type) => !only || only.includes(type))
    .filter((type) => byType[type]?.some((r) => !r.finished))
  if (!types.length) return null
  return (
    <div className="flex flex-col gap-2">
      {types.map((type) => <ApplicationTypeRibbon key={type} type={type} rows={byType[type]} rights={rights} />)}
    </div>
  )
}
