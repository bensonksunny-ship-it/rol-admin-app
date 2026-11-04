import { useParams, Link, Navigate, useSearchParams, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState, useCallback, Fragment, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Pencil, Download, CheckCircle2, AlertTriangle, ChevronUp, ChevronDown, TrendingUp, TrendingDown, PiggyBank, ArrowDownLeft, ArrowUpRight, ClipboardList, ChevronRight, Building2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getDepartmentBySlug } from '../constants/departments'
import { getDepartmentHubTabs, LEGACY_DEPARTMENT_NAMES, usesGenericSubDepartmentCollection } from '../constants/departmentTabs'
import {
  getTasks,
  updateTask,
  subscribeTasksByDepartment,
  subscribeCellMemberReferralTasks,
  subscribePCSReferralTasks,
  subscribePCSAddNotifications,
  getDepartmentEntries,
  addDepartmentEntry,
  getDepartmentTeamMembers,
  subscribeDepartmentTeamMembers,
  addDepartmentTeamMember,
  updateDepartmentTeamMember,
  deleteDepartmentTeamMember,
  addSubDepartmentsToTeamMember,
  getFinanceBudgetItemsByDepartment,
  addFinanceBudgetItem,
  updateFinanceBudgetItem,
  deleteFinanceBudgetItem,
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
  isCellMemberConflict,
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
  getMergedPeopleDirectory,
  subscribeDelightVisitors,
  addDelightVisitor,
  updateDelightVisitor,
  deleteDelightVisitor,
  getDlightSubDepartments,
  subscribeDlightSubDepartments,
  addDlightSubDepartment,
  updateDlightSubDepartment,
  deleteDlightSubDepartment,
  getDlightAssignmentsForDate,
  setDlightAssignmentsForDate,
  getDlightAssignmentsArchive,
  getMediaScheduleByDate,
  setMediaScheduleByDate,
  getMediaSchedules,
  getDepartmentSubDepartments,
  addDepartmentSubDepartment,
  updateDepartmentSubDepartment,
  deleteDepartmentSubDepartment,
  reorderDepartmentSubDepartments,
  getDepartmentChildren,
  getRiverKidsLookup,
  getSundayReport,
  patchSundayReportNameField,
  patchSundayReportCellAttendance,
  getPCSEntries,
  syncAllPCSToLookup,
  updatePCSEntry,
  deletePCSEntry,
  deactivatePCSEntry,
  subscribeMembershipApplicationsForEntry,
  subscribeApplicationsForEntry,
  subscribeCaringEvents,
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
  getPeople,
  getSundayPlan,
  setSundayPlanSection,
  getPCSFillInvitationByEntry,
  subscribePCSFillInvitationsByCellId,
  getPCSFillInvitationById,
  completePCSFillInvitation,
  getFinanceIncome,
  getFinanceExpense,
  getFinanceSavings,
  subscribeFinanceExpenseByDept,
  subscribeCellVisitorProposals,
  completeCellVisitorProposal,
  dismissCellVisitorProposal,
  getSundayAttendanceCountsByName,
  subscribeToRecentSundayAttendanceWeeks,
} from '../services/firestore'
import { getMemberDisplayName } from '../utils/displayName'
import { findDuplicateCellMembers, normalizeMemberName, cellConflictMessage } from '../utils/cellDuplicates'
import ApplicationsQueueCard from '../components/caring/ApplicationsQueueCard'
import { APPLICATION_TYPE_KEYS } from '../utils/pastoralApplications'
import CaringEventsTab from '../components/caring/CaringEventsTab'
import { canRevealSurpriseNames } from '../constants/dedicationForm'
import { ROLES, EXPENSE_CATEGORIES, normalizeDepartmentName } from '../constants/roles'
import { SAVINGS_FUNDS } from '../constants/savingsFunds'
import { logAction } from '../utils/auditLog'
import { isRestrictedDLightDirector } from '../utils/dlightAccess'
import { isPreServiceLeaderInPositions } from '../utils/sundayMinistryAccess'
import { differenceInDays, differenceInYears, differenceInMonths, format, startOfMonth, startOfWeek, endOfWeek, addWeeks, subWeeks } from 'date-fns'
import { formatDMY, parseDateToYYYYMMDD, formatDisplayDate, formatTimestampFull, formatRelativeTime, isoToDMY } from '../utils/date'
import { isSundayOnly, findPcsCellMember, CELL_HEALTH_REPORT_COUNT } from '../utils/pcsEngagement'
import useSeniorPastor from '../hooks/useSeniorPastor'
import EntryCompletionProgress from '../components/finance/EntryCompletionProgress'
import PlanningBoard from '../components/PlanningBoard/PlanningBoard'
import EventManagementTabs from '../components/events/EventManagementTabs'
import RiverKidsTabs from '../components/riverKids/RiverKidsTabs'
import PcsTab from '../components/caring/PcsTab'
import { deriveIsFirstChurch, withIsFirstChurch, withMaritalStatus } from '../utils/pcsForm'
import { VISITOR_START_YEAR } from '../constants/visitors'
import { RK_CLASS_GROUPS, rkClassGroupLabel } from '../constants/riverKids'
import { CellDirectorCockpit } from '../components/CellDirectorCockpit'
import DLightDirectorDashboard from '../components/DLightDirectorDashboard'
import { canAccessAccountsEntry, canAccessWeeklyEntryOnly, ACCOUNTS_ENTRY_BASE_PATH } from '../utils/accountsEntryAccess'
import { defaultCellTab, visibleCellTabs } from '../utils/cellTabVisibility'
import CellReportsTab from './cell/CellReportsTab'
import CellLeaderEntryTab from './cell/CellLeaderEntryTab'
import MemberPicker from '../components/MemberPicker'
import MediaHub from '../components/MediaHub'
import AdvancePayoutTab from '../components/AdvancePayoutTab'
import AdvancePayoutReviewer from '../components/AdvancePayoutReviewer'
import DeptExpenseTab from '../components/DeptExpenseTab'
import FinanceTabBar from '../components/finance/FinanceTabBar'
import OperationsTabBar from '../components/OperationsTabBar'
import { getOperationsChildren } from '../utils/departmentSubpages'
import { subDeptMatchKey } from '../utils/subDeptMatch'
import SecCoreFinance from './seccore/SecCoreFinance'
import DailySchedule from './spoffice/DailySchedule'
import ApplicationsDesk from './spoffice/ApplicationsDesk'
import ControlCenter from './spoffice/ControlCenter'
import ExpensePage from './accounts/ExpensePage'
import IncomePage from './accounts/IncomePage'
import TallyPage from './accounts/TallyPage'
import AddDepartmentsPage from './accounts/AddDepartmentsPage'
import BudgetPage from './accounts/BudgetPage'
import UpcomingSunday from './UpcomingSunday'
import { DirectorBoardPage, SundayLeaderTab, SecCoreAnalyticsHub } from './seccore/SecCoreSummary'
import SundayPrepTracker from '../components/SundayPrepTracker'
import BackButton from '../components/BackButton'
import DateInput from '../components/DateInput'
import CellDetailsModal from '../components/cell/CellDetailsModal'

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

const SUB_DEPT_PILL_COLORS = [
  'bg-indigo-50 text-indigo-700 border-indigo-200',
  'bg-violet-50 text-violet-700 border-violet-200',
  'bg-blue-50 text-blue-700 border-blue-200',
  'bg-amber-50 text-amber-700 border-amber-200',
  'bg-rose-50 text-rose-700 border-rose-200',
  'bg-emerald-50 text-emerald-700 border-emerald-200',
  'bg-cyan-50 text-cyan-700 border-cyan-200',
  'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
]
function subDeptPillColor(name) {
  const str = String(name || '')
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0
  return SUB_DEPT_PILL_COLORS[Math.abs(hash) % SUB_DEPT_PILL_COLORS.length]
}

// Team roster tables' "Member Since" column — the stored value is a plain
// YYYY-MM-DD string (see memberSince's date input elsewhere in this file), but the
// roster displays it DD/MM/YYYY.
const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-GB')
}

// "2 yrs 3 mos" / "6 mos" / "12 days" of service so far — sits under the Member
// Since date in the roster tables so a director can spot milestones at a glance
// without doing the math themselves. `endDateStr` caps the calculation at a fixed
// point (a former member's departure date) instead of measuring against today —
// see getMemberTenureEnd, which decides what that end date should be.
function formatMemberDuration(dateStr, endDateStr) {
  if (!dateStr) return ''
  const start = new Date(dateStr)
  if (isNaN(start.getTime())) return ''
  const end = endDateStr ? new Date(endDateStr) : new Date()
  if (isNaN(end.getTime())) return ''
  const years = differenceInYears(end, start)
  const months = differenceInMonths(end, start) % 12
  if (years === 0 && months === 0) {
    const days = Math.max(differenceInDays(end, start), 0)
    return days === 0 ? 'Joined today' : `${days} day${days === 1 ? '' : 's'}`
  }
  const parts = []
  if (years > 0) parts.push(`${years} yr${years === 1 ? '' : 's'}`)
  if (months > 0) parts.push(`${months} mo${months === 1 ? '' : 's'}`)
  return parts.join(' ')
}

// True during the calendar month of a whole-year service anniversary (e.g. their
// 3rd year) — flags the duration line below so it stands out as a milestone. Only
// meaningful for active members; former members' tenure is frozen, not still
// accruing anniversaries, so callers gate this on !isFormer themselves.
function isMemberAnniversaryMonth(dateStr) {
  if (!dateStr) return false
  const start = new Date(dateStr)
  if (isNaN(start.getTime())) return false
  const now = new Date()
  return differenceInYears(now, start) > 0 && start.getMonth() === now.getMonth()
}

// Where a former member's tenure calculation should stop: their explicit
// departure date if one was ever stamped, else the last time their record was
// touched (best-effort guess for legacy former members marked before formerDate
// existed), else `unknown: true` so the column can prompt for a real date instead
// of silently guessing "today" and making their tenure look like zero.
function getMemberTenureEnd(m) {
  const isFormer = !!m?.isFormer || m?.status === 'former'
  if (!isFormer) return { end: null, unknown: false }
  if (m.formerDate) return { end: m.formerDate, unknown: false }
  if (m.updatedAt instanceof Date && !isNaN(m.updatedAt.getTime())) {
    return { end: format(m.updatedAt, 'yyyy-MM-dd'), unknown: false }
  }
  return { end: null, unknown: true }
}

const WEEKDAY_OPTIONS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

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
  isFirstChurch: '', previousChurchName: '', previousChurchPlace: '',
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
      { key: 'isFirstChurch', label: 'Is this the first church they are attending?', type: 'select', options: [['yes', 'Yes'], ['no', 'No']] },
      { key: 'previousChurchName', label: 'Previous Church Name', type: 'text', relevantIf: f => f.isFirstChurch === 'no' },
      { key: 'previousChurchPlace', label: 'Previous Church Location', type: 'text', relevantIf: f => f.isFirstChurch === 'no' },
    ],
  },
  {
    key: 'family', label: 'Family Info', dot: 'bg-teal-500', headerBg: 'bg-teal-50 dark:bg-teal-950/30 border-b border-teal-100 dark:border-teal-900', labelColor: 'text-teal-700 dark:text-teal-300',
    fields: [
      { key: 'maritalStatus', label: 'Marital Status', type: 'select', options: [['Single', 'Single'], ['Married', 'Married'], ['Widowed', 'Widowed'], ['Divorced', 'Divorced']] },
      { key: 'marriageDate', label: 'Marriage Date', type: 'date', relevantIf: f => f.maritalStatus === 'Married' },
      { key: 'spouseName', label: 'Spouse Name', type: 'text', placeholder: 'Spouse name', relevantIf: f => f.maritalStatus === 'Married' },
      { key: 'hasKids', label: 'Do they have kids?', type: 'select', options: [['yes', 'Yes'], ['no', 'No']], relevantIf: f => f.maritalStatus !== 'Single' },
      { key: 'children', label: 'Children', type: 'children', relevantIf: f => f.maritalStatus !== 'Single' && f.hasKids === 'yes' },
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

// Media Assign tab — the Role / Slot rows are generated from the department's
// configured Sub-Departments (managed on "The Team" page). Nature / Description
// and Tech Spec / Notes start empty on each row; both fields are free text.

// Next `count` Sundays as yyyy-MM-dd (today included if it's Sunday) — the
// "Coming Sundays" chip row on the Media Assign tab.
function mediaUpcomingSundays(count = 5) {
  const out = []
  const today = new Date()
  const first = new Date(today)
  first.setDate(today.getDate() + (today.getDay() === 0 ? 0 : 7 - today.getDay()))
  for (let i = 0; i < count; i++) {
    const d = new Date(first)
    d.setDate(first.getDate() + i * 7)
    out.push(format(d, 'yyyy-MM-dd'))
  }
  return out
}

// Snap any yyyy-MM-dd forward to its nearest Sunday (noon-anchored so a TZ shift
// can't move the weekday) — matches the service-date convention used elsewhere.
function mediaSnapToSunday(dateStr) {
  const d = new Date(String(dateStr).slice(0, 10) + 'T12:00:00')
  if (isNaN(d.getTime())) return dateStr
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7))
  return format(d, 'yyyy-MM-dd')
}

// Digits-only, last-10 comparison key for a phone number — ignores spaces,
// dashes, and a leading country code (+91, 0, etc.) so "+91 98765 43210" and
// "9876543210" match. Used to auto-resolve a cell member's D-Light/PCS visitor
// record by phone when it wasn't explicitly linked (e.g. legacy data from
// before every "Add Member" flow required picking a directory entry).
function phoneMatchKey(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  return digits.length >= 7 ? digits.slice(-10) : ''
}

// Finds the D-Light visitor record that matches a cell member without an
// already-saved visitorId — by phone number, since that's the one identifying
// field both a cell_group member and a delight visitor record reliably share.
function findVisitorMatchForMember(member, visitorsByPhone) {
  if (!member || member.visitorId) return null
  const key = phoneMatchKey(member.phone)
  return key ? visitorsByPhone.get(key) || null : null
}

// D-Light Assign tab duty rows — one row per fixed duty (not a variable-count
// role family like Worship's), each carrying its own left-border accent color
// so the four sub-departments are visually distinguishable at a glance.
const DLIGHT_ASSIGN_ROWS = [
  { key: 'lightShinersPre', label: 'Light Shiners – Pre-service greeting', subDept: 'Light Shiners', accent: 'border-l-emerald-400' },
  { key: 'lightShinersPost', label: 'Light Shiners – Post-service greeting', subDept: 'Light Shiners', accent: 'border-l-emerald-400' },
  { key: 'lightBeaconsRoom', label: 'Light Beacons – Room addressing', subDept: 'Light Beacons', accent: 'border-l-blue-400' },
  { key: 'lightBeaconsStair', label: 'Light Beacons – Stair guardian', subDept: 'Light Beacons', accent: 'border-l-blue-400' },
  { key: 'lightBearersPostConnect', label: 'Light Bearers – Post connect', subDept: 'Light Bearers', accent: 'border-l-purple-400' },
  { key: 'lightCraftersRoomPrep', label: 'Light Crafters – Room preparation and card distribution', subDept: 'Light Crafters', accent: 'border-l-orange-400' },
]

function blankDlightAssignments() {
  return Object.fromEntries(DLIGHT_ASSIGN_ROWS.map((r) => [r.key, []]))
}

/**
 * The Assign tab's duty rows, built from the live D Light sub-departments: the four
 * original sub-departments keep their named duty rows (and saved keys) above; any
 * other sub-department (e.g. "Offering 1/2") gets one row keyed by its doc id
 * (`sub_<id>`, stable across renames). Before the list loads — or if it is empty —
 * the original rows show, so a saved roster is never hidden.
 */
function buildDlightAssignRows(subDepts) {
  const active = (subDepts || []).filter((sd) => sd.active !== false && String(sd.name || '').trim())
  if (!active.length) return DLIGHT_ASSIGN_ROWS
  const activeKeys = new Set(active.map((sd) => subDeptMatchKey(sd.name)))
  const presetKeys = new Set(DLIGHT_ASSIGN_ROWS.map((r) => subDeptMatchKey(r.subDept)))
  const presets = DLIGHT_ASSIGN_ROWS.filter((r) => activeKeys.has(subDeptMatchKey(r.subDept)))
  const custom = active
    .filter((sd) => !presetKeys.has(subDeptMatchKey(sd.name)))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((sd) => ({ key: `sub_${sd.id}`, label: sd.name.trim(), subDept: sd.name.trim(), accent: 'border-l-indigo-400', custom: true }))
  return [...presets, ...custom]
}

