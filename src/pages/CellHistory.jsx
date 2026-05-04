import { useEffect, useMemo, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getCellGroups,
  getCellReportHistory,
  getCellReportsByCell,
  getCellReportAttendees,
  getMidweekSessionData,
  getMidweekPrayerPoints,
  getLatestCellReports,
} from '../services/firestore'
import { isCellDirectorInPositions } from '../utils/cellReportPermissions'
import DepartmentTabBar from '../components/DepartmentTabBar'

const CELL_DEPARTMENT = 'Cell'

// ── Helpers ──────────────────────────────────────────────────────────────────

function toDDMMYYYY(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const dd   = String(d.getDate()).padStart(2, '0')
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function formatDuration(minutes) {
  if (minutes == null || Number.isNaN(Number(minutes))) return '—'
  const m = Number(minutes)
  if (m < 60) return `${m} min`
  const h   = Math.floor(m / 60)
  const rem = m % 60
  return rem ? `${h}h ${rem}m` : `${h}h`
}

function getInitials(name) {
  return String(name || '')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase()
}

// ── Root Component ────────────────────────────────────────────────────────────

export default function CellHistory({ embedded = false }) {
  const { userProfile } = useAuth()

  const [cellGroups, setCellGroups]   = useState([])
  const [loading, setLoading]         = useState(true)
  const [history, setHistory]         = useState([])
  const [expandedId, setExpandedId]   = useState(null)

  const isDirector = useMemo(() => isCellDirectorInPositions(userProfile), [userProfile])

  // Load cell groups (needed to resolve linked cell)
  useEffect(() => {
    getCellGroups(CELL_DEPARTMENT).then(setCellGroups).catch(() => setCellGroups([]))
  }, [])

  // Resolve leader's linked cell ID from profile
  const linkedCellId = useMemo(() => {
    if (!userProfile) return null
    const fromProfile = String(userProfile.cellGroupId || userProfile.cellId || '').trim()
    if (fromProfile && cellGroups.length) {
      const hit = cellGroups.find(
        (g) => String(g.id || '') === fromProfile || String(g.cellId || '') === fromProfile
      )
      if (hit) return hit.id
    }
    const name = String(userProfile.cellGroup || '').trim()
    if (name && cellGroups.length) {
      const match = cellGroups.find(
        (g) => String(g.cellName || '').trim().toLowerCase() === name.toLowerCase()
      )
      return match?.id || null
    }
    return null
  }, [userProfile, cellGroups])

  // Load history (archived) + live (current-week) reports, merged
  useEffect(() => {
    if (!userProfile) return
    let alive = true
    setLoading(true)
    ;(async () => {
      try {
        let historyList = []
        let liveList = []

        if (isDirector) {
          ;[historyList, liveList] = await Promise.all([
            getCellReportHistory({ limitCount: 200 }),
            getLatestCellReports(50),
          ])
        } else {
          if (!linkedCellId) { if (alive) setHistory([]); return }
          ;[historyList, liveList] = await Promise.all([
            getCellReportHistory({ cellId: linkedCellId, limitCount: 200 }),
            getCellReportsByCell(linkedCellId),
          ])
        }

        // Dates already covered by the archived history — skip those from live list
        const archivedKeys = new Set(
          historyList.map((h) => `${h.cellId}_${String(h.meetingDateISO || '').slice(0, 10)}`)
        )

        const liveHistory = liveList
          .filter((r) => {
            const date = String(r.reportDate || '').slice(0, 10)
            return date && !archivedKeys.has(`${r.cellId}_${date}`)
          })
          .map((r) => ({
            id: r.id,
            cellId: r.cellId,
            cellName: r.cellName,
            meetingDateISO: String(r.reportDate || '').slice(0, 10),
            meetingDay: r.meetingDay || '',
            membersAttended: r.membersAttended || 0,
            visitors: r.visitors || 0,
            children: r.children || 0,
            totalAttendance: (r.membersAttended || 0) + (r.visitors || 0) + (r.children || 0),
            meetingDurationMinutes: null,
            programList: [],
          }))

        if (alive) setHistory([...historyList, ...liveHistory])
      } catch {
        if (alive) setHistory([])
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [userProfile, isDirector, linkedCellId])

  // Sort newest first
  const sorted = useMemo(
    () => [...history].sort((a, b) => (b.meetingDateISO || '').localeCompare(a.meetingDateISO || '')),
    [history]
  )

  const toggleExpand = useCallback((id) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }, [])

  if (embedded) {
    return (
      <div className="space-y-3">
        <div>
          <h2 className="font-bold text-slate-900 text-base">Past Meeting Records</h2>
          <p className="text-slate-500 text-xs mt-0.5">Read only · newest first</p>
        </div>
        {loading ? (
          <div className="text-slate-400 text-sm py-6 text-center">Loading history…</div>
        ) : sorted.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center shadow-sm">
            <p className="text-4xl mb-3">📭</p>
            <p className="font-semibold text-slate-700">No meeting records yet.</p>
            <p className="text-slate-400 text-sm mt-1">Past meetings will appear here after they are submitted.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((row) => (
              <HistoryCard
                key={row.id}
                row={row}
                expanded={expandedId === row.id}
                onToggle={() => toggleExpand(row.id)}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <DepartmentTabBar slug="cell" activeTab="cellHistory" />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Cell History</h1>
            <p className="text-slate-500 text-sm mt-0.5">Past meeting records — read only</p>
          </div>
          <Link
            to="/department/cell/cell-report"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors whitespace-nowrap mt-1"
          >
            ← Cell Report
          </Link>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-slate-400 text-sm">Loading history…</div>
          </div>
        ) : sorted.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-sm">
            <p className="text-5xl mb-4">📭</p>
            <p className="font-semibold text-slate-700">No meeting records yet.</p>
            <p className="text-slate-400 text-sm mt-1">Past meetings will appear here after they are submitted.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((row) => (
              <HistoryCard
                key={row.id}
                row={row}
                expanded={expandedId === row.id}
                onToggle={() => toggleExpand(row.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── History Card ──────────────────────────────────────────────────────────────

function HistoryCard({ row, expanded, onToggle }) {
  const total    = Number(row.totalAttendance) || 0
  const members  = Number(row.membersAttended) || 0
  const duration = formatDuration(row.meetingDurationMinutes)

  return (
    <div className={`bg-white rounded-3xl border shadow-sm overflow-hidden transition-all ${
      expanded ? 'border-indigo-200 shadow-indigo-50' : 'border-slate-200'
    }`}>
      {/* Card header — always visible */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-6 py-5 flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors"
      >
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-900 text-base">{row.cellName || '—'}</span>
            {row.meetingDateISO && (
              <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                {toDDMMYYYY(row.meetingDateISO)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-slate-500">
              <span className="font-semibold text-slate-700">{members}</span> members
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-sm text-slate-500">
              <span className="font-semibold text-slate-700">{total}</span> total
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-sm text-slate-500">{duration}</span>
          </div>
        </div>
        <div className={`text-slate-400 transition-transform duration-200 flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}>
          ›
        </div>
      </button>

      {/* Expanded detail panel */}
      {expanded && (
        <HistoryDetail row={row} />
      )}
    </div>
  )
}

// ── History Detail (lazy-loaded on expand) ────────────────────────────────────

function HistoryDetail({ row }) {
  const [attendees, setAttendees]       = useState(null)  // null = loading
  const [sessionData, setSessionData]   = useState(null)
  const [prayerPoints, setPrayerPoints] = useState(null)
  const [error, setError]               = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        // Parallel: get session data + prayer points (we have cellId + date)
        const dateStr = row.meetingDateISO || ''

        const [session, prayer] = await Promise.all([
          row.cellId && dateStr ? getMidweekSessionData(row.cellId, dateStr) : Promise.resolve(null),
          row.cellId && dateStr ? getMidweekPrayerPoints(row.cellId, dateStr) : Promise.resolve([]),
        ])

        if (alive) {
          setSessionData(session || null)
          setPrayerPoints(Array.isArray(prayer) ? prayer : [])
        }

        // Get attendee names from cell_reports (match by cellId + date)
        let reportAttendees = []
        if (row.cellId && dateStr) {
          try {
            const reports = await getCellReportsByCell(row.cellId)
            const matchedReport = reports.find(
              (r) => String(r.reportDate || r.meetingDate || r.meetingDateISO || '').slice(0, 10) === dateStr.slice(0, 10)
            )
            if (matchedReport?.id) {
              reportAttendees = await getCellReportAttendees(matchedReport.id)
            }
          } catch {
            // Attendee names optional — no crash
          }
        }
        if (alive) setAttendees(reportAttendees)
      } catch {
        if (alive) { setError(true); setAttendees([]) }
      }
    })()
    return () => { alive = false }
  }, [row])

  if (error) {
    return (
      <div className="px-6 pb-6 text-slate-400 text-sm">
        Could not load full details for this meeting.
      </div>
    )
  }

  const segmentTimings = sessionData?.segmentTimings || row.programList?.map((p) => ({ name: p.programName, durationMinutes: null })) || []
  const shepherdNotes  = sessionData?.shepherdNotes || ''
  const totalDuration  = formatDuration(row.meetingDurationMinutes)

  return (
    <div className="px-6 pb-6 space-y-4">
      {/* Divider */}
      <div className="h-px bg-slate-100" />

      {/* ── Segment Timings ── */}
      <Section title="⏱ Segment Timings">
        {segmentTimings.length === 0 ? (
          <EmptyNote>No segment data recorded.</EmptyNote>
        ) : (
          <div className="space-y-2">
            {segmentTimings.map((seg, i) => (
              <div key={i} className="flex items-center justify-between gap-4 px-4 py-3 bg-slate-50 rounded-2xl">
                <div className="flex items-center gap-2">
                  <span className="text-base">{getSegmentIcon(seg.name)}</span>
                  <span className="font-semibold text-slate-800 text-sm">{seg.name || '—'}</span>
                </div>
                <span className="text-sm text-slate-500 font-medium">
                  {seg.durationMinutes != null ? formatDuration(seg.durationMinutes) : (seg.startTime ? seg.startTime : '—')}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-3 bg-indigo-50 rounded-2xl">
              <span className="font-semibold text-indigo-900 text-sm">Total</span>
              <span className="font-bold text-indigo-900 text-sm">{totalDuration}</span>
            </div>
          </div>
        )}
      </Section>

      {/* ── Attendance ── */}
      <Section title="👥 Who Was Present">
        {attendees === null ? (
          <div className="text-slate-400 text-sm">Loading…</div>
        ) : attendees.length === 0 ? (
          <EmptyNote>
            {Number(row.membersAttended) > 0
              ? `${Number(row.membersAttended)} members attended (names not recorded).`
              : 'No attendance names recorded.'}
          </EmptyNote>
        ) : (
          <div className="flex flex-wrap gap-2">
            {attendees.map((a, i) => (
              <AttendancePill key={a.id || i} name={a.name || a.memberName || 'Unknown'} status={a.status} />
            ))}
          </div>
        )}
      </Section>

      {/* ── Prayer Matters ── */}
      <Section title="🙏 Prayer Matters">
        {prayerPoints === null ? (
          <div className="text-slate-400 text-sm">Loading…</div>
        ) : prayerPoints.length === 0 ? (
          <EmptyNote>No prayer matters recorded for this meeting.</EmptyNote>
        ) : (
          <div className="space-y-2">
            {prayerPoints.map((p, i) => (
              <div key={p.id || i} className="px-4 py-3 bg-slate-50 rounded-2xl">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="font-semibold text-slate-800 text-sm">{p.name || '—'}</span>
                  {p.isDirector && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                      From Director
                    </span>
                  )}
                </div>
                <p className="text-slate-600 text-sm leading-relaxed">{p.subject || '—'}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Shepherd Notes ── */}
      {shepherdNotes ? (
        <Section title="📝 Shepherd Notes">
          <div className="px-4 py-3 bg-amber-50 border border-amber-100 rounded-2xl">
            <p className="text-slate-800 text-sm leading-relaxed whitespace-pre-wrap">{shepherdNotes}</p>
          </div>
        </Section>
      ) : null}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{title}</p>
      {children}
    </div>
  )
}

function EmptyNote({ children }) {
  return <p className="text-slate-400 text-sm">{children}</p>
}

function AttendancePill({ name, status }) {
  const initials = getInitials(name)
  const firstName = (name || '').split(' ')[0]
  const isPresent = status === 'present' || status == null  // default assume present

  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
      isPresent !== false
        ? 'bg-emerald-50 text-emerald-800 border border-emerald-100'
        : 'bg-slate-100 text-slate-500 border border-slate-200'
    }`}>
      <span className="w-5 h-5 rounded-full bg-emerald-400/30 text-emerald-900 text-xs font-bold flex items-center justify-center flex-shrink-0">
        {initials.slice(0, 1)}
      </span>
      {firstName}
    </div>
  )
}

function getSegmentIcon(name) {
  const n = String(name || '').toLowerCase()
  if (n.includes('worship') || n.includes('praise')) return '🎵'
  if (n.includes('word') || n.includes('bible') || n.includes('message')) return '📖'
  if (n.includes('prayer')) return '🙏'
  return '▸'
}
