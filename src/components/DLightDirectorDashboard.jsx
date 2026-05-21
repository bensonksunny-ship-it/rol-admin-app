import { useMemo } from 'react'
import { format } from 'date-fns'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function topGroups(items, keyFn, colors, maxItems = 4) {
  const counts = {}
  items.forEach((item) => {
    const key = keyFn(item) || 'Unknown'
    counts[key] = (counts[key] || 0) + 1
  })
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
  const top = sorted.slice(0, maxItems)
  const otherCount = sorted.slice(maxItems).reduce((s, [, c]) => s + c, 0)
  if (otherCount > 0) top.push(['Other', otherCount])
  const total = Object.values(counts).reduce((s, c) => s + c, 0) || 1
  return top.map(([label, count], i) => ({
    label,
    count,
    pct: Math.round((count / total) * 100),
    color: colors[i] || colors[colors.length - 1],
  }))
}

function LegendBars({ items }) {
  const max = Math.max(...items.map((x) => x.count), 1)
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-slate-500 w-24 shrink-0 truncate" title={item.label}>{item.label}</span>
          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(item.count / max) * 100}%`, background: item.color }} />
          </div>
          <span className="text-xs font-semibold text-slate-700 w-8 text-right">{item.pct}%</span>
        </div>
      ))}
    </div>
  )
}

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

  const INDIGO_SHADES = ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff']
  const GREEN_SHADES  = ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0']
  const AMBER_SHADES  = ['#f59e0b', '#fbbf24', '#fcd34d', '#fde68a']

  const sourceData = useMemo(
    () => topGroups(visitorsThisYear, (v) => v.source || v.howKnown, INDIGO_SHADES),
    [visitorsThisYear]
  )

  const serviceData = useMemo(
    () => topGroups(visitorsThisYear, (v) => v.serviceAttended, GREEN_SHADES),
    [visitorsThisYear]
  )

  const taskData = useMemo(() => {
    const total = tasks.length || 1
    const comp = completedTasks.length
    const open = openTasks.length
    return [
      { label: 'Completed', count: comp, pct: Math.round((comp / total) * 100), color: '#10b981' },
      { label: 'Open',      count: open, pct: Math.round((open / total) * 100), color: '#f59e0b' },
    ]
  }, [tasks, completedTasks, openTasks])

  const teamBySubDept = useMemo(
    () => topGroups(
      activeTeam,
      (m) => {
        if (Array.isArray(m.subDepartments) && m.subDepartments.length) return m.subDepartments[0]
        return m.subDepartment || null
      },
      AMBER_SHADES
    ),
    [activeTeam]
  )

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

      {/* Charts Row 2: Source | Service | Tasks + Team */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-sm font-semibold text-slate-800 mb-3">Visitor Source</p>
          {sourceData.length === 0
            ? <p className="text-xs text-slate-400">No data yet</p>
            : <LegendBars items={sourceData} />}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-sm font-semibold text-slate-800 mb-3">Service Attended</p>
          {serviceData.length === 0
            ? <p className="text-xs text-slate-400">No data yet</p>
            : <LegendBars items={serviceData} />}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-800 mb-3">Planning Tasks</p>
            {tasks.length === 0
              ? <p className="text-xs text-slate-400">No tasks</p>
              : <LegendBars items={taskData} />}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800 mb-3">Team by Sub-dept</p>
            {teamBySubDept.length === 0
              ? <p className="text-xs text-slate-400">No team data</p>
              : <LegendBars items={teamBySubDept} />}
          </div>
        </div>
      </div>
    </div>
  )
}
