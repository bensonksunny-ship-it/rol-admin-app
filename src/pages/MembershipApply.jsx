import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getMembershipApplicationByToken, submitMembershipApplication } from '../services/firestore'
import {
  MEMBERSHIP_CHURCH_NAME, MEMBERSHIP_FORM_TITLE, MEMBERSHIP_FOOTER_NOTE,
  MEMBERSHIP_PREFILL_FIELDS, MEMBERSHIP_APPLICANT_FIELDS, MEMBERSHIP_TALENTS, MEMBERSHIP_DOCUMENTS,
  hasValue,
} from '../constants/membershipForm'
import { openMembershipFormPrint } from '../utils/membershipFormPrint'
import { imageFileToDataUrl } from '../utils/imageDataUrl'
import SignaturePad from '../components/SignaturePad'

const fmtDate = (d) => {
  if (!d) return ''
  const dt = d instanceof Date ? d : new Date(d)
  return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Everything is stored inside one Firestore doc (1 MB cap), so the scans are
// compressed and the total is checked before submitting.
const MAX_TOTAL_CHARS = 850_000

// Public, signed-out page opened from the PCS membership QR code: shows what PCS
// already knows as locked ✓ values and asks only for what's missing, plus the
// membership-only parts (family, emergency contact, talents, documents, signature).
export default function MembershipApply() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [app, setApp] = useState(null)
  const [state, setState] = useState('loading') // loading | ready | notFound | submitted
  const [answers, setAnswers] = useState({})
  const [talents, setTalents] = useState([])
  const [photo, setPhoto] = useState('')
  const [documents, setDocuments] = useState({})
  const [signature, setSignature] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) { setState('notFound'); return }
    getMembershipApplicationByToken(token)
      .then((a) => {
        if (!a) { setState('notFound'); return }
        setApp(a)
        setPhoto(a.photoDataUrl || '')
        setState(a.status === 'pending' ? 'ready' : 'submitted')
      })
      // Permission-denied here means the link expired (rules stop serving it).
      .catch(() => setState('notFound'))
  }, [token])

  const locked = (key) => hasValue(app?.prefill?.[key])
  const value = (key) => (locked(key) ? app.prefill[key] : (answers[key] || ''))
  const allFields = [...MEMBERSHIP_PREFILL_FIELDS, ...MEMBERSHIP_APPLICANT_FIELDS]
  const askFields = allFields.filter((f) => !locked(f.key))
  const knownFields = allFields.filter((f) => locked(f.key))
  const missingRequired = askFields.filter((f) => f.required && !hasValue(answers[f.key]))
  const missingDocs = MEMBERSHIP_DOCUMENTS.filter((d) => d.required && !documents[d.key])
  const fullName = [value('firstName'), value('lastName')].filter(hasValue).join(' ')
  const setAnswer = (key, v) => setAnswers((a) => ({ ...a, [key]: v }))

  const submit = async () => {
    setError('')
    if (missingRequired.length) { setError(`Please fill: ${missingRequired.map((f) => f.label).join(', ')}`); return }
    if (!photo) { setError('Please add a recent photograph.'); return }
    if (missingDocs.length) { setError(`Please upload: ${missingDocs.map((d) => d.label).join(', ')}`); return }
    if (!signature) { setError('Please sign, or upload a signature image.'); return }
    const size = [photo, signature, ...Object.values(documents)].reduce((n, s) => n + (s?.length || 0), 0)
    if (size > MAX_TOTAL_CHARS) { setError('The uploaded images are too large together. Please retake the document photos a little further away.'); return }
    setSubmitting(true)
    try {
      // Only the applicant's own answers are sent; pre-filled PCS values stay as they are.
      const applicant = Object.fromEntries(askFields.filter((f) => hasValue(answers[f.key])).map((f) => [f.key, String(answers[f.key]).trim()]))
      applicant.talents = talents
      if (hasValue(answers.talentsOther)) applicant.talentsOther = String(answers.talentsOther).trim()
      await submitMembershipApplication(token, { applicant, photoDataUrl: photo, signatureDataUrl: signature, documents })
      setApp((a) => ({ ...a, applicant, photoDataUrl: photo, signatureDataUrl: signature, documents, status: 'submitted', submittedAt: new Date() }))
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

  if (state === 'loading') return shell(<p className="p-10 text-center text-slate-400 text-sm">Loading your membership form…</p>)
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
    return <input type={f.type || 'text'} value={answers[f.key] || ''} onChange={(e) => setAnswer(f.key, e.target.value)} className={cls} />
  }

  const sectionTitle = (text, color = 'text-blue-700 border-blue-700') => (
    <h2 className={`text-[11px] font-extrabold uppercase tracking-[0.15em] border-b-2 pb-1 ${color}`}>{text}</h2>
  )

  return shell(<>
    <div className="bg-[#1e3a5f] px-5 py-5 text-white">
      <p className="text-[11px] font-black tracking-[0.08em] text-blue-200">{MEMBERSHIP_CHURCH_NAME}</p>
      <h1 className="text-xl font-extrabold mt-1">{MEMBERSHIP_FORM_TITLE}</h1>
      {fullName && <p className="text-sm text-blue-100 mt-1">{fullName}</p>}
    </div>

    {state === 'submitted' ? (
      <div className="p-6 text-center space-y-3">
        <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl">✓</div>
        <p className="text-lg font-bold text-slate-800">Membership form submitted</p>
        <p className="text-sm text-slate-500">Thank you{fullName ? `, ${fullName}` : ''}. Your application is now under review by the Pastoral Office.</p>
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{MEMBERSHIP_FOOTER_NOTE}</p>
        <button type="button" onClick={() => openMembershipFormPrint(app)} className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Print / Save as PDF
        </button>
      </div>
    ) : (
      <div className="p-5 space-y-6">
        {/* Photo */}
        <div className="flex gap-4 items-center">
          <label className={`w-24 h-28 flex-shrink-0 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden cursor-pointer ${photo ? 'border-slate-300' : 'border-amber-400 bg-amber-50'}`}>
            {photo ? <img src={photo} alt="" className="w-full h-full object-cover" /> : <span className="text-[11px] text-amber-700 text-center px-2">Tap to add a recent photograph</span>}
            <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0]; if (!file) return
              try { setPhoto(await imageFileToDataUrl(file)) } catch { setError('Could not read that photo.') }
            }} />
          </label>
          <p className="text-sm text-slate-600">Details the church already has are shown with ✓. Please fill in the highlighted fields, add a photo, upload your documents and sign.</p>
        </div>

        {/* Details already on record */}
        {knownFields.length > 0 && (
          <section>
            {sectionTitle('Your details on record', 'text-emerald-800 border-emerald-800')}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              {knownFields.map((f) => (
                <div key={f.key} className={`rounded-xl bg-emerald-50/60 border border-emerald-200 px-3 py-2 ${f.wide ? 'sm:col-span-2' : ''}`}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">{f.label} ✓</p>
                  <p className="text-sm font-medium text-slate-800 break-words whitespace-pre-wrap">{f.type === 'date' ? fmtDate(app.prefill[f.key]) : app.prefill[f.key]}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* What we still need */}
        <section>
          {sectionTitle('Please fill in')}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            {askFields.map((f) => (
              <div key={f.key} className={f.wide ? 'sm:col-span-2' : ''}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{f.label}{f.required && <span className="text-amber-600"> *</span>}</p>
                {input(f)}
              </div>
            ))}
          </div>
        </section>

        {/* Talents */}
        <section>
          {sectionTitle('Talents / Gifts', 'text-violet-700 border-violet-700')}
          <div className="flex flex-wrap gap-2 mt-3">
            {MEMBERSHIP_TALENTS.map((t) => {
              const on = talents.includes(t)
              return (
                <button key={t} type="button" aria-pressed={on}
                  onClick={() => setTalents((list) => on ? list.filter((x) => x !== t) : [...list, t])}
                  className={`px-3 py-1.5 rounded-full border text-xs font-semibold ${on ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-300'}`}>
                  {t}
                </button>
              )
            })}
          </div>
          <input type="text" value={answers.talentsOther || ''} onChange={(e) => setAnswer('talentsOther', e.target.value)}
            placeholder="Anything else? (optional)" className="mt-2 w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm" />
        </section>

        {/* Documents */}
        <section>
          {sectionTitle('Documents', 'text-amber-800 border-amber-800')}
          <div className="space-y-2 mt-3">
            {MEMBERSHIP_DOCUMENTS.map((d) => (
              <label key={d.key} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer ${documents[d.key] ? 'border-emerald-300 bg-emerald-50/60' : d.required ? 'border-amber-400 bg-amber-50' : 'border-slate-300'}`}>
                {documents[d.key]
                  ? <img src={documents[d.key]} alt="" className="w-12 h-12 object-cover rounded border border-slate-200 flex-shrink-0" />
                  : <span className="w-12 h-12 rounded border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-lg flex-shrink-0">+</span>}
                <span className="flex-1 text-sm text-slate-700">
                  {d.label}{d.required && <span className="text-amber-600"> *</span>}
                  <span className="block text-[11px] text-slate-400">{documents[d.key] ? 'Added. Tap to replace.' : 'Tap to take a photo or choose an image'}</span>
                </span>
                <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0]; if (!file) return
                  try { const url = await imageFileToDataUrl(file, 1100, 0.7); setDocuments((m) => ({ ...m, [d.key]: url })) } catch { setError('Could not read that image.') }
                }} />
              </label>
            ))}
          </div>
        </section>

        {/* Signature */}
        <section>
          {sectionTitle('Signature of Applicant', 'text-emerald-800 border-emerald-800')}
          <div className="mt-3"><SignaturePad onChange={setSignature} /></div>
          <label className="inline-block mt-2 text-xs font-semibold text-blue-700 cursor-pointer hover:underline">
            Or upload a signature image
            <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0]; if (!file) return
              try { setSignature(await imageFileToDataUrl(file, 600, 0.85)) } catch { setError('Could not read that image.') }
            }} />
          </label>
          {signature && signature.startsWith('data:image/jpeg') && <img src={signature} alt="Uploaded signature" className="mt-2 max-h-16 border border-slate-200 rounded" />}
        </section>

        <p className="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{MEMBERSHIP_FOOTER_NOTE}</p>

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <button type="button" disabled={submitting} onClick={submit}
          className="w-full min-h-[48px] rounded-xl bg-[#1e3a5f] text-white font-bold text-sm hover:bg-[#16304f] disabled:opacity-60">
          {submitting ? 'Submitting…' : 'Submit Membership Form'}
        </button>
      </div>
    )}
  </>)
}
