import { useEffect, useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area,
} from 'recharts'
import {
  getTasks, getAttendance, getFinanceIncome, getFinanceExpense,
  getDelightVisitors, getCellGroups, getAllBoardPoints,
} from '../services/firestore'
import { useAuth } from '../context/AuthContext'
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths, isThisMonth, isThisYear } from 'date-fns'

// ─── helpers ─────────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function pct(curr, prev) {
  if (!prev) return null
  const d = ((curr - prev) / prev) * 100
  return d.toFixed(1)
}

function Trend({ value }) {
  if (value === null) return null
  const up = Number(value) >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-emerald-600' : 'text-red-500'}`}>
      {up ? '▲' : '▼'} {Math.abs(value)}%
    </span>
  )
}

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

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, trend, accent, to }) {
  const inner = (
    <div className={`relative overflow-hidden rounded-2xl p-4 h-full border ${accent.border} ${accent.bg} transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5`}>
      {/* Glow blob */}
      <div className={`absolute -top-6 -right-6 w-20 h-20 rounded-full opacity-30 blur-2xl ${accent.blob}`} />
      <div className="relative">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg mb-3 ${accent.iconBg}`}>
          {icon}
        </div>
        <p className="text-xs font-medium text-slate-500 leading-snug">{label}</p>
        <p className={`text-2xl font-black mt-1 tracking-tight ${accent.value}`}>{value}</p>
        {(sub || trend !== undefined) && (
          <div className="flex items-center gap-2 mt-1.5">
            {sub && <span className="text-xs text-slate-400">{sub}</span>}
            {trend !== undefined && <Trend value={trend} />}
          </div>
        )}
      </div>
    </div>
  )
  if (to) return <Link to={to} className="block">{inner}</Link>
  return inner
}

const ACCENTS = {
  indigo: { bg: 'bg-indigo-50', border: 'border-indigo-100', blob: 'bg-indigo-400', iconBg: 'bg-indigo-100', value: 'text-indigo-700' },
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-100', blob: 'bg-emerald-400', iconBg: 'bg-emerald-100', value: 'text-emerald-700' },
  rose: { bg: 'bg-rose-50', border: 'border-rose-100', blob: 'bg-rose-400', iconBg: 'bg-rose-100', value: 'text-rose-600' },
  violet: { bg: 'bg-violet-50', border: 'border-violet-100', blob: 'bg-violet-400', iconBg: 'bg-violet-100', value: 'text-violet-700' },
  amber: { bg: 'bg-amber-50', border: 'border-amber-100', blob: 'bg-amber-400', iconBg: 'bg-amber-100', value: 'text-amber-700' },
  sky: { bg: 'bg-sky-50', border: 'border-sky-100', blob: 'bg-sky-400', iconBg: 'bg-sky-100', value: 'text-sky-700' },
  teal: { bg: 'bg-teal-50', border: 'border-teal-100', blob: 'bg-teal-400', iconBg: 'bg-teal-100', value: 'text-teal-700' },
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { isFounder, hasPermission, userProfile } = useAuth()
  if (userProfile && !isFounder) return <Navigate to="/departments" replace />

  const year = new Date().getFullYear()
  const now = new Date()
  const last6 = eachMonthOfInterval({ start: subMonths(now, 5), end: now })
  const prevMonth = subMonths(now, 1)

  const [tasks,      setTasks]      = useState([])
  const [attendance, setAttendance] = useState([])
  const [income,     setIncome]     = useState([])
  const [expense,    setExpense]    = useState([])
  const [visitors,   setVisitors]   = useState([])
  const [cells,      setCells]      = useState([])
  const [boardPts,   setBoardPts]   = useState([])
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    Promise.all([
      getTasks(),
      getAttendance({ year }),
      getFinanceIncome({ year }),
      getFinanceExpense({ year }),
      getDelightVisitors(),
      getCellGroups('Cell'),
      getAllBoardPoints(),
    ]).then(([t, a, inc, exp, vis, cel, bp]) => {
      setTasks(t); setAttendance(a); setIncome(inc); setExpense(exp)
      setVisitors(vis); setCells(cel); setBoardPts(bp)
    }).catch(console.error)
     .finally(() => setLoading(false))
  }, [year])

  // ── derived ─────────────────────────────────────────────────────────────────

  const pendingTasks = tasks.filter(t => t.status === 'Pending' || t.status === 'In Progress')

  const totalIncome  = income.reduce((s, i) => s + (Number(i.amount) || 0), 0)
  const totalExpense = expense.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const balance      = totalIncome - totalExpense

  const totalAttYtd  = attendance.reduce((s, a) => s + (Number(a.totalAttendance) || 0), 0)

  const visitorsThisMonth = visitors.filter(v => v.attendedDate && isThisMonth(new Date(v.attendedDate))).length
  const visitorsLastMonth = visitors.filter(v => {
    if (!v.attendedDate) return false
    const d = new Date(v.attendedDate)
    return d >= startOfMonth(prevMonth) && d <= endOfMonth(prevMonth)
  }).length
  const visitorsYtd = visitors.filter(v => v.attendedDate && isThisYear(new Date(v.attendedDate))).length

  const activeCells   = cells.filter(c => c.status !== 'inactive').length
  const pendingBoard  = boardPts.filter(p => p.status === 'pending').length
  const approvedBoard = boardPts.filter(p => p.status === 'approved').length

  // chart data
  const attByMonth = last6.map(m => {
    const items = attendance.filter(a => a.date && new Date(a.date) >= startOfMonth(m) && new Date(a.date) <= endOfMonth(m))
    const total = items.reduce((s, a) => s + (Number(a.totalAttendance) || 0), 0)
    return { month: format(m, 'MMM'), attendance: total }
  })

  const finByMonth = last6.map(m => {
    const s = startOfMonth(m), e = endOfMonth(m)
    const inc = income.filter(i => i.date && new Date(i.date) >= s && new Date(i.date) <= e).reduce((s, i) => s + (Number(i.amount)||0), 0)
    const exp = expense.filter(x => x.date && new Date(x.date) >= s && new Date(x.date) <= e).reduce((s, x) => s + (Number(x.amount)||0), 0)
    return { month: format(m, 'MMM'), Income: inc, Expense: exp }
  })

  const visitorsByMonth = last6.map(m => {
    const count = visitors.filter(v => v.attendedDate && new Date(v.attendedDate) >= startOfMonth(m) && new Date(v.attendedDate) <= endOfMonth(m)).length
    return { month: format(m, 'MMM'), Visitors: count }
  })

  const recentVisitors = [...visitors]
    .filter(v => v.attendedDate)
    .sort((a, b) => b.attendedDate.localeCompare(a.attendedDate))
    .slice(0, 6)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin mx-auto" />
          <p className="text-sm text-slate-400 font-medium">Loading Eden Garden…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8">

      {/* ── Hero header ─────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-600 p-6 text-white shadow-xl">
        {/* decorative blobs */}
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 w-32 h-32 rounded-full bg-violet-400/20 blur-2xl" />
        <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-indigo-200 text-sm font-medium">{greeting()}, {userProfile?.displayName?.split(' ')[0] || 'Pastor'} 👋</p>
              <h1 className="text-3xl font-black mt-1 tracking-tight">Eden Garden</h1>
              <p className="text-indigo-200 text-sm mt-1">River of Life Church · Operations at a glance</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-2xl font-bold tabular-nums">{format(now, 'dd')}</p>
              <p className="text-indigo-200 text-xs font-medium">{format(now, 'MMM yyyy')}</p>
              <p className="text-indigo-300 text-xs mt-0.5">{format(now, 'EEEE')}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 mt-5">
            <div className="bg-white/15 backdrop-blur rounded-xl px-4 py-2 text-center">
              <p className="text-2xl font-black">{activeCells}</p>
              <p className="text-indigo-200 text-xs">Active Cells</p>
            </div>
            <div className="bg-white/15 backdrop-blur rounded-xl px-4 py-2 text-center">
              <p className="text-2xl font-black">{visitorsYtd}</p>
              <p className="text-indigo-200 text-xs">Visitors {year}</p>
            </div>
            <div className="bg-white/15 backdrop-blur rounded-xl px-4 py-2 text-center">
              <p className="text-2xl font-black">{pendingTasks.length}</p>
              <p className="text-indigo-200 text-xs">Open Tasks</p>
            </div>
            {pendingBoard > 0 && (
              <div className="bg-amber-400/30 backdrop-blur rounded-xl px-4 py-2 text-center">
                <p className="text-2xl font-black">{pendingBoard}</p>
                <p className="text-indigo-100 text-xs">Board Points</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Stat tiles ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        <StatCard icon="👥" label="Attendance YTD" value={totalAttYtd.toLocaleString()}
          sub="all services" accent={ACCENTS.indigo} />
        <StatCard icon="🙏" label="Visitors This Month" value={visitorsThisMonth}
          sub={`${visitorsLastMonth} last month`} trend={pct(visitorsThisMonth, visitorsLastMonth)}
          accent={ACCENTS.teal} to="/department/d-light?tab=visitorEntry" />
        <StatCard icon="🌿" label="Active Cell Groups" value={activeCells}
          sub={`of ${cells.length} total`} accent={ACCENTS.emerald} to="/department/cell" />
        <StatCard icon="💰" label="Income YTD" value={`₹${totalIncome.toLocaleString()}`}
          accent={ACCENTS.sky} />
        <StatCard icon="📉" label="Expense YTD" value={`₹${totalExpense.toLocaleString()}`}
          accent={ACCENTS.rose} />
        <StatCard icon="⚖️" label="Balance YTD"
          value={`₹${Math.abs(balance).toLocaleString()}`}
          sub={balance >= 0 ? 'surplus' : 'deficit'}
          accent={balance >= 0 ? ACCENTS.violet : ACCENTS.rose} />
        <StatCard icon="✅" label="Pending Tasks" value={pendingTasks.length}
          accent={ACCENTS.amber} to="/tasks" />
      </div>

      {/* ── Charts row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Attendance trend */}
        <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-bold text-slate-800">Attendance</p>
              <p className="text-xs text-slate-400">Last 6 months</p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 font-semibold">{totalAttYtd.toLocaleString()} YTD</span>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={attByMonth}>
              <defs>
                <linearGradient id="attGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={32} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="attendance" stroke="#6366f1" strokeWidth={2.5}
                fill="url(#attGrad)" dot={{ fill: '#6366f1', r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5, strokeWidth: 0 }} name="Attendance" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Visitors trend */}
        <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-bold text-slate-800">New Visitors</p>
              <p className="text-xs text-slate-400">Last 6 months</p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-teal-50 text-teal-600 font-semibold">{visitorsYtd} this year</span>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={visitorsByMonth}>
              <defs>
                <linearGradient id="visGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#14b8a6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={28} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="Visitors" stroke="#14b8a6" strokeWidth={2.5}
                fill="url(#visGrad)" dot={{ fill: '#14b8a6', r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5, strokeWidth: 0 }} name="Visitors" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Finance chart */}
        <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-bold text-slate-800">Income vs Expense</p>
              <p className="text-xs text-slate-400">Last 6 months</p>
            </div>
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${balance >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'}`}>
              {balance >= 0 ? '+' : '-'}₹{Math.abs(balance).toLocaleString()}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={finByMonth} barGap={2} barCategoryGap="35%">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={36} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="Income" fill="#10b981" radius={[4,4,0,0]} maxBarSize={20} />
              <Bar dataKey="Expense" fill="#f43f5e" radius={[4,4,0,0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Bottom bento ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Recent visitors */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-800">Recent Visitors</p>
              <p className="text-xs text-slate-400 mt-0.5">{visitorsThisMonth} this month</p>
            </div>
            <Link to="/department/d-light?tab=visitorEntry"
              className="text-xs text-indigo-600 font-medium hover:underline">View all →</Link>
          </div>
          {recentVisitors.length === 0 ? (
            <p className="px-5 py-8 text-sm text-slate-400 text-center">No visitors recorded yet.</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {recentVisitors.map((v) => (
                <div key={v.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-700 text-sm font-bold flex items-center justify-center flex-shrink-0">
                    {v.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{v.name}</p>
                    <p className="text-xs text-slate-400">{v.attendedDate || '—'}</p>
                  </div>
                  {v.serviceAttended && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 flex-shrink-0">{v.serviceAttended}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Board meeting points */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-800">Board Meeting Agenda</p>
              <p className="text-xs text-slate-400 mt-0.5">{approvedBoard} approved · {pendingBoard} pending</p>
            </div>
            <Link to="/department/sec-core" className="text-xs text-indigo-600 font-medium hover:underline">Review →</Link>
          </div>
          {boardPts.length === 0 ? (
            <p className="px-5 py-8 text-sm text-slate-400 text-center">No agenda points submitted.</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {boardPts.slice(0, 5).map((bp) => (
                <div key={bp.id} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                  <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${bp.status === 'approved' ? 'bg-emerald-500' : bp.status === 'rejected' ? 'bg-red-400' : 'bg-amber-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800 line-clamp-1">{bp.point}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{bp.department}</p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    {bp.status === 'approved' && bp.allottedTime && (
                      <span className="text-xs text-emerald-600 font-semibold">⏱ {bp.allottedTime}</span>
                    )}
                    <p className={`text-[10px] font-semibold mt-0.5 ${bp.status === 'approved' ? 'text-emerald-600' : bp.status === 'rejected' ? 'text-red-500' : 'text-amber-600'}`}>
                      {bp.status.charAt(0).toUpperCase() + bp.status.slice(1)}
                    </p>
                  </div>
                </div>
              ))}
              {boardPts.length > 5 && (
                <p className="px-5 py-2 text-xs text-slate-400 text-center">+{boardPts.length - 5} more points</p>
              )}
            </div>
          )}
        </div>

        {/* Pending tasks */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-800">Open Tasks</p>
              <p className="text-xs text-slate-400 mt-0.5">{pendingTasks.length} need attention</p>
            </div>
            <Link to="/tasks" className="text-xs text-indigo-600 font-medium hover:underline">View all →</Link>
          </div>
          {pendingTasks.length === 0 ? (
            <p className="px-5 py-8 text-sm text-slate-400 text-center">All clear — no open tasks 🎉</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {pendingTasks.slice(0, 6).map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.status === 'In Progress' ? 'bg-indigo-500' : 'bg-amber-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{t.title || t.task || 'Untitled'}</p>
                    <p className="text-xs text-slate-400">{t.department || '—'}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                    t.status === 'In Progress'
                      ? 'bg-indigo-50 text-indigo-600'
                      : 'bg-amber-50 text-amber-600'
                  }`}>{t.status}</span>
                </div>
              ))}
              {pendingTasks.length > 6 && (
                <p className="px-5 py-2 text-xs text-slate-400 text-center">+{pendingTasks.length - 6} more tasks</p>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
