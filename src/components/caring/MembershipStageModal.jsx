import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { getPCSEntries, requestMembershipInterview, getAllCellGroupMembers, getCellGroups, requestCellLeaderApproval, getMemberProfile, returnMembershipApplicationForRevision } from '../../services/firestore'
import { findPcsCellMember } from '../../utils/pcsEngagement'
import { auth } from '../../lib/firebase'
import MembershipApplicationPreview from './MembershipApplicationPreview'
import BaptismProofStatus from './BaptismProofStatus'
import IdProofAttachment from './IdProofAttachment'
import { VERIFICATION_CHECKLIST, revisionItem, flaggedItemsText, membershipRevisionLink } from '../../constants/membershipRevision'
import { membershipFieldValue, MEMBERSHIP_DEPOSIT_AMOUNT, depositReceiptNo } from '../../constants/membershipForm'
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

// Stage 4 — every item (constants/membershipRevision.js) must be ticked before
// verification can be completed; any can be flagged and returned to the applicant.

/** The applicant's application link (it opens in revision mode): copy it, or send it on WhatsApp with the flagged items. */
export function RevisionLinkActions({ application, entry }) {
  const [copied, setCopied] = useState(false)
  if (!application?.id) return null
  const link = membershipRevisionLink(application.id)
  const flagged = application.revisionRequest?.flaggedItems || []
  const first = String(membershipFieldValue(application, 'firstName') || entry?.name || '').trim().split(/\s+/)[0]
  const phone = String(membershipFieldValue(application, 'phone') || entry?.phone || '').replace(/\D/g, '').slice(-10)
  const message = `Hello ${first || 'there'}, the River of Life church office needs a few updates on your membership application:\n`
    + flagged.map((code) => `• ${revisionItem(code)?.applicantTitle || code}`).join('\n')
    + `\n\nPlease open this link to complete them:\n${link}`
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2500) } catch { window.prompt('Copy this link:', link) }
  }
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={copy} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">
        {copied ? '✓ Link copied' : '🔗 Copy application link'}
      </button>
      {phone.length === 10 && (
        <a href={`https://wa.me/91${phone}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer"
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700">
          Send on WhatsApp
        </a>
      )}
    </div>
  )
}

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
      setCell(g ? { group: { id: g.id, cellId: g.cellId || '', cellName: g.cellName || '' }, cellName: g.cellName || '', leader: g.leader || '', leaderPersonId: g.leaderPersonId || '', since: own.since || own.createdAt || '' } : false)
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
        candidate: entry, cellName: cell.cellName, cellGroup: cell.group, cellLeaderName: cell.leader, leaderPersonId: cell.leaderPersonId,
        phone: entry.phone || profile?.phone || '', photoUrl: profile?.photoUrl || '', attendingSince: sinceText, by,
      })
      onRequested?.(request)
      setMsg(account
        ? `✔ Notification successfully sent to ${cell.leader}'s My Workspace dashboard.`
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
      {msg && (msg.startsWith('✔')
        ? <p className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{msg}</p>
        : <p className="text-xs text-amber-700">{msg}</p>)}
    </div>
  )
}

/** "📅 Sun, 11 Oct 2026 at 12:01 PM" for a datetime-local value. */
const scheduleLabel = (at) => {
  const d = at ? new Date(at) : null
  if (!d || isNaN(d.getTime())) return ''
  const day = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase()
  return `${day} at ${time}`
}
const INTERVIEW_TIME_SLOTS = [['10:00', '10:00 AM'], ['11:30', '11:30 AM'], ['14:00', '02:00 PM'], ['16:30', '04:30 PM'], ['18:00', '06:00 PM']]

/** Date + time picker panel: calendar date, quick time slots or a custom time, and
 *  "Set Time", which locks the choice and closes the panel. */
function InterviewTimePicker({ value, onChange }) {
  const [open, setOpen] = useState(!value)
  const [date, setDate] = useState(String(value || '').slice(0, 10) || todayIso())
  const [time, setTime] = useState(String(value || '').slice(11, 16) || '')
  const label = scheduleLabel(value)
  const set = () => { if (!date || !time) return; onChange(`${date}T${time}`); setOpen(false) }
  return (
    <div className="space-y-2">
      {label && !open && (
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-full px-3 py-1.5">📅 {label}</span>
          <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-indigo-700 hover:underline">Change</button>
        </div>
      )}
      {open && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3 space-y-3">
          <label className="block">
            <span className="block text-xs font-semibold text-slate-600 mb-1.5">Date</span>
            <input type="date" value={date} min={todayIso()} onChange={(e) => setDate(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
          </label>
          <div>
            <span className="block text-xs font-semibold text-slate-600 mb-1.5">Time</span>
            <div className="flex flex-wrap gap-1.5">
              {INTERVIEW_TIME_SLOTS.map(([v, l]) => (
                <button key={v} type="button" aria-pressed={time === v} onClick={() => setTime(v)}
                  className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${time === v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400'}`}>
                  {l}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 mt-2">
              <span className="text-xs text-slate-500">or custom</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
                className="h-9 px-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            {value && <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-white">Cancel</button>}
            <button type="button" disabled={!date || !time} onClick={set}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-50">
              Set Time
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Stage 6: pick an active Deacon and a date & time, then send the request. */
function InterviewAssign({ entry, by, onSaved }) {
  const existing = entry.membershipPipeline?.interview
  const [deacons, setDeacons] = useState(null)
  const [candidateCell, setCandidateCell] = useState('')
  const [deaconId, setDeaconId] = useState(existing?.status !== 'Declined' ? (existing?.deaconPcsId || '') : '')
  const [at, setAt] = useState(existing?.scheduledAt || '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  // Active deacons (deaconOffice.status 'Active', or isDeacon without an end). The
  // candidate's own cell is still looked up — it rides along on the request.
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
      setDeacons(list.filter((e) => isActiveDeacon(e) && e.id !== entry.id)
        .sort((a, b) => getMemberDisplayName(a).localeCompare(getMemberDisplayName(b))))
    }).catch(() => { if (!cancelled) setDeacons([]) })
    return () => { cancelled = true }
  }, [entry.id]) // eslint-disable-line react-hooks/exhaustive-deps -- reload only when the candidate changes

  const selected = deacons?.find((d) => d.id === deaconId) || null
  const rescheduling = !!existing?.deaconName && existing.status !== 'Declined'

  const send = async () => {
    if (!selected || !at) return
    setBusy(true); setMsg('')
    try {
      // The notes field was removed; any notes already on the request are kept.
      const { interview, account } = await requestMembershipInterview({ candidate: entry, deacon: selected, scheduledAt: at, notes: existing?.notes || '', by, candidateCell })
      onSaved?.(interview)
      setMsg(account
        ? `✓ Sent. ${getMemberDisplayName(selected)} will see it on their My Workspace.`
        : `Saved, but ${getMemberDisplayName(selected)} has no app account matching their email or name, so no workspace notification can reach them. Please tell them directly.`)
    } catch (e) {
      console.error('requestMembershipInterview', e)
      setMsg('Could not send the request. Please try again.')
    }
    setBusy(false)
  }

  return (
    <div className="space-y-5">
      {existing?.deaconName && (
        <div className="bg-amber-50 text-amber-900 border border-amber-200/80 rounded-xl p-3 text-xs flex items-center justify-between gap-3">
          <span><b>Interview {existing.status || 'Requested'}</b> · Deacon {existing.deaconName}</span>
          {existing.scheduledAt && <span className="text-right flex-shrink-0">{scheduleLabel(existing.scheduledAt)}</span>}
        </div>
      )}
      {existing?.status === 'Declined' && existing.responseNote && (
        <p className="text-xs text-red-700">Declined: “{existing.responseNote}”. Choose another deacon or time.</p>
      )}
      {deacons === null ? <p className="text-xs text-slate-400">Loading deacons…</p>
        : deacons.length === 0 ? <p className="text-sm text-slate-500">No active Deacons yet. Mark someone as Deacon from their PCS profile (Founder / Senior Pastor).</p>
        : (
          <>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-600 mb-1.5">Deacon</span>
              <select value={deaconId} onChange={(e) => setDeaconId(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                <option value="">Select a deacon…</option>
                {deacons.map((d) => <option key={d.id} value={d.id}>{getMemberDisplayName(d)}</option>)}
              </select>
              {selected && <span className="block text-xs text-slate-600 mt-1.5">Conducting Deacon: <b className="text-slate-800">{getMemberDisplayName(selected)}</b> (Deacon)</span>}
            </label>
            <div>
              <span className="block text-xs font-semibold text-slate-600 mb-1.5">Date &amp; time</span>
              <InterviewTimePicker value={at} onChange={setAt} />
            </div>
            <button type="button" disabled={busy || !selected || !at} onClick={send}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl shadow-md transition-all disabled:opacity-50 disabled:shadow-none">
              {busy ? 'Scheduling…' : rescheduling ? 'Re-schedule Interview & Notify Deacon' : 'Schedule Interview & Notify Deacon'}
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
  const [flags, setFlags] = useState({}) // ITEM_n → true when flagged as incomplete
  const [flagNotes, setFlagNotes] = useState({}) // ITEM_n → note shown to the applicant
  const [returning, setReturning] = useState(false)
  const [returnError, setReturnError] = useState('')
  const [returned, setReturned] = useState(false)
  const flaggedCodes = VERIFICATION_CHECKLIST.filter((c) => flags[c.code]).map((c) => c.code)
  const toggleFlag = (c) => {
    setFlags((f) => ({ ...f, [c.code]: !f[c.code] }))
    setChecks((s) => ({ ...s, [c.key]: false }))
  }
  // The last revision the applicant resubmitted — Stage 4 re-verifies those items.
  const resubmitted = application?.status === 'submitted' && application?.revisionResponse?.submittedAt
    ? (application.revisionRequest?.flaggedItems || []) : []
  // Item 5: a photo on the application ticks "Physical photo is provided" on load
  // (once — the office can still untick it). A resubmitted photo is re-verified by hand.
  const photoUrl = application?.photoDataUrl || application?.attachments?.photoUrl || application?.photoUrl || ''
  const hasPhoto = typeof photoUrl === 'string' && /^(data:image\/|https?:\/\/)/.test(photoUrl)
  const photoReverify = resubmitted.includes('ITEM_5')
  const isChecked = (key) => (key === 'photo' && checks.photo === undefined ? hasPhoto && !photoReverify : !!checks[key])
  const returnForRevision = async () => {
    if (!application?.id || !flaggedCodes.length) return
    if (!window.confirm(`Return the application to ${getMemberDisplayName(entry)} for revisions?\n\n${flaggedItemsText(flaggedCodes)}\n\nThe pipeline goes back to Stage 3 until they resubmit.`)) return
    setReturning(true); setReturnError('')
    try {
      await returnMembershipApplicationForRevision({ token: application.id, pcsEntryId: entry.id, flaggedItems: flaggedCodes, notes: flagNotes, by })
      setReturned(true)
    } catch (e) {
      console.error('returnMembershipApplicationForRevision', e)
      setReturnError(e?.code === 'permission-denied' ? "You don't have permission to return this application." : 'Could not return the application. Please try again.')
    }
    setReturning(false)
  }
  const [leader, setLeader] = useState({ approvedBy: cellLeaderName, signedOn: todayIso() })
  const [interviewDate, setInterviewDate] = useState(String(entry.membershipPipeline?.interview?.scheduledAt || '').slice(0, 10) || todayIso())
  const [memberNo, setMemberNo] = useState(entry.membershipNumber || '')
  // Stage 4 item 4: security deposit receipt (shown on the Full Application Record).
  const [deposit, setDeposit] = useState({ receiptNo: depositReceiptNo(), amount: String(MEMBERSHIP_DEPOSIT_AMOUNT), mode: 'Cash', date: todayIso(), receivedBy: by || '' })
  const allChecked = VERIFICATION_CHECKLIST.every((c) => isChecked(c.key))
  const btn = 'w-full min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50'
  const inp = 'w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white'
  const done = (rec) => { onComplete(stage, rec); onClose() }
  // Stage 4 opens wide: the submitted application (left, 60%) beside the checklist (right, 40%).
  const isVerification = stage.key === 'verification'

  return createPortal(
    <div className="fixed inset-0 z-[85] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className={`w-full ${isVerification ? 'sm:max-w-4xl max-h-[92vh] sm:max-h-[85vh]' : isInterviewStage ? 'sm:max-w-md max-h-[92vh] border border-indigo-100' : 'sm:max-w-[480px] max-h-[92vh]'} overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl`} onClick={(e) => e.stopPropagation()}>
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
          <p className="text-sm text-slate-600">{isInterviewStage ? 'Schedule the Membership Interview with an assigned Deacon.' : stage.detail}</p>

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

          {/* Stage 3 is open again while Stage 4's returned revisions wait on the applicant. */}
          {stage.key === 'applicationSubmitted' && application?.status === 'revision_requested' && (
            <div className="rounded-xl border border-orange-300 bg-orange-50 px-3 py-2.5 text-sm text-orange-900 space-y-2">
              <p>
                <b>Returned for revisions</b>{application.revisionRequest?.requestedAt ? ` on ${fmt(application.revisionRequest.requestedAt)}` : ''}
                {application.revisionRequest?.requestedBy ? ` by ${application.revisionRequest.requestedBy}` : ''}. This stage completes again once the applicant resubmits.
              </p>
              <p className="text-xs">{flaggedItemsText(application.revisionRequest?.flaggedItems)}</p>
              <RevisionLinkActions application={application} entry={entry} />
            </div>
          )}

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
          {canAct && stage.key === 'verification' && resubmitted.length > 0 && (
            <div className="rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-xs text-sky-900">
              <b>🔄 Revisions resubmitted</b> on {fmt(application.revisionResponse.submittedAt)}. Re-verify the items marked below.
            </div>
          )}
          {canAct && stage.key === 'verification' && !returned && (
            <div className="space-y-2">
              {VERIFICATION_CHECKLIST.map((c, i) => {
                const flagged = !!flags[c.code]
                return (
                  <div key={c.key} className={`rounded-xl border ${flagged ? 'border-rose-300 bg-rose-50/50' : 'border-slate-200'}`}>
                    <div className="flex items-start gap-2 pr-2">
                      <label className={`flex-1 flex items-start gap-3 px-3 py-2.5 rounded-xl ${flagged ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50'}`}>
                        <input type="checkbox" disabled={flagged} checked={isChecked(c.key)} onChange={(e) => setChecks((s) => ({ ...s, [c.key]: e.target.checked }))} className="mt-0.5 w-4 h-4 accent-indigo-600" />
                        <span className={`text-sm ${flagged ? 'text-rose-800 line-through decoration-rose-300' : 'text-slate-700'}`}>
                          {i + 1}. {c.label}
                          {resubmitted.includes(c.code) && <span className="ml-1.5 align-middle text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200 no-underline">Re-verify</span>}
                        </span>
                      </label>
                      <button type="button" aria-pressed={flagged} onClick={() => toggleFlag(c)} title={flagged ? 'Remove flag' : `Flag as incomplete: ${c.flagLabel}`}
                        className={`mt-2 flex-shrink-0 text-[11px] font-semibold px-2 py-1 rounded-lg border ${flagged ? 'bg-rose-600 text-white border-rose-600' : 'text-slate-500 border-slate-200 hover:text-rose-700 hover:border-rose-300'}`}>
                        {flagged ? '⚑ Flagged' : '⚑ Flag'}
                      </button>
                    </div>
                    {flagged && (
                      <div className="px-3 pb-2.5 space-y-1">
                        <p className="text-[11px] font-semibold text-rose-700">{c.flagLabel}</p>
                        <input value={flagNotes[c.code] || ''} onChange={(e) => setFlagNotes((n) => ({ ...n, [c.code]: e.target.value }))}
                          placeholder="Note for the applicant (optional)" className="w-full px-2.5 py-1.5 rounded-lg border border-rose-200 bg-white text-xs" />
                      </div>
                    )}
                    {/* Item 2: an uploaded ID card → view, download & print, then delete the stored copy */}
                    {c.key === 'idCopy' && !flagged && (
                      <IdProofAttachment application={application} by={by} canPurge={canCaring || canPastor} />
                    )}
                    {/* Item 5: the photo uploaded with the application */}
                    {c.key === 'photo' && !flagged && hasPhoto && (
                      <div className="pl-7 pr-1 pb-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <img src={photoUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
                          ✔ Candidate photo uploaded on application
                        </span>
                      </div>
                    )}
                    {/* Item 4: security deposit receipt details */}
                    {c.key === 'securityDeposit' && !flagged && (
                      <div className="px-3 pb-3 grid grid-cols-2 gap-2">
                        {[['receiptNo', 'Receipt No.', 'text'], ['amount', 'Amount (₹)', 'number'], ['date', 'Date', 'date'], ['receivedBy', 'Received By', 'text']].map(([k, label, type]) => (
                          <label key={k} className="block">
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">{label}</span>
                            <input type={type} value={deposit[k]} onChange={(e) => setDeposit((d) => ({ ...d, [k]: e.target.value }))}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white" />
                          </label>
                        ))}
                        <label className="block col-span-2">
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Payment Mode</span>
                          <select value={deposit.mode} onChange={(e) => setDeposit((d) => ({ ...d, mode: e.target.value }))}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white">
                            {['Cash', 'UPI', 'Bank Transfer'].map((m) => <option key={m}>{m}</option>)}
                          </select>
                        </label>
                      </div>
                    )}
                    {/* Item 3: certificate, or a signed baptism self-declaration (ticks itself once signed) */}
                    {c.key === 'baptismProof' && !flagged && (
                      <BaptismProofStatus
                        entry={entry}
                        application={application}
                        requestedBy={by}
                        canRequest={canCaring || canPastor || canFirstLady}
                        onDeclared={() => setChecks((s) => ({ ...s, baptismProof: true }))}
                      />
                    )}
                  </div>
                )
              })}
              <button type="button" disabled={busy || !allChecked} onClick={() => done({
                verifiedBy: by,
                verifierUid: auth?.currentUser?.uid || '',
                verifiedAt: new Date().toISOString(),
                checklist: Object.fromEntries(VERIFICATION_CHECKLIST.map((c) => [c.key, true])),
                deposit: Object.fromEntries(Object.entries(deposit).map(([k, v]) => [k, String(v || '').trim()])),
              })} className={btn}>
                Mark Verification Complete
              </button>
              {!allChecked && (
                <>
                  <button type="button" disabled={returning || !flaggedCodes.length || !application?.id || application.status === 'pending'} onClick={returnForRevision}
                    className="w-full min-h-[44px] rounded-xl border-2 border-rose-300 text-rose-700 bg-white text-sm font-bold hover:bg-rose-50 disabled:opacity-50">
                    {returning ? 'Returning…' : '↩ Return Application for Revisions'}
                  </button>
                  <p className="text-[11px] text-slate-400 text-center">
                    {!application?.id || application.status === 'pending'
                      ? 'No online application to return. Follow up with the applicant directly.'
                      : flaggedCodes.length ? `${flaggedCodes.length} item${flaggedCodes.length > 1 ? 's' : ''} flagged.` : `Tick all ${VERIFICATION_CHECKLIST.length} items to continue, or ⚑ flag what needs fixing and return it.`}
                  </p>
                  {returnError && <p className="text-xs text-red-600 text-center">{returnError}</p>}
                </>
              )}
            </div>
          )}
          {stage.key === 'verification' && returned && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900 space-y-2">
              <p><b>✔ Returned to {getMemberDisplayName(entry)} for revisions.</b> Their application link now asks only for:</p>
              <ul className="text-xs list-disc pl-5">{flaggedCodes.map((code) => <li key={code}>{revisionItem(code)?.applicantTitle}</li>)}</ul>
              <p className="text-xs">Send them the link. The pipeline shows Stage 3 until they resubmit, then Stage 4 again for re-verification.</p>
              <RevisionLinkActions application={{ ...application, revisionRequest: { flaggedItems: flaggedCodes } }} entry={entry} />
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
              {/* The ID card stays in storage until it is explicitly downloaded & printed. */}
              {(application?.documents?.idProof || application?.attachments?.idProofDeletedFromStorage) && (
                <div className="rounded-xl border border-slate-200 p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-slate-600">ID card</p>
                  <IdProofAttachment application={application} by={by} canPurge={canCaring || canPastor} indent={false} />
                </div>
              )}
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
