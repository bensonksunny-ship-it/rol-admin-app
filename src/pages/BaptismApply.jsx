import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getBaptismApplicationByToken, submitBaptismApplication } from '../services/firestore'
import { applicationHasCell, APPLICATION_LOCKED_TITLE, APPLICATION_LOCKED_TEXT } from '../utils/applicationCellGuard'
import {
  BAPTISM_CHURCH_NAME, BAPTISM_FORM_TITLE, BAPTISM_DECLARATION_POINTS, BAPTISM_DECLARATION_TEXT,
  BAPTISM_PASTOR_SIGNOFF, BAPTISM_FIELDS, hasValue, GENDER_REQUIRED_MESSAGE,
} from '../constants/baptismForm'
import { openBaptismFormPrint } from '../utils/baptismFormPrint'
import SignaturePad from '../components/SignaturePad'
import LegalNameInputGroup from '../components/LegalNameInputGroup'
import FamilyDetailsSection from '../components/FamilyDetailsSection'
import { initialFamilyState, familyPayload } from '../utils/familyDetails'
import { LEGAL_NAME_KEYS, legalFullName, legalNamePayload, isLegalNameComplete, splitName } from '../utils/legalName'

// Shrink an uploaded image to a small JPEG data URL so it fits inside the
// Firestore doc (no Storage upload — this page runs signed-out).
function imageFileToDataUrl(file, maxSide = 480, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * scale)
      c.height = Math.round(img.height * scale)
      const ctx = c.getContext('2d')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')) }
    img.src = url
  })
}

