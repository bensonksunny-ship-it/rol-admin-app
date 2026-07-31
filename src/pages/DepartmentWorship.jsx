import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, CheckCircle2, Send, Download, Pencil, Trash2, MoreVertical, Wallet, Banknote, X } from 'lucide-react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import {
  getDepartmentEntries,
  addDepartmentEntry,
  getWorshipTeamMembers,
  addWorshipTeamMember,
  getWorshipScheduleByDate,
  getAllWorshipSchedules,
  updateWorshipScheduleById,
  setWorshipScheduleByDate,
  getWorshipRehearsals,
  getWorshipRehearsalByDate,
  addWorshipRehearsal,
  updateWorshipRehearsal,
  deleteWorshipRehearsal,
  updateWorshipTeamMember,
  deleteWorshipTeamMember,
  getWorshipBudgetItems,
  addWorshipBudgetItem,
  updateWorshipBudgetItem,
  deleteWorshipBudgetItem,
  getMergedPeopleDirectory,
  getWorshipApplications,
  getWorshipSongs,
  addWorshipSong,
  updateWorshipSong,
  deleteWorshipSong,
} from '../services/firestore'
import { useAuth } from '../context/AuthContext'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts'
import { format, subMonths, subDays, differenceInDays, differenceInYears, differenceInMonths, addYears, addMonths } from 'date-fns'
import { formatDMY } from '../utils/date'
import { isWorshipLeader, hasWorshipRoleAccess, getAllowedWorshipTabs } from '../utils/worshipAccess'
import { getDepartmentRole } from '../utils/access'
import { getDepartmentHubTabs } from '../constants/departmentTabs'
import DeptExpenseTab from '../components/DeptExpenseTab'
import AdvancePayoutTab from '../components/AdvancePayoutTab'
import BudgetPage from './accounts/BudgetPage'
import UpcomingSunday from './UpcomingSunday'
import SongDesigner from './worship/SongDesigner'
import SongViewer from './worship/SongViewer'

const DEPARTMENT = 'Worship'
const PERIOD = format(new Date(), 'yyyy-MM')

// Song directory cards cycle through these full color themes (gradient wash + title +
// chip) for distinct, vibrant pops rather than a flat white card with a thin accent line
const SONG_CARD_THEMES = [
  { border: 'border-indigo-500',  bg: 'bg-gradient-to-br from-indigo-50 to-white',   title: 'text-indigo-900',  chip: 'bg-indigo-100 text-indigo-700' },
  { border: 'border-violet-500',  bg: 'bg-gradient-to-br from-violet-50 to-white',   title: 'text-violet-900',  chip: 'bg-violet-100 text-violet-700' },
  { border: 'border-emerald-500', bg: 'bg-gradient-to-br from-emerald-50 to-white',  title: 'text-emerald-900', chip: 'bg-emerald-100 text-emerald-700' },
  { border: 'border-amber-500',   bg: 'bg-gradient-to-br from-amber-50 to-white',    title: 'text-amber-900',   chip: 'bg-amber-100 text-amber-700' },
  { border: 'border-rose-500',    bg: 'bg-gradient-to-br from-rose-50 to-white',     title: 'text-rose-900',    chip: 'bg-rose-100 text-rose-700' },
  { border: 'border-sky-500',     bg: 'bg-gradient-to-br from-sky-50 to-white',      title: 'text-sky-900',     chip: 'bg-sky-100 text-sky-700' },
]

// Role categories on the left of the assign table (master list per service). Each
// category shows exactly 1 row by default; "+ Add" appends another. The first row's
// key matches the legacy hardcoded slot names exactly (see roleKeyFor) so schedules
// saved before this became dynamic keep resolving to the same row.
const ROLE_CATEGORIES = [
  'Lead Vocal',
  'Parts',
  'Choir member',
  'Keyboard',
  'Lead Guitar',
  'Bass Guitar',
  'Acoustic guitar',
  'Drums',
  'Sound Engineer',
]

// Categories whose legacy first-row key already carried a "-1" suffix — everything
// else's first row was always bare (e.g. "Sound Engineer", not "Sound Engineer-1").
const LEGACY_DASH_ONE_CATEGORIES = new Set(['Lead Vocal', 'Parts', 'Choir member'])

function roleKeyFor(category, index) {
  if (index === 1) return LEGACY_DASH_ONE_CATEGORIES.has(category) ? `${category}-1` : category
  return `${category}-${index}`
}

// Inverse of roleKeyFor — splits a role key back into its category + row index.
function parseRoleKey(role) {
  const m = role.match(/^(.*)-(\d+)$/)
  if (!m) return { category: role, index: 1 }
  return { category: m[1], index: parseInt(m[2], 10) }
}

function countAssignedCategories(list) {
  return new Set(list.filter((a) => a.memberId).map((a) => parseRoleKey(a.role).category)).size
}

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

// Returns the forthcoming Sunday date string.
// If today IS Sunday and before 18:00, returns today; after 18:00 returns next Sunday.
function getForthcomingSunday() {
  const now = new Date()
  const day = now.getDay()
  if (day === 0 && now.getHours() < 18) return format(now, 'yyyy-MM-dd')
  const daysTo = day === 0 ? 7 : 7 - day
  const d = new Date(now)
  d.setDate(now.getDate() + daysTo)
  return format(d, 'yyyy-MM-dd')
}

// True only while the plan card should be shown (up to Sunday 18:00)
function isBeforeSundayEvening(sundayDateStr) {
  const cutoff = new Date(sundayDateStr + 'T18:00:00')
  return new Date() < cutoff
}

const CATEGORY_POSITION_KEY = {
  'Lead Vocal': 'Lead vocal',
  'Parts': 'Parts',
  'Choir member': 'Choir',
  'Lead Guitar': 'Lead guitar',
  'Acoustic guitar': 'Guitar',
  'Bass Guitar': 'Bass',
  'Keyboard': 'Keyboard',
  'Drums': 'Drums',
  'Sound Engineer': 'Sound engineer',
}

