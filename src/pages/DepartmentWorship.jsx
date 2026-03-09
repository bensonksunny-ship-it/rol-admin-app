import { useEffect, useState, useMemo } from 'react'
import {
  getDepartmentEntries,
  addDepartmentEntry,
  getWorshipTeamMembers,
  addWorshipTeamMember,
  getWorshipSchedules,
  setWorshipScheduleWeek,
} from '../services/firestore'
import { useAuth } from '../context/AuthContext'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts'
import { format, subMonths, differenceInDays, addWeeks, startOfWeek } from 'date-fns'

const DEPARTMENT = 'Worship'
const PERIOD = format(new Date(), 'yyyy-MM')

const WORSHIP_ROLES = [
  '—',
  'Lead vocalist',
  'Choir',
  'Instrumentalist',
  'Keys',
  'Drums',
  'Guitar',
  'Bass',
  'Media / Sound',
  'Other',
]

const DEMO_TEAM = [
  { name: 'Leonard', memberSince: '2022-04-25' },
  { name: 'Archana', memberSince: '2019-12-03' },
  { name: 'Janet', memberSince: '2022-06-10' },
  { name: 'Aneesh', memberSince: '2022-06-03' },
  { name: 'Adi', memberSince: '2018-06-03' },
  { name: 'Sri', memberSince: '2018-06-03' },
  { name: 'Blessly', memberSince: '2024-12-10' },
  { name: 'Dixcy', memberSince: '2025-01-03' },
  { name: 'Joyson', memberSince: '2025-12-07' },
  { name: 'Teji', memberSince: '2025-12-16' },
  { name: 'Jerusha', memberSince: '2025-12-07' },
  { name: 'Eric', memberSince: '2024-01-15' },
  { name: 'Chelsea', memberSince: '2024-01-15' },
  { name: 'Shimona', memberSince: '2020-12-03' },
  { name: 'Surya', memberSince: '2019-11-03' },
]

function nextFourWeekStarts() {
  const today = new Date()
  const nextMonday = addWeeks(startOfWeek(today, { weekStartsOn: 1 }), today < startOfWeek(today, { weekStartsOn: 1 }) ? 0 : 1)
  return Array.from({ length: 4 }, (_, i) => format(addWeeks(nextMonday, i), 'yyyy-MM-dd'))
}

