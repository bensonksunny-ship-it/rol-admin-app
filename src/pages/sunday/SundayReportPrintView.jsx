import { useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { formatDisplayDate } from '../../utils/date'

function formatTime(isoString) {
  try { return format(parseISO(isoString), 'h:mm a') } catch { return isoString }
}

function formatTimeHHMM(isoString) {
  try { return format(parseISO(isoString), 'HH:mm') } catch { return null }
}

function plannedDeltaMinutes(plannedTime, actualHHMM) {
  if (!plannedTime || !actualHHMM) return null
  const [ph, pm] = plannedTime.split(':').map(Number)
  const [ah, am] = actualHHMM.split(':').map(Number)
  if ([ph, pm, ah, am].some((n) => Number.isNaN(n))) return null
  return (ah * 60 + am) - (ph * 60 + pm)
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

// Accent-only palette — border / text / dot, never a fill. Keeps the printed
// page colourful without laying down ink-heavy background blocks.
const STAT_COLORS = [
  { border: '#c7d2fe', text: '#4338ca', dot: '#6366f1' },
  { border: '#a7f3d0', text: '#047857', dot: '#10b981' },
  { border: '#fde68a', text: '#b45309', dot: '#f59e0b' },
  { border: '#fbcfe8', text: '#be185d', dot: '#ec4899' },
  { border: '#bae6fd', text: '#0369a1', dot: '#0ea5e9' },
  { border: '#e9d5ff', text: '#7e22ce', dot: '#a855f7' },
]

// Shared section heading — a colour tick + muted label, no background.
function SectionLabel({ children, accent = '#6366f1', right = null }) {
  return (
    <p style={{
      fontSize: '7pt', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
      color: '#94a3b8', marginBottom: '1.8mm',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: '1.5mm' }}>
        <span style={{ width: '1.5mm', height: '1.5mm', borderRadius: '0.4mm', background: accent, display: 'inline-block' }} />
        {children}
      </span>
      {right}
    </p>
  )
}

/** A4-styled, printable Sunday report — viewable on screen and downloadable as PDF. */
export default function SundayReportPrintView({ row, cellCols, onClose }) {
  const pageRef = useRef(null)
  const [downloading, setDownloading] = useState(false)

  const sca = row.sundayCellAttendance || {}
  const cellStats = cellCols.map((c) => ({ name: c.name, count: (sca[c.id] || []).filter(Boolean).length }))

  const otherStats = [
    { label: 'Pastoral', value: row.pastoralCount || 0 },
    { label: 'Others', value: row.othersCount || 0 },
    { label: 'Non Cell', value: row.nonCellCount || 0 },
    { label: 'Sunday School', value: row.sundaySchool || 0 },
    { label: '2nd Week', value: row.secondWeekAttendees || 0 },
    { label: 'New Comers', value: row.newcomers || 0 },
    { label: 'River Kids', value: row.riverKidsCount || 0 },
  ]

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
          windowWidth: 794,
          autoPaging: false,
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

      {/* A4 page — fixed to 297mm so jsPDF never creates a second page */}
      <div
        ref={pageRef}
        className="mx-auto bg-white shadow-2xl overflow-hidden"
        style={{ width: '210mm', height: '297mm', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#334155' }}
      >
        {/* Header — accent rule, no fill */}
        <div style={{ padding: '9mm 14mm 4mm', borderBottom: '0.8mm solid #4338ca' }}>
          <p style={{ fontSize: '8pt', letterSpacing: '0.15em', color: '#6366f1', textTransform: 'uppercase', margin: 0, fontWeight: 700 }}>
            River Of Life Church
          </p>
          <h1 style={{ fontSize: '18pt', fontWeight: 800, margin: '1.5mm 0 0', color: '#1e293b' }}>Sunday Service Report</h1>
          <p style={{ fontSize: '11pt', fontWeight: 600, margin: '1mm 0 0', color: '#64748b' }}>
            {formatDisplayDate(row.date)}
          </p>
        </div>

        <div style={{ padding: '5mm 14mm' }}>
          {/* Hero total — bordered, colour on text only */}
          <div
            style={{
              border: '0.5mm solid #10b981',
              borderRadius: '3mm',
              padding: '3mm 6mm',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '4mm',
            }}
          >
            <div>
              <p style={{ fontSize: '7.5pt', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', margin: 0, fontWeight: 700 }}>
                Total Attendance
              </p>
              <p style={{ fontSize: '23pt', fontWeight: 800, margin: '0.5mm 0 0', lineHeight: 1, color: '#059669' }}>
                {row.totalAttendance || 0}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '7.5pt', color: '#94a3b8', margin: 0, fontWeight: 600 }}>Adults</p>
              <p style={{ fontSize: '13pt', fontWeight: 700, margin: '0.5mm 0 0', color: '#334155' }}>{row.totalAdults || 0}</p>
            </div>
          </div>

          {/* Cell groups */}
          {cellStats.length > 0 && (
            <div style={{ marginBottom: '3.5mm' }}>
              <SectionLabel accent="#6366f1">Cell Groups</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2mm' }}>
                {cellStats.map((c, i) => {
                  const col = STAT_COLORS[i % STAT_COLORS.length]
                  return (
                    <div
                      key={c.name}
                      style={{
                        border: `0.3mm solid ${col.border}`,
                        borderRadius: '2.5mm',
                        padding: '2mm',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5mm', marginBottom: '0.5mm' }}>
                        <span style={{ width: '1.5mm', height: '1.5mm', borderRadius: '50%', background: col.dot, display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontSize: '7.5pt', fontWeight: 700, color: '#334155', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{c.name}</span>
                      </div>
                      <p style={{ fontSize: '13pt', fontWeight: 800, color: col.text, margin: 0 }}>{c.count}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Other categories */}
          {otherStats.length > 0 && (
            <div style={{ marginBottom: '3.5mm' }}>
              <SectionLabel accent="#0ea5e9">Other Attendance</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2mm' }}>
                {otherStats.map((s, i) => {
                  const col = STAT_COLORS[i % STAT_COLORS.length]
                  return (
                    <div
                      key={s.label}
                      style={{
                        border: `0.3mm solid ${col.border}`,
                        borderRadius: '2.5mm',
                        padding: '2mm',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5mm', marginBottom: '0.5mm' }}>
                        <span style={{ width: '1.5mm', height: '1.5mm', borderRadius: '50%', background: col.dot, display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontSize: '7.5pt', fontWeight: 700, color: '#334155', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{s.label}</span>
                      </div>
                      <p style={{ fontSize: '13pt', fontWeight: 800, color: col.text, margin: 0 }}>{s.value}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Program timeline */}
          {hasTimings && (() => {
            const timings = row.programTimings
            const totalSpan = timings.length > 1
              ? formatDuration(timings[0].startTime, timings[timings.length - 1].startTime)
              : null
            return (
              <div>
                <SectionLabel
                  accent="#f59e0b"
                  right={totalSpan ? <span style={{ color: '#64748b' }}>Total {totalSpan}</span> : null}
                >
                  Program Timeline
                </SectionLabel>
                <div style={{ border: '0.3mm solid #e2e8f0', borderRadius: '2.5mm', overflow: 'hidden' }}>
                  {row.programTimings.map((t, i) => {
                    const duration = formatDuration(t.startTime, row.programTimings[i + 1]?.startTime)
                    const col = STAT_COLORS[i % STAT_COLORS.length]
                    const delta = plannedDeltaMinutes(t.plannedTime, formatTimeHHMM(t.startTime))
                    const deltaLabel = delta === null ? null : delta === 0 ? 'On time' : delta > 0 ? `+${delta}m` : `${-delta}m early`
                    const deltaColor = delta === null ? null : delta === 0 ? '#059669' : delta > 0 ? '#dc2626' : '#0284c7'
                    return (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3mm',
                          padding: '1.7mm 3.5mm',
                          borderTop: i > 0 ? '0.2mm solid #f1f5f9' : 'none',
                        }}
                      >
                        <span style={{ width: '1.5mm', height: '1.5mm', borderRadius: '50%', background: col.dot, flexShrink: 0 }} />
                        <span style={{ fontSize: '8.5pt', fontWeight: 700, color: '#334155', flex: 1 }}>{t.programName}</span>
                        <span
                          style={{
                            fontSize: '7pt',
                            fontWeight: 700,
                            color: col.text,
                            border: `0.3mm solid ${col.border}`,
                            padding: '0.4mm 2mm',
                            borderRadius: '10mm',
                            whiteSpace: 'nowrap',
                            minWidth: '9mm',
                            textAlign: 'center',
                          }}
                          title="Time on this program"
                        >
                          {duration || '—'}
                        </span>
                        {t.plannedTime && (
                          <span style={{ fontSize: '7.5pt', color: '#6366f1', fontWeight: 600, tabularNums: true }}>
                            {t.plannedTime}
                          </span>
                        )}
                        <span style={{ fontSize: '8pt', color: '#64748b', fontWeight: 600 }}>{formatTime(t.startTime)}</span>
                        {deltaLabel && (
                          <span
                            style={{
                              fontSize: '7pt',
                              fontWeight: 700,
                              color: deltaColor,
                              border: `0.3mm solid ${deltaColor}`,
                              padding: '0.4mm 2mm',
                              borderRadius: '10mm',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {deltaLabel}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Footer */}
          <p style={{ fontSize: '7pt', color: '#cbd5e1', marginTop: '4mm', textAlign: 'center' }}>
            Generated from the ROL Admin App · {format(new Date(), 'dd MMM yyyy, h:mm a')}
          </p>
        </div>
      </div>
    </div>
  )
}
