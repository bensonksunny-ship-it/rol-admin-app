import { useEffect, useState } from 'react'
import { subscribeMyInterviewRequests, respondToInterviewRequest } from '../../services/firestore'

const fmtDateTime = (s) => {
  const dt = s ? new Date(s) : null
  return dt && !isNaN(dt.getTime()) ? dt.toLocaleString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'a date to be confirmed'
}

/**
 * My Workspace → top ribbon for a Deacon who has been asked to conduct a
 * Membership Interview (pipeline stage 6). Live; Accept / Decline updates the
 * request and the candidate's membershipPipeline.interview for every workspace.
 */
export default function DeaconInterviewRibbon({ uid, email, myName }) {
  const [requests, setRequests] = useState([])
  const [declining, setDeclining] = useState(null) // request id
  const [reason, setReason] = useState('')
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => subscribeMyInterviewRequests({ uid, email }, setRequests), [uid, email])
  if (!requests.length) return null

  const answer = async (r, accepted) => {
    setBusyId(r.id); setError('')
    try {
      await respondToInterviewRequest(r, accepted, { by: myName, note: accepted ? '' : reason })
      setDeclining(null); setReason('')
    } catch (e) {
      console.error('respondToInterviewRequest', e)
      setError('Could not save your answer. Please try again.')
    }
    setBusyId('')
  }

  return (
    <div className="space-y-2">
      {requests.map((r) => (
        <div key={r.id} className="rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 shadow-sm">
          <p className="text-sm text-amber-950">
            <span className="font-bold">🔔 Interview Invitation:</span> You have been assigned to conduct a Membership Interview for{' '}
            <b>{r.candidateName || 'a membership candidate'}</b> on <b>{fmtDateTime(r.scheduledAt)}</b>.
          </p>
          {r.notes && <p className="text-xs text-amber-900/80 mt-1">Notes: {r.notes}</p>}
          {declining === r.id ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason / suggest another time or deacon (optional)"
                className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg border border-amber-300 text-sm bg-white" />
              <button type="button" disabled={busyId === r.id} onClick={() => answer(r, false)} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold disabled:opacity-50">Send Decline</button>
              <button type="button" onClick={() => setDeclining(null)} className="text-xs text-slate-500">Cancel</button>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" disabled={busyId === r.id} onClick={() => answer(r, true)}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50">✔ Accept Interview</button>
              <button type="button" disabled={busyId === r.id} onClick={() => { setReason(''); setDeclining(r.id) }}
                className="px-3.5 py-1.5 rounded-lg border border-red-300 bg-white text-red-700 text-xs font-bold hover:bg-red-50 disabled:opacity-50">❌ Decline / Reassign</button>
            </div>
          )}
        </div>
      ))}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
