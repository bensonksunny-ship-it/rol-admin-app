import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { getPCSEntries, requestMembershipInterview } from '../../services/firestore'
import { advanceBlockReason, currentStage } from '../../utils/membershipPipeline'
import { deaconStatusOf } from '../../utils/deaconOffice'
import { getMemberDisplayName } from '../../utils/displayName'

const todayIso = () => new Date().toISOString().slice(0, 10)
const fmt = (d) => {
  const dt = d ? new Date(d) : null
  return dt && !isNaN(dt.getTime()) ? dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
}
const fmtDateTime = (s) => {
  const dt = s ? new Date(s) : null
  return dt && !isNaN(dt.getTime()) ? dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
}

// Stage 4 — every item must be ticked before verification can be completed.
const VERIFICATION_CHECKLIST = [
  { key: 'infoVerified', label: 'All information given checked and verified' },
  { key: 'idCopy', label: 'Submitted ID card copy' },
  { key: 'baptismProof', label: 'Submitted baptism certificate / self-declaration form' },
  { key: 'securityDeposit', label: 'Payment of security deposit is done' },
  { key: 'photo', label: 'Physical photo is provided' },
]

const TITLES = {
  verification: 'Stage 4: Document & Information Verification',
  membershipInterview: 'Assign Deacon for Membership Interview',
}

const INTERVIEW_STATUS_CLS = {
  Requested: 'bg-amber-100 text-amber-800 border-amber-200',
  Accepted: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Declined: 'bg-red-100 text-red-700 border-red-200',
}

/** Interview request summary, e.g. "Requested · Bro. Sam · 12 Oct 2026, 6:00 pm". */
export function InterviewStatusLine({ interview }) {
  if (!interview?.deaconName) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className={`font-bold px-2 py-0.5 rounded-full border ${INTERVIEW_STATUS_CLS[interview.status] || INTERVIEW_STATUS_CLS.Requested}`}>
        Interview {interview.status || 'Requested'}
      </span>
      <span className="text-slate-600">Deacon {interview.deaconName}{interview.scheduledAt ? ` · ${fmtDateTime(interview.scheduledAt)}` : ''}</span>
      {interview.status === 'Declined' && interview.responseNote && <span className="text-red-600">· "{interview.responseNote}"</span>}
    </div>
  )
}

