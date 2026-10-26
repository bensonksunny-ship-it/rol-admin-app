import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getBaptismApplicationByToken, submitBaptismExamAttempt } from '../services/firestore'
import { BAPTISM_CHURCH_NAME } from '../constants/baptismForm'
import { BAPTISM_EXAM_QUESTIONS, BAPTISM_EXAM_PASS_PERCENT, scoreBaptismExam } from '../constants/baptismExam'
import { baptismExamResult } from '../utils/baptismProgress'
import { applicantFullName } from '../utils/baptismFormPrint'

/**
 * Public — Baptism Application Stage 3: the candidate's MCQ exam, opened from the
 * link Caring / the cell leader shares (/baptism-exam?token=<application token>).
 * Unlocks once the cell leader has signed off (Stage 2); retakes are allowed until
 * a pass. Rules (firestore.rules → baptism_applications) only let this page write
 * the `exam` field. A failed attempt shows the score only, not which answers were
 * wrong.
 */
export default function BaptismExam() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [app, setApp] = useState(null)
  const [state, setState] = useState('loading') // loading | notFound | locked | exam | result | passed
  const [answers, setAnswers] = useState({})
  const [last, setLast] = useState(null) // { score, total, passed }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getBaptismApplicationByToken(token).then((a) => {
      if (cancelled) return
      if (!a) { setState('notFound'); return }
      setApp(a)
      if (baptismExamResult(a)?.passed) setState('passed')
      else if (a.cellLeaderSignoff?.status !== 'completed' || !['submitted', 'info_requested'].includes(a.status)) setState('locked')
      else if (a.examOpenUntil && a.examOpenUntil < new Date()) setState('notFound')
      else setState('exam')
    }).catch(() => { if (!cancelled) setState('notFound') })
    return () => { cancelled = true }
  }, [token])

  const answered = BAPTISM_EXAM_QUESTIONS.filter((q) => answers[q.id] !== undefined).length
  const allAnswered = answered === BAPTISM_EXAM_QUESTIONS.length

  const submit = async () => {
    if (!allAnswered) { setError('Please answer every question.'); return }
    setBusy(true); setError('')
    const result = scoreBaptismExam(answers)
    try {
      const exam = await submitBaptismExamAttempt(app, { answers, passed: result.passed })
      setApp((a) => ({ ...a, exam }))
      setLast(result)
      setState('result')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      console.error('submitBaptismExamAttempt', e)
      setError('Could not submit your answers. Please check your connection and try again.')
    }
    setBusy(false)
  }

  const retake = () => { setAnswers({}); setLast(null); setState('exam'); window.scrollTo({ top: 0 }) }

  const name = app ? applicantFullName(app) : ''
  const shell = (children) => (
    <div className="min-h-screen bg-slate-100 py-6 px-4">
      <div className="max-w-[640px] mx-auto bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="bg-[#1e3a5f] px-5 py-5 text-white">
          <p className="text-[11px] font-black tracking-[0.12em] text-blue-200">{BAPTISM_CHURCH_NAME}</p>
          <h1 className="text-xl font-extrabold mt-1">Baptism Exam</h1>
          {name && <p className="text-sm text-blue-100 mt-1">{name}</p>}
        </div>
        {children}
      </div>
    </div>
  )

  if (state === 'loading') return shell(<p className="p-10 text-center text-slate-400 text-sm">Loading…</p>)
  if (state === 'notFound') return shell(
    <div className="p-10 text-center">
      <p className="text-lg font-bold text-slate-800">This link isn't available</p>
      <p className="text-sm text-slate-500 mt-2">It may have expired or been withdrawn. Please contact the church office for a new link.</p>
    </div>
  )
  if (state === 'locked') return shell(
    <div className="p-10 text-center">
      <div className="w-12 h-12 mx-auto rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xl">🔒</div>
      <p className="text-lg font-bold text-slate-800 mt-3">Not open yet</p>
      <p className="text-sm text-slate-500 mt-2">The exam opens once your Cell Leader has confirmed your baptism readiness. Please check back after your next cell meeting.</p>
    </div>
  )
  if (state === 'passed' || (state === 'result' && last?.passed)) {
    const r = last || baptismExamResult(app)?.best
    return shell(
      <div className="p-8 text-center space-y-3">
        <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl">✓</div>
        <p className="text-lg font-bold text-slate-800">You passed!</p>
        {r && <p className="text-3xl font-black text-emerald-600">{r.score} / {r.total}</p>}
        <p className="text-sm text-slate-500">Thank you{name ? `, ${name}` : ''}. Your result has been sent to the church office for final pastoral approval.</p>
      </div>
    )
  }
  if (state === 'result') return shell(
    <div className="p-8 text-center space-y-3">
      <p className="text-lg font-bold text-slate-800">Not quite there yet</p>
      <p className="text-3xl font-black text-amber-600">{last.score} / {last.total}</p>
      <p className="text-sm text-slate-500">You need {last.passCount} correct answers ({BAPTISM_EXAM_PASS_PERCENT}%) to pass. Take some time with the questions and try again — you can retake it as many times as you need.</p>
      <button type="button" onClick={retake} className="min-h-[44px] px-6 rounded-xl bg-[#1e3a5f] text-white text-sm font-bold">Retake the exam</button>
    </div>
  )

  return shell(
    <div className="p-5 space-y-5">
      <p className="text-sm text-slate-600">
        Answer all {BAPTISM_EXAM_QUESTIONS.length} questions. You need {scoreBaptismExam({}).passCount} correct ({BAPTISM_EXAM_PASS_PERCENT}%) to pass; you can retake it if needed.
      </p>
      <ol className="space-y-4">
        {BAPTISM_EXAM_QUESTIONS.map((q, i) => (
          <li key={q.id} className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-bold text-slate-800">{i + 1}. {q.text}</p>
            <div className="mt-3 space-y-2" role="radiogroup" aria-label={`Question ${i + 1}`}>
              {q.options.map((opt, oi) => {
                const checked = answers[q.id] === oi
                return (
                  <label key={oi} className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer text-sm transition-colors ${checked ? 'border-[#1e3a5f] bg-blue-50 text-slate-900' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                    <input type="radio" name={q.id} checked={checked} onChange={() => setAnswers((a) => ({ ...a, [q.id]: oi }))} className="mt-0.5 accent-[#1e3a5f]" />
                    <span>{opt}</span>
                  </label>
                )
              })}
            </div>
          </li>
        ))}
      </ol>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="sticky bottom-0 -mx-5 px-5 py-3 bg-white/95 backdrop-blur border-t border-slate-200 flex items-center gap-3">
        <p className="flex-1 text-xs text-slate-500">{answered} of {BAPTISM_EXAM_QUESTIONS.length} answered</p>
        <button type="button" disabled={busy || !allAnswered} onClick={submit}
          className="min-h-[44px] px-6 rounded-xl bg-[#1e3a5f] text-white text-sm font-bold disabled:opacity-50">
          {busy ? 'Submitting…' : 'Submit answers'}
        </button>
      </div>
    </div>
  )
}
