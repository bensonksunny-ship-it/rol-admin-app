import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import {
  getSundayReportSummaries, getDelightVisitors, getCellGroups, getLatestCellReports,
} from '../../services/firestore'
import { format, startOfMonth, endOfMonth, eachWeekOfInterval, endOfWeek, isThisMonth } from 'date-fns'

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white/95 backdrop-blur border border-slate-200 rounded-xl px-3 py-2 shadow-lg text-xs">
      {label && <p className="text-slate-400 mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.fill }} className="font-semibold">
          {p.name}: {p.value?.toLocaleString?.() ?? p.value}
        </p>
      ))}
    </div>
  )
}

// Three stat cards a Founder actually wants at a glance — replaces the earlier
// full church-wide analytics panel (stat tiles, finance charts, payout review,
// activity lists), which felt cluttered on the landing page. Visitors of the
// Month, Total Attendance (Last Sunday), and Total Cell Attendance only.
export default function FounderInsightsPanel() {
  const [visitors, setVisitors] = useState([])
  const [lastSunday, setLastSunday] = useState(null)
  const [cellAttendance, setCellAttendance] = useState({ total: 0, cellCount: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getDelightVisitors(),
      getSundayReportSummaries(1),
      getCellGroups('Cell'),
      getLatestCellReports(200),
    ]).then(([vis, sundaySummaries, cells, cellReports]) => {
      setVisitors(vis)
      setLastSunday(sundaySummaries[0] || null)

      const activeCellIds = new Set(cells.filter(c => c.status !== 'inactive').map(c => c.id))
      const latestPerCell = {}
      cellReports.forEach(r => {
        if (!activeCellIds.has(r.cellId)) return
        if (!latestPerCell[r.cellId] || r.reportDate > latestPerCell[r.cellId].reportDate) {
          latestPerCell[r.cellId] = r
        }
      })
      const reportedCells = Object.values(latestPerCell)
      setCellAttendance({
        total: reportedCells.reduce((s, r) => s + (r.membersAttended || 0), 0),
        cellCount: reportedCells.length,
      })
    }).catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin mx-auto" />
          <p className="text-sm text-slate-400 font-medium">Loading insights…</p>
        </div>
      </div>
    )
  }

  const now = new Date()
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)
  const visitorsThisMonth = visitors.filter(v => v.attendedDate && isThisMonth(new Date(v.attendedDate)))

  const weekStarts = eachWeekOfInterval({ start: monthStart, end: monthEnd }, { weekStartsOn: 1 })
  const visitorsByWeek = weekStarts.map((wStart, idx) => {
    const wEnd = endOfWeek(wStart, { weekStartsOn: 1 })
    const clampedStart = wStart < monthStart ? monthStart : wStart
    const clampedEnd = wEnd > monthEnd ? monthEnd : wEnd
    const count = visitorsThisMonth.filter(v => {
      const d = new Date(v.attendedDate)
      return d >= clampedStart && d <= clampedEnd
    }).length
    return { week: `Wk ${idx + 1}`, Visitors: count }
  })

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

      {/* Visitors of the Month */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-bold text-slate-800">Visitors of the Month</p>
            <p className="text-xs text-slate-400">{format(now, 'MMMM yyyy')}</p>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-teal-50 text-teal-600 font-semibold">{visitorsThisMonth.length} total</span>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={visitorsByWeek}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="Visitors" fill="#14b8a6" radius={[4, 4, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Total Attendance — Last Sunday */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between">
        <div>
          <p className="text-sm font-bold text-slate-800">Total Attendance</p>
          <p className="text-xs text-slate-400">
            {lastSunday?.date ? `Last Sunday · ${format(new Date(lastSunday.date + 'T12:00:00'), 'd MMM yyyy')}` : 'No service recorded yet'}
          </p>
        </div>
        <p className="text-4xl font-black text-indigo-700 mt-6">
          {(lastSunday?.totalAttendance || 0).toLocaleString()}
        </p>
      </div>

      {/* Total Cell Attendance */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between">
        <div>
          <p className="text-sm font-bold text-slate-800">Total Cell Attendance</p>
          <p className="text-xs text-slate-400">Latest report per active cell · {cellAttendance.cellCount} cell{cellAttendance.cellCount === 1 ? '' : 's'} reporting</p>
        </div>
        <p className="text-4xl font-black text-emerald-700 mt-6">
          {cellAttendance.total.toLocaleString()}
        </p>
      </div>

    </div>
  )
}
