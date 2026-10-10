import { useState } from 'react'
import { purgeMembershipIdProof } from '../../services/firestore'
import { membershipFullName } from '../../constants/membershipForm'

const fmt = (d) => {
  const dt = d ? new Date(d) : null
  return dt && !isNaN(dt.getTime()) ? dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
}

/** Save the image locally and open a print window (best effort: pop-ups may be blocked). */
function downloadAndPrint(url, name) {
  const a = document.createElement('a')
  a.href = url
  a.download = `ID Card - ${name || 'applicant'}.jpg`
  document.body.appendChild(a)
  a.click()
  a.remove()
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(`<!doctype html><title>ID Card - ${String(name || '').replace(/[<>&]/g, '')}</title>
    <body style="margin:0;display:flex;justify-content:center;align-items:flex-start">
    <img src="${url}" style="max-width:100%;max-height:100vh" onload="setTimeout(function(){window.print()},200)"></body>`)
  w.document.close()
}

/**
 * Uploaded ID card (Stage 4 item 2, Stage 8, the application view): view it, then
 * "⬇ Download & Print ID Card" saves/prints it and only then deletes the stored
 * copy (purgeMembershipIdProof), leaving "Downloaded & Printed (Deleted from
 * Storage - date)". Until that button is used the file stays, at every stage.
 * `indent` lines it up under a checklist item.
 */
export default function IdProofAttachment({ application, by, canPurge, indent = true }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const att = application?.attachments || {}
  const url = application?.documents?.idProof || ''
  const pad = indent ? 'pl-7 pr-1 pb-1' : ''
  const purgedAt = att.idProofDownloadedAt || att.idProofPurgedAt

  // A newer upload (e.g. a revision after an earlier purge) shows again.
  if (!url && att.idProofDeletedFromStorage) {
    return (
      <div className={pad}>
        <span className="inline-flex text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
          Downloaded &amp; Printed (Deleted from Storage{purgedAt ? ` - ${fmt(purgedAt)}` : ''})
        </span>
      </div>
    )
  }
  if (typeof url !== 'string' || !url) return null

  const run = async () => {
    if (!window.confirm('Download and print the ID card, then permanently delete the stored copy? Keep the printed copy on file.')) return
    setBusy(true); setError('')
    try {
      downloadAndPrint(url, membershipFullName(application))
      await purgeMembershipIdProof(application.id, url, by)
    } catch (e) {
      console.error('purgeMembershipIdProof', e)
      setError('The ID card was downloaded, but the stored copy could not be deleted. Please try again.')
    }
    setBusy(false)
  }

  return (
    <div className={`${pad} space-y-1.5`}>
      <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs font-medium text-indigo-700 hover:underline">
        <img src={url} alt="ID card" className="w-14 h-10 object-cover rounded border border-slate-200" /> View uploaded ID card
      </a>
      {canPurge && (
        <button type="button" disabled={busy} onClick={run}
          className="block text-xs font-semibold px-3 py-1.5 rounded-lg border border-indigo-300 text-indigo-700 bg-white hover:bg-indigo-50 disabled:opacity-50">
          {busy ? 'Working…' : '⬇ Download & Print ID Card'}
        </button>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
