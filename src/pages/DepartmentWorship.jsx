import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, CheckCircle2, Send, Download } from 'lucide-react'
import { Link } from 'react-router-dom'
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
  addWorshipRehearsal,
  updateWorshipRehearsal,
  deleteWorshipRehearsal,
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
import { format, subMonths, subDays, differenceInDays, differenceInYears, differenceInMonths, addYears, addMonths } from 'date-fns'
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
  const [operationsSubTab, setOperationsSubTab] = useState('team')
  const [subDepartments, setSubDepartments] = useState([])
  const [subDeptLoading, setSubDeptLoading] = useState(false)
  const [subDeptError, setSubDeptError] = useState(null)
  const [subDeptForm, setSubDeptForm] = useState({ name: '' })
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
  const [loadingWeekBoxes, setLoadingWeekBoxes] = useState(false)
  const [practiceSubPage, setPracticeSubPage] = useState('schedule')
  const [recordsSchedules, setRecordsSchedules] = useState([])
  const [loadingRecords, setLoadingRecords] = useState(false)
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
    if ((activeTab === 'assign' || activeTab === 'summary') && selectedDate) loadScheduleForDate(selectedDate)
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
        const sundays = upcomingSundays(3)
        const boxes = sundays.map((sundayDate) => {
          const sundayObj = new Date(sundayDate + 'T12:00:00')
          const fridayDate = format(subDays(sundayObj, 2), 'yyyy-MM-dd')
          const saturdayDate = format(subDays(sundayObj, 1), 'yyyy-MM-dd')
          const schedule = all.find((s) => s.date === sundayDate) || null
          return { sundayDate, fridayDate, saturdayDate, schedule }
        })
        setWeekBoxSchedules(boxes)
      })
      .catch(() => setWeekBoxSchedules([]))
      .finally(() => setLoadingWeekBoxes(false))
  }, [activeTab])

  useEffect(() => {
    if (activeTab !== 'practiceRehearsal' || practiceSubPage !== 'records') return
    setLoadingRecords(true)
    getAllWorshipSchedules(DEPARTMENT)
      .then(all => {
        const complete = all
          .filter(s => {
            const pa = s.practiceAttendance || {}
            return !!(pa.fridaySession?.endOfPractice && pa.saturdaySession?.endOfPractice && pa.saturdaySession?.beginRehearsal && pa.saturdaySession?.endRehearsal)
          })
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        setRecordsSchedules(complete)
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
      setAssignStamp({ date: selectedDate, assignments: [...localAssignments], savedAt: new Date() })
      setStampOpen(false)
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
      hasStructure: !!a.structure,
      _assignment: a,
    }))

  return (
    <div>
      <DepartmentTabBar slug="worship" activeTab={activeTab} setActiveTab={setActiveTab} />
      <div className="space-y-4 p-4">
      {activeTab === 'summary' && (canManageWorship || canViewInsights) && (
        <div className="space-y-4">

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
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold shadow-sm transition"
            >
              <Send size={14} />
              Distribute Plan to Team
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
            <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm px-6 py-10 text-center text-slate-400">
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
                        <p className="text-2xl font-bold text-violet-700 mt-0.5">{savedAssignments.filter(a => a.memberId).length}</p>
                        <p className="text-[10px] text-violet-400">of {ASSIGNMENT_ROLES.length} roles</p>
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
                                          if (a?.structure) setStructureModal({ role: a.role, ...a.structure })
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
                <div className="p-8 text-center text-slate-500">Loading...</div>
              ) : activeMembers.length === 0 ? (
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
            </motion.div>
            )}
          </AnimatePresence>

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
          {false && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-800">Team members</h2>
                <p className="text-xs text-slate-400 mt-0.5">{activeMembers.length} active member{activeMembers.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const XLSX = await import('xlsx')
                    const rows = activeMembers.map((m, i) => {
                      const since = m.memberSince ? new Date(m.memberSince) : null
                      const now = new Date()
                      const yrs = since ? differenceInYears(now, since) : ''
                      const mos = since ? differenceInMonths(now, addYears(since, differenceInYears(now, since))) : ''
                      const totalDays = since ? differenceInDays(now, since) : ''
                      return {
                        'SL': i + 1,
                        'Name': m.name || '',
                        'Member Since': m.memberSince || '',
                        'Years': yrs,
                        'Months': mos,
                        'Total Days': totalDays,
                        'Positions': (m.positions || []).join(', '),
                        'Worship Director': m.isWorshipDirector ? 'Yes' : 'No',
                      }
                    })
                    const ws = XLSX.utils.json_to_sheet(rows)
                    const wb = XLSX.utils.book_new()
                    XLSX.utils.book_append_sheet(wb, ws, 'Team Members')
                    XLSX.writeFile(wb, `Worship_Team_Members_${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm font-medium hover:bg-emerald-100 transition-colors"
                >
                  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" className="flex-shrink-0">
                    <rect x="2" y="2" width="12" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                    <path d="M5 7h6M5 10h6M5 13h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
                    <path d="M15 11v5m-2-2l2 2 2-2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Export Excel
                </button>
                {canManageWorship && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewMember({ name: '', memberSince: new Date().toISOString().slice(0, 10), isFormer: false, positions: [], isWorshipDirector: false })
                      setAddMemberModalOpen(true)
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 shadow-sm"
                  >
                    <span className="text-lg leading-none">+</span>
                    Add New Team Member
                  </button>
                )}
              </div>
            </div>
            {loadingTeam ? (
              <div className="p-8 text-center text-slate-500">Loading...</div>
            ) : activeMembers.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No team members yet. Add above or use "Add demo team".</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600 w-12">SL</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Name</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Member since</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Duration</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Positions</th>
                      {canManageWorship && <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Action</th>}
                    </tr>
                  </thead>
                    <tbody className="divide-y divide-slate-200">
                      {activeMembers.map((m, i) => (
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
                        <td className="px-4 py-2 text-slate-700 text-sm whitespace-nowrap">
                          {(() => {
                            const since = new Date(m.memberSince)
                            const now = new Date()
                            const yrs = differenceInYears(now, since)
                            const mos = differenceInMonths(now, addYears(since, yrs))
                            const dys = differenceInDays(now, addMonths(addYears(since, yrs), mos))
                            const total = differenceInDays(now, since)
                            return (
                              <span className="flex flex-col gap-0.5">
                                <span className="flex items-center gap-1">
                                  <span className="font-bold text-violet-700">{yrs}</span><span className="text-slate-400 text-xs">yr</span>
                                  <span className="font-bold text-indigo-700">{mos}</span><span className="text-slate-400 text-xs">mo</span>
                                  <span className="font-bold text-sky-700">{dys}</span><span className="text-slate-400 text-xs">days</span>
                                </span>
                                <span className="text-xs text-slate-400">{total.toLocaleString()} days total</span>
                              </span>
                            )
                          })()}
                        </td>
                        <td className="px-4 py-2 text-slate-600">
                          {m.positions?.length ? (
                            <span className="text-xs text-slate-500">
                              {m.positions.join(', ')}
                            </span>
                          ) : <span className="text-xs text-slate-300">—</span>}
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
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Till</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Duration</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Total days</th>
                      {canManageWorship && <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {formerMembers.map((m, i) => {
                      const since = new Date(m.memberSince)
                      const till = m.formerSince ? new Date(m.formerSince) : new Date()
                      const yrs = differenceInYears(till, since)
                      const mos = differenceInMonths(till, addYears(since, yrs))
                      const dys = differenceInDays(till, addMonths(addYears(since, yrs), mos))
                      const totalDays = differenceInDays(till, since)
                      return (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 text-slate-600">{i + 1}</td>
                        <td className="px-4 py-2 font-medium text-slate-800">{m.name}</td>
                        <td className="px-4 py-2 text-slate-600">{formatDMY(m.memberSince)}</td>
                        <td className="px-4 py-2 text-slate-500 text-sm">{m.formerSince ? formatDMY(m.formerSince) : <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-2 text-slate-700 text-sm whitespace-nowrap">
                          <span className="flex items-center gap-1">
                            <span className="font-bold text-violet-700">{yrs}</span><span className="text-slate-400 text-xs">yr</span>
                            <span className="font-bold text-indigo-700">{mos}</span><span className="text-slate-400 text-xs">mo</span>
                            <span className="font-bold text-sky-700">{dys}</span><span className="text-slate-400 text-xs">days</span>
                          </span>
                        </td>
                        <td className="px-4 py-2 text-slate-500 text-sm font-medium">{totalDays.toLocaleString()} days</td>
                        {canManageWorship && (
                          <td className="px-4 py-2">
                            <button type="button" onClick={() => setEditMember({ ...m })} className="text-blue-600 hover:underline text-sm font-medium">Edit</button>
                          </td>
                        )}
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
          )}


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
        <div className="space-y-6">

          {/* Active members */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-800">The Team</h2>
                <p className="text-xs text-slate-400 mt-0.5">{activeMembers.length} active member{activeMembers.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const XLSX = await import('xlsx')
                    const rows = activeMembers.map((m, i) => {
                      const since = m.memberSince ? new Date(m.memberSince) : null
                      const now = new Date()
                      const yrs = since ? differenceInYears(now, since) : ''
                      const mos = since ? differenceInMonths(now, addYears(since, differenceInYears(now, since))) : ''
                      const totalDays = since ? differenceInDays(now, since) : ''
                      return {
                        'SL': i + 1, 'Name': m.name || '',
                        'Member Since': m.memberSince || '',
                        'Years': yrs, 'Months': mos, 'Total Days': totalDays,
                        'Positions': (m.positions || []).join(', '),
                        'Worship Director': m.isWorshipDirector ? 'Yes' : 'No',
                      }
                    })
                    const ws = XLSX.utils.json_to_sheet(rows)
                    const wb = XLSX.utils.book_new()
                    XLSX.utils.book_append_sheet(wb, ws, 'The Team')
                    XLSX.writeFile(wb, `Worship_Team_${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm font-medium hover:bg-emerald-100 transition-colors"
                >
                  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" className="flex-shrink-0">
                    <rect x="2" y="2" width="12" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                    <path d="M5 7h6M5 10h6M5 13h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
                    <path d="M15 11v5m-2-2l2 2 2-2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Export Excel
                </button>
                {canManageWorship && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewMember({ name: '', memberSince: new Date().toISOString().slice(0, 10), isFormer: false, positions: [], isWorshipDirector: false })
                      setAddMemberModalOpen(true)
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 shadow-sm"
                  >
                    <span className="text-lg leading-none">+</span>
                    Add New Team Member
                  </button>
                )}
              </div>
            </div>
            {loadingTeam ? (
              <div className="p-8 text-center text-slate-500">Loading...</div>
            ) : activeMembers.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No team members yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600 w-12">SL</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Name</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Member since</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Duration</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Positions</th>
                      {canManageWorship && <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {activeMembers.map((m, i) => (
                      <tr key={m.id} className={`hover:bg-slate-50 ${m.isWorshipDirector ? 'bg-amber-50/60' : ''}`}>
                        <td className="px-4 py-2 text-slate-600">{i + 1}</td>
                        <td className="px-4 py-2 font-medium text-slate-800">
                          {m.name}
                          {m.isWorshipDirector && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] uppercase tracking-wide">Director</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-slate-600">{formatDMY(m.memberSince)}</td>
                        <td className="px-4 py-2 text-slate-700 text-sm whitespace-nowrap">
                          {(() => {
                            const since = new Date(m.memberSince)
                            const now = new Date()
                            const yrs = differenceInYears(now, since)
                            const mos = differenceInMonths(now, addYears(since, yrs))
                            const dys = differenceInDays(now, addMonths(addYears(since, yrs), mos))
                            const total = differenceInDays(now, since)
                            return (
                              <span className="flex flex-col gap-0.5">
                                <span className="flex items-center gap-1">
                                  <span className="font-bold text-violet-700">{yrs}</span><span className="text-slate-400 text-xs">yr</span>
                                  <span className="font-bold text-indigo-700">{mos}</span><span className="text-slate-400 text-xs">mo</span>
                                  <span className="font-bold text-sky-700">{dys}</span><span className="text-slate-400 text-xs">days</span>
                                </span>
                                <span className="text-xs text-slate-400">{total.toLocaleString()} days total</span>
                              </span>
                            )
                          })()}
                        </td>
                        <td className="px-4 py-2 text-slate-600">
                          {m.positions?.length
                            ? <span className="text-xs text-slate-500">{m.positions.join(', ')}</span>
                            : <span className="text-xs text-slate-300">—</span>}
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

          {/* Former members */}
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
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Till</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Duration</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Total days</th>
                      {canManageWorship && <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {formerMembers.map((m, i) => {
                      const since = new Date(m.memberSince)
                      const till = m.formerSince ? new Date(m.formerSince) : new Date()
                      const yrs = differenceInYears(till, since)
                      const mos = differenceInMonths(till, addYears(since, yrs))
                      const dys = differenceInDays(till, addMonths(addYears(since, yrs), mos))
                      const totalDays = differenceInDays(till, since)
                      return (
                        <tr key={m.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2 text-slate-600">{i + 1}</td>
                          <td className="px-4 py-2 font-medium text-slate-800">{m.name}</td>
                          <td className="px-4 py-2 text-slate-600">{formatDMY(m.memberSince)}</td>
                          <td className="px-4 py-2 text-slate-500 text-sm">{m.formerSince ? formatDMY(m.formerSince) : <span className="text-slate-300">—</span>}</td>
                          <td className="px-4 py-2 text-slate-700 text-sm whitespace-nowrap">
                            <span className="flex items-center gap-1">
                              <span className="font-bold text-violet-700">{yrs}</span><span className="text-slate-400 text-xs">yr</span>
                              <span className="font-bold text-indigo-700">{mos}</span><span className="text-slate-400 text-xs">mo</span>
                              <span className="font-bold text-sky-700">{dys}</span><span className="text-slate-400 text-xs">days</span>
                            </span>
                          </td>
                          <td className="px-4 py-2 text-slate-500 text-sm font-medium">{totalDays.toLocaleString()} days</td>
                          {canManageWorship && (
                            <td className="px-4 py-2">
                              <button type="button" onClick={() => setEditMember({ ...m })} className="text-blue-600 hover:underline text-sm font-medium">Edit</button>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Add member modal */}
          {addMemberModalOpen && canManageWorship && (
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
                      await addWorshipTeamMember(DEPARTMENT, {
                        name: newMember.name.trim(), memberSince: newMember.memberSince,
                        isFormer: newMember.isFormer, positions: newMember.positions,
                        isWorshipDirector: newMember.isWorshipDirector,
                      }, userProfile?.email)
                      setNewMember({ name: '', memberSince: new Date().toISOString().slice(0, 10), isFormer: false, positions: [], isWorshipDirector: false })
                      setAddMemberModalOpen(false)
                      await loadTeam()
                    } catch (err) { console.error(err); alert('Failed to add member') }
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Name <span className="text-red-400">*</span></label>
                    <input type="text" required placeholder="Full name" value={newMember.name}
                      onChange={(e) => setNewMember((m) => ({ ...m, name: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Member since</label>
                    <input type="date" value={newMember.memberSince}
                      onChange={(e) => setNewMember((m) => ({ ...m, memberSince: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Positions</label>
                    <div className="flex flex-wrap gap-2">
                      {MEMBER_POSITIONS.map((pos) => (
                        <label key={pos} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs border cursor-pointer transition-colors ${newMember.positions.includes(pos) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                          <input type="checkbox" className="hidden" checked={newMember.positions.includes(pos)}
                            onChange={(e) => setNewMember((m) => ({ ...m, positions: e.target.checked ? [...m.positions, pos] : m.positions.filter((p) => p !== pos) }))} />
                          {pos}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={newMember.isWorshipDirector} onChange={(e) => setNewMember((m) => ({ ...m, isWorshipDirector: e.target.checked }))} className="rounded" />
                      Set as Worship Director
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={newMember.isFormer} onChange={(e) => setNewMember((m) => ({ ...m, isFormer: e.target.checked }))} className="rounded" />
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
            {canManageWorship && practiceSubPage === 'schedule' && (
              <button
                type="button"
                onClick={() => { setEditingRehearsal(null); setRehearsalForm({ date: '', time: '', location: '', notes: '' }); setRehearsalModalOpen(true) }}
                className="ml-auto mb-1 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700"
              >
                + Add Session
              </button>
            )}
          </div>

          {/* ── Schedule sub-page ── */}
          {practiceSubPage === 'schedule' && (
            <div className="space-y-6">
              {/* 3-Sunday week boxes */}
              {loadingWeekBoxes ? (
                <div className="py-8 text-center text-slate-400 text-sm">Loading…</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {weekBoxSchedules.filter(w => {
                    const pa = w.schedule?.practiceAttendance || {}
                    return !(pa.fridaySession?.endOfPractice && pa.saturdaySession?.endOfPractice && pa.saturdaySession?.beginRehearsal && pa.saturdaySession?.endRehearsal)
                  }).map(({ sundayDate, fridayDate, saturdayDate, schedule }) => {
                    const assignments = (schedule?.assignments || []).filter(a => a.memberId)
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
                      return (
                        <div className="flex items-center justify-between gap-2 py-1">
                          <span className="text-xs text-slate-400">{label}</span>
                          {val ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full px-2 py-0.5">{val}</span>
                              {canManageWorship && <button type="button" onClick={() => clearSession(sessionKey, field)} className="text-[10px] text-slate-300 hover:text-red-400 leading-none">×</button>}
                            </div>
                          ) : canManageWorship ? (
                            <button type="button" onClick={() => recordSession(sessionKey, field)} className="text-xs text-indigo-600 border border-indigo-200 rounded-full px-2 py-0.5 hover:bg-indigo-50 transition-colors">Record</button>
                          ) : <span className="text-xs text-slate-300">—</span>}
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
                            <div className="space-y-1.5 mb-3">
                              {assignments.map(a => {
                                const rec = dayAtt[a.memberId]
                                return (
                                  <div key={a.memberId} className="flex items-center justify-between gap-2">
                                    <span className={`text-xs truncate ${rec?.arrivedAt ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>{a.memberName}</span>
                                    {rec?.arrivedAt ? (
                                      <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5 flex-shrink-0">{rec.arrivedAt}</span>
                                    ) : canManageWorship ? (
                                      <button type="button" onClick={() => markArrived(day, a)} className="text-xs text-violet-600 border border-violet-200 rounded-full px-2 py-0.5 hover:bg-violet-50 flex-shrink-0">Arrived</button>
                                    ) : null}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                          <div className="border-t border-dashed border-slate-100 pt-2 space-y-0.5">
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
                          {renderDay('saturday', 'saturdaySession', fmtSaturday, [
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
                <div className="py-10 text-center text-slate-400 text-sm">No completed sessions yet. Records appear here once both Friday and Saturday timings are fully saved.</div>
              ) : recordsSchedules.map(s => {
                const pa = s.practiceAttendance || {}
                let fmtSunday = s.date
                try { fmtSunday = format(new Date(s.date + 'T12:00:00'), 'EEEE, d MMMM yyyy') } catch {}
                const fridayArrived = Object.values(pa.friday || {}).filter(v => v.arrivedAt).length
                const satArrived = Object.values(pa.saturday || {}).filter(v => v.arrivedAt).length
                const total = (s.assignments || []).filter(a => a.memberId).length
                return (
                  <div key={s.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">{fmtSunday}</p>
                        <p className="text-xs text-slate-400 mt-0.5">Fri: {fridayArrived}/{total} · Sat: {satArrived}/{total}</p>
                      </div>
                      <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full px-2.5 py-0.5 font-semibold">Complete</span>
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
          {practiceSubPage === 'schedule' && (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Custom Sessions</p>

          {loadingRehearsals ? (
            <div className="py-10 text-center text-slate-400 text-sm">Loading…</div>
          ) : rehearsals.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">No rehearsals scheduled yet.</div>
          ) : (() => {
            const today = format(new Date(), 'yyyy-MM-dd')
            const upcoming = rehearsals.filter(r => (r.date || '') >= today)
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
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        if (!window.confirm('Delete this rehearsal?')) return
                                        await deleteWorshipRehearsal(r.id)
                                        setRehearsals(prev => prev.filter(x => x.id !== r.id))
                                      }}
                                      className="text-xs text-red-500 border border-red-100 rounded-lg px-2 py-1 hover:bg-red-50"
                                    >
                                      Delete
                                    </button>
                                  </>
                                )}
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
                                {canManageWorship && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (!window.confirm('Delete this rehearsal?')) return
                                      await deleteWorshipRehearsal(r.id)
                                      setRehearsals(prev => prev.filter(x => x.id !== r.id))
                                    }}
                                    className="text-xs text-red-400 hover:text-red-600"
                                  >
                                    Delete
                                  </button>
                                )}
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

      </div>
    </div>
  )
}