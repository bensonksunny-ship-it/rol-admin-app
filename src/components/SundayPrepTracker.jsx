import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Link } from 'react-router-dom'
import {
  getSundayProgramDefault,
  getSundayProgramDesign,
  getProgramNotification,
  getSundayPreServiceEntry,
  getSundayCrewEntry,
  getSundayReport,
} from '../services/firestore'

function getNextSundayISO() {
  const today = new Date()
  const diff = today.getDay() === 0 ? 0 : 7 - today.getDay()
  const d = new Date(today)
  d.setDate(today.getDate() + diff)
  return format(d, 'yyyy-MM-dd')
}

function formatDisplay(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return format(new Date(y, m - 1, d), 'EEE, dd MMM yyyy')
}

const CHECK_LINKS = {
  programSet:       '/department/sunday-ministry/sunday?subtab=program',
  programDesigned:  '/department/sunday-ministry/sunday?subtab=program',
  notifSent:        '/department/sunday-ministry/sunday?subtab=program',
  preService:       '/department/sunday-ministry/crew',
  crewAssigned:     '/department/sunday-ministry/crew',
  pushedToLive:     '/department/sunday-ministry/sunday?subtab=program',
}

export default function SundayPrepTracker() {
  const sundayDate = getNextSundayISO()
  const [checks, setChecks] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getSundayProgramDefault(),
      getSundayProgramDesign(),
      getProgramNotification(sundayDate),
      getSundayPreServiceEntry(sundayDate),
      getSundayCrewEntry(sundayDate),
      getSundayReport(sundayDate),
    ])
      .then(([defaultDoc, designDoc, notif, preService, crewEntry, report]) => {
        const designs = designDoc?.designs || {}
        const hasDesign = Object.values(designs).some((els) => Array.isArray(els) && els.length > 0)
        setChecks({
          programSet:      (defaultDoc?.items?.length || 0) > 0,
          programDesigned: hasDesign,
          notifSent:       notif !== null,
          preService:      !!(preService && (preService.speakers?.length > 0 || preService.topics?.length > 0)),
          crewAssigned:    !!(crewEntry && crewEntry.serving?.length > 0),
          pushedToLive:    (report?.programList?.length || 0) > 0,
        })
      })
      .catch(() => setChecks(null))
      .finally(() => setLoading(false))
  }, [sundayDate])

  const STEPS = [
    { key: 'programSet',      label: 'Default program set',           desc: 'Programme items are listed' },
    { key: 'programDesigned', label: 'Programs designed',             desc: 'Elements assigned to programmes' },
    { key: 'notifSent',       label: 'Notification sent to depts',    desc: 'Departments have been notified' },
    { key: 'preService',      label: 'Pre-service prepared',          desc: 'Speakers & topics entered' },
    { key: 'crewAssigned',    label: 'Crew assigned',                 desc: 'Serving crew listed for this Sunday' },
    { key: 'pushedToLive',    label: 'Pushed to Live Control',        desc: 'Programme sent to live control' },
  ]

  const done = checks ? STEPS.filter((s) => checks[s.key]).length : 0
  const total = STEPS.length
  const pct = total ? Math.round((done / total) * 100) : 0

  const barColor =
    pct === 100 ? '#059669'
    : pct >= 60  ? '#6366f1'
    : pct >= 30  ? '#f59e0b'
    :               '#e11d48'

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div
        className="px-5 py-4"
        style={{ background: 'linear-gradient(135deg, #4338ca 0%, #6366f1 60%, #7c3aed 100%)' }}
      >
        <p className="text-indigo-200 text-xs uppercase tracking-widest mb-0.5">Sunday Ministry</p>
        <h2 className="text-white font-bold text-base">Preparation Tracker</h2>
        <p className="text-indigo-200 text-xs mt-0.5">{formatDisplay(sundayDate)}</p>
      </div>

      {/* Progress bar */}
      <div className="px-5 pt-4 pb-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-semibold text-slate-700">
            {loading ? 'Loading…' : `${done} of ${total} steps complete`}
          </span>
          <span
            className="text-sm font-bold tabular-nums"
            style={{ color: barColor }}
          >
            {loading ? '—' : `${pct}%`}
          </span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: loading ? '0%' : `${pct}%`, background: barColor }}
          />
        </div>
        {pct === 100 && (
          <p className="text-xs text-emerald-600 font-semibold mt-1.5">All preparations complete — ready for Sunday!</p>
        )}
      </div>

      {/* Checklist */}
      <div className="divide-y divide-slate-50 px-2 pb-3 pt-1">
        {STEPS.map((step, idx) => {
          const isDone = checks?.[step.key] ?? false
          return (
            <Link
              key={step.key}
              to={CHECK_LINKS[step.key]}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition group"
            >
              {/* Step number / tick */}
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all"
                style={isDone
                  ? { background: '#d1fae5', color: '#059669' }
                  : { background: '#f1f5f9', color: '#94a3b8' }
                }
              >
                {isDone ? '✓' : idx + 1}
              </span>

              {/* Labels */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold leading-tight ${isDone ? 'text-slate-700 line-through decoration-slate-300' : 'text-slate-800'}`}>
                  {step.label}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{step.desc}</p>
              </div>

              {/* Status pill */}
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                style={isDone
                  ? { background: '#d1fae5', color: '#059669' }
                  : { background: '#fef3c7', color: '#b45309' }
                }
              >
                {loading ? '…' : isDone ? 'Done' : 'Pending'}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
