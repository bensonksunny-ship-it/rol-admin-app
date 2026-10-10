import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { subscribeMembershipApplicationByToken, submitMembershipApplication, submitMembershipDeclaration, submitMembershipRevision } from '../services/firestore'
import { revisionItem } from '../constants/membershipRevision'
import { ImageUploadField, DepositPaymentCard } from '../components/MembershipRevisionParts'
import { BAPTISM_DECLARATION_TITLE, BAPTISM_SELF_DECLARATION_TEXT } from '../constants/baptismDeclaration'
import MembershipProgressPublic from '../components/MembershipProgressPublic'
import { applicationHasCell, APPLICATION_LOCKED_TITLE, APPLICATION_LOCKED_TEXT } from '../utils/applicationCellGuard'
import {
  MEMBERSHIP_CHURCH_NAME, MEMBERSHIP_FORM_TITLE, MEMBERSHIP_FOOTER_NOTE,
  MEMBERSHIP_PREFILL_FIELDS, MEMBERSHIP_APPLICANT_FIELDS, MEMBERSHIP_TALENTS, MEMBERSHIP_DOCUMENTS,
  hasValue,
} from '../constants/membershipForm'
import { openMembershipFormPrint } from '../utils/membershipFormPrint'
import { imageFileToDataUrl } from '../utils/imageDataUrl'
import AddressLineGroup from '../components/AddressLineGroup'
import { EMPTY_ADDRESS, addressProblems, addressPayload } from '../utils/address'
import SignaturePad from '../components/SignaturePad'
import LegalNameInputGroup from '../components/LegalNameInputGroup'
import FamilyDetailsSection from '../components/FamilyDetailsSection'
import { initialFamilyState, familyPayload } from '../utils/familyDetails'
import { LEGAL_NAME_KEYS, legalFullName, legalNamePayload, isLegalNameComplete, splitName } from '../utils/legalName'

