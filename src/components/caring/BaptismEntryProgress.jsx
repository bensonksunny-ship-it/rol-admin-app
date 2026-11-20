import { useEffect, useState } from 'react'
import { subscribeBaptismApplicationsForEntry, resumeBaptismApplication } from '../../services/firestore'
import BaptismStageTracker from './BaptismStageTracker'

const fmt = (v) => {
  const d = v ? new Date(v) : null
  return d && !isNaN(d.getTime()) ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
}

/** PCS profile: the 3-stage Baptism progress for this person's latest application
 *  (renders nothing until they have one). A withheld application (Withhold on the
 *  Baptism Applications ribbon) shows as a Withheld card with "Continue Application",
 *  which puts it back on the ribbon and re-opens its notifications. */
export default function BaptismEntryProgress({ pcsEntryId, canResume = false }) {
  const [app, setApp] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => subscribeBaptismApplicationsForEntry(pcsEntryId, (apps) => setApp(apps[0] || null), () => setApp(null)), [pcsEntryId])
  if (!app) return null
  if (!app.withheld) return <BaptismStageTracker app={app} />

  const resume = async () => {
    setBusy(true); setError('')
    try { await resumeBaptismApplication(app) } catch (e) {
      console.error('resumeBaptismApplication', e); setError('Could not continue the application. Please try again.')
    }
    setBusy(false)
  }
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">⏸ Withheld Baptism Application</span>
        {app.withheldStage && <span className="text-xs font-semibold text-amber-900">{app.withheldStage}</span>}
      </div>
      <div className="opacity-70"><BaptismStageTracker app={app} /></div>
      <p className="text-[11px] text-amber-800">
        {[app.withheldAt && `Withheld ${fmt(app.withheldAt)}`, app.withheldBy && `by ${app.withheldBy}`].filter(Boolean).join(' ')}
        {app.withheldReason ? ` · “${app.withheldReason}”` : ''}
      </p>
      {canResume ? (
        <button type="button" disabled={busy} onClick={resume}
          className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50">
          {busy ? 'Continuing…' : '▶ Continue Application'}
        </button>
      ) : (
        <p className="text-[11px] text-slate-500">Only the Founder, Senior Pastor, Caring, First Lady or SP Office can continue it.</p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
