import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { subscribeMyInterviewRequests, respondToInterviewRequest, scheduleDeaconInterview } from '../../services/firestore'
import ScheduleMeetingModal from './ScheduleMeetingModal'
import { MEETING_MODES, scheduleWhere } from '../../utils/meetingSchedule'
import useClickOutside from '../../hooks/useClickOutside'
import ConductInterviewModal from './ConductInterviewModal'
import { RIBBON_BAR } from '../../constants/ribbon'

const fmtDateTime = (s) => {
  const dt = s ? new Date(s) : null
  return dt && !isNaN(dt.getTime())
    ? dt.toLocaleString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'a date to be confirmed'
}

/** One invitation — Worship-ribbon style banner ("Hello …, you are assigned …  More →");
 *  More toggles the details and Accept / Decline just below it. */
function InterviewInvite({ r, myName, onRecorded }) {
  const [expanded, setExpanded] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [conducting, setConducting] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const modeLabel = MEETING_MODES.find((m) => m.value === r.schedule?.mode)?.label || ''
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
      // Accepted → set the date, time and mode (the form opens from the banner later).
      if (yes) setScheduling(true)
    } catch (e) {
      console.error('respondToInterviewRequest', e)
      setError('Could not save your answer. Please try again.')
    }
    setBusy(false)
  }

  return (
    <div ref={cardRef} className="w-full my-3">
      {/* The whole bar opens / closes the details — no separate "More" button. */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setExpanded((v) => !v) } }}
        className={`${accepted ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700'} text-white rounded-xl shadow-md justify-between cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 ${RIBBON_BAR}`}
      >
        <span className="min-w-0 text-sm font-medium tracking-wide">
          {accepted
            ? <>Hello {firstName}, you have accepted the interview for <b>{r.candidateName || 'the candidate'}</b> on {fmtDateTime(r.scheduledAt)}{modeLabel ? ` · ${modeLabel}` : ''}.</>
            : <>Hello {firstName}, you are assigned for the membership interview of <b>{r.candidateName || 'a candidate'}</b> on {fmtDateTime(r.scheduledAt)}.</>}
        </span>
        {accepted && (
          <div className="flex-shrink-0 flex flex-col sm:flex-row gap-1.5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setScheduling(true)}
              className="bg-emerald-700/80 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg whitespace-nowrap">
              {r.schedule?.at ? '🗓 Reschedule' : '🗓 Schedule Interview'}
            </button>
            <button type="button" onClick={() => setConducting(true)}
              className="bg-white text-emerald-700 hover:bg-emerald-50 text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm whitespace-nowrap">
              📋 Conduct Membership Interview
            </button>
          </div>
        )}
        <ChevronRight size={18} aria-hidden="true" className={`flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </div>

      {expanded && (
        <div className="mt-2 rounded-xl border border-slate-200 bg-white shadow-sm px-4 py-3 space-y-3">
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
            <div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Candidate</dt><dd className="font-semibold text-slate-800">{r.candidateName || '—'}</dd></div>
            <div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Assigned Cell</dt><dd className="text-slate-800">{r.candidateCell || '—'}</dd></div>
            <div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Interview</dt><dd className="text-slate-800">{fmtDateTime(r.scheduledAt)}</dd></div>
          </dl>
          {r.schedule?.at && (
            <p className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              {modeLabel}{scheduleWhere(r.schedule) ? ` · ${scheduleWhere(r.schedule)}` : ''}{r.schedule.notes ? ` · ${r.schedule.notes}` : ''}
            </p>
          )}
          {r.notes && <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">Notes: {r.notes}</p>}

          {accepted ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-emerald-700">✔ Accepted. This interview stays on your workspace until you record it.</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <button type="button" onClick={() => setScheduling(true)}
                  className="bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50 font-semibold px-4 py-2.5 rounded-lg text-sm">
                  {r.schedule?.at ? '🗓 Reschedule' : '🗓 Schedule Interview'}
                </button>
                <button type="button" onClick={() => setConducting(true)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2.5 rounded-lg text-sm shadow-sm">
                  📋 Conduct Membership Interview
                </button>
              </div>
            </div>
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
      {scheduling && (
        <ScheduleMeetingModal
          title={r.schedule?.at ? 'Reschedule Interview' : 'Schedule Interview'}
          subtitle={`${r.candidateName || 'Candidate'}${r.candidateCell ? ` · ${r.candidateCell}` : ''}`}
          accent="emerald"
          initial={r.schedule || (r.scheduledAt ? { at: r.scheduledAt } : null)}
          onSave={(sched) => scheduleDeaconInterview(r, sched, myName)}
          onClose={() => setScheduling(false)}
        />
      )}
      {conducting && (
        <ConductInterviewModal
          request={r}
          myName={myName}
          onClose={() => setConducting(false)}
          onSubmitted={(advanced) => onRecorded?.(advanced ? '✓ Interview recorded. The application moves to Pastoral Approval.' : '✓ Interview recorded with a follow-up. The Caring team will be in touch.')}
        />
      )}
    </div>
  )
}

/**
 * My Workspace → Membership Interview invitations for a Deacon (pipeline stage 6),
 * in the Worship roster ribbon's design: a solid indigo "Hello …, you are assigned …"
 * banner with More → revealing the details and Accept / Decline. Once accepted it
 * turns green ("you have accepted …") with 📋 Conduct Membership Interview, and stays
 * until the interview is recorded (even after the scheduled time). Live (onSnapshot).
 */
export default function DeaconInterviewRibbon({ uid, email, myName }) {
  const [requests, setRequests] = useState([])
  // Confirmation after an interview is recorded (its request leaves the list).
  const [recorded, setRecorded] = useState('')
  useEffect(() => subscribeMyInterviewRequests({ uid, email }, setRequests), [uid, email])
  const shown = requests.filter((r) => r.status === 'pending' || r.status === 'accepted')
  if (!shown.length && !recorded) return null
  return (
    <div>
      {recorded && (
        <p role="status" className="w-full max-w-xl mx-auto my-3 text-sm font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">{recorded}</p>
      )}
      {shown.map((r) => <InterviewInvite key={r.id} r={r} myName={myName} onRecorded={setRecorded} />)}
    </div>
  )
}
