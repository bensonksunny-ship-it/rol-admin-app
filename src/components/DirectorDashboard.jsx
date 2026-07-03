import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { format, startOfWeek, subWeeks } from 'date-fns'
import { getCellGroups, getLatestCellReports } from '../services/firestore'
import { ROLES } from '../constants/roles'
import { getDepartmentRole, isFounder as isFounderUser } from '../utils/access'
import { computeMeetingDateISO, totalAttendanceFromCellReport, weekStartKey } from '../utils/cellWeek'

const CELL_DEPARTMENT = 'Cell'
const TREND_LINE_COLOR = '#6366f1'

function directorDepartments(userProfile) {
  const out = []
  const positions = userProfile?.positions || []
  for (const p of positions) {
    const dept = p?.department
    if (!dept) continue
    if (getDepartmentRole(userProfile, dept) === 'DIRECTOR') out.push(dept)
  }
  return [...new Set(out)]
}

export function filterCellGroupsForDirectorView(groups, userProfile) {
  const active = (groups || []).filter((g) => g.status !== 'inactive')
  if (isFounderUser(userProfile) || userProfile?.role === ROLES.FOUNDER) return active
  const dirs = directorDepartments(userProfile)
  if (dirs.length === 0) return []
  return active.filter((g) => {
    const gd = (g.department || 'Cell').trim()
    return dirs.some((d) => d.toLowerCase() === gd.toLowerCase())
  })
}

export function canSeeCellDirectorDashboard(userProfile) {
  if (!userProfile) return false
  if (isFounderUser(userProfile) || userProfile?.role === ROLES.FOUNDER) return true
  if (getDepartmentRole(userProfile, CELL_DEPARTMENT) === 'DIRECTOR') return true
  return directorDepartments(userProfile).length > 0
}

function buildReportLookup(reports) {
  const m = new Map()
  for (const r of reports || []) {
    if (!r?.cellId || !r?.reportDate) continue
    m.set(`${r.cellId}|${String(r.reportDate).slice(0, 10)}`, r)
  }
  return m
}

/**
 * Buckets reports by cellId + the Monday-anchored week the report's own date
 * falls in — not by a guessed "expected" date derived from the cell's configured
 * meetingDay. A cell with a missing/wrong meetingDay, or one that met on a
 * different day than usual, still gets counted here since we key off the report
 * it actually filed rather than where we expected it to land.
 */
function buildReportsByCellWeek(reports) {
  const m = new Map()
  for (const r of reports || []) {
    if (!r?.cellId || !r?.reportDate) continue
    const wk = weekStartKey(String(r.reportDate).slice(0, 10))
    if (!m.has(r.cellId)) m.set(r.cellId, new Map())
    m.get(r.cellId).set(wk, r)
  }
  return m
}

export function AlertPanelCellReports({ missingCount, onOpenDetails }) {
  if (missingCount === 0) {
    return (
      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center text-base flex-shrink-0">✅</div>
        <div>
          <p className="text-sm font-semibold text-emerald-800">All reports submitted</p>
          <p className="text-xs text-emerald-600 mt-0.5">Every cell group has submitted their report this week.</p>
        </div>
      </div>
    )
  }
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-amber-200 flex items-center justify-center text-base flex-shrink-0">⚠️</div>
        <div>
          <p className="text-sm font-semibold text-amber-900">
            {missingCount} cell{missingCount !== 1 ? 's' : ''} missing reports
          </p>
          <p className="text-xs text-amber-700 mt-0.5">Weekly reports not yet submitted</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpenDetails}
        className="text-xs font-semibold text-amber-800 px-3 py-1.5 rounded-xl bg-amber-200 hover:bg-amber-300 transition-colors flex-shrink-0"
      >
        View list →
      </button>
    </div>
  )
}

