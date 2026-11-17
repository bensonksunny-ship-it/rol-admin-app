import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getWorshipApplicationByToken } from '../services/firestore'
import { ApplicationForm, ThankYou } from './worship/WorshipApplications'

/**
 * Public Worship Ministry application page — /worship-apply?token=…
 * The Worship Director sends this link from The Team page (+ button). The candidate
 * fills it signed-out; rules allow reading an open, unexpired invite by its token and
 * submitting it exactly once (invited → pending).
 */
export default function WorshipApply() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [invite, setInvite] = useState(null)
  const [state, setState] = useState(token ? 'loading' : 'invalid') // loading | ready | done | invalid | error

  useEffect(() => {
    if (!token) return
    getWorshipApplicationByToken(token)
      .then((inv) => {
        const expired = inv?.expiresAt && inv.expiresAt < new Date()
        if (!inv || inv.status !== 'invited' || expired) { setState('invalid'); return }
        setInvite(inv)
        setState('ready')
      })
      // A submitted / withdrawn / expired invite is no longer readable signed-out.
      .catch((err) => setState(err?.code === 'permission-denied' ? 'invalid' : 'error'))
  }, [token])

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="max-w-2xl mx-auto">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">River Of Life Church</p>
        {state === 'loading' && <p className="text-center text-sm text-slate-400 py-24">Loading…</p>}
        {state === 'invalid' && (
          <div className="text-center py-24 space-y-2">
            <h2 className="text-lg font-bold text-slate-800">This link is no longer active</h2>
            <p className="text-sm text-slate-500 max-w-xs mx-auto">It may have already been submitted, withdrawn or expired. Please ask your Worship Director for a new link.</p>
          </div>
        )}
        {state === 'error' && (
          <div className="text-center py-24 space-y-2">
            <h2 className="text-lg font-bold text-slate-800">Could not open the form</h2>
            <p className="text-sm text-slate-500">Check your internet connection and reload the page.</p>
          </div>
        )}
        {state === 'ready' && invite && (
          <ApplicationForm invite={invite} submittedBy="" onSubmitted={() => setState('done')} />
        )}
        {state === 'done' && <ThankYou />}
      </div>
    </div>
  )
}
