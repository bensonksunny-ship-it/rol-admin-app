import { useMemo } from 'react'
import { format } from 'date-fns'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts'

// ── palette (matches the rest of the app's Recharts usage; emerald+amber pair
//    validated CVD-safe, and every 2-series chart also carries a legend + text) ──
const INK = '#6366f1'       // indigo — magnitude / primary
const FILLED = '#10b981'    // emerald — filled / done
const OPEN = '#f59e0b'      // amber — open slot / gap
const PENDING = '#cbd5e1'   // slate — pending (not bad, just not done)
const GRID = '#f1f5f9'
const AXIS = '#94a3b8'

const axisTick = { fontSize: 11, fill: AXIS }
const tooltipStyle = { fontSize: 12, borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }

function nextSundayStr() {
  const d = new Date()
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7))
  return format(d, 'yyyy-MM-dd')
}
function upcomingSundays(n) {
  const first = new Date()
  first.setDate(first.getDate() + ((7 - first.getDay()) % 7))
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(first)
    d.setDate(first.getDate() + i * 7)
    return format(d, 'yyyy-MM-dd')
  })
}
const toDate = (v) => (v instanceof Date ? v : v?.toDate?.() || (v ? new Date(v) : null))
const daysAgoMs = (n) => Date.now() - n * 864e5
const startOfToday = () => new Date(new Date().toDateString())

function Card({ title, subtitle, children, action }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-800">{title}</p>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  )
}

function Empty({ children }) {
  return <p className="text-sm text-slate-400 text-center py-8">{children}</p>
}