const fmtDate = (d) => {
  if (!d) return ''
  const dt = d instanceof Date ? d : new Date(d)
  return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Everything is stored inside one Firestore doc (1 MB cap), so the scans are
// compressed and the total is checked before submitting.
const MAX_TOTAL_CHARS = 850_000

// The applicant's token is remembered on their device, so the bare
// /membership-apply link reopens their own application (form, revisions or tracker).
const TOKEN_KEY = 'rol.membershipApplicationToken'
const savedToken = () => { try { return localStorage.getItem(TOKEN_KEY) || '' } catch { return '' } }
const rememberToken = (t) => { try { localStorage.setItem(TOKEN_KEY, t) } catch { /* private mode */ } }

/** The applicant's earlier answers, to re-open the full form when Stage 4 returns
 *  "Information incorrect / incomplete" (ITEM_1). */
function applicantSeed(a) {
  const ap = a.applicant || {}
  const wb = ap.waterBaptism || {}
  return {
    answers: Object.fromEntries(Object.entries(ap).filter(([, v]) => typeof v === 'string')),
    legal: { firstName: ap.firstName || '', middleName: ap.middleName || '', lastName: ap.lastName || '' },
    address: ap.address ? { ...EMPTY_ADDRESS, ...ap.address } : null,
    talents: Array.isArray(ap.talents) ? ap.talents : [],
    hasCert: wb.hasCertificate ? 'yes' : wb.selfDeclarationSigned ? 'no' : '',
    declared: !!wb.selfDeclarationSigned,
    handover: Object.fromEntries(MEMBERSHIP_DOCUMENTS.map((d) => [d.key, ap[d.key] === true])),
  }
}

// Public, signed-out page opened from the PCS membership QR code: shows what PCS
// already knows as locked ✓ values and asks only for what's missing, plus the
// membership-only parts (family, emergency contact, talents, documents, signature).
export default function MembershipApply() {
  const [params] = useSearchParams()
  const token = params.get('token') || savedToken()
  const [app, setApp] = useState(null)
  const [state, setState] = useState('loading') // loading | ready | notFound | submitted
  const [answers, setAnswers] = useState({})
  const [talents, setTalents] = useState([])
  const [photo, setPhoto] = useState('')
  const [handover, setHandover] = useState({}) // document key → true once ticked
  // Water baptism: received? ('yes' | 'no'), certificate? ('yes' | 'no'), and the
  // self-declaration tick (only when there is no certificate).
  const [baptized, setBaptized] = useState('')
  const [hasCert, setHasCert] = useState('')
  const [declared, setDeclared] = useState(false)
  const [address, setAddress] = useState(EMPTY_ADDRESS)
  const [signature, setSignature] = useState('')
  const [legal, setLegal] = useState({ firstName: '', middleName: '', lastName: '' })
  const [nameConfirmed, setNameConfirmed] = useState(false)
  // Read-only snapshot of the PCS family (spouse / children) — shown and submitted as-is.
  const [family, setFamily] = useState({ spouse: {}, children: [] })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  // Revisions returned from Stage 4 (state 'revise'): new uploads and answers.
  const [idCard, setIdCard] = useState('')
  const [certImage, setCertImage] = useState('')
  const [revDeclared, setRevDeclared] = useState(false)
  const [deposit, setDeposit] = useState('') // 'paid' | 'office'
  const revSeeded = useRef('')

  // Live listener (not a one-time read): after submission this page is the
  // applicant's progress tracker, and it follows staff advancing their stages.
  // The form fields are seeded from the first snapshot only, so later updates
  // never overwrite what the applicant is typing.
  const seeded = useRef(false)
  useEffect(() => {
    if (!token) { setState('notFound'); return }
    return subscribeMembershipApplicationByToken(token, (a) => {
      if (!a) { setState('notFound'); return }
      rememberToken(token)
      setApp(a)
      if (!seeded.current) {
        seeded.current = true
        setPhoto(a.photoDataUrl || '')
        // PCS only holds a locality for the current address — start Line 2 from it.
        setAddress({ ...EMPTY_ADDRESS, line2: a.prefill?.currentAddress || '' })
        setLegal(splitName([a.prefill?.firstName, a.prefill?.middleName, a.prefill?.lastName].filter(Boolean).join(' ')))
        setFamily(initialFamilyState(a.prefill))
        if (a.prefill?.baptismDate || a.prefill?.baptismChurch) setBaptized('yes')
      }
      // Returned for revisions: start the form from what they submitted before
      // (once per return, so later snapshots never overwrite their edits).
      const revKey = a.status === 'revision_requested' ? (a.revisionRequest?.requestedAt || 'returned') : ''
      if (revKey && revSeeded.current !== revKey) {
        revSeeded.current = revKey
        const s = applicantSeed(a)
        setAnswers(s.answers)
        if (s.legal.firstName) setLegal(s.legal)
        if (s.address) setAddress(s.address)
        setTalents(s.talents)
        setBaptized('yes'); setHasCert(s.hasCert); setDeclared(s.declared)
        setHandover(s.handover)
        setPhoto(a.photoDataUrl || '')
        setSignature(a.signatureDataUrl || '')
        setIdCard(''); setCertImage(''); setRevDeclared(false); setDeposit('')
      }
      setState(a.status === 'pending' ? (applicationHasCell(a) ? 'ready' : 'locked')
        : a.status === 'declaration_requested' ? 'declare'
        : a.status === 'revision_requested' ? 'revise'
        : 'submitted')
    },
    // Permission-denied here means the office closed the link before it was submitted.
    () => setState((s) => (s === 'submitted' ? s : 'notFound')))
  }, [token])

  const locked = (key) => hasValue(app?.prefill?.[key])
  // Name parts are asked by LegalNameInputGroup, not the generic field lists.
  // Current address is asked by AddressLineGroup.
  const allFields = [...MEMBERSHIP_PREFILL_FIELDS, ...MEMBERSHIP_APPLICANT_FIELDS].filter((f) => !LEGAL_NAME_KEYS.includes(f.key) && f.key !== 'currentAddress')
  const askFields = allFields.filter((f) => !locked(f.key))
  const knownFields = allFields.filter((f) => locked(f.key))
  const missingRequired = askFields.filter((f) => f.required && !hasValue(answers[f.key]))
  const CERT_KEY = 'hasSubmittedPhysicalBaptismCertificate'
  const docsAsked = MEMBERSHIP_DOCUMENTS.filter((d) => d.key !== CERT_KEY || hasCert === 'yes')
  const missingDocs = docsAsked.filter((d) => !handover[d.key])
  const addressMissing = addressProblems(address)
  const fullName = legalFullName(legal)
  const setAnswer = (key, v) => setAnswers((a) => ({ ...a, [key]: v }))
  // Spouse boxes only for someone PCS has as married (or with a spouse on record).
  const showSpouse = app?.prefill?.family?.maritalStatus === 'Married' || !!app?.prefill?.family?.spouseName

  // What's still wrong with the full form ('' when it can be submitted).
  // skipBaptism: the revision asks for baptism proof separately (ITEM_3).
  const formProblem = ({ skipBaptism = false } = {}) => {
    if (!isLegalNameComplete(legal)) return 'Please enter your first and last name as on your government ID.'
    if (!nameConfirmed) return 'Please confirm that your name matches your government ID.'
    if (addressMissing.length) return `Please complete your address: ${addressMissing.join(', ')}`
    if (missingRequired.length) return `Please fill: ${missingRequired.map((f) => f.label).join(', ')}`
    if (!photo) return 'Please add a recent photograph.'
    if (!skipBaptism) {
      if (baptized !== 'yes') return 'Water baptism is required for church membership. Please speak to the church office about being baptised.'
      if (!hasCert) return 'Please say whether you have a physical baptism certificate.'
      if (hasCert === 'no' && !declared) return 'Please tick the Baptism Self-Declaration, since you do not have a certificate.'
    }
    if (missingDocs.length) return `Please confirm you have handed over: ${missingDocs.map((d) => d.label).join(', ')}`
    if (!signature) return 'Please sign, or upload a signature image.'
    return ''
  }

  // keepBaptism: leave the earlier water-baptism answers as they were.
  const buildApplicant = ({ keepBaptism = false } = {}) => {
    // Only the applicant's own answers are sent; pre-filled PCS values stay as they are.
    const applicant = Object.fromEntries(askFields.filter((f) => hasValue(answers[f.key])).map((f) => [f.key, String(answers[f.key]).trim()]))
    Object.assign(applicant, legalNamePayload(legal), { legalNameConfirmed: true })
    const addr = addressPayload(address)
    applicant.address = addr
    applicant.currentAddress = addr.fullFormattedAddress // one-line copy for staff view / print
    for (const d of MEMBERSHIP_DOCUMENTS) applicant[d.key] = d.key === CERT_KEY ? hasCert === 'yes' : true
    applicant.waterBaptism = keepBaptism && app?.applicant?.waterBaptism ? app.applicant.waterBaptism : {
      isBaptized: true,
      hasCertificate: hasCert === 'yes',
      selfDeclarationSigned: hasCert === 'no' && declared,
      signedAt: hasCert === 'no' && declared ? new Date().toISOString() : '',
      ...(hasCert === 'no' ? { declarationText: BAPTISM_SELF_DECLARATION_TEXT } : {}),
    }
    applicant.family = familyPayload(family, { includeSpouse: showSpouse })
    applicant.talents = talents
    if (hasValue(answers.talentsOther)) applicant.talentsOther = String(answers.talentsOther).trim()
    return applicant
  }

  const submit = async () => {
    setError('')
    const problem = formProblem()
    if (problem) { setError(problem); return }
    const size = [photo, signature].reduce((n, s) => n + (s?.length || 0), 0)
    if (size > MAX_TOTAL_CHARS) { setError('The photo or signature image is too large. Please use a smaller image.'); return }
    setSubmitting(true)
    try {
      const applicant = buildApplicant()
      await submitMembershipApplication(token, { applicant, photoDataUrl: photo, signatureDataUrl: signature, documents: {} })
      setApp((a) => ({ ...a, applicant, photoDataUrl: photo, signatureDataUrl: signature, documents: {}, status: 'submitted', submittedAt: new Date() }))
      setState('submitted')
    } catch {
      setError('Could not submit. This application may have been closed. Please contact the church office.')
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
  if (state === 'locked') return shell(
    <div className="p-10 text-center">
      <div className="w-12 h-12 mx-auto rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xl">🔒</div>
      <p className="text-lg font-bold text-slate-800 mt-3">{APPLICATION_LOCKED_TITLE}</p>
      <p className="text-sm text-slate-500 mt-2">{APPLICATION_LOCKED_TEXT}</p>
    </div>
  )
  if (state === 'declare') {
    const signDeclaration = async () => {
      setError('')
      if (!declared) { setError('Please tick the declaration to confirm it.'); return }
      setSubmitting(true)
      try {
        await submitMembershipDeclaration(token, {
          isBaptized: true, hasCertificate: false, selfDeclarationSigned: true,
          signedAt: new Date().toISOString(), declarationText: BAPTISM_SELF_DECLARATION_TEXT,
        })
      } catch {
        setError('Could not submit. This application may have been closed. Please contact the church office.')
      } finally { setSubmitting(false) }
    }
    return shell(<>
      <div className="bg-[#1e3a5f] px-5 py-5 text-white">
        <p className="text-[11px] font-black tracking-[0.08em] text-blue-200">{MEMBERSHIP_CHURCH_NAME}</p>
        <h1 className="text-xl font-extrabold mt-1">{BAPTISM_DECLARATION_TITLE}</h1>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-sm text-slate-600">The church office could not accept the baptism certificate given with your membership application. If you were baptised but cannot provide a valid certificate, please confirm the declaration below. Your application then continues.</p>
        <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-4 my-3 text-amber-950 space-y-3">
          <p className="font-semibold">{BAPTISM_DECLARATION_TITLE}</p>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)} className="mt-1 w-5 h-5 accent-amber-700 flex-shrink-0" />
            <span className="text-sm leading-relaxed">“{BAPTISM_SELF_DECLARATION_TEXT}”</span>
          </label>
        </div>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <button type="button" disabled={submitting} onClick={signDeclaration}
          className="w-full min-h-[48px] rounded-xl bg-[#1e3a5f] text-white font-bold text-sm hover:bg-[#16304f] disabled:opacity-60">
          {submitting ? 'Submitting…' : 'Submit Declaration'}
        </button>
      </div>
    </>)
  }
  if (state === 'notFound') return shell(
    <div className="p-10 text-center">
      <p className="text-lg font-bold text-slate-800">This link isn't available</p>
      <p className="text-sm text-slate-500 mt-2">This application has been closed or withdrawn. Please contact the church office.</p>
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

  // ─── Returned for revisions (Stage 4) ─────────────────────────────────────
  // Same link, same form: everything stays pre-filled from the first submission.
  // Only the flagged parts are unlocked and highlighted — ITEM_1 all the text
  // fields, ITEM_2 an ID card upload, ITEM_3 baptism certificate / declaration,
  // ITEM_4 the security deposit notice, ITEM_5 the photo.
  const revising = state === 'revise'
  const flagged = revising ? (app?.revisionRequest?.flaggedItems || []) : []
  const isFlagged = (code) => flagged.includes(code)
  const lockInfo = revising && !isFlagged('ITEM_1')
  const lockPhoto = lockInfo && !isFlagged('ITEM_5')
  const highlight = 'rounded-2xl ring-2 ring-orange-400 bg-orange-50/40 p-3 sm:p-4'
  const lockedCls = (locked) => `min-w-0 space-y-6 ${locked ? 'opacity-70 pointer-events-none select-none' : ''}`

  // "⚑ Correction needed" heading + the office's note, on each flagged block.
  const correction = (code) => {
    if (!isFlagged(code)) return null
    const item = revisionItem(code)
    const note = app?.revisionRequest?.notes?.[code]
    return (
      <div className="space-y-1.5 mb-3">
        <p className="text-xs font-extrabold uppercase tracking-wider text-orange-700">⚑ Correction needed: {item?.applicantTitle}</p>
        <p className="text-sm text-slate-600">{item?.applicantText}</p>
        {note && <p className="text-sm text-orange-900 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2"><b>Note from the church office:</b> {note}</p>}
      </div>
    )
  }

  // The form's sections (photo → signature): a fresh application, or a returned
  // one with only the flagged parts editable.
  const formBody = () => (
    <>
      {/* Photo */}
      <fieldset disabled={lockPhoto} className={isFlagged('ITEM_5') ? highlight : lockedCls(lockPhoto)}>
        {correction('ITEM_5')}
        <div className="flex gap-4 items-center">
          <label className={`w-24 h-28 flex-shrink-0 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden cursor-pointer ${photo && !(isFlagged('ITEM_5') && photo === app?.photoDataUrl) ? 'border-slate-300' : 'border-amber-400 bg-amber-50'}`}>
            {photo ? <img src={photo} alt="" className="w-full h-full object-cover" /> : <span className="text-[11px] text-amber-700 text-center px-2">Tap to add a recent photograph</span>}
            <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0]; if (!file) return
              try { setPhoto(await imageFileToDataUrl(file)) } catch { setError('Could not read that photo.') }
            }} />
          </label>
          <p className="text-sm text-slate-600">
            {isFlagged('ITEM_5') ? 'Tap the photo to upload a new passport-size photo.'
              : revising ? 'Your details as submitted are shown below. Only the highlighted sections can be changed.'
              : 'Details the church already has are shown with ✓. Please fill in the highlighted fields, add a photo, confirm your documents and sign.'}
          </p>
        </div>
      </fieldset>

      {/* Personal details — legal name, details on record, answers, family, talents */}
      <fieldset disabled={lockInfo} className={isFlagged('ITEM_1') ? `${highlight} space-y-6` : lockedCls(lockInfo)}>
        {correction('ITEM_1')}
        {/* Legal name — always confirmed against the applicant's government ID */}
        <section>
          <LegalNameInputGroup value={legal} onChange={setLegal} confirmed={nameConfirmed} onConfirm={setNameConfirmed} idPrefix="membership-name" />
        </section>

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
          <div className="mt-3"><AddressLineGroup value={address} onChange={setAddress} idPrefix="membership-address" /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            {askFields.map((f) => (
              <div key={f.key} className={f.wide ? 'sm:col-span-2' : ''}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{f.label}{f.required && <span className="text-amber-600"> *</span>}</p>
                {input(f)}
              </div>
            ))}
          </div>
        </section>

        <FamilyDetailsSection value={family} showSpouse={showSpouse} />

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
      </fieldset>

      {/* Water Baptism — certificate, or a self-declaration when there is none.
          Returned with ITEM_3: upload a certificate or tick the declaration. */}
      {isFlagged('ITEM_3') ? (
        <section className={highlight}>
          {sectionTitle('Water Baptism', 'text-orange-700 border-orange-700')}
          <div className="mt-3">{correction('ITEM_3')}</div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Upload certificate</p>
          <ImageUploadField value={certImage} onChange={(v) => { setCertImage(v); setRevDeclared(false) }} onError={setError} />
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mt-4 mb-2">Or, if you have no certificate</p>
          <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-4 text-amber-950 space-y-3">
            <p className="font-semibold">{BAPTISM_DECLARATION_TITLE}</p>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={revDeclared} onChange={(e) => { setRevDeclared(e.target.checked); if (e.target.checked) setCertImage('') }} className="mt-1 w-5 h-5 accent-amber-700 flex-shrink-0" />
              <span className="text-sm leading-relaxed">“{BAPTISM_SELF_DECLARATION_TEXT}”</span>
            </label>
          </div>
        </section>
      ) : (
        <fieldset disabled={lockInfo} className={lockedCls(lockInfo)}>
          <section>
            {sectionTitle('Water Baptism', 'text-sky-800 border-sky-800')}
            <div className="space-y-4 mt-3">
              <fieldset>
                <legend className="text-sm font-semibold text-slate-800 mb-2">Have you received Water Baptism?</legend>
                <div className="flex gap-2">
                  {[['yes', 'Yes'], ['no', 'No']].map(([v, l]) => (
                    <button key={v} type="button" aria-pressed={baptized === v} onClick={() => { setBaptized(v); if (v === 'no') { setHasCert(''); setDeclared(false) } }}
                      className={`min-h-[44px] px-5 rounded-xl border text-sm font-semibold ${baptized === v ? 'bg-sky-700 text-white border-sky-700' : 'bg-white text-slate-700 border-slate-300'}`}>{l}</button>
                  ))}
                </div>
              </fieldset>
              {baptized === 'no' && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">Water baptism is required for church membership. Please speak to the church office about being baptised.</p>
              )}
              {baptized === 'yes' && (
                <fieldset>
                  <legend className="text-sm font-semibold text-slate-800 mb-2">Do you have a physical Baptism Certificate?</legend>
                  <div className="flex flex-col sm:flex-row gap-2">
                    {[['yes', 'Yes, I have a certificate'], ['no', 'No, I do not have a certificate']].map(([v, l]) => (
                      <button key={v} type="button" aria-pressed={hasCert === v} onClick={() => { setHasCert(v); if (v === 'yes') setDeclared(false) }}
                        className={`min-h-[44px] px-4 rounded-xl border text-sm font-semibold text-left ${hasCert === v ? 'bg-sky-700 text-white border-sky-700' : 'bg-white text-slate-700 border-slate-300'}`}>{l}</button>
                    ))}
                  </div>
                </fieldset>
              )}
              {baptized === 'yes' && hasCert === 'yes' && (
                <p className="text-xs text-slate-500">Bring the certificate to the church office and confirm it under Documents Submission below.</p>
              )}
              {baptized === 'yes' && hasCert === 'no' && (
                <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-4 my-3 text-amber-950 space-y-3">
                  <p className="font-semibold">{BAPTISM_DECLARATION_TITLE}</p>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)} className="mt-1 w-5 h-5 accent-amber-700 flex-shrink-0" />
                    <span className="text-sm leading-relaxed">“{BAPTISM_SELF_DECLARATION_TEXT}”</span>
                  </label>
                </div>
              )}
            </div>
          </section>
        </fieldset>
      )}

      {/* Documents — handed over in person */}
      <fieldset disabled={lockInfo} className={lockedCls(lockInfo)}>
        <section>
          {sectionTitle('Documents Submission', 'text-amber-800 border-amber-800')}
          <p className="text-xs text-slate-500 mt-2">Bring {docsAsked.length > 1 ? 'these' : 'this'} to the church office. {docsAsked.length > 1 ? 'Both confirmations are required.' : 'The confirmation is required.'}</p>
          <div className="space-y-2 mt-3">
            {docsAsked.map((d) => (
              <label key={d.key} className={`flex items-start gap-3 rounded-xl border px-3 py-3 cursor-pointer ${handover[d.key] ? 'border-emerald-300 bg-emerald-50/60' : 'border-amber-400 bg-amber-50'}`}>
                <input type="checkbox" checked={!!handover[d.key]} onChange={(e) => setHandover((m) => ({ ...m, [d.key]: e.target.checked }))}
                  className="mt-0.5 w-5 h-5 accent-emerald-600 flex-shrink-0" />
                <span className="text-sm text-slate-700 leading-snug">{d.confirm}</span>
              </label>
            ))}
          </div>
        </section>
      </fieldset>

      {/* Returned with ITEM_2: ID card upload */}
      {isFlagged('ITEM_2') && (
        <section className={highlight}>
          {sectionTitle('ID Card', 'text-orange-700 border-orange-700')}
          <div className="mt-3">{correction('ITEM_2')}</div>
          <ImageUploadField value={idCard} onChange={setIdCard} onError={setError} />
        </section>
      )}

      {/* Returned with ITEM_4: security deposit notice + payment options */}
      {isFlagged('ITEM_4') && (
        <section className={highlight}>
          {sectionTitle('Security Deposit', 'text-orange-700 border-orange-700')}
          <div className="mt-3"><DepositPaymentCard value={deposit} onChange={setDeposit} /></div>
          {app?.revisionRequest?.notes?.ITEM_4 && (
            <p className="mt-3 text-sm text-orange-900 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2"><b>Note from the church office:</b> {app.revisionRequest.notes.ITEM_4}</p>
          )}
        </section>
      )}

      {/* Signature */}
      <fieldset disabled={lockInfo} className={lockedCls(lockInfo)}>
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
          {signature && signature === app?.signatureDataUrl && <p className="mt-1 text-xs text-emerald-700">✓ Your earlier signature is kept.{lockInfo ? '' : ' Sign above to replace it.'}</p>}
        </section>
      </fieldset>
    </>
  )

  const submitRevision = async () => {
    setError('')
    if (isFlagged('ITEM_1')) { const problem = formProblem({ skipBaptism: isFlagged('ITEM_3') }); if (problem) { setError(problem); return } }
    if (isFlagged('ITEM_2') && !idCard) { setError('Please upload your ID card.'); return }
    if (isFlagged('ITEM_3') && !certImage && !revDeclared) { setError('Please upload your baptism certificate, or tick the self-declaration.'); return }
    if (isFlagged('ITEM_4') && !deposit) { setError('Please tell us about the security deposit payment.'); return }
    if (isFlagged('ITEM_5') && (!photo || photo === app?.photoDataUrl)) { setError('Please upload a new passport-size photo.'); return }
    const docs = { ...(app?.documents || {}), ...(idCard ? { idProof: idCard } : {}), ...(certImage ? { baptismCertificate: certImage } : {}) }
    const size = [photo, signature, ...Object.values(docs)].reduce((n, x) => n + (typeof x === 'string' ? x.length : 0), 0)
    if (size > MAX_TOTAL_CHARS) { setError('The images are too large together. Please use smaller photos.'); return }
    const fields = {}
    if (isFlagged('ITEM_1')) { fields.applicant = buildApplicant({ keepBaptism: isFlagged('ITEM_3') }); fields.signatureDataUrl = signature }
    if (isFlagged('ITEM_1') || isFlagged('ITEM_5')) fields.photoDataUrl = photo
    if (isFlagged('ITEM_2')) fields['documents.idProof'] = idCard
    if (isFlagged('ITEM_3')) {
      if (certImage) fields['documents.baptismCertificate'] = certImage
      else fields.declarationResponse = { isBaptized: true, hasCertificate: false, selfDeclarationSigned: true, signedAt: new Date().toISOString(), declarationText: BAPTISM_SELF_DECLARATION_TEXT }
    }
    setSubmitting(true)
    try {
      await submitMembershipRevision(token, fields, { items: flagged, ...(isFlagged('ITEM_4') ? { deposit } : {}) })
      // The live listener moves the page back to the progress tracker.
    } catch (e) {
      console.error('submitMembershipRevision', e)
      setError('Could not submit. This application may have been closed. Please contact the church office.')
    } finally { setSubmitting(false) }
  }

  return shell(<>
    <div className="bg-[#1e3a5f] px-5 py-5 text-white">
      <p className="text-[11px] font-black tracking-[0.08em] text-blue-200">{MEMBERSHIP_CHURCH_NAME}</p>
      <h1 className="text-xl font-extrabold mt-1">{MEMBERSHIP_FORM_TITLE}</h1>
      {fullName && <p className="text-sm text-blue-100 mt-1">{fullName}</p>}
    </div>

    {state === 'submitted' ? (
      <>
        {/* After a declaration sent back from Stage 4 is signed, confirm it here. */}
        {app?.declarationResponse?.selfDeclarationSigned && (
          <p role="status" className="mx-5 mt-5 text-sm font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            ✓ Baptism self-declaration received{app.declarationResponse.signedAt ? ` on ${new Date(app.declarationResponse.signedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}. Your application continues below.
          </p>
        )}
        {app?.revisionResponse?.submittedAt && (
          <p role="status" className="mx-5 mt-5 text-sm font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            ✓ Your revisions were received on {new Date(app.revisionResponse.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}. The church office will check them again.
          </p>
        )}
        {/* Live 8-stage progress dashboard (same stages as the PCS tracker) */}
        <MembershipProgressPublic app={app} />
        <div className="px-5 pb-6 space-y-3 text-center">
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{MEMBERSHIP_FOOTER_NOTE}</p>
          <button type="button" onClick={() => openMembershipFormPrint(app)} className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Print / Save as PDF
          </button>
          <p className="text-[11px] text-slate-400">Bookmark this page — it updates automatically as your application moves forward.</p>
        </div>
      </>
    ) : (
      <div className="p-5 space-y-6">
        {revising && (
          <div role="alert" className="rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-950">
            <p className="font-bold">⚠️ Revisions Requested by Church Office: Please update the flagged sections below and click Resubmit Application Revisions.</p>
            <ul className="list-disc pl-5 mt-1.5">
              {flagged.map((code) => <li key={code}>{revisionItem(code)?.applicantTitle || code}</li>)}
            </ul>
          </div>
        )}

        {formBody()}

        <p className="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{MEMBERSHIP_FOOTER_NOTE}</p>

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <button type="button" disabled={submitting} onClick={revising ? submitRevision : submit}
          className="w-full min-h-[48px] rounded-xl bg-[#1e3a5f] text-white font-bold text-sm hover:bg-[#16304f] disabled:opacity-60">
          {submitting ? 'Submitting…' : revising ? 'Resubmit Application Revisions' : 'Submit Membership Form'}
        </button>
      </div>
    )}
  </>)
}
