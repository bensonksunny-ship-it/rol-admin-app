import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { requestBaptismSelfDeclaration, subscribeBaptismDeclarationsForEntry } from '../../services/firestore'
import { BAPTISM_SELF_DECLARATION_TEXT } from '../../constants/baptismDeclaration'

const fmt = (d) => {
  const dt = d ? new Date(d) : null
  return dt && !isNaN(dt.getTime()) ? dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
}

/**
 * Stage 4 Verification → item 3 (baptism certificate / self-declaration):
 *  - certificate uploaded → link to it; handed over → note
 *  - self-declaration signed → "✔ Self-Declaration Received (date)"
 *  - otherwise → "Send Baptism Self-Declaration Request" (QR + link for the candidate)
 * Calls onDeclared() once a signed declaration is known, so the item can be ticked.
 */
export default function BaptismProofStatus({ entry, application, requestedBy, canRequest, onDeclared }) {
  const [requests, setRequests] = useState([])
  const [busy, setBusy] = useState(false)
  const [showLink, setShowLink] = useState(false)
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => subscribeBaptismDeclarationsForEntry(entry.id, setRequests, () => setRequests([])), [entry.id])

  // The pipeline record is written by the Cloud Function; the signed request doc is
  // the same fact, seen a moment earlier.
  const pipelineDecl = entry.membershipPipeline?.baptismSelfDeclaration
  const signedReq = requests.find((r) => r.status === 'signed')
  const declaredAt = pipelineDecl?.isDeclared ? pipelineDecl.declaredAt : signedReq?.declaredAt
  const declared = !!(pipelineDecl?.isDeclared || signedReq)
  const pending = requests.find((r) => r.status === 'pending' && r.expiresAt && r.expiresAt > new Date())
  const link = pending ? `${window.location.origin}/baptism-declaration?token=${pending.id}` : ''

  const certImage = application?.documents?.baptismCertificate || ''
  const certHandedOver = application?.applicant?.hasSubmittedPhysicalBaptismCertificate === true

  useEffect(() => { if (declared) onDeclared?.() }, [declared]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!link) { setQr(''); return }
    QRCode.toDataURL(link, { width: 480, margin: 1 }).then(setQr).catch(() => setQr(''))
  }, [link])

  const request = async () => {
    setError('')
    setBusy(true)
    try {
      await requestBaptismSelfDeclaration(entry, { requestedBy, declarationText: BAPTISM_SELF_DECLARATION_TEXT })
      setShowLink(true)
    } catch (err) {
      console.error('requestBaptismSelfDeclaration', err)
      setError(err?.code === 'permission-denied' ? 'Not allowed, or the database rules are not deployed yet.' : 'Could not create the request.')
    } finally { setBusy(false) }
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { window.prompt('Copy this link:', link) }
  }

  return (
    <div className="pl-7 pr-1 pb-1 space-y-1.5">
      {certImage && (
        <a href={certImage} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs font-medium text-indigo-700 hover:underline">
          <img src={certImage} alt="Baptism certificate" className="w-10 h-10 object-cover rounded border border-slate-200" /> View uploaded baptism certificate
        </a>
      )}
      {!certImage && certHandedOver && (
        <p className="text-xs text-slate-600">Applicant says the baptism certificate was handed over. Check it was received.</p>
      )}

      {declared ? (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">✔ Self-Declaration Received{declaredAt ? ` (${fmt(declaredAt)})` : ''}</span>
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">Self-Declaration Signed by Applicant</span>
        </div>
      ) : pending ? (
        <div className="space-y-1.5">
          <p className="text-xs text-amber-800">Self-declaration requested{pending.requestedAt ? ` ${fmt(pending.requestedAt)}` : ''}. Waiting for the applicant to sign.</p>
          <button type="button" onClick={() => setShowLink((v) => !v)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium underline">
            {showLink ? 'Hide link' : 'Show QR / link again'}
          </button>
          {showLink && (
            <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
              {qr ? <img src={qr} alt="Self-declaration QR code" className="w-24 h-24 rounded border border-slate-200 bg-white flex-shrink-0" /> : <div className="w-24 h-24 rounded bg-slate-100 flex-shrink-0" />}
              <div className="min-w-0 space-y-1">
                <p className="text-xs text-slate-600">Ask {entry.name} to scan this on their phone, or send the link.</p>
                <p className="text-[11px] font-mono text-slate-500 break-all">{link}</p>
                <button type="button" onClick={copy} className="text-xs font-semibold text-indigo-700">{copied ? 'Copied ✓' : 'Copy link'}</button>
              </div>
            </div>
          )}
        </div>
      ) : canRequest ? (
        <button type="button" disabled={busy} onClick={request}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium underline mt-1 block cursor-pointer disabled:opacity-50">
          {busy ? 'Creating request…' : '[ Send Baptism Self-Declaration Request to Applicant ]'}
        </button>
      ) : null}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
