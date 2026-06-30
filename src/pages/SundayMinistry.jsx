import { useEffect, useState, useRef } from 'react'
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
import {
  getAttendance,
  createAttendance,
  updateAttendance,
  getCellGroups,
  getCellGroupMembers,
  getSundayServiceAttendance,
  setSundayServiceAttendance,
  syncCellAttendanceToReport,
  getSundayChecklistDefaults,
  setSundayChecklistDefault,
  getSundayWeeklyChecklists,
  setSundayWeeklyChecklistItem,
  initWeeklyChecklistsFromDefaults,
} from '../services/firestore'
import { useAuth } from '../context/AuthContext'
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from 'date-fns'
import { formatDMY } from '../utils/date'

const CHECKLIST_DEPTS = ['Worship', 'D Light', 'Building Care', 'Media', 'Administration', 'River Kids']

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
  const { hasPermission, userProfile } = useAuth()
  const [activeTab, setActiveTab] = useState('overview')
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
  const canEditFull = hasPermission('editSundayPlanFull')

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
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Sunday Ministry</h1>
          <p className="text-slate-500 mt-1">Attendance · Cell tracking · Service checklists</p>
        </div>
        {canEnter && activeTab === 'overview' && (
          <button
            onClick={openAdd}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
          >
            + Add Attendance
          </button>
        )}
      </div>

      {/* Tab strip */}
      <div className="flex gap-1 bg-slate-100 rounded-2xl p-1 w-fit flex-wrap">
        {[
          { key: 'overview',     label: '📊 Overview' },
          { key: 'cellAttend',   label: '🧩 Cell Attendance' },
          { key: 'checklists',   label: '✅ Checklists' },
        ].map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'cellAttend' && (
        <CellAttendanceTab userProfile={userProfile} canEnter={canEnter} />
      )}
      {activeTab === 'checklists' && (
        <ChecklistsTab canEditFull={canEditFull} userProfile={userProfile} />
      )}
      {activeTab === 'overview' && <>

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
      </>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CELL ATTENDANCE TAB — accordion per cell + bubble grid of member names
// ─────────────────────────────────────────────────────────────────────────────

function CellAttendanceTab({ userProfile, canEnter }) {
  const todayISO = format(new Date(), 'yyyy-MM-dd')
  const [selectedDate, setSelectedDate] = useState(todayISO)
  const [cellGroups, setCellGroups] = useState([])
  const [search, setSearch] = useState('')
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [expanded, setExpanded] = useState({})
  // attendanceMap: { [cellId]: { presentIds: string[], loaded: boolean, loading: boolean } }
  const [attendanceMap, setAttendanceMap] = useState({})
  // membersMap: { [cellId]: Member[] }
  const [membersMap, setMembersMap] = useState({})
  const searchRef = useRef(null)

  useEffect(() => {
    setLoadingGroups(true)
    getCellGroups('Cell')
      .then(setCellGroups)
      .finally(() => setLoadingGroups(false))
  }, [])

  // Auto-expand cell group matching search
  useEffect(() => {
    if (!search) return
    const norm = search.toLowerCase()
    setCellGroups((prev) => {
      prev.forEach((g) => {
        if (String(g.cellName || '').toLowerCase().includes(norm)) {
          setExpanded((e) => ({ ...e, [g.id]: true }))
          loadCell(g.id)
        }
      })
      return prev
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const loadCell = async (cellId) => {
    if (membersMap[cellId]) return // already loaded
    setAttendanceMap((m) => ({ ...m, [cellId]: { ...(m[cellId] || {}), loading: true } }))
    const [members, { presentIds }] = await Promise.all([
      getCellGroupMembers(cellId),
      getSundayServiceAttendance(selectedDate, cellId),
    ])
    setMembersMap((m) => ({ ...m, [cellId]: members }))
    setAttendanceMap((m) => ({ ...m, [cellId]: { presentIds, loaded: true, loading: false } }))
  }

  const toggleExpand = async (cellId) => {
    const next = !expanded[cellId]
    setExpanded((e) => ({ ...e, [cellId]: next }))
    if (next) await loadCell(cellId)
  }

  const togglePresent = async (cellId, memberId) => {
    if (!canEnter) return
    const current = attendanceMap[cellId]?.presentIds || []
    const next = current.includes(memberId)
      ? current.filter((id) => id !== memberId)
      : [...current, memberId]
    setAttendanceMap((m) => ({ ...m, [cellId]: { ...m[cellId], presentIds: next } }))
    const members = membersMap[cellId] || []
    const presentNames = next.map(id => members.find(m => m.id === id)?.name || '').filter(Boolean)
    await setSundayServiceAttendance(
      selectedDate, cellId, next,
      userProfile?.displayName || userProfile?.email || 'unknown'
    )
    syncCellAttendanceToReport(selectedDate, cellId, presentNames).catch(() => {})
  }

  // When date changes, clear attendance cache so it reloads
  const handleDateChange = (d) => {
    setSelectedDate(d)
    setAttendanceMap({})
    setMembersMap({})
  }

  const filteredGroups = cellGroups.filter((g) =>
    !search || String(g.cellName || '').toLowerCase().includes(search.toLowerCase())
  )

  // Grand total: sum all known presentIds lengths
  const grandTotal = Object.values(attendanceMap).reduce(
    (sum, v) => sum + (v?.presentIds?.length || 0), 0
  )

  return (
    <div className="space-y-4">
      {/* Date + search bar (sticky) */}
      <div className="sticky top-0 z-30 bg-slate-50 pt-1 pb-3 space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-slate-600">Sunday Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-300 text-sm"
          />
          <span className="text-sm text-slate-500">
            Total Present: <strong className="text-slate-800">{grandTotal}</strong>
          </span>
        </div>
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search cell group…"
          className="w-full px-4 py-2.5 rounded-2xl border border-slate-300 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>

      {loadingGroups && <div className="text-slate-500 text-sm py-4">Loading cell groups…</div>}

      {/* Accordion list */}
      <div className="space-y-2">
        {filteredGroups.map((group) => {
          const isOpen   = !!expanded[group.id]
          const atd      = attendanceMap[group.id]
          const members  = (membersMap[group.id] || []).filter((m) => m.status !== 'inactive')
          const present  = atd?.presentIds || []
          const pct      = members.length ? Math.round((present.length / members.length) * 100) : 0

          return (
            <div key={group.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Accordion header */}
              <button
                type="button"
                onClick={() => toggleExpand(group.id)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-slate-800">{group.cellName || group.id}</span>
                  {atd?.loaded && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                      {present.length}/{members.length} present
                    </span>
                  )}
                  {pct === 100 && atd?.loaded && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">
                      ✓ Full house
                    </span>
                  )}
                </div>
                <span className="text-slate-400 text-lg">{isOpen ? '▲' : '▼'}</span>
              </button>

              {/* Accordion body */}
              {isOpen && (
                <div className="px-5 pb-5 border-t border-slate-100">
                  {atd?.loading && <p className="text-slate-400 text-sm py-3">Loading…</p>}
                  {atd?.loaded && members.length === 0 && (
                    <p className="text-slate-400 text-sm py-3">No active members in this cell.</p>
                  )}
                  {atd?.loaded && members.length > 0 && (
                    <>
                      {!canEnter && (
                        <p className="text-xs text-slate-400 mt-3 mb-2">Read-only — you don't have attendance entry permission.</p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-3">
                        {members.map((member) => {
                          const isPresent = present.includes(member.id)
                          return (
                            <button
                              key={member.id}
                              type="button"
                              disabled={!canEnter}
                              onClick={() => togglePresent(group.id, member.id)}
                              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
                                isPresent
                                  ? 'bg-green-500 text-white border-green-500 shadow-sm scale-105'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-400'
                              } ${canEnter ? 'cursor-pointer' : 'cursor-default'}`}
                            >
                              {member.name}
                            </button>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {!loadingGroups && filteredGroups.length === 0 && (
        <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center text-slate-500 text-sm">
          No cell groups found.
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECKLISTS TAB — defaults + weekly per-dept checklists
// ─────────────────────────────────────────────────────────────────────────────

function ChecklistsTab({ canEditFull, userProfile }) {
  const todayISO = format(new Date(), 'yyyy-MM-dd')
  const [selectedDate, setSelectedDate] = useState(todayISO)
  const [defaults, setDefaults] = useState({})
  const [weekly, setWeekly] = useState({})
  const [loadingDefaults, setLoadingDefaults] = useState(true)
  const [loadingWeekly, setLoadingWeekly] = useState(true)
  const [subTab, setSubTab] = useState('weekly') // 'weekly' | 'defaults'
  const [newItem, setNewItem] = useState({}) // dept -> text
  const [saving, setSaving] = useState({})

  const updatedBy = userProfile?.displayName || userProfile?.email || 'unknown'

  useEffect(() => {
    setLoadingDefaults(true)
    getSundayChecklistDefaults()
      .then(setDefaults)
      .finally(() => setLoadingDefaults(false))
  }, [])

  const loadWeekly = async (date) => {
    setLoadingWeekly(true)
    try {
      // Initialise from defaults if not yet created
      if (Object.keys(defaults).length) {
        await initWeeklyChecklistsFromDefaults(date, defaults, updatedBy)
      }
      const data = await getSundayWeeklyChecklists(date)
      setWeekly(data)
    } finally {
      setLoadingWeekly(false)
    }
  }

  useEffect(() => {
    if (!loadingDefaults) loadWeekly(selectedDate)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, loadingDefaults])

  const handleToggleItem = async (dept, idx) => {
    if (!canEditFull) return
    const deptData = weekly[dept]
    if (!deptData) return
    const items = deptData.items.map((item, i) =>
      i === idx ? { ...item, done: !item.done } : item
    )
    setWeekly((w) => ({ ...w, [dept]: { ...deptData, items } }))
    await setSundayWeeklyChecklistItem(selectedDate, dept, items, updatedBy)
  }

  const handleSaveDefault = async (dept) => {
    const text = (newItem[dept] || '').trim()
    if (!text) return
    setSaving((s) => ({ ...s, [dept]: true }))
    const existing = defaults[dept] || []
    const updated = [...existing, text]
    await setSundayChecklistDefault(dept, updated, updatedBy)
    setDefaults((d) => ({ ...d, [dept]: updated }))
    setNewItem((n) => ({ ...n, [dept]: '' }))
    setSaving((s) => ({ ...s, [dept]: false }))
  }

  const handleDeleteDefault = async (dept, idx) => {
    const updated = (defaults[dept] || []).filter((_, i) => i !== idx)
    await setSundayChecklistDefault(dept, updated, updatedBy)
    setDefaults((d) => ({ ...d, [dept]: updated }))
  }

  // Summary: how many depts are 100% done?
  const readyCount = CHECKLIST_DEPTS.filter((dept) => {
    const data = weekly[dept]
    if (!data || !data.items?.length) return false
    return data.items.every((i) => i.done)
  }).length

  return (
    <div className="space-y-4">
      {/* Sub-tab strip */}
      <div className="flex gap-1 bg-slate-100 rounded-2xl p-1 w-fit">
        {[
          { key: 'weekly',   label: '📋 This Sunday' },
          ...(canEditFull ? [{ key: 'defaults', label: '⚙️ Set Defaults' }] : []),
        ].map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSubTab(key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              subTab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === 'weekly' && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium text-slate-600">Sunday Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-300 text-sm"
            />
            <span className="text-sm font-medium text-slate-600">
              {readyCount}/{CHECKLIST_DEPTS.length} departments ready
            </span>
          </div>

          {loadingWeekly ? (
            <div className="text-slate-500 text-sm">Loading checklists…</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {CHECKLIST_DEPTS.map((dept) => {
                const data  = weekly[dept]
                const items = data?.items || []
                const done  = items.filter((i) => i.done).length
                const total = items.length
                const allDone = total > 0 && done === total
                return (
                  <div key={dept} className={`bg-white rounded-3xl border p-4 shadow-sm ${
                    allDone ? 'border-green-300' : 'border-slate-200'
                  }`}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-slate-800 text-sm">{dept}</h3>
                      {allDone ? (
                        <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                          ✓ Ready for Service
                        </span>
                      ) : total > 0 ? (
                        <span className="text-xs text-slate-400">{done}/{total}</span>
                      ) : null}
                    </div>
                    {total === 0 ? (
                      <p className="text-slate-400 text-xs italic">No checklist set. {canEditFull && 'Add defaults in Settings tab.'}</p>
                    ) : (
                      <ul className="space-y-2">
                        {items.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <button
                              type="button"
                              disabled={!canEditFull}
                              onClick={() => handleToggleItem(dept, idx)}
                              className={`mt-0.5 w-5 h-5 rounded flex-shrink-0 border-2 flex items-center justify-center transition-all ${
                                item.done
                                  ? 'bg-green-500 border-green-500 text-white'
                                  : 'border-slate-300 hover:border-green-400'
                              } ${canEditFull ? 'cursor-pointer' : 'cursor-default'}`}
                            >
                              {item.done && <span className="text-xs font-bold">✓</span>}
                            </button>
                            <span className={`text-sm ${item.done ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                              {item.label}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {subTab === 'defaults' && canEditFull && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {loadingDefaults ? (
            <div className="text-slate-500 text-sm col-span-full">Loading…</div>
          ) : (
            CHECKLIST_DEPTS.map((dept) => {
              const items = defaults[dept] || []
              return (
                <div key={dept} className="bg-white rounded-3xl border border-slate-200 p-4 shadow-sm space-y-3">
                  <h3 className="font-semibold text-slate-800 text-sm">{dept}</h3>
                  <ul className="space-y-1.5">
                    {items.map((label, idx) => (
                      <li key={idx} className="flex items-center justify-between gap-2">
                        <span className="text-sm text-slate-700 flex-1">{label}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteDefault(dept, idx)}
                          className="text-red-400 hover:text-red-600 text-xs"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newItem[dept] || ''}
                      onChange={(e) => setNewItem((n) => ({ ...n, [dept]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveDefault(dept)}
                      placeholder="Add task…"
                      className="flex-1 px-3 py-1.5 rounded-xl border border-slate-300 text-sm"
                    />
                    <button
                      type="button"
                      disabled={saving[dept]}
                      onClick={() => handleSaveDefault(dept)}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
