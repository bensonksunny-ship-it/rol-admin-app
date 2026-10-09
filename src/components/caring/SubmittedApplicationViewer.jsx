import { createPortal } from 'react-dom'
import { APPLICATION_TYPES, applicationStatus, eventForApplication } from '../../utils/pastoralApplications'

const fmtStamp = (d) => {
  const dt = d instanceof Date ? d : d ? new Date(d) : null
  return dt && !isNaN(dt.getTime()) ? dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
}

/** Read-only view of exactly what an applicant submitted — fields, photo, signature, timestamp. */
export default function SubmittedApplicationViewer({ type, app, events, onClose, footer = null }) {
  const t = APPLICATION_TYPES[type]
  if (!t || !app) return null
  const status = applicationStatus(app, events)
  const ev = eventForApplication(app, events)
  const declaration = t.declaration(app)
  const docs = Object.entries(app.documents || {}).filter(([, v]) => v)

  return createPortal(
    <div className="fixed inset-0 z-[85] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-[600px] max-h-[92vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-5 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.label}</p>
            <p className="font-bold text-slate-800 truncate">{t.title(app) || '—'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-lg text-slate-500">×</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`font-bold px-2.5 py-0.5 rounded-full border ${status.cls}`}>{status.label}</span>
            {app.formId && <span className="font-bold text-slate-700 border border-slate-300 rounded-md px-2 py-0.5">{app.formId}</span>}
            <span className="text-slate-500">Submitted {fmtStamp(app.submittedAt) || '—'}</span>
            {ev && <span className="text-slate-500">· Event: {ev.batchCode || ev.title || ev.type} ({ev.date})</span>}
          </div>

          {app.photoDataUrl && <img src={app.photoDataUrl} alt="Applicant" className="w-24 h-28 object-cover rounded-lg border border-slate-200" />}

          {t.sections(app).map((s) => (
            <section key={s.title}>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-500 border-b border-slate-200 pb-1">{s.title}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 mt-2">
                {s.rows.map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
                    <p className="text-sm text-slate-800 break-words">{String(value ?? '').trim() || '—'}</p>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {docs.length > 0 && (
            <section>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-500 border-b border-slate-200 pb-1">Documents</p>
              <ul className="mt-2 text-sm text-slate-700 list-disc pl-5">{docs.map(([k, v]) => <li key={k}>{k}: {typeof v === 'string' ? v : '✓ provided'}</li>)}</ul>
            </section>
          )}

          {declaration && <p className="text-sm text-slate-700 italic bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">{declaration}</p>}
          {app.signatureDataUrl && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Signature</p>
              <img src={app.signatureDataUrl} alt="Applicant signature" className="max-h-20 mt-1 border-b border-slate-300" />
            </div>
          )}
          {app.officeNotes && (
            <p className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2"><b>Office notes:</b> {app.officeNotes}</p>
          )}

          <div className="flex flex-wrap gap-2">
            {t.print && <button type="button" onClick={() => t.print(app)} className="min-h-[40px] px-4 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">Print / PDF</button>}
            {footer}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
