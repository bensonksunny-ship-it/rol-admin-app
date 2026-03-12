import { useParams, Link, Navigate } from 'react-router-dom'
import { useEffect, useMemo, useState, Fragment } from 'react'
import { useAuth } from '../context/AuthContext'
import { getDepartmentBySlug } from '../constants/departments'
import {
  getTasks,
  getDepartmentEntries,
  addDepartmentEntry,
  getDepartmentTeamMembers,
  addDepartmentTeamMember,
  updateDepartmentTeamMember,
  deleteDepartmentTeamMember,
  getFinanceBudgetItemsByDepartment,
  addFinanceBudgetItem,
  updateFinanceBudgetItem,
  deleteFinanceBudgetItem,
  getCellGroups,
  getCellGroupMembers,
  addCellGroup,
  addCellGroupMember,
  updateCellGroupMember,
  deleteCellGroupMember,
  getLatestCellAttendance,
  addCellAttendance,
  getCaringMembers,
  addCaringMember,
  updateCaringMember,
  deleteCaringMember,
  getDepartmentUpdates,
  addDepartmentUpdate,
  updateDepartmentUpdate,
  deleteDepartmentUpdate,
} from '../services/firestore'
import { ROLES } from '../constants/roles'
import { differenceInDays, differenceInYears, differenceInMonths, format } from 'date-fns'
import { formatDMY } from '../utils/date'
import PlanningBoard from '../components/PlanningBoard/PlanningBoard'

const BASE_TABS = ['summary', 'team', 'planning', 'financial']

