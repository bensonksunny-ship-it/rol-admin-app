import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getDedicationApplicationByToken, submitDedicationApplication } from '../services/firestore'
import { applicationHasCell, APPLICATION_LOCKED_TITLE, APPLICATION_LOCKED_TEXT } from '../utils/applicationCellGuard'
import {
  DEDICATION_CHURCH_NAME, DEDICATION_FORM_TITLE, DEDICATION_PARENT_FIELDS, DEDICATION_BABY_FIELDS,
  SURPRISE_LABEL, SURPRISE_HELP, surpriseDisplayName, hasValue,
} from '../constants/dedicationForm'
import LegalNameInputGroup from '../components/LegalNameInputGroup'
import FamilyDetailsSection from '../components/FamilyDetailsSection'
import { initialFamilyState, familyPayload } from '../utils/familyDetails'
import { legalNamePayload, isLegalNameComplete } from '../utils/legalName'

const fmtDate = (d) => {
  if (!d) return ''
  const dt = d instanceof Date ? d : new Date(d)
  return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Public, signed-out page opened from the PCS dedication QR code. Parent details
// PCS already has are shown locked; the parents add the baby's details and can
// keep the name a surprise until the dedication service.
export default function DedicationApply() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [app, setApp] = useState(null)
  const [state, setState] = useState('loading') // loading | ready | notFound | submitted
  const [answers, setAnswers] = useState({})
  const [childLegal, setChildLegal] = useState({ firstName: '', middleName: '', lastName: '' })
  const [nameConfirmed, setNameConfirmed] = useState(false)
  const [surprise, setSurprise] = useState(false)
  // Read-only snapshot of the PCS family (spouse / children) — shown and submitted as-is.
  const [family, setFamily] = useState({ spouse: {}, children: [] })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) { setState('notFound'); return }
    getDedicationApplicationByToken(token)
      .then((a) => {
        if (!a) { setState('notFound'); return }
        setApp(a)
        setFamily(initialFamilyState(a.prefill))
        setState(a.status === 'pending' ? (applicationHasCell(a) ? 'ready' : 'locked') : 'submitted')
      })
      .catch(() => setState('notFound'))
  }, [token])

  const locked = (key) => hasValue(app?.prefill?.[key])
  const value = (key) => (locked(key) ? app.prefill[key] : (answers[key] || ''))
  const setAnswer = (key, v) => setAnswers((a) => ({ ...a, [key]: v }))
  const askParent = DEDICATION_PARENT_FIELDS.filter((f) => !locked(f.key))
  const knownParent = DEDICATION_PARENT_FIELDS.filter((f) => locked(f.key))
  const missing = [...askParent, ...DEDICATION_BABY_FIELDS].filter((f) => f.required && !hasValue(answers[f.key]))
  const displayName = surpriseDisplayName(value('fatherName'), value('motherName'))

  const submit = async () => {
    setError('')
    if (!isLegalNameComplete(childLegal)) { setError("Please enter the child's first and last name."); return }
    if (!nameConfirmed) { setError("Please confirm that the child's name matches the birth certificate."); return }
    if (missing.length) { setError(`Please fill: ${missing.map((f) => f.label).join(', ')}`); return }
    setSubmitting(true)
    try {
      const applicant = Object.fromEntries([...askParent, ...DEDICATION_BABY_FIELDS]
        .filter((f) => hasValue(answers[f.key])).map((f) => [f.key, String(answers[f.key]).trim()]))
      const nameParts = legalNamePayload(childLegal)
      applicant.childLegalNameConfirmed = true
      // Siblings only (the spouse is the other parent, already asked above).
      applicant.family = familyPayload(family, { includeSpouse: false })
      await submitDedicationApplication(token, {
        applicant, childNameParts: nameParts, isSurpriseName: surprise,
        publicDisplayName: surprise ? displayName : nameParts.legalFullName,
      })
      setState('submitted')
    } catch {
      setError('Could not submit. The link may have expired. Please contact the church office.')
    } finally {
      setSubmitting(false)
    }
  }

  const shell = (children) => (
    <div className="min-h-screen bg-slate-100 py-6 px-4">
      <div className="max-w-[640px] mx-auto bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">{children}</div>
    </div>
  )
  if (state === 'loading') return shell(<p className="p-10 text-center text-slate-400 text-sm">Loading your application…</p>)
  if (state === 'locked') return shell(
    <div className="p-10 text-center">
      <div className="w-12 h-12 mx-auto rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xl">🔒</div>
      <p className="text-lg font-bold text-slate-800 mt-3">{APPLICATION_LOCKED_TITLE}</p>
      <p className="text-sm text-slate-500 mt-2">{APPLICATION_LOCKED_TEXT}</p>
    </div>
  )
  if (state === 'notFound') return shell(
    <div className="p-10 text-center">
      <p className="text-lg font-bold text-slate-800">This link isn't available</p>
      <p className="text-sm text-slate-500 mt-2">It may have expired or been withdrawn. Please contact the church office for a new link.</p>
    </div>
  )

  const input = (f) => {
    const needs = f.required && !hasValue(answers[f.key])
    const cls = `w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 ${needs ? 'border-amber-400 bg-amber-50' : 'border-slate-300 bg-white'}`
    if (f.options) {
      return (
        <select value={answers[f.key] || ''} onChange={(e) => setAnswer(f.key, e.target.value)} className={cls}>
          <option value="">Select…</option>
          {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )
    }
    return <input type={f.type || 'text'} value={answers[f.key] || ''} onChange={(e) => setAnswer(f.key, e.target.value)} className={cls} />
  }
  const title = (text) => <h2 className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-blue-700 border-b-2 border-blue-700 pb-1">{text}</h2>

  return shell(<>
    <div className="bg-[#1e3a5f] px-5 py-5 text-white">
      <p className="text-[11px] font-black tracking-[0.08em] text-blue-200">{DEDICATION_CHURCH_NAME}</p>
      <h1 className="text-xl font-extrabold mt-1">{DEDICATION_FORM_TITLE}</h1>
    </div>

    {state === 'submitted' ? (
      <div className="p-6 text-center space-y-3">
        <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl">✓</div>
        <p className="text-lg font-bold text-slate-800">Application submitted</p>
        <p className="text-sm text-slate-500">Thank you. The church office will contact you about the dedication service.</p>
      </div>
    ) : (
      <div className="p-5 space-y-6">
        <section>
          {title('Parents')}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            {knownParent.map((f) => (
              <div key={f.key} className="rounded-xl bg-emerald-50/60 border border-emerald-200 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">{f.label} ✓</p>
                <p className="text-sm font-medium text-slate-800 break-words">{app.prefill[f.key]}</p>
              </div>
            ))}
            {askParent.map((f) => (
              <div key={f.key}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{f.label}{f.required && <span className="text-amber-600"> *</span>}</p>
                {input(f)}
              </div>
            ))}
          </div>
        </section>

        <section>
          {title('Baby')}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <div className="sm:col-span-2">
              <LegalNameInputGroup value={childLegal} onChange={setChildLegal} confirmed={nameConfirmed} onConfirm={setNameConfirmed} subject="child" idPrefix="dedication-child" />
            </div>
            <label className="sm:col-span-2 flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-3 cursor-pointer">
              <input type="checkbox" checked={surprise} onChange={(e) => setSurprise(e.target.checked)} className="mt-0.5 w-5 h-5 accent-violet-600 flex-shrink-0" />
              <span>
                <span className="block text-sm font-semibold text-slate-800">{SURPRISE_LABEL}</span>
                <span className="block text-xs text-slate-500 mt-0.5">{SURPRISE_HELP}</span>
                {surprise && <span className="block text-xs font-semibold text-violet-700 mt-1">Will show as: {displayName} 🔒</span>}
              </span>
            </label>
            {DEDICATION_BABY_FIELDS.map((f) => (
              <div key={f.key} className={f.wide ? 'sm:col-span-2' : ''}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{f.label}{f.required && <span className="text-amber-600"> *</span>}</p>
                {input(f)}
              </div>
            ))}
          </div>
          {hasValue(answers.preferredDate) && <p className="text-xs text-slate-400 mt-2">Preferred: {fmtDate(answers.preferredDate)}</p>}
        </section>

        <FamilyDetailsSection value={family} showSpouse={false} title="Children on record" />

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <button type="button" disabled={submitting} onClick={submit}
          className="w-full min-h-[48px] rounded-xl bg-[#1e3a5f] text-white font-bold text-sm hover:bg-[#16304f] disabled:opacity-60">
          {submitting ? 'Submitting…' : 'Submit Application'}
        </button>
      </div>
    )}
  </>)
}
