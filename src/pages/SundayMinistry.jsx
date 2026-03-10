import { useEffect, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts'
import { getAttendance, createAttendance, updateAttendance } from '../services/firestore'
import { useAuth } from '../context/AuthContext'
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from 'date-fns'
import { formatDMY } from '../utils/date'

function computeTotals(record) {
  const eng = Number(record.englishService) || 0
  const tamil = Number(record.tamilService) || 0
  const jr = Number(record.juniorChurch) || 0
  const combined = Number(record.combinedService) || 0
  const totalAdult = eng + tamil + combined
  const totalAttendance = totalAdult + jr
  return { totalAdult, totalAttendance }
}

export default function SundayMinistry() {
  const { hasPermission } = useAuth()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    englishService: '',
    tamilService: '',
    juniorChurch: '',
    combinedService: '',
  })
  const [year, setYear] = useState(new Date().getFullYear())

  const canEnter = hasPermission('enterAttendance')

  useEffect(() => {
    getAttendance({ year }).then(setRecords).finally(() => setLoading(false))
  }, [year])

  const last6Months = eachMonthOfInterval({
    start: subMonths(new Date(), 5),
    end: new Date(),
  }).reverse()

  const monthlyTotals = last6Months.map((m) => {
    const start = startOfMonth(m)
    const end = endOfMonth(m)
    const items = records.filter(
      (a) => a.date && new Date(a.date) >= start && new Date(a.date) <= end
    )
    const total = items.reduce((s, a) => s + (computeTotals(a).totalAttendance || 0), 0)
    return { month: format(m, 'MMM yyyy'), total }
  })

  const languageData = records.slice(0, 8).reverse().map((a) => ({
    date: a.date ? format(new Date(a.date), 'dd MMM') : '',
    English: Number(a.englishService) || 0,
    Tamil: Number(a.tamilService) || 0,
    'Junior Church': Number(a.juniorChurch) || 0,
  }))

  const yearlyTotal = records.reduce(
    (s, a) => s + (computeTotals(a).totalAttendance || 0),
    0
  )
  const monthlyAverage =
    records.length > 0 ? Math.round(yearlyTotal / records.length) : 0

  async function handleSubmit(e) {
    e.preventDefault()
    const { totalAdult, totalAttendance } = computeTotals(form)
    const payload = {
      date: form.date,
      englishService: Number(form.englishService) || 0,
      tamilService: Number(form.tamilService) || 0,
      juniorChurch: Number(form.juniorChurch) || 0,
      combinedService: Number(form.combinedService) || 0,
      totalAdult,
      totalAttendance,
    }
    try {
      if (form.id) {
        await updateAttendance(form.id, payload)
      } else {
        await createAttendance(payload)
      }
      setModal(null)
      setRecords(await getAttendance({ year }))
    } catch (err) {
      console.error(err)
      alert('Failed to save')
    }
  }

  function openAdd() {
    setForm({
      date: format(new Date(), 'yyyy-MM-dd'),
      englishService: '',
      tamilService: '',
      juniorChurch: '',
      combinedService: '',
    })
    setModal('add')
  }

  function openEdit(r) {
    setForm({
      id: r.id,
      date: format(new Date(r.date), 'yyyy-MM-dd'),
      englishService: r.englishService ?? '',
      tamilService: r.tamilService ?? '',
      juniorChurch: r.juniorChurch ?? '',
      combinedService: r.combinedService ?? '',
    })
    setModal('edit')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Sunday Ministry</h1>
          <p className="text-slate-500 mt-1">Weekly attendance – English, Tamil, Junior Church, Combined</p>
        </div>
        {canEnter && (
          <button
            onClick={openAdd}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
          >
            + Add Attendance
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <label className="text-sm text-slate-600">Year:</label>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="px-3 py-2 rounded-lg border border-slate-300"
        >
          {[year, year - 1, year - 2].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total Attendance ({year})</p>
          <p className="text-2xl font-bold text-slate-800">{yearlyTotal.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm text-slate-500">Services Recorded</p>
          <p className="text-2xl font-bold text-slate-800">{records.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm text-slate-500">Monthly Average</p>
          <p className="text-2xl font-bold text-slate-800">{monthlyAverage}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="font-semibold text-slate-800 mb-4">Attendance Trends</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={monthlyTotals}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="total" stroke="#1e40af" strokeWidth={2} name="Total" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="font-semibold text-slate-800 mb-4">Language-wise (Recent)</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={languageData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="English" fill="#1e40af" stackId="a" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Tamil" fill="#3b82f6" stackId="a" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Junior Church" fill="#60a5fa" stackId="a" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <h2 className="px-5 py-4 font-semibold text-slate-800 border-b border-slate-200">
          Attendance Records
        </h2>
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading...</div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No records for this year.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Date</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">English</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Tamil</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Junior Church</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Combined</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Total</th>
                  {canEnter && <th className="px-5 py-3"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {records.map((r) => {
                  const { totalAttendance } = computeTotals(r)
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3 text-slate-800">
                        {formatDMY(r.date)}
                      </td>
                      <td className="px-5 py-3 text-slate-600">{r.englishService ?? '—'}</td>
                      <td className="px-5 py-3 text-slate-600">{r.tamilService ?? '—'}</td>
                      <td className="px-5 py-3 text-slate-600">{r.juniorChurch ?? '—'}</td>
                      <td className="px-5 py-3 text-slate-600">{r.combinedService ?? '—'}</td>
                      <td className="px-5 py-3 font-medium text-slate-800">{totalAttendance}</td>
                      {canEnter && (
                        <td className="px-5 py-3">
                          <button
                            onClick={() => openEdit(r)}
                            className="text-blue-600 hover:underline text-sm"
                          >
                            Edit
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold">
                {modal === 'add' ? 'Add Attendance' : 'Edit Attendance'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">English Service</label>
                <input
                  type="number"
                  min="0"
                  value={form.englishService}
                  onChange={(e) => setForm((f) => ({ ...f, englishService: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tamil Service</label>
                <input
                  type="number"
                  min="0"
                  value={form.tamilService}
                  onChange={(e) => setForm((f) => ({ ...f, tamilService: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Junior Church</label>
                <input
                  type="number"
                  min="0"
                  value={form.juniorChurch}
                  onChange={(e) => setForm((f) => ({ ...f, juniorChurch: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Combined Service</label>
                <input
                  type="number"
                  min="0"
                  value={form.combinedService}
                  onChange={(e) => setForm((f) => ({ ...f, combinedService: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
