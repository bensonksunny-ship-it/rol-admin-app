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
  getCellGroupMembers,
  deleteCellReportFull,
} from '../services/firestore'
import { isCellDirectorInPositions, isCellLeaderInPositions } from '../utils/cellReportPermissions'
import { formatDisplayDate } from '../utils/date'
import DepartmentTabBar from '../components/DepartmentTabBar'
import { AnimatePresence } from 'framer-motion'
import EditReportSheet from './cell/EditReportSheet'

const CELL_DEPARTMENT = 'Cell'

// ── Helpers ──────────────────────────────────────────────────────────────────

// Fixed CVD-safe hue order — reused (not reordered) as the week color cycles
const WEEK_COLOR_ORDER = ['blue', 'teal', 'amber', 'green', 'violet', 'red', 'pink', 'orange']

const WEEK_COLOR_CLASSES = {
  blue:   { bar: 'bg-blue-400',   badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  teal:   { bar: 'bg-teal-400',   badge: 'bg-teal-50 text-teal-700 border-teal-200' },
  amber:  { bar: 'bg-amber-400',  badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  green:  { bar: 'bg-green-400',  badge: 'bg-green-50 text-green-700 border-green-200' },
  violet: { bar: 'bg-violet-400', badge: 'bg-violet-50 text-violet-700 border-violet-200' },
  red:    { bar: 'bg-red-400',    badge: 'bg-red-50 text-red-700 border-red-200' },
  pink:   { bar: 'bg-pink-400',   badge: 'bg-pink-50 text-pink-700 border-pink-200' },
  orange: { bar: 'bg-orange-400', badge: 'bg-orange-50 text-orange-700 border-orange-200' },
}

/** Sunday-anchored start-of-week key (YYYY-MM-DD) for a meeting date */
function weekStartKey(dateISO) {
  if (!dateISO) return null
  const d = new Date(String(dateISO).slice(0, 10) + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return null
  d.setDate(d.getDate() - d.getDay())
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** Assigns each unique week (oldest → newest) the next color in the fixed cycle */
function buildWeekColorMap(rows) {
  const weekKeys = [...new Set(rows.map((r) => weekStartKey(r.meetingDateISO)).filter(Boolean))].sort()
  const map = {}
  weekKeys.forEach((key, i) => {
    map[key] = WEEK_COLOR_ORDER[i % WEEK_COLOR_ORDER.length]
  })
  return map
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

  const [cellGroups, setCellGroups]       = useState([])
  const [cellGroupsLoaded, setCellGroupsLoaded] = useState(false)
  const [loading, setLoading]         = useState(true)
  const [history, setHistory]         = useState([])
  const [expandedId, setExpandedId]   = useState(null)

  const isDirector = useMemo(() => {
    if (!userProfile) return false
    if (userProfile.globalRole === 'FOUNDER' || userProfile.role === 'FOUNDER') return true
    if (isCellDirectorInPositions(userProfile)) return true
    // Fallback: top-level fields match Firestore rules' isCellDirector() check.
    // Handles legacy users without a positions array and multi-dept directors
    // whose primary `department` field isn't 'Cell'.
    const depts = Array.isArray(userProfile.departments) ? userProfile.departments : []
    return (
      userProfile.role === 'Director' &&
      (userProfile.department === 'Cell' || depts.includes('Cell'))
    )
  }, [userProfile])

  const isLeader = useMemo(() => isCellLeaderInPositions(userProfile), [userProfile])

  const [editRow, setEditRow]       = useState(null)
  const [isNewEntry, setIsNewEntry] = useState(false)

  const handleSaved = useCallback((updatedRow) => {
    setHistory((prev) => {
      const exists = prev.some(
        (h) => h.cellId === updatedRow.cellId && h.meetingDateISO === updatedRow.meetingDateISO
      )
      if (exists) {
        return prev.map((h) =>
          h.cellId === updatedRow.cellId && h.meetingDateISO === updatedRow.meetingDateISO
            ? { ...h, ...updatedRow }
            : h
        )
      }
      return [updatedRow, ...prev]
    })
  }, [])

  const handleDelete = useCallback(async (row) => {
    const confirmed = window.confirm(
      `Delete the meeting record for ${row.cellName} on ${row.meetingDateISO}? This cannot be undone.`
    )
    if (!confirmed) return
    try {
      await deleteCellReportFull(row)
      setHistory((prev) =>
        prev.filter((h) => !(h.cellId === row.cellId && h.meetingDateISO === row.meetingDateISO))
      )
    } catch {
      alert('Could not delete. Please try again.')
    }
  }, [])

  // Load cell groups (needed to resolve linked cell)
  useEffect(() => {
    getCellGroups(CELL_DEPARTMENT)
      .then(setCellGroups)
      .catch(() => setCellGroups([]))
      .finally(() => setCellGroupsLoaded(true))
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

  const canEditRow = useCallback(
    (row) => isDirector || (isLeader && row.cellId === linkedCellId),
    [isDirector, isLeader, linkedCellId]
  )

  // Load history (archived) + live (current-week) reports, merged
  useEffect(() => {
    if (!userProfile) return
    // For leaders, wait until cellGroups has loaded so linkedCellId is resolved.
    // Without this guard the effect fires immediately with linkedCellId=null and
    // shows a false "no records" state before the groups arrive.
    if (!isDirector && !cellGroupsLoaded) return
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
          if (!linkedCellId) { if (alive) { setHistory([]); setLoading(false) } return }
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
      } catch (e) {
        console.error('[CellHistory] Failed to load reports:', e)
        if (alive) setHistory([])
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [userProfile, isDirector, linkedCellId, cellGroupsLoaded])

  // Sort newest first
  const sorted = useMemo(
    () => [...history].sort((a, b) => (b.meetingDateISO || '').localeCompare(a.meetingDateISO || '')),
    [history]
  )

  // Color each report by its meeting week, so same-week reports (across cells) share a color
  const weekColorMap = useMemo(() => buildWeekColorMap(sorted), [sorted])

  // Split out this week's reports (Sunday–Saturday) so they can be shown as their own group
  const currentWeekKey = useMemo(() => {
    const now = new Date()
    const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    return weekStartKey(todayISO)
  }, [])
  const thisWeekRows = useMemo(
    () => sorted.filter((row) => weekStartKey(row.meetingDateISO) === currentWeekKey),
    [sorted, currentWeekKey]
  )
  const earlierRows = useMemo(
    () => sorted.filter((row) => weekStartKey(row.meetingDateISO) !== currentWeekKey),
    [sorted, currentWeekKey]
  )

  const toggleExpand = useCallback((id) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }, [])

  const renderGrid = (rows) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 items-start">
      {rows.map((row) => (
        <HistoryCard
          key={row.id}
          row={row}
          weekColor={weekColorMap[weekStartKey(row.meetingDateISO)]}
          expanded={expandedId === row.id}
          onToggle={() => toggleExpand(row.id)}
          canEdit={canEditRow(row)}
          isDirector={isDirector}
          onEdit={() => { setIsNewEntry(false); setEditRow(row) }}
          onDelete={() => handleDelete(row)}
        />
      ))}
    </div>
  )

  if (embedded) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-bold text-slate-900 text-base">Past Meeting Records</h2>
          <p className="text-slate-500 text-xs mt-0.5">Newest first</p>
        </div>
        {(isDirector || isLeader) && (
          <button
            type="button"
            onClick={() => { setIsNewEntry(true); setEditRow({}) }}
            className="text-xs font-semibold text-indigo-600 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl transition-all"
          >
            + New Entry
          </button>
        )}
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
          <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">This Week's Reports (Sun–Sat)</p>
              {thisWeekRows.length === 0 ? (
                <p className="text-sm text-slate-400">No reports submitted yet this week.</p>
              ) : (
                renderGrid(thisWeekRows)
              )}
            </div>
            {earlierRows.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Earlier Reports</p>
                {renderGrid(earlierRows)}
              </div>
            )}
          </div>
        )}
        <AnimatePresence>
          {editRow !== null && (
            <EditReportSheet
              row={isNewEntry ? null : editRow}
              isNew={isNewEntry}
              cellGroups={cellGroups}
              linkedCellId={linkedCellId}
              isDirector={isDirector}
              onClose={() => { setEditRow(null); setIsNewEntry(false) }}
              onSaved={(updated) => { handleSaved(updated); setEditRow(null); setIsNewEntry(false) }}
            />
          )}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <DepartmentTabBar slug="cell" activeTab="cellHistory" />

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Cell History</h1>
            <p className="text-slate-500 text-sm mt-0.5">Past meeting records</p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0 mt-1">
            {(isDirector || isLeader) && (
              <button
                type="button"
                onClick={() => { setIsNewEntry(true); setEditRow({}) }}
                className="text-sm font-semibold text-indigo-600 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-xl transition-all"
              >
                + New Entry
              </button>
            )}
            <Link
              to="/department/cell/cell-report"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors whitespace-nowrap"
            >
              ← Cell Report
            </Link>
          </div>
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
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">This Week's Reports (Sun–Sat)</p>
              {thisWeekRows.length === 0 ? (
                <p className="text-sm text-slate-400">No reports submitted yet this week.</p>
              ) : (
                renderGrid(thisWeekRows)
              )}
            </div>
            {earlierRows.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Earlier Reports</p>
                {renderGrid(earlierRows)}
              </div>
            )}
          </div>
        )}
        <AnimatePresence>
          {editRow !== null && (
            <EditReportSheet
              row={isNewEntry ? null : editRow}
              isNew={isNewEntry}
              cellGroups={cellGroups}
              linkedCellId={linkedCellId}
              isDirector={isDirector}
              onClose={() => { setEditRow(null); setIsNewEntry(false) }}
              onSaved={(updated) => { handleSaved(updated); setEditRow(null); setIsNewEntry(false) }}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ── History Card ──────────────────────────────────────────────────────────────

function HistoryCard({ row, weekColor, expanded, onToggle, canEdit = false, isDirector = false, onEdit, onDelete }) {
  const total     = Number(row.totalAttendance) || 0
  const members   = Number(row.membersAttended) || 0
  const duration  = formatDuration(row.meetingDurationMinutes)
  const colorCls  = WEEK_COLOR_CLASSES[weekColor]

  return (
    <div className={`flex bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${
      expanded ? 'border-indigo-200 shadow-indigo-50' : 'border-slate-200'
    }`}>
      {/* Week color accent bar */}
      <div className={`w-1 flex-shrink-0 ${colorCls?.bar || 'bg-slate-200'}`} title="Colored by meeting week" />

      <div className="flex-1 min-w-0">
        {/* Card header row */}
        <div className="flex items-center gap-1 pr-1.5">
          {/* Expand toggle */}
          <button
            type="button"
            onClick={onToggle}
            className="flex-1 text-left pl-3 pr-1.5 py-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 transition-colors min-w-0"
          >
            <div className="space-y-0.5 flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-slate-900 text-sm truncate">{row.cellName || '—'}</span>
                {row.meetingDateISO && (
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${colorCls?.badge || 'bg-slate-100 text-slate-500 border-transparent'}`}>
                    {formatDisplayDate(row.meetingDateISO)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">{members}</span> mem
                </span>
                <span className="text-slate-300">·</span>
                <span className="text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">{total}</span> tot
                </span>
                <span className="text-slate-300">·</span>
                <span className="text-xs text-slate-500">{duration}</span>
              </div>
            </div>
            <div className={`text-slate-400 transition-transform duration-200 flex-shrink-0 text-sm ${expanded ? 'rotate-90' : ''}`}>
              ›
            </div>
          </button>

          {/* Action buttons */}
          {canEdit && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit() }}
              className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all flex-shrink-0 text-sm"
              title="Edit report"
            >
              ✏️
            </button>
          )}
          {isDirector && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all flex-shrink-0 text-sm"
              title="Delete report"
            >
              🗑️
            </button>
          )}
        </div>

        {/* Expanded detail panel */}
        {expanded && <HistoryDetail row={row} />}
      </div>
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

        // Fallback: if cell_reports has no attendees but MidweekMinistry recorded presentIds,
        // resolve member names from the cell group members collection
        if (reportAttendees.length === 0 && session?.presentIds?.length > 0 && row.cellId) {
          try {
            const members = await getCellGroupMembers(row.cellId)
            const presentSet = new Set(session.presentIds)
            reportAttendees = members
              .filter((m) => presentSet.has(m.id))
              .map((m) => ({ id: m.id, name: m.name, status: 'present' }))
          } catch {
            // ignore — names are optional
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
