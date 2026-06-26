import { useParams, Link, Navigate, useSearchParams, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState, useCallback, Fragment, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { getDepartmentBySlug } from '../constants/departments'
import { getDepartmentHubTabs, LEGACY_DEPARTMENT_NAMES, usesGenericSubDepartmentCollection } from '../constants/departmentTabs'
import {
  getTasks,
  createTask,
  updateTask,
  subscribeCellMemberReferralTasks,
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
  getEventSpendingItemsByDepartment,
  addEventSpendingItem,
  deleteEventSpendingItem,
  getCellGroups,
  getCellGroupMembers,
  getAllCellGroupMembers,
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
  getPCSEntries,
  syncAllPCSToLookup,
  addPCSEntry,
  updatePCSEntry,
  deletePCSEntry,
  deactivatePCSEntry,
  getInactivePCSEntries,
  getDelightVisitorById,
  migrateSundayServiceToEnglish,
  syncVisitorDataEverywhere,
  updateCellMembersByVisitorId,
  updatePCSEntriesByVisitorId,
  getBoardPoints,
  addBoardPoint,
  updateBoardPoint,
  deleteBoardPoint,
  getMemberProfile,
  getMemberProfileWithContext,
  upsertMemberProfile,
  uploadMemberPhoto,
  getSundayPlan,
  setSundayPlanSection,
  sendPCSFillInvitation,
  getPCSFillInvitationByEntry,
  subscribePCSFillInvitationsByCellId,
  completePCSFillInvitation,
} from '../services/firestore'
import { ROLES } from '../constants/roles'
import { logAction } from '../utils/auditLog'
import { isRestrictedDLightDirector } from '../utils/dlightAccess'
import { differenceInDays, differenceInYears, differenceInMonths, format, startOfWeek, endOfWeek, addWeeks, subWeeks } from 'date-fns'
import { formatDMY, formatDMYTime, parseDateToYYYYMMDD, formatDisplayDate } from '../utils/date'
import PlanningBoard from '../components/PlanningBoard/PlanningBoard'
import LiveElapsedTimer from '../components/LiveElapsedTimer'
import ProgramConfirmSheet from '../components/ProgramConfirmSheet'
import DepartmentTabBar from '../components/DepartmentTabBar'
import BoardPointsModal from '../components/BoardPointsModal'
import { CellDirectorCockpit } from '../components/CellDirectorCockpit'
import DLightDirectorDashboard from '../components/DLightDirectorDashboard'
import { canAccessAccountsEntry, ACCOUNTS_ENTRY_BASE_PATH } from '../utils/accountsEntryAccess'
import CellReportsTab from './cell/CellReportsTab'
import CellLeaderEntryTab from './cell/CellLeaderEntryTab'
import CellOperationsToggle from './cell/CellOperationsToggle'
import SundayOperationsToggle from './sunday/SundayOperationsToggle'
import MediaOperationsToggle from './media/MediaOperationsToggle'
import RiverKidsOperationsToggle from './river-kids/RiverKidsOperationsToggle'
import AdministrationOperationsToggle from './administration/AdministrationOperationsToggle'
import AccountsOperationsToggle from './accounts/AccountsOperationsToggle'
import DLightOperationsToggle from './d-light/DLightOperationsToggle'
import WorshipOperationsToggle from './worship/WorshipOperationsToggle'
import DeptExpenseTab from '../components/DeptExpenseTab'
import AddDepartmentsPage from './accounts/AddDepartmentsPage'
import UpcomingSunday from './UpcomingSunday'
import SecCoreSummary from './seccore/SecCoreSummary'
import SundayPrepTracker from '../components/SundayPrepTracker'

async function mergeTasksEntriesTeam(canonicalName) {
  const alt = LEGACY_DEPARTMENT_NAMES[canonicalName] || []
  const deptNames = [canonicalName, ...alt]
  const taskById = new Map()
  for (const n of deptNames) {
    const list = await getTasks({ department: n }).catch(() => [])
    list.forEach((t) => taskById.set(t.id, t))
  }
  const tasks = [...taskById.values()].sort((a, b) => {
    const ca = a.createdAt?.seconds ?? (a.createdAt instanceof Date ? a.createdAt.getTime() / 1000 : 0)
    const cb = b.createdAt?.seconds ?? (b.createdAt instanceof Date ? b.createdAt.getTime() / 1000 : 0)
    return cb - ca
  })
  const entryParts = await Promise.all(deptNames.map((n) => getDepartmentEntries(n, { limit: 20 }).catch(() => [])))
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
    const list = await getDepartmentTeamMembers(n).catch(() => [])
    list.forEach((m) => teamById.set(m.id, m))
  }
  const team = [...teamById.values()]
  return { tasks, entries, team }
}

const VISITOR_START_YEAR = 2014
const VISITOR_CURRENT_YEAR = new Date().getFullYear()
const VISITOR_SERVICE_LABELS = { E: 'English Service', M: 'Malayalam', T: 'Tamil' }
const SERVICE_DISPLAY = {
  'english':         'English Service',
  'english service': 'English Service',
  'sunday service':  'English Service',
  'tamil service':   'Tamil',
  'youth service':   'Youth',
  'cell group':      'Cell',
  'special meeting': 'Special',
}
const fmtService = (s) => {
  if (!s) return '—'
  const lower = s.trim().toLowerCase()
  if (SERVICE_DISPLAY[lower]) return SERVICE_DISPLAY[lower]
  return VISITOR_SERVICE_LABELS[s.trim().toUpperCase()] || s
}

