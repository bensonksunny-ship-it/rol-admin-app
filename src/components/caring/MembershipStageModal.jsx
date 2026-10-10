import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { getPCSEntries, requestMembershipInterview, getAllCellGroupMembers, getCellGroups, requestCellLeaderApproval, getMemberProfile } from '../../services/firestore'
import { findPcsCellMember } from '../../utils/pcsEngagement'
import { auth } from '../../lib/firebase'
import MembershipApplicationPreview from './MembershipApplicationPreview'
import BaptismProofStatus from './BaptismProofStatus'
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

/** Stage 5 request summary, e.g. "Requested · A Joyson Jeibadurai · 10 Oct 2026". */
export function CellLeaderRequestLine({ request }) {
  if (!request?.cellLeaderName) return null
  const done = request.status === 'Completed'
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className={`font-bold px-2 py-0.5 rounded-full border ${done ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-sky-100 text-sky-800 border-sky-200'}`}>
        {done ? 'Cell Leader Approved' : 'Cell Leader Approval Requested'}
      </span>
      <span className="text-slate-600">{request.cellLeaderName}{request.requestedAt ? ` · ${fmt(done ? request.respondedAt : request.requestedAt)}` : ''}</span>
    </div>
  )
}

/** Stage 5: the candidate's cell + its leader, and "Notify Cell Leader" — a blue
 *  ribbon on the leader's My Workspace (CellLeaderApprovalRibbon) that opens the
 *  call checklist; their submission completes this stage. */
function CellLeaderNotify({ entry, by, canNotify, onRequested }) {
  const existing = entry.membershipPipeline?.cellLeaderRequest
  const [cell, setCell] = useState(null) // { cellName, leader, leaderPersonId, since } | false (no cell)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all([getAllCellGroupMembers().catch(() => []), getCellGroups('Cell').catch(() => [])]).then(([members, groups]) => {
      if (cancelled) return
      const own = findPcsCellMember(entry, members)
      const g = own ? groups.find((x) => x.id === own.cellId) : null
      setCell(g ? { cellName: g.cellName || '', leader: g.leader || '', leaderPersonId: g.leaderPersonId || '', since: own.since || own.createdAt || '' } : false)
    })
    return () => { cancelled = true }
  }, [entry.id]) // eslint-disable-line react-hooks/exhaustive-deps -- reload only when the candidate changes

  const sinceText = (() => {
    const d = cell?.since ? (typeof cell.since?.toDate === 'function' ? cell.since.toDate() : new Date(cell.since)) : null
    return d && !isNaN(d.getTime()) ? `Attending since ${d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}` : ''
  })()

  const notify = async () => {
    setBusy(true); setMsg('')
    try {
      const profile = entry.visitorId ? await getMemberProfile(entry.visitorId).catch(() => null) : null
      const { request, account } = await requestCellLeaderApproval({
        candidate: entry, cellName: cell.cellName, cellLeaderName: cell.leader, leaderPersonId: cell.leaderPersonId,
        phone: entry.phone || profile?.phone || '', photoUrl: profile?.photoUrl || '', attendingSince: sinceText, by,
      })
      onRequested?.(request)
      setMsg(account
        ? `✓ Sent. ${cell.leader} will see it on their My Workspace.`
        : `Saved, but ${cell.leader} has no app account matching their email or name, so no workspace notification can reach them. Please tell them directly.`)
    } catch (e) {
      console.error('requestCellLeaderApproval', e)
      setMsg('Could not notify the cell leader. Please try again.')
    }
    setBusy(false)
  }

  const box = 'rounded-xl bg-slate-50 border border-slate-200 px-3 py-2'
  return (
    <div className="space-y-3">
      {cell === null ? <p className="text-xs text-slate-400">Loading cell group…</p>
        : cell === false ? <p className="text-sm text-amber-700">{getMemberDisplayName(entry)} is not on any cell group roster.</p>
        : (
          <div className="grid grid-cols-2 gap-2">
            <div className={box}><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cell Group</p><p className="text-sm font-semibold text-slate-800">{cell.cellName || '—'}</p></div>
            <div className={box}><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cell Leader</p><p className="text-sm font-semibold text-slate-800">{cell.leader || 'Not set'}</p></div>
          </div>
        )}
      <CellLeaderRequestLine request={existing} />
      {canNotify && cell && cell.leader && (
        <button type="button" disabled={busy} onClick={notify}
          className="w-full min-h-[44px] rounded-xl bg-sky-600 text-white text-sm font-bold hover:bg-sky-700 disabled:opacity-50">
          {busy ? 'Notifying…' : existing?.status === 'Requested' ? '🔔 Re-send to Cell Leader' : '🔔 Notify Cell Leader'}
        </button>
      )}
      {msg && <p className={`text-xs ${msg.startsWith('✓') ? 'text-emerald-700' : 'text-amber-700'}`}>{msg}</p>}
    </div>
  )
}

