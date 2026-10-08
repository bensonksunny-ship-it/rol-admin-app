import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'
import {
  createBaptismApplication, subscribeBaptismApplicationsForEntry, updateBaptismApplication, deleteBaptismApplication,
} from '../../services/firestore'
import { baptismFieldValue, visibleBaptismFields, hasValue } from '../../constants/baptismForm'
import { openBaptismFormPrint, applicantFullName } from '../../utils/baptismFormPrint'

const BATCH_KEY = 'rol.baptismBatch'
const readBatch = () => { try { return localStorage.getItem(BATCH_KEY) || '' } catch { return '' } }
const saveBatch = (v) => { try { localStorage.setItem(BATCH_KEY, v) } catch { /* private mode */ } }
const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''

const STATUS_CLS = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  submitted: 'bg-emerald-100 text-emerald-700 border-emerald-200',
}

// PCS → "Baptism Application & QR": creates a pre-filled application for this
// person, shows its QR / link for the applicant's phone, and lets Caring print it
// and add office notes once it comes back.
export default function BaptismApplicationModal({ entry, prefill, userEmail, onClose }) {
  const [apps, setApps] = useState(null)
  const [batch, setBatch] = useState(readBatch)
  const [place, setPlace] = useState('Bangalore')
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [error, setError] = useState('')
  const [loadNote, setLoadNote] = useState('')

  useEffect(() => subscribeBaptismApplicationsForEntry(entry.id, setApps, (err) => {
    setApps([])
    setLoadNote(err?.code === 'permission-denied'
      ? 'Earlier applications could not be checked: the database rules for this form are not deployed yet. Generating a QR code will fail until they are.'
      : 'Earlier applications could not be checked right now. You can still generate a QR code.')
  }), [entry.id])

  const app = apps?.[0] || null
  const link = app ? `${window.location.origin}/baptism-apply?token=${app.id}` : ''
  const expired = app && app.status === 'pending' && app.expiresAt && app.expiresAt < new Date()

  useEffect(() => {
    if (!link) { setQr(''); return }
    QRCode.toDataURL(link, { width: 640, margin: 1, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(''))
  }, [link])
  useEffect(() => { setNotes(app?.officeNotes || '') }, [app?.id, app?.officeNotes])

  const create = async () => {
    setError('')
    if (!batch.trim()) { setError('Enter the baptism batch number.'); return }
    setCreating(true)
    try {
      saveBatch(batch.trim())
      await createBaptismApplication({ pcsEntryId: entry.id, visitorId: entry.visitorId, personId: entry.personId, batch: batch.trim(), place: place.trim(), prefill }, userEmail)
      setShowCreate(false)
    } catch (e) {
      console.error('createBaptismApplication', e)
      setError('Could not create the application. The database rules may not be deployed yet.')
    } finally { setCreating(false) }
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { window.prompt('Copy this link:', link) }
  }

  const extend = () => updateBaptismApplication(app.id, { expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }).catch(() => setError('Could not extend the link.'))
  const withdraw = async () => {
    if (!window.confirm(`Withdraw application ${app.formId}? The QR link stops working.`)) return
    try { await deleteBaptismApplication(app.id) } catch { setError('Could not withdraw.') }
  }

  const fields = app ? visibleBaptismFields(app) : []
  const missing = app ? fields.filter(f => f.required && !hasValue(baptismFieldValue(app, f.key))) : []

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-[560px] max-h-[92vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-[#1e3a5f] text-white px-5 py-4 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-200">Baptism Application</p>
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
                Creates a pre-filled application from this PCS profile. {entry.name} opens it by QR on their phone, fills only what's missing, signs and submits. The link works for 30 days.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Baptism batch no.</span>
                  <input value={batch} onChange={e => setBatch(e.target.value)} placeholder="e.g. 9" className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm" />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Place</span>
                  <input value={place} onChange={e => setPlace(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm" />
                </label>
              </div>
              <p className="text-xs text-slate-400">Form ID becomes B-{batch.trim() || '?'} / next running number.</p>
              <div className="flex gap-2">
                <button type="button" disabled={creating} onClick={create} className="flex-1 min-h-[44px] rounded-xl bg-[#1e3a5f] text-white text-sm font-bold disabled:opacity-60">
                  {creating ? 'Creating…' : 'Generate Application & QR'}
                </button>
                {app && <button type="button" onClick={() => setShowCreate(false)} className="px-4 rounded-xl border border-slate-300 text-sm font-semibold text-slate-600">Cancel</button>}
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-black text-[#1e3a5f] border-2 border-[#1e3a5f] rounded-lg px-2.5 py-0.5">{app.formId}</span>
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${expired ? 'bg-red-100 text-red-700 border-red-200' : STATUS_CLS[app.status] || STATUS_CLS.pending}`}>
                  {expired ? 'Link expired' : app.status === 'submitted' ? `Submitted ${fmt(app.submittedAt)}` : 'Waiting for applicant'}
                </span>
                {app.status === 'pending' && !expired && <span className="text-xs text-slate-400">Link valid till {fmt(app.expiresAt)}</span>}
              </div>

              {app.status === 'pending' && (
                <div className="flex flex-col items-center gap-3">
                  {qr ? <img src={qr} alt="Baptism application QR code" className="w-56 h-56 rounded-xl border border-slate-200" /> : <div className="w-56 h-56 rounded-xl bg-slate-100" />}
                  <p className="text-xs text-slate-500 text-center">Scan with the applicant's phone camera to open their pre-filled form.</p>
                  <div className="w-full flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                    <span className="flex-1 min-w-0 truncate text-xs text-slate-600 font-mono">{link}</span>
                    <button type="button" onClick={copy} className="text-xs font-bold text-blue-700 whitespace-nowrap">{copied ? 'Copied ✓' : 'Copy Link'}</button>
                  </div>
                  {qr && <a href={qr} download={`baptism-${app.formId.replace(/[^\w-]+/g, '')}-qr.png`} className="text-xs font-semibold text-slate-500 hover:text-slate-700">Download QR image</a>}
                  {expired && <button type="button" onClick={extend} className="text-xs font-bold text-amber-700">Extend link by 30 days</button>}
                </div>
              )}

              {missing.length > 0 && app.status === 'pending' && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  Applicant will be asked for: {missing.map(f => f.label).join(', ')}
                </p>
              )}

              {app.status === 'submitted' && (
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                  <div className="flex items-center gap-3 p-3">
                    {app.photoDataUrl && <img src={app.photoDataUrl} alt="" className="w-12 h-14 object-cover rounded border border-slate-200" />}
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800">{applicantFullName(app)}</p>
                      <p className="text-xs text-slate-400">Fields marked “new” were filled by the applicant.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 p-3">
                    {fields.map(f => (
                      <div key={f.key} className={`min-w-0 ${f.wide ? 'col-span-2' : ''}`}>
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                          {f.label}{hasValue(app.applicant?.[f.key]) && <span className="ml-1 text-emerald-600">new</span>}
                        </p>
                        <p className="text-sm text-slate-800 break-words">{baptismFieldValue(app, f.key) || '—'}</p>
                      </div>
                    ))}
                  </div>
                  {app.signatureDataUrl && <div className="p-3"><img src={app.signatureDataUrl} alt="Signature" className="max-h-16" /></div>}
                </div>
              )}

              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Office notes</span>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm resize-none" />
              </label>
              {notes !== (app.officeNotes || '') && (
                <button type="button" disabled={savingNotes} onClick={async () => {
                  setSavingNotes(true)
                  try { await updateBaptismApplication(app.id, { officeNotes: notes }) } catch { setError('Could not save notes.') }
                  setSavingNotes(false)
                }} className="px-4 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold disabled:opacity-60">{savingNotes ? 'Saving…' : 'Save notes'}</button>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" onClick={() => openBaptismFormPrint({ ...app, officeNotes: notes })} className="flex-1 min-h-[44px] rounded-xl bg-[#1e3a5f] text-white text-sm font-bold">
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