// Assigned-member chip colours for the Assign tab, one hue per sub-department —
// mirrors Worship's ROLE_GROUP_THEMES pattern (DepartmentWorship.jsx) so the two
// Assign tabs read as the same design language.
const DLIGHT_ROLE_THEMES = {
  'Light Shiners': { pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200', avatar: 'bg-emerald-500' },
  'Light Beacons': { pill: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200', avatar: 'bg-blue-500' },
  'Light Bearers': { pill: 'bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-200', avatar: 'bg-purple-500' },
  'Light Crafters': { pill: 'bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-200', avatar: 'bg-orange-500' },
}
function dlightRoleTheme(subDept) {
  return DLIGHT_ROLE_THEMES[subDept] || { pill: 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200', avatar: 'bg-indigo-500' }
}

// Inline-hex twin of DLIGHT_ROLE_THEMES above, for the off-screen "Copy as Image"
// render — that capture target is styled entirely in inline hex (see
// handleDlightSharePlan / DepartmentWorship.jsx's identical SHARE_ROLE_ACCENT
// convention), not Tailwind classes, so it can't reuse the `pill`/`avatar` strings.
const DLIGHT_SHARE_ACCENT = {
  'Light Shiners': { bg: '#ecfdf5', line: '#10b981' },
  'Light Beacons': { bg: '#eff6ff', line: '#3b82f6' },
  'Light Bearers': { bg: '#faf5ff', line: '#a855f7' },
  'Light Crafters': { bg: '#fff7ed', line: '#f97316' },
}
function dlightShareAccent(subDept) {
  return DLIGHT_SHARE_ACCENT[subDept] || { bg: '#eef2ff', line: '#6366f1' }
}

// Media's sub-departments are director-defined (not a fixed list like D-Light's),
// so role accents are assigned by position rather than by name — one hue per row
// index, cycling once there are more sub-departments than colors. Tailwind classes
// for the on-screen table/cards; MEDIA_SHARE_ACCENT is the inline-hex twin for the
// off-screen "Copy / Export JPEG" render (same convention as DLIGHT_SHARE_ACCENT).
const MEDIA_ROLE_ACCENTS = [
  { border: 'border-l-indigo-400', pill: 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200', avatar: 'bg-indigo-500', label: 'text-indigo-700' },
  { border: 'border-l-emerald-400', pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200', avatar: 'bg-emerald-500', label: 'text-emerald-700' },
  { border: 'border-l-amber-400', pill: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200', avatar: 'bg-amber-500', label: 'text-amber-700' },
  { border: 'border-l-rose-400', pill: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200', avatar: 'bg-rose-500', label: 'text-rose-700' },
  { border: 'border-l-sky-400', pill: 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200', avatar: 'bg-sky-500', label: 'text-sky-700' },
  { border: 'border-l-violet-400', pill: 'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200', avatar: 'bg-violet-500', label: 'text-violet-700' },
]
function mediaRoleAccent(index) {
  return MEDIA_ROLE_ACCENTS[index % MEDIA_ROLE_ACCENTS.length]
}
const MEDIA_SHARE_ACCENT = [
  { bg: '#eef2ff', line: '#6366f1' },
  { bg: '#ecfdf5', line: '#10b981' },
  { bg: '#fffbeb', line: '#f59e0b' },
  { bg: '#fff1f2', line: '#f43f5e' },
  { bg: '#f0f9ff', line: '#0ea5e9' },
  { bg: '#f5f3ff', line: '#8b5cf6' },
]
function mediaShareAccent(index) {
  return MEDIA_SHARE_ACCENT[index % MEDIA_SHARE_ACCENT.length]
}

// Next `count` upcoming Sunday dates ('yyyy-MM-dd'), today included if it's a Sunday —
// same convention as upcomingSunday() below, extended to a run of dates for the
// Assign tab's quick-select pills.
function upcomingSundaysList(count = 5) {
  const first = upcomingSunday()
  const [y, m, d] = first.split('-').map(Number)
  const start = new Date(y, m - 1, d)
  const result = []
  for (let i = 0; i < count; i++) {
    const dt = new Date(start)
    dt.setDate(start.getDate() + i * 7)
    result.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`)
  }
  return result
}

export default function DepartmentHub() {
  const { slug } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { userProfile, user, canManageDepartment, isDepartmentHead, hasAccess, hasPermission, isFounder, isSeniorPastor, isCellDirector, isSundayMinistryDirector } = useAuth()
  const { isSeniorPastorName, title: SENIOR_PASTOR_TITLE, fullTitle: SENIOR_PASTOR_FULL_TITLE, name: seniorPastorName } = useSeniorPastor()
  const department = getDepartmentBySlug(slug)

  // Cell access helper must be defined BEFORE any effects that reference it (avoid TDZ crashes)
  // NOTE: must use isCellDirector (schema-aware: role: 'DIRECTOR' new schema OR
  // position: 'Director' legacy schema) — a hand-rolled check against only
  // `position` here previously locked new-schema Directors out of the Cell
  // Director Cockpit (Pending Approvals, Cell Report Reminders, D-Light Consults).
  const fullAccess = userProfile?.globalRole === 'FOUNDER' || userProfile?.role === ROLES.FOUNDER
  const canViewAllCells = fullAccess || isCellDirector

  // Must be defined BEFORE any effects that reference it (avoid TDZ crashes) — see
  // canViewAllCells above for the same pattern. Optional chaining on department:
  // this now runs before the "department not found" guard further down, so
  // department can still be undefined here for an invalid slug.
  const canEditDelightVisitors =
    department?.name === 'D Light' &&
    (userProfile?.role === ROLES.ADMIN ||
      userProfile?.role === ROLES.MINISTRY_LEADER ||
      isDepartmentHead('D Light'))

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
  const [acctSavingsTotal, setAcctSavingsTotal] = useState(null)
  // Accounts Summary shows the live current month unless a month is picked in the
  // Entry completion panel's month list ('yyyy-MM'; null = current month).
  const [acctSummaryPick, setAcctSummaryPick] = useState(null)
  const acctSummaryNow = acctSummaryPick ? new Date(`${acctSummaryPick}-01T00:00:00`) : new Date()
  const acctSummaryYear = acctSummaryNow.getFullYear()
  const acctSummaryMonth = acctSummaryNow.getMonth()
  const [team, setTeam] = useState([])
  const [loadingTeam, setLoadingTeam] = useState(false)
  const [teamError, setTeamError] = useState('')
  const [editingMember, setEditingMember] = useState(null)
  const [showAddMemberModal, setShowAddMemberModal] = useState(false)
  const addMemberSectionRef = useRef(null)
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
    isDirector: false,
    memberType: 'core',
    notes: '',
    visitorId: '',
    source: '',
    childId: '',
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
  // Cell Groups tab: the cell whose details popup is open (CellDetailsModal).
  const [detailsCellId, setDetailsCellId] = useState(null)
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
  // Context the modal was opened in (e.g. { mediaTeam: true }) + the Media crew
  // schedules loaded for the "recent assignments" summary.
  const [detailMemberContext, setDetailMemberContext] = useState({})
  const [detailMemberMediaAssignments, setDetailMemberMediaAssignments] = useState([])
  const [detailStatusSaving, setDetailStatusSaving] = useState(false)

  const openMemberDetail = useCallback((m, cellId, context = {}) => {
    setDetailMember(m)
    setDetailMemberProfile(null)
    setDetailMemberVisitor(null)
    setDetailMemberMinistries([])
    setDetailMemberCellAttendance([])
    setDetailMemberSundayAttendance([])
    setDetailMemberContext(context || {})
    setDetailMemberMediaAssignments([])
    setDetailMemberLoading(true)
    const nameLower = String(m.name || '').trim().toLowerCase()
    Promise.all([
      m.visitorId ? getMemberProfileWithContext(m.visitorId, m.phone, null, m.name).catch(() => null) : Promise.resolve(null),
      m.visitorId ? getDelightVisitorById(m.visitorId).catch(() => null) : Promise.resolve(null),
      cellId ? getRecentCellReportsForHeatmap(cellId, 5).catch(() => []) : Promise.resolve([]),
      cellId ? getRecentSundayAttendanceNamesByCell(cellId, 5).catch(() => []) : Promise.resolve([]),
      context?.mediaTeam ? getMediaSchedules().catch(() => []) : Promise.resolve([]),
    ]).then(([ctx, visitor, cellReports, sundayWeeks, mediaSch]) => {
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
      setDetailMemberMediaAssignments(mediaSch)
    }).finally(() => setDetailMemberLoading(false))
  }, [])
  const [teamMemberLinking, setTeamMemberLinking] = useState(null)
  // Media team table: which row's three-dots Actions menu is open (m.id), or null.
  const [teamActionMenuId, setTeamActionMenuId] = useState(null)
  // Team tab roster split — Active Members / Former Members toggle, shared by every
  // slug's Team tab (D-Light's spacious table and Media's "The Team" table both read
  // this). false = active roster (default); true = the isolated former-members view.
  const [teamShowFormerMembers, setTeamShowFormerMembers] = useState(false)
  // Roster filter by serving area (e.g. "Offering 2 - Right side") — '' = no filter.
  // Options are every distinct servingArea value on this slug's sub-department list
  // (subDeptOptionList), so it stays in sync with whatever's actually configured.
  const [teamServingAreaFilter, setTeamServingAreaFilter] = useState('')
  // Inline "Set departure date" prompt for a former member whose tenure end date
  // can't be determined any other way (see getMemberTenureEnd) — id of the row
  // currently showing the prompt, plus its draft date value.
  const [formerDatePromptId, setFormerDatePromptId] = useState(null)
  const [formerDateDraft, setFormerDateDraft] = useState('')
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
    const mon = startOfWeek(now, { weekStartsOn: 0 })
    const sun = endOfWeek(now, { weekStartsOn: 0 })
    return { fromDate: format(mon, 'yyyy-MM-dd'), toDate: format(sun, 'yyyy-MM-dd'), title: '', content: '' }
  })
  const btbWeekStart = useMemo(() => {
    const d = btbForm.fromDate ? new Date(btbForm.fromDate + 'T12:00:00') : new Date()
    return startOfWeek(d, { weekStartsOn: 0 })
  }, [btbForm.fromDate])
  const btbWeekEnd = useMemo(() => endOfWeek(btbWeekStart, { weekStartsOn: 0 }), [btbWeekStart])
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
  // Inline Sunday Worship attendance toggle (Visitor Entry table): which Sunday's
  // report the column reflects/writes to, and the set of lowercased names already
  // present in that Sunday's report (nonCell + every cell's sundayCellAttendance
  // combined) — drives each row's Attended/not badge. Must always be a Sunday —
  // this date is the doc ID of the sunday_reports report being read/written.
  const [visitorAttendanceDate, setVisitorAttendanceDate] = useState(() => upcomingSunday())
  const [visitorAttendanceDateWarning, setVisitorAttendanceDateWarning] = useState(false)
  const [sundayAttendanceNames, setSundayAttendanceNames] = useState(new Set())
  const [loadingSundayAttendanceNames, setLoadingSundayAttendanceNames] = useState(false)
  const [togglingVisitorName, setTogglingVisitorName] = useState(null)
  // All active cell members across every cell, for the toggle's routing: a person
  // already in a cell gets checked into that cell's Sunday attendance; everyone
  // else gets checked into Non Cell.
  const [visitorAttendanceCellMembers, setVisitorAttendanceCellMembers] = useState([])
  const [delightVisitorModalOpen, setDelightVisitorModalOpen] = useState(false)
  const [editingDelightVisitorId, setEditingDelightVisitorId] = useState(null)
  const [_importingVisitors, setImportingVisitors] = useState(false)
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
  const [pcsExpandedId, setPcsExpandedId] = useState(null)
  const [collapsedPCSYears, setCollapsedPCSYears] = useState(() => new Set())
  const [pcsYearTileOpen, setPcsYearTileOpen] = useState(false)
  const [pcsExpandedVisitor, setPcsExpandedVisitor] = useState(null)
  const [pcsExpandedProfile, setPcsExpandedProfile] = useState(null)
  const [pcsExpandedContext, setPcsExpandedContext] = useState(null)
  const [pcsExpandedLoading, setPcsExpandedLoading] = useState(false)
  const [pcsExpandedForm, setPcsExpandedForm] = useState({})
  const [pcsPhotoFile, setPcsPhotoFile] = useState(null)
  const [pcsPhotoPreview, setPcsPhotoPreview] = useState(null)
  const [pcsCellReferralTasks, setPcsCellReferralTasks] = useState([])
  const [pcsSearchQuery, setPcsSearchQuery] = useState('')
  const [sundayAttendanceWeeks, setSundayAttendanceWeeks] = useState([])
  // cellId → recent cell reports (attendee-name sets), fetched only for cells
  // that have a Cell Only PCS member — drives their Cell Health badge.
  const [pcsCellReportsByCellId, setPcsCellReportsByCellId] = useState(() => new Map())
  const [rkChildrenForPCS, setRkChildrenForPCS] = useState([])
  const [pcsShowFormer, setPcsShowFormer] = useState(false)
  const [pcsFormDirty, setPcsFormDirty] = useState(false)
  const pcsSavedRef = useRef(null)
  const [pcsInviteStatus, setPcsInviteStatus] = useState({})
  const [pcsEditingId, setPcsEditingId] = useState(null)
  const [pendingFillInvitations, setPendingFillInvitations] = useState([])
  const [fillInviteOpen, setFillInviteOpen] = useState(null)
  const [fillInviteForm, setFillInviteForm] = useState({})
  const [fillInviteBaseline, setFillInviteBaseline] = useState({})
  const [fillInviteLoading, setFillInviteLoading] = useState(false)
  const [fillInviteSaving, setFillInviteSaving] = useState(false)
  const [fillShowAllFields, setFillShowAllFields] = useState(false)

  // Below 768px the PCS profile opens as a full-screen slide-in panel over the
  // list (with a ← Back button) instead of expanding inline under the card.
  const [pcsIsMobile, setPcsIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const update = () => setPcsIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // Membership pipeline updates from the tracker/widget: patch the local PCS list
  // (pipeline via fn, plus any plain entry fields) so the UI follows without a reload.
  const onPipelineChanged = useCallback((id, fn, patch) => {
    setPcsEntries(prev => prev.map(e => e.id !== id ? e : {
      ...e,
      ...(fn ? { membershipPipeline: fn(e.membershipPipeline || {}) } : {}),
      ...(patch || {}),
    }))
  }, [])

  const closePcsProfile = useCallback(() => {
    setPcsExpandedId(null); setPcsExpandedVisitor(null); setPcsExpandedProfile(null); setPcsExpandedContext(null); setPcsExpandedForm({})
    setPcsPhotoFile(null); setPcsPhotoPreview(null)
    setPcsEditingId(null)
  }, [])

  // Desktop inline profile: a click anywhere outside it collapses it. "Inside" is
  // judged on the React tree (pcsProfileClickInsideRef, set by the wrapper's capture
  // handler) so clicks in the profile's own portalled modals still count as inside.
  // Also ignored: member cards (their own click opens/switches/toggles), any open
  // dialog/overlay (e.g. the Discard confirmation), and an edit with unsaved changes.
  const pcsProfileClickInsideRef = useRef(false)
  useEffect(() => {
    if (!pcsExpandedId || pcsIsMobile) return
    const onPointerDown = (e) => {
      const inside = pcsProfileClickInsideRef.current
      pcsProfileClickInsideRef.current = false
      if (inside) return
      const t = e.target
      if (t instanceof Element && t.closest('[id^="pcs-entry-"], [role="dialog"], [aria-modal="true"], .fixed')) return
      if (pcsEditingId && pcsFormDirty) return
      closePcsProfile()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [pcsExpandedId, pcsIsMobile, pcsEditingId, pcsFormDirty, closePcsProfile])

  // Mobile: the open profile panel owns one history entry, so the phone's
  // hardware/gesture Back closes the panel instead of leaving the page.
  const pcsMobilePanelOpen = pcsIsMobile && !!pcsExpandedId && slug === 'caring' && activeTab === 'pcs' && !pcsShowFormer
  useEffect(() => {
    if (!pcsMobilePanelOpen) return
    window.history.pushState({ ...(window.history.state || {}), pcsProfilePanel: true }, '')
    const onPop = () => closePcsProfile()
    window.addEventListener('popstate', onPop)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('popstate', onPop)
      document.body.style.overflow = prevOverflow
      // Closed by the ← button (not by Back) — drop the history entry we pushed.
      if (window.history.state?.pcsProfilePanel) window.history.back()
    }
  }, [pcsMobilePanelOpen, closePcsProfile])

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
        isFirstChurch: deriveIsFirstChurch(profile),
        previousChurchName: profile.previousChurchName || '', previousChurchPlace: profile.previousChurchPlace || '',
        maritalStatus: profile.maritalStatus || '', marriageDate: profile.marriageDate || '', spouseName: profile.spouseName || '',
        hasKids: profile.hasKids || '', children: profile.children || [],
      } : empty
      setFillInviteForm(merged)
      setFillInviteBaseline(merged)
    } catch { /* keep the empty form — cell leader can still fill from scratch */ }
    setFillInviteLoading(false)
  }

  // Deep-link from the notification bell's "Tap to fill" and the To-Do List: auto-open
  // the Fill Profile modal for the invitation id passed in via ?openFillInvite=, then
  // strip it from the URL so it doesn't re-trigger on refresh/back-navigation. Fetches
  // the invitation directly by id rather than matching it against pendingFillInvitations
  // (scoped to the *viewer's own* cellId) — the underlying To-Do task is tagged
  // department: 'Cell', so a Director or Founder can click it too even though they have
  // no cellId of their own, and the cell-scoped list would never contain it for them.
  // ?pcsSearch=<name> — e.g. from My Workspace's Membership Onboarding Pipeline:
  // opens Caring → PCS filtered to that person, then strips the param.
  const pcsSearchParam = searchParams.get('pcsSearch')
  useEffect(() => {
    if (!pcsSearchParam || slug !== 'caring') return
    setPcsSearchQuery(pcsSearchParam)
    const next = new URLSearchParams(searchParams)
    next.delete('pcsSearch')
    setSearchParams(next, { replace: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pcsSearchParam, slug])

  const openFillInviteId = searchParams.get('openFillInvite') || null
  useEffect(() => {
    if (!openFillInviteId || slug !== 'cell') return
    let cancelled = false
    getPCSFillInvitationById(openFillInviteId)
      .then((inv) => { if (!cancelled && inv) openFillInviteModal(inv) })
      .catch(() => {})
    const next = new URLSearchParams(searchParams)
    next.delete('openFillInvite')
    setSearchParams(next, { replace: true })
    return () => { cancelled = true }
  }, [openFillInviteId, slug])

  const [cellReferralTasks, setCellReferralTasks] = useState([])

  const [pcsAddNotifications, setPcsAddNotifications] = useState([])

  const [pcsFormerForRec, setPcsFormerForRec] = useState([])       // removed PCS entries — never re-recommended
  // Latest membership application of the open PCS profile — its status shows in the
  // profile's Membership section ("Membership Application: Under Review").
  const [pcsMembershipApp, setPcsMembershipApp] = useState(null)
  useEffect(() => {
    setPcsMembershipApp(null)
    if (slug !== 'caring' || !pcsExpandedId) return
    return subscribeMembershipApplicationsForEntry(pcsExpandedId, (apps) => setPcsMembershipApp(apps[0] || null), () => setPcsMembershipApp(null))
  }, [slug, pcsExpandedId])
  // Submitted digital forms for the open PCS profile + Caring events (for their status)
  const [pcsEntryApps, setPcsEntryApps] = useState({})
  const [pcsCaringEvents, setPcsCaringEvents] = useState([])
  useEffect(() => {
    setPcsEntryApps({})
    if (!pcsExpandedId) return
    const unsubs = APPLICATION_TYPE_KEYS.map(type => subscribeApplicationsForEntry(type, pcsExpandedId,
      list => setPcsEntryApps(prev => ({ ...prev, [type]: list })), () => setPcsEntryApps(prev => ({ ...prev, [type]: [] }))))
    return () => unsubs.forEach(u => u())
  }, [pcsExpandedId])
  useEffect(() => {
    if (slug !== 'caring' || activeTab !== 'pcs') return
    return subscribeCaringEvents(setPcsCaringEvents, () => setPcsCaringEvents([]))
  }, [slug, activeTab])

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

  // Deep-link from the To-Do List (ToDoListCard.jsx's taskDeepLink): once the shared
  // `tasks` list has loaded, auto-open the same "Recommendation for [Name]" modal used
  // for D-Light consults, but targeting the "Add [Name] to a cell group" referral task
  // itself (task id passed in via ?openPcsReferralTaskId=) — submitting it writes
  // recommendation/recommendedCellId/status:'Responded' straight onto that same task,
  // which CellDirectorCockpit's Unassigned drawer reads directly (see its pcsReferrals
  // mapping), no separate consult task needed. The modal is a page-level overlay (not
  // gated by activeTab), so this works the same for a Cell Leader or a Director — it
  // never depends on which cell tab the viewer is normally allowed to see. Strips the
  // param from the URL after so it doesn't re-trigger on refresh/back-navigation.
  const openPcsReferralTaskId = searchParams.get('openPcsReferralTaskId') || null
  useEffect(() => {
    if (!openPcsReferralTaskId || slug !== 'cell' || tasks.length === 0) return
    const t = tasks.find((x) => x.id === openPcsReferralTaskId && x.pcsReferral === true && x.memberId)
    if (t) {
      setDlightConsultTarget({ ...t, consultPersonName: t.pcsPersonName || t.memberName || '' })
      setDlightConsultReply(t.recommendation || '')
      setDlightConsultCellId(t.recommendedCellId || '')
    }
    const next = new URLSearchParams(searchParams)
    next.delete('openPcsReferralTaskId')
    setSearchParams(next, { replace: true })
  }, [openPcsReferralTaskId, slug, tasks])

  // Deep-link from the To-Do List (ToDoListCard.jsx's taskDeepLink): once the shared
  // `tasks` subscription has loaded, auto-expand "Forwarded from PCS" and scroll to the
  // specific referral row for the task id passed in via ?openPcsForwardTaskId=, instead
  // of just landing on the general Visitor Entry tab with that section collapsed. Strips
  // the param from the URL after so it doesn't re-trigger on refresh/back-navigation.
  const openPcsForwardTaskId = searchParams.get('openPcsForwardTaskId') || null
  useEffect(() => {
    if (!openPcsForwardTaskId || slug !== 'd-light' || tasks.length === 0) return
    const t = tasks.find((x) => x.id === openPcsForwardTaskId && x.pcsReferral === true)
    if (t) {
      setPcsForwardOpen(true)
      setTimeout(() => {
        document.getElementById(`pcs-forward-${t.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 150)
    }
    const next = new URLSearchParams(searchParams)
    next.delete('openPcsForwardTaskId')
    setSearchParams(next, { replace: true })
  }, [openPcsForwardTaskId, slug, tasks])

  // Deep-link from the notification bell's "Tap to review" on a visitor_proposal
  // (useActionNotifications.js): once the live cellVisitorProposals listener has loaded,
  // auto-expand "Visitors from Cell Reports" and scroll to the specific proposal row for
  // the id passed in via ?openVisitorProposalId=, instead of landing on the general
  // Visitor Entry tab with that section collapsed. Strips the param after.
  const openVisitorProposalId = searchParams.get('openVisitorProposalId') || null
  useEffect(() => {
    if (!openVisitorProposalId || slug !== 'd-light' || cellVisitorProposals.length === 0) return
    const p = cellVisitorProposals.find((x) => x.id === openVisitorProposalId)
    if (p) {
      setCellVisitorProposalOpen(true)
      setTimeout(() => {
        document.getElementById(`cell-visitor-proposal-${p.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 150)
    }
    const next = new URLSearchParams(searchParams)
    next.delete('openVisitorProposalId')
    setSearchParams(next, { replace: true })
  }, [openVisitorProposalId, slug, cellVisitorProposals])

  // These four deep-link effects (openConsultId, openPcsReferralTaskId,
  // openPcsForwardTaskId, openVisitorProposalId) each wait on some already-loaded list
  // before they can resolve and strip their own query param — but `useEffect` only runs
  // *after* the browser paints, so there's one real render (and one real paint) where
  // `loading` has already flipped false but the effect hasn't fired yet. Without this,
  // that single frame shows the full hub dashboard/tab underneath — a visible flash of
  // "the general Cell/D-Light overview" before the target modal/row ever appears. Keep
  // showing the loading state for as long as one of these params is still in the URL —
  // every one of them unconditionally strips its own param once it runs (match or not),
  // so this can never get stuck. Scoped to the matching slug too — each effect's own
  // slug guard is what strips the param, so on any other slug it would never resolve.
  const hasPendingDeepLink =
    (slug === 'd-light' && !!(openConsultId || openPcsForwardTaskId || openVisitorProposalId)) ||
    (slug === 'cell' && !!openPcsReferralTaskId)

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
    onlyVisit: false,
  })
  const [dlightSubDepts, setDlightSubDepts] = useState([])
  // D Light – Assign tab (persisted assignments). Each duty maps to an ARRAY of
  // team member ids — a duty can have multiple assignees, not just one.
  const [delightAssignments, setDelightAssignments] = useState(() => blankDlightAssignments())
  // MemberPicker trigger-button DOM nodes for each duty, keyed by row key — lets
  // the "+ Add {role}" text link under the role name open that row's picker (a
  // real .click()) instead of duplicating the add-assignee logic.
  const delightAssignTriggerRefs = useRef({})
  const [loadingDelightAssignments, setLoadingDelightAssignments] = useState(false)
  const [savingDelightAssignments, setSavingDelightAssignments] = useState(false)
  const [delightAssignmentsBefore, setDelightAssignmentsBefore] = useState(null)
  // Which Sunday's duty roster the Assign tab is viewing/editing — assignments are
  // stored one doc per service date (dlight_assignments/{serviceDate}), not a single
  // undated doc, so switching dates loads/saves an entirely separate roster.
  const [delightAssignDate, setDelightAssignDate] = useState(() => upcomingSunday())
  const [delightAssignDateWarning, setDelightAssignDateWarning] = useState(false)
  // D Light Assign tab: read-only by default (plain tag chips, no dropdowns/+Add/×)
  // — same lifecycle as Worship's isEditing — flips true only via "Edit Plan", and
  // back to false once "Save plan" (or "Cancel") is clicked. See the effect that
  // loads delightAssignments for the reset-on-date-change half of this.
  const [dlightAssignEditing, setDlightAssignEditing] = useState(false)
  // "Copy as Image" — captures a dedicated off-screen branded render (built below
  // the on-screen table, not the interactive table itself) and copies it to the
  // clipboard, falling back to a JPEG download when Clipboard image writes aren't
  // supported (most mobile browsers) — see handleDlightSharePlan.
  const dlightAssignShareRef = useRef(null)
  const [dlightSharingPlan, setDlightSharingPlan] = useState(false)
  const [dlightShareToast, setDlightShareToast] = useState(null)
  // Save-plan error banner — replaces a bare window.alert() so a permission-denied
  // (or any other) save failure reads as an in-page toast, not a browser popover.
  const [dlightAssignError, setDlightAssignError] = useState(null)
  // D Light – Archives tab: every past Sunday's saved duty roster (newest first),
  // each expandable to show that week's assignments plus the visitors logged that day.
  const [dlightArchives, setDlightArchives] = useState([])
  const [loadingDlightArchives, setLoadingDlightArchives] = useState(false)
  const [openDlightArchiveIds, setOpenDlightArchiveIds] = useState({})
  // Media – Assign tab (per-Sunday crew, media_schedule collection)
  const [mediaAssignDate, setMediaAssignDate] = useState(() => {
    const today = new Date(); const day = today.getDay()
    const next = new Date(today); next.setDate(today.getDate() + (day === 0 ? 0 : 7 - day))
    return format(next, 'yyyy-MM-dd')
  })
  const [mediaAssignRows, setMediaAssignRows] = useState([])
  const [loadingMediaSchedule, setLoadingMediaSchedule] = useState(false)
  const [mediaAssignEditing, setMediaAssignEditing] = useState(false)
  const [mediaAssignSaving, setMediaAssignSaving] = useState(false)
  // Last-saved snapshot for this date, used only to restore the form when "Cancel"
  // is clicked mid-edit — the card itself never collapses into a summary (matches
  // D-Light/Worship: full roster stays visible and readable, view-only rows just
  // hide the +Add/×/picker controls).
  const [mediaAssignStamp, setMediaAssignStamp] = useState(null)
  // "Copy / Export JPEG" — same approach as handleDlightSharePlan: captures a
  // dedicated off-screen branded render, copies it to the clipboard, and falls
  // back to a JPEG download when Clipboard image writes aren't supported.
  const mediaAssignShareRef = useRef(null)
  const [mediaSharingPlan, setMediaSharingPlan] = useState(false)
  const [mediaShareToast, setMediaShareToast] = useState(null)
  // Lets the desktop table's "+ Add {role}" link under the role name open that
  // row's MemberPicker (a real .click()) — same convention as delightAssignTriggerRefs.
  const mediaAssignTriggerRefs = useRef({})
  // Media – Hub insights
  const [mediaSchedules, setMediaSchedules] = useState([])
  const [mediaExpenseEntries, setMediaExpenseEntries] = useState([])
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
  const [subDeptReordering, setSubDeptReordering] = useState(false)
  // Up/Down arrows on the generic sub-department lists: swap with the
  // neighbour, then persist the whole list's `order` (reorderDepartmentSubDepartments)
  // so Assign tabs (e.g. Sunday Ministry's Weekly Crew) list rows in this order.
  const moveSubDepartment = async (id, delta) => {
    const from = subDepartments.findIndex((sd) => sd.id === id)
    const to = from + delta
    if (from < 0 || to < 0 || to >= subDepartments.length || subDeptReordering) return
    const before = subDepartments
    const next = [...subDepartments]
    ;[next[from], next[to]] = [next[to], next[from]]
    const reordered = next.map((sd, index) => ({ ...sd, order: index }))
    setSubDepartments(reordered)
    setSubDeptReordering(true)
    try {
      await reorderDepartmentSubDepartments(reordered.map((sd) => sd.id))
      setSubDeptError('')
    } catch (err) {
      console.error('Failed to reorder sub-departments', err)
      setSubDepartments(before)
      setSubDeptError(err?.code === 'permission-denied' ? "You don't have permission to reorder sub-departments." : 'Could not save the new order.')
    } finally {
      setSubDeptReordering(false)
    }
  }
  const [subDeptForm, setSubDeptForm] = useState({ name: '', servingArea: '', category: '' })
  const [editingSubDept, setEditingSubDept] = useState(null)
  const [genericSubDeptModalOpen, setGenericSubDeptModalOpen] = useState(false)
  const [subDeptActionsMenuId, setSubDeptActionsMenuId] = useState(null)
  // Which category the River Kids Sub Department tab's left nav pane has selected —
  // only that one category's items render on the right, instead of every category
  // (plus an "Other" bucket) all stacked on screen at once.
  const [rkSubDeptCategoryTab, setRkSubDeptCategoryTab] = useState('sunday-school')
  // Media's "The Team" tab hosts sub-department management inline (collapsible).
  const [mediaSubDeptPanelOpen, setMediaSubDeptPanelOpen] = useState(true)
  const [dlightTeamSubOpts, setDlightTeamSubOpts] = useState([])
  // Assign / Archives / shared-image duty rows, following the live sub-department list.
  const dlightAssignRows = useMemo(() => buildDlightAssignRows(dlightTeamSubOpts), [dlightTeamSubOpts])
  // Team tab's own "+ Add Sub Department" header button (D-Light + Media) — a
  // single create/edit/delete modal that writes straight to whichever sub-dept
  // collection this slug uses (dlightTeamSubOpts for D-Light, subDepartments for
  // Media), so the Add/Edit Member form's Sub-Department pills refresh immediately
  // without navigating to a separate Sub Dept tab.
  const [teamSubDeptModalOpen, setTeamSubDeptModalOpen] = useState(false)
  const [teamSubDeptSaving, setTeamSubDeptSaving] = useState(false)
  const [teamSubDeptNewDraft, setTeamSubDeptNewDraft] = useState({ name: '', servingArea: '' })
  const [teamSubDeptEditingId, setTeamSubDeptEditingId] = useState(null)
  const [teamSubDeptEditDraft, setTeamSubDeptEditDraft] = useState({ name: '', servingArea: '' })

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
    } else if (isFounder && !tabFromUrl) {
      // Founder always lands on the department's Summary (hub) from a bare
      // department link, even where staff get a different default (D-Light → Team).
      setActiveTab('summary')
    } else if (slug === 'media' && tabFromUrl === 'operations') {
      // Operations (and its only child, Planning) was removed from Media — a stale
      // link/bookmark to ?tab=operations lands on Assign instead of falling all the
      // way back to the Hub like a truly unrecognized tab would.
      setActiveTab('assign')
    } else if (slug === 'd-light' && (tabFromUrl === 'operations' || !tabFromUrl)) {
      // Operations was removed from D-Light the same way — Team (its only
      // remaining child) is now the default landing tab: a stale ?tab=operations
      // link, and a bare `/department/d-light` (no ?tab= at all, how the
      // department dock/list itself links in) both land there instead of Summary.
      // A stale ?opsSub=subDepartment on that old link goes one step further and
      // opens the Team tab's own Sub-Department modal directly, same as before.
      if (searchParams.get('opsSub') === 'subDepartment') {
        setTeamSubDeptEditingId(null)
        setTeamSubDeptNewDraft({ name: '', servingArea: '' })
        setTeamSubDeptModalOpen(true)
      }
      setActiveTab('team')
    } else {
      setActiveTab('summary')
    }
  }, [slug, tabFromUrl, userProfile, isFounder])

  // Operations' sub-view used to be an inline toggle strip (CellOperationsToggle,
  // SundayOperationsToggle, etc.) the user clicked; it's now a nested grid inside the
  // dock's folder modal (DepartmentFolderModal), so the same choice comes in via
  // ?opsSub= instead. Falls back to 'team' whenever the tab isn't Operations or the
  // param is missing/stale. D-Light no longer has an Operations tab at all (see the
  // tab-selection effect above, which redirects any ?tab=operations straight to the
  // top-level Team tab instead), so activeTab can never actually be 'operations' for
  // that slug any more — this effect is exclusively the other departments' now.
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

  // Accounts' Income and Expense tabs share one active month via a `?month=YYYY-MM`
  // query param so switching tabs (or reloading, or opening a shared link) keeps the
  // same month on both. The `entry/*` route has its own separate picker on EntryPage.
  const accountsMonthParam = searchParams.get('month')
  const accountsMonth = useMemo(() => {
    const m = /^(\d{4})-(\d{2})$/.exec(accountsMonthParam || '')
    if (m) return startOfMonth(new Date(Number(m[1]), Number(m[2]) - 1, 1))
    return startOfMonth(new Date())
  }, [accountsMonthParam])
  const setAccountsMonth = useCallback((date) => {
    const value = format(date, 'yyyy-MM')
    const next = new URLSearchParams(searchParams)
    next.set('month', value)
    setSearchParams(next, { replace: true })
    try { sessionStorage.setItem('accountsMonth', value) } catch { /* private mode */ }
  }, [searchParams, setSearchParams])
  // A nav <Link> into the Income/Expense tab (built by getDepartmentSubpages) carries
  // only `?tab=`, dropping `month`. Restore it from the last-picked value so the month
  // stays put when you come back via the department nav bar.
  useEffect(() => {
    if (slug !== 'accounts') return
    if (activeTab !== 'income' && activeTab !== 'expense' && activeTab !== 'tally') return
    if (accountsMonthParam) return
    let remembered = null
    try { remembered = sessionStorage.getItem('accountsMonth') } catch { /* ignore */ }
    if (!remembered || !/^\d{4}-\d{2}$/.test(remembered)) return
    const next = new URLSearchParams(searchParams)
    next.set('month', remembered)
    setSearchParams(next, { replace: true })
  }, [slug, activeTab, accountsMonthParam, searchParams, setSearchParams])

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
      (slug === 'media' && (activeTab === 'assign' || activeTab === 'summary')) ||
      ((slug === 'sunday-ministry' || slug === 'media' || slug === 'river-kids' || slug === 'administration' || slug === 'accounts' || slug === 'caring' || slug === 'd-light') && activeTab === 'operations' && (opsSubTab === 'team' || opsSubTab === 'subDepartment'))
    if (!wantsSubOrTeam) return
    setSubDeptLoading(true)
    getDepartmentSubDepartments(department.name)
      .then(async (list) => {
        setSubDeptError('')
        // River Kids' Sub Department tab dropped its "Other" catch-all bucket entirely
        // — these are the flat rows seeded before the `category` field existed
        // (literally named "Sunday School"/"River Kids-1"/"River Kids-2", duplicating
        // the category headers themselves), now unreachable in that UI. Best-effort
        // one-time cleanup via whichever admin session next loads this tab, using the
        // same deleteDepartmentSubDepartment call the row-level Delete action already
        // uses — a viewer without delete permission just leaves them (harmless, since
        // there's no view left that would ever show them).
        if (slug === 'river-kids') {
          const knownKeys = new Set(RK_CLASS_GROUPS.map((c) => c.key))
          const stray = list.filter((sd) => !knownKeys.has(sd.category))
          if (stray.length) {
            const deletedIds = new Set()
            await Promise.all(stray.map((sd) =>
              deleteDepartmentSubDepartment(sd.id).then(() => deletedIds.add(sd.id)).catch(() => {})
            ))
            setSubDepartments(list.filter((sd) => !deletedIds.has(sd.id)))
            return
          }
        }
        setSubDepartments(list)
      })
      .catch(() => {
        setSubDepartments([])
        setSubDeptError('Could not load sub-departments.')
      })
      .finally(() => setSubDeptLoading(false))
  }, [department, slug, activeTab, opsSubTab])

  // Media "The Team" tab: expand the inline Sub-Departments panel when there are
  // none to set up, collapse it once some exist. Runs once per load (keyed on the
  // loading edge) so it never fights the user's manual toggle.
  useEffect(() => {
    if (slug === 'media' && !subDeptLoading) {
      setMediaSubDeptPanelOpen(subDepartments.length === 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, subDeptLoading])

  // "The Team" tab's Add/Edit Member form is an inline section below the roster
  // table (not a modal) — scroll it into view once it opens, whether via "+ Add
  // member" or an "Edit" click. The timeout lets the slide-open motion.div mount
  // (and the table above settle) before measuring its position.
  useEffect(() => {
    if (!showAddMemberModal && !editingMember) return
    const t = setTimeout(() => {
      addMemberSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
    return () => clearTimeout(t)
  }, [showAddMemberModal, editingMember])

  useEffect(() => {
    // Assign and Archives both resolve team-member ids to names, so they need the
    // roster loaded too — without it Assign renders its "add team members first"
    // empty state even when the department has a full team.
    const wantsDlightTeam = slug === 'd-light' && (
      activeTab === 'team' ||
      (activeTab === 'operations' && opsSubTab === 'team') ||
      activeTab === 'summary' ||
      activeTab === 'assign' ||
      activeTab === 'archives'
    )
    if (!wantsDlightTeam) {
      setDlightTeamSubOpts([])
      return
    }
    // Live: sub-departments created / edited / deleted in the Sub-Departments modal
    // (here or on another device) update the Assign tab's duty rows straight away.
    const unsubSubDepts = subscribeDlightSubDepartments(
      (list) => setDlightTeamSubOpts(list.map((x) => ({ id: x.id, name: x.name || '', servingArea: x.servingArea || '', active: x.active }))),
      () => setDlightTeamSubOpts([])
    )
    // Real-time subscription so new/edited team members appear immediately
    if (department?.name) {
      setLoadingTeam(true)
      const unsub = subscribeDepartmentTeamMembers(department.name, (list) => {
        setTeam(list)
        setTeamError('')
        setLoadingTeam(false)
      })
      return () => { unsub(); unsubSubDepts() }
    }
    return unsubSubDepts
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
    // Budget items are now loaded by BudgetPage directly; nothing to do here
  }, [department, slug, activeTab, opsSubTab])

  useEffect(() => {
    const wantsPlanning = activeTab === 'planning' ||
      // Media and D-Light have no Planning child in Operations (removed as
      // redundant/unused), so both are deliberately absent here — opsSubTab
      // never reaches 'planning' for either via normal navigation.
      ((slug === 'cell' || slug === 'sunday-ministry' || slug === 'river-kids' || slug === 'administration' || slug === 'accounts' || slug === 'caring') && activeTab === 'operations' && opsSubTab === 'planning')
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

  useEffect(() => {
    if (slug !== 'd-light' || activeTab !== 'visitorEntry') return
    getAllCellGroupMembers().then(setVisitorAttendanceCellMembers).catch(() => setVisitorAttendanceCellMembers([]))
  }, [slug, activeTab])

  // Names already present in visitorAttendanceDate's Sunday report — nonCell plus
  // every cell's sundayCellAttendance combined — drives each row's inline
  // Attended/not toggle state. Refetched whenever the selected Sunday changes.
  useEffect(() => {
    if (slug !== 'd-light' || activeTab !== 'visitorEntry') return
    setLoadingSundayAttendanceNames(true)
    getSundayReport(visitorAttendanceDate)
      .then((report) => {
        const names = new Set()
        ;(report?.nonCell || []).forEach((n) => names.add(String(n).trim().toLowerCase()))
        Object.values(report?.sundayCellAttendance || {}).forEach((list) => {
          (list || []).forEach((n) => names.add(String(n).trim().toLowerCase()))
        })
        setSundayAttendanceNames(names)
      })
      .catch(() => setSundayAttendanceNames(new Set()))
      .finally(() => setLoadingSundayAttendanceNames(false))
  }, [slug, activeTab, visitorAttendanceDate])

  // Inline toggle in the Visitor Entry table — writes/removes the name straight in
  // the Sunday Ministry Report for visitorAttendanceDate: into their own cell's
  // roster if they're an active cell member, otherwise into Non Cell. Optimistic,
  // reverted on failure so a failed write doesn't look like a successful one.
  const toggleVisitorSundayAttendance = async (visitor) => {
    const trimmedName = String(visitor.name || '').trim()
    if (!trimmedName) return
    const norm = trimmedName.toLowerCase()
    const wasPresent = sundayAttendanceNames.has(norm)
    setTogglingVisitorName(norm)
    setSundayAttendanceNames((prev) => {
      const next = new Set(prev)
      if (wasPresent) next.delete(norm)
      else next.add(norm)
      return next
    })
    try {
      const updatedBy = userProfile?.email || userProfile?.displayName || 'unknown'
      const current = await getSundayReport(visitorAttendanceDate)
      const membership = visitorAttendanceCellMembers.find((m) =>
        m.status !== 'inactive' && String(m.name || '').trim().toLowerCase() === norm
      )
      const applyNext = (existing) => wasPresent
        ? existing.filter((n) => String(n).trim().toLowerCase() !== norm)
        : (existing.some((n) => String(n).trim().toLowerCase() === norm) ? existing : [...existing, trimmedName])

      if (membership) {
        const next = applyNext(current?.sundayCellAttendance?.[membership.cellId] || [])
        await patchSundayReportCellAttendance(visitorAttendanceDate, membership.cellId, next, updatedBy)
      } else {
        const next = applyNext(current?.nonCell || [])
        await patchSundayReportNameField(visitorAttendanceDate, 'nonCell', next, updatedBy)
      }
    } catch (err) {
      console.error('Failed to toggle Sunday attendance', trimmedName, err)
      setSundayAttendanceNames((prev) => {
        const next = new Set(prev)
        if (wasPresent) next.add(norm)
        else next.delete(norm)
        return next
      })
      alert('Failed to update attendance — please try again.')
    }
    setTogglingVisitorName(null)
  }

  // Backs the "Add Member" person picker on every department's Team tab.
  //
  // Two problems this fixes, both of which showed up as "I can't find this person to
  // add them to my team":
  //
  //  1. It read delight_visitors directly, which firestore.rules only allowed for an
  //     allow-list of departments. Every other Director got permission-denied, and the
  //     `.catch(() => [])` turned that into a silently empty picker with no error to
  //     report. The rule is now open to any signed-in user, and the catch logs.
  //  2. Even when the read succeeded, D-Light visitor entries are only ONE of the
  //     places a church member exists — plenty of people only ever appear as a cell
  //     member, a PCS entry, or a `people` record. Those were unfindable here. Reading
  //     the merged directory instead means every person in the church is searchable,
  //     unfiltered, which is what this picker is supposed to offer.
  //
  // The merged entries carry `_key`/`personId`/`_visitorIds` and never a plain `.id`
  // (see getMergedPeopleDirectory), so they're normalized to the `{id, name, phone}`
  // shape this picker writes as `visitorId`. `id` prefers the real D-Light visitor doc
  // id when the person has one, so existing visitorId-keyed lookups elsewhere keep
  // resolving exactly as before; people with no visitor record fall back to their
  // personId rather than being dropped from the search.
  useEffect(() => {
    const isTeamSection = activeTab === 'team' || (activeTab === 'operations' && opsSubTab === 'team')
    if (!isTeamSection) return
    setTeamVisitorsLoading(true)
    Promise.all([
      getMergedPeopleDirectory(),
      // River Kids children, so a child from the registry can be recruited onto
      // any department's team (selectable alongside adult records but carrying
      // source:'river_kids' + childId instead of a visitorId). Two sources, in
      // preference order:
      //   1. river_kids_lookup — a name-only index any signed-in user may read.
      //   2. department_children directly — works for Founder / River Kids /
      //      Sunday Ministry / Cell roles even if the lookup index is empty
      //      (e.g. never backfilled), so the feature isn't dead until someone
      //      opens the River Kids register tab.
      // A loud catch on each: a permission-denied here silently emptied the
      // picker before.
      getRiverKidsLookup().catch((e) => { console.error('river_kids_lookup read failed', e); return [] }),
      getDepartmentChildren('River Kids').catch((e) => { console.warn('department_children (River Kids) read not permitted for this user; relying on river_kids_lookup', e?.code || e); return [] }),
    ])
      .then(([{ people }, rkLookup, rkChildren]) => {
        const seen = new Set()
        const options = []
        for (const p of people || []) {
          const name = String(p.name || '').trim()
          const id = (p._visitorIds && p._visitorIds[0]) || p.personId || p._key
          if (!name || !id || seen.has(id)) continue
          seen.add(id)
          options.push({ id, name, phone: p.phone || '' })
        }
        const rkSeen = new Set()
        const addChild = (childId, name) => {
          const n = String(name || '').trim()
          if (!childId || !n || rkSeen.has(childId)) return
          rkSeen.add(childId)
          options.push({ id: 'rk-' + childId, childId, name: n, phone: '', source: 'river_kids' })
        }
        for (const c of rkLookup || []) addChild(c.id, c.name)
        for (const c of rkChildren || []) { if (c.active !== false) addChild(c.id, c.name) }
        options.sort((a, b) => a.name.localeCompare(b.name))
        setTeamVisitors(options)
      })
      .catch((err) => {
        console.error('Failed to load the people list for the Team tab\'s Add Member search — the picker will appear empty.', err)
        setTeamVisitors([])
      })
      .finally(() => setTeamVisitorsLoading(false))
  }, [slug, activeTab, opsSubTab])

  // Media – Hub: all crew schedules, for the coverage / serving-load insights.
  useEffect(() => {
    if (slug !== 'media' || activeTab !== 'summary') return
    getMediaSchedules()
      .then(setMediaSchedules)
      .catch((err) => { console.error('Failed to load media schedules for the Hub', err); setMediaSchedules([]) })
  }, [slug, activeTab])

  // Media – Assign tab: load the per-Sunday crew schedule.
  useEffect(() => {
    if (slug !== 'media' || activeTab !== 'assign') return
    setLoadingMediaSchedule(true)
    getMediaScheduleByDate(mediaAssignDate)
      .then((doc) => {
        // Each Sunday's assignments are stored flat — one {subDeptId, role, memberId,
        // memberName} entry per assigned person — so a role with several crew members
        // just has several entries sharing the same subDeptId. Group them back into
        // one row per sub-department with a `members` array for the UI.
        const saved = Array.isArray(doc?.assignments) ? doc.assignments : []
        const bySubDept = {}
        saved.forEach((a) => {
          if (!a.memberId) return
          const key = a.subDeptId ? 'id:' + a.subDeptId : 'role:' + a.role
          if (!bySubDept[key]) bySubDept[key] = []
          bySubDept[key].push({ id: a.memberId, name: a.memberName || '' })
        })
        const rows = subDepartments.map((sd) => ({
          subDeptId: sd.id,
          role: sd.name,
          members: bySubDept['id:' + sd.id] || bySubDept['role:' + sd.name] || [],
        }))
        setMediaAssignRows(rows)
        setMediaAssignStamp(rows.some((x) => x.members.length) ? { date: doc?.date || mediaAssignDate, rows } : null)
        setMediaAssignEditing(false)
      })
      .catch((err) => {
        console.error('Failed to load media schedule', err)
        setMediaAssignRows(subDepartments.map((sd) => ({ subDeptId: sd.id, role: sd.name, members: [] })))
        setMediaAssignStamp(null)
      })
      .finally(() => setLoadingMediaSchedule(false))
  }, [slug, activeTab, mediaAssignDate, subDepartments])

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
      setDlightAssignEditing(false)
      getDlightAssignmentsForDate(delightAssignDate)
        .then((doc) => {
          const rawAssignments = doc?.assignments && typeof doc.assignments === 'object' ? doc.assignments : null
          // Normalize each duty to an array of ids — older saved docs (or a doc
          // saved before multi-assignee support) may still hold a single id string.
          const normalized = {}
          if (rawAssignments) {
            for (const [key, val] of Object.entries(rawAssignments)) {
              normalized[key] = Array.isArray(val) ? val.filter(Boolean) : (val ? [val] : [])
            }
          }
          // Reset to blank first — otherwise switching to a date with no saved
          // roster yet would keep showing the previous date's selections.
          setDelightAssignments({ ...blankDlightAssignments(), ...normalized })
          setDelightAssignmentsBefore(rawAssignments ? normalized : null)
        })
        .catch(() => setDelightAssignmentsBefore(null))
        .finally(() => setLoadingDelightAssignments(false))
    }
  }, [slug, activeTab, delightAssignDate])

  // Archives tab — every saved Sunday roster, newest first. Refetched on each visit
  // (rather than subscribed) since it's a historical view that only changes when
  // someone saves a plan over on the Assign tab.
  useEffect(() => {
    if (slug !== 'd-light' || activeTab !== 'archives') return
    setLoadingDlightArchives(true)
    getDlightAssignmentsArchive()
      .then(setDlightArchives)
      .catch(() => setDlightArchives([]))
      .finally(() => setLoadingDlightArchives(false))
  }, [slug, activeTab])

  // Feeds DLightDirectorDashboard's subDepartments prop on the Summary tab — the
  // standalone Sub Dept page this used to also load for is gone (see the opsSub
  // effect + Team tab's own modal above), so Summary is the only trigger left.
  useEffect(() => {
    if (slug !== 'd-light' || activeTab !== 'summary' || !canEditDelightVisitors) return
    getDlightSubDepartments()
      .then(setDlightSubDepts)
      .catch(() => setDlightSubDepts([]))
  }, [slug, activeTab, canEditDelightVisitors])

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

  // Recent cell reports for every cell holding a PCS member who's expected at cell
  // (everyone except Sunday Only) — fetched once per cell (already-loaded cells are
  // skipped). Drives the Cell Only "Cell Health" badge and the 10-consecutive-cell-
  // absence check behind "Recommended for Removal".
  useEffect(() => {
    if (slug !== 'caring' || activeTab !== 'pcs') return
    const cellIds = [...new Set(pcsEntries
      .filter(e => !isSundayOnly(e))
      .map(e => findPcsCellMember(e, allCellMembers)?.cellId)
      .filter(cid => cid && !pcsCellReportsByCellId.has(cid)))]
    if (!cellIds.length) return
    let cancelled = false
    Promise.all(cellIds.map(cid => getRecentCellReportsForHeatmap(cid, CELL_HEALTH_REPORT_COUNT).catch(() => [])))
      .then(results => {
        if (cancelled) return
        setPcsCellReportsByCellId(prev => {
          const next = new Map(prev)
          cellIds.forEach((cid, i) => next.set(cid, results[i]))
          return next
        })
      })
    return () => { cancelled = true }
  }, [slug, activeTab, pcsEntries, allCellMembers, pcsCellReportsByCellId])

  // "Recommended to Add to PCS" needs cell attendance for people *not* in PCS too, so
  // load the same recent-report window for every cell (into the shared map — cells the
  // effect above already fetched are skipped), plus removed PCS entries so someone
  // deliberately taken out of PCS isn't recommended straight back in.
  useEffect(() => {
    if (slug !== 'caring' || activeTab !== 'pcs' || !cellGroups.length) return
    const cellIds = cellGroups.map(g => g.id).filter(cid => cid && !pcsCellReportsByCellId.has(cid))
    if (!cellIds.length) return
    let cancelled = false
    Promise.all(cellIds.map(cid => getRecentCellReportsForHeatmap(cid, CELL_HEALTH_REPORT_COUNT).catch(() => [])))
      .then(results => {
        if (cancelled) return
        setPcsCellReportsByCellId(prev => {
          const next = new Map(prev)
          cellIds.forEach((cid, i) => { if (!next.has(cid)) next.set(cid, results[i]) })
          return next
        })
      })
    return () => { cancelled = true }
  }, [slug, activeTab, cellGroups, pcsCellReportsByCellId])

  useEffect(() => {
    if (slug !== 'caring' || activeTab !== 'pcs') return
    getInactivePCSEntries().then(setPcsFormerForRec).catch(() => setPcsFormerForRec([]))
  }, [slug, activeTab])

  useEffect(() => {
    if (slug !== 'accounts' || activeTab !== 'summary') return
    setAcctSummaryLoading(true)
    const now = new Date()
    const isCurrentMonth = acctSummaryYear === now.getFullYear() && acctSummaryMonth === now.getMonth()
    const range = acctSummaryMonth != null ? { year: acctSummaryYear, month: acctSummaryMonth } : { year: acctSummaryYear }
    const sum = (list) => list.reduce((s, e) => s + (Number(e.amount) || 0), 0)
    Promise.all([getFinanceIncome(range), getFinanceExpense(range)]).then(([inc, exp]) => {
      // Finance Assistant tracker: every expense entry of the period (the same list
      // the Finance Assistant page shows for the month). Entries without a status
      // predate the review flow and count as approved, as on the Expense page.
      const approved = exp.filter(e => e.status === 'approved' || !e.status)
      const pending = exp.filter(e => e.status && e.status !== 'approved')
      // Department submissions: departments that filed at least one expense of their
      // own in the period (bills typed in by the Finance Assistant don't count).
      // Accounts is the Finance Assistant's own department, so it's left out.
      const expected = [...new Set(EXPENSE_CATEGORIES.map(normalizeDepartmentName))].filter(d => d && d !== 'Accounts')
      const filed = new Set(exp.filter(e => !e.enteredByFinanceAssistant).map(e => normalizeDepartmentName(e.department || e.category)))
      setAcctSummary({
        isCurrentMonth,
        incomeCount: inc.length,
        incomeTotal: sum(inc),
        expenseCount: exp.length,
        expenseTotal: sum(exp),
        approvedTotal: sum(approved),
        pendingTotal: sum(pending),
        faCount: exp.length,
        faPending: pending.length,
        faApproved: approved.length,
        deptExpected: expected,
        deptFiled: expected.filter(d => filed.has(d)),
      })
    }).catch(() => {}).finally(() => setAcctSummaryLoading(false))
  }, [slug, activeTab, acctSummaryYear, acctSummaryMonth])

  // Total Savings for the Hub's summary card — deliberately its own effect, not
  // folded into the one above: savings is an all-time running balance (see
  // SavingsPage), so it doesn't need to (and shouldn't) refetch every time the
  // Hub's year/month picker changes the way Income/Expense do.
  useEffect(() => {
    if (slug !== 'accounts' || activeTab !== 'summary') return
    getFinanceSavings().then(rows => {
      const total = rows
        .filter(e => SAVINGS_FUNDS.includes(e.fund))
        .reduce((s, e) => s + (e.type === 'withdrawal' ? -Number(e.amount) || 0 : Number(e.amount) || 0), 0)
      setAcctSavingsTotal(total)
    }).catch(() => {})
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
    const isMedia = department.name === 'Media'
    const unsub = subscribeFinanceExpenseByDept(department.name, (entries) => {
      const list = entries || []
      const total = list
        .filter((e) => {
          const d = e.date instanceof Date ? e.date : e.date?.toDate?.()
          return d && d.getFullYear() === y && d.getMonth() === m
        })
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
      setMonthlyExpenseTotal(total)
      setLoadingMonthlyExpense(false)
      if (isMedia) setMediaExpenseEntries(list)
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

  // Loads the full D-Light directory as soon as a cell group is expanded (not just
  // lazily when the "+ Add Member" modal opens) so cellVisitorsByPhone above is
  // ready to auto-resolve/badge every member row, not only members added through
  // that modal.
  useEffect(() => {
    if (!expandedCellId) return
    getDelightVisitors().then(setCellMemberVisitors).catch(() => {})
  }, [expandedCellId])

  // Phone-keyed index of the central D-Light directory, for auto-resolving a cell
  // member's visitor link (findVisitorMatchForMember above) without requiring the
  // manual "Link" menu action — see the auto-link effect and badge logic below.
  // Declared here (rather than further down where it's also read) because the
  // auto-link effect's dependency array below evaluates it synchronously during
  // render — a later declaration threw "Cannot access before initialization".
  const cellVisitorsByPhone = useMemo(() => {
    const map = new Map()
    cellMemberVisitors.forEach((v) => {
      const key = phoneMatchKey(v.phone)
      if (key && !map.has(key)) map.set(key, v)
    })
    return map
  }, [cellMemberVisitors])

  // Auto-link pass: every cell member originates from the D-Light pipeline (the
  // "Add Member" flow only ever adds an existing directory entry — see
  // addCellGroupMember calls below), so a member showing no visitorId is either
  // legacy data from before that requirement, or was linked via the transfer/
  // referral paths without it. Rather than requiring the manual "Link" menu
  // action, silently resolve and persist the match by phone once both this cell's
  // members and the directory are loaded. autoLinkedRef guards against re-writing
  // the same member every time this effect re-runs (e.g. a sibling row's edit
  // triggers a cellMembers refresh).
  const autoLinkAttemptedRef = useRef(new Set())
  useEffect(() => {
    if (!expandedCellId || !cellMembers.length || !cellVisitorsByPhone.size) return
    cellMembers.forEach((m) => {
      if (m.visitorId || autoLinkAttemptedRef.current.has(m.id)) return
      const match = findVisitorMatchForMember(m, cellVisitorsByPhone)
      if (!match) return
      autoLinkAttemptedRef.current.add(m.id)
      updateCellGroupMember(expandedCellId, m.id, { visitorId: match.id })
        .then(() => {
          setCellMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, visitorId: match.id } : x)))
          refreshAllCellMembers()
        })
        .catch((err) => console.error('Auto-link failed for cell member', m.id, err))
    })
  }, [expandedCellId, cellMembers, cellVisitorsByPhone, refreshAllCellMembers])

  const canEdit = department
    ? (department.name === 'Cell' ? canViewAllCells : canManageDepartment(department.name))
    : false

  // River Kids attendance is also taken live during the Sunday service by
  // Sunday Ministry's Live Control (Sunday School group is already synced
  // through sunday_reports — see the "Synced with Sunday Ministry Live
  // Control" notice below); River Kids-1/River Kids-2 need the same cross-
  // department allowance so a Sunday Ministry Director/Coordinator running
  // Live Control isn't blocked from saving those groups' presence too.
  const canEditRkAttendance = canEdit || canManageDepartment('Sunday Ministry')

  // One nested sub-department row (River Kids' categorized Sub Department tab) —
  // shared by the right detail pane for whichever category is selected, so the
  // three-dot Edit/Delete menu isn't duplicated per category.
  const renderSubDeptRow = (row) => (
    <div key={row.id} className="relative flex items-center justify-between gap-2 pl-3 pr-1 py-2 rounded-lg hover:bg-slate-50 transition-colors">
      <p className="text-sm font-medium text-slate-700 truncate">{row.name || '—'}</p>
      {canEdit && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setSubDeptActionsMenuId((id) => (id === row.id ? null : row.id)) }}
            className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
            aria-label="Row actions"
          >
            ⋮
          </button>
          {subDeptActionsMenuId === row.id && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-full mt-1 w-32 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden z-10 text-left"
            >
              <button
                type="button"
                onClick={() => {
                  setSubDeptActionsMenuId(null)
                  setEditingSubDept(row)
                  setSubDeptForm({ name: row.name || '', servingArea: row.servingArea || '', category: row.category || '' })
                  setGenericSubDeptModalOpen(true)
                }}
                className="w-full text-left px-3 py-2 text-xs font-medium text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={async () => {
                  setSubDeptActionsMenuId(null)
                  if (!window.confirm('Delete this sub department?')) return
                  try {
                    await deleteDepartmentSubDepartment(row.id)
                    setSubDepartments((prev) => prev.filter((x) => x.id !== row.id))
                  } catch (err) {
                    console.error(err)
                    alert('Failed to delete')
                  }
                }}
                className="w-full text-left px-3 py-2 text-xs font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )

  // "Member Since" column cell for the D-Light/Media Team tables — the formatted
  // date plus its duration sub-text, capped at a former member's departure date
  // (getMemberTenureEnd) instead of still counting up against today. Shared by
  // both tables so the fallback/prompt logic isn't duplicated across them.
  const renderMemberSinceCell = (m) => {
    if (!m.memberSince) return <div>{formatDate(m.memberSince)}</div>
    const isFormer = !!m.isFormer || m.status === 'former'
    const { end, unknown } = getMemberTenureEnd(m)
    const showAnniversary = !isFormer && isMemberAnniversaryMonth(m.memberSince)
    return (
      <>
        <div>{formatDate(m.memberSince)}</div>
        {unknown ? (
          formerDatePromptId === m.id ? (
            <div className="flex items-center gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
              <DateInput
                value={formerDateDraft}
                onChange={(e) => setFormerDateDraft(e.target.value)}
                className="text-xs px-1.5 py-1 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
              <button
                type="button"
                onClick={async () => {
                  if (!formerDateDraft) return
                  try {
                    await updateDepartmentTeamMember(m.id, { formerDate: formerDateDraft })
                    setTeam((prev) => prev.map((x) => (x.id === m.id ? { ...x, formerDate: formerDateDraft } : x)))
                  } catch {
                    alert('Failed to save departure date')
                  }
                  setFormerDatePromptId(null)
                }}
                className="text-xs font-semibold text-indigo-600 hover:underline"
              >
                Save
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setFormerDatePromptId(m.id)
                setFormerDateDraft(format(new Date(), 'yyyy-MM-dd'))
              }}
              className="text-xs mt-0.5 text-amber-600 font-medium hover:underline"
            >
              Set departure date
            </button>
          )
        ) : (
          <div className={`text-xs mt-0.5 ${showAnniversary ? 'text-amber-600 font-semibold' : 'text-slate-400'}`}>
            {formatMemberDuration(m.memberSince, end)}{showAnniversary ? ' 🎉' : ''}
          </div>
        )}
      </>
    )
  }

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
  // A member's sub-department badges, read through the live master list: a renamed
  // sub-department shows its current name, and (D-Light / Media, whose members are
  // tagged only from that list) a tag whose sub-department was deleted is dropped.
  // Renames/deletes are also cascaded onto the member docs (services/firestore.js);
  // this covers tags left over from before that. Until the list loads, tags show as stored.
  const subDeptNameByKey = useMemo(
    () => new Map(subDeptOptionList.filter((sd) => sd.active !== false && sd.name).map((sd) => [subDeptMatchKey(sd.name), sd.name])),
    [subDeptOptionList]
  )
  const liveSubDepts = useCallback((m) => {
    const stored = Array.isArray(m?.subDepartments) && m.subDepartments.length
      ? m.subDepartments
      : (m?.subDepartment ? [m.subDepartment] : [])
    if (!subDeptNameByKey.size) return stored
    const dropUnknown = slug === 'd-light' || slug === 'media'
    const out = []
    for (const s of stored) {
      const name = subDeptNameByKey.get(subDeptMatchKey(s)) || (dropUnknown ? null : s)
      if (name && !out.includes(name)) out.push(name)
    }
    return out
  }, [subDeptNameByKey, slug])
  // Keep an open member popup in step with the live team list, so sub-departments
  // edited, renamed or removed while it is open re-render straight away.
  useEffect(() => {
    setDetailMember((prev) => {
      if (!prev?.id) return prev
      const fresh = team.find((m) => m.id === prev.id)
      return fresh ? { ...prev, ...fresh } : prev
    })
  }, [team])
  // Name → serving area, for the roster table's dual sub-department/serving-area
  // display (a team member only stores the sub-department NAME string, not its id,
  // so this is how the table recovers "which serving area" to show alongside it).
  const subDeptServingAreaByName = useMemo(
    () => new Map(subDeptOptionList.filter((sd) => sd.servingArea).map((sd) => [sd.name, sd.servingArea])),
    [subDeptOptionList]
  )
  // Every distinct serving area configured for this slug's sub-departments, for the
  // roster's "filter by serving area" control.
  const teamServingAreaOptions = useMemo(
    () => Array.from(new Set(subDeptOptionList.map((sd) => sd.servingArea).filter(Boolean))).sort(),
    [subDeptOptionList]
  )

  // Department notification ribbons are shown on My Workspace only
  // (components/workspace/DepartmentAlertRibbons), not on department pages.

  if (!department) {
    return (
      <div className="p-6 text-slate-600">
        <BackButton fallback="/departments" className="-ml-2.5" />
        <p className="mt-2">Department not found.</p>
      </div>
    )
  }

  if (department.customPage === 'worship') return <Navigate to="/department/worship" replace />
  if (department.customPage === 'rff') return <Navigate to="/rff" replace />

  // SAFETY RULE: block manual URL access to other departments
  // Exception: Accounts entry users (Weekly Expense Manager / Weekly Entry role) must pass through
  // to reach the nested EntryPage even though they aren't department heads.
  const isAccountsEntryPassthrough = slug === 'accounts' && canAccessAccountsEntry(userProfile, hasPermission, isFounder)
  // Sunday Ministry: only the director (Founder / Senior Pastor included as super admins)
  if (slug === 'sunday-ministry' && !isSundayMinistryDirector) {
    // Pre-Service Leaders (bookmark, old link, Departments list) land on the
    // one Sunday Ministry page they can use instead of a dead end.
    if (isPreServiceLeaderInPositions(userProfile)) return <Navigate to="/department/sunday-ministry/assign" replace />
    return (
      <div className="p-6 text-slate-600">
        <BackButton fallback="/departments" className="-ml-2.5" />
        <p className="mt-2">You do not have access to Sunday Ministry department.</p>
      </div>
    )
  }

  if (slug !== 'sunday-ministry' && !hasAccess(userProfile, department.name) && !isAccountsEntryPassthrough) {
    return (
      <div className="p-6 text-slate-600">
        <BackButton fallback="/departments" className="-ml-2.5" />
        <p className="mt-2">
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
        <BackButton fallback="/sunday-planning" className="-ml-2.5" />
        <p className="mt-2 text-lg font-semibold text-slate-800">Access Denied</p>
        <p className="mt-2 text-sm text-slate-600">D Light Directors may only use Sunday Planning. Other D Light pages are not available.</p>
      </div>
    )
  }

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

  // One-cell rule: people listed on more than one roster row (any cells) — drives the
  // "Duplicate names" banner and the red highlight on each offending row.
  const duplicateCellMemberGroups = useMemo(() => findDuplicateCellMembers(allCellMembers), [allCellMembers])
  const duplicateCellMemberRowIds = useMemo(
    () => new Set(duplicateCellMemberGroups.flat().map(m => `${m.cellId}/${m.id}`)),
    [duplicateCellMemberGroups],
  )

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

  async function saveMediaAssignPlan() {
    setMediaAssignSaving(true)
    try {
      // Flattened one entry per assigned person — a role with several crew members
      // just contributes several entries sharing the same subDeptId/role, same
      // convention the coverage/serving-load scan elsewhere already reads.
      const assignments = mediaAssignRows.flatMap((r) =>
        (r.members || []).map((m) => ({
          subDeptId: r.subDeptId || '',
          role: r.role,
          memberId: m.id,
          memberName: m.name || '',
        }))
      )
      await setMediaScheduleByDate(
        mediaAssignDate,
        assignments,
        userProfile?.email || userProfile?.displayName || 'unknown',
      )
      setMediaAssignStamp(
        mediaAssignRows.some((x) => (x.members || []).length)
          ? { date: mediaSnapToSunday(mediaAssignDate), rows: mediaAssignRows.map((r) => ({ ...r, members: [...(r.members || [])] })) }
          : null
      )
      setMediaAssignEditing(false)
    } catch (e) {
      console.error(e)
      alert('Failed to save assignments.')
    } finally {
      setMediaAssignSaving(false)
    }
  }

  // "Copy / Export JPEG" for the Media Assign tab — same approach as
  // handleDlightSharePlan / Worship's handleSharePlan: captures the dedicated
  // off-screen branded render (inline-hex styled, never Tailwind's oklch()) via
  // html2canvas-pro, then tries a clipboard PNG write (paste straight into a
  // WhatsApp chat). The Async Clipboard API's image support is desktop-Chrome/
  // Edge-only in practice, so mobile falls back to downloading a JPEG instead.
  async function handleMediaSharePlan() {
    if (!mediaAssignShareRef.current) return
    setMediaSharingPlan(true)
    try {
      const html2canvasMod = await import('html2canvas-pro')
      const html2canvas = html2canvasMod.default || html2canvasMod
      const canvas = await html2canvas(mediaAssignShareRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      })
      let copied = false
      try {
        const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
        if (pngBlob && typeof window.ClipboardItem === 'function' && navigator.clipboard?.write) {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
          copied = true
        }
      } catch { /* clipboard image writes aren't supported/permitted here — fall back to download */ }
      if (!copied) {
        const link = document.createElement('a')
        link.href = canvas.toDataURL('image/jpeg', 0.95)
        link.download = `media-crew-plan-${mediaAssignDate}.jpg`
        document.body.appendChild(link)
        link.click()
        link.remove()
      }
      setMediaShareToast(copied ? 'Plan copied as image! Paste directly into WhatsApp' : 'Plan downloaded as JPEG — attach it in WhatsApp')
      setTimeout(() => setMediaShareToast(null), 3000)
    } catch (e) {
      console.error('Error exporting Media plan:', e)
      const detail = e?.message ? ` (${String(e.message).slice(0, 140)})` : ''
      alert(`Could not export the plan as an image. Try again.${detail}`)
    } finally {
      setMediaSharingPlan(false)
    }
  }

  // "Copy as Image" for the D-Light Assign tab — same approach as Worship's
  // handleSharePlan (DepartmentWorship.jsx): captures the dedicated off-screen
  // branded render (inline-hex styled, never Tailwind's oklch()) via
  // html2canvas-pro, then tries a clipboard PNG write (paste straight into a
  // WhatsApp chat). The Async Clipboard API's image support is desktop-Chrome/
  // Edge-only in practice, so mobile falls back to downloading a JPEG the
  // director can attach from their gallery/downloads instead.
  async function handleDlightSharePlan() {
    if (!dlightAssignShareRef.current) return
    setDlightSharingPlan(true)
    try {
      const html2canvasMod = await import('html2canvas-pro')
      const html2canvas = html2canvasMod.default || html2canvasMod
      const canvas = await html2canvas(dlightAssignShareRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      })
      let copied = false
      try {
        const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
        if (pngBlob && typeof window.ClipboardItem === 'function' && navigator.clipboard?.write) {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
          copied = true
        }
      } catch { /* clipboard image writes aren't supported/permitted here — fall back to download */ }
      if (!copied) {
        const link = document.createElement('a')
        link.href = canvas.toDataURL('image/jpeg', 0.95)
        link.download = `dlight-ministry-roster-${delightAssignDate}.jpg`
        document.body.appendChild(link)
        link.click()
        link.remove()
      }
      setDlightShareToast(copied ? 'Plan copied as image! Paste directly into WhatsApp' : 'Plan downloaded as JPEG — attach it in WhatsApp')
      setTimeout(() => setDlightShareToast(null), 3000)
    } catch (e) {
      console.error('Error exporting D-Light plan:', e)
      const detail = e?.message ? ` (${String(e.message).slice(0, 140)})` : ''
      alert(`Could not export the plan as an image. Try again.${detail}`)
    } finally {
      setDlightSharingPlan(false)
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
    // Accounts: content held to A3 page proportions, centred.
    <div className={slug === 'accounts' ? 'max-w-[1190px] mx-auto' : undefined}>
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
      ) : loading || hasPendingDeepLink ? (
        <div className="py-8 text-center text-slate-500">Loading...</div>
      ) : (
        <>
          {/* ── Pending Consultations: Cell Director asking for D-Light input ──
               Rendered above everything else (including the metrics/KPI section) on
               the Hub landing tab, Visitor Entry, and Assign, so a D-Light Director
               can't land on the page and miss a pending consult request. ── */}
          {slug === 'd-light' && (activeTab === 'summary' || activeTab === 'visitorEntry' || activeTab === 'assign') && (() => {
            // 'Responded' means D-Light already sent a recommendation back — it isn't
            // pending on D-Light anymore (only the Cell Director closing it out with
            // 'Completed' is), so it's excluded here too, same as 'Completed'.
            const consultTasks = tasks.filter(t => t.cellAssignConsult === true && t.status !== 'Completed' && t.status !== 'Responded')
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
                              <p className="text-xs text-slate-500 mt-0.5">
                                Requested by {t.requestedBy || 'Cell Director'}
                                {t.createdAt && ` • ${formatTimestampFull(t.createdAt)}`}
                              </p>
                              {t.createdAt && (
                                <p className="text-xs text-slate-500">{formatRelativeTime(t.createdAt)}</p>
                              )}
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

          {/* SP Office's home tab is the office secretary's Control Center, not the generic Hub. */}
          {activeTab === 'summary' && slug === 'sp-office' && (
            <ControlCenter
              canEdit={canEdit}
              userProfile={userProfile}
              onOpenTab={(tab, params) => { setActiveTab(tab); setSearchParams({ tab, ...(params || {}) }, { replace: true }) }}
            />
          )}

          {activeTab === 'summary' && slug !== 'sp-office' && (
            <>
              {/* ── Total Expense (This Month) — shown on every department's dashboard
                  (Accounts shows the all-department total in its Hub instead) ── */}
              {slug !== 'accounts' && (
              <div className="bg-white rounded-xl border border-slate-200 border-l-4 border-l-rose-300 shadow-sm px-4 py-2.5 flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500">Total Expense (This Month)</p>
                <p className="text-sm font-bold text-slate-700 bg-rose-50 px-2.5 py-1 rounded-lg tabular-nums">
                  {loadingMonthlyExpense ? '—' : `₹${monthlyExpenseTotal.toLocaleString('en-IN')}`}
                </p>
              </div>
              )}

              {/* ── Caring Hub ── */}
              {slug === 'caring' && (
                <div className="space-y-4">
                  {/* Submitted Baptism / Dedication / Membership applications awaiting review */}
                  <ApplicationsQueueCard
                    pcsEntries={pcsEntries}
                    allCellMembers={allCellMembers}
                    cellGroups={cellGroups}
                    canEdit={!!canEdit}
                    savedBy={userProfile?.displayName || userProfile?.email || ''}
                    onOpenEvents={() => { setActiveTab('events'); setSearchParams({ tab: 'events' }, { replace: true }) }}
                  />
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
                    onNavigateToCellGroups={() => { setActiveTab('cellGroups'); setSearchParams({ tab: 'cellGroups' }, { replace: true }) }}
                    initialUnassignedFilter={searchParams.get('filter') === 'unassigned'}
                    onUnassignedFilterChange={(open) => {
                      const next = new URLSearchParams(searchParams)
                      next.set('tab', 'summary')
                      if (open) next.set('filter', 'unassigned')
                      else next.delete('filter')
                      setSearchParams(next, { replace: true })
                    }}
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
                <MediaHub
                  team={team}
                  tasks={tasks}
                  subDepartments={subDepartments}
                  schedules={mediaSchedules}
                  expenseEntries={mediaExpenseEntries}
                  onGoToAssign={() => { setActiveTab('assign'); setSearchParams({ tab: 'assign' }, { replace: true }) }}
                />

                {/* ── Sunday Program ── */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mt-4">
                  <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-semibold text-slate-800">Sunday Program</h2>
                      <p className="text-xs text-slate-500 mt-0.5">Assign a person to each media program item for this Sunday</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setMediaSundayDate(format(subWeeks(new Date(mediaSundayDate), 1), 'yyyy-MM-dd'))} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">← Prev</button>
                      <span className="text-sm font-semibold text-slate-700 min-w-[140px] text-center">{format(new Date(mediaSundayDate), 'EEE, dd/MM/yyyy')}</span>
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
                      <div className="overflow-x-auto">
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
                                      <option key={m.id} value={m.name}>{getMemberDisplayName(m)}</option>
                                    ))}
                                  </select>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                      </div>
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
                  {/* Collapsible year score: months marked "Entry completed" on Income + Expense. */}
                  <EntryCompletionProgress
                    selectedKey={format(new Date(acctSummaryYear, acctSummaryMonth, 1), 'yyyy-MM')}
                    onSelectMonth={(mk) => setAcctSummaryPick(mk === format(new Date(), 'yyyy-MM') ? null : mk)}
                  />
                  {acctSummaryLoading || !acctSummary ? (
                    <div className="py-10 text-center text-slate-400 text-sm">Loading…</div>
                  ) : (() => {
                    const periodLabel = acctSummaryMonth != null ? format(new Date(acctSummaryYear, acctSummaryMonth, 1), 'MMMM yyyy') : String(acctSummaryYear)
                    const inr = (n) => `₹${Math.abs(n).toLocaleString('en-IN')}`
                    const net = acctSummary.incomeTotal - acctSummary.expenseTotal
                    const surplus = net >= 0
                    const flowMax = Math.max(acctSummary.incomeTotal, acctSummary.expenseTotal, 1)
                    const { deptExpected, deptFiled } = acctSummary
                    const deptPct = deptExpected.length ? Math.round((deptFiled.length / deptExpected.length) * 100) : 0
                    const deptMissing = deptExpected.filter(d => !deptFiled.includes(d))
                    const faTotal = acctSummary.faCount
                    const faApprovedPct = faTotal ? Math.round((acctSummary.faApproved / faTotal) * 100) : 0
                    const periodQuery = acctSummary.isCurrentMonth ? '' : `&year=${acctSummaryYear}${acctSummaryMonth != null ? `&month=${acctSummaryMonth}` : ''}`
                    const card = 'rounded-2xl border border-slate-200/70 bg-white/85 backdrop-blur shadow-[0_10px_30px_-16px_rgba(0,80,68,0.35)]'
                    const eyebrow = 'text-[10px] font-bold uppercase tracking-[0.14em]'
                    return (
                      <>
                        <p className={`${eyebrow} text-[#005044]/70`}>{periodLabel}</p>

                        {/* Bento grid: Net Balance hero (2×2), Income / Expense / Funds Reserved
                            tiles, then Department Submissions + Finance Assistant tracker. */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                          {/* Net balance hero */}
                          <div className="col-span-2 lg:row-span-2 relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#005044] via-[#00695a] to-teal-600 text-white p-5 shadow-[0_18px_40px_-18px_rgba(0,80,68,0.75)]">
                            <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 w-56 h-56 rounded-full bg-white/10 blur-2xl" />
                            <div aria-hidden className="pointer-events-none absolute -left-10 -bottom-20 w-48 h-48 rounded-full bg-teal-300/20 blur-2xl" />
                            <div className="relative flex items-start justify-between gap-3">
                              <p className={`${eyebrow} text-emerald-100/80`}>Net Balance</p>
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${surplus ? 'bg-emerald-300/20 text-emerald-100 ring-1 ring-emerald-200/40' : 'bg-amber-300/25 text-amber-100 ring-1 ring-amber-200/50'}`}>
                                {surplus ? <TrendingUp size={13} aria-hidden="true" /> : <TrendingDown size={13} aria-hidden="true" />}
                                {surplus ? 'Surplus' : 'Deficit'}
                              </span>
                            </div>
                            <p className={`relative mt-2 text-4xl font-black tracking-tight tabular-nums ${surplus ? 'text-white' : 'text-amber-200'}`}>{net < 0 ? '−' : ''}{inr(net)}</p>
                            <p className="relative text-xs text-emerald-100/70 mt-1">Income minus expense · {periodLabel}</p>
                            <div className="relative mt-5 space-y-3">
                              {[
                                { label: 'Income', value: acctSummary.incomeTotal, bar: 'bg-emerald-300' },
                                { label: 'Expense', value: acctSummary.expenseTotal, bar: 'bg-amber-300' },
                              ].map(r => (
                                <div key={r.label}>
                                  <div className="flex items-center justify-between text-xs mb-1">
                                    <span className="text-emerald-50/90 font-medium">{r.label}</span>
                                    <span className="font-semibold tabular-nums">{inr(r.value)}</span>
                                  </div>
                                  <div className="h-2 rounded-full bg-white/15 overflow-hidden">
                                    <div className={`h-full rounded-full ${r.bar} transition-[width] duration-700`} style={{ width: `${Math.round((r.value / flowMax) * 100)}%` }} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Income */}
                          <div className={`${card} p-4 border-t-4 border-t-emerald-500`}>
                            <div className="flex items-center justify-between">
                              <p className={`${eyebrow} text-emerald-700`}>Income</p>
                              <span className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><ArrowDownLeft size={16} aria-hidden="true" /></span>
                            </div>
                            <p className="mt-2 text-2xl font-black tracking-tight tabular-nums text-slate-900">{inr(acctSummary.incomeTotal)}</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">{acctSummary.incomeCount} {acctSummary.incomeCount === 1 ? 'entry' : 'entries'}</p>
                          </div>

                          {/* Expense */}
                          <div className={`${card} p-4 border-t-4 border-t-amber-500`}>
                            <div className="flex items-center justify-between">
                              <p className={`${eyebrow} text-amber-700`}>Total Expense</p>
                              <span className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center"><ArrowUpRight size={16} aria-hidden="true" /></span>
                            </div>
                            <p className="mt-2 text-2xl font-black tracking-tight tabular-nums text-slate-900">{inr(acctSummary.expenseTotal)}</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {acctSummary.expenseCount} {acctSummary.expenseCount === 1 ? 'entry' : 'entries'}
                              {acctSummary.pendingTotal > 0 && <> · <span className="text-amber-700 font-medium">{inr(acctSummary.pendingTotal)} pending</span></>}
                            </p>
                          </div>

                          {/* Funds Reserved — all-time running balance across every fund (see
                              SavingsPage), not scoped to the period like the others. */}
                          <div className={`${card} col-span-2 p-4 border-t-4 border-t-violet-500 flex items-center justify-between gap-3`}>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className={`${eyebrow} text-violet-700`}>Funds Reserved</p>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-50 text-violet-700 ring-1 ring-violet-200">All-time</span>
                              </div>
                              <p className="mt-2 text-2xl font-black tracking-tight tabular-nums text-slate-900">{acctSavingsTotal == null ? '—' : `${acctSavingsTotal < 0 ? '−' : ''}${inr(acctSavingsTotal)}`}</p>
                            </div>
                            <span className="w-11 h-11 shrink-0 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white flex items-center justify-center shadow-md shadow-violet-500/30"><PiggyBank size={20} aria-hidden="true" /></span>
                          </div>

                          {/* Department submissions (Total Completion) */}
                          <div className={`${card} col-span-2 p-4`}>
                            <div className="flex items-center justify-between gap-2">
                              <p className={`${eyebrow} text-[#005044]`}>Total Completion</p>
                              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${deptPct >= 90 ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : deptPct >= 50 ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'}`}>{deptPct}%</span>
                            </div>
                            <p className="text-sm text-slate-700 mt-1.5">
                              <span className="font-bold text-slate-900">{deptFiled.length}</span> of {deptExpected.length} departments submitted expenses
                            </p>
                            <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                              <div className="h-full rounded-full bg-gradient-to-r from-[#005044] to-teal-500 transition-[width] duration-700" style={{ width: `${deptPct}%` }} />
                            </div>
                            {deptMissing.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {deptMissing.map(d => (
                                  <span key={d} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-50 text-slate-600 ring-1 ring-slate-200">
                                    <Building2 size={10} aria-hidden="true" />{d}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Finance Assistant operational tracker */}
                          <div className={`${card} col-span-2 p-4`}>
                            <div className="flex items-center justify-between gap-2">
                              <p className={`${eyebrow} text-[#005044]`}>Finance Assistant</p>
                              <span className="text-[11px] text-slate-500">{periodLabel}</span>
                            </div>
                            <div className="mt-2 grid grid-cols-3 gap-2">
                              <div className="rounded-xl bg-slate-50 ring-1 ring-slate-100 px-3 py-2 text-center">
                                <p className="text-2xl font-black tabular-nums text-slate-900">{faTotal}</p>
                                <p className="text-[10px] font-semibold text-slate-500 mt-0.5">Total entries</p>
                              </div>
                              <div className="rounded-xl bg-amber-50 ring-1 ring-amber-100 px-3 py-2 text-center">
                                <p className="text-2xl font-black tabular-nums text-amber-700">{acctSummary.faPending}</p>
                                <p className="text-[10px] font-semibold text-amber-700/80 mt-0.5">Pending verification</p>
                              </div>
                              <div className="rounded-xl bg-emerald-50 ring-1 ring-emerald-100 px-3 py-2 text-center">
                                <p className="text-2xl font-black tabular-nums text-emerald-700">{acctSummary.faApproved}</p>
                                <p className="text-[10px] font-semibold text-emerald-700/80 mt-0.5">Approved</p>
                              </div>
                            </div>
                            <div className="mt-3 h-2 rounded-full bg-amber-100 overflow-hidden" title={`${faApprovedPct}% approved`}>
                              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-[width] duration-700" style={{ width: `${faApprovedPct}%` }} />
                            </div>
                          </div>
                        </div>

                        {/* Quick actions */}
                        <div className={`grid gap-3 ${canAccessWeeklyEntryOnly(userProfile) ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
                          {[
                            { label: 'Income', path: `/department/accounts/entry?tab=income${periodQuery}`, Icon: ArrowDownLeft, desc: 'View income entries', tone: 'from-emerald-500 to-teal-500 shadow-emerald-500/30' },
                            { label: 'Expense', path: `/department/accounts/entry?tab=expense${periodQuery}`, Icon: ArrowUpRight, desc: 'View expense entries', tone: 'from-amber-500 to-orange-500 shadow-amber-500/30' },
                            // Finance Assistant role only — the Accounts Director works from the grid.
                            canAccessWeeklyEntryOnly(userProfile) && { label: 'Finance Assistant', path: '/department/accounts/entry?tab=weekly', Icon: ClipboardList, desc: 'Weekly bill entry', tone: 'from-[#005044] to-teal-600 shadow-emerald-900/30' },
                          ].filter(Boolean).map((tile) => { const { label, Icon, desc, path, tone } = tile; return (
                            <button
                              key={label}
                              type="button"
                              onClick={() => navigate(path)}
                              className={`group ${card} flex items-center gap-3 px-4 py-3 text-left hover:-translate-y-0.5 hover:shadow-[0_16px_34px_-16px_rgba(0,80,68,0.5)] hover:border-emerald-200 active:translate-y-0 transition-all`}
                            >
                              <span className={`w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br ${tone} text-white flex items-center justify-center shadow-md`}><Icon size={18} aria-hidden="true" /></span>
                              <span className="flex-1 min-w-0">
                                <span className="block text-sm font-semibold text-slate-900">{label}</span>
                                <span className="block text-[11px] text-slate-500">{desc}</span>
                              </span>
                              <ChevronRight size={18} aria-hidden="true" className="text-slate-300 group-hover:text-[#005044] group-hover:translate-x-0.5 transition" />
                            </button>
                          ) })}
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

          {activeTab === 'applications' && slug === 'sp-office' && (
            <ApplicationsDesk canEdit={canEdit} userProfile={userProfile} />
          )}

          {activeTab === 'dailySchedule' && slug === 'sp-office' && (
            <DailySchedule canEdit={canEdit} userProfile={userProfile} />
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
                          <li key={t.id} id={`pcs-forward-${t.id}`} className="px-4 py-3 flex flex-wrap items-start gap-3">
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
                      <li key={p.id} id={`cell-visitor-proposal-${p.id}`} className="px-4 py-3 flex flex-wrap items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-800 text-sm truncate">{p.visitorName}</p>
                          {p.phone && <p className="text-xs text-slate-500">{p.phone}</p>}
                          <p className="text-xs text-slate-400 mt-0.5">{p.cellName || p.cellId} · {isoToDMY(p.reportDate)}</p>
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
                    <button
                      type="button"
                      onClick={() => {
                        setEditingDelightVisitorId(null)
                        setDelightVisitorForm({ name: '', dob: '', phone: '', email: '', nativity: '', currentPlace: '', serviceAttended: '', attendedDate: upcomingSunday(), howKnown: '', source: '', year: visitorSubPage === 'current' ? VISITOR_CURRENT_YEAR : visitorPrevYear, onlyVisit: false })
                        setDelightVisitorModalOpen(true)
                      }}
                      className="px-4 min-h-[44px] py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
                    >
                      Add Visitor
                    </button>
                  </div>
                )}
              </div>

              {/* Sunday selector for the inline Sunday Worship toggle column below —
                  replaces the old separate Follow-Up: Week Comers panel. Tapping the
                  toggle on a row writes/removes that name straight into this Sunday's
                  attendance report on Sunday Ministry's side. */}
              {canEditDelightVisitors && (
                <div className="px-5 py-3 border-b border-slate-100 bg-indigo-50/30 flex flex-wrap items-center gap-2">
                  <label className="text-xs font-medium text-slate-600">Sunday Worship attendance for</label>
                  <DateInput
                    value={visitorAttendanceDate}
                    onChange={(e) => {
                      const val = e.target.value
                      if (!val) return
                      const d = new Date(val + 'T00:00:00')
                      if (d.getDay() === 0) {
                        setVisitorAttendanceDate(val)
                        setVisitorAttendanceDateWarning(false)
                      } else {
                        // Not a Sunday — snap to whichever Sunday (before or after) is closer,
                        // since this date picks which sunday_reports doc gets read/written.
                        const dow = d.getDay()
                        const snapped = new Date(d)
                        snapped.setDate(d.getDate() + (dow <= 3 ? -dow : 7 - dow))
                        setVisitorAttendanceDate(format(snapped, 'yyyy-MM-dd'))
                        setVisitorAttendanceDateWarning(true)
                      }
                    }}
                    className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                  {visitorAttendanceDateWarning && (
                    <p className="text-xs text-amber-600 font-medium w-full">
                      ⚠ Sunday Ministry attendance only exists per-Sunday — snapped to the nearest Sunday ({isoToDMY(visitorAttendanceDate)}).
                    </p>
                  )}
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
                    {visitorSearchResults.map((v) => {
                      const nameKey = String(v.name || '').trim().toLowerCase()
                      const attendedThisSunday = sundayAttendanceNames.has(nameKey)
                      const togglingThisRow = togglingVisitorName === nameKey
                      return (
                        <div
                          key={v.id}
                          role="button"
                          tabIndex={0}
                          onMouseDown={() => {
                            // onMouseDown (not onClick) fires before the search input's
                            // onBlur closes the dropdown, so the click still registers.
                            const yr = getVisitorYear(v)
                            if (yr === VISITOR_CURRENT_YEAR) {
                              setVisitorSubPage('current')
                            } else {
                              setVisitorSubPage('previous')
                              setVisitorPrevYear(yr)
                            }
                            setEditingDelightVisitorId(v.id)
                            setDelightVisitorForm({
                              name: v.name || '', dob: v.dob ? String(v.dob).slice(0, 10) : '', phone: v.phone || '',
                              email: v.email || '', nativity: v.nativity || '', currentPlace: v.currentPlace || '',
                              serviceAttended: v.serviceAttended || '', attendedDate: v.attendedDate ? String(v.attendedDate).slice(0, 10) : '',
                              howKnown: v.howKnown || '', source: v.source || '', year: yr, onlyVisit: !!v.onlyVisit,
                            })
                            setDelightVisitorModalOpen(true)
                            setVisitorSearch('')
                            setVisitorSearchOpen(false)
                          }}
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-indigo-50 text-left transition-colors cursor-pointer"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800">{v.name}</p>
                            <p className="text-xs text-slate-400">{[v.phone, v.email].filter(Boolean).join(' · ') || 'No contact info'}</p>
                          </div>
                          <div className="ml-3 shrink-0 flex items-center gap-2">
                            <span className="text-xs font-medium text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                              {getVisitorYear(v)}
                            </span>
                            {canEditDelightVisitors && (
                              <button
                                type="button"
                                disabled={togglingThisRow || loadingSundayAttendanceNames || !v.name}
                                title={attendedThisSunday ? 'Attended this Sunday — click to unmark' : 'Mark attended this Sunday'}
                                aria-pressed={attendedThisSunday}
                                aria-label={attendedThisSunday ? 'Mark not attended this Sunday' : 'Mark attended this Sunday'}
                                // Same reasoning as the row itself: toggle on mousedown (with
                                // stopPropagation) so it fires — and blocks the row's own
                                // onMouseDown navigation — before the search blur/close runs.
                                onMouseDown={(e) => {
                                  e.stopPropagation()
                                  if (togglingThisRow || loadingSundayAttendanceNames || !v.name) return
                                  toggleVisitorSundayAttendance(v)
                                }}
                                className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors disabled:opacity-50 ${
                                  attendedThisSunday
                                    ? 'bg-emerald-500 border-emerald-500 text-white hover:bg-emerald-600'
                                    : 'bg-white border-slate-300 hover:border-emerald-400'
                                }`}
                              >
                                {togglingThisRow ? (
                                  <span className="text-[9px] leading-none">…</span>
                                ) : attendedThisSunday ? (
                                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                    <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 111.42-1.42L8.5 12.09l6.79-6.8a1 1 0 011.42 0z" clipRule="evenodd" />
                                  </svg>
                                ) : null}
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
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
                // Mobile: table-fixed with a flexible Name column and narrow Month / tick
                // columns, so the table always fits the screen (the old px-6 padding plus
                // fixed widths made it wider than a phone, pushing names off the left edge).
                // pb-24 keeps the last rows clear of the floating dock button.
                <div className="w-full overflow-x-auto pb-24 lg:pb-0">
                  <table className="w-full table-fixed sm:table-auto text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th scope="col" className="text-left pl-4 pr-2 sm:px-6 py-3 font-semibold text-slate-700 text-base">Name</th>
                        <th scope="col" className="w-14 sm:w-28 text-center sm:text-left px-1 sm:px-6 py-3 font-medium text-xs sm:text-sm text-slate-500">Month</th>
                        <th scope="col" className="w-[4.5rem] sm:w-40 text-center pr-3 pl-1 sm:px-6 py-3 font-medium text-xs sm:text-sm text-slate-500">
                          <span className="sm:hidden">Sunday</span><span className="hidden sm:inline">Sunday Worship</span>
                          <span className="block text-[10px] font-normal text-slate-400 normal-case">{formatDMY(visitorAttendanceDate)}</span>
                        </th>
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
                        const nameKey = String(v.name || '').trim().toLowerCase()
                        const attendedThisSunday = sundayAttendanceNames.has(nameKey)
                        const togglingThisRow = togglingVisitorName === nameKey
                        return (
                          <Fragment key={v.id}>
                            <tr
                              className={`cursor-pointer transition-colors border-b border-white/60 ${rowBg} ${open ? 'opacity-80' : 'hover:opacity-90'}`}
                              onClick={() => setVisitorMenuOpenId(open ? null : v.id)}
                            >
                              <td className="pl-4 pr-2 sm:px-6 py-3 font-semibold text-[15px] sm:text-base text-slate-900 align-middle">
                                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                                  <span className="break-words min-w-0">{v.name || '—'}</span>
                                  {sundayWeeks > 4 && (
                                    <span title={`Attended ${sundayWeeks} Sundays`} className="text-amber-500 text-base leading-none">★</span>
                                  )}
                                  {sundayWeeks >= 2 && sundayWeeks <= 4 && (
                                    <span title={`Attended ${sundayWeeks} Sundays`} className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-600 border border-indigo-200">
                                      {sundayWeeks}wk
                                    </span>
                                  )}
                                  {v.onlyVisit && (
                                    <span title="Marked as a one-time visitor — excluded from cell placement and PCS follow-up" className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                                      Only Visit
                                    </span>
                                  )}
                                  {v.isArchived && (
                                    <span title="Auto-archived — 30+ days since their last visit with no return" className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-400 border border-slate-200">
                                      Archived
                                    </span>
                                  )}
                                  {v.flaggedForReview && (
                                    <span title="Attended again after being archived — needs a look" className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                                      Review
                                    </span>
                                  )}
                                </span>
                              </td>
                              <td className="px-1 sm:px-6 py-3 text-xs sm:text-sm text-slate-500 text-center sm:text-left align-middle">{monthLabel}</td>
                              <td className="pr-3 pl-1 sm:px-6 py-1 align-middle">
                                <div className="flex justify-center">
                                  {canEditDelightVisitors ? (
                                    <button
                                      type="button"
                                      disabled={togglingThisRow || loadingSundayAttendanceNames || !v.name}
                                      onClick={(e) => { e.stopPropagation(); toggleVisitorSundayAttendance(v) }}
                                      aria-pressed={attendedThisSunday}
                                      aria-label={`${attendedThisSunday ? 'Mark not attended' : 'Mark attended'}: ${v.name || 'visitor'}`}
                                      className="group w-11 h-11 -my-1 flex items-center justify-center rounded-lg disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1"
                                    >
                                      <span className={`w-6 h-6 rounded-md border flex items-center justify-center transition-colors ${
                                        attendedThisSunday
                                          ? 'bg-emerald-500 border-emerald-500 text-white group-hover:bg-emerald-600'
                                          : 'bg-white border-slate-300 group-hover:border-emerald-400'
                                      }`}>
                                        {togglingThisRow ? (
                                          <span className="text-[10px] leading-none">…</span>
                                        ) : attendedThisSunday ? (
                                          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
                                            <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 111.42-1.42L8.5 12.09l6.79-6.8a1 1 0 011.42 0z" clipRule="evenodd" />
                                          </svg>
                                        ) : null}
                                      </span>
                                    </button>
                                  ) : attendedThisSunday ? (
                                    <span className="w-6 h-6 rounded-md bg-emerald-500 text-white flex items-center justify-center">
                                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                        <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 111.42-1.42L8.5 12.09l6.79-6.8a1 1 0 011.42 0z" clipRule="evenodd" />
                                      </svg>
                                    </span>
                                  ) : (
                                    <span className="w-6 h-6 rounded-md border border-slate-200" />
                                  )}
                                </div>
                              </td>
                            </tr>
                            {open && (
                              <tr className={rowBg}>
                                <td colSpan={3} className="px-4 sm:px-6 py-3 border-b border-slate-200">
                                  <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-1.5 text-sm mb-3 break-words">
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
                                      <button type="button" onClick={(e) => { e.stopPropagation(); setVisitorMenuOpenId(null); setEditingDelightVisitorId(v.id); setDelightVisitorForm({ name: v.name || '', dob: v.dob ? String(v.dob).slice(0, 10) : '', phone: v.phone || '', email: v.email || '', nativity: v.nativity || '', currentPlace: v.currentPlace || '', serviceAttended: v.serviceAttended || '', attendedDate: v.attendedDate ? String(v.attendedDate).slice(0, 10) : '', howKnown: v.howKnown || '', source: v.source || '', year: getVisitorYear(v), onlyVisit: !!v.onlyVisit }); setDelightVisitorModalOpen(true) }} className="text-xs font-medium text-blue-600 hover:underline">Edit</button>
                                      <button
                                        type="button"
                                        onClick={async (e) => {
                                          e.stopPropagation()
                                          const next = !v.onlyVisit
                                          try {
                                            await updateDelightVisitor(v.id, { onlyVisit: next })
                                            setDelightVisitors((prev) => prev.map((x) => (x.id === v.id ? { ...x, onlyVisit: next } : x)))
                                          } catch (err) {
                                            console.error(err)
                                            alert('Failed to update visitor')
                                          }
                                        }}
                                        className="text-xs font-medium text-slate-500 hover:underline"
                                      >
                                        {v.onlyVisit ? 'Unmark Only Visit' : 'Mark Only Visit'}
                                      </button>
                                      {v.flaggedForReview && (
                                        <button
                                          type="button"
                                          onClick={async (e) => {
                                            e.stopPropagation()
                                            try {
                                              await updateDelightVisitor(v.id, { flaggedForReview: false })
                                              setDelightVisitors((prev) => prev.map((x) => (x.id === v.id ? { ...x, flaggedForReview: false } : x)))
                                            } catch (err) {
                                              console.error(err)
                                              alert('Failed to update visitor')
                                            }
                                          }}
                                          className="text-xs font-medium text-amber-600 hover:underline"
                                        >
                                          Clear Review Flag
                                        </button>
                                      )}
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
                    <DateInput value={caringMemberForm.dob} onChange={(e) => setCaringMemberForm((f) => ({ ...f, dob: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
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
                      <DateInput value={caringMemberForm.firstSunday} onChange={(e) => setCaringMemberForm((f) => ({ ...f, firstSunday: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
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
                    <label className="flex items-start gap-2.5 pt-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!delightVisitorForm.onlyVisit}
                        onChange={(e) => setDelightVisitorForm((f) => ({ ...f, onlyVisit: e.target.checked }))}
                        className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>
                        <span className="block text-sm font-medium text-slate-900 dark:text-white">Only Visit / One-Time Visitor</span>
                        <span className="block text-xs text-slate-400 dark:text-slate-500 mt-0.5">Excludes them from PCS and cell-placement recommendations and follow-up alerts</span>
                      </span>
                    </label>
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

          {activeTab === 'upcomingSunday' && ['media', 'd-light', 'administration'].includes(slug) && (
            <UpcomingSunday slug={slug} />
          )}

          {activeTab === 'finance' && slug === 'sec-core' && (
            <SecCoreFinance department={department} />
          )}

          {activeTab === 'finance' && slug !== 'sec-core' && (
            <FinanceTabBar
              tabs={['expense', 'budget', 'payout']}
              active={financeSubTab}
              onChange={(key) => {
                setFinanceSubTab(key)
                setSearchParams({ tab: 'finance', financeSub: key }, { replace: true })
              }}
            />
          )}

          {activeTab === 'finance' && slug !== 'sec-core' && financeSubTab === 'expense' && department?.name && (
            <DeptExpenseTab department={department.name} />
          )}

          {activeTab === 'finance' && slug !== 'sec-core' && financeSubTab === 'budget' && (
            <BudgetPage department={department?.name} />
          )}

          {activeTab === 'finance' && slug !== 'sec-core' && financeSubTab === 'payout' && (
            <div className="space-y-4">
              {slug === 'administration' && <AdvancePayoutReviewer />}
              <AdvancePayoutTab departmentSlug={slug} departmentName={department?.name || slug} />
            </div>
          )}

          {activeTab === 'income' && slug === 'accounts' && (
            <IncomePage controlledMonth={accountsMonth} onMonthChange={setAccountsMonth} />
          )}

          {activeTab === 'expense' && slug === 'accounts' && (
            <ExpensePage controlledMonth={accountsMonth} onMonthChange={setAccountsMonth} />
          )}

          {activeTab === 'tally' && slug === 'accounts' && (
            <TallyPage controlledMonth={accountsMonth} onMonthChange={setAccountsMonth} />
          )}

          {activeTab === 'budget' && slug === 'accounts' && (
            <BudgetPage />
          )}

          {activeTab === 'operations' && (
            <OperationsTabBar
              tabs={getOperationsChildren(slug)}
              active={opsSubTab}
              onChange={(key) => {
                setOpsSubTab(key)
                setSearchParams({ tab: 'operations', opsSub: key }, { replace: true })
              }}
            />
          )}

          {activeTab === 'operations' && opsSubTab === 'addDepartments' && slug === 'accounts' && (
            <AddDepartmentsPage />
          )}

          {(activeTab === 'planning' || (activeTab === 'operations' && opsSubTab === 'planning')) && (
            <div className="space-y-6">
              {slug === 'cell' && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <h2 className="font-semibold text-slate-800 mb-3">Back to the Bible</h2>
                  <p className="text-sm text-slate-500 mb-2">Weekly teaching content for all cells. Week cycle is Monday → Sunday. Content applies to all cell meetings in that week.</p>
                  <p className="text-sm font-medium text-slate-700 mb-4">
                    Week: {format(btbWeekStart, 'dd/MM/yyyy')} – {format(btbWeekEnd, 'dd/MM/yyyy')} <span className="text-slate-500 font-normal">(Monday to Sunday)</span>
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
                          const mon = startOfWeek(now, { weekStartsOn: 0 })
                          const sun = endOfWeek(now, { weekStartsOn: 0 })
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
                          <label className="block text-sm font-medium text-slate-700 mb-1">Week start (Sunday)</label>
                          <DateInput
                            value={btbForm.fromDate}
                            onChange={(e) => {
                              const v = e.target.value
                              if (!v) return
                              const d = new Date(v + 'T12:00:00')
                              const mon = startOfWeek(d, { weekStartsOn: 0 })
                              const sun = endOfWeek(mon, { weekStartsOn: 0 })
                              setBtbForm((f) => ({ ...f, fromDate: format(mon, 'yyyy-MM-dd'), toDate: format(sun, 'yyyy-MM-dd') }))
                            }}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Week end (Sunday)</label>
                          <DateInput value={btbForm.toDate} readOnly className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50" />
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
                          <DateInput
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
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Branded top accent, matching Worship's Assign tab pattern. */}
              <div className="h-1.5 bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400" />
              <div className="px-5 py-4 border-b border-slate-200 space-y-3 bg-gradient-to-r from-orange-50 via-white to-amber-50">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold text-slate-800">Assign</h2>
                  {/* Read-only by default — plain tag chips, no dropdowns/+Add/× — until
                      "Edit Plan" is clicked; same lifecycle as Worship's Assign tab. */}
                  {dlightAssignEditing ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={savingDelightAssignments}
                        onClick={() => {
                          setDelightAssignments(delightAssignmentsBefore ? { ...blankDlightAssignments(), ...delightAssignmentsBefore } : blankDlightAssignments())
                          setDlightAssignEditing(false)
                        }}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={savingDelightAssignments || loadingDelightAssignments}
                        onClick={async () => {
                          setSavingDelightAssignments(true)
                          try {
                            const before = delightAssignmentsBefore
                            const after = delightAssignments
                            await setDlightAssignmentsForDate(
                              delightAssignDate,
                              after,
                              userProfile?.email || userProfile?.displayName || 'unknown'
                            )
                            setDelightAssignmentsBefore({ ...after })
                            setDlightAssignEditing(false)
                            await logAction({
                              action: 'UPDATE_ASSIGNMENT',
                              user,
                              targetId: `d-light_${delightAssignDate}`,
                              targetType: 'ASSIGNMENT',
                              department: 'D Light',
                              details: { serviceDate: delightAssignDate, before, after },
                            })
                          } catch (err) {
                            console.error('Save error:', err)
                            const reason = err?.code === 'permission-denied'
                              ? 'You don’t have permission to save D-Light assignments.'
                              : (err?.message || 'Please try again.')
                            setDlightAssignError(`Failed to save assignments. ${reason}`)
                            setTimeout(() => setDlightAssignError(null), 5000)
                          } finally {
                            setSavingDelightAssignments(false)
                          }
                        }}
                        className="px-4 py-1.5 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-60 shadow-sm"
                      >
                        {savingDelightAssignments ? 'Saving…' : 'Save plan'}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleDlightSharePlan}
                        disabled={dlightSharingPlan}
                        title="Copy / Export JPEG"
                        aria-label="Copy / Export JPEG"
                        className="p-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors disabled:opacity-60"
                      >
                        <Download className="w-5 h-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDlightAssignEditing(true)}
                        title="Edit Plan"
                        aria-label="Edit Plan"
                        className="p-2.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                      >
                        <Pencil className="w-5 h-5" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">Coming Sundays</span>
                  {upcomingSundaysList(5).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => { setDelightAssignDate(d); setDelightAssignDateWarning(false) }}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                        delightAssignDate === d
                          ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-orange-500 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-300 hover:border-amber-400 hover:text-amber-700 hover:bg-amber-50'
                      }`}
                    >
                      {format(new Date(d), 'dd/MM/yyyy')}
                    </button>
                  ))}
                  <DateInput
                    value={delightAssignDate}
                    onChange={(e) => {
                      const val = e.target.value
                      if (!val) return
                      const d = new Date(val + 'T00:00:00')
                      if (d.getDay() === 0) {
                        setDelightAssignDate(val)
                        setDelightAssignDateWarning(false)
                      } else {
                        // Not a Sunday — snap to whichever Sunday (before or after) is
                        // closer, since this date picks which dlight_assignments doc
                        // gets read/written.
                        const dow = d.getDay()
                        const snapped = new Date(d)
                        snapped.setDate(d.getDate() + (dow <= 3 ? -dow : 7 - dow))
                        setDelightAssignDate(format(snapped, 'yyyy-MM-dd'))
                        setDelightAssignDateWarning(true)
                      }
                    }}
                    title="Pick a custom Sunday date"
                    className="px-2 py-1 rounded-lg border border-slate-300 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-200"
                  />
                  <span className="text-xs text-slate-500">{formatDMY(delightAssignDate)}</span>
                </div>
                {delightAssignDateWarning && (
                  <p className="text-xs text-amber-600 font-medium">
                    ⚠ D-Light assignments only exist per-Sunday — snapped to the nearest Sunday ({formatDMY(delightAssignDate)}).
                  </p>
                )}
              </div>
              <div className="p-5 space-y-4">
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
                      <thead className="bg-gradient-to-r from-slate-100 to-slate-50">
                        <tr>
                          <th className="text-left px-4 py-2 text-slate-600 font-medium w-1/3">Role / Duty</th>
                          <th className="text-left px-4 py-2 text-slate-600 font-medium w-2/3">Assigned to</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {dlightAssignRows.map((row) => {
                          const targetKey = subDeptMatchKey(row.subDept)
                          const inThisSubDept = (m) => {
                            const memberSubDepts = liveSubDepts(m)
                            return !!row.subDept && memberSubDepts.some((s) => subDeptMatchKey(s) === targetKey)
                          }
                          // Strictly the members whose Team profile lists this duty's
                          // sub-department (same rule as Media's Assign). The team list is a
                          // live subscription, so ticking a sub-department on The Team shows
                          // here straight away. Members are placed in sub-departments on Team.
                          const options = team.filter((m) => !m.isFormer && m.status !== 'former' && inThisSubDept(m))
                          const assignedIds = Array.isArray(delightAssignments[row.key])
                            ? delightAssignments[row.key]
                            : (delightAssignments[row.key] ? [delightAssignments[row.key]] : [])
                          const addablePeople = options.filter((m) => !assignedIds.includes(m.id))
                          const removePerson = (id) => {
                            setDelightAssignments((prev) => {
                              const current = Array.isArray(prev[row.key]) ? prev[row.key] : []
                              return { ...prev, [row.key]: current.filter((x) => x !== id) }
                            })
                          }
                          const theme = dlightRoleTheme(row.subDept)
                          const addPerson = (id) => {
                            if (!id) return
                            setDelightAssignments((prev) => {
                              const current = Array.isArray(prev[row.key]) ? prev[row.key] : []
                              if (current.includes(id)) return prev
                              return { ...prev, [row.key]: [...current, id] }
                            })
                          }
                          return (
                            <tr key={row.key} className="hover:bg-slate-50">
                              <td className={`px-4 py-3 text-sm align-top border-l-4 ${row.accent}`}>
                                <div className="flex flex-col gap-1 items-start">
                                  <span className="text-slate-800 font-medium">{row.label}</span>
                                  {dlightAssignEditing && (
                                    <button
                                      type="button"
                                      onClick={() => delightAssignTriggerRefs.current[row.key]?.click()}
                                      disabled={addablePeople.length === 0}
                                      className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline whitespace-nowrap disabled:opacity-50 disabled:no-underline"
                                    >
                                      + Add {row.subDept}
                                    </button>
                                  )}
                                  {dlightAssignEditing && options.length === 0 && (
                                    <span className="text-[11px] text-amber-700">
                                      No team member is in {row.subDept} yet — tick it for them on the Team tab.
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-2">
                                <div className="flex flex-wrap gap-2 items-center min-h-[42px] p-2 bg-slate-50 border border-slate-200 rounded-lg">
                                  {assignedIds.length === 0 && !dlightAssignEditing ? (
                                    <span className="inline-flex items-center rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-500 ring-1 ring-inset ring-rose-200">
                                      -- Not assigned --
                                    </span>
                                  ) : (
                                    assignedIds.map((id) => {
                                      const m = team.find((x) => x.id === id)
                                      return (
                                        <span
                                          key={id}
                                          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${theme.pill}`}
                                        >
                                          {m?.name || 'Unknown member'}
                                          {dlightAssignEditing && (
                                            <button
                                              type="button"
                                              onClick={() => removePerson(id)}
                                              className="font-bold leading-none text-sm opacity-60 hover:opacity-100 hover:text-red-600"
                                              aria-label={`Remove ${m?.name || 'this person'}`}
                                            >
                                              ×
                                            </button>
                                          )}
                                        </span>
                                      )
                                    })
                                  )}
                                  {/* The Worship-style pill+portal picker (MemberPicker) — same component
                                      Worship/Media Assign use. value is always empty here since this is a
                                      pure "add another" control; existing assignees render as chips above,
                                      not inside this trigger. triggerRef lets the left "+ Add" link open it
                                      too, so both entry points share one picker instead of two UIs. Only
                                      mounted while editing — view-only mode is fixed tag chips only. */}
                                  {dlightAssignEditing && (
                                    <MemberPicker
                                      triggerRef={(el) => { delightAssignTriggerRefs.current[row.key] = el }}
                                      value=""
                                      members={addablePeople}
                                      tint={theme.avatar}
                                      getDetail={(m) => (Array.isArray(m.subDepartments) && m.subDepartments.length ? m.subDepartments.join(' · ') : (m.role || ''))}
                                      hideClearOption
                                      fitContent
                                      emptyLabel={assignedIds.length === 0 ? '-- Not assigned --' : (addablePeople.length === 0 ? 'No more eligible members' : '+ Add person')}
                                      onChange={(id) => addPerson(id)}
                                    />
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="text-xs text-slate-500">Assignments are saved to Firestore.</p>

                {/* Off-screen, purpose-built render for "Copy as Image" (handleDlightSharePlan
                    captures this, not the interactive table above) — same technique as
                    Worship's Assign tab (DepartmentWorship.jsx): a fixed single-column
                    branded layout, positioned off-canvas via a large negative offset (not
                    display:none, which html2canvas can't lay out or capture). */}
                <div
                  ref={dlightAssignShareRef}
                  aria-hidden="true"
                  style={{ position: 'fixed', top: 0, left: '-99999px', zIndex: -1, width: 480, background: '#ffffff' }}
                >
                  <div style={{ background: 'linear-gradient(135deg, #f97316 0%, #f59e0b 55%, #eab308 100%)', padding: '22px 26px' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase' }}>
                      River Of Life · D-Light
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#ffffff', marginTop: 6, lineHeight: 1.25 }}>
                      Ministry Roster
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.92)', marginTop: 4 }}>
                      {format(new Date(delightAssignDate + 'T12:00:00'), 'EEEE, dd/MM/yyyy')}
                    </div>
                  </div>
                  <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {dlightAssignRows.map((row) => {
                      const ids = Array.isArray(delightAssignments[row.key]) ? delightAssignments[row.key] : []
                      const names = ids.map((id) => team.find((m) => m.id === id)?.name).filter(Boolean)
                      const accent = dlightShareAccent(row.subDept)
                      return (
                        <div key={row.key} style={{
                          display: 'flex', flexDirection: 'column', gap: 5,
                          padding: '11px 14px', borderRadius: 10,
                          background: accent.bg, borderLeft: `4px solid ${accent.line}`,
                        }}>
                          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: accent.line }}>
                            {row.label}
                          </span>
                          {names.length === 0 ? (
                            <span style={{ fontSize: 15, fontWeight: 700, color: '#94a3b8', fontStyle: 'italic' }}>Unassigned</span>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {names.map((name) => (
                                <span key={name} style={{
                                  fontSize: 13, fontWeight: 700, color: '#1e293b',
                                  background: '#ffffff', borderRadius: 8, padding: '4px 10px',
                                  border: `1px solid ${accent.line}55`,
                                }}>
                                  {name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ padding: '4px 22px 20px', textAlign: 'center', fontSize: 10.5, color: '#94a3b8', fontWeight: 600 }}>
                    Generated from ROL Admin App
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* "Plan copied/downloaded as image" confirmation for the D-Light Assign
              tab's "Copy as Image" button above. */}
          <AnimatePresence>
            {slug === 'd-light' && activeTab === 'assign' && dlightShareToast && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-slate-900 text-white text-sm font-medium shadow-lg"
              >
                <CheckCircle2 size={16} className="text-emerald-400" />
                {dlightShareToast}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Save-plan error banner — replaces window.alert() so a permission-denied
              (or any other) save failure reads as a dismissible in-page toast. */}
          <AnimatePresence>
            {slug === 'd-light' && activeTab === 'assign' && dlightAssignError && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 max-w-[calc(100vw-2rem)] px-4 py-2.5 rounded-full bg-rose-600 text-white text-sm font-medium shadow-lg"
              >
                <AlertTriangle size={16} className="text-rose-100 flex-shrink-0" />
                <span className="truncate">{dlightAssignError}</span>
                <button
                  type="button"
                  onClick={() => setDlightAssignError(null)}
                  className="text-rose-100 hover:text-white flex-shrink-0"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── D-Light Archives tab — every past Sunday's saved duty roster ── */}
          {slug === 'd-light' && activeTab === 'archives' && (
            <div className="space-y-3 pb-20">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="h-1.5 bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400" />
                <div className="px-5 py-4 bg-gradient-to-r from-orange-50 via-white to-amber-50 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-slate-800">Archives</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Every Sunday&apos;s saved team assignments and the visitors logged that day.
                    </p>
                  </div>
                  {dlightArchives.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const allOpen = dlightArchives.every((a) => openDlightArchiveIds[a.id])
                        const next = {}
                        if (!allOpen) dlightArchives.forEach((a) => { next[a.id] = true })
                        setOpenDlightArchiveIds(next)
                      }}
                      className="text-xs text-slate-500 hover:text-amber-600 underline"
                    >
                      {dlightArchives.every((a) => openDlightArchiveIds[a.id]) ? 'Collapse all' : 'Expand all'}
                    </button>
                  )}
                </div>
              </div>

              {loadingDlightArchives ? (
                <div className="py-10 text-center text-slate-400 text-sm">Loading archives…</div>
              ) : dlightArchives.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-sm">
                  No Sundays archived yet — save a plan in the Assign tab and it will appear here.
                </div>
              ) : (
                <div className="space-y-2">
                  {dlightArchives.map((week) => {
                    const isOpen = !!openDlightArchiveIds[week.id]
                    const idsOf = (raw) => (Array.isArray(raw) ? raw.filter(Boolean) : (raw ? [raw] : []))
                    const shownKeys = new Set(dlightAssignRows.map((r) => r.key))
                    const rows = [
                      ...dlightAssignRows,
                      // a past week's duty whose sub-department was since removed
                      ...Object.keys(week.assignments || {})
                        .filter((k) => !shownKeys.has(k) && idsOf(week.assignments[k]).length)
                        .map((k) => DLIGHT_ASSIGN_ROWS.find((r) => r.key === k)
                          || { key: k, label: 'Removed sub-department', subDept: '', accent: 'border-l-slate-300' }),
                    ].map((row) => ({ ...row, ids: idsOf(week.assignments?.[row.key]) }))
                    const assignedCount = rows.reduce((s, r) => s + r.ids.length, 0)
                    const weekVisitors = delightVisitors.filter(
                      (v) => String(v.attendedDate || '').slice(0, 10) === week.serviceDate
                    )
                    let dateLabel = week.serviceDate
                    try { dateLabel = format(new Date(week.serviceDate + 'T00:00:00'), 'EEE, dd/MM/yyyy') } catch { /* keep raw */ }
                    return (
                      <div key={week.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setOpenDlightArchiveIds((prev) => ({ ...prev, [week.id]: !prev[week.id] }))}
                          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-amber-50/40 transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 text-sm truncate">{dateLabel}</p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {assignedCount} assigned
                              {weekVisitors.length > 0 && ` · ${weekVisitors.length} visitor${weekVisitors.length === 1 ? '' : 's'}`}
                              {assignedCount === 0 && weekVisitors.length === 0 && ' · nothing recorded'}
                            </p>
                          </div>
                          <span className={`text-slate-400 text-sm flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                        </button>

                        {isOpen && (
                          <div className="border-t border-slate-100 px-4 py-3 space-y-3">
                            <div className="space-y-1.5">
                              {rows.map((row) => (
                                <div key={row.key} className={`flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border-l-4 ${row.accent}`}>
                                  <span className="text-xs text-slate-600 font-medium flex-1 min-w-[180px]">{row.label}</span>
                                  {row.ids.length === 0 ? (
                                    <span className="text-xs text-slate-400 italic">Not assigned</span>
                                  ) : (
                                    <div className="flex flex-wrap gap-1.5">
                                      {row.ids.map((id) => {
                                        const m = team.find((x) => x.id === id)
                                        return (
                                          <span
                                            key={id}
                                            className={`px-2.5 py-1 rounded-full text-xs font-medium ${dlightRoleTheme(row.subDept).pill}`}
                                          >
                                            {m?.name || 'Unknown member'}
                                          </span>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>

                            {weekVisitors.length > 0 && (
                              <div>
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                                  Visitors logged this Sunday
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {weekVisitors.map((v) => (
                                    <span
                                      key={v.id}
                                      className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200"
                                    >
                                      {v.name}
                                      {v.onlyVisit && <span className="ml-1 text-slate-400">· Only Visit</span>}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            <p className="text-[11px] text-slate-400">
                              {week.updatedBy ? `Last saved by ${week.updatedBy}` : 'Last saved'}
                              {week.updatedAt ? ` · ${formatTimestampFull(week.updatedAt)}` : ''}
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {slug === 'media' && activeTab === 'assign' && (() => {
            const activeMembers = team.filter((m) => !m.isFormer && m.status !== 'former')
            const memberDetail = (m) => (Array.isArray(m.subDepartments) && m.subDepartments.length ? m.subDepartments.join(' · ') : (m.role || ''))
            const memberSubDepts = (m) => (Array.isArray(m.subDepartments) ? m.subDepartments : (m.subDepartment ? [m.subDepartment] : []))
            // Only members whose Team profile lists this sub-department (case / spacing /
            // plural tolerant, same as D-Light's Assign).
            const eligibleFor = (roleName) => activeMembers.filter((m) => memberSubDepts(m).some((s) => subDeptMatchKey(s) === subDeptMatchKey(roleName)))
            const addablePeopleFor = (row) => eligibleFor(row.role).filter((m) => !(row.members || []).some((am) => am.id === m.id))
            const addPersonToRow = (subDeptId, id, name) => {
              if (!id) return
              setMediaAssignRows((prev) => prev.map((r) => {
                if (r.subDeptId !== subDeptId) return r
                if ((r.members || []).some((m) => m.id === id)) return r
                return { ...r, members: [...(r.members || []), { id, name }] }
              }))
            }
            const removePersonFromRow = (subDeptId, id) => {
              setMediaAssignRows((prev) => prev.map((r) =>
                r.subDeptId === subDeptId ? { ...r, members: (r.members || []).filter((m) => m.id !== id) } : r
              ))
            }
            return (
              <div className="space-y-4">
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
                    <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-emerald-500 to-amber-500" />
                    <div className="px-5 py-4 border-b border-slate-200 space-y-3 bg-gradient-to-r from-indigo-50 via-white to-amber-50">
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="font-semibold text-slate-800">Assign media crew</h2>
                        {/* View-only action controls sit opposite the title, as compact
                            icon buttons — editing's Cancel/Save Plan stay below, next to
                            the Coming Sundays picker, since they're a different mode. */}
                        {canEdit && !mediaAssignEditing && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={handleMediaSharePlan}
                              disabled={mediaSharingPlan}
                              title="Copy / Export JPEG"
                              aria-label="Copy / Export JPEG"
                              className="p-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors disabled:opacity-60"
                            >
                              <Download className="w-5 h-5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setMediaAssignEditing(true)}
                              title="Edit Plan"
                              aria-label="Edit Plan"
                              className="p-2.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                            >
                              <Pencil className="w-5 h-5" />
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">Coming Sundays</span>
                          {mediaUpcomingSundays(5).map((d) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => setMediaAssignDate(d)}
                              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${mediaAssignDate === d ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400 hover:text-indigo-700 hover:bg-indigo-50'}`}
                            >
                              {format(new Date(d), 'dd/MM/yyyy')}
                            </button>
                          ))}
                          <DateInput
                            value={mediaAssignDate}
                            onChange={(e) => { if (e.target.value) setMediaAssignDate(mediaSnapToSunday(e.target.value)) }}
                            className="px-2 py-1 text-sm rounded-lg border border-slate-300 text-slate-600"
                            title="Pick a custom Sunday date"
                          />
                        </div>
                        {canEdit && mediaAssignEditing && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              disabled={mediaAssignSaving}
                              onClick={() => {
                                setMediaAssignRows(
                                  mediaAssignStamp?.rows
                                    ? mediaAssignStamp.rows.map((r) => ({ ...r, members: [...(r.members || [])] }))
                                    : subDepartments.map((sd) => ({ subDeptId: sd.id, role: sd.name, members: [] }))
                                )
                                setMediaAssignEditing(false)
                              }}
                              className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={mediaAssignSaving}
                              onClick={saveMediaAssignPlan}
                              className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 shadow-sm"
                            >
                              {mediaAssignSaving ? 'Saving…' : 'Save plan'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {loadingMediaSchedule || subDeptLoading ? (
                      <div className="p-5 text-center text-slate-500">Loading…</div>
                    ) : activeMembers.length === 0 ? (
                      <div className="p-5 text-center text-slate-500">Add team members on the The Team page first.</div>
                    ) : subDepartments.length === 0 ? (
                      <div className="p-5 text-center text-slate-500">No sub-departments yet — add them on The Team page.</div>
                    ) : (
                      <>
                        {/* Mobile: one card per role */}
                        <div className="md:hidden grid grid-cols-1 gap-3 p-4">
                          {mediaAssignRows.map((r, i) => {
                            const accent = mediaRoleAccent(i)
                            const rowMembers = r.members || []
                            return (
                              <div key={r.subDeptId} className={`rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-2 border-l-4 ${accent.border}`}>
                                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${accent.pill}`}>{r.role}</span>
                                {mediaAssignEditing ? (
                                  <div className="flex flex-wrap gap-2 items-center min-h-[42px] p-2 bg-slate-50 border border-slate-200 rounded-lg">
                                    {rowMembers.map((m) => (
                                      <span key={m.id} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${accent.pill}`}>
                                        {getMemberDisplayName(team.find((tm) => tm.id === m.id) || m)}
                                        <button
                                          type="button"
                                          onClick={() => removePersonFromRow(r.subDeptId, m.id)}
                                          className="font-bold leading-none text-sm opacity-60 hover:opacity-100 hover:text-red-600"
                                          aria-label={`Remove ${m.name}`}
                                        >×</button>
                                      </span>
                                    ))}
                                    <MemberPicker
                                      value=""
                                      members={addablePeopleFor(r)}
                                      allMembers={activeMembers}
                                      tint={accent.avatar}
                                      getDetail={memberDetail}
                                      hideClearOption
                                      fitContent
                                      emptyLabel={rowMembers.length === 0 ? '-- Not assigned --' : (addablePeopleFor(r).length === 0 ? 'No more eligible members' : `+ Add ${r.role}`)}
                                      onChange={(id, name) => addPersonToRow(r.subDeptId, id, name)}
                                    />
                                  </div>
                                ) : rowMembers.length ? (
                                  <div className="flex flex-wrap gap-1.5">
                                    {rowMembers.map((m) => (
                                      <span key={m.id} className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold ${accent.pill}`}>{getMemberDisplayName(team.find((tm) => tm.id === m.id) || m)}</span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 ring-1 ring-inset ring-rose-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> -- Not assigned --
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>

                        {/* Desktop: table */}
                        <table className="hidden md:table w-full">
                          <thead className="bg-gradient-to-r from-slate-100 to-slate-50">
                            <tr>
                              <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 w-[240px]">Role / Slot</th>
                              <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">Assigned To</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {mediaAssignRows.map((r, i) => {
                              const accent = mediaRoleAccent(i)
                              const rowMembers = r.members || []
                              const addable = addablePeopleFor(r)
                              return (
                                <tr key={r.subDeptId} className={`hover:bg-indigo-50/40 border-l-4 ${accent.border}`}>
                                  <td className="px-5 py-4 align-top">
                                    <div className="flex flex-col gap-1 items-start">
                                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${accent.pill}`}>{r.role}</span>
                                      {mediaAssignEditing && (
                                        <button
                                          type="button"
                                          onClick={() => mediaAssignTriggerRefs.current[r.subDeptId]?.click()}
                                          disabled={addable.length === 0}
                                          className={`text-[11px] font-semibold whitespace-nowrap hover:underline disabled:opacity-50 disabled:no-underline ${accent.label}`}
                                        >
                                          + Add {r.role}
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-5 py-4 align-top">
                                    {mediaAssignEditing ? (
                                      <div className="flex flex-wrap gap-2 items-center min-h-[42px] p-2 bg-slate-50 border border-slate-200 rounded-lg">
                                        {rowMembers.map((m) => (
                                          <span key={m.id} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${accent.pill}`}>
                                            {getMemberDisplayName(team.find((tm) => tm.id === m.id) || m)}
                                            <button
                                              type="button"
                                              onClick={() => removePersonFromRow(r.subDeptId, m.id)}
                                              className="font-bold leading-none text-sm opacity-60 hover:opacity-100 hover:text-red-600"
                                              aria-label={`Remove ${m.name}`}
                                            >×</button>
                                          </span>
                                        ))}
                                        <MemberPicker
                                          triggerRef={(el) => { mediaAssignTriggerRefs.current[r.subDeptId] = el }}
                                          value=""
                                          members={addable}
                                          allMembers={activeMembers}
                                          tint={accent.avatar}
                                          getDetail={memberDetail}
                                          hideClearOption
                                          fitContent
                                          emptyLabel={rowMembers.length === 0 ? '-- Not assigned --' : (addable.length === 0 ? 'No more eligible members' : '+ Add person')}
                                          onChange={(id, name) => addPersonToRow(r.subDeptId, id, name)}
                                        />
                                      </div>
                                    ) : rowMembers.length ? (
                                      <div className="flex flex-wrap gap-1.5">
                                        {rowMembers.map((m) => (
                                          <span key={m.id} className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold ${accent.pill}`}>{getMemberDisplayName(team.find((tm) => tm.id === m.id) || m)}</span>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 ring-1 ring-inset ring-rose-200">
                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> -- Not assigned --
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </>
                    )}
                  </div>

                {/* Off-screen, purpose-built render for "Copy / Export JPEG" (handleMediaSharePlan
                    captures this, not the interactive content above) — same convention as
                    Worship's assignTableRef / D-Light's dlightAssignShareRef: a fixed
                    single-column layout in inline hex (html2canvas can't render Tailwind's
                    oklch() colors), positioned off-canvas rather than display:none. */}
                <div
                  ref={mediaAssignShareRef}
                  aria-hidden="true"
                  style={{ position: 'fixed', top: 0, left: '-99999px', zIndex: -1, width: 480, background: '#ffffff' }}
                >
                  <div style={{ background: 'linear-gradient(135deg, #6366f1 0%, #10b981 55%, #f59e0b 100%)', padding: '22px 26px' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase' }}>
                      River Of Life · Media
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#ffffff', marginTop: 6, lineHeight: 1.25 }}>
                      Assign Media Crew
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.92)', marginTop: 4 }}>
                      {(() => { try { return format(new Date(mediaAssignDate + 'T12:00:00'), 'EEEE, dd/MM/yyyy') } catch { return mediaAssignDate } })()}
                    </div>
                  </div>
                  <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {mediaAssignRows.map((r, i) => {
                      const accent = mediaShareAccent(i)
                      const rowMembers = r.members || []
                      return (
                        <div key={r.subDeptId} style={{
                          display: 'flex', flexDirection: 'column', gap: 3,
                          padding: '11px 14px', borderRadius: 10,
                          background: accent.bg, borderLeft: `4px solid ${accent.line}`,
                        }}>
                          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: accent.line }}>
                            {r.role}
                          </span>
                          <span style={{ fontSize: 15, fontWeight: 700, color: rowMembers.length ? '#1e293b' : '#94a3b8', fontStyle: rowMembers.length ? 'normal' : 'italic' }}>
                            {rowMembers.length ? rowMembers.map((m) => m.name).join(', ') : 'Unassigned'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ padding: '4px 22px 20px', textAlign: 'center', fontSize: 10.5, color: '#94a3b8', fontWeight: 600 }}>
                    Generated from ROL Admin App
                  </div>
                </div>

                {/* "Plan copied/downloaded as image" confirmation for the "Copy / Export JPEG" button above. */}
                <AnimatePresence>
                  {mediaShareToast && (
                    <motion.div
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 16 }}
                      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-slate-900 text-white text-sm font-medium shadow-lg"
                    >
                      <CheckCircle2 size={16} className="text-emerald-400" />
                      {mediaShareToast}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })()}

          {usesGenericSubDepartmentCollection(slug) && slug !== 'media' && slug !== 'river-kids' && (activeTab === 'subDepartment' || (activeTab === 'operations' && opsSubTab === 'subDepartment')) && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex justify-end items-center gap-2">
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSubDept(null)
                      setSubDeptForm({ name: '', servingArea: '', category: '' })
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
                        {canEdit && <th className="text-left px-2 py-3 font-medium text-slate-600 w-20">Order</th>}
                        <th className="text-left px-4 py-3 font-medium text-slate-600">Sub Department</th>
                        {canEdit && <th className="text-right px-4 py-3 font-medium text-slate-600 w-16">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {subDepartments.map((row, rowIndex) => (
                        <tr key={row.id}>
                          {canEdit && (
                            <td className="px-2 py-2">
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => moveSubDepartment(row.id, -1)}
                                  disabled={rowIndex === 0 || subDeptReordering}
                                  className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 transition-colors"
                                  aria-label={`Move ${row.name || 'sub department'} up`}
                                  title="Move up"
                                >
                                  <ChevronUp className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveSubDepartment(row.id, 1)}
                                  disabled={rowIndex === subDepartments.length - 1 || subDeptReordering}
                                  className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 transition-colors"
                                  aria-label={`Move ${row.name || 'sub department'} down`}
                                  title="Move down"
                                >
                                  <ChevronDown className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          )}
                          <td className="px-4 py-3 text-slate-800 font-medium">{row.name || '—'}</td>
                          {canEdit && (
                            <td className="px-4 py-3 text-right relative">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setSubDeptActionsMenuId(id => id === row.id ? null : row.id) }}
                                className="w-8 h-8 inline-flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                                aria-label="Row actions"
                              >
                                ⋮
                              </button>
                              {subDeptActionsMenuId === row.id && (
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  className="absolute right-4 top-full mt-1 w-32 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden z-10 text-left"
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSubDeptActionsMenuId(null)
                                      setEditingSubDept(row)
                                      setSubDeptForm({ name: row.name || '', servingArea: row.servingArea || '', category: '' })
                                      setGenericSubDeptModalOpen(true)
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs font-medium text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      setSubDeptActionsMenuId(null)
                                      if (!window.confirm('Delete this sub department?')) return
                                      try {
                                        await deleteDepartmentSubDepartment(row.id)
                                        setSubDepartments((prev) => prev.filter((x) => x.id !== row.id))
                                      } catch (err) {
                                        console.error(err)
                                        alert('Failed to delete')
                                      }
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors"
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                      {subDepartments.length === 0 && (
                        <tr>
                          <td colSpan={canEdit ? 3 : 1} className="px-4 py-8 text-center text-slate-500">
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

          {/* River Kids Sub Department tab: two-pane split view — a left nav of the fixed
              categories (Sunday School / River Kids-1 / River Kids-2, plus a catch-all
              "Other" for anything without a recognized category) and a right pane showing
              only the selected category's nested sub-departments. Replaces the earlier
              design of stacking all three category cards (plus a 4th "Other" card)
              on screen simultaneously, which duplicated the same three names as both
              section headers and — for the flat rows seeded before the `category` field
              existed — as items listed again under "Other". "Other" itself was later
              dropped entirely (see the sub-department load effect, which now deletes
              those legacy uncategorized rows instead of just hiding them). */}
          {slug === 'river-kids' && (activeTab === 'subDepartment' || (activeTab === 'operations' && opsSubTab === 'subDepartment')) && (() => {
            const rkSubDeptCategories = RK_CLASS_GROUPS
            const itemsForCategory = (key) => subDepartments.filter((sd) => sd.category === key)
            const activeCategory = rkSubDeptCategories.find((c) => c.key === rkSubDeptCategoryTab) || rkSubDeptCategories[0]
            const activeItems = itemsForCategory(activeCategory.key)
            return (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {subDeptLoading ? (
                  <div className="px-5 py-5 text-center text-slate-500">Loading…</div>
                ) : (
                  <div className="flex flex-col md:flex-row">
                    {/* Left nav pane */}
                    <div className="md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-slate-100 bg-slate-50/60 p-2 flex flex-wrap md:flex-col md:flex-nowrap gap-1">
                      {rkSubDeptCategories.map((cat) => {
                        const count = itemsForCategory(cat.key).length
                        const isActive = activeCategory.key === cat.key
                        return (
                          <button
                            key={cat.key}
                            type="button"
                            onClick={() => setRkSubDeptCategoryTab(cat.key)}
                            className={`shrink-0 md:shrink-0 flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-left transition-colors ${
                              isActive ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-800'
                            }`}
                          >
                            <span>{cat.label}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-500'}`}>
                              {count}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                    {/* Right detail pane — exclusively the selected category's items */}
                    <div className="flex-1 p-5 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <span className="text-sm font-bold text-slate-800">{activeCategory.label}</span>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSubDept(null)
                              setSubDeptForm({ name: '', servingArea: '', category: activeCategory.key })
                              setGenericSubDeptModalOpen(true)
                            }}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
                          >
                            + Add Sub-Department
                          </button>
                        )}
                      </div>
                      {activeItems.length === 0 ? (
                        <p className="text-sm text-slate-400">No sub-departments yet.</p>
                      ) : (
                        <div className="space-y-1 pl-3 border-l-2 border-slate-100">
                          {activeItems.map(renderSubDeptRow)}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {subDeptError && <p className="px-5 py-2 text-sm text-red-600">{subDeptError}</p>}
              </div>
            )
          })()}

          {genericSubDeptModalOpen && canEdit && (
            <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 max-w-md w-full z-50">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h3 className="text-lg font-bold text-slate-800">
                    {editingSubDept ? 'Edit Sub Department' : 'Add Sub Department'}
                    {subDeptForm.category && (
                      <span className="block text-xs font-medium text-indigo-500 mt-0.5">{rkClassGroupLabel(subDeptForm.category)}</span>
                    )}
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setGenericSubDeptModalOpen(false)
                      setEditingSubDept(null)
                      setSubDeptForm({ name: '', servingArea: '', category: '' })
                    }}
                    className="-mt-1 -mr-1 w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex-shrink-0 transition-colors text-xl leading-none"
                    aria-label="Close"
                  >×</button>
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
                          category: subDeptForm.category || '',
                        })
                        setSubDepartments((prev) =>
                          prev.map((sd) =>
                            sd.id === editingSubDept.id
                              ? { ...sd, name: subDeptForm.name.trim(), servingArea: (subDeptForm.servingArea || '').trim(), category: subDeptForm.category || '' }
                              : sd
                          )
                        )
                      } else {
                        const id = await addDepartmentSubDepartment(
                          department.name,
                          subDeptForm.name.trim(),
                          userProfile?.email || 'unknown',
                          (subDeptForm.servingArea || '').trim(),
                          subDeptForm.category || ''
                        )
                        setSubDepartments((prev) => [
                          ...prev,
                          {
                            id,
                            department: department.name,
                            name: subDeptForm.name.trim(),
                            servingArea: (subDeptForm.servingArea || '').trim(),
                            category: subDeptForm.category || '',
                          },
                        ])
                      }
                      setGenericSubDeptModalOpen(false)
                      setEditingSubDept(null)
                      setSubDeptForm({ name: '', servingArea: '', category: '' })
                      setSubDeptError('')
                    } catch (err) {
                      console.error(err)
                      setSubDeptError('Failed to save sub department.')
                    }
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-slate-900 mb-1">Sub Department *</label>
                    <input
                      type="text"
                      value={subDeptForm.name}
                      onChange={(e) => setSubDeptForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="e.g., Audio Engineering"
                      className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-colors"
                      required
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm transition-all">
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGenericSubDeptModalOpen(false)
                        setEditingSubDept(null)
                        setSubDeptForm({ name: '', servingArea: '', category: '' })
                      }}
                      className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-medium text-sm transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* The standalone D-Light "Sub Department" page (and its own Add modal) that
              used to render here was removed 2026-09 — sub-department management now
              lives solely in the Team tab's "+ Add Sub Department" modal below, which
              already covers create/edit/delete against this same dlightTeamSubOpts /
              getDlightSubDepartments() data. See the opsSub effect above for the
              redirect that replaces this page for any stale ?opsSub=subDepartment link. */}

          {activeTab === 'events' && slug === 'caring' && (
            <CaringEventsTab
              canEdit={!!canEdit}
              canReveal={canRevealSurpriseNames(userProfile, isFounder)}
              savedBy={userProfile?.displayName || userProfile?.email || ''}
              defaultOfficiant={seniorPastorName || ''}
            />
          )}

          {activeTab === 'pcs' && slug === 'caring' && (
            <PcsTab
              allCellMembers={allCellMembers}
              canEdit={canEdit}
              cellGroups={cellGroups}
              cellReferralTasks={cellReferralTasks}
              closePcsProfile={closePcsProfile}
              delightVisitors={delightVisitors}
              isFounder={isFounder}
              isSeniorPastor={isSeniorPastor}
              isSeniorPastorName={isSeniorPastorName}
              loadingPCS={loadingPCS}
              onPipelineChanged={onPipelineChanged}
              pcsAddNotifications={pcsAddNotifications}
              pcsCaringEvents={pcsCaringEvents}
              pcsCellReferralTasks={pcsCellReferralTasks}
              pcsCellReportsByCellId={pcsCellReportsByCellId}
              pcsEditingId={pcsEditingId}
              pcsEntries={pcsEntries}
              pcsEntryApps={pcsEntryApps}
              pcsExpandedContext={pcsExpandedContext}
              pcsExpandedForm={pcsExpandedForm}
              pcsExpandedId={pcsExpandedId}
              pcsExpandedLoading={pcsExpandedLoading}
              pcsExpandedProfile={pcsExpandedProfile}
              pcsExpandedVisitor={pcsExpandedVisitor}
              pcsFormDirty={pcsFormDirty}
              pcsFormerForRec={pcsFormerForRec}
              pcsInviteStatus={pcsInviteStatus}
              pcsIsMobile={pcsIsMobile}
              pcsMembershipApp={pcsMembershipApp}
              pcsPhotoFile={pcsPhotoFile}
              pcsPhotoPreview={pcsPhotoPreview}
              pcsProfileClickInsideRef={pcsProfileClickInsideRef}
              pcsSavedRef={pcsSavedRef}
              pcsSearchQuery={pcsSearchQuery}
              pcsShowFormer={pcsShowFormer}
              rkChildrenForPCS={rkChildrenForPCS}
              SENIOR_PASTOR_FULL_TITLE={SENIOR_PASTOR_FULL_TITLE}
              SENIOR_PASTOR_TITLE={SENIOR_PASTOR_TITLE}
              setCellReferralTasks={setCellReferralTasks}
              setDelightVisitorForm={setDelightVisitorForm}
              setDelightVisitorModalOpen={setDelightVisitorModalOpen}
              setEditingDelightVisitorId={setEditingDelightVisitorId}
              setPcsAddNotifications={setPcsAddNotifications}
              setPcsEditingId={setPcsEditingId}
              setPcsEntries={setPcsEntries}
              setPcsExpandedContext={setPcsExpandedContext}
              setPcsExpandedForm={setPcsExpandedForm}
              setPcsExpandedId={setPcsExpandedId}
              setPcsExpandedLoading={setPcsExpandedLoading}
              setPcsExpandedProfile={setPcsExpandedProfile}
              setPcsExpandedVisitor={setPcsExpandedVisitor}
              setPcsFormDirty={setPcsFormDirty}
              setPcsInviteStatus={setPcsInviteStatus}
              setPcsPhotoFile={setPcsPhotoFile}
              setPcsPhotoPreview={setPcsPhotoPreview}
              setPcsSearchQuery={setPcsSearchQuery}
              setPcsShowFormer={setPcsShowFormer}
              sundayAttendanceWeeks={sundayAttendanceWeeks}
              user={user}
              userProfile={userProfile}
            />
          )}

          {(activeTab === 'team' || (activeTab === 'operations' && opsSubTab === 'team' && slug !== 'media')) && (
            <div className={`bg-white rounded-xl border border-slate-200 shadow-sm space-y-6 ${slug === 'media' ? 'p-6' : 'p-5'} ${slug === 'd-light' ? 'w-full' : ''}`}>
              <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-slate-800">{slug === 'media' ? 'The Team' : 'Team'}</h2>
                {canEdit && (
                  <div className="flex items-center gap-2">
                    {(slug === 'd-light' || slug === 'media') && (
                      <button
                        type="button"
                        onClick={() => {
                          setTeamSubDeptEditingId(null)
                          setTeamSubDeptNewDraft({ name: '', servingArea: '' })
                          setTeamSubDeptModalOpen(true)
                        }}
                        className="px-3 py-1.5 rounded-lg border border-indigo-600 text-indigo-600 text-xs font-medium hover:bg-indigo-50 active:bg-indigo-100 transition-colors"
                      >
                        + Add Sub Department
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
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
                          isDirector: false,
                          memberType: 'core',
                          notes: '',
                          visitorId: '',
                          source: '',
                          childId: '',
                        })
                        setShowAddMemberModal(true)
                      }}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700"
                    >
                      + Add member
                    </button>
                  </div>
                )}
              </div>

              {/* Team tab's own Sub-Department create/edit/delete modal — triggered by
                  the "+ Add Sub Department" header button above. Reads/writes whichever
                  collection this slug actually uses (dlightTeamSubOpts + the D-Light-only
                  Firestore functions, or the shared subDepartments state + generic
                  functions for Media/others) so the Add/Edit Member form's Sub-Department
                  pills (subDeptOptionList, derived from these same two state vars) update
                  immediately — no separate Sub Dept tab needed. */}
              {teamSubDeptModalOpen && (() => {
                const isDlight = slug === 'd-light'
                const rows = isDlight ? dlightTeamSubOpts : subDepartments
                const startEdit = (row) => {
                  setTeamSubDeptEditingId(row.id)
                  setTeamSubDeptEditDraft({ name: row.name || '', servingArea: row.servingArea || '' })
                }
                const cancelEdit = () => { setTeamSubDeptEditingId(null); setTeamSubDeptEditDraft({ name: '', servingArea: '' }) }
                const saveEdit = async () => {
                  const name = teamSubDeptEditDraft.name.trim()
                  if (!name) return
                  setTeamSubDeptSaving(true)
                  try {
                    const servingArea = teamSubDeptEditDraft.servingArea.trim()
                    if (isDlight) {
                      await updateDlightSubDepartment(teamSubDeptEditingId, { name, servingArea })
                      setDlightTeamSubOpts((prev) => prev.map((r) => (r.id === teamSubDeptEditingId ? { ...r, name, servingArea } : r)))
                    } else {
                      await updateDepartmentSubDepartment(teamSubDeptEditingId, { name, servingArea })
                      setSubDepartments((prev) => prev.map((r) => (r.id === teamSubDeptEditingId ? { ...r, name, servingArea } : r)))
                    }
                    cancelEdit()
                  } catch (err) {
                    console.error(err)
                    alert('Failed to save sub-department')
                  } finally {
                    setTeamSubDeptSaving(false)
                  }
                }
                const removeRow = async (row) => {
                  if (!window.confirm(`Delete "${row.name}"?`)) return
                  try {
                    if (isDlight) {
                      await deleteDlightSubDepartment(row.id)
                      setDlightTeamSubOpts((prev) => prev.filter((r) => r.id !== row.id))
                    } else {
                      await deleteDepartmentSubDepartment(row.id)
                      setSubDepartments((prev) => prev.filter((r) => r.id !== row.id))
                    }
                  } catch (err) {
                    console.error(err)
                    alert('Failed to delete sub-department')
                  }
                }
                const addNew = async () => {
                  const name = teamSubDeptNewDraft.name.trim()
                  if (!name || (!isDlight && !department?.name)) return
                  setTeamSubDeptSaving(true)
                  try {
                    const servingArea = teamSubDeptNewDraft.servingArea.trim()
                    if (isDlight) {
                      const id = await addDlightSubDepartment({ name, servingArea }, userProfile?.email || userProfile?.displayName || 'unknown')
                      setDlightTeamSubOpts((prev) => [...prev, { id, name, servingArea }])
                    } else {
                      const id = await addDepartmentSubDepartment(department.name, name, userProfile?.email || 'unknown', servingArea)
                      setSubDepartments((prev) => [...prev, { id, department: department.name, name, servingArea, category: '' }])
                    }
                    setTeamSubDeptNewDraft({ name: '', servingArea: '' })
                  } catch (err) {
                    console.error(err)
                    alert('Failed to add sub-department')
                  } finally {
                    setTeamSubDeptSaving(false)
                  }
                }
                return (
                  <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setTeamSubDeptModalOpen(false)}>
                    <div className="rol-solid bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
                        <h3 className="font-semibold text-slate-900 dark:text-white">Sub-Departments</h3>
                        <button
                          type="button"
                          onClick={() => setTeamSubDeptModalOpen(false)}
                          className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                          aria-label="Close"
                        >×</button>
                      </div>
                      <div className="flex-1 min-h-0 max-h-[60vh] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                        {rows.length === 0 && (
                          <p className="px-5 py-6 text-center text-sm text-slate-500">No sub-departments yet — add one below.</p>
                        )}
                        {rows.map((row, rowIndex) => (
                          <div key={row.id} className="px-5 py-3 flex items-start gap-2">
                            {/* Reorder (generic collection only — D-Light's sub-departments
                                live in dlight_sub_departments with no order field). */}
                            {!isDlight && teamSubDeptEditingId !== row.id && (
                              <div className="flex flex-col -my-1 flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={() => moveSubDepartment(row.id, -1)}
                                  disabled={rowIndex === 0 || subDeptReordering}
                                  className="w-6 h-5 inline-flex items-center justify-center rounded text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                                  aria-label={`Move ${row.name || 'sub-department'} up`}
                                  title="Move up"
                                >
                                  <ChevronUp className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveSubDepartment(row.id, 1)}
                                  disabled={rowIndex === rows.length - 1 || subDeptReordering}
                                  className="w-6 h-5 inline-flex items-center justify-center rounded text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                                  aria-label={`Move ${row.name || 'sub-department'} down`}
                                  title="Move down"
                                >
                                  <ChevronDown className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                            {teamSubDeptEditingId === row.id ? (
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  value={teamSubDeptEditDraft.name}
                                  onChange={(e) => setTeamSubDeptEditDraft((f) => ({ ...f, name: e.target.value }))}
                                  placeholder="Name"
                                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                />
                                <input
                                  type="text"
                                  value={teamSubDeptEditDraft.servingArea}
                                  onChange={(e) => setTeamSubDeptEditDraft((f) => ({ ...f, servingArea: e.target.value }))}
                                  placeholder="Serving area (optional)"
                                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                />
                                <div className="flex gap-2">
                                  <button type="button" disabled={teamSubDeptSaving} onClick={saveEdit} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-60">
                                    {teamSubDeptSaving ? 'Saving…' : 'Save'}
                                  </button>
                                  <button type="button" onClick={cancelEdit} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50">
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm font-medium text-slate-900 dark:text-white truncate">
                                  {row.name || '—'}
                                  {row.servingArea && <span className="ml-1.5 text-xs font-normal text-slate-500">· {row.servingArea}</span>}
                                </span>
                                <span className="flex items-center gap-3 flex-shrink-0">
                                  <button type="button" onClick={() => startEdit(row)} className="text-indigo-600 hover:underline text-xs font-medium">Edit</button>
                                  <button type="button" onClick={() => removeRow(row)} className="text-red-600 hover:underline text-xs font-medium">Delete</button>
                                </span>
                              </div>
                            )}
                            </div>
                          </div>
                        ))}
                      </div>
                      {!isDlight && subDeptError && (
                        <p className="px-5 py-2 text-xs text-red-600 border-t border-slate-100">{subDeptError}</p>
                      )}
                      <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 space-y-2 flex-shrink-0">
                        <input
                          type="text"
                          value={teamSubDeptNewDraft.name}
                          onChange={(e) => setTeamSubDeptNewDraft((f) => ({ ...f, name: e.target.value }))}
                          placeholder="New sub-department name"
                          className="rol-solid w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                        <input
                          type="text"
                          value={teamSubDeptNewDraft.servingArea}
                          onChange={(e) => setTeamSubDeptNewDraft((f) => ({ ...f, servingArea: e.target.value }))}
                          placeholder="Serving area (optional)"
                          className="rol-solid w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                        <button
                          type="button"
                          disabled={teamSubDeptSaving || !teamSubDeptNewDraft.name.trim()}
                          onClick={addNew}
                          className="w-full py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                        >
                          {teamSubDeptSaving ? 'Adding…' : '+ Add Sub Department'}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* ── Sub-Departments (Media only) — managed exclusively here ── */}
              {slug === 'media' && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setMediaSubDeptPanelOpen((o) => !o)}
                      className="flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-900"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`text-slate-400 transition-transform ${mediaSubDeptPanelOpen ? 'rotate-180' : ''}`}>
                        <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Sub-Departments
                      <span className="text-xs font-medium text-slate-400">({subDepartments.length})</span>
                    </button>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSubDept(null)
                          setSubDeptForm({ name: '', servingArea: '' })
                          setGenericSubDeptModalOpen(true)
                        }}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
                      >
                        + Add Sub-Department
                      </button>
                    )}
                  </div>
                  {mediaSubDeptPanelOpen && (
                    <div className="border-t border-slate-200 bg-white">
                      {subDeptLoading ? (
                        <div className="px-4 py-4 text-center text-sm text-slate-500">Loading…</div>
                      ) : subDepartments.length === 0 ? (
                        <div className="px-4 py-5 text-center text-sm text-slate-500">
                          No sub-departments yet. Add one to organize your team.
                        </div>
                      ) : (
                        <ul className="divide-y divide-slate-100">
                          {subDepartments.map((row) => (
                            <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                              <span className="text-sm font-medium text-slate-800">
                                {row.name || '—'}
                                {row.servingArea && <span className="ml-1.5 text-xs font-normal text-slate-400">· {row.servingArea}</span>}
                              </span>
                              {canEdit && (
                                <span className="space-x-2 flex-shrink-0">
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
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {subDeptError && <p className="px-4 py-2 text-sm text-red-600">{subDeptError}</p>}
                    </div>
                  )}
                </div>
              )}

              {(() => {
                const isFormerMember = (m) => !!m.isFormer || m.status === 'former'
                // Director(s) pinned to the top of the active roster, then Core Members
                // above Guest Volunteers — a former director/core member doesn't get
                // pinned in the Former Members view, since that list is about history,
                // not who's currently in charge or how they're classified.
                const activeTeamMembers = team
                  .filter((m) => !isFormerMember(m))
                  .sort((a, b) => {
                    const dirDiff = (b.isDirector ? 1 : 0) - (a.isDirector ? 1 : 0)
                    if (dirDiff !== 0) return dirDiff
                    return (a.memberType === 'guest' ? 1 : 0) - (b.memberType === 'guest' ? 1 : 0)
                  })
                const formerTeamMembers = team.filter(isFormerMember)
                const rosterTeam = teamShowFormerMembers ? formerTeamMembers : activeTeamMembers
                // Serving-area filter — a member matches if any of their sub-department
                // names resolves (via subDeptServingAreaByName) to the selected area.
                const memberSubDeptNames = (m) => Array.isArray(m.subDepartments) && m.subDepartments.length
                  ? m.subDepartments
                  : (m.subDepartment ? [m.subDepartment] : [])
                const filteredRosterTeam = teamServingAreaFilter
                  ? rosterTeam.filter((m) => memberSubDeptNames(m).some((n) => subDeptServingAreaByName.get(n) === teamServingAreaFilter))
                  : rosterTeam
                // Row treatment for the pinned director: indigo tint plus a left accent
                // bar, kept through hover so it doesn't wash out to the usual slate.
                // Every other row carries a transparent bar of the same width so the
                // accent never nudges their cells sideways. Side-specific `border-l-*`
                // colors on purpose — plain `border-transparent` would also blank out
                // the row's slate bottom border and the tbody's divide-y.
                const rosterRowCls = (m, hoverCls) => {
                  if (teamShowFormerMembers) return `border-l-4 border-l-transparent bg-slate-50/60 opacity-75 ${hoverCls}`
                  if (m.isDirector) return 'border-l-4 border-l-indigo-600 bg-indigo-50/50 hover:bg-indigo-50'
                  return `border-l-4 border-l-transparent ${hoverCls}`
                }
                return (
                <>
                {/* Active Members / Former Members roster split — isolates the two
                    tables below instead of mixing former volunteers into the main
                    list; "Former" stays disabled when there's nobody to show there. */}
                {team.length > 0 && (
                  <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100">
                    <button
                      type="button"
                      onClick={() => setTeamShowFormerMembers(false)}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                        !teamShowFormerMembers ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Active Members ({activeTeamMembers.length})
                    </button>
                    <button
                      type="button"
                      disabled={formerTeamMembers.length === 0}
                      onClick={() => setTeamShowFormerMembers(true)}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        teamShowFormerMembers ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Former Members ({formerTeamMembers.length})
                    </button>
                  </div>
                )}

                {/* Serving-area filter — narrows the roster to members whose
                    sub-department resolves to this specific serving area (e.g. two
                    "Offering" sub-depts with different serving areas both show up in
                    the pills above, but only one group matches here at a time). */}
                {teamServingAreaOptions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Serving Area</span>
                    <select
                      value={teamServingAreaFilter}
                      onChange={(e) => setTeamServingAreaFilter(e.target.value)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    >
                      <option value="">All Serving Areas</option>
                      {teamServingAreaOptions.map((area) => (
                        <option key={area} value={area}>{area}</option>
                      ))}
                    </select>
                    {teamServingAreaFilter && (
                      <button
                        type="button"
                        onClick={() => setTeamServingAreaFilter('')}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}

              {loadingTeam ? (
                <div className="py-4 text-sm text-slate-500">Loading team...</div>
              ) : filteredRosterTeam.length === 0 ? (
                <div className="py-4 text-sm text-slate-500">
                  {teamServingAreaFilter
                    ? 'No members match this serving area.'
                    : (teamShowFormerMembers ? 'No former members.' : 'No active members yet.')}
                </div>
              ) : slug === 'd-light' ? (
                // Spacious master-list table — same overall shape as the shared table
                // below (used by Media/other slugs), but with the generous row padding
                // and typography this roster's own spec calls for, rather than being
                // forced to match Media's tighter table density.
                //
                // table-fixed + single-line truncation on every cell keeps every row a
                // uniform height regardless of name length or how many sub-departments
                // someone has — a member with 3+ sub-departments used to stretch their
                // row across multiple lines, throwing off alignment with every other
                // row. Only the first sub-department shows now, plus a "+N more" badge;
                // the full untruncated list lives in the Member Details drawer (click
                // anywhere on the row to open it).
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full table-fixed">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left py-4 px-6 text-xs font-semibold uppercase tracking-wider text-slate-400 w-16">S. No.</th>
                        <th className="text-left py-4 px-6 text-xs font-semibold uppercase tracking-wider text-slate-400 w-[32%]">Name</th>
                        <th className="text-left py-4 px-6 text-xs font-semibold uppercase tracking-wider text-slate-400 w-[30%]">Sub-Department</th>
                        <th className="text-left py-4 px-6 text-xs font-semibold uppercase tracking-wider text-slate-400 w-[22%]">Member Since</th>
                        {canEdit && (
                          <th className="text-right py-4 px-6 text-xs font-semibold uppercase tracking-wider text-slate-400 w-14" aria-label="Actions" />
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRosterTeam.map((m, idx) => {
                        const subDepts = liveSubDepts(m)
                        const menuOpen = teamActionMenuId === m.id
                        const firstSubDept = subDepts[0]
                        const firstSubDeptArea = firstSubDept ? subDeptServingAreaByName.get(firstSubDept) : null
                        return (
                          <tr
                            key={m.id}
                            className={`h-16 border-b border-slate-100 transition-colors cursor-pointer ${rosterRowCls(m, 'hover:bg-slate-50/70')}`}
                            onClick={() => openMemberDetail(m, null, { dlightTeam: true })}
                          >
                            <td className="py-4 px-6 text-sm text-slate-500 align-middle">{idx + 1}</td>
                            <td className="py-4 px-6 align-middle overflow-hidden">
                              <div className="flex items-center gap-2 flex-nowrap">
                                <div className={`w-9 h-9 rounded-full text-sm font-bold flex items-center justify-center flex-shrink-0 ${m.isDirector && !teamShowFormerMembers ? 'bg-indigo-600 text-white' : teamShowFormerMembers ? 'bg-slate-200 text-slate-500' : 'bg-indigo-100 text-indigo-700'}`}>
                                  {(m.name || '?').charAt(0).toUpperCase()}
                                </div>
                                <span className="text-base font-semibold text-slate-800 truncate max-w-[180px]">{getMemberDisplayName(m)}</span>
                                <span className={`flex-shrink-0 whitespace-nowrap inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${m.memberType === 'guest' ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
                                  {m.memberType === 'guest' ? 'Guest Volunteer' : 'Core'}
                                </span>
                                {m.isDirector && !teamShowFormerMembers && (
                                  <span className="flex-shrink-0 whitespace-nowrap inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200">
                                    ⭐ Director
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-4 px-6 align-middle overflow-hidden">
                              {subDepts.length === 0 ? (
                                <span className="text-sm font-medium text-slate-400">—</span>
                              ) : (
                                <div className="flex items-center gap-1.5 flex-nowrap">
                                  <div className={`inline-flex flex-col min-w-0 px-3 py-1 rounded-lg border leading-tight ${teamShowFormerMembers ? 'bg-slate-100 text-slate-500 border-slate-200' : subDeptPillColor(firstSubDept)}`}>
                                    <span className="text-sm font-semibold truncate max-w-[140px]">{firstSubDept}</span>
                                    {firstSubDeptArea && <span className="text-xs font-normal text-slate-500 truncate max-w-[140px]">{firstSubDeptArea}</span>}
                                  </div>
                                  {subDepts.length > 1 && (
                                    <span className="flex-shrink-0 whitespace-nowrap text-xs font-semibold text-slate-500 bg-slate-100 rounded-full px-2 py-1">
                                      +{subDepts.length - 1} more
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="py-4 px-6 text-sm text-slate-600 align-middle overflow-hidden">
                              {renderMemberSinceCell(m)}
                            </td>
                            {canEdit && (
                              <td className="py-4 px-6 text-sm text-right whitespace-nowrap align-middle" onClick={(e) => e.stopPropagation()}>
                                <div className="relative inline-block text-left">
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setTeamActionMenuId(menuOpen ? null : m.id) }}
                                    className="w-9 h-9 inline-flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                                    title="More options"
                                  >
                                    <svg width="16" height="16" viewBox="0 0 4 16" fill="currentColor">
                                      <circle cx="2" cy="2" r="1.5" /><circle cx="2" cy="8" r="1.5" /><circle cx="2" cy="14" r="1.5" />
                                    </svg>
                                  </button>
                                  {menuOpen && (
                                    <>
                                      <div className="fixed inset-0 z-10" onClick={() => setTeamActionMenuId(null)} />
                                      <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-xl border border-slate-200 shadow-lg py-1 min-w-[170px]">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setTeamActionMenuId(null)
                                            setEditingMember(m)
                                            setMemberForm({
                                              name: m.name || '', role: m.role || '',
                                              subDepartment: m.subDepartment || '', subDepartments: subDepts,
                                              phone: m.phone || '', status: m.status || 'active',
                                              memberSince: m.memberSince || new Date().toISOString().slice(0, 10),
                                              isFormer: !!m.isFormer, isDirector: !!m.isDirector, memberType: m.memberType === 'guest' ? 'guest' : 'core', notes: m.notes || '',
                                              visitorId: m.visitorId || '', source: m.source || '', childId: m.childId || '',
                                            })
                                          }}
                                          className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 font-medium flex items-center gap-2"
                                        >
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                                          Edit Member
                                        </button>
                                        <button
                                          type="button"
                                          onClick={async (e) => {
                                            e.stopPropagation()
                                            setTeamActionMenuId(null)
                                            if (!window.confirm('Remove this member from team?')) return
                                            await deleteDepartmentTeamMember(m.id)
                                            setTeam((prev) => prev.filter((x) => x.id !== m.id))
                                          }}
                                          className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 font-medium flex items-center gap-2"
                                        >
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                                          Delete Member
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <>
                <div className={`overflow-x-auto ${slug === 'media' ? 'rounded-xl border border-slate-200' : ''}`}>
                  {(() => {
                    // Media's "The Team" master table gets a more spacious, larger-type
                    // treatment (bigger container, roomier rows) than the compact table
                    // every other department's Team tab still uses.
                    const isMedia = slug === 'media'
                    // Sub-Department column — Media originally, now also Sunday Ministry
                    // and River Kids (see the matching picker in the Add/Edit Member
                    // modal below), so an assigned sub-department shows as a tag next
                    // to the member's name on these rosters too.
                    const showSubDeptCol = slug === 'media' || slug === 'sunday-ministry' || slug === 'river-kids'
                    const thCls = isMedia
                      ? 'text-left py-4 px-5 text-sm font-semibold uppercase tracking-wider text-slate-500'
                      : 'text-left px-4 py-2 text-slate-600 font-medium'
                    const tdCls = isMedia ? 'py-4 px-5' : 'px-4 py-2'
                    return (
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className={`${thCls} w-10`}>SL</th>
                        <th className={`${thCls} ${isMedia ? 'w-1/4' : ''}`}>Name</th>
                        {showSubDeptCol && (
                          <th className={`${thCls} w-2/5`}>Sub-Department</th>
                        )}
                        <th className={`${thCls} ${isMedia ? 'w-40' : ''}`}>Member since</th>
                        {canEdit && (
                          <th className={`${thCls} ${isMedia ? 'w-16' : ''}`}>{isMedia ? '' : 'Actions'}</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRosterTeam.map((m, idx) => {
                        const durationDays = m.memberSince
                          ? differenceInDays(new Date(), new Date(m.memberSince))
                          : null
                        const positionsText = m.role || ''
                        const memberSubDepts = liveSubDepts(m)
                        return (
                        <tr
                          key={m.id}
                          className={`transition-colors ${slug === 'media' ? 'cursor-pointer' : ''} ${rosterRowCls(m, slug === 'media' ? 'hover:bg-slate-50/80' : 'hover:bg-slate-50')}`}
                          onClick={slug === 'media' ? () => openMemberDetail(m, null, { mediaTeam: true }) : undefined}
                        >
                          <td className={`${tdCls} text-slate-600`}>{idx + 1}</td>
                          <td className={tdCls}>
                            <div className="flex items-center gap-2 flex-wrap">
                              {slug === 'media' && (
                                <span className={`w-9 h-9 rounded-full text-sm font-bold flex items-center justify-center flex-shrink-0 ${m.isDirector && !teamShowFormerMembers ? 'bg-indigo-600 text-white' : teamShowFormerMembers ? 'bg-slate-200 text-slate-500' : 'bg-indigo-100 text-indigo-700'}`}>
                                  {(m.name || '?').charAt(0).toUpperCase()}
                                </span>
                              )}
                              <span className={isMedia ? 'text-base font-semibold text-slate-800' : 'text-slate-800 font-medium'}>{getMemberDisplayName(m)}</span>
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${m.memberType === 'guest' ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
                                {m.memberType === 'guest' ? 'Guest Volunteer' : 'Core'}
                              </span>
                              {m.isDirector && !teamShowFormerMembers && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200">
                                  ⭐ Director
                                </span>
                              )}
                              {m.childId && (
                                <span className={isMedia ? 'text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-700' : 'text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700'}>River Kids</span>
                              )}
                              {isFounder && ((m.visitorId || m.childId)
                                ? <span className={isMedia ? 'text-xs font-semibold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700' : 'text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700'}>🔗 Linked</span>
                                : <span className={isMedia ? 'text-xs font-medium px-2 py-1 rounded-full bg-slate-100 text-slate-400' : 'text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400'}>Unlinked</span>
                              )}
                            </div>
                          </td>
                          {showSubDeptCol && (
                            <td className={tdCls}>
                              <div className="flex flex-wrap gap-1.5">
                                {memberSubDepts.length === 0 ? (
                                  <span className="text-xs font-medium px-3 py-1 rounded-full bg-slate-100 text-slate-400">Unassigned</span>
                                ) : memberSubDepts.map((sd) => {
                                  const area = subDeptServingAreaByName.get(sd)
                                  return (
                                    <div key={sd} className={`inline-flex flex-col px-3 py-1 rounded-lg border leading-tight ${teamShowFormerMembers ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-indigo-50 text-indigo-600 border-indigo-100'}`}>
                                      <span className="text-xs font-semibold">{sd}</span>
                                      {area && <span className="text-[11px] font-normal text-slate-500">{area}</span>}
                                    </div>
                                  )
                                })}
                              </div>
                            </td>
                          )}
                          <td className={`${tdCls} text-slate-600`}>
                            {renderMemberSinceCell(m)}
                          </td>
                          {canEdit && (() => {
                            const openEdit = () => {
                              setEditingMember(m)
                              const subDepts = liveSubDepts(m)
                              setMemberForm({
                                name: m.name || '',
                                role: m.role || '',
                                subDepartment: m.subDepartment || '',
                                subDepartments: subDepts,
                                phone: m.phone || '',
                                status: m.status || 'active',
                                memberSince: m.memberSince || new Date().toISOString().slice(0, 10),
                                isFormer: !!m.isFormer,
                                isDirector: !!m.isDirector,
                                memberType: m.memberType === 'guest' ? 'guest' : 'core',
                                notes: m.notes || '',
                                visitorId: m.visitorId || '',
                                source: m.source || '',
                                childId: m.childId || '',
                              })
                            }
                            const removeMember = async () => {
                              if (!window.confirm('Remove this member from team?')) return
                              await deleteDepartmentTeamMember(m.id)
                              setTeam((prev) => prev.filter((x) => x.id !== m.id))
                            }
                            if (slug === 'media') {
                              const menuOpen = teamActionMenuId === m.id
                              return (
                                <td className={`${tdCls} text-sm whitespace-nowrap`} onClick={(e) => e.stopPropagation()}>
                                  <div className="relative inline-block text-left">
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setTeamActionMenuId(menuOpen ? null : m.id) }}
                                      className="w-10 h-10 inline-flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                                      title="More options"
                                    >
                                      <svg width="18" height="18" viewBox="0 0 4 16" fill="currentColor">
                                        <circle cx="2" cy="2" r="1.5" /><circle cx="2" cy="8" r="1.5" /><circle cx="2" cy="14" r="1.5" />
                                      </svg>
                                    </button>
                                    {menuOpen && (
                                      <>
                                        <div className="fixed inset-0 z-10" onClick={() => setTeamActionMenuId(null)} />
                                        <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-xl border border-slate-200 shadow-lg py-1 min-w-[160px]">
                                          <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setTeamActionMenuId(null); openEdit() }}
                                            className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 font-medium flex items-center gap-2"
                                          >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                                            Edit Member
                                          </button>
                                          {isFounder && (
                                            <button
                                              type="button"
                                              onClick={(e) => { e.stopPropagation(); setTeamActionMenuId(null); setTeamMemberLinking(m) }}
                                              className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 font-medium flex items-center gap-2"
                                            >
                                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                                              {m.visitorId ? 'Relink' : 'Link'}
                                            </button>
                                          )}
                                          <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setTeamActionMenuId(null); removeMember() }}
                                            className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 font-medium flex items-center gap-2"
                                          >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                                            Delete Member
                                          </button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </td>
                              )
                            }
                            return (
                              <td className="px-4 py-2 text-sm space-x-2 whitespace-nowrap">
                                <button type="button" onClick={openEdit} className="text-blue-600 hover:underline">Edit</button>
                                <button type="button" onClick={() => setTeamMemberLinking(m)} className="text-indigo-600 hover:underline">{m.visitorId ? 'Relink' : 'Link'}</button>
                                <button type="button" onClick={removeMember} className="text-red-600 hover:underline">Delete</button>
                              </td>
                            )
                          })()}
                        </tr>
                      )})}
                    </tbody>
                  </table>
                    )
                  })()}
                </div>
                </>
              )}
                </>
                )
              })()}

              <AnimatePresence>
              {canEdit && (showAddMemberModal || editingMember) && (
                // Fixed-overlay drawer (bottom sheet on mobile, centered modal from sm: up)
                // — was an inline expanding section with no backdrop, which on a short
                // mobile viewport meant the form could render partly off-screen with no
                // scroll and no way to dismiss except the small × button. max-h + overflow-y
                // here fixes the clipping; the backdrop's own onClick gives tap-to-dismiss.
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4"
                  onClick={() => { setShowAddMemberModal(false); setEditingMember(null); setTeamMemberSearch('') }}
                >
                <motion.div
                  ref={addMemberSectionRef}
                  initial={{ y: 40, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 40, opacity: 0 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
                >
                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    if (!editingMember && !memberForm.visitorId && !memberForm.childId) {
                      setTeamError('You must select a person from the People\'s Directory or River Kids. New people can only be added by the D Light Director via Visitor Entry.')
                      return
                    }
                    try {
                      if (editingMember) {
                        // Stamp today's date the moment isFormer flips true (locking their
                        // tenure calc there — see getMemberTenureEnd); leave an
                        // already-former member's formerDate untouched (undefined = "don't
                        // change" in updateDepartmentTeamMember); clear it on reactivation.
                        const formerDate = memberForm.isFormer
                          ? (editingMember.isFormer ? undefined : new Date().toISOString().slice(0, 10))
                          : ''
                        await updateDepartmentTeamMember(editingMember.id, { ...memberForm, formerDate })
                        setTeam((prev) =>
                          prev.map((m) => (m.id === editingMember.id
                            ? { ...m, ...memberForm, formerDate: formerDate === undefined ? m.formerDate : formerDate }
                            : m))
                        )
                      } else {
                        // A person can already be on this department's roster (e.g. from an
                        // earlier sub-department assignment). Match on their linked directory
                        // / River Kids id and merge into that record instead of inserting a
                        // second `department_team_members` doc, which used to render as a
                        // duplicate row for the same person.
                        const identityKey = memberForm.visitorId || (memberForm.childId ? `child:${memberForm.childId}` : '')
                        const existingMember = identityKey
                          ? team.find((m) => (m.visitorId || (m.childId ? `child:${m.childId}` : '')) === identityKey)
                          : null
                        if (existingMember) {
                          const mergedSubDepts = Array.from(new Set([
                            ...(existingMember.subDepartments || []),
                            ...(memberForm.subDepartments || []),
                          ]))
                          await addSubDepartmentsToTeamMember(existingMember.id, memberForm.subDepartments)
                          setTeam((prev) =>
                            prev.map((m) =>
                              m.id === existingMember.id
                                ? { ...m, subDepartments: mergedSubDepts, subDepartment: mergedSubDepts[0] || m.subDepartment }
                                : m
                            )
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
                      }
                      setTeamError('')
                      setEditingMember(null)
                      setTeamMemberSearch('')
                      setShowAddMemberModal(false)
                      setMemberForm({
                        name: '',
                        role: '',
                        subDepartment: '',
                        subDepartments: [],
                        phone: '',
                        status: 'active',
                        memberSince: new Date().toISOString().slice(0, 10),
                        isFormer: false,
                        isDirector: false,
                        memberType: 'core',
                        notes: '',
                        visitorId: '',
                        source: '',
                        childId: '',
                      })
                    } catch (err) {
                      console.error(err)
                      setTeamError('Failed to save team member.')
                    }
                  }}
                  className="p-5 sm:p-6 space-y-6"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-slate-900 leading-tight">
                        {editingMember ? 'Edit Team Member' : 'Add New Team Member'}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {editingMember ? 'Update the details below' : 'Must be selected from People\'s Directory'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setShowAddMemberModal(false); setEditingMember(null); setTeamMemberSearch('') }}
                      className="-mt-1 -mr-1 w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex-shrink-0 transition-colors text-xl leading-none"
                      aria-label="Close"
                    >×</button>
                  </div>

                  {/* Two clean columns: Left = who they are, Right = status/dates/actions —
                      replaces the old single stacked column. */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-5">
                  {/* Name / Search */}
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        Name <span className="text-indigo-400 font-normal">(from People&apos;s Directory)</span>
                      </label>
                      {editingMember ? (
                        <input
                          type="text"
                          required
                          value={memberForm.name}
                          onChange={(e) => setMemberForm((f) => ({ ...f, name: e.target.value }))}
                          className="w-full py-2.5 px-3 rounded-xl border border-slate-200 bg-slate-50 text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-colors"
                        />
                      ) : memberForm.name ? (
                        <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border-2 border-emerald-200 bg-emerald-50">
                          <span className="w-9 h-9 rounded-full bg-emerald-500 text-white text-sm font-bold flex items-center justify-center flex-shrink-0 shadow-sm">
                            {memberForm.name.charAt(0).toUpperCase()}
                          </span>
                          <span className="flex-1 text-sm font-semibold text-emerald-900">{memberForm.name}</span>
                          <button
                            type="button"
                            onClick={() => { setMemberForm((f) => ({ ...f, name: '', visitorId: '', source: '', childId: '' })); setTeamMemberSearch('') }}
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
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-base text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 focus:bg-white transition-colors disabled:opacity-60"
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
                                ) : matches.map((v) => {
                                  const isChild = v.source === 'river_kids'
                                  return (
                                  <button
                                    key={v.id}
                                    type="button"
                                    onMouseDown={() => {
                                      setMemberForm((f) => ({
                                        ...f,
                                        name: v.name,
                                        visitorId: isChild ? '' : v.id,
                                        childId: isChild ? v.childId : '',
                                        source: isChild ? 'river_kids' : '',
                                        phone: f.phone || v.phone || '',
                                      }))
                                      setTeamMemberSearch('')
                                      setTeamMemberSearchOpen(false)
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-50 text-left transition-colors border-b border-slate-50 last:border-0"
                                  >
                                    <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                                      {v.name.charAt(0).toUpperCase()}
                                    </span>
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-slate-800 truncate">
                                        {v.name}
                                        {isChild && (
                                          <span className="ml-1.5 align-middle text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">River Kids</span>
                                        )}
                                      </p>
                                      {v.phone && <p className="text-xs text-slate-400 truncate">{v.phone}</p>}
                                    </div>
                                  </button>
                                  )
                                })}
                              </div>
                            )
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Sub Department (D-Light, Media, Sunday Ministry, River Kids) */}
                    {(slug === 'd-light' || slug === 'media' || slug === 'sunday-ministry' || slug === 'river-kids') && (
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                          Sub Department
                        </label>
                        {subDeptOptionList.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">
                            {slug === 'media'
                              ? 'No sub-departments yet — add them in the Sub-Departments panel above.'
                              : slug === 'd-light'
                              ? 'No sub-departments yet — use "+ Add Sub Department" on the Team tab.'
                              : 'No sub-departments yet — add them from the Sub Department tab under Operations.'}
                          </p>
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
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-left transition-all ${
                                    selected ? 'bg-indigo-600 border-indigo-600' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                                  }`}
                                >
                                  {selected && <span className="text-[10px] text-white">✓</span>}
                                  {/* Name and serving area get visually distinct weight/color —
                                      the serving area reads as a lighter sub-label, never mistaken
                                      for the sub-department name itself (see requirement's "Offering
                                      1 - Left side" vs "Offering 2 - Right side" example). */}
                                  <span className="flex flex-col leading-tight">
                                    <span className={`text-xs font-semibold ${selected ? 'text-white' : 'text-slate-700'}`}>{sd.name}</span>
                                    {sd.servingArea && (
                                      <span className={`text-[11px] font-normal ${selected ? 'text-indigo-200' : 'text-slate-400'}`}>{sd.servingArea}</span>
                                    )}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right column: status, dates, and the submit/cancel actions */}
                  <div className="space-y-5">
                    {/* Status + Member Since row */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                          Status
                        </label>
                        <div className="flex gap-2">
                          {['active', 'inactive'].map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setMemberForm((f) => ({ ...f, status: s }))}
                              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
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
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                          Member Since
                        </label>
                        <DateInput
                          value={memberForm.memberSince}
                          onChange={(e) => setMemberForm((f) => ({ ...f, memberSince: e.target.value }))}
                          className="w-full py-2.5 px-3 rounded-lg border border-slate-200 bg-slate-50 text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-colors"
                        />
                      </div>
                    </div>

                    {/* Member Type — Core Member vs Guest Volunteer. Core members are
                        pinned above Guest Volunteers in the roster table (after the
                        Director-first sort), each with its own pill badge there. */}
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        Member Type
                      </label>
                      <div className="flex gap-2">
                        {[
                          { key: 'core', label: 'Core Member' },
                          { key: 'guest', label: 'Guest Volunteer' },
                        ].map((opt) => (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => setMemberForm((f) => ({ ...f, memberType: opt.key }))}
                            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
                              (memberForm.memberType || 'core') === opt.key
                                ? opt.key === 'core'
                                  ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm'
                                  : 'bg-amber-500 text-white border-amber-500 shadow-sm'
                                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
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

                    {/* Team Director toggle — pins them to the top of the active
                        roster table with a highlighted "Director" badge. */}
                    <label className="flex items-center gap-3 cursor-pointer select-none group">
                      <div className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 ${memberForm.isDirector ? 'bg-indigo-500' : 'bg-slate-200'}`}
                        onClick={() => setMemberForm((f) => ({ ...f, isDirector: !f.isDirector }))}>
                        <div className={`w-5 h-5 bg-white rounded-full shadow-md mt-0.5 transition-transform ${memberForm.isDirector ? 'translate-x-4.5' : 'translate-x-0.5'}`} style={{ transform: memberForm.isDirector ? 'translateX(18px)' : 'translateX(2px)' }} />
                      </div>
                      <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">Mark as team director</span>
                    </label>

                    {/* Actions — stacked full-width on mobile so two buttons plus their
                        padding never overflow a narrow viewport; side by side from sm: up. */}
                    <div className="flex flex-col sm:flex-row gap-3 pt-1">
                      <button
                        type="submit"
                        disabled={!editingMember && !memberForm.name}
                        className="w-full sm:flex-1 py-3 rounded-xl bg-indigo-600 text-white text-base font-bold hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm hover:shadow-md transition-all"
                      >
                        {editingMember ? 'Update Member' : 'Add Member'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditingMember(null); setTeamMemberSearch(''); setShowAddMemberModal(false); setMemberForm({ name: '', role: '', subDepartment: '', subDepartments: [], phone: '', status: 'active', memberSince: new Date().toISOString().slice(0, 10), isFormer: false, isDirector: false, memberType: 'core', notes: '', visitorId: '', source: '', childId: '' }) }}
                        className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                  </div>
                </form>
                </motion.div>
                </motion.div>
              )}
              </AnimatePresence>
            </div>
          )}

          {slug === 'river-kids' && (activeTab === 'register' || activeTab === 'attendance') && department && (
            <RiverKidsTabs
              activeTab={activeTab}
              department={department}
              canEdit={canEdit}
              canEditRkAttendance={canEditRkAttendance}
              userProfile={userProfile}
            />
          )}

          {slug === 'event-m' && (activeTab === 'events' || activeTab === 'liveControl') && department && (
            <EventManagementTabs
              activeTab={activeTab}
              department={department}
              canEdit={canEdit}
              userProfile={userProfile}
              onEditProgram={() => setActiveTab('events')}
            />
          )}

          {activeTab === 'cellGroups' && slug === 'cell' && (
            <div className="space-y-6">
              {/* One-cell rule — people currently listed more than once across the rosters */}
              {duplicateCellMemberGroups.length > 0 && (
                <div className="bg-white rounded-xl border border-red-200 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 bg-red-50 border-b border-red-100 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-red-800">Names in more than one cell</p>
                      <p className="text-xs text-red-500">A person may be in only one cell. Open a cell to remove or transfer the extra entry.</p>
                    </div>
                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                      {duplicateCellMemberGroups.length}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {duplicateCellMemberGroups.map((group) => (
                      <div key={group.map((m) => `${m.cellId}/${m.id}`).join('|')} className="px-4 py-2.5 flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-slate-900 mr-1">{group[0].name || '—'}</p>
                        {group.map((m) => {
                          const g = cellGroups.find((c) => c.id === m.cellId)
                          return (
                            <button
                              key={`${m.cellId}/${m.id}`}
                              type="button"
                              onClick={() => setExpandedCellId(m.cellId)}
                              className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700 hover:bg-red-100"
                              title={m.name !== group[0].name ? `Listed as "${m.name}"` : undefined}
                            >
                              {g?.cellName || g?.name || 'Unknown cell'}
                            </button>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detailsCellId && (() => {
                const c = cellGroups.find((g) => g.id === detailsCellId)
                if (!c) return null
                return (
                  <CellDetailsModal
                    cell={c}
                    members={allCellMembers.filter((m) => m.cellId === c.id && m.status !== 'inactive' && m.memberCategory !== 'former')}
                    onClose={() => setDetailsCellId(null)}
                    onManage={() => { setDetailsCellId(null); setExpandedCellId(c.id) }}
                  />
                )
              })()}

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
                      return (
                      <div key={cell.id} className={`relative ${expandedCellId === cell.id ? 'col-span-full' : ''} ${tileStyle.bg} ${tileStyle.text} rounded-xl overflow-hidden shadow-lg border ${expandedCellId === cell.id ? 'border-white/60 ring-2 ring-white/40' : 'border-white/20 hover:shadow-xl hover:-translate-y-0.5'} transition`}>
                        {cell.meetingDay && (
                          <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wide bg-black/20 rounded-full px-2 py-0.5">
                            {cell.meetingDay.slice(0, 3)}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => (expandedCellId === cell.id ? setExpandedCellId(null) : setDetailsCellId(cell.id))}
                          className="w-full text-left p-5 hover:opacity-95 transition"
                        >
                          <p className="text-xl font-semibold">{cell.cellName || 'Unnamed'}</p>
                          <p className="text-xs opacity-90 mt-0.5">{cell.leader || '—'}</p>
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
                                      const isDuplicate = duplicateCellMemberRowIds.has(`${cell.id}/${m.id}`)
                                      const nameKey = String(m.name || '').trim().toLowerCase()
                                      const isAbsent = !!nameKey && !cellRecentAttendedNames.has(nameKey)
                                      // "Newly Added" — createdAt is when the doc was added to this cell (not the
                                      // user-editable `since` date), so it can't be backdated and self-expires.
                                      const daysSinceAdded = m.createdAt ? differenceInDays(new Date(), new Date(m.createdAt)) : null
                                      const isNewMember = daysSinceAdded !== null && daysSinceAdded >= 0 && daysSinceAdded <= 14
                                      return (
                                        <div
                                          key={m.id}
                                          role="button"
                                          tabIndex={0}
                                          onClick={() => openMemberDetail(m, cell.id)}
                                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMemberDetail(m, cell.id) } }}
                                          className={`relative h-24 w-full flex flex-col justify-between rounded-2xl border p-3.5 shadow-sm transition-all hover:shadow-md cursor-pointer ${
                                            isDuplicate ? 'bg-red-50/70 border-red-200 hover:border-red-300'
                                            : isNewMember ? 'bg-emerald-50/40 border-emerald-300 hover:border-emerald-400'
                                            : 'bg-white border-slate-200 hover:border-indigo-200'
                                          }`}
                                        >
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                                                {isDuplicate && (
                                                  <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="This person is listed more than once across cell groups" />
                                                )}
                                                {isAbsent && (
                                                  <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="Not attended cell or Sunday service in over 4 weeks" />
                                                )}
                                                <p className={`font-bold text-sm truncate ${isDuplicate ? 'text-red-800' : 'text-slate-900'}`}>{m.name || '—'}</p>
                                                {isNewMember && (
                                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0">
                                                    ✨ New
                                                  </span>
                                                )}
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
                                            {(() => {
                                              // A member with no saved visitorId but a phone match in the D-Light
                                              // directory shows as Linked too — the auto-link effect above is
                                              // already persisting this match; showing "Unlinked" here in the
                                              // meantime would be a false-positive warning for a profile that
                                              // does have a matching central record.
                                              const autoMatched = m.visitorId ? null : findVisitorMatchForMember(m, cellVisitorsByPhone)
                                              return (m.visitorId || autoMatched) ? (
                                                <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Linked</span>
                                              ) : (
                                                <span title="No matching D-Light/PCS record found by phone — use Link to connect manually" className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100">Unlinked</span>
                                              )
                                            })()}
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
                                                      <button type="button" onClick={async () => {
                                                        setActiveMenuMemberId(null)
                                                        try {
                                                          await updateCellGroupMember(cell.id, m.id, { status: 'active' })
                                                          const list = await getCellGroupMembers(cell.id)
                                                          setCellMembers(list)
                                                          refreshAllCellMembers()
                                                        } catch (err) {
                                                          console.error('Failed to reactivate member', err)
                                                          alert(isCellMemberConflict(err) ? err.message : 'Failed to make active. Please try again.')
                                                        }
                                                      }} className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50 transition-colors">
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
                                            {(() => {
                                              // A member with no saved visitorId but a phone match in the D-Light
                                              // directory shows as Linked too — the auto-link effect above is
                                              // already persisting this match; showing "Unlinked" here in the
                                              // meantime would be a false-positive warning for a profile that
                                              // does have a matching central record.
                                              const autoMatched = m.visitorId ? null : findVisitorMatchForMember(m, cellVisitorsByPhone)
                                              return (m.visitorId || autoMatched) ? (
                                                <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Linked</span>
                                              ) : (
                                                <span title="No matching D-Light/PCS record found by phone — use Link to connect manually" className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100">Unlinked</span>
                                              )
                                            })()}
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
                    <DateInput value={newCellGroupForm.launchDate} onChange={(e) => setNewCellGroupForm((f) => ({ ...f, launchDate: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
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
                    <DateInput value={cellGroupEditForm.launchDate} onChange={(e) => setCellGroupEditForm((f) => ({ ...f, launchDate: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
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
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 text-sm font-bold flex items-center justify-center flex-shrink-0">
                      {(detailMember.name || '?').charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{detailMember.name || '—'}</p>
                        {detailMember.childId
                          ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">River Kids</span>
                          : (detailMember.visitorId
                            ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">🔗 Linked</span>
                            : null)}
                      </div>
                      {(() => {
                        const phone = detailMemberVisitor?.phone || detailMember.phone
                        const email = detailMemberProfile?.email || detailMemberVisitor?.email
                        return (
                          <>
                            {phone && <p className="text-xs text-slate-500 mt-0.5">{phone}</p>}
                            {email && <p className="text-xs text-slate-400 mt-0.5 truncate">{email}</p>}
                          </>
                        )
                      })()}
                    </div>
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
                      {!detailMember.visitorId && !detailMember.childId && (
                        <p className="text-xs text-slate-400 bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2">Not linked to a directory profile — limited details available.</p>
                      )}

                      {detailMemberContext?.mediaTeam && (() => {
                        const subDepts = liveSubDepts(detailMember)
                        const isActive = (detailMember.status || 'active') === 'active'
                        // Last 8 services, this member's assignments tallied by role.
                        const recent = [...detailMemberMediaAssignments]
                          .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                          .slice(0, 8)
                        const roleTally = {}
                        const servedDates = []
                        for (const s of recent) {
                          const mine = (s.assignments || []).filter((a) => a.memberId === detailMember.id || (a.memberName && a.memberName === detailMember.name))
                          if (mine.length) servedDates.push(s.date)
                          for (const a of mine) roleTally[a.role || '—'] = (roleTally[a.role || '—'] || 0) + 1
                        }
                        const roleRows = Object.entries(roleTally).sort((a, b) => b[1] - a[1])
                        return (
                          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                              <div className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />
                              <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Media Team</p>
                            </div>
                            <div className="px-3 py-3 space-y-3">
                              <div>
                                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Serving areas</p>
                                <div className="flex flex-wrap gap-1">
                                  {subDepts.length === 0
                                    ? <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">None assigned</span>
                                    : subDepts.map((sd) => (
                                      <span key={sd} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">{sd}</span>
                                    ))}
                                </div>
                              </div>

                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">On the team since</p>
                                  <p className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{detailMember.memberSince ? formatDMY(detailMember.memberSince) : '—'}</p>
                                </div>
                                {canEdit && (
                                  <button
                                    type="button"
                                    disabled={detailStatusSaving}
                                    onClick={async () => {
                                      const next = isActive ? 'inactive' : 'active'
                                      setDetailStatusSaving(true)
                                      try {
                                        await updateDepartmentTeamMember(detailMember.id, { status: next })
                                        setTeam((prev) => prev.map((x) => (x.id === detailMember.id ? { ...x, status: next } : x)))
                                        setDetailMember((d) => ({ ...d, status: next }))
                                      } catch (err) {
                                        console.error('Failed to update member status', err)
                                        alert('Could not update status.')
                                      } finally {
                                        setDetailStatusSaving(false)
                                      }
                                    }}
                                    className={`flex items-center gap-2 text-[11px] font-semibold ${detailStatusSaving ? 'opacity-50' : ''}`}
                                  >
                                    <span className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 ${isActive ? 'bg-emerald-400' : 'bg-slate-300'}`}>
                                      <span className="block w-4 h-4 bg-white rounded-full shadow mt-0.5 transition-transform" style={{ transform: isActive ? 'translateX(18px)' : 'translateX(2px)' }} />
                                    </span>
                                    <span className={isActive ? 'text-emerald-600' : 'text-slate-400'}>{isActive ? 'Active' : 'Inactive'}</span>
                                  </button>
                                )}
                              </div>

                              <div>
                                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Recent crew assignments</p>
                                {roleRows.length === 0 ? (
                                  <p className="text-[11px] text-slate-400">Not rostered in the last 8 services.</p>
                                ) : (
                                  <>
                                    <div className="flex flex-wrap gap-1">
                                      {roleRows.map(([role, n]) => (
                                        <span key={role} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{role} · {n}×</span>
                                      ))}
                                    </div>
                                    {servedDates.length > 0 && (
                                      <p className="text-[10px] text-slate-400 mt-1">Last: {servedDates.slice(0, 3).map((d) => formatDMY(d)).join(', ')}</p>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })()}

                      {detailMemberContext?.dlightTeam && (() => {
                        const subDepts = liveSubDepts(detailMember)
                        const isActive = (detailMember.status || 'active') === 'active'
                        const { end } = getMemberTenureEnd(detailMember)
                        const tenureText = detailMember.memberSince ? formatMemberDuration(detailMember.memberSince, end) : ''
                        return (
                          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                              <div className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />
                              <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">D-Light Team</p>
                            </div>
                            <div className="px-3 py-3 space-y-3">
                              <div className="flex flex-wrap gap-1.5">
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${detailMember.memberType === 'guest' ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
                                  {detailMember.memberType === 'guest' ? 'Guest Volunteer' : 'Core'}
                                </span>
                                {detailMember.isDirector && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200">
                                    ⭐ Director
                                  </span>
                                )}
                              </div>

                              <div>
                                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Sub-Departments</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {subDepts.length === 0
                                    ? <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">None assigned</span>
                                    : subDepts.map((sd) => {
                                      const area = subDeptServingAreaByName.get(sd)
                                      return (
                                        <span key={sd} className={`inline-flex flex-col px-2.5 py-1 rounded-lg border leading-tight ${subDeptPillColor(sd)}`}>
                                          <span className="text-[11px] font-semibold">{sd}</span>
                                          {area && <span className="text-[10px] font-normal text-slate-500">{area}</span>}
                                        </span>
                                      )
                                    })}
                                </div>
                              </div>

                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Member since</p>
                                  <p className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                                    {detailMember.memberSince ? formatDMY(detailMember.memberSince) : '—'}
                                    {tenureText && <span className="font-normal text-slate-400"> · {tenureText}</span>}
                                  </p>
                                </div>
                                {canEdit && (
                                  <button
                                    type="button"
                                    disabled={detailStatusSaving}
                                    onClick={async () => {
                                      const next = isActive ? 'inactive' : 'active'
                                      setDetailStatusSaving(true)
                                      try {
                                        await updateDepartmentTeamMember(detailMember.id, { status: next })
                                        setTeam((prev) => prev.map((x) => (x.id === detailMember.id ? { ...x, status: next } : x)))
                                        setDetailMember((d) => ({ ...d, status: next }))
                                      } catch (err) {
                                        console.error('Failed to update member status', err)
                                        alert('Could not update status.')
                                      } finally {
                                        setDetailStatusSaving(false)
                                      }
                                    }}
                                    className={`flex items-center gap-2 text-[11px] font-semibold ${detailStatusSaving ? 'opacity-50' : ''}`}
                                  >
                                    <span className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 ${isActive ? 'bg-emerald-400' : 'bg-slate-300'}`}>
                                      <span className="block w-4 h-4 bg-white rounded-full shadow mt-0.5 transition-transform" style={{ transform: isActive ? 'translateX(18px)' : 'translateX(2px)' }} />
                                    </span>
                                    <span className={isActive ? 'text-emerald-600' : 'text-slate-400'}>{isActive ? 'Active' : 'Inactive'}</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })()}

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

                      {!detailMemberContext?.mediaTeam && !detailMemberContext?.dlightTeam && !detailMemberVisitor && detailMemberMinistries.length === 0 && detailMemberCellAttendance.length === 0 && detailMemberSundayAttendance.length === 0 && (
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
                                transferOfExisting: true,
                                transferFromCellId: fromCellId,
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
                              alert(isCellMemberConflict(err) ? err.message : 'Failed to transfer member. Please try again.')
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
                          alert(isCellMemberConflict(err) ? err.message : 'Failed to save')
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
                                  <DateInput
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
                        <DateInput value={cellMemberForm.birthday} onChange={(e) => setCellMemberForm((f) => ({ ...f, birthday: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Anniversary (optional)</label>
                        <DateInput value={cellMemberForm.anniversary} onChange={(e) => setCellMemberForm((f) => ({ ...f, anniversary: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
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
                        <DateInput value={cellMemberForm.since} onChange={(e) => setCellMemberForm((f) => ({ ...f, since: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
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
                              <DateInput value={cellMemberForm.baptismDate} onChange={e => setCellMemberForm(f => ({ ...f, baptismDate: e.target.value }))} className="w-full px-2.5 py-1.5 rounded-lg border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-violet-700 dark:text-violet-300 mb-1">Baptism Place</label>
                              <input type="text" placeholder="Church / Location" value={cellMemberForm.baptismPlace} onChange={e => setCellMemberForm(f => ({ ...f, baptismPlace: e.target.value }))} className="w-full px-2.5 py-1.5 rounded-lg border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-violet-700 dark:text-violet-300 mb-1">Marriage Date</label>
                              <DateInput value={cellMemberForm.marriageDate} onChange={e => setCellMemberForm(f => ({ ...f, marriageDate: e.target.value }))} className="w-full px-2.5 py-1.5 rounded-lg border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500" />
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
                                    // Quick local check; addCellGroupMember re-checks every cell (incl. ones not loaded here).
                                    const vName = normalizeMemberName(v.name)
                                    const conflict = allCellMembers.find(m => m.status !== 'inactive' && m.cellId !== expandedCellId &&
                                      ((v.id && m.visitorId === v.id) || (vName && normalizeMemberName(m.name) === vName)))
                                    if (conflict) {
                                      const otherCell = cellGroups.find(c => c.id === conflict.cellId)
                                      alert(cellConflictMessage(otherCell?.cellName || otherCell?.name))
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
                                      alert(isCellMemberConflict(err) ? err.message : 'Failed to add member. Please try again.')
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
                    <DateInput value={budgetForm.expectedDate} onChange={(e) => setBudgetForm((f) => ({ ...f, expectedDate: e.target.value }))} className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
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
                    <DateInput
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
                <select
                  value={ff[field.key] || ''}
                  onChange={e => setFf(p => field.key === 'maritalStatus' ? withMaritalStatus(p, e.target.value)
                    : field.key === 'isFirstChurch' ? withIsFirstChurch(p, e.target.value)
                    : { ...p, [field.key]: e.target.value })}
                  className={inputCls}
                >
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
              <DateInput type={field.type} placeholder={field.placeholder || ''} value={ff[field.key] || ''} onChange={e => setFf(p => ({ ...p, [field.key]: e.target.value }))} className={inputCls} />
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
                        isFirstChurch: ff.isFirstChurch,
                        previousChurchName: ff.isFirstChurch === 'yes' ? '' : ff.previousChurchName,
                        previousChurchPlace: ff.isFirstChurch === 'yes' ? '' : ff.previousChurchPlace,
                        maritalStatus: ff.maritalStatus, marriageDate: ff.marriageDate, spouseName: ff.spouseName,
                        hasKids: ff.hasKids, children: ff.hasKids === 'yes' ? (ff.children || []).filter(c => c.name) : [],
                      }
                      // Never clobber existing data with a blank — only write fields the leader actually filled in.
                      const cleanPayload = Object.fromEntries(
                        Object.entries(payload).filter(([k, v]) => k === 'children' ||
                          // "First church: Yes" deliberately blanks any previous-church data on file.
                          (ff.isFirstChurch === 'yes' && (k === 'previousChurchName' || k === 'previousChurchPlace')) ||
                          (v !== '' && v !== null && v !== undefined))
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
      <DateInput
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
                  <DateInput
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
  const cls = 'flex-1 min-w-0 px-2 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 text-sm transition-colors'
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
                      {v.attendedDate && <span className="text-xs text-slate-400">{isoToDMY(v.attendedDate)}</span>}
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