const fmtDate = (d) => {
  if (!d) return ''
  const dt = d instanceof Date ? d : new Date(d)
  return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Public, signed-out page opened from the PCS baptism QR code: shows what PCS
// already knows as locked values and asks only for what's missing.
export default function BaptismApply() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [app, setApp] = useState(null)
  const [state, setState] = useState('loading') // loading | ready | notFound | submitted
  const [answers, setAnswers] = useState({})
  const [photo, setPhoto] = useState('')
  const [signature, setSignature] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [legal, setLegal] = useState({ firstName: '', middleName: '', lastName: '' })
  const [nameConfirmed, setNameConfirmed] = useState(false)
  // Read-only snapshot of the PCS family (spouse / children) — shown and submitted as-is.
  const [family, setFamily] = useState({ spouse: {}, children: [] })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [genderError, setGenderError] = useState(false)

  useEffect(() => {
    if (!token) { setState('notFound'); return }
    getBaptismApplicationByToken(token)
      .then((a) => {
        if (!a) { setState('notFound'); return }
        setApp(a)
        setPhoto(a.photoDataUrl || '')
        // Start the three name boxes from the PCS name; the applicant corrects it to their ID.
        setLegal(splitName([a.prefill?.firstName, a.prefill?.middleName, a.prefill?.lastName].filter(Boolean).join(' ')))
        setFamily(initialFamilyState(a.prefill))
        setState(a.status === 'pending' ? (applicationHasCell(a) ? 'ready' : 'locked') : 'submitted')
      })
      // Permission-denied here means the link expired (rules stop serving it).
      .catch(() => setState('notFound'))
  }, [token])

  const locked = (key) => hasValue(app?.prefill?.[key])
  const value = (key) => (locked(key) ? app.prefill[key] : (answers[key] || ''))
  const fields = useMemo(() => {
    if (!app) return []
    const values = Object.fromEntries(BAPTISM_FIELDS.map((f) => [f.key, locked(f.key) ? app.prefill[f.key] : (answers[f.key] || '')]))
    return BAPTISM_FIELDS.filter((f) => !LEGAL_NAME_KEYS.includes(f.key) && f.key !== 'spouseName' && (!f.onlyIf || f.onlyIf(values)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app, answers])
  const missingRequired = fields.filter((f) => f.required && !hasValue(value(f.key)))
  const fullName = legalFullName(legal)
  const showSpouse = value('maritalStatus') === 'Married'

  const submit = async () => {
    setError('')
    if (!isLegalNameComplete(legal)) { setError('Please enter your first and last name as on your government ID.'); return }
    if (!nameConfirmed) { setError('Please confirm that your name matches your government ID.'); return }
    if (!hasValue(value('gender'))) { setGenderError(true); setError(GENDER_REQUIRED_MESSAGE); return }
    if (missingRequired.length) { setError(`Please fill: ${missingRequired.map((f) => f.label).join(', ')}`); return }
    if (!agreed) { setError('Please tick the declaration.'); return }
    if (!signature) { setError('Please sign, or upload a signature image.'); return }
    setSubmitting(true)
    try {
      // Only the applicant's own answers are sent; pre-filled PCS values stay as they are.
      const applicant = {
        ...Object.fromEntries(fields.filter((f) => !locked(f.key) && hasValue(answers[f.key])).map((f) => [f.key, String(answers[f.key]).trim()])),
        ...legalNamePayload(legal), legalNameConfirmed: true,
      }
      const fam = familyPayload(family, { includeSpouse: showSpouse })
      applicant.family = fam
      await submitBaptismApplication(token, { applicant, photoDataUrl: photo, signatureDataUrl: signature })
      setApp((a) => ({ ...a, applicant, photoDataUrl: photo, signatureDataUrl: signature, status: 'submitted', submittedAt: new Date() }))
      setState('submitted')
    } catch {
      setError('Could not submit. The link may have expired. Please contact the church office.')
    } finally {
      setSubmitting(false)
    }
  }

  // One form field: locked ✓ value from PCS, or an input (radio pills for `radio`).
  const renderField = (f) => {
    if (locked(f.key)) {
      return (
        <div key={f.key} className={`rounded-xl bg-emerald-50/60 border border-emerald-200 px-3 py-2 ${f.wide ? 'sm:col-span-2' : ''}`}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">{f.label} ✓</p>
          <p className="text-sm font-medium text-slate-800 break-words">{f.type === 'date' ? fmtDate(app.prefill[f.key]) : app.prefill[f.key]}</p>
        </div>
      )
    }
    const needs = f.required && !hasValue(answers[f.key])
    const cls = `w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 ${needs ? 'border-amber-400 bg-amber-50' : 'border-slate-300 bg-white'}`
    return (
      <div key={f.key} className={f.wide ? 'sm:col-span-2' : ''}>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{f.label}{f.required && <span className="text-amber-600"> *</span>}</p>
        {f.radio ? (
          <div className={`flex gap-2 ${needs && genderError ? 'ring-2 ring-red-300 rounded-xl' : ''}`} role="radiogroup" aria-label={f.label}>
            {f.options.map((o) => (
              <button key={o} type="button" role="radio" aria-checked={answers[f.key] === o}
                onClick={() => { setAnswers((a) => ({ ...a, [f.key]: o })); if (f.key === 'gender') setGenderError(false) }}
                className={`flex-1 min-h-[44px] rounded-xl border text-sm font-semibold transition-colors ${answers[f.key] === o ? 'bg-blue-600 text-white border-blue-600' : needs ? 'border-amber-400 bg-amber-50 text-slate-700' : 'border-slate-300 bg-white text-slate-700'}`}>
                {o}
              </button>
            ))}
          </div>
        ) : f.options ? (
          <select value={answers[f.key] || ''} onChange={(e) => setAnswers((a) => ({ ...a, [f.key]: e.target.value }))} className={cls}>
            <option value="">Select…</option>
            {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input type={f.type || 'text'} placeholder={f.placeholder || ''} value={answers[f.key] || ''} onChange={(e) => setAnswers((a) => ({ ...a, [f.key]: e.target.value }))} className={cls} />
        )}
      </div>
    )
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

  return shell(<>
    {/* Header */}
    <div className="bg-[#1e3a5f] px-5 py-5 text-white">
      <p className="text-[11px] font-black tracking-[0.12em] text-blue-200">{BAPTISM_CHURCH_NAME}</p>
      <h1 className="text-xl font-extrabold mt-1">{BAPTISM_FORM_TITLE}</h1>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-blue-100">
        {(app.place || answers.baptismPlace || app.applicant?.baptismPlace) && (
          <span>Place: <b className="text-white">{app.place || answers.baptismPlace || app.applicant?.baptismPlace}</b></span>
        )}
        <span>Date: <b className="text-white">{fmtDate(app.submittedAt || new Date())}</b></span>
        {/* Form ID (B-<batch> / <serial>) appears once the church office assigns it. */}
        {app.formId && <span className="font-black text-white border border-white/40 rounded-md px-2 py-0.5">{app.formId}</span>}
      </div>
    </div>

    {state === 'submitted' ? (
      <div className="p-6 text-center space-y-3">
        <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl">✓</div>
        <p className="text-lg font-bold text-slate-800">Application submitted</p>
        <p className="text-sm text-slate-500">Thank you{fullName ? `, ${fullName}` : ''}. The church office will be in touch about your baptism.</p>
        <button type="button" onClick={() => openBaptismFormPrint(app)} className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Print / Save as PDF
        </button>
      </div>
    ) : (
      <div className="p-5 space-y-6">
        {/* Photo + declaration points */}
        <div className="flex gap-4 items-start">
          <label className="w-24 h-28 flex-shrink-0 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden cursor-pointer bg-slate-50 hover:border-slate-400">
            {photo ? <img src={photo} alt="" className="w-full h-full object-cover" /> : <span className="text-[11px] text-slate-400 text-center px-2">Tap to add photo</span>}
            <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0]; if (!file) return
              try { setPhoto(await imageFileToDataUrl(file)) } catch { setError('Could not read that photo.') }
            }} />
          </label>
          <ul className="list-disc pl-4 space-y-1.5 text-[13px] text-slate-700 leading-snug">
            {BAPTISM_DECLARATION_POINTS.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>

        {/* Candidate information */}
        <section>
          <h2 className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-blue-700 border-b-2 border-blue-700 pb-1">Candidate Information</h2>
          <div className="mt-3">
            <LegalNameInputGroup value={legal} onChange={setLegal} confirmed={nameConfirmed} onConfirm={setNameConfirmed} idPrefix="baptism-name" />
          </div>
          <p className="text-xs text-slate-500 mt-4">Details we already have are shown with ✓. Please fill in the highlighted ones.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            {fields.filter((f) => !f.section).map(renderField)}
          </div>
        </section>

        {/* Family & Personal Details — gender + parents print on the Certificate of Baptism */}
        <section>
          <h2 className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-blue-700 border-b-2 border-blue-700 pb-1">Family &amp; Personal Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            {fields.filter((f) => f.section === 'family').map(renderField)}
          </div>
          {genderError && <p className="text-sm font-medium text-red-600 mt-2">{GENDER_REQUIRED_MESSAGE}</p>}
        </section>

        <FamilyDetailsSection value={family} showSpouse={showSpouse} />

        {/* Declaration + signature */}
        <section>
          <h2 className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-emerald-800 border-b-2 border-emerald-800 pb-1">Applicant Declaration</h2>
          <label className="flex items-start gap-3 mt-3 cursor-pointer">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 w-5 h-5 accent-emerald-600 flex-shrink-0" />
            <span className="text-sm text-slate-700 leading-relaxed">{BAPTISM_DECLARATION_TEXT.replace('{name}', fullName || '________')}</span>
          </label>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-4 mb-1">Signature</p>
          <SignaturePad onChange={setSignature} />
          <label className="inline-block mt-2 text-xs font-semibold text-blue-700 cursor-pointer hover:underline">
            Or upload a signature image
            <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0]; if (!file) return
              try { setSignature(await imageFileToDataUrl(file, 600, 0.85)) } catch { setError('Could not read that image.') }
            }} />
          </label>
          {signature && signature.startsWith('data:image/jpeg') && <img src={signature} alt="Uploaded signature" className="mt-2 max-h-16 border border-slate-200 rounded" />}
        </section>

        {/* Office use (read-only) */}
        <section className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-500">
          <p className="font-bold uppercase tracking-wider text-[10px] text-slate-600">For office use</p>
          <p className="mt-1">Notes, and approval by {BAPTISM_PASTOR_SIGNOFF.join(', ')}.</p>
        </section>

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <button type="button" disabled={submitting} onClick={submit}
          className="w-full min-h-[48px] rounded-xl bg-[#1e3a5f] text-white font-bold text-sm hover:bg-[#16304f] disabled:opacity-60">
          {submitting ? 'Submitting…' : 'Submit Application'}
        </button>
      </div>
    )}
  </>)
}
