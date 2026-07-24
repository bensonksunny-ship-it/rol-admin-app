import { Fragment, useEffect, useMemo, useState, useCallback } from 'react'
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
import { isCellLeaderInPositions } from '../utils/cellReportPermissions'
import { getDepartmentRole } from '../utils/access'
import { formatDisplayDate } from '../utils/date'
import { AnimatePresence } from 'framer-motion'
import EditReportSheet from './cell/EditReportSheet'

const CELL_DEPARTMENT = 'Cell'

// ── Helpers ──────────────────────────────────────────────────────────────────

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

/** "Jul 20 – Jul 26" (adds year only when the range falls outside the current year) */
function formatWeekRange(weekStartISO) {
  if (!weekStartISO) return 'Unknown'
  const start = new Date(`${weekStartISO}T00:00:00`)
  if (Number.isNaN(start.getTime())) return 'Unknown'
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const showYear = start.getFullYear() !== new Date().getFullYear()
  const opts = { month: 'short', day: 'numeric', ...(showYear ? { year: 'numeric' } : {}) }
  return `${start.toLocaleDateString('en-IN', opts)} – ${end.toLocaleDateString('en-IN', opts)}`
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

/** Archived (weekly-history) rows are always "Submitted"; live rows depend on finalize flags */
function reportStatus(row) {
  if (row._archived) {
    return { label: 'Submitted', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
  }
  if (row.meetingFinalizedAt || row.attendanceFinalizedAt) {
    return { label: 'Finalized', cls: 'bg-blue-50 text-blue-700 border-blue-200' }
  }
  return { label: 'In Progress', cls: 'bg-amber-50 text-amber-700 border-amber-200' }
}

const STAT_ACCENTS = {
  indigo:  { bg: 'bg-indigo-50',  border: 'border-indigo-100',  blob: 'bg-indigo-400',  iconBg: 'bg-indigo-100',  value: 'text-indigo-700' },
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-100', blob: 'bg-emerald-400', iconBg: 'bg-emerald-100', value: 'text-emerald-700' },
  amber:   { bg: 'bg-amber-50',   border: 'border-amber-100',   blob: 'bg-amber-400',   iconBg: 'bg-amber-100',   value: 'text-amber-700' },
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
    // getDepartmentRole checks positions[] for a Cell-specific entry before ever
    // touching the top-level role/department fields, so a Director of an unrelated
    // department (e.g. a Cell Leader who is also River Kids Director) can't be
    // misread as a Cell Director just because those flat fields happen to line up.
    return getDepartmentRole(userProfile, 'Cell') === 'DIRECTOR'
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

  // Load cell groups (needed to resolve linked cell + leader names)
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

  // cellId → leader name, so report cards can show who led each meeting
  const cellLeaderById = useMemo(() => {
    const map = {}
    cellGroups.forEach((g) => { map[g.id] = g.leader || '' })
    return map
  }, [cellGroups])

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
            attendanceFinalizedAt: r.attendanceFinalizedAt || null,
            meetingFinalizedAt: r.meetingFinalizedAt || null,
            _archived: false,
          }))

        const archivedHistory = historyList.map((h) => ({ ...h, _archived: true }))

        if (alive) setHistory([...archivedHistory, ...liveHistory])
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

  const currentWeekKey = useMemo(() => {
    const now = new Date()
    const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    return weekStartKey(todayISO)
  }, [])

  // Group every report into its Sunday–Saturday week, newest week first
  const weekGroups = useMemo(() => {
    const map = new Map()
    sorted.forEach((row) => {
      const key = weekStartKey(row.meetingDateISO)
      if (!key) return
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(row)
    })
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, rows]) => ({ key, rows, isCurrentWeek: key === currentWeekKey, label: formatWeekRange(key) }))
  }, [sorted, currentWeekKey])

  // Summary stats across every loaded report
  const stats = useMemo(() => {
    if (sorted.length === 0) return null
    const totalReports = sorted.length
    const totalAttendanceSum = sorted.reduce((s, r) => s + (Number(r.totalAttendance) || 0), 0)
    const avgAttendance = totalAttendanceSum / totalReports

    const byCell = new Map()
    sorted.forEach((r) => {
      const key = r.cellId || r.cellName
      if (!key) return
      if (!byCell.has(key)) byCell.set(key, { name: r.cellName || '—', sum: 0, count: 0 })
      const entry = byCell.get(key)
      entry.sum += Number(r.totalAttendance) || 0
      entry.count += 1
    })
    let topCell = null
    byCell.forEach((c) => {
      const avg = c.sum / c.count
      if (!topCell || avg > topCell.avg) topCell = { name: c.name, avg }
    })

    return { totalReports, avgAttendance, topCell }
  }, [sorted])

  const toggleExpand = useCallback((id) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }, [])

  const renderGrid = (rows) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
      {rows.map((row) => {
        const expanded = expandedId === row.id
        return (
          <Fragment key={row.id}>
            <ReportCard
              row={row}
              leaderName={cellLeaderById[row.cellId] || ''}
              status={reportStatus(row)}
              expanded={expanded}
              onToggle={() => toggleExpand(row.id)}
              canEdit={canEditRow(row)}
              isDirector={isDirector}
              onEdit={() => { setIsNewEntry(false); setEditRow(row) }}
              onDelete={() => handleDelete(row)}
            />
            {expanded && (
              <div className="sm:col-span-2 xl:col-span-3 bg-white rounded-2xl border border-indigo-200 shadow-sm shadow-indigo-50 overflow-hidden">
                <HistoryDetail row={row} />
              </div>
            )}
          </Fragment>
        )
      })}
    </div>
  )

  const statsRow = !loading && stats && (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <StatCard
        icon="📊"
        label="Average Attendance"
        value={stats.avgAttendance.toFixed(1)}
        sub="per cell meeting"
        accent={STAT_ACCENTS.indigo}
      />
      <StatCard
        icon="🏆"
        label="Top Performing Cell"
        value={stats.topCell?.name || '—'}
        sub={stats.topCell ? `${stats.topCell.avg.toFixed(1)} avg attendance` : ''}
        accent={STAT_ACCENTS.emerald}
      />
      <StatCard
        icon="📋"
        label="Reports Submitted"
        value={stats.totalReports}
        sub="meetings recorded"
        accent={STAT_ACCENTS.amber}
      />
    </div>
  )

  const weeklyContent = (
    <div className="space-y-6">
      {weekGroups.map((group) => (
        <div key={group.key} className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
              Week of {group.label}
            </p>
            {group.isCurrentWeek && (
              <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                Current
              </span>
            )}
            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full whitespace-nowrap">
              {group.rows.length} {group.rows.length === 1 ? 'report' : 'reports'}
            </span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>
          {renderGrid(group.rows)}
        </div>
      ))}
    </div>
  )

  if (embedded) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-bold text-slate-900 text-base">Past Meeting Records</h2>
            <p className="text-slate-500 text-xs mt-0.5">Grouped by week, newest first</p>
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

        {statsRow}

        {loading ? (
          <div className="text-slate-400 text-sm py-6 text-center">Loading history…</div>
        ) : sorted.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center shadow-sm">
            <p className="text-4xl mb-3">📭</p>
            <p className="font-semibold text-slate-700">No meeting records yet.</p>
            <p className="text-slate-400 text-sm mt-1">Past meetings will appear here after they are submitted.</p>
          </div>
        ) : weeklyContent}

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

        {statsRow}

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
        ) : weeklyContent}

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

