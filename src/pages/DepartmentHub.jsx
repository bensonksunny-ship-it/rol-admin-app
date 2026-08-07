import { useParams, Link, Navigate, useSearchParams, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState, useCallback, Fragment, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { getDepartmentBySlug } from '../constants/departments'
import { getDepartmentHubTabs, LEGACY_DEPARTMENT_NAMES, usesGenericSubDepartmentCollection } from '../constants/departmentTabs'
import {
  getTasks,
  createTask,
  updateTask,
  subscribeTasksByDepartment,
  subscribeCellMemberReferralTasks,
  subscribePCSReferralTasks,
  subscribePCSAddNotifications,
  completePCSAddNotification,
  dismissPCSAddNotification,
  markPCSAddNotificationForwarded,
  getDepartmentEntries,
  addDepartmentEntry,
  getDepartmentTeamMembers,
  subscribeDepartmentTeamMembers,
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
  getCellReportsByCell,
  getCellReportAttendees,
  getRecentSundayAttendanceNamesByCell,
  getRecentCellReportsForHeatmap,
  addCellGroup,
  updateCellGroup,
  addCellGroupMember,
  updateCellGroupMember,
  deactivateCellGroupMember,
  deleteCellGroupMember,
  subscribeCellMemberPendingChanges,
  addCellMemberPendingChange,
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
  subscribeDelightVisitors,
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
  updateDepartmentChild,
  deleteDepartmentChild,
  getDepartmentChildAttendance,
  setDepartmentChildAttendance,
  subscribeSundayReportRiverKids,
  patchSundayReportRiverKids,
  getSundayReport,
  patchSundayReportNameField,
  getPCSLookup,
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
  dismissInactiveCellAlert,
  getInactivePCSEntries,
  getDelightVisitorById,
  migrateSundayServiceToEnglish,
  syncVisitorDataEverywhere,
  updateCellMembersByVisitorId,
  updatePCSEntriesByVisitorId,
  updateDeptTeamMembersByVisitorId,
  updateWorshipTeamMembersByVisitorId,
  getBoardPoints,
  addBoardPoint,
  updateBoardPoint,
  deleteBoardPoint,
  getMemberProfile,
  getMemberProfileWithContext,
  upsertMemberProfile,
  uploadMemberPhoto,
  addPerson,
  updatePerson,
  getPerson,
  getPeople,
  getSundayPlan,
  setSundayPlanSection,
  sendPCSFillInvitation,
  getPCSFillInvitationByEntry,
  subscribePCSFillInvitationsByCellId,
  completePCSFillInvitation,
  getFinanceIncome,
  getFinanceExpense,
  subscribeFinanceExpenseByDept,
  subscribeCellVisitorProposals,
  completeCellVisitorProposal,
  dismissCellVisitorProposal,
  getSundayAttendanceCountsByName,
  subscribeToRecentSundayAttendanceWeeks,
} from '../services/firestore'
import { ROLES } from '../constants/roles'
import { logAction } from '../utils/auditLog'
import { isRestrictedDLightDirector } from '../utils/dlightAccess'
import { differenceInDays, differenceInYears, differenceInMonths, format, startOfWeek, endOfWeek, addWeeks, subWeeks } from 'date-fns'
import { formatDMY, parseDateToYYYYMMDD, formatDisplayDate } from '../utils/date'
import { isSeniorPastorName, SENIOR_PASTOR_TITLE, SENIOR_PASTOR_FULL_TITLE } from '../utils/seniorPastor'
import PlanningBoard from '../components/PlanningBoard/PlanningBoard'
import LiveElapsedTimer from '../components/LiveElapsedTimer'
import ProgramConfirmSheet from '../components/ProgramConfirmSheet'
import { CellDirectorCockpit } from '../components/CellDirectorCockpit'
import DLightDirectorDashboard from '../components/DLightDirectorDashboard'
import { canAccessAccountsEntry, ACCOUNTS_ENTRY_BASE_PATH } from '../utils/accountsEntryAccess'
import { defaultCellTab, visibleCellTabs } from '../utils/cellTabVisibility'
import CellReportsTab from './cell/CellReportsTab'
import CellLeaderEntryTab from './cell/CellLeaderEntryTab'
import PersonSearchInput from '../components/PersonSearchInput'
import AdvancePayoutTab from '../components/AdvancePayoutTab'
import AdvancePayoutReviewer from '../components/AdvancePayoutReviewer'
import DeptExpenseTab from '../components/DeptExpenseTab'
import FinanceTabBar from '../components/finance/FinanceTabBar'
import SecCoreFinance from './seccore/SecCoreFinance'
import AccountsExpensePage from './accounts/ExpensePage'
import AddDepartmentsPage from './accounts/AddDepartmentsPage'
import BudgetPage from './accounts/BudgetPage'
import UpcomingSunday from './UpcomingSunday'
import { DirectorBoardPage, SundayLeaderTab, SecCoreAnalyticsHub } from './seccore/SecCoreSummary'
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

const WEEKDAY_OPTIONS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

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

// ─── Cell Leader "Fill Profile" modal ──────────────────────────────────────────
// Mirrors the section layout of Caring's own PCS profile form (Personal Info,
// Contact, Spiritual Details, Family Info) minus Membership Particulars, which stays
// Caring-only. Field-schema-driven so section/highlight logic doesn't repeat per field.
const emptyFillInviteForm = () => ({
  phone: '', email: '', dob: '', nativity: '', currentPlace: '',
  baptised: '', baptismDate: '', baptismPlace: '', baptismChurch: '', baptismChurchIsOther: false,
  previousChurchName: '', previousChurchPlace: '',
  maritalStatus: '', marriageDate: '', spouseName: '', hasKids: '', children: [],
})

const FILL_INVITE_SECTIONS = [
  {
    key: 'personal', label: 'Personal Info', dot: 'bg-blue-500', headerBg: 'bg-blue-50 dark:bg-blue-950/30 border-b border-blue-100 dark:border-blue-900', labelColor: 'text-blue-700 dark:text-blue-300',
    fields: [
      { key: 'dob', label: 'Date of Birth', type: 'date' },
      { key: 'nativity', label: 'Nativity / Hometown', type: 'text', placeholder: 'Hometown' },
      { key: 'currentPlace', label: 'Current Place', type: 'text', placeholder: 'Current city' },
    ],
  },
  {
    key: 'contact', label: 'Contact', dot: 'bg-sky-500', headerBg: 'bg-sky-50 dark:bg-sky-950/30 border-b border-sky-100 dark:border-sky-900', labelColor: 'text-sky-700 dark:text-sky-300',
    fields: [
      { key: 'phone', label: 'Phone', type: 'phone' },
      { key: 'email', label: 'Email', type: 'email' },
    ],
  },
  {
    key: 'spiritual', label: 'Spiritual Details', dot: 'bg-violet-500', headerBg: 'bg-violet-50 dark:bg-violet-950/30 border-b border-violet-100 dark:border-violet-900', labelColor: 'text-violet-700 dark:text-violet-300',
    fields: [
      { key: 'baptised', label: 'Baptised?', type: 'select', options: [['yes', 'Yes'], ['no', 'No']] },
      { key: 'baptismDate', label: 'Baptism Date', type: 'date', relevantIf: f => f.baptised === 'yes' },
      { key: 'baptismPlace', label: 'Baptism Place', type: 'text', placeholder: 'Location', relevantIf: f => f.baptised === 'yes' },
      { key: 'baptismChurch', label: 'Baptism Church', type: 'church', relevantIf: f => f.baptised === 'yes' },
      { key: 'previousChurchName', label: 'Previous Church Name', type: 'text' },
      { key: 'previousChurchPlace', label: 'Previous Church Location', type: 'text' },
    ],
  },
  {
    key: 'family', label: 'Family Info', dot: 'bg-teal-500', headerBg: 'bg-teal-50 dark:bg-teal-950/30 border-b border-teal-100 dark:border-teal-900', labelColor: 'text-teal-700 dark:text-teal-300',
    fields: [
      { key: 'maritalStatus', label: 'Marital Status', type: 'select', options: [['Single', 'Single'], ['Married', 'Married'], ['Widowed', 'Widowed'], ['Divorced', 'Divorced']] },
      { key: 'marriageDate', label: 'Marriage Date', type: 'date', relevantIf: f => f.maritalStatus === 'Married' },
      { key: 'spouseName', label: 'Spouse Name', type: 'text', placeholder: 'Spouse name', relevantIf: f => f.maritalStatus === 'Married' },
      { key: 'hasKids', label: 'Do they have kids?', type: 'select', options: [['yes', 'Yes'], ['no', 'No']] },
      { key: 'children', label: 'Children', type: 'children', relevantIf: f => f.hasKids === 'yes' },
    ],
  },
]

// "Missing" is judged against the pre-fill baseline (not live edits), so a field
// doesn't lose its highlight the instant the leader starts typing into it.
const isFillFieldMissing = (baseline, liveForm, field) => {
  if (field.relevantIf && !field.relevantIf(liveForm)) return false
  const v = baseline[field.key]
  if (field.type === 'children') return !Array.isArray(v) || v.filter(c => c.name).length === 0
  return v === '' || v === null || v === undefined || v === false
}

// River Kids Class/Group options — shared by the register form's multi-select and
// the Attendance tab's group tabs, so a kid's classGroups array and the attendance
// sub-page keys always speak the same vocabulary.
const RK_CLASS_GROUPS = [
  { key: 'sunday-school', label: 'Sunday School' },
  { key: 'river-kids-1',  label: 'River Kids-1'  },
  { key: 'river-kids-2',  label: 'River Kids-2'  },
]
const rkClassGroupLabel = (key) => RK_CLASS_GROUPS.find(g => g.key === key)?.label || key

// PCS main view — search + filter chips. Chips are grouped ('cell' | 'status' | 'year')
// so selecting multiple within a group is OR'd (any match) while different groups are
// AND'd together (must satisfy every active group).
const PCS_FILTER_CHIPS = [
  { key: 'cell:jordan',      label: 'Jordan',        group: 'cell',   value: 'jordan' },
  { key: 'cell:bethany',     label: 'Bethany',       group: 'cell',   value: 'bethany' },
  { key: 'cell:olive',       label: 'Olive',         group: 'cell',   value: 'olive' },
  { key: 'status:notmember', label: 'Not a member',  group: 'status', value: 'notmember' },
  { key: 'status:leader',    label: 'Leader',        group: 'status', value: 'leader' },
  { key: 'year:2026',        label: '2026',          group: 'year',   value: 2026 },
]

// Firestore's permission-denied error is a dead end for the person clicking the
// button — "Missing or insufficient permissions" gives them nothing actionable.
// Most real-world cases are a stale `departments[]` sync (see canAccessDept in
// firestore.rules) that clears itself on next login, so say that instead.
function rkPermissionErrorMessage(error) {
  if (error?.code === 'permission-denied') {
    return "Failed to save: you don't have permission to update River Kids attendance. If you were just assigned to this department, signing out and back in usually fixes this — otherwise contact an admin."
  }
  return `Failed to save: ${error?.message || 'unknown error'}`
}

// Multi-select pill toggle for a kid's Class/Group — a child can belong to more than
// one (e.g. Sunday School + River Kids-1), so this toggles membership in the array
// rather than picking a single value like a native <select> would.
function ClassGroupPicker({ value, onChange }) {
  const selected = Array.isArray(value) ? value : []
  const toggle = (key) => onChange(selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key])
  return (
    <div className="flex flex-wrap gap-2">
      {RK_CLASS_GROUPS.map(g => (
        <button key={g.key} type="button" onClick={() => toggle(g.key)}
          className={`py-1.5 px-3 rounded-xl border text-xs font-medium transition ${
            selected.includes(g.key)
              ? 'bg-indigo-600 text-white border-indigo-700'
              : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          {g.label}
        </button>
      ))}
    </div>
  )
}

export default function DepartmentHub() {
  const { slug } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { userProfile, user, canManageDepartment, isDepartmentHead, hasAccess, hasPermission, isFounder, isCellDirector, isSundayMinistryDirector } = useAuth()
  const department = getDepartmentBySlug(slug)

  // Cell access helper must be defined BEFORE any effects that reference it (avoid TDZ crashes)
  // NOTE: must use isCellDirector (schema-aware: role: 'DIRECTOR' new schema OR
  // position: 'Director' legacy schema) — a hand-rolled check against only
  // `position` here previously locked new-schema Directors out of the Cell
  // Director Cockpit (Pending Approvals, Cell Report Reminders, D-Light Consults).
  const fullAccess = userProfile?.globalRole === 'FOUNDER' || userProfile?.role === ROLES.FOUNDER
  const canViewAllCells = fullAccess || isCellDirector

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
  const [financeSubTab, setFinanceSubTab] = useState('expense')
  const [acctSummary, setAcctSummary] = useState(null)
  const [acctSummaryLoading, setAcctSummaryLoading] = useState(false)
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
  const [loadingCellMemberVisitors, setLoadingCellMemberVisitors] = useState(false)
  const [cellMemberVisitorsError, setCellMemberVisitorsError] = useState('')
  const [assigningVisitorId, setAssigningVisitorId] = useState(null)
  const [cellMemberToast, setCellMemberToast] = useState('')
  const [cellMemberLinking, setCellMemberLinking] = useState(null)
  const [activeMenuMemberId, setActiveMenuMemberId] = useState(null)
  const [activeMenuMemberPos, setActiveMenuMemberPos] = useState({ top: 0, right: 0 })
  const [cellMemberTransfer, setCellMemberTransfer] = useState(null)
  const [transferringCellMember, setTransferringCellMember] = useState(false)
  const [expandedMemberSections, setExpandedMemberSections] = useState({})
  const [cellRecentAttendedNames, setCellRecentAttendedNames] = useState(new Set())
  const [detailMember, setDetailMember] = useState(null)
  const [detailMemberLoading, setDetailMemberLoading] = useState(false)
  const [detailMemberProfile, setDetailMemberProfile] = useState(null)
  const [detailMemberVisitor, setDetailMemberVisitor] = useState(null)
  const [detailMemberMinistries, setDetailMemberMinistries] = useState([])
  const [detailMemberCellAttendance, setDetailMemberCellAttendance] = useState([])
  const [detailMemberSundayAttendance, setDetailMemberSundayAttendance] = useState([])

  const openMemberDetail = useCallback((m, cellId) => {
    setDetailMember(m)
    setDetailMemberProfile(null)
    setDetailMemberVisitor(null)
    setDetailMemberMinistries([])
    setDetailMemberCellAttendance([])
    setDetailMemberSundayAttendance([])
    setDetailMemberLoading(true)
    const nameLower = String(m.name || '').trim().toLowerCase()
    Promise.all([
      m.visitorId ? getMemberProfileWithContext(m.visitorId, m.phone, null, m.name).catch(() => null) : Promise.resolve(null),
      m.visitorId ? getDelightVisitorById(m.visitorId).catch(() => null) : Promise.resolve(null),
      cellId ? getRecentCellReportsForHeatmap(cellId, 5).catch(() => []) : Promise.resolve([]),
      cellId ? getRecentSundayAttendanceNamesByCell(cellId, 5).catch(() => []) : Promise.resolve([]),
    ]).then(([ctx, visitor, cellReports, sundayWeeks]) => {
      setDetailMemberProfile(ctx?.profile || null)
      setDetailMemberVisitor(visitor)
      const deptTeams = ctx?.deptTeams || []
      const worshipTeams = ctx?.worshipTeams || []
      setDetailMemberMinistries([
        ...deptTeams.map((t) => ({ ministry: t.department, role: t.rolePosition || t.role || '', from: t.since || '' })),
        ...worshipTeams.map((t) => ({ ministry: 'Worship', role: (t.positions || [])[0] || '', from: t.since || '' })),
      ])
      setDetailMemberCellAttendance(cellReports.map((r) => ({ date: r.reportDate, present: r.attendeeNames.has(nameLower) })))
      setDetailMemberSundayAttendance(sundayWeeks)
    }).finally(() => setDetailMemberLoading(false))
  }, [])
  const [teamMemberLinking, setTeamMemberLinking] = useState(null)
  const [cellMemberLinkedVisitor, setCellMemberLinkedVisitor] = useState(null)
  const [cellMemberLinkedVisitorForm, setCellMemberLinkedVisitorForm] = useState({ email: '', nativity: '', currentPlace: '', serviceAttended: '', attendedDate: '', howKnown: '' })
  const [cellGroupModalOpen, setCellGroupModalOpen] = useState(false)
  const [newCellGroupForm, setNewCellGroupForm] = useState({ cellId: '', cellName: '', leader: '', leaderPersonId: '', meetingDay: '', launchDate: '', status: 'active' })
  const [editingCellGroupId, setEditingCellGroupId] = useState(null)
  const [cellGroupEditForm, setCellGroupEditForm] = useState({ cellId: '', cellName: '', leader: '', leaderPersonId: '', meetingDay: '', launchDate: '', status: 'active' })
  const [cellGroupEditModalOpen, setCellGroupEditModalOpen] = useState(false)
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
  const [boardAllottedNotifications, setBoardAllottedNotifications] = useState([])
  const [delightVisitors, setDelightVisitors] = useState([])
  const [loadingDelightVisitors, setLoadingDelightVisitors] = useState(false)
  const [visitorSundayCounts, setVisitorSundayCounts] = useState(new Map())
  // Week-comer follow-up: which Sunday's report to mark, and the candidate names for
  // second/third/fourth week comers, sourced from D-Light attendedDate + last week's
  // confirmed Sunday Ministry attendance (see the effect that populates these).
  // Must always be a Sunday — this date is the doc ID of the sunday_reports report being
  // written into, and Sunday Ministry attendance only exists per-Sunday.
  const [weekComerDate, setWeekComerDate] = useState(() => upcomingSunday())
  const [weekComerDateWarning, setWeekComerDateWarning] = useState(false)
  const [weekComerCandidates, setWeekComerCandidates] = useState({ second: [], third: [], fourth: [] })
  const [loadingWeekComerCandidates, setLoadingWeekComerCandidates] = useState(false)
  const [markingWeekComerName, setMarkingWeekComerName] = useState(null)
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
  const [pcsToast, setPcsToast] = useState(null)
  const [pcsCellReferralTasks, setPcsCellReferralTasks] = useState([])
  const [pcsSearchQuery, setPcsSearchQuery] = useState('')
  const [pcsActiveFilters, setPcsActiveFilters] = useState(() => new Set())
  const [sundayAttendanceWeeks, setSundayAttendanceWeeks] = useState([])
  const [rkChildrenForPCS, setRkChildrenForPCS] = useState([])
  const [pcsChildSearchOpenId, setPcsChildSearchOpenId] = useState(null)
  const [pcsSpouseFocused, setPcsSpouseFocused] = useState(false)
  const [pcsShowFormer, setPcsShowFormer] = useState(false)
  const [pcsInactiveEntries, setPcsInactiveEntries] = useState([])
  const [pcsLoadingFormer, setPcsLoadingFormer] = useState(false)
  const [pcsFormDirty, setPcsFormDirty] = useState(false)
  const pcsSavedRef = useRef(null)
  const [pcsInviteStatus, setPcsInviteStatus] = useState({})
  const [pcsInvitingId, setPcsInvitingId] = useState(null)
  const [pcsMenuOpenId, setPcsMenuOpenId] = useState(null)
  const [pcsEditingId, setPcsEditingId] = useState(null)
  const [pendingFillInvitations, setPendingFillInvitations] = useState([])
  const [fillInviteOpen, setFillInviteOpen] = useState(null)
  const [fillInviteForm, setFillInviteForm] = useState({})
  const [fillInviteBaseline, setFillInviteBaseline] = useState({})
  const [fillInviteLoading, setFillInviteLoading] = useState(false)
  const [fillInviteSaving, setFillInviteSaving] = useState(false)
  const [fillShowAllFields, setFillShowAllFields] = useState(false)

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

  const openFillInviteModal = async (inv) => {
    setFillInviteOpen(inv)
    setFillShowAllFields(false)
    const empty = emptyFillInviteForm()
    setFillInviteForm(empty)
    setFillInviteBaseline(empty)
    if (!inv.visitorId) return
    setFillInviteLoading(true)
    try {
      // member_profiles is the only collection a Cell Leader can read/write for this
      // person (caring_pcs/people are Caring-department-gated) — see the comment on
      // upsertMemberProfile in firestore.js.
      const profile = await getMemberProfile(inv.visitorId)
      const merged = profile ? {
        phone: profile.phone || '', email: profile.email || '', dob: profile.dob || '',
        nativity: profile.nativity || '', currentPlace: profile.currentPlace || '',
        baptised: profile.baptised || '', baptismDate: profile.baptismDate || '', baptismPlace: profile.baptismPlace || '',
        baptismChurch: profile.baptismChurch || '',
        baptismChurchIsOther: !!profile.baptismChurch && profile.baptismChurch !== 'River Of Life Christian Church',
        previousChurchName: profile.previousChurchName || '', previousChurchPlace: profile.previousChurchPlace || '',
        maritalStatus: profile.maritalStatus || '', marriageDate: profile.marriageDate || '', spouseName: profile.spouseName || '',
        hasKids: profile.hasKids || '', children: profile.children || [],
      } : empty
      setFillInviteForm(merged)
      setFillInviteBaseline(merged)
    } catch { /* keep the empty form — cell leader can still fill from scratch */ }
    setFillInviteLoading(false)
  }

  // Deep-link from the notification bell's "Tap to fill" (Sidebar.jsx): once the
  // pending fill invitations have loaded, auto-open the Fill Profile modal for the
  // invitation id passed in via ?openFillInvite=, then strip it from the URL so it
  // doesn't re-trigger on refresh/back-navigation.
  const openFillInviteId = searchParams.get('openFillInvite') || null
  useEffect(() => {
    if (!openFillInviteId || slug !== 'cell' || pendingFillInvitations.length === 0) return
    const inv = pendingFillInvitations.find(i => i.id === openFillInviteId)
    if (inv) openFillInviteModal(inv)
    const next = new URLSearchParams(searchParams)
    next.delete('openFillInvite')
    setSearchParams(next, { replace: true })
  }, [openFillInviteId, slug, pendingFillInvitations])

  const [cellReferralTasks, setCellReferralTasks] = useState([])
  const [cellReferralAdding, setCellReferralAdding] = useState(new Set())
  const [cellReferralRemoving, setCellReferralRemoving] = useState(new Set())

  const [pcsAddNotifications, setPcsAddNotifications] = useState([])
  const [pcsAddOpen, setPcsAddOpen] = useState(false)
  const [pcsAddAdding, setPcsAddAdding] = useState(new Set())
  const [pcsAddDismissing, setPcsAddDismissing] = useState(new Set())
  const [pcsAddForwarding, setPcsAddForwarding] = useState(new Set())

  const [cellVisitorProposals, setCellVisitorProposals] = useState([])
  const [cellVisitorProposalOpen, setCellVisitorProposalOpen] = useState(false)
  const [cellVisitorProposalAdding, setCellVisitorProposalAdding] = useState(new Set())
  const [cellVisitorProposalDismissing, setCellVisitorProposalDismissing] = useState(new Set())

  // "Forwarded from PCS" — referral tasks Caring sends when a person needs D-Light
  // registration before they can be added to PCS (department: 'D Light', pcsReferral: true
  // on the shared `tasks` collection; see subscribeTasksByDepartment above).
  const [pcsForwardOpen, setPcsForwardOpen] = useState(false)
  const [pcsForwardAdding, setPcsForwardAdding] = useState(new Set())
  const [pcsForwardDismissing, setPcsForwardDismissing] = useState(new Set())

  // "Cell Assignment Consults" — Cell Director requests for D-Light input on where to
  // place an unassigned person (department: 'D Light', cellAssignConsult: true on the
  // shared `tasks` collection; see subscribeTasksByDepartment above).
  const [dlightConsultOpen, setDlightConsultOpen] = useState(true)
  const [dlightConsultTarget, setDlightConsultTarget] = useState(null) // task being responded to
  const [dlightConsultReply, setDlightConsultReply] = useState('')
  const [dlightConsultCellId, setDlightConsultCellId] = useState('')
  const [sendingDlightReply, setSendingDlightReply] = useState(false)

  // Active cell groups for the reply modal's "Recommend a cell" picker. Loaded lazily
  // (only once a consult is actually being answered) since D-Light otherwise never
  // needs the cell_groups collection.
  const [dlightConsultCellOptions, setDlightConsultCellOptions] = useState([])
  const [loadingDlightConsultCells, setLoadingDlightConsultCells] = useState(false)
  useEffect(() => {
    if (!dlightConsultTarget) return
    let alive = true
    setLoadingDlightConsultCells(true)
    getCellGroups('Cell')
      .then((groups) => {
        if (!alive) return
        setDlightConsultCellOptions((groups || []).filter((g) => g.status !== 'inactive'))
      })
      .catch(() => {
        if (!alive) return
        setDlightConsultCellOptions([])
      })
      .finally(() => {
        if (!alive) return
        setLoadingDlightConsultCells(false)
      })
    return () => {
      alive = false
    }
  }, [dlightConsultTarget])

  // Deep-link from the notification bell's "Tap to respond" (Sidebar.jsx): once the
  // shared `tasks` subscription has loaded, auto-open the Respond modal for the task
  // id passed in via ?openConsultId=, then strip it from the URL so it doesn't
  // re-trigger on refresh/back-navigation.
  const openConsultId = searchParams.get('openConsultId') || null
  useEffect(() => {
    if (!openConsultId || slug !== 'd-light' || tasks.length === 0) return
    const t = tasks.find((x) => x.id === openConsultId && x.cellAssignConsult === true)
    if (t) {
      setDlightConsultOpen(true)
      setDlightConsultTarget(t)
      setDlightConsultReply(t.recommendation || '')
      setDlightConsultCellId(t.recommendedCellId || '')
    }
    const next = new URLSearchParams(searchParams)
    next.delete('openConsultId')
    setSearchParams(next, { replace: true })
  }, [openConsultId, slug, tasks])

  // Deep-link from the To-Do List (ToDoListCard.jsx's taskDeepLink): once PCS entries
  // have loaded, auto-expand the matching person's inline profile for the id passed in
  // via ?memberId=, then strip it from the URL so it doesn't re-trigger on refresh.
  // Matches personId first, then falls back to the PCS entry's own doc id, since
  // memberId is stamped as `entry.personId || entry.id` at task-creation time
  // (see DepartmentHub.jsx's "Add to a cell group" referral button).
  const openMemberId = searchParams.get('memberId') || null
  useEffect(() => {
    if (!openMemberId || slug !== 'caring' || pcsEntries.length === 0) return
    const entry = pcsEntries.find((e) => e.personId === openMemberId || e.id === openMemberId)
    if (entry) {
      setPcsExpandedId(entry.id)
      setTimeout(() => {
        document.getElementById(`pcs-entry-${entry.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 150)
    }
    const next = new URLSearchParams(searchParams)
    next.delete('memberId')
    setSearchParams(next, { replace: true })
  }, [openMemberId, slug, pcsEntries])

  const [monthlyExpenseTotal, setMonthlyExpenseTotal] = useState(0)
  const [loadingMonthlyExpense, setLoadingMonthlyExpense] = useState(true)
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
  // Nested by classGroup: { [classGroupKey]: { [childId]: bool } } — see
  // setDepartmentChildAttendance in firestore.js for why this isn't a flat map.
  const [rkAttendanceByGroup, setRkAttendanceByGroup] = useState({})
  const [rkChildForm, setRkChildForm] = useState({ name: '', dob: '', fatherName: '', motherName: '', currentPlace: '', classGroups: [], joinedDate: '', joinedVia: '' })
  const [rkEditChild, setRkEditChild] = useState(null)
  const [rkSavingEdit, setRkSavingEdit] = useState(false)
  const [rkExpandedChildIds, setRkExpandedChildIds] = useState(() => new Set())
  const [rkActionsMenuId, setRkActionsMenuId] = useState(null)
  // Full people + D-Light visitor records (name -> join date), kept separately from rkAllUsers
  // (which only has {id, name}) so a parent's church-join date can be looked up by name.
  const [rkJoinDateSources, setRkJoinDateSources] = useState([])
  const resolveParentJoinDate = (name) => {
    const norm = (name || '').trim().toLowerCase()
    if (!norm) return ''
    return rkJoinDateSources.find((s) => s.name.trim().toLowerCase() === norm)?.joinDate || ''
  }
  const [rkAllUsers, setRkAllUsers] = useState([])
  const [rkAttendanceGroup, setRkAttendanceGroup] = useState('sunday-school')
  // Sunday School attendance is always taken on a Sunday; River Kids-1/2 on a Saturday.
  // Whenever the sub-page switches (including on first mount), snap rkDate forward to
  // the nearest matching weekday so the date picker never lands on the wrong day.
  useEffect(() => {
    const targetDow = rkAttendanceGroup === 'sunday-school' ? 0 : 6
    setRkDate(d => {
      const cur = new Date(d + 'T00:00:00')
      if (isNaN(cur.getTime()) || cur.getDay() === targetDow) return d
      const diff = (targetDow - cur.getDay() + 7) % 7
      cur.setDate(cur.getDate() + diff)
      return format(cur, 'yyyy-MM-dd')
    })
  }, [rkAttendanceGroup])
  const [rkReportKidsNames, setRkReportKidsNames] = useState([])
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
      return allTabs.filter(t => t === 'shepherdCare' || t === 'midweek' || t === 'reports')
    }
    return allTabs
  }, [slug, canViewAllCells])

  const isAccountsEntryRoute =
    slug === 'accounts' && String(location?.pathname || '').includes('/department/accounts/entry')

  const tabFromUrl = searchParams.get('tab')
  const isCellLeader = slug === 'cell' && !canViewAllCells
  useEffect(() => {
    const nextTabs = getDepartmentHubTabs(slug)
    if (slug === 'cell') {
      // Wait for profile before committing to a cell tab — avoids summary flash for cell leaders
      if (!userProfile) return
      const allowed = visibleCellTabs(userProfile)
      const fallback = defaultCellTab(userProfile)
      setActiveTab(tabFromUrl && allowed.includes(tabFromUrl) ? tabFromUrl : fallback)
    } else if (tabFromUrl && nextTabs.includes(tabFromUrl)) {
      setActiveTab(tabFromUrl)
    } else {
      setActiveTab('summary')
    }
  }, [slug, tabFromUrl, userProfile])

  // Operations' sub-view used to be an inline toggle strip (CellOperationsToggle,
  // SundayOperationsToggle, etc.) the user clicked; it's now a nested grid inside the
  // dock's folder modal (DepartmentFolderModal), so the same choice comes in via
  // ?opsSub= instead. Falls back to 'team' whenever the tab isn't Operations or the
  // param is missing/stale.
  const opsSubFromUrl = searchParams.get('opsSub')
  useEffect(() => {
    if (activeTab !== 'operations') return
    setOpsSubTab(opsSubFromUrl || 'team')
  }, [activeTab, opsSubFromUrl])

  // Same idea, for Finance's Expense/Budget/Payout Request children (moved out of
  // Operations into their own tab) — driven by ?financeSub= instead.
  const financeSubFromUrl = searchParams.get('financeSub')
  useEffect(() => {
    if (activeTab !== 'finance') return
    setFinanceSubTab(financeSubFromUrl || 'expense')
  }, [activeTab, financeSubFromUrl])

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
    const wantsDlightTeam = slug === 'd-light' && (
      activeTab === 'team' ||
      (activeTab === 'operations' && opsSubTab === 'team') ||
      activeTab === 'summary'
    )
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
    // Real-time subscription so new/edited team members appear immediately
    if (department?.name) {
      setLoadingTeam(true)
      const unsub = subscribeDepartmentTeamMembers(department.name, (list) => {
        setTeam(list)
        setTeamError('')
        setLoadingTeam(false)
      })
      return unsub
    }
  }, [slug, activeTab, opsSubTab, department])

  // Real-time team subscription for all non-Cell, non-DLight departments
  useEffect(() => {
    if (!department?.name || slug === 'cell' || slug === 'd-light') return
    setLoadingTeam(true)
    const unsub = subscribeDepartmentTeamMembers(department.name, (list) => {
      setTeam(list)
      setTeamError('')
      setLoadingTeam(false)
    })
    return unsub
  }, [slug, department])

  // Real-time tasks subscription for all departments (except Cell which has no tasks)
  useEffect(() => {
    if (!department?.name || slug === 'cell') return
    const unsub = subscribeTasksByDepartment(department.name, (list) => {
      setTasks(list)
    })
    return unsub
  }, [slug, department])

  useEffect(() => {
    if (slug !== 'river-kids' || (activeTab !== 'attendance' && activeTab !== 'register') || !department) return
    setRkLoading(true)
    // Load children, attendance, and people for parent search all at once
    Promise.all([
      getDepartmentChildren(department.name),
      getDepartmentChildAttendance(department.name, rkDate),
      getPeople().catch(() => []),
      getPCSLookup().catch(() => []),
      getDelightVisitors().catch(() => []),
    ])
      .then(([children, att, fromPeople, fromLookup, fromVisitors]) => {
        const active = children.filter((c) => c.active !== false)
        setRkChildren(active)
        setRkAttendanceByGroup(typeof att.present === 'object' && att.present ? { ...att.present } : {})
        // Build parent name suggestions: people directory + pcs_lookup + names already saved in kids
        const seen = new Set()
        const merged = []
        const add = (name, id) => {
          const key = (name || '').trim().toLowerCase()
          if (key && !seen.has(key)) { seen.add(key); merged.push({ id, name: name.trim() }) }
        }
        for (const x of [...fromPeople, ...fromLookup]) add(x.name, x.id)
        for (const c of active) {
          if (c.fatherName) add(c.fatherName, `f-${c.id}`)
          if (c.motherName) add(c.motherName, `m-${c.id}`)
        }
        merged.sort((a, b) => a.name.localeCompare(b.name))
        setRkAllUsers(merged)
        // Name -> church-join date, so a parent's date can be suggested for their child.
        setRkJoinDateSources([
          ...fromPeople.filter((p) => p.firstVisitDate).map((p) => ({ name: p.name, joinDate: p.firstVisitDate })),
          ...fromVisitors.filter((v) => v.attendedDate).map((v) => ({ name: v.name, joinDate: v.attendedDate })),
        ])
      })
      .catch((error) => { console.error('River Kids attendance load error:', error); setRkChildren([]); setRkAttendanceByGroup({}) })
      .finally(() => setRkLoading(false))
  }, [slug, activeTab, department, rkDate])

  // Real-time subscription to the "River Kids" name list on the Sunday Ministry report —
  // kept live across all three groups (not just Sunday School) so every group's presence
  // toggle can merge into the same list Sunday Ministry reads its "River Kids" total from.
  useEffect(() => {
    if (slug !== 'river-kids' || activeTab !== 'attendance') {
      return
    }
    const unsub = subscribeSundayReportRiverKids(rkDate, names => setRkReportKidsNames(names))
    return unsub
  }, [slug, activeTab, rkDate])


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
    // Budget items are now loaded by BudgetPage directly; nothing to do here
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
      getCellGroups(department.name)
        .then((groups) => {
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
        })
        .finally(() => setLoadingCellGroups(false))
    }
  }, [department, slug, activeTab, canViewAllCells, userProfile?.cellGroup, userProfile?.cellId])

  useEffect(() => {
    if (!(slug === 'cell' && activeTab === 'summary')) return
    setLoadingCellPending(true)
    const unsub = subscribeCellMemberPendingChanges((changes) => {
      setCellPendingChanges(changes)
      setLoadingCellPending(false)
    })
    return unsub
  }, [slug, activeTab])


  useEffect(() => {
    const wantsCellPlanning = slug === 'cell' && (activeTab === 'planning' || (activeTab === 'operations' && opsSubTab === 'planning'))
    if (wantsCellPlanning) {
      getBackToBibleList().then(setBackToBibleList).catch(() => setBackToBibleList([]))
    }
  }, [slug, activeTab, opsSubTab])

  useEffect(() => {
    if (slug !== 'd-light') return
    // Silently migrate any legacy "Sunday Service" records once
    migrateSundayServiceToEnglish().catch(() => {})
    setLoadingDelightVisitors(true)
    // Real-time subscription so the director's dashboard updates immediately when any
    // D Light user adds, edits, or deletes a visitor in any tab or session.
    const unsub = subscribeDelightVisitors((visitors) => {
      setDelightVisitors(visitors.map(v =>
        v.serviceAttended === 'Sunday Service' ? { ...v, serviceAttended: 'English Service' } : v
      ))
      setLoadingDelightVisitors(false)
    })
    return unsub
  }, [slug])

  // Live D-Light visitor list for the Caring hub too — the "Add to PCS — from Cell" /
  // "Pending from Cell" panels match against this list to decide whether someone is
  // linkable yet. Without this subscription (bug: it only ran for slug === 'd-light'),
  // that list was always empty on the Caring hub, so those panels could never detect
  // that D-Light had since added the person and would never surface "Add to PCS".
  useEffect(() => {
    if (slug !== 'caring' || (activeTab !== 'pcs' && activeTab !== 'summary')) return
    const unsub = subscribeDelightVisitors((visitors) => {
      setDelightVisitors(visitors.map(v =>
        v.serviceAttended === 'Sunday Service' ? { ...v, serviceAttended: 'English Service' } : v
      ))
    })
    return unsub
  }, [slug, activeTab])

  useEffect(() => {
    if (slug !== 'd-light' || activeTab !== 'visitorEntry') return
    getSundayAttendanceCountsByName().then(setVisitorSundayCounts).catch(() => setVisitorSundayCounts(new Map()))
  }, [slug, activeTab])

  // Second/Third/Fourth week comer candidates for the Follow-Up panel:
  // - Second week: D-Light visitors whose first attendedDate was exactly last week.
  // - Third week: names Sunday Ministry already confirmed as second-week attendees last week.
  // - Fourth week: names Sunday Ministry already confirmed as third-week attendees last week.
  // Each list excludes names already marked on the target Sunday's report.
  useEffect(() => {
    if (slug !== 'd-light' || activeTab !== 'visitorEntry') return
    setLoadingWeekComerCandidates(true)
    const target = new Date(weekComerDate + 'T00:00:00')
    const lastWeek = new Date(target)
    lastWeek.setDate(target.getDate() - 7)
    const lastWeekWindowStart = new Date(lastWeek)
    lastWeekWindowStart.setDate(lastWeek.getDate() - 6)
    const lastWeekStr = format(lastWeek, 'yyyy-MM-dd')

    Promise.all([getSundayReport(weekComerDate), getSundayReport(lastWeekStr)])
      .then(([targetReport, lastWeekReport]) => {
        const alreadyIn = (field) =>
          new Set((targetReport?.[field] || []).map((n) => String(n).trim().toLowerCase()))
        const alreadySecond = alreadyIn('secondWeekAttendeesNames')
        const alreadyThird = alreadyIn('thirdWeekAttendeesNames')
        const alreadyFourth = alreadyIn('fourthWeekAttendeesNames')

        const secondCandidates = [...new Set(
          delightVisitors
            .filter((v) => {
              if (!v.attendedDate) return false
              const d = new Date(v.attendedDate + 'T00:00:00')
              return d >= lastWeekWindowStart && d <= lastWeek
            })
            .map((v) => v.name)
            .filter(Boolean)
        )].filter((n) => !alreadySecond.has(n.trim().toLowerCase()))

        const thirdCandidates = [...new Set((lastWeekReport?.secondWeekAttendeesNames || []).filter(Boolean))]
          .filter((n) => !alreadyThird.has(n.trim().toLowerCase()))

        const fourthCandidates = [...new Set((lastWeekReport?.thirdWeekAttendeesNames || []).filter(Boolean))]
          .filter((n) => !alreadyFourth.has(n.trim().toLowerCase()))

        setWeekComerCandidates({ second: secondCandidates, third: thirdCandidates, fourth: fourthCandidates })
      })
      .catch(() => setWeekComerCandidates({ second: [], third: [], fourth: [] }))
      .finally(() => setLoadingWeekComerCandidates(false))
  }, [slug, activeTab, weekComerDate, delightVisitors])

  const WEEK_COMER_FIELDS = { second: 'secondWeekAttendeesNames', third: 'thirdWeekAttendeesNames', fourth: 'fourthWeekAttendeesNames' }

  const markWeekComer = async (bucket, name) => {
    const fieldKey = WEEK_COMER_FIELDS[bucket]
    setMarkingWeekComerName(name)
    try {
      const current = await getSundayReport(weekComerDate)
      const existing = current?.[fieldKey] || []
      const norm = name.trim().toLowerCase()
      const next = existing.some((n) => String(n).trim().toLowerCase() === norm) ? existing : [...existing, name.trim()]
      await patchSundayReportNameField(weekComerDate, fieldKey, next, userProfile?.email || userProfile?.displayName || 'unknown')
      setWeekComerCandidates((prev) => ({ ...prev, [bucket]: prev[bucket].filter((n) => n !== name) }))
    } catch {
      alert('Failed to add — please try again.')
    }
    setMarkingWeekComerName(null)
  }

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
      // Live subscription (not a one-time fetch) so the "Absent for N consecutive
      // Sundays" badge updates as soon as a Sunday report or a person-linked
      // check-in changes, instead of only refreshing when this tab remounts.
      const unsubSundayAttendance = subscribeToRecentSundayAttendanceWeeks(
        20, setSundayAttendanceWeeks, () => setSundayAttendanceWeeks([])
      )
      getDepartmentChildren('River Kids').then(kids => setRkChildrenForPCS(kids.filter(k => k.active !== false))).catch(() => setRkChildrenForPCS([]))
      return () => unsubSundayAttendance()
    }
  }, [slug, activeTab])

  useEffect(() => {
    if (slug !== 'accounts' || activeTab !== 'summary') return
    setAcctSummaryLoading(true)
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()
    const wkStart = startOfWeek(now, { weekStartsOn: 1 })
    const wkEnd = endOfWeek(now, { weekStartsOn: 1 })
    const wkEndMs = new Date(wkEnd); wkEndMs.setHours(23, 59, 59, 999)
    Promise.all([
      getFinanceIncome({ year, month }),
      getFinanceExpense({ year, month }),
      getFinanceExpense({ startDate: wkStart, endDate: wkEndMs }),
    ]).then(([inc, exp, wkl]) => {
      setAcctSummary({
        incomeCount: inc.length,
        incomeTotal: inc.reduce((s, e) => s + (Number(e.amount) || 0), 0),
        expenseCount: exp.length,
        expenseTotal: exp.reduce((s, e) => s + (Number(e.amount) || 0), 0),
        weeklyCount: wkl.length,
        weeklyPending: wkl.filter(e => e.status === 'pending').length,
        weeklyApproved: wkl.filter(e => e.status === 'approved' || !e.status).length,
      })
    }).catch(() => {}).finally(() => setAcctSummaryLoading(false))
  }, [slug, activeTab])

  // Live listener for cell-leader PCS referral tasks (Caring hub)
  useEffect(() => {
    if (slug !== 'caring') return
    const unsub = subscribeCellMemberReferralTasks(setCellReferralTasks)
    return unsub
  }, [slug])

  // Live listener for Caring's own "Notify Cell Director to Assign Cell" referrals
  // (department: 'Cell', pcsReferral: true) — lets the button's "sent" state persist
  // across reloads and prevents re-sending a duplicate referral for the same person.
  useEffect(() => {
    if (slug !== 'caring') return
    const unsub = subscribePCSReferralTasks(setPcsCellReferralTasks)
    return unsub
  }, [slug])

  // Live listener for "Add to PCS" notifications sent by cell leaders
  useEffect(() => {
    if (slug !== 'caring') return
    const unsub = subscribePCSAddNotifications(setPcsAddNotifications)
    return unsub
  }, [slug])

  // Live listener for visitor proposals sent by cell leaders to D-Light
  useEffect(() => {
    if (slug !== 'd-light') return
    const unsub = subscribeCellVisitorProposals(setCellVisitorProposals)
    return unsub
  }, [slug])

  // Live "Total Expense (This Month)" — shown on every department's dashboard.
  useEffect(() => {
    if (!department?.name) return
    setLoadingMonthlyExpense(true)
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()
    const unsub = subscribeFinanceExpenseByDept(department.name, (entries) => {
      const total = (entries || [])
        .filter((e) => {
          const d = e.date instanceof Date ? e.date : e.date?.toDate?.()
          return d && d.getFullYear() === y && d.getMonth() === m
        })
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
      setMonthlyExpenseTotal(total)
      setLoadingMonthlyExpense(false)
    })
    return unsub
  }, [department?.name])

  useEffect(() => {
    if (!expandedCellId) {
      setCellMembers([])
      setCellRecentAttendedNames(new Set())
      return
    }
    setLoadingCellMembers(true)
    getCellGroupMembers(expandedCellId)
      .then(setCellMembers)
      .finally(() => setLoadingCellMembers(false))

    const fourWeeksAgo = new Date()
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28)
    Promise.all([
      getCellReportsByCell(expandedCellId).then((reports) => {
        const recentReports = reports.filter((r) => r.reportDate && new Date(r.reportDate) >= fourWeeksAgo)
        return Promise.all(recentReports.map((r) => getCellReportAttendees(r.id)))
      }),
      getRecentSundayAttendanceNamesByCell(expandedCellId, 4),
    ]).then(([attendeeLists, sundayWeeks]) => {
      const names = new Set()
      attendeeLists.flat().forEach((a) => { if (a.name) names.add(String(a.name).trim().toLowerCase()) })
      sundayWeeks.forEach((wk) => wk.presentNames.forEach((n) => names.add(n)))
      setCellRecentAttendedNames(names)
    }).catch(() => setCellRecentAttendedNames(new Set()))
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
        <Link to="/departments" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-600 text-sm font-medium hover:bg-blue-100 hover:border-blue-300 active:scale-95 transition-all">← Departments</Link>
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
        <Link to="/departments" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-600 text-sm font-medium hover:bg-blue-100 hover:border-blue-300 active:scale-95 transition-all">← Departments</Link>
        <p className="mt-4">You do not have access to Sunday Ministry department.</p>
      </div>
    )
  }

  if (slug !== 'sunday-ministry' && !hasAccess(userProfile, department.name) && !isAccountsEntryPassthrough) {
    return (
      <div className="p-6 text-slate-600">
        <Link to="/departments" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-600 text-sm font-medium hover:bg-blue-100 hover:border-blue-300 active:scale-95 transition-all">← Departments</Link>
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

      <div className="space-y-6 py-4 px-2 lg:px-6">
      {isAccountsEntryRoute ? (
        <Outlet />
      ) : loading ? (
        <div className="py-8 text-center text-slate-500">Loading...</div>
      ) : (
        <>
          {/* ── Pending Consultations: Cell Director asking for D-Light input ──
               Rendered above everything else (including the metrics/KPI section) on
               the Hub landing tab, Visitor Entry, and Assign, so a D-Light Director
               can't land on the page and miss a pending consult request. ── */}
          {slug === 'd-light' && (activeTab === 'summary' || activeTab === 'visitorEntry' || activeTab === 'assign') && (() => {
            const consultTasks = tasks.filter(t => t.cellAssignConsult === true && t.status !== 'Completed')
            if (consultTasks.length === 0) return null
            return (
              <div className="bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-300 rounded-2xl shadow-md overflow-hidden">
                <button
                  type="button"
                  onClick={() => setDlightConsultOpen(o => !o)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-red-100/40 transition-colors"
                >
                  <span className="relative flex-shrink-0 flex items-center justify-center w-8 h-8">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-60 animate-ping" />
                    <span className="relative inline-flex rounded-full h-8 w-8 bg-red-500 text-white items-center justify-center text-base">⚠️</span>
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-red-800">Pending Consultations</p>
                    <p className="text-xs text-red-600">A Cell Director needs your input on where to place someone</p>
                  </div>
                  <span className="bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0">
                    {consultTasks.length}
                  </span>
                  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" className={`text-red-500 transition-transform flex-shrink-0 ${dlightConsultOpen ? 'rotate-180' : ''}`}>
                    <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                {dlightConsultOpen && (
                  <>
                    <p className="px-4 pb-2 text-xs text-red-500 border-t border-red-200 pt-3">
                      The Cell Director is asking for your input on where to place these people.
                    </p>
                    <ul className="divide-y divide-red-100">
                      {consultTasks.map((t) => {
                        const responded = t.status === 'Responded'
                        return (
                          <li key={t.id} className="px-4 py-3 flex flex-wrap items-start gap-3 bg-white/60">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-slate-800 text-sm truncate">{t.consultPersonName || t.taskTitle}</p>
                              {t.consultPersonPhone && <p className="text-xs text-slate-500">{t.consultPersonPhone}</p>}
                              <p className="text-xs text-slate-400 mt-0.5">{t.consultNote}</p>
                              <p className="text-[11px] text-slate-400 mt-0.5">Requested by {t.requestedBy || 'Cell Director'}</p>
                              {responded && t.recommendation && (
                                <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-2 py-1 mt-1.5 italic">
                                  Your reply: "{t.recommendation}"
                                </p>
                              )}
                            </div>
                            <div className="flex gap-2 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => { setDlightConsultTarget(t); setDlightConsultReply(t.recommendation || ''); setDlightConsultCellId(t.recommendedCellId || '') }}
                                className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700"
                              >
                                {responded ? 'Edit Reply' : 'Respond'}
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  try { await updateTask(t.id, { status: 'Completed' }) } catch { /* ignore */ }
                                }}
                                className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs hover:bg-slate-50"
                              >
                                Dismiss
                              </button>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </>
                )}
              </div>
            )
          })()}

          {activeTab === 'summary' && (
            <>
              {/* ── Total Expense (This Month) — shown on every department's dashboard ── */}
              <div className="bg-white rounded-xl border border-slate-200 border-l-4 border-l-rose-300 shadow-sm px-4 py-2.5 flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500">Total Expense (This Month)</p>
                <p className="text-sm font-bold text-slate-700 bg-rose-50 px-2.5 py-1 rounded-lg tabular-nums">
                  {loadingMonthlyExpense ? '—' : `₹${monthlyExpenseTotal.toLocaleString('en-IN')}`}
                </p>
              </div>

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
                            onClick={() => { setFinanceSubTab('budget'); setActiveTab('finance'); setSearchParams({ tab: 'finance' }, { replace: true }) }}
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
                              onClick={() => openFillInviteModal(inv)}
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
                    <div className="p-5 text-center text-slate-500 text-sm">Loading...</div>
                  ) : subDepartments.length === 0 ? (
                    <div className="p-5 text-center text-slate-500 text-sm">
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
                    <div className="p-4 text-center text-slate-500 text-sm">Loading…</div>
                  ) : mediaSundayDesignProgram.length === 0 ? (
                    <div className="p-4 text-center text-slate-500 text-sm">
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
              ) : slug === 'accounts' ? (
                <div className="space-y-4">
                  {acctSummaryLoading || !acctSummary ? (
                    <div className="py-10 text-center text-slate-400 text-sm">Loading…</div>
                  ) : (() => {
                    const now = new Date()
                    const monthLabel = format(now, 'MMMM yyyy')
                    const wkStart = startOfWeek(now, { weekStartsOn: 1 })
                    const wkEnd = endOfWeek(now, { weekStartsOn: 1 })
                    const weekLabel = `${format(wkStart, 'd MMM')} – ${format(wkEnd, 'd MMM yyyy')}`
                    const net = acctSummary.incomeTotal - acctSummary.expenseTotal
                    return (
                      <>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{monthLabel}</p>

                        {/* Income + Expense + Net row */}
                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-2xl border border-emerald-200 shadow-sm px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 mb-1">Income</p>
                            <p className="text-xl font-black text-emerald-700">₹{acctSummary.incomeTotal.toLocaleString('en-IN')}</p>
                            <p className="text-[10px] text-emerald-500 mt-1">{acctSummary.incomeCount} {acctSummary.incomeCount === 1 ? 'entry' : 'entries'}</p>
                          </div>
                          <div className="bg-gradient-to-br from-rose-50 to-rose-100 rounded-2xl border border-rose-200 shadow-sm px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-rose-500 mb-1">Expense</p>
                            <p className="text-xl font-black text-rose-700">₹{acctSummary.expenseTotal.toLocaleString('en-IN')}</p>
                            <p className="text-[10px] text-rose-500 mt-1">{acctSummary.expenseCount} {acctSummary.expenseCount === 1 ? 'entry' : 'entries'}</p>
                          </div>
                          <div className={`bg-gradient-to-br rounded-2xl border shadow-sm px-4 py-3 ${net >= 0 ? 'from-indigo-50 to-indigo-100 border-indigo-200' : 'from-amber-50 to-amber-100 border-amber-200'}`}>
                            <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${net >= 0 ? 'text-indigo-500' : 'text-amber-500'}`}>Net</p>
                            <p className={`text-xl font-black ${net >= 0 ? 'text-indigo-700' : 'text-amber-700'}`}>{net < 0 ? '-' : ''}₹{Math.abs(net).toLocaleString('en-IN')}</p>
                            <p className={`text-[10px] mt-1 ${net >= 0 ? 'text-indigo-400' : 'text-amber-500'}`}>{net >= 0 ? 'Surplus' : 'Deficit'}</p>
                          </div>
                        </div>

                        {/* Weekly entries */}
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Weekly Entry</p>
                            <p className="text-[10px] text-slate-400">{weekLabel}</p>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex-1 text-center">
                              <p className="text-2xl font-black text-slate-700">{acctSummary.weeklyCount}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">Total entries</p>
                            </div>
                            <div className="w-px h-10 bg-slate-100" />
                            <div className="flex-1 text-center">
                              <p className="text-2xl font-black text-amber-600">{acctSummary.weeklyPending}</p>
                              <p className="text-[10px] text-amber-500 mt-0.5">Pending</p>
                            </div>
                            <div className="w-px h-10 bg-slate-100" />
                            <div className="flex-1 text-center">
                              <p className="text-2xl font-black text-emerald-600">{acctSummary.weeklyApproved}</p>
                              <p className="text-[10px] text-emerald-500 mt-0.5">Approved</p>
                            </div>
                          </div>
                        </div>

                        {/* Quick-nav tiles */}
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            { label: 'Income', path: '/department/accounts/entry?tab=income', icon: '💰', desc: 'View income entries' },
                            { label: 'Expense', path: '/department/accounts/entry?tab=expense', icon: '📤', desc: 'View expense entries' },
                            { label: 'Weekly', path: '/department/accounts/entry?tab=weekly', icon: '📋', desc: 'Weekly entry log' },
                          ].map(({ label, icon, desc, path }) => (
                            <button
                              key={label}
                              type="button"
                              onClick={() => navigate(path)}
                              className="bg-white rounded-2xl border border-slate-100 shadow-sm px-3 py-3 text-center hover:border-indigo-200 hover:bg-indigo-50 active:scale-95 transition-all"
                            >
                              <p className="text-xl mb-1">{icon}</p>
                              <p className="text-xs font-semibold text-slate-700">{label}</p>
                              <p className="text-[9px] text-slate-400 mt-0.5">{desc}</p>
                            </button>
                          ))}
                        </div>
                      </>
                    )
                  })()}
                </div>
              ) : slug === 'sec-core' ? (
                <SecCoreAnalyticsHub />
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
                      <div className="p-4 text-center text-slate-500 text-sm">No entries yet.</div>
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

          {activeTab === 'directorBoard' && slug === 'sec-core' && (
            <DirectorBoardPage canEdit={canEdit} userProfile={userProfile} />
          )}

          {activeTab === 'sundayLeader' && slug === 'sec-core' && (
            <SundayLeaderTab canEdit={canEdit} userProfile={userProfile} />
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
                <div className="px-5 py-5 text-center text-slate-500">Loading…</div>
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

          {/* ── Forwarded from PCS: Caring needs this person registered in D-Light ── */}
          {activeTab === 'visitorEntry' && slug === 'd-light' && (() => {
            const pcsForwardTasks = tasks.filter(t => t.pcsReferral === true && t.status !== 'Completed')
            if (pcsForwardTasks.length === 0) return null
            return (
              <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => setPcsForwardOpen(o => !o)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-amber-50 transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                  <p className="text-sm font-bold text-amber-800 flex-1">Forwarded from PCS</p>
                  <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
                    {pcsForwardTasks.length}
                  </span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`text-amber-400 transition-transform flex-shrink-0 ${pcsForwardOpen ? 'rotate-180' : ''}`}>
                    <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                {pcsForwardOpen && (
                  <>
                    <p className="px-4 pb-2 text-xs text-slate-400 border-t border-amber-100 pt-3">
                      Caring needs these people registered in D-Light before they can be added to PCS.
                    </p>
                    <ul className="divide-y divide-amber-50">
                      {pcsForwardTasks.map((t) => {
                        const pName  = t.pcsPersonName || ''
                        const pPhone = t.pcsPersonPhone || ''
                        const adding = pcsForwardAdding.has(t.id)
                        const dismissing = pcsForwardDismissing.has(t.id)
                        return (
                          <li key={t.id} className="px-4 py-3 flex flex-wrap items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-slate-800 text-sm truncate">{pName || t.taskTitle}</p>
                              {pPhone && <p className="text-xs text-slate-500">{pPhone}</p>}
                              <p className="text-xs text-slate-400 mt-0.5">{t.notes}</p>
                            </div>
                            <div className="flex gap-2 flex-shrink-0">
                              <button
                                type="button"
                                disabled={adding || dismissing}
                                onClick={async () => {
                                  setPcsForwardAdding(prev => new Set([...prev, t.id]))
                                  try {
                                    await addDelightVisitor({
                                      name:      pName,
                                      phone:     pPhone,
                                      source:    'pcs',
                                      year:      new Date().getFullYear(),
                                      createdBy: userProfile?.email || 'unknown',
                                    })
                                    await updateTask(t.id, { status: 'Completed' })
                                  } catch (e) {
                                    console.error('Register PCS referral error', e)
                                    alert('Failed to register visitor. Please try again.')
                                  } finally {
                                    setPcsForwardAdding(prev => { const s = new Set(prev); s.delete(t.id); return s })
                                  }
                                }}
                                className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 disabled:opacity-50"
                              >
                                {adding ? 'Registering…' : 'Register in D-Light'}
                              </button>
                              <button
                                type="button"
                                disabled={adding || dismissing}
                                onClick={async () => {
                                  if (!window.confirm(`Dismiss the PCS referral for ${pName || 'this person'}?`)) return
                                  setPcsForwardDismissing(prev => new Set([...prev, t.id]))
                                  try {
                                    await updateTask(t.id, { status: 'Completed' })
                                  } catch (e) {
                                    console.error('Dismiss PCS referral error', e)
                                    alert('Failed to dismiss. Please try again.')
                                  } finally {
                                    setPcsForwardDismissing(prev => { const s = new Set(prev); s.delete(t.id); return s })
                                  }
                                }}
                                className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs hover:bg-slate-50 disabled:opacity-50"
                              >
                                {dismissing ? 'Dismissing…' : 'Dismiss'}
                              </button>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </>
                )}
              </div>
            )
          })()}

          {/* Respond to Cell Assignment Consult modal */}
          {dlightConsultTarget && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDlightConsultTarget(null)}>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">Recommendation for {dlightConsultTarget.consultPersonName}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Sent back to the Cell Director in their Unassigned list.</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Recommended cell group</p>
                  <select
                    value={dlightConsultCellId}
                    onChange={(e) => setDlightConsultCellId(e.target.value)}
                    disabled={loadingDlightConsultCells}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:opacity-50"
                  >
                    <option value="">
                      {loadingDlightConsultCells ? 'Loading cell groups…' : '— No specific cell —'}
                    </option>
                    {dlightConsultCellOptions.map((cell) => (
                      <option key={cell.id} value={cell.id}>{cell.cellName || cell.id}</option>
                    ))}
                  </select>
                </div>
                <textarea
                  value={dlightConsultReply}
                  onChange={(e) => setDlightConsultReply(e.target.value)}
                  placeholder="e.g. Best-fit cell, background context, or next steps…"
                  rows={4}
                  autoFocus
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!dlightConsultReply.trim() || sendingDlightReply}
                    onClick={async () => {
                      setSendingDlightReply(true)
                      try {
                        const recommendedCell = dlightConsultCellOptions.find((c) => c.id === dlightConsultCellId)
                        await updateTask(dlightConsultTarget.id, {
                          status: 'Responded',
                          recommendation: dlightConsultReply.trim(),
                          recommendedCellId: dlightConsultCellId || '',
                          recommendedCellName: recommendedCell?.cellName || '',
                          respondedBy: userProfile?.email || '',
                          respondedAt: new Date().toISOString(),
                        })
                        setDlightConsultTarget(null)
                        setDlightConsultReply('')
                        setDlightConsultCellId('')
                      } catch (err) {
                        console.error('Respond to consult error', err)
                        alert('Failed to send recommendation. Please try again.')
                      } finally {
                        setSendingDlightReply(false)
                      }
                    }}
                    className="flex-1 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium shadow-sm disabled:opacity-50"
                  >
                    {sendingDlightReply ? 'Sending…' : 'Send to Cell Director'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDlightConsultTarget(null); setDlightConsultCellId('') }}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── From Cell Reports: visitor proposals ── */}
          {activeTab === 'visitorEntry' && slug === 'd-light' && cellVisitorProposals.length > 0 && (
            <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() => setCellVisitorProposalOpen(o => !o)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-indigo-50 transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />
                <p className="text-sm font-bold text-indigo-800 flex-1">Visitors from Cell Reports</p>
                <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
                  {cellVisitorProposals.length}
                </span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`text-indigo-400 transition-transform flex-shrink-0 ${cellVisitorProposalOpen ? 'rotate-180' : ''}`}>
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {cellVisitorProposalOpen && (
                <>
                  <p className="px-4 pb-2 text-xs text-slate-400 border-t border-indigo-100 pt-3">
                    Cell leaders flagged these visitors for D-Light registration. Review and accept or dismiss each one.
                  </p>
                  <ul className="divide-y divide-indigo-50">
                    {cellVisitorProposals.map((p) => (
                      <li key={p.id} className="px-4 py-3 flex flex-wrap items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-800 text-sm truncate">{p.visitorName}</p>
                          {p.phone && <p className="text-xs text-slate-500">{p.phone}</p>}
                          <p className="text-xs text-slate-400 mt-0.5">{p.cellName || p.cellId} · {p.reportDate}</p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            type="button"
                            disabled={cellVisitorProposalAdding.has(p.id) || cellVisitorProposalDismissing.has(p.id)}
                            onClick={async () => {
                              setCellVisitorProposalAdding(prev => new Set([...prev, p.id]))
                              try {
                                const newId = await addDelightVisitor({
                                  name:        p.visitorName,
                                  phone:       p.phone || '',
                                  source:      'cell',
                                  year:        new Date().getFullYear(),
                                  createdBy:   userProfile?.email || 'unknown',
                                })
                                await completeCellVisitorProposal(p.id)
                                if (newId) {
                                  setCellVisitorProposalAdding(prev => { const s = new Set(prev); s.delete(p.id); return s })
                                }
                              } catch (e) {
                                console.error('Accept visitor proposal error', e)
                                alert('Failed to add visitor')
                                setCellVisitorProposalAdding(prev => { const s = new Set(prev); s.delete(p.id); return s })
                              }
                            }}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
                          >
                            {cellVisitorProposalAdding.has(p.id) ? 'Adding…' : 'Add to D-Light'}
                          </button>
                          <button
                            type="button"
                            disabled={cellVisitorProposalAdding.has(p.id) || cellVisitorProposalDismissing.has(p.id)}
                            onClick={async () => {
                              setCellVisitorProposalDismissing(prev => new Set([...prev, p.id]))
                              try {
                                await dismissCellVisitorProposal(p.id)
                              } catch (e) {
                                console.error('Dismiss visitor proposal error', e)
                                setCellVisitorProposalDismissing(prev => { const s = new Set(prev); s.delete(p.id); return s })
                              }
                            }}
                            className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs hover:bg-slate-50 disabled:opacity-50"
                          >
                            {cellVisitorProposalDismissing.has(p.id) ? 'Dismissing…' : 'Dismiss'}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
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
                        setDelightVisitorForm({ name: '', dob: '', phone: '', email: '', nativity: '', currentPlace: '', serviceAttended: '', attendedDate: upcomingSunday(), howKnown: '', source: '', year: visitorSubPage === 'current' ? VISITOR_CURRENT_YEAR : visitorPrevYear })
                        setDelightVisitorModalOpen(true)
                      }}
                      className="px-4 min-h-[44px] py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
                    >
                      Add Visitor
                    </button>
                  </div>
                )}
              </div>

              {/* Follow-Up: mark returning visitors as 2nd/3rd/4th week comers — writes straight
                  into that Sunday's report on Sunday Ministry's side. */}
              {canEditDelightVisitors && (
                <div className="px-5 py-4 border-b border-slate-100 bg-indigo-50/30">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800">Follow-Up: Week Comers</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Tap a name to mark it present — it reflects straight into that Sunday's attendance report.
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <label className="text-xs text-slate-500">Sunday</label>
                      <input
                        type="date"
                        value={weekComerDate}
                        onChange={(e) => {
                          const val = e.target.value
                          if (!val) return
                          const d = new Date(val + 'T00:00:00')
                          if (d.getDay() === 0) {
                            setWeekComerDate(val)
                            setWeekComerDateWarning(false)
                          } else {
                            // Not a Sunday — snap to whichever Sunday (before or after) is closer,
                            // since this date picks which sunday_reports doc gets written to.
                            const dow = d.getDay()
                            const snapped = new Date(d)
                            snapped.setDate(d.getDate() + (dow <= 3 ? -dow : 7 - dow))
                            setWeekComerDate(format(snapped, 'yyyy-MM-dd'))
                            setWeekComerDateWarning(true)
                          }
                        }}
                        className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      />
                    </div>
                  </div>
                  {weekComerDateWarning && (
                    <p className="text-xs text-amber-600 font-medium mb-3 -mt-1">
                      ⚠ Sunday Ministry attendance only exists per-Sunday — snapped to the nearest Sunday ({weekComerDate}).
                    </p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { bucket: 'second', label: 'Second Week' },
                      { bucket: 'third', label: 'Third Week' },
                      { bucket: 'fourth', label: 'Fourth Week' },
                    ].map(({ bucket, label }) => (
                      <div key={bucket} className="bg-white rounded-xl border border-slate-200 p-3">
                        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">{label}</p>
                        {loadingWeekComerCandidates ? (
                          <p className="text-xs text-slate-400">Loading…</p>
                        ) : weekComerCandidates[bucket].length === 0 ? (
                          <p className="text-xs text-slate-400">No candidates.</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {weekComerCandidates[bucket].map((name) => (
                              <button
                                key={name}
                                type="button"
                                disabled={markingWeekComerName === name}
                                onClick={() => markWeekComer(bucket, name)}
                                className="px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors disabled:opacity-50"
                              >
                                {markingWeekComerName === name ? 'Adding…' : `+ ${name}`}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                <div className="px-5 py-5 text-center text-slate-500">Loading…</div>
              ) : filteredDelightVisitors.length === 0 ? (
                <div className="px-5 py-5 text-center text-slate-500">No visitor entries yet.</div>
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
                        const sundayWeeks = visitorSundayCounts.get(String(v.name || '').trim().toLowerCase()) || 0
                        return (
                          <Fragment key={v.id}>
                            <tr
                              className={`cursor-pointer transition-colors border-b border-white/60 ${rowBg} ${open ? 'opacity-80' : 'hover:opacity-90'}`}
                              onClick={() => setVisitorMenuOpenId(open ? null : v.id)}
                            >
                              <td className="px-6 py-3 font-semibold text-base text-slate-900">
                                <span className="inline-flex items-center gap-2">
                                  {v.name || '—'}
                                  {sundayWeeks > 4 && (
                                    <span title={`Attended ${sundayWeeks} Sundays`} className="text-amber-500 text-base leading-none">★</span>
                                  )}
                                  {sundayWeeks >= 2 && sundayWeeks <= 4 && (
                                    <span title={`Attended ${sundayWeeks} Sundays`} className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-600 border border-indigo-200">
                                      {sundayWeeks}wk
                                    </span>
                                  )}
                                </span>
                              </td>
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
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
                <div className="p-5 border-b border-slate-200 dark:border-slate-800">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{editingCaringId ? 'Edit member' : 'Add Member'}</h3>
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
                      <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Membership Number</label>
                      <input type="text" value={caringMemberForm.membershipNumber} onChange={(e) => setCaringMemberForm((f) => ({ ...f, membershipNumber: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Name *</label>
                      <input type="text" value={caringMemberForm.name} onChange={(e) => setCaringMemberForm((f) => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" required />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">DOB</label>
                    <input type="date" value={caringMemberForm.dob} onChange={(e) => setCaringMemberForm((f) => ({ ...f, dob: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Phone Number</label>
                      <input type="text" value={caringMemberForm.phone} onChange={(e) => setCaringMemberForm((f) => ({ ...f, phone: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Email</label>
                      <input type="email" value={caringMemberForm.email} onChange={(e) => setCaringMemberForm((f) => ({ ...f, email: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Nativity</label>
                      <input type="text" value={caringMemberForm.nativity} onChange={(e) => setCaringMemberForm((f) => ({ ...f, nativity: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Current Place</label>
                      <input type="text" value={caringMemberForm.currentPlace} onChange={(e) => setCaringMemberForm((f) => ({ ...f, currentPlace: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">First Sunday</label>
                      <input type="date" value={caringMemberForm.firstSunday} onChange={(e) => setCaringMemberForm((f) => ({ ...f, firstSunday: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Cell Name</label>
                      <select value={caringMemberForm.cellName} onChange={(e) => setCaringMemberForm((f) => ({ ...f, cellName: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                        <option value="">— Select —</option>
                        {caringCellNames.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="submit" className="px-4 min-h-[44px] py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-medium shadow-sm transition-colors">Save</button>
                    <button type="button" onClick={() => { setCaringMemberModalOpen(false); setEditingCaringId(null) }} className="px-4 min-h-[44px] py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-400 active:bg-slate-100 dark:active:bg-slate-700 transition-colors">Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ── Paste-data modal ─────────────────────────────────────────── */}
          {pasteImportOpen && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
                <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Paste Visitor Data</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Paste rows copied from Excel or a spreadsheet. Each row: Serial(optional), Name, DOB, Phone, Email, Nativity, Place, Service, Date Attended, How Known</p>
                  </div>
                  <button type="button" onClick={() => setPasteImportOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl leading-none">×</button>
                </div>
                <div className="p-5 flex-1 overflow-y-auto">
                  <textarea
                    autoFocus
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder="Paste your data here…"
                    className="w-full h-64 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
                <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                  <button type="button" onClick={() => setPasteImportOpen(false)} className="px-4 min-h-[44px] py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-400 active:bg-slate-100 dark:active:bg-slate-700 transition-colors">Cancel</button>
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
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium shadow-sm disabled:opacity-40 disabled:pointer-events-none"
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
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 sm:rounded-2xl rounded-t-2xl shadow-2xl w-full sm:max-w-lg max-h-[92vh] flex flex-col">
                <div className="sm:hidden flex justify-center pt-3 pb-0 flex-shrink-0">
                  <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                </div>
                <div className="flex items-center justify-between px-5 py-4 bg-white dark:bg-slate-900 sm:rounded-t-2xl border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{editingDelightVisitorId ? 'Edit Visitor' : 'Add Visitor'}</h3>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Fill in the visitor's details below</p>
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
                        updateDeptTeamMembersByVisitorId(editingDelightVisitorId, { name: delightVisitorForm.name, phone: delightVisitorForm.phone }).catch(() => {})
                        updateWorshipTeamMembersByVisitorId(editingDelightVisitorId, { name: delightVisitorForm.name, phone: delightVisitorForm.phone }).catch(() => {})
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
                  <div className="bg-white dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-4">
                    <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wider">Personal Info</p>
                    <div>
                      <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1.5">Name <span className="text-red-400">*</span></label>
                      <input
                        required
                        type="text"
                        placeholder="Full name"
                        value={delightVisitorForm.name}
                        onChange={(e) => setDelightVisitorForm((f) => ({ ...f, name: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1.5">Date of Birth</label>
                      <DateSelect
                        value={delightVisitorForm.dob}
                        onChange={val => setDelightVisitorForm(f => ({ ...f, dob: val }))}
                        minYear={1940}
                        maxYear={VISITOR_CURRENT_YEAR}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1.5">Phone</label>
                      <div className="flex rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-colors overflow-hidden">
                        <input
                          type="text"
                          placeholder="+91"
                          value={(() => { const m = (delightVisitorForm.phone || '').match(/^(\+\d{1,4})\s*/); return m ? m[1] : '' })()}
                          onChange={(e) => { const num = (delightVisitorForm.phone || '').replace(/^\+\d{1,4}\s*/, ''); setDelightVisitorForm((f) => ({ ...f, phone: (e.target.value + ' ' + num).trim() })) }}
                          className="w-16 px-2 py-2.5 text-sm text-center bg-transparent text-slate-900 dark:text-white border-r border-slate-300 dark:border-slate-700 focus:outline-none"
                        />
                        <input
                          type="tel"
                          placeholder="phone number"
                          value={(() => { const m = (delightVisitorForm.phone || '').match(/^\+\d{1,4}\s*(.*)/); return m ? m[1] : (delightVisitorForm.phone || '') })()}
                          onChange={(e) => { const code = ((delightVisitorForm.phone || '').match(/^(\+\d{1,4})/) || ['', ''])[1]; setDelightVisitorForm((f) => ({ ...f, phone: code ? (code + ' ' + e.target.value).trim() : e.target.value })) }}
                          className="flex-1 px-3 py-2.5 text-sm focus:outline-none bg-transparent text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1.5">Email</label>
                        <input
                          type="email"
                          placeholder="email@example.com"
                          value={delightVisitorForm.email}
                          onChange={(e) => setDelightVisitorForm((f) => ({ ...f, email: e.target.value }))}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1.5">Nativity</label>
                        <input
                          type="text"
                          placeholder="Hometown"
                          value={delightVisitorForm.nativity}
                          onChange={(e) => setDelightVisitorForm((f) => ({ ...f, nativity: e.target.value }))}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Visit Details card */}
                  <div className="bg-white dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-4">
                    <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wider">Visit Details</p>
                    <div>
                      <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1.5">Current Place</label>
                      <input
                        type="text"
                        placeholder="City / Area"
                        value={delightVisitorForm.currentPlace}
                        onChange={(e) => setDelightVisitorForm((f) => ({ ...f, currentPlace: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1.5">Date of Attending <span className="text-red-400">*</span></label>
                      <DateSelect
                        value={delightVisitorForm.attendedDate}
                        onChange={val => {
                          const yr = val ? new Date(val).getFullYear() : null
                          setDelightVisitorForm(f => ({ ...f, attendedDate: val, ...(yr && yr >= VISITOR_START_YEAR ? { year: yr } : {}) }))
                        }}
                        minYear={VISITOR_START_YEAR}
                        maxYear={VISITOR_CURRENT_YEAR}
                        sundaysOnly
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1.5">Service Attended</label>
                        <select
                          value={delightVisitorForm.serviceAttended}
                          onChange={(e) => setDelightVisitorForm((f) => ({ ...f, serviceAttended: e.target.value }))}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors text-sm"
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
                        <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1.5">How did they find us?</label>
                        <select
                          value={delightVisitorForm.source || ''}
                          onChange={(e) => setDelightVisitorForm((f) => ({ ...f, source: e.target.value }))}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors text-sm"
                        >
                          <option value="">— Select —</option>
                          <option value="Friend">Friend</option>
                          <option value="Family">Family</option>
                          <option value="Social Media">Social Media</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1.5">Year</label>
                        <select
                          value={delightVisitorForm.year || ''}
                          onChange={(e) => setDelightVisitorForm((f) => ({ ...f, year: Number(e.target.value) }))}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors text-sm"
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
                      className="px-5 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'upcomingSunday' && ['media', 'worship', 'd-light', 'administration'].includes(slug) && (
            <UpcomingSunday slug={slug} />
          )}

          {activeTab === 'finance' && slug === 'sec-core' && (
            <SecCoreFinance department={department} />
          )}

          {activeTab === 'finance' && slug !== 'sec-core' && (
            <FinanceTabBar
              tabs={slug === 'accounts' ? ['expense', 'budget', 'addDepartments'] : ['expense', 'budget', 'payout']}
              active={financeSubTab}
              onChange={(key) => {
                setFinanceSubTab(key)
                setSearchParams({ tab: 'finance', financeSub: key }, { replace: true })
              }}
            />
          )}

          {activeTab === 'finance' && slug !== 'sec-core' && financeSubTab === 'expense' && department?.name && (
            slug === 'accounts'
              ? <AccountsExpensePage />
              : <DeptExpenseTab department={department.name} />
          )}

          {activeTab === 'finance' && slug !== 'sec-core' && financeSubTab === 'budget' && (
            <BudgetPage department={slug === 'accounts' ? undefined : department?.name} />
          )}

          {activeTab === 'finance' && slug !== 'sec-core' && financeSubTab === 'payout' && slug !== 'accounts' && (
            <div className="space-y-4">
              {slug === 'administration' && <AdvancePayoutReviewer />}
              <AdvancePayoutTab departmentSlug={slug} departmentName={department?.name || slug} />
            </div>
          )}

          {activeTab === 'finance' && slug === 'accounts' && financeSubTab === 'addDepartments' && (
            <AddDepartmentsPage />
          )}

          {(activeTab === 'planning' || (activeTab === 'operations' && opsSubTab === 'planning')) && (
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
                  <div className="py-5 text-center text-slate-400 text-sm">Loading…</div>
                ) : boardPoints.length === 0 ? (
                  <div className="py-6 text-center text-slate-400 text-sm">
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
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <h3 className="font-semibold text-slate-900 dark:text-white">{editingBoardPointId ? 'Edit Point' : 'Add Presentation Point'}</h3>
                        <button type="button" onClick={() => setBoardPointModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xl">×</button>
                      </div>
                      <div className="px-5 py-4 space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Presentation Point *</label>
                          <textarea
                            value={boardPointForm.point}
                            onChange={e => setBoardPointForm(f => ({ ...f, point: e.target.value }))}
                            placeholder="Describe the point to present at the board meeting…"
                            rows={4}
                            className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Meeting Date</label>
                          <input
                            type="date"
                            value={boardPointForm.meetingDate}
                            onChange={e => setBoardPointForm(f => ({ ...f, meetingDate: e.target.value }))}
                            className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
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
                          className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium shadow-sm disabled:opacity-50 transition-colors"
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

          {usesGenericSubDepartmentCollection(slug) && (activeTab === 'subDepartment' || (activeTab === 'operations' && opsSubTab === 'subDepartment')) && (
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
                <div className="px-5 py-5 text-center text-slate-500">Loading…</div>
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
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full">
                <div className="p-5 border-b border-slate-200 dark:border-slate-800">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
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
                    <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Sub Department *</label>
                    <input
                      type="text"
                      value={subDeptForm.name}
                      onChange={(e) => setSubDeptForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      required
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="submit" className="px-4 min-h-[44px] py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-medium shadow-sm transition-colors">
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGenericSubDeptModalOpen(false)
                        setEditingSubDept(null)
                        setSubDeptForm({ name: '', servingArea: '' })
                      }}
                      className="px-4 min-h-[44px] py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-400 active:bg-slate-100 dark:active:bg-slate-700 transition-colors"
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
                <div className="px-5 py-5 text-center text-slate-500">Loading…</div>
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
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full">
                <div className="p-5 border-b border-slate-200 dark:border-slate-800">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Add Sub Department</h3>
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
                    <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Name *</label>
                    <input
                      type="text"
                      value={dlightSubDeptForm.name}
                      onChange={(e) => setDlightSubDeptForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Serving Area</label>
                    <input
                      type="text"
                      value={dlightSubDeptForm.servingArea}
                      onChange={(e) => setDlightSubDeptForm((f) => ({ ...f, servingArea: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="submit" className="px-4 min-h-[44px] py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-medium shadow-sm transition-colors">
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setDlightSubDeptModalOpen(false)}
                      className="px-4 min-h-[44px] py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-400 active:bg-slate-100 dark:active:bg-slate-700 transition-colors"
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

            // ── Search + filter chips — matches name (search) and every active filter
            // group (cell / status / year), OR'd within a group, AND'd across groups.
            const getEntryCellName = (entry) => {
              const np = (entry.phone || '').replace(/\s+/g, '')
              const cm = allCellMembers.find(m => m.status !== 'inactive' && (
                (entry.visitorId && m.visitorId && m.visitorId === entry.visitorId) ||
                (np && m.phone && m.phone.replace(/\s+/g, '') === np)
              ))
              const cg = cm ? cellGroups.find(g => g.id === cm.cellId) : null
              return (cg?.cellName || '').trim().toLowerCase()
            }
            const activePcsChips = PCS_FILTER_CHIPS.filter(c => pcsActiveFilters.has(c.key))
            const pcsChipsByGroup = activePcsChips.reduce((acc, c) => {
              (acc[c.group] ||= []).push(c)
              return acc
            }, {})
            const pcsSearchTrimmed = pcsSearchQuery.trim().toLowerCase()
            const matchesPcsFilters = (entry) => {
              if (pcsSearchTrimmed && !(entry.name || '').toLowerCase().includes(pcsSearchTrimmed)) return false
              return Object.values(pcsChipsByGroup).every((chips) =>
                chips.some((c) => {
                  if (c.group === 'cell') return getEntryCellName(entry).includes(c.value)
                  if (c.group === 'status') {
                    if (c.value === 'notmember') return !entry.membershipNumber
                    if (c.value === 'leader') return !!entry.leadershipPosition
                  }
                  if (c.group === 'year') return entry.year === c.value
                  return false
                })
              )
            }
            const pcsIsFiltering = pcsSearchTrimmed !== '' || activePcsChips.length > 0
            const filteredGrouped = grouped
              .map((g) => ({ ...g, entries: g.entries.filter(matchesPcsFilters) }))
              .filter((g) => !pcsIsFiltering || g.entries.length > 0)

            const handleChipClick = (entry) => {
              if (pcsExpandedId === entry.id) {
                setPcsExpandedId(null); setPcsExpandedVisitor(null); setPcsExpandedProfile(null); setPcsExpandedContext(null); setPcsExpandedForm({})
                setPcsPhotoFile(null); setPcsPhotoPreview(null)
                return
              }
              setPcsExpandedId(entry.id)
              setPcsExpandedVisitor(null); setPcsExpandedProfile(null); setPcsExpandedContext(null)
              setPcsPhotoFile(null); setPcsPhotoPreview(null)
              // Auto-link: any River Kids child whose father/mother name matches this person
              // becomes a pre-populated child entry, so the Caring Director doesn't have to
              // re-enter kids that are already registered in River Kids.
              const autoKids = rkChildrenForPCS
                .filter(k => {
                  const norm = (entry.name || '').trim().toLowerCase()
                  return norm && ((k.fatherName || '').trim().toLowerCase() === norm || (k.motherName || '').trim().toLowerCase() === norm)
                })
                .map(k => ({ id: `rk_${k.id}`, name: k.name, inRiverKids: 'yes', riverKidsChildId: k.id }))
              setPcsExpandedForm({
                personId: entry.personId || '',
                name: entry.name || '', phone: entry.phone || '', attendedDate: entry.attendedDate || '',
                membershipNumber: entry.membershipNumber || '', leadershipPosition: entry.leadershipPosition || '',
                year: entry.year || '', email: entry.email || '', dob: entry.dob || '', nativity: entry.nativity || '',
                currentPlace: entry.currentPlace || '', serviceAttended: entry.serviceAttended || '', howKnown: entry.howKnown || '',
                ministries: entry.ministries || [],
                baptised: '', baptismDate: '', baptismPlace: '', baptismChurch: '', baptismChurchIsOther: false,
                maritalStatus: '', marriageDate: '', spouseName: '', spouseVisitorId: '',
                hasKids: autoKids.length ? 'yes' : '', children: autoKids,
                previousChurchName: '', previousChurchPlace: '',
                membershipStatus: '', membershipDocs: [], permanentAddress: '', photoUrl: '',
              })
              // Load full personal data from people collection if linked
              if (entry.personId) {
                setPcsExpandedLoading(true)
                getPerson(entry.personId).then(person => {
                  if (person) {
                    setPcsExpandedForm(f => ({
                      ...f,
                      name: person.name || f.name,
                      phone: person.phone || f.phone,
                      email: person.email || f.email,
                      dob: person.dob || f.dob,
                      nativity: person.nativity || f.nativity,
                      currentPlace: person.currentPlace || f.currentPlace,
                      serviceAttended: person.serviceAttended || f.serviceAttended,
                      howKnown: person.howKnown || f.howKnown,
                      attendedDate: person.firstVisitDate || f.attendedDate,
                      membershipNumber: person.membershipNumber || f.membershipNumber,
                      leadershipPosition: person.leadershipPosition || f.leadershipPosition,
                      ministries: person.ministries?.length ? person.ministries : f.ministries,
                      baptised: person.baptised || f.baptised,
                      baptismDate: person.baptismDate || f.baptismDate,
                      baptismPlace: person.baptismPlace || f.baptismPlace,
                      baptismChurch: person.baptismChurch || f.baptismChurch,
                      baptismChurchIsOther: !!person.baptismChurch && person.baptismChurch !== 'River Of Life Christian Church',
                      maritalStatus: person.maritalStatus || f.maritalStatus,
                      marriageDate: person.marriageDate || f.marriageDate,
                      spouseName: person.spouseName || f.spouseName,
                      membershipStatus: person.membershipStatus || f.membershipStatus,
                      permanentAddress: person.permanentAddress || f.permanentAddress,
                      photoUrl: person.photoUrl || f.photoUrl,
                    }))
                  }
                  setPcsExpandedLoading(false)
                }).catch(() => setPcsExpandedLoading(false))
              }
              if (entry.visitorId) {
                setPcsExpandedLoading(true)
                Promise.all([
                  getDelightVisitorById(entry.visitorId),
                  getMemberProfileWithContext(entry.visitorId, entry.phone, entry.personId, entry.name),
                ]).then(([v, ctx]) => {
                  if (v) {
                    setPcsExpandedVisitor(v)
                    setPcsExpandedForm(f => ({ ...f, email: v.email || '', dob: v.dob || '', nativity: v.nativity || '', currentPlace: v.currentPlace || '', serviceAttended: v.serviceAttended || '', howKnown: v.howKnown || '' }))
                  }
                  if (ctx) {
                    setPcsExpandedProfile(ctx.profile)
                    setPcsExpandedContext(ctx)
                    const p = ctx.profile || {}
                    const savedChildren = Array.isArray(p.children) ? p.children : []
                    const savedLinkedIds = new Set(savedChildren.filter(c => c.riverKidsChildId).map(c => c.riverKidsChildId))
                    const mergedChildren = [...savedChildren, ...autoKids.filter(k => !savedLinkedIds.has(k.riverKidsChildId))]
                    setPcsExpandedForm(f => ({
                      ...f,
                      // Cell-Leader-filled contact/personal fields (via profile-fill invitation)
                      // land in member_profiles — prefer them over the visitor record if present.
                      phone: p.phone || f.phone,
                      email: p.email || f.email,
                      dob: p.dob || f.dob,
                      nativity: p.nativity || f.nativity,
                      currentPlace: p.currentPlace || f.currentPlace,
                      baptised: p.baptised || '',
                      baptismDate: p.baptismDate || '', baptismPlace: p.baptismPlace || '',
                      baptismChurch: p.baptismChurch || '',
                      baptismChurchIsOther: !!p.baptismChurch && p.baptismChurch !== 'River Of Life Christian Church',
                      maritalStatus: p.maritalStatus || '',
                      marriageDate: p.marriageDate || '', spouseName: p.spouseName || '', spouseVisitorId: p.spouseVisitorId || '',
                      hasKids: p.hasKids || (mergedChildren.length ? 'yes' : ''),
                      children: mergedChildren,
                      previousChurchName: p.previousChurchName || '',
                      previousChurchPlace: p.previousChurchPlace || '',
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
            const cellNameByVisitorId = new Map()
            allCellMembers.filter(m => m.status !== 'inactive' && m.visitorId).forEach(m => {
              if (!cellNameByVisitorId.has(m.visitorId)) {
                cellNameByVisitorId.set(m.visitorId, cellGroups.find(g => g.id === m.cellId)?.cellName || '')
              }
            })

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

            const handleDismissInactiveCellAlert = async (entry) => {
              try {
                await dismissInactiveCellAlert(entry.id)
                setPcsEntries(prev => prev.map(e => e.id === entry.id ? { ...e, inactiveCellAlertDismissed: true } : e))
              } catch { alert('Failed to dismiss. Please try again.') }
            }

            // Consecutive Sundays absent, counting back from the most recent report —
            // stops at the first week the PCS entry shows up present, checked by real
            // visitorId first (reliable — matches an actual check-in linked to this
            // person's record) and by name second (fallback, for weeks that were
            // never explicitly linked to a profile). Weeks with no filed report are
            // skipped rather than counted as absent.
            const getConsecutiveAbsentSundays = (entry) => {
              const norm = String(entry?.name || '').trim().toLowerCase()
              const idKey = entry?.visitorId ? `v:${entry.visitorId}` : null
              if ((!norm && !idKey) || sundayAttendanceWeeks.length === 0) return 0
              let count = 0
              for (const wk of sundayAttendanceWeeks) {
                const present = (idKey && wk.ids?.has(idKey)) || (norm && wk.names.has(norm))
                if (present) break
                count++
              }
              return count
            }

            const Chip = ({ entry }) => {
              const hasMember = !!entry.membershipNumber
              const hasLeadership = !!entry.leadershipPosition
              const isExpanded = pcsExpandedId === entry.id
              const isInCell = !!(entry.visitorId && cellVisitorIds.has(entry.visitorId))
              const menuOpen = pcsMenuOpenId === entry.id
              const isPastor = isSeniorPastorName(entry.name)
              const absentWeeks = getConsecutiveAbsentSundays(entry)
              const isLongAbsent = absentWeeks >= 4
              return (
                <div id={`pcs-entry-${entry.id}`} className="relative w-full h-full">
                  {menuOpen && (
                    <div className="fixed inset-0 z-10" onClick={() => setPcsMenuOpenId(null)} />
                  )}
                  {/* Fixed-height card so every tile in the grid lines up identically
                      regardless of name length or which badges/subtitle apply — avatar,
                      name/badges, subtitle, and the ⋮ menu each sit in a fixed relative
                      slot instead of the card growing/shrinking around its content. */}
                  <div
                    className={`w-full h-[72px] flex items-center gap-2 rounded-2xl pl-2 pr-1 py-2 border transition-all cursor-pointer
                      ${isPastor
                        ? isExpanded
                          ? 'bg-gradient-to-r from-indigo-700 via-purple-700 to-indigo-700 border-amber-400 shadow-lg ring-2 ring-amber-300 ring-offset-1'
                          : 'bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-50 border-amber-400 shadow-sm ring-1 ring-amber-300 ring-offset-1 hover:from-amber-100 hover:to-amber-100'
                        : isExpanded
                          ? 'bg-indigo-600 border-indigo-600 shadow-md'
                          : hasMember
                            ? 'bg-amber-50 border-amber-200 hover:bg-amber-100 hover:border-amber-300'
                            : 'bg-blue-50 border-blue-200 hover:bg-blue-100 hover:border-blue-300'}`}
                    onClick={() => handleChipClick(entry)}
                  >
                    <div className="relative flex-shrink-0">
                      <div className={`w-8 h-8 rounded-full text-white text-sm font-bold flex items-center justify-center
                        ${isPastor ? 'bg-gradient-to-br from-amber-500 to-yellow-600' : isExpanded ? 'bg-white/25' : hasMember ? 'bg-amber-500' : 'bg-blue-500'}`}>
                        {entry.name.charAt(0).toUpperCase()}
                      </div>
                      {isPastor && (
                        <span className="absolute -top-1.5 -left-1.5 text-amber-500" title={SENIOR_PASTOR_FULL_TITLE}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M2 18h20l-2-9-5 4-3-8-3 8-5-4-2 9z"/>
                          </svg>
                        </span>
                      )}
                      {isInCell && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" title="In a cell group" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className={`text-sm font-semibold leading-tight truncate ${isPastor ? isExpanded ? 'text-white' : 'text-amber-900' : isExpanded ? 'text-white' : hasMember ? 'text-amber-900' : 'text-blue-900'}`}>
                          {entry.name}
                        </p>
                        {isPastor && (
                          <span
                            className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none whitespace-nowrap ${isExpanded ? 'bg-white/20 text-amber-200' : 'bg-amber-500 text-white'}`}
                            title={SENIOR_PASTOR_FULL_TITLE}
                          >
                            {SENIOR_PASTOR_TITLE}
                          </span>
                        )}
                        {hasLeadership && (
                          <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none whitespace-nowrap ${isExpanded ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                            {entry.leadershipPosition}
                          </span>
                        )}
                        {isLongAbsent && (
                          <span
                            className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none whitespace-nowrap ${isExpanded ? 'bg-white/20 text-red-100' : 'bg-red-100 text-red-700'}`}
                            title={`Absent for ${absentWeeks} consecutive Sundays`}
                          >
                            ⚠️ {absentWeeks}w
                          </span>
                        )}
                      </div>
                      {hasMember
                        ? <p className={`text-xs font-medium leading-tight truncate ${isExpanded ? 'text-indigo-200' : isPastor ? 'text-amber-700' : 'text-amber-600'}`}>#{entry.membershipNumber}</p>
                        : isInCell
                          ? <p className={`text-xs font-medium leading-tight truncate ${isExpanded ? 'text-indigo-200' : 'text-emerald-600'}`}>{cellNameByVisitorId.get(entry.visitorId) || 'Cell member'}</p>
                          : <p className={`text-xs leading-tight truncate ${isExpanded ? 'text-indigo-300' : 'text-blue-400'}`}>Not a member</p>
                      }
                    </div>
                    {/* Three-dots menu button — pinned to a fixed slot at the card's
                        trailing edge regardless of name/badge length above. */}
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
              const isEditing = pcsEditingId === entry.id
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
              const secCoreRoles = ctx?.secCoreRoles || []

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
                ...deptTeams.map(t => ({ id: `dept-${t.id}`, ministry: t.department, role: t.rolePosition || t.role || '', from: t.memberSince || t.since || '', to: '', isAuto: true })),
                ...worshipTeams.map(t => ({ id: `wor-${t.id}`, ministry: 'Worship', role: (t.positions || [])[0] || t.rolePosition || '', from: t.memberSince || t.since || t.createdAt || '', to: '', isAuto: true })),
                ...secCoreRoles.map(m => ({ id: `sc-${m.personId || m.name}`, ministry: 'Director Board', role: m.type ? m.type.charAt(0).toUpperCase() + m.type.slice(1) : '', from: m.from || '', to: m.to || '', isAuto: true })),
              ]

              // Membership docs
              const membershipDocs = f.membershipDocs || []
              const addDocRow = () => setF(p => ({ ...p, membershipDocs: [...(p.membershipDocs || []), { id: Date.now().toString(), type: '', number: '' }] }))
              const updateDocRow = (id, field, val) => setF(p => ({ ...p, membershipDocs: (p.membershipDocs || []).map(r => r.id === id ? { ...r, [field]: val } : r) }))
              const removeDocRow = (id) => setF(p => ({ ...p, membershipDocs: (p.membershipDocs || []).filter(r => r.id !== id) }))

              // Children rows (Personal Data section)
              const children = f.children || []
              const addChildRow = () => setF(p => ({ ...p, children: [...(p.children || []), { id: Date.now().toString(), name: '', inRiverKids: '', riverKidsChildId: '' }] }))
              const updateChildRow = (id, patch) => setF(p => ({ ...p, children: (p.children || []).map(c => c.id === id ? { ...c, ...patch } : c) }))
              const removeChildRow = (id) => setF(p => ({ ...p, children: (p.children || []).filter(c => c.id !== id) }))

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

              const sPersonalBaseKeys = ['maritalStatus', 'hasKids']
              const sPersonalMarriageKeys = f.maritalStatus === 'Married' ? ['marriageDate','spouseName'] : []
              const sPersonalAllKeys = [...sPersonalBaseKeys, ...sPersonalMarriageKeys]
              const sPersonalFill = countFilled(sPersonalAllKeys) / sPersonalAllKeys.length

              const s3BaseKeys = ['baptised']
              const s3BaptismKeys = f.baptised === 'yes' ? ['baptismDate','baptismPlace','baptismChurch'] : []
              const s3AllKeys = [...s3BaseKeys, ...s3BaptismKeys]
              const s3Fill = countFilled(s3AllKeys) / s3AllKeys.length

              const s4Checks = f.membershipStatus ? [!!f.membershipNumber, !!f.permanentAddress, membershipDocs.length > 0] : []
              const s4Fill = s4Checks.length > 0 ? s4Checks.filter(Boolean).length / s4Checks.length : 0

              // Overall = average of Visitor Data, Personal Data, and Spiritual Data
              const overallFill = (s1Fill + sPersonalFill + s3Fill) / 3

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

              // Cell group lookup (hoisted so PDF button can use it)
              const _normalPhone = (entry.phone || '').replace(/\s+/g, '')
              const _cellMember = allCellMembers.find(m =>
                m.status !== 'inactive' && (
                  (entry.visitorId && m.visitorId && m.visitorId === entry.visitorId) ||
                  (_normalPhone && m.phone && m.phone.replace(/\s+/g, '') === _normalPhone)
                )
              )
              const _cg = _cellMember ? cellGroups.find(g => g.id === _cellMember.cellId) : null

              // ── Stamp view (read-only, clean portrait) ──────────────
              if (!isEditing) {
                const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null

                // Clean label+value field
                const field = (label, value) => value && String(value).trim() ? (
                  <div className="min-w-0">
                    <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">{label}</p>
                    <p className="text-[11px] font-semibold text-slate-800 leading-snug">{value}</p>
                  </div>
                ) : null

                // Section header row: coloured dot + label + optional badge
                const SH = ({ dot, label, badge }) => (
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500 flex-1">{label}</p>
                    {badge}
                  </div>
                )

                return (
                  <div className="border-t-2 border-indigo-500 bg-slate-100 px-3 py-4 flex justify-center">
                    {pcsExpandedLoading && <p className="text-xs text-slate-400 text-center py-6">Loading profile…</p>}
                    <div className="w-full max-w-[400px] rounded-2xl shadow-lg overflow-hidden border border-slate-200">

                      {/* ── Header ── */}
                      <div className="bg-gradient-to-b from-indigo-800 via-indigo-700 to-indigo-600 px-5 pt-5 pb-4 flex flex-col items-center text-center">
                        <p className="text-[8px] font-extrabold uppercase tracking-[0.18em] text-indigo-300 mb-3">River Of Life Church · PCS</p>
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-black text-white border-[3px] border-white/30 shadow-lg mb-3 ${f.membershipNumber ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-gradient-to-br from-indigo-400 to-violet-500'}`}>
                          {pcsPhotoPreview
                            ? <img src={pcsPhotoPreview} alt="" className="w-16 h-16 rounded-full object-cover" />
                            : (f.name || '?')[0].toUpperCase()}
                        </div>
                        <p className="text-white font-black text-xl leading-tight tracking-tight">{f.name || '—'}</p>
                        <div className="flex flex-wrap justify-center gap-1.5 mt-2">
                          {f.membershipNumber && <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-400/25 text-amber-200 border border-amber-400/40">Member #{f.membershipNumber}</span>}
                          {f.leadershipPosition && <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-400/25 text-emerald-200 border border-emerald-400/40">{f.leadershipPosition}</span>}
                          {churchDuration && <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-white/10 text-indigo-200 border border-white/15">{churchDuration} in church</span>}
                        </div>
                        <div className="mt-3 w-full">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[8px] font-bold text-white/50 uppercase tracking-wider">Profile completeness</span>
                            <span className={`text-[10px] font-black ${pctCls(overallFill)}`}>{pctStr(overallFill)}</span>
                          </div>
                          <div className="w-full h-1.5 bg-white/15 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-500 ${barCls(overallFill)}`} style={{ width: `${Math.round(overallFill * 100)}%` }} />
                          </div>
                        </div>
                        <div className="flex gap-2 mt-4 w-full">
                          <button type="button" onClick={() => setPcsEditingId(entry.id)}
                            className="flex-1 py-2 rounded-xl bg-white text-indigo-700 text-xs font-black hover:bg-indigo-50 transition-colors shadow">
                            Edit
                          </button>
                          <button type="button" onClick={() => {
                              const manual = (entry.ministries || []).map(r => ({ ...r, isAuto: false }))
                              const manualNames = new Set(manual.map(r => r.ministry?.toLowerCase()))
                              const auto = autoMinistry.filter(a => !manualNames.has(a.ministry?.toLowerCase()))
                              downloadProfileAsPDF(f, churchDuration, [...manual, ...auto], _cg)
                            }}
                            className="flex-1 py-2 rounded-xl bg-white/10 text-white text-xs font-black hover:bg-white/20 transition-colors border border-white/20">
                            Download PDF
                          </button>
                        </div>
                      </div>

                      {/* ── Body — white, sections divided ── */}
                      <div className="bg-white divide-y divide-slate-100">

                        {/* Contact & Personal */}
                        <div className="px-4 py-3.5">
                          <SH dot="bg-blue-500" label="Contact & Personal" />
                          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                            {field('Phone', f.phone)}
                            {field('Email', f.email)}
                            {field('Date of Birth', fmtD(f.dob))}
                            {field('Nativity', f.nativity)}
                            {field('Current Place', f.currentPlace)}
                            {field('How Known', f.howKnown)}
                          </div>
                        </div>

                        {/* Church Journey */}
                        <div className="px-4 py-3.5">
                          <SH dot="bg-emerald-500" label="Church Journey"
                            badge={churchDuration
                              ? <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">{churchDuration}</span>
                              : null}
                          />
                          <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-3">
                            {field('First Visit', fmtD(f.attendedDate))}
                            {field('Service', f.serviceAttended)}
                            {field('PCS Year', f.year ? String(f.year) : null)}
                          </div>
                          {(() => {
                            // Read-only — synced from duty rosters/assignments made by Ministry Leaders
                            if (!autoMinistry.length) return null
                            return (
                              <div>
                                <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Ministry & Leadership</p>
                                <div className="space-y-1.5">
                                  {autoMinistry.map((r) => {
                                    const dur = miniDur(r.from, r.to)
                                    return (
                                      <div key={r.id} className="flex items-center justify-between gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                                        <div className="min-w-0">
                                          <p className="text-[10px] font-bold text-slate-700 leading-tight">
                                            {r.ministry}{r.role ? <span className="font-normal text-slate-400"> · {r.role}</span> : ''}
                                          </p>
                                          {r.from && <p className="text-[8px] text-slate-400 mt-0.5">since {new Date(r.from).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</p>}
                                        </div>
                                        {dur && <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">{dur}</span>}
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })()}
                        </div>

                        {/* Personal */}
                        {(f.maritalStatus || (f.hasKids === 'yes' && (f.children || []).length > 0)) && (
                          <div className="px-4 py-3.5">
                            <SH dot="bg-teal-500" label="Personal" />
                            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                              {field('Marital Status', f.maritalStatus)}
                              {f.maritalStatus === 'Married' && <>{field('Marriage Date', fmtD(f.marriageDate))}{field('Spouse', f.spouseName)}</>}
                            </div>
                            {f.hasKids === 'yes' && (f.children || []).filter(c => c.name).length > 0 && (() => {
                              const kids = (f.children || []).filter(c => c.name)
                              return (
                                <div className="mt-3">
                                  <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Kids</p>
                                  {kids.length <= 3 ? (
                                    <div className="flex flex-wrap gap-1.5">
                                      {kids.map(c => (
                                        <span key={c.id} className="text-[10px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-2 py-0.5">
                                          {c.name}{c.riverKidsChildId ? ' (River Kids)' : ''}
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-[10px] font-black text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-2.5 py-0.5">
                                      {kids.length} kids registered
                                    </span>
                                  )}
                                </div>
                              )
                            })()}
                          </div>
                        )}

                        {/* Spiritual */}
                        {(f.baptised || f.previousChurchName || f.previousChurchPlace) && (
                          <div className="px-4 py-3.5">
                            <SH dot="bg-violet-500" label="Spiritual" />
                            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                              {field('Baptised', f.baptised === 'yes' ? 'Yes' : f.baptised === 'no' ? 'No' : null)}
                              {f.baptised === 'yes' && <>{field('Baptism Date', fmtD(f.baptismDate))}{field('Baptism Place', f.baptismPlace)}{field('Baptism Church', f.baptismChurch)}</>}
                              {field('Previous Church', f.previousChurchName)}
                              {field('Previous Church Location', f.previousChurchPlace)}
                            </div>
                          </div>
                        )}

                        {/* Membership */}
                        {f.membershipStatus && (
                          <div className="px-4 py-3.5">
                            <SH dot="bg-amber-500" label="Membership" />
                            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                              {field('Status', f.membershipStatus === 'member' ? 'Member' : 'Applying')}
                              {field('Membership #', f.membershipNumber)}
                              {field('Permanent Address', f.permanentAddress)}
                            </div>
                          </div>
                        )}

                      </div>

                      {/* Footer */}
                      <div className="bg-slate-50 border-t border-slate-100 px-4 py-2 flex items-center justify-between">
                        <span className="text-[9px] text-slate-400 font-medium">PCS Record · ROL Church</span>
                        <span className="text-[9px] text-slate-400">Confidential</span>
                      </div>

                    </div>
                  </div>
                )
              }

              return (
                <div className="border-t-2 border-amber-400 bg-slate-50 px-2 py-3 sm:px-4 sm:py-4">
                  {pcsExpandedLoading && (
                    <p className="text-xs text-slate-400 text-center py-6">Loading profile…</p>
                  )}
                  <div className="flex items-center justify-between gap-2 mb-2 px-1">
                    <span className="text-xs font-bold text-amber-700 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-full">Editing profile</span>
                    <button type="button" onClick={() => { setPcsEditingId(null); setPcsFormDirty(false) }} className="text-xs text-slate-500 hover:text-slate-700 font-medium">← Back to stamp</button>
                  </div>

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

                    {/* ═══ SECTION 1.5 · Personal Data ═══ */}
                    <div className="px-4 py-3 border-b border-slate-100 border-l-4 border-l-teal-300">
                      <SecHeader label="Personal Data" fill={sPersonalFill} labelColor="text-teal-700" headerBg="bg-teal-50 border-b border-teal-100" />
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
                                      className="w-full text-left px-3 py-2 text-xs hover:bg-teal-50 flex items-center gap-2">
                                      <span className="font-semibold text-slate-800 flex-1">{m.name}</span>
                                      {m.phone && <span className="text-slate-400">{m.phone}</span>}
                                      <span className="text-[9px] font-bold text-teal-500 bg-teal-50 border border-teal-200 rounded-full px-1.5 py-0.5 flex-shrink-0">ROL</span>
                                    </button>
                                  ))}
                                </div>
                              )
                            })()}
                          </div>
                        </>)}

                        {/* Do they have kids? */}
                        <div className="space-y-1 sm:col-span-3">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Do they have kids?</p>
                          <select
                            value={f.hasKids || ''}
                            onChange={e => setF(p => ({ ...p, hasKids: e.target.value }))}
                            className={inp}>
                            <option value="">— Select —</option>
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                          </select>
                        </div>
                      </div>

                      {/* Children list */}
                      {f.hasKids === 'yes' && (
                        <div className="mt-3 space-y-2">
                          {children.map(child => (
                            <div key={child.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-start bg-slate-50 border border-slate-200 rounded-xl p-2">
                              <div className="space-y-0.5">
                                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Attending Sunday School (River Kids)?</p>
                                <select
                                  value={child.inRiverKids || ''}
                                  onChange={e => updateChildRow(child.id, { inRiverKids: e.target.value, ...(e.target.value !== 'yes' ? { riverKidsChildId: '' } : {}) })}
                                  className={`${inp} text-xs`}>
                                  <option value="">— Select —</option>
                                  <option value="yes">Yes</option>
                                  <option value="no">No</option>
                                </select>
                              </div>
                              <div className="space-y-0.5 relative">
                                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">
                                  {child.inRiverKids === 'yes' ? 'Search River Kids Registry' : "Child's Name"}
                                </p>
                                {child.inRiverKids === 'yes' ? (
                                  <>
                                    <input
                                      type="text"
                                      placeholder="Search by name…"
                                      value={child.name}
                                      onChange={e => updateChildRow(child.id, { name: e.target.value, riverKidsChildId: '' })}
                                      onFocus={() => setPcsChildSearchOpenId(child.id)}
                                      onBlur={() => setTimeout(() => setPcsChildSearchOpenId(prev => prev === child.id ? null : prev), 150)}
                                      className={`${inp} text-xs`}
                                    />
                                    {child.riverKidsChildId && (
                                      <p className="text-[9px] text-emerald-600 font-semibold mt-0.5">✓ Linked to River Kids</p>
                                    )}
                                    {pcsChildSearchOpenId === child.id && child.name.trim().length >= 1 && (() => {
                                      const q = child.name.trim().toLowerCase()
                                      const matches = rkChildrenForPCS.filter(k => (k.name || '').toLowerCase().includes(q)).slice(0, 6)
                                      if (!matches.length) return null
                                      return (
                                        <div className="absolute z-20 top-full left-0 right-0 mt-0.5 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
                                          {matches.map(k => (
                                            <button key={k.id} type="button"
                                              onMouseDown={() => { updateChildRow(child.id, { name: k.name, riverKidsChildId: k.id }); setPcsChildSearchOpenId(null) }}
                                              className="w-full text-left px-3 py-2 text-xs hover:bg-teal-50 flex items-center gap-2">
                                              <span className="font-semibold text-slate-800 flex-1">{k.name}</span>
                                              <span className="text-[9px] font-bold text-teal-500 bg-teal-50 border border-teal-200 rounded-full px-1.5 py-0.5 flex-shrink-0">
                                                {(k.classGroups || []).length ? k.classGroups.map(rkClassGroupLabel).join(', ') : 'River Kids'}
                                              </span>
                                            </button>
                                          ))}
                                        </div>
                                      )
                                    })()}
                                  </>
                                ) : (
                                  <input
                                    type="text"
                                    placeholder="Child's name"
                                    value={child.name}
                                    onChange={e => updateChildRow(child.id, { name: e.target.value })}
                                    className={`${inp} text-xs`}
                                  />
                                )}
                              </div>
                              <button type="button" onClick={() => removeChildRow(child.id)} className="mt-4 w-7 h-7 rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 flex items-center justify-center transition-colors">×</button>
                            </div>
                          ))}
                          <button type="button" onClick={addChildRow} className="text-xs text-teal-600 hover:text-teal-800 flex items-center gap-1 py-1 transition-colors">
                            <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                            Add Child
                          </button>
                        </div>
                      )}
                    </div>

                    {/* ═══ SECTION 2 · Church Journey ═══ */}
                    <div className="px-4 py-3 border-b border-slate-100 border-l-4 border-l-emerald-300">
                      <div className="-mx-4 -mt-3 mb-4 px-4 py-3 flex items-center gap-3 bg-emerald-50 border-b border-emerald-100">
                        <span className={`w-3 h-3 rounded-full flex-shrink-0 transition-colors duration-300 ${dotCls(s2Fill)}`} />
                        <p className="text-sm font-bold tracking-tight text-emerald-700">Church Journey</p>
                        {churchDuration && <span className="text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">{churchDuration}</span>}
                      </div>

                      {/* Missed-Sundays alert — helps the Caring Director judge whether to push for cell assignment */}
                      {(() => {
                        const absentWeeks = getConsecutiveAbsentSundays(entry)
                        if (absentWeeks < 4) return null
                        return (
                          <div className="mb-3 inline-flex items-center gap-1.5 text-xs font-bold text-red-700 bg-red-50 border border-red-300 px-3 py-1.5 rounded-full">
                            ⚠️ Absent for {absentWeeks} consecutive Sundays
                          </div>
                        )
                      })()}

                      {/* Cell connection */}
                      {(() => {
                        const cellMember = _cellMember
                        const cg = _cg
                        const _np0 = (entry.phone || '').replace(/\s+/g, '')
                        // Persisted referral for this person, if Caring already sent one —
                        // matched by personId, then visitorId, then normalized phone, so the
                        // "sent" state survives a reload instead of resetting to the button.
                        const existingReferral = pcsCellReferralTasks.find(t =>
                          (entry.personId && t.memberId && t.memberId === entry.personId) ||
                          (entry.visitorId && t.pcsPersonVisitorId && t.pcsPersonVisitorId === entry.visitorId) ||
                          (_np0 && t.memberPhone && t.memberPhone.replace(/\s+/g, '') === _np0)
                        )
                        const notified = pcsNotifiedIds.has(entry.id) || !!existingReferral
                        const notifying = pcsNotifyingId === entry.id

                        // All memberships for this person (history)
                        const _np = (entry.phone || '').replace(/\s+/g, '')
                        const allMemberships = allCellMembers
                          .filter(m =>
                            (entry.visitorId && m.visitorId && m.visitorId === entry.visitorId) ||
                            (_np && m.phone && m.phone.replace(/\s+/g, '') === _np)
                          )
                          .sort((a, b) => (a.since || '').localeCompare(b.since || ''))
                        const pastMemberships = allMemberships.filter(m => m.status === 'inactive')
                        const fmtMon = (d) => d ? new Date(d).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : null

                        return (
                          <div className="mb-3">
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Cell Group</p>
                              {!cg && !isPastor && canEdit && (
                                notified
                                  ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                      <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>Notification Sent
                                    </span>
                                  : <button type="button" disabled={notifying} onClick={async () => {
                                      if (existingReferral) { setPcsNotifiedIds(prev => new Set([...prev, entry.id])); return }
                                      setPcsNotifyingId(entry.id)
                                      try {
                                        await createTask({
                                          taskTitle: `Add ${entry.name} to a cell group`,
                                          department: 'Cell',
                                          assignedPerson: '',
                                          priority: 'Medium',
                                          deadline: '',
                                          status: 'Pending',
                                          notes: `Referred from PCS by ${userProfile?.name || userProfile?.email || 'Caring Director'}. ${entry.name} is under personal care but has no cell group.${entry.phone ? ` Phone: ${entry.phone}` : ''}`,
                                          createdBy: userProfile?.email || '',
                                          pcsReferral: true,
                                          memberId: entry.personId || entry.id,
                                          memberName: entry.name,
                                          memberPhone: entry.phone || '',
                                          // Legacy field names CellDirectorCockpit.jsx's pcsReferrals mapping already reads.
                                          pcsPersonName: entry.name,
                                          pcsPersonPhone: entry.phone || '',
                                          pcsPersonVisitorId: entry.visitorId || '',
                                        })
                                        setPcsNotifiedIds(prev => new Set([...prev, entry.id]))
                                        setPcsToast(`Notification sent to Cell Director to assign ${entry.name}`)
                                        setTimeout(() => setPcsToast(null), 3500)
                                      } catch { alert('Failed to send notification') }
                                      setPcsNotifyingId(null)
                                    }} className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full hover:bg-indigo-100 transition-colors disabled:opacity-50">
                                      <svg width="9" height="9" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                                      {notifying ? 'Sending…' : 'Notify Cell Director to Assign Cell'}
                                    </button>
                              )}
                            </div>

                            {/* Current cell */}
                            {cg
                              ? <>
                                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                                    <span className="font-semibold">{cg.cellName || 'Unnamed Cell'}</span>
                                    {cg.leader ? <span className="text-emerald-600"> · {cg.leader}</span> : null}
                                    {cellMember?.since ? <span className="text-slate-400"> · since {fmtMon(cellMember.since)}</span> : null}
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
                              : isPastor
                                ? <p className="text-xs font-medium text-amber-600">Exempt from cell group assignment — {SENIOR_PASTOR_TITLE}</p>
                                : <p className="text-xs text-slate-400">{entry.visitorId || _np ? 'Not currently in a cell group' : 'Link visitor record to see cell'}</p>
                            }

                            {/* Cell history */}
                            {pastMemberships.length > 0 && (
                              <div className="mt-2.5">
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Cell History</p>
                                <div className="space-y-1">
                                  {pastMemberships.map((m) => {
                                    const pastCg = cellGroups.find(g => g.id === m.cellId)
                                    const fromStr = fmtMon(m.since)
                                    const toStr = fmtMon(m.leftDate)
                                    return (
                                      <div key={`${m.cellId}-${m.id}`} className="flex items-start gap-2 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg">
                                        <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0" />
                                        <div>
                                          <span className="font-semibold text-slate-600">{pastCg?.cellName || 'Unknown Cell'}</span>
                                          {(fromStr || toStr) && (
                                            <span className="text-slate-400 ml-1">
                                              · {fromStr || '?'} – {toStr || 'unknown'}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })()}

                      {/* Ministry — read-only, synced from duty rosters/assignments made by Ministry Leaders */}
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Ministry</p>
                        {autoMinistry.length === 0 ? (
                          <p className="text-xs text-slate-400 py-1">No active ministry assignments recorded by Ministry Leaders.</p>
                        ) : (
                          <div className="space-y-2">
                            {autoMinistry.map((r) => {
                              const dur = r.from ? miniDur(r.from, r.to) : null
                              return (
                                <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-700 leading-tight">
                                      {r.ministry}{r.role ? <span className="font-normal text-slate-400"> · {r.role}</span> : ''}
                                    </p>
                                    {r.from && <p className="text-[10px] text-slate-400 mt-0.5">since {new Date(r.from).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</p>}
                                  </div>
                                  {dur && <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">{dur}</span>}
                                </div>
                              )
                            })}
                          </div>
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

                        {/* Previous church */}
                        {fld('Previous Church Name', 'previousChurchName')}
                        {fld('Previous Church Place / Location', 'previousChurchPlace')}

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
                            const { personId, name, phone, attendedDate, membershipNumber, leadershipPosition, year, email, dob, nativity, currentPlace, serviceAttended, howKnown,
                              ministries,
                              baptised, baptismDate, baptismPlace, baptismChurch, maritalStatus, marriageDate, spouseName, spouseVisitorId,
                              hasKids, children, previousChurchName, previousChurchPlace,
                              membershipStatus, membershipDocs, permanentAddress } = f
                            const resolvedYear = year || (attendedDate ? new Date(attendedDate).getFullYear() : null)

                            // Upload photo if a new one was selected
                            let savedPhotoUrl = f.photoUrl || ''
                            if (pcsPhotoFile && entry.visitorId) {
                              try { savedPhotoUrl = await uploadMemberPhoto(entry.visitorId, pcsPhotoFile) || savedPhotoUrl } catch { /* non-fatal */ }
                              setPcsPhotoFile(null)
                            }

                            // Write to central people collection (PCS is the gatekeeper)
                            const personData = {
                              name, phone, email, dob, nativity, currentPlace,
                              firstVisitDate: attendedDate, serviceAttended, howKnown,
                              baptised, baptismDate, baptismPlace, baptismChurch,
                              maritalStatus, marriageDate, spouseName,
                              membershipStatus, membershipNumber, permanentAddress,
                              leadershipPosition, ministries: ministries || [],
                              stage: membershipStatus === 'member' ? 'member' : 'pcs',
                              ...(savedPhotoUrl ? { photoUrl: savedPhotoUrl } : {}),
                            }
                            let resolvedPersonId = personId
                            if (resolvedPersonId) {
                              await updatePerson(resolvedPersonId, personData, userProfile?.email || '')
                            } else {
                              resolvedPersonId = await addPerson(personData, userProfile?.email || '')
                            }

                            await updatePCSEntry(entry.id, { name, phone, email, dob, nativity, currentPlace, serviceAttended, howKnown, attendedDate, membershipNumber, leadershipPosition, year: resolvedYear, ministries: ministries || [], personId: resolvedPersonId })
                            setPcsEntries(prev => prev.map(e => e.id === entry.id ? { ...e, name, phone, email, dob, nativity, currentPlace, serviceAttended, howKnown, attendedDate, membershipNumber, leadershipPosition, year: resolvedYear ? Number(resolvedYear) : null, ministries: ministries || [], personId: resolvedPersonId } : e))
                            if (entry.visitorId) {
                              updateDelightVisitor(entry.visitorId, { name, phone, email, dob, nativity, currentPlace, serviceAttended, attendedDate, howKnown }).catch(() => {})
                              updateCellMembersByVisitorId(entry.visitorId, { name, phone, birthday: dob }).catch(() => {})
                              updatePCSEntriesByVisitorId(entry.visitorId, { name, phone }).catch(() => {})
                              updateDeptTeamMembersByVisitorId(entry.visitorId, { name, phone }).catch(() => {})
                              updateWorshipTeamMembersByVisitorId(entry.visitorId, { name, phone }).catch(() => {})
                              upsertMemberProfile(entry.visitorId, {
                                phone, email, dob, nativity, currentPlace,
                                baptised, baptismDate, baptismPlace, baptismChurch, maritalStatus, marriageDate, spouseName, spouseVisitorId,
                                hasKids: hasKids || '',
                                children: hasKids === 'yes' ? (children || []) : [],
                                previousChurchName, previousChurchPlace,
                                membershipStatus,
                                membershipDocs: membershipDocs || [],
                                permanentAddress,
                                ...(savedPhotoUrl ? { photoUrl: savedPhotoUrl } : {}),
                              }, userProfile?.email || '').catch(() => {})
                            }
                            if (savedPhotoUrl) setF(p => ({ ...p, photoUrl: savedPhotoUrl }))
                            pcsSavedRef.current = JSON.stringify(savedPhotoUrl ? { ...pcsExpandedForm, photoUrl: savedPhotoUrl } : pcsExpandedForm)
                            setPcsFormDirty(false)
                            setPcsEditingId(null)
                          } catch { alert('Failed to save') }
                          setPcsExpandedSaving(false)
                        }}
                        className="flex-1 min-h-[44px] py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-60 transition-colors"
                      >{pcsExpandedSaving ? 'Saving…' : 'Save Changes'}</button>}
                      <button
                        type="button"
                        onClick={() => { setPcsEditingId(null); setPcsFormDirty(false) }}
                        className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
                      >
                        {pcsFormDirty ? 'Discard' : 'Done'}
                      </button>
                    </div>

                  </div>
                </div>
              )
            }

            const downloadProfileAsPDF = (data, dur, ministry, cellGroup) => {
              const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null

              const field = (label, value) => value && String(value).trim()
                ? `<div style="padding:5px 0;border-bottom:1px solid #f0f0f0">
                    <div style="font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#6b7280;margin-bottom:1px">${label}</div>
                    <div style="font-size:10.5px;color:#1f2937;font-weight:500">${value}</div>
                  </div>`
                : ''

              const section = (title, accentColor, content) =>
                `<div style="margin-bottom:14px;break-inside:avoid">
                  <div style="font-size:7.5px;font-weight:800;text-transform:uppercase;letter-spacing:.15em;color:${accentColor};border-bottom:1.5px solid ${accentColor};padding-bottom:3px;margin-bottom:6px">${title}</div>
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px">${content}</div>
                </div>`

              const ministryRows = ministry?.length
                ? ministry.map(r => {
                    const from = r.from ? new Date(r.from) : null
                    const to   = r.to   ? new Date(r.to)   : new Date()
                    const tot  = from ? (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) : 0
                    const yrs  = Math.floor(tot / 12), mos = tot % 12
                    const tenureDur = from ? ([yrs > 0 ? `${yrs}y` : '', mos > 0 ? `${mos}m` : ''].filter(Boolean).join(' ') || '<1m') : ''
                    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:5px 8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:4px;break-inside:avoid">
                      <div>
                        <span style="font-size:10px;font-weight:700;color:#1f2937">${r.ministry}</span>
                        ${r.role ? `<span style="font-size:9.5px;color:#6b7280"> · ${r.role}</span>` : ''}
                        ${from ? `<div style="font-size:8px;color:#9ca3af;margin-top:1px">since ${from.toLocaleDateString('en-IN',{month:'short',year:'numeric'})}</div>` : ''}
                      </div>
                      ${tenureDur ? `<span style="font-size:8.5px;font-weight:700;color:#1d4ed8;white-space:nowrap;background:#eff6ff;border:1px solid #bfdbfe;padding:1px 7px;border-radius:20px">${tenureDur}</span>` : ''}
                    </div>`
                  }).join('')
                : ''

              const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>PCS — ${data.name || 'Profile'}</title>
              <style>
                * { box-sizing:border-box; margin:0; padding:0; }
                @page { size:A4 portrait; margin:0; }
                html,body { width:210mm; font-family:'Segoe UI',Arial,sans-serif; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; color-adjust:exact !important; }
                @media print { .no-print{display:none!important} * {-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important} }
              </style></head><body>

              <div style="width:210mm;min-height:297mm;display:flex;flex-direction:column;background:#fff">

                <!-- Navy header band -->
                <div style="background:#1e3a5f;padding:20px 24px 18px;display:flex;align-items:center;justify-content:space-between;-webkit-print-color-adjust:exact;print-color-adjust:exact">
                  <div>
                    <div style="font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:.2em;color:#93c5fd;margin-bottom:3px">River Of Life Church · Bangalore</div>
                    <div style="font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:#fff">Personal Caring System — Member Profile</div>
                  </div>
                  <div style="text-align:right">
                    ${data.membershipNumber ? `<div style="font-size:11px;font-weight:800;color:#fbbf24">Member #${data.membershipNumber}</div>` : ''}
                    <div style="font-size:8px;color:#93c5fd;margin-top:2px">Confidential</div>
                  </div>
                </div>

                <!-- Name block with light blue tint -->
                <div style="background:#f0f7ff;padding:16px 24px;border-bottom:1px solid #dbeafe;display:flex;align-items:center;justify-content:space-between;-webkit-print-color-adjust:exact;print-color-adjust:exact">
                  <div>
                    <div style="font-size:22px;font-weight:800;color:#1e3a5f;letter-spacing:-.3px">${data.name || '—'}</div>
                    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;align-items:center">
                      ${data.leadershipPosition ? `<span style="font-size:9px;font-weight:600;color:#1e40af;background:#dbeafe;border:1px solid #bfdbfe;padding:2px 9px;border-radius:20px">${data.leadershipPosition}</span>` : ''}
                      ${data.membershipStatus === 'member' ? `<span style="font-size:9px;font-weight:600;color:#92400e;background:#fef3c7;border:1px solid #fde68a;padding:2px 9px;border-radius:20px">Member</span>` : ''}
                      ${dur ? `<span style="font-size:9px;color:#4b5563;background:#f3f4f6;border:1px solid #e5e7eb;padding:2px 9px;border-radius:20px">${dur} in church</span>` : ''}
                    </div>
                  </div>
                  <div style="width:54px;height:54px;border-radius:50%;background:#1e3a5f;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;color:#fff;flex-shrink:0;-webkit-print-color-adjust:exact;print-color-adjust:exact">
                    ${(data.name || '?')[0].toUpperCase()}
                  </div>
                </div>

                <!-- Body -->
                <div style="padding:18px 24px;flex:1">
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 28px">

                    <!-- Left -->
                    <div>
                      ${section('Contact & Personal', '#1d4ed8',
                        field('Phone', data.phone) +
                        field('Email', data.email) +
                        field('Date of Birth', fmt(data.dob)) +
                        field('Nativity', data.nativity) +
                        field('Current Place', data.currentPlace) +
                        field('How Known', data.howKnown)
                      )}
                      ${section('Church Journey', '#065f46',
                        field('First Visit', fmt(data.attendedDate)) +
                        field('Service Attended', data.serviceAttended) +
                        field('PCS Year', data.year ? String(data.year) : null) +
                        (cellGroup ? field('Cell Group', cellGroup.cellName || 'Unnamed Cell') + (cellGroup.leader ? field('Cell Leader', cellGroup.leader) : '') : '')
                      )}
                    </div>

                    <!-- Right -->
                    <div>
                      ${(data.baptised || data.maritalStatus) ? section('Spiritual', '#5b21b6',
                        field('Baptised', data.baptised === 'yes' ? 'Yes' : data.baptised === 'no' ? 'No' : null) +
                        (data.baptised === 'yes' ? field('Baptism Date', fmt(data.baptismDate)) + field('Baptism Place', data.baptismPlace) + field('Baptism Church', data.baptismChurch) : '') +
                        field('Marital Status', data.maritalStatus) +
                        (data.maritalStatus === 'Married' ? field('Marriage Date', fmt(data.marriageDate)) + field('Spouse', data.spouseName) : '')
                      ) : ''}
                      ${data.membershipStatus ? section('Membership', '#92400e',
                        field('Status', data.membershipStatus === 'member' ? 'Member' : data.membershipStatus) +
                        field('Membership No.', data.membershipNumber) +
                        field('Permanent Address', data.permanentAddress)
                      ) : ''}
                    </div>
                  </div>

                  <!-- Ministry & Leadership -->
                  ${ministry?.length ? `
                  <div style="margin-top:14px;break-inside:avoid">
                    <div style="font-size:7.5px;font-weight:800;text-transform:uppercase;letter-spacing:.15em;color:#1e3a5f;border-bottom:1.5px solid #1e3a5f;padding-bottom:3px;margin-bottom:8px">Ministry &amp; Leadership</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px">${ministryRows}</div>
                  </div>` : ''}
                </div>

                <!-- Footer -->
                <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:8px 24px;display:flex;justify-content:space-between;align-items:center;-webkit-print-color-adjust:exact;print-color-adjust:exact">
                  <span style="font-size:8px;color:#9ca3af">Generated ${new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})} · River Of Life Church, Bangalore</span>
                  <span style="font-size:8px;color:#9ca3af;font-weight:600">PCS · Confidential Record</span>
                </div>

              </div>
              <script>window.onload=function(){window.print()}<\/script>
              </body></html>`

              const win = window.open('', '_blank', 'width=900,height=750')
              if (win) { win.document.write(html); win.document.close() }
            }

            // Inactive cell members who still appear in PCS.
            // Matches by visitorId first, falling back to phone — many PCS entries
            // (anything added via the manual "+ Add" modal) never get a visitorId,
            // so a visitorId-only match would silently never flag them.
            const normPhoneKey = (p) => String(p || '').replace(/\s+/g, '')
            const pcsVisitorIdMap = new Map(pcsEntries.filter(e => e.visitorId).map(e => [e.visitorId, e]))
            const pcsPhoneMap = new Map(pcsEntries.filter(e => !e.visitorId && e.phone).map(e => [normPhoneKey(e.phone), e]))
            const removedFromCellInPCS = []
            const _seenVids = new Set()
            allCellMembers
              .filter(m => m.status === 'inactive')
              .forEach(m => {
                const pe = (m.visitorId && pcsVisitorIdMap.get(m.visitorId)) || (m.phone && pcsPhoneMap.get(normPhoneKey(m.phone)))
                if (!pe || pe.inactiveCellAlertDismissed) return
                const key = pe.visitorId || pe.id
                if (_seenVids.has(key)) return
                _seenVids.add(key)
                removedFromCellInPCS.push({ ...m, pcsEntry: pe })
              })

            return (
              <div className="space-y-4">
                {/* Toast */}
                {pcsToast && (
                  <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg">
                    {pcsToast}
                  </div>
                )}
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

                {/* ── Search + Filter chips ── */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">🔍</span>
                    <input
                      type="text"
                      value={pcsSearchQuery}
                      onChange={(e) => setPcsSearchQuery(e.target.value)}
                      placeholder="Search name..."
                      className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:bg-white transition-colors"
                    />
                    {pcsSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setPcsSearchQuery('')}
                        aria-label="Clear search"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {PCS_FILTER_CHIPS.map((chip) => {
                      const active = pcsActiveFilters.has(chip.key)
                      return (
                        <button
                          key={chip.key}
                          type="button"
                          onClick={() => setPcsActiveFilters((prev) => {
                            const next = new Set(prev)
                            next.has(chip.key) ? next.delete(chip.key) : next.add(chip.key)
                            return next
                          })}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                            active
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          {chip.label}
                        </button>
                      )
                    })}
                    {pcsActiveFilters.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setPcsActiveFilters(new Set())}
                        className="px-3 py-1.5 rounded-full text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                </div>

                {/* Picker */}
                {pcsPickerOpen && (
                  <PCSPickerModal
                    addedIds={new Set(pcsEntries.map((e) => e.visitorId))}
                    onAdd={(v) => {
                      const tempId = `temp_${Date.now()}`
                      const optimistic = { id: tempId, visitorId: v.id, personId: '', name: v.name, phone: v.phone, attendedDate: v.attendedDate, year: v.year, addedAt: new Date(), addedBy: userProfile?.email || '' }
                      setPcsEntries((prev) => [optimistic, ...prev])
                      addPerson({
                        name: v.name, phone: v.phone, email: v.email || '',
                        dob: v.dob || '', nativity: v.nativity || '', currentPlace: v.currentPlace || '',
                        firstVisitDate: v.attendedDate, serviceAttended: v.serviceAttended || '',
                        howKnown: v.howKnown || '', stage: 'pcs',
                      }, userProfile?.email || '')
                        .then(personId =>
                          addPCSEntry({ visitorId: v.id, personId, name: v.name, phone: v.phone, attendedDate: v.attendedDate, year: v.year, addedBy: userProfile?.email || 'unknown' })
                            .then((realId) => { if (realId) setPcsEntries((prev) => prev.map((e) => e.id === tempId ? { ...e, id: realId, personId } : e)) })
                        )
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
                                            } catch {
                                              alert(`Couldn't add ${name} — no linked visitor record found. Add them to the D-Light visitor list first, then try again.`)
                                            }
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
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => handleDismissInactiveCellAlert(pe)}
                                        title="Keep them active in PCS and stop showing this alert"
                                        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                                      >
                                        Keep in PCS
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveFromPCS({ ...pe, name: m.name || pe.name })}
                                        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                                      >
                                        Remove from PCS
                                      </button>
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

                {/* ── Add to PCS — notifications from Cell ── */}
                {pcsAddNotifications.length > 0 && (
                  <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setPcsAddOpen(o => !o)}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-indigo-50 transition-colors text-left"
                    >
                      <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />
                      <p className="text-sm font-bold text-indigo-800 flex-1">Add to PCS — from Cell</p>
                      <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
                        {pcsAddNotifications.length}
                      </span>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`text-indigo-400 transition-transform flex-shrink-0 ${pcsAddOpen ? 'rotate-180' : ''}`}>
                        <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>

                    {pcsAddOpen && (
                      <>
                        <p className="px-4 pb-2 text-xs text-slate-400 border-t border-indigo-100 pt-3">
                          Cell leaders requested these members be added to PCS.
                        </p>
                        <div className="divide-y divide-slate-100">
                          {pcsAddNotifications.map(notif => {
                            const name      = notif.memberName || ''
                            const phone     = notif.memberPhone || ''
                            const visitorId = notif.visitorId || ''
                            const cellName  = notif.cellName  || ''
                            const sentBy    = notif.sentByName || notif.sentBy || ''
                            const adding    = pcsAddAdding.has(notif.id)
                            const dismissing = pcsAddDismissing.has(notif.id)
                            const inVisitorList = visitorId
                              ? delightVisitors.some(v => v.id === visitorId)
                              : delightVisitors.some(v => (v.name || '').trim().toLowerCase() === (name || '').trim().toLowerCase())
                            // Persisted on the notification doc itself (not local state) so the
                            // status survives a reload and updates live for every Caring user —
                            // once inVisitorList flips true this is superseded by "Add to PCS" below.
                            const alreadyForwarded = !!notif.forwardedToDLight

                            return (
                              <div key={notif.id} className="flex items-center gap-3 px-4 py-3">
                                <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 text-sm font-bold flex items-center justify-center flex-shrink-0">
                                  {String(name || '?').split(' ').slice(0, 2).map(w => (w[0] || '').toUpperCase()).join('')}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-slate-900 text-sm truncate">{name}</p>
                                  <p className="text-xs text-slate-400 mt-0.5 truncate">
                                    {[phone, cellName ? `Cell: ${cellName}` : '', sentBy ? `by ${sentBy}` : ''].filter(Boolean).join(' · ')}
                                  </p>
                                  {!inVisitorList && (
                                    <p className="text-xs text-amber-600 font-medium mt-0.5">Not in visitor list yet</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <button
                                    type="button"
                                    disabled={dismissing || adding}
                                    onClick={async () => {
                                      setPcsAddDismissing(prev => new Set([...prev, notif.id]))
                                      try {
                                        await dismissPCSAddNotification(notif.id)
                                        setPcsAddNotifications(prev => prev.filter(n => n.id !== notif.id))
                                      } catch { /* ignore */ }
                                      finally {
                                        setPcsAddDismissing(prev => { const s = new Set(prev); s.delete(notif.id); return s })
                                      }
                                    }}
                                    className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:bg-red-100 hover:text-red-500 flex items-center justify-center text-base transition-colors disabled:opacity-40"
                                    title="Dismiss"
                                  >
                                    {dismissing ? '…' : '×'}
                                  </button>
                                  {inVisitorList ? (
                                    <button
                                      type="button"
                                      disabled={adding}
                                      onClick={async () => {
                                        setPcsAddAdding(prev => new Set([...prev, notif.id]))
                                        try {
                                          const resolvedVisitorId = visitorId ||
                                            (delightVisitors.find(v => (v.name || '').trim().toLowerCase() === (name || '').trim().toLowerCase())?.id || '')
                                          await addPCSEntry({
                                            visitorId: resolvedVisitorId, name, phone,
                                            year: new Date().getFullYear(), addedBy: userProfile?.email || 'unknown',
                                          })
                                          await completePCSAddNotification(notif.id)
                                          setPcsEntries(prev => [{
                                            id: `add_${notif.id}`, visitorId: resolvedVisitorId, name, phone,
                                            year: new Date().getFullYear(), addedAt: new Date(), addedBy: userProfile?.email || '',
                                          }, ...prev])
                                          setPcsAddNotifications(prev => prev.filter(n => n.id !== notif.id))
                                        } catch {
                                          alert(`Couldn't add ${name} — no linked visitor record found. Add them to the D-Light visitor list first, then try again.`)
                                        }
                                        finally {
                                          setPcsAddAdding(prev => { const s = new Set(prev); s.delete(notif.id); return s })
                                        }
                                      }}
                                      className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                                    >
                                      {adding ? 'Adding…' : 'Add to PCS'}
                                    </button>
                                  ) : alreadyForwarded ? (
                                    <span className="text-xs text-emerald-600 font-medium px-1">✓ Forwarded to D-Light</span>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={pcsAddForwarding.has(notif.id) || dismissing}
                                      onClick={async () => {
                                        setPcsAddForwarding(prev => new Set([...prev, notif.id]))
                                        try {
                                          const sentByName = userProfile?.displayName || userProfile?.name || userProfile?.email || 'Caring'
                                          await createTask({
                                            taskTitle: `Add ${name} to D-Light`,
                                            department: 'D Light',
                                            assignedPerson: '',
                                            priority: 'Medium',
                                            deadline: '',
                                            status: 'Pending',
                                            notes: `Forwarded from Caring PCS by ${sentByName}. ${name} needs D-Light registration before being added to PCS.${phone ? ` Phone: ${phone}` : ''}`,
                                            createdBy: userProfile?.email || '',
                                            pcsReferral: true,
                                            pcsPersonName: name,
                                            pcsPersonPhone: phone || '',
                                            pcsPersonVisitorId: visitorId || '',
                                          })
                                          await markPCSAddNotificationForwarded(notif.id)
                                        } catch (e) {
                                          console.error('Forward to D-Light error', e)
                                          alert('Failed to forward to D-Light. Please try again.')
                                        } finally {
                                          setPcsAddForwarding(prev => { const s = new Set(prev); s.delete(notif.id); return s })
                                        }
                                      }}
                                      className="px-3 py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-xl hover:bg-amber-600 disabled:opacity-50 transition-colors whitespace-nowrap"
                                    >
                                      {pcsAddForwarding.has(notif.id) ? 'Forwarding…' : 'Forward to D-Light'}
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

                {/* Former (inactive) panel */}
                {pcsShowFormer && (
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-700">Former Members</span>
                      <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{pcsInactiveEntries.length}</span>
                    </div>
                    {pcsLoadingFormer ? (
                      <div className="py-6 text-center text-slate-400 text-sm">Loading…</div>
                    ) : pcsInactiveEntries.length === 0 ? (
                      <div className="py-6 text-center text-slate-400 text-sm">No former members.</div>
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
                  ) : filteredGrouped.length === 0 ? (
                    <div className="py-16 flex flex-col items-center gap-3 text-center">
                      <p className="text-sm text-slate-400">No one matches your search or filters.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {filteredGrouped.map(({ year, entries }) => {
                        return (
                          <div key={year ?? 'no-year'}>
                            {/* Year label */}
                            <div className="px-4 py-2 flex items-center gap-2 bg-slate-50">
                              <span className="text-sm font-bold text-slate-700">{year ?? '—'}</span>
                              <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                {entries.length} {entries.length === 1 ? 'person' : 'people'}
                              </span>
                            </div>
                            {/* Cards — fixed-size grid tiles (auto-fill/minmax) so every card
                                lines up in equal-width columns instead of the old variable-width
                                flex-wrap chips. The expanded profile panel spans the full grid
                                row (col-span-full) so it still breaks onto its own row below
                                whichever card was clicked. */}
                            <div className="px-4 py-3 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                              {entries.map(entry => (
                                <Fragment key={entry.id}>
                                  <Chip entry={entry} />
                                  {pcsExpandedId === entry.id && (
                                    <div className="col-span-full -mx-4">
                                      {PCSInlineProfile({ entry })}
                                    </div>
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

          {(activeTab === 'team' || (activeTab === 'operations' && opsSubTab === 'team')) && (
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
                    if (!editingMember && !memberForm.visitorId) {
                      setTeamError('You must select a person from the People\'s Directory. New people can only be added by the D Light Director via Visitor Entry.')
                      return
                    }
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
                        {editingMember ? 'Update the details below' : 'Must be selected from People\'s Directory'}
                      </p>
                    </div>
                  </div>

                  <div className="px-5 py-5 space-y-5 bg-white border border-t-0 border-indigo-100 rounded-b-xl shadow-sm">
                    {/* Name / Search */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                        Name <span className="text-indigo-400 font-normal normal-case tracking-normal">(from People&apos;s Directory)</span>
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
                            placeholder={teamVisitorsLoading ? 'Loading directory…' : 'Search People\'s Directory…'}
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
                                  <div className="px-4 py-3 text-center">
                                    <p className="text-sm text-slate-500 font-medium">Not in People&apos;s Directory</p>
                                    <p className="text-xs text-slate-400 mt-0.5">New people can only be added via D Light Visitor Entry</p>
                                  </div>
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

          {/* ── Kids Register tab ── */}
          {slug === 'river-kids' && activeTab === 'register' && department && (
            <div className="space-y-4">
              {/* Header */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-800">Kids Register</p>
                  <p className="text-xs text-slate-400">{rkChildren.length} kid{rkChildren.length !== 1 ? 's' : ''} registered</p>
                </div>
              </div>

              {/* Add kid form */}
              {canEdit && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Add a Kid</p>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault()
                      if (!rkChildForm.name.trim() || !department) return
                      try {
                        await addDepartmentChild(department.name, rkChildForm, userProfile?.email || userProfile?.displayName || 'unknown')
                        setRkChildForm({ name: '', dob: '', fatherName: '', motherName: '', currentPlace: '', classGroups: [], joinedDate: '', joinedVia: '' })
                        const list = await getDepartmentChildren(department.name)
                        setRkChildren(list.filter((c) => c.active !== false))
                      } catch { alert('Failed to add kid') }
                    }}
                    className="space-y-3"
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Name *</label>
                        <input value={rkChildForm.name} onChange={e => setRkChildForm(p => ({ ...p, name: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="Child's name" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Date of Birth</label>
                        <input type="date" value={rkChildForm.dob} onChange={e => setRkChildForm(p => ({ ...p, dob: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                      </div>
                      <div>
                        <PersonSearchInput label="Father's Name" value={rkChildForm.fatherName}
                          onChange={v => setRkChildForm(p => ({ ...p, fatherName: v }))}
                          people={rkAllUsers} placeholder="Search or type father's name" />
                      </div>
                      <div>
                        <PersonSearchInput label="Mother's Name" value={rkChildForm.motherName}
                          onChange={v => setRkChildForm(p => ({ ...p, motherName: v }))}
                          people={rkAllUsers} placeholder="Search or type mother's name" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-slate-600 mb-1">Current Location</label>
                        <input value={rkChildForm.currentPlace} onChange={e => setRkChildForm(p => ({ ...p, currentPlace: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="Current place of residence" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-slate-600 mb-1">Class / Group</label>
                        <ClassGroupPicker value={rkChildForm.classGroups} onChange={v => setRkChildForm(p => ({ ...p, classGroups: v }))} />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-slate-600 mb-2">How They Joined</label>
                        <div className="flex gap-2">
                          {[{ key: 'born', label: 'Born to members' }, { key: 'outside', label: 'Joined from outside' }].map(opt => (
                            <button key={opt.key} type="button"
                              onClick={() => setRkChildForm(p => ({ ...p, joinedVia: p.joinedVia === opt.key ? '' : opt.key }))}
                              className={`flex-1 py-2 px-2 rounded-xl border text-xs font-medium transition ${
                                rkChildForm.joinedVia === opt.key
                                  ? 'bg-indigo-600 text-white border-indigo-700'
                                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {rkChildForm.joinedVia === 'outside' && (() => {
                        const fatherDate = resolveParentJoinDate(rkChildForm.fatherName)
                        const motherDate = resolveParentJoinDate(rkChildForm.motherName)
                        return (
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-slate-600 mb-1">Joined Date</label>
                            <input type="date" value={rkChildForm.joinedDate} onChange={e => setRkChildForm(p => ({ ...p, joinedDate: e.target.value }))}
                              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                            {(fatherDate || motherDate) && (
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {fatherDate && (
                                  <button type="button" onClick={() => setRkChildForm(p => ({ ...p, joinedDate: fatherDate }))}
                                    className="text-[11px] px-2 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 font-medium">
                                    👨 Father joined {fatherDate}
                                  </button>
                                )}
                                {motherDate && (
                                  <button type="button" onClick={() => setRkChildForm(p => ({ ...p, joinedDate: motherDate }))}
                                    className="text-[11px] px-2 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 font-medium">
                                    👩 Mother joined {motherDate}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                    <button type="submit" disabled={!rkChildForm.name.trim()}
                      className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 active:scale-[0.98] transition-all">
                      Add Kid
                    </button>
                  </form>
                </div>
              )}

              {/* Kids list */}
              {rkLoading ? (
                <p className="text-center text-slate-400 text-sm py-8">Loading…</p>
              ) : rkChildren.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-8">No kids registered yet.</p>
              ) : (
                <div className="space-y-2">
                  {rkChildren.map((c) => {
                    const age = c.dob ? differenceInYears(new Date(), new Date(c.dob)) : null
                    const expanded = rkExpandedChildIds.has(c.id)
                    const toggleExpanded = () => setRkExpandedChildIds(prev => {
                      const next = new Set(prev)
                      if (next.has(c.id)) next.delete(c.id); else next.add(c.id)
                      return next
                    })
                    return (
                      <div key={c.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div
                          onClick={toggleExpanded}
                          role="button"
                          tabIndex={0}
                          aria-expanded={expanded}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpanded() } }}
                          className="px-4 py-3 flex items-center gap-2 cursor-pointer hover:bg-slate-50 transition-colors"
                        >
                          <p className="font-semibold text-slate-800 text-sm flex-1 min-w-0 truncate">{c.name}</p>
                          {age !== null && (
                            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full border border-indigo-100 shrink-0">{age}y</span>
                          )}
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`text-slate-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}>
                            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        <AnimatePresence initial={false}>
                          {expanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2, ease: 'easeInOut' }}
                              className="overflow-hidden"
                            >
                              <div className="relative px-4 pb-4 pt-1 border-t border-slate-100">
                                {canEdit && (
                                  <div className="absolute right-4 top-3">
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setRkActionsMenuId(id => id === c.id ? null : c.id) }}
                                      className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                                    >
                                      ⋮
                                    </button>
                                    {rkActionsMenuId === c.id && (
                                      <div
                                        onClick={(e) => e.stopPropagation()}
                                        className="absolute right-0 top-full mt-1 w-32 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden z-10"
                                      >
                                        <button
                                          type="button"
                                          onClick={() => { setRkActionsMenuId(null); setRkEditChild({ ...c }) }}
                                          className="w-full text-left px-3 py-2 text-xs font-medium text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                                        >
                                          Edit
                                        </button>
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            setRkActionsMenuId(null)
                                            if (!window.confirm(`Remove ${c.name} from the register?`)) return
                                            try {
                                              await deleteDepartmentChild(c.id)
                                              setRkChildren(prev => prev.filter(x => x.id !== c.id))
                                            } catch { alert('Failed to remove kid') }
                                          }}
                                          className="w-full text-left px-3 py-2 text-xs font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors"
                                        >
                                          Delete
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                                <div className="pr-8 space-y-1.5">
                                  {c.dob && <p className="text-xs text-slate-400">DOB: {c.dob}</p>}
                                  {(c.fatherName || c.motherName) && (
                                    <p className="text-xs text-slate-500">
                                      {c.fatherName && <span>Father: <span className="font-medium">{c.fatherName}</span></span>}
                                      {c.fatherName && c.motherName && <span className="mx-1">·</span>}
                                      {c.motherName && <span>Mother: <span className="font-medium">{c.motherName}</span></span>}
                                    </p>
                                  )}
                                  {c.currentPlace && <p className="text-xs text-slate-400">Current Location: {c.currentPlace}</p>}
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {(c.classGroups || []).map(g => (
                                      <span key={g} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-100">
                                        {rkClassGroupLabel(g)}
                                      </span>
                                    ))}
                                    {c.joinedVia && (
                                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                        c.joinedVia === 'born'
                                          ? 'bg-pink-50 text-pink-600 border-pink-100'
                                          : 'bg-sky-50 text-sky-600 border-sky-100'
                                      }`}>
                                        {c.joinedVia === 'born' ? 'Born to members' : 'Joined from outside'}
                                      </span>
                                    )}
                                    {(() => {
                                      const effectiveDate = c.joinedVia === 'born' ? c.dob : c.joinedDate
                                      return effectiveDate
                                        ? <span className="text-[10px] text-slate-400">Joined: {effectiveDate}</span>
                                        : null
                                    })()}
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Edit kid modal */}
              {rkEditChild && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-slate-900 dark:text-white">Edit Kid</p>
                      <button type="button" onClick={() => setRkEditChild(null)}
                        className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 text-lg leading-none">×</button>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-900 dark:text-white mb-1">Name *</label>
                        <input value={rkEditChild.name} onChange={e => setRkEditChild(p => ({ ...p, name: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-900 dark:text-white mb-1">Date of Birth</label>
                        <input type="date" value={rkEditChild.dob || ''} onChange={e => setRkEditChild(p => ({ ...p, dob: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                      </div>
                      <div>
                        <PersonSearchInput label="Father's Name" value={rkEditChild.fatherName || ''}
                          onChange={v => setRkEditChild(p => ({ ...p, fatherName: v }))}
                          people={rkAllUsers} placeholder="Search or type father's name" />
                      </div>
                      <div>
                        <PersonSearchInput label="Mother's Name" value={rkEditChild.motherName || ''}
                          onChange={v => setRkEditChild(p => ({ ...p, motherName: v }))}
                          people={rkAllUsers} placeholder="Search or type mother's name" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-900 dark:text-white mb-1">Current Location</label>
                        <input value={rkEditChild.currentPlace || ''} onChange={e => setRkEditChild(p => ({ ...p, currentPlace: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="Current place of residence" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-900 dark:text-white mb-1">Class / Group</label>
                        <ClassGroupPicker value={rkEditChild.classGroups} onChange={v => setRkEditChild(p => ({ ...p, classGroups: v }))} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-900 dark:text-white mb-2">How They Joined</label>
                        <div className="flex gap-2">
                          {[{ key: 'born', label: 'Born to members' }, { key: 'outside', label: 'Joined from outside' }].map(opt => (
                            <button key={opt.key} type="button"
                              onClick={() => setRkEditChild(p => ({ ...p, joinedVia: p.joinedVia === opt.key ? '' : opt.key }))}
                              className={`flex-1 py-2 px-2 rounded-xl border text-xs font-medium transition ${
                                rkEditChild.joinedVia === opt.key
                                  ? 'bg-indigo-600 text-white border-indigo-700'
                                  : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {rkEditChild.joinedVia === 'outside' && (() => {
                        const fatherDate = resolveParentJoinDate(rkEditChild.fatherName)
                        const motherDate = resolveParentJoinDate(rkEditChild.motherName)
                        return (
                          <div>
                            <label className="block text-xs font-medium text-slate-900 dark:text-white mb-1">Joined Date</label>
                            <input type="date" value={rkEditChild.joinedDate || ''} onChange={e => setRkEditChild(p => ({ ...p, joinedDate: e.target.value }))}
                              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                            {(fatherDate || motherDate) && (
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {fatherDate && (
                                  <button type="button" onClick={() => setRkEditChild(p => ({ ...p, joinedDate: fatherDate }))}
                                    className="text-[11px] px-2 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 font-medium">
                                    👨 Father joined {fatherDate}
                                  </button>
                                )}
                                {motherDate && (
                                  <button type="button" onClick={() => setRkEditChild(p => ({ ...p, joinedDate: motherDate }))}
                                    className="text-[11px] px-2 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 font-medium">
                                    👩 Mother joined {motherDate}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                    <button type="button" disabled={rkSavingEdit || !rkEditChild.name.trim()}
                      onClick={async () => {
                        setRkSavingEdit(true)
                        try {
                          await updateDepartmentChild(rkEditChild.id, {
                            name: rkEditChild.name, dob: rkEditChild.dob || '',
                            fatherName: rkEditChild.fatherName || '', motherName: rkEditChild.motherName || '',
                            currentPlace: rkEditChild.currentPlace || '',
                            classGroups: rkEditChild.classGroups || [],
                            joinedDate: rkEditChild.joinedDate || '',
                            joinedVia: rkEditChild.joinedVia || '',
                          })
                          const list = await getDepartmentChildren(department.name)
                          setRkChildren(list.filter((c) => c.active !== false))
                          setRkEditChild(null)
                        } catch { alert('Failed to save') } finally { setRkSavingEdit(false) }
                      }}
                      className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 active:scale-[0.98] transition-all">
                      {rkSavingEdit ? 'Saving…' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Attendance tab ── */}
          {slug === 'river-kids' && activeTab === 'attendance' && department && (() => {
            const isSundaySchool = rkAttendanceGroup === 'sunday-school'
            // A kid with no class/group assigned yet still shows up everywhere (same as
            // before); a kid with classGroups now correctly appears under every tab
            // they're assigned to, not just one — that's the point of multi-select.
            const groupKids = rkChildren.filter(c => !(c.classGroups || []).length || c.classGroups.includes(rkAttendanceGroup))
            // Scoped to the active tab's classGroup — a child in both Sunday School and
            // River Kids-1 gets independent presence per group instead of one flat
            // childId->bool map conflating their attendance across every group they're in.
            const rkPresent = rkAttendanceByGroup[rkAttendanceGroup] || {}
            const isKidPresent = (c) => isSundaySchool
              ? rkReportKidsNames.some(n => (n || '').trim().toLowerCase() === c.name.trim().toLowerCase())
              : !!rkPresent[c.id]
            const presentCount = groupKids.filter(isKidPresent).length
            return (
              <div className="space-y-3">
                {/* Date row */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="font-bold text-slate-800">Attendance</p>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <span className="text-xs font-medium text-slate-500">Date</span>
                    <button
                      type="button"
                      onClick={() => setRkDate(d => format(subWeeks(new Date(d + 'T00:00:00'), 1), 'yyyy-MM-dd'))}
                      aria-label={`Previous ${isSundaySchool ? 'Sunday' : 'Saturday'}`}
                      className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                    >
                      ‹
                    </button>
                    <input
                      type="date"
                      value={rkDate}
                      // Chromium-based browsers disable calendar days that don't fall on `min +
                      // n*step`; picking Jan 7/6 2024 (a Sunday/Saturday) as the anchor keeps
                      // every selectable day on the correct weekday. onChange below is the
                      // fallback for browsers that don't honor step in their date picker UI.
                      min={isSundaySchool ? '2024-01-07' : '2024-01-06'}
                      step={7}
                      onChange={e => {
                        const val = e.target.value
                        if (!val) return
                        const targetDow = isSundaySchool ? 0 : 6
                        const d = new Date(val + 'T00:00:00')
                        if (isNaN(d.getTime())) return
                        const diff = (targetDow - d.getDay() + 7) % 7
                        d.setDate(d.getDate() + diff)
                        setRkDate(format(d, 'yyyy-MM-dd'))
                      }}
                      className="px-2 py-1.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                    <button
                      type="button"
                      onClick={() => setRkDate(d => format(addWeeks(new Date(d + 'T00:00:00'), 1), 'yyyy-MM-dd'))}
                      aria-label={`Next ${isSundaySchool ? 'Sunday' : 'Saturday'}`}
                      className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                    >
                      ›
                    </button>
                  </div>
                </div>

                {/* Sub-page switcher */}
                <div className="flex gap-2 bg-slate-100 rounded-2xl p-1">
                  {RK_CLASS_GROUPS.map(g => (
                    <button key={g.key} type="button" onClick={() => setRkAttendanceGroup(g.key)}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${rkAttendanceGroup === g.key ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                      {g.label}
                    </button>
                  ))}
                </div>

                {/* Sunday School sync notice */}
                {isSundaySchool && (
                  <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2">
                    <span className="text-indigo-500 text-sm">↔</span>
                    <p className="text-xs text-indigo-600">Synced with Sunday Ministry Live Control</p>
                  </div>
                )}

                {/* Stats row */}
                {!rkLoading && groupKids.length > 0 && (
                  <div className="flex gap-2">
                    <div className="flex-1 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 text-center">
                      <p className="text-lg font-bold text-emerald-600">{presentCount}</p>
                      <p className="text-[10px] text-emerald-500 font-medium">Present</p>
                    </div>
                    <div className="flex-1 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2 text-center">
                      <p className="text-lg font-bold text-rose-500">{groupKids.length - presentCount}</p>
                      <p className="text-[10px] text-rose-400 font-medium">Absent</p>
                    </div>
                    <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-center">
                      <p className="text-lg font-bold text-slate-600">{groupKids.length}</p>
                      <p className="text-[10px] text-slate-400 font-medium">Total</p>
                    </div>
                  </div>
                )}

                {/* Kids — tap a name to mark present/absent */}
                {rkLoading ? (
                  <p className="text-center text-slate-400 text-sm py-8">Loading…</p>
                ) : groupKids.length === 0 ? (
                  <p className="text-center text-slate-400 text-sm py-8">
                    No kids in this group yet. Assign kids in the Kids Register tab.
                  </p>
                ) : (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3">
                    <div className="flex flex-wrap gap-2">
                      {groupKids.map((c) => {
                        const age = c.dob ? differenceInYears(new Date(), new Date(c.dob)) : null
                        const isPresent = isKidPresent(c)
                        const parents = [c.fatherName, c.motherName].filter(Boolean).join(' · ')
                        return (
                          <button
                            key={c.id}
                            type="button"
                            disabled={!canEdit}
                            title={parents || undefined}
                            onClick={async () => {
                              if (!canEdit || !department) return
                              // Every group's presence toggle merges the kid's name into/out of the
                              // Sunday Ministry report's "River Kids" list — that's the single total
                              // Sunday Ministry shows, so it must reflect all three groups, not just
                              // whichever group happens to be selected here.
                              const trimmedName = c.name.trim()
                              const norm = trimmedName.toLowerCase()
                              const newReportNames = isPresent
                                ? rkReportKidsNames.filter(n => (n || '').trim().toLowerCase() !== norm)
                                : rkReportKidsNames.some(n => (n || '').trim().toLowerCase() === norm)
                                  ? rkReportKidsNames
                                  : [...rkReportKidsNames, trimmedName]
                              try {
                                await patchSundayReportRiverKids(rkDate, newReportNames, userProfile?.email || userProfile?.displayName || 'unknown')
                              } catch (error) {
                                console.error('Attendance Save Error (Sunday report River Kids sync):', error)
                                alert(rkPermissionErrorMessage(error))
                              }
                              if (!isSundaySchool) {
                                const previous = rkPresent
                                const next = { ...rkPresent, [c.id]: !isPresent }
                                setRkAttendanceByGroup(prev => ({ ...prev, [rkAttendanceGroup]: next }))
                                try {
                                  await setDepartmentChildAttendance(department.name, rkDate, rkAttendanceGroup, next, userProfile?.email || userProfile?.displayName || 'unknown')
                                } catch (error) {
                                  console.error('Attendance Save Error:', error)
                                  // Roll the optimistic toggle back — otherwise a failed write (e.g.
                                  // permission-denied) leaves the badge showing the new state even
                                  // though nothing was actually saved.
                                  setRkAttendanceByGroup(prev => ({ ...prev, [rkAttendanceGroup]: previous }))
                                  alert(rkPermissionErrorMessage(error))
                                }
                              }
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition active:scale-95 ${
                              isPresent
                                ? 'bg-emerald-500 text-white border-emerald-600 shadow-sm'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                            } ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            {c.name}
                            {age !== null && <span className={`ml-1 ${isPresent ? 'text-emerald-100' : 'text-slate-400'}`}>· {age}y</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

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
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6">
                    <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Add event</h3>
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
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        placeholder="Event name"
                        required
                      />
                      <div className="flex gap-2">
                        <button type="submit" className="px-4 min-h-[44px] py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-sm font-medium shadow-sm transition-colors">
                          Create
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewEventModalOpen(false)}
                          className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-sm transition-colors"
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
                                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6">
                                  <h3 className="font-semibold text-slate-900 dark:text-white mb-3">
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
                                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Program No *</label>
                                      <input
                                        type="number"
                                        value={eventProgramForm.programNo}
                                        onChange={(e) => setEventProgramForm((f) => ({ ...f, programNo: e.target.value }))}
                                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                        required
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Program Name *</label>
                                      <input
                                        type="text"
                                        value={eventProgramForm.programName}
                                        onChange={(e) => setEventProgramForm((f) => ({ ...f, programName: e.target.value }))}
                                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                        required
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Program By *</label>
                                      <input
                                        type="text"
                                        value={eventProgramForm.programBy}
                                        onChange={(e) => setEventProgramForm((f) => ({ ...f, programBy: e.target.value }))}
                                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                        required
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Duration (mins) *</label>
                                      <input
                                        type="number"
                                        value={eventProgramForm.duration}
                                        onChange={(e) => setEventProgramForm((f) => ({ ...f, duration: e.target.value }))}
                                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                        required
                                        min="1"
                                      />
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                      Set the event <strong>Schedule starts at</strong> once above the table. Planned start/end columns update automatically from that time + each program’s duration in order.
                                    </p>

                                    <div className="flex gap-2 pt-2">
                                      <button type="submit" className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium shadow-sm transition-colors">
                                        Add
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEventProgramModalOpen(false)}
                                        className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm transition-colors"
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
                          onClick={() => openFillInviteModal(inv)}
                          className="px-3 py-1.5 bg-violet-600 text-white text-xs font-semibold rounded-xl hover:bg-violet-700 transition-colors flex-shrink-0"
                        >
                          Fill Profile
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Dashboard metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <p className="text-sm text-slate-500 uppercase tracking-wide">Total Cells</p>
                  <p className="text-2xl font-bold text-slate-800 mt-1">{loadingCellGroups ? '—' : cellGroups.length}</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <p className="text-sm text-slate-500 uppercase tracking-wide">Total Cell Members</p>
                  <p className="text-2xl font-bold text-slate-800 mt-1">
                    {loadingCellGroups ? '—' : allCellMembers.filter((m) => m.status !== 'inactive' && m.memberCategory !== 'former').length}
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <h2 className="font-semibold text-slate-800">Cell Groups</h2>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => { setNewCellGroupForm({ cellId: '', cellName: '', leader: '', leaderPersonId: '', meetingDay: '', launchDate: '', status: 'active' }); setCellGroupModalOpen(true) }}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                    >
                      + Add cell group
                    </button>
                  )}
                </div>
                {loadingCellGroups ? (
                  <div className="py-5 text-center text-slate-500">Loading cell groups…</div>
                ) : cellGroups.length === 0 ? (
                  <div className="py-5 text-center text-slate-500">No cell groups yet.</div>
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
                      <div key={cell.id} className={`relative ${expandedCellId === cell.id ? 'col-span-full' : ''} ${tileStyle.bg} ${tileStyle.text} rounded-xl overflow-hidden shadow-lg border ${expandedCellId === cell.id ? 'border-white/60 ring-2 ring-white/40' : 'border-white/20'} transition`}>
                        {cell.meetingDay && (
                          <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wide bg-black/20 rounded-full px-2 py-0.5">
                            {cell.meetingDay.slice(0, 3)}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setExpandedCellId(expandedCellId === cell.id ? null : cell.id)}
                          className="w-full text-left p-5 hover:opacity-95 transition"
                        >
                          <p className="text-xl font-semibold">{cell.cellName || 'Unnamed'}</p>
                          <p className="text-xs opacity-90 mt-0.5">{cell.leader || '—'}</p>
                          {isFounder && (
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
                          )}
                          {yearsSince !== null && <p className="text-sm opacity-90 mt-1">Launched: {yearsSince} year{yearsSince !== 1 ? 's' : ''} ago</p>}
                          <p className="text-2xl font-bold mt-2">{allCellMembers.filter((m) => m.cellId === cell.id && m.status !== 'inactive' && m.memberCategory !== 'former').length} Members</p>
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
                                      leaderPersonId: cell.leaderPersonId || '',
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
                                    setCellMemberVisitorsError('')
                                    setLoadingCellMemberVisitors(true)
                                    getDelightVisitors()
                                      .then(setCellMemberVisitors)
                                      .catch((err) => {
                                        console.error('Failed to load People\'s Directory', err)
                                        setCellMemberVisitorsError(`Could not load the directory. (${err?.code || err?.message || 'unknown error'})`)
                                      })
                                      .finally(() => setLoadingCellMemberVisitors(false))
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
                              <>
                                <h4 className="font-medium text-slate-700 mt-2 mb-1">Active Members</h4>
                                {cellMembers.filter((m) => m.status !== 'inactive').length === 0 ? (
                                  <p className="px-1 py-4 text-center text-slate-500 text-sm">No active members.</p>
                                ) : (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {cellMembers.filter((m) => m.status !== 'inactive').map((m) => {
                                      const isDuplicate = duplicateCellMemberKeys.has(m.visitorId || ('name:' + (m.name || '').toLowerCase().trim()))
                                      const nameKey = String(m.name || '').trim().toLowerCase()
                                      const isAbsent = !!nameKey && !cellRecentAttendedNames.has(nameKey)
                                      return (
                                        <div
                                          key={m.id}
                                          role="button"
                                          tabIndex={0}
                                          onClick={() => openMemberDetail(m, cell.id)}
                                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMemberDetail(m, cell.id) } }}
                                          className={`relative h-24 w-full flex flex-col justify-between rounded-2xl border p-3.5 shadow-sm transition-all hover:shadow-md cursor-pointer ${isDuplicate ? 'bg-red-50/70 border-red-200 hover:border-red-300' : 'bg-white border-slate-200 hover:border-indigo-200'}`}
                                        >
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                                                {isDuplicate && (
                                                  <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="This person is in multiple cell groups" />
                                                )}
                                                {isAbsent && (
                                                  <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="Not attended cell or Sunday service in over 4 weeks" />
                                                )}
                                                <p className={`font-bold text-sm truncate ${isDuplicate ? 'text-red-800' : 'text-slate-900'}`}>{m.name || '—'}</p>
                                            </div>
                                            {canEdit && (
                                              <div className="relative flex-shrink-0">
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation()
                                                    if (activeMenuMemberId === m.id) {
                                                      setActiveMenuMemberId(null)
                                                      return
                                                    }
                                                    const rect = e.currentTarget.getBoundingClientRect()
                                                    setActiveMenuMemberPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
                                                    setActiveMenuMemberId(m.id)
                                                  }}
                                                  className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-200/70 hover:text-slate-600 transition-colors"
                                                >
                                                  <svg width="14" height="14" viewBox="0 0 4 16" fill="currentColor">
                                                    <circle cx="2" cy="2" r="1.5"/>
                                                    <circle cx="2" cy="8" r="1.5"/>
                                                    <circle cx="2" cy="14" r="1.5"/>
                                                  </svg>
                                                </button>
                                                {activeMenuMemberId === m.id && createPortal(
                                                  <>
                                                    <div className="fixed inset-0 z-40 bg-black/10 backdrop-blur-none transition-opacity duration-200" onClick={(e) => { e.stopPropagation(); setActiveMenuMemberId(null) }} />
                                                    <div
                                                      style={{ position: 'fixed', top: activeMenuMemberPos.top, right: activeMenuMemberPos.right }}
                                                      onClick={(e) => e.stopPropagation()}
                                      className="z-50 bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-800 rounded-xl p-2 w-48 text-left overflow-hidden"
                                                    >
                                                      <p className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase border-b border-slate-100 dark:border-slate-800 pb-1.5 mb-1.5 px-2">
                                                        Cell • {cell.cellName || 'Unnamed'}
                                                      </p>
                                                      <button type="button" onClick={() => {
                                                        setActiveMenuMemberId(null)
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
                                                      }} className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 flex-shrink-0">
                                                          <path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                                                        </svg>
                                                        Edit
                                                      </button>
                                                      <button type="button" onClick={async () => {
                                                        setActiveMenuMemberId(null)
                                                        if (m.visitorId) {
                                                          try {
                                                            await updateCellGroupMember(cell.id, m.id, { visitorId: '' })
                                                            setCellMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, visitorId: '' } : x)))
                                                          } catch (err) {
                                                            console.error('Failed to unlink member', err)
                                                            alert('Failed to unlink. Please try again.')
                                                          }
                                                        } else {
                                                          setCellMemberLinking({ member: m, cellId: cell.id })
                                                        }
                                                      }} className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 flex-shrink-0">
                                                          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
                                                          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
                                                        </svg>
                                                        {m.visitorId ? 'Unlink' : 'Link'}
                                                      </button>
                                                      <button type="button" onClick={() => { setActiveMenuMemberId(null); setCellMemberTransfer({ member: m, fromCellId: cell.id }) }} className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 flex-shrink-0">
                                                          <path d="M17 3l4 4-4 4M21 7H9M7 21l-4-4 4-4M3 17h12"/>
                                                        </svg>
                                                        Transfer Cell Group
                                                      </button>
                                                      <button type="button" onClick={async () => { setActiveMenuMemberId(null); await deactivateCellGroupMember(cell.id, m.id, m.name); const list = await getCellGroupMembers(cell.id); setCellMembers(list); refreshAllCellMembers() }} className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm text-amber-600 hover:bg-amber-50 transition-colors">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                                                          <circle cx="12" cy="12" r="9"/><path d="M9 12h6"/>
                                                        </svg>
                                                        Mark Inactive
                                                      </button>
                                                      <button type="button" onClick={async () => {
                                                        setActiveMenuMemberId(null)
                                                        try {
                                                          await updateCellGroupMember(cell.id, m.id, { status: 'inactive', memberCategory: 'former' })
                                                          const list = await getCellGroupMembers(cell.id)
                                                          setCellMembers(list)
                                                          refreshAllCellMembers()
                                                        } catch (err) {
                                                          console.error('Failed to mark member as former', err)
                                                          alert('Failed to mark as former. Please try again.')
                                                        }
                                                      }} className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                                                          <path d="M3 3v18h18"/><path d="M7 12l3-3 3 3 5-5"/>
                                                        </svg>
                                                        Mark as Former
                                                      </button>
                                                      <div className="my-1 border-t border-slate-100" />
                                                      <button type="button" onClick={async () => { setActiveMenuMemberId(null); if (!window.confirm(`Remove ${m.name || 'this member'} from this cell group?`)) return; await deleteCellGroupMember(cell.id, m.id); const list = await getCellGroupMembers(cell.id); setCellMembers(list); setCellGroups((prev) => prev.map((c) => (c.id === cell.id ? { ...c, memberCount: list.length } : c))); refreshAllCellMembers() }} className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 font-medium transition-colors">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                                                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                                                        </svg>
                                                        Remove from Cell
                                                      </button>
                                                    </div>
                                                  </>,
                                                  document.body
                                                )}
                                              </div>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            {m.visitorId ? (
                                              <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">Linked</span>
                                            ) : (
                                              <span title="Not linked to visitor entry" className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100">Unlinked</span>
                                            )}
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                                {[
                                  { key: 'former', title: 'Former Members', emptyLabel: 'No former members.', match: (m) => m.memberCategory === 'former' },
                                  { key: 'not_attending', title: 'Inactive Members (Not Attending)', emptyLabel: 'No inactive members.', match: (m) => m.memberCategory !== 'former' },
                                ].map(({ key, title, emptyLabel, match }) => {
                                  const rows = cellMembers.filter((m) => m.status === 'inactive' && match(m))
                                  const sectionKey = `${cell.id}_${key}`
                                  const isSectionOpen = !!expandedMemberSections[sectionKey]
                                  return (
                                  <div key={key}>
                                  <button
                                    type="button"
                                    onClick={() => setExpandedMemberSections((prev) => ({ ...prev, [sectionKey]: !prev[sectionKey] }))}
                                    className="w-full flex items-center justify-between gap-2 mt-4 mb-1 py-1 text-left"
                                  >
                                    <span className="font-medium text-slate-700 flex items-center gap-2">
                                      {title}
                                      <span className="text-xs font-semibold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">{rows.length}</span>
                                    </span>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-slate-400 flex-shrink-0 transition-transform ${isSectionOpen ? 'rotate-180' : ''}`}>
                                      <polyline points="6 9 12 15 18 9"/>
                                    </svg>
                                  </button>
                                  {isSectionOpen && (rows.length === 0 ? (
                                    <p className="px-1 py-4 text-center text-slate-500 text-sm">{emptyLabel}</p>
                                  ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                      {rows.map((m) => (
                                        <div
                                          key={m.id}
                                          role="button"
                                          tabIndex={0}
                                          onClick={() => openMemberDetail(m, cell.id)}
                                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMemberDetail(m, cell.id) } }}
                                          className="relative h-24 w-full flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm opacity-90 transition-all hover:shadow-md hover:opacity-100 hover:border-indigo-200 cursor-pointer"
                                        >
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                                              <p className="font-bold text-sm text-slate-800 truncate">{m.name || '—'}</p>
                                            </div>
                                            {canEdit && (
                                              <div className="relative flex-shrink-0">
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation()
                                                    if (activeMenuMemberId === m.id) {
                                                      setActiveMenuMemberId(null)
                                                      return
                                                    }
                                                    const rect = e.currentTarget.getBoundingClientRect()
                                                    setActiveMenuMemberPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
                                                    setActiveMenuMemberId(m.id)
                                                  }}
                                                  className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-200/70 hover:text-slate-600 transition-colors"
                                                >
                                                  <svg width="14" height="14" viewBox="0 0 4 16" fill="currentColor">
                                                    <circle cx="2" cy="2" r="1.5"/>
                                                    <circle cx="2" cy="8" r="1.5"/>
                                                    <circle cx="2" cy="14" r="1.5"/>
                                                  </svg>
                                                </button>
                                                {activeMenuMemberId === m.id && createPortal(
                                                  <>
                                                    <div className="fixed inset-0 z-40 bg-black/10 backdrop-blur-none transition-opacity duration-200" onClick={(e) => { e.stopPropagation(); setActiveMenuMemberId(null) }} />
                                                    <div
                                                      style={{ position: 'fixed', top: activeMenuMemberPos.top, right: activeMenuMemberPos.right }}
                                                      onClick={(e) => e.stopPropagation()}
                                      className="z-50 bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-800 rounded-xl p-2 w-48 text-left overflow-hidden"
                                                    >
                                                      <p className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase border-b border-slate-100 dark:border-slate-800 pb-1.5 mb-1.5 px-2">
                                                        Cell • {cell.cellName || 'Unnamed'}
                                                      </p>
                                                      <button type="button" onClick={() => {
                                                        setActiveMenuMemberId(null)
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
                                                      }} className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 flex-shrink-0">
                                                          <path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                                                        </svg>
                                                        Edit
                                                      </button>
                                                      <button type="button" onClick={async () => {
                                                        setActiveMenuMemberId(null)
                                                        if (m.visitorId) {
                                                          try {
                                                            await updateCellGroupMember(cell.id, m.id, { visitorId: '' })
                                                            setCellMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, visitorId: '' } : x)))
                                                          } catch (err) {
                                                            console.error('Failed to unlink member', err)
                                                            alert('Failed to unlink. Please try again.')
                                                          }
                                                        } else {
                                                          setCellMemberLinking({ member: m, cellId: cell.id })
                                                        }
                                                      }} className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 flex-shrink-0">
                                                          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
                                                          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
                                                        </svg>
                                                        {m.visitorId ? 'Unlink' : 'Link'}
                                                      </button>
                                                      <button type="button" onClick={() => { setActiveMenuMemberId(null); setCellMemberTransfer({ member: m, fromCellId: cell.id }) }} className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 flex-shrink-0">
                                                          <path d="M17 3l4 4-4 4M21 7H9M7 21l-4-4 4-4M3 17h12"/>
                                                        </svg>
                                                        Transfer Cell Group
                                                      </button>
                                                      <button type="button" onClick={async () => { setActiveMenuMemberId(null); await updateCellGroupMember(cell.id, m.id, { status: 'active' }); const list = await getCellGroupMembers(cell.id); setCellMembers(list); refreshAllCellMembers() }} className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50 transition-colors">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                                                          <circle cx="12" cy="12" r="9"/><path d="M8 12l2.5 2.5L16 9"/>
                                                        </svg>
                                                        Make Active
                                                      </button>
                                                      {m.memberCategory !== 'former' && (
                                                        <button type="button" onClick={async () => {
                                                          setActiveMenuMemberId(null)
                                                          try {
                                                            await updateCellGroupMember(cell.id, m.id, { status: 'inactive', memberCategory: 'former' })
                                                            const list = await getCellGroupMembers(cell.id)
                                                            setCellMembers(list)
                                                            refreshAllCellMembers()
                                                          } catch (err) {
                                                            console.error('Failed to mark member as former', err)
                                                            alert('Failed to mark as former. Please try again.')
                                                          }
                                                        }} className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                                                            <path d="M3 3v18h18"/><path d="M7 12l3-3 3 3 5-5"/>
                                                          </svg>
                                                          Mark as Former
                                                        </button>
                                                      )}
                                                      <div className="my-1 border-t border-slate-100" />
                                                      <button type="button" onClick={async () => { setActiveMenuMemberId(null); if (!window.confirm(`Remove ${m.name || 'this member'} from this cell group?`)) return; await deleteCellGroupMember(cell.id, m.id); const list = await getCellGroupMembers(cell.id); setCellMembers(list); setCellGroups((prev) => prev.map((c) => (c.id === cell.id ? { ...c, memberCount: list.length } : c))); refreshAllCellMembers() }} className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 font-medium transition-colors">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                                                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                                                        </svg>
                                                        Remove from Cell
                                                      </button>
                                                    </div>
                                                  </>,
                                                  document.body
                                                )}
                                              </div>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            {m.visitorId ? (
                                              <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">Linked</span>
                                            ) : (
                                              <span title="Not linked to visitor entry" className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100">Unlinked</span>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ))}
                                  </div>
                                  )
                                })}
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
                                    <button type="button" onClick={() => { setEditingCellGroupId(cell.id); setCellGroupEditForm({ cellId: cell.cellId || cell.id || '', cellName: cell.cellName || '', leader: cell.leader || '', leaderPersonId: cell.leaderPersonId || '', meetingDay: cell.meetingDay || '', launchDate: cell.launchDate ? String(cell.launchDate).slice(0, 10) : '', status: 'inactive' }); setCellGroupEditModalOpen(true) }} className="text-blue-600 hover:underline">Edit</button>
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

            </div>
          )}

          {activeTab === 'reports' && slug === 'cell' && <CellReportsTab />}

          {activeTab === 'shepherdCare' && slug === 'cell' && (
            <CellLeaderEntryTab
              view="shepherd"
              pendingFillInvitations={pendingFillInvitations}
              onOpenFillInvite={openFillInviteModal}
            />
          )}

          {activeTab === 'midweek' && slug === 'cell' && (
            <CellLeaderEntryTab
              view="midweek"
              pendingFillInvitations={pendingFillInvitations}
              onOpenFillInvite={openFillInviteModal}
            />
          )}

          {cellGroupModalOpen && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full">
                <div className="p-5 border-b border-slate-200 dark:border-slate-800">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Add cell group</h3>
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    try {
                      const id = await addCellGroup({ ...newCellGroupForm, department: department.name })
                      const logicalCellId = (newCellGroupForm.cellId || '').trim() || id
                      setCellGroups((prev) => [...prev, { id, cellId: logicalCellId, cellName: newCellGroupForm.cellName, leader: newCellGroupForm.leader, leaderPersonId: newCellGroupForm.leaderPersonId, meetingDay: newCellGroupForm.meetingDay, launchDate: newCellGroupForm.launchDate, status: newCellGroupForm.status || 'active', memberCount: 0, department: department.name }])
                      setCellGroupModalOpen(false)
                      setNewCellGroupForm({ cellId: '', cellName: '', leader: '', leaderPersonId: '', meetingDay: '', launchDate: '', status: 'active' })
                    } catch (err) {
                      console.error(err)
                      alert('Failed to save')
                    }
                  }}
                  className="p-5 space-y-4"
                >
                  {isFounder && (
                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Cell ID (optional)</label>
                    <input type="text" placeholder="Unique code; leave blank to use document ID" value={newCellGroupForm.cellId} onChange={(e) => setNewCellGroupForm((f) => ({ ...f, cellId: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Leaders link via profile <strong>cellGroupId</strong> matching this value.</p>
                  </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Cell Name *</label>
                    <input type="text" value={newCellGroupForm.cellName} onChange={(e) => setNewCellGroupForm((f) => ({ ...f, cellName: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Leader</label>
                    <LeaderPicker
                      value={{ name: newCellGroupForm.leader, personId: newCellGroupForm.leaderPersonId }}
                      onChange={({ name, personId }) => setNewCellGroupForm(f => ({ ...f, leader: name, leaderPersonId: personId }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Day of Cell</label>
                    <select value={newCellGroupForm.meetingDay} onChange={(e) => setNewCellGroupForm((f) => ({ ...f, meetingDay: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                      <option value="">— select a day —</option>
                      {WEEKDAY_OPTIONS.map((day) => (
                        <option key={day} value={day}>{day}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Launch Date</label>
                    <input type="date" value={newCellGroupForm.launchDate} onChange={(e) => setNewCellGroupForm((f) => ({ ...f, launchDate: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Status</label>
                    <select value={newCellGroupForm.status} onChange={(e) => setNewCellGroupForm((f) => ({ ...f, status: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="submit" className="px-4 min-h-[44px] py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-medium shadow-sm transition-colors">Save</button>
                    <button type="button" onClick={() => setCellGroupModalOpen(false)} className="px-4 min-h-[44px] py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-400 active:bg-slate-100 dark:active:bg-slate-700 transition-colors">Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {cellGroupEditModalOpen && editingCellGroupId && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full">
                <div className="p-5 border-b border-slate-200 dark:border-slate-800">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Edit cell group</h3>
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
                  {isFounder && (
                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Cell ID</label>
                    <input type="text" value={cellGroupEditForm.cellId} onChange={(e) => setCellGroupEditForm((f) => ({ ...f, cellId: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Unique string; user <strong>cellGroupId</strong> must match.</p>
                  </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Cell Name *</label>
                    <input type="text" value={cellGroupEditForm.cellName} onChange={(e) => setCellGroupEditForm((f) => ({ ...f, cellName: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Leader</label>
                    <LeaderPicker
                      value={{ name: cellGroupEditForm.leader, personId: cellGroupEditForm.leaderPersonId }}
                      onChange={({ name, personId }) => setCellGroupEditForm(f => ({ ...f, leader: name, leaderPersonId: personId }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Meeting Day</label>
                    <select value={cellGroupEditForm.meetingDay} onChange={(e) => setCellGroupEditForm((f) => ({ ...f, meetingDay: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                      <option value="">— select a day —</option>
                      {WEEKDAY_OPTIONS.map((day) => (
                        <option key={day} value={day}>{day}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Launch Date</label>
                    <input type="date" value={cellGroupEditForm.launchDate} onChange={(e) => setCellGroupEditForm((f) => ({ ...f, launchDate: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Status</label>
                    <select value={cellGroupEditForm.status} onChange={(e) => setCellGroupEditForm((f) => ({ ...f, status: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="submit" className="px-4 min-h-[44px] py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-medium shadow-sm transition-colors">Save</button>
                    <button type="button" onClick={() => { setCellGroupEditModalOpen(false); setEditingCellGroupId(null) }} className="px-4 min-h-[44px] py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-400 active:bg-slate-100 dark:active:bg-slate-700 transition-colors">Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {detailMember && createPortal(
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4" onClick={() => setDetailMember(null)}>
              <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white dark:bg-slate-900 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[85vh] overflow-y-auto"
              >
                <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-5 py-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{detailMember.name || '—'}</p>
                    {detailMemberVisitor?.phone && <p className="text-xs text-slate-500 mt-0.5">{detailMemberVisitor.phone}</p>}
                  </div>
                  <button type="button" onClick={() => setDetailMember(null)} className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </div>
                <div className="p-5 space-y-4">
                  {detailMemberLoading ? (
                    <p className="text-sm text-slate-500 text-center py-6">Loading…</p>
                  ) : (
                    <>
                      {!detailMember.visitorId && (
                        <p className="text-xs text-slate-400 bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2">Not linked to a directory profile — limited details available.</p>
                      )}

                      {detailMemberVisitor?.attendedDate && (
                        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg px-3 py-2.5 flex items-center justify-between">
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-100 mb-0.5">Time in Church</p>
                            <p className="text-sm font-semibold text-white">since {formatDMY(detailMemberVisitor.attendedDate)}</p>
                          </div>
                          {detailMemberVisitor.serviceAttended && (
                            <span className="text-[9px] font-bold text-emerald-100 bg-white/20 px-2 py-1 rounded-full border border-white/30">{detailMemberVisitor.serviceAttended}</span>
                          )}
                        </div>
                      )}

                      {detailMemberMinistries.length > 0 && (
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                            <div className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0" />
                            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Ministry & Leadership</p>
                          </div>
                          <div className="px-3 py-2 space-y-1.5">
                            {detailMemberMinistries.map((mn, i) => (
                              <div key={i} className="bg-violet-50 dark:bg-violet-950/40 border border-violet-100 dark:border-violet-900 rounded-lg px-2.5 py-2">
                                <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                                  {mn.ministry}{mn.role ? <span className="font-normal text-slate-400"> · {mn.role}</span> : ''}
                                </p>
                                {mn.from && <p className="text-[9px] text-slate-400 mt-0.5">since {formatDMY(mn.from)}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {detailMemberProfile && (detailMemberProfile.baptised || detailMemberProfile.maritalStatus || detailMemberProfile.membershipStatus || detailMemberProfile.permanentAddress) && (
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                            <div className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Spiritual & Membership</p>
                          </div>
                          <div className="px-3 py-1 divide-y divide-slate-50 dark:divide-slate-800">
                            {detailMemberProfile.baptised && (
                              <div className="flex items-start justify-between gap-2 py-1.5">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Baptised</span>
                                <span className="text-[11px] font-semibold text-right text-slate-800 dark:text-slate-200">{detailMemberProfile.baptised === 'yes' ? 'Yes' : detailMemberProfile.baptised === 'no' ? 'No' : detailMemberProfile.baptised}</span>
                              </div>
                            )}
                            {detailMemberProfile.maritalStatus && (
                              <div className="flex items-start justify-between gap-2 py-1.5">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Marital Status</span>
                                <span className="text-[11px] font-semibold text-right text-slate-800 dark:text-slate-200 capitalize">{detailMemberProfile.maritalStatus}</span>
                              </div>
                            )}
                            {detailMemberProfile.maritalStatus?.toLowerCase() === 'married' && detailMemberProfile.spouseName && (
                              <div className="flex items-start justify-between gap-2 py-1.5">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Spouse</span>
                                <span className="text-[11px] font-semibold text-right text-slate-800 dark:text-slate-200">{detailMemberProfile.spouseName}</span>
                              </div>
                            )}
                            {detailMemberProfile.membershipStatus && (
                              <div className="flex items-start justify-between gap-2 py-1.5">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Membership</span>
                                <span className="text-[11px] font-semibold text-right text-slate-800 dark:text-slate-200 capitalize">{detailMemberProfile.membershipStatus}</span>
                              </div>
                            )}
                            {detailMemberProfile.permanentAddress && (
                              <div className="flex items-start justify-between gap-2 py-1.5">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Perm. Address</span>
                                <span className="text-[11px] font-semibold text-right text-slate-800 dark:text-slate-200 leading-snug">{detailMemberProfile.permanentAddress}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {detailMemberCellAttendance.length > 0 && (
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                            <div className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0" />
                            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Cell Attendance (last {detailMemberCellAttendance.length})</p>
                          </div>
                          <div className="px-3 py-3 flex items-center gap-2 flex-wrap">
                            {detailMemberCellAttendance.map((r, i) => (
                              <span key={i} title={r.date ? formatDMY(r.date) : ''} className={`rounded-full flex-shrink-0 ${r.present ? 'bg-green-400' : 'bg-red-300'} ${i === 0 ? 'w-4 h-4' : 'w-2.5 h-2.5'}`} />
                            ))}
                          </div>
                        </div>
                      )}

                      {detailMemberSundayAttendance.length > 0 && (
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Sunday Attendance (last {detailMemberSundayAttendance.length})</p>
                          </div>
                          <div className="px-3 py-3 flex items-center gap-2 flex-wrap">
                            {detailMemberSundayAttendance.map((s, i) => {
                              const nameLower = String(detailMember.name || '').trim().toLowerCase()
                              const present = s.presentNames.includes(nameLower)
                              return <span key={i} title={s.date ? formatDMY(s.date) : ''} className={`rounded-full flex-shrink-0 ${present ? 'bg-emerald-400' : 'bg-red-300'} ${i === 0 ? 'w-4 h-4' : 'w-2.5 h-2.5'}`} />
                            })}
                          </div>
                        </div>
                      )}

                      {!detailMemberVisitor && detailMemberMinistries.length === 0 && detailMemberCellAttendance.length === 0 && detailMemberSundayAttendance.length === 0 && (
                        <p className="text-sm text-slate-400 text-center py-6">No additional details on file.</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>,
            document.body
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

          {cellMemberTransfer && (() => {
            const { member, fromCellId } = cellMemberTransfer
            const destinations = cellGroups.filter((c) => c.status !== 'inactive' && c.id !== fromCellId)
            return (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl shadow-xl max-w-sm w-full max-h-[80vh] flex flex-col overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-slate-800">Transfer Cell Group</h3>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">Move {member.name || 'this member'} to a different cell group</p>
                    </div>
                    <button type="button" onClick={() => setCellMemberTransfer(null)}
                      className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 text-xl flex-shrink-0">×</button>
                  </div>
                  <div className="overflow-y-auto flex-1">
                    {destinations.length === 0 ? (
                      <p className="px-5 py-6 text-sm text-slate-400 text-center">No other active cell groups to transfer to.</p>
                    ) : (
                      destinations.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          disabled={transferringCellMember}
                          onClick={async () => {
                            setTransferringCellMember(true)
                            try {
                              await addCellGroupMember(c.id, {
                                name: member.name || '',
                                phone: member.phone || '',
                                birthday: member.birthday || '',
                                anniversary: member.anniversary || '',
                                locality: member.locality || '',
                                since: member.since || '',
                                visitorId: member.visitorId || '',
                                status: 'active',
                              })
                              await deleteCellGroupMember(fromCellId, member.id)
                              const [fromList, toList] = await Promise.all([
                                getCellGroupMembers(fromCellId),
                                getCellGroupMembers(c.id),
                              ])
                              if (expandedCellId === fromCellId) setCellMembers(fromList)
                              setCellGroups((prev) => prev.map((g) => {
                                if (g.id === fromCellId) return { ...g, memberCount: fromList.length }
                                if (g.id === c.id) return { ...g, memberCount: toList.length }
                                return g
                              }))
                              refreshAllCellMembers()
                              setCellMemberTransfer(null)
                              setCellMemberToast(`${member.name || 'Member'} transferred to ${c.cellName || c.name || 'the selected cell group'}.`)
                              setTimeout(() => setCellMemberToast(''), 3500)
                            } catch (err) {
                              console.error('Failed to transfer cell member', err)
                              alert('Failed to transfer member. Please try again.')
                            } finally {
                              setTransferringCellMember(false)
                            }
                          }}
                          className="w-full text-left px-5 py-3 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors disabled:opacity-50 border-b border-slate-50 last:border-0"
                        >
                          {c.cellName || c.name || c.id}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )
          })()}

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

          {cellMemberToast && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg">
              {cellMemberToast}
            </div>
          )}

          {cellMemberModalOpen && expandedCellId && (
            <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md flex flex-col max-h-[92vh]">
                {/* Header */}
                <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">{editingCellMemberId ? 'Edit Member' : 'Add Member'}</h3>
                  <button type="button" onClick={() => { setCellMemberModalOpen(false); setEditingCellMemberId(null) }}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xl">×</button>
                </div>

                <div className="overflow-y-auto min-h-0 flex-1">
                  {editingCellMemberId ? (
                    <form
                      id="cell-member-form"
                      onSubmit={async (e) => {
                        e.preventDefault()
                        try {
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
                      <div>
                        <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Name *</label>
                        <input
                          type="text"
                          value={cellMemberForm.name}
                          onChange={(e) => setCellMemberForm((f) => ({ ...f, name: e.target.value }))}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          required
                        />
                      </div>

                      {/* Linked visitor info — shown only when editing a linked member */}
                      {cellMemberForm.visitorId && (
                        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 overflow-hidden">
                          <div className="px-3 py-2.5 border-b border-emerald-100 dark:border-emerald-800 flex items-center gap-2">
                            <span className="text-emerald-600 dark:text-emerald-400 text-sm">🔗</span>
                            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">Visitor Entry Details</p>
                            {!cellMemberLinkedVisitor && <span className="text-xs text-emerald-400 dark:text-emerald-500 ml-auto">Loading…</span>}
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
                                  <label className="block text-xs font-medium text-emerald-700 dark:text-emerald-300 mb-1">{label}</label>
                                  <input
                                    type={type}
                                    value={cellMemberLinkedVisitorForm[key] || ''}
                                    onChange={e => setCellMemberLinkedVisitorForm(f => ({ ...f, [key]: e.target.value }))}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                          <p className="px-3 pb-2 text-xs text-emerald-500 dark:text-emerald-400">Changes saved here will also update in Visitor Entry and PCS.</p>
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Birthday</label>
                        <input type="date" value={cellMemberForm.birthday} onChange={(e) => setCellMemberForm((f) => ({ ...f, birthday: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Anniversary (optional)</label>
                        <input type="date" value={cellMemberForm.anniversary} onChange={(e) => setCellMemberForm((f) => ({ ...f, anniversary: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Phone Number</label>
                        <input type="text" value={cellMemberForm.phone} onChange={(e) => setCellMemberForm((f) => ({ ...f, phone: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Locality</label>
                        <input type="text" value={cellMemberForm.locality} onChange={(e) => setCellMemberForm((f) => ({ ...f, locality: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Since (first visit / started attending)</label>
                        <input type="date" value={cellMemberForm.since} onChange={(e) => setCellMemberForm((f) => ({ ...f, since: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Status</label>
                        <select value={cellMemberForm.status} onChange={(e) => setCellMemberForm((f) => ({ ...f, status: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </div>

                      {/* Spiritual Records — only shown when member is linked (has visitorId) */}
                      {cellMemberForm.visitorId && (
                        <div className="rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 overflow-hidden">
                          <div className="px-3 py-2.5 border-b border-violet-100 dark:border-violet-800">
                            <p className="text-xs font-bold text-violet-700 dark:text-violet-300 uppercase tracking-wide">Spiritual Records</p>
                            <p className="text-xs text-violet-400 dark:text-violet-500 mt-0.5">Saved to member profile · visible across the app</p>
                          </div>
                          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-violet-700 dark:text-violet-300 mb-1">Baptism Date</label>
                              <input type="date" value={cellMemberForm.baptismDate} onChange={e => setCellMemberForm(f => ({ ...f, baptismDate: e.target.value }))} className="w-full px-2.5 py-1.5 rounded-lg border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-violet-700 dark:text-violet-300 mb-1">Baptism Place</label>
                              <input type="text" placeholder="Church / Location" value={cellMemberForm.baptismPlace} onChange={e => setCellMemberForm(f => ({ ...f, baptismPlace: e.target.value }))} className="w-full px-2.5 py-1.5 rounded-lg border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-violet-700 dark:text-violet-300 mb-1">Marriage Date</label>
                              <input type="date" value={cellMemberForm.marriageDate} onChange={e => setCellMemberForm(f => ({ ...f, marriageDate: e.target.value }))} className="w-full px-2.5 py-1.5 rounded-lg border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-violet-700 dark:text-violet-300 mb-1">Spouse Name</label>
                              <input type="text" placeholder="Spouse full name" value={cellMemberForm.spouseName} onChange={e => setCellMemberForm(f => ({ ...f, spouseName: e.target.value }))} className="w-full px-2.5 py-1.5 rounded-lg border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500" />
                            </div>
                          </div>
                        </div>
                      )}
                    </form>
                  ) : (
                    /* Add mode — simple search & quick-assign picker. No personal-detail fields:
                       that data belongs to Caring, and Cell only needs to place an existing
                       People's Directory entry into a cell group. */
                    <div className="p-5">
                      <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide mb-2">Search People&apos;s Directory</p>
                      <div className="relative mb-3">
                        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
                          <path d="M9.5 9.5l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                        </svg>
                        <input
                          type="text"
                          autoFocus
                          placeholder="Search by name…"
                          value={cellMemberVisitorSearch}
                          onChange={e => setCellMemberVisitorSearch(e.target.value)}
                          className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 placeholder-slate-400"
                        />
                      </div>
                      <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                          {loadingCellMemberVisitors ? (
                            <p className="px-3 py-6 text-xs text-slate-400 text-center">Loading directory…</p>
                          ) : cellMemberVisitorsError ? (
                            <div className="px-3 py-6 text-center space-y-2">
                              <p className="text-xs text-red-500 dark:text-red-400 font-medium">{cellMemberVisitorsError}</p>
                              <div className="text-left bg-slate-50 dark:bg-slate-800 rounded-lg p-2.5 text-[10px] font-mono text-slate-500 dark:text-slate-400 break-all">
                                <p>role: {JSON.stringify(userProfile?.role ?? null)}</p>
                                <p>globalRole: {JSON.stringify(userProfile?.globalRole ?? null)}</p>
                                <p>department: {JSON.stringify(userProfile?.department ?? null)}</p>
                                <p>departments: {JSON.stringify(userProfile?.departments ?? null)}</p>
                                <p>positions: {JSON.stringify(userProfile?.positions ?? null)}</p>
                              </div>
                              <p className="text-[10px] text-slate-400">Screenshot or copy the box above and send it back so this can be fixed for good.</p>
                            </div>
                          ) : (() => {
                            const q = cellMemberVisitorSearch.trim().toLowerCase()
                            const matches = cellMemberVisitors.filter(v => !q || v.name.toLowerCase().includes(q))
                            if (matches.length === 0) return (
                              <div className="px-3 py-6 text-center">
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Not in People&apos;s Directory</p>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">New people are added via D Light Visitor Entry</p>
                              </div>
                            )
                            return matches.map(v => (
                              <div key={v.id} className="flex items-center gap-2.5 px-3 py-2.5">
                                <div className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                                  {v.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{v.name}</p>
                                  {v.phone && <p className="text-xs text-slate-400 dark:text-slate-500">{v.phone}</p>}
                                </div>
                                <button
                                  type="button"
                                  disabled={assigningVisitorId === v.id}
                                  onClick={async () => {
                                    const addKey = v.id || ('name:' + (v.name || '').toLowerCase().trim())
                                    const conflict = allCellMembers.find(m => m.status !== 'inactive' && m.cellId !== expandedCellId && (m.visitorId || ('name:' + (m.name || '').toLowerCase().trim())) === addKey)
                                    if (conflict) {
                                      const otherCell = cellGroups.find(c => c.id === conflict.cellId)
                                      alert(`${v.name || 'This person'} is already a member of "${otherCell?.cellName || otherCell?.name || 'another cell group'}". A person can only be in one cell group.`)
                                      return
                                    }
                                    setAssigningVisitorId(v.id)
                                    try {
                                      await addCellGroupMember(expandedCellId, { name: v.name, phone: v.phone || '', visitorId: v.id, status: 'active' })
                                      const list = await getCellGroupMembers(expandedCellId)
                                      setCellMembers(list)
                                      setCellGroups((prev) => prev.map((c) => (c.id === expandedCellId ? { ...c, memberCount: list.length } : c)))
                                      refreshAllCellMembers()
                                      setCellMemberModalOpen(false)
                                      setCellMemberVisitorSearch('')
                                      setCellMemberToast(`${v.name} added to the cell.`)
                                      setTimeout(() => setCellMemberToast(''), 3500)
                                    } catch (err) {
                                      console.error(err)
                                      alert('Failed to add member. Please try again.')
                                    } finally {
                                      setAssigningVisitorId(null)
                                    }
                                  }}
                                  className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                                >
                                  {assigningVisitorId === v.id ? 'Adding…' : 'Add to Cell'}
                                </button>
                              </div>
                            ))
                          })()}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                {editingCellMemberId ? (
                  <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 flex gap-2 flex-shrink-0">
                    <button type="submit" form="cell-member-form" className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm shadow-sm">Save</button>
                    <button type="button" onClick={() => { setCellMemberModalOpen(false); setEditingCellMemberId(null) }}
                      className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
                  </div>
                ) : (
                  <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 flex-shrink-0">
                    <button type="button" onClick={() => setCellMemberModalOpen(false)}
                      className="w-full py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800">Close</button>
                  </div>
                )}
              </div>
            </div>
          )}


          {budgetModalOpen && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
                <div className="p-5 border-b border-slate-200 dark:border-slate-800">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{editingBudgetId ? 'Edit row' : 'Add row'}</h3>
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
                      <label className="block text-xs font-medium text-slate-900 dark:text-white mb-1">Category *</label>
                      <input type="text" value={budgetForm.category} onChange={(e) => setBudgetForm((f) => ({ ...f, category: e.target.value }))} className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" required />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-900 dark:text-white mb-1">Sub-Category</label>
                      <input type="text" value={budgetForm.subCategory} onChange={(e) => setBudgetForm((f) => ({ ...f, subCategory: e.target.value }))} className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-900 dark:text-white mb-1">Description</label>
                    <input type="text" value={budgetForm.description} onChange={(e) => setBudgetForm((f) => ({ ...f, description: e.target.value }))} className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-900 dark:text-white mb-1">Quantity *</label>
                      <input type="number" min="0" step="1" value={budgetForm.quantity} onChange={(e) => setBudgetForm((f) => ({ ...f, quantity: e.target.value }))} className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" required />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-900 dark:text-white mb-1">Unit Cost (₹) *</label>
                      <input type="number" min="0" step="0.01" value={budgetForm.unitCost} onChange={(e) => setBudgetForm((f) => ({ ...f, unitCost: e.target.value }))} className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" required />
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Total Cost (₹): ₹ {((Number(budgetForm.quantity) || 0) * (Number(budgetForm.unitCost) || 0)).toLocaleString()}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-900 dark:text-white mb-1">Priority</label>
                      <select value={budgetForm.priority} onChange={(e) => setBudgetForm((f) => ({ ...f, priority: e.target.value }))} className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-900 dark:text-white mb-1">Type</label>
                      <select value={budgetForm.type} onChange={(e) => setBudgetForm((f) => ({ ...f, type: e.target.value }))} className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                        <option value="Recurring">Recurring</option>
                        <option value="Project">Project</option>
                        <option value="Asset">Asset</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-900 dark:text-white mb-1">Justification</label>
                    <input type="text" value={budgetForm.justification} onChange={(e) => setBudgetForm((f) => ({ ...f, justification: e.target.value }))} className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-900 dark:text-white mb-1">Expected Date</label>
                    <input type="date" value={budgetForm.expectedDate} onChange={(e) => setBudgetForm((f) => ({ ...f, expectedDate: e.target.value }))} className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="submit" className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium shadow-sm">{editingBudgetId ? 'Update' : 'Add row'}</button>
                    <button type="button" onClick={() => { setBudgetModalOpen(false); setEditingBudgetId(null) }} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {updateModalOpen && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
                <div className="p-5 border-b border-slate-200 dark:border-slate-800">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
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
                    <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">
                      Date
                    </label>
                    <input
                      type="date"
                      value={updateForm.date}
                      onChange={(e) =>
                        setUpdateForm((f) => ({ ...f, date: e.target.value }))
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">
                      Update
                    </label>
                    <textarea
                      value={updateForm.update}
                      onChange={(e) =>
                        setUpdateForm((f) => ({ ...f, update: e.target.value }))
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-[80px] focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">
                      Action Plan
                    </label>
                    <textarea
                      value={updateForm.actionPlan}
                      onChange={(e) =>
                        setUpdateForm((f) => ({ ...f, actionPlan: e.target.value }))
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-[80px] focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      type="submit"
                      className="px-4 min-h-[44px] py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-medium shadow-sm transition-colors"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUpdateModalOpen(false)
                        setEditingUpdateId(null)
                      }}
                      className="px-4 min-h-[44px] py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-400 active:bg-slate-100 dark:active:bg-slate-700 transition-colors"
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
      {fillInviteOpen && (() => {
        const ff = fillInviteForm
        const setFf = setFillInviteForm
        const baseline = fillInviteBaseline

        const allRelevantFields = FILL_INVITE_SECTIONS.flatMap(s => s.fields.filter(fd => !fd.relevantIf || fd.relevantIf(ff)))
        const totalMissing = allRelevantFields.filter(fd => isFillFieldMissing(baseline, ff, fd)).length

        const renderFillField = (field) => {
          const missing = isFillFieldMissing(baseline, ff, field)
          const inputCls = `w-full px-3 py-2 rounded-xl border text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 transition-colors ${missing ? 'border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-950/30 focus:ring-amber-500/20 focus:border-amber-500' : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-indigo-500/20 focus:border-indigo-500'}`
          const labelEl = (
            <label className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
              <span>{field.label}</span>
              {missing && <span className="text-[9px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded-full normal-case tracking-normal">Missing</span>}
            </label>
          )

          if (field.type === 'phone') {
            const CODES = [
              { code: '+91',  label: '🇮🇳 +91'  }, { code: '+971', label: '🇦🇪 +971' },
              { code: '+1',   label: '🇺🇸 +1'   }, { code: '+44',  label: '🇬🇧 +44'  },
              { code: '+61',  label: '🇦🇺 +61'  }, { code: '+65',  label: '🇸🇬 +65'  },
              { code: '+60',  label: '🇲🇾 +60'  }, { code: '+966', label: '🇸🇦 +966' },
              { code: '+974', label: '🇶🇦 +974' }, { code: '+965', label: '🇰🇼 +965' },
              { code: '+973', label: '🇧🇭 +973' }, { code: '+64',  label: '🇳🇿 +64'  },
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
              <div key={field.key} className="col-span-2">
                {labelEl}
                <div className="flex gap-1">
                  <select
                    value={cc}
                    onChange={e => setFf(p => ({ ...p, phone: e.target.value + ' ' + num }))}
                    className="px-1.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 flex-shrink-0"
                  >
                    {CODES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                  </select>
                  <input
                    type="tel"
                    placeholder="Number"
                    value={num}
                    onChange={e => setFf(p => ({ ...p, phone: cc + ' ' + e.target.value }))}
                    className={`${inputCls} flex-1 min-w-0`}
                  />
                </div>
              </div>
            )
          }

          if (field.type === 'select') {
            return (
              <div key={field.key}>
                {labelEl}
                <select value={ff[field.key] || ''} onChange={e => setFf(p => ({ ...p, [field.key]: e.target.value }))} className={inputCls}>
                  <option value="">— Select —</option>
                  {field.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            )
          }

          if (field.type === 'church') {
            return (
              <div key={field.key} className="col-span-2">
                {labelEl}
                <select
                  value={ff.baptismChurchIsOther ? 'other' : ff.baptismChurch}
                  onChange={e => {
                    if (e.target.value === 'other') setFf(p => ({ ...p, baptismChurch: '', baptismChurchIsOther: true }))
                    else setFf(p => ({ ...p, baptismChurch: e.target.value, baptismChurchIsOther: false }))
                  }}
                  className={inputCls}
                >
                  <option value="">— Select —</option>
                  <option value="River Of Life Christian Church">River Of Life Christian Church</option>
                  <option value="other">Other</option>
                </select>
                {ff.baptismChurchIsOther && (
                  <input type="text" placeholder="Specify church name…" value={ff.baptismChurch} onChange={e => setFf(p => ({ ...p, baptismChurch: e.target.value }))} className={`${inputCls} mt-2`} />
                )}
              </div>
            )
          }

          if (field.type === 'children') {
            const kids = ff.children || []
            return (
              <div key={field.key} className="col-span-2">
                {labelEl}
                <div className="space-y-2">
                  {kids.map((c, i) => (
                    <div key={c.id || i} className="flex gap-2 items-center">
                      <input
                        type="text"
                        placeholder="Child's name"
                        value={c.name || ''}
                        onChange={e => setFf(p => ({ ...p, children: p.children.map((cc, ci) => ci === i ? { ...cc, name: e.target.value } : cc) }))}
                        className={`${inputCls} flex-1`}
                      />
                      <button type="button" onClick={() => setFf(p => ({ ...p, children: p.children.filter((_, ci) => ci !== i) }))} className="w-8 h-8 rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 flex items-center justify-center flex-shrink-0 transition-colors">×</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setFf(p => ({ ...p, children: [...(p.children || []), { id: Date.now().toString(), name: '' }] }))} className="text-xs text-teal-600 hover:text-teal-800 font-medium transition-colors">
                    + Add Child
                  </button>
                </div>
              </div>
            )
          }

          return (
            <div key={field.key}>
              {labelEl}
              <input type={field.type} placeholder={field.placeholder || ''} value={ff[field.key] || ''} onChange={e => setFf(p => ({ ...p, [field.key]: e.target.value }))} className={inputCls} />
            </div>
          )
        }

        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[88vh]">

              {/* Header */}
              <div className="px-4 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3 flex-shrink-0">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white text-sm">Fill Profile Details</p>
                  <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium mt-0.5">{fillInviteOpen.personName}</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Requested by Caring Director — fill in what you know</p>
                </div>
                <button type="button" onClick={() => setFillInviteOpen(null)} className="w-10 h-10 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200 transition-colors text-xl flex-shrink-0">×</button>
              </div>

              {/* Form */}
              <div className="overflow-y-auto flex-1 px-4 py-4 space-y-3">
                {fillInviteLoading ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-8">Loading existing profile…</p>
                ) : !fillInviteOpen.visitorId ? (
                  <p className="text-xs text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2.5">
                    This person isn't linked to a visitor record yet, so their profile can't be saved from here. Ask your Caring Director to link them first.
                  </p>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2 px-0.5">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {totalMissing === 0 ? 'All fields filled in ✓' : `${totalMissing} field${totalMissing > 1 ? 's' : ''} missing`}
                      </p>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                        <input type="checkbox" checked={!fillShowAllFields} onChange={e => setFillShowAllFields(!e.target.checked)} className="rounded accent-indigo-600" />
                        Missing only
                      </label>
                    </div>

                    {FILL_INVITE_SECTIONS.map(section => {
                      const relevantFields = section.fields.filter(fd => !fd.relevantIf || fd.relevantIf(ff))
                      const missingFields = relevantFields.filter(fd => isFillFieldMissing(baseline, ff, fd))
                      const visibleFields = fillShowAllFields ? relevantFields : missingFields

                      return (
                        <div key={section.key} className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                          <div className={`px-3 py-2 flex items-center gap-2 ${section.headerBg}`}>
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${section.dot}`} />
                            <p className={`text-xs font-bold tracking-tight ${section.labelColor}`}>{section.label}</p>
                            {missingFields.length > 0 ? (
                              <span className="ml-auto text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full flex-shrink-0">{missingFields.length} missing</span>
                            ) : (
                              <span className="ml-auto text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full flex-shrink-0">✓ Complete</span>
                            )}
                          </div>
                          {visibleFields.length > 0 && (
                            <div className="p-3 grid grid-cols-2 gap-3">
                              {visibleFields.map(fd => renderFillField(fd))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="px-4 pb-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex-shrink-0 space-y-2">
                <button
                  type="button"
                  disabled={fillInviteSaving || fillInviteLoading || !fillInviteOpen.visitorId}
                  onClick={async () => {
                    setFillInviteSaving(true)
                    try {
                      const payload = {
                        phone: ff.phone, email: ff.email, dob: ff.dob, nativity: ff.nativity, currentPlace: ff.currentPlace,
                        baptised: ff.baptised, baptismDate: ff.baptismDate, baptismPlace: ff.baptismPlace, baptismChurch: ff.baptismChurch,
                        previousChurchName: ff.previousChurchName, previousChurchPlace: ff.previousChurchPlace,
                        maritalStatus: ff.maritalStatus, marriageDate: ff.marriageDate, spouseName: ff.spouseName,
                        hasKids: ff.hasKids, children: ff.hasKids === 'yes' ? (ff.children || []).filter(c => c.name) : [],
                      }
                      // Never clobber existing data with a blank — only write fields the leader actually filled in.
                      const cleanPayload = Object.fromEntries(
                        Object.entries(payload).filter(([k, v]) => k === 'children' || (v !== '' && v !== null && v !== undefined))
                      )
                      await upsertMemberProfile(fillInviteOpen.visitorId, cleanPayload, userProfile?.email || '')
                      await completePCSFillInvitation(fillInviteOpen.id, userProfile?.email || '', fillInviteOpen.visitorId || '')
                      setPendingFillInvitations(prev => prev.filter(i => i.id !== fillInviteOpen.id))
                      setFillInviteOpen(null)
                    } catch { alert('Failed to save profile details') }
                    setFillInviteSaving(false)
                  }}
                  className="w-full min-h-[44px] py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-medium shadow-sm transition-colors disabled:opacity-60"
                >
                  {fillInviteSaving ? 'Submitting…' : 'Submit Profile Details'}
                </button>
                <button type="button" onClick={() => setFillInviteOpen(null)} className="w-full py-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">Cancel</button>
              </div>
            </div>
          </div>
        )
      })()}

    </div>
  )
}

// ─── Cell Leader Picker ────────────────────────────────────────────────────────
function LeaderPicker({ value, onChange }) {
  const [query, setQuery] = useState('')
  const [allPeople, setAllPeople] = useState(null)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)

  const loadPeople = async () => {
    if (allPeople) return allPeople
    setLoading(true)
    try {
      // Cell leaders are almost always first recorded as a member of their own cell,
      // not in the People's Directory or D-Light — search that roster too, or a leader
      // who's only ever been added as a cell member never turns up in this search.
      // Each source is caught independently — a failure in one (e.g. a permission
      // gap on the cell-members collection group query) must not blank out the
      // other two sources that loaded fine.
      const [people, visitors, members] = await Promise.all([
        getPeople().catch(() => []),
        getDelightVisitors().catch(() => []),
        getAllCellGroupMembers().catch(() => []),
      ])
      const seen = new Set()
      const merged = []
      for (const p of people) {
        const key = (p.phone || '').replace(/\s+/g, '') || p.id
        if (!seen.has(key)) { seen.add(key); merged.push({ id: p.id, name: p.name || '', phone: p.phone || '' }) }
      }
      for (const v of visitors) {
        // Fall back to the doc id when there's no phone — otherwise every visitor
        // recorded without a phone number is silently dropped from the search.
        const key = (v.phone || '').replace(/\s+/g, '') || v.id
        if (!seen.has(key)) { seen.add(key); merged.push({ id: v.id, name: v.name || '', phone: v.phone || '' }) }
      }
      for (const m of members) {
        if (!m.name) continue
        const key = (m.phone || '').replace(/\s+/g, '') || `member:${m.cellId}:${m.id}`
        if (!seen.has(key)) { seen.add(key); merged.push({ id: m.visitorId || m.id, name: m.name, phone: m.phone || '' }) }
      }
      merged.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      setAllPeople(merged)
      setLoading(false)
      return merged
    } catch { setLoading(false); return [] }
  }

  const handleFocus = async () => {
    setOpen(true)
    const list = await loadPeople()
    const q = query.toLowerCase().trim()
    setResults(q ? list.filter(p => p.name.toLowerCase().includes(q) || p.phone.includes(q)).slice(0, 8) : list.slice(0, 8))
  }

  useEffect(() => {
    if (!allPeople) return
    const q = query.toLowerCase().trim()
    setResults(q ? allPeople.filter(p => p.name.toLowerCase().includes(q) || p.phone.includes(q)).slice(0, 8) : allPeople.slice(0, 8))
  }, [query, allPeople])

  const select = (person) => {
    onChange({ name: person.name, personId: person.id })
    setOpen(false)
    setQuery('')
  }

  const clear = () => {
    onChange({ name: '', personId: '' })
    setQuery('')
    setOpen(false)
  }

  const isLinked = !!(value.name && value.personId)
  const hasNameOnly = !!(value.name && !value.personId)

  return (
    <div className="relative">
      {isLinked ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-indigo-300 bg-indigo-50">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-indigo-900 truncate">{value.name}</p>
            <p className="text-xs text-indigo-500">Linked to directory</p>
          </div>
          <button type="button" onClick={clear} className="text-slate-400 hover:text-red-500 transition-colors text-lg leading-none flex-shrink-0">×</button>
        </div>
      ) : (
        <>
          {hasNameOnly && (
            <div className="flex items-center gap-2 px-3 py-1.5 mb-1.5 rounded-lg bg-amber-50 border border-amber-200">
              <span className="text-xs text-amber-800 flex-1 truncate">"{value.name}" — not linked</span>
              <button type="button" onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0) }} className="text-xs font-semibold text-indigo-600 hover:underline flex-shrink-0">Link →</button>
              <button type="button" onClick={clear} className="text-slate-400 hover:text-red-500 transition-colors text-base leading-none flex-shrink-0">×</button>
            </div>
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={handleFocus}
            placeholder={hasNameOnly ? 'Search directory to link…' : 'Search people directory…'}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </>
      )}
      {open && !isLinked && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setQuery('') }} />
          <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
            {loading && <p className="px-3 py-2.5 text-sm text-slate-400">Loading…</p>}
            {!loading && results.length === 0 && <p className="px-3 py-2.5 text-sm text-slate-400">No results found</p>}
            {results.map(p => (
              <button key={p.id} type="button" onClick={() => select(p)}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-indigo-50 text-left transition-colors">
                <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">
                  {(p.name || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                  {p.phone && <p className="text-xs text-slate-400">{p.phone}</p>}
                </div>
              </button>
            ))}
          </div>
        </>
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
                  updateDeptTeamMembersByVisitorId(entry.visitorId, { name, phone }).catch(() => {})
                  updateWorshipTeamMembersByVisitorId(entry.visitorId, { name, phone }).catch(() => {})
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

/** Upcoming (or today, if today is one) Sunday, as a yyyy-MM-dd string. */
function upcomingSunday() {
  const today = new Date()
  const d = new Date(today)
  d.setDate(today.getDate() + (today.getDay() === 0 ? 0 : 7 - today.getDay()))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Every day-of-month (1-based) that falls on a Sunday for the given year/month (1-12). */
function sundaysInMonth(year, month) {
  if (!year || !month) return []
  const days = []
  const daysInMonth = new Date(Number(year), Number(month), 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(Number(year), Number(month) - 1, d).getDay() === 0) days.push(d)
  }
  return days
}

// ─── Convenience date picker (day / month / year selects) ────────────────────
/** Pass sundaysOnly to restrict the Day dropdown to that month's Sundays — used for
 *  visitor "Date of Attending" fields, since D-Light visitors are only ever recorded
 *  on a Sunday service date. */
function DateSelect({ value, onChange, minYear, maxYear, sundaysOnly = false }) {
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
    // If switching month/year drops the previously-picked day off the Sunday list,
    // snap forward to that month's first Sunday instead of leaving an invalid pick.
    if (sundaysOnly && ny && nm) {
      const validDays = sundaysInMonth(ny, nm)
      if (nd && !validDays.includes(Number(nd))) nd = validDays[0] ? String(validDays[0]) : ''
    }
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
  const dayOptions = sundaysOnly && sel.y && sel.m
    ? sundaysInMonth(sel.y, sel.m)
    : Array.from({length: 31}, (_, i) => i + 1)
  const isNonSunday = sundaysOnly && sel.y && sel.m && sel.d && new Date(Number(sel.y), Number(sel.m) - 1, Number(sel.d)).getDay() !== 0
  return (
    <div>
      <div className="flex gap-1.5">
        <select value={sel.d} onChange={e => update(sel.y, sel.m, e.target.value)} className={cls}>
          <option value="">Day</option>
          {dayOptions.map(n => <option key={n} value={n}>{n}</option>)}
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
      {isNonSunday && (
        <p className="text-xs text-amber-600 font-medium mt-1">
          ⚠ This date isn't a Sunday — visitor dates are normally recorded on a Sunday service date.
        </p>
      )}
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
