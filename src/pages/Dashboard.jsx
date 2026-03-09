import { useEffect, useState } from 'react'
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
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { getTasks } from '../services/firestore'
import { getAttendance } from '../services/firestore'
import { getFinanceIncome, getFinanceExpense } from '../services/firestore'
import { useAuth } from '../context/AuthContext'
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from 'date-fns'

const COLORS = ['#1e40af', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe']

export default function Dashboard() {
  const { hasPermission } = useAuth()
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
  const completedTasks = tasks.filter((t) => t.status === 'Completed')

  const totalIncome = income.reduce((s, i) => s + (Number(i.amount) || 0), 0)
  const totalExpense = expense.reduce((s, e) => s + (Number(e.amount) || 0), 0)

  const attendanceByMonth = last6Months.map((m) => {
    const start = startOfMonth(m)
    const end = endOfMonth(m)
    const items = attendance.filter(
      (a) => a.date && new Date(a.date) >= start && new Date(a.date) <= end
    )
    const total = items.reduce((s, a) => {
      const eng = Number(a.englishService) || 0
      const tamil = Number(a.tamilService) || 0
      const jr = Number(a.juniorChurch) || 0
      const combined = Number(a.combinedService) || 0
      return s + (a.totalAttendance ?? eng + tamil + jr + combined)
    }, 0)
    return { month: format(m, 'MMM yyyy'), attendance: total }
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
    return {
      month: format(m, 'MMM'),
      income: inc,
      expense: exp,
    }
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
      <div className="flex items-center justify-center py-20">
        <div className="text-slate-500">Loading dashboard...</div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-slate-500 mt-1">Overview of church operations</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {hasPermission('attendance') && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <p className="text-sm text-slate-500">Total Attendance (YTD)</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{totalAttendanceYtd.toLocaleString()}</p>
          </div>
        )}
        {hasPermission('finance') && (
          <>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <p className="text-sm text-slate-500">Total Income (YTD)</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">
                RM {totalIncome.toLocaleString()}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <p className="text-sm text-slate-500">Total Expense (YTD)</p>
              <p className="text-2xl font-bold text-red-600 mt-1">
                RM {totalExpense.toLocaleString()}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <p className="text-sm text-slate-500">Balance (YTD)</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">
                RM {(totalIncome - totalExpense).toLocaleString()}
              </p>
            </div>
          </>
        )}
        {hasPermission('tasks') && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <p className="text-sm text-slate-500">Pending Tasks</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">{pendingTasks.length}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {hasPermission('attendance') && attendanceByMonth.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h2 className="font-semibold text-slate-800 mb-4">Attendance Trends</h2>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={attendanceByMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="attendance" stroke="#1e40af" strokeWidth={2} name="Attendance" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {hasPermission('finance') && incomeVsExpense.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h2 className="font-semibold text-slate-800 mb-4">Income vs Expense</h2>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={incomeVsExpense}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="income" fill="#10b981" name="Income" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" fill="#ef4444" name="Expense" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {hasPermission('tasks') && departmentChart.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm max-w-md">
          <h2 className="font-semibold text-slate-800 mb-4">Department Activity (Tasks)</h2>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={departmentChart}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label
              >
                {departmentChart.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
