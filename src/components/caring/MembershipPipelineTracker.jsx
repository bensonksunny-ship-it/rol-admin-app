import { useEffect, useRef, useState } from 'react'
import { setMembershipStage, completeMembershipPipeline, updateApplication } from '../../services/firestore'
import { advanceBlockReason, currentStage, stageSummary, undoableStageKey, progressMirror } from '../../utils/membershipPipeline'
import { downloadMembershipCertificate, membershipCertificateData } from '../../utils/membershipCertificate'

const todayIso = () => new Date().toISOString().slice(0, 10)
const fmt = (d) => {
  if (!d) return ''
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * The 8-stage membership stepper for one person — the progress line, the current
 * stage's one-click action (with the small input some stages need), and undo for
 * the last manual stage. Used on the PCS profile and, `compact`, per row of the
 * Caring Hub "Membership Onboarding Pipeline" widget.
 *
 * `stages` comes from resolveMembershipStages; `onChanged(entryId, pipelinePatchFn)`
 * lets the parent update its local PCS list without a reload.
 */
export default function MembershipPipelineTracker({
  entry, stages, application, cellLeaderName = '', canCaring, canPastor, by, onChanged, compact = false,
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState(null) // { key, ...inputs } while a stage's inputs are open
  const cur = currentStage(stages)
  const undoKey = undoableStageKey(stages)
  const doneCount = stages.filter((s) => s.done).length

  // Mirror the stages onto the membership application (pipelineProgress) — the
  // applicant's signed-out QR page can read that, not this PCS record. Written
  // whenever staff with write access see it out of date.
  const mirror = progressMirror(stages)
  const mirroring = useRef('')
  useEffect(() => {
    if (!application || application.status === 'pending' || !(canCaring || canPastor)) return
    if (application.pipelineProgress?.sig === mirror.sig || mirroring.current === mirror.sig) return
    mirroring.current = mirror.sig
    updateApplication('membership', application.id, { pipelineProgress: { ...mirror, updatedAt: new Date().toISOString() } })
      .catch((e) => { console.error('Mirroring membership progress failed:', e); mirroring.current = '' })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [application?.id, application?.status, application?.pipelineProgress?.sig, mirror.sig, canCaring, canPastor])

  const local = (key, value, extra = {}) => onChanged?.(entry.id, (p) => ({
    ...p, ...extra, stages: { ...(p?.stages || {}), [key]: value },
  }))

  const run = async (fn) => {
    setBusy(true); setError('')
    try { await fn(); setForm(null) } catch (e) { console.error('Membership pipeline', e); setError('Could not save. Please try again.') }
    setBusy(false)
  }

  const complete = (stage, rec = {}) => run(async () => {
    const value = await setMembershipStage(entry.id, stage.key, rec, by)
    local(stage.key, value)
    // Pastoral Approval is the office decision on the membership application too.
    if (stage.key === 'pastoralApproval' && application && ['submitted', 'info_requested'].includes(application.status)) {
      await updateApplication('membership', application.id, { status: 'approved', decidedBy: by, decidedAt: new Date() }).catch((e) => console.error(e))
    }
  })

  const issue = (membershipNumber) => run(async () => {
    await completeMembershipPipeline(entry, { membershipNumber, by })
    const now = new Date().toISOString()
    local('certificateAndCardIssued', { status: 'completed', completedAt: now, issuedAt: now, by }, { status: 'completed', completedAt: now })
    onChanged?.(entry.id, null, { membershipNumber: String(membershipNumber || '').trim() || entry.membershipNumber })
    const data = membershipCertificateData({ name: entry.name, membershipNumber, serviceAttended: entry.serviceAttended }, application)
    await downloadMembershipCertificate({ ...data, memberSince: data.memberSince || new Date().getFullYear() })
  })

  const undo = (key) => {
    if (!window.confirm('Undo this stage?')) return
    run(async () => { await setMembershipStage(entry.id, key, null, by); local(key, undefined, { status: 'in_progress' }) })
  }

  const block = cur ? advanceBlockReason(cur, stages, { canCaring, canPastor }) : ''
  const inp = 'px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200'
  const btn = 'px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap'

  // Inputs for the stages that record something beyond "done".
  const stageInputs = () => {
    if (!cur || block) return null
    if (form?.key !== cur.key) {
      const open = () => {
        if (cur.key === 'cellLeaderApproval') setForm({ key: cur.key, approvedBy: cellLeaderName, signedOn: todayIso() })
        else if (cur.key === 'membershipInterview') setForm({ key: cur.key, interviewDate: todayIso() })
        else if (cur.key === 'certificateAndCardIssued') setForm({ key: cur.key, membershipNumber: entry.membershipNumber || '' })
        else if (cur.key === 'verification') complete(cur, { verifiedBy: by })
        else if (cur.key === 'pastoralApproval') complete(cur, { approvedBy: by })
      }
      return <button type="button" disabled={busy} onClick={open} className={btn}>{busy ? 'Saving…' : cur.action}</button>
    }
    if (cur.key === 'cellLeaderApproval') return (
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[10px] text-slate-500">Cell leader (as signed)<br />
          <input value={form.approvedBy} onChange={(e) => setForm({ ...form, approvedBy: e.target.value })} className={inp} /></label>
        <label className="text-[10px] text-slate-500">Signed on<br />
          <input type="date" value={form.signedOn} onChange={(e) => setForm({ ...form, signedOn: e.target.value })} className={inp} /></label>
        <button type="button" disabled={busy || !form.approvedBy.trim()} onClick={() => complete(cur, { approvedBy: form.approvedBy.trim(), signedOn: form.signedOn })} className={btn}>Save</button>
        <button type="button" onClick={() => setForm(null)} className="text-xs text-slate-500">Cancel</button>
      </div>
    )
    if (cur.key === 'membershipInterview') return (
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[10px] text-slate-500">Interview date<br />
          <input type="date" value={form.interviewDate} onChange={(e) => setForm({ ...form, interviewDate: e.target.value })} className={inp} /></label>
        <button type="button" disabled={busy || !form.interviewDate} onClick={() => complete(cur, { interviewDate: form.interviewDate })} className={btn}>Save</button>
        <button type="button" onClick={() => setForm(null)} className="text-xs text-slate-500">Cancel</button>
      </div>
    )
    if (cur.key === 'certificateAndCardIssued') return (
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[10px] text-slate-500">Membership No.<br />
          <input value={form.membershipNumber} onChange={(e) => setForm({ ...form, membershipNumber: e.target.value })} placeholder="e.g. 1024" className={inp} /></label>
        <button type="button" disabled={busy || !form.membershipNumber.trim()} onClick={() => issue(form.membershipNumber)} className={btn}>
          {busy ? 'Issuing…' : 'Issue & Download Certificate'}
        </button>
        <button type="button" onClick={() => setForm(null)} className="text-xs text-slate-500">Cancel</button>
        <p className="w-full text-[10px] text-slate-400">Also marks the membership card as issued (made outside the app) and sets them to Member.</p>
      </div>
    )
    return null
  }

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {/* Progress line: 8 dots joined by a bar, done / current / pending */}
      <div className="flex items-center" role="list" aria-label={`Membership progress: ${stageSummary(stages)}`}>
        {stages.map((s, i) => {
          const isCur = cur?.key === s.key
          return (
            <div key={s.key} className="flex items-center flex-1 last:flex-none" role="listitem">
              <span
                title={`${s.n}. ${s.label}${s.done ? ' ✓' : isCur ? ' (current)' : ''}`}
                className={`flex-shrink-0 ${compact ? 'w-5 h-5 text-[9px]' : 'w-6 h-6 text-[10px]'} rounded-full flex items-center justify-center font-bold border-2 ${
                  s.done ? 'bg-emerald-500 border-emerald-500 text-white' : isCur ? 'bg-amber-50 border-amber-400 text-amber-700' : 'bg-white border-slate-200 text-slate-400'}`}>
                {s.done ? '✓' : s.n}
              </span>
              {i < stages.length - 1 && <span className={`h-0.5 flex-1 mx-0.5 rounded ${s.done ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 justify-between">
        <p className={`text-xs font-semibold ${cur ? 'text-amber-800' : 'text-emerald-700'}`}>
          {stageSummary(stages)}{cur && <span className="font-normal text-slate-500"> · {cur.detail}</span>}
        </p>
        {!compact && <span className="text-[10px] text-slate-400">{doneCount}/8 done</span>}
      </div>

      {cur && (block ? <p className="text-[11px] text-slate-400">{block}</p> : stageInputs())}

      {!compact && (
        <ol className="space-y-1 pt-1">
          {stages.map((s) => (
            <li key={s.key} className="flex items-start gap-2 text-xs">
              <span className={`mt-0.5 ${s.done ? 'text-emerald-600' : 'text-slate-300'}`}>{s.done ? '✓' : '○'}</span>
              <span className={`flex-1 ${s.done ? 'text-slate-700' : 'text-slate-400'}`}>
                {s.n}. {s.label}
                {s.done && (s.extra?.approvedBy || s.extra?.interviewDate || s.completedAt) && (
                  <span className="text-slate-400"> · {[
                    s.extra?.approvedBy && `by ${s.extra.approvedBy}`,
                    s.extra?.signedOn && `signed ${fmt(s.extra.signedOn)}`,
                    s.extra?.interviewDate && `on ${fmt(s.extra.interviewDate)}`,
                    !s.extra?.interviewDate && !s.extra?.signedOn && s.completedAt && fmt(s.completedAt),
                  ].filter(Boolean).join(' · ')}</span>
                )}
              </span>
              {canCaring && undoKey === s.key && <button type="button" disabled={busy} onClick={() => undo(s.key)} className="text-[10px] text-slate-400 hover:text-red-600">Undo</button>}
            </li>
          ))}
        </ol>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
