import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight } from 'lucide-react'
import { subscribeMyBaptismSignoffs, submitBaptismCellSignoff } from '../../services/firestore'
import { RIBBON_BAR } from '../../constants/ribbon'

// Baptism Stage 2 readiness checklist — all three ticked to sign off.
const CHECKS = [
  { key: 'attendsCell', text: 'Attends our cell group regularly' },
  { key: 'discussedAtCell', text: 'We talked about baptism together at our cell meeting' },
  { key: 'understandsAndReady', text: 'Understands what baptism means and is ready to take it' },
]

const fmtDay = (iso) => {
  const d = iso ? new Date(iso) : null
  return d && !isNaN(d.getTime()) ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}

/** Ready / not ready, then (when ready) the exam link to pass on to the candidate. */
function SignoffModal({ r, myName, uid, onClose }) {
  const [checks, setChecks] = useState({})
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [doneLink, setDoneLink] = useState('') // set after a "ready" sign-off
  const [copied, setCopied] = useState(false)
  const allTicked = CHECKS.every((c) => checks[c.key])
  const first = String(r.candidateName || 'the candidate').split(' ')[0]

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const send = async (ready) => {
    if (!ready && !notes.trim()) { setError('Please add a short note on what is still needed.'); return }
    setBusy(true); setError('')
    try {
      await submitBaptismCellSignoff(r, { ready, checks, notes, by: myName, uid })
      if (ready) setDoneLink(`${window.location.origin}/baptism-exam?token=${r.applicationId}`)
      else onClose()
    } catch (e) {
      console.error('submitBaptismCellSignoff', e)
      setError(e?.code === 'permission-denied'
        ? 'Could not save: this request was already answered, or it was sent to a different cell leader. Please contact the Caring team.'
        : 'Could not submit. Please check your connection and try again.')
    }
    setBusy(false)
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(doneLink); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { window.prompt('Copy this link:', doneLink) }
  }
  const waText = encodeURIComponent(`Hi ${first}, you're ready for the next step towards baptism! Please take this short exam: ${doneLink}`)

  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Baptism readiness — ${r.candidateName}`}
        className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-violet-600 text-white px-5 py-3 flex items-center gap-3">
          <p className="flex-1 min-w-0 font-bold truncate">Baptism Readiness</p>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center text-lg">×</button>
        </div>
        {doneLink ? (
          <div className="p-5 space-y-4 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xl">✓</div>
            <p className="font-bold text-slate-800">Signed off — thank you!</p>
            <p className="text-sm text-slate-600">{first}'s baptism exam is now open. Send them the link:</p>
            <div className="grid grid-cols-2 gap-2">
              <a href={`https://wa.me/?text=${waText}`} target="_blank" rel="noreferrer"
                className="min-h-[44px] rounded-xl bg-emerald-600 text-white text-sm font-bold flex items-center justify-center">Share on WhatsApp</a>
              <button type="button" onClick={copy} className="min-h-[44px] rounded-xl border border-slate-300 text-sm font-bold text-slate-700 hover:bg-slate-50">
                {copied ? 'Copied ✓' : 'Copy exam link'}
              </button>
            </div>
            <button type="button" onClick={onClose} className="text-xs font-semibold text-slate-500 hover:text-slate-700">Done</button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="font-bold text-slate-900">{r.candidateName || '—'}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {[r.candidateCell, r.preferredBatchDate && `Prefers ${fmtDay(r.preferredBatchDate)}`].filter(Boolean).join(' · ') || 'Baptism application submitted'}
              </p>
              {r.candidatePhone && <a href={`tel:${r.candidatePhone}`} className="text-sm text-blue-600 font-bold underline">📞 {r.candidatePhone}</a>}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Readiness checklist</p>
              <p className="text-xs text-slate-500">Confirm after a shared cell meeting with {first}.</p>
              <div className="space-y-2 mt-2">
                {CHECKS.map((c, i) => (
                  <label key={c.key} className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 cursor-pointer ${checks[c.key] ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <input type="checkbox" checked={!!checks[c.key]} onChange={(e) => setChecks((v) => ({ ...v, [c.key]: e.target.checked }))} className="mt-0.5 w-4 h-4 accent-emerald-600" />
                    <span className="text-sm text-slate-700">{i + 1}. {c.text}</span>
                  </label>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Notes (needed if not ready yet)</span>
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the Caring team should know"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-200" />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="button" disabled={busy || !allTicked} onClick={() => send(true)}
              className="w-full min-h-[44px] rounded-xl bg-violet-600 text-white text-sm font-bold hover:bg-violet-700 disabled:opacity-50">
              {busy ? 'Saving…' : '✓ Ready for baptism — sign off'}
            </button>
            <button type="button" disabled={busy} onClick={() => send(false)}
              className="w-full min-h-[40px] rounded-xl border border-amber-300 text-amber-800 text-sm font-semibold hover:bg-amber-50 disabled:opacity-50">
              Not ready yet
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

/**
 * My Workspace → Baptism Application Stage 2 for a Cell Leader: one violet ribbon
 * per candidate Caring asked them to sign off. "Confirm readiness" opens the
 * checklist; the answer completes (or flags) Stage 2 on the application and the
 * ribbon drops out. Live (onSnapshot).
 */
export default function BaptismSignoffRibbon({ uid, email, myName }) {
  const [requests, setRequests] = useState([])
  const [open, setOpen] = useState(null)
  useEffect(() => subscribeMyBaptismSignoffs({ uid, email }, setRequests), [uid, email])
  if (!requests.length && !open) return null
  const firstName = (r) => String(myName || r.cellLeaderName || '').trim().split(/\s+/)[0] || 'there'
  return (
    <div>
      {requests.map((r) => (
        <div key={r.id} className={`${RIBBON_BAR} rounded-xl bg-violet-600 text-white shadow-md justify-between my-3`}>
          <span className="min-w-0 text-sm font-medium tracking-wide">
            Hello {firstName(r)}, please confirm <b>{r.candidateName || 'a member'}</b>{r.candidateCell ? ` (${r.candidateCell})` : ''} is ready for baptism.
          </span>
          <button type="button" onClick={() => setOpen(r)}
            className="flex-shrink-0 bg-white text-violet-700 hover:bg-violet-50 text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1 whitespace-nowrap">
            Confirm readiness <ChevronRight size={14} />
          </button>
        </div>
      ))}
      {/* Kept mounted after the request closes so the exam-link step stays visible. */}
      {open && <SignoffModal r={open} myName={myName} uid={uid} onClose={() => setOpen(null)} />}
    </div>
  )
}
