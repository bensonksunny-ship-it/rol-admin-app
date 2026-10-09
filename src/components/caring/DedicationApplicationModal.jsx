import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'
import {
  createDedicationApplication, subscribeDedicationApplicationsForEntry, updateDedicationApplication,
  deleteDedicationApplication, getDedicationSecretName,
} from '../../services/firestore'
import {
  DEDICATION_PARENT_FIELDS, DEDICATION_BABY_FIELDS, dedicationFieldValue, dedicationDisplayName, hasValue,
} from '../../constants/dedicationForm'

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''

// PCS → "+ Baby Dedication Application": opens straight onto a QR code for the
// parents' phone (the application is created on open), then shows what they
// submitted. A surprise name stays hidden here unless the viewer may reveal it.
export default function DedicationApplicationModal({ entry, prefill, userEmail, canReveal, onClose }) {
  const [apps, setApps] = useState(null)
  const [creating, setCreating] = useState(false)
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [revealed, setRevealed] = useState('') // surprise name fetched for this viewer only
  const [error, setError] = useState('')
  const [loadNote, setLoadNote] = useState('')

  useEffect(() => subscribeDedicationApplicationsForEntry(entry.id, setApps, (err) => {
    setApps([])
    setLoadNote(err?.code === 'permission-denied'
      ? 'Earlier applications could not be checked: the database rules for this form are not deployed yet.'
      : 'Earlier applications could not be checked right now.')
  }), [entry.id])

  const app = apps?.[0] || null
  const link = app ? `${window.location.origin}/dedication-apply?token=${app.id}` : ''
  const expired = app && app.status === 'pending' && app.expiresAt && app.expiresAt < new Date()

  useEffect(() => {
    if (!link) { setQr(''); return }
    QRCode.toDataURL(link, { width: 640, margin: 1, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(''))
  }, [link])
  useEffect(() => { setNotes(app?.officeNotes || ''); setRevealed('') }, [app?.id, app?.officeNotes])

  const create = async () => {
    setError('')
    setCreating(true)
    try {
      await createDedicationApplication({ pcsEntryId: entry.id, visitorId: entry.visitorId, personId: entry.personId, prefill }, userEmail)
    } catch (e) {
      console.error('createDedicationApplication', e)
      setError('Could not create the application. Please try again.')
    } finally { setCreating(false) }
  }

  // No input step: an application is created as soon as the modal opens.
  const autoCreated = useRef(false)
  useEffect(() => {
    if (apps === null || apps.length > 0 || loadNote || autoCreated.current) return
    autoCreated.current = true
    create()
  }, [apps, loadNote]) // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { window.prompt('Copy this link:', link) }
  }
  const reveal = async () => {
    setError('')
    try {
      const name = await getDedicationSecretName(app.id)
      if (name) setRevealed(name)
      else setError('The confidential name could not be read.')
    } catch { setError('The confidential name could not be read.') }
  }
  const withdraw = async () => {
    if (!window.confirm(`Withdraw this dedication application? The QR link stops working.`)) return
    try { await deleteDedicationApplication(app.id) } catch { setError('Could not withdraw.') }
  }
  const startNew = () => {
    if (!window.confirm(`Start a new dedication application for ${entry.name}? (e.g. for another child)`)) return
    create()
  }

  const surpriseHidden = app?.isSurpriseName && !app?.revealed

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Baby dedication application — ${entry.name}`}
        className="w-full sm:max-w-[560px] max-h-[92dvh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-[#0f766e] text-white px-5 py-4 flex items-center gap-3">
          <p className="flex-1 min-w-0 font-bold truncate">Baby Dedication Application - {entry.name}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center text-lg">×</button>
        </div>

        <div className="p-5 space-y-4">
          {(apps === null || (!app && creating)) ? (
            <p className="text-sm text-slate-400 text-center py-6">{apps === null ? 'Loading…' : 'Preparing the QR code…'}</p>
          ) : !app ? (
            <div className="text-center py-2">
              <button type="button" disabled={creating} onClick={create} className="min-h-[44px] px-5 rounded-xl bg-[#0f766e] text-white text-sm font-bold disabled:opacity-60">
                {creating ? 'Creating…' : 'Create Application & QR'}
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${expired ? 'bg-red-100 text-red-700 border-red-200' : app.status === 'submitted' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-800 border-amber-200'}`}>
                  {expired ? 'Link expired' : app.status === 'submitted' ? `Submitted ${fmt(app.submittedAt)}` : 'Waiting for parents'}
                </span>
                {app.status === 'pending' && !expired && <span className="text-xs text-slate-400">Link valid till {fmt(app.expiresAt)}</span>}
              </div>

              {app.status === 'pending' && (
                <div className="flex flex-col items-center gap-3">
                  {qr ? <img src={qr} alt="Baby dedication application QR code" className="w-56 h-56 rounded-xl border border-slate-200" /> : <div className="w-56 h-56 rounded-xl bg-slate-100" />}
                  <p className="text-sm text-slate-600 text-center">Scan this QR code on {entry.name}'s phone to fill in the baby's details and submit the application.</p>
                  <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button type="button" onClick={copy} className="min-h-[40px] rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50">{copied ? 'Copied ✓' : 'Copy Application Link'}</button>
                    <a href={link} target="_blank" rel="noreferrer" className="min-h-[40px] rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center justify-center">Open Application in New Tab</a>
                    {qr
                      ? <a href={qr} download={`dedication-${entry.name.replace(/[^\w-]+/g, '-')}-qr.png`} className="min-h-[40px] rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center justify-center">Download QR Code</a>
                      : <span />}
                  </div>
                  {expired && <button type="button" onClick={() => updateDedicationApplication(app.id, { expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }).catch(() => setError('Could not extend the link.'))} className="text-xs font-bold text-amber-700">Extend link by 30 days</button>}
                </div>
              )}

              {app.status === 'submitted' && (
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                  <div className="p-3">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Child</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-slate-800">{revealed || dedicationDisplayName(app)}</p>
                      {surpriseHidden && !revealed && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">🔒 Surprise name</span>}
                      {surpriseHidden && canReveal && !revealed && (
                        <button type="button" onClick={reveal} className="text-xs font-bold text-violet-700 hover:underline">Reveal Confidential Name</button>
                      )}
                      {revealed && <span className="text-[10px] font-semibold text-violet-700">Visible only to you, until the service</span>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 p-3">
                    {[...DEDICATION_PARENT_FIELDS, ...DEDICATION_BABY_FIELDS].map((f) => (
                      <div key={f.key} className={`min-w-0 ${f.wide ? 'col-span-2' : ''}`}>
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{f.label}</p>
                        <p className="text-sm text-slate-800 break-words">{(f.type === 'date' ? fmt(dedicationFieldValue(app, f.key)) : dedicationFieldValue(app, f.key)) || '—'}</p>
                      </div>
                    ))}
                  </div>
                  <p className="p-3 text-xs text-slate-500">Add this child to a Baby Dedication event in Caring → Events. {surpriseHidden ? 'The name is revealed automatically when that event is marked Completed.' : ''}</p>
                </div>
              )}

              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Office notes</span>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm resize-none" />
              </label>
              {notes !== (app.officeNotes || '') && (
                <button type="button" disabled={saving} onClick={async () => {
                  setSaving(true)
                  try { await updateDedicationApplication(app.id, { officeNotes: notes }) } catch { setError('Could not save notes.') }
                  setSaving(false)
                }} className="px-4 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold disabled:opacity-60">{saving ? 'Saving…' : 'Save notes'}</button>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button type="button" onClick={withdraw} className="px-4 min-h-[40px] rounded-xl border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50">Withdraw</button>
                <button type="button" disabled={creating} onClick={startNew} className="text-xs font-semibold text-slate-500 hover:text-slate-700">{creating ? 'Creating…' : '+ New application (another child)'}</button>
              </div>
            </>
          )}
          {loadNote && <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">{loadNote}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {app && hasValue(app.revealedBy) && <p className="text-[11px] text-slate-400">Name revealed after the service by {app.revealedBy}.</p>}
        </div>
      </div>
    </div>,
    document.body
  )
}
