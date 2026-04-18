import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  LineChart,
  Line,
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
import { computeMeetingDateISO, totalAttendanceFromCellReport } from '../utils/cellWeek'

const CELL_DEPARTMENT = 'Cell'
const MAX_TREND_CELLS = 6
const TREND_COLORS = ['#1e40af', '#059669', '#d97706', '#7c3aed', '#db2777', '#0d9488']

/** Departments user is Director of (from positions). */
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

/** Founder → all active cells; Director → cells whose group.department matches a directed department. */
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
  // Other department Directors: show dashboard only if they have a Director position (filter may yield rows)
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

/** Simple alert strip — placeholder for future WhatsApp / deep links. */
export function AlertPanelCellReports({ missingCount, onOpenDetails }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-amber-900">Alerts</h3>
          <p className="text-sm text-amber-800/90 mt-0.5">
            Weekly cell report status (read-only). WhatsApp reminders — coming later.
          </p>
        </div>
        {missingCount > 0 && (
          <button
            type="button"
            onClick={onOpenDetails}
            className="text-sm font-medium text-amber-900 underline decoration-amber-600 hover:text-amber-950"
          >
            🔴 {missingCount} cell{missingCount === 1 ? '' : 's'} missing reports — view list
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Missing cell reports for the current week (same meeting-date rules as Cell Report).
 */
export function MissingCellReportsTable({ rows, loading, remindLeader }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <h2 className="font-semibold text-slate-800 mb-1">Missing cell reports</h2>
      <p className="text-sm text-slate-500 mb-4">
        Current week (Mon–Sun). Expected report date follows each cell&apos;s meeting day.
      </p>
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">No cell groups in scope.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600">
                <th className="py-2 pr-4 font-medium">Cell name</th>
                <th className="py-2 pr-4 font-medium">Leader</th>
                <th className="py-2 pr-4 font-medium">Due date</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 font-medium w-36" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.cellId} className="border-b border-slate-100">
                  <td className="py-2 pr-4 text-slate-800">{row.cellName}</td>
                  <td className="py-2 pr-4 text-slate-700">{row.leaderName || '—'}</td>
                  <td className="py-2 pr-4 text-slate-600 tabular-nums">{row.expectedDate}</td>
                  <td className="py-2 pr-4">
                    {row.submitted ? (
                      <span className="text-emerald-700 font-medium">✅ Submitted</span>
                    ) : (
                      <span className="text-red-600 font-medium">❌ Missing</span>
                    )}
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => remindLeader(row)}
                      className="text-xs px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                    >
                      Remind leader
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function CellWeeklyTrendsChart({ chartData, cellSeries }) {
  if (!chartData?.length || !cellSeries?.length) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h2 className="font-semibold text-slate-800 mb-1">Weekly trends — cell attendance</h2>
        <p className="text-sm text-slate-500">Not enough data to chart yet.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <h2 className="font-semibold text-slate-800 mb-1">Weekly trends — cell attendance</h2>
      <p className="text-sm text-slate-500 mb-4">Total attendance per meeting report (last 6 weeks, up to {MAX_TREND_CELLS} cells).</p>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="weekLabel" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip />
          <Legend />
          {cellSeries.map((c, i) => (
            <Line
              key={c.id}
              type="monotone"
              dataKey={c.id}
              name={c.shortName}
              stroke={TREND_COLORS[i % TREND_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * Loads cell groups + latest reports once; drives alert, missing table, and trends chart.
 */
export function DirectorDashboardCellWidgets({ userProfile }) {
  const [cellGroups, setCellGroups] = useState([])
  const [latestReports, setLatestCellReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [scrollToTable, setScrollToTable] = useState(false)

  const weekStartDate = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), [])

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

  useEffect(() => {
    load()
  }, [load])

  const isFounder = isFounderUser(userProfile) || userProfile?.role === ROLES.FOUNDER

  const visibleGroups = useMemo(
    () => filterCellGroupsForDirectorView(cellGroups, userProfile),
    [cellGroups, userProfile]
  )

  const reportLookup = useMemo(() => buildReportLookup(latestReports), [latestReports])

  const rows = useMemo(() => {
    return visibleGroups.map((cell) => {
      const expectedDate = computeMeetingDateISO(cell.meetingDay, weekStartDate)
      const hit = reportLookup.get(`${cell.id}|${expectedDate}`)
      const submitted = Boolean(hit)
      return {
        cellId: cell.id,
        cellName: cell.cellName || 'Unnamed',
        leaderName: cell.leader || '',
        expectedDate,
        submitted: Boolean(hit),
      }
    })
  }, [visibleGroups, reportLookup, weekStartDate])

  const missingCount = useMemo(() => rows.filter((r) => !r.submitted).length, [rows])

  const trendCells = useMemo(() => visibleGroups.slice(0, MAX_TREND_CELLS), [visibleGroups])

  const chartData = useMemo(() => {
    const cur = startOfWeek(new Date(), { weekStartsOn: 1 })
    const weeks = [5, 4, 3, 2, 1, 0].map((i) => subWeeks(cur, i))
    return weeks.map((ws) => {
      const row = { weekLabel: format(ws, 'MMM d'), weekStart: format(ws, 'yyyy-MM-dd') }
      for (const cell of trendCells) {
        const expected = computeMeetingDateISO(cell.meetingDay, ws)
        const r = reportLookup.get(`${cell.id}|${expected}`)
        row[cell.id] = totalAttendanceFromCellReport(r)
      }
      return row
    })
  }, [reportLookup, trendCells])

  const cellSeries = useMemo(
    () =>
      trendCells.map((c) => ({
        id: c.id,
        shortName: (c.cellName || 'Cell').length > 14 ? `${(c.cellName || '').slice(0, 12)}…` : c.cellName || 'Cell',
      })),
    [trendCells]
  )

  const remindLeader = useCallback((row) => {
    // UI only — no WhatsApp / push yet
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
    <div className="space-y-6">
      <AlertPanelCellReports missingCount={missingCount} onOpenDetails={onOpenDetails} />
      <div id="missing-cell-reports-table">
        <MissingCellReportsTable rows={rows} loading={loading} remindLeader={remindLeader} />
      </div>
      <CellWeeklyTrendsChart chartData={chartData} cellSeries={cellSeries} />
    </div>
  )
}

export default DirectorDashboardCellWidgets
