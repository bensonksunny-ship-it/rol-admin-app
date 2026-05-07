import { useEffect, useState } from 'react'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { getTasks, getAttendance, getFinanceIncome, getFinanceExpense } from '../services/firestore'
import { useAuth } from '../context/AuthContext'
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from 'date-fns'

const PIE_COLORS = ['#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b']

const GLASS = {
  background: 'rgba(255,255,255,0.06)',
  backdropFilter: 'blur(20px) saturate(180%)',
  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
  border: '1px solid rgba(255,255,255,0.1)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)',
}

const PAGE_BG = {
  background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 55%, #0f172a 100%)',
  minHeight: '100vh',
}

function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'rgba(15,23,42,0.96)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 10,
      padding: '8px 12px',
      fontSize: 12,
    }}>
      {label && <p style={{ color: '#94a3b8', marginBottom: 4, fontSize: 11 }}>{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.fill, fontWeight: 600, margin: '2px 0' }}>
          {p.name}: {p.value?.toLocaleString?.() ?? p.value}
        </p>
      ))}
    </div>
  )
}

function StatTile({ label, value, icon, glowColor, valueColor = '#ffffff' }) {
  return (
    <div className="dash-card dash-shimmer rounded-2xl p-4 relative" style={GLASS}>
      <div
        className="absolute -top-8 -right-8 w-24 h-24 rounded-full pointer-events-none"
        style={{ background: glowColor, filter: 'blur(24px)', opacity: 0.45 }}
      />
      <p className="text-xs text-slate-400 font-medium relative z-10 leading-snug mb-2">{label}</p>
      <p className="text-2xl font-bold relative z-10 leading-none" style={{ color: valueColor }}>
        {value}
      </p>
      <span className="absolute bottom-3 right-3 text-xl opacity-25 select-none pointer-events-none">{icon}</span>
    </div>
  )
}