export default function MediaHub({
  team = [], tasks = [], subDepartments = [], schedules = [], expenseEntries = [], onGoToAssign,
}) {
  const activeMembers = useMemo(
    () => team.filter((m) => !m.isFormer && m.status !== 'former'),
    [team],
  )
  const formerCount = team.length - activeMembers.length
  const totalRoles = subDepartments.length

  const scheduleByDate = useMemo(() => {
    const map = new Map()
    for (const s of schedules) map.set(s.date, s)
    return map
  }, [schedules])

  const coming = nextSundayStr()
  const comingSchedule = scheduleByDate.get(coming)
  const comingFilled = comingSchedule ? comingSchedule.assignments.length : 0
  const comingOpen = Math.max(0, totalRoles - comingFilled)

  const pendingTasks = tasks.filter((t) => t.status !== 'Completed')
  const today0 = startOfToday()
  const overdueTasks = pendingTasks.filter((t) => {
    if (!t.deadline) return false
    const d = new Date(t.deadline)
    return !isNaN(d) && d < today0
  })

  // ── §2 coverage: next 5 Sundays ──
  const coverageData = useMemo(() =>
    upcomingSundays(5).map((date) => {
      const s = scheduleByDate.get(date)
      const filled = s ? s.assignments.length : 0
      return { label: format(new Date(date + 'T12:00:00'), 'd MMM'), filled, open: Math.max(0, totalRoles - filled) }
    }),
  [scheduleByDate, totalRoles])

  const openRolesComing = useMemo(() => {
    if (!comingSchedule) return subDepartments.map((sd) => sd.name)
    const taken = comingSchedule.assignments
    return subDepartments
      .filter((sd) => !taken.some((a) => (a.subDeptId && a.subDeptId === sd.id) || a.role === sd.name))
      .map((sd) => sd.name)
  }, [comingSchedule, subDepartments])

  // ── §3 serving load: last 8 Sundays ──
  const servingLoad = useMemo(() => {
    const recent = [...schedules].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8)
    const count = new Map()
    let total = 0
    for (const s of recent) {
      for (const a of s.assignments) {
        if (!a.memberName) continue
        count.set(a.memberName, (count.get(a.memberName) || 0) + 1)
        total += 1
      }
    }
    const rows = [...count.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n)
    const rostered = new Set(count.keys())
    const notRostered = activeMembers.filter((m) => !rostered.has(m.name)).map((m) => m.name)
    const top = rows[0]
    const overloaded = top && total > 0 && top.n / total > 0.4 ? top : null
    return { rows, notRostered, total, overloaded, windowCount: recent.length }
  }, [schedules, activeMembers])

  // ── §4 team by serving area ──
  const teamByArea = useMemo(() => {
    const rows = subDepartments.map((sd) => ({
      name: sd.name,
      n: activeMembers.filter((m) => Array.isArray(m.subDepartments) && m.subDepartments.includes(sd.name)).length,
    }))
    const unassigned = activeMembers.filter((m) => !Array.isArray(m.subDepartments) || m.subDepartments.length === 0).length
    if (unassigned > 0) rows.push({ name: 'Unassigned', n: unassigned })
    return rows
  }, [subDepartments, activeMembers])

  // ── §5 tasks + spend ──
  const doneRecent = useMemo(() => {
    const cutoff = daysAgoMs(60)
    return tasks.filter((t) => {
      if (t.status !== 'Completed') return false
      const d = toDate(t.completedAt || t.updatedAt || t.createdAt)
      return d && d.getTime() >= cutoff
    }).length
  }, [tasks])

  const spendData = useMemo(() => {
    const now = new Date()
    const buckets = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      buckets.push({ key: format(d, 'yyyy-MM'), month: format(d, 'MMM'), amount: 0 })
    }
    const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]))
    for (const e of expenseEntries) {
      const d = toDate(e.date)
      if (!d) continue
      const k = format(d, 'yyyy-MM')
      if (byKey[k]) byKey[k].amount += Number(e.amount) || 0
    }
    return buckets
  }, [expenseEntries])
  const thisMonthSpend = spendData[spendData.length - 1]?.amount || 0

  const hasSchedules = schedules.length > 0

  return (
    <div className="space-y-4">
      {/* ── §1 stat row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile value={activeMembers.length} label="Team members" hint={formerCount > 0 ? `+${formerCount} former` : null} tone="indigo" />
        <StatTile value={totalRoles} label="Serving areas" tone="violet" />
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-2xl border border-emerald-200 shadow-sm px-4 py-3">
          <p className="text-xs font-semibold text-emerald-600">This Sunday</p>
          {comingSchedule ? (
            <>
              <div className="flex items-end gap-1 mt-0.5">
                <p className="text-2xl font-black text-emerald-700">{comingFilled}</p>
                <p className="text-sm font-bold text-emerald-400 mb-0.5">/{totalRoles} roles</p>
              </div>
              <div className="mt-1.5 h-1.5 bg-emerald-200 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: totalRoles ? `${(comingFilled / totalRoles) * 100}%` : '0%' }} />
              </div>
              <p className={`text-[10px] mt-0.5 ${comingOpen > 0 ? 'text-amber-600 font-semibold' : 'text-emerald-500'}`}>
                {comingOpen > 0 ? `${comingOpen} slot${comingOpen !== 1 ? 's' : ''} open` : 'Fully covered'}
              </p>
            </>
          ) : (
            <p className="text-sm text-emerald-500 mt-2">No plan yet</p>
          )}
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-2xl border border-amber-200 shadow-sm px-4 py-3">
          <p className="text-2xl font-black text-amber-600">{pendingTasks.length}</p>
          <p className="text-xs font-semibold text-amber-500 mt-0.5">Open tasks</p>
          {overdueTasks.length > 0 && <p className="text-[10px] text-rose-500 font-semibold mt-1">{overdueTasks.length} overdue</p>}
        </div>
      </div>

      {/* ── §2 crew coverage ── */}
      <Card
        title="Crew coverage — next 5 Sundays"
        subtitle="Roles filled vs still open, per service"
        action={onGoToAssign && (
          <button type="button" onClick={onGoToAssign} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 whitespace-nowrap">Go to Assign →</button>
        )}
      >
        {!hasSchedules ? (
          <Empty>Assign crew in the Assign tab to see coverage here.</Empty>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={coverageData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis tick={axisTick} allowDecimals={false} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="filled" name="Filled" stackId="a" fill={FILLED} radius={[0, 0, 0, 0]} />
                <Bar dataKey="open" name="Open" stackId="a" fill={OPEN} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            {openRolesComing.length > 0 && (
              <p className="text-xs text-slate-500 mt-2">
                <span className="font-semibold text-amber-600">Open this Sunday:</span> {openRolesComing.join(', ')}
              </p>
            )}
          </>
        )}
      </Card>

      {/* ── §3 serving load ── */}
      <Card title="Serving load" subtitle={`Assignments per member across the last ${servingLoad.windowCount || 8} service${servingLoad.windowCount === 1 ? '' : 's'}`}>
        {servingLoad.rows.length === 0 ? (
          <Empty>No crew assigned yet — plan a few Sundays in the Assign tab.</Empty>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={Math.max(140, servingLoad.rows.length * 34)}>
              <BarChart data={servingLoad.rows} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" tick={axisTick} allowDecimals={false} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={axisTick} width={110} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="n" name="Assignments" fill={INK} radius={[0, 6, 6, 0]} label={{ position: 'right', fontSize: 11, fill: AXIS }} />
              </BarChart>
            </ResponsiveContainer>
            {servingLoad.overloaded && (
              <p className="text-xs text-amber-600 mt-2">
                {servingLoad.overloaded.name} has {servingLoad.overloaded.n} of {servingLoad.total} assignments — consider spreading the load.
              </p>
            )}
            {servingLoad.notRostered.length > 0 && (
              <p className="text-xs text-slate-400 mt-1">Not yet rostered: {servingLoad.notRostered.join(', ')}</p>
            )}
          </>
        )}
      </Card>

      {/* ── §4 team by area ── */}
      <Card title="Team by serving area" subtitle={`${activeMembers.length} active · ${formerCount} former`}>
        {teamByArea.length === 0 ? (
          <Empty>Add serving areas and team members on the The Team page.</Empty>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={teamByArea} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} interval={0} />
              <YAxis tick={axisTick} allowDecimals={false} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="n" name="Active members" fill={INK} radius={[6, 6, 0, 0]}>
                {teamByArea.map((row) => (
                  <Cell key={row.name} fill={row.name === 'Unassigned' ? PENDING : INK} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* ── §5 tasks + spend ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Tasks" subtitle="Open now vs completed in the last 60 days">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
                <div className="bg-slate-300" style={{ flex: pendingTasks.length || 0.0001 }} />
                <div className="bg-emerald-500" style={{ flex: doneRecent || 0.0001 }} />
              </div>
              <div className="flex justify-between mt-1.5 text-xs">
                <span className="text-slate-500"><span className="font-bold text-slate-700">{pendingTasks.length}</span> open</span>
                <span className="text-slate-500"><span className="font-bold text-emerald-600">{doneRecent}</span> done (60d)</span>
              </div>
            </div>
          </div>
          {overdueTasks.length > 0 && <p className="text-xs text-rose-500 font-semibold mt-3">{overdueTasks.length} task{overdueTasks.length !== 1 ? 's' : ''} overdue</p>}
        </Card>

        <Card title="Spend" subtitle="Last 6 months" action={<span className="text-xs font-semibold text-slate-700">₹{thisMonthSpend.toLocaleString('en-IN')} this month</span>}>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={spendData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Spend']} />
              <Bar dataKey="amount" name="Spend" fill={INK} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  )
}

function StatTile({ value, label, hint, tone }) {
  const tones = {
    indigo: { box: 'from-indigo-50 to-indigo-100 border-indigo-200', val: 'text-indigo-700', lab: 'text-indigo-500', hint: 'text-indigo-400' },
    violet: { box: 'from-violet-50 to-violet-100 border-violet-200', val: 'text-violet-700', lab: 'text-violet-500', hint: 'text-violet-400' },
  }
  const t = tones[tone] || tones.indigo
  return (
    <div className={`bg-gradient-to-br rounded-2xl border shadow-sm px-4 py-3 ${t.box}`}>
      <p className={`text-2xl font-black ${t.val}`}>{value}</p>
      <p className={`text-xs font-semibold mt-0.5 ${t.lab}`}>{label}</p>
      {hint && <p className={`text-[10px] mt-1 ${t.hint}`}>{hint}</p>}
    </div>
  )
}
