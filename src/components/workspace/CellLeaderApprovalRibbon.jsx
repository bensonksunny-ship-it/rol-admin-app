import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight } from 'lucide-react'
import { subscribeMyCellLeaderApprovals, submitCellLeaderApproval } from '../../services/firestore'

// Stage 5 call checklist — all three must be confirmed to submit.
const QUESTIONS = [
  { key: 'enjoyingCellGroup', text: 'Are you enjoying being part of our cell group?' },
  { key: 'acceptedJesus', text: 'Have you accepted Jesus as your Lord and Saviour?' },
  { key: 'desireToGrowAtROL', text: 'Would you like to continue growing with our River of Life church family?' },
]

/** Indian mobile → "+91…" for tel: links; anything else passed through. */
const telHref = (phone) => {
  const digits = String(phone || '').replace(/[^\d+]/g, '')
  if (!digits) return ''
  if (digits.startsWith('+')) return `tel:${digits}`
  return `tel:${digits.length === 10 ? `+91${digits}` : digits}`
}

/** Focused review: who to call, the 3 questions, notes, submit. */
function ReviewModal({ r, myName, uid, onClose }) {
  const [answers, setAnswers] = useState({})
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const allTicked = QUESTIONS.every((q) => answers[q.key])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async () => {
    setBusy(true); setError('')
    try {
      await submitCellLeaderApproval(r, { answers, notes, by: myName, uid })
      onClose() // the live feed drops the ribbon once it's completed
    } catch (e) {
      console.error('submitCellLeaderApproval', e)
      setError(e?.code === 'permission-denied'
        ? 'This request is no longer open (it may have been re-sent or completed by the Caring team). Please refresh, or contact the Caring team.'
        : 'Could not submit. Please check your connection and try again.')
    }
    setBusy(false)
  }

  const tel = telHref(r.candidatePhone)
  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Cell Leader Approval — ${r.candidateName}`}
        className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-sky-600 text-white px-5 py-3 flex items-center gap-3">
          <p className="flex-1 min-w-0 font-bold truncate">Cell Leader Approval</p>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center text-lg">×</button>
        </div>
        <div className="p-5 space-y-4">
          {/* Candidate card */}
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
            {r.candidatePhotoUrl
              ? <img src={r.candidatePhotoUrl} alt="" className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
              : <span className="w-14 h-14 rounded-full bg-sky-100 text-sky-700 text-xl font-black flex items-center justify-center flex-shrink-0">{(r.candidateName || '?')[0].toUpperCase()}</span>}
            <div className="min-w-0">
              <p className="font-bold text-slate-900">{r.candidateName || '—'}</p>
              {tel
                ? <a href={tel} className="text-blue-600 font-bold underline">📞 {r.candidatePhone}</a>
                : <p className="text-sm text-slate-400">No phone number on record</p>}
              <p className="text-xs text-slate-500 mt-0.5">{[r.candidateCell, r.attendingSince].filter(Boolean).join(' · ') || 'Cell attendance not recorded'}</p>
            </div>
          </div>

          <div>
            <p className="text-sm font-bold text-slate-800">Call checklist</p>
            <p className="text-xs text-slate-500">Call {String(r.candidateName || 'the applicant').split(' ')[0]} and tick each question they agree with.</p>
            <div className="space-y-2 mt-2">
              {QUESTIONS.map((q, i) => (
                <label key={q.key} className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 cursor-pointer ${answers[q.key] ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <input type="checkbox" checked={!!answers[q.key]} onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.checked }))} className="mt-0.5 w-4 h-4 accent-emerald-600" />
                  <span className="text-sm text-slate-700">{i + 1}. {q.text}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Notes (optional)</span>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the Pastoral team should know"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-sky-200" />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="button" disabled={busy || !allTicked} onClick={submit}
            className="w-full min-h-[44px] rounded-xl bg-sky-600 text-white text-sm font-bold hover:bg-sky-700 disabled:opacity-50">
            {busy ? 'Submitting…' : 'Submit Cell Leader Approval'}
          </button>
          {!allTicked && <p className="text-[11px] text-slate-400 text-center">Tick all 3 questions to submit.</p>}
        </div>
      </div>
    </div>,
    document.body
  )
}

/**
 * My Workspace → membership review requests for a Cell Leader (pipeline stage 5):
 * a sky-blue "Hello …, membership application review requested for …" ribbon per
 * pending request; "Review & Call Applicant →" opens the call checklist. Submitting
 * completes stage 5 on the candidate, so every Caring / Founder workspace moves the
 * candidate to stage 6 live. Live (onSnapshot).
 */
export default function CellLeaderApprovalRibbon({ uid, email, myName }) {
  const [requests, setRequests] = useState([])
  const [open, setOpen] = useState(null)
  useEffect(() => subscribeMyCellLeaderApprovals({ uid, email }, setRequests), [uid, email])
  if (!requests.length) return null
  const firstName = (r) => String(myName || r.cellLeaderName || '').trim().split(/\s+/)[0] || 'there'
  return (
    <div>
      {requests.map((r) => (
        <div key={r.id} className="bg-sky-600 text-white rounded-xl px-5 py-3 shadow-md flex items-center justify-between gap-3 w-full max-w-xl mx-auto my-3">
          <span className="min-w-0 text-sm font-medium tracking-wide">
            Hello {firstName(r)}, membership application review requested for <b>{r.candidateName || 'a member'}</b>{r.candidateCell ? ` (${r.candidateCell})` : ''}.
          </span>
          <button type="button" onClick={() => setOpen(r)}
            className="flex-shrink-0 bg-sky-700/80 hover:bg-sky-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all whitespace-nowrap">
            Review &amp; Call Applicant <ChevronRight size={14} />
          </button>
        </div>
      ))}
      {open && <ReviewModal r={open} myName={myName} uid={uid} onClose={() => setOpen(null)} />}
    </div>
  )
}