/** Stage 5/6: pick an active Deacon, a date & time and notes, then send the request. */
function InterviewAssign({ entry, by, onSaved }) {
  const existing = entry.membershipPipeline?.interview
  const [deacons, setDeacons] = useState(null)
  const [deaconId, setDeaconId] = useState(existing?.status !== 'Declined' ? (existing?.deaconPcsId || '') : '')
  const [at, setAt] = useState(existing?.scheduledAt || '')
  const [notes, setNotes] = useState(existing?.notes || '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    getPCSEntries()
      .then((list) => setDeacons(list.filter((e) => deaconStatusOf(e.deaconOffice) === 'Active' && e.id !== entry.id)
        .sort((a, b) => getMemberDisplayName(a).localeCompare(getMemberDisplayName(b)))))
      .catch(() => setDeacons([]))
  }, [entry.id])

  const send = async () => {
    const deacon = deacons.find((d) => d.id === deaconId)
    if (!deacon || !at) return
    setBusy(true); setMsg('')
    try {
      const { interview, account } = await requestMembershipInterview({ candidate: entry, deacon, scheduledAt: at, notes, by })
      onSaved?.(interview)
      setMsg(account
        ? `✓ Sent. ${getMemberDisplayName(deacon)} will see it on their My Workspace.`
        : `Saved, but ${getMemberDisplayName(deacon)} has no app account matching their email or name, so no workspace notification can reach them. Please tell them directly.`)
    } catch (e) {
      console.error('requestMembershipInterview', e)
      setMsg('Could not send the request. Please try again.')
    }
    setBusy(false)
  }

  const inp = 'w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white'
  return (
    <div className="space-y-3">
      <InterviewStatusLine interview={existing} />
      {deacons === null ? <p className="text-xs text-slate-400">Loading deacons…</p>
        : deacons.length === 0 ? <p className="text-sm text-slate-500">No active Deacons yet. Mark someone as Deacon from their PCS profile (Founder / Senior Pastor).</p>
        : (
          <>
            <label className="block">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Deacon</span>
              <select value={deaconId} onChange={(e) => setDeaconId(e.target.value)} className={inp}>
                <option value="">Select a deacon…</option>
                {deacons.map((d) => <option key={d.id} value={d.id}>{getMemberDisplayName(d)}{d.phone ? ` · ${d.phone}` : ''}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Interview date &amp; time</span>
              <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className={inp} />
            </label>
            <label className="block">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Notes for the interviewer (optional)</span>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inp} resize-none`} />
            </label>
            <button type="button" disabled={busy || !deaconId || !at} onClick={send}
              className="w-full min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50">
              {busy ? 'Sending…' : existing?.deaconName && existing.status !== 'Declined' ? 'Re-send Interview Request' : 'Send Interview Request to Deacon'}
            </button>
          </>
        )}
      {msg && <p className={`text-xs ${msg.startsWith('✓') ? 'text-emerald-700' : 'text-amber-700'}`}>{msg}</p>}
    </div>
  )
}

/**
 * Opened by clicking a stage number (1–8) in the Membership stepper: shows that
 * stage's state and, when it's the current stage and this user may act, the
 * action for it (checklist, sign-off, deacon interview, approval, issue).
 */
export default function MembershipStageModal({
  stage, stages, entry, cellLeaderName = '', canCaring, canPastor, canFirstLady, by, busy, undoKey,
  onComplete, onIssue, onUndo, onInterviewSaved, onClose,
}) {
  const cur = currentStage(stages)
  const isCur = cur?.key === stage.key
  const block = isCur ? advanceBlockReason(stage, stages, { canCaring, canPastor, canFirstLady }) : ''
  const canAct = isCur && !block
  const verificationDone = stages.find((s) => s.key === 'verification')?.done
  const canAssignInterview = (canCaring || canFirstLady) && verificationDone
    && !stages.find((s) => s.key === 'membershipInterview')?.done
    && ['cellLeaderApproval', 'membershipInterview'].includes(stage.key)

  const [checks, setChecks] = useState({})
  const [leader, setLeader] = useState({ approvedBy: cellLeaderName, signedOn: todayIso() })
  const [interviewDate, setInterviewDate] = useState(String(entry.membershipPipeline?.interview?.scheduledAt || '').slice(0, 10) || todayIso())
  const [memberNo, setMemberNo] = useState(entry.membershipNumber || '')
  const allChecked = VERIFICATION_CHECKLIST.every((c) => checks[c.key])
  const btn = 'w-full min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50'
  const inp = 'w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white'
  const done = (rec) => { onComplete(stage, rec); onClose() }

  return createPortal(
    <div className="fixed inset-0 z-[85] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-[480px] max-h-[92vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{getMemberDisplayName(entry)} · Stage {stage.n} of 8</p>
            <p className="font-bold text-slate-800">{TITLES[stage.key] || `Stage ${stage.n}: ${stage.label}`}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-lg text-slate-500">×</button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-600">{stage.detail}</p>

          {/* Status of this stage */}
          {stage.done ? (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
              ✓ Completed{stage.completedAt ? ` on ${fmt(stage.completedAt)}` : ''}{stage.by ? ` by ${stage.by}` : ''}
              {stage.extra?.approvedBy && <div className="text-xs">Signed by {stage.extra.approvedBy}{stage.extra.signedOn ? ` · ${fmt(stage.extra.signedOn)}` : ''}</div>}
              {stage.extra?.interviewDate && <div className="text-xs">Interview held {fmt(stage.extra.interviewDate)}{stage.extra.interviewer ? ` · Deacon ${stage.extra.interviewer}` : ''}</div>}
              {stage.extra?.checklist && <div className="text-xs">All {VERIFICATION_CHECKLIST.length} verification checks ticked</div>}
            </div>
          ) : stage.auto ? (
            <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">Completes automatically from church records — nothing to do here.</p>
          ) : !isCur ? (
            <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">Complete stage {cur?.n} ({cur?.label}) first.</p>
          ) : block ? (
            <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">{block}</p>
          ) : null}

          {/* Stage 4 — verification checklist */}
          {canAct && stage.key === 'verification' && (
            <div className="space-y-2">
              {VERIFICATION_CHECKLIST.map((c, i) => (
                <label key={c.key} className="flex items-start gap-3 rounded-xl border border-slate-200 px-3 py-2.5 cursor-pointer hover:bg-slate-50">
                  <input type="checkbox" checked={!!checks[c.key]} onChange={(e) => setChecks((s) => ({ ...s, [c.key]: e.target.checked }))} className="mt-0.5 w-4 h-4 accent-indigo-600" />
                  <span className="text-sm text-slate-700">{i + 1}. {c.label}</span>
                </label>
              ))}
              <button type="button" disabled={busy || !allChecked} onClick={() => done({ verifiedBy: by, checklist: Object.fromEntries(VERIFICATION_CHECKLIST.map((c) => [c.key, true])) })} className={btn}>
                Mark Verification Complete
              </button>
              {!allChecked && <p className="text-[11px] text-slate-400 text-center">Tick all {VERIFICATION_CHECKLIST.length} items to continue.</p>}
            </div>
          )}

          {/* Stage 5 — cell leader sign-off */}
          {canAct && stage.key === 'cellLeaderApproval' && (
            <div className="space-y-2">
              <label className="block"><span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Cell leader (as signed)</span>
                <input value={leader.approvedBy} onChange={(e) => setLeader({ ...leader, approvedBy: e.target.value })} className={inp} /></label>
              <label className="block"><span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Signed on</span>
                <input type="date" value={leader.signedOn} onChange={(e) => setLeader({ ...leader, signedOn: e.target.value })} className={inp} /></label>
              <button type="button" disabled={busy || !leader.approvedBy.trim()} onClick={() => done({ approvedBy: leader.approvedBy.trim(), signedOn: leader.signedOn })} className={btn}>
                Record Cell Leader Sign-off
              </button>
            </div>
          )}

          {/* Stages 5–6 — assign a Deacon for the interview */}
          {canAssignInterview && (
            <section className="space-y-2">
              {stage.key === 'cellLeaderApproval' && <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-500 border-t border-slate-200 pt-3">Assign Deacon for Membership Interview</p>}
              <InterviewAssign entry={entry} by={by} onSaved={onInterviewSaved} />
            </section>
          )}

          {/* Stage 6 — record the interview as held */}
          {canAct && stage.key === 'membershipInterview' && (
            <div className="space-y-2 border-t border-slate-200 pt-3">
              <label className="block"><span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Interview held on</span>
                <input type="date" value={interviewDate} onChange={(e) => setInterviewDate(e.target.value)} className={inp} /></label>
              <button type="button" disabled={busy || !interviewDate}
                onClick={() => done({ interviewDate, interviewer: entry.membershipPipeline?.interview?.deaconName || '' })}
                className="w-full min-h-[44px] rounded-xl border-2 border-indigo-600 text-indigo-700 text-sm font-bold disabled:opacity-50">
                Mark Interview Complete
              </button>
            </div>
          )}

          {/* Stage 7 — pastoral approval */}
          {canAct && stage.key === 'pastoralApproval' && (
            <button type="button" disabled={busy} onClick={() => done({ approvedBy: by })} className={btn}>Give Pastoral Approval</button>
          )}

          {/* Stage 8 — certificate & card */}
          {canAct && stage.key === 'certificateAndCardIssued' && (
            <div className="space-y-2">
              <label className="block"><span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Membership No.</span>
                <input value={memberNo} onChange={(e) => setMemberNo(e.target.value)} placeholder="e.g. 1024" className={inp} /></label>
              <button type="button" disabled={busy || !memberNo.trim()} onClick={() => { onIssue(memberNo); onClose() }} className={btn}>Issue &amp; Download Certificate</button>
              <p className="text-[11px] text-slate-400">Also marks the membership card as issued (made outside the app) and sets them to Member.</p>
            </div>
          )}

          {canCaring && undoKey === stage.key && (
            <button type="button" disabled={busy} onClick={() => { onUndo(stage.key); onClose() }} className="text-xs font-semibold text-slate-500 hover:text-red-600">Undo this stage</button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