// ── Stat Card ──────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, accent }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-4 border ${accent.border} ${accent.bg}`}>
      <div className={`absolute -top-6 -right-6 w-20 h-20 rounded-full opacity-30 blur-2xl ${accent.blob}`} />
      <div className="relative">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg mb-3 ${accent.iconBg}`}>
          {icon}
        </div>
        <p className="text-xs font-medium text-slate-500 leading-snug">{label}</p>
        <p className={`text-2xl font-black mt-1 tracking-tight truncate ${accent.value}`} title={String(value)}>{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </div>
    </div>
  )
}

// ── Report Card ────────────────────────────────────────────────────────────────

function ReportCard({ row, leaderName, status, expanded, onToggle, canEdit = false, isDirector = false, onEdit, onDelete }) {
  const total    = Number(row.totalAttendance) || 0
  const members  = Number(row.membersAttended) || 0
  const visitors = Number(row.visitors) || 0
  const children = Number(row.children) || 0

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
      className={`group relative bg-white rounded-2xl border shadow-sm p-5 cursor-pointer transition-all ${
        expanded ? 'border-indigo-300 shadow-indigo-100 ring-1 ring-indigo-100' : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
      }`}
    >
      {/* Edit / delete — revealed on hover so the larger cards stay uncluttered */}
      {(canEdit || isDirector) && (
        <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          {canEdit && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit() }}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all text-sm"
              title="Edit report"
            >
              ✏️
            </button>
          )}
          {isDirector && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all text-sm"
              title="Delete report"
            >
              🗑️
            </button>
          )}
        </div>
      )}

      <div className="pr-14">
        <p className="font-black text-slate-900 text-base leading-snug truncate">{row.cellName || '—'}</p>
        <p className="text-xs text-slate-400 mt-0.5">{row.meetingDateISO ? formatDisplayDate(row.meetingDateISO) : '—'}</p>
      </div>

      <span className={`inline-block text-[10px] font-bold px-2.5 py-1 rounded-full border mt-3 ${status.cls}`}>
        {status.label}
      </span>

      <div className="flex items-end justify-between gap-3 mt-4">
        <div>
          <p className="text-3xl font-black text-slate-800 leading-none">{total}</p>
          <p className="text-[10px] text-slate-400 mt-1.5 uppercase tracking-wide font-bold">Total Attendance</p>
        </div>
        <div className="text-right text-xs text-slate-500 space-y-0.5">
          <p><span className="font-semibold text-slate-700">{members}</span> members</p>
          {visitors > 0 && <p><span className="font-semibold text-slate-700">{visitors}</span> visitors</p>}
          {children > 0 && <p><span className="font-semibold text-slate-700">{children}</span> children</p>}
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
            {getInitials(leaderName) || '—'}
          </span>
          <span className="text-xs text-slate-500 truncate">{leaderName || 'No leader linked'}</span>
        </div>
        <svg className={`w-4 h-4 text-slate-300 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
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
