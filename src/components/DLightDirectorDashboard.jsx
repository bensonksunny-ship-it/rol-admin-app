import { useMemo } from 'react'
import { format } from 'date-fns'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function KpiTile({ label, value, sub, valueColor = 'text-slate-800' }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">{label}</p>
      <p className={`text-3xl font-extrabold leading-none ${valueColor}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

export default function DLightDirectorDashboard({ visitors = [], team = [], subDepartments = [], tasks = [], loading = false, currentYear }) {
  const now = new Date()
  const currentMonth = now.getMonth()

  const visitorsThisYear = useMemo(
    () => visitors.filter((v) => (v.year || currentYear) === currentYear),
    [visitors, currentYear]
  )

  const visitorsLastYear = useMemo(
    () => visitors.filter((v) => (v.year || currentYear) === currentYear - 1),
    [visitors, currentYear]
  )

  const visitorsThisMonth = useMemo(
    () => visitorsThisYear.filter((v) => {
      if (!v.attendedDate) return false
      return new Date(v.attendedDate).getMonth() === currentMonth
    }),
    [visitorsThisYear, currentMonth]
  )

  const activeTeam = useMemo(
    () => team.filter((m) => m.status !== 'former'),
    [team]
  )

  const completedTasks = useMemo(() => tasks.filter((t) => t.status === 'Completed'), [tasks])
  const openTasks = useMemo(() => tasks.filter((t) => t.status !== 'Completed'), [tasks])

  const monthlyData = useMemo(() => {
    const counts = Array(12).fill(0)
    visitorsThisYear.forEach((v) => {
      const d = v.attendedDate ? new Date(v.attendedDate) : null
      if (d && !isNaN(d)) counts[d.getMonth()]++
    })
    return MONTHS.map((m, i) => ({ month: m, count: counts[i], future: i > currentMonth }))
  }, [visitorsThisYear, currentMonth])

  const yoyData = useMemo(() => {
    const curr = Array(currentMonth + 1).fill(0)
    const prev = Array(currentMonth + 1).fill(0)
    visitorsThisYear.forEach((v) => {
      const d = v.attendedDate ? new Date(v.attendedDate) : null
      if (d && !isNaN(d) && d.getMonth() <= currentMonth) curr[d.getMonth()]++
    })
    visitorsLastYear.forEach((v) => {
      const d = v.attendedDate ? new Date(v.attendedDate) : null
      if (d && !isNaN(d) && d.getMonth() <= currentMonth) prev[d.getMonth()]++
    })
    return MONTHS.slice(0, currentMonth + 1).map((m, i) => ({
      month: m,
      [currentYear]: curr[i],
      [currentYear - 1]: prev[i],
    }))
  }, [visitorsThisYear, visitorsLastYear, currentMonth, currentYear])

  const yoyDelta = visitorsThisYear.length - visitorsLastYear.length
  const yoyLabel = yoyDelta === 0
    ? 'same as last year'
    : yoyDelta > 0
      ? `↑ ${yoyDelta} more than ${currentYear - 1}`
      : `↓ ${Math.abs(yoyDelta)} fewer than ${currentYear - 1}`

  if (loading) {
    return <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500 shadow-sm">Loading dashboard…</div>
  }

  return (
    <div className="space-y-4">
      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiTile
          label="Visitors This Year"
          value={visitorsThisYear.length}
          sub={yoyLabel}
          valueColor={yoyDelta >= 0 ? 'text-indigo-600' : 'text-slate-800'}
        />
        <KpiTile
          label="Team Members"
          value={activeTeam.length}
          sub={`Across ${subDepartments.length} sub-dept${subDepartments.length !== 1 ? 's' : ''}`}
        />
        <KpiTile
          label="Open Tasks"
          value={openTasks.length}
          sub={`${completedTasks.length} completed`}
          valueColor={openTasks.length > 0 ? 'text-amber-500' : 'text-emerald-600'}
        />
        <KpiTile
          label="This Month"
          value={visitorsThisMonth.length}
          sub={`Visitors in ${MONTHS[currentMonth]} ${currentYear}`}
          valueColor="text-emerald-600"
        />
      </div>

      {/* Charts Row 1: Monthly Trend + YoY */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-sm font-semibold text-slate-800 mb-3">Monthly Visitor Trend — {currentYear}</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={monthlyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} cursor={{ fill: '#f1f5f9' }} />
              <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={32}>
                {monthlyData.map((entry, i) => (
                  <Cell key={i} fill={entry.future ? '#e2e8f0' : '#6366f1'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-sm font-semibold text-slate-800 mb-1">Year-on-Year</p>
          <p className="text-xs text-slate-400 mb-3">Jan – {MONTHS[currentMonth]}</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={yoyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} cursor={{ fill: '#f1f5f9' }} />
              <Bar dataKey={currentYear - 1} fill="#a5b4fc" radius={[3, 3, 0, 0]} maxBarSize={16} />
              <Bar dataKey={currentYear} fill="#6366f1" radius={[3, 3, 0, 0]} maxBarSize={16} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-3 mt-1 justify-center">
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-indigo-300"></span>{currentYear - 1}
            </span>
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-indigo-600"></span>{currentYear}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
