import { useEffect, useState } from 'react'
import { subscribeBaptismDeclarationsForEntry, requestMembershipDeclaration } from '../../services/firestore'
import { membershipWaterBaptism } from '../../constants/membershipForm'

const fmt = (d) => {
  const dt = d ? new Date(d) : null
  return dt && !isNaN(dt.getTime()) ? dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
}

/**
 * Stage 4 Verification → item 3 (baptism certificate / self-declaration):
 *  - self-declaration ticked on the membership application → "✔ Self-Declaration
 *    signed on application form (date)", and the item ticks itself (onDeclared)
 *  - certificate uploaded (older applications) → link; handed over → note
 *  - otherwise → "Send Baptism Self-Declaration Request": reopens the SAME
 *    membership application link for just the declaration. While it waits, the
 *    application is 'declaration_requested', so the pipeline shows Stage 3 again.
 * Declarations signed through the older separate link still show as received.
 */
export default function BaptismProofStatus({ entry, application, requestedBy, canRequest, onDeclared }) {
  const [legacyRequests, setLegacyRequests] = useState([])
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null) // { kind: 'ok' | 'error', text }
  const showToast = (kind, text) => { setToast({ kind, text }); setTimeout(() => setToast(null), 5000) }

  useEffect(() => subscribeBaptismDeclarationsForEntry(entry.id, setLegacyRequests, () => setLegacyRequests([])), [entry.id])

  const wb = membershipWaterBaptism(application)
  const formDeclared = !!wb?.selfDeclarationSigned
  const legacySigned = entry.membershipPipeline?.baptismSelfDeclaration?.isDeclared
    ? entry.membershipPipeline.baptismSelfDeclaration
    : legacyRequests.find((r) => r.status === 'signed')
  const declared = formDeclared || !!legacySigned
  const certImage = application?.documents?.baptismCertificate || ''
  const certHandedOver = application?.applicant?.hasSubmittedPhysicalBaptismCertificate === true

  useEffect(() => { if (declared) onDeclared?.() }, [declared]) // eslint-disable-line react-hooks/exhaustive-deps

  const request = async () => {
    if (!application?.id) return
    if (!window.confirm(`Send the baptism self-declaration to ${entry.name}? Their membership application goes back to them (same link) and shows as Stage 3 until they tick the declaration.`)) return
    setBusy(true)
    try {
      await requestMembershipDeclaration(application.id, requestedBy)
      showToast('ok', `Declaration requested. ${entry.name} can open the same membership application link to sign it.`)
    } catch (err) {
      console.error('requestMembershipDeclaration', err)
      showToast('error', err?.code === 'permission-denied'
        ? "You don't have permission to send this request. Ask the Caring team, or sign out and back in if your role was just changed."
        : 'Could not send the request. Please try again.')
    } finally { setBusy(false) }
  }

  return (
    <div className="pl-7 pr-1 pb-1 space-y-1.5">
      {certImage && (
        <a href={certImage} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs font-medium text-indigo-700 hover:underline">
          <img src={certImage} alt="Baptism certificate" className="w-10 h-10 object-cover rounded border border-slate-200" /> View uploaded baptism certificate
        </a>
      )}
      {!certImage && certHandedOver && !declared && (
        <p className="text-xs text-slate-600">Applicant says the baptism certificate was handed over. Check it was received and is valid.</p>
      )}

      {formDeclared ? (
        <span className="inline-flex text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
          ✔ Self-Declaration signed on application form{wb.signedAt ? ` (${fmt(wb.signedAt)})` : ''}
        </span>
      ) : legacySigned ? (
        <span className="inline-flex text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
          ✔ Self-Declaration Received{legacySigned.declaredAt ? ` (${fmt(legacySigned.declaredAt)})` : ''}
        </span>
      ) : canRequest && application?.id ? (
        <button type="button" disabled={busy} onClick={request}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium underline mt-1 block cursor-pointer disabled:opacity-50">
          {busy ? 'Sending…' : '[ Send Baptism Self-Declaration Request to Applicant ]'}
        </button>
      ) : null}
      {toast && (
        <div role="status" className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[95] max-w-[90vw] px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium ${toast.kind === 'error' ? 'bg-rose-600 text-white' : 'bg-slate-900 text-white'}`}>
          {toast.text}
        </div>
      )}
    </div>
  )
}
