import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  getDepartmentEntries,
  addDepartmentEntry,
  getWorshipTeamMembers,
  addWorshipTeamMember,
  getWorshipScheduleByDate,
  setWorshipScheduleByDate,
  updateWorshipTeamMember,
  deleteWorshipTeamMember,
  getWorshipBudgetItems,
  addWorshipBudgetItem,
  updateWorshipBudgetItem,
  deleteWorshipBudgetItem,
} from '../services/firestore'
import { useAuth } from '../context/AuthContext'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts'
import { format, subMonths, differenceInDays } from 'date-fns'
import { formatDMY } from '../utils/date'

const DEPARTMENT = 'Worship'
const PERIOD = format(new Date(), 'yyyy-MM')

// Fixed roles on the left of the assign table (master list per service)
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

const MEMBER_POSITIONS = [
  'Lead vocal',
  'Parts',
  'Choir',
  'Lead guitar',
  'Guitar',
  'Bass',
  'Keyboard',
  'Drums',
  'Sound engineer',
  'Media',
]

function positionKeyForRole(role) {
  if (role.startsWith('Lead Vocal')) return 'Lead vocal'
  if (role.startsWith('Parts')) return 'Parts'
  if (role.startsWith('Choir member')) return 'Choir'
  if (role === 'Lead Guitar') return 'Lead guitar'
  if (role === 'Acoustic guitar') return 'Guitar'
  if (role === 'Bass Guitar') return 'Bass'
  if (role === 'Keyboard') return 'Keyboard'
  if (role === 'Drums') return 'Drums'
  if (role === 'Sound Engineer') return 'Sound engineer'
  return null
}

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

function nextSundayISO() {
  const today = new Date()
  const day = today.getDay()
  const daysUntilSunday = (7 - day) % 7
  const next = new Date(today)
  next.setDate(today.getDate() + (daysUntilSunday === 0 ? 7 : daysUntilSunday))
  return format(next, 'yyyy-MM-dd')
}

