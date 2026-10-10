import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getBaptismDeclarationByToken, signBaptismDeclaration } from '../services/firestore'
import { BAPTISM_DECLARATION_TITLE, BAPTISM_SELF_DECLARATION_TEXT } from '../constants/baptismDeclaration'
import SignaturePad from '../components/SignaturePad'

const fmtDate = (d) => {
  const dt = d instanceof Date ? d : d ? new Date(d) : null
  return dt && !isNaN(dt.getTime()) ? dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
}

// Public, signed-out page from a Stage 4 "Baptism Self-Declaration" request: the
// candidate ticks the declaration, signs, and submits; the date is stamped on submit.
export default function BaptismDeclarationSign() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [req, setReq] = useState(null)
  const [state, setState] = useState('loading') // loading | ready | notFound | signed
  const [agreed, setAgreed] = useState(false)
  const [signedName, setSignedName] = useState('')
  const [signature, setSignature] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) { setState('notFound'); return }
    getBaptismDeclarationByToken(token)
      .then((r) => {
        if (!r) { setState('notFound'); return }
        setReq(r)
        setSignedName(r.candidateName || '')
        setState(r.status === 'pending' ? 'ready' : 'signed')
      })
      .catch(() => setState('notFound'))
  }, [token])

  const submit = async () => {
    setError('')
    if (!agreed) { setError('Please tick the declaration to confirm it.'); return }
    if (!signedName.trim()) { setError('Please type your full name.'); return }
    if (!signature) { setError('Please sign in the box.'); return }
    setSubmitting(true)
    try {
      await signBaptismDeclaration(token, { signatureDataUrl: signature, signedName })
      setState('signed')
    } catch {
      setError('Could not submit. The link may have expired. Please contact the church office.')
    } finally {
      setSubmitting(false)
    }
  }

  const shell = (children) => (
    <div className="min-h-screen bg-slate-100 py-6 px-4">
      <div className="max-w-[560px] mx-auto bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">{children}</div>
    </div>
  )
  if (state === 'loading') return shell(<p className="p-10 text-center text-slate-400 text-sm">Loading…</p>)
  if (state === 'notFound') return shell(
    <div className="p-10 text-center">
      <p className="text-lg font-bold text-slate-800">This link isn't available</p>
      <p className="text-sm text-slate-500 mt-2">It may have expired or been withdrawn. Please contact the church office for a new link.</p>
    </div>
  )

  return shell(<>
    <div className="bg-[#1e3a5f] px-5 py-5 text-white">
      <p className="text-[11px] font-black tracking-[0.08em] text-blue-200">River of Life Christian Church, Bangalore</p>
      <h1 className="text-xl font-extrabold mt-1">{BAPTISM_DECLARATION_TITLE}</h1>
      {req?.candidateName && <p className="text-sm text-blue-100 mt-1">{req.candidateName}</p>}
    </div>

    {state === 'signed' ? (
      <div className="p-6 text-center space-y-3">
        <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl">✓</div>
        <p className="text-lg font-bold text-slate-800">Declaration signed</p>
        <p className="text-sm text-slate-500">Thank you. The church office has received your baptism self-declaration.</p>
      </div>
    ) : (
      <div className="p-5 space-y-5">
        <label className={`flex items-start gap-3 rounded-xl border px-4 py-4 cursor-pointer ${agreed ? 'border-emerald-300 bg-emerald-50/60' : 'border-amber-300 bg-amber-50'}`}>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 w-5 h-5 accent-emerald-600 flex-shrink-0" />
          <span className="text-[15px] text-slate-800 leading-relaxed">“{BAPTISM_SELF_DECLARATION_TEXT}”</span>
        </label>

        <label className="block">
          <span className="block text-xs font-semibold text-slate-600 mb-1.5">Full name</span>
          <input value={signedName} onChange={(e) => setSignedName(e.target.value)} autoComplete="name"
            className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
        </label>

        <div>
          <span className="block text-xs font-semibold text-slate-600 mb-1.5">Signature</span>
          <SignaturePad onChange={setSignature} />
        </div>

        <p className="text-xs text-slate-500">Date: <b className="text-slate-700">{fmtDate(new Date())}</b> (recorded when you submit)</p>

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <button type="button" disabled={submitting} onClick={submit}
          className="w-full min-h-[48px] rounded-xl bg-[#1e3a5f] text-white font-bold text-sm hover:bg-[#16304f] disabled:opacity-60">
          {submitting ? 'Submitting…' : 'Sign and Submit Declaration'}
        </button>
      </div>
    )}
  </>)
}
