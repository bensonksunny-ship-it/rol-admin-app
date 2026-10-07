import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { subscribePendingApprovals, approvePCSDiscard, rejectPCSDiscard } from '../../services/firestore'
import { formatTimestampFull } from '../../utils/date'

/**
 * Founder-only "Approvals" queue on My Workspace. Today it holds PCS Discard
 * requests from Caring (status 'pending_discard' profiles). The bell's
 * "PCS Discard Request" notification deep-links here with ?approval=<id>,
 * which scrolls to and highlights that request. Hidden when nothing is pending.
 */
export default function ApprovalsCard() {
  const { userProfile, isFounder } = useAuth()
  const [searchParams] = useSearchParams()
  const focusId = searchParams.get('approval') || ''
  const [approvals, setApprovals] = useState([])
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  const cardRef = useRef(null)

  useEffect(() => {
    if (!isFounder) return
    return subscribePendingApprovals(setApprovals, () => setError('Could not load approvals.'))
  }, [isFounder])

  useEffect(() => {
    if (focusId && approvals.some((a) => a.id === focusId)) {
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [focusId, approvals])

  if (!isFounder || approvals.length === 0) return null

  const decidedBy = userProfile?.displayName || userProfile?.email || ''

  const decide = async (a, approve) => {
    const msg = approve
      ? `Approve discard? ${a.memberName || 'This profile'} will be deleted from PCS. This cannot be undone.`
      : `Reject the request and keep ${a.memberName || 'this profile'} active in PCS?`
    if (!window.confirm(msg)) return
    setBusyId(a.id)
    setError('')
    try {
      await (approve ? approvePCSDiscard(a, decidedBy) : rejectPCSDiscard(a, decidedBy))
    } catch (err) {
      console.error('Approval decision failed:', err)
      setError('Could not save the decision. Please try again.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section ref={cardRef} id="approvals" className="w-full rounded-xl border border-amber-300 dark:border-amber-500/40 shadow-sm overflow-hidden sm:max-w-2xl scroll-mt-20">
      <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-500/10 border-b border-amber-200 dark:border-amber-500/30">
        <h2 className="text-sm font-bold text-amber-900 dark:text-amber-200">Approvals</h2>
        <span className="text-xs font-bold text-amber-800 bg-amber-100 dark:bg-amber-500/20 dark:text-amber-200 rounded-full px-2 py-0.5 tabular-nums">{approvals.length}</span>
      </div>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
        {approvals.map((a) => (
          <li key={a.id} className={`px-4 py-3 space-y-2 ${a.id === focusId ? 'bg-amber-50/60 dark:bg-amber-500/5' : ''}`}>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-red-700 dark:text-red-300">
                {a.type === 'pcs_discard' ? 'PCS Discard Request' : a.type}
              </p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {a.memberName || 'Unnamed profile'}
                {a.memberPhone && <span className="font-normal text-slate-500 dark:text-slate-400"> · {a.memberPhone}</span>}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Requested by {a.requestedBy || 'unknown'}{a.timestamp ? ` · ${formatTimestampFull(a.timestamp)}` : ''}
              </p>
              {a.reason && (
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5">
                  “{a.reason}”
                </p>
              )}
            </div>
            {a.type === 'pcs_discard' && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busyId === a.id}
                  onClick={() => decide(a, true)}
                  className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50"
                >
                  Approve Discard
                </button>
                <button
                  type="button"
                  disabled={busyId === a.id}
                  onClick={() => decide(a, false)}
                  className="min-h-[40px] px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  Reject / Keep Active
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="px-4 py-2 text-xs text-red-600 bg-white dark:bg-slate-900">{error}</p>}
    </section>
  )
}
