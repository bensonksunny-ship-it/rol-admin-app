// Baptism Application pipeline — three stages, all stored on the
// baptism_applications doc:
//
//   1. Application  — the candidate submits the QR form (status 'submitted').
//   2. Cell Leader  — Caring presses "Notify Cell Leader"; the leader confirms baptism
//                     readiness (after a shared cell meeting) from a ribbon on their
//                     My Workspace → cellLeaderSignoff { status: 'completed' | 'not_ready' }.
//   3. MCQ Exam     — unlocks after Stage 2; the candidate takes it on
//                     /baptism-exam?token=… → exam { attempts: [...], passed }.
//
// Final approval (Applications queue → "Approve & Link to Event") stays blocked
// until all three are done.
import { scoreBaptismExam } from '../constants/baptismExam'

export const BAPTISM_STAGES = [
  { key: 'application', n: 1, label: 'Application' },
  { key: 'cellLeader', n: 2, label: 'Cell Leader Sign-off' },
  { key: 'exam', n: 3, label: 'MCQ Exam' },
]

const SUBMITTED = ['submitted', 'info_requested', 'approved']

/** Best attempt, re-scored from its stored answers (never trusts a stored score). */
export function baptismExamResult(app) {
  const attempts = Array.isArray(app?.exam?.attempts) ? app.exam.attempts : []
  if (!attempts.length) return null
  const scored = attempts.map((a) => ({ ...a, ...scoreBaptismExam(a.answers) }))
  const best = scored.reduce((b, a) => (a.score > b.score ? a : b), scored[0])
  const firstPass = scored.find((a) => a.passed) || null
  return { attempts: scored.length, best, passed: !!firstPass, passedAt: firstPass?.at || '' }
}

/**
 * Each stage's state for one application:
 * [{ key, n, label, state: 'done' | 'current' | 'waiting' | 'blocked', note }]
 * 'blocked' = the cell leader marked them not ready yet.
 */
export function resolveBaptismStages(app) {
  const submitted = !!app && SUBMITTED.includes(app.status)
  const signoff = app?.cellLeaderSignoff
  const req = app?.cellLeaderRequest
  const cellDone = signoff?.status === 'completed'
  const notReady = signoff?.status === 'not_ready'
  const exam = baptismExamResult(app)

  const appStage = submitted
    ? { state: 'done', note: 'Submitted' }
    : { state: 'current', note: app ? 'Waiting for the candidate' : 'Not started' }
  const cellStage = cellDone
    ? { state: 'done', note: `Signed off${signoff.by ? ` by ${signoff.by}` : ''}` }
    : !submitted ? { state: 'waiting', note: '' }
    : notReady ? { state: 'blocked', note: `Not ready yet${signoff.notes ? `: ${signoff.notes}` : ''}` }
    : req?.status === 'Requested' ? { state: 'current', note: `Sent to ${req.recipientName || req.cellLeaderName || 'the cell leader'}` }
    : { state: 'current', note: 'Cell leader not notified yet' }
  const examStage = exam?.passed
    ? { state: 'done', note: `Passed ${exam.best.score}/${exam.best.total}` }
    : !cellDone ? { state: 'waiting', note: '' }
    : exam ? { state: 'current', note: `Best ${exam.best.score}/${exam.best.total} · ${exam.attempts} attempt${exam.attempts === 1 ? '' : 's'}` }
    : { state: 'current', note: 'Not taken yet' }

  const byKey = { application: appStage, cellLeader: cellStage, exam: examStage }
  return BAPTISM_STAGES.map((s) => ({ ...s, ...byKey[s.key] }))
}

/** All three stages done — final pastoral approval may go ahead. */
export const baptismReadyForApproval = (app) => resolveBaptismStages(app).every((s) => s.state === 'done')

/** "2 of 3 complete" / "All 3 stages complete". */
export function baptismStageSummary(app) {
  const done = resolveBaptismStages(app).filter((s) => s.state === 'done').length
  return done === BAPTISM_STAGES.length ? 'All 3 stages complete' : `${done} of ${BAPTISM_STAGES.length} complete`
}

/** Public exam link for an application. */
export const baptismExamLink = (app) => (app?.id ? `${window.location.origin}/baptism-exam?token=${app.id}` : '')
