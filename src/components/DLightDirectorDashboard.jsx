import { useMemo } from 'react'
import { format } from 'date-fns'

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
    </div>
  )
}
