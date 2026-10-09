import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getMarriageApplicationByToken, submitMarriageApplication } from '../services/firestore'
import { applicationHasCell, APPLICATION_LOCKED_TITLE, APPLICATION_LOCKED_TEXT } from '../utils/applicationCellGuard'
import {
  MARRIAGE_CHURCH_NAME, MARRIAGE_FORM_TITLE, MARRIAGE_INTRO_POINTS, MARRIAGE_DECLARATION_TEXT,
  MARRIAGE_APPLICANT_FIELDS, MARRIAGE_PARTNER_FIELDS, MARRIAGE_WEDDING_FIELDS, hasValue,
} from '../constants/marriageForm'
import { imageFileToDataUrl } from '../utils/imageDataUrl'
import SignaturePad from '../components/SignaturePad'
import LegalNameInputGroup from '../components/LegalNameInputGroup'
import FamilyDetailsSection from '../components/FamilyDetailsSection'
import { LEGAL_NAME_KEYS, legalFullName, legalNamePayload, isLegalNameComplete, splitName } from '../utils/legalName'
import { initialFamilyState, familyPayload } from '../utils/familyDetails'

const fmtDate = (d) => {
  if (!d) return ''
  const dt = d instanceof Date ? d : new Date(d)
  return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Everything is stored inside one Firestore doc (1 MB cap).
const MAX_TOTAL_CHARS = 850_000

// Public, signed-out page opened from the PCS marriage QR code: the applicant's
// own details pre-filled from PCS (locked ✓ when known), then the partner, the
// wedding request, any children, the declaration and a signature.
export default function MarriageApply() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [app, setApp] = useState(null)
  const [state, setState] = useState('loading') // loading | ready | locked | notFound | submitted
  const [answers, setAnswers] = useState({})
  const [photo, setPhoto] = useState('')
  const [signature, setSignature] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [legal, setLegal] = useState({ firstName: '', middleName: '', lastName: '' })
  const [nameConfirmed, setNameConfirmed] = useState(false)
  const [partner, setPartner] = useState({ firstName: '', middleName: '', lastName: '' })
  const [partnerConfirmed, setPartnerConfirmed] = useState(false)
  // Read-only snapshot of the PCS family (spouse / children) — shown and submitted as-is.
  const [family, setFamily] = useState({ spouse: {}, children: [] })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) { setState('notFound'); return }
    getMarriageApplicationByToken(token)
      .then((a) => {
        if (!a) { setState('notFound'); return }
        setApp(a)
        setPhoto(a.photoDataUrl || '')
        setLegal(splitName([a.prefill?.firstName, a.prefill?.middleName, a.prefill?.lastName].filter(Boolean).join(' ')))
        setFamily(initialFamilyState(a.prefill))
        setState(a.status === 'pending' ? (applicationHasCell(a) ? 'ready' : 'locked') : 'submitted')
      })
      // Permission-denied here means the link expired (rules stop serving it).
      .catch(() => setState('notFound'))
  }, [token])

  const locked = (key) => hasValue(app?.prefill?.[key])
  const applicantFields = MARRIAGE_APPLICANT_FIELDS.filter((f) => !LEGAL_NAME_KEYS.includes(f.key))
  const askFields = [...applicantFields.filter((f) => !locked(f.key)), ...MARRIAGE_PARTNER_FIELDS, ...MARRIAGE_WEDDING_FIELDS]
  const knownFields = applicantFields.filter((f) => locked(f.key))
  const missingRequired = askFields.filter((f) => f.required && !hasValue(answers[f.key]))
  const fullName = legalFullName(legal)
  const partnerName = legalFullName(partner)
  const setAnswer = (key, v) => setAnswers((a) => ({ ...a, [key]: v }))

  const submit = async () => {
    setError('')
    if (!isLegalNameComplete(legal)) { setError('Please enter your first and last name as on your government ID.'); return }
    if (!nameConfirmed) { setError('Please confirm that your name matches your government ID.'); return }
    if (!isLegalNameComplete(partner)) { setError("Please enter your partner's first and last name as on their government ID."); return }
    if (!partnerConfirmed) { setError("Please confirm that your partner's name matches their government ID."); return }
    if (missingRequired.length) { setError(`Please fill: ${missingRequired.map((f) => f.label).join(', ')}`); return }
    if (!agreed) { setError('Please tick the declaration.'); return }
    if (!signature) { setError('Please sign, or upload a signature image.'); return }
    if ((photo?.length || 0) + (signature?.length || 0) > MAX_TOTAL_CHARS) { setError('The photo or signature image is too large. Please use a smaller image.'); return }
    setSubmitting(true)
    try {
      // Only the applicant's own answers are sent; pre-filled PCS values stay as they are.
      const applicant = Object.fromEntries(askFields.filter((f) => hasValue(answers[f.key])).map((f) => [f.key, String(answers[f.key]).trim()]))
      Object.assign(applicant, legalNamePayload(legal), { legalNameConfirmed: true })
      const p = legalNamePayload(partner)
      Object.assign(applicant, {
        partnerFirstName: p.firstName, partnerMiddleName: p.middleName, partnerLastName: p.lastName,
        partnerLegalFullName: p.legalFullName, partnerNameConfirmed: true,
        // Children only — the partner becomes the spouse once the wedding is recorded.
        family: familyPayload(family, { includeSpouse: false }),
      })
      await submitMarriageApplication(token, { applicant, photoDataUrl: photo, signatureDataUrl: signature })
      setApp((a) => ({ ...a, applicant, photoDataUrl: photo, signatureDataUrl: signature, status: 'submitted', submittedAt: new Date() }))
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
    if (f.multiline) return <textarea rows={3} value={answers[f.key] || ''} onChange={(e) => setAnswer(f.key, e.target.value)} className={`${cls} resize-none`} />
    return <input type={f.type || 'text'} placeholder={f.placeholder || ''} value={answers[f.key] || ''} onChange={(e) => setAnswer(f.key, e.target.value)} className={cls} />
  }
  const fieldGrid = (fields) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
      {fields.map((f) => (
        <div key={f.key} className={f.wide ? 'sm:col-span-2' : ''}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{f.label}{f.required && <span className="text-amber-600"> *</span>}</p>
          {input(f)}
        </div>
      ))}
    </div>
  )
  const sectionTitle = (text, color = 'text-blue-700 border-blue-700') => (
    <h2 className={`text-[11px] font-extrabold uppercase tracking-[0.15em] border-b-2 pb-1 ${color}`}>{text}</h2>
  )

  return shell(<>
    <div className="bg-[#1e3a5f] px-5 py-5 text-white">
      <p className="text-[11px] font-black tracking-[0.12em] text-blue-200">{MARRIAGE_CHURCH_NAME}</p>
      <h1 className="text-xl font-extrabold mt-1">{MARRIAGE_FORM_TITLE}</h1>
      {(fullName || partnerName) && <p className="text-sm text-blue-100 mt-1">{[fullName, partnerName].filter(Boolean).join(' & ')}</p>}
    </div>

    {state === 'submitted' ? (
      <div className="p-6 text-center space-y-3">
        <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl">✓</div>
        <p className="text-lg font-bold text-slate-800">Application submitted</p>
        <p className="text-sm text-slate-500">Thank you{fullName ? `, ${fullName}` : ''}. The Pastoral Office will contact you about counselling and the wedding date.</p>
      </div>
    ) : (
      <div className="p-5 space-y-6">
        <div className="flex gap-4 items-start">
          <label className="w-24 h-28 flex-shrink-0 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden cursor-pointer bg-slate-50 hover:border-slate-400">
            {photo ? <img src={photo} alt="" className="w-full h-full object-cover" /> : <span className="text-[11px] text-slate-400 text-center px-2">Tap to add a photo of you both (optional)</span>}
            <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0]; if (!file) return
              try { setPhoto(await imageFileToDataUrl(file)) } catch { setError('Could not read that photo.') }
            }} />
          </label>
          <ul className="list-disc pl-4 space-y-1.5 text-[13px] text-slate-700 leading-snug">
            {MARRIAGE_INTRO_POINTS.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>

        <section>
          {sectionTitle('Your details')}
          <div className="mt-3">
            <LegalNameInputGroup value={legal} onChange={setLegal} confirmed={nameConfirmed} onConfirm={setNameConfirmed} idPrefix="marriage-name" />
          </div>
          {knownFields.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              {knownFields.map((f) => (
                <div key={f.key} className={`rounded-xl bg-emerald-50/60 border border-emerald-200 px-3 py-2 ${f.wide ? 'sm:col-span-2' : ''}`}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">{f.label} ✓</p>
                  <p className="text-sm font-medium text-slate-800 break-words">{f.type === 'date' ? fmtDate(app.prefill[f.key]) : app.prefill[f.key]}</p>
                </div>
              ))}
            </div>
          )}
          {fieldGrid(applicantFields.filter((f) => !locked(f.key)))}
        </section>

        <section>
          {sectionTitle('Your partner', 'text-rose-700 border-rose-700')}
          <div className="mt-3">
            <LegalNameInputGroup value={partner} onChange={setPartner} confirmed={partnerConfirmed} onConfirm={setPartnerConfirmed} idPrefix="marriage-partner" />
          </div>
          {fieldGrid(MARRIAGE_PARTNER_FIELDS)}
        </section>

        <section>
          {sectionTitle('Wedding', 'text-violet-700 border-violet-700')}
          {fieldGrid(MARRIAGE_WEDDING_FIELDS)}
        </section>

        <FamilyDetailsSection value={family} showSpouse={false} title="Your children (if any)" />

        <section>
          {sectionTitle('Declaration', 'text-emerald-800 border-emerald-800')}
          <label className="flex items-start gap-3 mt-3 cursor-pointer">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 w-5 h-5 accent-emerald-600 flex-shrink-0" />
            <span className="text-sm text-slate-700 leading-relaxed">
              {MARRIAGE_DECLARATION_TEXT.replace('{name}', fullName || '________').replace('{partner}', partnerName || '________')}
            </span>
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

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <button type="button" disabled={submitting} onClick={submit}
          className="w-full min-h-[48px] rounded-xl bg-[#1e3a5f] text-white font-bold text-sm hover:bg-[#16304f] disabled:opacity-60">
          {submitting ? 'Submitting…' : 'Submit Application'}
        </button>
      </div>
    )}
  </>)
}