function PlanComingSundayCard({
  comingSundayDate,
  comingPlan,
  setComingPlan,
  loadingComingPlan,
  savingComingPlan,
  setSavingComingPlan,
  canManageWorship,
  teamMembers,
  userProfile,
  loadComingPlan,
  setSelectedDate,
  setActiveTab,
  DEPARTMENT,
  formatDMY,
}) {
  return (
    <div className="rounded-2xl overflow-hidden shadow-lg border border-slate-200 w-3/4 max-w-4xl mx-auto flex flex-col" style={{ height: '70vh', minHeight: 480 }}>
      <div className="flex-1 min-h-0 flex flex-col bg-gradient-to-br from-amber-50 via-white to-blue-50">
        <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-3 px-5 py-4 bg-amber-100 border-b border-amber-200">
          <div>
            <h2 className="font-bold text-slate-800 text-lg">Plan coming Sunday</h2>
            <p className="text-sm text-slate-600 mt-1">
              <span className="font-medium text-amber-800">{formatDMY(comingSundayDate)}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/sunday-planning?date=${comingSundayDate}`}
              className="px-4 py-2 rounded-xl border border-amber-500 text-amber-700 font-medium hover:bg-amber-50 shadow-sm"
            >
              View in Sunday Planning
            </Link>
            {canManageWorship && (
              <button
                type="button"
                onClick={() => { setSelectedDate(comingSundayDate); setActiveTab('assign') }}
                className="px-4 py-2 rounded-xl bg-amber-500 text-white font-medium hover:bg-amber-600 shadow-md"
              >
                Open Assign
              </button>
            )}
          </div>
        </div>
        {loadingComingPlan ? (
          <div className="flex-1 min-h-0 flex items-center justify-center text-slate-500">Loading...</div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden space-y-4 p-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Team by role</h3>
              <table className="w-full text-sm">
                <thead className="bg-amber-100">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold text-slate-700">Role</th>
                    <th className="text-left px-4 py-2 font-semibold text-slate-700">Assigned to</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-200">
                  {ASSIGNMENT_ROLES.map((role) => {
                    const a = (comingPlan.assignments || []).find((x) => x.role === role)
                    return (
                      <tr key={role} className="hover:bg-amber-50">
                        <td className="px-4 py-2 font-medium text-slate-800">{role}</td>
                        <td className="px-4 py-2 text-slate-600">{a?.memberName || '\u2014'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Songs and lead vocalist</h3>
              <p className="text-xs text-slate-500 mb-2">Assign who leads each song; the same person can lead more than one song.</p>
              <table className="w-full text-sm">
                <thead className="bg-amber-100">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold text-slate-700 w-8">#</th>
                    <th className="text-left px-4 py-2 font-semibold text-slate-700">Song</th>
                    <th className="text-left px-4 py-2 font-semibold text-slate-700 w-20">Key</th>
                    <th className="text-left px-4 py-2 font-semibold text-slate-700">Lead vocalist</th>
                    {canManageWorship && <th className="w-10" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-200">
                  {(comingPlan.songs || []).map((song, idx) => (
                    <tr key={idx} className="hover:bg-amber-50">
                      <td className="px-4 py-2 text-slate-600">{idx + 1}</td>
                      <td className="px-4 py-2">
                        {canManageWorship ? (
                          <input
                            type="text"
                            value={song.title || ''}
                            onChange={(e) => {
                              const next = [...(comingPlan.songs || [])]
                              next[idx] = { ...next[idx], title: e.target.value }
                              setComingPlan((p) => ({ ...p, songs: next }))
                            }}
                            placeholder="Song title"
                            className="w-full min-w-[14rem] max-w-[28rem] px-3 py-1.5 rounded border border-slate-300 text-sm"
                          />
                        ) : (
                          <span className="text-slate-800">{song.title || '\u2014'}</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {canManageWorship ? (
                          <input
                            type="text"
                            value={song.key || ''}
                            onChange={(e) => {
                              const next = [...(comingPlan.songs || [])]
                              next[idx] = { ...next[idx], key: e.target.value }
                              setComingPlan((p) => ({ ...p, songs: next }))
                            }}
                            placeholder="Key"
                            className="w-20 px-2 py-1.5 rounded border border-slate-300 text-sm"
                          />
                        ) : (
                          <span className="text-slate-600">{song.key || '\u2014'}</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {canManageWorship ? (
                          <select
                            value={song.memberId || ''}
                            onChange={(e) => {
                              const val = e.target.value
                              const member = teamMembers.find((m) => m.id === val)
                              const next = [...(comingPlan.songs || [])]
                              next[idx] = { ...next[idx], memberId: val || '', memberName: member?.name || '' }
                              setComingPlan((p) => ({ ...p, songs: next }))
                            }}
                            className="min-w-[10rem] px-2 py-1.5 rounded border border-slate-300 text-sm bg-white"
                          >
                            <option value="">- Not set</option>
                            {teamMembers
                              .filter((m) => m.positions?.includes('Lead vocal'))
                              .map((m) => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))}
                          </select>
                        ) : (
                          <span className="text-slate-600">{song.memberName || '\u2014'}</span>
                        )}
                      </td>
                      {canManageWorship && (
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => {
                              const next = (comingPlan.songs || []).filter((_, i) => i !== idx)
                              setComingPlan((p) => ({ ...p, songs: next }))
                            }}
                            className="text-slate-400 hover:text-red-600 text-lg leading-none"
                            title="Remove song"
                          >
                            &#215;
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canManageWorship && (
                <button
                  type="button"
                  onClick={() => setComingPlan((p) => ({ ...p, songs: [...(p.songs || []), { title: '', key: '', memberId: '', memberName: '' }] }))}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-amber-100 text-amber-800 text-sm font-medium hover:bg-amber-200"
                >
                  + Add song
                </button>
              )}
            </div>
          </div>
        )}
        {canManageWorship && !loadingComingPlan && (
          <div className="flex-shrink-0 px-5 py-3 bg-amber-50 border-t border-amber-200 flex justify-end">
            <button
              type="button"
              disabled={savingComingPlan}
              onClick={async () => {
                setSavingComingPlan(true)
                try {
                  await setWorshipScheduleByDate(
                    DEPARTMENT,
                    comingSundayDate,
                    comingPlan.assignments || [],
                    userProfile?.email,
                    { songs: comingPlan.songs || [], worshipDirectorName: comingPlan.worshipDirectorName || '' }
                  )
                  await loadComingPlan(comingSundayDate)
                } catch (e) {
                  console.error(e)
                  alert('Failed to save')
                } finally {
                  setSavingComingPlan(false)
                }
              }}
              className="px-4 py-2 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 disabled:opacity-60"
            >
              {savingComingPlan ? 'Saving...' : 'Save plan'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function DepartmentWorship() {
  const { userProfile, hasPermission, isFounder } = useAuth()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('summary')
  const [teamMembers, setTeamMembers] = useState([])
  const [formerMembers, setFormerMembers] = useState([])
  const [loadingTeam, setLoadingTeam] = useState(true)
  const [teamError, setTeamError] = useState(null)
  const [newMember, setNewMember] = useState({
    name: '',
    memberSince: new Date().toISOString().slice(0, 10),
    isFormer: false,
    positions: [],
    isWorshipDirector: false,
  })
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
  const [searchParams] = useSearchParams()
  const dateFromUrl = searchParams.get('date')
  const [comingSundayDate, setComingSundayDate] = useState(() => dateFromUrl || nextSundayISO())
  const [comingPlan, setComingPlan] = useState({ date: '', assignments: [], songs: [], worshipDirectorName: '' })
  const [loadingComingPlan, setLoadingComingPlan] = useState(false)
  const [savingComingPlan, setSavingComingPlan] = useState(false)
  const [editMember, setEditMember] = useState(null)
  const [budgetItems, setBudgetItems] = useState([])
  const [loadingBudgetItems, setLoadingBudgetItems] = useState(true)
  const [budgetItemsError, setBudgetItemsError] = useState(null)
  const [editingBudgetItem, setEditingBudgetItem] = useState(null)
  const [budgetItemForm, setBudgetItemForm] = useState({
    category: '',
    subCategory: '',
    description: '',
    quantity: '',
    unitCost: '',
    totalCost: '',
    type: '',
    expectedDate: '',
  })

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

  async function loadBudgetItems() {
    setLoadingBudgetItems(true)
    setBudgetItemsError(null)
    try {
      const items = await getWorshipBudgetItems(DEPARTMENT)
      setBudgetItems(items)
    } catch (e) {
      console.error('Worship budget items load failed:', e)
      setBudgetItemsError(e?.message || 'Could not load budget items. Check Firestore rules for worship_budget_items.')
      setBudgetItems([])
    } finally {
      setLoadingBudgetItems(false)
    }
  }

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

  async function loadComingPlan(date) {
    setLoadingComingPlan(true)
    try {
      const data = await getWorshipScheduleByDate(DEPARTMENT, date)
      const rawSongs = Array.isArray(data.songs) ? data.songs : []
      const songs = rawSongs.map((s) => ({
        title: s?.title ?? '',
        key: s?.key ?? '',
        memberId: s?.memberId ?? '',
        memberName: s?.memberName ?? '',
      }))
      setComingPlan({
        ...data,
        songs,
        worshipDirectorName: data.worshipDirectorName || '',
      })
    } catch (e) {
      console.error(e)
      setComingPlan({ date, assignments: [], songs: [], worshipDirectorName: '' })
    } finally {
      setLoadingComingPlan(false)
    }
  }

  useEffect(() => {
    const d = dateFromUrl || nextSundayISO()
    setComingSundayDate(d)
    loadComingPlan(d)
    loadBudgetItems()
    if (dateFromUrl) setActiveTab('summary')
  }, [dateFromUrl])

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
      if (selectedDate === comingSundayDate) {
        setComingPlan((p) => ({ ...p, assignments: list }))
      }
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

  const budget2026 = entries
    .filter((e) => e.type === 'budget' && typeof e.period === 'string' && e.period.startsWith('2026-'))
    .reduce(
      (acc, e) => {
        acc.planned += e.data?.planned || 0
        acc.spent += e.data?.spent || 0
        return acc
      },
      { planned: 0, spent: 0 }
    )

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
        {/* Summary */}
        <button
          type="button"
          onClick={() => setActiveTab('summary')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
            activeTab === 'summary' ? 'bg-white border border-slate-200 border-b-0 text-blue-600' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Summary
        </button>
        {/* Assign team */}
        {canManageWorship && (
          <button
            type="button"
            onClick={() => setActiveTab('assign')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
              activeTab === 'assign' ? 'bg-white border border-slate-200 border-b-0 text-blue-600' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Assign team
          </button>
        )}
        {/* Budget & Spending */}
        {(canManageWorship || canViewInsights) && (
          <button
            type="button"
            onClick={() => setActiveTab('budget')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
              activeTab === 'budget' ? 'bg-white border border-slate-200 border-b-0 text-blue-600' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Budget & Spending
          </button>
        )}
        {/* Team */}
        {(canManageWorship || canViewInsights) && (
          <button
            type="button"
            onClick={() => setActiveTab('team')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
              activeTab === 'team' ? 'bg-white border border-slate-200 border-b-0 text-blue-600' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Team
          </button>
        )}
        {/* History */}
        {(canManageWorship || canViewInsights) && (
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
              activeTab === 'history' ? 'bg-white border border-slate-200 border-b-0 text-blue-600' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            History
          </button>
        )}
        {/* Data entry */}
        {canManageWorship && (
          <button
            type="button"
            onClick={() => setActiveTab('entry')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
              activeTab === 'entry' ? 'bg-white border border-slate-200 border-b-0 text-blue-600' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Data entry
          </button>
        )}
        {/* Insights (pastor) */}
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
        <div className="space-y-6">
          {/* Big 2026 budget box */}
          <div className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-400 rounded-2xl shadow-lg p-6 text-white max-w-3xl">
            <h2 className="text-sm font-semibold uppercase tracking-wide opacity-90">Budget 2026 (Worship)</h2>
            <div className="mt-3 flex flex-wrap items-end gap-8">
              <div>
                <p className="text-xs uppercase tracking-wide opacity-80">Total planned</p>
                <p className="text-3xl md:text-4xl font-bold mt-1">
                  RM {budget2026.planned.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide opacity-80">Total spent</p>
                <p className="text-3xl md:text-4xl font-bold mt-1">
                  RM {budget2026.spent.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide opacity-80">Balance</p>
                <p className="text-2xl md:text-3xl font-semibold mt-1">
                  RM {(budget2026.planned - budget2026.spent).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs md:text-sm opacity-90">
              Based on all Worship budget entries with period in 2026.
            </p>
          </div>

          {/* Plan coming Sunday */}
          <PlanComingSundayCard
            comingSundayDate={comingSundayDate}
            comingPlan={comingPlan}
            setComingPlan={setComingPlan}
            loadingComingPlan={loadingComingPlan}
            savingComingPlan={savingComingPlan}
            setSavingComingPlan={setSavingComingPlan}
            canManageWorship={canManageWorship}
            teamMembers={teamMembers}
            userProfile={userProfile}
            loadComingPlan={loadComingPlan}
            setSelectedDate={setSelectedDate}
            setActiveTab={setActiveTab}
            DEPARTMENT={DEPARTMENT}
            formatDMY={formatDMY}
          />
        </div>
      )}

      {activeTab === 'team' && (canManageWorship || canViewInsights) && (
        <div className="space-y-6">
          {canManageWorship && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-3">Add team member</h3>
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (!newMember.name.trim()) return
                  try {
                    await addWorshipTeamMember(
                      DEPARTMENT,
                      {
                        name: newMember.name.trim(),
                        memberSince: newMember.memberSince,
                        isFormer: newMember.isFormer,
                        positions: newMember.positions,
                        isWorshipDirector: newMember.isWorshipDirector,
                      },
                      userProfile?.email
                    )
                    setNewMember({
                      name: '',
                      memberSince: new Date().toISOString().slice(0, 10),
                      isFormer: false,
                      positions: [],
                      isWorshipDirector: false,
                    })
                    await loadTeam()
                  } catch (err) {
                    console.error(err)
                    alert('Failed to add member')
                  }
                }}
                className="flex flex-wrap gap-3 items-end"
              >
                <input type="text" placeholder="Name" value={newMember.name} onChange={(e) => setNewMember((m) => ({ ...m, name: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-300 w-40" />
                <input type="date" value={newMember.memberSince} onChange={(e) => setNewMember((m) => ({ ...m, memberSince: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-300" />
                <div className="flex flex-wrap gap-3 items-center text-sm text-slate-600">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={newMember.isFormer}
                      onChange={(e) => setNewMember((m) => ({ ...m, isFormer: e.target.checked }))}
                    />
                    Former
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={newMember.isWorshipDirector}
                      onChange={(e) => setNewMember((m) => ({ ...m, isWorshipDirector: e.target.checked }))}
                    />
                    Set as worship director
                  </label>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                  {MEMBER_POSITIONS.map((pos) => (
                    <label key={pos} className="flex items-center gap-1 px-2 py-1 rounded-full bg-slate-50 border border-slate-200">
                      <input
                        type="checkbox"
                        checked={newMember.positions.includes(pos)}
                        onChange={(e) =>
                          setNewMember((m) => ({
                            ...m,
                            positions: e.target.checked
                              ? [...m.positions, pos]
                              : m.positions.filter((p) => p !== pos),
                          }))
                        }
                      />
                      <span>{pos}</span>
                    </label>
                  ))}
                </div>
                <button type="submit" className="px-4 py-2 rounded-lg bg-slate-800 text-white font-medium hover:bg-slate-900">Add</button>
              </form>
              {teamMembers.length === 0 && (
                <button type="button" onClick={seedDemoTeam} className="mt-3 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
                  Add demo team (15 members)
                </button>
              )}
            </div>
          )}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <h2 className="px-5 py-4 font-semibold text-slate-800 border-b border-slate-200">Team members</h2>
            {loadingTeam ? (
              <div className="p-8 text-center text-slate-500">Loading...</div>
            ) : teamMembers.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No team members yet. Add above or use “Add demo team”.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-5 py-3 text-sm font-medium text-slate-600 w-12">SL</th>
                      <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Name</th>
                      <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Member since</th>
                      <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Duration & positions</th>
                      {canManageWorship && <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Action</th>}
                    </tr>
                  </thead>
                    <tbody className="divide-y divide-slate-200">
                      {[...teamMembers]
                        .sort((a, b) => (b.isWorshipDirector === true) - (a.isWorshipDirector === true))
                        .map((m, i) => (
                      <tr
                        key={m.id}
                        className={
                          'hover:bg-slate-50 ' +
                          (m.isWorshipDirector ? 'bg-amber-50/80' : '')
                        }
                      >
                        <td className="px-5 py-3 text-slate-600">{i + 1}</td>
                        <td className="px-5 py-3 font-medium text-slate-800">
                          {m.name}
                          {m.isWorshipDirector && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] uppercase tracking-wide">
                              Worship director
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-slate-600">{formatDMY(m.memberSince)}</td>
                        <td className="px-5 py-3 text-slate-600">
                          {differenceInDays(new Date(), new Date(m.memberSince))} days
                          {m.positions?.length ? (
                            <span className="block text-xs text-slate-500 mt-1">
                              Positions: {m.positions.join(', ')}
                            </span>
                          ) : null}
                        </td>
                        {canManageWorship && (
                          <td className="px-5 py-3">
                            <button type="button" onClick={() => setEditMember({ ...m })} className="text-blue-600 hover:underline text-sm font-medium">Edit</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <h2 className="px-5 py-4 font-semibold text-slate-800 border-b border-slate-200">Former members</h2>
            {loadingTeam ? (
              <div className="p-8 text-center text-slate-500">Loading...</div>
            ) : formerMembers.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No former members.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-5 py-3 text-sm font-medium text-slate-600 w-12">SL</th>
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
                        <td className="px-5 py-3 text-slate-600">{formatDMY(m.memberSince)}</td>
                        <td className="px-5 py-3 text-slate-600">{differenceInDays(new Date(), new Date(m.memberSince))} days</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'history' && (canManageWorship || canViewInsights) && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <h2 className="px-5 py-4 font-semibold text-slate-800 border-b border-slate-200">History (director entries)</h2>
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
      )}

      {editMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditMember(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800 mb-4">Edit member</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input
                  type="text"
                  value={editMember.name}
                  onChange={(e) => setEditMember((m) => ({ ...m, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Member since</label>
                <input
                  type="date"
                  value={editMember.memberSince || ''}
                  onChange={(e) => setEditMember((m) => ({ ...m, memberSince: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!editMember.isWorshipDirector}
                    onChange={(e) => setEditMember((m) => ({ ...m, isWorshipDirector: e.target.checked }))}
                  />
                  Worship director
                </label>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                {MEMBER_POSITIONS.map((pos) => (
                  <label key={pos} className="flex items-center gap-1 px-2 py-1 rounded-full bg-slate-50 border border-slate-200">
                    <input
                      type="checkbox"
                      checked={editMember.positions?.includes(pos)}
                      onChange={(e) =>
                        setEditMember((m) => ({
                          ...m,
                          positions: e.target.checked
                            ? [...(m.positions || []), pos]
                            : (m.positions || []).filter((p) => p !== pos),
                        }))
                      }
                    />
                    <span>{pos}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-3 mt-5">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await updateWorshipTeamMember(editMember.id, {
                      name: editMember.name,
                      memberSince: editMember.memberSince,
                      isWorshipDirector: !!editMember.isWorshipDirector,
                      positions: editMember.positions || [],
                    })
                    await loadTeam()
                    setEditMember(null)
                  } catch (e) {
                    console.error(e)
                    alert('Failed to update')
                  }
                }}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
              >
                Save
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await updateWorshipTeamMember(editMember.id, { isFormer: true })
                    await loadTeam()
                    setEditMember(null)
                  } catch (e) {
                    console.error(e)
                    alert('Failed to update')
                  }
                }}
                className="px-4 py-2 rounded-lg bg-slate-200 text-slate-700 font-medium hover:bg-slate-300"
              >
                Make former
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!confirm('Delete this member permanently?')) return
                  try {
                    await deleteWorshipTeamMember(editMember.id)
                    await loadTeam()
                    setEditMember(null)
                  } catch (e) {
                    console.error(e)
                    alert('Failed to delete')
                  }
                }}
                className="px-4 py-2 rounded-lg bg-red-100 text-red-700 font-medium hover:bg-red-200"
              >
                Delete
              </button>
              <button type="button" onClick={() => setEditMember(null)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100">
                Cancel
              </button>
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
            <div className="p-8 text-center text-slate-500">Add team members in the Team tab first (e.g. &quot;Add demo team&quot; for demo names).</div>
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
                        {(() => {
                          const posKey = positionKeyForRole(role)
                          const eligible = posKey
                            ? teamMembers.filter((m) => m.positions?.includes(posKey))
                            : teamMembers
                          return eligible.map((m) => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))
                        })()}
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
          {/* Detailed worship budget table (spreadsheet-style) */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4 gap-3">
              <div>
                <h2 className="font-semibold text-slate-800">Detailed worship budget</h2>
                <p className="text-xs text-slate-500">
                  Excel-style list of budget lines: category, description, quantities, and expected dates. Fully editable.
                </p>
              </div>
              {canManageWorship && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingBudgetItem(null)
                    setBudgetItemForm({
                      category: '',
                      subCategory: '',
                      description: '',
                      quantity: '',
                      unitCost: '',
                      totalCost: '',
                      type: '',
                      expectedDate: '',
                    })
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                >
                  + New line
                </button>
              )}
            </div>

            {canManageWorship && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  try {
                    const payload = {
                      category: budgetItemForm.category,
                      subCategory: budgetItemForm.subCategory,
                      description: budgetItemForm.description,
                      quantity: Number(budgetItemForm.quantity) || 0,
                      unitCost: Number(budgetItemForm.unitCost) || 0,
                      totalCost:
                        budgetItemForm.totalCost !== ''
                          ? Number(budgetItemForm.totalCost) || 0
                          : (Number(budgetItemForm.quantity) || 0) * (Number(budgetItemForm.unitCost) || 0),
                      type: budgetItemForm.type,
                      expectedDate: budgetItemForm.expectedDate,
                    }
                    if (editingBudgetItem) {
                      await updateWorshipBudgetItem(editingBudgetItem.id, payload)
                    } else {
                      await addWorshipBudgetItem(DEPARTMENT, payload, userProfile?.email)
                    }
                    setBudgetItemForm({
                      category: '',
                      subCategory: '',
                      description: '',
                      quantity: '',
                      unitCost: '',
                      totalCost: '',
                      type: '',
                      expectedDate: '',
                    })
                    setEditingBudgetItem(null)
                    await loadBudgetItems()
                  } catch (err) {
                    console.error(err)
                    alert('Failed to save budget line')
                  }
                }}
                className="mb-4 grid grid-cols-1 md:grid-cols-4 lg:grid-cols-8 gap-3 items-end"
              >
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
                  <input
                    type="text"
                    value={budgetItemForm.category}
                    onChange={(e) => setBudgetItemForm((f) => ({ ...f, category: e.target.value }))}
                    className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Sub category</label>
                  <input
                    type="text"
                    value={budgetItemForm.subCategory}
                    onChange={(e) => setBudgetItemForm((f) => ({ ...f, subCategory: e.target.value }))}
                    className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
                  />
                </div>
                <div className="md:col-span-2 lg:col-span-3">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
                  <input
                    type="text"
                    value={budgetItemForm.description}
                    onChange={(e) => setBudgetItemForm((f) => ({ ...f, description: e.target.value }))}
                    className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={budgetItemForm.quantity}
                    onChange={(e) => setBudgetItemForm((f) => ({ ...f, quantity: e.target.value }))}
                    className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Unit cost (RM)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={budgetItemForm.unitCost}
                    onChange={(e) => setBudgetItemForm((f) => ({ ...f, unitCost: e.target.value }))}
                    className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Total cost (RM)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Auto"
                    value={budgetItemForm.totalCost}
                    onChange={(e) => setBudgetItemForm((f) => ({ ...f, totalCost: e.target.value }))}
                    className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Type</label>
                  <select
                    value={budgetItemForm.type}
                    onChange={(e) => setBudgetItemForm((f) => ({ ...f, type: e.target.value }))}
                    className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm bg-white"
                  >
                    <option value="">Select</option>
                    <option value="One-off">One-off</option>
                    <option value="Recurring">Recurring</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Expected date</label>
                  <input
                    type="date"
                    value={budgetItemForm.expectedDate}
                    onChange={(e) => setBudgetItemForm((f) => ({ ...f, expectedDate: e.target.value }))}
                    className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
                  />
                </div>
                <div className="md:col-span-1 lg:col-span-1 flex gap-2 justify-end">
                  {editingBudgetItem && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingBudgetItem(null)
                        setBudgetItemForm({
                          category: '',
                          subCategory: '',
                          description: '',
                          quantity: '',
                          unitCost: '',
                          totalCost: '',
                          type: '',
                          expectedDate: '',
                        })
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 bg-white"
                    >
                      Cancel edit
                    </button>
                  )}
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                  >
                    {editingBudgetItem ? 'Update line' : 'Add line'}
                  </button>
                </div>
              </form>
            )}

            <div className="mt-2 border border-slate-200 rounded-lg overflow-hidden">
              {loadingBudgetItems ? (
                <div className="p-4 text-sm text-slate-500">Loading budget items...</div>
              ) : budgetItemsError ? (
                <div className="p-4 text-sm text-red-600">{budgetItemsError}</div>
              ) : budgetItems.length === 0 ? (
                <div className="p-4 text-sm text-slate-500">
                  No detailed budget lines yet. Use the form above to bring in your Excel lines (copy &amp; paste works).
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-amber-50">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold text-slate-700">Category</th>
                        <th className="px-4 py-2 text-left font-semibold text-slate-700">Sub category</th>
                        <th className="px-4 py-2 text-left font-semibold text-slate-700 w-[26rem]">Description</th>
                        <th className="px-4 py-2 text-right font-semibold text-slate-700">Qty</th>
                        <th className="px-4 py-2 text-right font-semibold text-slate-700">Unit cost (RM)</th>
                        <th className="px-4 py-2 text-right font-semibold text-slate-700">Total (RM)</th>
                        <th className="px-4 py-2 text-left font-semibold text-slate-700">Type</th>
                        <th className="px-4 py-2 text-left font-semibold text-slate-700">Expected date</th>
                        {canManageWorship && <th className="px-4 py-2 text-left font-semibold text-slate-700">Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-100">
                      {budgetItems.map((item) => (
                        <tr key={item.id} className="hover:bg-amber-50/60">
                          <td className="px-4 py-2 text-slate-800">{item.category}</td>
                          <td className="px-4 py-2 text-slate-800">{item.subCategory}</td>
                          <td className="px-4 py-2 text-slate-700 max-w-xl">
                            <div className="whitespace-pre-wrap text-xs md:text-sm">{item.description}</div>
                          </td>
                          <td className="px-4 py-2 text-right text-slate-700">{item.quantity ?? 0}</td>
                          <td className="px-4 py-2 text-right text-slate-700">
                            {item.unitCost != null ? item.unitCost.toLocaleString(undefined, { maximumFractionDigits: 2 }) : 0}
                          </td>
                          <td className="px-4 py-2 text-right text-slate-800 font-semibold">
                            {item.totalCost != null ? item.totalCost.toLocaleString(undefined, { maximumFractionDigits: 2 }) : 0}
                          </td>
                          <td className="px-4 py-2 text-slate-700">{item.type}</td>
                          <td className="px-4 py-2 text-slate-700 text-xs">
                            {item.expectedDate ? formatDMY(item.expectedDate) : ''}
                          </td>
                          {canManageWorship && (
                            <td className="px-4 py-2 text-xs text-slate-600 space-x-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingBudgetItem(item)
                                  setBudgetItemForm({
                                    category: item.category || '',
                                    subCategory: item.subCategory || '',
                                    description: item.description || '',
                                    quantity: item.quantity != null ? String(item.quantity) : '',
                                    unitCost: item.unitCost != null ? String(item.unitCost) : '',
                                    totalCost: item.totalCost != null ? String(item.totalCost) : '',
                                    type: item.type || '',
                                    expectedDate: item.expectedDate || '',
                                  })
                                }}
                                className="text-blue-600 hover:underline"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!window.confirm('Delete this budget line?')) return
                                  try {
                                    await deleteWorshipBudgetItem(item.id)
                                    if (editingBudgetItem && editingBudgetItem.id === item.id) {
                                      setEditingBudgetItem(null)
                                      setBudgetItemForm({
                                        category: '',
                                        subCategory: '',
                                        description: '',
                                        quantity: '',
                                        unitCost: '',
                                        totalCost: '',
                                        type: '',
                                        expectedDate: '',
                                      })
                                    }
                                    await loadBudgetItems()
                                  } catch (err) {
                                    console.error(err)
                                    alert('Failed to delete budget line')
                                  }
                                }}
                                className="text-red-600 hover:underline"
                              >
                                Delete
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

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
