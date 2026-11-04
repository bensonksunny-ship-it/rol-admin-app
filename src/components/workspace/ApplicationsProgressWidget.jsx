import { useEffect, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { subscribeApplicationsByStatus, subscribeCaringEvents } from '../../services/firestore'
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

/**
 * My Workspace → Applications Progress: every Baptism, Baby Dedication, Marriage and
 * Membership application made through the app, with its level-wise progress
 * (utils/applicationProgress.js). Shown to the Founder, the Caring Director and the
 * First Lady — see the rule in applicationProgress.js.
 */
export default function ApplicationsProgressWidget() {
  const [apps, setApps] = useState({ baptism: [], dedication: [], marriage: [], membership: [] })
  const [events, setEvents] = useState([])
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState('all')
  const [showDone, setShowDone] = useState(false)

  useEffect(() => {
    const unsubs = APPLICATION_TYPE_KEYS.map((type) =>
      subscribeApplicationsByStatus(type, ALL_STATUSES, (list) => setApps((prev) => ({ ...prev, [type]: list })), () => setApps((prev) => ({ ...prev, [type]: [] }))))
    return () => unsubs.forEach((u) => u())
  }, [])
  useEffect(() => subscribeCaringEvents(setEvents, () => setEvents([])), [])

  const rows = useMemo(() => APPLICATION_TYPE_KEYS.flatMap((type) => apps[type]
    .filter((app) => !applicationLapsed(type, app))
    .map((app) => {
      const levels = applicationLevels(type, app, events)
      return { type, app, levels, cur: currentLevel(levels), finished: applicationFinished(type, app, levels) }
    })), [apps, events])

  const inProgress = rows.filter((r) => !r.finished)
  const countOf = (type) => inProgress.filter((r) => r.type === type).length
  const shown = rows
    .filter((r) => (showDone ? true : !r.finished))
    .filter((r) => category === 'all' || r.type === category)
    .sort((a, b) => Number(a.finished) - Number(b.finished)
      || (b.app.submittedAt?.getTime?.() || b.app.createdAt?.getTime?.() || 0) - (a.app.submittedAt?.getTime?.() || a.app.createdAt?.getTime?.() || 0))

  return (
    <div className={`rounded-xl border shadow-sm overflow-hidden ${open ? 'bg-white border-slate-200' : 'border-transparent'}`}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setOpen(!open) } }}
        className={`${RIBBON_BAR} cursor-pointer bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80`}
      >
        <span className="flex-1 min-w-0 text-sm font-bold truncate">Applications Progress</span>
        <span className="flex-shrink-0 text-xs font-bold px-2.5 py-0.5 rounded-full bg-white/20 text-white">{inProgress.length} in progress</span>
        <ChevronDown size={18} aria-hidden="true" className={`flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </div>
      {open && (
        <>
          <div className="flex flex-wrap items-center gap-1.5 px-3 pt-3">
            {['all', ...APPLICATION_TYPE_KEYS].map((k) => (
              <button key={k} type="button" onClick={() => setCategory(k)}
                className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${category === k ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                {k === 'all' ? 'All' : APPLICATION_TYPES[k].short}
                <span className="ml-1 opacity-70 tabular-nums">{k === 'all' ? inProgress.length : countOf(k)}</span>
              </button>
            ))}
            <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
              <input type="checkbox" checked={showDone} onChange={(ev) => setShowDone(ev.target.checked)} /> Show completed
            </label>
          </div>
          {shown.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-400 text-center">No applications {showDone ? '' : 'in progress '}right now.</p>
          ) : (
            <ul className="px-3 py-1">
              {shown.map(({ type, app, levels, cur, finished }) => {
                const t = APPLICATION_TYPES[type]
                const done = levels.filter((l) => l.state === 'done').length
                return (
                  <li key={`${type}-${app.id}`} className="bg-white border border-slate-200/80 rounded-xl px-4 py-3 shadow-sm my-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${t.cls}`}>{t.short}</span>
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
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
