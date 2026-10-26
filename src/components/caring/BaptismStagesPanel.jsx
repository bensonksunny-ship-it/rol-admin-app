import { useEffect, useState } from 'react'
import { getAllCellGroupMembers, getCellGroups, requestBaptismCellSignoff, extendBaptismExam } from '../../services/firestore'
import { findPcsCellMember } from '../../utils/pcsEngagement'
import { baptismExamResult, baptismExamLink } from '../../utils/baptismProgress'
import { BAPTISM_EXAM_QUESTIONS } from '../../constants/baptismExam'
import BaptismStageTracker from './BaptismStageTracker'

const fmt = (d) => {
  const dt = d instanceof Date ? d : d ? new Date(d) : null
  return dt && !isNaN(dt.getTime()) ? dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
}
const box = 'rounded-xl border border-slate-200 p-3 space-y-2'
const head = 'text-[10px] font-bold uppercase tracking-wider text-slate-500'

/**
 * Baptism Application modal (Caring), once the form is submitted: the 3-stage
 * tracker, Stage 2 "Notify Cell Leader" (ribbon on the leader's My Workspace) with
 * their answer, and Stage 3 exam link + results.
 */
export default function BaptismStagesPanel({ app, entry, by }) {
  const [cell, setCell] = useState(null) // { group, cellName, leader, leaderPersonId } | false
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [copied, setCopied] = useState(false)
  const [showAnswers, setShowAnswers] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([getAllCellGroupMembers().catch(() => []), getCellGroups('Cell').catch(() => [])]).then(([members, groups]) => {
      if (cancelled) return
      const own = findPcsCellMember(entry, members)
      const g = own ? groups.find((x) => x.id === own.cellId) : null
      setCell(g ? { group: { id: g.id, cellId: g.cellId || '', cellName: g.cellName || '' }, cellName: g.cellName || '', leader: g.leader || '', leaderPersonId: g.leaderPersonId || '' } : false)
    })
    return () => { cancelled = true }
  }, [entry.id]) // eslint-disable-line react-hooks/exhaustive-deps -- reload only when the candidate changes

  const signoff = app.cellLeaderSignoff
  const req = app.cellLeaderRequest
  const cellDone = signoff?.status === 'completed'
  const exam = baptismExamResult(app)
  const link = baptismExamLink(app)
  const examClosed = app.examOpenUntil && app.examOpenUntil < new Date()

  const notify = async () => {
    setBusy(true); setMsg('')
    try {
      const { account } = await requestBaptismCellSignoff(app, {
        candidateName: entry.name || '', cellName: cell.cellName, cellGroup: cell.group, cellLeaderName: cell.leader,
        leaderPersonId: cell.leaderPersonId, phone: entry.phone || app.applicant?.phone || app.prefill?.phone || '', by,
      })
      setMsg(account
        ? `✔ Sent to ${cell.leader}'s My Workspace.`
        : `Saved, but ${cell.leader} has no app account matching their email or name, so the request can't reach them. Please tell them directly.`)
    } catch (e) {
      console.error('requestBaptismCellSignoff', e)
      setMsg('Could not notify the cell leader. Please try again.')
    }
    setBusy(false)
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { window.prompt('Copy this link:', link) }
  }

  return (
    <div className="space-y-3">
      <BaptismStageTracker app={app} />

      {/* Stage 2 — Cell Leader sign-off */}
      <div className={box}>
        <p className={head}>Stage 2 · Cell Leader sign-off</p>
        {cellDone ? (
          <p className="text-sm text-emerald-800">
            ✓ Ready — signed off by <b>{signoff.by || 'the cell leader'}</b>{signoff.at ? ` on ${fmt(signoff.at)}` : ''}.
            {signoff.notes && <span className="block text-xs text-slate-500 mt-1">“{signoff.notes}”</span>}
          </p>
        ) : (
          <>
            {cell === null ? <p className="text-xs text-slate-400">Loading cell group…</p>
              : cell === false ? <p className="text-sm text-amber-700">{entry.name} is not on any cell group roster.</p>
              : <p className="text-sm text-slate-700">Cell: <b>{cell.cellName || '—'}</b> · Leader: <b>{cell.leader || 'Not set'}</b></p>}
            {signoff?.status === 'not_ready' && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {signoff.by || 'Cell leader'} says not ready yet{signoff.at ? ` (${fmt(signoff.at)})` : ''}: “{signoff.notes}”
              </p>
            )}
            {req?.status === 'Requested' && (
              <p className="text-xs text-sky-800 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
                Waiting for {req.recipientName || req.cellLeaderName || 'the cell leader'} · sent {fmt(req.requestedAt)}
              </p>
            )}
            {cell && cell.leader && (
              <button type="button" disabled={busy} onClick={notify}
                className="w-full min-h-[40px] rounded-xl bg-violet-600 text-white text-sm font-bold hover:bg-violet-700 disabled:opacity-50">
                {busy ? 'Notifying…' : req?.status === 'Requested' || signoff?.status === 'not_ready' ? '🔔 Re-send to Cell Leader' : '🔔 Notify Cell Leader'}
              </button>
            )}
          </>
        )}
      </div>

      {/* Stage 3 — MCQ exam */}
      <div className={box}>
        <p className={head}>Stage 3 · MCQ exam</p>
        {!cellDone ? (
          <p className="text-xs text-slate-400">Opens after the Cell Leader signs off.</p>
        ) : (
          <>
            {exam ? (
              <p className={`text-sm ${exam.passed ? 'text-emerald-800' : 'text-amber-800'}`}>
                {exam.passed ? '✓ Passed' : 'Not passed yet'} — best {exam.best.score}/{exam.best.total} · {exam.attempts} attempt{exam.attempts === 1 ? '' : 's'}
                {exam.passed && exam.passedAt ? ` · ${fmt(exam.passedAt)}` : ''}
              </p>
            ) : <p className="text-sm text-slate-600">Not taken yet.</p>}
            {!exam?.passed && (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={copy} className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50">{copied ? 'Copied ✓' : 'Copy exam link'}</button>
                <a href={link} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50">Open exam</a>
                <span className="text-[11px] text-slate-400">
                  {examClosed ? 'Link expired' : app.examOpenUntil ? `Open till ${fmt(app.examOpenUntil)}` : ''}
                </span>
                {examClosed && <button type="button" onClick={() => extendBaptismExam(app.id).catch(() => setMsg('Could not extend the exam link.'))} className="text-xs font-bold text-amber-700">Extend by 60 days</button>}
              </div>
            )}
            {exam && (
              <button type="button" onClick={() => setShowAnswers((v) => !v)} className="text-xs font-semibold text-slate-500 hover:text-slate-700">
                {showAnswers ? 'Hide' : 'Show'} best attempt's answers
              </button>
            )}
            {showAnswers && exam && (
              <ol className="space-y-1 text-xs">
                {BAPTISM_EXAM_QUESTIONS.map((q, i) => {
                  const pick = exam.best.answers?.[q.id]
                  const right = Number(pick) === q.answer
                  return (
                    <li key={q.id} className={right ? 'text-emerald-800' : 'text-red-700'}>
                      {right ? '✓' : '✗'} {i + 1}. {q.text} — <i>{q.options[pick] ?? 'no answer'}</i>
                    </li>
                  )
                })}
              </ol>
            )}
          </>
        )}
      </div>
      {msg && <p className={`text-xs rounded-lg px-3 py-2 ${msg.startsWith('✔') ? 'text-emerald-800 bg-emerald-50 border border-emerald-200' : 'text-amber-800 bg-amber-50 border border-amber-200'}`}>{msg}</p>}
    </div>
  )
}