export function MissingCellReportsTable({ rows, loading, remindLeader, dismissedIds = new Set(), onDismiss, onUndismiss }) {
  const submitted = rows.filter((r) => r.submitted).length
  const missing   = rows.filter((r) => r.isDue && !dismissedIds.has(r.cellId)).length
  const dismissed = rows.filter((r) => r.isDue && dismissedIds.has(r.cellId)).length

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <p className="text-sm font-bold text-slate-800">Cell Report Status</p>
        <p className="text-xs text-slate-400 mt-0.5">Current week (Mon–Sun) · Expected date follows each cell's meeting day</p>
        {!loading && rows.length > 0 && (
          <div className="flex gap-3 mt-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              {submitted} Submitted
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
              {missing} Missing
            </span>
            {dismissed > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                {dismissed} Dismissed
              </span>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="px-5 py-10 text-sm text-slate-400 text-center">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="px-5 py-10 text-sm text-slate-400 text-center">No cell groups in scope.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-left">
                <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Cell</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Leader</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Due Date</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 w-44" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((row) => {
                const isDismissed = row.isDue && dismissedIds.has(row.cellId)
                return (
                  <tr key={row.cellId} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-slate-800">{row.cellName}</td>
                    <td className="px-4 py-3 text-slate-600">{row.leaderName || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 tabular-nums">{row.expectedDate}</td>
                    <td className="px-4 py-3">
                      {row.submitted ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" /> Submitted
                        </span>
                      ) : isDismissed ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" /> Dismissed
                        </span>
                      ) : row.isDue ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 px-2.5 py-1 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" /> Due
                        </span>
                      ) : row.isMeetingToday ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" /> Meeting Today
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 inline-block" /> Upcoming
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        {row.isDue && !isDismissed && (
                          <>
                            <button
                              type="button"
                              onClick={() => remindLeader(row)}
                              className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors font-medium"
                            >
                              Remind
                            </button>
                            <button
                              type="button"
                              onClick={() => onDismiss?.(row.cellId)}
                              className="text-xs px-2.5 py-1 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 transition-colors font-medium"
                            >
                              Dismiss
                            </button>
                          </>
                        )}
                        {isDismissed && (
                          <button
                            type="button"
                            onClick={() => onUndismiss?.(row.cellId)}
                            className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors font-medium"
                          >
                            Undo
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function CellWeeklyTrendsChart({ chartData }) {
  if (!chartData?.length) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <p className="text-sm font-bold text-slate-800">Weekly Attendance Trends</p>
        <p className="text-sm text-slate-400 mt-2">Not enough data to chart yet.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <p className="text-sm font-bold text-slate-800">Weekly Attendance Trends</p>
      <p className="text-xs text-slate-400 mt-0.5 mb-5">Total attendance across all cells · last 6 weeks</p>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="weekLabel" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
          />
          <Line
            type="monotone"
            dataKey="total"
            name="Total Attendance"
            stroke={TREND_LINE_COLOR}
            strokeWidth={2.5}
            dot={{ r: 3, fill: TREND_LINE_COLOR }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function DirectorDashboardCellWidgets({ userProfile }) {
  const [cellGroups, setCellGroups] = useState([])
  const [latestReports, setLatestCellReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [scrollToTable, setScrollToTable] = useState(false)

  const weekStartDate = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), [])
  const storageKey = `cell_alerts_dismissed_${format(weekStartDate, 'yyyy-MM-dd')}`

  const [dismissedIds, setDismissedIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(`cell_alerts_dismissed_${format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')}`) || '[]')) }
    catch { return new Set() }
  })

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([getCellGroups(CELL_DEPARTMENT), getLatestCellReports(500)])
      .then(([groups, reports]) => {
        setCellGroups(groups || [])
        setLatestCellReports(reports || [])
      })
      .catch(() => {
        setCellGroups([])
        setLatestCellReports([])
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const isFounder = isFounderUser(userProfile) || userProfile?.role === ROLES.FOUNDER

  const visibleGroups = useMemo(
    () => filterCellGroupsForDirectorView(cellGroups, userProfile),
    [cellGroups, userProfile]
  )

  const reportLookup = useMemo(() => buildReportLookup(latestReports), [latestReports])
  const reportsByCellWeek = useMemo(() => buildReportsByCellWeek(latestReports), [latestReports])

  const rows = useMemo(() => {
    const todayISO = format(new Date(), 'yyyy-MM-dd')
    return visibleGroups.map((cell) => {
      const expectedDate = computeMeetingDateISO(cell.meetingDay, weekStartDate)
      // Try Firestore doc ID first; fall back to logical cellId for legacy reports.
      const hit = reportLookup.get(`${cell.id}|${expectedDate}`)
        || (cell.cellId !== cell.id ? reportLookup.get(`${cell.cellId}|${expectedDate}`) : null)
      const submitted = Boolean(hit)
      const isDue = !submitted && !!expectedDate && expectedDate < todayISO
      const isMeetingToday = !submitted && !!expectedDate && expectedDate === todayISO
      return {
        cellId: cell.id,
        cellName: cell.cellName || 'Unnamed',
        leaderName: cell.leader || '',
        expectedDate,
        submitted,
        isDue,
        isMeetingToday,
      }
    })
  }, [visibleGroups, reportLookup, weekStartDate])

  const dismissAlert = useCallback((cellId) => {
    setDismissedIds((prev) => {
      const next = new Set(prev)
      next.add(cellId)
      localStorage.setItem(storageKey, JSON.stringify([...next]))
      return next
    })
  }, [storageKey])

  const undismissAlert = useCallback((cellId) => {
    setDismissedIds((prev) => {
      const next = new Set(prev)
      next.delete(cellId)
      localStorage.setItem(storageKey, JSON.stringify([...next]))
      return next
    })
  }, [storageKey])

  const missingCount = useMemo(
    () => rows.filter((r) => r.isDue && !dismissedIds.has(r.cellId)).length,
    [rows, dismissedIds]
  )

  // Sum attendance across every visible cell (not just a capped subset) so the
  // trend reflects the whole department's total, per the director's request.
  // Bucketed by the report's own week (buildReportsByCellWeek), not a guessed
  // expected date — a cell with no/wrong meetingDay configured, or one that met
  // on an unusual day, was otherwise silently counted as 0 for that week.
  const chartData = useMemo(() => {
    const cur = startOfWeek(new Date(), { weekStartsOn: 1 })
    const weeks = [5, 4, 3, 2, 1, 0].map((i) => subWeeks(cur, i))
    return weeks.map((ws) => {
      const wk = format(ws, 'yyyy-MM-dd')
      const total = visibleGroups.reduce((sum, cell) => {
        const r = reportsByCellWeek.get(cell.id)?.get(wk)
          || (cell.cellId !== cell.id ? reportsByCellWeek.get(cell.cellId)?.get(wk) : null)
        return sum + totalAttendanceFromCellReport(r)
      }, 0)
      return { weekLabel: format(ws, 'MMM d'), weekStart: wk, total }
    })
  }, [reportsByCellWeek, visibleGroups])

  const remindLeader = useCallback((row) => {
    const name = row?.cellName || 'this cell'
    alert(`Reminder for "${name}" will be available when messaging is connected.`)
  }, [])

  const onOpenDetails = useCallback(() => {
    setScrollToTable(true)
    setTimeout(() => {
      const el = document.getElementById('missing-cell-reports-table')
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }, [])

  useEffect(() => {
    if (!scrollToTable) return
    const t = setTimeout(() => setScrollToTable(false), 2000)
    return () => clearTimeout(t)
  }, [scrollToTable])

  if (!canSeeCellDirectorDashboard(userProfile)) return null
  if (!loading && visibleGroups.length === 0 && !isFounder) return null

  return (
    <div className="space-y-4">
      <AlertPanelCellReports missingCount={missingCount} onOpenDetails={onOpenDetails} />
      <div id="missing-cell-reports-table">
        <MissingCellReportsTable
          rows={rows}
          loading={loading}
          remindLeader={remindLeader}
          dismissedIds={dismissedIds}
          onDismiss={dismissAlert}
          onUndismiss={undismissAlert}
        />
      </div>
      <CellWeeklyTrendsChart chartData={chartData} />
    </div>
  )
}

export function CellMemberGrowthChart({ cellMemberData }) {
  if (!cellMemberData || cellMemberData.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <p className="text-sm text-slate-400 text-center">No cell data available.</p>
      </div>
    )
  }
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <p className="text-sm font-bold text-slate-800">Active Members per Cell</p>
      <p className="text-xs text-slate-400 mt-0.5 mb-5">Active members vs. this week's meeting attendance, per cell</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={cellMemberData} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="cellName" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="memberCount" name="Active Members" fill="#6366f1" radius={[6, 6, 0, 0]} />
          <Bar dataKey="attended" name="Attended This Week" fill="#10b981" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export default DirectorDashboardCellWidgets