export default function Dashboard() {
  const { hasPermission, isFounder } = useAuth()
  const [tasks, setTasks] = useState([])
  const [attendance, setAttendance] = useState([])
  const [income, setIncome] = useState([])
  const [expense, setExpense] = useState([])
  const [loading, setLoading] = useState(true)

  const year = new Date().getFullYear()
  const last6Months = eachMonthOfInterval({
    start: subMonths(new Date(), 5),
    end: new Date(),
  }).reverse()

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [tasksRes, attRes, incRes, expRes] = await Promise.all([
          getTasks(),
          hasPermission('attendance') ? getAttendance({ year }) : Promise.resolve([]),
          hasPermission('finance') ? getFinanceIncome({ year }) : Promise.resolve([]),
          hasPermission('finance') ? getFinanceExpense({ year }) : Promise.resolve([]),
        ])
        setTasks(tasksRes)
        setAttendance(attRes)
        setIncome(incRes)
        setExpense(expRes)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [year, hasPermission])

  const pendingTasks = tasks.filter((t) => t.status === 'Pending' || t.status === 'In Progress')
  const totalIncome = income.reduce((s, i) => s + (Number(i.amount) || 0), 0)
  const totalExpense = expense.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const balance = totalIncome - totalExpense

  const attendanceByMonth = last6Months.map((m) => {
    const start = startOfMonth(m)
    const end = endOfMonth(m)
    const items = attendance.filter((a) => a.date && new Date(a.date) >= start && new Date(a.date) <= end)
    const total = items.reduce((s, a) => {
      const eng = Number(a.englishService) || 0
      const tamil = Number(a.tamilService) || 0
      const jr = Number(a.juniorChurch) || 0
      const combined = Number(a.combinedService) || 0
      return s + (a.totalAttendance ?? eng + tamil + jr + combined)
    }, 0)
    return { month: format(m, 'MMM yy'), attendance: total }
  })

  const incomeVsExpense = last6Months.map((m) => {
    const start = startOfMonth(m)
    const end = endOfMonth(m)
    const inc = income
      .filter((i) => i.date && new Date(i.date) >= start && new Date(i.date) <= end)
      .reduce((s, i) => s + (Number(i.amount) || 0), 0)
    const exp = expense
      .filter((e) => e.date && new Date(e.date) >= start && new Date(e.date) <= end)
      .reduce((s, e) => s + (Number(e.amount) || 0), 0)
    return { month: format(m, 'MMM'), income: inc, expense: exp }
  })

  const deptTaskCount = tasks.reduce((acc, t) => {
    const d = t.department || 'Other'
    acc[d] = (acc[d] || 0) + 1
    return acc
  }, {})
  const departmentChart = Object.entries(deptTaskCount).map(([name, count]) => ({
    name: name.length > 12 ? name.slice(0, 12) + '…' : name,
    value: count,
  }))

  const totalAttendanceYtd = attendance.reduce((s, a) => s + (Number(a.totalAttendance) || 0), 0)

  if (loading) {
    return (
      <div
        className="relative -mx-4 -mt-14 -mb-20 lg:-mx-6 lg:-mt-5 lg:-mb-6 flex items-center justify-center"
        style={PAGE_BG}
      >
        <div className="text-center">
          <div className="w-10 h-10 rounded-full border-2 border-indigo-400/40 border-t-indigo-400 animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Loading dashboard…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative -mx-4 -mt-14 -mb-20 lg:-mx-6 lg:-mt-5 lg:-mb-6" style={PAGE_BG}>

      {/* Ambient glow orbs */}
      <div
        className="absolute top-0 right-0 w-[480px] h-[480px] pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)' }}
      />
      <div
        className="absolute bottom-0 left-0 w-96 h-96 pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%)' }}
      />
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-64 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(139,92,246,0.06) 0%, transparent 70%)' }}
      />

      {/* Content */}
      <div className="relative z-10 px-4 pt-14 pb-10 lg:px-6 lg:pt-5 space-y-5">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">Church operations at a glance</p>
        </div>

        {/* ── Stat tiles ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {hasPermission('attendance') && (
            <StatTile
              label="Attendance YTD"
              value={totalAttendanceYtd.toLocaleString()}
              icon="👥"
              glowColor="rgba(99,102,241,0.9)"
              valueColor="#a5b4fc"
            />
          )}
          {hasPermission('finance') && (
            <>
              <StatTile
                label="Income YTD"
                value={`RM ${totalIncome.toLocaleString()}`}
                icon="💰"
                glowColor="rgba(16,185,129,0.9)"
                valueColor="#6ee7b7"
              />
              <StatTile
                label="Expense YTD"
                value={`RM ${totalExpense.toLocaleString()}`}
                icon="📉"
                glowColor="rgba(239,68,68,0.9)"
                valueColor="#fca5a5"
              />
              <StatTile
                label="Balance YTD"
                value={`RM ${balance.toLocaleString()}`}
                icon="⚖️"
                glowColor={balance >= 0 ? 'rgba(139,92,246,0.9)' : 'rgba(239,68,68,0.9)'}
                valueColor={balance >= 0 ? '#c4b5fd' : '#fca5a5'}
              />
            </>
          )}
          {hasPermission('tasks') && (
            <StatTile
              label="Pending Tasks"
              value={pendingTasks.length}
              icon="✅"
              glowColor="rgba(245,158,11,0.9)"
              valueColor="#fcd34d"
            />
          )}
          {(hasPermission('pastorHub') || isFounder) && (
            <StatTile
              label="Sunday Planning"
              value="0%"
              icon="📋"
              glowColor="rgba(99,102,241,0.9)"
              valueColor="#818cf8"
            />
          )}
        </div>

        {/* ── Charts row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {hasPermission('attendance') && attendanceByMonth.length > 0 && (
            <div className="dash-card dash-shimmer rounded-2xl p-5" style={GLASS}>
              <h2 className="text-sm font-semibold text-white mb-4 tracking-wide">Attendance Trends</h2>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={attendanceByMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                  />
                  <Tooltip content={<DarkTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="attendance"
                    stroke="#818cf8"
                    strokeWidth={2.5}
                    dot={{ fill: '#6366f1', r: 3, strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: '#a5b4fc', strokeWidth: 0 }}
                    name="Attendance"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {hasPermission('finance') && incomeVsExpense.length > 0 && (
            <div className="dash-card dash-shimmer rounded-2xl p-5" style={GLASS}>
              <h2 className="text-sm font-semibold text-white mb-4 tracking-wide">Income vs Expense</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={incomeVsExpense} barGap={4} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                  />
                  <Tooltip content={<DarkTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#64748b', paddingTop: 8 }} />
                  <Bar dataKey="income" fill="#34d399" name="Income" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="expense" fill="#f87171" name="Expense" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* ── Bottom bento: pie + tasks list ── */}
        {hasPermission('tasks') && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

            {departmentChart.length > 0 && (
              <div className="dash-card dash-shimmer rounded-2xl p-5 lg:col-span-2" style={GLASS}>
                <h2 className="text-sm font-semibold text-white mb-3 tracking-wide">Tasks by Department</h2>
                <ResponsiveContainer width="100%" height={210}>
                  <PieChart>
                    <Pie
                      data={departmentChart}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={30}
                      outerRadius={72}
                      paddingAngle={3}
                    >
                      {departmentChart.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<DarkTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#64748b' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            <div
              className={`dash-card dash-shimmer rounded-2xl p-5 ${departmentChart.length > 0 ? 'lg:col-span-3' : 'lg:col-span-5'}`}
              style={GLASS}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-white tracking-wide">Pending Tasks</h2>
                <span
                  className="text-xs px-2.5 py-0.5 rounded-full font-medium"
                  style={{
                    background: 'rgba(245,158,11,0.12)',
                    color: '#fcd34d',
                    border: '1px solid rgba(245,158,11,0.22)',
                  }}
                >
                  {pendingTasks.length} open
                </span>
              </div>

              {pendingTasks.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-8">All clear — no pending tasks</p>
              ) : (
                <div className="space-y-2">
                  {pendingTasks.slice(0, 6).map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.07)',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: t.status === 'In Progress' ? '#60a5fa' : '#fbbf24' }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200 truncate font-medium">
                          {t.title || t.task || 'Untitled task'}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">{t.department || '—'}</p>
                      </div>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium"
                        style={
                          t.status === 'In Progress'
                            ? { background: 'rgba(59,130,246,0.15)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.2)' }
                            : { background: 'rgba(245,158,11,0.12)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.2)' }
                        }
                      >
                        {t.status}
                      </span>
                    </div>
                  ))}
                  {pendingTasks.length > 6 && (
                    <p className="text-xs text-slate-600 text-center pt-1">+{pendingTasks.length - 6} more tasks</p>
                  )}
                </div>
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  )
}
