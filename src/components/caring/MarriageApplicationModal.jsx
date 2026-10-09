import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'
import {
  createMarriageApplication, subscribeMarriageApplicationsForEntry, updateMarriageApplication, deleteMarriageApplication,
} from '../../services/firestore'
import useRefreshPendingApplication from '../../hooks/useRefreshPendingApplication'
import {
  MARRIAGE_APPLICANT_FIELDS, MARRIAGE_PARTNER_FIELDS, MARRIAGE_WEDDING_FIELDS,
  marriageFieldValue, marriageCoupleName, marriagePartnerName, hasValue,
} from '../../constants/marriageForm'
import { childDisplayName, childAgeText } from '../../utils/familyDetails'

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
const isDateKey = (key) => [...MARRIAGE_APPLICANT_FIELDS, ...MARRIAGE_PARTNER_FIELDS, ...MARRIAGE_WEDDING_FIELDS].some((f) => f.key === key && f.type === 'date')
const show = (app, key) => { const v = marriageFieldValue(app, key); return v && isDateKey(key) ? fmt(v) : v }

// PCS → "Marriage Application & QR": same flow as the Baptism / Membership modals —
// one click creates a pre-filled application and shows its QR / link; the couple
// fill in partner, wedding and family details on their phone. The office decision
// (Approve & Link to a Marriage event / Reject) happens in the Caring Hub queue.
export default function MarriageApplicationModal({ entry, prefill, userEmail, onClose }) {
  const [apps, setApps] = useState(null)
  const [creating, setCreating] = useState(false)
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [error, setError] = useState('')
  const [loadNote, setLoadNote] = useState('')

  useEffect(() => subscribeMarriageApplicationsForEntry(entry.id, setApps, (err) => {
    setApps([])
    setLoadNote(err?.code === 'permission-denied'
      ? 'Earlier applications could not be checked: the database rules for this form are not deployed yet. Generating a QR code will fail until they are.'
      : 'Earlier applications could not be checked right now. You can still generate a QR code.')
  }), [entry.id])

  const app = apps?.[0] || null
  // A pending link created before this person had a cell stays locked on the QR page — re-stamp it.
  useRefreshPendingApplication(app, prefill, updateMarriageApplication)
  const link = app ? `${window.location.origin}/marriage-apply?token=${app.id}` : ''
  const expired = app && app.status === 'pending' && app.expiresAt && app.expiresAt < new Date()

  useEffect(() => {
    if (!link) { setQr(''); return }
    QRCode.toDataURL(link, { width: 640, margin: 1, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(''))
  }, [link])
  useEffect(() => { setNotes(app?.officeNotes || '') }, [app?.id, app?.officeNotes])

  const create = async () => {
    setError('')
    setCreating(true)
    try {
      await createMarriageApplication({ pcsEntryId: entry.id, visitorId: entry.visitorId, personId: entry.personId, prefill }, userEmail)
    } catch (e) {
      console.error('createMarriageApplication', e)
      setError('Could not create the application. Please try again.')
    } finally { setCreating(false) }
  }

  // Opening the modal for someone with no application creates one right away (once).
  const autoCreated = useRef(false)
  useEffect(() => {
    if (apps === null || apps.length > 0 || loadNote || autoCreated.current) return
    autoCreated.current = true
    create()
  }, [apps, loadNote]) // eslint-disable-line react-hooks/exhaustive-deps

  const startNew = () => {
    if (!window.confirm(`Start a new marriage application for ${entry.name}? The current one stays in the list until withdrawn.`)) return
    create()
  }

  const printQr = () => {
    const win = window.open('', '_blank', 'width=600,height=750')
    if (!win) return
    const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Marriage Application QR — ${esc(entry.name)}</title>
      <style>body{font-family:'Segoe UI',Arial,sans-serif;text-align:center;padding:40px;color:#1e293b}h1{font-size:20px;margin:0 0 6px}p{font-size:14px;color:#475569;max-width:420px;margin:8px auto}img{width:300px;height:300px;margin:18px auto;display:block}</style>
      </head><body><h1>Application for Holy Matrimony</h1><p><b>${esc(entry.name)}</b></p><img src="${qr}" alt=""><p>Scan this QR code on your phone to add your partner, wedding and family details and submit the application.</p><p style="font-size:11px;word-break:break-all">${esc(link)}</p>
      <script>window.onload=function(){window.print()}</script></body></html>`)
    win.document.close()
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { window.prompt('Copy this link:', link) }
  }
  const extend = () => updateMarriageApplication(app.id, { expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }).catch(() => setError('Could not extend the link.'))
  const withdraw = async () => {
    if (!window.confirm(`Withdraw ${entry.name}'s marriage application? The QR link stops working.`)) return
    try { await deleteMarriageApplication(app.id) } catch { setError('Could not withdraw.') }
  }

  const kids = app?.applicant?.family?.children || []
  const row = (label, value) => (
    <div className="min-w-0">
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-sm text-slate-800 break-words">{value || '—'}</p>
    </div>
  )

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-[560px] max-h-[92vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-[#1e3a5f] text-white px-5 py-4 flex items-center gap-3">
          <p className="flex-1 min-w-0 font-bold truncate">Marriage Application - {entry.name}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center text-lg">×</button>
        </div>

        <div className="p-5 space-y-4">
          {(apps === null || (!app && creating)) ? (
            <p className="text-sm text-slate-400 text-center py-6">{apps === null ? 'Loading…' : 'Preparing the QR code…'}</p>
          ) : !app ? (
            <div className="space-y-3 text-center py-2">
              <p className="text-sm text-slate-600">No marriage application yet for {entry.name}.</p>
              <button type="button" disabled={creating} onClick={create} className="min-h-[44px] px-5 rounded-xl bg-[#1e3a5f] text-white text-sm font-bold disabled:opacity-60">
                {creating ? 'Creating…' : 'Create Application & QR'}
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${expired ? 'bg-red-100 text-red-700 border-red-200' : app.status === 'pending' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'}`}>
                  {expired ? 'Link expired' : app.status === 'pending' ? 'Waiting for applicant' : `Submitted ${fmt(app.submittedAt)}`}
                </span>
                {app.status === 'pending' && !expired && <span className="text-xs text-slate-400">Link valid till {fmt(app.expiresAt)}</span>}
              </div>

              {app.status === 'pending' && (
                <div className="flex flex-col items-center gap-3">
                  {qr ? <img src={qr} alt="Marriage application QR code" className="w-56 h-56 rounded-xl border border-slate-200" /> : <div className="w-56 h-56 rounded-xl bg-slate-100" />}
                  <p className="text-sm text-slate-600 text-center">Scan this QR code on {entry.name}'s phone to add partner, wedding and family details and submit.</p>
                  <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button type="button" onClick={copy} className="min-h-[40px] rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50">{copied ? 'Copied ✓' : 'Copy Application Link'}</button>
                    <a href={link} target="_blank" rel="noreferrer" className="min-h-[40px] rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center justify-center">Open Application in New Tab</a>
                    <button type="button" disabled={!qr} onClick={printQr} className="min-h-[40px] rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Print / Download QR Code</button>
                  </div>
                  {expired && <button type="button" onClick={extend} className="text-xs font-bold text-amber-700">Extend link by 30 days</button>}
                </div>
              )}

              {app.status !== 'pending' && (
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                  <div className="flex items-center gap-3 p-3">
                    {app.photoDataUrl && <img src={app.photoDataUrl} alt="" className="w-12 h-14 object-cover rounded border border-slate-200" />}
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800">{marriageCoupleName(app)}</p>
                      <p className="text-xs text-slate-400">Decision: Caring Hub → Applications &amp; Form Requests.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 p-3">
                    {row('Partner', marriagePartnerName(app))}
                    {MARRIAGE_PARTNER_FIELDS.map(f => <div key={f.key}>{row(f.label, show(app, f.key))}</div>)}
                    {MARRIAGE_WEDDING_FIELDS.filter(f => hasValue(marriageFieldValue(app, f.key)) || f.required).map(f => <div key={f.key} className={f.wide ? 'col-span-2' : ''}>{row(f.label, show(app, f.key))}</div>)}
                    {row("Father's Name", show(app, 'fatherName'))}
                    {row("Mother's Name", show(app, 'motherName'))}
                  </div>
                  {kids.length > 0 && (
                    <div className="p-3">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Children</p>
                      <ul className="text-sm text-slate-800 mt-0.5">
                        {kids.map(c => <li key={c.id}>• {childDisplayName(c)}{childAgeText(c) ? ` (${childAgeText(c)})` : ''}</li>)}
                      </ul>
                    </div>
                  )}
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
                  try { await updateMarriageApplication(app.id, { officeNotes: notes }) } catch { setError('Could not save notes.') }
                  setSavingNotes(false)
                }} className="px-4 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold disabled:opacity-60">{savingNotes ? 'Saving…' : 'Save notes'}</button>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" onClick={withdraw} className="px-4 min-h-[44px] rounded-xl border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50">Withdraw</button>
              </div>
              <button type="button" disabled={creating} onClick={startNew} className="text-xs font-semibold text-slate-500 hover:text-slate-700">{creating ? 'Creating…' : '+ New application'}</button>
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