export default function DepartmentWorship() {
  const { userProfile, hasPermission } = useAuth()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('summary')
  const [teamMembers, setTeamMembers] = useState([])
  const [formerMembers, setFormerMembers] = useState([])
  const [loadingTeam, setLoadingTeam] = useState(true)
  const [teamError, setTeamError] = useState(null)
  const [schedules, setSchedules] = useState({})
  const [loadingSchedules, setLoadingSchedules] = useState(false)
  const [newMember, setNewMember] = useState({ name: '', memberSince: new Date().toISOString().slice(0, 10), isFormer: false })
  const [form, setForm] = useState({
    type: 'team',
    period: PERIOD,
    teamNotes: '',
    plannedBudget: '',
    spent: '',
    participantsCount: '',
    activityNotes: '',
  })

  const isDirector = userProfile?.department === DEPARTMENT
  const isPastor = hasPermission('viewDepartmentInsights')
  const weekStarts = useMemo(() => nextFourWeekStarts(), [])

  useEffect(() => {
    getDepartmentEntries(DEPARTMENT, { limit: 100 })
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [])

  async function loadTeam() {
    setLoadingTeam(true)
    setTeamError(null)
    try {
      const current = await getWorshipTeamMembers(DEPARTMENT, { former: false })
      const former = await getWorshipTeamMembers(DEPARTMENT, { former: true })
      setTeamMembers(current)
      setFormerMembers(former)
    } catch (e) {
      console.error('Worship team load failed:', e)
      setTeamError(e?.message || 'Could not load team. Check Firestore rules and indexes for worship_team_members.')
      setTeamMembers([])
      setFormerMembers([])
    } finally {
      setLoadingTeam(false)
    }
  }

  useEffect(() => {
    loadTeam()
  }, [])

  async function loadSchedules() {
    setLoadingSchedules(true)
    try {
      const data = await getWorshipSchedules(DEPARTMENT, weekStarts)
      setSchedules(data)
    } catch (e) {
      console.error('Worship schedule load failed:', e)
      setSchedules({})
    } finally {
      setLoadingSchedules(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'assign') loadSchedules()
  }, [activeTab, weekStarts.join(',')])

  async function seedDemoTeam() {
    try {
      for (const m of DEMO_TEAM) {
        await addWorshipTeamMember(DEPARTMENT, { name: m.name, memberSince: m.memberSince }, userProfile?.email)
      }
      await loadTeam()
    } catch (e) {
      console.error(e)
      alert('Failed to add demo team')
    }
  }

  function getAssignment(weekStart, memberId) {
    const week = schedules[weekStart]
    const list = week?.assignments || []
    const a = list.find((x) => x.memberId === memberId)
    return a?.role || '—'
  }

  async function setAssignment(weekStart, memberId, memberName, role) {
    const week = schedules[weekStart] || { weekStart, assignments: [] }
    const list = [...(week.assignments || [])]
    const idx = list.findIndex((x) => x.memberId === memberId)
    if (role === '—' || !role) {
      if (idx >= 0) list.splice(idx, 1)
    } else {
      const slot = { memberId, memberName, role }
      if (idx >= 0) list[idx] = slot
      else list.push(slot)
    }
    await setWorshipScheduleWeek(DEPARTMENT, weekStart, list, userProfile?.email)
    setSchedules((s) => ({ ...s, [weekStart]: { ...week, assignments: list } }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const payload = {
      department: DEPARTMENT,
      period: form.period,
      type: form.type,
      enteredBy: userProfile?.email || 'unknown',
      data: {},
    }
    if (form.type === 'team') payload.data = { notes: form.teamNotes }
    if (form.type === 'budget') payload.data = { planned: Number(form.plannedBudget) || 0, spent: Number(form.spent) || 0 }
    if (form.type === 'participation') payload.data = { count: Number(form.participantsCount) || 0, notes: form.activityNotes }
    try {
      await addDepartmentEntry(payload)
      setForm((f) => ({ ...f, teamNotes: '', plannedBudget: '', spent: '', participantsCount: '', activityNotes: '' }))
      setEntries(await getDepartmentEntries(DEPARTMENT, { limit: 100 }))
    } catch (err) {
      console.error(err)
      alert('Failed to save')
    }
  }

  // Build charts for pastor insights
  const last6Months = Array.from({ length: 6 }, (_, i) => format(subMonths(new Date(), 5 - i), 'yyyy-MM'))
  const participationByMonth = last6Months.map((period) => {
    const items = entries.filter((e) => e.period === period && e.type === 'participation')
    const total = items.reduce((s, e) => s + (e.data?.count || 0), 0)
    return { period, participants: total }
  })
  const budgetByMonth = last6Months.map((period) => {
    const items = entries.filter((e) => e.period === period && e.type === 'budget')
    const planned = items.reduce((s, e) => s + (e.data?.planned || 0), 0)
    const spent = items.reduce((s, e) => s + (e.data?.spent || 0), 0)
    return { period, planned, spent }
  })

  const canEnter = isDirector
  const canViewInsights = isPastor

  if (!canEnter && !canViewInsights) {
    return (
      <div className="p-8 text-slate-600">
        You don't have access to the Worship department page. Ask an admin to set your <strong>department</strong> to &quot;Worship&quot; in Firestore (users collection) to enter data, or use a role that can view insights.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Worship Department</h1>
        <p className="text-slate-500 mt-1">
          {isDirector && 'Plan your team, budget, and participation. Data is visible to the pastor for insights.'}
          {isPastor && !isDirector && 'Insights from Worship director entries – participation, budget, and activity.'}
          {isPastor && isDirector && 'Enter data as director; view insights below.'}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {(canEnter || canViewInsights) && (
          <>
            <button
              type="button"
              onClick={() => setActiveTab('summary')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
                activeTab === 'summary' ? 'bg-white border border-slate-200 border-b-0 text-blue-600' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Summary
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('budget')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
                activeTab === 'budget' ? 'bg-white border border-slate-200 border-b-0 text-blue-600' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Budget & Spending
            </button>
          </>
        )}
        {canEnter && (
          <>
            <button
              type="button"
              onClick={() => setActiveTab('assign')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
                activeTab === 'assign' ? 'bg-white border border-slate-200 border-b-0 text-blue-600' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Assign (4 weeks)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('entry')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
                activeTab === 'entry' ? 'bg-white border border-slate-200 border-b-0 text-blue-600' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Data entry
            </button>
          </>
        )}
        {canViewInsights && (
          <button
            type="button"
            onClick={() => setActiveTab('insights')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
              activeTab === 'insights' ? 'bg-white border border-slate-200 border-b-0 text-blue-600' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Insights (pastor)
          </button>
        )}
      </div>

      {activeTab === 'summary' && (canEnter || canViewInsights) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h2 className="font-semibold text-slate-800 mb-4">Department Summary Box</h2>
            {teamError && (
              <p className="text-amber-700 text-sm mb-3 bg-amber-50 px-3 py-2 rounded">
                {teamError} <button type="button" onClick={loadTeam} className="underline font-medium ml-1">Retry</button>
              </p>
            )}
            {loadingTeam ? (
              <p className="text-slate-500">Loading...</p>
            ) : (
              <>
                <div className="space-y-2 text-sm text-slate-600">
                  <p>Coordinator since: <span className="text-slate-800">01/04/2022</span></p>
                  <p>Duration: <span className="text-slate-800">{differenceInDays(new Date(), new Date('2022-04-01'))} days</span></p>
                  <p>Members: <span className="text-slate-800 font-medium">{teamMembers.length}</span></p>
                </div>
                {canEnter && teamMembers.length === 0 && (
                  <button type="button" onClick={seedDemoTeam} className="mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
                    Add demo team (15 members)
                  </button>
                )}
                {canEnter && (
                  <div className="mt-4 pt-4 border-t border-slate-200">
                    <h3 className="text-sm font-medium text-slate-700 mb-2">Add team member</h3>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault()
                        if (!newMember.name.trim()) return
                        try {
                          await addWorshipTeamMember(DEPARTMENT, { name: newMember.name.trim(), memberSince: newMember.memberSince, isFormer: newMember.isFormer }, userProfile?.email)
                          setNewMember({ name: '', memberSince: new Date().toISOString().slice(0, 10), isFormer: false })
                          await loadTeam()
                        } catch (err) {
                          console.error(err)
                          alert('Failed to add member')
                        }
                      }}
                      className="flex flex-wrap gap-2 items-end"
                    >
                      <input
                        type="text"
                        placeholder="Name"
                        value={newMember.name}
                        onChange={(e) => setNewMember((m) => ({ ...m, name: e.target.value }))}
                        className="px-3 py-1.5 rounded border border-slate-300 w-32"
                      />
                      <input
                        type="date"
                        value={newMember.memberSince}
                        onChange={(e) => setNewMember((m) => ({ ...m, memberSince: e.target.value }))}
                        className="px-3 py-1.5 rounded border border-slate-300"
                      />
                      <label className="flex items-center gap-1 text-sm text-slate-600">
                        <input type="checkbox" checked={newMember.isFormer} onChange={(e) => setNewMember((m) => ({ ...m, isFormer: e.target.checked }))} />
                        Former
                      </label>
                      <button type="submit" className="px-3 py-1.5 rounded-lg bg-slate-700 text-white text-sm hover:bg-slate-800">Add</button>
                    </form>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <h2 className="px-5 py-4 font-semibold text-slate-800 border-b border-slate-200">Team members</h2>
              {loadingTeam ? (
                <div className="p-8 text-center text-slate-500">Loading...</div>
              ) : teamMembers.length === 0 ? (
                <div className="p-8 text-center text-slate-500">No team members yet. Use “Add demo team” in Summary to load demo names.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-5 py-3 text-sm font-medium text-slate-600 w-12">SL No</th>
                        <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Name</th>
                        <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Team member since</th>
                        <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Duration</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {teamMembers.map((m, i) => (
                        <tr key={m.id} className="hover:bg-slate-50">
                          <td className="px-5 py-3 text-slate-600">{i + 1}</td>
                          <td className="px-5 py-3 font-medium text-slate-800">{m.name}</td>
                          <td className="px-5 py-3 text-slate-600">{m.memberSince}</td>
                          <td className="px-5 py-3 text-slate-600">{differenceInDays(new Date(), new Date(m.memberSince))} days</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <h2 className="px-5 py-4 font-semibold text-slate-800 border-b border-slate-200">Record of former members</h2>
              {loadingTeam ? (
                <div className="p-8 text-center text-slate-500">Loading...</div>
              ) : formerMembers.length === 0 ? (
                <div className="p-8 text-center text-slate-500">No former members recorded.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-5 py-3 text-sm font-medium text-slate-600 w-12">SL No</th>
                        <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Name</th>
                        <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Member since</th>
                        <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Duration</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {formerMembers.map((m, i) => (
                        <tr key={m.id} className="hover:bg-slate-50">
                          <td className="px-5 py-3 text-slate-600">{i + 1}</td>
                          <td className="px-5 py-3 font-medium text-slate-800">{m.name}</td>
                          <td className="px-5 py-3 text-slate-600">{m.memberSince}</td>
                          <td className="px-5 py-3 text-slate-600">{differenceInDays(new Date(), new Date(m.memberSince))} days</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'assign' && canEnter && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <h2 className="px-5 py-4 font-semibold text-slate-800 border-b border-slate-200">Assign worship team – next 4 weeks (pick role per member per week)</h2>
          {loadingSchedules ? (
            <div className="p-8 text-center text-slate-500">Loading...</div>
          ) : teamMembers.length === 0 ? (
            <div className="p-8 text-center text-slate-500">Add team members in Summary first.</div>
          ) : (
            <table className="w-full min-w-[640px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-600 sticky left-0 bg-slate-50 z-10 min-w-[140px]">Member</th>
                  {weekStarts.map((ws) => (
                    <th key={ws} className="text-left px-4 py-3 text-sm font-medium text-slate-600 whitespace-nowrap">
                      Week of {format(new Date(ws), 'dd MMM yyyy')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {teamMembers.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2 font-medium text-slate-800 sticky left-0 bg-white z-10 border-r border-slate-100">{m.name}</td>
                    {weekStarts.map((weekStart) => (
                      <td key={weekStart} className="px-4 py-2">
                        <select
                          value={getAssignment(weekStart, m.id)}
                          onChange={(e) => setAssignment(weekStart, m.id, m.name, e.target.value)}
                          className="w-full max-w-[180px] px-2 py-1.5 text-sm rounded border border-slate-300 bg-white"
                        >
                          {WORSHIP_ROLES.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'budget' && (canEnter || canViewInsights) && (
        <div className="space-y-6">
          {canEnter && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h2 className="font-semibold text-slate-800 mb-4">Add budget / spending (per month)</h2>
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  const planned = Number(form.plannedBudget) || 0
                  const spent = Number(form.spent) || 0
                  try {
                    await addDepartmentEntry({
                      department: DEPARTMENT,
                      period: form.period,
                      type: 'budget',
                      enteredBy: userProfile?.email || 'unknown',
                      data: { planned, spent },
                    })
                    setForm((f) => ({ ...f, plannedBudget: '', spent: '' }))
                    setEntries(await getDepartmentEntries(DEPARTMENT, { limit: 100 }))
                  } catch (err) {
                    console.error(err)
                    alert('Failed to save')
                  }
                }}
                className="flex flex-wrap gap-4 items-end"
              >
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Period (month)</label>
                  <input type="month" value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-300" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Planned budget (RM)</label>
                  <input type="number" min="0" step="0.01" value={form.plannedBudget} onChange={(e) => setForm((f) => ({ ...f, plannedBudget: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-300 w-32" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Money spent (RM)</label>
                  <input type="number" min="0" step="0.01" value={form.spent} onChange={(e) => setForm((f) => ({ ...f, spent: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-300 w-32" />
                </div>
                <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700">Save</button>
              </form>
            </div>
          )}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <h2 className="px-5 py-4 font-semibold text-slate-800 border-b border-slate-200">Budget & spending history</h2>
            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading...</div>
            ) : (
              (() => {
                const budgetEntries = entries.filter((e) => e.type === 'budget')
                if (budgetEntries.length === 0) return <div className="p-8 text-center text-slate-500">No budget entries yet.</div>
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Period</th>
                          <th className="text-right px-5 py-3 text-sm font-medium text-slate-600">Planned (RM)</th>
                          <th className="text-right px-5 py-3 text-sm font-medium text-slate-600">Spent (RM)</th>
                          <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Entered by</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {budgetEntries.map((e) => (
                          <tr key={e.id} className="hover:bg-slate-50">
                            <td className="px-5 py-3 text-slate-800">{e.period}</td>
                            <td className="px-5 py-3 text-right text-slate-600">{e.data?.planned ?? 0}</td>
                            <td className="px-5 py-3 text-right text-slate-600">{e.data?.spent ?? 0}</td>
                            <td className="px-5 py-3 text-slate-500 text-sm">{e.enteredBy}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })()
            )}
          </div>
        </div>
      )}

      {activeTab === 'entry' && canEnter && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h2 className="font-semibold text-slate-800 mb-4">Add entry</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                >
                  <option value="team">Team planning</option>
                  <option value="budget">Budget / money spent</option>
                  <option value="participation">Participation (number of people)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Period (month)</label>
                <input
                  type="month"
                  value={form.period}
                  onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              {form.type === 'team' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Team / assignments notes</label>
                  <textarea
                    value={form.teamNotes}
                    onChange={(e) => setForm((f) => ({ ...f, teamNotes: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                    rows={3}
                    placeholder="e.g. Lead: John, Keys: Mary, Drums: ..."
                  />
                </div>
              )}
              {form.type === 'budget' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Planned budget (RM)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.plannedBudget}
                      onChange={(e) => setForm((f) => ({ ...f, plannedBudget: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Money spent (RM)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.spent}
                      onChange={(e) => setForm((f) => ({ ...f, spent: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300"
                    />
                  </div>
                </>
              )}
              {form.type === 'participation' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Number of people participating</label>
                    <input
                      type="number"
                      min="0"
                      value={form.participantsCount}
                      onChange={(e) => setForm((f) => ({ ...f, participantsCount: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Activity notes (optional)</label>
                    <textarea
                      value={form.activityNotes}
                      onChange={(e) => setForm((f) => ({ ...f, activityNotes: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300"
                      rows={2}
                    />
                  </div>
                </>
              )}
              <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700">
                Save entry
              </button>
            </form>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <h2 className="px-5 py-4 font-semibold text-slate-800 border-b border-slate-200">Recent entries (your data → pastor sees this)</h2>
            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading...</div>
            ) : entries.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No entries yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Period</th>
                      <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Type</th>
                      <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Details</th>
                      <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Entered by</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {entries.slice(0, 20).map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 text-slate-800">{e.period}</td>
                        <td className="px-5 py-3 text-slate-600 capitalize">{e.type}</td>
                        <td className="px-5 py-3 text-slate-600">
                          {e.type === 'team' && (e.data?.notes || '—')}
                          {e.type === 'budget' && `Planned: ${e.data?.planned ?? 0} RM, Spent: ${e.data?.spent ?? 0} RM`}
                          {e.type === 'participation' && `${e.data?.count ?? 0} people`}
                        </td>
                        <td className="px-5 py-3 text-slate-500 text-sm">{e.enteredBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'insights' && canViewInsights && (
        <div className="space-y-6">
          <p className="text-slate-600">Analytics from Worship director entries. Same data they enter, aggregated for you.</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h2 className="font-semibold text-slate-800 mb-4">Participation over time</h2>
              {participationByMonth.some((p) => p.participants > 0) ? (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={participationByMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="participants" stroke="#1e40af" strokeWidth={2} name="Participants" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-slate-500 py-8 text-center">No participation data yet.</p>
              )}
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h2 className="font-semibold text-slate-800 mb-4">Budget vs spent (by month)</h2>
              {budgetByMonth.some((b) => b.planned > 0 || b.spent > 0) ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={budgetByMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="planned" fill="#10b981" name="Planned (RM)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="spent" fill="#ef4444" name="Spent (RM)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-slate-500 py-8 text-center">No budget data yet.</p>
              )}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <h2 className="px-5 py-4 font-semibold text-slate-800 border-b border-slate-200">All Worship entries (activity)</h2>
            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading...</div>
            ) : entries.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No entries yet from the director.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Period</th>
                      <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Type</th>
                      <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Details</th>
                      <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Entered by</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {entries.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 text-slate-800">{e.period}</td>
                        <td className="px-5 py-3 text-slate-600 capitalize">{e.type}</td>
                        <td className="px-5 py-3 text-slate-600">
                          {e.type === 'team' && (e.data?.notes || '—')}
                          {e.type === 'budget' && `Planned: ${e.data?.planned ?? 0} RM, Spent: ${e.data?.spent ?? 0} RM`}
                          {e.type === 'participation' && `${e.data?.count ?? 0} people`}
                        </td>
                        <td className="px-5 py-3 text-slate-500 text-sm">{e.enteredBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
