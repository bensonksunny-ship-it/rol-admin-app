import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { subscribeMyInterviewRequests, respondToInterviewRequest } from '../../services/firestore'
import useClickOutside from '../../hooks/useClickOutside'

const fmtDateTime = (s) => {
  const dt = s ? new Date(s) : null
  return dt && !isNaN(dt.getTime())
    ? dt.toLocaleString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'a date to be confirmed'
}
// An accepted interview stays on the workspace (as its schedule entry) until a few
// hours after the scheduled time.
const isUpcoming = (s) => { const t = s ? new Date(s).getTime() : NaN; return isNaN(t) || t > Date.now() - 6 * 60 * 60 * 1000 }

/** One invitation — Worship-ribbon style banner ("Hello …, you are assigned …  More →");
 *  More toggles the details and Accept / Decline just below it. */
function InterviewInvite({ r, myName }) {
  const [expanded, setExpanded] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const cardRef = useRef(null)
  const collapse = useCallback(() => { setExpanded(false); setDeclining(false) }, [])
  useClickOutside(cardRef, collapse, expanded)
  const firstName = String(myName || '').trim().split(/\s+/)[0] || 'there'
  const accepted = r.status === 'accepted'

  const answer = async (yes) => {
    setBusy(true); setError('')
    try {
      // Sets membershipPipeline.interview.status ('Accepted' / 'Declined') on the candidate too;
      // the live feed then flips this banner to its accepted wording (or removes it on decline).
      await respondToInterviewRequest(r, yes, { by: myName, note: yes ? '' : reason })
    } catch (e) {
      console.error('respondToInterviewRequest', e)
      setError('Could not save your answer. Please try again.')
    }
    setBusy(false)
  }

  return (
    <div ref={cardRef} className="w-full max-w-xl mx-auto my-3">
      <div className={`${accepted ? 'bg-emerald-600' : 'bg-indigo-600'} text-white rounded-xl px-5 py-3 shadow-md flex items-center justify-between gap-3 w-full`}>
        <span className="min-w-0 text-sm font-medium tracking-wide">
          {accepted
            ? <>Hello {firstName}, you have accepted the interview for <b>{r.candidateName || 'the candidate'}</b> on {fmtDateTime(r.scheduledAt)}.</>
            : <>Hello {firstName}, you are assigned for the membership interview of <b>{r.candidateName || 'a candidate'}</b> on {fmtDateTime(r.scheduledAt)}.</>}
        </span>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className={`flex-shrink-0 ${accepted ? 'bg-emerald-700/80 hover:bg-emerald-700' : 'bg-indigo-700/80 hover:bg-indigo-700'} text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all`}
        >
          More <ChevronRight size={14} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </button>
      </div>

      {expanded && (
        <div className="mt-2 rounded-xl border border-slate-200 bg-white shadow-sm px-4 py-3 space-y-3">
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
            <div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Candidate</dt><dd className="font-semibold text-slate-800">{r.candidateName || '—'}</dd></div>
            <div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Assigned Cell</dt><dd className="text-slate-800">{r.candidateCell || '—'}</dd></div>
            <div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Interview</dt><dd className="text-slate-800">{fmtDateTime(r.scheduledAt)}</dd></div>
          </dl>
          {r.notes && <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">Notes: {r.notes}</p>}

          {accepted ? (
            <p className="text-sm font-semibold text-emerald-700">✔ Accepted — this interview is on your workspace schedule.</p>
          ) : declining ? (
            <div className="flex flex-wrap items-center gap-2">
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason / suggest another time or deacon (optional)"
                className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-slate-300 text-sm" />
              <button type="button" disabled={busy} onClick={() => answer(false)}
                className="bg-rose-600 hover:bg-rose-700 text-white font-medium px-3 py-2 rounded-lg text-sm shadow-sm disabled:opacity-50">Send Decline</button>
              <button type="button" onClick={() => setDeclining(false)} className="text-sm text-slate-500">Cancel</button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => answer(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 py-2 rounded-lg text-sm shadow-sm disabled:opacity-50">
                {busy ? 'Saving…' : '✔ Accept Interview'}
              </button>
              <button type="button" disabled={busy} onClick={() => { setReason(''); setDeclining(true) }}
                className="bg-rose-50 text-rose-700 hover:bg-rose-100 font-medium px-3 py-2 rounded-lg text-sm border border-rose-200 disabled:opacity-50">
                ❌ Decline / Reassign
              </button>
            </div>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  )
}

/**
 * My Workspace → Membership Interview invitations for a Deacon (pipeline stage 6),
 * in the Worship roster ribbon's design: a solid indigo "Hello …, you are assigned …"
 * banner with More → revealing the details and Accept / Decline. Once accepted it
 * turns green ("you have accepted …") and stays as the Deacon's schedule entry until
 * the interview has taken place. Live (onSnapshot).
 */
export default function DeaconInterviewRibbon({ uid, email, myName }) {
  const [requests, setRequests] = useState([])
  useEffect(() => subscribeMyInterviewRequests({ uid, email }, setRequests), [uid, email])
  const shown = requests.filter((r) => r.status === 'pending' || (r.status === 'accepted' && isUpcoming(r.scheduledAt)))
  if (!shown.length) return null
  return (
    <div>
      {shown.map((r) => <InterviewInvite key={r.id} r={r} myName={myName} />)}
    </div>
  )
}