function positionKeyForRole(role) {
  return CATEGORY_POSITION_KEY[parseRoleKey(role).category] || null
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

const SERVICE_FLOW = [
  { segment: 'Pre-service', item: 'Welcome & Setup', duration: '10 min' },
  { segment: 'Opening', item: 'Praise & Worship (3–4 songs)', duration: '25 min' },
  { segment: 'Sermon', item: 'Pastoral Message', duration: '35 min' },
  { segment: 'Response', item: 'Response Worship / Altar Call', duration: '10 min' },
  { segment: 'Closing', item: 'Final Song & Benediction', duration: '5 min' },
]

function WorshipStamp({ stamp, isOpen, onToggle, onEdit }) {
  const assignedRoles = stamp.assignments.filter((a) => a.memberId)
  let formattedDate = stamp.date
  try { formattedDate = format(new Date(stamp.date), 'EEE d MMM yyyy') } catch {}
  return (
    <motion.div
      layoutId="assign-card"
      key="stamp"
      className="bg-white/75 backdrop-blur-md border border-white/30 rounded-2xl shadow-lg p-4"
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <CheckCircle2 size={17} className="text-emerald-500 flex-shrink-0" />
          <span className="font-semibold text-slate-800 text-sm">Worship</span>
          <span className="text-slate-400 text-sm">|</span>
          <span className="text-slate-700 text-sm truncate">{formattedDate}</span>
          <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5 flex-shrink-0 hidden sm:inline">
            Saved
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button type="button" onClick={onEdit} className="text-xs text-slate-400 hover:text-amber-600 underline">
            Edit plan
          </button>
          <button type="button" onClick={onToggle} className="text-slate-400 hover:text-slate-700 transition-colors">
            <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown size={16} />
            </motion.div>
          </button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="stamp-body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-slate-100">
              {assignedRoles.length === 0 ? (
                <p className="text-sm text-slate-400 italic">No members assigned for this date.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {assignedRoles.map((a) => (
                    <div key={a.role} className="flex items-center gap-2 text-sm">
                      <span className="text-slate-400 text-xs w-36 flex-shrink-0 truncate">{a.role}</span>
                      <span className="font-medium text-slate-800">{a.memberName}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function ArchiveStamp({ stamp, isOpen, onToggle }) {
  const assignedRoles = (stamp.assignments || []).filter((a) => a.memberId)
  let formattedDate = stamp.date
  try { formattedDate = format(new Date(stamp.date + 'T12:00:00'), 'EEE d MMM yyyy') } catch {}
  let savedAt = ''
  try {
    const ts = stamp.updatedAt?.toDate ? stamp.updatedAt.toDate() : stamp.updatedAt ? new Date(stamp.updatedAt) : null
    if (ts) savedAt = format(ts, 'd MMM yyyy, h:mm a')
  } catch {}

  const vocalAssignments = assignedRoles.filter((a) => a.role?.startsWith('Lead Vocal'))
  const otherAssignments = assignedRoles.filter((a) => !a.role?.startsWith('Lead Vocal'))

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <CheckCircle2 size={17} className="text-emerald-500 flex-shrink-0" />
          <span className="font-semibold text-slate-800 text-sm">{formattedDate}</span>
          <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full px-2 py-0.5 flex-shrink-0">Published</span>
          {savedAt && <span className="text-xs text-slate-400 hidden sm:inline truncate">Saved {savedAt}</span>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-slate-400">{assignedRoles.length} assigned</span>
          <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown size={16} className="text-slate-400" />
          </motion.div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="archive-body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1 border-t border-slate-100">
              {assignedRoles.length === 0 ? (
                <p className="text-sm text-slate-400 italic py-3">No members assigned for this date.</p>
              ) : (
                <div className="space-y-4">
                  {vocalAssignments.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Songs / Vocals</p>
                      <div className="space-y-2">
                        {vocalAssignments.map((a) => (
                          <div key={a.role} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
                            <span className="text-slate-400 text-xs w-28 flex-shrink-0">{a.role}</span>
                            <span className="font-medium text-slate-800">{a.memberName}</span>
                            {a.songName && (
                              <>
                                <span className="text-slate-300">·</span>
                                <span className="text-slate-600 italic">{a.songName}</span>
                                {a.key && <span className="text-xs bg-violet-50 text-violet-700 border border-violet-100 rounded px-1.5 py-0.5 font-medium">{a.key}</span>}
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {otherAssignments.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Team</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {otherAssignments.map((a) => (
                          <div key={a.role} className="flex items-center gap-2 text-sm">
                            <span className="text-slate-400 text-xs w-36 flex-shrink-0 truncate">{a.role}</span>
                            <span className="font-medium text-slate-800">{a.memberName}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {stamp.updatedBy && (
                    <p className="text-xs text-slate-400">Saved by {stamp.updatedBy}</p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function dedupeByName(members) {
  const seen = new Set()
  return members.filter(m => {
    const key = (m.name || '').trim().toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// A team member's card, collapsed to just Name + Duration by default — position
// tags, the Director badge, and management actions all stay hidden until the card
// itself is clicked to expand. Shared by both places member cards render (the
// standalone Team tab and Operations > Team), so the collapse/expand and ⋮ actions
// menu behavior stays identical between them.
function WorshipMemberCard({ member: m, isFormer = false, canManageWorship, onEdit, onDelete, onLink }) {
  const [expanded, setExpanded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const since = new Date(m.memberSince)
  const till = isFormer && m.formerSince ? new Date(m.formerSince) : new Date()
  const yrs = differenceInYears(till, since)
  const mos = differenceInMonths(till, addYears(since, yrs))
  const totalDays = isFormer ? differenceInDays(till, since) : null

  return (
    <div
      className={`relative rounded-xl border p-3 flex flex-col gap-2 shadow-sm transition-colors cursor-pointer ${
        isFormer
          ? 'border-slate-200 bg-slate-50'
          : m.isWorshipDirector ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white hover:border-indigo-200'
      }`}
      role="button"
      tabIndex={0}
      onClick={() => setExpanded(v => !v)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(v => !v) } }}
    >
      {/* Collapsed surface — Name + Duration only */}
      <span className={`font-semibold text-sm leading-snug ${isFormer ? 'text-slate-700' : 'text-slate-800'}`}>{m.name}</span>
      <div className="mt-auto pt-1 border-t border-slate-100">
        {isFormer ? (
          <p className="text-[10px] text-slate-400">{formatDMY(m.memberSince)} → {m.formerSince ? formatDMY(m.formerSince) : 'now'}</p>
        ) : (
          <p className="text-[10px] text-slate-400">Since {formatDMY(m.memberSince)}</p>
        )}
        <p className="text-xs font-semibold text-slate-600">
          <span className="text-violet-700">{yrs}</span>
          <span className="text-slate-400 font-normal">yr </span>
          <span className="text-indigo-700">{mos}</span>
          <span className="text-slate-400 font-normal">mo</span>
          {isFormer && <span className="font-normal text-slate-400"> · {totalDays.toLocaleString()} days</span>}
        </p>
      </div>

      {/* Expanded details — positions, Director badge, ⋮ actions menu */}
      {expanded && (
        <div className="pt-2 mt-1 border-t border-slate-100 flex flex-col gap-2" onClick={(e) => e.stopPropagation()} role="presentation">
          {(m.isWorshipDirector || m.positions?.length > 0) && (
            <div className="flex flex-wrap gap-1">
              {m.isWorshipDirector && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[9px] uppercase tracking-wide font-bold">Director</span>
              )}
              {(m.positions || []).map(p => (
                <span key={p} className="text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium border border-indigo-100">{p}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ⋮ actions menu — only in the expanded view, top-right corner */}
      {expanded && canManageWorship && (
        <div className="absolute top-2 right-2" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setMenuOpen(v => !v)}
            className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            aria-label="Member actions"
          >
            <MoreVertical size={16} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
              <div className="absolute right-0 top-full mt-1 z-20 w-36 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); onEdit(m) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <Pencil size={13} /> Edit
                </button>
                {!m.visitorId && !m.personId && onLink && (
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); onLink(m) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors"
                  >
                    Link
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); onDelete(m) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// "+ Add New Team Member" must only offer applicants whose screening evaluation
// explicitly recommended them — not the full church directory. An applicant only
// qualifies once status === 'screened' AND screening.recommendation === 'Ready for
// Main Roster'; pending/incomplete applications and 'Needs Training / Sub List' or
// 'Not Ready' recommendations are excluded, as are people with no application at all.
async function getApprovedRosterVisitors() {
  const [{ people }, applications] = await Promise.all([
    getMergedPeopleDirectory(),
    getWorshipApplications(DEPARTMENT).catch(() => []),
  ])
  const approvedNames = new Set(
    (applications || [])
      .filter(a => a.status === 'screened' && a.screening?.recommendation === 'Ready for Main Roster')
      .map(a => (a.fullName || '').trim().toLowerCase())
      .filter(Boolean)
  )
  return people.filter(p => approvedNames.has((p.name || '').trim().toLowerCase()))
}

export default function DepartmentWorship() {
  const { userProfile, hasPermission, isFounder, hasAccess } = useAuth()
  if (!hasAccess(userProfile, DEPARTMENT) && !hasWorshipRoleAccess(userProfile)) {
    return (
      <div className="p-6 text-slate-600">
        <Link to="/departments" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-600 text-sm font-medium hover:bg-blue-100 hover:border-blue-300 active:scale-95 transition-all">← Departments</Link>
        <p className="mt-4">You do not have access to {DEPARTMENT} department.</p>
      </div>
    )
  }
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  // Tab is URL-driven (?tab=) so the bottom dock's folder popover can deep-link
  // straight into a subpage, same as DepartmentHub's generic hub.
  const [searchParams, setSearchParams] = useSearchParams()
  // A role restricted to fewer tabs (e.g. Worship Leader) lands on its first allowed
  // tab by default instead of Hub — the ?tab= guard further below still returns 403 if
  // they (or a stale link) explicitly point at a tab outside that set.
  // Everyone defaults to Upcoming Worship (the setlist/assigned-songs view for the
  // coming Sunday) rather than Hub — Worship Leader and Worship Member land here via
  // the dock's bypassed launcher (see shouldBypassWorshipGrid), Director/Founder/Admin
  // via the picker grid or by just visiting the bare department path.
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'upcomingSunday')
  useEffect(() => {
    const t = searchParams.get('tab')
    if (t) setActiveTab(t)
  }, [searchParams])
  const [operationsSubTab, setOperationsSubTab] = useState('')
  // Expense is always the base Finance view now — Budget/Payout Request are drawers
  // layered on top rather than sibling tabs, so this only ever tracks which drawer (if
  // any) is open: null | 'budget' | 'payout'. Still deep-linkable the same way as
  // before (?tab=finance&financeSub=budget, see getFinanceChildren in
  // utils/departmentSubpages.js) so the dock's Finance popover still opens the right
  // drawer instead of just landing on plain Expense.
  const [financeOverlay, setFinanceOverlay] = useState(() => {
    const f = searchParams.get('financeSub')
    return f === 'budget' || f === 'payout' ? f : null
  })
  useEffect(() => {
    const f = searchParams.get('financeSub')
    if (f === 'budget' || f === 'payout') setFinanceOverlay(f)
  }, [searchParams])
  const [editingSubDept, setEditingSubDept] = useState(null)
  const [subDeptModalOpen, setSubDeptModalOpen] = useState(false)
  const [allMembers, setAllMembers] = useState([])

  const activeMembers = useMemo(
    () => allMembers
      .filter(m => m.isFormer !== true)
      .sort((a, b) => (b.isWorshipDirector === true) - (a.isWorshipDirector === true)),
    [allMembers]
  )

  const formerMembers = useMemo(
    () => allMembers
      .filter(m => m.isFormer === true)
      .sort((a, b) => (a.memberSince || '').localeCompare(b.memberSince || '')),
    [allMembers]
  )

  // Best-effort link from the logged-in user to their own worship team roster entry
  // (there's no uid field on team members, only a name match) — used to default the
  // song viewer's "My Role" filter to whichever instrument(s) this person plays.
  const myName = userProfile?.name?.trim().toLowerCase()
  const myWorshipMember = myName ? allMembers.find(m => m.name?.trim().toLowerCase() === myName) : null
  const [loadingTeam, setLoadingTeam] = useState(true)
  const [teamError, setTeamError] = useState(null)
  const [worshipMemberLinking, setWorshipMemberLinking] = useState(null)
  const [newMember, setNewMember] = useState({
    name: '',
    visitorId: '',
    personId: '',
    memberSince: new Date().toISOString().slice(0, 10),
    isFormer: false,
    positions: [],
    isWorshipDirector: false,
  })
  const [addMemberVisitors, setAddMemberVisitors] = useState([])
  const [addMemberVisitorsLoading, setAddMemberVisitorsLoading] = useState(false)
  const [form, setForm] = useState({
    type: 'team',
    period: PERIOD,
    teamNotes: '',
    plannedBudget: '',
    spent: '',
    participantsCount: '',
    activityNotes: '',
  })

  // Scoped to this specific department's position (not the loose top-level
  // `userProfile.department` field, which is just whichever department happened to
  // be inserted first into `positions[]` — a Director of another department who also
  // holds any lesser position here would otherwise incorrectly pass this check).
  const isDirector = getDepartmentRole(userProfile, DEPARTMENT) === 'DIRECTOR'
  const isPastor = hasPermission('viewDepartmentInsights')
  const canManageWorship = isDirector || isFounder
  // Worship Leader gets full edit access to songs/segments/arrangements specifically —
  // deliberately narrower than canManageWorship (Team/Assign/Budget/Applications stay
  // Director/Founder-only). Used only by the Song Directory and Song Designer below.
  const canManageWorshipSongs = canManageWorship || isWorshipLeader(userProfile)
  // A Worship Leader can only edit or delete songs they personally designed —
  // Director/Founder still manage anything.
  const canEditSong = (song) => {
    if (canManageWorship) return true
    if (!isWorshipLeader(userProfile)) return false
    const designer = String(song?.designedBy || song?.createdBy || '').trim().toLowerCase()
    const myName = String(userProfile?.name || '').trim().toLowerCase()
    return !!myName && designer === myName
  }
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [scheduleForDate, setScheduleForDate] = useState({ date: '', assignments: [] })
  const [loadingSchedule, setLoadingSchedule] = useState(false)
  const [editMember, setEditMember] = useState(null)
  const [budgetItems, setBudgetItems] = useState([])
  const [loadingBudgetItems, setLoadingBudgetItems] = useState(true)
  const [budgetItemsError, setBudgetItemsError] = useState(null)
  const [editingBudgetItem, setEditingBudgetItem] = useState(null)
  const [localAssignments, setLocalAssignments] = useState([])
  // How many rows are currently shown per role category in the assign table — only
  // ever grows via "+ Add", shrinks via the row delete button. Reset whenever a
  // different date's schedule loads so a previous date's added-but-unsaved rows don't
  // linger; any already-saved rows beyond 1 (from before this became dynamic) still
  // show because rowCountFor below takes the max against what's actually in the data.
  const [roleRowCounts, setRoleRowCounts] = useState({})
  const [savingAssign, setSavingAssign] = useState(false)
  const [assignStamp, setAssignStamp] = useState(null)
  const [stampOpen, setStampOpen] = useState(false)
  const [archiveSchedules, setArchiveSchedules] = useState([])
  const [loadingArchives, setLoadingArchives] = useState(false)
  const [openArchiveIds, setOpenArchiveIds] = useState({})
  const [rehearsals, setRehearsals] = useState([])
  const [loadingRehearsals, setLoadingRehearsals] = useState(false)
  const [rehearsalModalOpen, setRehearsalModalOpen] = useState(false)
  const [editingRehearsal, setEditingRehearsal] = useState(null)
  const [rehearsalForm, setRehearsalForm] = useState({ date: '', time: '', location: '', notes: '' })
  const [addMemberModalOpen, setAddMemberModalOpen] = useState(false)
  const [openAttendanceId, setOpenAttendanceId] = useState(null)
  const [attendanceDraft, setAttendanceDraft] = useState({})
  const [weekBoxSchedules, setWeekBoxSchedules] = useState([])
  const [forthcomingSchedule, setForthcomingSchedule] = useState(null)
  const [loadingForthcoming, setLoadingForthcoming] = useState(false)
  const [distributing, setDistributing] = useState(false)
  const [loadingWeekBoxes, setLoadingWeekBoxes] = useState(false)
  const [practiceSubPage, setPracticeSubPage] = useState('schedule')
  const [recordsSchedules, setRecordsSchedules] = useState([])
  const [loadingRecords, setLoadingRecords] = useState(false)

  // Songs Directory
  const [songs, setSongs] = useState([])
  const [loadingSongs, setLoadingSongs] = useState(false)
  const [songSearch, setSongSearch] = useState('')
  const [songSubPage, setSongSubPage] = useState('directory')
  const [editingSong, setEditingSong] = useState(null)
  const [viewingSong, setViewingSong] = useState(null)
  // Explicit view mode for the next SongViewer open ('full' | 'mine' | null to let
  // SongViewer auto-detect) — always set together with viewingSong so a stale mode
  // from a previous open (e.g. "My Part") never leaks into the next song opened.
  const [viewSongMode, setViewSongMode] = useState(null)
  // Overrides myWorshipMember's static profile positions when a caller (e.g. the
  // Combined Song Design & Parts card on Upcoming Worship) already knows exactly
  // which role(s) this person is assigned for that specific song this week.
  const [viewSongPositions, setViewSongPositions] = useState(null)
  const openSongView = (song, mode = null, positions = null) => {
    setViewSongMode(mode)
    setViewSongPositions(positions)
    setViewingSong(song)
  }
  const [songSearchOpenRole, setSongSearchOpenRole] = useState(null)
  const [songModal, setSongModal] = useState(null) // null | 'add'
  const [songForm, setSongForm] = useState({ title: '', artist: '', key: '', tempo: '', notes: '' })

  // Deep link from the Upcoming Worship workspace widget's "Design My Song" button
  // (?tab=songsDirectory&newSong=1) — opens the Add Song modal immediately instead of
  // requiring a click once they land on the Directory. Consumes/strips the flag so a
  // refresh or re-visit doesn't keep re-opening it.
  useEffect(() => {
    if (activeTab !== 'songsDirectory' || !canManageWorshipSongs) return
    if (searchParams.get('newSong') !== '1') return
    setSongForm({ title: '', artist: '', key: '', tempo: '', notes: '' })
    setSongModal('add')
    const next = new URLSearchParams(searchParams)
    next.delete('newSong')
    setSearchParams(next, { replace: true })
  }, [activeTab, searchParams, canManageWorshipSongs])

  const [savingSong, setSavingSong] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

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
      const all = await getWorshipTeamMembers(DEPARTMENT)
      setAllMembers(dedupeByName(all))
    } catch (e) {
      console.error('Worship team load failed:', e)
      setTeamError(e?.message || 'Could not load team. Check Firestore rules and indexes for worship_team_members.')
      setAllMembers([])
    } finally {
      setLoadingTeam(false)
    }
  }

  useEffect(() => {
    loadTeam()
  }, [])

  // Direct delete from a member card's ⋮ menu — same confirm/delete/state-update
  // shape as the Edit modal's own Delete button, just reachable without opening it.
  async function handleDeleteMember(m) {
    if (!window.confirm(`Delete ${m.name} permanently?`)) return
    try {
      await deleteWorshipTeamMember(m.id, { department: DEPARTMENT, name: m.name })
      setAllMembers(prev => prev.filter(x => x.id !== m.id))
    } catch (e) {
      console.error(e)
      alert('Failed to delete')
    }
  }

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

  async function loadSongs() {
    setLoadingSongs(true)
    try {
      const data = await getWorshipSongs()
      setSongs(data)
    } catch (e) {
      console.error('Songs load failed:', e)
      setSongs([])
    } finally {
      setLoadingSongs(false)
    }
  }

  // Also loaded on the Assign tab (Song Name search) and Upcoming Worship (looking up
  // each assigned song's key/link so the setlist can offer a "View" into SongViewer).
  useEffect(() => {
    if (activeTab === 'songsDirectory' || activeTab === 'assign' || activeTab === 'upcomingSunday') loadSongs()
  }, [activeTab])

  useEffect(() => {
    if ((activeTab === 'assign' || activeTab === 'summary') && selectedDate) loadScheduleForDate(selectedDate)
  }, [activeTab, selectedDate])

  useEffect(() => {
    if (activeTab !== 'summary') return
    const sunday = getForthcomingSunday()
    setLoadingForthcoming(true)
    getWorshipScheduleByDate(DEPARTMENT, sunday)
      .then(setForthcomingSchedule)
      .catch(() => setForthcomingSchedule(null))
      .finally(() => setLoadingForthcoming(false))
  }, [activeTab])

  useEffect(() => {
    setLocalAssignments(scheduleForDate.assignments || [])
    setRoleRowCounts({})
  }, [scheduleForDate])

  useEffect(() => {
    if (activeTab !== 'practiceRehearsal') return
    setLoadingRehearsals(true)
    getWorshipRehearsals(DEPARTMENT)
      .then((list) => setRehearsals(list.sort((a, b) => (a.date || '').localeCompare(b.date || ''))))
      .catch(() => setRehearsals([]))
      .finally(() => setLoadingRehearsals(false))

    setLoadingWeekBoxes(true)
    getAllWorshipSchedules(DEPARTMENT)
      .then((all) => {
        const today = format(new Date(), 'yyyy-MM-dd')
        const upcomingPlans = all
          .filter((s) => s.date >= today)
          .sort((a, b) => b.date.localeCompare(a.date))
        // Show the latest saved upcoming plan, or fall back to next Sunday if none exists
        const activeSunday = upcomingPlans[0]?.date || upcomingSundays(1)[0]
        const sundayObj = new Date(activeSunday + 'T12:00:00')
        setWeekBoxSchedules([{
          sundayDate: activeSunday,
          fridayDate: format(subDays(sundayObj, 2), 'yyyy-MM-dd'),
          saturdayDate: format(subDays(sundayObj, 1), 'yyyy-MM-dd'),
          schedule: upcomingPlans[0] || null,
        }])
      })
      .catch(() => setWeekBoxSchedules([]))
      .finally(() => setLoadingWeekBoxes(false))
  }, [activeTab])

  useEffect(() => {
    if (activeTab !== 'practiceRehearsal' || practiceSubPage !== 'records') return
    setLoadingRecords(true)
    getAllWorshipSchedules(DEPARTMENT)
      .then(all => {
        const today = format(new Date(), 'yyyy-MM-dd')
        const upcomingPlans = all.filter((s) => s.date >= today).sort((a, b) => b.date.localeCompare(a.date))
        const activeSunday = upcomingPlans[0]?.date
        // Records = every week except the currently active one, that has at least one assigned member
        const records = all
          .filter(s => s.date !== activeSunday && (s.assignments || []).some(a => a.memberId))
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        setRecordsSchedules(records)
      })
      .catch(() => setRecordsSchedules([]))
      .finally(() => setLoadingRecords(false))
  }, [activeTab, practiceSubPage])

  useEffect(() => {
    if (activeTab !== 'archives') return
    setLoadingArchives(true)
    getAllWorshipSchedules(DEPARTMENT)
      .then((all) => {
        const today = format(new Date(), 'yyyy-MM-dd')
        const past = all
          .filter((s) => s.date && s.date < today && (s.assignments || []).some((a) => a.memberId))
          .sort((a, b) => b.date.localeCompare(a.date))
        setArchiveSchedules(past)
      })
      .catch(() => setArchiveSchedules([]))
      .finally(() => setLoadingArchives(false))
  }, [activeTab])

  function getLocalField(role, field) {
    const a = localAssignments.find((x) => x.role === role)
    return a?.[field] ?? ''
  }

  // Reconstructs each assignment with exactly the fields the schema expects, coerced
  // to plain strings — guards the save payload against anything malformed slipping in
  // (e.g. songId ending up as an object/number instead of a directory doc id string,
  // or an undefined value the Firestore SDK would otherwise reject the whole write for).
  function sanitizeAssignment(a) {
    return {
      role: String(a?.role ?? ''),
      memberId: String(a?.memberId ?? ''),
      memberName: String(a?.memberName ?? ''),
      songName: String(a?.songName ?? ''),
      key: String(a?.key ?? ''),
      songId: String(a?.songId ?? ''),
    }
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

  // Rows visible for a category = whichever is bigger: what's already saved for this
  // date (so pre-existing multi-row data never gets hidden) or what's been added this
  // session via the "+ Add" button.
  function rowCountFor(category) {
    const savedMax = localAssignments.reduce((max, a) => {
      const parsed = parseRoleKey(a.role)
      return parsed.category === category ? Math.max(max, parsed.index) : max
    }, 1)
    return Math.max(savedMax, roleRowCounts[category] || 1)
  }

  function addRoleRow(category) {
    setRoleRowCounts((prev) => ({ ...prev, [category]: rowCountFor(category) + 1 }))
  }

  // Only removes the last row of a category (mirrors "+ Add" always appending to the
  // end), clearing whatever was entered for it so no orphaned data lingers.
  function removeRoleRow(category) {
    const count = rowCountFor(category)
    if (count <= 1) return
    updateLocal(roleKeyFor(category, count), { memberId: '' })
    setRoleRowCounts((prev) => ({ ...prev, [category]: count - 1 }))
  }

  async function saveAssignPlan() {
    setSavingAssign(true)
    try {
      const sanitizedAssignments = localAssignments.map(sanitizeAssignment)
      await setWorshipScheduleByDate(DEPARTMENT, selectedDate, sanitizedAssignments, userProfile?.email || '')
      setScheduleForDate((s) => ({ ...s, assignments: sanitizedAssignments }))
      setAssignStamp({ date: selectedDate, assignments: [...sanitizedAssignments], savedAt: new Date() })
      setStampOpen(false)
      if (selectedDate === getForthcomingSunday()) {
        setForthcomingSchedule(prev => ({ ...(prev || {}), date: selectedDate, assignments: [...sanitizedAssignments] }))
      }

      // Update the Schedule box to show only this Sunday; move old box to Records
      const prevBox = weekBoxSchedules[0]
      const sundayObj = new Date(selectedDate + 'T12:00:00')
      const newBox = {
        sundayDate: selectedDate,
        fridayDate: format(subDays(sundayObj, 2), 'yyyy-MM-dd'),
        saturdayDate: format(subDays(sundayObj, 1), 'yyyy-MM-dd'),
        schedule: {
          ...(prevBox?.sundayDate === selectedDate ? prevBox.schedule : scheduleForDate) || {},
          date: selectedDate,
          assignments: sanitizedAssignments,
        },
      }
      setWeekBoxSchedules([newBox])
      if (prevBox && prevBox.sundayDate !== selectedDate && (prevBox.schedule?.assignments || []).some(a => a.memberId)) {
        setRecordsSchedules(prev =>
          [prevBox.schedule, ...prev.filter(s => s.date !== prevBox.sundayDate)]
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        )
      }

      // Auto-create or update practice session for the Saturday before this Sunday
      const practiceDateStr = format(subDays(new Date(selectedDate + 'T12:00:00'), 1), 'yyyy-MM-dd')
      const songLines = sanitizedAssignments
        .filter((a) => a.songName)
        .map((a) => `${a.role}: ${a.songName}${a.key ? ` (${a.key})` : ''}`)
      const notes = [
        `Practice for Sunday ${format(new Date(selectedDate + 'T12:00:00'), 'd MMM yyyy')}`,
        ...(songLines.length ? ['', ...songLines] : []),
      ].join('\n')
      const existing = await getWorshipRehearsalByDate(DEPARTMENT, practiceDateStr)
      if (existing) {
        await updateWorshipRehearsal(existing.id, { notes })
        setRehearsals((prev) =>
          prev.map((r) => r.id === existing.id ? { ...r, notes } : r)
        )
      } else {
        const id = await addWorshipRehearsal(DEPARTMENT, {
          date: practiceDateStr, time: '', location: '', notes,
        }, userProfile?.email || '')
        setRehearsals((prev) =>
          [...prev, { id, department: DEPARTMENT, date: practiceDateStr, time: '', location: '', notes }]
            .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
        )
      }
    } catch (error) {
      console.error('Error saving assignment:', error, { date: selectedDate, assignments: localAssignments })
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

  if (!canManageWorship && !canViewInsights && !hasWorshipRoleAccess(userProfile)) {
    return (
      <div className="p-8 text-slate-600">
        You don't have access to the Worship department page. Ask an admin to set your <strong>department</strong> to &quot;Worship&quot; in Firestore (users collection) to plan and enter data, or use a role that can view insights.
      </div>
    )
  }

  // Route guard: a Worship Leader is restricted to the Songs tab (Song Design lives
  // inside it via a song's Edit button) — this blocks direct/typed ?tab= navigation to
  // any hidden tab, not just what's hidden from the nav grid in departmentSubpages.js.
  const allowedWorshipTabs = getAllowedWorshipTabs(userProfile, getDepartmentHubTabs('worship'))
  if (!allowedWorshipTabs.includes(activeTab)) {
    // Songs (Directory + Design) is Worship Leader/Director only. A Worship Member (or
    // anyone else without access) hitting ?tab=songsDirectory directly — a stale link,
    // a bookmark, hand-typed URL — gets bounced to Upcoming Worship, their actual home
    // tab, instead of a dead-end 403 message.
    if (activeTab === 'songsDirectory') {
      return <Navigate to="/department/worship?tab=upcomingSunday" replace />
    }
    return (
      <div className="p-8 text-slate-600">
        <p className="font-semibold text-slate-800 mb-2">403 — Unauthorized Access</p>
        <p>Your Worship Leader role only has access to the Songs module. Contact your Worship Director or Admin for broader access.</p>
      </div>
    )
  }

  async function generateAndSharePlan() {
    setDistributing(true)
    try {
      // Use whichever Sunday is currently selected in the "Coming Sundays" strip
      // (scheduleForDate is kept in sync with selectedDate via the loadScheduleForDate
      // effect) — not always the immediately forthcoming one.
      const sunday = selectedDate
      const fas = scheduleForDate?.assignments || []
      const assigned = fas.filter(a => a.memberId)
      const songs    = fas.filter(a => a.songName)
      const vocals   = assigned.filter(a => /vocal|parts|choir/i.test(a.role))
      const band     = assigned.filter(a => /guitar|bass|drum|keyboard/i.test(a.role))
      const tech     = assigned.filter(a => /sound|media/i.test(a.role))
      const groups   = [
        { label: 'VOCALS & CHOIR', items: vocals },
        { label: 'BAND', items: band },
        { label: 'TECH', items: tech },
        { label: 'SETLIST', items: songs, isSongs: true },
      ].filter(g => g.items.length)

      const W = 800, PAD = 48
      const HEADER_H = 168, SECTION_H = 44, ROW_H = 38, GAP = 20, FOOTER_H = 60
      let contentH = GAP
      groups.forEach(g => { contentH += SECTION_H + g.items.length * ROW_H + GAP })
      const H = HEADER_H + contentH + FOOTER_H

      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext('2d')

      // Background
      ctx.fillStyle = '#f5f3ff'
      ctx.fillRect(0, 0, W, H)

      // Header gradient
      const grad = ctx.createLinearGradient(0, 0, W, HEADER_H)
      grad.addColorStop(0, '#7c3aed')
      grad.addColorStop(1, '#5b21b6')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, HEADER_H)

      ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.font = 'bold 18px Arial, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('ROL CHURCH', PAD, 52)

      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 34px Arial, sans-serif'
      ctx.fillText('SUNDAY WORSHIP PLAN', PAD, 100)

      ctx.fillStyle = 'rgba(255,255,255,0.82)'
      ctx.font = '22px Arial, sans-serif'
      ctx.fillText(format(new Date(sunday + 'T12:00:00'), 'EEEE, d MMMM yyyy'), PAD, 140)

      // Content rows
      let y = HEADER_H + GAP
      groups.forEach((group, gi) => {
        if (gi > 0) y += GAP

        // Section label bar
        ctx.fillStyle = '#ede9fe'
        ctx.fillRect(0, y, W, SECTION_H - 6)
        ctx.fillStyle = '#6d28d9'
        ctx.font = 'bold 13px Arial, sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText(group.label, PAD, y + SECTION_H - 18)
        y += SECTION_H

        group.items.forEach((a, idx) => {
          ctx.fillStyle = idx % 2 === 0 ? '#fafafe' : '#ffffff'
          ctx.fillRect(0, y, W, ROW_H)

          if (group.isSongs) {
            ctx.fillStyle = '#a78bfa'
            ctx.font = 'bold 14px Arial, sans-serif'
            ctx.textAlign = 'right'
            ctx.fillText(String(idx + 1) + '.', PAD + 18, y + ROW_H - 11)
            ctx.fillStyle = '#1e1b4b'
            ctx.font = '600 16px Arial, sans-serif'
            ctx.textAlign = 'left'
            ctx.fillText(a.songName || '', PAD + 28, y + ROW_H - 11)
            if (a.key) {
              const sw = ctx.measureText(a.songName || '').width
              ctx.fillStyle = '#94a3b8'
              ctx.font = '13px Arial, sans-serif'
              ctx.fillText(`(${a.key})`, PAD + 28 + sw + 8, y + ROW_H - 11)
            }
          } else {
            ctx.fillStyle = '#7c3aed'
            ctx.font = '13px Arial, sans-serif'
            ctx.textAlign = 'left'
            ctx.fillText(a.role.replace(/-\d+$/, ''), PAD, y + ROW_H - 11)
            ctx.fillStyle = '#111827'
            ctx.font = '600 16px Arial, sans-serif'
            ctx.fillText(a.memberName || '—', PAD + 220, y + ROW_H - 11)
          }
          y += ROW_H
        })
      })

      // Footer bar
      ctx.fillStyle = '#7c3aed'
      ctx.fillRect(0, H - FOOTER_H, W, FOOTER_H)
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.font = '14px Arial, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Generated by ROL Admin App', W / 2, H - FOOTER_H + 36)

      // Convert to JPEG blob
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
      const filename = `worship-plan-${sunday}.jpg`
      const file = new File([blob], filename, { type: 'image/jpeg' })

      // Download the image first
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)

      // Then open WhatsApp directly
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
      setTimeout(() => {
        if (isMobile) {
          window.location.href = 'whatsapp://'
        } else {
          window.open('https://web.whatsapp.com', '_blank')
        }
      }, 600)
    } catch (err) {
      if (err?.name !== 'AbortError') alert('Could not generate plan image.')
    }
    setDistributing(false)
  }

  const savedAssignments = scheduleForDate.assignments || []

  const anniversaryAlerts = activeMembers.flatMap(m => {
    if (!m.memberSince) return []
    const since = new Date(m.memberSince)
    const today = new Date()
    for (let i = 0; i <= 5; i++) {
      const check = new Date(today)
      check.setDate(today.getDate() + i)
      if (check.getMonth() === since.getMonth() && check.getDate() === since.getDate()) {
        const years = differenceInYears(check, since)
        if (years >= 1) return [{ ...m, daysAway: i, years }]
      }
    }
    return []
  })
  const setlistSongs = savedAssignments
    .filter(a => a.songName)
    .map((a, i) => ({
      no: i + 1,
      title: a.songName,
      key: a.key || '—',
      singer: a.memberName || '—',
      hasStructure: !!a.songId,
      _assignment: a,
    }))

  return (
    <div>
      <div className="flex items-center h-10 py-1.5 px-4 mb-2">
        <h1 className="text-sm font-semibold text-slate-900">Worship</h1>
      </div>
      <div className="space-y-4 px-4 pb-4 pt-1">
      {/* Shared multi-department Sunday-service programme grid (same component D
          Light/Media/Administration use) — order-of-service cards, "+ Add Programme
          Item", "Manage Custom Elements", Save. Keeps this tab's layout modular and
          consistent with every other department's Upcoming Sunday view instead of a
          Worship-only page. The personal "am I serving this week + song design" view
          (formerly here) still lives in My Workspace's Upcoming Worship widget. */}
      {activeTab === 'upcomingSunday' && (
        <UpcomingSunday slug="worship" />
      )}

      {activeTab === 'summary' && (canManageWorship || canViewInsights) && (
        <div className="space-y-4">

          {/* ── Forthcoming Sunday plan card ── */}
          {(() => {
            const sunday = getForthcomingSunday()
            const visible = isBeforeSundayEvening(sunday)
            if (!visible) return null
            if (loadingForthcoming) return (
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-violet-100 shadow-sm px-5 py-4 text-sm text-slate-400">
                Loading this Sunday's plan…
              </div>
            )
            const fas = forthcomingSchedule?.assignments || []
            const assigned = fas.filter(a => a.memberId)
            const songs = fas.filter(a => a.songName)
            if (assigned.length === 0) return (
              <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-violet-100 shadow-sm px-5 py-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400">Forthcoming Sunday</p>
                  <p className="text-sm font-semibold text-slate-700 mt-0.5">{format(new Date(sunday + 'T12:00:00'), 'EEEE, d MMMM yyyy')}</p>
                  <p className="text-xs text-slate-400 mt-1">No plan saved yet — go to the Assign tab to set up.</p>
                </div>
              </div>
            )
            // Group assigned roles by category
            const vocals  = assigned.filter(a => /vocal|parts|choir/i.test(a.role))
            const band    = assigned.filter(a => /guitar|bass|drum|keyboard/i.test(a.role))
            const tech    = assigned.filter(a => /sound|media/i.test(a.role))
            return (
              <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-violet-200 shadow-md overflow-hidden">
                {/* Card header */}
                <div className="px-5 py-4 bg-gradient-to-r from-violet-600 to-violet-700 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-violet-200">This Sunday's Worship Plan</p>
                    <p className="text-lg font-black text-white mt-0.5">
                      {format(new Date(sunday + 'T12:00:00'), 'EEEE, d MMMM yyyy')}
                    </p>
                  </div>
                  <span className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 text-white text-xs font-bold">
                    <CheckCircle2 size={11} />
                    Plan Ready
                  </span>
                </div>

                {/* Stats row */}
                <div className="flex divide-x divide-slate-100 border-b border-slate-100">
                  {[
                    { label: 'Assigned', value: countAssignedCategories(assigned), sub: `of ${ROLE_CATEGORIES.length} roles`, color: 'text-violet-700' },
                    { label: 'Songs', value: songs.length, sub: 'in setlist', color: 'text-sky-600' },
                    { label: 'Team Pool', value: activeMembers.length, sub: 'active', color: 'text-emerald-600' },
                  ].map(({ label, value, sub, color }) => (
                    <div key={label} className="flex-1 px-4 py-3 text-center">
                      <p className={`text-xl font-black ${color}`}>{value}</p>
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
                      <p className="text-[10px] text-slate-400">{sub}</p>
                    </div>
                  ))}
                </div>

                {/* Role groups */}
                <div className="px-5 py-4 space-y-3">
                  {[
                    { label: 'Vocals & Choir', items: vocals },
                    { label: 'Band', items: band },
                    { label: 'Tech', items: tech },
                  ].filter(g => g.items.length > 0).map(group => (
                    <div key={group.label}>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{group.label}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {group.items.map(a => (
                          <span key={a.role} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-50 border border-violet-100 text-xs font-medium text-violet-800">
                            <span className="text-[10px] text-violet-400">{a.role.replace(/-\d+$/, '')}</span>
                            <span className="font-bold">{a.memberName || '—'}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Setlist */}
                  {songs.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Setlist</p>
                      <ol className="space-y-0.5">
                        {songs.map((a, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm">
                            <span className="text-[10px] text-slate-400 w-4 text-right">{i + 1}.</span>
                            <span className="text-slate-800 font-medium">{a.songName}</span>
                            {a.key && <span className="text-[10px] text-slate-400">({a.key})</span>}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          {/* Header strip: Coming Sundays + Distribute button */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400 shrink-0">Coming Sundays</span>
              {upcomingSundays(2).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSelectedDate(d)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    selectedDate === d
                      ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-300 hover:border-violet-400 hover:text-violet-700'
                  }`}
                >
                  {format(new Date(d), 'd MMM')}
                </button>
              ))}
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-2 py-1 text-sm rounded-lg border border-slate-300 text-slate-600"
              />
            </div>
            <button
              type="button"
              disabled={distributing}
              onClick={generateAndSharePlan}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-semibold shadow-sm transition"
            >
              <Send size={14} />
              {distributing ? 'Generating…' : 'Distribute Plan to Team'}
            </button>
          </div>

          {/* Anniversary alerts */}
          {anniversaryAlerts.length > 0 && (
            <div className="bg-amber-50/80 backdrop-blur-sm rounded-2xl border border-amber-200 shadow-sm p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-2.5">🎉 Year Milestones This Week</p>
              <div className="flex flex-wrap gap-2">
                {anniversaryAlerts.map(m => (
                  <div key={m.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-amber-200 shadow-sm">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {m.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">{m.name}</p>
                      <p className="text-[11px] text-amber-700 font-medium">
                        {m.years} {m.years === 1 ? 'year' : 'years'} · {m.daysAway === 0 ? 'Today!' : `in ${m.daysAway} day${m.daysAway > 1 ? 's' : ''}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loadingSchedule ? (
            <div className="py-12 text-center text-slate-400 text-sm">Loading plan…</div>
          ) : savedAssignments.filter(a => a.memberId).length === 0 ? (
            <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm px-6 py-6 text-center text-slate-400">
              <p className="text-sm">No plan saved for this date yet.</p>
              <p className="text-xs mt-1">Go to the <strong>Assign</strong> tab to set up and save a plan.</p>
            </div>
          ) : (
            <>
              {/* Row 1: Period Summary */}
              <div>
                <div className="relative bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-md overflow-hidden p-5">
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none opacity-[0.035] -rotate-12">
                    <span className="text-slate-900 font-black text-6xl tracking-widest uppercase whitespace-nowrap">Official Plan</span>
                  </div>
                  <div className="relative z-10">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-violet-500">Weekly Worship Plan Summary</p>
                        <h2 className="text-xl font-bold text-slate-800 mt-0.5">
                          {selectedDate ? format(new Date(selectedDate + 'T12:00:00'), 'EEEE, d MMMM yyyy') : '—'}
                        </h2>
                        <p className="text-sm text-slate-400 mt-0.5">Worship Department</p>
                      </div>
                      <span className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold bg-emerald-50 border-emerald-200 text-emerald-700">
                        <CheckCircle2 size={12} />
                        Plan Ready
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <div className="bg-violet-50/70 rounded-xl p-3 min-w-[100px]">
                        <p className="text-xs font-semibold text-violet-500">Assigned</p>
                        <p className="text-2xl font-bold text-violet-700 mt-0.5">{countAssignedCategories(savedAssignments)}</p>
                        <p className="text-[10px] text-violet-400">of {ROLE_CATEGORIES.length} roles</p>
                      </div>
                      {setlistSongs.length > 0 && (
                        <div className="bg-sky-50/70 rounded-xl p-3 min-w-[100px]">
                          <p className="text-xs font-semibold text-sky-500">Songs</p>
                          <p className="text-2xl font-bold text-sky-700 mt-0.5">{setlistSongs.length}</p>
                          <p className="text-[10px] text-sky-400">in setlist</p>
                        </div>
                      )}
                      {setlistSongs.filter(s => s.hasStructure).length > 0 && (
                        <div className="bg-amber-50/70 rounded-xl p-3 min-w-[100px]">
                          <p className="text-xs font-semibold text-amber-500">Structures</p>
                          <p className="text-2xl font-bold text-amber-700 mt-0.5">{setlistSongs.filter(s => s.hasStructure).length}</p>
                          <p className="text-[10px] text-amber-400">docs uploaded</p>
                        </div>
                      )}
                      <div className="bg-emerald-50/70 rounded-xl p-3 min-w-[100px]">
                        <p className="text-xs font-semibold text-emerald-500">Team Pool</p>
                        <p className="text-2xl font-bold text-emerald-700 mt-0.5">{activeMembers.length}</p>
                        <p className="text-[10px] text-emerald-400">active members</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 2: Full Team Roster */}
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-md p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Full Team Roster</p>
                  <span className="text-xs text-slate-400">{savedAssignments.filter(a => a.memberId).length} confirmed</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
                  {savedAssignments.filter(a => a.memberId).map((a) => (
                    <div key={a.role} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50/80 border border-slate-100">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {a.memberName?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-800 truncate">{a.memberName}</p>
                        <p className="text-[10px] text-slate-500 truncate">{a.role}</p>
                      </div>
                      <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Row 3: Setlist + Files & Contacts */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

                {/* Music Setlist — only shown when there are songs */}
                {setlistSongs.length > 0 && (() => {
                  const hasKeys = setlistSongs.some(s => s.key && s.key !== '—')
                  const hasStructures = setlistSongs.some(s => s.hasStructure)
                  return (
                    <div className="lg:col-span-3 bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-md p-5">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Music Setlist</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-100 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">
                              <th className="pb-2 pr-3 w-8">#</th>
                              <th className="pb-2 pr-3">Song Title</th>
                              {hasKeys && <th className="pb-2 pr-3 w-16">Key</th>}
                              <th className="pb-2 pr-3">Singer</th>
                              {hasStructures && <th className="pb-2 w-20 text-center">Structure</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {setlistSongs.map((song) => (
                              <tr key={song.no} className="hover:bg-slate-50/60 transition">
                                <td className="py-2.5 pr-3 text-slate-400 text-xs font-medium">{song.no}</td>
                                <td className="py-2.5 pr-3 font-semibold text-slate-800">{song.title}</td>
                                {hasKeys && (
                                  <td className="py-2.5 pr-3">
                                    {song.key && song.key !== '—' ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-violet-50 border border-violet-100 text-xs font-bold text-violet-700">
                                        {song.key}
                                      </span>
                                    ) : <span className="text-xs text-slate-300">—</span>}
                                  </td>
                                )}
                                <td className="py-2.5 pr-3 text-slate-500 text-xs">{song.singer}</td>
                                {hasStructures && (
                                  <td className="py-2.5 text-center">
                                    {song.hasStructure ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const a = song._assignment
                                          const linked = a?.songId ? songs.find(s => s.id === a.songId) : null
                                          if (linked) openSongView(linked)
                                        }}
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition"
                                      >
                                        <Download size={11} />
                                        View
                                      </button>
                                    ) : (
                                      <span className="text-xs text-slate-300">—</span>
                                    )}
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })()}

                {/* Files & Contacts column */}
                <div className="lg:col-span-2 flex flex-col gap-4">

                  {/* Quick Files */}
                  <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-md p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Quick Files</p>
                    <div className="space-y-2">
                      {[
                        { label: 'Worship Plan PDF', icon: '📄', cls: 'text-red-600 bg-red-50 border-red-100 hover:bg-red-100' },
                        { label: 'Presentation Slides', icon: '🎞️', cls: 'text-blue-600 bg-blue-50 border-blue-100 hover:bg-blue-100' },
                        { label: 'Song Sheets', icon: '🎵', cls: 'text-violet-600 bg-violet-50 border-violet-100 hover:bg-violet-100' },
                      ].map((f) => (
                        <button
                          key={f.label}
                          type="button"
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs font-semibold transition ${f.cls}`}
                        >
                          <span>{f.icon}</span>
                          <span className="flex-1 text-left">{f.label}</span>
                          <Download size={12} />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Key Contacts */}
                  <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-md p-4 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Key Contacts</p>
                    <div className="space-y-3">
                      {(() => {
                        const contacts = []
                        const director = activeMembers.find(m => m.isWorshipDirector)
                        if (director) contacts.push({ name: director.name, role: 'Worship Director' })
                        const leadVocal = savedAssignments.find(a => a.role === 'Lead Vocal-1' && a.memberName)
                        if (leadVocal) contacts.push({ name: leadVocal.memberName, role: 'Lead Vocal' })
                        const soundEng = savedAssignments.find(a => a.role === 'Sound Engineer' && a.memberName)
                        if (soundEng) contacts.push({ name: soundEng.memberName, role: 'Sound Engineer' })
                        if (!contacts.length) return <p className="text-xs text-slate-400">No contacts assigned yet.</p>
                        return contacts.map((c, i) => (
                          <div key={i} className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                              {c.name?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-slate-800">{c.name}</p>
                              <p className="text-[10px] text-slate-500">{c.role}</p>
                            </div>
                          </div>
                        ))
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'assign' && canManageWorship && (
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {assignStamp ? (
              <WorshipStamp
                stamp={assignStamp}
                isOpen={stampOpen}
                onToggle={() => setStampOpen((v) => !v)}
                onEdit={() => { setAssignStamp(null); setStampOpen(false) }}
              />
            ) : (
            <motion.div
              key="assign-form"
              layoutId="assign-card"
              className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto"
              exit={{ opacity: 0, scale: 0.96, y: -8 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            >
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
                <div className="p-5 text-center text-slate-500">Loading...</div>
              ) : activeMembers.length === 0 ? (
                <div className="p-5 text-center text-slate-500">Add team members in the Team tab first.</div>
              ) : (
                <table key={selectedDate} className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600 w-[180px]">Role</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600 w-[260px]">Assigned to</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Song Name</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {ROLE_CATEGORIES.flatMap((category) => {
                      const count = rowCountFor(category)
                      return Array.from({ length: count }, (_, i) => i + 1).map((index) => {
                        const role = roleKeyFor(category, index)
                        const isLeadVocal = role.startsWith('Lead Vocal')
                        const isLastRow = index === count
                        return (
                      <tr key={role} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2 font-medium text-slate-800 text-sm align-top">
                          <div className="flex flex-col gap-1">
                            <span>{role}</span>
                            {isLastRow && (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => addRoleRow(category)}
                                  className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline whitespace-nowrap"
                                >
                                  + Add {category}
                                </button>
                                {count > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removeRoleRow(category)}
                                    title={`Remove this ${category}`}
                                    className="text-slate-400 hover:text-red-500 text-sm leading-none"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={getLocalField(role, 'memberId')}
                            onChange={(e) => {
                              const val = e.target.value
                              const member = activeMembers.find((m) => m.id === val)
                              updateLocal(role, { memberId: val || '', memberName: member?.name || '' })
                            }}
                            className="w-full px-2 py-1.5 text-sm rounded border border-slate-300 bg-white"
                          >
                            <option value="">— Not assigned</option>
                            {(() => {
                              const posKey = positionKeyForRole(role)
                              const eligible = posKey
                                ? activeMembers.filter((m) => m.positions?.includes(posKey))
                                : activeMembers
                              return eligible.map((m) => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))
                            })()}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          {isLeadVocal && (() => {
                            const songName = getLocalField(role, 'songName')
                            const songId = getLocalField(role, 'songId')
                            const linkedSong = songId ? songs.find(s => s.id === songId) : null
                            const q = songName.toLowerCase()
                            // Full directory, not just songs this user designed — assigning
                            // Lead Vocal needs to find any song so each instrumentalist/
                            // vocalist can later view their own part in read-only mode.
                            const matches = songs
                              .filter(s => !q || s.title?.toLowerCase().includes(q))
                              .slice(0, 8)
                            return (
                              <div className="relative">
                                <input
                                  type="text"
                                  value={songName}
                                  placeholder="Search my songs or type a name"
                                  onChange={(e) => updateLocal(role, { songName: e.target.value, songId: '', key: '' })}
                                  onFocus={() => setSongSearchOpenRole(role)}
                                  onBlur={() => setTimeout(() => setSongSearchOpenRole(r => (r === role ? null : r)), 150)}
                                  className="w-full px-2 py-1.5 text-sm rounded border border-slate-300 bg-white"
                                />
                                {songSearchOpenRole === role && matches.length > 0 && (
                                  <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                                    {matches.map(s => (
                                      <button
                                        key={s.id}
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                          updateLocal(role, { songName: s.title, key: s.key || '', songId: s.id })
                                          setSongSearchOpenRole(null)
                                        }}
                                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-indigo-50 flex items-center justify-between gap-2"
                                      >
                                        <span className="truncate font-medium text-slate-700">{s.title}</span>
                                        {s.key && <span className="text-xs text-indigo-600 font-semibold shrink-0">{s.key}</span>}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                {linkedSong && (
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-[11px] font-semibold text-indigo-700">
                                      ✓ Design linked{linkedSong.key ? ` · ${linkedSong.key}` : ''}
                                    </span>
                                    <button type="button" onClick={() => openSongView(linkedSong)}
                                      className="text-[11px] font-medium text-indigo-600 hover:underline">View</button>
                                    <button type="button" onClick={() => updateLocal(role, { songId: '' })}
                                      className="text-[11px] font-medium text-slate-400 hover:text-slate-600">Unlink</button>
                                  </div>
                                )}
                              </div>
                            )
                          })()}
                        </td>
                      </tr>
                        )
                      })
                    })}
                  </tbody>
                </table>
              )}
            </motion.div>
            )}
          </AnimatePresence>

        </div>
      )}

      {activeTab === 'finance' && (canManageWorship || canViewInsights) && (
        <div className="space-y-4">

          {/* Expense is the permanent base view — Budget and Payout Request are
              drawers layered on top via these two icon buttons, not sibling tabs, so
              switching between them never navigates away from the expense breakdown
              underneath. */}
          <div className="flex items-center justify-between gap-2 p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Expense</span>
            {/* Icon-only, top-right utility buttons — same small rounded-icon-button
                shape/hover convention as the notifications/chat icons in the main
                dashboard header (WorkspaceHeader), just kept in Worship's own indigo
                accent instead of that page's warm palette. */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setFinanceOverlay('budget')}
                title="Budget"
                aria-label="Open Budget"
                className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
              >
                <Wallet size={17} />
              </button>
              <button
                type="button"
                onClick={() => setFinanceOverlay('payout')}
                title="Payout Request"
                aria-label="Open Payout Request"
                className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
              >
                <Banknote size={17} />
              </button>
            </div>
          </div>

          <DeptExpenseTab department="Worship" />

          {financeOverlay && (
            <div
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
              onClick={() => setFinanceOverlay(null)}
            >
              <div
                className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between z-10">
                  <h3 className="font-semibold text-slate-800">{financeOverlay === 'budget' ? 'Budget' : 'Payout Request'}</h3>
                  <button
                    type="button"
                    onClick={() => setFinanceOverlay(null)}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                    aria-label="Close"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="p-4">
                  {financeOverlay === 'budget' && <BudgetPage department="Worship" />}
                  {financeOverlay === 'payout' && <AdvancePayoutTab departmentSlug="worship" departmentName="Worship" />}
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Operations — Sub Department and Team management have their own dedicated tabs;
          financial pipelines (Expense/Budget/Payout) live under Finance above, not here. */}
      {activeTab === 'operations' && (canManageWorship || canViewInsights) && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 text-center text-sm text-slate-400">
            Nothing to configure here yet.
          </div>

          {false && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setAddMemberModalOpen(false)}>
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-lg font-semibold text-slate-800">Add New Team Member</h3>
                  <button type="button" onClick={() => setAddMemberModalOpen(false)} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
                </div>
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
                      setNewMember({ name: '', memberSince: new Date().toISOString().slice(0, 10), isFormer: false, positions: [], isWorshipDirector: false })
                      setAddMemberModalOpen(false)
                      await loadTeam()
                    } catch (err) {
                      console.error(err)
                      alert('Failed to add member')
                    }
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Name <span className="text-red-400">*</span></label>
                    <input
                      type="text"
                      required
                      placeholder="Full name"
                      value={newMember.name}
                      onChange={(e) => setNewMember((m) => ({ ...m, name: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Member since</label>
                    <input
                      type="date"
                      value={newMember.memberSince}
                      onChange={(e) => setNewMember((m) => ({ ...m, memberSince: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Positions</label>
                    <div className="flex flex-wrap gap-2">
                      {MEMBER_POSITIONS.map((pos) => (
                        <label
                          key={pos}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs border cursor-pointer transition-colors ${
                            newMember.positions.includes(pos)
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-indigo-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="hidden"
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
                          {pos}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newMember.isWorshipDirector}
                        onChange={(e) => setNewMember((m) => ({ ...m, isWorshipDirector: e.target.checked }))}
                        className="rounded"
                      />
                      Set as Worship Director
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newMember.isFormer}
                        onChange={(e) => setNewMember((m) => ({ ...m, isFormer: e.target.checked }))}
                        className="rounded"
                      />
                      Mark as Former Member
                    </label>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button type="submit" className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">Add Member</button>
                    <button type="button" onClick={() => setAddMemberModalOpen(false)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm hover:bg-slate-50">Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </div>
      )}

      {worshipMemberLinking && (
        <WorshipLinkModal
          member={worshipMemberLinking}
          onLink={async (visitor) => {
            // `visitor` is a getMergedPeopleDirectory() entry — it has `personId` (real
            // people-collection id) and `_visitorIds` (linked D-Light visitor doc ids),
            // never a plain `.id`. Persisting `visitor.id` here silently wrote `visitorId:
            // undefined`, leaving the member just as disconnected as before "linking".
            const updated = {
              name: visitor.name,
              phone: visitor.phone || '',
              visitorId: visitor._visitorIds?.[0] || '',
              personId: visitor.personId || '',
            }
            await updateWorshipTeamMember(worshipMemberLinking.id, updated)
            setAllMembers(prev => prev.map(m => m.id === worshipMemberLinking.id ? { ...m, ...updated } : m))
            setWorshipMemberLinking(null)
          }}
          onClose={() => setWorshipMemberLinking(null)}
        />
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
              {editMember.isFormer && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Former since</label>
                  <input
                    type="date"
                    value={editMember.formerSince || ''}
                    onChange={(e) => setEditMember((m) => ({ ...m, formerSince: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>
              )}
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
                  const patch = {
                    name: editMember.name,
                    memberSince: editMember.memberSince,
                    isWorshipDirector: !!editMember.isWorshipDirector,
                    positions: editMember.positions || [],
                    ...(editMember.isFormer && { formerSince: editMember.formerSince || '' }),
                  }
                  try {
                    await updateWorshipTeamMember(editMember.id, patch)
                    setAllMembers(prev => prev.map(m => m.id === editMember.id ? { ...m, ...patch } : m))
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
              {editMember.isFormer ? (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await updateWorshipTeamMember(editMember.id, { isFormer: false, formerSince: '' })
                      setAllMembers(prev => prev.map(m => m.id === editMember.id ? { ...m, isFormer: false, formerSince: '' } : m))
                      setEditMember(null)
                    } catch (e) {
                      console.error(e)
                      alert('Failed to update')
                    }
                  }}
                  className="px-4 py-2 rounded-lg bg-emerald-100 text-emerald-700 font-medium hover:bg-emerald-200"
                >
                  Make active
                </button>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    const formerSince = new Date().toISOString().slice(0, 10)
                    try {
                      await updateWorshipTeamMember(editMember.id, { isFormer: true, formerSince })
                      setAllMembers(prev => prev.map(m => m.id === editMember.id ? { ...m, isFormer: true, formerSince } : m))
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
              )}
              <button
                type="button"
                onClick={async () => {
                  if (!confirm('Delete this member permanently?')) return
                  try {
                    await deleteWorshipTeamMember(editMember.id, { department: DEPARTMENT, name: editMember.name })
                    setAllMembers(prev => prev.filter(m => m.name !== editMember.name))
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


      {/* ── The Team tab ── */}
      {activeTab === 'theTeam' && (
        <div className="space-y-6 pb-24">

          {/* Active members */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-800">The Team</h2>
                <p className="text-xs text-slate-400 mt-0.5">{activeMembers.length} active member{activeMembers.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {canManageWorship && (() => {
                  const unlinked = allMembers.filter(m => !m.visitorId && !m.personId)
                  if (!unlinked.length) return null
                  return (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`Remove ${unlinked.length} unlinked member${unlinked.length !== 1 ? 's' : ''}?\n\n${unlinked.map(m => m.name).join(', ')}`)) return
                        try {
                          await Promise.all(unlinked.map(m => deleteWorshipTeamMember(m.id, { department: DEPARTMENT, name: m.name })))
                          setAllMembers(prev => prev.filter(m => m.visitorId || m.personId))
                        } catch (e) { console.error(e); alert('Failed to remove unlinked members') }
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 text-red-600 border border-red-200 text-sm font-medium hover:bg-red-100 transition-colors"
                    >
                      Remove {unlinked.length} Unlinked
                    </button>
                  )
                })()}
                {canManageWorship && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewMember({ name: '', visitorId: '', personId: '', memberSince: new Date().toISOString().slice(0, 10), isFormer: false, positions: [], isWorshipDirector: false })
                      setAddMemberVisitors([])
                      setAddMemberVisitorsLoading(true)
                      getApprovedRosterVisitors().then(setAddMemberVisitors).catch(() => setAddMemberVisitors([])).finally(() => setAddMemberVisitorsLoading(false))
                      setAddMemberModalOpen(true)
                    }}
                    aria-label="Add New Team Member"
                    className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 shadow-sm shrink-0"
                  >
                    <span className="text-lg leading-none">+</span>
                    <span className="hidden sm:inline">Add New Team Member</span>
                  </button>
                )}
              </div>
            </div>
            {loadingTeam ? (
              <div className="p-5 text-center text-slate-500">Loading...</div>
            ) : activeMembers.length === 0 ? (
              <div className="p-5 text-center text-slate-500">No team members yet.</div>
            ) : (
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {activeMembers.map((m) => (
                  <WorshipMemberCard
                    key={m.id}
                    member={m}
                    canManageWorship={canManageWorship}
                    onEdit={(mm) => setEditMember({ ...mm })}
                    onDelete={handleDeleteMember}
                    onLink={!m.personId ? (mm) => setWorshipMemberLinking(mm) : undefined}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Former members */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <h2 className="px-5 py-4 font-semibold text-slate-800 border-b border-slate-200">Former members</h2>
            {loadingTeam ? (
              <div className="p-5 text-center text-slate-500">Loading...</div>
            ) : formerMembers.length === 0 ? (
              <div className="p-5 text-center text-slate-500">No former members.</div>
            ) : (
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {formerMembers.map((m) => (
                  <WorshipMemberCard
                    key={m.id}
                    member={m}
                    isFormer
                    canManageWorship={canManageWorship}
                    onEdit={(mm) => setEditMember({ ...mm })}
                    onDelete={handleDeleteMember}
                    onLink={!m.personId ? (mm) => setWorshipMemberLinking(mm) : undefined}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Add member modal */}
          {addMemberModalOpen && canManageWorship && (
            <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4" onClick={() => setAddMemberModalOpen(false)}>
              <div
                className="bg-white dark:bg-[#16213a] rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md border-0 dark:border dark:border-slate-700/50 overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
                {/* drag handle on mobile */}
                <div className="sm:hidden flex justify-center pt-3 pb-1">
                  <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-slate-600" />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700/50">
                  <div>
                    <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Add New Team Member</h3>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Must exist in the People Directory</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAddMemberModalOpen(false)}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 text-xl leading-none transition-colors"
                  >×</button>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    if (!newMember.visitorId && !newMember.personId) return
                    try {
                      await addWorshipTeamMember(DEPARTMENT, {
                        name: newMember.name.trim(), visitorId: newMember.visitorId, personId: newMember.personId,
                        memberSince: newMember.memberSince,
                        isFormer: newMember.isFormer, positions: newMember.positions,
                        isWorshipDirector: newMember.isWorshipDirector,
                      }, userProfile?.email)
                      setNewMember({ name: '', visitorId: '', personId: '', memberSince: new Date().toISOString().slice(0, 10), isFormer: false, positions: [], isWorshipDirector: false })
                      setAddMemberModalOpen(false)
                      await loadTeam()
                    } catch (err) { console.error(err); alert('Failed to add member') }
                  }}
                  className="px-6 py-5 space-y-4"
                >
                  {/* Person picker — keyed/matched on the merged directory entry's `_key`
                      (always present and unique), not `.id` (getMergedPeopleDirectory's
                      entries never have a plain `.id` — only `personId` for a real people-
                      collection record and `_visitorIds` for linked D-Light visitor docs).
                      Matching on `.id` here silently resolved to `undefined` for every
                      candidate, which made the browser fall back to each <option>'s text
                      content (the person's name) as its value — so a pick only ever
                      "matched" by display-name string and never actually bound a real
                      personId/visitorId onto the new team member record. */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                      Person <span className="text-red-400">*</span>
                    </label>
                    {(newMember.visitorId || newMember.personId) ? (
                      <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-emerald-200 dark:border-emerald-700/50 bg-emerald-50 dark:bg-emerald-900/20">
                        <span className="w-8 h-8 rounded-full bg-emerald-500 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
                          {newMember.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="flex-1 text-sm font-semibold text-emerald-900 dark:text-emerald-300">{newMember.name}</span>
                        <button
                          type="button"
                          onClick={() => setNewMember(m => ({ ...m, name: '', visitorId: '', personId: '' }))}
                          className="text-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-200 text-xl leading-none transition-colors"
                        >×</button>
                      </div>
                    ) : (
                      <select
                        value=""
                        disabled={addMemberVisitorsLoading || addMemberVisitors.length === 0}
                        onChange={e => {
                          const v = addMemberVisitors.find(x => x._key === e.target.value)
                          if (v) setNewMember(m => ({ ...m, name: v.name, visitorId: v._visitorIds?.[0] || '', personId: v.personId || '' }))
                        }}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/60 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-500/40 focus:border-indigo-400 dark:focus:border-indigo-500 transition-colors disabled:opacity-50"
                      >
                        <option value="" disabled>
                          {addMemberVisitorsLoading
                            ? 'Loading candidates…'
                            : addMemberVisitors.length === 0
                              ? 'No candidates ready for main roster'
                              : 'Select an approved candidate…'}
                        </option>
                        {addMemberVisitors.map(v => (
                          <option key={v._key} value={v._key}>{v.name}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Member since */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Member Since</label>
                    <input
                      type="date"
                      value={newMember.memberSince}
                      onChange={(e) => setNewMember((m) => ({ ...m, memberSince: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/60 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-500/40 transition-colors"
                    />
                  </div>

                  {/* Positions */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Positions</label>
                    <div className="flex flex-wrap gap-2">
                      {MEMBER_POSITIONS.map((pos) => (
                        <label
                          key={pos}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs border cursor-pointer transition-colors ${
                            newMember.positions.includes(pos)
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-indigo-300 dark:hover:border-indigo-500'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={newMember.positions.includes(pos)}
                            onChange={(e) => setNewMember((m) => ({ ...m, positions: e.target.checked ? [...m.positions, pos] : m.positions.filter((p) => p !== pos) }))}
                          />
                          {pos}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Toggles */}
                  <div className="flex flex-col gap-2.5 py-1 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700/40">
                    <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input type="checkbox" checked={newMember.isWorshipDirector} onChange={(e) => setNewMember((m) => ({ ...m, isWorshipDirector: e.target.checked }))} className="rounded accent-indigo-600" />
                      Set as Worship Director
                    </label>
                    <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input type="checkbox" checked={newMember.isFormer} onChange={(e) => setNewMember((m) => ({ ...m, isFormer: e.target.checked }))} className="rounded accent-indigo-600" />
                      Mark as Former Member
                    </label>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={!newMember.visitorId && !newMember.personId}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >Add Member</button>
                    <button
                      type="button"
                      onClick={() => setAddMemberModalOpen(false)}
                      className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 bg-white dark:bg-transparent text-sm hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
                    >Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ── Practice & Rehearsals tab ── */}
      {activeTab === 'practiceRehearsal' && (
        <div className="space-y-5">

          {/* Sub-nav */}
          <div className="flex items-center gap-1 border-b border-slate-200">
            {[{ key: 'schedule', label: 'Schedule' }, { key: 'records', label: 'Records' }].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setPracticeSubPage(key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${practiceSubPage === key ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-500 hover:text-violet-600'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Schedule sub-page ── */}
          {practiceSubPage === 'schedule' && (
            <div className="space-y-6">
              {/* 3-Sunday week boxes */}
              {loadingWeekBoxes ? (
                <div className="py-8 text-center text-slate-400 text-sm">Loading…</div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {weekBoxSchedules.slice(0, 1).filter(w => {
                    const pa = w.schedule?.practiceAttendance || {}
                    return !(pa.fridaySession?.endOfPractice && pa.saturdaySession?.endOfPractice && pa.saturdaySession?.beginRehearsal && pa.saturdaySession?.endRehearsal)
                  }).map(({ sundayDate, fridayDate, saturdayDate, schedule }) => {
                    const assignments = (schedule?.assignments || []).filter(a => a.memberId).filter((a, i, arr) => arr.findIndex(x => x.memberId === a.memberId) === i)
                    const practiceAtt = schedule?.practiceAttendance || {}

                    let fmtSunday = sundayDate
                    try { fmtSunday = format(new Date(sundayDate + 'T12:00:00'), 'd MMM yyyy') } catch {}
                    let fmtFriday = fridayDate
                    try { fmtFriday = format(new Date(fridayDate + 'T12:00:00'), 'EEE d MMM') } catch {}
                    let fmtSaturday = saturdayDate
                    try { fmtSaturday = format(new Date(saturdayDate + 'T12:00:00'), 'EEE d MMM') } catch {}

                    const arriveCount = (day) =>
                      Object.values(practiceAtt[day] || {}).filter(v => v.arrivedAt).length

                    const saveUpdated = async (updated) => {
                      await updateWorshipScheduleById(schedule.id, { practiceAttendance: updated })
                      setWeekBoxSchedules(prev =>
                        prev.map(w => w.sundayDate === sundayDate ? { ...w, schedule: { ...w.schedule, practiceAttendance: updated } } : w)
                      )
                    }

                    const markArrived = async (day, a) => {
                      const updated = { ...practiceAtt, [day]: { ...(practiceAtt[day] || {}), [a.memberId]: { arrivedAt: format(new Date(), 'HH:mm'), memberName: a.memberName } } }
                      await saveUpdated(updated)
                    }

                    const undoArrived = async (day, a) => {
                      const dayData = { ...(practiceAtt[day] || {}) }
                      delete dayData[a.memberId]
                      await saveUpdated({ ...practiceAtt, [day]: dayData })
                    }

                    const recordSession = async (sessionKey, field) => {
                      const updated = { ...practiceAtt, [sessionKey]: { ...(practiceAtt[sessionKey] || {}), [field]: format(new Date(), 'HH:mm') } }
                      await saveUpdated(updated)
                    }

                    const clearSession = async (sessionKey, field) => {
                      const sess = { ...(practiceAtt[sessionKey] || {}) }
                      delete sess[field]
                      const updated = { ...practiceAtt, [sessionKey]: sess }
                      await saveUpdated(updated)
                    }

                    const TimingRow = (label, sessionKey, field) => {
                      const val = practiceAtt[sessionKey]?.[field]
                      if (val) {
                        return (
                          <div key={field} className="rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 px-4 py-3 text-center shadow-md">
                            <p className="text-[10px] font-semibold text-indigo-200 uppercase tracking-wider">{label}</p>
                            <p className="text-lg font-bold text-white mt-0.5">{val}</p>
                            {canManageWorship && (
                              <button type="button" onClick={() => clearSession(sessionKey, field)} className="text-[9px] text-white/60 hover:text-white mt-1 transition-colors underline underline-offset-2">undo</button>
                            )}
                          </div>
                        )
                      }
                      if (canManageWorship) {
                        return (
                          <button key={field} type="button" onClick={() => recordSession(sessionKey, field)}
                            className="w-full rounded-2xl bg-white border-2 border-dashed border-slate-200 px-4 py-3 text-center hover:border-indigo-300 hover:bg-indigo-50 active:scale-95 transition-all">
                            <p className="text-xs font-semibold text-slate-500">{label}</p>
                            <p className="text-[9px] text-slate-400 mt-0.5">tap to record time</p>
                          </button>
                        )
                      }
                      return (
                        <div key={field} className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 text-center">
                          <p className="text-xs text-slate-400">{label}</p>
                          <p className="text-[10px] text-slate-300 mt-0.5">—</p>
                        </div>
                      )
                    }

                    const renderDay = (day, sessionKey, fmtLabel, sessionFields) => {
                      const dayAtt = practiceAtt[day] || {}
                      return (
                        <div className="px-4 py-3 border-t border-slate-100">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-slate-600">{fmtLabel}</p>
                            {assignments.length > 0 && (
                              <span className="text-xs text-violet-600 font-medium">{arriveCount(day)}/{assignments.length} arrived</span>
                            )}
                          </div>
                          {assignments.length === 0 ? (
                            <p className="text-xs text-slate-300 italic">No team assigned</p>
                          ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                              {assignments.map(a => {
                                const rec = dayAtt[a.memberId]
                                const initial = (a.memberName || '?').charAt(0).toUpperCase()
                                if (rec?.arrivedAt) {
                                  return (
                                    <div key={a.memberId} className="rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 px-3 py-3 text-center shadow-md flex flex-col items-center">
                                      <div className="w-9 h-9 rounded-full bg-white/25 text-white text-sm font-bold flex items-center justify-center mb-1.5 shadow-inner">
                                        {initial}
                                      </div>
                                      <p className="text-xs font-semibold text-white truncate w-full text-center leading-tight">{a.memberName}</p>
                                      <span className="text-[10px] font-bold text-emerald-100 mt-1 bg-white/20 px-2 py-0.5 rounded-full">{rec.arrivedAt}</span>
                                      {canManageWorship && (
                                        <button type="button" onClick={() => undoArrived(day, a)} className="text-[9px] text-white/60 hover:text-white mt-1.5 transition-colors leading-none underline underline-offset-2">
                                          undo
                                        </button>
                                      )}
                                    </div>
                                  )
                                }
                                if (canManageWorship) {
                                  return (
                                    <button
                                      key={a.memberId}
                                      type="button"
                                      onClick={() => markArrived(day, a)}
                                      className="rounded-2xl bg-white border-2 border-slate-100 shadow-sm px-3 py-3 text-center flex flex-col items-center hover:border-violet-300 hover:bg-violet-50 hover:shadow-md active:scale-95 transition-all w-full"
                                    >
                                      <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-400 text-sm font-bold flex items-center justify-center mb-1.5">
                                        {initial}
                                      </div>
                                      <p className="text-xs font-semibold text-slate-600 truncate w-full text-center leading-tight">{a.memberName}</p>
                                      <p className="text-[9px] text-slate-400 mt-1">tap to mark</p>
                                    </button>
                                  )
                                }
                                return (
                                  <div key={a.memberId} className="rounded-2xl bg-slate-50 border border-slate-100 px-3 py-3 text-center flex flex-col items-center">
                                    <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-300 text-sm font-bold flex items-center justify-center mb-1.5">
                                      {initial}
                                    </div>
                                    <p className="text-xs text-slate-400 truncate w-full text-center leading-tight">{a.memberName}</p>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                          <div className="border-t border-slate-100 pt-3 px-1 grid grid-cols-1 gap-2">
                            {sessionFields.map(([label, field]) => TimingRow(label, sessionKey, field))}
                          </div>
                        </div>
                      )
                    }

                    return (
                      <div key={sundayDate} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                        <div className="bg-gradient-to-br from-violet-600 to-indigo-600 px-4 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-violet-200">Sunday Service</p>
                          <p className="text-base font-bold text-white mt-0.5">{fmtSunday}</p>
                          <p className="text-xs text-violet-200 mt-0.5">{assignments.length > 0 ? `${assignments.length} members assigned` : 'No team assigned yet'}</p>
                        </div>
                        <div className="flex-1">
                          {renderDay('friday', 'fridaySession', fmtFriday, [
                            ['End of Practice', 'endOfPractice'],
                          ])}
                          {format(new Date(), 'yyyy-MM-dd') === saturdayDate && renderDay('saturday', 'saturdaySession', fmtSaturday, [
                            ['End of Practice', 'endOfPractice'],
                            ['Begin Rehearsal', 'beginRehearsal'],
                            ['End of Rehearsal', 'endRehearsal'],
                          ])}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Records sub-page ── */}
          {practiceSubPage === 'records' && (
            <div className="space-y-3">
              {loadingRecords ? (
                <div className="py-10 text-center text-slate-400 text-sm">Loading records…</div>
              ) : recordsSchedules.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-sm">No records yet. Previous weeks move here when a new week's plan is saved.</div>
              ) : recordsSchedules.map(s => {
                const pa = s.practiceAttendance || {}
                let fmtSunday = s.date
                try { fmtSunday = format(new Date(s.date + 'T12:00:00'), 'EEEE, d MMMM yyyy') } catch {}
                const fridayArrived = Object.values(pa.friday || {}).filter(v => v.arrivedAt).length
                const satArrived = Object.values(pa.saturday || {}).filter(v => v.arrivedAt).length
                const total = (s.assignments || []).filter(a => a.memberId).length
                const isComplete = !!(pa.fridaySession?.endOfPractice && pa.saturdaySession?.endOfPractice && pa.saturdaySession?.beginRehearsal && pa.saturdaySession?.endRehearsal)
                return (
                  <div key={s.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">{fmtSunday}</p>
                        <p className="text-xs text-slate-400 mt-0.5">Fri: {fridayArrived}/{total} · Sat: {satArrived}/{total}</p>
                      </div>
                      {isComplete
                        ? <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full px-2.5 py-0.5 font-semibold">Complete</span>
                        : <span className="text-xs bg-slate-100 text-slate-500 border border-slate-200 rounded-full px-2.5 py-0.5 font-medium">Archived</span>
                      }
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
                      <div className="px-5 py-4 space-y-1.5">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Friday</p>
                        <div className="flex justify-between text-xs"><span className="text-slate-500">End of Practice</span><span className="font-semibold text-slate-800">{pa.fridaySession?.endOfPractice || '—'}</span></div>
                      </div>
                      <div className="px-5 py-4 space-y-1.5">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Saturday</p>
                        <div className="flex justify-between text-xs"><span className="text-slate-500">End of Practice</span><span className="font-semibold text-slate-800">{pa.saturdaySession?.endOfPractice || '—'}</span></div>
                        <div className="flex justify-between text-xs"><span className="text-slate-500">Begin Rehearsal</span><span className="font-semibold text-slate-800">{pa.saturdaySession?.beginRehearsal || '—'}</span></div>
                        <div className="flex justify-between text-xs"><span className="text-slate-500">End of Rehearsal</span><span className="font-semibold text-slate-800">{pa.saturdaySession?.endRehearsal || '—'}</span></div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Custom Sessions (schedule view only) ── */}
          {practiceSubPage === 'schedule' && (loadingRehearsals || rehearsals.length > 0) && (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Custom Sessions</p>

          {loadingRehearsals ? (
            <div className="py-10 text-center text-slate-400 text-sm">Loading…</div>
          ) : (() => {
            const today = format(new Date(), 'yyyy-MM-dd')
            // Only show custom sessions that fall within the current active week (Mon–Sun of active Sunday)
            const activeSunday = weekBoxSchedules[0]?.sundayDate
            const weekStart = activeSunday
              ? format(subDays(new Date(activeSunday + 'T12:00:00'), 6), 'yyyy-MM-dd')
              : today
            const upcoming = rehearsals.filter(r =>
              (r.date || '') >= today &&
              r.date >= weekStart &&
              (activeSunday ? r.date <= activeSunday : true)
            )
            const past = rehearsals.filter(r => (r.date || '') < today)

            const openAttendance = (r) => {
              const draft = {}
              activeMembers.forEach(m => {
                const saved = r.attendance?.[m.id] || {}
                draft[m.id] = { present: saved.present ?? false, arrivedAt: saved.arrivedAt ?? '', memberName: m.name }
              })
              setAttendanceDraft(draft)
              setOpenAttendanceId(r.id)
            }

            const saveAttendance = async (rid) => {
              await updateWorshipRehearsal(rid, { attendance: attendanceDraft })
              setRehearsals(prev => prev.map(x => x.id === rid ? { ...x, attendance: { ...attendanceDraft } } : x))
              setOpenAttendanceId(null)
            }

            const AttendancePanel = ({ r }) => {
              const presentCount = Object.values(attendanceDraft).filter(v => v.present).length
              return (
                <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Attendance · {presentCount} of {activeMembers.length} present</p>
                    <button type="button" onClick={() => setOpenAttendanceId(null)} className="text-xs text-slate-400 hover:text-slate-600">✕ Close</button>
                  </div>
                  <div className="space-y-2">
                    {activeMembers.map(m => {
                      const entry = attendanceDraft[m.id] || { present: false, arrivedAt: '' }
                      return (
                        <div key={m.id} className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            id={`att-${r.id}-${m.id}`}
                            checked={entry.present}
                            onChange={e => setAttendanceDraft(d => ({ ...d, [m.id]: { ...d[m.id], present: e.target.checked, memberName: m.name } }))}
                            className="w-4 h-4 rounded accent-violet-600 flex-shrink-0"
                          />
                          <label htmlFor={`att-${r.id}-${m.id}`} className={`text-sm flex-1 cursor-pointer ${entry.present ? 'font-medium text-slate-800' : 'text-slate-500'}`}>
                            {m.name}
                            {m.isWorshipDirector && <span className="ml-1.5 text-[10px] text-amber-600 font-semibold">Director</span>}
                          </label>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-400">Arrived</span>
                            <input
                              type="time"
                              value={entry.arrivedAt}
                              disabled={!entry.present}
                              onChange={e => setAttendanceDraft(d => ({ ...d, [m.id]: { ...d[m.id], arrivedAt: e.target.value } }))}
                              className="px-2 py-1 text-xs rounded border border-slate-300 disabled:opacity-30 disabled:cursor-not-allowed w-24"
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {canManageWorship && (
                    <button
                      type="button"
                      onClick={() => saveAttendance(r.id)}
                      className="w-full py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700"
                    >
                      Save Attendance
                    </button>
                  )}
                </div>
              )
            }

            const attendanceSummary = (r) => {
              if (!r.attendance) return null
              const present = Object.values(r.attendance).filter(v => v.present).length
              const total = Object.keys(r.attendance).length
              if (!total) return null
              return <span className="text-xs bg-violet-50 text-violet-700 border border-violet-100 rounded-full px-2 py-0.5">{present}/{total} present</span>
            }

            return (
              <div className="space-y-6">
                {upcoming.length > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Upcoming</p>
                    <div className="space-y-3">
                      {upcoming.map((r) => {
                        let fmtDate = r.date
                        try { fmtDate = format(new Date(r.date + 'T12:00:00'), 'EEE, d MMM yyyy') } catch {}
                        const isAttendanceOpen = openAttendanceId === r.id
                        return (
                          <div key={r.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                            <div className="flex flex-wrap items-start gap-4">
                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold text-slate-800">{fmtDate}</span>
                                  {r.time && <span className="text-xs bg-violet-50 text-violet-700 border border-violet-100 rounded-full px-2 py-0.5 font-medium">{r.time}</span>}
                                  {r.done && <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full px-2 py-0.5 font-medium">Done</span>}
                                  {attendanceSummary(r)}
                                </div>
                                {r.location && <p className="text-xs text-slate-500">📍 {r.location}</p>}
                                {r.notes && <p className="text-sm text-slate-600 mt-1">{r.notes}</p>}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={() => isAttendanceOpen ? setOpenAttendanceId(null) : openAttendance(r)}
                                  className={`text-xs border rounded-lg px-2 py-1 transition-colors ${isAttendanceOpen ? 'bg-violet-600 text-white border-violet-600' : 'text-violet-600 border-violet-200 hover:bg-violet-50'}`}
                                >
                                  {isAttendanceOpen ? 'Close' : 'Attendance'}
                                </button>
                                {canManageWorship && (
                                  <>
                                    {!r.done && (
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          await updateWorshipRehearsal(r.id, { done: true })
                                          setRehearsals(prev => prev.map(x => x.id === r.id ? { ...x, done: true } : x))
                                        }}
                                        className="text-xs text-emerald-600 border border-emerald-200 rounded-lg px-2 py-1 hover:bg-emerald-50"
                                      >
                                        Mark done
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingRehearsal(r)
                                        setRehearsalForm({ date: r.date || '', time: r.time || '', location: r.location || '', notes: r.notes || '' })
                                        setRehearsalModalOpen(true)
                                      }}
                                      className="text-xs text-slate-500 border border-slate-200 rounded-lg px-2 py-1 hover:bg-slate-50"
                                    >
                                      Edit
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (!window.confirm('Remove this practice session?')) return
                                    await deleteWorshipRehearsal(r.id)
                                    setRehearsals(prev => prev.filter(x => x.id !== r.id))
                                  }}
                                  className="text-xs text-red-500 border border-red-100 rounded-lg px-2 py-1 hover:bg-red-50"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                            {isAttendanceOpen && <AttendancePanel r={r} />}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {past.length > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Past Sessions</p>
                    <div className="space-y-2">
                      {[...past].reverse().map((r) => {
                        let fmtDate = r.date
                        try { fmtDate = format(new Date(r.date + 'T12:00:00'), 'EEE, d MMM yyyy') } catch {}
                        const isAttendanceOpen = openAttendanceId === r.id
                        return (
                          <div key={r.id} className="bg-slate-50 rounded-xl border border-slate-100 px-4 py-3">
                            <div className="flex flex-wrap items-center gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-medium text-slate-600">{fmtDate}</span>
                                  {r.time && <span className="text-xs text-slate-400">{r.time}</span>}
                                  {r.location && <span className="text-xs text-slate-400">· {r.location}</span>}
                                  {r.done && <span className="text-xs bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full px-2 py-0.5">Done</span>}
                                  {attendanceSummary(r)}
                                </div>
                                {r.notes && <p className="text-xs text-slate-400 mt-0.5 truncate">{r.notes}</p>}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={() => isAttendanceOpen ? setOpenAttendanceId(null) : openAttendance(r)}
                                  className={`text-xs border rounded-lg px-2 py-1 transition-colors ${isAttendanceOpen ? 'bg-violet-600 text-white border-violet-600' : 'text-violet-600 border-violet-200 hover:bg-violet-50'}`}
                                >
                                  {isAttendanceOpen ? 'Close' : 'Attendance'}
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (!window.confirm('Remove this practice session?')) return
                                    await deleteWorshipRehearsal(r.id)
                                    setRehearsals(prev => prev.filter(x => x.id !== r.id))
                                  }}
                                  className="text-xs text-red-400 hover:text-red-600 border border-red-100 rounded-lg px-2 py-1 hover:bg-red-50"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                            {isAttendanceOpen && <AttendancePanel r={r} />}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {rehearsalModalOpen && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setRehearsalModalOpen(false)}>
              <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>
                <h3 className="font-semibold text-slate-800 mb-4">{editingRehearsal ? 'Edit Session' : 'Add Practice Session'}</h3>
                <form
                  className="space-y-3"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    try {
                      if (editingRehearsal) {
                        await updateWorshipRehearsal(editingRehearsal.id, rehearsalForm)
                        setRehearsals(prev => prev.map(x => x.id === editingRehearsal.id ? { ...x, ...rehearsalForm } : x).sort((a, b) => (a.date || '').localeCompare(b.date || '')))
                      } else {
                        const id = await addWorshipRehearsal(DEPARTMENT, rehearsalForm, userProfile?.email)
                        setRehearsals(prev => [...prev, { id, department: DEPARTMENT, ...rehearsalForm }].sort((a, b) => (a.date || '').localeCompare(b.date || '')))
                      }
                      setRehearsalModalOpen(false)
                    } catch (err) {
                      console.error(err)
                      alert('Failed to save')
                    }
                  }}
                >
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Date <span className="text-red-400">*</span></label>
                    <input type="date" required value={rehearsalForm.date} onChange={e => setRehearsalForm(f => ({ ...f, date: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Time</label>
                    <input type="time" value={rehearsalForm.time} onChange={e => setRehearsalForm(f => ({ ...f, time: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Location</label>
                    <input type="text" placeholder="e.g. Main Hall" value={rehearsalForm.location} onChange={e => setRehearsalForm(f => ({ ...f, location: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
                    <textarea rows={3} placeholder="What to focus on, songs to practice…" value={rehearsalForm.notes} onChange={e => setRehearsalForm(f => ({ ...f, notes: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button type="submit" className="flex-1 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700">{editingRehearsal ? 'Save' : 'Add'}</button>
                    <button type="button" onClick={() => setRehearsalModalOpen(false)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm hover:bg-slate-50">Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}
          </div>
          )}
        </div>
      )}

      {/* ── Songs Directory tab ── */}
      {activeTab === 'songsDirectory' && (
        <div className="space-y-4">

          {/* Sub-nav */}
          <div className="flex items-center gap-1 border-b border-slate-200">
            {[{ key: 'directory', label: 'Directory' }, { key: 'design', label: 'Design your song' }].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setSongSubPage(key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${songSubPage === key ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-500 hover:text-violet-600'}`}
              >{label}</button>
            ))}
          </div>

          {/* ── Directory sub-page ── */}
          {songSubPage === 'directory' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-slate-400">{songs.length} song{songs.length !== 1 ? 's' : ''}</p>
                {canManageWorshipSongs && (
                  <button
                    type="button"
                    onClick={() => { setSongForm({ title: '', artist: '', key: '', tempo: '', notes: '' }); setSongModal('add') }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 active:scale-95 transition-all"
                  >
                    <span className="text-base leading-none">+</span> Add Song
                  </button>
                )}
              </div>

              <input
                type="text"
                placeholder="Search by title or artist…"
                value={songSearch}
                onChange={(e) => setSongSearch(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
              />

              {loadingSongs ? (
                <div className="text-center py-10 text-slate-400 text-sm">Loading…</div>
              ) : songs.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-sm">No songs yet. Add your first song.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {(() => {
                    const filtered = songs.filter((s) => {
                      const q = songSearch.toLowerCase()
                      return !q || s.title?.toLowerCase().includes(q) || s.artist?.toLowerCase().includes(q)
                    })
                    if (filtered.length === 0) return <p className="col-span-full text-center text-slate-400 text-sm py-6">No songs match your search.</p>
                    return filtered.map((song, i) => {
                      const theme = SONG_CARD_THEMES[i % SONG_CARD_THEMES.length]
                      const designer = song.designedBy || song.createdBy
                      return (
                        <div
                          key={song.id}
                          className={`rounded-2xl border border-slate-200/60 border-t-4 ${theme.border} ${theme.bg} px-4 py-3 shadow-sm hover:shadow-md active:scale-[0.99] cursor-pointer transition-all`}
                          onClick={() => openSongView(song)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className={`font-bold text-base truncate ${theme.title}`}>{song.title}</p>
                              {designer && (
                                <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                                  Designed by <span className="font-medium text-slate-500">{designer}</span>
                                </p>
                              )}
                              {song.key && (
                                <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full mt-1.5 ${theme.chip}`}>
                                  {song.key}
                                </span>
                              )}
                            </div>
                            {canEditSong(song) && (
                              <div className="flex gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                <button type="button" onClick={() => { setEditingSong(song); setSongSubPage('design') }}
                                  title="Edit song"
                                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-white/70 transition-colors">
                                  <Pencil size={14} />
                                </button>
                                <button type="button" disabled={deletingId === song.id} onClick={async () => {
                                  if (!window.confirm(`Delete "${song.title}"?`)) return
                                  setDeletingId(song.id)
                                  try { await deleteWorshipSong(song.id); setSongs((p) => p.filter((s) => s.id !== song.id)) } finally { setDeletingId(null) }
                                }}
                                  title="Delete song"
                                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-white/70 transition-colors disabled:opacity-40">
                                  {deletingId === song.id ? <span className="text-xs">…</span> : <Trash2 size={14} />}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
              )}
            </div>
          )}

          {/* ── Design your song sub-page ── */}
          {songSubPage === 'design' && (
            <SongDesigner
              canManageWorship={canManageWorshipSongs}
              userProfile={userProfile}
              editingSong={editingSong}
              onCancelEdit={() => { setEditingSong(null); setSongSubPage('directory') }}
              onSaved={() => { loadSongs(); if (editingSong) { setEditingSong(null); setSongSubPage('directory') } }}
            />
          )}

          {/* Add / Edit modal (Directory) */}
          {songModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
                <h3 className="font-semibold text-slate-800">{songModal === 'add' ? 'Add Song' : 'Edit Song'}</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Title *</label>
                    <input value={songForm.title} onChange={(e) => setSongForm((p) => ({ ...p, title: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="Song title" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Artist / Author</label>
                    <input value={songForm.artist} onChange={(e) => setSongForm((p) => ({ ...p, artist: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="e.g. Hillsong" />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-xs font-medium text-slate-600 block mb-1">Key</label>
                      <select value={songForm.key} onChange={(e) => setSongForm((p) => ({ ...p, key: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
                        <option value="">—</option>
                        {['C','C#/Db','D','D#/Eb','E','F','F#/Gb','G','G#/Ab','A','A#/Bb','B'].map((k) => <option key={k} value={k}>{k}</option>)}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-medium text-slate-600 block mb-1">Tempo (BPM)</label>
                      <input
                        type="number"
                        min="1"
                        max="300"
                        inputMode="numeric"
                        value={songForm.tempo}
                        onChange={(e) => setSongForm((p) => ({ ...p, tempo: e.target.value }))}
                        placeholder="e.g. 120"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Notes</label>
                    <textarea value={songForm.notes} onChange={(e) => setSongForm((p) => ({ ...p, notes: e.target.value }))} rows={3} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="Chords, links, arrangement notes…" />
                  </div>
                </div>
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setSongModal(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
                  <button
                    type="button"
                    disabled={savingSong || !songForm.title.trim()}
                    onClick={async () => {
                      setSavingSong(true)
                      try {
                        if (songModal === 'add') {
                          await addWorshipSong(songForm, userProfile?.name || 'unknown')
                        } else {
                          await updateWorshipSong(songModal.id, { title: songForm.title, artist: songForm.artist, key: songForm.key, tempo: songForm.tempo ? Number(songForm.tempo) : null, notes: songForm.notes })
                        }
                        await loadSongs()
                        setSongModal(null)
                      } finally {
                        setSavingSong(false)
                      }
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-all"
                  >{savingSong ? 'Saving…' : 'Save'}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Archives tab ── */}
      {activeTab === 'archives' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-800 text-base">Worship Archives</h2>
              <p className="text-xs text-slate-400 mt-0.5">Past published team stamps, newest first</p>
            </div>
            {!loadingArchives && archiveSchedules.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const allOpen = archiveSchedules.every((s) => openArchiveIds[s.id])
                  const next = {}
                  if (!allOpen) archiveSchedules.forEach((s) => { next[s.id] = true })
                  setOpenArchiveIds(next)
                }}
                className="text-xs text-slate-500 hover:text-indigo-600 underline"
              >
                {archiveSchedules.every((s) => openArchiveIds[s.id]) ? 'Collapse all' : 'Expand all'}
              </button>
            )}
          </div>

          {loadingArchives ? (
            <div className="py-10 text-center text-slate-400 text-sm">Loading archives…</div>
          ) : archiveSchedules.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">No published worship stamps found for past weeks.</div>
          ) : (
            <div className="space-y-2">
              {archiveSchedules.map((stamp) => (
                <ArchiveStamp
                  key={stamp.id}
                  stamp={stamp}
                  isOpen={!!openArchiveIds[stamp.id]}
                  onToggle={() => setOpenArchiveIds((prev) => ({ ...prev, [stamp.id]: !prev[stamp.id] }))}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Song full-view overlay — top-level so it can open from any tab
          (e.g. the Assign tab's Song Name directory search), not just Song Directory */}
      {viewingSong && (
        <SongViewer
          song={viewingSong}
          canManage={canEditSong(viewingSong)}
          myPositions={viewSongPositions || myWorshipMember?.positions || []}
          initialViewMode={viewSongMode}
          onClose={() => setViewingSong(null)}
          onEdit={song => { setViewingSong(null); setEditingSong(song); setSongSubPage('design') }}
        />
      )}

      </div>
    </div>
  )
}

// ─── Worship Member Link Modal ────────────────────────────────────────────────
function WorshipLinkModal({ member, onLink, onClose }) {
  const [visitors, setVisitors] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(member.name || '')
  const [linking, setLinking] = useState(false)

  useEffect(() => {
    getMergedPeopleDirectory()
      .then(({ people }) => setVisitors(people))
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
                Linking <span className="font-medium text-slate-600">{member.name}</span>
              </p>
            </div>
            <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 text-xl flex-shrink-0">×</button>
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
              // Same `.id`-doesn't-exist issue as the Add Member picker below —
              // getMergedPeopleDirectory() entries only carry `_key`/`personId`/
              // `_visitorIds`, never a plain `.id`.
              const isCurrent = (!!member.personId && v.personId === member.personId) ||
                (!!member.visitorId && (v._visitorIds || []).includes(member.visitorId))
              return (
                <button
                  key={v._key}
                  type="button"
                  disabled={linking}
                  onClick={async () => {
                    setLinking(true)
                    await onLink(v)
                    setLinking(false)
                  }}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-slate-50 transition-colors
                    ${isCurrent ? 'bg-emerald-50' : 'hover:bg-indigo-50'}`}
                >
                  <div className={`w-9 h-9 rounded-full text-white text-sm font-bold flex items-center justify-center flex-shrink-0
                    ${isCurrent ? 'bg-emerald-500' : 'bg-indigo-500'}`}>
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
                  {isCurrent
                    ? <span className="text-xs text-emerald-600 font-semibold flex-shrink-0">Current</span>
                    : <svg className="flex-shrink-0 text-slate-300" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  }
                </button>
              )
            })}
          </div>

          {/* Footer */}
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
