import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'
import {
  createMembershipApplication, subscribeMembershipApplicationsForEntry, updateMembershipApplication, deleteMembershipApplication,
} from '../../services/firestore'
import {
  MEMBERSHIP_PREFILL_FIELDS, MEMBERSHIP_APPLICANT_FIELDS, MEMBERSHIP_DOCUMENTS, MEMBERSHIP_DECISIONS,
  membershipFieldValue, membershipFullName, hasValue,
} from '../../constants/membershipForm'
import { openMembershipFormPrint } from '../../utils/membershipFormPrint'

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''

const STATUS_CLS = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  submitted: 'bg-blue-100 text-blue-800 border-blue-200',
  approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
}

// PCS → Membership → "Generate QR Code for Applicant": creates a pre-filled
// membership application, shows its QR / link for the applicant's phone, and once
// it comes back lets Caring review it, record the Pastoral decision and print the
// A4 paper-form layout for filing.
// `baptismBlockedMessage` — set when the person has no recorded baptism: creating a
// new application is refused with that message (existing ones stay viewable).
export default function MembershipApplicationModal({ entry, prefill, userName, userEmail, onClose, baptismBlockedMessage = '' }) {
  const [apps, setApps] = useState(null)
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loadNote, setLoadNote] = useState('')

  useEffect(() => subscribeMembershipApplicationsForEntry(entry.id, setApps, (err) => {
    setApps([])
    setLoadNote(err?.code === 'permission-denied'
      ? 'Earlier applications could not be checked: the database rules for this form are not deployed yet. Generating a QR code will fail until they are.'
      : 'Earlier applications could not be checked right now. You can still generate a QR code.')
  }), [entry.id])

  const app = apps?.[0] || null
  const link = app ? `${window.location.origin}/membership-apply?token=${app.id}` : ''
  const expired = app && app.status === 'pending' && app.expiresAt && app.expiresAt < new Date()

  useEffect(() => {
    if (!link) { setQr(''); return }
    QRCode.toDataURL(link, { width: 640, margin: 1, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(''))
  }, [link])
  useEffect(() => { setNotes(app?.officeNotes || '') }, [app?.id, app?.officeNotes])

  const create = async () => {
    setError('')
    if (baptismBlockedMessage) { setError(baptismBlockedMessage); return }
    setCreating(true)
    try {
      await createMembershipApplication({ pcsEntryId: entry.id, visitorId: entry.visitorId, personId: entry.personId, prefill }, userEmail)
      setShowCreate(false)
    } catch (e) {
      console.error('createMembershipApplication', e)
      setError('Could not create the application. The database rules may not be deployed yet.')
    } finally { setCreating(false) }
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { window.prompt('Copy this link:', link) }
  }
  const save = async (data, failMsg) => {
    setSaving(true)
    try { await updateMembershipApplication(app.id, data) } catch { setError(failMsg) }
    setSaving(false)
  }
  const extend = () => save({ expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }, 'Could not extend the link.')
  const decide = (status) => {
    const label = MEMBERSHIP_DECISIONS[status]
    if (!window.confirm(`Mark this membership application as "${label}"?`)) return
    save({ status, decidedBy: userName || userEmail || '', decidedAt: new Date(), officeNotes: notes }, 'Could not save the decision.')
  }
  const withdraw = async () => {
    if (!window.confirm('Withdraw this membership application? The QR link stops working.')) return
    try { await deleteMembershipApplication(app.id) } catch { setError('Could not withdraw.') }
  }

  const missing = MEMBERSHIP_PREFILL_FIELDS.filter((f) => f.required && !hasValue(prefill?.[f.key]))
  const statusLabel = !app ? '' : expired ? 'Link expired' : app.status === 'pending' ? 'Waiting for applicant' : `${MEMBERSHIP_DECISIONS[app.status] || app.status}${app.submittedAt ? ` · submitted ${fmt(app.submittedAt)}` : ''}`
  const talents = app ? [...(app.applicant?.talents || []), app.applicant?.talentsOther].filter(hasValue) : []

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Membership application — ${entry.name}`}
        className="w-full sm:max-w-[600px] max-h-[92dvh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-[#92400e] text-white px-5 py-4 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200">Membership Application</p>
            <p className="font-bold truncate">{entry.name}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center text-lg">×</button>
        </div>

        <div className="p-5 space-y-4">
          {apps === null ? (
            <p className="text-sm text-slate-400 text-center py-6">Loading…</p>
          ) : (!app || showCreate) ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Creates a membership form pre-filled from this PCS profile. {entry.name} scans the QR code on their phone, fills only what's missing, uploads their documents, signs and submits. The link works for 30 days.
              </p>
              {missing.length > 0 && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  Incomplete PCS profile details: the applicant will be prompted to fill the missing fields ({missing.map(f => f.label).join(', ')}) on their phone.
                </p>
              )}
              <div className="flex gap-2">
                <button type="button" disabled={creating} onClick={create} className="flex-1 min-h-[44px] rounded-xl bg-[#92400e] text-white text-sm font-bold disabled:opacity-60">
                  {creating ? 'Creating…' : 'Generate QR Code for Applicant'}
                </button>
                {app && <button type="button" onClick={() => setShowCreate(false)} className="px-4 rounded-xl border border-slate-300 text-sm font-semibold text-slate-600">Cancel</button>}
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${expired ? 'bg-red-100 text-red-700 border-red-200' : STATUS_CLS[app.status] || STATUS_CLS.pending}`}>{statusLabel}</span>
                {app.status === 'pending' && !expired && <span className="text-xs text-slate-400">Link valid till {fmt(app.expiresAt)}</span>}
                {app.decidedBy && app.status !== 'submitted' && <span className="text-xs text-slate-400">by {app.decidedBy} · {fmt(app.decidedAt)}</span>}
              </div>

              {app.status === 'pending' && (
                <div className="flex flex-col items-center gap-3">
                  {qr ? <img src={qr} alt="Membership application QR code" className="w-56 h-56 rounded-xl border border-slate-200" /> : <div className="w-56 h-56 rounded-xl bg-slate-100" />}
                  <p className="text-xs text-slate-500 text-center">Scan with the applicant's phone camera to open their pre-filled membership form.</p>
                  <div className="w-full flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                    <span className="flex-1 min-w-0 truncate text-xs text-slate-600 font-mono">{link}</span>
                    <button type="button" onClick={copy} className="text-xs font-bold text-blue-700 whitespace-nowrap">{copied ? 'Copied ✓' : 'Copy Link'}</button>
                  </div>
                  {qr && <a href={qr} download={`membership-${entry.name.replace(/[^\w-]+/g, '-')}-qr.png`} className="text-xs font-semibold text-slate-500 hover:text-slate-700">Download QR image</a>}
                  {expired && <button type="button" disabled={saving} onClick={extend} className="text-xs font-bold text-amber-700">Extend link by 30 days</button>}
                </div>
              )}

              {app.status !== 'pending' && (
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                  <div className="flex items-center gap-3 p-3">
                    {app.photoDataUrl && <img src={app.photoDataUrl} alt="" className="w-12 h-14 object-cover rounded border border-slate-200" />}
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800">{membershipFullName(app)}</p>
                      <p className="text-xs text-slate-400">Fields marked “new” were filled in by the applicant.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 p-3">
                    {[...MEMBERSHIP_PREFILL_FIELDS, ...MEMBERSHIP_APPLICANT_FIELDS].map(f => (
                      <div key={f.key} className={`min-w-0 ${f.wide ? 'col-span-2' : ''}`}>
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                          {f.label}{hasValue(app.applicant?.[f.key]) && <span className="ml-1 text-emerald-600">new</span>}
                        </p>
                        <p className="text-sm text-slate-800 break-words whitespace-pre-wrap">{(f.type === 'date' ? fmt(membershipFieldValue(app, f.key)) : membershipFieldValue(app, f.key)) || '—'}</p>
                      </div>
                    ))}
                    <div className="col-span-2">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Talents / Gifts</p>
                      <p className="text-sm text-slate-800">{talents.join(', ') || '—'}</p>
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Documents</p>
                    <div className="flex flex-wrap gap-3">
                      {MEMBERSHIP_DOCUMENTS.map(d => app.documents?.[d.key] ? (
                        <a key={d.key} href={app.documents[d.key]} target="_blank" rel="noreferrer" className="text-center">
                          <img src={app.documents[d.key]} alt={d.label} className="w-20 h-20 object-cover rounded-lg border border-slate-200" />
                          <span className="block text-[10px] text-slate-500 mt-0.5 max-w-20 truncate">{d.label}</span>
                        </a>
                      ) : (
                        <span key={d.key} className="text-xs text-slate-400">{d.label}: not provided</span>
                      ))}
                    </div>
                  </div>
                  {app.signatureDataUrl && <div className="p-3"><img src={app.signatureDataUrl} alt="Signature" className="max-h-16" /></div>}
                </div>
              )}

              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Office notes</span>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm resize-none" />
              </label>
              {notes !== (app.officeNotes || '') && (
                <button type="button" disabled={saving} onClick={() => save({ officeNotes: notes }, 'Could not save notes.')}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold disabled:opacity-60">{saving ? 'Saving…' : 'Save notes'}</button>
              )}

              {/* Pastoral approval — once the applicant has submitted */}
              {app.status !== 'pending' && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={saving || app.status === 'approved'} onClick={() => decide('approved')}
                    className="flex-1 min-h-[44px] rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50">Approve</button>
                  <button type="button" disabled={saving || app.status === 'rejected'} onClick={() => decide('rejected')}
                    className="flex-1 min-h-[44px] rounded-xl border border-red-200 text-red-700 text-sm font-semibold hover:bg-red-50 disabled:opacity-50">Not Approved</button>
                  {app.status !== 'submitted' && (
                    <button type="button" disabled={saving} onClick={() => save({ status: 'submitted', decidedBy: '', decidedAt: null }, 'Could not reopen.')}
                      className="px-4 min-h-[44px] rounded-xl border border-slate-300 text-slate-600 text-sm font-semibold">Back to Under Review</button>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" onClick={() => openMembershipFormPrint({ ...app, officeNotes: notes })} className="flex-1 min-h-[44px] rounded-xl bg-[#1e3a5f] text-white text-sm font-bold">
                  Print / Export PDF
                </button>
                <button type="button" onClick={withdraw} className="px-4 min-h-[44px] rounded-xl border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50">Withdraw</button>
              </div>
              <button type="button" onClick={() => setShowCreate(true)} className="text-xs font-semibold text-slate-500 hover:text-slate-700">+ New application</button>
            </>
          )}
          {loadNote && <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">{loadNote}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </div>,
    document.body
  )
}
