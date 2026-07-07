import { useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { formatDisplayDate } from '../../utils/date'

function formatTime(isoString) {
  try { return format(parseISO(isoString), 'h:mm a') } catch { return isoString }
}

function formatDuration(isoA, isoB) {
  try {
    const ms = parseISO(isoB) - parseISO(isoA)
    if (ms <= 0) return null
    const totalMins = Math.round(ms / 60000)
    const h = Math.floor(totalMins / 60)
    const m = totalMins % 60
    if (h > 0 && m > 0) return `${h}h ${m}m`
    if (h > 0) return `${h}h`
    return `${m}m`
  } catch { return null }
}

const STAT_COLORS = [
  { bg: '#eef2ff', border: '#c7d2fe', text: '#4338ca', dot: '#6366f1' },
  { bg: '#ecfdf5', border: '#a7f3d0', text: '#047857', dot: '#10b981' },
  { bg: '#fffbeb', border: '#fde68a', text: '#b45309', dot: '#f59e0b' },
  { bg: '#fdf2f8', border: '#fbcfe8', text: '#be185d', dot: '#ec4899' },
  { bg: '#f0f9ff', border: '#bae6fd', text: '#0369a1', dot: '#0ea5e9' },
  { bg: '#faf5ff', border: '#e9d5ff', text: '#7e22ce', dot: '#a855f7' },
]

/** A4-styled, printable Sunday report — viewable on screen and downloadable as PDF. */
export default function SundayReportPrintView({ row, cellCols, onClose }) {
  const pageRef = useRef(null)
  const [downloading, setDownloading] = useState(false)

  const sca = row.sundayCellAttendance || {}
  const cellStats = cellCols
    .map((c) => ({ name: c.name, count: (sca[c.id] || []).filter(Boolean).length }))
    .filter((c) => c.count > 0)

  const otherStats = [
    { label: 'Others', value: row.othersCount || 0 },
    { label: 'Non Cell', value: row.nonCellCount || 0 },
    { label: 'Sunday School', value: row.sundaySchool || 0 },
    { label: '2nd Week Attendees', value: row.secondWeekAttendees || 0 },
    { label: 'New Comers', value: row.newcomers || 0 },
  ].filter((s) => s.value > 0)

  const hasTimings = row.programTimings?.length > 0

  const handleDownloadPdf = async () => {
    if (!pageRef.current) return
    setDownloading(true)
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF('p', 'mm', 'a4')
      await new Promise((resolve) => {
        doc.html(pageRef.current, {
          callback: (d) => {
            d.save(`sunday-report-${row.date}.pdf`)
            resolve()
          },
          x: 0,
          y: 0,
          width: 210,
          windowWidth: pageRef.current.scrollWidth,
          autoPaging: 'text',
        })
      })
    } catch (e) {
      console.error(e)
      alert('Failed to generate PDF.')
    }
    setDownloading(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex flex-col overflow-y-auto py-6 px-4">
      {/* Toolbar */}
      <div className="w-full max-w-[210mm] mx-auto mb-4 flex items-center justify-between flex-shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-xl bg-white/95 text-slate-700 text-sm font-semibold hover:bg-white transition-colors shadow-sm"
        >
          ← Close
        </button>
        <button
          type="button"
          disabled={downloading}
          onClick={handleDownloadPdf}
          className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
        >
          {downloading ? 'Generating PDF…' : '⬇ Download as PDF'}
        </button>
      </div>

      {/* A4 page */}
      <div
        ref={pageRef}
        className="mx-auto bg-white shadow-2xl"
        style={{ width: '210mm', minHeight: '297mm', fontFamily: 'system-ui, -apple-system, sans-serif' }}
      >
        {/* Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #4338ca 0%, #6366f1 50%, #818cf8 100%)',
            padding: '14mm 16mm 10mm',
            color: 'white',
          }}
        >
          <p style={{ fontSize: '10pt', letterSpacing: '0.15em', opacity: 0.85, textTransform: 'uppercase', margin: 0 }}>
            River Of Life Church
          </p>
          <h1 style={{ fontSize: '22pt', fontWeight: 800, margin: '2mm 0 0' }}>Sunday Service Report</h1>
          <p style={{ fontSize: '13pt', fontWeight: 600, margin: '2mm 0 0', opacity: 0.95 }}>
            {formatDisplayDate(row.date)}
          </p>
        </div>

        <div style={{ padding: '10mm 16mm 14mm' }}>
          {/* Hero total */}
          <div
            style={{
              background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
              borderRadius: '4mm',
              padding: '6mm 8mm',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '8mm',
            }}
          >
            <div>
              <p style={{ fontSize: '9pt', letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.85, margin: 0 }}>
                Total Attendance
              </p>
              <p style={{ fontSize: '28pt', fontWeight: 800, margin: '1mm 0 0', lineHeight: 1 }}>
                {row.totalAttendance || 0}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '9pt', opacity: 0.85, margin: 0 }}>Adults</p>
              <p style={{ fontSize: '14pt', fontWeight: 700, margin: '1mm 0 0' }}>{row.totalAdults || 0}</p>
            </div>
          </div>

          {/* Cell groups */}
          {cellStats.length > 0 && (
            <div style={{ marginBottom: '8mm' }}>
              <p style={{ fontSize: '8pt', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '3mm' }}>
                Cell Groups
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '3mm' }}>
                {cellStats.map((c, i) => {
                  const col = STAT_COLORS[i % STAT_COLORS.length]
                  return (
                    <div
                      key={c.name}
                      style={{
                        background: col.bg,
                        border: `0.3mm solid ${col.border}`,
                        borderRadius: '3mm',
                        padding: '3mm',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5mm', marginBottom: '1mm' }}>
                        <span style={{ width: '2mm', height: '2mm', borderRadius: '50%', background: col.dot, display: 'inline-block' }} />
                        <span style={{ fontSize: '8.5pt', fontWeight: 700, color: '#334155' }}>{c.name}</span>
                      </div>
                      <p style={{ fontSize: '15pt', fontWeight: 800, color: col.text, margin: 0 }}>{c.count}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Other categories */}
          {otherStats.length > 0 && (
            <div style={{ marginBottom: '8mm' }}>
              <p style={{ fontSize: '8pt', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '3mm' }}>
                Other Attendance
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '3mm' }}>
                {otherStats.map((s) => (
                  <div
                    key={s.label}
                    style={{
                      background: '#f8fafc',
                      border: '0.3mm solid #e2e8f0',
                      borderRadius: '3mm',
                      padding: '3mm',
                    }}
                  >
                    <p style={{ fontSize: '8.5pt', fontWeight: 700, color: '#334155', margin: '0 0 1mm' }}>{s.label}</p>
                    <p style={{ fontSize: '15pt', fontWeight: 800, color: '#475569', margin: 0 }}>{s.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Program timeline */}
          {hasTimings && (
            <div>
              <p style={{ fontSize: '8pt', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '3mm' }}>
                Program Timeline
              </p>
              <div style={{ border: '0.3mm solid #e2e8f0', borderRadius: '3mm', overflow: 'hidden' }}>
                {row.programTimings.map((t, i) => {
                  const duration = formatDuration(t.startTime, row.programTimings[i + 1]?.startTime)
                  const col = STAT_COLORS[i % STAT_COLORS.length]
                  return (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3mm',
                        padding: '3mm 4mm',
                        borderTop: i > 0 ? '0.2mm solid #f1f5f9' : 'none',
                      }}
                    >
                      <span style={{ width: '2mm', height: '2mm', borderRadius: '50%', background: col.dot, flexShrink: 0 }} />
                      <span style={{ fontSize: '9.5pt', fontWeight: 700, color: '#334155', flex: 1 }}>{t.programName}</span>
                      <span style={{ fontSize: '9pt', color: '#64748b', fontWeight: 600 }}>{formatTime(t.startTime)}</span>
                      {duration && (
                        <span
                          style={{
                            fontSize: '7.5pt',
                            fontWeight: 700,
                            color: col.text,
                            background: col.bg,
                            padding: '1mm 2.5mm',
                            borderRadius: '10mm',
                          }}
                        >
                          {duration}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Footer */}
          <p style={{ fontSize: '7.5pt', color: '#cbd5e1', marginTop: '12mm', textAlign: 'center' }}>
            Generated from the ROL Admin App · {format(new Date(), 'dd MMM yyyy, h:mm a')}
          </p>
        </div>
      </div>
    </div>
  )
}
