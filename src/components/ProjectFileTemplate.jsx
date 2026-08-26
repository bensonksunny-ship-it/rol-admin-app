import { useRef, useState } from 'react'
import { addProjectFileActivity } from '../services/firestore'

const HEADER_BLUE = '#1E4E8C'
const SL_RED = '#E53E3E'
const LEDGER_ROWS_PER_COLUMN = 16

const th = { border: '1.5px solid #000', padding: '2mm', fontSize: '7.5pt', fontWeight: 800, background: '#f1f5f9' }
const td = { border: '1.5px solid #000', padding: '2mm', fontSize: '7.5pt', textAlign: 'center', height: '6mm' }

function formatDisplayDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// One side of the two-column ledger — always renders `rowCount` ruled rows (blank
// ones included) so the printed sheet reads as a real paper ledger page, not a
// list that stops wherever the data happens to end.
function LedgerTable({ rows, startNo, rowCount }) {
  const padded = Array.from({ length: rowCount }, (_, i) => rows[i] || null)
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #000' }}>
      <thead>
        <tr>
          <th style={{ ...th, width: '14%' }}>SL NO</th>
          <th style={th}>Activity</th>
          <th style={{ ...th, width: '28%' }}>Date</th>
        </tr>
      </thead>
      <tbody>
        {padded.map((row, i) => (
          <tr key={i}>
            <td style={td}>{startNo + i}</td>
            <td style={{ ...td, textAlign: 'left' }}>{row?.activity || ''}</td>
            <td style={td}>{row ? formatDisplayDate(row.date) : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Printable office file cover sheet — viewable on screen and downloadable as PDF. */
export default function ProjectFileTemplate({ file, onClose }) {
  const pageRef = useRef(null)
  const [downloading, setDownloading] = useState(false)
  const [addingActivity, setAddingActivity] = useState(false)
  const [activityText, setActivityText] = useState('')
  const [activityDate, setActivityDate] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const activities = file.activities || []
  const rowsPerColumn = Math.max(LEDGER_ROWS_PER_COLUMN, Math.ceil(activities.length / 2))
  const left = activities.slice(0, rowsPerColumn)
  const right = activities.slice(rowsPerColumn, rowsPerColumn * 2)

  async function handleAddActivity(e) {
    e.preventDefault()
    if (!activityText.trim()) { setError('Activity is required.'); return }
    setError('')
    setSaving(true)
    try {
      await addProjectFileActivity(file.id, activities, {
        slNo: String(activities.length + 1),
        activity: activityText.trim(),
        date: activityDate,
      })
      setActivityText('')
      setAddingActivity(false)
    } catch {
      setError('Failed to add activity. Please try again.')
    }
    setSaving(false)
  }

  const handleDownloadPdf = async () => {
    if (!pageRef.current) return
    setDownloading(true)
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF('p', 'mm', 'a4')
      await new Promise((resolve) => {
        doc.html(pageRef.current, {
          callback: (d) => {
            d.save(`${(file.fileName || 'project-file').replace(/[^\w-]+/g, '_')}.pdf`)
            resolve()
          },
          x: 0,
          y: 0,
          width: 210,
          windowWidth: 794,
          autoPaging: false,
        })
      })
    } catch {
      setError('Failed to generate PDF.')
    }
    setDownloading(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex flex-col overflow-y-auto py-6 px-4">
      {/* Toolbar */}
      <div className="w-full max-w-[210mm] mx-auto mb-4 flex items-center justify-between flex-shrink-0 gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-xl bg-white/95 text-slate-700 text-sm font-semibold hover:bg-white transition-colors shadow-sm"
        >
          ← Close
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAddingActivity((v) => !v)}
            className="px-4 py-2 rounded-xl bg-white/95 text-slate-700 text-sm font-semibold hover:bg-white transition-colors shadow-sm"
          >
            + Add Activity
          </button>
          <button
            type="button"
            disabled={downloading}
            onClick={handleDownloadPdf}
            className="px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-colors shadow-sm"
            style={{ background: HEADER_BLUE }}
          >
            {downloading ? 'Generating PDF…' : '⬇ Download as PDF'}
          </button>
        </div>
      </div>

      {addingActivity && (
        <form onSubmit={handleAddActivity} className="w-full max-w-[210mm] mx-auto mb-4 bg-white rounded-xl shadow-sm p-4 flex flex-wrap items-end gap-3 flex-shrink-0">
          <label className="text-xs font-medium text-slate-500 flex-1 min-w-[200px]">
            Activity
            <input
              type="text"
              autoFocus
              value={activityText}
              onChange={(e) => setActivityText(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
            />
          </label>
          <label className="text-xs font-medium text-slate-500">
            Date
            <input
              type="date"
              value={activityDate}
              onChange={(e) => setActivityDate(e.target.value)}
              className="mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Add'}
          </button>
          {error && <p className="w-full text-xs font-medium text-red-600">{error}</p>}
        </form>
      )}

      {/* A4-styled printable sheet */}
      <div
        ref={pageRef}
        className="mx-auto bg-white shadow-2xl overflow-hidden flex flex-col"
        style={{ width: '210mm', minHeight: '297mm', fontFamily: 'system-ui, -apple-system, sans-serif' }}
      >
        <div style={{ background: HEADER_BLUE, padding: '6mm 12mm', color: 'white' }}>
          <p style={{ fontSize: '7.5pt', letterSpacing: '0.05em', margin: 0, fontWeight: 600, lineHeight: 1.4 }}>
            RIVER OF LIFE CHRISTIAN CHURCH OFFICE PROJECT FILE REGULATED BY THE OFFICE OF THE SENIOR PASTOR
          </p>
          <h1 style={{ fontSize: '18pt', fontWeight: 800, margin: '2mm 0 0' }}>{file.fileName || 'Untitled File'}</h1>
        </div>

        <div style={{ padding: '4mm 12mm', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '10pt', fontWeight: 800, letterSpacing: '0.1em', color: '#1e293b' }}>ROLCC</span>
          <span style={{ fontSize: '10pt', fontWeight: 700, color: SL_RED }}>SL No: {file.slNo || '—'}</span>
        </div>

        <div style={{ padding: '5mm 12mm' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5mm' }}>
            <LedgerTable rows={left} startNo={1} rowCount={rowsPerColumn} />
            <LedgerTable rows={right} startNo={rowsPerColumn + 1} rowCount={rowsPerColumn} />
          </div>
        </div>

        <div style={{ height: '6mm', background: HEADER_BLUE, marginTop: 'auto' }} />
      </div>
    </div>
  )
}
