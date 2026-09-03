import { useState } from 'react'
import { createPortal } from 'react-dom'
import { setProjectFileRemarks } from '../services/firestore'

const REMARKS_OPTIONS = ['Active', 'Project Completed', 'Project Withheld', 'Archived']

const REMARKS_STYLES = {
  'Active': 'bg-indigo-50 text-indigo-700',
  'Project Completed': 'bg-emerald-50 text-emerald-700',
  'Project Withheld': 'bg-amber-50 text-amber-700',
  'Archived': 'bg-slate-100 text-slate-600',
}

function formatDisplayDate(d) {
  if (!d || Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// The SL number IS the file's start date: <D|DD><MM><YYYY><running no.> — e.g.
// 6032026138 / 06032026138 both mean 6 March 2026. That's the office's own
// numbering and the authoritative "file started" date, so it comes first;
// the Firestore createdAt timestamp is only a fallback when the SL number
// can't be parsed as a date.
function deriveStartDate(file) {
  const slNo = String(file.slNo || '')
  for (const re of [/^(\d{2})(\d{2})(\d{4})/, /^(\d)(\d{2})(\d{4})/]) {
    const m = slNo.match(re)
    if (!m) continue
    const day = Number(m[1]); const month = Number(m[2]); const year = Number(m[3])
    if (month < 1 || month > 12 || day < 1 || day > 31) continue
    const d = new Date(year, month - 1, day)
    if (!Number.isNaN(d.getTime())) return d
  }
  const ts = file.createdAt
  if (ts && typeof ts.toDate === 'function') {
    const d = ts.toDate()
    if (!Number.isNaN(d.getTime())) return d
  }
  return null
}

function daysBetween(start, end) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000))
}

/** File Detail sheet — days open, quick status change, activity summary, face sheet. */
export default function ProjectFileDetail({ file, onClose, onOpenFaceSheet }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const start = deriveStartDate(file)
  const closing = file.closingDate ? new Date(file.closingDate) : null
  let durationLabel
  if (!start) {
    durationLabel = 'Start date unknown'
  } else if (closing && !Number.isNaN(closing.getTime())) {
    durationLabel = `Open ${formatDisplayDate(start)} → ${formatDisplayDate(closing)} · ${daysBetween(start, closing)} days`
  } else {
    durationLabel = `Started ${formatDisplayDate(start)} · ${daysBetween(start, new Date())} days open`
  }

  const activities = file.activities || []
  const lastActivity = activities[activities.length - 1]
  const activityLabel = activities.length
    ? `${activities.length} activit${activities.length === 1 ? 'y' : 'ies'} · last: ${lastActivity.activity} (${formatDisplayDate(lastActivity.date ? new Date(lastActivity.date) : null)})`
    : 'No activities logged yet'

  async function handleStatus(next) {
    if (next === file.remarks || saving) return
    setSaving(true)
    setError('')
    try {
      const extra = next === 'Project Completed' && !file.closingDate
        ? { closingDate: new Date().toISOString().slice(0, 10) }
        : {}
      await setProjectFileRemarks(file.id, next, extra)
    } catch {
      setError('Failed to update status. Please try again.')
    }
    setSaving(false)
  }

  return createPortal(
    <div data-row-menu-overlay="true" className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-bold text-slate-800">{file.fileName || 'Untitled File'}</p>
            <p className="mt-0.5 font-mono text-xs text-slate-500">SL No: {file.slNo || '—'}</p>
          </div>
          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${REMARKS_STYLES[file.remarks] || 'bg-slate-100 text-slate-600'}`}>
            {file.remarks || 'Active'}
          </span>
        </div>

        <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
          {durationLabel}
        </div>

        <div>
          <p className="text-xs font-medium text-slate-500 mb-1.5">Status</p>
          <div className="flex flex-wrap gap-1.5">
            {REMARKS_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                disabled={saving}
                onClick={() => handleStatus(r)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
                  file.remarks === r
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          {error && <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
        </div>

        <div className="text-xs text-slate-500">{activityLabel}</div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() => onOpenFaceSheet(file)}
            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
          >
            🖨 Face Sheet
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
