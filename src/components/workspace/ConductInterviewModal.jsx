import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { getInterviewCandidate, submitMembershipInterviewRecord } from '../../services/firestore'
import {
  INTERVIEW_HEADER, INTERVIEW_QUESTIONS, INTERVIEW_ANSWERS, INTERVIEW_BENEFITS,
  INTERVIEW_STATUSES, INTERVIEW_CONNECTION_LEVELS, INTERVIEW_RECOMMENDATIONS, interviewAdvancesPipeline,
} from '../../constants/membershipInterview'
import useModalOpenGuard from '../../hooks/useModalOpenGuard'
import { getMemberDisplayName } from '../../utils/displayName'

const fmtDateTime = (s) => {
  const dt = s ? new Date(s) : null
  return dt && !isNaN(dt.getTime())
    ? dt.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'Time to be confirmed'
}

/**
 * My Workspace → accepted membership interview → "Conduct Membership Interview".
 * Part 1 conversation checklist, Part 2 benefits card, Part 3 final check; submit
 * writes membershipPipeline.interview and (when recommended) completes Stage 6.
 */
export default function ConductInterviewModal({ request, myName, myPcsId, onClose, onSubmitted }) {
  useModalOpenGuard(true)
  const [candidate, setCandidate] = useState(null)
  const [answers, setAnswers] = useState({}) // key → { answer, note }
  const [status, setStatus] = useState('Completed')
  const [connection, setConnection] = useState('')
  const [remarks, setRemarks] = useState('')
  const [recommendation, setRecommendation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getInterviewCandidate(request.candidatePcsId).then(setCandidate).catch(() => setCandidate(false))
  }, [request.candidatePcsId])

  const setAnswer = (key, patch) => setAnswers((a) => ({ ...a, [key]: { ...a[key], ...patch } }))
  const unanswered = INTERVIEW_QUESTIONS.filter((q) => !answers[q.key]?.answer)
  const advances = interviewAdvancesPipeline({ status, recommendation })

  const submit = async () => {
    setError('')
    if (unanswered.length) { setError(`Please answer: ${unanswered.map((q) => q.title).join(', ')}`); return }
    if (!connection) { setError("Choose the applicant's connection."); return }
    if (!recommendation) { setError('Choose your recommendation.'); return }
    setBusy(true)
    try {
      await submitMembershipInterviewRecord(request, {
        conductedByDeaconId: request.deaconPcsId || myPcsId || '',
        conductedByDeaconName: request.deaconName || myName || '',
        part1Answers: Object.fromEntries(INTERVIEW_QUESTIONS.map((q) => [q.key, {
          question: q.title, answer: answers[q.key].answer, note: String(answers[q.key].note || '').trim(),
        }])),
        status, connectionLevel: connection, deaconRemarks: remarks, recommendation,
      }, { advance: advances, by: myName })
      onSubmitted?.(advances)
      onClose()
    } catch (err) {
      console.error('submitMembershipInterviewRecord', err)
      setError(err?.code === 'permission-denied'
        ? 'Not allowed. Only the deacon this accepted interview was assigned to can submit it (or the database rules are not deployed yet).'
        : 'Could not submit the interview. Please try again.')
    } finally { setBusy(false) }
  }

  const sel = 'w-full h-10 px-3 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500'
  const partTitle = (n, text) => <h3 className="text-base font-bold text-slate-800">Part {n}: {text}</h3>
  const name = candidate ? (candidate.legalName || getMemberDisplayName(candidate)) : request.candidateName

  return createPortal(
    <div className="fixed inset-0 w-screen h-[100dvh] z-[70] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Conduct membership interview" onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl mx-auto max-h-[92dvh] flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="shrink-0 bg-indigo-700 text-white px-5 py-4 flex items-center gap-3">
          <p className="flex-1 min-w-0 font-semibold text-sm sm:text-base">{INTERVIEW_HEADER}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full hover:bg-white/15 text-lg">×</button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pt-5 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] space-y-6">
          {/* Candidate card */}
          <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            {candidate?.photoUrl
              ? <img src={candidate.photoUrl} alt="" className="w-16 h-16 rounded-full object-cover border border-slate-200 flex-shrink-0" />
              : <div className="w-16 h-16 rounded-full bg-indigo-600 text-white text-2xl font-bold flex items-center justify-center flex-shrink-0">{(name || '?')[0].toUpperCase()}</div>}
            <div className="min-w-0 space-y-0.5">
              <p className="font-bold text-slate-800 text-lg leading-tight break-words">{name || '—'}</p>
              {candidate?.phone && <a href={`tel:${candidate.phone.replace(/\s+/g, '')}`} className="block text-sm text-indigo-700 hover:underline">{candidate.phone}</a>}
              <p className="text-sm text-slate-600">{request.candidateCell ? `${request.candidateCell} Cell` : 'Cell not recorded'}</p>
              <p className="text-sm text-slate-600">📅 {fmtDateTime(request.scheduledAt)}</p>
            </div>
          </div>

          {/* Part 1 */}
          <section className="space-y-3">
            {partTitle(1, 'Friendly conversation')}
            {INTERVIEW_QUESTIONS.map((q, i) => {
              const a = answers[q.key] || {}
              return (
                <div key={q.key} className="rounded-xl border border-slate-200 p-4 space-y-3">
                  <p className="text-sm text-slate-800"><b>{i + 1}. {q.title}:</b> {q.text}</p>
                  <div className="flex flex-wrap gap-2" role="group" aria-label={q.title}>
                    {INTERVIEW_ANSWERS.map((opt) => (
                      <button key={opt.value} type="button" aria-pressed={a.answer === opt.value} onClick={() => setAnswer(q.key, { answer: opt.value })}
                        className={`min-h-[40px] px-4 rounded-lg border text-sm font-semibold transition-colors ${a.answer === opt.value
                          ? (opt.value === 'positive' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-amber-500 text-white border-amber-500')
                          : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <input value={a.note || ''} onChange={(e) => setAnswer(q.key, { note: e.target.value })} placeholder="Notes (optional)"
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                </div>
              )
            })}
          </section>

          {/* Part 2 */}
          <section>
            {partTitle(2, 'The benefits of church membership')}
            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 my-4 space-y-2">
              <p className="text-sm font-semibold text-amber-900">💡 Guidance for Deacon: Warmly explain these membership benefits:</p>
              <ul className="space-y-1.5">
                {INTERVIEW_BENEFITS.map(([title, text]) => (
                  <li key={title} className="text-sm text-amber-950 leading-relaxed">• <b>{title}:</b> {text}</li>
                ))}
              </ul>
            </div>
          </section>

          {/* Part 3 */}
          <section className="space-y-4">
            {partTitle(3, 'Final check & recommendation')}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-xs font-semibold text-slate-600 mb-1.5">Interview status</span>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel}>
                  {INTERVIEW_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-slate-600 mb-1.5">Applicant's connection</span>
                <select value={connection} onChange={(e) => setConnection(e.target.value)} className={sel}>
                  <option value="">Select…</option>
                  {INTERVIEW_CONNECTION_LEVELS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-600 mb-1.5">Deacon's remarks</span>
              <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} placeholder="Enter summary notes and observations..."
                className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
            </label>
            <fieldset>
              <legend className="block text-xs font-semibold text-slate-600 mb-1.5">Recommendation</legend>
              <div className="flex flex-col sm:flex-row gap-2">
                {INTERVIEW_RECOMMENDATIONS.map((r) => (
                  <label key={r} className={`flex-1 flex items-center gap-2 rounded-lg border px-3 py-2.5 cursor-pointer text-sm font-semibold ${recommendation === r
                    ? (r === 'Recommend Membership' ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-amber-500 bg-amber-50 text-amber-900')
                    : 'border-slate-300 text-slate-700'}`}>
                    <input type="radio" name="recommendation" value={r} checked={recommendation === r} onChange={() => setRecommendation(r)} className="accent-indigo-600" />
                    {r}
                  </label>
                ))}
              </div>
            </fieldset>
            {(status || recommendation) && (
              <p className="text-xs text-slate-500">
                {advances
                  ? 'Submitting completes Stage 6 and moves the application to Stage 7 (Pastoral Approval).'
                  : 'With a follow-up, the application stays at Stage 6 and the Caring team can schedule another interview.'}
              </p>
            )}
          </section>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="button" disabled={busy} onClick={submit}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl shadow-md transition-all disabled:opacity-50">
            {busy ? 'Submitting…' : 'Submit Membership Interview Record'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
