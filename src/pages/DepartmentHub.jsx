import { useParams, Link, Navigate, useSearchParams } from 'react-router-dom'
import { useEffect, useMemo, useState, Fragment } from 'react'
import { useAuth } from '../context/AuthContext'
import { getDepartmentBySlug } from '../constants/departments'
import { getDepartmentHubTabs, LEGACY_DEPARTMENT_NAMES, usesGenericSubDepartmentCollection } from '../constants/departmentTabs'
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
  updateCellGroup,
  addCellGroupMember,
  updateCellGroupMember,
  deleteCellGroupMember,
  getCellMemberPendingChanges,
  addCellMemberPendingChange,
  deleteCellMemberPendingChange,
  getLatestCellAttendance,
  addCellAttendance,
  getBackToBibleList,
  addBackToBible,
  getActiveBackToBibleForDate,
  getCaringMembers,
  addCaringMember,
  updateCaringMember,
  deleteCaringMember,
  getDepartmentUpdates,
  addDepartmentUpdate,
  updateDepartmentUpdate,
  deleteDepartmentUpdate,
  getDelightVisitors,
  addDelightVisitor,
  updateDelightVisitor,
  deleteDelightVisitor,
  getDlightSubDepartments,
  addDlightSubDepartment,
  deleteDlightSubDepartment,
  getDepartmentAssignments,
  setDepartmentAssignments,
  getDepartmentSubDepartments,
  addDepartmentSubDepartment,
  updateDepartmentSubDepartment,
  deleteDepartmentSubDepartment,
  getDepartmentChildren,
  addDepartmentChild,
  getDepartmentChildAttendance,
  setDepartmentChildAttendance,
  getDepartmentEvents,
  addDepartmentEvent,
  updateDepartmentEvent,
  deleteDepartmentEvent,
} from '../services/firestore'
import { ROLES } from '../constants/roles'
import { logAction } from '../utils/auditLog'
import { isRestrictedDLightDirector } from '../utils/dlightAccess'
import { differenceInDays, differenceInYears, differenceInMonths, format, startOfWeek, endOfWeek } from 'date-fns'
import { formatDMY, formatDMYTime, parseDateToYYYYMMDD } from '../utils/date'
import PlanningBoard from '../components/PlanningBoard/PlanningBoard'
import DepartmentTabBar from '../components/DepartmentTabBar'

async function mergeTasksEntriesTeam(canonicalName) {
  const alt = LEGACY_DEPARTMENT_NAMES[canonicalName] || []
  const deptNames = [canonicalName, ...alt]
  const taskById = new Map()
  for (const n of deptNames) {
    const list = await getTasks({ department: n })
    list.forEach((t) => taskById.set(t.id, t))
  }
  const tasks = [...taskById.values()].sort((a, b) => {
    const ca = a.createdAt?.seconds ?? (a.createdAt instanceof Date ? a.createdAt.getTime() / 1000 : 0)
    const cb = b.createdAt?.seconds ?? (b.createdAt instanceof Date ? b.createdAt.getTime() / 1000 : 0)
    return cb - ca
  })
  const entryParts = await Promise.all(deptNames.map((n) => getDepartmentEntries(n, { limit: 20 })))
  const entryById = new Map()
  entryParts.flat().forEach((e) => entryById.set(e.id, e))
  const entries = [...entryById.values()]
    .sort((a, b) => {
      const ca = a.createdAt instanceof Date ? a.createdAt.getTime() : 0
      const cb = b.createdAt instanceof Date ? b.createdAt.getTime() : 0
      return cb - ca
    })
    .slice(0, 25)
  const teamById = new Map()
  for (const n of deptNames) {
    const list = await getDepartmentTeamMembers(n)
    list.forEach((m) => teamById.set(m.id, m))
  }
  const team = [...teamById.values()]
  return { tasks, entries, team }
}