export default function DepartmentHub() {
  const { slug } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { userProfile, user, canManageDepartment, isDepartmentHead, hasAccess, hasPermission, isFounder, isCellDirector, isSundayMinistryDirector } = useAuth()
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
  const [savingPlanningDraft, setSavingPlanningDraft] = useState(false)
  const [planningDraftLoadedOnce, setPlanningDraftLoadedOnce] = useState(false)
  const [planningDraftStatus, setPlanningDraftStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('summary')
  const [opsSubTab, setOpsSubTab] = useState('team')
  const [team, setTeam] = useState([])
  const [loadingTeam, setLoadingTeam] = useState(false)
  const [teamError, setTeamError] = useState('')
  const [editingMember, setEditingMember] = useState(null)
  const [teamMemberSearch, setTeamMemberSearch] = useState('')
  const [teamMemberSearchOpen, setTeamMemberSearchOpen] = useState(false)
  const [teamVisitors, setTeamVisitors] = useState([])
  const [teamVisitorsLoading, setTeamVisitorsLoading] = useState(false)
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
  const [allCellMembers, setAllCellMembers] = useState([])
  const [cellMemberForm, setCellMemberForm] = useState({ name: '', birthday: '', anniversary: '', phone: '', locality: '', since: '', status: 'active', visitorId: '', baptismDate: '', baptismPlace: '', marriageDate: '', spouseName: '' })
  const [cellMemberModalOpen, setCellMemberModalOpen] = useState(false)
  const [editingCellMemberId, setEditingCellMemberId] = useState(null)
  const [cellMemberVisitors, setCellMemberVisitors] = useState([])
  const [cellMemberVisitorSearch, setCellMemberVisitorSearch] = useState('')
  const [cellMemberLinking, setCellMemberLinking] = useState(null)
  const [teamMemberLinking, setTeamMemberLinking] = useState(null)
  const [cellMemberLinkedVisitor, setCellMemberLinkedVisitor] = useState(null)
  const [cellMemberLinkedVisitorForm, setCellMemberLinkedVisitorForm] = useState({ email: '', nativity: '', currentPlace: '', serviceAttended: '', attendedDate: '', howKnown: '' })
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
  const handleCellChangeResolved = useCallback(
    (id) => setCellPendingChanges((prev) => prev.filter((x) => x.id !== id)),
    []
  )
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
  const [boardPoints, setBoardPoints] = useState([])
  const [loadingBoardPoints, setLoadingBoardPoints] = useState(false)
  const [boardPointForm, setBoardPointForm] = useState({ slNo: '', point: '', timeNeeded: '', meetingDate: '' })
  const [boardPointModalOpen, setBoardPointModalOpen] = useState(false)
  const [editingBoardPointId, setEditingBoardPointId] = useState(null)
  const [boardPointsPopupOpen, setBoardPointsPopupOpen] = useState(false)
  const [boardAllottedNotifications, setBoardAllottedNotifications] = useState([])
  const [delightVisitors, setDelightVisitors] = useState([])
  const [loadingDelightVisitors, setLoadingDelightVisitors] = useState(false)
  const [delightVisitorModalOpen, setDelightVisitorModalOpen] = useState(false)
  const [editingDelightVisitorId, setEditingDelightVisitorId] = useState(null)
  const [importingVisitors, setImportingVisitors] = useState(false)
  const [importVisitorResult, setImportVisitorResult] = useState(null)
  const [importPreviewRows, setImportPreviewRows] = useState([])
  const [importPreviewOpen, setImportPreviewOpen] = useState(false)
  const [pasteImportOpen, setPasteImportOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [visitorSearch, setVisitorSearch] = useState('')
  const [visitorSearchOpen, setVisitorSearchOpen] = useState(false)
  const [visitorMenuOpenId, setVisitorMenuOpenId] = useState(null)
  const [visitorSubPage, setVisitorSubPage] = useState('current')
  const [visitorPrevYear, setVisitorPrevYear] = useState(VISITOR_CURRENT_YEAR - 1)
  const [yearSelectorOpen, setYearSelectorOpen] = useState(false)
  const [pcsEntries, setPcsEntries] = useState([])
  const [loadingPCS, setLoadingPCS] = useState(false)
  const [pcsPickerOpen, setPcsPickerOpen] = useState(false)
  const [pcsManualOpen, setPcsManualOpen] = useState(false)
  const [cellReferralOpen, setCellReferralOpen] = useState(false)
  const [removedFromCellOpen, setRemovedFromCellOpen] = useState(false)
  const [pcsExpandedId, setPcsExpandedId] = useState(null)
  const [collapsedPCSYears, setCollapsedPCSYears] = useState(() => new Set())
  const [pcsYearTileOpen, setPcsYearTileOpen] = useState(false)
  const [pcsExpandedVisitor, setPcsExpandedVisitor] = useState(null)
  const [pcsExpandedProfile, setPcsExpandedProfile] = useState(null)
  const [pcsExpandedContext, setPcsExpandedContext] = useState(null)
  const [pcsExpandedLoading, setPcsExpandedLoading] = useState(false)
  const [pcsExpandedForm, setPcsExpandedForm] = useState({})
  const [pcsExpandedSaving, setPcsExpandedSaving] = useState(false)
  const [pcsPhotoFile, setPcsPhotoFile] = useState(null)
  const [pcsPhotoPreview, setPcsPhotoPreview] = useState(null)
  const [pcsNotifiedIds, setPcsNotifiedIds] = useState(new Set())
  const [pcsNotifyingId, setPcsNotifyingId] = useState(null)
  const [pcsSpouseFocused, setPcsSpouseFocused] = useState(false)
  const [pcsShowFormer, setPcsShowFormer] = useState(false)
  const [pcsInactiveEntries, setPcsInactiveEntries] = useState([])
  const [pcsLoadingFormer, setPcsLoadingFormer] = useState(false)
  const [pcsFormDirty, setPcsFormDirty] = useState(false)
  const pcsSavedRef = useRef(null)
  const [pcsInviteStatus, setPcsInviteStatus] = useState({})
  const [pcsInvitingId, setPcsInvitingId] = useState(null)
  const [pcsMenuOpenId, setPcsMenuOpenId] = useState(null)
  const [pendingFillInvitations, setPendingFillInvitations] = useState([])
  const [fillInviteOpen, setFillInviteOpen] = useState(null)
  const [fillInviteForm, setFillInviteForm] = useState({})
  const [fillInviteSaving, setFillInviteSaving] = useState(false)

  // Capture baseline after load completes; reset dirty flag
  useEffect(() => {
    if (pcsExpandedId && !pcsExpandedLoading) {
      pcsSavedRef.current = JSON.stringify(pcsExpandedForm)
      setPcsFormDirty(false)
    }
    if (!pcsExpandedId) {
      pcsSavedRef.current = null
      setPcsFormDirty(false)
    }
  }, [pcsExpandedLoading, pcsExpandedId])

  // Mark dirty whenever form changes after baseline is set
  useEffect(() => {
    if (!pcsExpandedId || pcsSavedRef.current === null) return
    setPcsFormDirty(JSON.stringify(pcsExpandedForm) !== pcsSavedRef.current)
  }, [pcsExpandedForm])

  // Load invitation status when a PCS entry is opened (Caring Director view)
  useEffect(() => {
    if (!pcsExpandedId) return
    getPCSFillInvitationByEntry(pcsExpandedId).then(inv => {
      if (inv) setPcsInviteStatus(prev => ({ ...prev, [pcsExpandedId]: { id: inv.id, status: inv.status, cellLeaderName: inv.cellLeaderName || '' } }))
    }).catch(() => {})
  }, [pcsExpandedId])

  // Subscribe to pending fill invitations for Cell Leaders
  // cellGroupId is preferred (set by director); cellId is the fallback — mirrors userLinkedCellId() in Firestore rules
  useEffect(() => {
    if (slug !== 'cell') return
    const cellId = userProfile?.cellGroupId || userProfile?.cellId
    if (!cellId) return
    const unsub = subscribePCSFillInvitationsByCellId(cellId, setPendingFillInvitations)
    return unsub
  }, [slug, userProfile?.cellGroupId, userProfile?.cellId])

  const [cellReferralTasks, setCellReferralTasks] = useState([])
  const [cellReferralAdding, setCellReferralAdding] = useState(new Set())
  const [cellReferralRemoving, setCellReferralRemoving] = useState(new Set())
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
    year: VISITOR_CURRENT_YEAR,
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
  const [mediaAssignments, setMediaAssignments] = useState({})
  const [savingMediaAssign, setSavingMediaAssign] = useState(false)
  const [mediaSundayDate, setMediaSundayDate] = useState(() => {
    const today = new Date(); const day = today.getDay()
    const next = new Date(today); next.setDate(today.getDate() + (day === 0 ? 0 : 7 - day))
    return format(next, 'yyyy-MM-dd')
  })
  const [mediaSundayAssign, setMediaSundayAssign] = useState({})
  const [mediaSundayDesignProgram, setMediaSundayDesignProgram] = useState([])
  const [mediaSundaySelected, setMediaSundaySelected] = useState(new Set())
  const [mediaSundayLoading, setMediaSundayLoading] = useState(false)
  const [mediaSundaySaving, setMediaSundaySaving] = useState(false)
  const [mediaSundayPushed, setMediaSundayPushed] = useState(false)
  const [mediaSundayPushing, setMediaSundayPushing] = useState(false)
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
  const [eventForm, setEventForm] = useState({
    name: '',
    budget: '',
    team: '',
    programs: [],
    liveCellAttendance: {},
    programScheduleStartTime: '',
  })
  const [newEventModalOpen, setNewEventModalOpen] = useState(false)
  const [newEventName, setNewEventName] = useState('')

  // Live Control (Event Management)
  const [liveControlTab, setLiveControlTab] = useState('timer')
  const [liveConfirmOpen, setLiveConfirmOpen] = useState(false)
  const [eventProgramModalOpen, setEventProgramModalOpen] = useState(false)
  const [eventProgramEditingId, setEventProgramEditingId] = useState(null)
  const [eventProgramForm, setEventProgramForm] = useState({
    programNo: '',
    programName: '',
    programBy: '',
    duration: '',
  })

  const [liveCellGroups, setLiveCellGroups] = useState([])
  const [liveCellGroupsLoading, setLiveCellGroupsLoading] = useState(false)
  const [liveExpandedCellId, setLiveExpandedCellId] = useState(null)
  const [liveMembersForCell, setLiveMembersForCell] = useState([])
  const [liveMembersLoading, setLiveMembersLoading] = useState(false)
  const [liveAddNameInput, setLiveAddNameInput] = useState('')

  // Event Management → Spending
  const [eventSpendingItems, setEventSpendingItems] = useState([])
  const [loadingEventSpending, setLoadingEventSpending] = useState(false)
  const [spendingEventId, setSpendingEventId] = useState('')
  const [spendingAmount, setSpendingAmount] = useState('')
  const [spendingItemsPurchased, setSpendingItemsPurchased] = useState('')
  const [spendingDescription, setSpendingDescription] = useState('')

  const tabs = useMemo(() => {
    const allTabs = getDepartmentHubTabs(slug)
    // Cell leaders only see their own tabs, not the director's overview
    if (slug === 'cell' && !canViewAllCells) {
      return allTabs.filter(t => t === 'leaderEntry' || t === 'reports')
    }
    return allTabs
  }, [slug, canViewAllCells])

  const isAccountsEntryRoute =
    slug === 'accounts' && String(location?.pathname || '').includes('/department/accounts/entry')
  const activeTabForBar = isAccountsEntryRoute ? 'entry' : activeTab

  const tabFromUrl = searchParams.get('tab')
  const isCellLeader = slug === 'cell' && !canViewAllCells
  useEffect(() => {
    const nextTabs = getDepartmentHubTabs(slug)
    const cellLeaderTabs = ['leaderEntry', 'reports']
    if (tabFromUrl && nextTabs.includes(tabFromUrl)) {
      setActiveTab(isCellLeader && !cellLeaderTabs.includes(tabFromUrl) ? 'leaderEntry' : tabFromUrl)
    } else {
      setActiveTab(isCellLeader ? 'leaderEntry' : 'summary')
    }
  }, [slug, tabFromUrl, isCellLeader])

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

  function formatHHmm(dateLike) {
    const d = dateLike instanceof Date ? dateLike : new Date(dateLike)
    if (Number.isNaN(d.getTime())) return ''
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  }

  function addMinutesToHHmm(hhmm, minutes) {
    if (!hhmm) return ''
    const m = Number(minutes) || 0
    const parts = String(hhmm).split(':')
    if (parts.length < 2) return ''
    const hh = Number(parts[0])
    const mm = Number(parts[1])
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return ''
    const total = hh * 60 + mm + m
    const day = 24 * 60
    const normalized = ((total % day) + day) % day
    const outH = Math.floor(normalized / 60)
    const outM = normalized % 60
    return `${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}`
  }

  /** Normalize time from `<input type="time">`, Firestore, or "HH:mm:ss" → "HH:mm". */
  function normalizeTimeToHHmm(input) {
    if (input == null || input === '') return ''
    if (typeof input === 'object' && input?.seconds != null) {
      const d = new Date(input.seconds * 1000)
      if (Number.isNaN(d.getTime())) return ''
      return format(d, 'HH:mm')
    }
    const s = String(input).trim()
    if (!s) return ''
    const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/)
    if (!m) return ''
    const hh = Math.min(23, Math.max(0, Number(m[1])))
    const mm = Math.min(59, Math.max(0, Number(m[2])))
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return ''
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
  }

  /** Planned segment start from one event-level “Schedule starts at” + prior durations. */
  function plannedSegmentStartHHmm(sortedPrograms, anchorHHmm, index) {
    const a = normalizeTimeToHHmm(anchorHHmm)
    if (!a || !sortedPrograms?.length) return ''
    let t = a
    for (let i = 0; i < index; i++) {
      t = addMinutesToHHmm(t, Number(sortedPrograms[i]?.duration) || 0)
    }
    return t
  }

  function plannedSegmentEndHHmm(sortedPrograms, anchorHHmm, index) {
    const start = plannedSegmentStartHHmm(sortedPrograms, anchorHHmm, index)
    const dur = Number(sortedPrograms[index]?.duration) || 0
    if (!start || !dur) return ''
    return addMinutesToHHmm(start, dur)
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
      })
      .finally(() => {
        setLoading(false)
        setLoadingTeam(false)
      })
  }, [department])

  // Generic sub-departments (Firestore department_sub_departments) for Team + Sub Department tab
  useEffect(() => {
    if (!department || slug === 'cell' || slug === 'd-light') return
    const wantsSubOrTeam = activeTab === 'team' || activeTab === 'subDepartment' ||
      ((slug === 'sunday-ministry' || slug === 'media' || slug === 'river-kids' || slug === 'administration' || slug === 'accounts' || slug === 'caring' || slug === 'd-light') && activeTab === 'operations' && (opsSubTab === 'team' || opsSubTab === 'subDepartment')) ||
      (slug === 'media' && activeTab === 'summary')
    if (!wantsSubOrTeam) return
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
  }, [department, slug, activeTab, opsSubTab])

  useEffect(() => {
    const wantsDlightTeam = slug === 'd-light' && (activeTab === 'team' || (activeTab === 'operations' && opsSubTab === 'team'))
    if (!wantsDlightTeam) {
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
  }, [slug, activeTab, opsSubTab])

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
    if (slug !== 'event-m' || (activeTab !== 'events' && activeTab !== 'liveControl' && activeTab !== 'financial') || !department) return
    setEventsLoading(true)
    getDepartmentEvents(department.name)
      .then(setDeptEvents)
      .catch(() => setDeptEvents([]))
      .finally(() => setEventsLoading(false))
  }, [slug, activeTab, department])

  useEffect(() => { setLiveConfirmOpen(false) }, [selectedEventId])

  useEffect(() => {
    const ev = deptEvents.find((e) => e.id === selectedEventId)
    if (ev) {
      setEventForm({
        name: ev.name || '',
        budget: ev.budget || '',
        team: ev.team || '',
        programs: Array.isArray(ev.programs) ? ev.programs : [],
        liveCellAttendance: ev.liveCellAttendance && typeof ev.liveCellAttendance === 'object' ? ev.liveCellAttendance : {},
        programScheduleStartTime: ev.programScheduleStartTime || '',
      })
    } else {
      setEventForm({
        name: '',
        budget: '',
        team: '',
        programs: [],
        liveCellAttendance: {},
        programScheduleStartTime: '',
      })
    }
  }, [selectedEventId, deptEvents])

  useEffect(() => {
    if (slug !== 'event-m') return
    if (!selectedEventId) return
    setSpendingEventId((prev) => prev || selectedEventId)
  }, [slug, selectedEventId])

  useEffect(() => {
    if (slug !== 'event-m' || activeTab !== 'financial') return
    if (!deptEvents.length) return
    setSpendingEventId((prev) => prev || deptEvents[0].id)
  }, [slug, activeTab, deptEvents])

  // Live Control – load cell groups for attendance
  useEffect(() => {
    if (slug !== 'event-m' || activeTab !== 'liveControl' || liveControlTab !== 'attendance' || !department) return
    let alive = true
    setLiveCellGroupsLoading(true)
    getCellGroups('Cell')
      .then((groups) => {
        if (!alive) return
        setLiveCellGroups((groups || []).filter((g) => g.status !== 'inactive'))
      })
      .catch(() => {
        if (!alive) return
        setLiveCellGroups([])
      })
      .finally(() => {
        if (!alive) return
        setLiveCellGroupsLoading(false)
      })
    return () => {
      alive = false
    }
  }, [slug, activeTab, liveControlTab, department])

  // Live Control – load members for the expanded cell tile
  useEffect(() => {
    if (slug !== 'event-m' || activeTab !== 'liveControl' || liveControlTab !== 'attendance') return
    if (!liveExpandedCellId) {
      setLiveMembersForCell([])
      return
    }
    let alive = true
    setLiveMembersLoading(true)
    getCellGroupMembers(liveExpandedCellId)
      .then((list) => {
        if (!alive) return
        setLiveMembersForCell((list || []).filter((m) => m.status !== 'inactive'))
      })
      .catch(() => {
        if (!alive) return
        setLiveMembersForCell([])
      })
      .finally(() => {
        if (!alive) return
        setLiveMembersLoading(false)
      })
    return () => {
      alive = false
    }
  }, [slug, activeTab, liveControlTab, liveExpandedCellId])

  useEffect(() => {
    const wantsFinancial = activeTab === 'financial' ||
      ((slug === 'cell' || slug === 'sunday-ministry' || slug === 'media' || slug === 'river-kids' || slug === 'administration' || slug === 'accounts' || slug === 'caring' || slug === 'd-light') && activeTab === 'operations' && opsSubTab === 'financial')
    if (department && wantsFinancial) {
      setLoadingBudget(true)
      getFinanceBudgetItemsByDepartment(department.name)
        .then(setBudgetItems)
        .finally(() => setLoadingBudget(false))
    }
  }, [department, slug, activeTab, opsSubTab])

  useEffect(() => {
    if (slug !== 'event-m' || activeTab !== 'financial' || !department) return
    setLoadingEventSpending(true)
    getEventSpendingItemsByDepartment(department.name)
      .then(setEventSpendingItems)
      .catch(() => setEventSpendingItems([]))
      .finally(() => setLoadingEventSpending(false))
  }, [slug, activeTab, department])

  useEffect(() => {
    const wantsPlanning = activeTab === 'planning' ||
      ((slug === 'cell' || slug === 'sunday-ministry' || slug === 'media' || slug === 'river-kids' || slug === 'administration' || slug === 'accounts' || slug === 'caring' || slug === 'd-light') && activeTab === 'operations' && opsSubTab === 'planning')
    if (!department || !wantsPlanning) return
    setLoadingDepartmentUpdates(true)
    getDepartmentUpdates(department.name)
      .then(setDepartmentUpdates)
      .finally(() => setLoadingDepartmentUpdates(false))
    setLoadingBoardPoints(true)
    getBoardPoints(department.name)
      .then(setBoardPoints)
      .catch(() => setBoardPoints([]))
      .finally(() => setLoadingBoardPoints(false))
  }, [department, slug, activeTab, opsSubTab])

  useEffect(() => {
    if (!department || activeTab !== 'summary' || slug === 'sec-core') return
    getBoardPoints(department.name)
      .then(setBoardPoints)
      .catch(() => setBoardPoints([]))
  }, [department, slug, activeTab])

  useEffect(() => {
    if (!boardPoints.length || !department?.name) return
    const seenKey = `board-allotted-seen-${department.name}`
    const seen = new Set(JSON.parse(localStorage.getItem(seenKey) || '[]'))
    const newlyAllotted = boardPoints.filter(bp => bp.allottedTime && !seen.has(bp.id))
    if (newlyAllotted.length) setBoardAllottedNotifications(newlyAllotted)
  }, [boardPoints, department?.name])

  const refreshAllCellMembers = useCallback(() => {
    if (cellGroups.length === 0) return
    Promise.all(cellGroups.map(g =>
      getCellGroupMembers(g.id).then(members => members.map(m => ({ ...m, cellId: g.id })))
    )).then(results => setAllCellMembers(results.flat())).catch(() => {})
  }, [cellGroups])

  useEffect(() => {
    refreshAllCellMembers()
  }, [refreshAllCellMembers])

  useEffect(() => {
    if (department && slug === 'cell' && (activeTab === 'cellGroups' || activeTab === 'summary')) {
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
    if (slug === 'cell' && activeTab === 'summary') {
      setLoadingCellPending(true)
      getCellMemberPendingChanges()
        .then(setCellPendingChanges)
        .catch(() => setCellPendingChanges([]))
        .finally(() => setLoadingCellPending(false))
    }
  }, [slug, activeTab])

  useEffect(() => {
    const wantsCellPlanning = slug === 'cell' && (activeTab === 'planning' || (activeTab === 'operations' && opsSubTab === 'planning'))
    if (wantsCellPlanning) {
      getBackToBibleList().then(setBackToBibleList).catch(() => setBackToBibleList([]))
    }
  }, [slug, activeTab, opsSubTab])

  useEffect(() => {
    if (slug === 'd-light' && (activeTab === 'visitorEntry' || (activeTab === 'summary' && canEditDelightVisitors))) {
      setLoadingDelightVisitors(true)
      // Silently migrate any legacy "Sunday Service" records to "English Service"
      migrateSundayServiceToEnglish().catch(() => {})
      getDelightVisitors()
        .then((visitors) => {
          // Apply migration in local state too (for records updated this session)
          setDelightVisitors(visitors.map(v =>
            v.serviceAttended === 'Sunday Service' ? { ...v, serviceAttended: 'English Service' } : v
          ))
        })
        .catch(() => setDelightVisitors([]))
        .finally(() => setLoadingDelightVisitors(false))
    }
  }, [slug, activeTab])

  useEffect(() => {
    const isTeamSection = activeTab === 'team' || (activeTab === 'operations' && opsSubTab === 'team')
    if (!isTeamSection) return
    setTeamVisitorsLoading(true)
    getDelightVisitors().then(setTeamVisitors).catch(() => setTeamVisitors([])).finally(() => setTeamVisitorsLoading(false))
  }, [slug, activeTab, opsSubTab])

  useEffect(() => {
    if (slug !== 'media' || activeTab !== 'summary') return
    getDepartmentAssignments('media').then((doc) => {
      if (doc?.assignments && typeof doc.assignments === 'object') setMediaAssignments(doc.assignments)
    }).catch(() => {})
  }, [slug, activeTab])

  useEffect(() => {
    if (slug !== 'media' || activeTab !== 'summary') return
    setMediaSundayLoading(true)
    getSundayPlan(mediaSundayDate)
      .then((plan) => {
        setMediaSundayAssign(plan?.mediaSundayProgram || {})
        const prog = plan?.mediaDesignProgram || []
        setMediaSundayDesignProgram(prog)
        setMediaSundaySelected(new Set(prog.map((i) => i.id || i.name)))
        setMediaSundayPushed(!!plan?.mediaHubPushed)
      })
      .catch(() => { setMediaSundayAssign({}); setMediaSundayDesignProgram([]); setMediaSundaySelected(new Set()); setMediaSundayPushed(false) })
      .finally(() => setMediaSundayLoading(false))
  }, [slug, activeTab, mediaSundayDate])

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
    const wantsDlightSubDept = slug === 'd-light' && (
      activeTab === 'subDepartment' ||
      (activeTab === 'operations' && opsSubTab === 'subDepartment') ||
      (activeTab === 'summary' && canEditDelightVisitors)
    )
    if (!wantsDlightSubDept) return
    setLoadingDlightSubDepts(true)
    getDlightSubDepartments()
      .then(setDlightSubDepts)
      .catch(() => setDlightSubDepts([]))
      .finally(() => setLoadingDlightSubDepts(false))
  }, [slug, activeTab, opsSubTab])

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
    if (slug === 'caring' && (activeTab === 'pcs' || activeTab === 'summary')) {
      setLoadingPCS(true)
      getPCSEntries().then(entries => { setPcsEntries(entries); syncAllPCSToLookup(entries).catch(() => {}) }).catch(() => setPcsEntries([])).finally(() => setLoadingPCS(false))
      getCellGroups('Cell').then(groups => {
        setCellGroups(groups)
        if (!groups.length) return
        Promise.all(groups.map(g =>
          getCellGroupMembers(g.id).then(members => members.map(m => ({ ...m, cellId: g.id })))
        )).then(results => setAllCellMembers(results.flat())).catch(() => {})
      }).catch(() => {})
    }
  }, [slug, activeTab])

  // Live listener for cell-leader PCS referral tasks (Caring hub)
  useEffect(() => {
    if (slug !== 'caring') return
    const unsub = subscribeCellMemberReferralTasks(setCellReferralTasks)
    return unsub
  }, [slug])

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

  const canEdit = department
    ? (department.name === 'Cell' ? canViewAllCells : canManageDepartment(department.name))
    : false

  const planningDraftPeriod = useMemo(() => new Date().toISOString().slice(0, 7), [])
  const planningDraftStorageKey = useMemo(() => {
    if (!department?.name) return null
    const who = userProfile?.email || userProfile?.displayName || user?.uid || 'unknown'
    return `rol:planningDraft:${department.name}:${who}:${planningDraftPeriod}`
  }, [department?.name, userProfile?.email, userProfile?.displayName, user?.uid, planningDraftPeriod])

  useEffect(() => {
    setPlanningDraftLoadedOnce(false)
    setPlanningDraftStatus('')
  }, [slug])

  useEffect(() => {
    if (activeTab !== 'planning') return
    if (!canEdit) return
    if (!planningDraftStorageKey) return
    if (planningDraftLoadedOnce) return
    try {
      const saved = localStorage.getItem(planningDraftStorageKey)
      if (saved != null) setPlanningNotes(saved)
    } catch {
      // Ignore localStorage errors (private mode, blocked storage, etc).
    } finally {
      setPlanningDraftLoadedOnce(true)
    }
  }, [activeTab, canEdit, planningDraftLoadedOnce, planningDraftStorageKey])

  const subDeptOptionList = useMemo(
    () => (slug === 'd-light' ? dlightTeamSubOpts : subDepartments),
    [slug, dlightTeamSubOpts, subDepartments]
  )

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
  // Exception: Accounts entry users (Weekly Expense Manager / Weekly Entry role) must pass through
  // to reach the nested EntryPage even though they aren't department heads.
  const isAccountsEntryPassthrough = slug === 'accounts' && canAccessAccountsEntry(userProfile, hasPermission, isFounder)
  // Sunday Ministry: only the director (Founder / Senior Pastor included as super admins)
  if (slug === 'sunday-ministry' && !isSundayMinistryDirector) {
    return (
      <div className="p-6 text-slate-600">
        <Link to="/departments" className="text-blue-600 hover:underline">← Departments</Link>
        <p className="mt-4">You do not have access to Sunday Ministry department.</p>
      </div>
    )
  }

  if (slug !== 'sunday-ministry' && !hasAccess(userProfile, department.name) && !isAccountsEntryPassthrough) {
    return (
      <div className="p-6 text-slate-600">
        <Link to="/departments" className="text-blue-600 hover:underline">← Departments</Link>
        <p className="mt-4">
          You do not have access to {department.name === 'Event M' ? 'Event Management' : department.name} department.
        </p>
      </div>
    )
  }

  // Weekly-only accounts entry users (Weekly Expense Manager / Weekly Entry role):
  // skip the full department hub and render only the entry outlet.
  if (isAccountsEntryPassthrough && !hasAccess(userProfile, department.name)) {
    return <Outlet />
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

  const canEditDelightVisitors =
    department.name === 'D Light' &&
    (userProfile?.role === ROLES.ADMIN ||
      userProfile?.role === ROLES.MINISTRY_LEADER ||
      isDepartmentHead('D Light'))

  const getVisitorYear = (v) => {
    if (v.year) return v.year
    if (!v.attendedDate) return VISITOR_CURRENT_YEAR
    const m = String(v.attendedDate).match(/^(\d{4})/)
    return m ? parseInt(m[1]) : VISITOR_CURRENT_YEAR
  }

  const parseVisitorRows = (rows) => {
    const firstRowCells = (rows[0] || []).map((h) => String(h || '').toLowerCase().trim())
    const HEADER_KEYWORDS = ['name', 'email', 'phone', 'dob', 'nativity', 'service', 'date', 'birth', 'mobile']
    const looksLikeHeader = firstRowCells.some((h) => HEADER_KEYWORDS.some((k) => h.includes(k)))
    let nameIdx, dobIdx, phoneIdx, emailIdx, natIdx, placeIdx, serviceIdx, dateIdx, sourceIdx, startRow
    if (looksLikeHeader) {
      const col = (keywords) => firstRowCells.findIndex((h) => keywords.some((k) => h.includes(k)))
      nameIdx    = col(['name'])
      dobIdx     = col(['date of birth', 'dob', 'birth'])
      phoneIdx   = col(['phone', 'mobile', 'contact', 'ph'])
      emailIdx   = col(['email'])
      natIdx     = col(['nativity', 'nativ', 'native', 'state'])
      placeIdx   = col(['current place', 'place', 'location', 'address'])
      serviceIdx = col(['service attended', 'service'])
      dateIdx    = col(['date of attend', 'attended date', 'attending'])
      sourceIdx  = col(['how', 'source', 'known'])
      startRow   = 1
    } else {
      const firstDataCell = String((rows[0] || [])[0] ?? '').trim()
      const off = /^\d+$/.test(firstDataCell) ? 1 : 0
      nameIdx    = 0 + off; dobIdx     = 1 + off; phoneIdx   = 2 + off; emailIdx   = 3 + off
      natIdx     = 4 + off; placeIdx   = 5 + off; serviceIdx = 6 + off; dateIdx    = 7 + off
      sourceIdx  = 8 + off; startRow   = 0
    }
    const na = (v) => (!v || /^na$/i.test(String(v).trim()) || String(v).trim() === 'N/A') ? '' : String(v).trim()
    const get = (row, idx) => na(String(row[idx] ?? ''))
    const getDate = (row, idx) => idx >= 0 ? parseDateToYYYYMMDD(row[idx]) : ''
    const result = []
    for (let i = startRow; i < rows.length; i++) {
      const row = rows[i] || []
      const name = na(String(row[nameIdx] ?? ''))
      if (!name) continue
      const attendedDate = getDate(row, dateIdx)
      const yearFromDate = attendedDate ? new Date(attendedDate + 'T00:00:00').getFullYear() : null
      result.push({
        name, dob: getDate(row, dobIdx), phone: get(row, phoneIdx), email: get(row, emailIdx),
        nativity: get(row, natIdx), currentPlace: get(row, placeIdx), serviceAttended: get(row, serviceIdx),
        attendedDate, howKnown: get(row, sourceIdx), source: get(row, sourceIdx),
        year: yearFromDate || (visitorSubPage === 'current' ? VISITOR_CURRENT_YEAR : visitorPrevYear),
        createdBy: userProfile?.email || 'import',
      })
    }
    return result
  }

  const duplicateCellMemberKeys = useMemo(() => {
    const cellsByKey = {}
    allCellMembers.filter(m => m.status !== 'inactive').forEach(m => {
      const key = m.visitorId || ('name:' + (m.name || '').toLowerCase().trim())
      if (!key || key === 'name:') return
      if (!cellsByKey[key]) cellsByKey[key] = new Set()
      cellsByKey[key].add(m.cellId)
    })
    return new Set(Object.entries(cellsByKey).filter(([, s]) => s.size > 1).map(([k]) => k))
  }, [allCellMembers])

  const filteredDelightVisitors = delightVisitors
    .filter((v) =>
      visitorSubPage === 'current'
        ? getVisitorYear(v) === VISITOR_CURRENT_YEAR
        : getVisitorYear(v) === visitorPrevYear
    )
    .sort((a, b) => visitorSubPage === 'current'
      ? (b.attendedDate || '').localeCompare(a.attendedDate || '')
      : (a.attendedDate || '').localeCompare(b.attendedDate || '')
    )
  const visitorSearchResults = visitorSearch.trim().length > 0
    ? delightVisitors
        .filter((v) => {
          const q = visitorSearch.trim().toLowerCase()
          const name = (v.name || '').toLowerCase()
          return name.startsWith(q) || name.split(' ').some((word) => word.startsWith(q))
        })
        .slice(0, 10)
    : []

  const headLabel = userProfile?.department === department.name && isDepartmentHead(department.name)
    ? (userProfile?.role === ROLES.DIRECTOR ? 'Director' : 'Coordinator')
    : null

  const handleSavePlanningDraft = () => {
    if (!canEdit) return
    if (!planningDraftStorageKey) return
    setSavingPlanningDraft(true)
    try {
      localStorage.setItem(planningDraftStorageKey, planningNotes || '')
      setPlanningDraftStatus('Draft saved locally')
      setTimeout(() => setPlanningDraftStatus(''), 2500)
    } catch {
      alert('Failed to save draft locally')
    } finally {
      setSavingPlanningDraft(false)
    }
  }

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
      // Draft is only a local helper; once submitted, clear it.
      try {
        if (planningDraftStorageKey) localStorage.removeItem(planningDraftStorageKey)
      } catch {}
      setEntries((prev) => [{ notes: planningNotes, type: 'planning', createdAt: new Date() }, ...prev])
    } finally {
      setSavingPlanning(false)
    }
  }

  const pending = tasks.filter((t) => t.status !== 'Completed')
  const completed = tasks.filter((t) => t.status === 'Completed')

  async function saveMediaAssign() {
    setSavingMediaAssign(true)
    try {
      await setDepartmentAssignments('media', {
        department: 'Media',
        assignments: mediaAssignments,
        updatedAt: new Date(),
        updatedBy: userProfile?.email || userProfile?.displayName || 'unknown',
      })
    } catch (e) {
      console.error(e)
      alert('Failed to save assignments.')
    } finally {
      setSavingMediaAssign(false)
    }
  }

  async function saveMediaSundayProgram() {
    setMediaSundaySaving(true)
    try {
      await setSundayPlanSection(mediaSundayDate, 'mediaSundayProgram', mediaSundayAssign)
    } catch (e) {
      console.error(e)
      alert('Failed to save.')
    } finally {
      setMediaSundaySaving(false)
    }
  }

  async function pushMediaHubToSundayPlan() {
    const itemsToPush = mediaSundayDesignProgram.filter((item) => mediaSundaySelected.has(item.id || item.name))
    if (itemsToPush.length === 0) return
    setMediaSundayPushing(true)
    try {
      const merged = itemsToPush.map((item) => ({
        ...item,
        assignedPerson: mediaSundayAssign[item.name] || '',
      }))
      const notes = merged.map((p, i) =>
        `${i + 1}. ${p.name}${p.types?.length ? ' [' + p.types.join(', ') + ']' : ''}${p.assignedPerson ? ' — ' + p.assignedPerson : ''}`
      ).join('\n')
      await setSundayPlanSection(mediaSundayDate, 'mediaDesignProgram', merged)
      await setSundayPlanSection(mediaSundayDate, 'media', { notes })
      await setSundayPlanSection(mediaSundayDate, 'mediaHubPushed', true)
      setMediaSundayPushed(true)
    } catch (e) {
      console.error(e)
      alert('Failed to push to Sunday Plan.')
    } finally {
      setMediaSundayPushing(false)
    }
  }

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
        activeTab={activeTabForBar}
        setActiveTab={(t) => {
          if (isAccountsEntryRoute) {
            navigate(`/department/${slug}?tab=${encodeURIComponent(t)}`)
          } else {
            setActiveTab(t)
            setSearchParams({ tab: t }, { replace: true })
          }
        }}
        userProfile={userProfile}
        departmentName={department?.name}
        boardPointCount={boardPoints.filter(b => b.status === 'pending').length}
        onBoardPointsClick={() => setBoardPointsPopupOpen(true)}
      />

      {/* ── Allotted-time notifications ── */}
      {boardAllottedNotifications.length > 0 && (
        <div className="fixed top-4 left-4 right-4 z-[70] sm:left-auto sm:right-4 sm:w-80 space-y-2 pointer-events-none">
          {boardAllottedNotifications.map(bp => (
            <div key={bp.id} className="bg-emerald-600 text-white rounded-2xl shadow-xl px-4 py-3 flex items-start gap-3 pointer-events-auto">
              <span className="text-base flex-shrink-0 mt-0.5">🎉</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold leading-tight">Sec-Core has allotted {bp.allottedTime} for your presentation</p>
                {bp.point && <p className="text-xs text-emerald-100 mt-0.5 line-clamp-2">"{bp.point}"</p>}
              </div>
              <button
                type="button"
                onClick={() => {
                  setBoardAllottedNotifications(prev => prev.filter(n => n.id !== bp.id))
                  const seenKey = `board-allotted-seen-${department?.name}`
                  const seen = new Set(JSON.parse(localStorage.getItem(seenKey) || '[]'))
                  seen.add(bp.id)
                  localStorage.setItem(seenKey, JSON.stringify([...seen]))
                }}
                className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full hover:bg-emerald-500 text-white text-base leading-none mt-0.5"
              >×</button>
            </div>
          ))}
        </div>
      )}

      {boardPointsPopupOpen && (
        <BoardPointsModal
          department={department?.name}
          userEmail={userProfile?.email}
          onClose={() => setBoardPointsPopupOpen(false)}
        />
      )}

      <div className="space-y-6 p-4">
      {isAccountsEntryRoute ? (
        <Outlet />
      ) : loading ? (
        <div className="py-8 text-center text-slate-500">Loading...</div>
      ) : (
        <>
          {activeTab === 'summary' && (
            <>
              {/* ── Caring Hub ── */}
              {slug === 'caring' && (
                <div className="space-y-4">
                  {loadingPCS ? (
                    <div className="py-10 text-center text-slate-400 text-sm">Loading insights…</div>
                  ) : (() => {
                    const currentYear = new Date().getFullYear()
                    const members  = pcsEntries.filter(e => e.membershipNumber)
                    const leaders  = pcsEntries.filter(e => e.leadershipPosition)
                    const thisYear = pcsEntries.filter(e => e.year === currentYear)
                    const conversionPct = pcsEntries.length ? Math.round((members.length / pcsEntries.length) * 100) : 0
                    const pcsYears = [...new Set(pcsEntries.map(e => e.year).filter(Boolean))].sort((a, b) => b - a)
                    const maxYearCount = pcsYears.length ? Math.max(...pcsYears.map(yr => pcsEntries.filter(e => e.year === yr).length)) : 1
                    const pendingBoard = boardPoints.filter(b => b.status === 'pending').length

                    return (
                      <>
                        {/* ── 4-stat insight grid ── */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-2xl border border-indigo-200 shadow-sm px-4 py-3">
                            <p className="text-3xl font-black text-indigo-700">{pcsEntries.length}</p>
                            <p className="text-xs font-semibold text-indigo-500 mt-0.5">Total in PCS</p>
                            {thisYear.length > 0 && (
                              <p className="text-[10px] text-indigo-400 mt-1">+{thisYear.length} added in {currentYear}</p>
                            )}
                          </div>

                          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-2xl border border-emerald-200 shadow-sm px-4 py-3">
                            <div className="flex items-end gap-1">
                              <p className="text-3xl font-black text-emerald-700">{members.length}</p>
                              <p className="text-sm font-bold text-emerald-400 mb-1">/{pcsEntries.length}</p>
                            </div>
                            <p className="text-xs font-semibold text-emerald-600 mt-0.5">Are Members</p>
                            <div className="mt-1.5 h-1.5 bg-emerald-200 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${conversionPct}%` }} />
                            </div>
                            <p className="text-[10px] text-emerald-500 mt-0.5">{conversionPct}% conversion</p>
                          </div>

                          <div className="bg-gradient-to-br from-violet-50 to-violet-100 rounded-2xl border border-violet-200 shadow-sm px-4 py-3">
                            <p className="text-3xl font-black text-violet-700">{leaders.length}</p>
                            <p className="text-xs font-semibold text-violet-500 mt-0.5">Leaders in PCS</p>
                            {leaders.length > 0 && (
                              <p className="text-[10px] text-violet-400 mt-1 truncate">
                                {leaders[0].leadershipPosition}{leaders.length > 1 ? ` +${leaders.length - 1} more` : ''}
                              </p>
                            )}
                          </div>

                          <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-2xl border border-amber-200 shadow-sm px-4 py-3">
                            <p className="text-3xl font-black text-amber-600">{pending.length}</p>
                            <p className="text-xs font-semibold text-amber-500 mt-0.5">Pending tasks</p>
                            {pendingBoard > 0 && (
                              <p className="text-[10px] text-amber-400 mt-1">{pendingBoard} board point{pendingBoard !== 1 ? 's' : ''}</p>
                            )}
                          </div>
                        </div>

                        {/* ── PCS by Year — expandable tile ── */}
                        {pcsYears.length > 0 && (
                          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                            {/* Header — always visible, tap to expand */}
                            <button
                              type="button"
                              onClick={() => setPcsYearTileOpen(o => !o)}
                              className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50 transition-colors select-none"
                            >
                              <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0 text-lg">📊</div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-800">PCS by Year</p>
                                {/* Mini year badges shown when collapsed */}
                                {!pcsYearTileOpen && (
                                  <div className="flex gap-1.5 mt-1 flex-wrap">
                                    {pcsYears.slice(0, 5).map(yr => (
                                      <span key={yr} className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                        style={yr === currentYear
                                          ? { background: '#e0e7ff', color: '#4338ca' }
                                          : { background: '#f1f5f9', color: '#64748b' }}>
                                        {yr}: {pcsEntries.filter(e => e.year === yr).length}
                                      </span>
                                    ))}
                                    {pcsYears.length > 5 && (
                                      <span className="text-[9px] text-slate-400">+{pcsYears.length - 5} more</span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <span className="text-slate-400 text-xs flex-shrink-0">
                                {pcsYearTileOpen ? '▲' : '▼'}
                              </span>
                            </button>

                            {/* Expanded bar chart */}
                            {pcsYearTileOpen && (
                              <div className="px-4 pt-2 pb-4 border-t border-slate-100 space-y-3">
                                {pcsYears.map(yr => {
                                  const count = pcsEntries.filter(e => e.year === yr).length
                                  const memberCount = pcsEntries.filter(e => e.year === yr && e.membershipNumber).length
                                  const pct = Math.round((count / maxYearCount) * 100)
                                  const isCurrent = yr === currentYear
                                  return (
                                    <div key={yr}>
                                      <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                          <span className="text-[11px] font-bold" style={{ color: isCurrent ? '#4338ca' : '#64748b' }}>
                                            {yr}
                                          </span>
                                          {isCurrent && (
                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                              style={{ background: '#e0e7ff', color: '#4338ca' }}>current</span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          {memberCount > 0 && (
                                            <span className="text-[9px] text-slate-400">{memberCount} member{memberCount !== 1 ? 's' : ''}</span>
                                          )}
                                          <span className="text-xs font-black" style={{ color: isCurrent ? '#4338ca' : '#475569' }}>
                                            {count}
                                          </span>
                                        </div>
                                      </div>
                                      <div className="h-8 bg-slate-100 rounded-xl overflow-hidden relative">
                                        <div
                                          className="h-full rounded-xl flex items-center justify-end px-3"
                                          style={{
                                            width: `${Math.max(pct, 7)}%`,
                                            background: isCurrent
                                              ? 'linear-gradient(90deg, #818cf8, #4338ca)'
                                              : 'linear-gradient(90deg, #94a3b8, #64748b)',
                                          }}
                                        >
                                          {pct >= 22 && (
                                            <span className="text-[10px] font-bold text-white">{count}</span>
                                          )}
                                        </div>
                                        {pct < 22 && (
                                          <span className="absolute right-3 top-0 bottom-0 flex items-center text-[10px] font-bold text-slate-500">{count}</span>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })}
                                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                  <span className="text-[10px] font-semibold text-slate-400">
                                    {pcsYears.length} year{pcsYears.length !== 1 ? 's' : ''} of PCS
                                  </span>
                                  <span className="text-sm font-black text-indigo-700">{pcsEntries.length} total</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* ── Leaders spotlight ── */}
                        {leaders.length > 0 && (
                          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                            <div className="px-4 py-2.5 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white">
                              <p className="text-[10px] font-bold text-violet-600 uppercase tracking-widest">Leaders in PCS</p>
                            </div>
                            <div className="divide-y divide-slate-50">
                              {leaders.map(e => (
                                <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                                  <div className="w-8 h-8 rounded-full bg-violet-500 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
                                    {e.name[0].toUpperCase()}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-slate-800 truncate">{e.name}</p>
                                    {e.membershipNumber && <p className="text-xs text-indigo-500">#{e.membershipNumber}</p>}
                                  </div>
                                  <span className="text-[10px] font-bold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full flex-shrink-0">{e.leadershipPosition}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* ── Quick actions ── */}
                        <div className="grid grid-cols-2 gap-3">
                          <button type="button"
                            onClick={() => { setActiveTab('pcs'); setSearchParams({ tab: 'pcs' }, { replace: true }) }}
                            className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left hover:border-indigo-200 hover:shadow-md transition-all group">
                            <div className="w-9 h-9 rounded-xl bg-indigo-100 group-hover:bg-indigo-200 flex items-center justify-center text-base mb-3 transition-colors">👤</div>
                            <p className="text-sm font-bold text-slate-800">PCS</p>
                            <p className="text-xs text-slate-500 mt-0.5">{pcsEntries.length} people</p>
                          </button>
                          <button type="button"
                            onClick={() => { setOpsSubTab('team'); setActiveTab('operations'); setSearchParams({ tab: 'operations' }, { replace: true }) }}
                            className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left hover:border-violet-200 hover:shadow-md transition-all group">
                            <div className="w-9 h-9 rounded-xl bg-violet-100 group-hover:bg-violet-200 flex items-center justify-center text-base mb-3 transition-colors">🤝</div>
                            <p className="text-sm font-bold text-slate-800">Team</p>
                            <p className="text-xs text-slate-500 mt-0.5">Caring team members</p>
                          </button>
                          <button type="button"
                            onClick={() => { setOpsSubTab('planning'); setActiveTab('operations'); setSearchParams({ tab: 'operations' }, { replace: true }) }}
                            className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left hover:border-amber-200 hover:shadow-md transition-all group">
                            <div className="w-9 h-9 rounded-xl bg-amber-100 group-hover:bg-amber-200 flex items-center justify-center text-base mb-3 transition-colors">📋</div>
                            <p className="text-sm font-bold text-slate-800">Planning</p>
                            <p className="text-xs text-slate-500 mt-0.5">{pending.length} task{pending.length !== 1 ? 's' : ''}</p>
                          </button>
                          <button type="button"
                            onClick={() => { setOpsSubTab('financial'); setActiveTab('operations'); setSearchParams({ tab: 'operations' }, { replace: true }) }}
                            className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left hover:border-teal-200 hover:shadow-md transition-all group">
                            <div className="w-9 h-9 rounded-xl bg-teal-100 group-hover:bg-teal-200 flex items-center justify-center text-base mb-3 transition-colors">💰</div>
                            <p className="text-sm font-bold text-slate-800">Budget</p>
                            <p className="text-xs text-slate-500 mt-0.5">Financial overview</p>
                          </button>
                        </div>

                        {/* ── Recent additions ── */}
                        {pcsEntries.length > 0 && (
                          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Recent Additions</p>
                              <button type="button"
                                onClick={() => { setActiveTab('pcs'); setSearchParams({ tab: 'pcs' }, { replace: true }) }}
                                className="text-xs text-indigo-600 font-medium hover:underline">View all →</button>
                            </div>
                            <div className="divide-y divide-slate-50">
                              {pcsEntries.slice(0, 3).map(e => (
                                <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors">
                                  <div className={`w-8 h-8 rounded-full text-white text-sm font-bold flex items-center justify-center flex-shrink-0 ${e.membershipNumber ? 'bg-indigo-500' : 'bg-slate-400'}`}>
                                    {e.name[0].toUpperCase()}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-slate-800 truncate">{e.name}</p>
                                    {e.membershipNumber
                                      ? <p className="text-xs text-indigo-500 font-medium">#{e.membershipNumber}</p>
                                      : <p className="text-xs text-slate-400">Visitor</p>}
                                  </div>
                                  {e.leadershipPosition && (
                                    <span className="text-[10px] font-semibold text-violet-700 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded-full flex-shrink-0">{e.leadershipPosition}</span>
                                  )}
                                  {e.year && <span className="text-[10px] text-slate-400 flex-shrink-0">{e.year}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>
              )}

              {slug === 'cell' ? (
                <>
                  {/* Profile Fill Requests banner — visible to non-Director Cell Leaders on the summary tab */}
                  {!canViewAllCells && pendingFillInvitations.length > 0 && (
                    <div className="bg-white rounded-xl border border-violet-200 shadow-sm overflow-hidden mb-4">
                      <div className="px-4 py-3 bg-violet-50 border-b border-violet-100 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-violet-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-violet-800">Profile Fill Requests</p>
                          <p className="text-xs text-violet-500">The Caring Director has asked you to provide profile details for {pendingFillInvitations.length === 1 ? 'a person' : `${pendingFillInvitations.length} people`} in your cell.</p>
                        </div>
                        <span className="bg-violet-500 text-white text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0">{pendingFillInvitations.length}</span>
                      </div>
                      <div className="divide-y divide-slate-50">
                        {pendingFillInvitations.map(inv => (
                          <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
                            <div className="w-9 h-9 rounded-full bg-violet-100 text-violet-700 text-sm font-bold flex items-center justify-center flex-shrink-0">
                              {String(inv.personName || '?').split(' ').slice(0, 2).map(w => (w[0] || '').toUpperCase()).join('')}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-slate-900 text-sm truncate">{inv.personName || 'Unknown'}</p>
                              <p className="text-xs text-slate-400 mt-0.5">{inv.cellName ? `Cell: ${inv.cellName}` : 'Profile details requested'}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setFillInviteOpen(inv)
                                setFillInviteForm({
                                  phone: '', dob: '', nativity: '', currentPlace: '',
                                  baptised: '', baptismDate: '', baptismPlace: '', baptismChurch: '', baptismChurchIsOther: false,
                                  maritalStatus: '', marriageDate: '', spouseName: '',
                                })
                              }}
                              className="px-3 py-1.5 bg-violet-600 text-white text-xs font-semibold rounded-xl hover:bg-violet-700 transition-colors flex-shrink-0"
                            >
                              Fill Profile
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <CellDirectorCockpit
                    userProfile={userProfile}
                    cellGroups={cellGroups}
                    cellPendingChanges={cellPendingChanges}
                    loadingCellPending={loadingCellPending}
                    onChangeResolved={handleCellChangeResolved}
                    tasks={tasks}
                    onTaskUpdated={(id, patch) => setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))}
                  />
                </>
              ) : slug === 'd-light' ? (
                canEditDelightVisitors ? (
                  <DLightDirectorDashboard
                    visitors={delightVisitors}
                    team={team}
                    subDepartments={dlightSubDepts}
                    tasks={tasks}
                    loading={loadingDelightVisitors}
                    currentYear={VISITOR_CURRENT_YEAR}
                  />
                ) : (
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <h2 className="font-semibold text-slate-800 mb-2">D Light</h2>
                    <p className="text-sm text-slate-600">
                      Use the tabs above for Visitor Entry, Assign, Sub Department, Team, Planning, and Budget.
                    </p>
                  </div>
                )
              ) : slug === 'sunday-ministry' ? (
                <SundayPrepTracker />
              ) : slug === 'sec-core' ? (
                <SecCoreSummary />
              ) : slug === 'media' ? (
                <>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="font-semibold text-slate-800">Media Team Assignment</h2>
                      <p className="text-xs text-slate-500 mt-0.5">Assign team members to each sub-department role</p>
                    </div>
                    <button
                      type="button"
                      onClick={saveMediaAssign}
                      disabled={savingMediaAssign}
                      className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 shadow-sm"
                    >
                      {savingMediaAssign ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                  {subDeptLoading ? (
                    <div className="p-8 text-center text-slate-500 text-sm">Loading...</div>
                  ) : subDepartments.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 text-sm">
                      No sub-departments yet. Add them in <button type="button" onClick={() => { setActiveTab('operations'); setOpsSubTab('subDepartment'); setSearchParams({ tab: 'operations' }, { replace: true }) }} className="text-indigo-600 hover:underline">Operations → Sub Department</button>.
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide w-1/2">Role (Sub Department)</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Assigned Member</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {subDepartments.map((sd) => (
                          <tr key={sd.id} className="hover:bg-slate-50/50">
                            <td className="px-4 py-2.5 text-sm font-medium text-slate-800">{sd.name}</td>
                            <td className="px-3 py-2">
                              <select
                                value={mediaAssignments[sd.name] || ''}
                                onChange={(e) => setMediaAssignments((prev) => ({ ...prev, [sd.name]: e.target.value }))}
                                className="w-full px-2 py-1.5 text-sm rounded border border-slate-300 bg-white"
                              >
                                <option value="">— Not assigned</option>
                                {team.filter((m) => !m.isFormer && m.status !== 'former').map((m) => (
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

                {/* ── Sunday Program ── */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mt-4">
                  <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-semibold text-slate-800">Sunday Program</h2>
                      <p className="text-xs text-slate-500 mt-0.5">Assign a person to each media program item for this Sunday</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setMediaSundayDate(format(subWeeks(new Date(mediaSundayDate), 1), 'yyyy-MM-dd'))} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">← Prev</button>
                      <span className="text-sm font-semibold text-slate-700 min-w-[140px] text-center">{format(new Date(mediaSundayDate), 'EEE, dd MMM yyyy')}</span>
                      <button type="button" onClick={() => setMediaSundayDate(format(addWeeks(new Date(mediaSundayDate), 1), 'yyyy-MM-dd'))} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">Next →</button>
                    </div>
                  </div>
                  {mediaSundayLoading ? (
                    <div className="p-6 text-center text-slate-500 text-sm">Loading…</div>
                  ) : mediaSundayDesignProgram.length === 0 ? (
                    <div className="p-6 text-center text-slate-500 text-sm">
                      No design program pushed for this Sunday yet. Design the programme in the Upcoming Sunday tab and push it here.
                    </div>
                  ) : (
                    <>
                      <table className="w-full">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-3 py-2.5 w-10">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                                checked={mediaSundayDesignProgram.length > 0 && mediaSundayDesignProgram.every((i) => mediaSundaySelected.has(i.id || i.name))}
                                onChange={(e) => {
                                  if (e.target.checked) setMediaSundaySelected(new Set(mediaSundayDesignProgram.map((i) => i.id || i.name)))
                                  else setMediaSundaySelected(new Set())
                                }}
                              />
                            </th>
                            <th className="text-left px-2 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">#</th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Program Item</th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Types</th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Assigned Person</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {mediaSundayDesignProgram.map((item, idx) => {
                            const key = item.id || item.name
                            const isChecked = mediaSundaySelected.has(key)
                            return (
                              <tr key={key} className={`hover:bg-slate-50/50 transition-colors ${isChecked ? 'bg-indigo-50/40' : ''}`}>
                                <td className="px-3 py-2.5">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      const next = new Set(mediaSundaySelected)
                                      if (e.target.checked) next.add(key)
                                      else next.delete(key)
                                      setMediaSundaySelected(next)
                                    }}
                                  />
                                </td>
                                <td className="px-2 py-2.5 text-xs text-slate-400">{idx + 1}</td>
                                <td className="px-4 py-2.5 text-sm font-medium text-slate-800">{item.name}</td>
                                <td className="px-3 py-2">
                                  <div className="flex gap-1 flex-wrap">
                                    {(item.types || []).map((t) => (
                                      <span key={t} className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full font-medium">{t}</span>
                                    ))}
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  <select
                                    value={mediaSundayAssign[item.name] || ''}
                                    onChange={(e) => setMediaSundayAssign((prev) => ({ ...prev, [item.name]: e.target.value }))}
                                    className="w-full px-2 py-1.5 text-sm rounded border border-slate-300 bg-white"
                                  >
                                    <option value="">— Not assigned</option>
                                    {team.filter((m) => !m.isFormer && m.status !== 'former').map((m) => (
                                      <option key={m.id} value={m.name}>{m.name}</option>
                                    ))}
                                  </select>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                      <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          {mediaSundayPushed && (
                            <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">✓ Pushed to Sunday Plan</span>
                          )}
                          <span className="text-xs text-slate-400">{mediaSundaySelected.size} of {mediaSundayDesignProgram.length} selected</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={saveMediaSundayProgram}
                            disabled={mediaSundaySaving}
                            className="px-4 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
                          >
                            {mediaSundaySaving ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={pushMediaHubToSundayPlan}
                            disabled={mediaSundayPushing || mediaSundaySelected.size === 0}
                            className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60 shadow-sm"
                          >
                            {mediaSundayPushing ? 'Pushing…' : `Push${mediaSundaySelected.size > 0 && mediaSundaySelected.size < mediaSundayDesignProgram.length ? ` (${mediaSundaySelected.size})` : ''} to Sunday Plan`}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                </>
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
                            <p className="text-xs text-slate-500 mt-1">
                              {e.enteredBy} · {e.createdAt ? formatDisplayDate(e.createdAt) : ''}
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
                    className="px-4 min-h-[44px] py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
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
              <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap justify-between items-center gap-3">
                <div>
                  <h2 className="font-semibold text-slate-800">Visitor Entry</h2>
                  {importVisitorResult && (
                    <p className={`text-xs mt-0.5 font-medium ${importVisitorResult.error ? 'text-red-500' : 'text-emerald-600'}`}>
                      {importVisitorResult.message}
                    </p>
                  )}
                  {/* Year selector backdrop */}
                  {yearSelectorOpen && visitorSubPage === 'previous' && (
                    <div className="fixed inset-0 z-20" onClick={() => setYearSelectorOpen(false)} />
                  )}
                  {/* Year sub-nav */}
                  <div className="flex items-center gap-1 mt-2">
                    <button
                      type="button"
                      onClick={() => { setVisitorSubPage('current'); setYearSelectorOpen(false) }}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${visitorSubPage === 'current' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      {VISITOR_CURRENT_YEAR}
                    </button>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          if (visitorSubPage !== 'previous') {
                            setVisitorSubPage('previous')
                            setYearSelectorOpen(true)
                          } else {
                            setYearSelectorOpen((o) => !o)
                          }
                        }}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${visitorSubPage === 'previous' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                      >
                        {visitorSubPage === 'previous' ? visitorPrevYear : 'Previous Years'}
                        <svg
                          width="10" height="10" viewBox="0 0 10 10" fill="none"
                          className={`transition-transform duration-200 ${yearSelectorOpen && visitorSubPage === 'previous' ? 'rotate-180' : ''}`}
                        >
                          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      {visitorSubPage === 'previous' && yearSelectorOpen && (
                        <div className="absolute left-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
                          style={{ minWidth: '90px' }}
                        >
                          <div className="max-h-52 overflow-y-auto py-1">
                            {Array.from({ length: VISITOR_CURRENT_YEAR - VISITOR_START_YEAR }, (_, i) => VISITOR_CURRENT_YEAR - 1 - i).map((yr) => (
                              <button
                                key={yr}
                                type="button"
                                onClick={() => { setVisitorPrevYear(yr); setYearSelectorOpen(false) }}
                                className={`w-full text-left px-4 py-2 text-xs font-medium transition-colors ${visitorPrevYear === yr ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'}`}
                              >
                                {yr}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {canEditDelightVisitors && (
                  <div className="flex items-center gap-2">
                    {/* Paste data button */}
                    <button
                      type="button"
                      title="Paste data"
                      onClick={() => { setPasteText(''); setPasteImportOpen(true) }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl cursor-pointer select-none bg-white/70 backdrop-blur-sm border border-slate-200/80 shadow-sm text-slate-600 text-sm font-medium hover:bg-white hover:shadow-md hover:border-blue-200 hover:text-blue-700 transition-all duration-150"
                    >
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
                        <rect x="6" y="2" width="10" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                        <path d="M6 5H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        <path d="M9 8h4M9 11h4M9 14h2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
                      </svg>
                      <span className="hidden sm:inline">Paste Data</span>
                    </button>
                    {/* Import Excel — glassmorphism icon button */}
                    <label
                      title="Import from Excel"
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl cursor-pointer select-none
                        bg-white/70 backdrop-blur-sm border border-slate-200/80 shadow-sm
                        text-slate-600 text-sm font-medium
                        hover:bg-white hover:shadow-md hover:border-emerald-200 hover:text-emerald-700
                        transition-all duration-150
                        ${importingVisitors ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
                        <rect x="2" y="2" width="12" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                        <path d="M5 7h6M5 10h6M5 13h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
                        <circle cx="16" cy="15" r="3.5" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.25"/>
                        <path d="M16 13.5v3M14.5 15.5l1.5 1.5 1.5-1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span className="hidden sm:inline">{importingVisitors ? 'Parsing…' : 'Import Excel'}</span>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        disabled={importingVisitors}
                        onChange={async (e) => {
                          const file = e.target?.files?.[0]
                          if (!file) return
                          e.target.value = ''
                          setImportingVisitors(true)
                          try {
                            const ext = file.name.toLowerCase()
                            const readFile = () => new Promise((res, rej) => {
                              const fr = new FileReader()
                              fr.onload = (ev) => res(ev.target.result)
                              fr.onerror = rej
                              if (ext.endsWith('.csv')) fr.readAsText(file)
                              else fr.readAsArrayBuffer(file)
                            })
                            const data = await readFile()
                            let rows = []
                            if (ext.endsWith('.csv')) {
                              rows = String(data).split(/\r?\n/).map((l) => l.split(',').map((c) => c.trim().replace(/^["']|["']$/g, '')))
                            } else {
                              const XLSX = await import('xlsx')
                              const wb = XLSX.read(data, { type: 'array' })
                              rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })
                            }
                            const parsed = parseVisitorRows(rows)
                            if (parsed.length === 0) {
                              setImportVisitorResult({ error: true, message: 'No valid rows found in file.' })
                              setTimeout(() => setImportVisitorResult(null), 4000)
                            } else {
                              setImportPreviewRows(parsed)
                              setImportPreviewOpen(true)
                            }
                          } catch (err) {
                            console.error(err)
                            setImportVisitorResult({ error: true, message: 'Could not read file — check format.' })
                            setTimeout(() => setImportVisitorResult(null), 4000)
                          } finally {
                            setImportingVisitors(false)
                          }
                        }}
                      />
                    </label>

                    {filteredDelightVisitors.length > 0 && (
                      <button
                        type="button"
                        onClick={async () => {
                          const year = visitorSubPage === 'current' ? VISITOR_CURRENT_YEAR : visitorPrevYear
                          if (!window.confirm(`Delete all ${filteredDelightVisitors.length} visitor entries for ${year}? This cannot be undone.`)) return
                          try {
                            await Promise.all(filteredDelightVisitors.map((v) => deleteDelightVisitor(v.id)))
                            setDelightVisitors((prev) => prev.filter((v) => !filteredDelightVisitors.some((f) => f.id === v.id)))
                          } catch (err) {
                            console.error(err)
                            alert('Failed to delete all visitors')
                          }
                        }}
                        className="px-4 py-2 rounded-lg bg-red-50 text-red-600 border border-red-200 text-sm font-medium hover:bg-red-100"
                      >
                        Delete All
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingDelightVisitorId(null)
                        setDelightVisitorForm({ name: '', dob: '', phone: '', email: '', nativity: '', currentPlace: '', serviceAttended: '', attendedDate: '', howKnown: '', source: '', year: visitorSubPage === 'current' ? VISITOR_CURRENT_YEAR : visitorPrevYear })
                        setDelightVisitorModalOpen(true)
                      }}
                      className="px-4 min-h-[44px] py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
                    >
                      Add Visitor
                    </button>
                  </div>
                )}
              </div>
              {/* Search bar — searches across all years */}
              <div className="px-5 py-3 border-b border-slate-100 relative">
                <div className="relative max-w-sm">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" width="15" height="15" viewBox="0 0 20 20" fill="none">
                    <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.6"/>
                    <path d="M13 13l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                  <input
                    type="text"
                    placeholder="Search visitors across all years…"
                    value={visitorSearch}
                    onChange={(e) => { setVisitorSearch(e.target.value); setVisitorSearchOpen(true) }}
                    onFocus={() => setVisitorSearchOpen(true)}
                    onBlur={() => setTimeout(() => setVisitorSearchOpen(false), 150)}
                    className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 placeholder-slate-400"
                  />
                  {visitorSearch && (
                    <button type="button" onClick={() => { setVisitorSearch(''); setVisitorSearchOpen(false) }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                    </button>
                  )}
                </div>
                {visitorSearchOpen && visitorSearchResults.length > 0 && (
                  <div className="absolute left-5 right-5 top-full mt-1 bg-white rounded-xl border border-slate-200 shadow-lg z-30 overflow-hidden max-w-sm">
                    {visitorSearchResults.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onMouseDown={() => {
                          const yr = getVisitorYear(v)
                          if (yr === VISITOR_CURRENT_YEAR) {
                            setVisitorSubPage('current')
                          } else {
                            setVisitorSubPage('previous')
                            setVisitorPrevYear(yr)
                          }
                          setVisitorSearch('')
                          setVisitorSearchOpen(false)
                        }}
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-indigo-50 text-left transition-colors"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-800">{v.name}</p>
                          <p className="text-xs text-slate-400">{[v.phone, v.email].filter(Boolean).join(' · ') || 'No contact info'}</p>
                        </div>
                        <span className="ml-3 shrink-0 text-xs font-medium text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                          {getVisitorYear(v)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {visitorSearchOpen && visitorSearch.trim().length > 0 && visitorSearchResults.length === 0 && (
                  <div className="absolute left-5 right-5 top-full mt-1 bg-white rounded-xl border border-slate-200 shadow-lg z-30 max-w-sm">
                    <p className="px-4 py-3 text-sm text-slate-400">No visitors found for "{visitorSearch}"</p>
                  </div>
                )}
              </div>
              {!loadingDelightVisitors && filteredDelightVisitors.length > 0 && (() => {
                const counts = { E: 0, M: 0, T: 0, other: 0 }
                const serviceToKey = { 'english': 'E', 'english service': 'E', 'sunday service': 'E', 'tamil service': 'T', 'malayalam service': 'M' }
                filteredDelightVisitors.forEach((v) => {
                  const raw = (v.serviceAttended || '').trim()
                  const mapped = serviceToKey[raw.toLowerCase()] || raw.toUpperCase()
                  if (counts[mapped] !== undefined) counts[mapped]++
                  else counts.other++
                })
                const pills = [
                  { key: 'E', label: 'English Service', color: 'bg-blue-50 text-blue-700 border-blue-200' },
                  { key: 'M', label: 'Malayalam',  color: 'bg-green-50 text-green-700 border-green-200' },
                  { key: 'T', label: 'Tamil',      color: 'bg-orange-50 text-orange-700 border-orange-200' },
                  { key: 'other', label: 'Other',  color: 'bg-slate-50 text-slate-600 border-slate-200' },
                ].filter((p) => counts[p.key] > 0)
                return (
                  <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-3">
                    <span className="text-xs font-medium text-slate-500">
                      {filteredDelightVisitors.length} visitor{filteredDelightVisitors.length !== 1 ? 's' : ''}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {pills.map((p) => (
                        <span key={p.key} className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${p.color}`}>
                          <span className="font-bold">{counts[p.key]}</span>
                          {p.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })()}
              {loadingDelightVisitors ? (
                <div className="px-5 py-8 text-center text-slate-500">Loading…</div>
              ) : filteredDelightVisitors.length === 0 ? (
                <div className="px-5 py-8 text-center text-slate-500">No visitor entries yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-6 py-3 font-semibold text-slate-700 text-base">Name</th>
                        <th className="text-left px-6 py-3 font-medium text-slate-500 w-28">Month</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDelightVisitors.map((v) => {
                        const monthPalette = ['bg-blue-50','bg-emerald-50','bg-amber-50','bg-violet-50','bg-rose-50','bg-teal-50','bg-orange-50','bg-cyan-50','bg-pink-50','bg-lime-50','bg-sky-50','bg-indigo-50']
                        const open = visitorMenuOpenId === v.id
                        const d = v.attendedDate ? new Date(v.attendedDate) : null
                        const rowBg = d ? monthPalette[d.getMonth()] : ''
                        const monthLabel = d ? d.toLocaleDateString('en-US', { month: 'short' }) : '—'
                        return (
                          <Fragment key={v.id}>
                            <tr
                              className={`cursor-pointer transition-colors border-b border-white/60 ${rowBg} ${open ? 'opacity-80' : 'hover:opacity-90'}`}
                              onClick={() => setVisitorMenuOpenId(open ? null : v.id)}
                            >
                              <td className="px-6 py-3 font-semibold text-base text-slate-900">{v.name || '—'}</td>
                              <td className="px-6 py-3 text-sm text-slate-400">{monthLabel}</td>
                            </tr>
                            {open && (
                              <tr className={rowBg}>
                                <td colSpan={2} className="px-6 py-3 border-b border-slate-200">
                                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-1.5 text-sm mb-3">
                                    {v.phone && <div><span className="text-slate-500">Phone: </span><span className="text-slate-800">{v.phone}</span></div>}
                                    {v.dob && <div><span className="text-slate-500">DOB: </span><span className="text-slate-800">{formatDMY(v.dob)}</span></div>}
                                    {v.email && <div><span className="text-slate-500">Email: </span><span className="text-slate-800">{v.email}</span></div>}
                                    {v.nativity && <div><span className="text-slate-500">Nativity: </span><span className="text-slate-800">{v.nativity}</span></div>}
                                    {v.currentPlace && <div><span className="text-slate-500">Current Place: </span><span className="text-slate-800">{v.currentPlace}</span></div>}
                                    {v.serviceAttended && <div><span className="text-slate-500">Service: </span><span className="text-slate-800">{fmtService(v.serviceAttended)}</span></div>}
                                    {v.attendedDate && <div><span className="text-slate-500">Date: </span><span className="text-slate-800">{formatDMY(v.attendedDate)}</span></div>}
                                    {(v.source || v.howKnown) && <div><span className="text-slate-500">How Known: </span><span className="text-slate-800">{v.source || v.howKnown}</span></div>}
                                  </div>
                                  {canEditDelightVisitors && (
                                    <div className="flex gap-3">
                                      <button type="button" onClick={(e) => { e.stopPropagation(); setVisitorMenuOpenId(null); setEditingDelightVisitorId(v.id); setDelightVisitorForm({ name: v.name || '', dob: v.dob ? String(v.dob).slice(0, 10) : '', phone: v.phone || '', email: v.email || '', nativity: v.nativity || '', currentPlace: v.currentPlace || '', serviceAttended: v.serviceAttended || '', attendedDate: v.attendedDate ? String(v.attendedDate).slice(0, 10) : '', howKnown: v.howKnown || '', source: v.source || '', year: getVisitorYear(v) }); setDelightVisitorModalOpen(true) }} className="text-xs font-medium text-blue-600 hover:underline">Edit</button>
                                      <button type="button" onClick={async (e) => { e.stopPropagation(); setVisitorMenuOpenId(null); if (!window.confirm('Delete this visitor entry?')) return; try { await deleteDelightVisitor(v.id); setDelightVisitors((prev) => prev.filter((x) => x.id !== v.id)) } catch (err) { console.error(err); alert('Failed to delete') } }} className="text-xs font-medium text-red-500 hover:underline">Delete</button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
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
                    <button type="submit" className="px-4 min-h-[44px] py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors">Save</button>
                    <button type="button" onClick={() => { setCaringMemberModalOpen(false); setEditingCaringId(null) }} className="px-4 min-h-[44px] py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 transition-colors">Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ── Paste-data modal ─────────────────────────────────────────── */}
          {pasteImportOpen && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
                <div className="p-5 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800">Paste Visitor Data</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Paste rows copied from Excel or a spreadsheet. Each row: Serial(optional), Name, DOB, Phone, Email, Nativity, Place, Service, Date Attended, How Known</p>
                  </div>
                  <button type="button" onClick={() => setPasteImportOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
                </div>
                <div className="p-5 flex-1 overflow-y-auto">
                  <textarea
                    autoFocus
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder="Paste your data here…"
                    className="w-full h-64 px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
                  <button type="button" onClick={() => setPasteImportOpen(false)} className="px-4 min-h-[44px] py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 hover:border-slate-300 active:bg-slate-100 transition-colors">Cancel</button>
                  <button
                    type="button"
                    disabled={!pasteText.trim()}
                    onClick={() => {
                      const lines = pasteText.trim().split(/\r?\n/)
                      const rows = lines.map((l) => l.split(/\t|,/).map((c) => c.trim().replace(/^["']|["']$/g, '')))
                      const parsed = parseVisitorRows(rows)
                      if (parsed.length === 0) {
                        alert('No valid rows found — make sure each row has at least a name.')
                        return
                      }
                      setPasteImportOpen(false)
                      setImportPreviewRows(parsed)
                      setImportPreviewOpen(true)
                    }}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:pointer-events-none"
                  >
                    Preview {pasteText.trim() ? `(${pasteText.trim().split(/\r?\n/).filter(Boolean).length} rows)` : ''}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Import preview / confirm modal ───────────────────────────── */}
          {importPreviewOpen && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl flex flex-col max-h-[90vh]">
                <div className="p-5 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800">Preview Import — {importPreviewRows.length} visitor{importPreviewRows.length !== 1 ? 's' : ''}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Review the parsed data below. Records will appear under the year matching their <strong>Date Attended</strong>.
                      {importPreviewRows.length > 0 && (() => {
                        const years = [...new Set(importPreviewRows.map((v) => v.year).filter(Boolean))].sort()
                        return years.length > 0 ? ` Years detected: ${years.join(', ')}.` : ''
                      })()}
                    </p>
                  </div>
                  <button type="button" onClick={() => setImportPreviewOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
                </div>
                <div className="flex-1 overflow-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        {['#', 'Name', 'DOB', 'Phone', 'Email', 'Nativity', 'Place', 'Service', 'Date Attended', 'How Known'].map((h) => (
                          <th key={h} className="text-left px-3 py-2 font-medium text-slate-500 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {importPreviewRows.map((v, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                          <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">{v.name}</td>
                          <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{v.dob ? formatDMY(v.dob) : <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{v.phone || <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2 text-slate-600">{v.email || <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{v.nativity || <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{v.currentPlace || <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2 text-slate-600">{v.serviceAttended ? fmtService(v.serviceAttended) : <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{v.attendedDate ? formatDMY(v.attendedDate) : <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2 text-slate-600">{v.howKnown || <span className="text-slate-300">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
                  <button type="button" onClick={() => setImportPreviewOpen(false)} className="px-4 min-h-[44px] py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 hover:border-slate-300 active:bg-slate-100 transition-colors">Cancel</button>
                  <button
                    type="button"
                    onClick={async () => {
                      const rowsToSave = importPreviewRows
                      setImportPreviewOpen(false)
                      setImportPreviewRows([])
                      setImportingVisitors(true)
                      try {
                        for (const v of rowsToSave) await addDelightVisitor(v)
                        const freshList = await getDelightVisitors()
                        setDelightVisitors(freshList)
                        // Navigate to the year that most imported records belong to
                        const years = rowsToSave.map((v) => v.year).filter(Boolean)
                        if (years.length > 0) {
                          const counts = {}
                          years.forEach((y) => { counts[y] = (counts[y] || 0) + 1 })
                          const dominantYear = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0])
                          if (dominantYear === VISITOR_CURRENT_YEAR) {
                            setVisitorSubPage('current')
                          } else {
                            setVisitorSubPage('previous')
                            setVisitorPrevYear(dominantYear)
                          }
                        }
                        setImportVisitorResult({ message: `✓ Imported ${rowsToSave.length} visitor${rowsToSave.length !== 1 ? 's' : ''}` })
                        setTimeout(() => setImportVisitorResult(null), 5000)
                      } catch (err) {
                        console.error(err)
                        setImportVisitorResult({ error: true, message: 'Save failed — check your connection.' })
                        setTimeout(() => setImportVisitorResult(null), 5000)
                      } finally {
                        setImportingVisitors(false)
                      }
                    }}
                    className="px-5 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                  >
                    Save {importPreviewRows.length} visitor{importPreviewRows.length !== 1 ? 's' : ''}
                  </button>
                </div>
              </div>
            </div>
          )}

          {delightVisitorModalOpen && (
            <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 sm:p-4">
              <div className="bg-slate-50 sm:rounded-2xl rounded-t-2xl shadow-2xl w-full sm:max-w-lg max-h-[92vh] flex flex-col">
                <div className="sm:hidden flex justify-center pt-3 pb-0 flex-shrink-0">
                  <div className="w-10 h-1 rounded-full bg-slate-300" />
                </div>
                <div className="flex items-center justify-between px-5 py-4 bg-white sm:rounded-t-2xl border-b border-slate-200 flex-shrink-0">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">{editingDelightVisitorId ? 'Edit Visitor' : 'Add Visitor'}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Fill in the visitor's details below</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setDelightVisitorModalOpen(false); setEditingDelightVisitorId(null) }}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors text-lg"
                  >✕</button>
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    if (!canEditDelightVisitors) return
                    try {
                      if (editingDelightVisitorId) {
                        const before = delightVisitors.find((x) => x.id === editingDelightVisitorId) || null
                        await updateDelightVisitor(editingDelightVisitorId, delightVisitorForm)
                        updateCellMembersByVisitorId(editingDelightVisitorId, { name: delightVisitorForm.name, phone: delightVisitorForm.phone, birthday: delightVisitorForm.dob }).catch(() => {})
                        updatePCSEntriesByVisitorId(editingDelightVisitorId, { name: delightVisitorForm.name, phone: delightVisitorForm.phone }).catch(() => {})
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
                  className="p-4 space-y-3 overflow-y-auto flex-1"
                >
                  {/* Personal Info card */}
                  <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
                    <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wider">Personal Info</p>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Name <span className="text-red-400">*</span></label>
                      <input
                        required
                        type="text"
                        placeholder="Full name"
                        value={delightVisitorForm.name}
                        onChange={(e) => setDelightVisitorForm((f) => ({ ...f, name: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-colors text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Date of Birth</label>
                      <DateSelect
                        value={delightVisitorForm.dob}
                        onChange={val => setDelightVisitorForm(f => ({ ...f, dob: val }))}
                        minYear={1940}
                        maxYear={VISITOR_CURRENT_YEAR}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone</label>
                      <div className="flex rounded-xl border border-slate-200 bg-slate-50 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-200 focus-within:border-indigo-400 transition-colors overflow-hidden">
                        <input
                          type="text"
                          placeholder="+91"
                          value={(() => { const m = (delightVisitorForm.phone || '').match(/^(\+\d{1,4})\s*/); return m ? m[1] : '' })()}
                          onChange={(e) => { const num = (delightVisitorForm.phone || '').replace(/^\+\d{1,4}\s*/, ''); setDelightVisitorForm((f) => ({ ...f, phone: (e.target.value + ' ' + num).trim() })) }}
                          className="w-16 px-2 py-2.5 text-sm text-center bg-transparent border-r border-slate-200 focus:outline-none"
                        />
                        <input
                          type="tel"
                          placeholder="phone number"
                          value={(() => { const m = (delightVisitorForm.phone || '').match(/^\+\d{1,4}\s*(.*)/); return m ? m[1] : (delightVisitorForm.phone || '') })()}
                          onChange={(e) => { const code = ((delightVisitorForm.phone || '').match(/^(\+\d{1,4})/) || ['', ''])[1]; setDelightVisitorForm((f) => ({ ...f, phone: code ? (code + ' ' + e.target.value).trim() : e.target.value })) }}
                          className="flex-1 px-3 py-2.5 text-sm focus:outline-none bg-transparent"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                        <input
                          type="email"
                          placeholder="email@example.com"
                          value={delightVisitorForm.email}
                          onChange={(e) => setDelightVisitorForm((f) => ({ ...f, email: e.target.value }))}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-colors text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Nativity</label>
                        <input
                          type="text"
                          placeholder="Hometown"
                          value={delightVisitorForm.nativity}
                          onChange={(e) => setDelightVisitorForm((f) => ({ ...f, nativity: e.target.value }))}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-colors text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Visit Details card */}
                  <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
                    <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wider">Visit Details</p>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Current Place</label>
                      <input
                        type="text"
                        placeholder="City / Area"
                        value={delightVisitorForm.currentPlace}
                        onChange={(e) => setDelightVisitorForm((f) => ({ ...f, currentPlace: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-colors text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Date of Attending <span className="text-red-400">*</span></label>
                      <DateSelect
                        value={delightVisitorForm.attendedDate}
                        onChange={val => {
                          const yr = val ? new Date(val).getFullYear() : null
                          setDelightVisitorForm(f => ({ ...f, attendedDate: val, ...(yr && yr >= VISITOR_START_YEAR ? { year: yr } : {}) }))
                        }}
                        minYear={VISITOR_START_YEAR}
                        maxYear={VISITOR_CURRENT_YEAR}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Service Attended</label>
                        <select
                          value={delightVisitorForm.serviceAttended}
                          onChange={(e) => setDelightVisitorForm((f) => ({ ...f, serviceAttended: e.target.value }))}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-colors text-sm"
                        >
                          <option value="">— Select —</option>
                          <option value="English Service">English Service</option>
                          <option value="Tamil Service">Tamil Service</option>
                          <option value="Youth Service">Youth Service</option>
                          <option value="Cell Group">Cell Group</option>
                          <option value="Special Meeting">Special Meeting</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">How did they find us?</label>
                        <select
                          value={delightVisitorForm.source || ''}
                          onChange={(e) => setDelightVisitorForm((f) => ({ ...f, source: e.target.value }))}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-colors text-sm"
                        >
                          <option value="">— Select —</option>
                          <option value="Friend">Friend</option>
                          <option value="Family">Family</option>
                          <option value="Social Media">Social Media</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Year</label>
                        <select
                          value={delightVisitorForm.year || ''}
                          onChange={(e) => setDelightVisitorForm((f) => ({ ...f, year: Number(e.target.value) }))}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-colors text-sm"
                        >
                          {Array.from({ length: VISITOR_CURRENT_YEAR - VISITOR_START_YEAR + 1 }, (_, i) => VISITOR_CURRENT_YEAR - i).map((yr) => (
                            <option key={yr} value={yr}>{yr}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-1 pb-2">
                    <button type="submit" className="flex-1 py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm">
                      {editingDelightVisitorId ? 'Update Visitor' : 'Add Visitor'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDelightVisitorModalOpen(false); setEditingDelightVisitorId(null) }}
                      className="px-5 py-3 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'operations' && slug === 'caring' && (
            <SundayOperationsToggle value={opsSubTab} onChange={setOpsSubTab} />
          )}

          {activeTab === 'operations' && slug === 'sunday-ministry' && (
            <SundayOperationsToggle value={opsSubTab} onChange={setOpsSubTab} />
          )}

          {activeTab === 'upcomingSunday' && ['media', 'worship', 'd-light', 'administration'].includes(slug) && (
            <UpcomingSunday slug={slug} />
          )}


          {activeTab === 'operations' && slug === 'media' && (
            <MediaOperationsToggle value={opsSubTab} onChange={setOpsSubTab} />
          )}

          {activeTab === 'operations' && slug === 'river-kids' && (
            <RiverKidsOperationsToggle value={opsSubTab} onChange={setOpsSubTab} />
          )}

          {activeTab === 'operations' && slug === 'administration' && (
            <AdministrationOperationsToggle value={opsSubTab} onChange={setOpsSubTab} />
          )}

          {activeTab === 'operations' && slug === 'accounts' && (
            <AccountsOperationsToggle value={opsSubTab} onChange={setOpsSubTab} />
          )}

          {activeTab === 'operations' && slug === 'd-light' && (
            <DLightOperationsToggle value={opsSubTab} onChange={setOpsSubTab} />
          )}

          {activeTab === 'operations' && slug === 'worship' && (
            <WorshipOperationsToggle value={opsSubTab} onChange={setOpsSubTab} />
          )}

          {activeTab === 'operations' && opsSubTab === 'expense' && department?.name && (
            <DeptExpenseTab department={department.name} />
          )}

          {activeTab === 'operations' && slug === 'accounts' && opsSubTab === 'addDepartments' && (
            <AddDepartmentsPage />
          )}

          {(activeTab === 'planning' || ((slug === 'cell' || slug === 'sunday-ministry' || slug === 'media' || slug === 'river-kids' || slug === 'administration' || slug === 'caring' || slug === 'd-light') && activeTab === 'operations' && opsSubTab === 'planning')) && (
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
                      <button type="submit" className="px-4 min-h-[44px] py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors">Add Back to the Bible</button>
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

              {/* Director Board Meeting Presentation Points */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-slate-800">Director Board Meeting</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Presentation points for the board meeting</p>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingBoardPointId(null)
                        setBoardPointForm({ slNo: '', point: '', timeNeeded: '', meetingDate: format(new Date(), 'yyyy-MM-dd') })
                        setBoardPointModalOpen(true)
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
                    >
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                      Add Point
                    </button>
                  )}
                </div>

                {loadingBoardPoints ? (
                  <div className="py-8 text-center text-slate-400 text-sm">Loading…</div>
                ) : boardPoints.length === 0 ? (
                  <div className="py-10 text-center text-slate-400 text-sm">
                    No presentation points yet. Click "Add Point" to get started.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {boardPoints.map((bp, idx) => (
                      <div key={bp.id} className="flex items-start gap-3 px-5 py-4 hover:bg-slate-50 transition-colors group">
                        <span className="text-xs font-medium text-slate-400 w-5 flex-shrink-0 pt-0.5 text-right">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-800 leading-relaxed">{bp.point}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            {bp.meetingDate && (
                              <p className="text-xs text-slate-400">Meeting: {formatDMY(bp.meetingDate)}</p>
                            )}
                            {bp.allottedTime && (
                              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                Allotted: {bp.allottedTime}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${bp.status === 'presented' ? 'bg-emerald-100 text-emerald-700' : bp.allottedTime ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                            {bp.status === 'presented' ? 'Presented' : bp.allottedTime ? 'Scheduled' : 'Pending'}
                          </span>
                          {canEdit && (
                            <div className="opacity-0 group-hover:opacity-100 flex gap-2 transition-opacity">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingBoardPointId(bp.id)
                                  setBoardPointForm({ slNo: bp.slNo || '', point: bp.point, timeNeeded: bp.timeNeeded || '', meetingDate: bp.meetingDate || '' })
                                  setBoardPointModalOpen(true)
                                }}
                                className="text-xs text-blue-600 hover:underline"
                              >Edit</button>
                              <button
                                type="button"
                                onClick={async () => {
                                  const newStatus = bp.status === 'presented' ? 'pending' : 'presented'
                                  await updateBoardPoint(bp.id, { status: newStatus })
                                  setBoardPoints(prev => prev.map(p => p.id === bp.id ? { ...p, status: newStatus } : p))
                                }}
                                className="text-xs text-emerald-600 hover:underline"
                              >{bp.status === 'presented' ? 'Mark Pending' : 'Mark Presented'}</button>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!window.confirm('Delete this point?')) return
                                  await deleteBoardPoint(bp.id)
                                  setBoardPoints(prev => prev.filter(p => p.id !== bp.id))
                                }}
                                className="text-xs text-red-500 hover:underline"
                              >Delete</button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add/Edit board point modal */}
              {boardPointModalOpen && (
                <>
                  <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setBoardPointModalOpen(false)} />
                  <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={() => setBoardPointModalOpen(false)}>
                    <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="font-semibold text-slate-800">{editingBoardPointId ? 'Edit Point' : 'Add Presentation Point'}</h3>
                        <button type="button" onClick={() => setBoardPointModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 text-xl">×</button>
                      </div>
                      <div className="px-5 py-4 space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Presentation Point *</label>
                          <textarea
                            value={boardPointForm.point}
                            onChange={e => setBoardPointForm(f => ({ ...f, point: e.target.value }))}
                            placeholder="Describe the point to present at the board meeting…"
                            rows={4}
                            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Meeting Date</label>
                          <input
                            type="date"
                            value={boardPointForm.meetingDate}
                            onChange={e => setBoardPointForm(f => ({ ...f, meetingDate: e.target.value }))}
                            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                          />
                        </div>
                      </div>
                      <div className="px-5 pb-5">
                        <button
                          type="button"
                          disabled={!boardPointForm.point.trim()}
                          onClick={async () => {
                            if (!boardPointForm.point.trim()) return
                            if (editingBoardPointId) {
                              await updateBoardPoint(editingBoardPointId, { point: boardPointForm.point.trim(), meetingDate: boardPointForm.meetingDate })
                              setBoardPoints(prev => prev.map(p => p.id === editingBoardPointId ? { ...p, point: boardPointForm.point.trim(), meetingDate: boardPointForm.meetingDate } : p))
                            } else {
                              const id = await addBoardPoint({ department: department.name, slNo: boardPointForm.slNo, point: boardPointForm.point.trim(), timeNeeded: boardPointForm.timeNeeded, meetingDate: boardPointForm.meetingDate, createdBy: userProfile?.email || 'unknown' })
                              if (id) setBoardPoints(prev => [...prev, { id, department: department.name, slNo: boardPointForm.slNo, point: boardPointForm.point.trim(), timeNeeded: boardPointForm.timeNeeded, meetingDate: boardPointForm.meetingDate, status: 'pending', allottedTime: '', createdAt: new Date(), createdBy: userProfile?.email || '' }])
                            }
                            setBoardPointModalOpen(false)
                            setEditingBoardPointId(null)
                            setBoardPointForm({ slNo: '', point: '', timeNeeded: '', meetingDate: '' })
                          }}
                          className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                        >
                          {editingBoardPointId ? 'Save Changes' : 'Add Point'}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
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
                      className="px-4 min-h-[44px] py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
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
                    {planningDraftStatus ? (
                      <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
                        {planningDraftStatus}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2 items-center">
                      <button
                        type="button"
                        onClick={handleSavePlanningDraft}
                        disabled={savingPlanningDraft || savingPlanning}
                        className="px-4 py-2 rounded-lg bg-white text-slate-800 text-sm font-medium border border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {savingPlanningDraft ? 'Saving draft…' : 'Save Draft'}
                      </button>
                    <button
                      type="submit"
                      disabled={savingPlanning}
                      className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                      {savingPlanning ? 'Saving...' : 'Save planning'}
                    </button>
                    </div>
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

          {usesGenericSubDepartmentCollection(slug) && (activeTab === 'subDepartment' || ((slug === 'sunday-ministry' || slug === 'media' || slug === 'river-kids' || slug === 'administration' || slug === 'accounts' || slug === 'caring') && activeTab === 'operations' && opsSubTab === 'subDepartment')) && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex justify-end items-center">
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSubDept(null)
                      setSubDeptForm({ name: '', servingArea: '' })
                      setGenericSubDeptModalOpen(true)
                    }}
                    className="px-4 min-h-[44px] py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
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
                        <th className="text-left px-4 py-3 font-medium text-slate-600">Sub Department</th>
                        {canEdit && <th className="text-left px-4 py-3 font-medium text-slate-600 w-28">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {subDepartments.map((row) => (
                        <tr key={row.id}>
                          <td className="px-4 py-3 text-slate-800 font-medium">{row.name || '—'}</td>
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
                          <td colSpan={canEdit ? 2 : 1} className="px-4 py-8 text-center text-slate-500">
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
                    <label className="block text-sm font-medium text-slate-700 mb-1">Sub Department *</label>
                    <input
                      type="text"
                      value={subDeptForm.name}
                      onChange={(e) => setSubDeptForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300"
                      required
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="submit" className="px-4 min-h-[44px] py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors">
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGenericSubDeptModalOpen(false)
                        setEditingSubDept(null)
                        setSubDeptForm({ name: '', servingArea: '' })
                      }}
                      className="px-4 min-h-[44px] py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {slug === 'd-light' && (activeTab === 'subDepartment' || (activeTab === 'operations' && opsSubTab === 'subDepartment')) && (
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
                    className="px-4 min-h-[44px] py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
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
                    <button type="submit" className="px-4 min-h-[44px] py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors">
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setDlightSubDeptModalOpen(false)}
                      className="px-4 min-h-[44px] py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'pcs' && slug === 'caring' && (() => {
            const pcsYears = [...new Set(pcsEntries.map(e => e.year).filter(Boolean))].sort((a, b) => b - a)
            const noYearEntries = pcsEntries.filter(e => !e.year)
            const grouped = [
              ...pcsYears.map(yr => ({ year: yr, entries: pcsEntries.filter(e => e.year === yr) })),
              ...(noYearEntries.length ? [{ year: null, entries: noYearEntries }] : []),
            ]

            const handleChipClick = (entry) => {
              if (pcsExpandedId === entry.id) {
                setPcsExpandedId(null); setPcsExpandedVisitor(null); setPcsExpandedProfile(null); setPcsExpandedContext(null); setPcsExpandedForm({})
                setPcsPhotoFile(null); setPcsPhotoPreview(null)
                return
              }
              setPcsExpandedId(entry.id)
              setPcsExpandedVisitor(null); setPcsExpandedProfile(null); setPcsExpandedContext(null)
              setPcsPhotoFile(null); setPcsPhotoPreview(null)
              setPcsExpandedForm({
                name: entry.name || '', phone: entry.phone || '', attendedDate: entry.attendedDate || '',
                membershipNumber: entry.membershipNumber || '', leadershipPosition: entry.leadershipPosition || '',
                year: entry.year || '', email: entry.email || '', dob: entry.dob || '', nativity: entry.nativity || '',
                currentPlace: entry.currentPlace || '', serviceAttended: entry.serviceAttended || '', howKnown: entry.howKnown || '',
                baptised: '', baptismDate: '', baptismPlace: '', baptismChurch: '', baptismChurchIsOther: false,
                maritalStatus: '', marriageDate: '', spouseName: '', spouseVisitorId: '',
                membershipStatus: '', membershipDocs: [], permanentAddress: '', photoUrl: '',
              })
              if (entry.visitorId) {
                setPcsExpandedLoading(true)
                Promise.all([
                  getDelightVisitorById(entry.visitorId),
                  getMemberProfileWithContext(entry.visitorId),
                ]).then(([v, ctx]) => {
                  if (v) {
                    setPcsExpandedVisitor(v)
                    setPcsExpandedForm(f => ({ ...f, email: v.email || '', dob: v.dob || '', nativity: v.nativity || '', currentPlace: v.currentPlace || '', serviceAttended: v.serviceAttended || '', howKnown: v.howKnown || '' }))
                  }
                  if (ctx) {
                    setPcsExpandedProfile(ctx.profile)
                    setPcsExpandedContext(ctx)
                    const p = ctx.profile || {}
                    setPcsExpandedForm(f => ({
                      ...f,
                      baptised: p.baptised || '',
                      baptismDate: p.baptismDate || '', baptismPlace: p.baptismPlace || '',
                      baptismChurch: p.baptismChurch || '',
                      baptismChurchIsOther: !!p.baptismChurch && p.baptismChurch !== 'River Of Life Christian Church',
                      maritalStatus: p.maritalStatus || '',
                      marriageDate: p.marriageDate || '', spouseName: p.spouseName || '', spouseVisitorId: p.spouseVisitorId || '',
                      membershipStatus: p.membershipStatus || '',
                      membershipDocs: p.membershipDocs || [],
                      permanentAddress: p.permanentAddress || '',
                      photoUrl: p.photoUrl || '',
                    }))
                    if (p.photoUrl) setPcsPhotoPreview(p.photoUrl)
                  }
                }).catch(() => {}).finally(() => setPcsExpandedLoading(false))
              }
            }

            const cellVisitorIds = new Set(allCellMembers.filter(m => m.status !== 'inactive' && m.visitorId).map(m => m.visitorId))

            const handleRemoveFromPCS = async (entry) => {
              if (!window.confirm(`Remove ${entry.name} from PCS?`)) return
              try {
                await deactivatePCSEntry(entry.id, userProfile?.email || '')
                setPcsEntries(prev => prev.filter(e => e.id !== entry.id))
                setPcsInactiveEntries(prev => [{ ...entry, status: 'inactive', removedAt: new Date(), removedBy: userProfile?.email || '' }, ...prev])
                if (pcsExpandedId === entry.id) setPcsExpandedId(null)
              } catch { alert('Failed to remove. Please try again.') }
              setPcsMenuOpenId(null)
            }

            const Chip = ({ entry }) => {
              const hasMember = !!entry.membershipNumber
              const hasLeadership = !!entry.leadershipPosition
              const isExpanded = pcsExpandedId === entry.id
              const isInCell = !!(entry.visitorId && cellVisitorIds.has(entry.visitorId))
              const menuOpen = pcsMenuOpenId === entry.id
              return (
                <div className="relative">
                  {menuOpen && (
                    <div className="fixed inset-0 z-10" onClick={() => setPcsMenuOpenId(null)} />
                  )}
                  <div
                    className={`flex items-center gap-2 rounded-2xl pl-2 pr-1 py-2 border transition-all cursor-pointer
                      ${isExpanded
                        ? 'bg-indigo-600 border-indigo-600 shadow-md'
                        : hasMember
                          ? 'bg-amber-50 border-amber-200 hover:bg-amber-100 hover:border-amber-300'
                          : 'bg-blue-50 border-blue-200 hover:bg-blue-100 hover:border-blue-300'}`}
                    onClick={() => handleChipClick(entry)}
                  >
                    <div className="relative flex-shrink-0">
                      <div className={`w-8 h-8 rounded-full text-white text-sm font-bold flex items-center justify-center
                        ${isExpanded ? 'bg-white/25' : hasMember ? 'bg-amber-500' : 'bg-blue-500'}`}>
                        {entry.name.charAt(0).toUpperCase()}
                      </div>
                      {isInCell && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" title="In a cell group" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className={`text-sm font-semibold leading-tight truncate max-w-[110px] ${isExpanded ? 'text-white' : hasMember ? 'text-amber-900' : 'text-blue-900'}`}>
                          {entry.name}
                        </p>
                        {hasLeadership && (
                          <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none whitespace-nowrap ${isExpanded ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                            {entry.leadershipPosition}
                          </span>
                        )}
                      </div>
                      {hasMember
                        ? <p className={`text-xs font-medium leading-tight ${isExpanded ? 'text-indigo-200' : 'text-amber-600'}`}>#{entry.membershipNumber}</p>
                        : <p className={`text-xs leading-tight ${isExpanded ? 'text-indigo-300' : 'text-blue-400'}`}>No member #</p>
                      }
                    </div>
                    {/* Three-dots menu button */}
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setPcsMenuOpenId(menuOpen ? null : entry.id) }}
                      className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full transition-colors ${
                        isExpanded ? 'text-white/70 hover:bg-white/20' : 'text-slate-400 hover:bg-slate-200/70'
                      }`}
                      title="More options"
                    >
                      <svg width="14" height="14" viewBox="0 0 4 16" fill="currentColor">
                        <circle cx="2" cy="2" r="1.5"/>
                        <circle cx="2" cy="8" r="1.5"/>
                        <circle cx="2" cy="14" r="1.5"/>
                      </svg>
                    </button>
                  </div>
                  {/* Dropdown menu */}
                  {menuOpen && (
                    <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-xl border border-slate-200 shadow-lg py-1 min-w-[160px]">
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); handleRemoveFromPCS(entry) }}
                        className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 font-medium flex items-center gap-2"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                        </svg>
                        Remove from PCS
                      </button>
                    </div>
                  )}
                </div>
              )
            }

            // Inline expanded profile panel
            const PCSInlineProfile = ({ entry }) => {
              const f = pcsExpandedForm
              const setF = setPcsExpandedForm
              const inp = 'w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 transition-colors'
              const fld = (label, key, type = 'text', placeholder = '') => (
                <div className="space-y-0.5">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
                  <input type={type} placeholder={placeholder} value={f[key] || ''} onChange={e => setF(p => ({ ...p, [key]: e.target.value }))} className={inp} />
                </div>
              )
              const ctx = pcsExpandedContext
              const deptTeams = ctx?.deptTeams || []
              const worshipTeams = ctx?.worshipTeams || []

              // Church duration
              const joinDate = entry.attendedDate ? new Date(entry.attendedDate) : null
              const churchDuration = (() => {
                if (!joinDate) return null
                const now = new Date()
                const totalMonths = (now.getFullYear() - joinDate.getFullYear()) * 12 + (now.getMonth() - joinDate.getMonth())
                const y = Math.floor(totalMonths / 12), m = totalMonths % 12
                return [y > 0 ? `${y} yr${y > 1 ? 's' : ''}` : '', m > 0 ? `${m} mo` : ''].filter(Boolean).join(' ') || 'Less than a month'
              })()

              // Ministry duration helper
              const miniDur = (from, to) => {
                if (!from) return ''
                const s = new Date(from), e = to ? new Date(to) : new Date()
                const tot = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
                const y = Math.floor(tot / 12), m = tot % 12
                return [y > 0 ? `${y}y` : '', m > 0 ? `${m}m` : ''].filter(Boolean).join(' ') || '<1m'
              }

              // Auto-detected ministry entries (read-only, from system records)
              const autoMinistry = [
                ...deptTeams.map(t => ({ id: `dept-${t.id}`, ministry: t.department, role: t.rolePosition || t.role || '', from: t.since || '', to: '', isAuto: true })),
                ...worshipTeams.map(t => ({ id: `wor-${t.id}`, ministry: 'Worship', role: t.positions?.[0] || '', from: t.since || '', to: '', isAuto: true })),
              ]

              // Membership docs
              const membershipDocs = f.membershipDocs || []
              const addDocRow = () => setF(p => ({ ...p, membershipDocs: [...(p.membershipDocs || []), { id: Date.now().toString(), type: '', number: '' }] }))
              const updateDocRow = (id, field, val) => setF(p => ({ ...p, membershipDocs: (p.membershipDocs || []).map(r => r.id === id ? { ...r, [field]: val } : r) }))
              const removeDocRow = (id) => setF(p => ({ ...p, membershipDocs: (p.membershipDocs || []).filter(r => r.id !== id) }))

              const sectionHead = (label, color = 'text-slate-600') => (
                <p className={`text-sm font-bold tracking-tight ${color}`}>{label}</p>
              )

              // ── Fill-percentage helpers ──────────────────────────────────────
              const countFilled = (keys) => keys.filter(k => {
                const v = f[k]; return v !== '' && v !== null && v !== undefined && v !== false
              }).length

              const s1Keys = ['name','phone','email','dob','nativity','currentPlace','serviceAttended','howKnown','attendedDate']
              const s1Fill = countFilled(s1Keys) / s1Keys.length

              const s2Checks = [autoMinistry.length > 0]
              const s2Fill = s2Checks.filter(Boolean).length / s2Checks.length

              const s3BaseKeys = ['baptised', 'maritalStatus']
              const s3BaptismKeys = f.baptised === 'yes' ? ['baptismDate','baptismPlace','baptismChurch'] : []
              const s3MarriageKeys = f.maritalStatus === 'Married' ? ['marriageDate','spouseName'] : []
              const s3AllKeys = [...s3BaseKeys, ...s3BaptismKeys, ...s3MarriageKeys]
              const s3Fill = countFilled(s3AllKeys) / s3AllKeys.length

              const s4Checks = f.membershipStatus ? [!!f.membershipNumber, !!f.permanentAddress, membershipDocs.length > 0] : []
              const s4Fill = s4Checks.length > 0 ? s4Checks.filter(Boolean).length / s4Checks.length : 0

              // Overall = average of all 4 sections
              const overallFill = (s1Fill + s3Fill) / 2

              // Colour scale: 0=slate, 1-49=red, 50-99=amber, 100=emerald
              const dotCls = (p) => p === 0 ? 'bg-slate-300' : p < 0.5 ? 'bg-red-400' : p < 1 ? 'bg-amber-400' : 'bg-emerald-500'
              const barCls = (p) => p === 0 ? 'bg-slate-200' : p < 0.5 ? 'bg-red-400' : p < 1 ? 'bg-amber-400' : 'bg-emerald-500'
              const pctCls = (p) => p === 0 ? 'text-slate-400' : p < 0.5 ? 'text-red-500' : p < 1 ? 'text-amber-500' : 'text-emerald-600'
              const pctStr = (p) => `${Math.round(p * 100)}%`

              const SecHeader = ({ label, fill, labelColor, headerBg, extra }) => (
                <div className={`-mx-4 -mt-3 mb-4 px-4 py-3 flex items-center gap-3 ${headerBg}`}>
                  <span className={`w-3 h-3 rounded-full flex-shrink-0 transition-colors duration-300 ${dotCls(fill)}`} />
                  <p className={`text-sm font-bold tracking-tight ${labelColor}`}>{label}</p>
                  {extra}
                </div>
              )

              return (
                <div className="border-t-2 border-indigo-500 bg-slate-50 px-2 py-3 sm:px-4 sm:py-4">
                  {pcsExpandedLoading && (
                    <p className="text-xs text-slate-400 text-center py-6">Loading profile…</p>
                  )}

                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">

                    {/* ═══ Identity header ═══ */}
                    <div className="px-4 py-3 flex items-start gap-3 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-slate-50">
                      {/* Photo */}
                      <div className="relative flex-shrink-0">
                        {pcsPhotoPreview
                          ? <img src={pcsPhotoPreview} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-indigo-200 shadow" />
                          : <div className={`w-14 h-14 rounded-full text-white text-lg font-bold flex items-center justify-center shadow ${f.membershipNumber ? 'bg-amber-500' : 'bg-indigo-500'}`}>
                              {(f.name || '?')[0].toUpperCase()}
                            </div>
                        }
                        {/* Camera capture button — only for members */}
                        {!!f.membershipNumber && (
                          <label title="Take member photo" className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center cursor-pointer shadow transition-colors">
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M1 5a2 2 0 0 1 2-2h1.172a2 2 0 0 0 1.414-.586l.828-.828A2 2 0 0 1 7.828 1h.344a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 11.828 3H13a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V5zm7 6a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" fill="currentColor"/></svg>
                            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => {
                              const file = e.target.files?.[0]; if (!file) return
                              setPcsPhotoFile(file)
                              setPcsPhotoPreview(URL.createObjectURL(file))
                            }} />
                          </label>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-slate-800">{f.name || '—'}</p>
                          {f.membershipNumber && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Member #{f.membershipNumber}</span>}
                          {f.leadershipPosition && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{f.leadershipPosition}</span>}
                          {churchDuration && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600">{churchDuration} in church</span>}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{[f.phone, f.email].filter(Boolean).join(' · ') || 'No contact info'}</p>
                        {/* Overall completeness bar */}
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-500 ${barCls(overallFill)}`} style={{ width: `${Math.round(overallFill * 100)}%` }} />
                          </div>
                          <span className={`text-[10px] font-bold tabular-nums whitespace-nowrap ${pctCls(overallFill)}`}>{pctStr(overallFill)} complete</span>
                        </div>
                        {/* Upload from gallery — only for members */}
                        {!!f.membershipNumber && (
                          <label className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-amber-600 cursor-pointer hover:text-amber-800">
                            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 1.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 2.707V11.5a.5.5 0 0 1-1 0V2.707L5.354 4.854a.5.5 0 1 1-.708-.708l3-3z"/></svg>
                            Upload member photo
                            <input type="file" accept="image/*" className="hidden" onChange={e => {
                              const file = e.target.files?.[0]; if (!file) return
                              setPcsPhotoFile(file)
                              setPcsPhotoPreview(URL.createObjectURL(file))
                            }} />
                          </label>
                        )}
                      </div>
                    </div>

                    {/* ═══ SECTION 1 · Visitor Data ═══ */}
                    <div className="px-4 py-3 border-b border-slate-100 border-l-4 border-l-blue-300">
                      <SecHeader label="Visitor Data" fill={s1Fill} labelColor="text-blue-700" headerBg="bg-blue-50 border-b border-blue-100" />
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {fld('Name', 'name')}
                        {/* Phone — country code + number */}
                        {(() => {
                          const CODES = [
                            { code: '+91',  label: '🇮🇳 +91'  },
                            { code: '+971', label: '🇦🇪 +971' },
                            { code: '+1',   label: '🇺🇸 +1'   },
                            { code: '+44',  label: '🇬🇧 +44'  },
                            { code: '+61',  label: '🇦🇺 +61'  },
                            { code: '+65',  label: '🇸🇬 +65'  },
                            { code: '+60',  label: '🇲🇾 +60'  },
                            { code: '+966', label: '🇸🇦 +966' },
                            { code: '+974', label: '🇶🇦 +974' },
                            { code: '+965', label: '🇰🇼 +965' },
                            { code: '+973', label: '🇧🇭 +973' },
                            { code: '+64',  label: '🇳🇿 +64'  },
                            { code: '+49',  label: '🇩🇪 +49'  },
                          ]
                          const parsePhone = (val) => {
                            const v = (val || '').trim()
                            for (const { code } of CODES) {
                              if (v.startsWith(code + ' ')) return { code, number: v.slice(code.length + 1) }
                              if (v.startsWith(code) && v.length > code.length) return { code, number: v.slice(code.length) }
                            }
                            return { code: '+91', number: v }
                          }
                          const { code: cc, number: num } = parsePhone(f.phone)
                          return (
                            <div className="space-y-0.5">
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Phone</p>
                              <div className="flex gap-1">
                                <select
                                  value={cc}
                                  onChange={e => setF(p => ({ ...p, phone: e.target.value + ' ' + num }))}
                                  className="px-1.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200 flex-shrink-0"
                                >
                                  {CODES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                                </select>
                                <input
                                  type="tel"
                                  placeholder="Number"
                                  value={num}
                                  onChange={e => setF(p => ({ ...p, phone: cc + ' ' + e.target.value }))}
                                  className={`${inp} flex-1 min-w-0`}
                                />
                              </div>
                            </div>
                          )
                        })()}
                        {fld('Email', 'email', 'email')}
                        {fld('Date of Birth', 'dob', 'date')}
                        {fld('Nativity / Hometown', 'nativity')}
                        {fld('Current Place', 'currentPlace')}
                        {fld('Service Attended', 'serviceAttended')}
                        {fld('How Known / Referred by', 'howKnown')}
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">First Visit Date</p>
                          <input type="date" value={f.attendedDate || ''} onChange={e => { const val = e.target.value; const yr = val ? new Date(val).getFullYear() : null; setF(p => ({ ...p, attendedDate: val, ...(yr && yr >= VISITOR_START_YEAR ? { year: yr } : {}) })) }} className={inp} />
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Year</p>
                          <div className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500">
                            {f.year || (f.attendedDate ? new Date(f.attendedDate).getFullYear() : '—')}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* ═══ SECTION 2 · Church Journey ═══ */}
                    <div className="px-4 py-3 border-b border-slate-100 border-l-4 border-l-emerald-300">
                      <div className="-mx-4 -mt-3 mb-4 px-4 py-3 flex items-center gap-3 bg-emerald-50 border-b border-emerald-100">
                        <span className={`w-3 h-3 rounded-full flex-shrink-0 transition-colors duration-300 ${dotCls(s2Fill)}`} />
                        <p className="text-sm font-bold tracking-tight text-emerald-700">Church Journey</p>
                        {churchDuration && <span className="text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">{churchDuration}</span>}
                      </div>

                      {/* Cell connection */}
                      {(() => {
                        const cellMember = entry.visitorId ? allCellMembers.find(m => m.visitorId === entry.visitorId && m.status !== 'inactive') : null
                        const cg = cellMember ? cellGroups.find(g => g.id === cellMember.cellId) : null
                        const notified = pcsNotifiedIds.has(entry.id)
                        const notifying = pcsNotifyingId === entry.id
                        return (
                          <div className="mb-3">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Cell Group</p>
                              {!cg && entry.visitorId && canEdit && (
                                notified
                                  ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                      <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>Notified
                                    </span>
                                  : <button type="button" disabled={notifying} onClick={async () => {
                                      setPcsNotifyingId(entry.id)
                                      try {
                                        await createTask({ taskTitle: `Add ${entry.name} to a cell group`, department: 'Cell', assignedPerson: '', priority: 'Medium', deadline: '', status: 'Pending', notes: `Referred from PCS by ${userProfile?.name || userProfile?.email || 'Caring Director'}. ${entry.name} is under personal care but has no cell group.${entry.phone ? ` Phone: ${entry.phone}` : ''}`, createdBy: userProfile?.email || '', pcsReferral: true, pcsPersonName: entry.name, pcsPersonPhone: entry.phone || '', pcsPersonVisitorId: entry.visitorId || '' })
                                        setPcsNotifiedIds(prev => new Set([...prev, entry.id]))
                                      } catch { alert('Failed to send notification') }
                                      setPcsNotifyingId(null)
                                    }} className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full hover:bg-indigo-100 transition-colors disabled:opacity-50">
                                      <svg width="9" height="9" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                                      {notifying ? 'Sending…' : 'Notify Cell'}
                                    </button>
                              )}
                            </div>
                            {cg
                              ? <>
                                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                                    {cg.cellName || 'Unnamed Cell'}{cg.leader ? <span className="text-emerald-500">· {cg.leader}</span> : null}
                                  </span>
                                  {canEdit && (() => {
                                    const inv = pcsInviteStatus[entry.id]
                                    const inviting = pcsInvitingId === entry.id
                                    if (inv?.status === 'completed') {
                                      return (
                                        <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                          <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                          Profile filled by cell leader
                                        </span>
                                      )
                                    }
                                    if (inv?.status === 'pending') {
                                      return (
                                        <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-500 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                                          Form sent to {inv.cellLeaderName || 'cell leader'}
                                        </span>
                                      )
                                    }
                                    return (
                                      <button
                                        type="button"
                                        disabled={inviting}
                                        onClick={async () => {
                                          setPcsInvitingId(entry.id)
                                          try {
                                            const invId = await sendPCSFillInvitation({
                                              pcsEntryId: entry.id,
                                              visitorId: entry.visitorId || '',
                                              personName: entry.name || '',
                                              cellId: cellMember.cellId,
                                              cellName: cg.cellName || '',
                                              cellLeaderName: cg.leader || '',
                                              sentBy: userProfile?.email || '',
                                            })
                                            setPcsInviteStatus(prev => ({ ...prev, [entry.id]: { id: invId, status: 'pending', cellLeaderName: cg.leader || '' } }))
                                          } catch { alert('Failed to send invitation') }
                                          setPcsInvitingId(null)
                                        }}
                                        className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-violet-600 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full hover:bg-violet-100 transition-colors disabled:opacity-50"
                                      >
                                        <svg width="9" height="9" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                        {inviting ? 'Sending…' : 'Send profile form to cell leader'}
                                      </button>
                                    )
                                  })()}
                                </>
                              : <p className="text-xs text-slate-400">{entry.visitorId ? 'Not in a cell group' : 'Link visitor record to see cell'}</p>
                            }
                          </div>
                        )
                      })()}

                      {/* Ministry history table */}
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Ministry History</p>

                        {/* Auto-detected ministry from department/worship records */}
                        {autoMinistry.length > 0 ? (
                          <div className="space-y-2">
                            {autoMinistry.map(r => {
                              const fmt = (dateStr) => {
                                const d = new Date(dateStr)
                                return isNaN(d) ? dateStr : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                              }
                              const dur = r.from ? miniDur(r.from, r.to) : null
                              return (
                                <div key={r.id} className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2.5">
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <span className="text-xs font-bold text-indigo-700">{r.ministry}</span>
                                      {r.role ? <span className="ml-1.5 text-xs text-indigo-500">· {r.role}</span> : null}
                                    </div>
                                    {dur && (
                                      <span className="text-[11px] font-bold text-indigo-600 bg-indigo-100 rounded-full px-2 py-0.5 whitespace-nowrap flex-shrink-0">
                                        {dur}
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                                    {r.from && (
                                      <span className="text-[10px] text-indigo-400">
                                        Joined {fmt(r.from)}
                                      </span>
                                    )}
                                    {r.to
                                      ? <span className="text-[10px] text-indigo-400">Until {fmt(r.to)}</span>
                                      : r.from && <span className="text-[10px] font-semibold text-emerald-500">Ongoing</span>
                                    }
                                    {dur && (
                                      <span className="text-[10px] text-indigo-500 font-semibold">Duration: {dur}</span>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 py-1">No ministry records found. Ministry is recorded automatically when a person is added as a team member in any department.</p>
                        )}
                      </div>

                    </div>

                    {/* ═══ SECTION 3 · Spiritual Data ═══ */}
                    <div className="px-4 py-3 border-b border-slate-100 border-l-4 border-l-violet-300">
                      <SecHeader label="Spiritual Data" fill={s3Fill} labelColor="text-violet-700" headerBg="bg-violet-50 border-b border-violet-100" />
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {/* Baptised? gate question */}
                        <div className="space-y-1 sm:col-span-3">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Baptised?</p>
                          <select
                            value={f.baptised}
                            onChange={e => setF(p => ({ ...p, baptised: e.target.value }))}
                            className={inp}>
                            <option value="">— Select —</option>
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                          </select>
                        </div>

                        {f.baptised === 'no' && (
                          <div className="sm:col-span-3 py-1">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-3 py-1">
                              <span className="w-2 h-2 rounded-full bg-slate-400 flex-shrink-0" />
                              Not Baptised
                            </span>
                          </div>
                        )}

                        {f.baptised === 'yes' && (<>
                          {fld('Baptism Date', 'baptismDate', 'date')}
                          {fld('Baptism Place', 'baptismPlace', 'text', 'Location')}
                          <div className="space-y-1">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Baptism Church</p>
                            <select
                              value={f.baptismChurchIsOther ? 'other' : f.baptismChurch}
                              onChange={e => {
                                if (e.target.value === 'other') {
                                  setF(p => ({ ...p, baptismChurchIsOther: true, baptismChurch: p.baptismChurch === 'River Of Life Christian Church' ? '' : p.baptismChurch }))
                                } else {
                                  setF(p => ({ ...p, baptismChurch: e.target.value, baptismChurchIsOther: false }))
                                }
                              }}
                              className={inp}>
                              <option value="">— Select —</option>
                              <option value="River Of Life Christian Church">River Of Life Christian Church</option>
                              <option value="other">Other</option>
                            </select>
                            {f.baptismChurchIsOther && (
                              <input type="text" placeholder="Specify church name…"
                                value={f.baptismChurch}
                                onChange={e => setF(p => ({ ...p, baptismChurch: e.target.value }))}
                                className={`${inp} mt-1`} />
                            )}
                          </div>
                        </>)}
                        {/* Marital status */}
                        <div className="space-y-1">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Marital Status</p>
                          <select
                            value={f.maritalStatus}
                            onChange={e => setF(p => ({ ...p, maritalStatus: e.target.value }))}
                            className={inp}>
                            <option value="">— Select —</option>
                            {['Single','Married','Widowed','Divorced'].map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </div>

                        {/* Marriage details — only when Married */}
                        {f.maritalStatus === 'Married' && (<>
                          {fld('Marriage Date', 'marriageDate', 'date')}
                          <div className="space-y-0.5 relative">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Spouse Name</p>
                            <input
                              type="text"
                              placeholder="Search or type name…"
                              value={f.spouseName}
                              onChange={e => {
                                setF(p => ({ ...p, spouseName: e.target.value, spouseVisitorId: '' }))
                                setPcsSpouseFocused(true)
                              }}
                              onFocus={() => setPcsSpouseFocused(true)}
                              onBlur={() => setTimeout(() => setPcsSpouseFocused(false), 150)}
                              className={inp}
                            />
                            {/* Linked badge */}
                            {f.spouseVisitorId && (
                              <span className="absolute right-2 top-7 text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5">linked</span>
                            )}
                            {/* Typeahead dropdown */}
                            {pcsSpouseFocused && f.spouseName.trim().length >= 2 && (() => {
                              const q = f.spouseName.trim().toLowerCase()
                              const matches = pcsEntries
                                .filter(e => e.id !== entry.id && e.name && e.name.toLowerCase().includes(q))
                                .slice(0, 6)
                              if (!matches.length) return null
                              return (
                                <div className="absolute z-20 top-full left-0 right-0 mt-0.5 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
                                  {matches.map(m => (
                                    <button key={m.id} type="button"
                                      onMouseDown={() => {
                                        setF(p => ({ ...p, spouseName: m.name, spouseVisitorId: m.visitorId || m.id }))
                                        setPcsSpouseFocused(false)
                                      }}
                                      className="w-full text-left px-3 py-2 text-xs hover:bg-violet-50 flex items-center gap-2">
                                      <span className="font-semibold text-slate-800 flex-1">{m.name}</span>
                                      {m.phone && <span className="text-slate-400">{m.phone}</span>}
                                      <span className="text-[9px] font-bold text-violet-500 bg-violet-50 border border-violet-200 rounded-full px-1.5 py-0.5 flex-shrink-0">ROL</span>
                                    </button>
                                  ))}
                                </div>
                              )
                            })()}
                          </div>
                        </>)}

                      </div>
                    </div>

                    {/* ═══ SECTION 4 · Membership ═══ */}
                    <div className="px-4 py-3 border-b border-slate-100 border-l-4 border-l-amber-300">
                      <div className="-mx-4 -mt-3 mb-4 px-4 py-3 flex items-center gap-3 bg-amber-50 border-b border-amber-100">
                        <span className={`w-3 h-3 rounded-full flex-shrink-0 transition-colors duration-300 ${f.membershipStatus ? dotCls(s4Fill) : 'bg-slate-300'}`} />
                        <p className="text-sm font-bold tracking-tight text-amber-700">Membership</p>
                        <div className="ml-auto flex-shrink-0">
                          {!f.membershipStatus && (
                            <button type="button" onClick={() => setF(p => ({ ...p, membershipStatus: 'applying' }))}
                              className="text-xs font-bold text-amber-600 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-full hover:bg-amber-200 transition-colors">
                              + Begin Application
                            </button>
                          )}
                          {f.membershipStatus && (
                            <select value={f.membershipStatus} onChange={e => setF(p => ({ ...p, membershipStatus: e.target.value }))}
                              className="text-xs border border-amber-200 rounded-lg px-2 py-1 bg-amber-100 text-amber-700 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-200">
                              <option value="applying">Applying</option>
                              <option value="member">Member</option>
                            </select>
                          )}
                        </div>
                      </div>

                      {f.membershipStatus ? (
                        <div className="space-y-3">
                          {/* Membership number */}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-0.5">
                              <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider">Membership #</p>
                              <input type="text" placeholder="Assign number" value={f.membershipNumber || ''} onChange={e => setF(p => ({ ...p, membershipNumber: e.target.value }))} className="w-full px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-200" />
                            </div>
                          </div>

                          {/* Permanent address */}
                          <div className="space-y-0.5">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Permanent Address</p>
                            <textarea rows={2} placeholder="Full permanent address for membership records…" value={f.permanentAddress || ''} onChange={e => setF(p => ({ ...p, permanentAddress: e.target.value }))} className={`${inp} resize-none`} />
                          </div>

                          {/* Documents submitted */}
                          <div>
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Documents Submitted</p>
                            {membershipDocs.length > 0 && (
                              <div className="space-y-1.5 mb-2">
                                {membershipDocs.map(d => (
                                  <div key={d.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                                    <select value={d.type} onChange={e => updateDocRow(d.id, 'type', e.target.value)} className={`${inp} text-xs`}>
                                      <option value="">Document type…</option>
                                      <option>Aadhaar Card</option>
                                      <option>Passport</option>
                                      <option>Driving License</option>
                                      <option>Voter ID</option>
                                      <option>PAN Card</option>
                                      <option>Other</option>
                                    </select>
                                    <input type="text" placeholder="Document number" value={d.number} onChange={e => updateDocRow(d.id, 'number', e.target.value)} className={`${inp} text-xs`} />
                                    <button type="button" onClick={() => removeDocRow(d.id)} className="w-7 h-7 rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 flex items-center justify-center transition-colors">×</button>
                                  </div>
                                ))}
                              </div>
                            )}
                            <button type="button" onClick={addDocRow} className="text-xs text-amber-600 hover:text-amber-800 flex items-center gap-1 py-1 transition-colors">
                              <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                              Add document
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400">No membership application yet. Click "+ Begin Application" to start.</p>
                      )}
                    </div>

                    {/* ═══ Actions ═══ */}
                    <div className="px-4 py-3 flex items-center gap-2">
                      {pcsFormDirty && <button
                        type="button"
                        disabled={pcsExpandedSaving}
                        onClick={async () => {
                          setPcsExpandedSaving(true)
                          try {
                            const { name, phone, attendedDate, membershipNumber, leadershipPosition, year, email, dob, nativity, currentPlace, serviceAttended, howKnown,
                              baptised, baptismDate, baptismPlace, baptismChurch, maritalStatus, marriageDate, spouseName, spouseVisitorId,
                              membershipStatus, membershipDocs, permanentAddress } = f
                            const resolvedYear = year || (attendedDate ? new Date(attendedDate).getFullYear() : null)

                            // Upload photo if a new one was selected
                            let savedPhotoUrl = f.photoUrl || ''
                            if (pcsPhotoFile && entry.visitorId) {
                              try { savedPhotoUrl = await uploadMemberPhoto(entry.visitorId, pcsPhotoFile) || savedPhotoUrl } catch { /* non-fatal */ }
                              setPcsPhotoFile(null)
                            }

                            await updatePCSEntry(entry.id, { name, phone, email, dob, nativity, currentPlace, serviceAttended, howKnown, attendedDate, membershipNumber, leadershipPosition, year: resolvedYear })
                            setPcsEntries(prev => prev.map(e => e.id === entry.id ? { ...e, name, phone, email, dob, nativity, currentPlace, serviceAttended, howKnown, attendedDate, membershipNumber, leadershipPosition, year: resolvedYear ? Number(resolvedYear) : null } : e))
                            if (entry.visitorId) {
                              updateDelightVisitor(entry.visitorId, { name, phone, email, dob, nativity, currentPlace, serviceAttended, attendedDate, howKnown }).catch(() => {})
                              updateCellMembersByVisitorId(entry.visitorId, { name, phone, birthday: dob }).catch(() => {})
                              updatePCSEntriesByVisitorId(entry.visitorId, { name, phone }).catch(() => {})
                              upsertMemberProfile(entry.visitorId, {
                                baptised, baptismDate, baptismPlace, baptismChurch, maritalStatus, marriageDate, spouseName, spouseVisitorId,
                                membershipStatus,
                                membershipDocs: membershipDocs || [],
                                permanentAddress,
                                ...(savedPhotoUrl ? { photoUrl: savedPhotoUrl } : {}),
                              }, userProfile?.email || '').catch(() => {})
                            }
                            if (savedPhotoUrl) setF(p => ({ ...p, photoUrl: savedPhotoUrl }))
                            pcsSavedRef.current = JSON.stringify(savedPhotoUrl ? { ...pcsExpandedForm, photoUrl: savedPhotoUrl } : pcsExpandedForm)
                            setPcsFormDirty(false)
                          } catch { alert('Failed to save') }
                          setPcsExpandedSaving(false)
                        }}
                        className="flex-1 min-h-[44px] py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-60 transition-colors"
                      >{pcsExpandedSaving ? 'Saving…' : 'Save Changes'}</button>}
                    </div>

                  </div>
                </div>
              )
            }

            // Generate and download a JPEG of the PCS profile
            const downloadProfileAsJPEG = (data) => {
              const W = 700, H = 500
              const canvas = document.createElement('canvas')
              canvas.width = W; canvas.height = H
              const ctx = canvas.getContext('2d')

              // Background
              ctx.fillStyle = '#f8fafc'
              ctx.fillRect(0, 0, W, H)

              // Header band
              ctx.fillStyle = '#4338ca'
              ctx.fillRect(0, 0, W, 90)

              // Church label
              ctx.fillStyle = '#c7d2fe'
              ctx.font = '10px Arial'
              ctx.fillText('RIVER OF LIFE CHURCH', 20, 18)
              ctx.fillStyle = '#ffffff'
              ctx.font = 'bold 11px Arial'
              ctx.fillText('PERSONAL CARING SYSTEM — PROFILE', 20, 32)

              // Avatar circle
              ctx.fillStyle = data.membershipNumber ? '#f59e0b' : '#818cf8'
              ctx.beginPath(); ctx.arc(48, 65, 22, 0, Math.PI * 2); ctx.fill()
              ctx.fillStyle = '#ffffff'
              ctx.font = 'bold 22px Arial'
              ctx.textAlign = 'center'
              ctx.fillText((data.name || '?')[0].toUpperCase(), 48, 73)
              ctx.textAlign = 'left'

              // Name
              ctx.fillStyle = '#ffffff'
              ctx.font = 'bold 20px Arial'
              ctx.fillText(data.name || '—', 82, 57)

              // Sub line
              ctx.fillStyle = '#a5b4fc'
              ctx.font = '12px Arial'
              const sub = [data.membershipNumber ? `Membership #${data.membershipNumber}` : '', data.leadershipPosition || '', data.year ? String(data.year) : ''].filter(Boolean).join('  ·  ')
              ctx.fillText(sub || 'No membership number', 82, 76)

              let y = 108
              const drawSection = (title, fields) => {
                const filled = fields.filter(([, v]) => v && String(v).trim())
                if (!filled.length) return
                ctx.fillStyle = '#e0e7ff'
                ctx.fillRect(0, y - 14, W, 20)
                ctx.fillStyle = '#3730a3'
                ctx.font = 'bold 10px Arial'
                ctx.fillText(title.toUpperCase(), 20, y)
                y += 12
                const COL_W = Math.floor((W - 40) / 3)
                let col = 0
                filled.forEach(([label, value]) => {
                  const x = 20 + col * COL_W
                  ctx.fillStyle = '#6b7280'
                  ctx.font = '9px Arial'
                  ctx.fillText(label.toUpperCase(), x, y + 10)
                  ctx.fillStyle = '#111827'
                  ctx.font = 'bold 11px Arial'
                  let text = String(value)
                  while (ctx.measureText(text).width > COL_W - 14 && text.length > 3) text = text.slice(0, -1)
                  if (text !== String(value)) text += '…'
                  ctx.fillText(text, x, y + 24)
                  col++
                  if (col >= 3) { col = 0; y += 40 }
                })
                if (col > 0) y += 40
                y += 10
              }

              const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN') : ''
              drawSection('Contact Info', [['Phone', data.phone], ['Email', data.email], ['How Known', data.howKnown]])
              drawSection('Personal', [['Date of Birth', fmt(data.dob)], ['Nativity', data.nativity], ['Current Place', data.currentPlace]])
              drawSection('Church', [['Date Attended', fmt(data.attendedDate)], ['Year', data.year ? String(data.year) : ''], ['Service Attended', data.serviceAttended]])
              if (data.baptismDate || data.marriageDate) {
                drawSection('Spiritual Records', [['Baptism Date', fmt(data.baptismDate)], ['Baptism Place', data.baptismPlace], ['Marriage Date', fmt(data.marriageDate)], ['Spouse', data.spouseName]])
              }

              // Footer
              ctx.fillStyle = '#f1f5f9'
              ctx.fillRect(0, H - 30, W, 30)
              ctx.strokeStyle = '#e2e8f0'
              ctx.lineWidth = 1
              ctx.beginPath(); ctx.moveTo(0, H - 30); ctx.lineTo(W, H - 30); ctx.stroke()
              ctx.fillStyle = '#94a3b8'
              ctx.font = '10px Arial'
              ctx.fillText(`Generated on ${new Date().toLocaleDateString('en-IN')}  ·  River Of Life Church`, 20, H - 10)

              canvas.toBlob(blob => {
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `${(data.name || 'person').replace(/[^a-zA-Z0-9]/g, '_')}_PCS_Profile.jpg`
                document.body.appendChild(a)
                a.click()
                setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 100)
              }, 'image/jpeg', 0.92)
            }

            // Inactive cell members who still appear in PCS
            const pcsVisitorIdMap = new Map(pcsEntries.filter(e => e.visitorId).map(e => [e.visitorId, e]))
            const removedFromCellInPCS = []
            const _seenVids = new Set()
            allCellMembers
              .filter(m => m.status === 'inactive' && m.visitorId && pcsVisitorIdMap.has(m.visitorId))
              .forEach(m => {
                if (!_seenVids.has(m.visitorId)) {
                  _seenVids.add(m.visitorId)
                  removedFromCellInPCS.push({ ...m, pcsEntry: pcsVisitorIdMap.get(m.visitorId) })
                }
              })

            return (
              <div className="space-y-4">
                {/* Top bar */}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const next = !pcsShowFormer
                      setPcsShowFormer(next)
                      if (next && pcsInactiveEntries.length === 0) {
                        setPcsLoadingFormer(true)
                        try { setPcsInactiveEntries(await getInactivePCSEntries()) } catch { /* ignore */ }
                        setPcsLoadingFormer(false)
                      }
                    }}
                    className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${pcsShowFormer ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'}`}
                  >
                    {pcsShowFormer ? 'Active' : 'Former'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPcsPickerOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
                    + Add
                  </button>
                </div>

                {/* Manual PCS entry modal */}
                {pcsManualOpen && (
                  <PCSManualEntryModal
                    onSave={async (data) => {
                      const tempId = `temp_${Date.now()}`
                      const optimistic = { id: tempId, visitorId: '', ...data, addedAt: new Date(), addedBy: userProfile?.email || '' }
                      setPcsEntries(prev => [optimistic, ...prev])
                      setPcsManualOpen(false)
                      try {
                        const realId = await addPCSEntry({ ...data, addedBy: userProfile?.email || 'unknown' })
                        if (realId) setPcsEntries(prev => prev.map(e => e.id === tempId ? { ...e, id: realId } : e))
                      } catch {
                        setPcsEntries(prev => prev.filter(e => e.id !== tempId))
                        alert('Failed to add entry. Please try again.')
                      }
                    }}
                    onClose={() => setPcsManualOpen(false)}
                  />
                )}

                {/* Picker */}
                {pcsPickerOpen && (
                  <PCSPickerModal
                    addedIds={new Set(pcsEntries.map((e) => e.visitorId))}
                    onAdd={(v) => {
                      const tempId = `temp_${Date.now()}`
                      const optimistic = { id: tempId, visitorId: v.id, name: v.name, phone: v.phone, attendedDate: v.attendedDate, year: v.year, addedAt: new Date(), addedBy: userProfile?.email || '' }
                      setPcsEntries((prev) => [optimistic, ...prev])
                      addPCSEntry({ visitorId: v.id, name: v.name, phone: v.phone, attendedDate: v.attendedDate, year: v.year, addedBy: userProfile?.email || 'unknown' })
                        .then((realId) => { if (realId) setPcsEntries((prev) => prev.map((e) => e.id === tempId ? { ...e, id: realId } : e)) })
                        .catch(() => { setPcsEntries((prev) => prev.filter((e) => e.id !== tempId)) })
                    }}
                    onClose={() => setPcsPickerOpen(false)}
                  />
                )}

                {/* ── Cell alerts — stacked on mobile, side-by-side on desktop ── */}
                {(cellReferralTasks.length > 0 || removedFromCellInPCS.length > 0) && (
                  <div className="space-y-3 sm:space-y-0 sm:flex sm:gap-3 sm:items-start">

                    {/* Pending from Cell */}
                    {cellReferralTasks.length > 0 && (
                      <div className="bg-white rounded-2xl border border-orange-200 shadow-sm overflow-hidden sm:flex-1 sm:min-w-0">
                        <button
                          type="button"
                          onClick={() => setCellReferralOpen(o => !o)}
                          className="w-full px-4 py-3 flex items-center gap-3 hover:bg-orange-50 transition-colors text-left"
                        >
                          <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" />
                          <p className="text-sm font-bold text-orange-800 flex-1">Pending from Cell</p>
                          <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
                            {cellReferralTasks.length}
                          </span>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`text-orange-400 transition-transform flex-shrink-0 ${cellReferralOpen ? 'rotate-180' : ''}`}>
                            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>

                        {cellReferralOpen && (
                          <>
                            <p className="px-4 pb-2 text-xs text-slate-400 border-t border-orange-100 pt-3">
                              Cell leaders flagged these members as not yet in PCS.
                            </p>
                            <div className="divide-y divide-slate-100">
                              {cellReferralTasks.map(task => {
                                const name      = task.memberName || task.taskTitle.replace(/^Add /, '').replace(/ to PCS$/, '')
                                const phone     = task.memberPhone || ''
                                const visitorId = task.memberVisitorId || ''
                                const cellName  = task.cellName || ''
                                const adding    = cellReferralAdding.has(task.id)
                                const removing  = cellReferralRemoving.has(task.id)
                                const inVisitorList = visitorId
                                  ? delightVisitors.some(v => v.id === visitorId)
                                  : delightVisitors.some(v => (v.name || '').trim().toLowerCase() === (name || '').trim().toLowerCase())

                                return (
                                  <div key={task.id} className="flex items-center gap-3 px-4 py-3">
                                    <div className="w-9 h-9 rounded-full bg-orange-100 text-orange-700 text-sm font-bold flex items-center justify-center flex-shrink-0">
                                      {String(name || '?').split(' ').slice(0, 2).map(w => (w[0] || '').toUpperCase()).join('')}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-semibold text-slate-900 text-sm truncate">{name}</p>
                                      <p className="text-xs text-slate-400 mt-0.5 truncate">
                                        {[phone, cellName ? `Cell: ${cellName}` : ''].filter(Boolean).join(' · ')}
                                      </p>
                                      {!inVisitorList && (
                                        <p className="text-xs text-amber-600 font-medium mt-0.5">Not in visitor list yet</p>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <button
                                        type="button"
                                        disabled={removing || adding}
                                        onClick={async () => {
                                          setCellReferralRemoving(prev => new Set([...prev, task.id]))
                                          try {
                                            await updateTask(task.id, { status: 'Dismissed' })
                                            setCellReferralTasks(prev => prev.filter(t => t.id !== task.id))
                                          } catch { /* ignore */ }
                                          finally {
                                            setCellReferralRemoving(prev => { const s = new Set(prev); s.delete(task.id); return s })
                                          }
                                        }}
                                        className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:bg-red-100 hover:text-red-500 flex items-center justify-center text-base transition-colors disabled:opacity-40"
                                        title="Dismiss"
                                      >
                                        {removing ? '…' : '×'}
                                      </button>
                                      {inVisitorList ? (
                                        <button
                                          type="button"
                                          disabled={adding}
                                          onClick={async () => {
                                            setCellReferralAdding(prev => new Set([...prev, task.id]))
                                            try {
                                              const resolvedVisitorId = visitorId ||
                                                (delightVisitors.find(v => (v.name || '').trim().toLowerCase() === (name || '').trim().toLowerCase())?.id || '')
                                              await addPCSEntry({
                                                visitorId: resolvedVisitorId, name, phone,
                                                year: new Date().getFullYear(), addedBy: userProfile?.email || 'unknown',
                                              })
                                              await updateTask(task.id, { status: 'Completed' })
                                              setPcsEntries(prev => [{
                                                id: `ref_${task.id}`, visitorId: resolvedVisitorId, name, phone,
                                                year: new Date().getFullYear(), addedAt: new Date(), addedBy: userProfile?.email || '',
                                              }, ...prev])
                                            } catch { /* ignore */ }
                                            finally {
                                              setCellReferralAdding(prev => { const s = new Set(prev); s.delete(task.id); return s })
                                            }
                                          }}
                                          className="px-3 py-1.5 bg-orange-500 text-white text-xs font-semibold rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-colors whitespace-nowrap"
                                        >
                                          {adding ? 'Adding…' : 'Add to PCS'}
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingDelightVisitorId(null)
                                            setDelightVisitorForm(f => ({
                                              ...f, name, phone,
                                              dob: '', email: '', nativity: '', currentPlace: '',
                                              serviceAttended: '', attendedDate: '', howKnown: '', source: '',
                                              year: new Date().getFullYear(),
                                            }))
                                            setDelightVisitorModalOpen(true)
                                          }}
                                          className="px-3 py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-xl hover:bg-amber-600 transition-colors whitespace-nowrap"
                                        >
                                          + Visitor List
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Removed from Cell — still in PCS */}
                    {removedFromCellInPCS.length > 0 && (
                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden sm:flex-1 sm:min-w-0">
                        <button
                          type="button"
                          onClick={() => setRemovedFromCellOpen(o => !o)}
                          className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors text-left"
                        >
                          <span className="w-2 h-2 rounded-full bg-slate-400 flex-shrink-0" />
                          <p className="text-sm font-bold text-slate-700 flex-1">Removed from Cell</p>
                          <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2.5 py-0.5 rounded-full">
                            {removedFromCellInPCS.length}
                          </span>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`text-slate-400 transition-transform flex-shrink-0 ${removedFromCellOpen ? 'rotate-180' : ''}`}>
                            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>

                        {removedFromCellOpen && (
                          <>
                            <p className="px-4 pb-2 text-xs text-slate-400 border-t border-slate-100 pt-3">
                              These people are inactive in their cell group. Remove from PCS if no longer active in church.
                            </p>
                            <div className="divide-y divide-slate-100">
                              {removedFromCellInPCS.map(m => {
                                const pe = m.pcsEntry
                                return (
                                  <div key={pe.id} className="flex items-center gap-3 px-4 py-3">
                                    <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 text-sm font-bold flex items-center justify-center flex-shrink-0">
                                      {String(m.name || pe.name || '?').split(' ').slice(0, 2).map(w => (w[0] || '').toUpperCase()).join('')}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-semibold text-slate-900 text-sm truncate">{m.name || pe.name}</p>
                                      <p className="text-xs text-slate-400 mt-0.5 truncate">
                                        {[m.phone || pe.phone, pe.year ? `PCS ${pe.year}` : '', pe.membershipNumber ? `#${pe.membershipNumber}` : ''].filter(Boolean).join(' · ')}
                                      </p>
                                      <p className="text-xs text-red-400 font-medium mt-0.5">Inactive in cell</p>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                  </div>
                )}

                {/* Former (inactive) panel */}
                {pcsShowFormer && (
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-700">Former Members</span>
                      <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{pcsInactiveEntries.length}</span>
                    </div>
                    {pcsLoadingFormer ? (
                      <div className="py-10 text-center text-slate-400 text-sm">Loading…</div>
                    ) : pcsInactiveEntries.length === 0 ? (
                      <div className="py-10 text-center text-slate-400 text-sm">No former members.</div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {pcsInactiveEntries.map(e => (
                          <div key={e.id} className="px-4 py-3 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-700">{e.name}</p>
                              {e.phone && <p className="text-xs text-slate-400">{e.phone}</p>}
                            </div>
                            <div className="text-right flex-shrink-0">
                              {e.year && <span className="text-[10px] text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{e.year}</span>}
                              {e.removedAt && (
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  Removed {e.removedAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Main card — all years on one page */}
                {!pcsShowFormer && <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  {loadingPCS ? (
                    <div className="py-14 text-center text-slate-400 text-sm">Loading…</div>
                  ) : pcsEntries.length === 0 ? (
                    <div className="py-16 flex flex-col items-center gap-3 text-center">
                      <svg width="38" height="38" viewBox="0 0 36 36" fill="none" className="text-slate-200">
                        <circle cx="18" cy="12" r="6" stroke="currentColor" strokeWidth="1.6"/>
                        <path d="M6 30c0-6.627 5.373-12 12-12s12 5.373 12 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                      </svg>
                      <p className="text-sm text-slate-400">No people added yet. Click "Add Person" to start.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {grouped.map(({ year, entries }) => {
                        return (
                          <div key={year ?? 'no-year'}>
                            {/* Year label */}
                            <div className="px-4 py-2 flex items-center gap-2 bg-slate-50">
                              <span className="text-sm font-bold text-slate-700">{year ?? '—'}</span>
                              <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                {entries.length} {entries.length === 1 ? 'person' : 'people'}
                              </span>
                            </div>
                            {/* Chips — profile panel injected inline right after the clicked chip */}
                            <div className="px-4 py-3 flex flex-wrap gap-2">
                              {entries.map(entry => (
                                <Fragment key={entry.id}>
                                  <Chip entry={entry} />
                                  {pcsExpandedId === entry.id && (
                                    <>
                                      {/* Force a full-width break so profile starts on its own row */}
                                      <div className="w-full -mx-4" />
                                      <div className="w-full -mx-4">
                                        {PCSInlineProfile({ entry })}
                                      </div>
                                    </>
                                  )}
                                </Fragment>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Footer */}
                  {!loadingPCS && pcsEntries.length > 0 && (
                    <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-xs text-slate-400 text-center">
                      {pcsEntries.length} {pcsEntries.length === 1 ? 'person' : 'people'} · {grouped.length} {grouped.length === 1 ? 'year' : 'years'}
                    </div>
                  )}
                </div>}
              </div>
            )
          })()}

          {(activeTab === 'team' || ((slug === 'cell' || slug === 'sunday-ministry' || slug === 'media' || slug === 'river-kids' || slug === 'administration' || slug === 'accounts' || slug === 'caring' || slug === 'd-light') && activeTab === 'operations' && opsSubTab === 'team')) && (
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
              {loadingTeam ? (
                <div className="py-4 text-sm text-slate-500">Loading team...</div>
              ) : team.length === 0 ? (
                <div className="py-4 text-sm text-slate-500"></div>
              ) : slug === 'd-light' ? (
                <>
                  {/* Mobile: list rows */}
                  <div className="sm:hidden divide-y divide-slate-100 -mx-5 border-t border-b border-slate-100">
                    {team.map((m) => {
                      const subDepts = Array.isArray(m.subDepartments) && m.subDepartments.length
                        ? m.subDepartments
                        : (m.subDepartment ? [m.subDepartment] : [])
                      const isActive = (m.status || 'active') === 'active' && !m.isFormer
                      return (
                        <div key={m.id} className="flex items-center gap-3 px-5 py-3">
                          <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 text-sm font-bold flex items-center justify-center flex-shrink-0">
                            {(m.name || '?').charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{m.name}</p>
                            <div className="flex flex-wrap items-center gap-1 mt-0.5">
                              <span className={`text-[10px] font-semibold px-1.5 py-px rounded-full ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                                {m.isFormer ? 'Former' : 'Active'}
                              </span>
                              {subDepts.map((s) => (
                                <span key={s} className="text-[10px] font-medium px-1.5 py-px rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                                  {s}
                                </span>
                              ))}
                            </div>
                          </div>
                          {canEdit && (
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMember(m)
                                  setMemberForm({
                                    name: m.name || '', role: m.role || '',
                                    subDepartment: m.subDepartment || '', subDepartments: subDepts,
                                    phone: m.phone || '', status: m.status || 'active',
                                    memberSince: m.memberSince || new Date().toISOString().slice(0, 10),
                                    isFormer: !!m.isFormer, notes: m.notes || '',
                                  })
                                }}
                                className="px-3 py-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 active:bg-indigo-100"
                              >Edit</button>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!window.confirm('Remove this member from team?')) return
                                  await deleteDepartmentTeamMember(m.id)
                                  setTeam((prev) => prev.filter((x) => x.id !== m.id))
                                }}
                                className="px-3 py-1.5 text-xs font-medium text-red-500 border border-red-100 rounded-lg hover:bg-red-50 active:bg-red-100"
                              >Remove</button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {/* Desktop: card grid */}
                  <div className="hidden sm:grid sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {team.map((m) => {
                      const subDepts = Array.isArray(m.subDepartments) && m.subDepartments.length
                        ? m.subDepartments
                        : (m.subDepartment ? [m.subDepartment] : [])
                      const isActive = (m.status || 'active') === 'active' && !m.isFormer
                      return (
                        <div key={m.id} className="bg-slate-50 border border-slate-200 rounded-xl p-2 space-y-1.5 flex flex-col">
                          <div className="flex items-center gap-1.5">
                            <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                              {(m.name || '?').charAt(0).toUpperCase()}
                            </div>
                            <p className="text-[11px] font-semibold text-slate-800 leading-tight truncate">{m.name}</p>
                          </div>
                          {subDepts.length > 0 && (
                            <div className="flex flex-wrap gap-0.5">
                              {subDepts.map((s) => (
                                <span key={s} className="text-[9px] font-medium px-1 py-px rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100 leading-tight">{s}</span>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-1 mt-auto">
                            <span className={`text-[9px] font-semibold px-1 py-px rounded-full flex-shrink-0 ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                              {m.isFormer ? 'Former' : 'Active'}
                            </span>
                            {canEdit && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingMember(m)
                                    setMemberForm({
                                      name: m.name || '', role: m.role || '',
                                      subDepartment: m.subDepartment || '', subDepartments: subDepts,
                                      phone: m.phone || '', status: m.status || 'active',
                                      memberSince: m.memberSince || new Date().toISOString().slice(0, 10),
                                      isFormer: !!m.isFormer, notes: m.notes || '',
                                    })
                                  }}
                                  className="ml-auto text-[9px] font-medium text-indigo-500 hover:text-indigo-700 transition-colors"
                                >Edit</button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (!window.confirm('Remove this member from team?')) return
                                    await deleteDepartmentTeamMember(m.id)
                                    setTeam((prev) => prev.filter((x) => x.id !== m.id))
                                  }}
                                  className="text-[9px] font-medium text-red-300 hover:text-red-500 transition-colors"
                                >✕</button>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              ) : (
                <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-4 py-2 text-slate-600 font-medium w-10">SL</th>
                        <th className="text-left px-4 py-2 text-slate-600 font-medium">Name</th>
                        <th className="text-left px-4 py-2 text-slate-600 font-medium">Status</th>
                        <th className="text-left px-4 py-2 text-slate-600 font-medium">Member since</th>
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
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-slate-800">{m.name}</span>
                              {m.visitorId
                                ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">🔗 Linked</span>
                                : <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400">Unlinked</span>
                              }
                            </div>
                          </td>
                          <td className="px-4 py-2 text-slate-600 capitalize">{m.status || 'active'}</td>
                          <td className="px-4 py-2 text-slate-600">{m.memberSince || '—'}</td>
                          {canEdit && (
                            <td className="px-4 py-2 text-sm space-x-2 whitespace-nowrap">
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
                              >Edit</button>
                              <button
                                type="button"
                                onClick={() => setTeamMemberLinking(m)}
                                className="text-indigo-600 hover:underline"
                              >{m.visitorId ? 'Relink' : 'Link'}</button>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!window.confirm('Remove this member from team?')) return
                                  await deleteDepartmentTeamMember(m.id)
                                  setTeam((prev) => prev.filter((x) => x.id !== m.id))
                                }}
                                className="text-red-600 hover:underline"
                              >Delete</button>
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
                      setTeamMemberSearch('')
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
                        visitorId: '',
                      })
                    } catch (err) {
                      console.error(err)
                      setTeamError('Failed to save team member.')
                    }
                  }}
                  className="mt-6"
                >
                  {/* Form header */}
                  <div className="flex items-center gap-3 px-5 py-4 bg-gradient-to-r from-indigo-50 to-violet-50 border-t-2 border-indigo-200 rounded-t-xl">
                    <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-indigo-900 leading-tight">
                        {editingMember ? 'Edit Team Member' : 'Add New Team Member'}
                      </h3>
                      <p className="text-xs text-indigo-500 mt-0.5">
                        {editingMember ? 'Update the details below' : 'Search from the member database'}
                      </p>
                    </div>
                  </div>

                  <div className="px-5 py-5 space-y-5 bg-white border border-t-0 border-indigo-100 rounded-b-xl shadow-sm">
                    {/* Name / Search */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                        Name
                      </label>
                      {editingMember ? (
                        <input
                          type="text"
                          required
                          value={memberForm.name}
                          onChange={(e) => setMemberForm((f) => ({ ...f, name: e.target.value }))}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-colors"
                        />
                      ) : memberForm.name ? (
                        <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border-2 border-emerald-200 bg-emerald-50">
                          <span className="w-9 h-9 rounded-full bg-emerald-500 text-white text-sm font-bold flex items-center justify-center flex-shrink-0 shadow-sm">
                            {memberForm.name.charAt(0).toUpperCase()}
                          </span>
                          <span className="flex-1 text-sm font-semibold text-emerald-900">{memberForm.name}</span>
                          <button
                            type="button"
                            onClick={() => { setMemberForm((f) => ({ ...f, name: '', visitorId: '' })); setTeamMemberSearch('') }}
                            className="w-7 h-7 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 flex items-center justify-center text-base leading-none transition-colors shadow-sm"
                          >×</button>
                        </div>
                      ) : (
                        <div className="relative">
                          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                            </svg>
                          </div>
                          <input
                            type="text"
                            placeholder={teamVisitorsLoading ? 'Loading members…' : 'Search member by name…'}
                            value={teamMemberSearch}
                            autoComplete="off"
                            disabled={teamVisitorsLoading}
                            onChange={(e) => { setTeamMemberSearch(e.target.value); setTeamMemberSearchOpen(true) }}
                            onFocus={() => setTeamMemberSearchOpen(true)}
                            onBlur={() => setTimeout(() => setTeamMemberSearchOpen(false), 150)}
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 focus:bg-white transition-colors disabled:opacity-60"
                          />
                          {teamMemberSearchOpen && teamMemberSearch.trim().length > 0 && (() => {
                            const q = teamMemberSearch.trim().toLowerCase()
                            const matches = teamVisitors.filter((v) => v.name && v.name.toLowerCase().includes(q)).slice(0, 8)
                            return (
                              <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-xl border border-slate-200 shadow-xl z-20 overflow-hidden max-h-56 overflow-y-auto">
                                {matches.length === 0 ? (
                                  <p className="px-4 py-4 text-sm text-slate-400 text-center">No members found.</p>
                                ) : matches.map((v) => (
                                  <button
                                    key={v.id}
                                    type="button"
                                    onMouseDown={() => {
                                      setMemberForm((f) => ({ ...f, name: v.name, visitorId: v.id, phone: f.phone || v.phone || '' }))
                                      setTeamMemberSearch('')
                                      setTeamMemberSearchOpen(false)
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-50 text-left transition-colors border-b border-slate-50 last:border-0"
                                  >
                                    <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                                      {v.name.charAt(0).toUpperCase()}
                                    </span>
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-slate-800 truncate">{v.name}</p>
                                      {v.phone && <p className="text-xs text-slate-400 truncate">{v.phone}</p>}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Sub Department (D-Light only) */}
                    {slug === 'd-light' && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                          Sub Department
                        </label>
                        {subDeptOptionList.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">No sub-departments yet — add them in Sub Dept tab.</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {subDeptOptionList.map((sd) => {
                              const selected = memberForm.subDepartments.includes(sd.name)
                              return (
                                <button
                                  key={sd.id}
                                  type="button"
                                  onClick={() => {
                                    const next = selected
                                      ? memberForm.subDepartments.filter((s) => s !== sd.name)
                                      : [...memberForm.subDepartments, sd.name]
                                    setMemberForm((f) => ({ ...f, subDepartments: next, subDepartment: next[0] || '' }))
                                  }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
                                  style={selected
                                    ? { background: '#4f46e5', color: '#fff', borderColor: '#4f46e5' }
                                    : { background: '#f8fafc', color: '#64748b', borderColor: '#e2e8f0' }
                                  }
                                >
                                  {selected && <span style={{ fontSize: 10 }}>✓</span>}
                                  {sd.name}
                                  {sd.servingArea && <span style={{ opacity: 0.7, fontWeight: 400 }}>· {sd.servingArea}</span>}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Status + Member Since row */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                          Status
                        </label>
                        <div className="flex gap-2">
                          {['active', 'inactive'].map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setMemberForm((f) => ({ ...f, status: s }))}
                              className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                                memberForm.status === s
                                  ? s === 'active'
                                    ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                                    : 'bg-slate-500 text-white border-slate-500 shadow-sm'
                                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              {s === 'active' ? 'Active' : 'Inactive'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                          Member Since
                        </label>
                        <input
                          type="date"
                          value={memberForm.memberSince}
                          onChange={(e) => setMemberForm((f) => ({ ...f, memberSince: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-colors"
                        />
                      </div>
                    </div>

                    {/* Former member toggle */}
                    <label className="flex items-center gap-3 cursor-pointer select-none group">
                      <div className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 ${memberForm.isFormer ? 'bg-amber-400' : 'bg-slate-200'}`}
                        onClick={() => setMemberForm((f) => ({ ...f, isFormer: !f.isFormer }))}>
                        <div className={`w-5 h-5 bg-white rounded-full shadow-md mt-0.5 transition-transform ${memberForm.isFormer ? 'translate-x-4.5' : 'translate-x-0.5'}`} style={{ transform: memberForm.isFormer ? 'translateX(18px)' : 'translateX(2px)' }} />
                      </div>
                      <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">Mark as former member</span>
                    </label>

                    {/* Actions */}
                    <div className="flex gap-3 pt-1">
                      <button
                        type="submit"
                        disabled={!editingMember && !memberForm.name}
                        className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition-colors"
                      >
                        {editingMember ? 'Update Member' : 'Add Member'}
                      </button>
                      {editingMember && (
                        <button
                          type="button"
                          onClick={() => { setEditingMember(null); setTeamMemberSearch(''); setMemberForm({ name: '', role: '', subDepartment: '', subDepartments: [], phone: '', status: 'active', memberSince: new Date().toISOString().slice(0, 10), isFormer: false, notes: '', visitorId: '' }) }}
                          className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
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
                  <button type="submit" className="px-3 py-1.5 min-h-[44px] bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors">
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
                <h2 className="font-semibold text-slate-800">Event Management</h2>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewEventName('')
                      setNewEventModalOpen(true)
                    }}
                    className="px-4 min-h-[44px] py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
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
                            {
                              id,
                              name: n,
                              budget: '',
                              team: '',
                              programs: [],
                              liveCellAttendance: {},
                              programScheduleStartTime: '',
                              createdAt: new Date(),
                            },
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
                        <button type="submit" className="px-4 min-h-[44px] py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors">
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
                          <div className="space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <h3 className="text-sm font-semibold text-slate-800">Program</h3>
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEventProgramForm({ programNo: '', programName: '', programBy: '', duration: '' })
                                    setEventProgramEditingId(null)
                                    setEventProgramModalOpen(true)
                                  }}
                                  className="px-4 min-h-[44px] py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
                                >
                                  Add Program
                                </button>
                              )}
                            </div>

                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-wrap items-end gap-3">
                              <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">
                                  Schedule starts at (set once for this event)
                                </label>
                                <input
                                  type="time"
                                  disabled={!canEdit}
                                  value={normalizeTimeToHHmm(eventForm.programScheduleStartTime)}
                                  onChange={async (e) => {
                                    const v = e.target.value
                                    setEventForm((f) => ({ ...f, programScheduleStartTime: v }))
                                    if (!selectedEventId || !canEdit) return
                                    try {
                                      await updateDepartmentEvent(selectedEventId, { programScheduleStartTime: v })
                                      setDeptEvents((prev) =>
                                        prev.map((ev) =>
                                          ev.id === selectedEventId ? { ...ev, programScheduleStartTime: v } : ev
                                        )
                                      )
                                    } catch {
                                      alert('Failed to save schedule start time')
                                    }
                                  }}
                                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100"
                                />
                              </div>
                              <p className="text-xs text-slate-600 flex-1 min-w-[220px]">
                                Planned start/end for each program row are calculated from this single time + each item’s duration in Program No order.
                                Add Program only asks for duration — not a separate start time per row.
                              </p>
                            </div>

                            {eventForm.programs.length === 0 ? (
                              <p className="text-sm text-slate-500">No programs yet. Add your first program to enable Live Control timer.</p>
                            ) : (
                              <div className="overflow-x-auto">
                                        <table className="min-w-full text-sm border border-slate-200 rounded-lg">
                                  <thead className="bg-slate-50">
                                    <tr>
                                      <th className="text-left px-4 py-2 font-medium text-slate-600">Program No</th>
                                      <th className="text-left px-4 py-2 font-medium text-slate-600">Program</th>
                                      <th className="text-left px-4 py-2 font-medium text-slate-600">Program By</th>
                                      <th className="text-left px-4 py-2 font-medium text-slate-600">Duration</th>
                                      <th className="text-left px-4 py-2 font-medium text-slate-600">Planned start (auto)</th>
                                      <th className="text-left px-4 py-2 font-medium text-slate-600">Planned end (auto)</th>
                                      <th className="text-left px-4 py-2 font-medium text-slate-600">Realtime</th>
                                      <th className="text-left px-4 py-2 font-medium text-slate-600 w-24">Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {(() => {
                                      const sorted = [...eventForm.programs].sort(
                                        (a, b) => Number(a.programNo ?? 0) - Number(b.programNo ?? 0)
                                      )
                                      const anchor = eventForm.programScheduleStartTime
                                      return sorted.map((p, index) => (
                                        <tr key={p.id || `${p.programNo}-${p.programName}`} className="hover:bg-slate-50">
                                          <td className="px-4 py-2 text-slate-800">{p.programNo ?? '—'}</td>
                                          <td className="px-4 py-2 text-slate-800 font-medium">{p.programName || '—'}</td>
                                          <td className="px-4 py-2 text-slate-600">{p.programBy || '—'}</td>
                                          <td className="px-4 py-2 text-slate-600">{p.duration ?? '—'}</td>
                                          <td className="px-4 py-2 text-slate-600">
                                            {plannedSegmentStartHHmm(sorted, anchor, index) || '—'}
                                          </td>
                                          <td className="px-4 py-2 text-slate-600">
                                            {plannedSegmentEndHHmm(sorted, anchor, index) || '—'}
                                          </td>
                                          <td className="px-4 py-2 text-slate-700">
                                            <div className="flex flex-col">
                                              <span className="text-xs text-slate-500">Duration</span>
                                              <span className="font-medium">{p.realtime?.durationMinutes ?? '—'}</span>
                                              <span className="mt-1 text-xs text-slate-500">Time</span>
                                              <span className="font-medium">{p.realtime?.time || '—'}</span>
                                            </div>
                                          </td>
                                          <td className="px-4 py-2">
                                            <button
                                              type="button"
                                              disabled={!canEdit}
                                              onClick={() => {
                                                setEventProgramEditingId(p.id || null)
                                                setEventProgramForm({
                                                  programNo: p.programNo ?? '',
                                                  programName: p.programName ?? '',
                                                  programBy: p.programBy ?? '',
                                                  duration: p.duration ?? '',
                                                })
                                                setEventProgramModalOpen(true)
                                              }}
                                              className="text-blue-600 hover:underline text-sm disabled:opacity-60"
                                            >
                                              Edit
                                            </button>
                                          </td>
                                        </tr>
                                      ))
                                    })()}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {eventProgramModalOpen && canEdit && (
                              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                                <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5">
                                  <h3 className="font-semibold text-slate-800 mb-3">
                                    {eventProgramEditingId ? 'Edit Program' : 'Add Program'}
                                  </h3>
                                  <form
                                    onSubmit={async (e) => {
                                      e.preventDefault()
                                      const programNo = Number(eventProgramForm.programNo)
                                      const programName = String(eventProgramForm.programName || '').trim()
                                      const programBy = String(eventProgramForm.programBy || '').trim()
                                      const duration = Number(eventProgramForm.duration)
                                      if (!programNo || !programName || !programBy || !duration) return
                                      try {
                                        const programsNext = (eventForm.programs || []).slice().sort((a, b) => Number(a.programNo ?? 0) - Number(b.programNo ?? 0))

                                        if (eventProgramEditingId) {
                                          for (let i = 0; i < programsNext.length; i++) {
                                            const p = programsNext[i]
                                            if ((p.id || null) !== eventProgramEditingId) continue
                                            const { time: _legacyTime, ...rest } = p
                                            programsNext[i] = {
                                              ...rest,
                                              programNo,
                                              programName,
                                              programBy,
                                              duration,
                                              realtime: p.realtime ?? { durationMinutes: null, time: null, startAtMs: null },
                                            }
                                          }
                                        } else {
                                          const nextId =
                                            typeof crypto !== 'undefined' && crypto.randomUUID
                                              ? crypto.randomUUID()
                                              : `${Date.now()}-${Math.random().toString(36).slice(2)}`
                                          programsNext.push({
                                            id: nextId,
                                            programNo,
                                            programName,
                                            programBy,
                                            duration,
                                            realtime: { durationMinutes: null, time: null, startAtMs: null },
                                          })
                                        }

                                        const sorted = programsNext.sort((a, b) => Number(a.programNo ?? 0) - Number(b.programNo ?? 0))
                                        await updateDepartmentEvent(selectedEventId, { programs: sorted })
                                        setEventForm((f) => ({ ...f, programs: sorted }))
                                        setDeptEvents((prev) =>
                                          prev.map((ev) => (ev.id === selectedEventId ? { ...ev, programs: sorted } : ev))
                                        )
                                        setEventProgramEditingId(null)
                                        setEventProgramModalOpen(false)
                                      } catch {
                                        alert(eventProgramEditingId ? 'Failed to update program' : 'Failed to add program')
                                      }
                                    }}
                                    className="space-y-3"
                                  >
                                    <div>
                                      <label className="block text-xs text-slate-600 mb-1">Program No *</label>
                                      <input
                                        type="number"
                                        value={eventProgramForm.programNo}
                                        onChange={(e) => setEventProgramForm((f) => ({ ...f, programNo: e.target.value }))}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                                        required
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs text-slate-600 mb-1">Program Name *</label>
                                      <input
                                        type="text"
                                        value={eventProgramForm.programName}
                                        onChange={(e) => setEventProgramForm((f) => ({ ...f, programName: e.target.value }))}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                                        required
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs text-slate-600 mb-1">Program By *</label>
                                      <input
                                        type="text"
                                        value={eventProgramForm.programBy}
                                        onChange={(e) => setEventProgramForm((f) => ({ ...f, programBy: e.target.value }))}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                                        required
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs text-slate-600 mb-1">Duration (mins) *</label>
                                      <input
                                        type="number"
                                        value={eventProgramForm.duration}
                                        onChange={(e) => setEventProgramForm((f) => ({ ...f, duration: e.target.value }))}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                                        required
                                        min="1"
                                      />
                                    </div>
                                    <p className="text-xs text-slate-500">
                                      Set the event <strong>Schedule starts at</strong> once above the table. Planned start/end columns update automatically from that time + each program’s duration in order.
                                    </p>

                                    <div className="flex gap-2 pt-2">
                                      <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium">
                                        Add
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEventProgramModalOpen(false)}
                                        className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </form>
                                </div>
                              </div>
                            )}
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
                                  budget: eventForm.budget,
                                  team: eventForm.team,
                                  programs: eventForm.programs,
                                  liveCellAttendance: eventForm.liveCellAttendance,
                                  programScheduleStartTime: eventForm.programScheduleStartTime,
                                })
                                setDeptEvents((prev) =>
                                  prev.map((e) => (e.id === selectedEventId ? { ...e, ...eventForm } : e))
                                )
                              } catch {
                                alert('Failed to save')
                              }
                            }}
                            className="mt-4 px-4 min-h-[44px] py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
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

          {slug === 'event-m' && activeTab === 'liveControl' && department && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="font-semibold text-slate-800">Live Control</h2>
                  <p className="text-sm text-slate-500">Realtime timer + attendance for the selected event.</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-sm text-slate-700 font-medium">
                    Select Event
                    <select
                      value={selectedEventId || ''}
                      onChange={(e) => setSelectedEventId(e.target.value || null)}
                      className="ml-2 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                      disabled={eventsLoading || deptEvents.length === 0}
                    >
                      <option value="" disabled>
                        Choose…
                      </option>
                      {deptEvents.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {ev.name || 'Untitled'}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 mb-4">
                  {['timer', 'attendance'].map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setLiveControlTab(k)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize ${
                        liveControlTab === k ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>

                {!selectedEventId ? (
                  <p className="text-sm text-slate-500">Select an event to control.</p>
                ) : (
                  <>
                    {liveControlTab === 'timer' && (
                      <div className="space-y-4">
                        <h3 className="font-semibold text-slate-800">Timer</h3>
                        {eventForm.programs.length === 0 ? (
                          <p className="text-sm text-slate-500">No programs found for this event. Add programs in New Event → Program.</p>
                        ) : (
                          <div className="space-y-6">
                            {(() => {
                              const programsSorted = [...(eventForm.programs || [])].sort(
                                (a, b) => Number(a.programNo ?? 0) - Number(b.programNo ?? 0)
                              )
                              const anchor = eventForm.programScheduleStartTime
                              const nextIdx = programsSorted.findIndex((p) => p.realtime?.startAtMs == null)
                              const nextProgram = nextIdx >= 0 ? programsSorted[nextIdx] : null

                              const recordStartAtIndex = async (idx) => {
                                if (!canEdit || idx < 0) return
                                const nowMs = Date.now()
                                const timeStr = formatHHmm(new Date(nowMs))
                                const prevStartMs =
                                  idx > 0 ? programsSorted[idx - 1]?.realtime?.startAtMs ?? null : null
                                const prevDurationMinutes =
                                  prevStartMs == null ? null : Math.max(0, Math.round((nowMs - prevStartMs) / 60000))

                                const programsNext = programsSorted.map((x, i) => {
                                  if (i === idx) {
                                    return {
                                      ...x,
                                      realtime: {
                                        ...(x.realtime || {}),
                                        startAtMs: nowMs,
                                        time: timeStr,
                                        durationMinutes: x.realtime?.durationMinutes ?? null,
                                      },
                                    }
                                  }
                                  if (i === idx - 1 && prevDurationMinutes != null) {
                                    const alreadyHasDuration = x.realtime?.durationMinutes != null
                                    if (alreadyHasDuration) return x
                                    return {
                                      ...x,
                                      realtime: {
                                        ...(x.realtime || {}),
                                        durationMinutes: prevDurationMinutes,
                                      },
                                    }
                                  }
                                  return x
                                })
                                try {
                                  await updateDepartmentEvent(selectedEventId, { programs: programsNext })
                                  setEventForm((f) => ({ ...f, programs: programsNext }))
                                  setDeptEvents((prev) =>
                                    prev.map((ev) => (ev.id === selectedEventId ? { ...ev, programs: programsNext } : ev))
                                  )
                                } catch {
                                  alert('Failed to record start time')
                                }
                              }

                              return (
                                <>
                                  <p className="text-sm text-slate-500">
                                    Tap the large START button when each program begins. The button always shows the{' '}
                                    <strong>next</strong> program to time — same as Cell Sunday flow.
                                  </p>

                                  {/* Program confirmation sheet */}
                                  {liveConfirmOpen && (
                                    <ProgramConfirmSheet
                                      title="Event Program"
                                      items={programsSorted.map(p => ({ name: p.programName, detail: p.duration ? `${p.duration} min` : null }))}
                                      onConfirm={() => { setLiveConfirmOpen(false); recordStartAtIndex(0) }}
                                      onEdit={() => { setLiveConfirmOpen(false); setActiveTab('events') }}
                                    />
                                  )}

                                  <div className="flex flex-col items-center gap-4">
                                    {/* Now-running timer */}
                                    {nextIdx > 0 && (() => {
                                      const running = programsSorted[nextIdx - 1]
                                      const startMs = running?.realtime?.startAtMs
                                      const planned = Number(running?.duration) || null
                                      return startMs ? (
                                        <div className="flex flex-col items-center gap-1">
                                          <p className="text-xs text-slate-500 font-medium">Now running: <strong>{running.programName}</strong></p>
                                          <LiveElapsedTimer startedAtMs={startMs} plannedMinutes={planned} />
                                        </div>
                                      ) : null
                                    })()}

                                    {nextProgram ? (
                                      <>
                                        <button
                                          type="button"
                                          disabled={!canEdit}
                                          onClick={() => nextIdx === 0 ? setLiveConfirmOpen(true) : recordStartAtIndex(nextIdx)}
                                          className={`rounded-xl shadow-lg border-2 flex flex-col items-center justify-center cursor-pointer active:scale-[0.98] transition ${
                                            canEdit
                                              ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-700'
                                              : 'bg-slate-200 text-slate-600 border-slate-300 cursor-not-allowed'
                                          }`}
                                          style={{ width: '3in', minWidth: '3in', height: '3.8in', minHeight: '3.8in' }}
                                        >
                                          <span className="text-3xl md:text-4xl font-bold tracking-wide">START</span>
                                          <span className="text-sm md:text-base text-white/95 mt-3 font-medium text-center px-2">
                                            {nextProgram.programName || 'Program'}
                                          </span>
                                        </button>
                                        <p className="text-xs text-slate-500 mt-2 text-center">
                                          Next to record: <strong>{nextProgram.programName}</strong>
                                        </p>
                                      </>
                                    ) : (
                                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-5 text-center max-w-md">
                                        <p className="font-semibold text-emerald-800">All programs recorded</p>
                                        <p className="text-sm text-emerald-700 mt-1">Realtime times are saved on this event.</p>
                                      </div>
                                    )}
                                  </div>

                                  <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm border border-slate-200 rounded-lg">
                                      <thead className="bg-slate-50">
                                        <tr>
                                          <th className="text-left px-4 py-2 font-medium text-slate-600">Program No</th>
                                          <th className="text-left px-4 py-2 font-medium text-slate-600">Program</th>
                                          <th className="text-left px-4 py-2 font-medium text-slate-600">Program By</th>
                                          <th className="text-left px-4 py-2 font-medium text-slate-600">Planned start</th>
                                          <th className="text-left px-4 py-2 font-medium text-slate-600">Planned end</th>
                                          <th className="text-left px-4 py-2 font-medium text-slate-600">Realtime</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {programsSorted.map((p, index) => {
                                          const time = p.realtime?.time || '—'
                                          const dur = p.realtime?.durationMinutes ?? '—'
                                          return (
                                            <tr key={p.id || `${p.programNo}-${p.programName}`}>
                                              <td className="px-4 py-2 text-slate-800">{p.programNo ?? '—'}</td>
                                              <td className="px-4 py-2 text-slate-800 font-medium">{p.programName || '—'}</td>
                                              <td className="px-4 py-2 text-slate-600">{p.programBy || '—'}</td>
                                              <td className="px-4 py-2 text-slate-600">
                                                {plannedSegmentStartHHmm(programsSorted, anchor, index) || '—'}
                                              </td>
                                              <td className="px-4 py-2 text-slate-600">
                                                {plannedSegmentEndHHmm(programsSorted, anchor, index) || '—'}
                                              </td>
                                              <td className="px-4 py-2 text-slate-700">
                                                <div className="flex flex-col">
                                                  <span className="text-xs text-slate-500">RTD</span>
                                                  <span className="font-medium">{dur}</span>
                                                  <span className="mt-1 text-xs text-slate-500">Start</span>
                                                  <span className="font-medium">{time}</span>
                                                </div>
                                              </td>
                                            </tr>
                                          )
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </>
                              )
                            })()}
                          </div>
                        )}
                      </div>
                    )}

                    {liveControlTab === 'attendance' && (
                      <div className="space-y-4">
                        <h3 className="font-semibold text-slate-800">Attendance</h3>

                        {!canEdit && (
                          <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            You do not have permission to control attendance for this event.
                          </p>
                        )}

                        {liveCellGroupsLoading ? (
                          <p className="text-sm text-slate-500">Loading cell groups…</p>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {liveCellGroups.map((g) => {
                              const expanded = liveExpandedCellId === g.id
                              const presentCount = (eventForm.liveCellAttendance?.[g.id] || []).length
                              return (
                                <div key={g.id} className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
                                  <button
                                    type="button"
                                    onClick={() => setLiveExpandedCellId(expanded ? null : g.id)}
                                    className={`w-full text-left p-4 transition ${
                                      expanded ? 'bg-indigo-100 border-b border-indigo-200' : 'hover:bg-slate-100'
                                    }`}
                                  >
                                    <p className="font-semibold text-slate-800 text-sm leading-tight">{g.cellName || 'Unnamed'}</p>
                                    <p className="text-xs text-slate-500 mt-1">{presentCount} selected</p>
                                  </button>

                                  {expanded && (
                                    <div className="p-3 bg-white max-h-64 overflow-y-auto">
                                      {liveMembersLoading ? (
                                        <p className="text-xs text-slate-500">Loading members…</p>
                                      ) : liveMembersForCell.length === 0 ? (
                                        <p className="text-xs text-slate-500">No active members.</p>
                                      ) : (
                                        <>
                                          <div className="flex gap-2 mb-3 items-end">
                                            <div className="flex-1">
                                              <label className="block text-[11px] text-slate-500 mb-1">Add Name</label>
                                              <input
                                                type="text"
                                                value={liveAddNameInput}
                                                onChange={(e) => setLiveAddNameInput(e.target.value)}
                                                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                                                placeholder="Type name and click Add"
                                              />
                                            </div>
                                            <button
                                              type="button"
                                              disabled={!canEdit || !String(liveAddNameInput || '').trim()}
                                              onClick={() => {
                                                const nm = String(liveAddNameInput || '').trim()
                                                if (!canEdit || !nm) return
                                                const current = new Set(eventForm.liveCellAttendance?.[g.id] || [])
                                                current.add(nm)
                                                const nextMap = { ...(eventForm.liveCellAttendance || {}) }
                                                nextMap[g.id] = Array.from(current)
                                                setEventForm((f) => ({ ...f, liveCellAttendance: nextMap }))
                                                setDeptEvents((prev) =>
                                                  prev.map((ev) =>
                                                    ev.id === selectedEventId ? { ...ev, liveCellAttendance: nextMap } : ev
                                                  )
                                                )
                                                updateDepartmentEvent(selectedEventId, { liveCellAttendance: nextMap }).catch(() => {
                                                  alert('Failed to save attendance')
                                                })
                                                setLiveAddNameInput('')
                                              }}
                                              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
                                            >
                                              Add
                                            </button>
                                          </div>

                                          {(() => {
                                            const presentList = Array.isArray(eventForm.liveCellAttendance?.[g.id])
                                              ? eventForm.liveCellAttendance[g.id]
                                              : []
                                            const presentSet = new Set(presentList)
                                            const memberNames = liveMembersForCell
                                              .map((m) => String(m.name || '').trim())
                                              .filter(Boolean)
                                            const memberNameSet = new Set(memberNames)
                                            const extras = presentList.filter((n) => n && !memberNameSet.has(n))

                                            const pastors = []
                                            const tamil = []
                                            const children = []
                                            const newComers = []
                                            const others = []

                                            for (const m of liveMembersForCell) {
                                              const nm = String(m.name || '').trim()
                                              if (!nm) continue
                                              const roleStr = String(m.role || '').toLowerCase()
                                              if (roleStr.includes('pastor')) pastors.push(m)
                                              else if (roleStr.includes('tamil')) tamil.push(m)
                                              else if (roleStr.includes('child')) children.push(m)
                                              else if (roleStr.includes('new')) newComers.push(m)
                                              else others.push(m)
                                            }

                                            const Category = ({ title, list, showExtras = false }) => (
                                              <div className="mb-4">
                                                <div className="text-xs font-semibold text-slate-600 mb-2">{title}</div>
                                                <div className="flex flex-wrap gap-2">
                                                  {list.map((m) => {
                                                    const nm = String(m.name || '').trim()
                                                    const sel = presentSet.has(nm)
                                                    return (
                                                      <button
                                                        key={m.id}
                                                        type="button"
                                                        disabled={!canEdit || !nm}
                                                        onClick={() => {
                                                          if (!canEdit || !nm) return
                                                          const current = new Set(eventForm.liveCellAttendance?.[g.id] || [])
                                                          if (current.has(nm)) current.delete(nm)
                                                          else current.add(nm)
                                                          const nextMap = { ...(eventForm.liveCellAttendance || {}) }
                                                          nextMap[g.id] = Array.from(current)
                                                          setEventForm((f) => ({ ...f, liveCellAttendance: nextMap }))
                                                          setDeptEvents((prev) =>
                                                            prev.map((ev) =>
                                                              ev.id === selectedEventId
                                                                ? { ...ev, liveCellAttendance: nextMap }
                                                                : ev
                                                            )
                                                          )
                                                          updateDepartmentEvent(selectedEventId, { liveCellAttendance: nextMap }).catch(() => {
                                                            alert('Failed to save attendance')
                                                          })
                                                        }}
                                                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                                                          sel
                                                            ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm'
                                                            : 'bg-slate-100 text-slate-800 border-slate-200 hover:bg-slate-200'
                                                        } ${!canEdit ? 'opacity-70 cursor-default' : ''}`}
                                                      >
                                                        {nm || '—'}
                                                      </button>
                                                    )
                                                  })}
                                                  {showExtras &&
                                                    extras.map((nm, idx) => (
                                                      <button
                                                        key={`${nm}-${idx}`}
                                                        type="button"
                                                        disabled={!canEdit}
                                                        onClick={() => {
                                                          const current = new Set(eventForm.liveCellAttendance?.[g.id] || [])
                                                          current.delete(nm)
                                                          const nextMap = { ...(eventForm.liveCellAttendance || {}) }
                                                          nextMap[g.id] = Array.from(current)
                                                          setEventForm((f) => ({ ...f, liveCellAttendance: nextMap }))
                                                          setDeptEvents((prev) =>
                                                            prev.map((ev) =>
                                                              ev.id === selectedEventId ? { ...ev, liveCellAttendance: nextMap } : ev
                                                            )
                                                          )
                                                          updateDepartmentEvent(selectedEventId, { liveCellAttendance: nextMap }).catch(() => {
                                                            alert('Failed to save attendance')
                                                          })
                                                        }}
                                                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                                                          'bg-indigo-600 text-white border-indigo-700 shadow-sm'
                                                        } ${!canEdit ? 'opacity-70 cursor-default' : ''}`}
                                                      >
                                                        {nm}
                                                      </button>
                                                    ))}
                                                </div>
                                              </div>
                                            )

                                            return (
                                              <div>
                                                <Category title="Pastors" list={pastors} />
                                                <Category title="Tamil" list={tamil} />
                                                <Category title="Others" list={others} showExtras />
                                                <Category title="New Comers" list={newComers} />
                                                <Category title="Children" list={children} />
                                                {pastors.length + tamil.length + others.length + newComers.length + children.length === 0 && (
                                                  <p className="text-xs text-slate-500">No members.</p>
                                                )}
                                              </div>
                                            )
                                          })()}
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                            {liveCellGroups.length === 0 && <p className="text-sm text-slate-500">No cell groups found.</p>}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {(activeTab === 'financial' || ((slug === 'cell' || slug === 'sunday-ministry' || slug === 'media' || slug === 'administration' || slug === 'accounts' || slug === 'caring' || slug === 'd-light') && activeTab === 'operations' && opsSubTab === 'financial')) && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <h2 className="font-semibold text-slate-800 p-5 pb-0">Budget & Spending</h2>
              <p className="text-sm text-slate-500 px-5 pt-1">Budget items for this department (₹).</p>
              {slug === 'event-m' && (
                <div className="px-5 pt-4">
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                      <h3 className="font-semibold text-slate-800">Spending</h3>
                      {canEdit && <span className="text-xs text-slate-500">Record spending per event.</span>}
                    </div>

                    {canEdit && (
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault()
                          if (!spendingEventId) return
                          const eventName = deptEvents.find((x) => x.id === spendingEventId)?.name || ''
                          const amountNum = Number(spendingAmount) || 0
                          const desc = String(spendingDescription || '').trim()
                          const items = String(spendingItemsPurchased || '').trim()
                          try {
                            await addEventSpendingItem(
                              {
                                department: department?.name,
                                eventId: spendingEventId,
                                eventName,
                                amount: amountNum,
                                description: desc,
                                itemsPurchased: items,
                              },
                              userProfile?.email || userProfile?.displayName || 'unknown'
                            )
                            const list = await getEventSpendingItemsByDepartment(department?.name)
                            setEventSpendingItems(list)
                            setSpendingAmount('')
                            setSpendingItemsPurchased('')
                            setSpendingDescription('')
                          } catch {
                            alert('Failed to save spending')
                          }
                        }}
                        className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                      >
                        <div className="sm:col-span-2">
                          <label className="block text-xs text-slate-600 mb-1">Event</label>
                          <select
                            value={spendingEventId}
                            onChange={(e) => setSpendingEventId(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
                          >
                            {deptEvents.length === 0 ? (
                              <option value="">No events — create one in New Event first</option>
                            ) : (
                              deptEvents.map((ev) => (
                                <option key={ev.id} value={ev.id}>
                                  {ev.name || 'Untitled'}
                                </option>
                              ))
                            )}
                          </select>
                          <p className="text-[11px] text-slate-500 mt-1">The event name saved on each row is taken from this list (e.g. Anniversary).</p>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs text-slate-600 mb-1">Items purchased</label>
                          <input
                            type="text"
                            value={spendingItemsPurchased}
                            onChange={(e) => setSpendingItemsPurchased(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
                            placeholder="What was bought (e.g. decorations, sound, gifts…)"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">Amount (₹)</label>
                          <input
                            type="number"
                            value={spendingAmount}
                            onChange={(e) => setSpendingAmount(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
                            placeholder="Amount"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">Notes (optional)</label>
                          <input
                            type="text"
                            value={spendingDescription}
                            onChange={(e) => setSpendingDescription(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
                            placeholder="Receipt / vendor / extra notes"
                          />
                        </div>
                        <div className="sm:col-span-2 flex justify-end">
                          <button
                            type="submit"
                            disabled={deptEvents.length === 0}
                            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
                          >
                            + Add spending
                          </button>
                        </div>
                      </form>
                    )}

                    <div className="mt-4">
                      {loadingEventSpending ? (
                        <p className="text-sm text-slate-500">Loading spending…</p>
                      ) : eventSpendingItems.length === 0 ? (
                        <p className="text-sm text-slate-500">No spending recorded yet.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm border border-slate-200 rounded-lg">
                            <thead className="bg-slate-50">
                              <tr>
                                <th className="text-left px-4 py-2 font-medium text-slate-600">Event</th>
                                <th className="text-left px-4 py-2 font-medium text-slate-600">Items purchased</th>
                                <th className="text-left px-4 py-2 font-medium text-slate-600">Amount (₹)</th>
                                <th className="text-left px-4 py-2 font-medium text-slate-600">Notes</th>
                                {canEdit && (
                                  <th className="text-left px-4 py-2 font-medium text-slate-600 w-24">Actions</th>
                                )}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {eventSpendingItems.map((row) => (
                                <tr key={row.id} className="hover:bg-slate-50">
                                  <td className="px-4 py-2 text-slate-800 font-medium">{row.eventName || '—'}</td>
                                  <td className="px-4 py-2 text-slate-600 max-w-[220px]">{row.itemsPurchased || '—'}</td>
                                  <td className="px-4 py-2 text-slate-600">{Number(row.amount || 0).toLocaleString()}</td>
                                  <td className="px-4 py-2 text-slate-600 max-w-[220px]">{row.description || '—'}</td>
                                  {canEdit && (
                                    <td className="px-4 py-2">
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          if (!window.confirm('Delete this spending record?')) return
                                          try {
                                            await deleteEventSpendingItem(row.id)
                                            setEventSpendingItems((prev) => prev.filter((x) => x.id !== row.id))
                                          } catch {
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
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
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
              ) : budgetItems.length === 0 ? (
                <div className="px-5 py-8 text-center text-slate-500 text-sm">No budget items. Add a row to get started.</div>
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="sm:hidden divide-y divide-slate-100">
                    {budgetItems.map((row) => {
                      const totalCost = (Number(row.quantity) || 0) * (Number(row.unitCost) || 0)
                      return (
                        <div key={row.id} className="p-4 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold text-slate-800 text-sm">{row.category || '—'}</p>
                              {row.subCategory && <p className="text-xs text-slate-500">{row.subCategory}</p>}
                            </div>
                            <p className="font-bold text-slate-800 text-sm shrink-0">₹ {totalCost.toLocaleString()}</p>
                          </div>
                          {row.description && <p className="text-sm text-slate-600">{row.description}</p>}
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                            {row.quantity && <span>Qty: {row.quantity}</span>}
                            {row.unitCost != null && row.unitCost !== '' && <span>Unit: ₹ {Number(row.unitCost).toLocaleString()}</span>}
                            {row.expectedDate && <span>By: {formatDMY(row.expectedDate)}</span>}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {row.priority && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">{row.priority}</span>}
                            {row.type && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600">{row.type}</span>}
                          </div>
                          {row.justification && <p className="text-xs text-slate-400 italic">{row.justification}</p>}
                          {canEdit && (
                            <div className="flex gap-3 pt-1">
                              <button type="button" onClick={() => { setEditingBudgetId(row.id); setBudgetForm({ category: row.category || '', subCategory: row.subCategory || '', description: row.description || '', quantity: row.quantity ?? '', unitCost: row.unitCost ?? '', priority: row.priority || 'Medium', type: row.type || 'Recurring', justification: row.justification || '', expectedDate: row.expectedDate ? (typeof row.expectedDate === 'string' ? row.expectedDate : format(new Date(row.expectedDate), 'yyyy-MM-dd')) : format(new Date(), 'yyyy-MM-dd') }); setBudgetModalOpen(true) }} className="text-sm text-blue-600 font-medium hover:underline">Edit</button>
                              <button type="button" onClick={async () => { if (!window.confirm('Delete this budget row?')) return; await deleteFinanceBudgetItem(row.id); setBudgetItems((prev) => prev.filter((r) => r.id !== row.id)) }} className="text-sm text-red-500 hover:underline">Delete</button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {/* Desktop table */}
                  <div className="hidden sm:block overflow-x-auto">
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
                          {canEdit && <th className="text-left px-4 py-2 font-medium text-slate-600">Actions</th>}
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
                              <td className="px-4 py-2 text-slate-600">{row.unitCost != null && row.unitCost !== '' ? `₹ ${Number(row.unitCost).toLocaleString()}` : '—'}</td>
                              <td className="px-4 py-2 font-medium text-slate-800">₹ {totalCost.toLocaleString()}</td>
                              <td className="px-4 py-2 text-slate-600">{row.priority || '—'}</td>
                              <td className="px-4 py-2 text-slate-600">{row.type || '—'}</td>
                              <td className="px-4 py-2 text-slate-600 max-w-[180px] truncate" title={row.justification || ''}>{row.justification || '—'}</td>
                              <td className="px-4 py-2 text-slate-600">{row.expectedDate ? formatDMY(row.expectedDate) : '—'}</td>
                              {canEdit && (
                                <td className="px-4 py-2 space-x-2">
                                  <button type="button" onClick={() => { setEditingBudgetId(row.id); setBudgetForm({ category: row.category || '', subCategory: row.subCategory || '', description: row.description || '', quantity: row.quantity ?? '', unitCost: row.unitCost ?? '', priority: row.priority || 'Medium', type: row.type || 'Recurring', justification: row.justification || '', expectedDate: row.expectedDate ? (typeof row.expectedDate === 'string' ? row.expectedDate : format(new Date(row.expectedDate), 'yyyy-MM-dd')) : format(new Date(), 'yyyy-MM-dd') }); setBudgetModalOpen(true) }} className="text-blue-600 hover:underline">Edit</button>
                                  <button type="button" onClick={async () => { if (!window.confirm('Delete this budget row?')) return; await deleteFinanceBudgetItem(row.id); setBudgetItems((prev) => prev.filter((r) => r.id !== row.id)) }} className="text-red-600 hover:underline">Delete</button>
                                </td>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'cellGroups' && slug === 'cell' && (
            <div className="space-y-6">

              {/* Profile Fill Requests — visible to Cell Leaders (non-Directors) */}
              {!canViewAllCells && pendingFillInvitations.length > 0 && (
                <div className="bg-white rounded-xl border border-violet-200 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 bg-violet-50 border-b border-violet-100 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-violet-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-violet-800">Profile Fill Requests</p>
                      <p className="text-xs text-violet-500">The Caring Director has asked you to provide profile details for these people.</p>
                    </div>
                    <span className="bg-violet-500 text-white text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                      {pendingFillInvitations.length}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {pendingFillInvitations.map(inv => (
                      <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="w-9 h-9 rounded-full bg-violet-100 text-violet-700 text-sm font-bold flex items-center justify-center flex-shrink-0">
                          {String(inv.personName || '?').split(' ').slice(0, 2).map(w => (w[0] || '').toUpperCase()).join('')}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-900 text-sm truncate">{inv.personName || 'Unknown'}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{inv.cellName ? `Cell: ${inv.cellName}` : 'Profile details requested'}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setFillInviteOpen(inv)
                            setFillInviteForm({
                              phone: '', dob: '', nativity: '', currentPlace: '',
                              baptised: '', baptismDate: '', baptismPlace: '', baptismChurch: '', baptismChurchIsOther: false,
                              maritalStatus: '', marriageDate: '', spouseName: '',
                            })
                          }}
                          className="px-3 py-1.5 bg-violet-600 text-white text-xs font-semibold rounded-xl hover:bg-violet-700 transition-colors flex-shrink-0"
                        >
                          Fill Profile
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                    <p className="text-xs text-slate-500 mt-0.5">{formatDMY(latestCellAttendance.date)}</p>
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
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
                      <div key={cell.id} className={`${expandedCellId === cell.id ? 'col-span-full' : ''} ${tileStyle.bg} ${tileStyle.text} rounded-xl overflow-hidden shadow-lg border ${expandedCellId === cell.id ? 'border-white/60 ring-2 ring-white/40' : 'border-white/20'} transition`}>
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
                          <div className="border-t border-slate-200 p-4 bg-white">
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
                                    setCellMemberForm({ name: '', birthday: '', anniversary: '', phone: '', locality: '', since: new Date().toISOString().slice(0, 10), status: 'active', visitorId: '', baptismDate: '', baptismPlace: '', marriageDate: '', spouseName: '' })
                                    setCellMemberVisitorSearch('')
                                    setCellMemberModalOpen(true)
                                    if (cellMemberVisitors.length === 0) {
                                      getDelightVisitors().then(setCellMemberVisitors).catch(() => {})
                                    }
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
                                              const wb = XLSX.read(data, { type: 'binary' })
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
                                      {cellMembers.filter((m) => m.status !== 'inactive').map((m, idx) => {
                                        const isDuplicate = duplicateCellMemberKeys.has(m.visitorId || ('name:' + (m.name || '').toLowerCase().trim()))
                                        return (
                                        <tr key={m.id} className={isDuplicate ? 'bg-red-50 border-l-4 border-red-400 hover:bg-red-100' : 'hover:bg-slate-50'}>
                                          <td className="px-3 py-2 text-slate-600">{idx + 1}</td>
                                          <td className="px-3 py-2">
                                            <div className="flex items-center gap-1.5">
                                              {isDuplicate && (
                                                <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="This person is in multiple cell groups" />
                                              )}
                                              <span className={isDuplicate ? 'text-red-800 font-semibold' : 'text-slate-800'}>{m.name || '—'}</span>
                                              {m.visitorId
                                                ? <span title="Linked to visitor entry" className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">🔗 Linked</span>
                                                : <span title="Not linked to visitor entry" className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400">Unlinked</span>
                                              }
                                            </div>
                                          </td>
                                          <td className="px-3 py-2 text-slate-600">{m.birthday ? formatDMY(m.birthday) : '—'}</td>
                                          <td className="px-3 py-2 text-slate-600">{m.anniversary ? formatDMY(m.anniversary) : '—'}</td>
                                          <td className="px-3 py-2 text-slate-600">{m.phone || '—'}</td>
                                          <td className="px-3 py-2 text-slate-600">{m.locality || '—'}</td>
                                          <td className="px-3 py-2 text-slate-600">{m.since ? `${differenceInDays(new Date(), new Date(m.since))} days` : '—'}</td>
                                          {canEdit && (
                                            <td className="px-3 py-2 space-x-2 whitespace-nowrap">
                                              <button type="button" onClick={() => {
                                                setEditingCellMemberId(m.id)
                                                setCellMemberForm({ name: m.name || '', birthday: m.birthday ? String(m.birthday).slice(0, 10) : '', anniversary: m.anniversary ? String(m.anniversary).slice(0, 10) : '', phone: m.phone || '', locality: m.locality || '', since: m.since ? String(m.since).slice(0, 10) : '', status: m.status || 'active', visitorId: m.visitorId || '', baptismDate: '', baptismPlace: '', marriageDate: '', spouseName: '' })
                                                setCellMemberLinkedVisitor(null)
                                                setCellMemberLinkedVisitorForm({ email: '', nativity: '', currentPlace: '', serviceAttended: '', attendedDate: '', howKnown: '' })
                                                if (m.visitorId) {
                                                  getDelightVisitorById(m.visitorId).then(v => {
                                                    if (v) {
                                                      setCellMemberLinkedVisitor(v)
                                                      setCellMemberLinkedVisitorForm({ email: v.email || '', nativity: v.nativity || '', currentPlace: v.currentPlace || '', serviceAttended: v.serviceAttended || '', attendedDate: v.attendedDate || '', howKnown: v.howKnown || '' })
                                                    }
                                                  }).catch(() => {})
                                                  getMemberProfile(m.visitorId).then(p => {
                                                    if (p) setCellMemberForm(f => ({ ...f, baptismDate: p.baptismDate || '', baptismPlace: p.baptismPlace || '', marriageDate: p.marriageDate || '', spouseName: p.spouseName || '' }))
                                                  }).catch(() => {})
                                                }
                                                setCellMemberModalOpen(true)
                                              }} className="text-blue-600 hover:underline">Edit</button>
                                              <button type="button" onClick={() => setCellMemberLinking({ member: m, cellId: cell.id })} className="text-indigo-600 hover:underline">{m.visitorId ? 'Relink' : 'Link'}</button>
                                              <button type="button" onClick={async () => { if (!window.confirm('Remove this member?')) return; await deleteCellGroupMember(cell.id, m.id); const list = await getCellGroupMembers(cell.id); setCellMembers(list); setCellGroups((prev) => prev.map((c) => (c.id === cell.id ? { ...c, memberCount: list.length } : c))); refreshAllCellMembers() }} className="text-red-600 hover:underline">Delete</button>
                                              <button type="button" onClick={async () => { await updateCellGroupMember(cell.id, m.id, { status: 'inactive' }); const list = await getCellGroupMembers(cell.id); setCellMembers(list); refreshAllCellMembers() }} className="text-amber-600 hover:underline">Make Inactive</button>
                                            </td>
                                          )}
                                        </tr>
                                        )
                                      })}
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
                                          <td className="px-3 py-2">
                                            <div className="flex items-center gap-1.5">
                                              <span className="text-slate-800">{m.name || '—'}</span>
                                              {m.visitorId
                                                ? <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">🔗 Linked</span>
                                                : <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400">Unlinked</span>
                                              }
                                            </div>
                                          </td>
                                          <td className="px-3 py-2 text-slate-600">{m.birthday ? formatDMY(m.birthday) : '—'}</td>
                                          <td className="px-3 py-2 text-slate-600">{m.anniversary ? formatDMY(m.anniversary) : '—'}</td>
                                          <td className="px-3 py-2 text-slate-600">{m.phone || '—'}</td>
                                          <td className="px-3 py-2 text-slate-600">{m.locality || '—'}</td>
                                          <td className="px-3 py-2 text-slate-600">{m.since ? `${differenceInDays(new Date(), new Date(m.since))} days` : '—'}</td>
                                          {canEdit && (
                                            <td className="px-3 py-2 space-x-2 whitespace-nowrap">
                                              <button type="button" onClick={() => {
                                                setEditingCellMemberId(m.id)
                                                setCellMemberForm({ name: m.name || '', birthday: m.birthday ? String(m.birthday).slice(0, 10) : '', anniversary: m.anniversary ? String(m.anniversary).slice(0, 10) : '', phone: m.phone || '', locality: m.locality || '', since: m.since ? String(m.since).slice(0, 10) : '', status: 'inactive', visitorId: m.visitorId || '', baptismDate: '', baptismPlace: '', marriageDate: '', spouseName: '' })
                                                setCellMemberLinkedVisitor(null)
                                                setCellMemberLinkedVisitorForm({ email: '', nativity: '', currentPlace: '', serviceAttended: '', attendedDate: '', howKnown: '' })
                                                if (m.visitorId) {
                                                  getDelightVisitorById(m.visitorId).then(v => {
                                                    if (v) {
                                                      setCellMemberLinkedVisitor(v)
                                                      setCellMemberLinkedVisitorForm({ email: v.email || '', nativity: v.nativity || '', currentPlace: v.currentPlace || '', serviceAttended: v.serviceAttended || '', attendedDate: v.attendedDate || '', howKnown: v.howKnown || '' })
                                                    }
                                                  }).catch(() => {})
                                                  getMemberProfile(m.visitorId).then(p => {
                                                    if (p) setCellMemberForm(f => ({ ...f, baptismDate: p.baptismDate || '', baptismPlace: p.baptismPlace || '', marriageDate: p.marriageDate || '', spouseName: p.spouseName || '' }))
                                                  }).catch(() => {})
                                                }
                                                setCellMemberModalOpen(true)
                                              }} className="text-blue-600 hover:underline">Edit</button>
                                              <button type="button" onClick={() => setCellMemberLinking({ member: m, cellId: cell.id })} className="text-indigo-600 hover:underline">{m.visitorId ? 'Relink' : 'Link'}</button>
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
                        <button type="submit" className="px-4 min-h-[44px] py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors">Save</button>
                        <button type="button" onClick={() => setCellAttendanceModalOpen(false)} className="px-4 min-h-[44px] py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 transition-colors">Cancel</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'reports' && slug === 'cell' && <CellReportsTab />}

          {activeTab === 'leaderEntry' && slug === 'cell' && <CellLeaderEntryTab />}

          {activeTab === 'operations' && slug === 'cell' && (
            <div className="space-y-4">
              <CellOperationsToggle value={opsSubTab} onChange={setOpsSubTab} />
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
                    <button type="submit" className="px-4 min-h-[44px] py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors">Save</button>
                    <button type="button" onClick={() => setCellGroupModalOpen(false)} className="px-4 min-h-[44px] py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 transition-colors">Cancel</button>
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
                    <button type="submit" className="px-4 min-h-[44px] py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors">Save</button>
                    <button type="button" onClick={() => { setCellGroupEditModalOpen(false); setEditingCellGroupId(null) }} className="px-4 min-h-[44px] py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 transition-colors">Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {cellMemberLinking && (
            <CellMemberLinkModal
              member={cellMemberLinking.member}
              cellId={cellMemberLinking.cellId}
              onLink={async (visitor) => {
                const member = cellMemberLinking.member
                // Cell member's data takes priority; visitor fills any gaps
                const name = member.name || visitor.name
                const phone = member.phone || visitor.phone || ''
                const birthday = member.birthday || (visitor.dob ? String(visitor.dob).slice(0, 10) : '')
                const cellUpdate = { name, phone, birthday, visitorId: visitor.id }
                await updateCellGroupMember(cellMemberLinking.cellId, member.id, cellUpdate)
                syncVisitorDataEverywhere(visitor.id, { name, phone, dob: birthday }).catch(() => {})
                setCellMembers(prev => prev.map(m => m.id === member.id ? { ...m, ...cellUpdate } : m))
                setCellMemberLinking(null)
                // Open the edit modal immediately so the user can see and confirm the merged details
                setEditingCellMemberId(member.id)
                setCellMemberForm({
                  name,
                  phone,
                  birthday,
                  anniversary: member.anniversary ? String(member.anniversary).slice(0, 10) : '',
                  locality: member.locality || '',
                  since: member.since ? String(member.since).slice(0, 10) : '',
                  status: member.status || 'active',
                  visitorId: visitor.id,
                  baptismDate: '',
                  baptismPlace: '',
                  marriageDate: '',
                  spouseName: '',
                })
                setCellMemberLinkedVisitorForm({ email: visitor.email || '', nativity: visitor.nativity || '', currentPlace: visitor.currentPlace || '', serviceAttended: visitor.serviceAttended || '', attendedDate: visitor.attendedDate || '', howKnown: visitor.howKnown || '' })
                setCellMemberLinkedVisitor({ ...visitor, name, phone })
                setCellMemberModalOpen(true)
              }}
              onClose={() => setCellMemberLinking(null)}
            />
          )}

          {teamMemberLinking && (
            <CellMemberLinkModal
              member={teamMemberLinking}
              onLink={async (visitor) => {
                const updated = {
                  name: visitor.name,
                  phone: visitor.phone || teamMemberLinking.phone,
                  visitorId: visitor.id,
                }
                await updateDepartmentTeamMember(teamMemberLinking.id, updated)
                setTeam(prev => prev.map(m => m.id === teamMemberLinking.id ? { ...m, ...updated } : m))
                setTeamMemberLinking(null)
              }}
              onClose={() => setTeamMemberLinking(null)}
            />
          )}

          {cellMemberModalOpen && expandedCellId && (
            <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
              <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md flex flex-col max-h-[92vh]">
                {/* Header */}
                <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
                  <h3 className="text-base font-semibold text-slate-800">{editingCellMemberId ? 'Edit Member' : 'Add Member'}</h3>
                  <button type="button" onClick={() => { setCellMemberModalOpen(false); setEditingCellMemberId(null) }}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 text-xl">×</button>
                </div>

                <div className="overflow-y-auto min-h-0 flex-1">
                  <form
                    id="cell-member-form"
                    onSubmit={async (e) => {
                      e.preventDefault()
                      if (!editingCellMemberId && !cellMemberForm.visitorId) {
                        alert('Please select a person from the visitor list above.')
                        return
                      }
                      try {
                        if (editingCellMemberId) {
                          await updateCellGroupMember(expandedCellId, editingCellMemberId, cellMemberForm)
                          setCellMembers((prev) => prev.map((m) => (m.id === editingCellMemberId ? { ...m, ...cellMemberForm } : m)))
                          if (cellMemberForm.visitorId) {
                            syncVisitorDataEverywhere(cellMemberForm.visitorId, {
                              name: cellMemberForm.name,
                              phone: cellMemberForm.phone,
                              dob: cellMemberForm.birthday,
                            }).catch(() => {})
                            if (cellMemberLinkedVisitorForm.email || cellMemberLinkedVisitorForm.nativity || cellMemberLinkedVisitorForm.currentPlace) {
                              await updateDelightVisitor(cellMemberForm.visitorId, { ...cellMemberLinkedVisitorForm })
                            }
                            await upsertMemberProfile(cellMemberForm.visitorId, {
                              baptismDate:  cellMemberForm.baptismDate  || '',
                              baptismPlace: cellMemberForm.baptismPlace || '',
                              marriageDate: cellMemberForm.marriageDate || '',
                              spouseName:   cellMemberForm.spouseName   || '',
                            }, userProfile?.email || '')
                          }
                        } else {
                          const addKey = cellMemberForm.visitorId || ('name:' + (cellMemberForm.name || '').toLowerCase().trim())
                          const conflict = allCellMembers.find(m => m.status !== 'inactive' && m.cellId !== expandedCellId && (m.visitorId || ('name:' + (m.name || '').toLowerCase().trim())) === addKey)
                          if (conflict) {
                            const otherCell = cellGroups.find(c => c.id === conflict.cellId)
                            alert(`${cellMemberForm.name || 'This person'} is already a member of "${otherCell?.cellName || otherCell?.name || 'another cell group'}". A person can only be in one cell group.`)
                            return
                          }
                          await addCellGroupMember(expandedCellId, cellMemberForm)
                          const list = await getCellGroupMembers(expandedCellId)
                          setCellMembers(list)
                          setCellGroups((prev) => prev.map((c) => (c.id === expandedCellId ? { ...c, memberCount: list.length } : c)))
                          refreshAllCellMembers()
                        }
                        setCellMemberModalOpen(false)
                        setEditingCellMemberId(null)
                        setCellMemberLinkedVisitor(null)
                        setCellMemberForm({ name: '', birthday: '', anniversary: '', phone: '', locality: '', since: new Date().toISOString().slice(0, 10), status: 'active', visitorId: '', baptismDate: '', baptismPlace: '', marriageDate: '', spouseName: '' })
                      } catch (err) {
                        console.error(err)
                        alert('Failed to save')
                      }
                    }}
                    className="p-5 space-y-4"
                  >
                    {/* Visitor picker — only for Add mode */}
                    {!editingCellMemberId && (
                      <div className="rounded-xl border border-indigo-100 bg-indigo-50 overflow-hidden">
                        <div className="px-3 pt-3 pb-2">
                          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-2">Select from Visitor Entry</p>
                          <div className="relative">
                            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 14 14" fill="none">
                              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
                              <path d="M9.5 9.5l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                            </svg>
                            <input
                              type="text"
                              placeholder="Search visitor name…"
                              value={cellMemberVisitorSearch}
                              onChange={e => setCellMemberVisitorSearch(e.target.value)}
                              className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 placeholder-slate-400"
                            />
                          </div>
                        </div>
                        <div className="max-h-44 overflow-y-auto border-t border-indigo-100">
                          {cellMemberVisitors.length === 0 ? (
                            <p className="px-3 py-4 text-xs text-slate-400 text-center">Loading visitors…</p>
                          ) : (() => {
                            const q = cellMemberVisitorSearch.trim().toLowerCase()
                            const matches = cellMemberVisitors.filter(v =>
                              !q || v.name.toLowerCase().includes(q)
                            )
                            if (matches.length === 0) return (
                              <p className="px-3 py-4 text-xs text-slate-400 text-center">No matches found.</p>
                            )
                            return matches.map(v => (
                              <button
                                key={v.id}
                                type="button"
                                onClick={() => {
                                  setCellMemberForm(f => ({
                                    ...f,
                                    name: v.name,
                                    phone: v.phone || f.phone,
                                    birthday: v.dob ? String(v.dob).slice(0, 10) : f.birthday,
                                    visitorId: v.id,
                                  }))
                                  setCellMemberVisitorSearch('')
                                }}
                                className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-indigo-100 border-b border-indigo-50 transition-colors last:border-0"
                              >
                                <div className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                                  {v.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-slate-800 truncate">{v.name}</p>
                                  {v.phone && <p className="text-xs text-slate-400">{v.phone}</p>}
                                </div>
                                {cellMemberForm.name === v.name && (
                                  <span className="ml-auto text-xs text-indigo-500 font-medium flex-shrink-0">Selected</span>
                                )}
                              </button>
                            ))
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Name field */}
                    {editingCellMemberId ? (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
                        <input
                          type="text"
                          value={cellMemberForm.name}
                          onChange={(e) => setCellMemberForm((f) => ({ ...f, name: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                          required
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Selected Person</label>
                        {cellMemberForm.name ? (
                          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-indigo-200 bg-indigo-50">
                            <div className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                              {cellMemberForm.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm font-medium text-slate-800 flex-1">{cellMemberForm.name}</span>
                            <button type="button" onClick={() => setCellMemberForm(f => ({ ...f, name: '', phone: '', birthday: '', visitorId: '' }))} className="text-slate-400 hover:text-red-500 text-lg leading-none">×</button>
                          </div>
                        ) : (
                          <div className="px-3 py-2.5 rounded-lg border border-dashed border-slate-300 text-sm text-slate-400 text-center">
                            Search and select a visitor above
                          </div>
                        )}
                      </div>
                    )}

                    {/* Linked visitor info — shown only when editing a linked member */}
                    {editingCellMemberId && cellMemberForm.visitorId && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 overflow-hidden">
                        <div className="px-3 py-2.5 border-b border-emerald-100 flex items-center gap-2">
                          <span className="text-emerald-600 text-sm">🔗</span>
                          <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Visitor Entry Details</p>
                          {!cellMemberLinkedVisitor && <span className="text-xs text-emerald-400 ml-auto">Loading…</span>}
                        </div>
                        {cellMemberLinkedVisitor && (
                          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {[
                              { label: 'Email', key: 'email', type: 'email' },
                              { label: 'Nativity', key: 'nativity' },
                              { label: 'Current Place', key: 'currentPlace' },
                              { label: 'Service Attended', key: 'serviceAttended' },
                              { label: 'Date Attended', key: 'attendedDate', type: 'date' },
                              { label: 'How Known', key: 'howKnown' },
                            ].map(({ label, key, type = 'text' }) => (
                              <div key={key}>
                                <label className="block text-xs font-medium text-emerald-700 mb-1">{label}</label>
                                <input
                                  type={type}
                                  value={cellMemberLinkedVisitorForm[key] || ''}
                                  onChange={e => setCellMemberLinkedVisitorForm(f => ({ ...f, [key]: e.target.value }))}
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                        <p className="px-3 pb-2 text-xs text-emerald-500">Changes saved here will also update in Visitor Entry and PCS.</p>
                      </div>
                    )}

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

                    {/* Spiritual Records — only shown when member is linked (has visitorId) */}
                    {(editingCellMemberId && cellMemberForm.visitorId) && (
                      <div className="rounded-xl border border-violet-200 bg-violet-50 overflow-hidden">
                        <div className="px-3 py-2.5 border-b border-violet-100">
                          <p className="text-xs font-bold text-violet-700 uppercase tracking-wide">Spiritual Records</p>
                          <p className="text-xs text-violet-400 mt-0.5">Saved to member profile · visible across the app</p>
                        </div>
                        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-violet-700 mb-1">Baptism Date</label>
                            <input type="date" value={cellMemberForm.baptismDate} onChange={e => setCellMemberForm(f => ({ ...f, baptismDate: e.target.value }))} className="w-full px-2.5 py-1.5 rounded-lg border border-violet-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-violet-700 mb-1">Baptism Place</label>
                            <input type="text" placeholder="Church / Location" value={cellMemberForm.baptismPlace} onChange={e => setCellMemberForm(f => ({ ...f, baptismPlace: e.target.value }))} className="w-full px-2.5 py-1.5 rounded-lg border border-violet-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-violet-700 mb-1">Marriage Date</label>
                            <input type="date" value={cellMemberForm.marriageDate} onChange={e => setCellMemberForm(f => ({ ...f, marriageDate: e.target.value }))} className="w-full px-2.5 py-1.5 rounded-lg border border-violet-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-violet-700 mb-1">Spouse Name</label>
                            <input type="text" placeholder="Spouse full name" value={cellMemberForm.spouseName} onChange={e => setCellMemberForm(f => ({ ...f, spouseName: e.target.value }))} className="w-full px-2.5 py-1.5 rounded-lg border border-violet-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
                          </div>
                        </div>
                      </div>
                    )}
                  </form>
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-slate-100 flex gap-2 flex-shrink-0">
                  <button type="submit" form="cell-member-form" className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700">Save</button>
                  <button type="button" onClick={() => { setCellMemberModalOpen(false); setEditingCellMemberId(null) }}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
                </div>
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
                    className="px-4 min-h-[44px] py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 transition-colors"
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
                    className="px-4 min-h-[44px] py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 transition-colors"
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
                      className="px-4 min-h-[44px] py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUpdateModalOpen(false)
                        setEditingUpdateId(null)
                      }}
                      className="px-4 min-h-[44px] py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 transition-colors"
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

      {/* ─── Cell Leader Profile Fill Modal ───────────────────────────────── */}
      {fillInviteOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[88vh]">

            {/* Header */}
            <div className="px-4 pt-4 pb-3 border-b border-slate-100 flex items-start justify-between gap-3 flex-shrink-0">
              <div>
                <p className="font-bold text-slate-800 text-sm">Fill Profile Details</p>
                <p className="text-xs text-violet-500 font-medium mt-0.5">{fillInviteOpen.personName}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Requested by Caring Director — fill in what you know</p>
              </div>
              <button type="button" onClick={() => setFillInviteOpen(null)} className="w-10 h-10 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors text-xl flex-shrink-0">×</button>
            </div>

            {/* Form */}
            <div className="overflow-y-auto flex-1 px-4 py-4 space-y-4">
              {(() => {
                const ff = fillInviteForm
                const setFf = setFillInviteForm
                const inp = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-200'
                const lbl = 'block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1'
                return (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className={lbl}>Phone</label>
                        {(() => {
                          const CODES = [
                            { code: '+91',  label: '🇮🇳 +91'  },
                            { code: '+971', label: '🇦🇪 +971' },
                            { code: '+1',   label: '🇺🇸 +1'   },
                            { code: '+44',  label: '🇬🇧 +44'  },
                            { code: '+61',  label: '🇦🇺 +61'  },
                            { code: '+65',  label: '🇸🇬 +65'  },
                            { code: '+60',  label: '🇲🇾 +60'  },
                            { code: '+966', label: '🇸🇦 +966' },
                            { code: '+974', label: '🇶🇦 +974' },
                            { code: '+965', label: '🇰🇼 +965' },
                            { code: '+973', label: '🇧🇭 +973' },
                            { code: '+64',  label: '🇳🇿 +64'  },
                            { code: '+49',  label: '🇩🇪 +49'  },
                          ]
                          const parsePhone = (val) => {
                            const v = (val || '').trim()
                            for (const { code } of CODES) {
                              if (v.startsWith(code + ' ')) return { code, number: v.slice(code.length + 1) }
                              if (v.startsWith(code) && v.length > code.length) return { code, number: v.slice(code.length) }
                            }
                            return { code: '+91', number: v }
                          }
                          const { code: cc, number: num } = parsePhone(ff.phone)
                          return (
                            <div className="flex gap-1">
                              <select
                                value={cc}
                                onChange={e => setFf(p => ({ ...p, phone: e.target.value + ' ' + num }))}
                                className="px-1.5 py-2 rounded-lg border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-violet-200 flex-shrink-0"
                              >
                                {CODES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                              </select>
                              <input
                                type="tel"
                                placeholder="Number"
                                value={num}
                                onChange={e => setFf(p => ({ ...p, phone: cc + ' ' + e.target.value }))}
                                className={`${inp} flex-1 min-w-0`}
                              />
                            </div>
                          )
                        })()}
                      </div>
                      <div>
                        <label className={lbl}>Date of Birth</label>
                        <input type="date" value={ff.dob} onChange={e => setFf(p => ({...p, dob: e.target.value}))} className={inp} />
                      </div>
                      <div>
                        <label className={lbl}>Nativity</label>
                        <input type="text" value={ff.nativity} onChange={e => setFf(p => ({...p, nativity: e.target.value}))} placeholder="Hometown" className={inp} />
                      </div>
                      <div>
                        <label className={lbl}>Current Place</label>
                        <input type="text" value={ff.currentPlace} onChange={e => setFf(p => ({...p, currentPlace: e.target.value}))} placeholder="Current city" className={inp} />
                      </div>
                    </div>

                    <div>
                      <label className={lbl}>Baptised?</label>
                      <select value={ff.baptised} onChange={e => setFf(p => ({...p, baptised: e.target.value}))} className={inp}>
                        <option value="">— Select —</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </div>

                    {ff.baptised === 'yes' && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={lbl}>Baptism Date</label>
                          <input type="date" value={ff.baptismDate} onChange={e => setFf(p => ({...p, baptismDate: e.target.value}))} className={inp} />
                        </div>
                        <div>
                          <label className={lbl}>Baptism Place</label>
                          <input type="text" value={ff.baptismPlace} onChange={e => setFf(p => ({...p, baptismPlace: e.target.value}))} placeholder="Location" className={inp} />
                        </div>
                        <div className="col-span-2">
                          <label className={lbl}>Baptism Church</label>
                          <select
                            value={ff.baptismChurchIsOther ? 'other' : ff.baptismChurch}
                            onChange={e => {
                              if (e.target.value === 'other') setFf(p => ({...p, baptismChurch: '', baptismChurchIsOther: true}))
                              else setFf(p => ({...p, baptismChurch: e.target.value, baptismChurchIsOther: false}))
                            }}
                            className={inp}
                          >
                            <option value="">— Select —</option>
                            <option value="River Of Life Christian Church">River Of Life Christian Church</option>
                            <option value="other">Other</option>
                          </select>
                          {ff.baptismChurchIsOther && (
                            <input type="text" placeholder="Specify church name…" value={ff.baptismChurch} onChange={e => setFf(p => ({...p, baptismChurch: e.target.value}))} className={`${inp} mt-2`} />
                          )}
                        </div>
                      </div>
                    )}

                    <div>
                      <label className={lbl}>Marital Status</label>
                      <select value={ff.maritalStatus} onChange={e => setFf(p => ({...p, maritalStatus: e.target.value}))} className={inp}>
                        <option value="">— Select —</option>
                        {['Single','Married','Widowed','Divorced'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>

                    {ff.maritalStatus === 'Married' && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={lbl}>Marriage Date</label>
                          <input type="date" value={ff.marriageDate} onChange={e => setFf(p => ({...p, marriageDate: e.target.value}))} className={inp} />
                        </div>
                        <div>
                          <label className={lbl}>Spouse Name</label>
                          <input type="text" value={ff.spouseName} onChange={e => setFf(p => ({...p, spouseName: e.target.value}))} placeholder="Spouse name" className={inp} />
                        </div>
                      </div>
                    )}
                  </>
                )
              })()}
            </div>

            {/* Footer */}
            <div className="px-4 pb-4 pt-3 border-t border-slate-100 flex-shrink-0 space-y-2">
              <button
                type="button"
                disabled={fillInviteSaving}
                onClick={async () => {
                  setFillInviteSaving(true)
                  try {
                    const ff = fillInviteForm
                    const pcsPayload = {}
                    if (ff.phone)        pcsPayload.phone        = ff.phone
                    if (ff.dob)         pcsPayload.dob          = ff.dob
                    if (ff.nativity)    pcsPayload.nativity     = ff.nativity
                    if (ff.currentPlace) pcsPayload.currentPlace = ff.currentPlace
                    if (Object.keys(pcsPayload).length) {
                      await updatePCSEntry(fillInviteOpen.pcsEntryId, pcsPayload)
                    }
                    if (fillInviteOpen.visitorId) {
                      const profilePayload = {}
                      if (ff.baptised)      profilePayload.baptised      = ff.baptised
                      if (ff.baptismDate)   profilePayload.baptismDate   = ff.baptismDate
                      if (ff.baptismPlace)  profilePayload.baptismPlace  = ff.baptismPlace
                      if (ff.baptismChurch) profilePayload.baptismChurch = ff.baptismChurch
                      if (ff.maritalStatus) profilePayload.maritalStatus = ff.maritalStatus
                      if (ff.marriageDate)  profilePayload.marriageDate  = ff.marriageDate
                      if (ff.spouseName)    profilePayload.spouseName    = ff.spouseName
                      if (Object.keys(profilePayload).length) {
                        await upsertMemberProfile(fillInviteOpen.visitorId, profilePayload, userProfile?.email || '')
                      }
                    }
                    await completePCSFillInvitation(fillInviteOpen.id, userProfile?.email || '')
                    setPendingFillInvitations(prev => prev.filter(i => i.id !== fillInviteOpen.id))
                    setFillInviteOpen(null)
                  } catch { alert('Failed to save profile details') }
                  setFillInviteSaving(false)
                }}
                className="w-full min-h-[44px] py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 active:bg-violet-800 transition-colors disabled:opacity-60"
              >
                {fillInviteSaving ? 'Submitting…' : 'Submit Profile Details'}
              </button>
              <button type="button" onClick={() => setFillInviteOpen(null)} className="w-full py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

// ─── PCS Detail Sheet (legacy — replaced by inline profile panel) ─────────────
function PCSDetailSheet({ entry, onClose, onUpdate, onRemove }) {
  const [visitor, setVisitor] = useState(null)
  const [loadingVisitor, setLoadingVisitor] = useState(true)
  const [form, setForm] = useState({
    name: entry.name || '',
    phone: entry.phone || '',
    attendedDate: entry.attendedDate || '',
    membershipNumber: entry.membershipNumber || '',
    leadershipPosition: entry.leadershipPosition || '',
    email: '',
    dob: '',
    nativity: '',
    currentPlace: '',
    serviceAttended: '',
    howKnown: '',
    year: entry.year || '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!entry.visitorId) { setLoadingVisitor(false); return }
    getDelightVisitorById(entry.visitorId)
      .then((v) => {
        if (v) {
          setVisitor(v)
          setForm(f => ({
            ...f,
            email: v.email || '',
            dob: v.dob || '',
            nativity: v.nativity || '',
            currentPlace: v.currentPlace || '',
            serviceAttended: v.serviceAttended || '',
            howKnown: v.howKnown || '',
          }))
        }
      })
      .catch(() => {})
      .finally(() => setLoadingVisitor(false))
  }, [entry.visitorId])

  const field = (label, key, type = 'text') => (
    <div>
      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
      />
    </div>
  )

  const hasMember = !!form.membershipNumber

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
        <div
          className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh]"
          onClick={e => e.stopPropagation()}
        >
          {/* Sheet header */}
          <div className={`px-5 pt-5 pb-4 flex items-start justify-between gap-3 flex-shrink-0 ${hasMember ? 'bg-amber-50 border-b border-amber-100' : 'bg-blue-50 border-b border-blue-100'}`}>
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-11 h-11 rounded-full text-white text-lg font-bold flex items-center justify-center flex-shrink-0 ${hasMember ? 'bg-amber-500' : 'bg-blue-500'}`}>
                {form.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-slate-800 text-base truncate">{form.name}</p>
                  {form.leadershipPosition && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0">
                      {form.leadershipPosition}
                    </span>
                  )}
                </div>
                {hasMember
                  ? <p className="text-xs text-amber-600 font-semibold">Member #{form.membershipNumber}</p>
                  : <p className="text-xs text-blue-400">No membership number</p>
                }
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm(`Remove ${entry.name} from PCS?`)) return
                  await deactivatePCSEntry(entry.id, '')
                  onRemove(entry.id)
                }}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
              >Remove from PCS</button>
              <button type="button" onClick={onClose} className="w-11 h-11 flex items-center justify-center rounded-full text-slate-400 hover:bg-white/80 hover:text-slate-600 active:bg-white/60 transition-colors text-xl">×</button>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="overflow-y-auto min-h-0 flex-1 px-5 py-4 space-y-4">
            {/* Membership number — prominent */}
            <div className={`rounded-xl p-3 border ${hasMember ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
              <label className={`text-xs font-bold uppercase tracking-wide ${hasMember ? 'text-amber-600' : 'text-slate-400'}`}>
                🏅 Membership Number
              </label>
              <input
                type="text"
                placeholder="Enter membership number…"
                value={form.membershipNumber}
                onChange={e => setForm(f => ({ ...f, membershipNumber: e.target.value }))}
                className={`mt-1.5 w-full px-3 py-2.5 rounded-lg border text-sm font-semibold focus:outline-none focus:ring-2
                  ${hasMember ? 'border-amber-300 bg-white text-amber-800 focus:ring-amber-200' : 'border-slate-200 bg-white text-slate-700 focus:ring-indigo-200'}`}
              />
            </div>

            {/* Leadership position */}
            <div className={`rounded-xl p-3 border ${form.leadershipPosition ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
              <label className={`text-xs font-bold uppercase tracking-wide ${form.leadershipPosition ? 'text-emerald-700' : 'text-slate-400'}`}>
                👑 Leadership Position
              </label>
              <select
                value={form.leadershipPosition}
                onChange={e => setForm(f => ({ ...f, leadershipPosition: e.target.value }))}
                className={`mt-1.5 w-full px-3 py-2.5 rounded-lg border text-sm font-semibold focus:outline-none focus:ring-2
                  ${form.leadershipPosition ? 'border-emerald-300 bg-white text-emerald-800 focus:ring-emerald-200' : 'border-slate-200 bg-white text-slate-600 focus:ring-indigo-200'}`}
              >
                <option value="">— None —</option>
                <option value="Senior Pastor">Senior Pastor</option>
                <option value="Pastor">Pastor</option>
                <option value="Director">Director</option>
                <option value="Cell Leader">Cell Leader</option>
                <option value="Coordinator">Coordinator</option>
                <option value="Worship Leader">Worship Leader</option>
                <option value="Department Head">Department Head</option>
                <option value="Elder">Elder</option>
                <option value="Deacon">Deacon</option>
              </select>
            </div>

            {/* Visitor fields */}
            {loadingVisitor ? (
              <p className="text-sm text-slate-400 text-center py-4">Loading details…</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {field('Name', 'name')}
                {field('Phone', 'phone')}
                {field('Email', 'email')}
                {field('Date of Birth', 'dob', 'date')}
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Date Attended</label>
                  <input
                    type="date"
                    value={form.attendedDate}
                    onChange={e => {
                      const val = e.target.value
                      const yr = val ? new Date(val).getFullYear() : null
                      setForm(f => ({ ...f, attendedDate: val, ...(yr && yr >= VISITOR_START_YEAR ? { year: yr } : {}) }))
                    }}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Year</label>
                  <select
                    value={form.year || ''}
                    onChange={e => setForm(f => ({ ...f, year: e.target.value ? Number(e.target.value) : '' }))}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    <option value="">— Select —</option>
                    {Array.from({ length: VISITOR_CURRENT_YEAR - VISITOR_START_YEAR + 1 }, (_, i) => VISITOR_CURRENT_YEAR - i).map(yr => (
                      <option key={yr} value={yr}>{yr}</option>
                    ))}
                  </select>
                </div>
                {field('Nativity', 'nativity')}
                {field('Current Place', 'currentPlace')}
                {field('Service Attended', 'serviceAttended')}
                {field('How Known', 'howKnown')}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-slate-100 flex-shrink-0">
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                setSaving(true)
                const { name, phone, attendedDate, membershipNumber, leadershipPosition, email, dob, nativity, currentPlace, serviceAttended, howKnown, year } = form
                onUpdate({ id: entry.id, name, phone, attendedDate, membershipNumber, leadershipPosition, year: year ? Number(year) : null })
                await Promise.all([
                  updatePCSEntry(entry.id, { name, phone, attendedDate, membershipNumber, leadershipPosition, year }),
                  entry.visitorId ? updateDelightVisitor(entry.visitorId, { name, phone, email, dob, nativity, currentPlace, serviceAttended, attendedDate, howKnown }) : Promise.resolve(),
                ]).catch(() => {})
                if (entry.visitorId) {
                  updateCellMembersByVisitorId(entry.visitorId, { name, phone, birthday: dob }).catch(() => {})
                  updatePCSEntriesByVisitorId(entry.visitorId, { name, phone }).catch(() => {})
                }
                setSaving(false)
              }}
              className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >{saving ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Convenience date picker (day / month / year selects) ────────────────────
function DateSelect({ value, onChange, minYear, maxYear }) {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const parseDate = (val) => {
    const parts = (val || '').split('-')
    return { y: parts[0] || '', m: parts[1] ? String(Number(parts[1])) : '', d: parts[2] ? String(Number(parts[2])) : '' }
  }
  const [sel, setSel] = useState(() => parseDate(value))
  // Track the last value we emitted so we can detect external changes (e.g. form reset)
  const lastEmitted = useRef(value)
  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value
      setSel(parseDate(value))
    }
  }, [value])
  const update = (ny, nm, nd) => {
    setSel({ y: ny, m: nm, d: nd })
    if (ny && nm && nd) {
      const full = `${ny}-${String(nm).padStart(2,'0')}-${String(nd).padStart(2,'0')}`
      lastEmitted.current = full
      onChange(full)
    } else if (!ny && !nm && !nd) {
      lastEmitted.current = ''
      onChange('')
    }
    // Partial selection: keep parent value unchanged; local state shows the choice
  }
  const cls = 'flex-1 px-2 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 text-sm transition-colors'
  return (
    <div className="flex gap-1.5">
      <select value={sel.d} onChange={e => update(sel.y, sel.m, e.target.value)} className={cls}>
        <option value="">Day</option>
        {Array.from({length: 31}, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
      </select>
      <select value={sel.m} onChange={e => update(sel.y, e.target.value, sel.d)} className={cls}>
        <option value="">Month</option>
        {MONTHS.map((name, i) => <option key={i + 1} value={i + 1}>{name}</option>)}
      </select>
      <select value={sel.y} onChange={e => update(e.target.value, sel.m, sel.d)} className={cls}>
        <option value="">Year</option>
        {Array.from({length: maxYear - minYear + 1}, (_, i) => maxYear - i).map(yr => (
          <option key={yr} value={yr}>{yr}</option>
        ))}
      </select>
    </div>
  )
}

// ─── Cell Member Link Modal ───────────────────────────────────────────────────
function CellMemberLinkModal({ member, cellId, onLink, onClose }) {
  const [visitors, setVisitors] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(member.name || '')
  const [linking, setLinking] = useState(false)

  useEffect(() => {
    getDelightVisitors()
      .then(setVisitors)
      .catch(() => setVisitors([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = visitors.filter(v =>
    !search.trim() || v.name.toLowerCase().includes(search.trim().toLowerCase())
  )

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
        <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[88vh]" onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div className="px-4 pt-4 pb-3 border-b border-slate-100 flex items-start justify-between gap-3 flex-shrink-0">
            <div>
              <p className="font-semibold text-slate-800 text-sm">Link to Visitor Entry</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Linking <span className="font-medium text-slate-600">{member.name}</span> — pick the matching visitor record
              </p>
            </div>
            <button type="button" onClick={onClose} className="w-11 h-11 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:bg-slate-200 transition-colors text-xl flex-shrink-0">×</button>
          </div>

          {/* Search */}
          <div className="px-3 py-2.5 border-b border-slate-100 flex-shrink-0">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M9.5 9.5l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              <input
                type="text"
                autoFocus
                placeholder="Search visitor name…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 placeholder-slate-400"
              />
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto min-h-0 flex-1">
            {loading ? (
              <div className="py-12 text-center text-slate-400 text-sm">Loading visitors…</div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">No matches found.</div>
            ) : filtered.map(v => {
              const isCurrentLink = v.id === member.visitorId
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={linking}
                  onClick={async () => {
                    setLinking(true)
                    try { await onLink(v) } catch (e) { console.error(e) }
                    setLinking(false)
                  }}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-slate-50 transition-colors
                    ${isCurrentLink ? 'bg-emerald-50' : 'hover:bg-indigo-50'}`}
                >
                  <div className={`w-9 h-9 rounded-full text-white text-sm font-bold flex items-center justify-center flex-shrink-0
                    ${isCurrentLink ? 'bg-emerald-500' : 'bg-indigo-500'}`}>
                    {v.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{v.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {v.phone && <span className="text-xs text-slate-400">{v.phone}</span>}
                      {v.year && <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">{v.year}</span>}
                      {v.attendedDate && <span className="text-xs text-slate-400">{v.attendedDate}</span>}
                    </div>
                  </div>
                  {isCurrentLink
                    ? <span className="text-xs text-emerald-600 font-semibold flex-shrink-0">Current</span>
                    : <svg className="flex-shrink-0 text-slate-300" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  }
                </button>
              )
            })}
          </div>

          {/* Footer count */}
          {!loading && (
            <div className="px-4 py-2.5 border-t border-slate-100 flex-shrink-0 text-center text-xs text-slate-400">
              {filtered.length} visitor{filtered.length !== 1 ? 's' : ''} shown
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── PCS Manual Entry Modal ───────────────────────────────────────────────────
function PCSManualEntryModal({ onSave, onClose }) {
  const currentYear = new Date().getFullYear()
  const [form, setForm] = useState({
    name: '', phone: '', attendedDate: '', year: currentYear,
    membershipNumber: '', leadershipPosition: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (key, val) => setForm(p => ({ ...p, [key]: val }))

  const handleDateChange = (val) => {
    const yr = val ? new Date(val).getFullYear() : currentYear
    setForm(p => ({ ...p, attendedDate: val, year: yr >= 2000 ? yr : p.year }))
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    await onSave({
      name: form.name.trim(),
      phone: form.phone.trim(),
      attendedDate: form.attendedDate,
      year: form.year ? Number(form.year) : null,
      membershipNumber: form.membershipNumber.trim(),
      leadershipPosition: form.leadershipPosition.trim(),
      visitorId: '',
    })
    setSaving(false)
  }

  const inp = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 placeholder-slate-400'

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
        <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[94vh]" onClick={e => e.stopPropagation()}>
          <div className="px-4 pt-4 pb-3 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
            <div>
              <p className="font-semibold text-slate-800 text-sm">Add to PCS Manually</p>
              <p className="text-xs text-slate-400 mt-0.5">Enter details for anyone under personal care</p>
            </div>
            <button type="button" onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 text-xl leading-none">×</button>
          </div>

          <div className="overflow-y-auto flex-1 px-4 py-4 space-y-3">
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1">Name <span className="text-red-400">*</span></p>
              <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="Full name" className={inp} autoFocus />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1">Phone</p>
              <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
                placeholder="Phone number" className={inp} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">Date Attended</p>
                <input type="date" value={form.attendedDate} onChange={e => handleDateChange(e.target.value)} className={inp} />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">Year</p>
                <input type="number" value={form.year} onChange={e => set('year', e.target.value)}
                  min={2000} max={2100} className={inp} />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-amber-600 mb-1">Membership # (if applicable)</p>
              <input type="text" value={form.membershipNumber} onChange={e => set('membershipNumber', e.target.value)}
                placeholder="Leave blank if not a member" className="w-full px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 placeholder-slate-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-emerald-600 mb-1">Leadership Position (if applicable)</p>
              <input type="text" value={form.leadershipPosition} onChange={e => set('leadershipPosition', e.target.value)}
                placeholder="e.g. Cell Leader, Deacon" className="w-full px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 placeholder-slate-400" />
            </div>
            {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
          </div>

          <div className="px-4 pb-4 pt-2 border-t border-slate-100 flex gap-3 flex-shrink-0">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button type="button" disabled={saving} onClick={handleSubmit}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors">
              {saving ? 'Adding…' : 'Add to PCS'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── PCS Picker Modal ─────────────────────────────────────────────────────────
function PCSPickerModal({ addedIds, onAdd, onClose }) {
  const [visitors, setVisitors] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [yearFilter, setYearFilter] = useState('all')

  useEffect(() => {
    getDelightVisitors()
      .then(setVisitors)
      .catch(() => setVisitors([]))
      .finally(() => setLoading(false))
  }, [])

  const years = [...new Set(visitors.map((v) => v.year).filter(Boolean))].sort((a, b) => b - a)

  const filtered = visitors.filter((v) => {
    const matchSearch = v.name.toLowerCase().includes(search.toLowerCase())
    const matchYear = yearFilter === 'all' || String(v.year) === String(yearFilter)
    return matchSearch && matchYear
  })

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
        <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[94vh] sm:max-h-[90vh]" onClick={(e) => e.stopPropagation()}>

          {/* Modal header */}
          <div className="px-4 pt-4 pb-3 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
            <div>
              <p className="font-semibold text-slate-800 text-sm">Add to Personal Caring System</p>
              <p className="text-xs text-slate-400 mt-0.5">Select from D Light visitor list</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors text-xl leading-none"
            >×</button>
          </div>

          {/* Search */}
          <div className="px-3 pt-3 pb-2 flex-shrink-0">
            <input
              type="text"
              placeholder="Search by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 placeholder-slate-400"
            />
          </div>

          {/* Year filter chips */}
          {years.length > 0 && (
            <div className="px-3 pb-2 flex gap-1.5 flex-wrap flex-shrink-0">
              <button
                type="button"
                onClick={() => setYearFilter('all')}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${yearFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >All</button>
              {years.map((yr) => (
                <button
                  key={yr}
                  type="button"
                  onClick={() => setYearFilter(String(yr))}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${yearFilter === String(yr) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >{yr}</button>
              ))}
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-slate-100 flex-shrink-0" />

          {/* List */}
          <div className="overflow-y-auto min-h-0 flex-1">
            {loading ? (
              <div className="px-4 py-12 text-center text-slate-400 text-sm">Loading visitors…</div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-12 text-center text-slate-400 text-sm">
                {search || yearFilter !== 'all' ? 'No matches found.' : 'No visitors available.'}
              </div>
            ) : filtered.map((v) => {
              const added = addedIds.has(v.id)
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={added}
                  onClick={() => {
                    if (added) return
                    onAdd(v)
                    onClose()
                  }}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-slate-50 transition-colors
                    ${added ? 'opacity-40 cursor-not-allowed bg-slate-50' : 'hover:bg-indigo-50 active:bg-indigo-100'}`}
                >
                  {/* Avatar initial */}
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold
                    ${added ? 'bg-slate-200 text-slate-400' : 'bg-indigo-100 text-indigo-700'}`}>
                    {v.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{v.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {v.phone && <span className="text-xs text-slate-400">{v.phone}</span>}
                      {v.year && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">{v.year}</span>
                      )}
                      {v.attendedDate && <span className="text-xs text-slate-400">{v.attendedDate}</span>}
                    </div>
                  </div>
                  {added
                    ? <span className="text-xs text-indigo-400 font-medium flex-shrink-0">Added</span>
                    : <svg className="flex-shrink-0 text-slate-300" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  }
                </button>
              )
            })}
          </div>

          {/* Footer count */}
          {!loading && (
            <div className="px-4 py-2.5 border-t border-slate-100 flex-shrink-0">
              <p className="text-xs text-slate-400 text-center">{filtered.length} visitor{filtered.length !== 1 ? 's' : ''} shown</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
