import { useEffect, useState } from 'react'
import {
  getDepartmentEntries,
  addDepartmentEntry,
  getWorshipTeamMembers,
  addWorshipTeamMember,
  getWorshipScheduleByDate,
  setWorshipScheduleByDate,
} from '../services/firestore'
import { useAuth } from '../context/AuthContext'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts'
import { format, subMonths, differenceInDays } from 'date-fns'

const DEPARTMENT = 'Worship'
const PERIOD = format(new Date(), 'yyyy-MM')

// Fixed roles on the left of the assign table (master list for each week)
const ASSIGNMENT_ROLES = [
  'Lead Vocal-1',
  'Lead Vocal-2',
  'Lead Vocal-3',
  'Lead Vocal-4',
  'Parts-1',
  'Parts-2',
  'Choir member-1',
  'Choir member-2',
  'Choir member-3',
  'Choir member-4',
  'Choir member-5',
  'Choir member-6',
  'Keyboard',
  'Lead Guitar',
  'Bass Guitar',
  'Acoustic guitar',
  'Drums',
  'Sound Engineer',
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

export default function DepartmentWorship() {
  const { userProfile, hasPermission, isFounder } = useAuth()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('summary')
  const [teamMembers, setTeamMembers] = useState([])
  const [formerMembers, setFormerMembers] = useState([])
  const [loadingTeam, setLoadingTeam] = useState(true)
  const [teamError, setTeamError] = useState(null)
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
  const canManageWorship = isDirector || isFounder
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [scheduleForDate, setScheduleForDate] = useState({ date: '', assignments: [] })
  const [loadingSchedule, setLoadingSchedule] = useState(false)

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

  async function loadScheduleForDate(date) {
    setLoadingSchedule(true)
    try {
      const data = await getWorshipScheduleByDate(DEPARTMENT, date)
      setScheduleForDate(data)
    } catch (e) {
      console.error(e)
      setScheduleForDate({ date, assignments: [] })
    } finally {
      setLoadingSchedule(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'assign' && selectedDate) loadScheduleForDate(selectedDate)
  }, [activeTab, selectedDate])

  function getAssignedMemberId(role) {
    const a = (scheduleForDate.assignments || []).find((x) => x.role === role)
    return a?.memberId || ''
  }

  async function setAssignmentForRole(role, memberId, memberName) {
    const list = [...(scheduleForDate.assignments || [])]
    const idx = list.findIndex((x) => x.role === role)
    if (!memberId) {
      if (idx >= 0) list.splice(idx, 1)
    } else {
      const slot = { role, memberId, memberName }
      if (idx >= 0) list[idx] = slot
      else list.push(slot)
    }
    try {
      await setWorshipScheduleByDate(DEPARTMENT, selectedDate, list, userProfile?.email)
      setScheduleForDate((s) => ({ ...s, assignments: list }))
    } catch (e) {
      console.error(e)
      alert('Failed to save')
    }
  }

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

  const canViewInsights = isPastor

  if (!canManageWorship && !canViewInsights) {
    return (
      <div className="p-8 text-slate-600">
        You don't have access to the Worship department page. Ask an admin to set your <strong>department</strong> to &quot;Worship&quot; in Firestore (users collection) to plan and enter data, or use a role that can view insights.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Worship Department</h1>
        <p className="text-slate-500 mt-1">
          {canManageWorship && 'Plan worship team, assign by date, budget, and participation. Add demo team or members in Summary. Founder and Worship director can edit and add.'}
          {canViewInsights && !canManageWorship && 'Insights from Worship director entries – participation, budget, and activity.'}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {(canManageWorship || canViewInsights) && (
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
        {canManageWorship && (
          <>
            <button
              type="button"
              onClick={() => setActiveTab('assign')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
                activeTab === 'assign' ? 'bg-white border border-slate-200 border-b-0 text-blue-600' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Assign team
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

      {activeTab === 'summary' && (canManageWorship || canViewInsights) && (
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
                {canManageWorship && teamMembers.length === 0 && (
                  <button type="button" onClick={seedDemoTeam} className="mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
                    Add demo team (15 members)
                  </button>
                )}
                {canManageWorship && (
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

      {activeTab === 'assign' && canManageWorship && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center gap-4">
            <h2 className="font-semibold text-slate-800">Assign worship team</h2>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              Date
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300"
              />
            </label>
            <p className="text-slate-500 text-sm">Pick a date (e.g. Sunday), then assign people from the team list to each role.</p>
          </div>
          {loadingSchedule ? (
            <div className="p-8 text-center text-slate-500">Loading...</div>
          ) : teamMembers.length === 0 ? (
            <div className="p-8 text-center text-slate-500">Add team members in Summary first (e.g. &quot;Add demo team&quot; for demo names).</div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600 w-[220px]">Role</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Assigned to</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {ASSIGNMENT_ROLES.map((role) => (
                  <tr key={role} className="hover:bg-slate-50/50">
                    <td className="px-5 py-2 font-medium text-slate-800">{role}</td>
                    <td className="px-5 py-2">
                      <select
                        value={getAssignedMemberId(role)}
                        onChange={(e) => {
                          const val = e.target.value
                          const member = teamMembers.find((m) => m.id === val)
                          setAssignmentForRole(role, val || '', member?.name || '')
                        }}
                        className="w-full max-w-[220px] px-3 py-2 text-sm rounded border border-slate-300 bg-white"
                      >
                        <option value="">— Not assigned</option>
                        {teamMembers.map((m) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'budget' && (canManageWorship || canViewInsights) && (
        <div className="space-y-6">
          {canManageWorship && (
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

      {activeTab === 'entry' && canManageWorship && (
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