export default function DepartmentHub() {
  const { slug } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { userProfile, user, canManageDepartment, isDepartmentHead, hasAccess } = useAuth()
  const department = getDepartmentBySlug(slug)

  // Cell access helper must be defined BEFORE any effects that reference it (avoid TDZ crashes)
  const fullAccess = userProfile?.globalRole === 'FOUNDER' || userProfile?.role === ROLES.FOUNDER
  const cellPosition = (() => {
    const positions = Array.isArray(userProfile?.positions) ? userProfile.positions : []
    const p = positions.find((x) => x && x.department === 'Cell')
    return p?.position || ''
  })()
  const canViewAllCells = fullAccess || cellPosition === 'Director'

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
    subDepartment: '',
    subDepartments: [],
    phone: '',
    status: 'active',
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
  const [cellMemberForm, setCellMemberForm] = useState({ name: '', birthday: '', anniversary: '', phone: '', locality: '', since: '', status: 'active' })
  const [cellMemberModalOpen, setCellMemberModalOpen] = useState(false)
  const [editingCellMemberId, setEditingCellMemberId] = useState(null)
  const [cellGroupModalOpen, setCellGroupModalOpen] = useState(false)
  const [newCellGroupForm, setNewCellGroupForm] = useState({ cellId: '', cellName: '', leader: '', meetingDay: '', launchDate: '', status: 'active' })
  const [editingCellGroupId, setEditingCellGroupId] = useState(null)
  const [cellGroupEditForm, setCellGroupEditForm] = useState({ cellId: '', cellName: '', leader: '', meetingDay: '', launchDate: '', status: 'active' })
  const [cellGroupEditModalOpen, setCellGroupEditModalOpen] = useState(false)
  const [latestCellAttendance, setLatestCellAttendance] = useState(null)
  const [cellAttendanceModalOpen, setCellAttendanceModalOpen] = useState(false)
  const [cellAttendanceForm, setCellAttendanceForm] = useState({ date: format(new Date(), 'yyyy-MM-dd'), totalAttendance: '' })
  const [cellImportPreview, setCellImportPreview] = useState([])
  const [cellImportModalOpen, setCellImportModalOpen] = useState(false)
  const [cellImportSaving, setCellImportSaving] = useState(false)
  const [cellPendingChanges, setCellPendingChanges] = useState([])
  const [loadingCellPending, setLoadingCellPending] = useState(false)
  const [backToBibleList, setBackToBibleList] = useState([])
  const [btbForm, setBtbForm] = useState(() => {
    const now = new Date()
    const mon = startOfWeek(now, { weekStartsOn: 1 })
    const sun = endOfWeek(now, { weekStartsOn: 1 })
    return { fromDate: format(mon, 'yyyy-MM-dd'), toDate: format(sun, 'yyyy-MM-dd'), title: '', content: '' }
  })
  const btbWeekStart = useMemo(() => {
    const d = btbForm.fromDate ? new Date(btbForm.fromDate + 'T12:00:00') : new Date()
    return startOfWeek(d, { weekStartsOn: 1 })
  }, [btbForm.fromDate])
  const btbWeekEnd = useMemo(() => endOfWeek(btbWeekStart, { weekStartsOn: 1 }), [btbWeekStart])
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
  const [delightVisitors, setDelightVisitors] = useState([])
  const [loadingDelightVisitors, setLoadingDelightVisitors] = useState(false)
  const [delightVisitorModalOpen, setDelightVisitorModalOpen] = useState(false)
  const [editingDelightVisitorId, setEditingDelightVisitorId] = useState(null)
  const [delightVisitorForm, setDelightVisitorForm] = useState({
    name: '',
    dob: '',
    phone: '',
    email: '',
    nativity: '',
    currentPlace: '',
    serviceAttended: '',
    attendedDate: '',
    howKnown: '',
    source: '',
  })
  const [dlightSubDepts, setDlightSubDepts] = useState([])
  const [loadingDlightSubDepts, setLoadingDlightSubDepts] = useState(false)
  const [dlightSubDeptModalOpen, setDlightSubDeptModalOpen] = useState(false)
  const [dlightSubDeptForm, setDlightSubDeptForm] = useState({ name: '', servingArea: '' })
  // D Light – Assign tab (persisted assignments)
  const [delightAssignments, setDelightAssignments] = useState({
    lightShinersPre: '',
    lightShinersPost: '',
    lightBeaconsRoom: '',
    lightBeaconsStair: '',
    lightBearersPostConnect: '',
    lightCraftersRoomPrep: '',
  })
  const [loadingDelightAssignments, setLoadingDelightAssignments] = useState(false)
  const [savingDelightAssignments, setSavingDelightAssignments] = useState(false)
  const [delightAssignmentsBefore, setDelightAssignmentsBefore] = useState(null)
  const [updateModalOpen, setUpdateModalOpen] = useState(false)
  const [editingUpdateId, setEditingUpdateId] = useState(null)
  const [updateForm, setUpdateForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    update: '',
    actionPlan: '',
  })
  // Sub-departments (all departments except Cell & Worship)
  const [subDepartments, setSubDepartments] = useState([])
  const [subDeptLoading, setSubDeptLoading] = useState(false)
  const [subDeptError, setSubDeptError] = useState('')
  const [subDeptForm, setSubDeptForm] = useState({ name: '', servingArea: '' })
  const [editingSubDept, setEditingSubDept] = useState(null)
  const [genericSubDeptModalOpen, setGenericSubDeptModalOpen] = useState(false)
  const [dlightTeamSubOpts, setDlightTeamSubOpts] = useState([])
  const [rkChildren, setRkChildren] = useState([])
  const [rkLoading, setRkLoading] = useState(false)
  const [rkDate, setRkDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [rkPresent, setRkPresent] = useState({})
  const [rkChildName, setRkChildName] = useState('')
  const [deptEvents, setDeptEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [eventSubTab, setEventSubTab] = useState('program')
  const [eventForm, setEventForm] = useState({ name: '', program: '', budget: '', team: '' })
  const [newEventModalOpen, setNewEventModalOpen] = useState(false)
  const [newEventName, setNewEventName] = useState('')

  const tabs = useMemo(() => getDepartmentHubTabs(slug), [slug])

  const tabFromUrl = searchParams.get('tab')
  useEffect(() => {
    const nextTabs = getDepartmentHubTabs(slug)
    if (tabFromUrl && nextTabs.includes(tabFromUrl)) setActiveTab(tabFromUrl)
    else setActiveTab('summary')
  }, [slug, tabFromUrl])

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
    mergeTasksEntriesTeam(name)
      .then(({ tasks: tList, entries: eList, team: tm }) => {
        setTasks(tList)
        setEntries(eList)
        const latest = eList.find((e) => e.type === 'planning' || e.notes) || eList[0]
        setPlanningNotes(latest?.notes ?? '')
        setTeam(tm)
        setTeamError('')
      })
      .catch(() => {
        setTasks([])
        setEntries([])
        setTeam([])
        setTeamError('Could not load department data.')
      })
      .finally(() => {
        setLoading(false)
        setLoadingTeam(false)
      })
  }, [department])

  // Generic sub-departments (Firestore department_sub_departments) for Team + Sub Department tab
  useEffect(() => {
    if (!department || slug === 'cell' || slug === 'd-light') return
    if (activeTab !== 'team' && activeTab !== 'subDepartment') return
    setSubDeptLoading(true)
    getDepartmentSubDepartments(department.name)
      .then((list) => {
        setSubDepartments(list)
        setSubDeptError('')
      })
      .catch(() => {
        setSubDepartments([])
        setSubDeptError('Could not load sub-departments.')
      })
      .finally(() => setSubDeptLoading(false))
  }, [department, slug, activeTab])

  useEffect(() => {
    if (slug !== 'd-light' || activeTab !== 'team') {
      setDlightTeamSubOpts([])
      return
    }
    getDlightSubDepartments()
      .then((list) =>
        setDlightTeamSubOpts(
          list.map((x) => ({ id: x.id, name: x.name || '', servingArea: x.servingArea || '' }))
        )
      )
      .catch(() => setDlightTeamSubOpts([]))
  }, [slug, activeTab])

  useEffect(() => {
    if (slug !== 'river-kids' || activeTab !== 'attendance' || !department) return
    setRkLoading(true)
    Promise.all([getDepartmentChildren(department.name), getDepartmentChildAttendance(department.name, rkDate)])
      .then(([children, att]) => {
        setRkChildren(children.filter((c) => c.active !== false))
        setRkAttendanceId(att.id)
        setRkPresent(typeof att.present === 'object' && att.present ? { ...att.present } : {})
      })
      .catch(() => {
        setRkChildren([])
        setRkPresent({})
      })
      .finally(() => setRkLoading(false))
  }, [slug, activeTab, department, rkDate])

  useEffect(() => {
    if (slug !== 'event-m' || activeTab !== 'events' || !department) return
    setEventsLoading(true)
    getDepartmentEvents(department.name)
      .then(setDeptEvents)
      .catch(() => setDeptEvents([]))
      .finally(() => setEventsLoading(false))
  }, [slug, activeTab, department])

  useEffect(() => {
    const ev = deptEvents.find((e) => e.id === selectedEventId)
    if (ev) {
      setEventForm({
        name: ev.name || '',
        program: ev.program || '',
        budget: ev.budget || '',
        team: ev.team || '',
      })
    } else {
      setEventForm({ name: '', program: '', budget: '', team: '' })
    }
  }, [selectedEventId, deptEvents])

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
          if (canViewAllCells) {
            setCellGroups(groups)
          } else {
            const myCellName = (userProfile?.cellGroup || '').trim()
            const myCellId = (userProfile?.cellId || '').trim()
            const filtered = groups.filter((g) => {
              if (myCellId) return g.id === myCellId
              if (!myCellName) return false
              return String(g.cellName || '').trim() === myCellName
            })
            setCellGroups(filtered)
          }
          setLatestCellAttendance(attendance)
        })
        .finally(() => setLoadingCellGroups(false))
    }
  }, [department, slug, activeTab, canViewAllCells, userProfile?.cellGroup, userProfile?.cellId])

  useEffect(() => {
    if (slug === 'cell') {
      setLoadingCellPending(true)
      getCellMemberPendingChanges()
        .then(setCellPendingChanges)
        .catch(() => setCellPendingChanges([]))
        .finally(() => setLoadingCellPending(false))
    }
  }, [slug])

  useEffect(() => {
    if (slug === 'cell' && activeTab === 'planning') {
      getBackToBibleList().then(setBackToBibleList).catch(() => setBackToBibleList([]))
    }
  }, [slug, activeTab])

  useEffect(() => {
    if (slug === 'd-light' && activeTab === 'visitorEntry') {
      setLoadingDelightVisitors(true)
      getDelightVisitors()
        .then(setDelightVisitors)
        .catch(() => setDelightVisitors([]))
        .finally(() => setLoadingDelightVisitors(false))
    }
  }, [slug, activeTab])

  useEffect(() => {
    if (slug === 'd-light' && activeTab === 'assign') {
      setLoadingDelightAssignments(true)
      getDepartmentAssignments('d-light')
        .then((doc) => {
          const assignments = doc?.assignments && typeof doc.assignments === 'object' ? doc.assignments : null
          if (assignments) {
            setDelightAssignments((prev) => {
              const next = { ...prev, ...assignments }
              setDelightAssignmentsBefore(next)
              return next
            })
          } else {
            setDelightAssignmentsBefore(null)
          }
        })
        .catch(() => setDelightAssignmentsBefore(null))
        .finally(() => setLoadingDelightAssignments(false))
    }
  }, [slug, activeTab])

  useEffect(() => {
    if (slug !== 'd-light' || activeTab !== 'subDepartment') return
    setLoadingDlightSubDepts(true)
    getDlightSubDepartments()
      .then(setDlightSubDepts)
      .catch(() => setDlightSubDepts([]))
      .finally(() => setLoadingDlightSubDepts(false))
  }, [slug, activeTab])

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

  // SAFETY RULE: block manual URL access to other departments
  if (!hasAccess(userProfile, department.name)) {
    return (
      <div className="p-6 text-slate-600">
        <Link to="/departments" className="text-blue-600 hover:underline">← Departments</Link>
        <p className="mt-4">You do not have access to {department.name} department.</p>
      </div>
    )
  }

  // Cell Leaders should not access the Cell department hub/tabs.
  if (slug === 'cell' && !canViewAllCells) {
    return <Navigate to="/department/cell/cell-report" replace />
  }

  // D Light Director: only Sunday Planning — block department hub and all hub tabs.
  if (slug === 'd-light' && isRestrictedDLightDirector(userProfile)) {
    return (
      <div className="p-6 text-slate-600">
        <Link to="/sunday-planning" className="text-blue-600 hover:underline">← Sunday Planning</Link>
        <p className="mt-4 text-lg font-semibold text-slate-800">Access Denied</p>
        <p className="mt-2 text-sm text-slate-600">D Light Directors may only use Sunday Planning. Other D Light pages are not available.</p>
      </div>
    )
  }

  const canEdit = department.name === 'Cell'
    ? canViewAllCells
    : canManageDepartment(department.name)
  const canEditDelightVisitors =
    department.name === 'D Light' &&
    (userProfile?.role === ROLES.ADMIN ||
      userProfile?.role === ROLES.MINISTRY_LEADER ||
      isDepartmentHead('D Light'))
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

  const pending = tasks.filter((t) => t.status !== 'Completed')
  const completed = tasks.filter((t) => t.status === 'Completed')

  const subDeptOptionList = useMemo(
    () => (slug === 'd-light' ? dlightTeamSubOpts : subDepartments),
    [slug, dlightTeamSubOpts, subDepartments]
  )

  function formatTeamSubDepartmentCell(m) {
    const names =
      Array.isArray(m.subDepartments) && m.subDepartments.length
        ? m.subDepartments
        : m.subDepartment
          ? [m.subDepartment]
          : []
    if (names.length === 0) return '—'
    return names
      .map((n) => {
        const o = subDeptOptionList.find((x) => x.name === n)
        return o?.servingArea ? `${n} (${o.servingArea})` : n
      })
      .join(', ')
  }

  return (
    <div>
      <DepartmentTabBar
        slug={slug}
        activeTab={activeTab}
        setActiveTab={(t) => {
          setActiveTab(t)
          setSearchParams({ tab: t }, { replace: true })
        }}
      />

      <div className="space-y-6 p-4">
      {loading ? (
        <div className="py-8 text-center text-slate-500">Loading...</div>
      ) : (
        <>
          {activeTab === 'summary' && (
            <>
              {slug === 'cell' ? (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <h2 className="font-semibold text-slate-800 mb-3">Pending For Review</h2>
                  <p className="text-sm text-slate-600 mb-4">Member change requests from Cell Leaders. Approve or deny each request.</p>
                  {loadingCellPending ? (
                    <p className="text-sm text-slate-500">Loading…</p>
                  ) : cellPendingChanges.length === 0 ? (
                    <p className="text-sm text-slate-500">No pending member changes.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-100">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-slate-600 w-10">SL</th>
                            <th className="text-left px-3 py-2 font-medium text-slate-600">Cell Name</th>
                            <th className="text-left px-3 py-2 font-medium text-slate-600">Member Name</th>
                            <th className="text-left px-3 py-2 font-medium text-slate-600">Change Type</th>
                            <th className="text-left px-3 py-2 font-medium text-slate-600">Field changed</th>
                            <th className="text-left px-3 py-2 font-medium text-slate-600">Requested By</th>
                            <th className="text-left px-3 py-2 font-medium text-slate-600">Date & Time</th>
                            <th className="text-left px-3 py-2 font-medium text-slate-600">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {cellPendingChanges.map((p, idx) => (
                            <tr key={p.id}>
                              <td className="px-3 py-2 text-slate-600">{idx + 1}</td>
                              <td className="px-3 py-2 text-slate-800">{p.cellName || '—'}</td>
                              <td className="px-3 py-2 text-slate-800">{p.memberData?.name ?? (p.changeType === 'delete' ? '(delete)' : p.changeType === 'add' ? (p.memberData?.name || '—') : '—')}</td>
                              <td className="px-3 py-2 text-slate-600">
                                {p.changeType === 'deactivate' ? 'Deactivate Member' : (p.changeType || '—')}
                              </td>
                              <td className="px-3 py-2 text-slate-600">{p.changeType === 'edit' ? (p.changeSummary || '—') : '—'}</td>
                              <td className="px-3 py-2 text-slate-600">{p.requestedBy || '—'}</td>
                              <td className="px-3 py-2 text-slate-600">{p.requestedAt ? formatDMYTime(p.requestedAt) : '—'}</td>
                              <td className="px-3 py-2 space-x-2">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      if (p.changeType === 'add' && p.memberData) {
                                        await addCellGroupMember(p.cellId, p.memberData)
                                      } else if (p.changeType === 'edit' && p.memberId && p.memberData) {
                                        await updateCellGroupMember(p.cellId, p.memberId, p.memberData)
                                      } else if (p.changeType === 'delete' && p.memberId) {
                                        await deleteCellGroupMember(p.cellId, p.memberId)
                                      } else if (p.changeType === 'activate' && p.memberId) {
                                        await updateCellGroupMember(p.cellId, p.memberId, { status: 'active' })
                                      } else if (p.changeType === 'deactivate' && p.memberId) {
                                        await updateCellGroupMember(p.cellId, p.memberId, { status: 'inactive' })
                                      }
                                      await deleteCellMemberPendingChange(p.id)
                                      setCellPendingChanges((prev) => prev.filter((x) => x.id !== p.id))
                                      const updatedList = await getCellGroupMembers(p.cellId)
                                      setCellGroups((prev) => prev.map((c) => (c.id === p.cellId ? { ...c, memberCount: updatedList.length } : c)))
                                    } catch (err) {
                                      console.error(err)
                                      alert('Failed to apply')
                                    }
                                  }}
                                  className="text-emerald-600 hover:underline font-medium"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await deleteCellMemberPendingChange(p.id)
                                      setCellPendingChanges((prev) => prev.filter((x) => x.id !== p.id))
                                    } catch (err) {
                                      console.error(err)
                                    }
                                  }}
                                  className="text-red-600 hover:underline"
                                >
                                  Deny
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : slug === 'd-light' ? (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <h2 className="font-semibold text-slate-800 mb-2">D Light</h2>
                  <p className="text-sm text-slate-600">
                    Use the tabs above for Visitor Entry, Assign, Sub Department, Team, Planning, and Budget.
                  </p>
                </div>
              ) : (
                <>
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <h2 className="font-semibold text-slate-800 mb-3">Summary</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-1">
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

          {activeTab === 'visitorEntry' && slug === 'd-light' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center">
                <h2 className="font-semibold text-slate-800">Visitor Entry</h2>
                {canEditDelightVisitors && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingDelightVisitorId(null)
                      setDelightVisitorForm({
                        name: '',
                        dob: '',
                        phone: '',
                        email: '',
                        nativity: '',
                        currentPlace: '',
                        serviceAttended: '',
                        attendedDate: '',
                        howKnown: '',
                        source: '',
                      })
                      setDelightVisitorModalOpen(true)
                    }}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                  >
                    Add Visitor
                  </button>
                )}
              </div>
              {loadingDelightVisitors ? (
                <div className="px-5 py-8 text-center text-slate-500">Loading…</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-600">Ph. Number</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-600">Email</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-600">Nativity</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-600">Current Place</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-600">Service Attended</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-600">Date of Attending</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-600">How did you know about church?</th>
                        {canEditDelightVisitors && <th className="text-left px-4 py-3 font-medium text-slate-600 w-20">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {delightVisitors.map((v) => (
                        <tr key={v.id}>
                          <td className="px-4 py-3 text-slate-800">{v.name || '—'}</td>
                          <td className="px-4 py-3 text-slate-600">{v.phone || '—'}</td>
                          <td className="px-4 py-3 text-slate-600">{v.email || '—'}</td>
                          <td className="px-4 py-3 text-slate-600">{v.nativity || '—'}</td>
                          <td className="px-4 py-3 text-slate-600">{v.currentPlace || '—'}</td>
                          <td className="px-4 py-3 text-slate-600">{v.serviceAttended || '—'}</td>
                          <td className="px-4 py-3 text-slate-600">{v.attendedDate ? formatDMY(v.attendedDate) : '—'}</td>
                          <td className="px-4 py-3 text-slate-600">{v.source || v.howKnown || '—'}</td>
                          {canEditDelightVisitors && (
                            <td className="px-4 py-3 space-x-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingDelightVisitorId(v.id)
                                  setDelightVisitorForm({
                                    name: v.name || '',
                                    dob: v.dob ? String(v.dob).slice(0, 10) : '',
                                    phone: v.phone || '',
                                    email: v.email || '',
                                    nativity: v.nativity || '',
                                    currentPlace: v.currentPlace || '',
                                    serviceAttended: v.serviceAttended || '',
                                    attendedDate: v.attendedDate ? String(v.attendedDate).slice(0, 10) : '',
                                    howKnown: v.howKnown || '',
                                    source: v.source || '',
                                  })
                                  setDelightVisitorModalOpen(true)
                                }}
                                className="text-blue-600 hover:underline"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!window.confirm('Delete this visitor entry?')) return
                                  try {
                                    await deleteDelightVisitor(v.id)
                                    setDelightVisitors((prev) => prev.filter((x) => x.id !== v.id))
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
                      {delightVisitors.length === 0 && (
                        <tr>
                          <td colSpan={canEditDelightVisitors ? 9 : 8} className="px-4 py-8 text-center text-slate-500">
                            No visitor entries yet.
                          </td>
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

          {delightVisitorModalOpen && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
                <div className="p-5 border-b border-slate-200">
                  <h3 className="text-lg font-semibold text-slate-800">{editingDelightVisitorId ? 'Edit Visitor' : 'Add Visitor'}</h3>
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    if (!canEditDelightVisitors) return
                    try {
                      if (editingDelightVisitorId) {
                        const before = delightVisitors.find((x) => x.id === editingDelightVisitorId) || null
                        await updateDelightVisitor(editingDelightVisitorId, delightVisitorForm)
                        setDelightVisitors((prev) =>
                          prev.map((x) => (x.id === editingDelightVisitorId ? { ...x, ...delightVisitorForm } : x))
                        )
                        await logAction({
                          action: 'UPSERT_VISITOR',
                          user,
                          targetId: editingDelightVisitorId,
                          targetType: 'VISITOR',
                          department: 'D Light',
                          details: { before, after: delightVisitorForm },
                        })
                      } else {
                        const id = await addDelightVisitor({
                          ...delightVisitorForm,
                          createdBy: userProfile?.email || userProfile?.displayName || 'unknown',
                        })
                        setDelightVisitors((prev) => [
                          {
                            id,
                            ...delightVisitorForm,
                            createdAt: new Date(),
                            createdBy: userProfile?.email || userProfile?.displayName || 'unknown',
                          },
                          ...prev,
                        ])
                        await logAction({
                          action: 'UPSERT_VISITOR',
                          user,
                          targetId: id,
                          targetType: 'VISITOR',
                          department: 'D Light',
                          details: { after: delightVisitorForm },
                        })
                      }
                      setDelightVisitorModalOpen(false)
                      setEditingDelightVisitorId(null)
                    } catch (err) {
                      console.error(err)
                      alert('Failed to save visitor')
                    }
                  }}
                  className="p-5 space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                    <input
                      type="text"
                      value={delightVisitorForm.name}
                      onChange={(e) => setDelightVisitorForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">DOB</label>
                      <input
                        type="date"
                        value={delightVisitorForm.dob}
                        onChange={(e) => setDelightVisitorForm((f) => ({ ...f, dob: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Ph. Number</label>
                      <input
                        type="tel"
                        value={delightVisitorForm.phone}
                        onChange={(e) => setDelightVisitorForm((f) => ({ ...f, phone: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                      <input
                        type="email"
                        value={delightVisitorForm.email}
                        onChange={(e) => setDelightVisitorForm((f) => ({ ...f, email: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Nativity</label>
                      <input
                        type="text"
                        value={delightVisitorForm.nativity}
                        onChange={(e) => setDelightVisitorForm((f) => ({ ...f, nativity: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Current Place</label>
                      <input
                        type="text"
                        value={delightVisitorForm.currentPlace}
                        onChange={(e) => setDelightVisitorForm((f) => ({ ...f, currentPlace: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Service Attended</label>
                      <select
                        value={delightVisitorForm.serviceAttended}
                        onChange={(e) => setDelightVisitorForm((f) => ({ ...f, serviceAttended: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300"
                      >
                        <option value="">— Select —</option>
                        <option value="Sunday Service">Sunday Service</option>
                        <option value="Youth Service">Youth Service</option>
                        <option value="Cell Group">Cell Group</option>
                        <option value="Special Meeting">Special Meeting</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Date of Attending</label>
                      <input
                        type="date"
                        value={delightVisitorForm.attendedDate}
                        onChange={(e) => setDelightVisitorForm((f) => ({ ...f, attendedDate: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">How did you know about church?</label>
                      <select
                        value={delightVisitorForm.source || ''}
                        onChange={(e) => setDelightVisitorForm((f) => ({ ...f, source: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300"
                      >
                        <option value="">— Select —</option>
                        <option value="Friend">Friend</option>
                        <option value="Family">Family</option>
                        <option value="Social Media">Social Media</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700">
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDelightVisitorModalOpen(false)
                        setEditingDelightVisitorId(null)
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

          {activeTab === 'planning' && (
            <div className="space-y-6">
              {slug === 'cell' && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <h2 className="font-semibold text-slate-800 mb-3">Back to the Bible</h2>
                  <p className="text-sm text-slate-500 mb-2">Weekly teaching content for all cells. Week cycle is Monday → Sunday. Content applies to all cell meetings in that week.</p>
                  <p className="text-sm font-medium text-slate-700 mb-4">
                    Week: {format(btbWeekStart, 'd MMM yyyy')} – {format(btbWeekEnd, 'd MMM yyyy')} <span className="text-slate-500 font-normal">(Monday to Sunday)</span>
                  </p>
                  {canEdit && (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault()
                        try {
                          await addBackToBible({ ...btbForm, createdBy: userProfile?.email || userProfile?.displayName || 'unknown' })
                          const list = await getBackToBibleList()
                          setBackToBibleList(list)
                          const now = new Date()
                          const mon = startOfWeek(now, { weekStartsOn: 1 })
                          const sun = endOfWeek(now, { weekStartsOn: 1 })
                          setBtbForm({ fromDate: format(mon, 'yyyy-MM-dd'), toDate: format(sun, 'yyyy-MM-dd'), title: '', content: '' })
                        } catch (err) {
                          console.error('Back to Bible save error', err)
                          const msg = err?.message || err?.code || (err && String(err)) || 'Failed to save'
                          alert(msg)
                        }
                      }}
                      className="space-y-3 mb-4 p-4 bg-slate-50 rounded-lg"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Week start (Monday)</label>
                          <input
                            type="date"
                            value={btbForm.fromDate}
                            onChange={(e) => {
                              const v = e.target.value
                              if (!v) return
                              const d = new Date(v + 'T12:00:00')
                              const mon = startOfWeek(d, { weekStartsOn: 1 })
                              const sun = endOfWeek(mon, { weekStartsOn: 1 })
                              setBtbForm((f) => ({ ...f, fromDate: format(mon, 'yyyy-MM-dd'), toDate: format(sun, 'yyyy-MM-dd') }))
                            }}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Week end (Sunday)</label>
                          <input type="date" value={btbForm.toDate} readOnly className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                        <input type="text" value={btbForm.title} onChange={(e) => setBtbForm((f) => ({ ...f, title: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" placeholder="Weekly title" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Content</label>
                        <textarea value={btbForm.content} onChange={(e) => setBtbForm((f) => ({ ...f, content: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 min-h-[100px]" placeholder="Teaching content..." />
                      </div>
                      <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">Add Back to the Bible</button>
                    </form>
                  )}
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-slate-600">From</th>
                          <th className="text-left px-3 py-2 font-medium text-slate-600">To</th>
                          <th className="text-left px-3 py-2 font-medium text-slate-600">Title</th>
                          <th className="text-left px-3 py-2 font-medium text-slate-600">Content</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {backToBibleList.map((b) => (
                          <tr key={b.id}>
                            <td className="px-3 py-2 text-slate-600">{b.fromDate ? formatDMY(b.fromDate) : '—'}</td>
                            <td className="px-3 py-2 text-slate-600">{b.toDate ? formatDMY(b.toDate) : '—'}</td>
                            <td className="px-3 py-2 text-slate-800">{b.title || '—'}</td>
                            <td className="px-3 py-2 text-slate-700 whitespace-pre-wrap max-w-md truncate">{b.content || '—'}</td>
                          </tr>
                        ))}
                        {backToBibleList.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-500">No Back to the Bible entries yet.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

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

          {slug === 'd-light' && activeTab === 'assign' && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold text-slate-800">Assign</h2>
                <button
                  type="button"
                  disabled={savingDelightAssignments || loadingDelightAssignments}
                  onClick={async () => {
                    setSavingDelightAssignments(true)
                    try {
                      const before = delightAssignmentsBefore
                      const after = delightAssignments
                      await setDepartmentAssignments('d-light', {
                        department: 'D Light',
                        assignments: after,
                        updatedAt: new Date(),
                        updatedBy: userProfile?.email || userProfile?.displayName || 'unknown',
                      })
                      setDelightAssignmentsBefore({ ...after })
                      await logAction({
                        action: 'UPDATE_ASSIGNMENT',
                        user,
                        targetId: 'd-light',
                        targetType: 'ASSIGNMENT',
                        department: 'D Light',
                        details: { before, after },
                      })
                    } catch (err) {
                      console.error(err)
                      alert('Failed to save assignments.')
                    } finally {
                      setSavingDelightAssignments(false)
                    }
                  }}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {savingDelightAssignments ? 'Saving…' : 'Save'}
                </button>
              </div>
              {loadingDelightAssignments && (
                <p className="text-sm text-slate-500">Loading assignments…</p>
              )}
              {team.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Add team members in the Team tab first (with designations like &quot;Light Shiner&quot;, &quot;Light Beacon&quot;, etc.). They will appear here in the dropdowns.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-4 py-2 text-slate-600 font-medium w-1/2">Role / Duty</th>
                        <th className="text-left px-4 py-2 text-slate-600 font-medium w-1/2">Assigned Person</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[
                        { key: 'lightShinersPre', label: 'Light Shiners – Pre-service greeting', subDept: 'Light Shiners' },
                        { key: 'lightShinersPost', label: 'Light Shiners – Post-service greeting', subDept: 'Light Shiners' },
                        { key: 'lightBeaconsRoom', label: 'Light Beacons – Room addressing', subDept: 'Light Beacons' },
                        { key: 'lightBeaconsStair', label: 'Light Beacons – Stair guardian', subDept: 'Light Beacons' },
                        { key: 'lightBearersPostConnect', label: 'Light Bearers – Post connect', subDept: 'Light Bearers' },
                        { key: 'lightCraftersRoomPrep', label: 'Light Crafters – Room preparation and card distribution', subDept: 'Light Crafters' },
                      ].map((row) => {
                        const options = team.filter((m) => {
                          if (m.isFormer) return false
                          if (row.subDept && Array.isArray(m.subDepartments) && m.subDepartments.length) {
                            return m.subDepartments.includes(row.subDept)
                          }
                          if (row.subDept && m.subDepartment) return m.subDepartment === row.subDept
                          // Fallback: match by role text if no sub-departments set
                          const roleText = (m.role || m.rolePosition || '').toLowerCase()
                          return roleText.includes((row.subDept || '').toLowerCase().split(' ')[1] || '')
                        })
                        return (
                          <tr key={row.key} className="hover:bg-slate-50">
                            <td className="px-4 py-2 text-slate-800">{row.label}</td>
                            <td className="px-4 py-2">
                              <select
                                value={delightAssignments[row.key] || ''}
                                onChange={(e) =>
                                  setDelightAssignments((prev) => ({
                                    ...prev,
                                    [row.key]: e.target.value,
                                  }))
                                }
                                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
                              >
                                <option value="">— Select —</option>
                                {options.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.name} {m.role ? `(${m.role})` : ''}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-slate-500">Assignments are saved to Firestore.</p>
            </div>
          )}

          {usesGenericSubDepartmentCollection(slug) && activeTab === 'subDepartment' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center">
                <h2 className="font-semibold text-slate-800">Sub Department</h2>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSubDept(null)
                      setSubDeptForm({ name: '', servingArea: '' })
                      setGenericSubDeptModalOpen(true)
                    }}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                  >
                    Add Sub Department
                  </button>
                )}
              </div>
              {subDeptLoading ? (
                <div className="px-5 py-8 text-center text-slate-500">Loading…</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-600">Serving Area</th>
                        {canEdit && <th className="text-left px-4 py-3 font-medium text-slate-600 w-28">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {subDepartments.map((row) => (
                        <tr key={row.id}>
                          <td className="px-4 py-3 text-slate-800 font-medium">{row.name || '—'}</td>
                          <td className="px-4 py-3 text-slate-600">{row.servingArea || '—'}</td>
                          {canEdit && (
                            <td className="px-4 py-3 space-x-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingSubDept(row)
                                  setSubDeptForm({ name: row.name || '', servingArea: row.servingArea || '' })
                                  setGenericSubDeptModalOpen(true)
                                }}
                                className="text-blue-600 hover:underline text-sm"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!window.confirm('Delete this sub department?')) return
                                  try {
                                    await deleteDepartmentSubDepartment(row.id)
                                    setSubDepartments((prev) => prev.filter((x) => x.id !== row.id))
                                  } catch (err) {
                                    console.error(err)
                                    alert('Failed to delete')
                                  }
                                }}
                                className="text-red-600 hover:underline text-sm"
                              >
                                Delete
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                      {subDepartments.length === 0 && (
                        <tr>
                          <td colSpan={canEdit ? 3 : 2} className="px-4 py-8 text-center text-slate-500">
                            No sub departments yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              {subDeptError && <p className="px-5 py-2 text-sm text-red-600">{subDeptError}</p>}
            </div>
          )}

          {genericSubDeptModalOpen && canEdit && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
                <div className="p-5 border-b border-slate-200">
                  <h3 className="text-lg font-semibold text-slate-800">
                    {editingSubDept ? 'Edit Sub Department' : 'Add Sub Department'}
                  </h3>
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    if (!department?.name || !subDeptForm.name.trim()) return
                    try {
                      if (editingSubDept) {
                        await updateDepartmentSubDepartment(editingSubDept.id, {
                          name: subDeptForm.name.trim(),
                          servingArea: (subDeptForm.servingArea || '').trim(),
                        })
                        setSubDepartments((prev) =>
                          prev.map((sd) =>
                            sd.id === editingSubDept.id
                              ? { ...sd, name: subDeptForm.name.trim(), servingArea: (subDeptForm.servingArea || '').trim() }
                              : sd
                          )
                        )
                      } else {
                        const id = await addDepartmentSubDepartment(
                          department.name,
                          subDeptForm.name.trim(),
                          userProfile?.email || 'unknown',
                          (subDeptForm.servingArea || '').trim()
                        )
                        setSubDepartments((prev) => [
                          ...prev,
                          {
                            id,
                            department: department.name,
                            name: subDeptForm.name.trim(),
                            servingArea: (subDeptForm.servingArea || '').trim(),
                          },
                        ])
                      }
                      setGenericSubDeptModalOpen(false)
                      setEditingSubDept(null)
                      setSubDeptForm({ name: '', servingArea: '' })
                      setSubDeptError('')
                    } catch (err) {
                      console.error(err)
                      setSubDeptError('Failed to save sub department.')
                    }
                  }}
                  className="p-5 space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
                    <input
                      type="text"
                      value={subDeptForm.name}
                      onChange={(e) => setSubDeptForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Serving Area</label>
                    <input
                      type="text"
                      value={subDeptForm.servingArea}
                      onChange={(e) => setSubDeptForm((f) => ({ ...f, servingArea: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700">
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGenericSubDeptModalOpen(false)
                        setEditingSubDept(null)
                        setSubDeptForm({ name: '', servingArea: '' })
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

          {slug === 'd-light' && activeTab === 'subDepartment' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center">
                <h2 className="font-semibold text-slate-800">Sub Department</h2>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setDlightSubDeptForm({ name: '', servingArea: '' })
                      setDlightSubDeptModalOpen(true)
                    }}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                  >
                    Add Sub Department
                  </button>
                )}
              </div>
              {loadingDlightSubDepts ? (
                <div className="px-5 py-8 text-center text-slate-500">Loading…</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-600">Serving Area</th>
                        {canEdit && <th className="text-left px-4 py-3 font-medium text-slate-600 w-24">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dlightSubDepts.map((row) => (
                        <tr key={row.id}>
                          <td className="px-4 py-3 text-slate-800 font-medium">{row.name || '—'}</td>
                          <td className="px-4 py-3 text-slate-600">{row.servingArea || '—'}</td>
                          {canEdit && (
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!window.confirm('Delete this sub department?')) return
                                  try {
                                    await deleteDlightSubDepartment(row.id)
                                    setDlightSubDepts((prev) => prev.filter((x) => x.id !== row.id))
                                  } catch (err) {
                                    console.error(err)
                                    alert('Failed to delete')
                                  }
                                }}
                                className="text-red-600 hover:underline text-sm"
                              >
                                Delete
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                      {dlightSubDepts.length === 0 && (
                        <tr>
                          <td colSpan={canEdit ? 3 : 2} className="px-4 py-8 text-center text-slate-500">
                            No sub departments yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {dlightSubDeptModalOpen && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
                <div className="p-5 border-b border-slate-200">
                  <h3 className="text-lg font-semibold text-slate-800">Add Sub Department</h3>
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    if (!canEdit) return
                    const name = (dlightSubDeptForm.name || '').trim()
                    if (!name) {
                      alert('Name is required')
                      return
                    }
                    try {
                      const id = await addDlightSubDepartment(
                        { name, servingArea: (dlightSubDeptForm.servingArea || '').trim() },
                        userProfile?.email || userProfile?.displayName || 'unknown'
                      )
                      setDlightSubDepts((prev) => [
                        { id, name, servingArea: (dlightSubDeptForm.servingArea || '').trim(), createdAt: new Date() },
                        ...prev,
                      ])
                      setDlightSubDeptModalOpen(false)
                      setDlightSubDeptForm({ name: '', servingArea: '' })
                    } catch (err) {
                      console.error(err)
                      alert('Failed to save')
                    }
                  }}
                  className="p-5 space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
                    <input
                      type="text"
                      value={dlightSubDeptForm.name}
                      onChange={(e) => setDlightSubDeptForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Serving Area</label>
                    <input
                      type="text"
                      value={dlightSubDeptForm.servingArea}
                      onChange={(e) => setDlightSubDeptForm((f) => ({ ...f, servingArea: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700">
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setDlightSubDeptModalOpen(false)}
                      className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'team' && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-6">
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
                        subDepartment: '',
                        subDepartments: [],
                        phone: '',
                        status: 'active',
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
              {slug !== 'cell' && tabs.includes('subDepartment') && (
                <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  Sub departments (name & serving area) are managed in the <strong>Sub Department</strong> tab. Assign team
                  members to sub departments below.
                </p>
              )}

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
                        <th className="text-left px-4 py-2 text-slate-600 font-medium">Sub Department</th>
                        <th className="text-left px-4 py-2 text-slate-600 font-medium">Phone</th>
                        <th className="text-left px-4 py-2 text-slate-600 font-medium">Status</th>
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
                          <td className="px-4 py-2 text-slate-600">{formatTeamSubDepartmentCell(m)}</td>
                          <td className="px-4 py-2 text-slate-600">{m.phone || '—'}</td>
                          <td className="px-4 py-2 text-slate-600 capitalize">{m.status || 'active'}</td>
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
                                  const subDepts = Array.isArray(m.subDepartments) && m.subDepartments.length
                                    ? m.subDepartments
                                    : (m.subDepartment ? [m.subDepartment] : [])
                                  setMemberForm({
                                    name: m.name || '',
                                    role: m.role || '',
                                    subDepartment: m.subDepartment || '',
                                    subDepartments: subDepts,
                                    phone: m.phone || '',
                                    status: m.status || 'active',
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
                        subDepartment: '',
                        subDepartments: [],
                        phone: '',
                        status: 'active',
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
                        Sub Departments (optional, select multiple)
                      </label>
                      <select
                        multiple
                        value={memberForm.subDepartments}
                        onChange={(e) => {
                          const selected = Array.from(e.target.selectedOptions, (o) => o.value)
                          setMemberForm((f) => ({
                            ...f,
                            subDepartments: selected,
                            subDepartment: selected[0] || '',
                          }))
                        }}
                        className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm bg-white min-h-[80px]"
                      >
                        {subDeptOptionList.map((sd) => (
                          <option key={sd.id} value={sd.name}>
                            {sd.servingArea ? `${sd.name} (${sd.servingArea})` : sd.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-slate-500 mt-0.5">Hold Ctrl/Cmd to select multiple.</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Phone
                      </label>
                      <input
                        type="text"
                        value={memberForm.phone}
                        onChange={(e) =>
                          setMemberForm((f) => ({ ...f, phone: e.target.value }))
                        }
                        className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Status
                      </label>
                      <select
                        value={memberForm.status}
                        onChange={(e) =>
                          setMemberForm((f) => ({ ...f, status: e.target.value }))
                        }
                        className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm bg-white"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
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

          {slug === 'river-kids' && activeTab === 'attendance' && department && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-semibold text-slate-800">Attendance</h2>
                <label className="text-sm text-slate-700 flex items-center gap-2">
                  Date
                  <input
                    type="date"
                    value={rkDate}
                    onChange={(e) => setRkDate(e.target.value)}
                    className="px-2 py-1 border border-slate-300 rounded-lg"
                  />
                </label>
              </div>
              {canEdit && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    const n = rkChildName.trim()
                    if (!n || !department) return
                    try {
                      await addDepartmentChild(department.name, n, userProfile?.email || userProfile?.displayName || 'unknown')
                      setRkChildName('')
                      const list = await getDepartmentChildren(department.name)
                      setRkChildren(list.filter((c) => c.active !== false))
                    } catch {
                      alert('Failed to add child')
                    }
                  }}
                  className="flex flex-wrap gap-2 items-end"
                >
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Child name</label>
                    <input
                      value={rkChildName}
                      onChange={(e) => setRkChildName(e.target.value)}
                      className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm min-w-[200px]"
                      placeholder="Add child"
                    />
                  </div>
                  <button type="submit" className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium">
                    Add child
                  </button>
                </form>
              )}
              {rkLoading ? (
                <p className="text-slate-500">Loading…</p>
              ) : rkChildren.length === 0 ? (
                <p className="text-sm text-slate-500">No children yet. Add names above (directors / heads only).</p>
              ) : (
                <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                  {rkChildren.map((c) => (
                    <li key={c.id} className="flex items-center justify-between px-4 py-3 bg-white">
                      <span className="font-medium text-slate-800">{c.name}</span>
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={async () => {
                          if (!canEdit || !department) return
                          const next = { ...rkPresent, [c.id]: !rkPresent[c.id] }
                          setRkPresent(next)
                          try {
                            await setDepartmentChildAttendance(
                              department.name,
                              rkDate,
                              next,
                              userProfile?.email || userProfile?.displayName || 'unknown'
                            )
                          } catch {
                            alert('Failed to save attendance')
                          }
                        }}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium ${
                          rkPresent[c.id] ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                        } ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {rkPresent[c.id] ? 'Present' : 'Absent'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {canEdit && rkChildren.length > 0 && (
                <p className="text-xs text-slate-500">Toggle present/absent; each change saves for the selected date.</p>
              )}
            </div>
          )}

          {slug === 'event-m' && activeTab === 'events' && department && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-semibold text-slate-800">New Event</h2>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewEventName('')
                      setNewEventModalOpen(true)
                    }}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                  >
                    Add Event
                  </button>
                )}
              </div>
              {newEventModalOpen && canEdit && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5">
                    <h3 className="font-semibold text-slate-800 mb-3">Add event</h3>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault()
                        const n = newEventName.trim()
                        if (!n || !department) return
                        try {
                          const id = await addDepartmentEvent(
                            department.name,
                            n,
                            userProfile?.email || userProfile?.displayName || 'unknown'
                          )
                          setDeptEvents((prev) => [
                            { id, name: n, program: '', budget: '', team: '', createdAt: new Date() },
                            ...prev,
                          ])
                          setSelectedEventId(id)
                          setNewEventModalOpen(false)
                          setNewEventName('')
                        } catch {
                          alert('Failed to create event')
                        }
                      }}
                      className="space-y-3"
                    >
                      <input
                        value={newEventName}
                        onChange={(e) => setNewEventName(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                        placeholder="Event name"
                        required
                      />
                      <div className="flex gap-2">
                        <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">
                          Create
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewEventModalOpen(false)}
                          className="px-4 py-2 border border-slate-300 rounded-lg text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
              {eventsLoading ? (
                <p className="text-slate-500 px-2">Loading…</p>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="bg-white rounded-xl border border-slate-200 p-4 max-h-[70vh] overflow-y-auto">
                    <h3 className="text-sm font-semibold text-slate-700 mb-2">Events</h3>
                    <ul className="space-y-1">
                      {deptEvents.map((ev) => (
                        <li key={ev.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedEventId(ev.id)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                              selectedEventId === ev.id ? 'bg-indigo-100 text-indigo-900' : 'hover:bg-slate-50'
                            }`}
                          >
                            {ev.name || 'Untitled'}
                          </button>
                        </li>
                      ))}
                    </ul>
                    {deptEvents.length === 0 && <p className="text-sm text-slate-500">No events yet.</p>}
                  </div>
                  <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-4">
                    {!selectedEventId ? (
                      <p className="text-slate-500 text-sm">Select an event or add one.</p>
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 mb-4">
                          {['program', 'budget', 'team'].map((k) => (
                            <button
                              key={k}
                              type="button"
                              onClick={() => setEventSubTab(k)}
                              className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize ${
                                eventSubTab === k ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {k}
                            </button>
                          ))}
                          {canEdit && (
                            <button
                              type="button"
                              onClick={async () => {
                                if (!window.confirm('Delete this event?')) return
                                try {
                                  await deleteDepartmentEvent(selectedEventId)
                                  setDeptEvents((prev) => prev.filter((e) => e.id !== selectedEventId))
                                  setSelectedEventId(null)
                                } catch {
                                  alert('Failed to delete')
                                }
                              }}
                              className="ml-auto text-red-600 text-sm hover:underline"
                            >
                              Delete event
                            </button>
                          )}
                        </div>
                        {eventSubTab === 'program' && (
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Program</label>
                            <textarea
                              value={eventForm.program}
                              disabled={!canEdit}
                              onChange={(e) => setEventForm((f) => ({ ...f, program: e.target.value }))}
                              rows={10}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50"
                            />
                          </div>
                        )}
                        {eventSubTab === 'budget' && (
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Budget</label>
                            <textarea
                              value={eventForm.budget}
                              disabled={!canEdit}
                              onChange={(e) => setEventForm((f) => ({ ...f, budget: e.target.value }))}
                              rows={10}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50"
                            />
                          </div>
                        )}
                        {eventSubTab === 'team' && (
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Team</label>
                            <textarea
                              value={eventForm.team}
                              disabled={!canEdit}
                              onChange={(e) => setEventForm((f) => ({ ...f, team: e.target.value }))}
                              rows={10}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50"
                            />
                          </div>
                        )}
                        {canEdit && (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await updateDepartmentEvent(selectedEventId, {
                                  name: eventForm.name,
                                  program: eventForm.program,
                                  budget: eventForm.budget,
                                  team: eventForm.team,
                                })
                                setDeptEvents((prev) =>
                                  prev.map((e) => (e.id === selectedEventId ? { ...e, ...eventForm } : e))
                                )
                              } catch {
                                alert('Failed to save')
                              }
                            }}
                            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium"
                          >
                            Save
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
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
              {/* Pending Actions (Cell Director) */}
              {canViewAllCells && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <h2 className="font-semibold text-slate-800 mb-3">Pending Actions</h2>
                  {loadingCellPending ? (
                    <p className="text-sm text-slate-500">Loading…</p>
                  ) : cellPendingChanges.length === 0 ? (
                    <p className="text-sm text-slate-500">No pending member changes.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-100">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-slate-600 w-10">SL</th>
                            <th className="text-left px-3 py-2 font-medium text-slate-600">Cell Name</th>
                            <th className="text-left px-3 py-2 font-medium text-slate-600">Member Name</th>
                            <th className="text-left px-3 py-2 font-medium text-slate-600">Action Type</th>
                            <th className="text-left px-3 py-2 font-medium text-slate-600">Field changed</th>
                            <th className="text-left px-3 py-2 font-medium text-slate-600">Requested By</th>
                            <th className="text-left px-3 py-2 font-medium text-slate-600">Date & Time</th>
                            <th className="text-left px-3 py-2 font-medium text-slate-600">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {cellPendingChanges.map((p, idx) => (
                            <tr key={p.id}>
                              <td className="px-3 py-2 text-slate-600">{idx + 1}</td>
                              <td className="px-3 py-2 text-slate-800">{p.cellName || '—'}</td>
                              <td className="px-3 py-2 text-slate-800">{p.memberData?.name ?? (p.changeType === 'delete' ? '(delete)' : '—')}</td>
                              <td className="px-3 py-2 text-slate-600 capitalize">{p.changeType || '—'}</td>
                              <td className="px-3 py-2 text-slate-600">{p.changeType === 'edit' ? (p.changeSummary || '—') : '—'}</td>
                              <td className="px-3 py-2 text-slate-600">{p.requestedBy || '—'}</td>
                              <td className="px-3 py-2 text-slate-600">{p.requestedAt ? formatDMYTime(p.requestedAt) : '—'}</td>
                              <td className="px-3 py-2 space-x-2">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      if (p.changeType === 'add' && p.memberData) {
                                        await addCellGroupMember(p.cellId, p.memberData)
                                      } else if (p.changeType === 'edit' && p.memberId && p.memberData) {
                                        await updateCellGroupMember(p.cellId, p.memberId, p.memberData)
                                      } else if (p.changeType === 'delete' && p.memberId) {
                                        await deleteCellGroupMember(p.cellId, p.memberId)
                                      } else if (p.changeType === 'activate' && p.memberId) {
                                        await updateCellGroupMember(p.cellId, p.memberId, { status: 'active' })
                                      } else if (p.changeType === 'deactivate' && p.memberId) {
                                        await updateCellGroupMember(p.cellId, p.memberId, { status: 'inactive' })
                                      }
                                      await deleteCellMemberPendingChange(p.id)
                                      setCellPendingChanges((prev) => prev.filter((x) => x.id !== p.id))
                                      if (expandedCellId === p.cellId) {
                                        const list = await getCellGroupMembers(p.cellId)
                                        setCellMembers(list)
                                      }
                                      const updatedList = await getCellGroupMembers(p.cellId)
                                      setCellGroups((prev) => prev.map((c) => (c.id === p.cellId ? { ...c, memberCount: updatedList.length } : c)))
                                    } catch (err) {
                                      console.error(err)
                                      alert('Failed to apply')
                                    }
                                  }}
                                  className="text-emerald-600 hover:underline font-medium"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await deleteCellMemberPendingChange(p.id)
                                      setCellPendingChanges((prev) => prev.filter((x) => x.id !== p.id))
                                    } catch (err) {
                                      console.error(err)
                                    }
                                  }}
                                  className="text-red-600 hover:underline"
                                >
                                  Deny
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
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
                      onClick={() => { setNewCellGroupForm({ cellId: '', cellName: '', leader: '', meetingDay: '', launchDate: '', status: 'active' }); setCellGroupModalOpen(true) }}
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
                  <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {cellGroups.filter((c) => c.status !== 'inactive').map((cell, idx) => {
                      const tileStyle = [
                        { bg: 'bg-blue-500', text: 'text-white' },
                        { bg: 'bg-emerald-600', text: 'text-white' },
                        { bg: 'bg-amber-500', text: 'text-white' },
                        { bg: 'bg-violet-600', text: 'text-white' },
                        { bg: 'bg-rose-500', text: 'text-white' },
                        { bg: 'bg-teal-600', text: 'text-white' },
                      ][idx % 6]
                      const yearsSince = cell.launchDate ? differenceInYears(new Date(), new Date(cell.launchDate)) : null
                      return (
                      <div key={cell.id} className={`${tileStyle.bg} ${tileStyle.text} rounded-xl overflow-hidden shadow-lg border border-white/20`}>
                        <button
                          type="button"
                          onClick={() => setExpandedCellId(expandedCellId === cell.id ? null : cell.id)}
                          className="w-full text-left p-5 hover:opacity-95 transition"
                        >
                          <p className="text-xl font-semibold">{cell.cellName || 'Unnamed'}</p>
                          <p className="text-sm opacity-90 mt-0.5">Leader: {cell.leader || '—'}</p>
                          <p className="text-sm opacity-90">Day: {cell.meetingDay || '—'}</p>
                          <p className="text-xs opacity-90 mt-1">
                            Cell ID: <span className="font-mono">{cell.id}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                navigator.clipboard?.writeText?.(cell.id).catch(() => {})
                              }}
                              className="ml-2 underline"
                            >
                              Copy
                            </button>
                          </p>
                          {yearsSince !== null && <p className="text-sm opacity-90 mt-1">Launched: {yearsSince} year{yearsSince !== 1 ? 's' : ''} ago</p>}
                          <p className="text-2xl font-bold mt-2">{cell.memberCount ?? 0} Members</p>
                        </button>
                        {expandedCellId === cell.id && (
                          <div className="border-t border-slate-200 p-4 bg-slate-50/50">
                            {canEdit && (
                              <div className="flex justify-end gap-2 mb-3">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCellGroupId(cell.id)
                                    setCellGroupEditForm({
                                      cellId: cell.cellId || cell.id || '',
                                      cellName: cell.cellName || '',
                                      leader: cell.leader || '',
                                      meetingDay: cell.meetingDay || '',
                                      launchDate: cell.launchDate ? String(cell.launchDate).slice(0, 10) : '',
                                      status: cell.status || 'active',
                                    })
                                    setCellGroupEditModalOpen(true)
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-slate-600 text-white text-sm font-medium hover:bg-slate-700"
                                >
                                  Edit cell
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCellMemberId(null)
                                    setCellMemberForm({ name: '', birthday: '', anniversary: '', phone: '', locality: '', since: '', status: 'active' })
                                    setCellMemberModalOpen(true)
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                                >
                                  Add Member
                                </button>
                                <label className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 cursor-pointer">
                                  Import Members
                                  <input
                                    type="file"
                                    accept=".csv,.xlsx,.xls,.doc,.docx,.pdf"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target?.files?.[0]
                                      if (!file) return
                                      e.target.value = ''
                                      const ext = (file.name || '').toLowerCase()
                                      if (ext.endsWith('.doc') || ext.endsWith('.docx') || ext.endsWith('.pdf')) {
                                        alert('For best results please use Excel (.xlsx) or CSV files. Word and PDF imports will be supported in a future update.')
                                        return
                                      }
                                      if (!ext.endsWith('.csv') && !ext.endsWith('.xlsx') && !ext.endsWith('.xls')) {
                                        alert('Please use CSV or Excel (.xlsx / .xls) for import.')
                                        return
                                      }
                                      const reader = new FileReader()
                                      reader.onload = (ev) => {
                                        try {
                                          const data = ev.target?.result
                                          let rows = []
                                          if (ext.endsWith('.csv')) {
                                            const text = typeof data === 'string' ? data : new TextDecoder().decode(data)
                                            rows = text.split(/\r?\n/).map((line) => line.split(',').map((c) => c.trim().replace(/^["']|["']$/g, '')))
                                          } else {
                                            // Lazy-load xlsx to avoid loading it on non-Cell pages
                                            ;(async () => {
                                              const XLSX = await import('xlsx')
                                              const wb = XLSX.read(data, { type: 'binary', cellDates: true })
                                              const ws = wb.Sheets[wb.SheetNames[0]]
                                              const parsedRows = XLSX.utils.sheet_to_json(ws, { header: 1 })

                                              const headers = (parsedRows[0] || []).map((h) => String(h || '').toLowerCase())
                                              const nameIdx = headers.findIndex((h) => h.includes('name'))
                                              const bdayIdx = headers.findIndex((h) => h.includes('birthday') || h.includes('dob') || h.includes('date'))
                                              const annIdx = headers.findIndex((h) => h.includes('anniversary'))
                                              const phoneIdx = headers.findIndex((h) => h.includes('phone') || h.includes('mobile'))
                                              const locIdx = headers.findIndex((h) => h.includes('locality') || h.includes('location') || h.includes('place'))
                                              const sinceIdx = headers.findIndex((h) => h.includes('since') || h.includes('first visit'))
                                              const parsed = []
                                              for (let i = 1; i < parsedRows.length; i++) {
                                                const row = parsedRows[i] || []
                                                const name = nameIdx >= 0 ? String(row[nameIdx] || '').trim() : String(row[0] || '').trim()
                                                if (!name) continue
                                                parsed.push({
                                                  name,
                                                  birthday: bdayIdx >= 0 ? parseDateToYYYYMMDD(row[bdayIdx]) : '',
                                                  anniversary: annIdx >= 0 ? parseDateToYYYYMMDD(row[annIdx]) : '',
                                                  phone: phoneIdx >= 0 ? String(row[phoneIdx] || '').trim() : '',
                                                  locality: locIdx >= 0 ? String(row[locIdx] || '').trim() : '',
                                                  since: sinceIdx >= 0 ? parseDateToYYYYMMDD(row[sinceIdx]) : '',
                                                })
                                              }
                                              const seen = new Set()
                                              const deduped = parsed.filter((p) => {
                                                const key = p.name.toLowerCase()
                                                if (seen.has(key)) return false
                                                seen.add(key)
                                                return true
                                              })
                                              setCellImportPreview(deduped)
                                              setCellImportModalOpen(true)
                                            })().catch((err) => {
                                              console.error(err)
                                              alert('Could not parse Excel file. Try CSV instead.')
                                            })
                                            return
                                          }
                                          const headers = (rows[0] || []).map((h) => String(h || '').toLowerCase())
                                          const nameIdx = headers.findIndex((h) => h.includes('name'))
                                          const bdayIdx = headers.findIndex((h) => h.includes('birthday') || h.includes('dob') || h.includes('date'))
                                          const annIdx = headers.findIndex((h) => h.includes('anniversary'))
                                          const phoneIdx = headers.findIndex((h) => h.includes('phone') || h.includes('mobile'))
                                          const locIdx = headers.findIndex((h) => h.includes('locality') || h.includes('location') || h.includes('place'))
                                          const sinceIdx = headers.findIndex((h) => h.includes('since') || h.includes('first visit'))
                                          const parsed = []
                                          for (let i = 1; i < rows.length; i++) {
                                            const row = rows[i] || []
                                            const name = nameIdx >= 0 ? String(row[nameIdx] || '').trim() : String(row[0] || '').trim()
                                            if (!name) continue
                                            parsed.push({
                                              name,
                                              birthday: bdayIdx >= 0 ? parseDateToYYYYMMDD(row[bdayIdx]) : '',
                                              anniversary: annIdx >= 0 ? parseDateToYYYYMMDD(row[annIdx]) : '',
                                              phone: phoneIdx >= 0 ? String(row[phoneIdx] || '').trim() : '',
                                              locality: locIdx >= 0 ? String(row[locIdx] || '').trim() : '',
                                              since: sinceIdx >= 0 ? parseDateToYYYYMMDD(row[sinceIdx]) : '',
                                            })
                                          }
                                          const seen = new Set()
                                          const deduped = parsed.filter((p) => {
                                            const key = p.name.toLowerCase()
                                            if (seen.has(key)) return false
                                            seen.add(key)
                                            return true
                                          })
                                          setCellImportPreview(deduped)
                                          setCellImportModalOpen(true)
                                        } catch (err) {
                                          console.error(err)
                                          alert('Could not parse file. Use CSV or Excel with a header row.')
                                        }
                                      }
                                      if (ext.endsWith('.csv')) reader.readAsText(file)
                                      else reader.readAsBinaryString(file)
                                    }}
                                  />
                                </label>
                              </div>
                            )}
                            {loadingCellMembers ? (
                              <p className="text-sm text-slate-500">Loading members…</p>
                            ) : (
                              <>
                                <h4 className="font-medium text-slate-700 mt-2 mb-1">Active Members</h4>
                                <div className="overflow-x-auto rounded-lg border border-slate-200">
                                  <table className="min-w-full text-sm">
                                    <thead className="bg-slate-100">
                                      <tr>
                                        <th className="text-left px-3 py-2 font-medium text-slate-600 w-10">SL</th>
                                        <th className="text-left px-3 py-2 font-medium text-slate-600">Name</th>
                                        <th className="text-left px-3 py-2 font-medium text-slate-600">Birthday</th>
                                        <th className="text-left px-3 py-2 font-medium text-slate-600">Anniversary</th>
                                        <th className="text-left px-3 py-2 font-medium text-slate-600">Phone</th>
                                        <th className="text-left px-3 py-2 font-medium text-slate-600">Locality</th>
                                        <th className="text-left px-3 py-2 font-medium text-slate-600">Duration</th>
                                        {canEdit && <th className="text-left px-3 py-2 font-medium text-slate-600">Actions</th>}
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                      {cellMembers.filter((m) => m.status !== 'inactive').map((m, idx) => (
                                        <tr key={m.id} className="hover:bg-slate-50">
                                          <td className="px-3 py-2 text-slate-600">{idx + 1}</td>
                                          <td className="px-3 py-2 text-slate-800">{m.name || '—'}</td>
                                          <td className="px-3 py-2 text-slate-600">{m.birthday ? formatDMY(m.birthday) : '—'}</td>
                                          <td className="px-3 py-2 text-slate-600">{m.anniversary ? formatDMY(m.anniversary) : '—'}</td>
                                          <td className="px-3 py-2 text-slate-600">{m.phone || '—'}</td>
                                          <td className="px-3 py-2 text-slate-600">{m.locality || '—'}</td>
                                          <td className="px-3 py-2 text-slate-600">{m.since ? `${differenceInDays(new Date(), new Date(m.since))} days` : '—'}</td>
                                          {canEdit && (
                                            <td className="px-3 py-2 space-x-2">
                                              <button type="button" onClick={() => { setEditingCellMemberId(m.id); setCellMemberForm({ name: m.name || '', birthday: m.birthday ? String(m.birthday).slice(0, 10) : '', anniversary: m.anniversary ? String(m.anniversary).slice(0, 10) : '', phone: m.phone || '', locality: m.locality || '', since: m.since ? String(m.since).slice(0, 10) : '', status: m.status || 'active' }); setCellMemberModalOpen(true) }} className="text-blue-600 hover:underline">Edit</button>
                                              <button type="button" onClick={async () => { if (!window.confirm('Remove this member?')) return; await deleteCellGroupMember(cell.id, m.id); const list = await getCellGroupMembers(cell.id); setCellMembers(list); setCellGroups((prev) => prev.map((c) => (c.id === cell.id ? { ...c, memberCount: list.length } : c))); }} className="text-red-600 hover:underline">Delete</button>
                                              <button type="button" onClick={async () => { await updateCellGroupMember(cell.id, m.id, { status: 'inactive' }); const list = await getCellGroupMembers(cell.id); setCellMembers(list); }} className="text-amber-600 hover:underline">Make Inactive</button>
                                            </td>
                                          )}
                                        </tr>
                                      ))}
                                      {cellMembers.filter((m) => m.status !== 'inactive').length === 0 && (
                                        <tr><td colSpan={canEdit ? 8 : 7} className="px-3 py-4 text-center text-slate-500">No active members.</td></tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                                <h4 className="font-medium text-slate-700 mt-4 mb-1">Inactive Members</h4>
                                <div className="overflow-x-auto rounded-lg border border-slate-200">
                                  <table className="min-w-full text-sm">
                                    <thead className="bg-slate-100">
                                      <tr>
                                        <th className="text-left px-3 py-2 font-medium text-slate-600 w-10">SL</th>
                                        <th className="text-left px-3 py-2 font-medium text-slate-600">Name</th>
                                        <th className="text-left px-3 py-2 font-medium text-slate-600">Birthday</th>
                                        <th className="text-left px-3 py-2 font-medium text-slate-600">Anniversary</th>
                                        <th className="text-left px-3 py-2 font-medium text-slate-600">Phone</th>
                                        <th className="text-left px-3 py-2 font-medium text-slate-600">Locality</th>
                                        <th className="text-left px-3 py-2 font-medium text-slate-600">Duration</th>
                                        {canEdit && <th className="text-left px-3 py-2 font-medium text-slate-600">Actions</th>}
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                      {cellMembers.filter((m) => m.status === 'inactive').map((m, idx) => (
                                        <tr key={m.id} className="hover:bg-slate-50 opacity-90">
                                          <td className="px-3 py-2 text-slate-600">{idx + 1}</td>
                                          <td className="px-3 py-2 text-slate-800">{m.name || '—'}</td>
                                          <td className="px-3 py-2 text-slate-600">{m.birthday ? formatDMY(m.birthday) : '—'}</td>
                                          <td className="px-3 py-2 text-slate-600">{m.anniversary ? formatDMY(m.anniversary) : '—'}</td>
                                          <td className="px-3 py-2 text-slate-600">{m.phone || '—'}</td>
                                          <td className="px-3 py-2 text-slate-600">{m.locality || '—'}</td>
                                          <td className="px-3 py-2 text-slate-600">{m.since ? `${differenceInDays(new Date(), new Date(m.since))} days` : '—'}</td>
                                          {canEdit && (
                                            <td className="px-3 py-2 space-x-2">
                                              <button type="button" onClick={() => { setEditingCellMemberId(m.id); setCellMemberForm({ name: m.name || '', birthday: m.birthday ? String(m.birthday).slice(0, 10) : '', anniversary: m.anniversary ? String(m.anniversary).slice(0, 10) : '', phone: m.phone || '', locality: m.locality || '', since: m.since ? String(m.since).slice(0, 10) : '', status: 'inactive' }); setCellMemberModalOpen(true) }} className="text-blue-600 hover:underline">Edit</button>
                                              <button type="button" onClick={async () => { await updateCellGroupMember(cell.id, m.id, { status: 'active' }); const list = await getCellGroupMembers(cell.id); setCellMembers(list); }} className="text-emerald-600 hover:underline">Make Active</button>
                                            </td>
                                          )}
                                        </tr>
                                      ))}
                                      {cellMembers.filter((m) => m.status === 'inactive').length === 0 && (
                                        <tr><td colSpan={canEdit ? 8 : 7} className="px-3 py-4 text-center text-slate-500">No inactive members.</td></tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      )
                    })}
                  </div>

                  {cellGroups.filter((c) => c.status === 'inactive').length > 0 && (
                    <div className="mt-6">
                      <h3 className="font-semibold text-slate-800 mb-2">Inactive Cells</h3>
                      <div className="overflow-x-auto rounded-lg border border-slate-200">
                        <table className="min-w-full text-sm">
                          <thead className="bg-slate-100">
                            <tr>
                              <th className="text-left px-3 py-2 font-medium text-slate-600 w-10">SL</th>
                              <th className="text-left px-3 py-2 font-medium text-slate-600">Cell Name</th>
                              <th className="text-left px-3 py-2 font-medium text-slate-600">Leader</th>
                              <th className="text-left px-3 py-2 font-medium text-slate-600">Meeting Day</th>
                              <th className="text-left px-3 py-2 font-medium text-slate-600">Launch Date</th>
                              {canEdit && <th className="text-left px-3 py-2 font-medium text-slate-600">Actions</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {cellGroups.filter((c) => c.status === 'inactive').map((cell, idx) => (
                              <tr key={cell.id} className="hover:bg-slate-50">
                                <td className="px-3 py-2 text-slate-600">{idx + 1}</td>
                                <td className="px-3 py-2 text-slate-800">{cell.cellName || '—'}</td>
                                <td className="px-3 py-2 text-slate-600">{cell.leader || '—'}</td>
                                <td className="px-3 py-2 text-slate-600">{cell.meetingDay || '—'}</td>
                                <td className="px-3 py-2 text-slate-600">{cell.launchDate ? formatDMY(cell.launchDate) : '—'}</td>
                                {canEdit && (
                                  <td className="px-3 py-2 space-x-2">
                                    <button type="button" onClick={() => { setEditingCellGroupId(cell.id); setCellGroupEditForm({ cellId: cell.cellId || cell.id || '', cellName: cell.cellName || '', leader: cell.leader || '', meetingDay: cell.meetingDay || '', launchDate: cell.launchDate ? String(cell.launchDate).slice(0, 10) : '', status: 'inactive' }); setCellGroupEditModalOpen(true) }} className="text-blue-600 hover:underline">Edit</button>
                                    <button type="button" onClick={async () => { await updateCellGroup(cell.id, { status: 'active' }); setCellGroups((prev) => prev.map((c) => (c.id === cell.id ? { ...c, status: 'active' } : c))); }} className="text-emerald-600 hover:underline">Make Active</button>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  </>
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
                      const logicalCellId = (newCellGroupForm.cellId || '').trim() || id
                      setCellGroups((prev) => [...prev, { id, cellId: logicalCellId, cellName: newCellGroupForm.cellName, leader: newCellGroupForm.leader, meetingDay: newCellGroupForm.meetingDay, launchDate: newCellGroupForm.launchDate, status: newCellGroupForm.status || 'active', memberCount: 0, department: department.name }])
                      setCellGroupModalOpen(false)
                      setNewCellGroupForm({ cellId: '', cellName: '', leader: '', meetingDay: '', launchDate: '', status: 'active' })
                    } catch (err) {
                      console.error(err)
                      alert('Failed to save')
                    }
                  }}
                  className="p-5 space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Cell ID (optional)</label>
                    <input type="text" placeholder="Unique code; leave blank to use document ID" value={newCellGroupForm.cellId} onChange={(e) => setNewCellGroupForm((f) => ({ ...f, cellId: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                    <p className="text-xs text-slate-500 mt-1">Leaders link via profile <strong>cellGroupId</strong> matching this value.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Cell Name *</label>
                    <input type="text" value={newCellGroupForm.cellName} onChange={(e) => setNewCellGroupForm((f) => ({ ...f, cellName: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Leader</label>
                    <input type="text" value={newCellGroupForm.leader} onChange={(e) => setNewCellGroupForm((f) => ({ ...f, leader: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Day of Cell</label>
                    <input type="text" placeholder="e.g. Tuesday" value={newCellGroupForm.meetingDay} onChange={(e) => setNewCellGroupForm((f) => ({ ...f, meetingDay: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Launch Date</label>
                    <input type="date" value={newCellGroupForm.launchDate} onChange={(e) => setNewCellGroupForm((f) => ({ ...f, launchDate: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                    <select value={newCellGroupForm.status} onChange={(e) => setNewCellGroupForm((f) => ({ ...f, status: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300">
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700">Save</button>
                    <button type="button" onClick={() => setCellGroupModalOpen(false)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {cellGroupEditModalOpen && editingCellGroupId && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
                <div className="p-5 border-b border-slate-200">
                  <h3 className="text-lg font-semibold text-slate-800">Edit cell group</h3>
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    try {
                      await updateCellGroup(editingCellGroupId, cellGroupEditForm)
                      setCellGroups((prev) => prev.map((c) => (c.id === editingCellGroupId ? { ...c, ...cellGroupEditForm } : c)))
                      setCellGroupEditModalOpen(false)
                      setEditingCellGroupId(null)
                    } catch (err) {
                      console.error(err)
                      alert('Failed to save')
                    }
                  }}
                  className="p-5 space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Cell ID</label>
                    <input type="text" value={cellGroupEditForm.cellId} onChange={(e) => setCellGroupEditForm((f) => ({ ...f, cellId: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-sm" />
                    <p className="text-xs text-slate-500 mt-1">Unique string; user <strong>cellGroupId</strong> must match.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Cell Name *</label>
                    <input type="text" value={cellGroupEditForm.cellName} onChange={(e) => setCellGroupEditForm((f) => ({ ...f, cellName: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Leader</label>
                    <input type="text" value={cellGroupEditForm.leader} onChange={(e) => setCellGroupEditForm((f) => ({ ...f, leader: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Meeting Day</label>
                    <input type="text" placeholder="e.g. Tuesday" value={cellGroupEditForm.meetingDay} onChange={(e) => setCellGroupEditForm((f) => ({ ...f, meetingDay: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Launch Date</label>
                    <input type="date" value={cellGroupEditForm.launchDate} onChange={(e) => setCellGroupEditForm((f) => ({ ...f, launchDate: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                    <select value={cellGroupEditForm.status} onChange={(e) => setCellGroupEditForm((f) => ({ ...f, status: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300">
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700">Save</button>
                    <button type="button" onClick={() => { setCellGroupEditModalOpen(false); setEditingCellGroupId(null) }} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</button>
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
                      setCellMemberForm({ name: '', birthday: '', anniversary: '', phone: '', locality: '', since: '', status: 'active' })
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
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Since (first visit / started attending)</label>
                    <input type="date" value={cellMemberForm.since} onChange={(e) => setCellMemberForm((f) => ({ ...f, since: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                    <select value={cellMemberForm.status} onChange={(e) => setCellMemberForm((f) => ({ ...f, status: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300">
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700">Save</button>
                    <button type="button" onClick={() => { setCellMemberModalOpen(false); setEditingCellMemberId(null) }} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {cellImportModalOpen && expandedCellId && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                <div className="p-5 border-b border-slate-200">
                  <h3 className="text-lg font-semibold text-slate-800">Import preview (duplicates removed)</h3>
                  <p className="text-sm text-slate-500 mt-1">{cellImportPreview.length} member(s) to import. Confirm to add to this cell group.</p>
                </div>
                <div className="flex-1 overflow-auto p-4">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="text-left px-2 py-1.5 font-medium text-slate-600">#</th>
                        <th className="text-left px-2 py-1.5 font-medium text-slate-600">Name</th>
                        <th className="text-left px-2 py-1.5 font-medium text-slate-600">Birthday</th>
                        <th className="text-left px-2 py-1.5 font-medium text-slate-600">Anniversary</th>
                        <th className="text-left px-2 py-1.5 font-medium text-slate-600">Phone</th>
                        <th className="text-left px-2 py-1.5 font-medium text-slate-600">Locality</th>
                        <th className="text-left px-2 py-1.5 font-medium text-slate-600">Since</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {cellImportPreview.map((row, idx) => (
                        <tr key={idx}>
                          <td className="px-2 py-1.5 text-slate-600">{idx + 1}</td>
                          <td className="px-2 py-1.5 text-slate-800">{row.name || '—'}</td>
                          <td className="px-2 py-1.5 text-slate-600">{row.birthday ? formatDMY(row.birthday) : '—'}</td>
                          <td className="px-2 py-1.5 text-slate-600">{row.anniversary ? formatDMY(row.anniversary) : '—'}</td>
                          <td className="px-2 py-1.5 text-slate-600">{row.phone || '—'}</td>
                          <td className="px-2 py-1.5 text-slate-600">{row.locality || '—'}</td>
                          <td className="px-2 py-1.5 text-slate-600">{row.since ? formatDMY(row.since) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-4 border-t border-slate-200 flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => { setCellImportModalOpen(false); setCellImportPreview([]) }}
                    className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={cellImportSaving || cellImportPreview.length === 0}
                    onClick={async () => {
                      if (!expandedCellId || !cellImportPreview.length) return
                      setCellImportSaving(true)
                      try {
                        const existingNames = new Set(cellMembers.map((m) => (m.name || '').toLowerCase()))
                        for (const row of cellImportPreview) {
                          const n = (row.name || '').trim()
                          if (!n || existingNames.has(n.toLowerCase())) continue
                          await addCellGroupMember(expandedCellId, row)
                          existingNames.add(n.toLowerCase())
                        }
                        const list = await getCellGroupMembers(expandedCellId)
                        setCellMembers(list)
                        setCellGroups((prev) => prev.map((c) => (c.id === expandedCellId ? { ...c, memberCount: list.length } : c)))
                        setCellImportModalOpen(false)
                        setCellImportPreview([])
                      } catch (err) {
                        console.error(err)
                        alert('Failed to import some members')
                      }
                      setCellImportSaving(false)
                    }}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {cellImportSaving ? 'Importing…' : 'Confirm Import'}
                  </button>
                </div>
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
    </div>
  )
}