export default function DepartmentHub() {
  const { slug } = useParams()
  const { userProfile, canManageDepartment, isDepartmentHead } = useAuth()
  const department = getDepartmentBySlug(slug)

  const [tasks, setTasks] = useState([])
  const [entries, setEntries] = useState([])
  const [planningNotes, setPlanningNotes] = useState('')
  const [savingPlanning, setSavingPlanning] = useState(false)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('summary')
  const [team, setTeam] = useState([])
  const [loadingTeam, setLoadingTeam] = useState(false)
  const [teamError, setTeamError] = useState('')
  const [editingMember, setEditingMember] = useState(null)
  const [memberForm, setMemberForm] = useState({
    name: '',
    role: '',
    memberSince: new Date().toISOString().slice(0, 10),
    isFormer: false,
    notes: '',
  })
  const [budgetItems, setBudgetItems] = useState([])
  const [loadingBudget, setLoadingBudget] = useState(false)
  const [editingBudgetId, setEditingBudgetId] = useState(null)
  const [budgetForm, setBudgetForm] = useState({
    category: '',
    subCategory: '',
    description: '',
    quantity: '',
    unitCost: '',
    priority: 'Medium',
    type: 'Recurring',
    justification: '',
    expectedDate: format(new Date(), 'yyyy-MM-dd'),
  })
  const [budgetModalOpen, setBudgetModalOpen] = useState(false)
  const [cellGroups, setCellGroups] = useState([])
  const [loadingCellGroups, setLoadingCellGroups] = useState(false)
  const [expandedCellId, setExpandedCellId] = useState(null)
  const [cellMembers, setCellMembers] = useState([])
  const [loadingCellMembers, setLoadingCellMembers] = useState(false)
  const [cellMemberForm, setCellMemberForm] = useState({ name: '', birthday: '', anniversary: '', phone: '', locality: '' })
  const [cellMemberModalOpen, setCellMemberModalOpen] = useState(false)
  const [editingCellMemberId, setEditingCellMemberId] = useState(null)
  const [cellGroupModalOpen, setCellGroupModalOpen] = useState(false)
  const [newCellGroupForm, setNewCellGroupForm] = useState({ cellName: '', leader: '' })
  const [latestCellAttendance, setLatestCellAttendance] = useState(null)
  const [cellAttendanceModalOpen, setCellAttendanceModalOpen] = useState(false)
  const [cellAttendanceForm, setCellAttendanceForm] = useState({ date: format(new Date(), 'yyyy-MM-dd'), totalAttendance: '' })
  const [caringMembers, setCaringMembers] = useState([])
  const [loadingCaringMembers, setLoadingCaringMembers] = useState(false)
  const [expandedCaringId, setExpandedCaringId] = useState(null)
  const [caringMemberForm, setCaringMemberForm] = useState({
    membershipNumber: '', name: '', dob: '', phone: '', email: '', nativity: '', currentPlace: '', firstSunday: '', cellName: '',
  })
  const [caringMemberModalOpen, setCaringMemberModalOpen] = useState(false)
  const [editingCaringId, setEditingCaringId] = useState(null)
  const [caringCellNames, setCaringCellNames] = useState([])
  const [departmentUpdates, setDepartmentUpdates] = useState([])
  const [loadingDepartmentUpdates, setLoadingDepartmentUpdates] = useState(false)
  const [updateModalOpen, setUpdateModalOpen] = useState(false)
  const [editingUpdateId, setEditingUpdateId] = useState(null)
  const [updateForm, setUpdateForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    update: '',
    actionPlan: '',
  })

  const tabs = useMemo(
    () =>
      slug === 'cell'
        ? ['summary', 'cellGroups', 'team', 'planning', 'financial']
        : slug === 'caring'
          ? ['summary', 'members', 'team', 'planning', 'financial']
          : BASE_TABS,
    [slug]
  )

  function formatDuration(firstSundayStr) {
    if (!firstSundayStr) return '—'
    const start = new Date(firstSundayStr)
    if (isNaN(start.getTime())) return '—'
    const now = new Date()
    const totalDays = differenceInDays(now, start)
    if (totalDays < 0) return '—'
    const years = Math.floor(totalDays / 365)
    const months = Math.floor((totalDays % 365) / 30)
    const days = totalDays - years * 365 - months * 30
    const parts = []
    if (years > 0) parts.push(`${years} year${years !== 1 ? 's' : ''}`)
    if (months > 0) parts.push(`${months} month${months !== 1 ? 's' : ''}`)
    if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`)
    return parts.length ? parts.join(' ') : 'Less than a day'
  }

  useEffect(() => {
    if (!department) {
      setLoading(false)
      return
    }
    setLoading(true)
    const name = department.name
    setLoadingTeam(true)
    Promise.allSettled([
      getTasks({ department: name }),
      getDepartmentEntries(name, { limit: 20 }),
      getDepartmentTeamMembers(name),
    ]).then(([tasksRes, entriesRes, teamRes]) => {
      if (tasksRes.status === 'fulfilled') setTasks(tasksRes.value)
      if (entriesRes.status === 'fulfilled') {
        const entryList = entriesRes.value
        setEntries(entryList)
        const latest = entryList.find((e) => e.type === 'planning' || e.notes) || entryList[0]
        setPlanningNotes(latest?.notes ?? '')
      }
      if (teamRes.status === 'fulfilled') {
        setTeam(teamRes.value)
        setTeamError('')
      } else {
        setTeam([])
        setTeamError('Could not load team members.')
      }
      setLoading(false)
      setLoadingTeam(false)
    })
  }, [department])

  useEffect(() => {
    if (department && activeTab === 'financial') {
      setLoadingBudget(true)
      getFinanceBudgetItemsByDepartment(department.name)
        .then(setBudgetItems)
        .finally(() => setLoadingBudget(false))
    }
  }, [department, activeTab])

  useEffect(() => {
    if (!department || activeTab !== 'planning') return
    setLoadingDepartmentUpdates(true)
    getDepartmentUpdates(department.name)
      .then(setDepartmentUpdates)
      .finally(() => setLoadingDepartmentUpdates(false))
  }, [department, activeTab])

  useEffect(() => {
    if (department && slug === 'cell' && activeTab === 'cellGroups') {
      setLoadingCellGroups(true)
      Promise.all([getCellGroups(department.name), getLatestCellAttendance(department.name)])
        .then(([groups, attendance]) => {
          setCellGroups(groups)
          setLatestCellAttendance(attendance)
        })
        .finally(() => setLoadingCellGroups(false))
    }
  }, [department, slug, activeTab])

  useEffect(() => {
    if (slug === 'caring' && activeTab === 'members') {
      setLoadingCaringMembers(true)
      Promise.all([getCaringMembers(), getCellGroups('Cell')])
        .then(([members, cells]) => {
          setCaringMembers(members)
          setCaringCellNames(cells.map((c) => c.cellName).filter(Boolean))
        })
        .finally(() => setLoadingCaringMembers(false))
    }
  }, [slug, activeTab])

  useEffect(() => {
    if (!expandedCellId) {
      setCellMembers([])
      return
    }
    setLoadingCellMembers(true)
    getCellGroupMembers(expandedCellId)
      .then(setCellMembers)
      .finally(() => setLoadingCellMembers(false))
  }, [expandedCellId])

  if (!department) {
    return (
      <div className="p-6 text-slate-600">
        <Link to="/departments" className="text-blue-600 hover:underline">← Departments</Link>
        <p className="mt-4">Department not found.</p>
      </div>
    )
  }

  if (department.customPage === 'worship') return <Navigate to="/department/worship" replace />

  if (!canManageDepartment(department.name)) {
    return (
      <div className="p-6 text-slate-600">
        <Link to="/departments" className="text-blue-600 hover:underline">← Departments</Link>
        <p className="mt-4">You do not have permission to access this department.</p>
      </div>
    )
  }

  const canEdit = canManageDepartment(department.name)
  const headLabel = userProfile?.department === department.name && isDepartmentHead(department.name)
    ? (userProfile?.role === ROLES.DIRECTOR ? 'Director' : 'Coordinator')
    : null

  const handleSavePlanning = async (e) => {
    e.preventDefault()
    if (!canEdit) return
    setSavingPlanning(true)
    try {
      await addDepartmentEntry({
        department: department.name,
        type: 'planning',
        period: new Date().toISOString().slice(0, 7),
        notes: planningNotes,
        enteredBy: userProfile?.displayName || userProfile?.email || 'unknown',
      })
      setEntries((prev) => [{ notes: planningNotes, type: 'planning', createdAt: new Date() }, ...prev])
    } finally {
      setSavingPlanning(false)
    }
  }

  const pending = useMemo(
    () => tasks.filter((t) => t.status !== 'Completed'),
    [tasks]
  )
  const completed = useMemo(
    () => tasks.filter((t) => t.status === 'Completed'),
    [tasks]
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/departments" className="text-slate-500 hover:text-slate-700">← Departments</Link>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{department.name} dashboard</h1>
        {headLabel && <p className="text-sm text-slate-500 mt-0.5">Department head: {headLabel}</p>}
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 border-b border-slate-200 pb-0.5 mt-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab
                ? 'bg-gradient-to-r from-indigo-500 to-blue-500 text-white shadow-sm'
                : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-700'
            }`}
          >
            {tab === 'summary' && 'Summary'}
            {tab === 'team' && 'Team'}
            {tab === 'planning' && 'Planning'}
            {tab === 'financial' && 'Budget & Spending'}
            {tab === 'cellGroups' && 'Cell Groups'}
            {tab === 'members' && 'Members'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-8 text-center text-slate-500">Loading...</div>
      ) : (
        <>
          {activeTab === 'summary' && (
            <>
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h2 className="font-semibold text-slate-800 mb-3">Summary</h2>
                <p className="text-sm text-slate-600">
                  Overview of tasks and recent entries for this department.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Total tasks</p>
                    <p className="text-2xl font-bold text-slate-800 mt-1">{tasks.length}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Pending</p>
                    <p className="text-2xl font-bold text-amber-600 mt-1">{pending.length}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Completed</p>
                    <p className="text-2xl font-bold text-emerald-600 mt-1">{completed.length}</p>
                  </div>
                </div>
                <p className="text-sm text-slate-500 mt-4">
                  <Link to={`/departments/${slug}`} className="text-blue-600 hover:underline">
                    View all tasks for {department.name} →
                  </Link>
                </p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <h2 className="px-5 py-4 font-semibold text-slate-800 border-b border-slate-200">Recent reports & entries</h2>
                {entries.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 text-sm">No entries yet.</div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {entries.slice(0, 5).map((e) => (
                      <li key={e.id} className="px-5 py-3 text-sm">
                        <span className="text-slate-500">{e.period || e.type || 'Entry'}</span>
                        {e.notes && <p className="text-slate-800 mt-0.5 whitespace-pre-wrap">{e.notes}</p>}
                        <p className="text-xs text-slate-400 mt-1">
                          {e.enteredBy} · {e.createdAt ? new Date(e.createdAt).toLocaleDateString() : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {activeTab === 'members' && slug === 'caring' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center">
                <h2 className="font-semibold text-slate-800">Members</h2>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCaringId(null)
                      setCaringMemberForm({
                        membershipNumber: '', name: '', dob: '', phone: '', email: '', nativity: '', currentPlace: '', firstSunday: format(new Date(), 'yyyy-MM-dd'), cellName: '',
                      })
                      setCaringMemberModalOpen(true)
                    }}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                  >
                    Add Member
                  </button>
                )}
              </div>
              {loadingCaringMembers ? (
                <div className="px-5 py-8 text-center text-slate-500">Loading…</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-slate-600">Membership Number</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-600">Cell Name</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-600">Duration of Attending Church</th>
                        {canEdit && <th className="text-left px-4 py-3 font-medium text-slate-600 w-20">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {caringMembers.map((m) => (
                        <Fragment key={m.id}>
                          <tr
                            onClick={() => setExpandedCaringId(expandedCaringId === m.id ? null : m.id)}
                            className="hover:bg-slate-50 cursor-pointer"
                          >
                            <td className="px-4 py-3 text-slate-800">{m.membershipNumber || '—'}</td>
                            <td className="px-4 py-3 text-slate-800">{m.name || '—'}</td>
                            <td className="px-4 py-3 text-slate-600">{m.cellName || '—'}</td>
                            <td className="px-4 py-3 text-slate-600">{formatDuration(m.firstSunday)}</td>
                            {canEdit && (
                              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCaringId(m.id)
                                    setCaringMemberForm({
                                      membershipNumber: m.membershipNumber || '',
                                      name: m.name || '',
                                      dob: m.dob ? String(m.dob).slice(0, 10) : '',
                                      phone: m.phone || '',
                                      email: m.email || '',
                                      nativity: m.nativity || '',
                                      currentPlace: m.currentPlace || '',
                                      firstSunday: m.firstSunday ? String(m.firstSunday).slice(0, 10) : '',
                                      cellName: m.cellName || '',
                                    })
                                    setCaringMemberModalOpen(true)
                                  }}
                                  className="text-blue-600 hover:underline mr-2"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.stopPropagation()
                                    if (!window.confirm('Remove this member?')) return
                                    await deleteCaringMember(m.id)
                                    setCaringMembers((prev) => prev.filter((x) => x.id !== m.id))
                                  }}
                                  className="text-red-600 hover:underline"
                                >
                                  Delete
                                </button>
                              </td>
                            )}
                          </tr>
                          {expandedCaringId === m.id && (
                            <tr key={`${m.id}-exp`}>
                              <td colSpan={canEdit ? 5 : 4} className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                                  <div><span className="text-slate-500">DOB:</span> {m.dob ? formatDMY(m.dob) : '—'}</div>
                                  <div><span className="text-slate-500">Phone:</span> {m.phone || '—'}</div>
                                  <div><span className="text-slate-500">Email:</span> {m.email || '—'}</div>
                                  <div><span className="text-slate-500">Nativity:</span> {m.nativity || '—'}</div>
                                  <div><span className="text-slate-500">Current Place:</span> {m.currentPlace || '—'}</div>
                                  <div><span className="text-slate-500">First Sunday:</span> {m.firstSunday ? formatDMY(m.firstSunday) : '—'}</div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                      {caringMembers.length === 0 && (
                        <tr>
                          <td colSpan={canEdit ? 5 : 4} className="px-4 py-8 text-center text-slate-500">No members yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {caringMemberModalOpen && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
                <div className="p-5 border-b border-slate-200">
                  <h3 className="text-lg font-semibold text-slate-800">{editingCaringId ? 'Edit member' : 'Add Member'}</h3>
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    try {
                      if (editingCaringId) {
                        await updateCaringMember(editingCaringId, caringMemberForm)
                        setCaringMembers((prev) => prev.map((x) => (x.id === editingCaringId ? { ...x, ...caringMemberForm } : x)))
                      } else {
                        const id = await addCaringMember(caringMemberForm)
                        setCaringMembers((prev) => [...prev, { id, ...caringMemberForm }])
                      }
                      setCaringMemberModalOpen(false)
                      setEditingCaringId(null)
                    } catch (err) {
                      console.error(err)
                      alert('Failed to save')
                    }
                  }}
                  className="p-5 space-y-4"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Membership Number</label>
                      <input type="text" value={caringMemberForm.membershipNumber} onChange={(e) => setCaringMemberForm((f) => ({ ...f, membershipNumber: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
                      <input type="text" value={caringMemberForm.name} onChange={(e) => setCaringMemberForm((f) => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" required />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">DOB</label>
                    <input type="date" value={caringMemberForm.dob} onChange={(e) => setCaringMemberForm((f) => ({ ...f, dob: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                      <input type="text" value={caringMemberForm.phone} onChange={(e) => setCaringMemberForm((f) => ({ ...f, phone: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                      <input type="email" value={caringMemberForm.email} onChange={(e) => setCaringMemberForm((f) => ({ ...f, email: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Nativity</label>
                      <input type="text" value={caringMemberForm.nativity} onChange={(e) => setCaringMemberForm((f) => ({ ...f, nativity: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Current Place</label>
                      <input type="text" value={caringMemberForm.currentPlace} onChange={(e) => setCaringMemberForm((f) => ({ ...f, currentPlace: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">First Sunday</label>
                      <input type="date" value={caringMemberForm.firstSunday} onChange={(e) => setCaringMemberForm((f) => ({ ...f, firstSunday: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Cell Name</label>
                      <select value={caringMemberForm.cellName} onChange={(e) => setCaringMemberForm((f) => ({ ...f, cellName: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300">
                        <option value="">— Select —</option>
                        {caringCellNames.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700">Save</button>
                    <button type="button" onClick={() => { setCaringMemberModalOpen(false); setEditingCaringId(null) }} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'planning' && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h2 className="font-semibold text-slate-800">Updates</h2>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingUpdateId(null)
                        setUpdateForm({
                          date: format(new Date(), 'yyyy-MM-dd'),
                          update: '',
                          actionPlan: '',
                        })
                        setUpdateModalOpen(true)
                      }}
                      className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                    >
                      Add Update
                    </button>
                  )}
                </div>
                {loadingDepartmentUpdates ? (
                  <div className="py-4 text-sm text-slate-500">Loading updates…</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left px-4 py-2 text-slate-600 font-medium w-14">SL No</th>
                          <th className="text-left px-4 py-2 text-slate-600 font-medium w-32">Date</th>
                          <th className="text-left px-4 py-2 text-slate-600 font-medium">Update</th>
                          <th className="text-left px-4 py-2 text-slate-600 font-medium">Action Plan</th>
                          {canEdit && (
                            <th className="text-left px-4 py-2 text-slate-600 font-medium w-24">Actions</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {departmentUpdates.map((u, idx) => (
                          <tr key={u.id} className="hover:bg-slate-50 align-top">
                            <td className="px-4 py-2 text-slate-600">{idx + 1}</td>
                            <td className="px-4 py-2 text-slate-600">
                              {u.date ? formatDMY(u.date) : '—'}
                            </td>
                            <td className="px-4 py-2 text-slate-800 whitespace-pre-wrap">
                              {u.update || '—'}
                            </td>
                            <td className="px-4 py-2 text-slate-800 whitespace-pre-wrap">
                              {u.actionPlan || '—'}
                            </td>
                            {canEdit && (
                              <td className="px-4 py-2 text-sm space-x-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingUpdateId(u.id)
                                    setUpdateForm({
                                      date: u.date ? String(u.date).slice(0, 10) : format(new Date(), 'yyyy-MM-dd'),
                                      update: u.update || '',
                                      actionPlan: u.actionPlan || '',
                                    })
                                    setUpdateModalOpen(true)
                                  }}
                                  className="text-blue-600 hover:underline"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (!window.confirm('Delete this update?')) return
                                    try {
                                      await deleteDepartmentUpdate(u.id)
                                      setDepartmentUpdates((prev) => prev.filter((x) => x.id !== u.id))
                                    } catch (err) {
                                      console.error(err)
                                      alert('Failed to delete')
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
                        {departmentUpdates.length === 0 && !loadingDepartmentUpdates && (
                          <tr>
                            <td
                              colSpan={canEdit ? 5 : 4}
                              className="px-4 py-6 text-center text-slate-500"
                            >
                              No updates yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h2 className="font-semibold text-slate-800 mb-3">Planning</h2>
                {canEdit ? (
                  <form onSubmit={handleSavePlanning} className="space-y-2">
                    <textarea
                      value={planningNotes}
                      onChange={(e) => setPlanningNotes(e.target.value)}
                      placeholder="Planning notes for this department..."
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 min-h-[140px]"
                      rows={6}
                    />
                    <button
                      type="submit"
                      disabled={savingPlanning}
                      className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                      {savingPlanning ? 'Saving...' : 'Save planning'}
                    </button>
                  </form>
                ) : (
                  <div className="text-slate-600 whitespace-pre-wrap">
                    {planningNotes || '— No planning notes yet —'}
                  </div>
                )}
                <div className="mt-6 pt-4 border-t border-slate-200">
                  <h3 className="font-semibold text-slate-800 mb-2">Planning board</h3>
                  <p className="text-sm text-slate-500 mb-4">
                    Add movable notepads to the canvas. Drag to move, drag corners to resize. Use the toolbar on each note for bold, text colour, and background.
                  </p>
                  <PlanningBoard department={department.name} canEdit={canEdit} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'team' && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold text-slate-800">Team</h2>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingMember(null)
                      setMemberForm({
                        name: '',
                        role: '',
                        memberSince: new Date().toISOString().slice(0, 10),
                        isFormer: false,
                        notes: '',
                      })
                    }}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700"
                  >
                    + Add member
                  </button>
                )}
              </div>
              {loadingTeam ? (
                <div className="py-4 text-sm text-slate-500">Loading team...</div>
              ) : team.length === 0 ? (
                <div className="py-4 text-sm text-slate-500">
                  {teamError ? (
                    <p className="text-red-600">{teamError}</p>
                  ) : (
                    'No team members added yet.'
                  )}
                </div>
              ) : (
                <>
              {teamError && (
                <p className="text-sm text-red-600 mb-2">{teamError}</p>
              )}
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-4 py-2 text-slate-600 font-medium w-10">SL</th>
                        <th className="text-left px-4 py-2 text-slate-600 font-medium">Name</th>
                        <th className="text-left px-4 py-2 text-slate-600 font-medium">Role / Position</th>
                        <th className="text-left px-4 py-2 text-slate-600 font-medium">Member since</th>
                        <th className="text-left px-4 py-2 text-slate-600 font-medium">Duration & positions</th>
                        {canEdit && (
                          <th className="text-left px-4 py-2 text-slate-600 font-medium">Actions</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {team.map((m, idx) => {
                        const durationDays = m.memberSince
                          ? differenceInDays(new Date(), new Date(m.memberSince))
                          : null
                        const positionsText = m.role || ''
                        return (
                        <tr key={m.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2 text-slate-600">{idx + 1}</td>
                          <td className="px-4 py-2 text-slate-800">{m.name}</td>
                          <td className="px-4 py-2 text-slate-600">{m.role || '—'}</td>
                          <td className="px-4 py-2 text-slate-600">{m.memberSince || '—'}</td>
                          <td className="px-4 py-2 text-slate-600">
                            {durationDays != null && <div>{durationDays} days</div>}
                            {positionsText && (
                              <div className="text-slate-600 mt-0.5">
                                {durationDays != null ? 'Positions: ' : ''}{positionsText}
                              </div>
                            )}
                            {!durationDays && !positionsText && '—'}
                          </td>
                          {canEdit && (
                            <td className="px-4 py-2 text-sm space-x-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMember(m)
                                  setMemberForm({
                                    name: m.name || '',
                                    role: m.role || '',
                                    memberSince: m.memberSince || new Date().toISOString().slice(0, 10),
                                    isFormer: !!m.isFormer,
                                    notes: m.notes || '',
                                  })
                                }}
                                className="text-blue-600 hover:underline"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!window.confirm('Remove this member from team?')) return
                                  await deleteDepartmentTeamMember(m.id)
                                  setTeam((prev) => prev.filter((x) => x.id !== m.id))
                                }}
                                className="text-red-600 hover:underline"
                              >
                                Delete
                              </button>
                            </td>
                          )}
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
                </>
              )}

              {canEdit && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    try {
                      if (editingMember) {
                        await updateDepartmentTeamMember(editingMember.id, memberForm)
                        setTeam((prev) =>
                          prev.map((m) => (m.id === editingMember.id ? { ...m, ...memberForm } : m))
                        )
                      } else {
                        const id = await addDepartmentTeamMember(
                          department.name,
                          memberForm,
                          userProfile?.email || 'unknown'
                        )
                        setTeam((prev) => [
                          ...prev,
                          { id, department: department.name, ...memberForm },
                        ])
                      }
                      setTeamError('')
                      setEditingMember(null)
                      setMemberForm({
                        name: '',
                        role: '',
                        memberSince: new Date().toISOString().slice(0, 10),
                        isFormer: false,
                        notes: '',
                      })
                    } catch (err) {
                      console.error(err)
                      setTeamError('Failed to save team member.')
                    }
                  }}
                  className="mt-4 space-y-3 border-t border-slate-200 pt-4"
                >
                  <h3 className="text-sm font-semibold text-slate-800">
                    {editingMember ? 'Edit member' : 'Add new member'}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Name
                      </label>
                      <input
                        type="text"
                        required
                        value={memberForm.name}
                        onChange={(e) =>
                          setMemberForm((f) => ({ ...f, name: e.target.value }))
                        }
                        className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Role / Position
                      </label>
                      <input
                        type="text"
                        value={memberForm.role}
                        onChange={(e) =>
                          setMemberForm((f) => ({ ...f, role: e.target.value }))
                        }
                        className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Member since
                      </label>
                      <input
                        type="date"
                        value={memberForm.memberSince}
                        onChange={(e) =>
                          setMemberForm((f) => ({ ...f, memberSince: e.target.value }))
                        }
                        className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-4 sm:mt-7">
                      <input
                        id="isFormer"
                        type="checkbox"
                        checked={memberForm.isFormer}
                        onChange={(e) =>
                          setMemberForm((f) => ({ ...f, isFormer: e.target.checked }))
                        }
                        className="h-4 w-4 text-indigo-600 border-slate-300 rounded"
                      />
                      <label
                        htmlFor="isFormer"
                        className="text-xs font-medium text-slate-700"
                      >
                        Former member
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Notes (optional)
                    </label>
                    <textarea
                      value={memberForm.notes}
                      onChange={(e) =>
                        setMemberForm((f) => ({ ...f, notes: e.target.value }))
                      }
                      rows={2}
                      className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                  >
                    {editingMember ? 'Update member' : 'Add member'}
                  </button>
                </form>
              )}
            </div>
          )}

          {activeTab === 'financial' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <h2 className="font-semibold text-slate-800 p-5 pb-0">Budget & Spending</h2>
              <p className="text-sm text-slate-500 px-5 pt-1">Budget items for this department (₹).</p>
              {canEdit && (
                <div className="px-5 py-3 border-b border-slate-200 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingBudgetId(null)
                      setBudgetForm({
                        category: '',
                        subCategory: '',
                        description: '',
                        quantity: '',
                        unitCost: '',
                        priority: 'Medium',
                        type: 'Recurring',
                        justification: '',
                        expectedDate: format(new Date(), 'yyyy-MM-dd'),
                      })
                      setBudgetModalOpen(true)
                    }}
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                  >
                    + Add row
                  </button>
                </div>
              )}
              {loadingBudget ? (
                <div className="px-5 py-8 text-center text-slate-500 text-sm">Loading budget…</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium text-slate-600">Category</th>
                        <th className="text-left px-4 py-2 font-medium text-slate-600">Sub-Category</th>
                        <th className="text-left px-4 py-2 font-medium text-slate-600">Description</th>
                        <th className="text-left px-4 py-2 font-medium text-slate-600">Quantity</th>
                        <th className="text-left px-4 py-2 font-medium text-slate-600">Unit Cost (₹)</th>
                        <th className="text-left px-4 py-2 font-medium text-slate-600">Total Cost (₹)</th>
                        <th className="text-left px-4 py-2 font-medium text-slate-600">Priority</th>
                        <th className="text-left px-4 py-2 font-medium text-slate-600">Type</th>
                        <th className="text-left px-4 py-2 font-medium text-slate-600">Justification</th>
                        <th className="text-left px-4 py-2 font-medium text-slate-600">Expected Date</th>
                        {canEdit && (
                          <th className="text-left px-4 py-2 font-medium text-slate-600">Actions</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {budgetItems.map((row) => {
                        const totalCost = (Number(row.quantity) || 0) * (Number(row.unitCost) || 0)
                        return (
                          <tr key={row.id} className="hover:bg-slate-50">
                            <td className="px-4 py-2 text-slate-800">{row.category || '—'}</td>
                            <td className="px-4 py-2 text-slate-600">{row.subCategory || '—'}</td>
                            <td className="px-4 py-2 text-slate-600">{row.description || '—'}</td>
                            <td className="px-4 py-2 text-slate-600">{row.quantity ?? '—'}</td>
                            <td className="px-4 py-2 text-slate-600">
                              {row.unitCost != null && row.unitCost !== '' ? `₹ ${Number(row.unitCost).toLocaleString()}` : '—'}
                            </td>
                            <td className="px-4 py-2 font-medium text-slate-800">₹ {totalCost.toLocaleString()}</td>
                            <td className="px-4 py-2 text-slate-600">{row.priority || '—'}</td>
                            <td className="px-4 py-2 text-slate-600">{row.type || '—'}</td>
                            <td className="px-4 py-2 text-slate-600 max-w-[180px] truncate" title={row.justification || ''}>{row.justification || '—'}</td>
                            <td className="px-4 py-2 text-slate-600">{row.expectedDate ? formatDMY(row.expectedDate) : '—'}</td>
                            {canEdit && (
                              <td className="px-4 py-2 space-x-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingBudgetId(row.id)
                                    setBudgetForm({
                                      category: row.category || '',
                                      subCategory: row.subCategory || '',
                                      description: row.description || '',
                                      quantity: row.quantity ?? '',
                                      unitCost: row.unitCost ?? '',
                                      priority: row.priority || 'Medium',
                                      type: row.type || 'Recurring',
                                      justification: row.justification || '',
                                      expectedDate: row.expectedDate ? (typeof row.expectedDate === 'string' ? row.expectedDate : format(new Date(row.expectedDate), 'yyyy-MM-dd')) : format(new Date(), 'yyyy-MM-dd'),
                                    })
                                    setBudgetModalOpen(true)
                                  }}
                                  className="text-blue-600 hover:underline"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (!window.confirm('Delete this budget row?')) return
                                    await deleteFinanceBudgetItem(row.id)
                                    setBudgetItems((prev) => prev.filter((r) => r.id !== row.id))
                                  }}
                                  className="text-red-600 hover:underline"
                                >
                                  Delete
                                </button>
                              </td>
                            )}
                          </tr>
                        )
                      })}
                      {budgetItems.length === 0 && (
                        <tr>
                          <td colSpan={canEdit ? 11 : 10} className="px-4 py-8 text-center text-slate-500">
                            No budget items. Add a row to get started.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'cellGroups' && slug === 'cell' && (
            <div className="space-y-6">
              {/* Dashboard metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <p className="text-sm text-slate-500 uppercase tracking-wide">Total Cells</p>
                  <p className="text-2xl font-bold text-slate-800 mt-1">{loadingCellGroups ? '—' : cellGroups.length}</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <p className="text-sm text-slate-500 uppercase tracking-wide">Total Cell Members</p>
                  <p className="text-2xl font-bold text-slate-800 mt-1">
                    {loadingCellGroups ? '—' : cellGroups.reduce((s, c) => s + (c.memberCount || 0), 0)}
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <p className="text-sm text-slate-500 uppercase tracking-wide">Latest Total Attendance</p>
                  <p className="text-2xl font-bold text-slate-800 mt-1">
                    {latestCellAttendance != null ? latestCellAttendance.totalAttendance : '—'}
                  </p>
                  {latestCellAttendance?.date && (
                    <p className="text-xs text-slate-400 mt-0.5">{formatDMY(latestCellAttendance.date)}</p>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setCellAttendanceModalOpen(true)}
                      className="mt-2 text-xs text-indigo-600 hover:underline"
                    >
                      Record attendance
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <h2 className="font-semibold text-slate-800">Cell Groups</h2>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => { setNewCellGroupForm({ cellName: '', leader: '' }); setCellGroupModalOpen(true) }}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                    >
                      + Add cell group
                    </button>
                  )}
                </div>
                {loadingCellGroups ? (
                  <div className="py-8 text-center text-slate-500">Loading cell groups…</div>
                ) : cellGroups.length === 0 ? (
                  <div className="py-8 text-center text-slate-500">No cell groups yet.</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {cellGroups.map((cell, idx) => {
                      const pastel = [
                        { bg: 'bg-blue-50', border: 'border-blue-200' },
                        { bg: 'bg-emerald-50', border: 'border-emerald-200' },
                        { bg: 'bg-amber-50', border: 'border-amber-200' },
                        { bg: 'bg-violet-50', border: 'border-violet-200' },
                        { bg: 'bg-orange-50', border: 'border-orange-200' },
                      ][idx % 5]
                      return (
                      <div key={cell.id} className={`${pastel.bg} ${pastel.border} border rounded-xl overflow-hidden shadow-md`}>
                        <button
                          type="button"
                          onClick={() => setExpandedCellId(expandedCellId === cell.id ? null : cell.id)}
                          className="w-full text-left p-5 hover:opacity-95 transition"
                        >
                          <p className="text-xl font-semibold text-slate-800">{cell.cellName || 'Unnamed'}</p>
                          <p className="text-sm text-slate-600 mt-0.5">Leader: {cell.leader || '—'}</p>
                          <p className="text-2xl font-bold text-slate-800 mt-2">{cell.memberCount ?? 0} Members</p>
                        </button>
                        {expandedCellId === cell.id && (
                          <div className="border-t border-slate-200 p-4 bg-slate-50/50">
                            {canEdit && (
                              <div className="flex justify-end mb-3">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCellMemberId(null)
                                    setCellMemberForm({ name: '', birthday: '', anniversary: '', phone: '', locality: '' })
                                    setCellMemberModalOpen(true)
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                                >
                                  Add Member
                                </button>
                              </div>
                            )}
                            {loadingCellMembers ? (
                              <p className="text-sm text-slate-500">Loading members…</p>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                  <thead className="bg-slate-100">
                                    <tr>
                                      <th className="text-left px-3 py-2 font-medium text-slate-600 w-10">SL</th>
                                      <th className="text-left px-3 py-2 font-medium text-slate-600">Name</th>
                                      <th className="text-left px-3 py-2 font-medium text-slate-600">Birthday</th>
                                      <th className="text-left px-3 py-2 font-medium text-slate-600">Anniversary</th>
                                      <th className="text-left px-3 py-2 font-medium text-slate-600">Phone</th>
                                      <th className="text-left px-3 py-2 font-medium text-slate-600">Locality</th>
                                      {canEdit && <th className="text-left px-3 py-2 font-medium text-slate-600">Actions</th>}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 bg-white">
                                    {cellMembers.map((m, idx) => (
                                      <tr key={m.id} className="hover:bg-slate-50">
                                        <td className="px-3 py-2 text-slate-600">{idx + 1}</td>
                                        <td className="px-3 py-2 text-slate-800">{m.name || '—'}</td>
                                        <td className="px-3 py-2 text-slate-600">{m.birthday ? formatDMY(m.birthday) : '—'}</td>
                                        <td className="px-3 py-2 text-slate-600">{m.anniversary ? formatDMY(m.anniversary) : '—'}</td>
                                        <td className="px-3 py-2 text-slate-600">{m.phone || '—'}</td>
                                        <td className="px-3 py-2 text-slate-600">{m.locality || '—'}</td>
                                        {canEdit && (
                                          <td className="px-3 py-2 space-x-2">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setEditingCellMemberId(m.id)
                                                setCellMemberForm({
                                                  name: m.name || '',
                                                  birthday: m.birthday ? String(m.birthday).slice(0, 10) : '',
                                                  anniversary: m.anniversary ? String(m.anniversary).slice(0, 10) : '',
                                                  phone: m.phone || '',
                                                  locality: m.locality || '',
                                                })
                                                setCellMemberModalOpen(true)
                                              }}
                                              className="text-blue-600 hover:underline"
                                            >
                                              Edit
                                            </button>
                                            <button
                                              type="button"
                                              onClick={async () => {
                                                if (!window.confirm('Remove this member?')) return
                                                await deleteCellGroupMember(cell.id, m.id)
                                                setCellMembers((prev) => prev.filter((x) => x.id !== m.id))
                                                setCellGroups((prev) => prev.map((c) => (c.id === cell.id ? { ...c, memberCount: Math.max(0, (c.memberCount ?? 0) - 1) } : c)))
                                              }}
                                              className="text-red-600 hover:underline"
                                            >
                                              Delete
                                            </button>
                                          </td>
                                        )}
                                      </tr>
                                    ))}
                                    {cellMembers.length === 0 && (
                                      <tr>
                                        <td colSpan={canEdit ? 7 : 6} className="px-3 py-6 text-center text-slate-500">No members yet.</td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {cellAttendanceModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-xl shadow-xl max-w-sm w-full">
                    <div className="p-5 border-b border-slate-200">
                      <h3 className="text-lg font-semibold text-slate-800">Record attendance</h3>
                    </div>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault()
                        try {
                          await addCellAttendance(department.name, cellAttendanceForm.date, Number(cellAttendanceForm.totalAttendance) || 0)
                          const latest = await getLatestCellAttendance(department.name)
                          setLatestCellAttendance(latest)
                          setCellAttendanceModalOpen(false)
                          setCellAttendanceForm({ date: format(new Date(), 'yyyy-MM-dd'), totalAttendance: '' })
                        } catch (err) {
                          console.error(err)
                          alert('Failed to save')
                        }
                      }}
                      className="p-5 space-y-4"
                    >
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                        <input type="date" value={cellAttendanceForm.date} onChange={(e) => setCellAttendanceForm((f) => ({ ...f, date: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" required />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Total attendance</label>
                        <input type="number" min="0" value={cellAttendanceForm.totalAttendance} onChange={(e) => setCellAttendanceForm((f) => ({ ...f, totalAttendance: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" required />
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700">Save</button>
                        <button type="button" onClick={() => setCellAttendanceModalOpen(false)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {cellGroupModalOpen && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
                <div className="p-5 border-b border-slate-200">
                  <h3 className="text-lg font-semibold text-slate-800">Add cell group</h3>
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    try {
                      const id = await addCellGroup({ ...newCellGroupForm, department: department.name })
                      setCellGroups((prev) => [...prev, { id, cellName: newCellGroupForm.cellName, leader: newCellGroupForm.leader, memberCount: 0, department: department.name }])
                      setCellGroupModalOpen(false)
                      setNewCellGroupForm({ cellName: '', leader: '' })
                    } catch (err) {
                      console.error(err)
                      alert('Failed to save')
                    }
                  }}
                  className="p-5 space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Cell Name *</label>
                    <input type="text" value={newCellGroupForm.cellName} onChange={(e) => setNewCellGroupForm((f) => ({ ...f, cellName: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Leader</label>
                    <input type="text" value={newCellGroupForm.leader} onChange={(e) => setNewCellGroupForm((f) => ({ ...f, leader: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700">Save</button>
                    <button type="button" onClick={() => setCellGroupModalOpen(false)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {cellMemberModalOpen && expandedCellId && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
                <div className="p-5 border-b border-slate-200">
                  <h3 className="text-lg font-semibold text-slate-800">{editingCellMemberId ? 'Edit member' : 'Add Member'}</h3>
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    try {
                      if (editingCellMemberId) {
                        await updateCellGroupMember(expandedCellId, editingCellMemberId, cellMemberForm)
                        setCellMembers((prev) => prev.map((m) => (m.id === editingCellMemberId ? { ...m, ...cellMemberForm } : m)))
                      } else {
                        await addCellGroupMember(expandedCellId, cellMemberForm)
                        const list = await getCellGroupMembers(expandedCellId)
                        setCellMembers(list)
                        setCellGroups((prev) => prev.map((c) => (c.id === expandedCellId ? { ...c, memberCount: list.length } : c)))
                      }
                      setCellMemberModalOpen(false)
                      setEditingCellMemberId(null)
                      setCellMemberForm({ name: '', birthday: '', anniversary: '', phone: '', locality: '' })
                    } catch (err) {
                      console.error(err)
                      alert('Failed to save')
                    }
                  }}
                  className="p-5 space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
                    <input type="text" value={cellMemberForm.name} onChange={(e) => setCellMemberForm((f) => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Birthday</label>
                    <input type="date" value={cellMemberForm.birthday} onChange={(e) => setCellMemberForm((f) => ({ ...f, birthday: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Anniversary (optional)</label>
                    <input type="date" value={cellMemberForm.anniversary} onChange={(e) => setCellMemberForm((f) => ({ ...f, anniversary: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                    <input type="text" value={cellMemberForm.phone} onChange={(e) => setCellMemberForm((f) => ({ ...f, phone: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Locality</label>
                    <input type="text" value={cellMemberForm.locality} onChange={(e) => setCellMemberForm((f) => ({ ...f, locality: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700">Save</button>
                    <button type="button" onClick={() => { setCellMemberModalOpen(false); setEditingCellMemberId(null) }} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {budgetModalOpen && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
                <div className="p-5 border-b border-slate-200">
                  <h3 className="text-lg font-semibold text-slate-800">{editingBudgetId ? 'Edit row' : 'Add row'}</h3>
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    try {
                      const quantity = Number(budgetForm.quantity) || 0
                      const unitCost = Number(budgetForm.unitCost) || 0
                      const payload = { ...budgetForm, quantity, unitCost, department: department.name }
                      if (editingBudgetId) {
                        await updateFinanceBudgetItem(editingBudgetId, payload)
                        setBudgetItems((prev) =>
                          prev.map((r) => (r.id === editingBudgetId ? { ...r, ...payload, totalCost: quantity * unitCost } : r))
                        )
                      } else {
                        const id = await addFinanceBudgetItem(payload, userProfile?.email || 'unknown')
                        setBudgetItems((prev) => [...prev, { id, ...payload, totalCost: quantity * unitCost }])
                      }
                      setBudgetModalOpen(false)
                      setEditingBudgetId(null)
                    } catch (err) {
                      console.error(err)
                      alert('Failed to save')
                    }
                  }}
                  className="p-5 space-y-4"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Category *</label>
                      <input type="text" value={budgetForm.category} onChange={(e) => setBudgetForm((f) => ({ ...f, category: e.target.value }))} className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm" required />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Sub-Category</label>
                      <input type="text" value={budgetForm.subCategory} onChange={(e) => setBudgetForm((f) => ({ ...f, subCategory: e.target.value }))} className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
                    <input type="text" value={budgetForm.description} onChange={(e) => setBudgetForm((f) => ({ ...f, description: e.target.value }))} className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Quantity *</label>
                      <input type="number" min="0" step="1" value={budgetForm.quantity} onChange={(e) => setBudgetForm((f) => ({ ...f, quantity: e.target.value }))} className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm" required />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Unit Cost (₹) *</label>
                      <input type="number" min="0" step="0.01" value={budgetForm.unitCost} onChange={(e) => setBudgetForm((f) => ({ ...f, unitCost: e.target.value }))} className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm" required />
                    </div>
                  </div>
                  <p className="text-xs text-slate-600">Total Cost (₹): ₹ {((Number(budgetForm.quantity) || 0) * (Number(budgetForm.unitCost) || 0)).toLocaleString()}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Priority</label>
                      <select value={budgetForm.priority} onChange={(e) => setBudgetForm((f) => ({ ...f, priority: e.target.value }))} className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm">
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Type</label>
                      <select value={budgetForm.type} onChange={(e) => setBudgetForm((f) => ({ ...f, type: e.target.value }))} className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm">
                        <option value="Recurring">Recurring</option>
                        <option value="Project">Project</option>
                        <option value="Asset">Asset</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Justification</label>
                    <input type="text" value={budgetForm.justification} onChange={(e) => setBudgetForm((f) => ({ ...f, justification: e.target.value }))} className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Expected Date</label>
                    <input type="date" value={budgetForm.expectedDate} onChange={(e) => setBudgetForm((f) => ({ ...f, expectedDate: e.target.value }))} className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm" />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="submit" className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">{editingBudgetId ? 'Update' : 'Add row'}</button>
                    <button type="button" onClick={() => { setBudgetModalOpen(false); setEditingBudgetId(null) }} className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-sm hover:bg-slate-50">Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {updateModalOpen && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
                <div className="p-5 border-b border-slate-200">
                  <h3 className="text-lg font-semibold text-slate-800">
                    {editingUpdateId ? 'Edit update' : 'Add update'}
                  </h3>
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    try {
                      if (editingUpdateId) {
                        await updateDepartmentUpdate(editingUpdateId, updateForm)
                        setDepartmentUpdates((prev) =>
                          prev.map((u) => (u.id === editingUpdateId ? { ...u, ...updateForm } : u))
                        )
                      } else {
                        const id = await addDepartmentUpdate(
                          { ...updateForm, department: department.name },
                          userProfile?.email || 'unknown'
                        )
                        const newItem = {
                          id,
                          department: department.name,
                          ...updateForm,
                          createdAt: new Date(),
                        }
                        setDepartmentUpdates((prev) => {
                          const next = [newItem, ...prev]
                          next.sort((a, b) => {
                            const da = a.date || ''
                            const db = b.date || ''
                            if (da !== db) return db.localeCompare(da)
                            const ca = a.createdAt?.getTime?.() || 0
                            const cb = b.createdAt?.getTime?.() || 0
                            return cb - ca
                          })
                          return next
                        })
                      }
                      setUpdateModalOpen(false)
                      setEditingUpdateId(null)
                    } catch (err) {
                      console.error(err)
                      alert('Failed to save')
                    }
                  }}
                  className="p-5 space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Date
                    </label>
                    <input
                      type="date"
                      value={updateForm.date}
                      onChange={(e) =>
                        setUpdateForm((f) => ({ ...f, date: e.target.value }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-300"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Update
                    </label>
                    <textarea
                      value={updateForm.update}
                      onChange={(e) =>
                        setUpdateForm((f) => ({ ...f, update: e.target.value }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 min-h-[80px]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Action Plan
                    </label>
                    <textarea
                      value={updateForm.actionPlan}
                      onChange={(e) =>
                        setUpdateForm((f) => ({ ...f, actionPlan: e.target.value }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 min-h-[80px]"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUpdateModalOpen(false)
                        setEditingUpdateId(null)
                      }}
                      className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
