import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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
  getDepartmentSubDepartments,
  addDepartmentSubDepartment,
  updateDepartmentSubDepartment,
  deleteDepartmentSubDepartment,
} from '../services/firestore'
import { useAuth } from '../context/AuthContext'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts'
import { format, subMonths, differenceInDays } from 'date-fns'
import { formatDMY } from '../utils/date'
import DepartmentTabBar from '../components/DepartmentTabBar'

const DEPARTMENT = 'Worship'
const PERIOD = format(new Date(), 'yyyy-MM')

// Fixed roles on the left of the assign table (master list per service)
const ASSIGNMENT_ROLES = [
  'Lead Vocal-1',
  'Lead Vocal-2',
  'Lead Vocal-3',
  'Lead Vocal-4',
  'Lead Vocal-5',
  'Lead Vocal-6',
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

function upcomingSundays(count = 5) {
  const result = []
  const today = new Date()
  const daysToNext = today.getDay() === 0 ? 0 : 7 - today.getDay()
  const first = new Date(today)
  first.setDate(today.getDate() + daysToNext)
  for (let i = 0; i < count; i++) {
    const d = new Date(first)
    d.setDate(first.getDate() + i * 7)
    result.push(format(d, 'yyyy-MM-dd'))
  }
  return result
}

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

export default function DepartmentWorship() {
  const { userProfile, hasPermission, isFounder, hasAccess } = useAuth()
  if (!hasAccess(userProfile, DEPARTMENT)) {
    return (
      <div className="p-6 text-slate-600">
        <Link to="/departments" className="text-blue-600 hover:underline">← Departments</Link>
        <p className="mt-4">You do not have access to {DEPARTMENT} department.</p>
      </div>
    )
  }
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('summary')
  const [operationsSubTab, setOperationsSubTab] = useState('subDepartment')
  const [subDepartments, setSubDepartments] = useState([])
  const [subDeptLoading, setSubDeptLoading] = useState(false)
  const [subDeptError, setSubDeptError] = useState(null)
  const [subDeptForm, setSubDeptForm] = useState({ name: '' })
  const [editingSubDept, setEditingSubDept] = useState(null)
  const [subDeptModalOpen, setSubDeptModalOpen] = useState(false)
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
  const [editMember, setEditMember] = useState(null)
  const [budgetItems, setBudgetItems] = useState([])
  const [loadingBudgetItems, setLoadingBudgetItems] = useState(true)
  const [budgetItemsError, setBudgetItemsError] = useState(null)
  const [editingBudgetItem, setEditingBudgetItem] = useState(null)
  const [structureModal, setStructureModal] = useState(null)
  const [localAssignments, setLocalAssignments] = useState([])
  const [savingAssign, setSavingAssign] = useState(false)
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

  useEffect(() => {
    loadBudgetItems()
  }, [])

  useEffect(() => {
    if (activeTab === 'assign' && selectedDate) loadScheduleForDate(selectedDate)
  }, [activeTab, selectedDate])

  async function loadSubDepartments() {
    setSubDeptLoading(true)
    setSubDeptError(null)
    try {
      const list = await getDepartmentSubDepartments(DEPARTMENT)
      setSubDepartments(list)
    } catch (e) {
      setSubDeptError(e?.message || 'Could not load sub departments.')
      setSubDepartments([])
    } finally {
      setSubDeptLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'operations' && operationsSubTab === 'subDepartment') loadSubDepartments()
  }, [activeTab, operationsSubTab])

  useEffect(() => {
    setLocalAssignments(scheduleForDate.assignments || [])
  }, [scheduleForDate])

  function getLocalField(role, field) {
    const a = localAssignments.find((x) => x.role === role)
    return a?.[field] ?? ''
  }

  function getStructureData(role) {
    const raw = getLocalField(role, 'structure')
    if (!raw) return null
    if (typeof raw === 'object') return raw
    if (typeof raw === 'string' && raw.trim()) return { text: raw, fileName: null }
    return null
  }

  function updateLocal(role, patch) {
    setLocalAssignments((prev) => {
      const list = [...prev]
      const idx = list.findIndex((x) => x.role === role)
      if (patch.memberId !== undefined && !patch.memberId) {
        if (idx >= 0) list.splice(idx, 1)
      } else {
        const existing = idx >= 0 ? list[idx] : { role }
        const merged = { ...existing, ...patch }
        if (idx >= 0) list[idx] = merged
        else list.push(merged)
      }
      return list
    })
  }

  async function saveAssignPlan() {
    setSavingAssign(true)
    try {
      await setWorshipScheduleByDate(DEPARTMENT, selectedDate, localAssignments, userProfile?.email)
      setScheduleForDate((s) => ({ ...s, assignments: localAssignments }))
      if (selectedDate === comingSundayDate) {
        setComingPlan((p) => ({ ...p, assignments: localAssignments }))
      }
    } catch (e) {
      console.error(e)
      alert('Failed to save')
    } finally {
      setSavingAssign(false)
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
    <div>
      <DepartmentTabBar slug="worship" activeTab={activeTab} setActiveTab={setActiveTab} />
      <div className="space-y-4 p-4">
      {activeTab === 'summary' && (canManageWorship || canViewInsights) && (
        <div className="space-y-4">
          {/* Budget 2026 - compact, colourful */}
          <div className="bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 rounded-xl shadow-md p-4 text-white max-w-3xl">
            <h2 className="text-sm font-semibold uppercase tracking-wider opacity-95">Budget 2026 (Worship)</h2>
            <div className="mt-2 flex flex-wrap items-end gap-6">
              <div>
                <p className="text-sm uppercase tracking-wider opacity-90">Planned</p>
                <p className="text-2xl md:text-3xl font-bold leading-tight">RM {budget2026.planned.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
              <div>
                <p className="text-sm uppercase tracking-wider opacity-90">Spent</p>
                <p className="text-2xl md:text-3xl font-bold leading-tight">RM {budget2026.spent.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
              <div>
                <p className="text-sm uppercase tracking-wider opacity-90">Balance</p>
                <p className="text-xl md:text-2xl font-semibold leading-tight">RM {(budget2026.planned - budget2026.spent).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
            </div>
            <p className="mt-2 text-sm opacity-90">All Worship budget entries, period 2026.</p>
          </div>
        </div>
      )}

      {activeTab === 'assign' && canManageWorship && (
        <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
              <div className="px-5 py-4 border-b border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-semibold text-slate-800">Assign worship team</h2>
                  <button
                    type="button"
                    onClick={saveAssignPlan}
                    disabled={savingAssign}
                    className="px-4 py-1.5 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-60 shadow-sm"
                  >
                    {savingAssign ? 'Saving...' : 'Save plan'}
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium">Coming Sundays:</span>
                  {upcomingSundays(5).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setSelectedDate(d)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${selectedDate === d ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-600 border-slate-300 hover:border-amber-400 hover:text-amber-700'}`}
                    >
                      {format(new Date(d), 'd MMM')}
                    </button>
                  ))}
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="px-2 py-1 text-sm rounded-lg border border-slate-300 text-slate-600"
                    title="Pick a custom date"
                  />
                </div>
              </div>
              {loadingSchedule ? (
                <div className="p-8 text-center text-slate-500">Loading...</div>
              ) : teamMembers.length === 0 ? (
                <div className="p-8 text-center text-slate-500">Add team members in the Team tab first.</div>
              ) : (
                <table key={selectedDate} className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600 w-[160px]">Role</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600 w-[190px]">Assigned to</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600 w-[170px]">Song Name</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600 w-[70px]">Key</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600 w-[160px]">Structure</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {ASSIGNMENT_ROLES.map((role) => {
                      const isLeadVocal = role.startsWith('Lead Vocal')
                      return (
                      <tr key={role} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2 font-medium text-slate-800 text-sm">{role}</td>
                        <td className="px-3 py-2">
                          <select
                            value={getLocalField(role, 'memberId')}
                            onChange={(e) => {
                              const val = e.target.value
                              const member = teamMembers.find((m) => m.id === val)
                              updateLocal(role, { memberId: val || '', memberName: member?.name || '' })
                            }}
                            className="w-full px-2 py-1.5 text-sm rounded border border-slate-300 bg-white"
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
                        <td className="px-3 py-2">
                          {isLeadVocal && (
                            <input
                              type="text"
                              value={getLocalField(role, 'songName')}
                              placeholder="Song name"
                              onChange={(e) => updateLocal(role, { songName: e.target.value })}
                              className="w-full px-2 py-1.5 text-sm rounded border border-slate-300 bg-white"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {isLeadVocal && (
                            <input
                              type="text"
                              value={getLocalField(role, 'key')}
                              placeholder="Key"
                              onChange={(e) => updateLocal(role, { key: e.target.value })}
                              className="w-full px-2 py-1.5 text-sm rounded border border-slate-300 bg-white"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {isLeadVocal ? (() => {
                            const sd = getStructureData(role)
                            return sd ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setStructureModal({ role, ...sd })}
                                  className="text-sm text-amber-700 hover:text-amber-900 hover:underline truncate max-w-[120px]"
                                  title={sd.fileName || 'View structure'}
                                >
                                  📄 {sd.fileName || 'View'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateLocal(role, { structure: null })}
                                  className="text-slate-400 hover:text-red-500 text-base leading-none flex-shrink-0"
                                  title="Remove"
                                >
                                  ×
                                </button>
                              </div>
                            ) : (
                              <label className="cursor-pointer inline-block">
                                <span className="text-xs text-slate-500 hover:text-amber-700 border border-dashed border-slate-300 hover:border-amber-400 rounded px-2 py-1 transition-colors">
                                  + Upload .docx
                                </span>
                                <input
                                  type="file"
                                  accept=".docx"
                                  className="hidden"
                                  onChange={async (e) => {
                                    const file = e.target.files[0]
                                    if (!file) return
                                    try {
                                      const mammoth = await import('mammoth')
                                      const arrayBuffer = await file.arrayBuffer()
                                      const result = await mammoth.extractRawText({ arrayBuffer })
                                      updateLocal(role, { structure: { text: result.value, fileName: file.name } })
                                    } catch (err) {
                                      console.error(err)
                                      alert('Failed to read file. Make sure it is a valid .docx file.')
                                    }
                                    e.target.value = ''
                                  }}
                                />
                              </label>
                            )
                          })() : null}
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

          {structureModal && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
              onClick={() => setStructureModal(null)}
            >
              <div
                className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{structureModal.fileName || 'Song Structure'}</p>
                    <p className="text-xs text-slate-500">{structureModal.role}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStructureModal(null)}
                    className="text-slate-400 hover:text-slate-700 text-2xl leading-none flex-shrink-0"
                  >
                    ×
                  </button>
                </div>
                <div className="p-5 overflow-y-auto whitespace-pre-wrap text-sm text-slate-700 leading-relaxed font-mono">
                  {structureModal.text || <span className="text-slate-400 italic">No content extracted.</span>}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'operations' && (canManageWorship || canViewInsights) && (
        <div className="space-y-4">

          <div className="flex overflow-x-auto scrollbar-hide border-b border-slate-200 gap-1">
            {[
              { key: 'subDepartment', label: 'Sub Department' },
              { key: 'team', label: 'Team' },
              { key: 'planning', label: 'Planning' },
              { key: 'budget', label: 'Budget & Spending' },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setOperationsSubTab(key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  operationsSubTab === key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-600 hover:text-indigo-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {operationsSubTab === 'subDepartment' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-slate-800">Sub Departments</h2>
                  {canManageWorship && (
                    <button
                      type="button"
                      onClick={() => { setEditingSubDept(null); setSubDeptForm({ name: '' }); setSubDeptModalOpen(true) }}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                    >
                      + Add
                    </button>
                  )}
                </div>
                {subDeptLoading ? (
                  <div className="py-6 text-center text-slate-500">Loading...</div>
                ) : subDeptError ? (
                  <div className="py-6 text-center text-red-600">{subDeptError}</div>
                ) : subDepartments.length === 0 ? (
                  <div className="py-6 text-center text-slate-500">No sub departments yet.</div>
                ) : (
                  <div className="space-y-2">
                    {subDepartments.map((sd) => (
                      <div key={sd.id} className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-slate-50 border border-slate-200">
                        <span className="font-medium text-slate-800">{sd.name}</span>
                        {canManageWorship && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => { setEditingSubDept(sd); setSubDeptForm({ name: sd.name || '' }); setSubDeptModalOpen(true) }}
                              className="text-sm text-blue-600 hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (!window.confirm('Delete this sub department?')) return
                                try {
                                  await deleteDepartmentSubDepartment(sd.id)
                                  await loadSubDepartments()
                                } catch (e) {
                                  alert(e?.message || 'Failed to delete')
                                }
                              }}
                              className="text-sm text-red-600 hover:underline"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {subDeptModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSubDeptModalOpen(false)}>
                  <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
                    <h3 className="font-semibold text-slate-800 mb-4">
                      {editingSubDept ? 'Edit sub department' : 'Add sub department'}
                    </h3>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault()
                        try {
                          if (editingSubDept) {
                            await updateDepartmentSubDepartment(editingSubDept.id, { name: subDeptForm.name.trim() })
                          } else {
                            await addDepartmentSubDepartment(DEPARTMENT, { name: subDeptForm.name.trim() }, userProfile?.email)
                          }
                          setSubDeptModalOpen(false)
                          await loadSubDepartments()
                        } catch (err) {
                          alert(err?.message || 'Failed to save')
                        }
                      }}
                      className="space-y-3"
                    >
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                        <input
                          type="text"
                          value={subDeptForm.name}
                          onChange={(e) => setSubDeptForm((f) => ({ ...f, name: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border border-slate-300"
                          required
                        />
                      </div>
                      <div className="flex gap-3 pt-1">
                        <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700">
                          {editingSubDept ? 'Save' : 'Add'}
                        </button>
                        <button type="button" onClick={() => setSubDeptModalOpen(false)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100">Cancel</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {operationsSubTab === 'team' && (
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
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600 w-12">SL</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Name</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Member since</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Duration & positions</th>
                      {canManageWorship && <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Action</th>}
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
                        <td className="px-4 py-2 text-slate-600">{i + 1}</td>
                        <td className="px-4 py-2 font-medium text-slate-800">
                          {m.name}
                          {m.isWorshipDirector && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] uppercase tracking-wide">
                              Worship director
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-slate-600">{formatDMY(m.memberSince)}</td>
                        <td className="px-4 py-2 text-slate-600">
                          {differenceInDays(new Date(), new Date(m.memberSince))} days
                          {m.positions?.length ? (
                            <span className="block text-xs text-slate-500 mt-1">
                              Positions: {m.positions.join(', ')}
                            </span>
                          ) : null}
                        </td>
                        {canManageWorship && (
                          <td className="px-4 py-2">
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
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600 w-12">SL</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Name</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Member since</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {formerMembers.map((m, i) => (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 text-slate-600">{i + 1}</td>
                        <td className="px-4 py-2 font-medium text-slate-800">{m.name}</td>
                        <td className="px-4 py-2 text-slate-600">{formatDMY(m.memberSince)}</td>
                        <td className="px-4 py-2 text-slate-600">{differenceInDays(new Date(), new Date(m.memberSince))} days</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
          )}

          {operationsSubTab === 'planning' && (
            <div className="space-y-6">
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
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Period</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Type</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Details</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Entered by</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {entries.slice(0, 20).map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 text-slate-800">{e.period}</td>
                        <td className="px-4 py-2 text-slate-600 capitalize">{e.type}</td>
                        <td className="px-4 py-2 text-slate-600">
                          {e.type === 'team' && (e.data?.notes || '—')}
                          {e.type === 'budget' && `Planned: ${e.data?.planned ?? 0} RM, Spent: ${e.data?.spent ?? 0} RM`}
                          {e.type === 'participation' && `${e.data?.count ?? 0} people`}
                        </td>
                        <td className="px-4 py-2 text-slate-500 text-sm">{e.enteredBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
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
                    <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Period</th>
                    <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Type</th>
                    <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Details</th>
                    <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Entered by</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {entries.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-800">{e.period}</td>
                      <td className="px-4 py-2 text-slate-600 capitalize">{e.type}</td>
                      <td className="px-4 py-2 text-slate-600">
                        {e.type === 'team' && (e.data?.notes || '—')}
                        {e.type === 'budget' && `Planned: ${e.data?.planned ?? 0} RM, Spent: ${e.data?.spent ?? 0} RM`}
                        {e.type === 'participation' && `${e.data?.count ?? 0} people`}
                      </td>
                      <td className="px-4 py-2 text-slate-500 text-sm">{e.enteredBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
            </div>
          )}

          {operationsSubTab === 'budget' && (
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
                          <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Period</th>
                          <th className="text-right px-4 py-2 text-sm font-medium text-slate-600">Planned (RM)</th>
                          <th className="text-right px-4 py-2 text-sm font-medium text-slate-600">Spent (RM)</th>
                          <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Entered by</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {budgetEntries.map((e) => (
                          <tr key={e.id} className="hover:bg-slate-50">
                            <td className="px-4 py-2 text-slate-800">{e.period}</td>
                            <td className="px-4 py-2 text-right text-slate-600">{e.data?.planned ?? 0}</td>
                            <td className="px-4 py-2 text-right text-slate-600">{e.data?.spent ?? 0}</td>
                            <td className="px-4 py-2 text-slate-500 text-sm">{e.enteredBy}</td>
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


      </div>
    </div>
  )
}