/** Stage 6: pick an active Deacon, a date & time and notes, then send the request. */
function InterviewAssign({ entry, by, onSaved }) {
  const existing = entry.membershipPipeline?.interview
  const [deacons, setDeacons] = useState(null)
  const [candidateCell, setCandidateCell] = useState('')
  const [deaconId, setDeaconId] = useState(existing?.status !== 'Declined' ? (existing?.deaconPcsId || '') : '')
  const [at, setAt] = useState(existing?.scheduledAt || '')
  const [notes, setNotes] = useState(existing?.notes || '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  // Active deacons (deaconOffice.status 'Active', or isDeacon without an end), each
  // labelled with their cell group — else their ministry / leadership position.
  useEffect(() => {
    let cancelled = false
    Promise.all([
      getPCSEntries(),
      getAllCellGroupMembers().catch(() => []),
      getCellGroups('Cell').catch(() => []),
    ]).then(([list, members, groups]) => {
      if (cancelled) return
      const own = findPcsCellMember(entry, members)
      setCandidateCell(own ? (groups.find((g) => g.id === own.cellId)?.cellName || '') : '')
      const isActiveDeacon = (e) => deaconStatusOf(e.deaconOffice) === 'Active'
        || (e.deaconOffice?.isDeacon === true && e.deaconOffice?.status !== 'Former' && !e.deaconOffice?.endDate)
      setDeacons(list.filter((e) => isActiveDeacon(e) && e.id !== entry.id).map((e) => {
        const cm = findPcsCellMember(e, members)
        const cell = cm ? groups.find((g) => g.id === cm.cellId)?.cellName : ''
        const ministry = (e.ministries || []).find((m) => !m?.ended)?.ministry || e.leadershipPosition || ''
        return { ...e, assignment: cell ? `${cell} Cell` : ministry || 'No cell / ministry' }
      }).sort((a, b) => getMemberDisplayName(a).localeCompare(getMemberDisplayName(b))))
    }).catch(() => { if (!cancelled) setDeacons([]) })
    return () => { cancelled = true }
  }, [entry.id]) // eslint-disable-line react-hooks/exhaustive-deps -- reload only when the candidate changes

  const send = async () => {
    const deacon = deacons.find((d) => d.id === deaconId)
    if (!deacon || !at) return
    setBusy(true); setMsg('')
    try {
      const { interview, account } = await requestMembershipInterview({ candidate: entry, deacon, scheduledAt: at, notes, by, candidateCell })
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
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Select Interviewing Deacon *</span>
              <select value={deaconId} onChange={(e) => setDeaconId(e.target.value)} className={inp}>
                <option value="">Select a deacon…</option>
                {deacons.map((d) => <option key={d.id} value={d.id}>{getMemberDisplayName(d)} - {d.assignment}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Interview Date &amp; Time *</span>
              <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" />
            </label>
            <label className="block">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Notes for the interviewer (optional)</span>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inp} resize-none`} />
            </label>
            <button type="button" disabled={busy || !deaconId || !at} onClick={send}
              className="w-full min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50">
              {busy ? 'Scheduling…' : existing?.deaconName && existing.status !== 'Declined' ? 'Re-schedule Interview & Notify Deacon' : 'Schedule Interview & Notify Deacon'}
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
  stage, stages, entry, application = null, cellLeaderName = '', canCaring, canPastor, canFirstLady, by, busy, undoKey,
  onComplete, onIssue, onUndo, onInterviewSaved, onCellLeaderRequested, onClose,
}) {
  const cur = currentStage(stages)
  const isCur = cur?.key === stage.key
  const block = isCur ? advanceBlockReason(stage, stages, { canCaring, canPastor, canFirstLady }) : ''
  const canAct = isCur && !block
  const verificationDone = stages.find((s) => s.key === 'verification')?.done
  const applicationDone = stages.find((s) => s.key === 'applicationSubmitted')?.done
  const interviewDone = stages.find((s) => s.key === 'membershipInterview')?.done
  const isInterviewStage = stage.key === 'membershipInterview'
  // Interview assignment: Caring / First Lady once the Application (3) and
  // Verification (4) are complete; the Founder / Senior Pastor may schedule it any
  // time (pastoral bypass).
  const canAssignInterview = isInterviewStage && !interviewDone
    && (canPastor || ((canCaring || canFirstLady) && applicationDone && verificationDone))
  const assignWaitingNote = isInterviewStage && !interviewDone && !canAssignInterview && (canCaring || canFirstLady)
    ? 'Deacon interview scheduling opens once stage 3 (Application) and stage 4 (Verification) are complete.'
    : ''

  const [checks, setChecks] = useState({})
  const [leader, setLeader] = useState({ approvedBy: cellLeaderName, signedOn: todayIso() })
  const [interviewDate, setInterviewDate] = useState(String(entry.membershipPipeline?.interview?.scheduledAt || '').slice(0, 10) || todayIso())
  const [memberNo, setMemberNo] = useState(entry.membershipNumber || '')
  const allChecked = VERIFICATION_CHECKLIST.every((c) => checks[c.key])
  const btn = 'w-full min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50'
  const inp = 'w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white'
  const done = (rec) => { onComplete(stage, rec); onClose() }
  // Stage 4 opens wide: the submitted application (left, 60%) beside the checklist (right, 40%).
  const isVerification = stage.key === 'verification'

  return createPortal(
    <div className="fixed inset-0 z-[85] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className={`w-full ${isVerification ? 'sm:max-w-4xl max-h-[92vh] sm:max-h-[85vh]' : 'sm:max-w-[480px] max-h-[92vh]'} overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{getMemberDisplayName(entry)} · Stage {stage.n} of 8</p>
            <p className="font-bold text-slate-800">{TITLES[stage.key] || `Stage ${stage.n}: ${stage.label}`}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-lg text-slate-500">×</button>
        </div>

        <div className={isVerification ? 'p-5 grid grid-cols-1 lg:grid-cols-5 gap-4' : 'p-5'}>
          {isVerification && (
            <div className="lg:col-span-3 min-w-0">
              <MembershipApplicationPreview application={application} entry={entry} />
            </div>
          )}
          <div className={isVerification ? 'lg:col-span-2 p-4 space-y-4 flex flex-col rounded-xl border border-slate-200 bg-white min-w-0' : 'space-y-4'}>
          {isVerification && <p className="text-sm font-bold text-slate-800">Verification Checklist</p>}
          <p className="text-sm text-slate-600">{stage.detail}</p>

          {/* Status of this stage */}
          {stage.done ? (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
              ✓ Completed{stage.completedAt ? ` on ${fmt(stage.completedAt)}` : ''}{stage.by ? ` by ${stage.by}` : ''}
              {stage.extra?.approvedBy && <div className="text-xs">Signed by {stage.extra.approvedBy}{stage.extra.signedOn ? ` · ${fmt(stage.extra.signedOn)}` : ''}</div>}
              {stage.extra?.acceptedJesus && <div className="text-xs">Cell leader's call checklist: all 3 confirmed{stage.extra.notes ? ` · "${stage.extra.notes}"` : ''}</div>}
              {stage.extra?.interviewDate && <div className="text-xs">Interview held {fmt(stage.extra.interviewDate)}{stage.extra.interviewer ? ` · Deacon ${stage.extra.interviewer}` : ''}</div>}
              {stage.extra?.checklist && <div className="text-xs">All {VERIFICATION_CHECKLIST.length} verification checks ticked</div>}
            </div>
          ) : stage.auto ? (
            <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">Completes automatically from church records — nothing to do here.</p>
          ) : !isCur ? (
            <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              {canAssignInterview
                ? `You can schedule the deacon interview now. Marking this stage complete opens after stage ${cur?.n} (${cur?.label}).`
                : `Complete stage ${cur?.n} (${cur?.label}) first.`}
            </p>
          ) : block ? (
            <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">{block}</p>
          ) : null}

          {/* Stage 3 is open again while a baptism self-declaration sent back from
              Stage 4 waits on the applicant (same application link). */}
          {stage.key === 'applicationSubmitted' && application?.status === 'declaration_requested' && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 space-y-1.5">
              <p>
                Waiting for the applicant to sign the Baptism Self-Declaration
                {application.declarationRequest?.requestedAt ? ` (requested ${fmt(application.declarationRequest.requestedAt)})` : ''}.
                This stage completes again once they tick it.
              </p>
              <button type="button" onClick={async () => {
                const link = `${window.location.origin}/membership-apply?token=${application.id}`
                try { await navigator.clipboard.writeText(link); alert('Application link copied.') } catch { window.prompt('Copy this link:', link) }
              }} className="text-xs font-semibold text-indigo-700 hover:underline">Copy the application link</button>
            </div>
          )}

          {/* Stage 4 — verification checklist */}
          {canAct && stage.key === 'verification' && (
            <div className="space-y-2">
              {VERIFICATION_CHECKLIST.map((c, i) => (
                <div key={c.key} className="rounded-xl border border-slate-200">
                  <label className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-50 rounded-xl">
                    <input type="checkbox" checked={!!checks[c.key]} onChange={(e) => setChecks((s) => ({ ...s, [c.key]: e.target.checked }))} className="mt-0.5 w-4 h-4 accent-indigo-600" />
                    <span className="text-sm text-slate-700">{i + 1}. {c.label}</span>
                  </label>
                  {/* Item 3: certificate, or a signed baptism self-declaration (ticks itself once signed) */}
                  {c.key === 'baptismProof' && (
                    <BaptismProofStatus
                      entry={entry}
                      application={application}
                      requestedBy={by}
                      canRequest={canCaring || canPastor || canFirstLady}
                      onDeclared={() => setChecks((s) => ({ ...s, baptismProof: true }))}
                    />
                  )}
                </div>
              ))}
              <button type="button" disabled={busy || !allChecked} onClick={() => done({
                verifiedBy: by,
                verifierUid: auth?.currentUser?.uid || '',
                verifiedAt: new Date().toISOString(),
                checklist: Object.fromEntries(VERIFICATION_CHECKLIST.map((c) => [c.key, true])),
              })} className={btn}>
                Mark Verification Complete
              </button>
              {!allChecked && <p className="text-[11px] text-slate-400 text-center">Tick all {VERIFICATION_CHECKLIST.length} items to continue.</p>}
            </div>
          )}

          {/* Stage 5 — cell group, its leader, and "Notify Cell Leader" (their
              workspace ribbon + call checklist completes the stage) */}
          {stage.key === 'cellLeaderApproval' && !stage.done && (
            <CellLeaderNotify entry={entry} by={by} canNotify={canAct} onRequested={onCellLeaderRequested} />
          )}
          {/* Fallback when the cell leader has no app login: record their paper sign-off */}
          {canAct && stage.key === 'cellLeaderApproval' && (
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer hover:text-slate-700">Cell leader has no app login? Record their sign-off manually</summary>
              <div className="space-y-2 mt-2">
                <label className="block"><span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Cell leader (as signed)</span>
                  <input value={leader.approvedBy} onChange={(e) => setLeader({ ...leader, approvedBy: e.target.value })} className={inp} /></label>
                <label className="block"><span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Signed on</span>
                  <input type="date" value={leader.signedOn} onChange={(e) => setLeader({ ...leader, signedOn: e.target.value })} className={inp} /></label>
                <button type="button" disabled={busy || !leader.approvedBy.trim()} onClick={() => done({ approvedBy: leader.approvedBy.trim(), signedOn: leader.signedOn })}
                  className="w-full min-h-[40px] rounded-xl border-2 border-slate-300 text-slate-700 text-sm font-bold disabled:opacity-50">
                  Record Sign-off
                </button>
              </div>
            </details>
          )}

          {assignWaitingNote && <p className="text-xs text-slate-500">{assignWaitingNote}</p>}

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
      </div>
    </div>,
    document.body
  )
}
