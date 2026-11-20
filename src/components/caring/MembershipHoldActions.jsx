import { useState } from 'react'
import { withholdMembershipPipeline, cancelMembershipPipeline } from '../../services/firestore'

/**
 * "Withhold Application" / "Cancel Application" for one person's membership
 * pipeline — on the Membership Onboarding Pipeline rows and the Full Application
 * Record. Each opens a small inline confirm step before anything is written.
 *  - Withhold: pauses it where it is (status 'withheld'); it leaves the pipeline,
 *    Applications Progress and the ribbons, and comes back from the PCS profile.
 *  - Cancel: deletes the application and takes the pipeline off the profile.
 * `onDone(kind)` runs after a successful write ('withheld' | 'cancelled').
 */
export default function MembershipHoldActions({ entry, stageLabel = '', canHold, canCancel, by, onDone, className = '' }) {
  const [mode, setMode] = useState(null) // null | 'withhold' | 'cancel'
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!canHold || !entry?.membershipPipeline || entry.membershipPipeline.status !== 'in_progress') return null

  const run = async () => {
    setBusy(true); setError('')
    try {
      if (mode === 'withhold') await withholdMembershipPipeline(entry, { by, reason, stageLabel })
      else await cancelMembershipPipeline(entry, { by })
      const kind = mode === 'withhold' ? 'withheld' : 'cancelled'
      setMode(null); setReason('')
      onDone?.(kind)
    } catch (e) {
      console.error('Membership hold action', e)
      setError(mode === 'withhold' ? 'Could not withhold the application. Please try again.' : 'Could not cancel the application. Please try again.')
    }
    setBusy(false)
  }

  const btn = 'px-3 py-1.5 rounded-lg text-xs font-bold border disabled:opacity-50 whitespace-nowrap'
  return (
    <div className={`space-y-2 ${className}`} onClick={(ev) => ev.stopPropagation()}>
      {!mode && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setMode('withhold')} className={`${btn} border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100`}>
            ⏸ Withhold Application
          </button>
          {canCancel && (
            <button type="button" onClick={() => setMode('cancel')} className={`${btn} border-red-200 bg-white text-red-700 hover:bg-red-50`}>
              ✕ Cancel Application
            </button>
          )}
        </div>
      )}
      {mode === 'withhold' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
          <p className="text-xs text-amber-900">
            <b>Withhold this application?</b> It stops where it is{stageLabel ? ` (${stageLabel})` : ''} and every stage is kept.
            It leaves the pipeline, Applications Progress and notifications until someone presses <b>Continue Application</b> on the PCS profile.
          </p>
          <textarea value={reason} onChange={(ev) => setReason(ev.target.value)} rows={2} placeholder="Reason (optional)"
            className="w-full min-w-0 rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs" />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={run} className={`${btn} border-amber-600 bg-amber-600 text-white hover:bg-amber-700`}>
              {busy ? 'Withholding…' : 'Yes, withhold'}
            </button>
            <button type="button" disabled={busy} onClick={() => setMode(null)} className={`${btn} border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}>Back</button>
          </div>
        </div>
      )}
      {mode === 'cancel' && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
          <p className="text-xs text-red-900">
            <b>Cancel this application permanently?</b> The membership application and its progress are deleted, and its notifications are closed.
            This cannot be undone.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={run} className={`${btn} border-red-600 bg-red-600 text-white hover:bg-red-700`}>
              {busy ? 'Cancelling…' : 'Yes, cancel application'}
            </button>
            <button type="button" disabled={busy} onClick={() => setMode(null)} className={`${btn} border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}>Back</button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
