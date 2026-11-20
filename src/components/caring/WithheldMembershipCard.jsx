import { useState } from 'react'
import { resumeMembershipPipeline } from '../../services/firestore'
import { currentStage } from '../../utils/membershipPipeline'
import ApplicationMasterDocumentModal from './ApplicationMasterDocumentModal'

const fmt = (v) => {
  const d = v ? new Date(v) : null
  return d && !isNaN(d.getTime()) ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
}

/**
 * PCS profile → Membership: a withheld membership application (paused from the
 * Membership Onboarding Pipeline). The card shows where it stopped; clicking it
 * opens the Full Application Record with "Continue Application", which puts it
 * back in the pipeline, Applications Progress and the notifications.
 */
export default function WithheldMembershipCard({ entry, stages, application, cellName = '', canResume, by, onResumed }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const hold = entry.membershipPipeline?.hold || {}
  const cur = currentStage(stages)
  const pausedAt = cur ? `Stage ${cur.n} of 8: ${cur.label}` : hold.stageLabel || 'All stages complete'
  const doneCount = stages.filter((s) => s.done).length

  const resume = async () => {
    setBusy(true); setError('')
    try {
      await resumeMembershipPipeline(entry, { by })
      setOpen(false)
      onResumed?.()
    } catch (e) {
      console.error('resumeMembershipPipeline', e)
      setError('Could not continue the application. Please try again.')
    }
    setBusy(false)
  }

  const continueBtn = (
    <div className="space-y-2">
      <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        <b>⏸ Withheld</b> at {pausedAt}{hold.at ? ` · ${fmt(hold.at)}` : ''}{hold.by ? ` · by ${hold.by}` : ''}
        {hold.reason ? <><br />Reason: “{hold.reason}”</> : null}
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

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="w-full text-left rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 px-4 py-3 transition-colors">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">⏸ Withheld Application</span>
          <span className="text-xs text-amber-900 font-semibold">{pausedAt}</span>
          <span className="ml-auto text-[11px] text-amber-800">{doneCount}/8 done</span>
        </div>
        <div className="flex items-center gap-0.5 mt-2" aria-hidden="true">
          {stages.map((s) => (
            <span key={s.key} className={`h-1.5 flex-1 rounded-full ${s.done ? 'bg-emerald-500' : cur?.key === s.key ? 'bg-amber-400' : 'bg-amber-200/70'}`} />
          ))}
        </div>
        <p className="text-[11px] text-amber-800 mt-2">
          {[hold.at && `Withheld ${fmt(hold.at)}`, hold.by && `by ${hold.by}`].filter(Boolean).join(' ')}
          {hold.reason ? ` · “${hold.reason}”` : ''}
          <span className="font-semibold underline underline-offset-2 ml-1">Open →</span>
        </p>
      </button>
      {open && (
        <ApplicationMasterDocumentModal entry={entry} application={application} cellName={cellName}
          onClose={() => setOpen(false)} actions={continueBtn} />
      )}
    </>
  )
}
