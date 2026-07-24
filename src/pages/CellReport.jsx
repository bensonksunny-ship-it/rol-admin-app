import { useEffect, useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { format, startOfWeek, parseISO, addDays } from 'date-fns'
import { useAuth } from '../context/AuthContext'
import {
  getCellGroups,
  getCellGroup,
  getCellReportByCellAndDate,
  createCellReport,
  updateCellReport,
  getCellReportAttendees,
  addCellReportAttendee,
  updateCellReportAttendee,
  deleteCellReportAttendee,
  getCellGroupMembers,
  updateCellGroupMember,
  addCellMemberPendingChange,
  getActiveBackToBibleForDate,
  getCellProgramItems,
  addCellProgramItem,
  updateCellProgramItem,
  deleteCellProgramItem,
  addProgramLog,
  updateProgramLog,
  deleteProgramLog,
  getProgramLogsByCellAndDate,
  getLatestCellReports,
  updateUser,
  getCellMemberPendingChanges,
  createCellVisitorProposal,
  getCellVisitorProposalsByReport,
  getDelightVisitors,
} from '../services/firestore'
import { ROLES } from '../constants/roles'
import { getDepartmentRole } from '../utils/access'
import { canEditCellReport } from '../utils/cellReportPermissions'
import { calcTenureLabel } from '../utils/cellMemberCategory'

const CELL_DEPARTMENT = 'Cell'
const MAX_VISIBLE_TILES = 18

/** Tabs when user may edit this cell’s report (attendance, timer, program, member requests). */
const CELL_REPORT_TABS_ALL = [
  { key: 'attendance', label: 'Attendance' },
  { key: 'timer', label: 'Timer' },
  { key: 'backToBible', label: 'Back to Bible' },
  { key: 'setDefaultProgram', label: 'Set Default Program' },
  { key: 'editCell', label: 'Edit Cell' },
  { key: 'meetingReport', label: 'Meeting Report' },
]

/** View-only tabs (e.g. Cell Leader read-only edge case). */
const CELL_REPORT_TABS_VIEW_ONLY = [
  { key: 'attendance', label: 'Attendance' },
  { key: 'backToBible', label: 'Back to Bible' },
  { key: 'meetingReport', label: 'Meeting Report' },
]

/** Cell Director viewing own-department cell: can see timer + attendance (read-only) but not member names. */
const CELL_REPORT_TABS_DIRECTOR = [
  { key: 'attendance', label: 'Attendance' },
  { key: 'timer', label: 'Timer' },
  { key: 'backToBible', label: 'Back to Bible' },
  { key: 'meetingReport', label: 'Meeting Report' },
]

/** Cell Director viewing a cell they cannot edit: summary only (no member names). */
const CELL_REPORT_TABS_DIRECTOR_SUMMARY = [
  { key: 'summary', label: 'Report summary' },
  { key: 'backToBible', label: 'Back to Bible' },
  { key: 'meetingReport', label: 'Meeting Report' },
]

function totalAttendanceFromReport(r) {
  if (!r) return 0
  return (Number(r.membersAttended) || 0) + (Number(r.visitors) || 0) + (Number(r.children) || 0)
}

function meetingDurationMinutesFromLogs(logs) {
  if (!logs || logs.length < 2) return null
  const times = logs
    .map((log) => {
      const t = log.startTime
      const d = t instanceof Date ? t : t ? new Date(t) : null
      return d && !Number.isNaN(d.getTime()) ? d.getTime() : null
    })
    .filter((x) => x != null)
    .sort((a, b) => a - b)
  if (times.length < 2) return null
  return Math.max(0, Math.round((times[times.length - 1] - times[0]) / 60000))
}

function formatDurationMinutes(m) {
  if (m == null || Number.isNaN(m)) return '—'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const min = m % 60
  return min ? `${h}h ${min}m` : `${h}h`
}

/** Firestore Timestamp | Date | ISO string → ms, or null */
function programLogStartTimeMs(log) {
  if (!log?.startTime) return null
  const t = log.startTime
  if (t instanceof Date) return t.getTime()
  if (typeof t?.seconds === 'number') return t.seconds * 1000 + Math.floor((t.nanoseconds || 0) / 1e6)
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? null : d.getTime()
}

function sortProgramLogsByStart(logs) {
  if (!logs?.length) return []
  return [...logs].sort((a, b) => (programLogStartTimeMs(a) ?? 0) - (programLogStartTimeMs(b) ?? 0))
}

/** Minutes from this program’s start until the next program’s start (last row has no “next” → null). */
function segmentDurationMinutesForSortedLog(sortedLogs, index) {
  if (!sortedLogs?.length || index < 0 || index >= sortedLogs.length) return null
  const t0 = programLogStartTimeMs(sortedLogs[index])
  const t1 = index < sortedLogs.length - 1 ? programLogStartTimeMs(sortedLogs[index + 1]) : null
  if (t0 == null || t1 == null) return null
  return Math.max(0, Math.round((t1 - t0) / 60000))
}

function weekStartKey(reportDateStr) {
  if (!reportDateStr) return 'unknown'
  try {
    const d = parseISO(reportDateStr)
    if (Number.isNaN(d.getTime())) return reportDateStr
    return format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  } catch {
    return reportDateStr
  }
}

function meetingDayToJsDay(meetingDay) {
  const s = String(meetingDay || '')
    .trim()
    .toLowerCase()

  // Accept full names + common abbreviations.
  if (!s) return null
  if (s.startsWith('sun')) return 0
  if (s.startsWith('mon')) return 1
  if (s.startsWith('tue') || s.startsWith('tues')) return 2
  if (s.startsWith('wed')) return 3
  if (s.startsWith('thu') || s.startsWith('thur') || s.startsWith('thurs')) return 4
  if (s.startsWith('fri')) return 5
  if (s.startsWith('sat')) return 6
  return null
}

function computeMeetingDateISO(meetingDay, weekStartDate) {
  const jsDay = meetingDayToJsDay(meetingDay)
  if (jsDay == null) return format(weekStartDate, 'yyyy-MM-dd')
  // Offset from Monday of this weekStart.
  const offset = (jsDay + 6) % 7
  return format(addDays(weekStartDate, offset), 'yyyy-MM-dd')
}

export default function CellReport() {
  const { userProfile, user: authUser } = useAuth()
  const [cellGroups, setCellGroups] = useState([])
  const [cellGroupsLoading, setCellGroupsLoading] = useState(true)
  const [selectedCellId, setSelectedCellId] = useState(null)
  const [report, setReport] = useState(null)
  const [attendees, setAttendees] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cellReportUpdatedMsg, setCellReportUpdatedMsg] = useState('')
  const [attendanceDirty, setAttendanceDirty] = useState(false)
  const [attendanceDone, setAttendanceDone] = useState(false)
  const [memberForm, setMemberForm] = useState({ name: '', birthday: '', anniversary: '', phone: '', locality: '' })
  const [editForm, setEditForm] = useState(null)
  const [leaderTab, setLeaderTab] = useState('attendance')
  const [cellMembers, setCellMembers] = useState([])
  const [loadingCellMembers, setLoadingCellMembers] = useState(false)
  const [cellVisitorMap, setCellVisitorMap] = useState(new Map())
  const [backToBible, setBackToBible] = useState(null)
  const [leaderEditMember, setLeaderEditMember] = useState(null)
  const [leaderEditForm, setLeaderEditForm] = useState({ name: '', birthday: '', anniversary: '', phone: '', locality: '', since: '', status: 'active' })
  const [programItems, setProgramItems] = useState([])
  const [programLogs, setProgramLogs] = useState([])
  const [programForm, setProgramForm] = useState({ programName: '', order: 0 })
  const [editingProgramId, setEditingProgramId] = useState(null)
  const [manualTimeModal, setManualTimeModal] = useState(null)
  const [latestCellReports, setLatestCellReports] = useState([])
  const [latestReportLogs, setLatestReportLogs] = useState({})
  const [visitorInput, setVisitorInput] = useState('')
  const [childInput, setChildInput] = useState('')
  const [proposedVisitorNames, setProposedVisitorNames] = useState(new Set())
  const [proposalModal, setProposalModal] = useState(null)
  const [proposalPhone, setProposalPhone] = useState('')
  const [proposalSubmitting, setProposalSubmitting] = useState(false)
  const [leaderAddMemberOpen, setLeaderAddMemberOpen] = useState(false)
  const [leaderAddMemberForm, setLeaderAddMemberForm] = useState({ name: '', birthday: '', anniversary: '', phone: '', locality: '', since: '', status: 'active' })
  const [editCellSearch, setEditCellSearch] = useState('')
  const [editCellSortAsc, setEditCellSortAsc] = useState(true)
  const [editCellEditModal, setEditCellEditModal] = useState(null)
  const [editCellForm, setEditCellForm] = useState({ name: '', birthday: '', anniversary: '', phone: '', locality: '', since: '' })
  const [editCellAddMemberOpen, setEditCellAddMemberOpen] = useState(false)
  const [editCellAddMemberForm, setEditCellAddMemberForm] = useState({ name: '', birthday: '', anniversary: '', phone: '', locality: '', since: '' })
  const [pendingDeactivateIds, setPendingDeactivateIds] = useState([])
  const [directorRowsMap, setDirectorRowsMap] = useState({})
  const [directorRowsLoading, setDirectorRowsLoading] = useState(false)
  const [leaderAttendanceOpen, setLeaderAttendanceOpen] = useState(true)
  const [attendanceSaveOk, setAttendanceSaveOk] = useState(false)
  const [attendanceSaveError, setAttendanceSaveError] = useState('')

  // Current weekly window: Monday → Sunday (client local time).
  // Cell reports are restricted to the meeting day inside this window.
  const [weekStartISO, setWeekStartISO] = useState(() => format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'))
  const weekStartDate = useMemo(() => {
    const d = parseISO(weekStartISO)
    if (Number.isNaN(d.getTime())) return startOfWeek(new Date(), { weekStartsOn: 1 })
    return d
  }, [weekStartISO])
  const currentWeekStartISO = format(weekStartDate, 'yyyy-MM-dd')

  const cellRole = useMemo(() => getDepartmentRole(userProfile, CELL_DEPARTMENT), [userProfile])
  const isCellDirector = cellRole === 'DIRECTOR'
  const isFullAccess = userProfile?.globalRole === 'FOUNDER' || userProfile?.role === ROLES.FOUNDER
  // Directors can view all cells but do not save attendance edits (Founders can).
  const isDirectorReadOnly = Boolean(isCellDirector && !isFullAccess)
  const canViewAllCells = isCellDirector || isFullAccess

  const myCellId = useMemo(() => {
    const fromProfile = String(userProfile?.cellGroupId || userProfile?.cellId || '').trim()
    if (fromProfile && cellGroups.length) {
      const hit = cellGroups.find(
        (g) => fromProfile === String(g.id || '').trim() || fromProfile === String(g.cellId || '').trim()
      )
      if (hit) return hit.id
    }
    const cid = userProfile?.cellId
    if (cid && cellGroups.length) {
      const hit = cellGroups.find((g) => g.id === cid || String(g.cellId || '') === String(cid))
      if (hit) return hit.id
    }

    // Fallback: if profile has only `cellGroup` (name like "Olive"), map it to the matching cell group document.
    const cellGroupName = String(userProfile?.cellGroup || '').trim()
    if (cellGroupName && cellGroups.length) {
      const match = cellGroups.find((g) => String(g.cellName || '').trim().toLowerCase() === cellGroupName.toLowerCase())
      if (match) return match.id
    }

    const name = (userProfile?.displayName || userProfile?.name || userProfile?.email || '').trim()
    if (!name || !cellGroups.length) return null
    const match = cellGroups.find(
      (g) => (g.leader || '').trim() === name || (g.leader || '').toLowerCase().includes(name.toLowerCase())
    )
    return match?.id || null
  }, [
    userProfile?.cellGroupId,
    userProfile?.cellId,
    userProfile?.cellGroup,
    userProfile?.displayName,
    userProfile?.name,
    userProfile?.email,
    cellGroups,
  ])

  const reportDateByCellId = useMemo(() => {
    const m = {}
    for (const c of cellGroups) {
      m[c.id] = computeMeetingDateISO(c.meetingDay, weekStartDate)
    }
    return m
  }, [cellGroups, weekStartDate])

  const effectiveCellId = canViewAllCells ? selectedCellId : myCellId
  const reportDate = effectiveCellId ? reportDateByCellId[effectiveCellId] : null

  const canEditReportForCell = useCallback(
    (cellId) => {
      const g = cellGroups.find((x) => x.id === cellId)
      return canEditCellReport(userProfile, cellId, g || null)
    },
    [userProfile, cellGroups]
  )

  const canEditCurrentReport = Boolean(effectiveCellId && canEditReportForCell(effectiveCellId) && !isDirectorReadOnly)
  const canEditSelectedCellReport = Boolean(selectedCellId && canEditReportForCell(selectedCellId) && !isDirectorReadOnly)
  // Directors can record/edit program timers even though they can't edit attendance.
  const canEditTimer = canEditCurrentReport || isDirectorReadOnly
  const meetingLocked = Boolean(report?.meetingFinalizedAt)

  const cell = useMemo(() => cellGroups.find((g) => g.id === effectiveCellId) || null, [cellGroups, effectiveCellId])

  const enrichedCellMembers = useMemo(() =>
    cellMembers.map(m => {
      if (!m.visitorId) return m
      const canonical = cellVisitorMap.get(m.visitorId)
      return canonical && canonical !== m.name ? { ...m, name: canonical, originalName: m.name } : m
    }),
    [cellMembers, cellVisitorMap]
  )
  const activeCellGroups = useMemo(() => cellGroups.filter((c) => c.status !== 'inactive'), [cellGroups])
  const visibleDirectorRows = useMemo(() => activeCellGroups.slice(0, MAX_VISIBLE_TILES), [activeCellGroups])
  const isLeaderView = !canViewAllCells && myCellId
  const isDirectorView = canViewAllCells

  const cellReportsByWeek = useMemo(() => {
    const weekMap = new Map()
    for (const r of latestCellReports) {
      const wk = weekStartKey(r.reportDate)
      if (wk !== currentWeekStartISO) continue
      if (!weekMap.has(wk)) weekMap.set(wk, [])
      weekMap.get(wk).push(r)
    }
    const entries = [...weekMap.entries()].sort((a, b) => b[0].localeCompare(a[0]))
    return entries.map(([weekStart, rows]) => ({
      weekStart,
      rows: [...rows].sort((a, b) => (b.reportDate || '').localeCompare(a.reportDate || '')),
    }))
  }, [latestCellReports, currentWeekStartISO])

  useEffect(() => {
    getCellGroups(CELL_DEPARTMENT)
      .then(setCellGroups)
      .catch(() => setCellGroups([]))
      .finally(() => setCellGroupsLoading(false))
  }, [])

  // So Firestore rules allow create: set user cellId when we detect leader by name
  useEffect(() => {
    if (authUser?.uid && myCellId && !userProfile?.cellId) {
      updateUser(authUser.uid, { cellId: myCellId }).catch(() => {})
    }
  }, [authUser?.uid, myCellId, userProfile?.cellId])

  // Clear text inputs when the active cell or report date changes so that text
  // typed in one expanded row / date doesn't bleed into a different one.
  useEffect(() => {
    setVisitorInput('')
    setChildInput('')
  }, [effectiveCellId, reportDate])

  // Pre-populate proposed visitor names from Firestore so the "Registered" badge
  // survives page refreshes.
  useEffect(() => {
    if (!report?.id) { setProposedVisitorNames(new Set()); return }
    getCellVisitorProposalsByReport(report.id)
      .then((proposals) => setProposedVisitorNames(new Set(proposals.map((p) => p.visitorName))))
      .catch(() => {})
  }, [report?.id])

  useEffect(() => {
    if (!effectiveCellId) {
      setPendingDeactivateIds([])
      return
    }
    getCellMemberPendingChanges()
      .then((list) => {
        const ids = list
          .filter((p) => p.cellId === effectiveCellId && p.changeType === 'deactivate' && p.memberId)
          .map((p) => p.memberId)
        setPendingDeactivateIds(ids)
      })
      .catch(() => setPendingDeactivateIds([]))
  }, [effectiveCellId])

  useEffect(() => {
    if (!effectiveCellId) {
      setReport(null)
      setAttendees([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    Promise.all([
      getCellReportByCellAndDate(effectiveCellId, reportDate, cell?.cellId !== effectiveCellId ? cell?.cellId : null),
      getCellGroup(effectiveCellId),
    ])
      .then(([r, c]) => {
        if (cancelled) return
        if (r) {
          setReport(r)
          return getCellReportAttendees(r.id).then((att) => {
            if (!cancelled) setAttendees(att)
          })
        }
        setReport(null)
        setAttendees([])
        const mayEdit = canEditCellReport(userProfile, effectiveCellId, c)
        if (c && mayEdit) {
          const newReport = {
            cellId: c.id,
            cellName: c.cellName,
            meetingDay: c.meetingDay,
            membersAttended: 0,
            visitors: 0,
            children: 0,
            visitorsList: [],
            childrenList: [],
            reportDate,
          }
          return createCellReport(newReport, userProfile?.email || 'unknown').then((id) => {
            if (!cancelled) {
              setReport({ id, ...newReport, visitorsList: [], childrenList: [], createdBy: userProfile?.email })
              setAttendees([])
            }
          })
        }
      })
      .catch(() => {
        if (!cancelled) { setReport(null); setAttendees([]) }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [effectiveCellId, reportDate, userProfile])

  useEffect(() => {
    if (!effectiveCellId) {
      setCellMembers([])
      setLoadingCellMembers(false)
      return
    }
    setLoadingCellMembers(true)
    Promise.all([
      getCellGroupMembers(effectiveCellId).catch(() => []),
      getDelightVisitors().catch(() => []),
    ]).then(([members, visitors]) => {
      setCellVisitorMap(new Map(visitors.map(v => [v.id, v.name])))
      setCellMembers(members)
    }).finally(() => setLoadingCellMembers(false))
  }, [effectiveCellId])

  useEffect(() => {
    if (!isDirectorView) {
      setDirectorRowsMap({})
      setDirectorRowsLoading(false)
      return
    }
    // While cell groups are still fetching, keep the loading state so the
    // director sees a single spinner from mount rather than empty → spinner.
    if (cellGroupsLoading || visibleDirectorRows.length === 0) {
      setDirectorRowsMap({})
      setDirectorRowsLoading(cellGroupsLoading)
      return
    }
    let cancelled = false
    setDirectorRowsLoading(true)
    Promise.all(
      visibleDirectorRows.map(async (c) => {
        const expectedDate = reportDateByCellId[c.id]
        const reportForWeek = await getCellReportByCellAndDate(c.id, expectedDate, c.cellId !== c.id ? c.cellId : null)
        if (!reportForWeek) {
          return [
            c.id,
            {
              report: null,
              expectedDate,
              total: 0,
              submitted: false,
            },
          ]
        }
        const list = await getCellReportAttendees(reportForWeek.id)
        const total = (list?.length || 0) + (reportForWeek.visitorsList || []).length + (reportForWeek.childrenList || []).length
        return [
          c.id,
          {
            report: reportForWeek,
            expectedDate,
            total,
            submitted: Boolean(reportForWeek),
          },
        ]
      })
    )
      .then((pairs) => {
        if (!cancelled) setDirectorRowsMap(Object.fromEntries(pairs))
      })
      .catch(() => {
        if (!cancelled) setDirectorRowsMap({})
      })
      .finally(() => {
        if (!cancelled) setDirectorRowsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isDirectorView, visibleDirectorRows, reportDateByCellId, cellGroupsLoading])

  useEffect(() => {
    if (!reportDate) return
    getActiveBackToBibleForDate(reportDate).then(setBackToBible).catch(() => setBackToBible(null))
  }, [reportDate])

  useEffect(() => {
    if (!effectiveCellId) return
    getCellProgramItems(effectiveCellId).then(setProgramItems).catch(() => setProgramItems([]))
  }, [effectiveCellId])

  useEffect(() => {
    if (!selectedCellId) return
    setLeaderTab(canEditReportForCell(selectedCellId) ? 'attendance' : 'summary')
  }, [selectedCellId, canEditReportForCell])

  useEffect(() => {
    if (!isDirectorView || !selectedCellId || canEditSelectedCellReport) return
    const allowed = new Set(['summary', 'backToBible', 'meetingReport'])
    setLeaderTab((t) => allowed.has(t) ? t : 'summary')
  }, [isDirectorView, selectedCellId, canEditSelectedCellReport])

  useEffect(() => {
    if (cellGroupsLoading || !isLeaderView || canEditCurrentReport) return
    const allowed = new Set(isDirectorReadOnly
      ? ['attendance', 'timer', 'backToBible', 'meetingReport']
      : ['attendance', 'backToBible', 'meetingReport'])
    setLeaderTab((t) => allowed.has(t) ? t : 'attendance')
  }, [cellGroupsLoading, isLeaderView, canEditCurrentReport, isDirectorReadOnly])

  useEffect(() => {
    if (!cell?.cellName || !reportDate) { setProgramLogs([]); return }
    getProgramLogsByCellAndDate(cell.cellName, reportDate).then(setProgramLogs).catch(() => setProgramLogs([]))
  }, [cell?.cellName, reportDate])

  useEffect(() => {
    if (!isDirectorView) return
    getLatestCellReports(80).then((reports) => {
      setLatestCellReports(reports)
      reports.forEach((r) => {
        getProgramLogsByCellAndDate(r.cellName, r.reportDate)
          .then((logs) => {
            setLatestReportLogs((prev) => ({ ...prev, [r.id]: logs }))
          })
          .catch(() => {})
      })
    }).catch(() => setLatestCellReports([]))
  }, [isDirectorView])

  useEffect(() => {
    if (!canEditCurrentReport) return
    if (report && attendees.length !== report.membersAttended) {
      updateCellReport(report.id, { membersAttended: attendees.length }).then(() => {
        setReport((prev) => (prev ? { ...prev, membersAttended: attendees.length } : null))
      })
    }
  }, [attendees.length, report?.id, canEditCurrentReport, report])

  const handleAddMember = async (e) => {
    e.preventDefault()
    if (!canEditCurrentReport) return
    const name = (memberForm.name || '').trim()
    if (!name || !report) return
    setSaving(true)
    try {
      await addCellReportAttendee(report.id, memberForm, userProfile?.email)
      const list = await getCellReportAttendees(report.id)
      setAttendees(list)
      setMemberForm({ name: '', birthday: '', anniversary: '', phone: '', locality: '' })
    } catch (err) {
      console.error(err)
      alert('Failed to add member')
    }
    setSaving(false)
  }

  const handleUpdateAttendee = async () => {
    if (!canEditCurrentReport || !report || !editForm) return
    const { id, ...data } = editForm
    try {
      await updateCellReportAttendee(report.id, id, data)
      setAttendees((prev) => prev.map((a) => (a.id === id ? { ...a, ...data } : a)))
      setEditForm(null)
    } catch (err) {
      console.error(err)
      alert('Failed to update')
    }
  }

  const handleRemoveAttendee = async (attendeeId) => {
    if (!canEditCurrentReport || !report || !window.confirm('Remove this attendee?')) return
    try {
      await deleteCellReportAttendee(report.id, attendeeId)
      setAttendees((prev) => prev.filter((a) => a.id !== attendeeId))
    } catch (err) {
      console.error(err)
      alert('Failed to remove')
    }
  }

  const handleToggleAttendance = async (member) => {
    if (!canEditCurrentReport || !report) return
    const existing = attendees.find((a) => a.memberId === member.id)
    setSaving(true)
    try {
      if (existing) {
        await deleteCellReportAttendee(report.id, existing.id)
        setAttendees((prev) => prev.filter((a) => a.id !== existing.id))
      } else {
        await addCellReportAttendee(report.id, {
          memberId: member.id,
          name: member.name || '',
          birthday: member.birthday || '',
          anniversary: member.anniversary || '',
          phone: member.phone || '',
          locality: member.locality || '',
        }, userProfile?.email)
        const list = await getCellReportAttendees(report.id)
        setAttendees(list)
      }
      setAttendanceDirty(true)
      setAttendanceDone(false)
    } catch (err) {
      console.error(err)
      alert('Failed to update attendance')
    }
    setSaving(false)
  }

  const handleAddVisitor = async (name) => {
    if (!canEditCurrentReport) return
    const n = (name || '').trim()
    if (!n || !report) return
    const list = [...(report.visitorsList || []), n]
    try {
      await updateCellReport(report.id, { visitorsList: list })
      setReport((prev) => (prev ? { ...prev, visitorsList: list } : null))
      setAttendanceDirty(true)
      setAttendanceDone(false)
    } catch (err) {
      console.error(err)
      alert('Failed to add visitor')
    }
  }

  const handleRemoveVisitor = (index) => {
    if (!canEditCurrentReport || !report) return
    const list = (report.visitorsList || []).filter((_, i) => i !== index)
    updateCellReport(report.id, { visitorsList: list }).then(() => {
      setReport((prev) => (prev ? { ...prev, visitorsList: list } : null))
      setAttendanceDirty(true)
      setAttendanceDone(false)
    }).catch(() => alert('Failed to remove'))
  }

  const handleAddChild = async (name) => {
    if (!canEditCurrentReport) return
    const n = (name || '').trim()
    if (!n || !report) return
    const list = [...(report.childrenList || []), n]
    try {
      await updateCellReport(report.id, { childrenList: list })
      setReport((prev) => (prev ? { ...prev, childrenList: list } : null))
      setAttendanceDirty(true)
      setAttendanceDone(false)
    } catch (err) {
      console.error(err)
      alert('Failed to add child')
    }
  }

  const handleRemoveChild = (index) => {
    if (!canEditCurrentReport || !report) return
    const list = (report.childrenList || []).filter((_, i) => i !== index)
    updateCellReport(report.id, { childrenList: list }).then(() => {
      setReport((prev) => (prev ? { ...prev, childrenList: list } : null))
      setAttendanceDirty(true)
      setAttendanceDone(false)
    }).catch(() => alert('Failed to remove'))
  }

  const handleSaveCounters = async () => {
    if (!canEditCurrentReport || !report) return
    setSaving(true)
    try {
      await updateCellReport(report.id, {
        visitors: Number(report.visitors) || 0,
        children: Number(report.children) || 0,
      })
    } catch (err) {
      console.error(err)
      alert('Failed to save')
    }
    setAttendanceDirty(false)
    setAttendanceDone(true)
    setSaving(false)
  }

  const refreshReportAndAttendees = async () => {
    if (!effectiveCellId || !reportDate) return
    const r = await getCellReportByCellAndDate(effectiveCellId, reportDate)
    setReport(r)
    if (!r) {
      setAttendees([])
      return
    }
    const list = await getCellReportAttendees(r.id)
    setAttendees(list)
  }

  const canAccess = useMemo(() => {
    if (!userProfile) return false
    if (isFullAccess) return true
    // Must have a Cell position to access Cell Report
    if (!cellRole) return false
    if (isCellDirector) return true
    return !!myCellId
  }, [userProfile, isFullAccess, isCellDirector, myCellId, cellRole])

  if (!canAccess) {
    return (
      <div className="p-8 text-slate-600">
        <Link to="/departments" className="text-blue-600 hover:underline">← Departments</Link>
        <p className="mt-4">You do not have access to Cell Report. Cell Leaders can only access their own cell; Cell Director and Founder can view all.</p>
      </div>
    )
  }

  if (!canViewAllCells && !myCellId && cellGroups.length > 0) {
    return (
      <div className="p-8 text-slate-600">
        {canViewAllCells && (
          <Link to="/department/cell" className="text-blue-600 hover:underline">← Cell Department</Link>
        )}
        <p className="mt-4">Your user is not linked to a cell. Ask an admin to set your <strong>cellId</strong> in your profile, or ensure your name matches the <strong>Leader</strong> of a cell group.</p>
      </div>
    )
  }

  function ReportContent({ report, setReport, attendees, loading, reportDate, setReportDate, cell, cellMembers, memberForm, setMemberForm, editForm, setEditForm, handleAddMember, handleUpdateAttendee, handleRemoveAttendee, handleSaveCounters, saving, userProfile, backToBible, onToggleAttendance, onEditMember, handleAddVisitor, handleRemoveVisitor, handleAddChild, handleRemoveChild, visitorInput, setVisitorInput, childInput, setChildInput, programTimelineLogs }) {
    if (loading) return <div className="py-8 text-slate-500">Loading report…</div>
    if (!report) return <div className="py-6 text-slate-500">No report for this date.</div>
    const activeMembers = (cellMembers || []).filter((m) => m.status !== 'inactive')
    const formerMembers = (cellMembers || []).filter((m) => m.status === 'inactive' && m.memberCategory === 'former')
    const notAttendingMembers = (cellMembers || []).filter((m) => m.status === 'inactive' && m.memberCategory !== 'former')
    const isAttended = (memberId) => attendees.some((a) => a.memberId === memberId)
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="text-sm text-slate-700">
            <span className="font-medium">Report Date:</span> <span className="font-mono">{reportDate || '—'}</span>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-2">Cell Information</h3>
          <p className="text-slate-700 text-sm"><strong>Cell Name:</strong> {cell?.cellName || '—'}</p>
          <p className="text-slate-700 text-sm mt-0.5"><strong>Leader:</strong> {cell?.leader || '—'}</p>
          <p className="text-slate-700 text-sm mt-0.5"><strong>Meeting Day:</strong> {cell?.meetingDay || '—'}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-2">Members Attended</h3>
          <p className="text-2xl font-bold text-slate-800">{attendees.length}</p>
          <p className="text-xs text-slate-500">Click a member name below to mark attended; click again to remove.</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-2">Visitors Attended</h3>
          <p className="text-xs text-slate-500 mb-2">Type and add visitor names. These appear in the final report.</p>
          <div className="flex flex-wrap gap-2 mb-2">
            <input
              type="text"
              value={visitorInput}
              onChange={(e) => setVisitorInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  const n = visitorInput.trim()
                  if (n) { handleAddVisitor(n); setVisitorInput('') }
                }
              }}
              placeholder="Type name and press Enter or click Add"
              className="px-2 py-1.5 rounded border border-slate-300 min-w-[180px] flex-1"
            />
            <button type="button" onClick={() => { const n = visitorInput.trim(); if (n) { handleAddVisitor(n); setVisitorInput(''); } }} className="px-3 min-h-[44px] py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-medium transition-colors">Add visitor</button>
          </div>
          <ul className="text-sm text-slate-700 divide-y divide-slate-100">
            {(report.visitorsList || []).length === 0 ? <li className="py-2 text-slate-500">No visitors added.</li> : (report.visitorsList || []).map((name, i) => (
              <li key={i} className="py-1.5 flex items-center justify-between gap-2">
                <span>{name}</span>
                <button type="button" onClick={() => handleRemoveVisitor(i)} className="text-red-600 text-xs hover:underline">Remove</button>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-2">Children Attended</h3>
          <p className="text-xs text-slate-500 mb-2">Type and add children names. These appear in the final report.</p>
          <div className="flex flex-wrap gap-2 mb-2">
            <input
              type="text"
              value={childInput}
              onChange={(e) => setChildInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  const n = childInput.trim()
                  if (n) { handleAddChild(n); setChildInput('') }
                }
              }}
              placeholder="Type name and press Enter or click Add"
              className="px-2 py-1.5 rounded border border-slate-300 min-w-[180px] flex-1"
            />
            <button type="button" onClick={() => { const n = childInput.trim(); if (n) { handleAddChild(n); setChildInput(''); } }} className="px-3 min-h-[44px] py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-medium transition-colors">Add child</button>
          </div>
          <ul className="text-sm text-slate-700 divide-y divide-slate-100">
            {(report.childrenList || []).length === 0 ? <li className="py-2 text-slate-500">No children added.</li> : (report.childrenList || []).map((name, i) => (
              <li key={i} className="py-1.5 flex items-center justify-between gap-2">
                <span>{name}</span>
                <button type="button" onClick={() => handleRemoveChild(i)} className="text-red-600 text-xs hover:underline">Remove</button>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-2">Program Timeline (read-only)</h3>
          {(programTimelineLogs && programTimelineLogs.length > 0) ? (
            <ul className="text-sm text-slate-700 divide-y divide-slate-100 mt-1">
              {programTimelineLogs.map((log, i) => (
                <li key={i} className="py-1.5 flex justify-between gap-2">
                  <span className="font-medium text-slate-800">{log.programName || '—'}</span>
                  <span className="text-slate-600">{log.startTime ? format(log.startTime instanceof Date ? log.startTime : new Date(log.startTime), 'HH:mm') : '—'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No program times recorded for this meeting. Record times in the Timer tab.</p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-2">Back to the Bible</h3>
          {backToBible ? (
            <>
              <p className="text-sm font-medium text-slate-800">{backToBible.title || '—'}</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap mt-1">{backToBible.content || '—'}</p>
            </>
          ) : (
            <p className="text-sm text-slate-500">No Back to the Bible content for this week.</p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-2">Active Members</h3>
          <p className="text-xs text-slate-500 mb-2">Click name to mark attended (again to remove). Use Edit to change member details.</p>
          <ul className="text-sm text-slate-700 divide-y divide-slate-100">
            {activeMembers.length === 0 ? <li className="py-2 text-slate-500">No active members.</li> : activeMembers.map((m) => {
              const attended = isAttended(m.id)
              return (
                <li key={m.id} className="py-1.5 flex items-center gap-2 flex-wrap">
                  <button type="button" onClick={() => onToggleAttendance(m)} className={`text-left font-medium rounded px-1 -mx-1 ${attended ? 'bg-emerald-100 text-emerald-800' : 'text-slate-800 hover:bg-slate-100'}`}>
                    {attended && <span className="mr-1.5" aria-hidden>✓</span>}
                    {m.name || '—'}
                  </button>
                  {onEditMember && (
                    <button type="button" onClick={() => onEditMember(m)} className="text-blue-600 text-xs hover:underline">Edit</button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-2">Former Members</h3>
          <p className="text-xs text-slate-500 mb-2">Attended 10+ cell meetings before leaving. Visible but not selectable for attendance.</p>
          <ul className="text-sm text-slate-500 divide-y divide-slate-100">
            {formerMembers.length === 0 ? <li className="py-2">No former members.</li> : formerMembers.map((m) => {
              const tenure = calcTenureLabel(m.since, m.leftDate)
              return (
                <li key={m.id} className="py-1.5 flex items-center gap-2 flex-wrap">
                  <span>{m.name || '—'}</span>
                  {tenure && <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium">Member for {tenure}</span>}
                </li>
              )
            })}
          </ul>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-2">Inactive Members (Not Attending)</h3>
          <p className="text-xs text-slate-500 mb-2">Visible but not selectable for attendance.</p>
          <ul className="text-sm text-slate-500 divide-y divide-slate-100">
            {notAttendingMembers.length === 0 ? <li className="py-2">No inactive members.</li> : notAttendingMembers.map((m) => <li key={m.id} className="py-1">{m.name || '—'}</li>)}
          </ul>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="space-y-6 p-4">
      {isDirectorView && (
        <>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-800">Cell reporting table</h2>
                <p className="text-xs text-slate-500 mt-1">Single table view. Click a row to expand quick attendance edit.</p>
              </div>
              <label className="text-sm text-slate-700">
                Week (Monday)
                <input
                  type="date"
                  value={weekStartISO}
                  onChange={(e) => {
                    const d = parseISO(e.target.value)
                    if (Number.isNaN(d.getTime())) return
                    setWeekStartISO(format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd'))
                    setSelectedCellId(null)
                  }}
                  className="mt-1 block px-3 py-2 rounded-lg border border-slate-300"
                />
              </label>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">Cell</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">Leader</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">Report date</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">Attendance</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {directorRowsLoading
                    ? Array.from({ length: 6 }).map((_, i) => (
                        <tr key={`sk-${i}`}>
                          <td className="px-3 py-3" colSpan={5}>
                            <div className="h-4 w-full bg-slate-100 rounded animate-pulse" />
                          </td>
                        </tr>
                      ))
                    : visibleDirectorRows.map((c) => {
                        const row = directorRowsMap[c.id] || {}
                        const expectedDate = row.expectedDate || reportDateByCellId[c.id]
                        const submitted = !!row.submitted
                        const isOverdue = !submitted && expectedDate && expectedDate < format(new Date(), 'yyyy-MM-dd')
                        const statusLabel = submitted ? 'Submitted' : isOverdue ? 'Overdue' : 'Pending'
                        const statusClass = submitted
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : isOverdue
                            ? 'bg-red-100 text-red-700 border-red-200'
                            : 'bg-amber-100 text-amber-800 border-amber-200'
                        const expanded = selectedCellId === c.id
                        return (
                          <>
                            <tr
                              key={c.id}
                              className={`cursor-pointer hover:bg-slate-50 ${expanded ? 'bg-slate-50' : ''}`}
                              onClick={() => setSelectedCellId(expanded ? null : c.id)}
                            >
                              <td className="px-3 py-2 font-medium text-slate-800">{c.cellName || '—'}</td>
                              <td className="px-3 py-2 text-slate-600">{c.leader || '—'}</td>
                              <td className="px-3 py-2 text-slate-600 font-mono">{expectedDate || '—'}</td>
                              <td className="px-3 py-2 text-slate-800 font-semibold">{row.total ?? 0}</td>
                              <td className="px-3 py-2">
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs border ${statusClass}`}>
                                  {statusLabel}
                                </span>
                              </td>
                            </tr>
                            {expanded && (
                              <tr key={`${c.id}-expanded`}>
                                <td className="px-3 py-3 bg-slate-50" colSpan={5}>
                                  <div className="rol-accordion-slide-open">
                                    {loading ? (
                                      <div className="space-y-3">
                                        <div className="h-4 bg-slate-100 rounded animate-pulse" />
                                        <div className="h-4 bg-slate-100 rounded animate-pulse" />
                                      </div>
                                    ) : !report ? (
                                      <p className="text-sm text-slate-600">No report found for this date.</p>
                                    ) : (
                                      <div className="space-y-4">
                                        {isDirectorReadOnly && (
                                          <p className="text-sm text-slate-700 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 font-medium">
                                            Viewing as Director - Edits Disabled
                                          </p>
                                        )}

                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                                          <div className="bg-white rounded-lg border border-slate-200 p-3">
                                            <h4 className="text-sm font-semibold text-slate-900 mb-2">Members</h4>
                                            <div className="max-h-56 overflow-auto pr-1">
                                              <ul className="space-y-1.5">
                                                {(enrichedCellMembers || [])
                                                  .filter((m) => m.status !== 'inactive')
                                                  .map((m) => {
                                                    const attended = attendees.some((a) => a.memberId === m.id)
                                                    if (canEditSelectedCellReport) {
                                                      return (
                                                        <li key={m.id}>
                                                          <button
                                                            type="button"
                                                            onClick={() => handleToggleAttendance(m)}
                                                            className={`w-full text-left px-2 py-1.5 rounded text-sm ${
                                                              attended
                                                                ? 'bg-emerald-100 text-emerald-800'
                                                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                                            }`}
                                                          >
                                                            {m.name || '—'}
                                                          </button>
                                                        </li>
                                                      )
                                                    }
                                                    return (
                                                      <li key={m.id}>
                                                        <div
                                                          className={`px-2 py-1.5 rounded text-sm ${
                                                            attended ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-700'
                                                          }`}
                                                        >
                                                          {m.name || '—'} {attended ? '· Present' : ''}
                                                        </div>
                                                      </li>
                                                    )
                                                  })}
                                              </ul>
                                            </div>
                                          </div>

                                          <div className="bg-white rounded-lg border border-slate-200 p-3">
                                            <h4 className="text-sm font-semibold text-slate-900 mb-2">Visitors</h4>

                                            {canEditSelectedCellReport && (
                                              <div className="flex gap-2 mb-2">
                                                <input
                                                  type="text"
                                                  value={visitorInput}
                                                  onChange={(e) => setVisitorInput(e.target.value)}
                                                  onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                      e.preventDefault()
                                                      const n = visitorInput.trim()
                                                      if (n) {
                                                        handleAddVisitor(n)
                                                        setVisitorInput('')
                                                      }
                                                    }
                                                  }}
                                                  className="flex-1 px-2 py-2 rounded border border-slate-300"
                                                  placeholder="Add visitor"
                                                />
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    const n = visitorInput.trim()
                                                    if (n) {
                                                      handleAddVisitor(n)
                                                      setVisitorInput('')
                                                    }
                                                  }}
                                                  className="px-3 min-h-[44px] py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-medium transition-colors"
                                                >
                                                  Add
                                                </button>
                                              </div>
                                            )}

                                            <ul className="space-y-1 text-sm max-h-40 overflow-auto">
                                              {(report.visitorsList || []).map((name, i) => (
                                                <li key={`${name}-${i}`} className="flex items-center justify-between gap-2">
                                                  <span className="text-slate-700">{name}</span>
                                                  <div className="flex items-center gap-1 flex-shrink-0">
                                                    {proposedVisitorNames.has(name) ? (
                                                      <span className="text-xs text-emerald-600 font-medium">✓ Registered</span>
                                                    ) : (
                                                      <button
                                                        type="button"
                                                        onClick={() => { setProposalModal({ name, reportId: report.id, reportDate }); setProposalPhone('') }}
                                                        className="text-indigo-600 text-xs hover:underline"
                                                        title="Register in D-Light"
                                                      >
                                                        Register
                                                      </button>
                                                    )}
                                                    {canEditSelectedCellReport && (
                                                      <button
                                                        type="button"
                                                        onClick={() => handleRemoveVisitor(i)}
                                                        className="text-red-600 text-xs hover:underline"
                                                      >
                                                        Remove
                                                      </button>
                                                    )}
                                                  </div>
                                                </li>
                                              ))}
                                              {(report.visitorsList || []).length === 0 && <li className="text-slate-500">No visitors</li>}
                                            </ul>
                                          </div>

                                          <div className="bg-white rounded-lg border border-slate-200 p-3">
                                            <h4 className="text-sm font-semibold text-slate-900 mb-2">Children</h4>

                                            {canEditSelectedCellReport && (
                                              <div className="flex gap-2 mb-2">
                                                <input
                                                  type="text"
                                                  value={childInput}
                                                  onChange={(e) => setChildInput(e.target.value)}
                                                  onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                      e.preventDefault()
                                                      const n = childInput.trim()
                                                      if (n) {
                                                        handleAddChild(n)
                                                        setChildInput('')
                                                      }
                                                    }
                                                  }}
                                                  className="flex-1 px-2 py-2 rounded border border-slate-300"
                                                  placeholder="Add child"
                                                />
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    const n = childInput.trim()
                                                    if (n) {
                                                      handleAddChild(n)
                                                      setChildInput('')
                                                    }
                                                  }}
                                                  className="px-3 min-h-[44px] py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-medium transition-colors"
                                                >
                                                  Add
                                                </button>
                                              </div>
                                            )}

                                            <ul className="space-y-1 text-sm max-h-40 overflow-auto">
                                              {(report.childrenList || []).map((name, i) => (
                                                <li key={`${name}-${i}`} className="flex items-center justify-between gap-2">
                                                  <span className="text-slate-700">{name}</span>
                                                  {canEditSelectedCellReport && (
                                                    <button
                                                      type="button"
                                                      onClick={() => handleRemoveChild(i)}
                                                      className="text-red-600 text-xs hover:underline"
                                                    >
                                                      Remove
                                                    </button>
                                                  )}
                                                </li>
                                              ))}
                                              {(report.childrenList || []).length === 0 && <li className="text-slate-500">No children</li>}
                                            </ul>
                                          </div>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-3">
                                          {canEditSelectedCellReport && (
                                            <div className="flex items-center gap-3 flex-wrap">
                                              <button
                                                type="button"
                                                disabled={saving || attendees.length === 0}
                                                onClick={async () => {
                                                  if (!report) return
                                                  if (attendees.length === 0) {
                                                    setAttendanceSaveError('Please mark at least one member attendance before saving.')
                                                    setAttendanceSaveOk(false)
                                                    return
                                                  }
                                                  setAttendanceSaveError('')
                                                  setAttendanceSaveOk(false)
                                                  try {
                                                    setSaving(true)
                                                    await updateCellReport(report.id, {
                                                      membersAttended: attendees.length,
                                                      visitors: (report.visitorsList || []).length,
                                                      children: (report.childrenList || []).length,
                                                    })
                                                    await refreshReportAndAttendees()
                                                    setAttendanceDone(true)
                                                    setAttendanceDirty(false)
                                                    setCellReportUpdatedMsg('Cell report is updated')
                                                    window.setTimeout(() => setCellReportUpdatedMsg(''), 2500)
                                                    setAttendanceSaveOk(true)
                                                    window.setTimeout(() => setAttendanceSaveOk(false), 2500)
                                                  } catch (e) {
                                                    console.error('Attendance save error', e)
                                                    setAttendanceSaveOk(false)
                                                    setAttendanceSaveError('Failed to save attendance. Please try again.')
                                                  } finally {
                                                    setSaving(false)
                                                  }
                                                }}
                                                className="px-4 min-h-[44px] py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                                              >
                                                <span className="inline-flex items-center gap-2">
                                                  Save
                                                  {attendanceSaveOk && (
                                                    <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-emerald-600 text-white text-xs">
                                                      ✓
                                                    </span>
                                                  )}
                                                </span>
                                              </button>
                                              {attendanceSaveError && (
                                                <p className="text-sm text-red-600">{attendanceSaveError}</p>
                                              )}
                                            </div>
                                          )}

                                          <p className="text-sm text-slate-700">
                                            Members: {attendees.length} · Visitors: {(report.visitorsList || []).length} · Children: {(report.childrenList || []).length}
                                          </p>
                                        </div>

                                        {/* ── Program Timer (Director / Founder view) ── */}
                                        {programItems.length > 0 && (() => {
                                          const sorted = [...programItems].sort((a, b) => a.order - b.order)
                                          const currentItem = sorted[programLogs.length] || null
                                          const sortedLogs = sortProgramLogsByStart(programLogs)
                                          return (
                                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
                                                <span className="font-semibold text-slate-800 text-sm">Program Timer</span>
                                                {canEditTimer && !currentItem && (
                                                  <button type="button" onClick={() => { const now = new Date(); setManualTimeModal({ mode: 'add', logId: null, programName: '', timeStr: format(now, 'HH:mm'), reportDate: reportDate || format(new Date(), 'yyyy-MM-dd') }) }} className="text-xs text-indigo-600 border border-indigo-200 rounded-lg px-2.5 py-1 hover:bg-indigo-50">
                                                    + Add missed entry
                                                  </button>
                                                )}
                                              </div>
                                              {sortedLogs.length > 0 && (
                                                <ul className="divide-y divide-slate-100 text-sm">
                                                  {sortedLogs.map((log, i) => {
                                                    const segMin = segmentDurationMinutesForSortedLog(sortedLogs, i)
                                                    const timeStr = log.startTime ? format(log.startTime instanceof Date ? log.startTime : new Date(log.startTime), 'HH:mm') : '—'
                                                    return (
                                                      <li key={log.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                                                        <span className="font-medium text-slate-800 truncate">{log.programName || '—'}</span>
                                                        <div className="flex items-center gap-2 flex-shrink-0">
                                                          <span className="text-slate-500 tabular-nums text-xs">{timeStr}{segMin != null ? ` · ${formatDurationMinutes(segMin)}` : ''}</span>
                                                          {canEditTimer && (
                                                            <>
                                                              <button type="button" onClick={() => { const t = log.startTime instanceof Date ? log.startTime : new Date(log.startTime); setManualTimeModal({ mode: 'edit', logId: log.id, programName: log.programName, timeStr: format(t, 'HH:mm'), reportDate: reportDate || format(new Date(), 'yyyy-MM-dd') }) }} className="text-xs text-indigo-600 hover:underline">Edit</button>
                                                              <button type="button" onClick={async () => { if (!window.confirm(`Delete "${log.programName}"?`)) return; try { await deleteProgramLog(log.id); const logs = await getProgramLogsByCellAndDate(cell?.cellName || '', reportDate || format(new Date(), 'yyyy-MM-dd')); setProgramLogs(logs) } catch (e) { alert(e?.message || 'Failed') } }} className="text-xs text-red-500 hover:underline">Delete</button>
                                                            </>
                                                          )}
                                                        </div>
                                                      </li>
                                                    )
                                                  })}
                                                </ul>
                                              )}
                                              {!currentItem && sortedLogs.length === 0 && (
                                                <p className="px-4 py-4 text-sm text-slate-500">No times recorded yet.</p>
                                              )}
                                              {!currentItem && sortedLogs.length > 0 && (
                                                <div className="px-4 py-3 border-t border-slate-100 flex items-center gap-3">
                                                  <span className="text-sm font-medium text-emerald-700">✓ All programs recorded</span>
                                                  {canEditTimer && (
                                                    <button type="button" onClick={async () => { if (!report) return; try { setSaving(true); await updateCellReport(report.id, { meetingFinalized: true, membersAttended: attendees.length, visitors: (report.visitorsList || []).length, children: (report.childrenList || []).length }); await refreshReportAndAttendees(); setCellReportUpdatedMsg('Cell report is updated'); window.setTimeout(() => setCellReportUpdatedMsg(''), 2500) } catch (e) { alert('Failed to end meeting') } finally { setSaving(false) } }} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700">End Cell Meeting</button>
                                                  )}
                                                </div>
                                              )}
                                              {currentItem && (
                                                <div className="p-4 flex flex-col items-center gap-3">
                                                  <button
                                                    type="button"
                                                    onClick={async () => {
                                                      if (!canEditTimer) return
                                                      try {
                                                        await addProgramLog({ cellName: cell?.cellName || '', programName: currentItem.programName, startTime: new Date(), reportDate: reportDate || format(new Date(), 'yyyy-MM-dd') })
                                                        const logs = await getProgramLogsByCellAndDate(cell?.cellName || '', reportDate || format(new Date(), 'yyyy-MM-dd'))
                                                        setProgramLogs(logs)
                                                      } catch (e) { alert(e?.message || e?.code || 'Failed to record') }
                                                    }}
                                                    className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg border-2 border-indigo-700 flex flex-col items-center justify-center cursor-pointer active:scale-[0.98] transition"
                                                    style={{ width: '3in', minWidth: '3in', height: '3.8in', minHeight: '3.8in' }}
                                                  >
                                                    <span className="text-3xl md:text-4xl font-bold tracking-wide">START</span>
                                                    <span className="text-sm md:text-base text-white/95 mt-3 font-medium">{currentItem.programName || '—'}</span>
                                                  </button>
                                                  {canEditTimer && (
                                                    <button type="button" onClick={() => { const now = new Date(); setManualTimeModal({ mode: 'add', logId: null, programName: currentItem.programName, timeStr: format(now, 'HH:mm'), reportDate: reportDate || format(new Date(), 'yyyy-MM-dd') }) }} className="text-sm text-indigo-500 hover:text-indigo-700 underline-offset-2 hover:underline">
                                                      Missed the tap? Enter time manually
                                                    </button>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          )
                                        })()}
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        )
                      })}
                </tbody>
              </table>
            </div>
            {visibleDirectorRows.length === 0 && <p className="text-sm text-slate-500 p-4">No cell groups found.</p>}
          </div>

          <div className="md:hidden fixed bottom-6 right-6 z-40">
            <button
              type="button"
              onClick={() => {
                if (!selectedCellId && visibleDirectorRows[0]) setSelectedCellId(visibleDirectorRows[0].id)
                else alert('Select a row to start quick attendance edit.')
              }}
              className="h-14 w-14 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg text-2xl"
              aria-label="New report"
            >
              +
            </button>
          </div>
        </>
      )}

      {isLeaderView && (
        <div className="max-w-lg mx-auto md:max-w-xl">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm mb-4">
            <h3 className="font-semibold text-slate-800 mb-2">Cell Information</h3>
            <p className="text-slate-700 text-sm"><strong>Cell Name:</strong> {cell?.cellName || '—'}</p>
            <p className="text-slate-700 text-sm mt-0.5"><strong>Leader:</strong> {cell?.leader || '—'}</p>
            <p className="text-slate-700 text-sm mt-0.5"><strong>Meeting Day:</strong> {cell?.meetingDay || '—'}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="text-sm text-slate-700">
                <span className="font-medium">Report Date:</span> <span className="font-mono">{reportDate || '—'}</span>
              </span>
              {(() => {
                const submitted = Boolean(report)
                const todayISO = format(new Date(), 'yyyy-MM-dd')
                const isOverdue = !submitted && reportDate && reportDate < todayISO
                const statusLabel = submitted ? 'Submitted' : isOverdue ? 'Overdue' : 'Pending'
                const statusClass = submitted
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  : isOverdue
                    ? 'bg-red-100 text-red-700 border-red-200'
                    : 'bg-amber-100 text-amber-800 border-amber-200'
                return (
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs border ${statusClass}`}>
                    {statusLabel}
                  </span>
                )
              })()}
            </div>

            <div className="mt-3">
              <label className="text-sm text-slate-700">
                Week (Monday)
                <input
                  type="date"
                  value={weekStartISO}
                  onChange={(e) => {
                    const d = parseISO(e.target.value)
                    if (Number.isNaN(d.getTime())) return
                    setWeekStartISO(format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd'))
                    setLeaderTab('attendance')
                  }}
                  className="ml-2 mt-1 block px-3 py-2 rounded-lg border border-slate-300"
                />
              </label>
            </div>
          </div>
          <div className="flex border-b border-slate-200 overflow-x-auto">
            {((cellGroupsLoading || canEditCurrentReport) ? CELL_REPORT_TABS_ALL : isDirectorReadOnly ? CELL_REPORT_TABS_DIRECTOR : CELL_REPORT_TABS_VIEW_ONLY).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setLeaderTab(key)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition ${
                  leaderTab === key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-4 pb-8">
            {leaderTab === 'attendance' && (
              <div className="space-y-4">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-slate-600">Cell</th>
                          <th className="text-left px-3 py-2 font-medium text-slate-600">Leader</th>
                          <th className="text-left px-3 py-2 font-medium text-slate-600">Report date</th>
                          <th className="text-left px-3 py-2 font-medium text-slate-600">Attendance</th>
                          <th className="text-left px-3 py-2 font-medium text-slate-600">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        <tr
                          className={`cursor-pointer hover:bg-slate-50 ${leaderAttendanceOpen ? 'bg-slate-50' : ''}`}
                          onClick={() => setLeaderAttendanceOpen((v) => !v)}
                        >
                          <td className="px-3 py-2 font-medium text-slate-800">{cell?.cellName || '—'}</td>
                          <td className="px-3 py-2 text-slate-600">{cell?.leader || '—'}</td>
                          <td className="px-3 py-2 text-slate-600 font-mono">{reportDate || '—'}</td>
                          <td className="px-3 py-2 text-slate-800 font-semibold">
                            {attendees.length + (report?.visitorsList || []).length + (report?.childrenList || []).length}
                          </td>
                          <td className="px-3 py-2">
                            {(() => {
                              const submitted = Boolean(report)
                              const todayISO = format(new Date(), 'yyyy-MM-dd')
                              const isOverdue = !submitted && reportDate && reportDate < todayISO
                              const statusLabel = submitted ? 'Submitted' : isOverdue ? 'Overdue' : 'Pending'
                              const statusClass = submitted
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                : isOverdue
                                  ? 'bg-red-100 text-red-700 border-red-200'
                                  : 'bg-amber-100 text-amber-800 border-amber-200'
                              return (
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs border ${statusClass}`}>
                                  {statusLabel}
                                </span>
                              )
                            })()}
                          </td>
                        </tr>

                        {leaderAttendanceOpen && (
                          <tr>
                            <td colSpan={5} className="px-3 py-3 bg-slate-50">
                              <div className="rol-accordion-slide-open">
                                {!canEditCurrentReport && (
                                  <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                                    View only. You can edit this report only when you are Cell Leader for this cell (and your profile cell matches).
                                  </p>
                                )}

                                {loading ? (
                                  <div className="space-y-3">
                                    <div className="h-4 bg-slate-100 rounded animate-pulse" />
                                    <div className="h-4 bg-slate-100 rounded animate-pulse" />
                                    <div className="h-24 bg-slate-100 rounded animate-pulse" />
                                  </div>
                                ) : !report ? (
                                  <div className="py-6 text-slate-500">
                                    {canEditCurrentReport
                                      ? 'No report for this date. Save attendance after the report is created.'
                                      : 'No report for this date.'}
                                  </div>
                                ) : (
                                  <div className="mt-2 space-y-4">
                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                                      <div className="bg-white rounded-lg border border-slate-200 p-3">
                                        <h4 className="text-sm font-semibold text-slate-900 mb-2">Members</h4>
                                        <div className="max-h-56 overflow-auto pr-1 space-y-1">
                                          {(enrichedCellMembers || [])
                                            .filter((m) => m.status !== 'inactive')
                                            .map((m) => {
                                              const attended = attendees.some((a) => a.memberId === m.id)
                                              if (canEditCurrentReport) {
                                                return (
                                                  <button
                                                    key={m.id}
                                                    type="button"
                                                    onClick={() => handleToggleAttendance(m)}
                                                    className={`w-full text-left px-2.5 py-1.5 rounded text-sm ${
                                                      attended ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                                    }`}
                                                  >
                                                    {m.name || '—'} {attended ? '· Present' : ''}
                                                  </button>
                                                )
                                              }
                                              return (
                                                <div
                                                  key={m.id}
                                                  className={`px-2.5 py-1.5 rounded text-sm ${
                                                    attended ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-700'
                                                  }`}
                                                >
                                                  {m.name || '—'} {attended ? '· Present' : ''}
                                                </div>
                                              )
                                            })}
                                          {(enrichedCellMembers || []).filter((m) => m.status !== 'inactive').length === 0 && (
                                            <p className="text-sm text-slate-500">No active members.</p>
                                          )}
                                        </div>
                                      </div>

                                      <div className="bg-white rounded-lg border border-slate-200 p-3">
                                        <h4 className="text-sm font-semibold text-slate-900 mb-2">Visitors</h4>
                                        {canEditCurrentReport && (
                                          <div className="flex gap-2 mb-2">
                                            <input
                                              type="text"
                                              value={visitorInput}
                                              onChange={(e) => setVisitorInput(e.target.value)}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                  e.preventDefault()
                                                  const n = visitorInput.trim()
                                                  if (n) {
                                                    handleAddVisitor(n)
                                                    setVisitorInput('')
                                                  }
                                                }
                                              }}
                                              placeholder="Add visitor"
                                              className="flex-1 px-2 py-2 rounded border border-slate-300"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const n = visitorInput.trim()
                                                if (n) {
                                                  handleAddVisitor(n)
                                                  setVisitorInput('')
                                                }
                                              }}
                                              className="px-3 min-h-[44px] py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-medium transition-colors"
                                            >
                                              Add
                                            </button>
                                          </div>
                                        )}
                                        <ul className="space-y-1 text-sm max-h-40 overflow-auto">
                                          {(report.visitorsList || []).length === 0 ? (
                                            <li className="text-slate-500">No visitors</li>
                                          ) : (
                                            (report.visitorsList || []).map((name, i) => (
                                              <li key={`${name}-${i}`} className="flex items-center justify-between gap-2">
                                                <span className="text-slate-700">{name}</span>
                                                <div className="flex items-center gap-1 flex-shrink-0">
                                                  {proposedVisitorNames.has(name) ? (
                                                    <span className="text-xs text-emerald-600 font-medium">✓ Registered</span>
                                                  ) : (
                                                    <button
                                                      type="button"
                                                      onClick={() => { setProposalModal({ name, reportId: report.id, reportDate }); setProposalPhone('') }}
                                                      className="text-indigo-600 text-xs hover:underline"
                                                      title="Register in D-Light"
                                                    >
                                                      Register
                                                    </button>
                                                  )}
                                                  {canEditCurrentReport && (
                                                    <button type="button" onClick={() => handleRemoveVisitor(i)} className="text-red-600 text-xs hover:underline">
                                                      Remove
                                                    </button>
                                                  )}
                                                </div>
                                              </li>
                                            ))
                                          )}
                                        </ul>
                                      </div>

                                      <div className="bg-white rounded-lg border border-slate-200 p-3">
                                        <h4 className="text-sm font-semibold text-slate-900 mb-2">Children</h4>
                                        {canEditCurrentReport && (
                                          <div className="flex gap-2 mb-2">
                                            <input
                                              type="text"
                                              value={childInput}
                                              onChange={(e) => setChildInput(e.target.value)}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                  e.preventDefault()
                                                  const n = childInput.trim()
                                                  if (n) {
                                                    handleAddChild(n)
                                                    setChildInput('')
                                                  }
                                                }
                                              }}
                                              placeholder="Add child"
                                              className="flex-1 px-2 py-2 rounded border border-slate-300"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const n = childInput.trim()
                                                if (n) {
                                                  handleAddChild(n)
                                                  setChildInput('')
                                                }
                                              }}
                                              className="px-3 min-h-[44px] py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-medium transition-colors"
                                            >
                                              Add
                                            </button>
                                          </div>
                                        )}
                                        <ul className="space-y-1 text-sm max-h-40 overflow-auto">
                                          {(report.childrenList || []).length === 0 ? (
                                            <li className="text-slate-500">No children</li>
                                          ) : (
                                            (report.childrenList || []).map((name, i) => (
                                              <li key={`${name}-${i}`} className="flex items-center justify-between gap-2">
                                                <span className="text-slate-700">{name}</span>
                                                {canEditCurrentReport ? (
                                                  <button type="button" onClick={() => handleRemoveChild(i)} className="text-red-600 text-xs hover:underline">
                                                    Remove
                                                  </button>
                                                ) : null}
                                              </li>
                                            ))
                                          )}
                                        </ul>
                                      </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-3">
                                      {canEditCurrentReport && attendanceDirty ? (
                                        <div className="flex items-center gap-3 flex-wrap">
                                          <button
                                            type="button"
                                            disabled={saving || attendees.length === 0}
                                            onClick={async () => {
                                              if (!report) return
                                              if (attendees.length === 0) {
                                                setAttendanceSaveError('Please mark at least one member attendance before saving.')
                                                setAttendanceSaveOk(false)
                                                return
                                              }
                                              setAttendanceSaveError('')
                                              setAttendanceSaveOk(false)
                                              try {
                                                setSaving(true)
                                                await updateCellReport(report.id, {
                                                  membersAttended: attendees.length,
                                                  visitors: (report.visitorsList || []).length,
                                                  children: (report.childrenList || []).length,
                                                })
                                                await refreshReportAndAttendees()
                                                setAttendanceDone(true)
                                                setAttendanceDirty(false)
                                                setCellReportUpdatedMsg('Cell report is updated')
                                                window.setTimeout(() => setCellReportUpdatedMsg(''), 2500)
                                                setAttendanceSaveOk(true)
                                                window.setTimeout(() => setAttendanceSaveOk(false), 2500)
                                              } catch (e) {
                                                console.error('Attendance finalize error', e)
                                                setAttendanceSaveOk(false)
                                                setAttendanceSaveError('Failed to update attendance. Please try again.')
                                              } finally {
                                                setSaving(false)
                                              }
                                            }}
                                            className="px-4 min-h-[44px] py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                                          >
                                            <span className="inline-flex items-center gap-2">
                                              Save
                                              {attendanceSaveOk && (
                                                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-emerald-600 text-white text-xs">
                                                  ✓
                                                </span>
                                              )}
                                            </span>
                                          </button>
                                          {attendanceSaveError && <p className="text-sm text-red-600">{attendanceSaveError}</p>}
                                        </div>
                                      ) : (
                                        <span className="text-sm text-slate-500">{canEditCurrentReport ? 'No unsaved changes.' : 'Read-only attendance.'}</span>
                                      )}
                                      <p className="text-sm text-slate-700">
                                        Members: {attendees.length} · Visitors: {(report.visitorsList || []).length} · Children: {(report.childrenList || []).length}
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
            {leaderTab === 'backToBible' && (
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <h3 className="font-semibold text-slate-800 mb-2">Back to Bible (read-only)</h3>
                <p className="text-xs text-slate-500 mb-3">Content prepared by the Cell Director for this week. No editing allowed.</p>
                {backToBible ? (
                  <>
                    <p className="text-sm font-medium text-slate-800">{backToBible.title || '—'}</p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap mt-2">{backToBible.content || '—'}</p>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">No Back to Bible content for this week.</p>
                )}
              </div>
            )}
            {leaderTab === 'timer' && (
              <div className="space-y-4">
                <div className="text-sm text-slate-700">
                  <span className="font-medium">Meeting date:</span> <span className="font-mono">{reportDate || '—'}</span>
                </div>
                <p className="text-sm text-slate-500">Tap START when each program begins. Use the edit buttons to correct a time after the fact.</p>

                {(() => {
                  const sorted = [...programItems].sort((a, b) => a.order - b.order)
                  const currentItem = sorted[programLogs.length] || null
                  if (sorted.length === 0) {
                    return <p className="text-slate-500 py-6">Add program items in <strong>Set Default Program</strong> first.</p>
                  }

                  // ── All programs done: editable timeline + add + end meeting ──
                  if (!currentItem) {
                    const sortedLogs = sortProgramLogsByStart(programLogs)
                    return (
                      <div className="space-y-3">
                        {/* Editable timeline */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
                            <span className="font-semibold text-emerald-700 text-sm">✓ All programs recorded</span>
                            {canEditTimer && !meetingLocked && (
                              <button
                                type="button"
                                onClick={() => {
                                  const now = new Date()
                                  setManualTimeModal({
                                    mode: 'add',
                                    logId: null,
                                    programName: '',
                                    timeStr: format(now, 'HH:mm'),
                                    reportDate: reportDate || format(new Date(), 'yyyy-MM-dd'),
                                  })
                                }}
                                className="text-xs text-indigo-600 border border-indigo-200 rounded-lg px-2.5 py-1 hover:bg-indigo-50"
                              >
                                + Add missed entry
                              </button>
                            )}
                          </div>
                          {sortedLogs.length === 0 ? (
                            <p className="px-4 py-4 text-sm text-slate-500">No times recorded yet.</p>
                          ) : (
                            <ul className="divide-y divide-slate-100 text-sm">
                              {sortedLogs.map((log, i) => {
                                const segMin = segmentDurationMinutesForSortedLog(sortedLogs, i)
                                const timeStr = log.startTime
                                  ? format(log.startTime instanceof Date ? log.startTime : new Date(log.startTime), 'HH:mm')
                                  : '—'
                                return (
                                  <li key={log.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                                    <span className="font-medium text-slate-800 truncate">{log.programName || '—'}</span>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <span className="text-slate-500 tabular-nums text-xs">
                                        {timeStr}{segMin != null ? ` · ${formatDurationMinutes(segMin)}` : ''}
                                      </span>
                                      {canEditTimer && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const t = log.startTime instanceof Date ? log.startTime : new Date(log.startTime)
                                              setManualTimeModal({
                                                mode: 'edit',
                                                logId: log.id,
                                                programName: log.programName,
                                                timeStr: format(t, 'HH:mm'),
                                                reportDate: reportDate || format(new Date(), 'yyyy-MM-dd'),
                                              })
                                            }}
                                            className="text-xs text-indigo-600 hover:underline"
                                          >
                                            Edit
                                          </button>
                                          <button
                                            type="button"
                                            onClick={async () => {
                                              if (!window.confirm(`Delete the recorded time for "${log.programName}"?`)) return
                                              try {
                                                await deleteProgramLog(log.id)
                                                const logs = await getProgramLogsByCellAndDate(cell?.cellName || '', reportDate || format(new Date(), 'yyyy-MM-dd'))
                                                setProgramLogs(logs)
                                              } catch (e) {
                                                alert(e?.message || 'Failed to delete')
                                              }
                                            }}
                                            className="text-xs text-red-500 hover:underline"
                                          >
                                            Delete
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </li>
                                )
                              })}
                            </ul>
                          )}
                        </div>

                        {/* End meeting */}
                        {canEditTimer && !meetingLocked ? (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={async () => {
                              if (!report) return
                              try {
                                setSaving(true)
                                await updateCellReport(report.id, {
                                  meetingFinalized: true,
                                  membersAttended: attendees.length,
                                  visitors: (report.visitorsList || []).length,
                                  children: (report.childrenList || []).length,
                                })
                                await refreshReportAndAttendees()
                                setLeaderTab('meetingReport')
                                setCellReportUpdatedMsg('Cell report is updated')
                                window.setTimeout(() => setCellReportUpdatedMsg(''), 2500)
                              } catch (e) {
                                console.error('End cell meeting error', e)
                                alert('Failed to end meeting')
                              } finally {
                                setSaving(false)
                              }
                            }}
                            className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 disabled:opacity-60 shadow-sm"
                          >
                            End Cell Meeting
                          </button>
                        ) : meetingLocked ? (
                          <p className="text-center text-sm text-emerald-700 font-medium py-2">Meeting ended.</p>
                        ) : null}
                      </div>
                    )
                  }

                  // ── Still recording: show progress strip + START button ──
                  const inProgressSorted = sortProgramLogsByStart(programLogs)
                  return (
                    <div className="space-y-4">
                      {/* Recorded so far */}
                      {inProgressSorted.length > 0 && (
                        <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 shadow-sm">
                          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Recorded so far</p>
                          <ul className="text-sm text-slate-700 divide-y divide-slate-200">
                            {inProgressSorted.map((log, i) => {
                              const segMin = segmentDurationMinutesForSortedLog(inProgressSorted, i)
                              const timeStr = log.startTime
                                ? format(log.startTime instanceof Date ? log.startTime : new Date(log.startTime), 'HH:mm')
                                : '—'
                              return (
                                <li key={log.id} className="py-1.5 flex items-center justify-between gap-2">
                                  <span className="truncate">{log.programName || '—'}</span>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className="text-slate-500 tabular-nums text-xs">
                                      {timeStr}{segMin != null ? ` · ${formatDurationMinutes(segMin)}` : ''}
                                    </span>
                                    {canEditTimer && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const t = log.startTime instanceof Date ? log.startTime : new Date(log.startTime)
                                            setManualTimeModal({
                                              mode: 'edit',
                                              logId: log.id,
                                              programName: log.programName,
                                              timeStr: format(t, 'HH:mm'),
                                              reportDate: reportDate || format(new Date(), 'yyyy-MM-dd'),
                                            })
                                          }}
                                          className="text-xs text-indigo-600 hover:underline"
                                        >
                                          Edit
                                        </button>
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            if (!window.confirm(`Delete the recorded time for "${log.programName}"?`)) return
                                            try {
                                              await deleteProgramLog(log.id)
                                              const logs = await getProgramLogsByCellAndDate(cell?.cellName || '', reportDate || format(new Date(), 'yyyy-MM-dd'))
                                              setProgramLogs(logs)
                                            } catch (e) {
                                              alert(e?.message || 'Failed to delete')
                                            }
                                          }}
                                          className="text-xs text-red-500 hover:underline"
                                        >
                                          Delete
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      )}
                      <div className="flex flex-col items-center gap-3">
                        <button
                          type="button"
                          onClick={async () => {
                            if (!canEditTimer || meetingLocked) return
                            try {
                              await addProgramLog({ cellName: cell?.cellName || '', programName: currentItem.programName, startTime: new Date(), reportDate: reportDate || format(new Date(), 'yyyy-MM-dd') })
                              const logs = await getProgramLogsByCellAndDate(cell?.cellName || '', reportDate || format(new Date(), 'yyyy-MM-dd'))
                              setProgramLogs(logs)
                            } catch (e) {
                              console.error('Program log error', e)
                              const msg = e?.message || e?.code || (e && String(e)) || 'Failed to record'
                              alert(msg)
                            }
                          }}
                          className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg border-2 border-indigo-700 flex flex-col items-center justify-center cursor-pointer active:scale-[0.98] transition"
                          style={{ width: '3in', minWidth: '3in', height: '3.8in', minHeight: '3.8in' }}
                        >
                          <span className="text-3xl md:text-4xl font-bold tracking-wide">START</span>
                          <span className="text-sm md:text-base text-white/95 mt-3 font-medium">{currentItem.programName || '—'}</span>
                        </button>
                        {canEditTimer && !meetingLocked && (
                          <button
                            type="button"
                            onClick={() => {
                              const now = new Date()
                              setManualTimeModal({
                                mode: 'add',
                                logId: null,
                                programName: currentItem.programName,
                                timeStr: format(now, 'HH:mm'),
                                reportDate: reportDate || format(new Date(), 'yyyy-MM-dd'),
                              })
                            }}
                            className="text-sm text-indigo-500 hover:text-indigo-700 underline-offset-2 hover:underline"
                          >
                            Missed the tap? Enter time manually
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })()}

              </div>
            )}

            {leaderTab === 'setDefaultProgram' && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  <h3 className="font-semibold text-slate-800 mb-2">Default program for your cell</h3>
                  <p className="text-xs text-slate-500 mb-3">Add, edit, delete, or reorder items. This list is used when recording program timing during the meeting.</p>
                  <form onSubmit={async (e) => { e.preventDefault(); if (!canEditCurrentReport || !effectiveCellId) return; const name = (programForm.programName || '').trim(); if (!name) return; try { if (editingProgramId) { await updateCellProgramItem(effectiveCellId, editingProgramId, { programName: name, order: programForm.order }); setProgramItems((prev) => prev.map((p) => p.id === editingProgramId ? { ...p, programName: name, order: programForm.order } : p)); setEditingProgramId(null); } else { await addCellProgramItem(effectiveCellId, { programName: name, order: programForm.order }); const list = await getCellProgramItems(effectiveCellId); setProgramItems(list); } setProgramForm({ programName: '', order: programItems.length }); } catch (err) { alert('Failed'); } }} className="flex flex-wrap gap-2 mb-4">
                    <input type="text" placeholder="Program name" value={programForm.programName} onChange={(e) => setProgramForm((f) => ({ ...f, programName: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-300 flex-1 min-w-[120px]" />
                    <input type="number" min="0" placeholder="Order" value={programForm.order} onChange={(e) => setProgramForm((f) => ({ ...f, order: Number(e.target.value) || 0 }))} className="w-16 px-2 py-2 rounded-lg border border-slate-300" />
                    <button type="submit" className="px-4 min-h-[44px] py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-medium transition-colors">{editingProgramId ? 'Update' : 'Add'}</button>
                    {editingProgramId && <button type="button" onClick={() => { setEditingProgramId(null); setProgramForm({ programName: '', order: programItems.length }); }} className="px-3 py-2 rounded-lg border border-slate-300 text-sm">Cancel</button>}
                  </form>
                  <ul className="space-y-2">
                    {[...programItems].sort((a, b) => a.order - b.order).map((item, idx, arr) => {
                      const prevItem = arr[idx - 1]
                      const nextItem = arr[idx + 1]
                      return (
                        <li key={item.id} className="flex flex-wrap items-center gap-2 py-2 border-b border-slate-100">
                          <span className="text-slate-500 text-sm w-6">{idx + 1}.</span>
                          <span className="font-medium text-slate-800 flex-1">{item.programName || '—'}</span>
                          <button type="button" onClick={() => { if (!canEditCurrentReport) return; setEditingProgramId(item.id); setProgramForm({ programName: item.programName, order: item.order }); }} className="text-blue-600 text-sm hover:underline">Edit</button>
                          <button type="button" onClick={async () => { if (!canEditCurrentReport) return; if (!window.confirm('Remove this item?')) return; await deleteCellProgramItem(effectiveCellId, item.id); setProgramItems((p) => p.filter((x) => x.id !== item.id)); }} className="text-red-600 text-sm hover:underline">Delete</button>
                          {prevItem && (
                            <button type="button" onClick={async () => { if (!canEditCurrentReport) return; await updateCellProgramItem(effectiveCellId, item.id, { order: prevItem.order }); await updateCellProgramItem(effectiveCellId, prevItem.id, { order: item.order }); const list = await getCellProgramItems(effectiveCellId); setProgramItems(list); }} className="text-slate-600 text-xs px-1">↑</button>
                          )}
                          {nextItem && (
                            <button type="button" onClick={async () => { if (!canEditCurrentReport) return; await updateCellProgramItem(effectiveCellId, item.id, { order: nextItem.order }); await updateCellProgramItem(effectiveCellId, nextItem.id, { order: item.order }); const list = await getCellProgramItems(effectiveCellId); setProgramItems(list); }} className="text-slate-600 text-xs px-1">↓</button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                  {programItems.length === 0 && <p className="text-slate-500 text-sm py-2">No program items. Add items above (e.g. Opening Prayer, Worship, Back to the Bible, Sharing, Prayer, Fellowship).</p>}
                </div>
              </div>
            )}

            {leaderTab === 'meetingReport' && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  <h3 className="font-semibold text-slate-800 mb-2">Meeting Report (read-only)</h3>
                  <p className="text-sm text-slate-600">
                    Date: <span className="font-mono">{reportDate || '—'}</span>
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  <h3 className="font-semibold text-slate-800 mb-2">Program list</h3>
                  {programLogs.length === 0 ? (
                    <p className="text-sm text-slate-500">No program timings recorded.</p>
                  ) : (
                    <ul className="space-y-2">
                      {(() => {
                        const sorted = sortProgramLogsByStart(programLogs)
                        return sorted.map((log, i) => {
                          const segMin = segmentDurationMinutesForSortedLog(sorted, i)
                          return (
                          <li key={log.id} className="flex flex-wrap items-center justify-between gap-4">
                            <span className="text-sm font-medium text-slate-800">{log.programName || '—'}</span>
                            <span className="text-sm text-slate-600 tabular-nums flex flex-wrap gap-3">
                              <span>
                                {log.startTime ? format(log.startTime instanceof Date ? log.startTime : new Date(log.startTime), 'HH:mm') : '—'}
                              </span>
                              <span className="text-slate-500">
                                {segMin != null ? formatDurationMinutes(segMin) : '—'}
                              </span>
                            </span>
                          </li>
                          )
                        })
                      })()}
                    </ul>
                  )}
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  <h3 className="font-semibold text-slate-800 mb-2">Totals</h3>
                  <div className="flex flex-wrap gap-4">
                    <div className="min-w-[160px]">
                      <div className="text-xs text-slate-500">Total attendance</div>
                      <div className="text-2xl font-bold text-slate-900">
                        {attendees.length + (report?.visitorsList || []).length + (report?.childrenList || []).length}
                      </div>
                    </div>
                    <div className="min-w-[160px]">
                      <div className="text-xs text-slate-500">Meeting duration</div>
                      <div className="text-2xl font-bold text-slate-900">
                        {formatDurationMinutes(meetingDurationMinutesFromLogs(programLogs))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {leaderTab === 'editCell' && (() => {
              const all = enrichedCellMembers || []
              const q = (editCellSearch || '').toLowerCase().trim()
              const filtered = q ? all.filter((m) => (m.name || '').toLowerCase().includes(q) || (m.phone || '').includes(q) || (m.role || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q)) : all
              const sorted = [...filtered].sort((a, b) => {
                const na = (a.name || '').toLowerCase()
                const nb = (b.name || '').toLowerCase()
                return editCellSortAsc ? na.localeCompare(nb) : nb.localeCompare(na)
              })
              const active = sorted.filter((m) => m.status !== 'inactive')
              const former = sorted.filter((m) => m.status === 'inactive' && m.memberCategory === 'former')
              const notAttending = sorted.filter((m) => m.status === 'inactive' && m.memberCategory !== 'former')
              return (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <input type="text" value={editCellSearch} onChange={(e) => setEditCellSearch(e.target.value)} placeholder="Search member" className="px-3 py-2 rounded-lg border border-slate-300 min-w-[180px]" />
                    <button type="button" onClick={() => setEditCellSortAsc((v) => !v)} className="px-3 min-h-[44px] py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 transition-colors">Sort by name {editCellSortAsc ? 'A→Z' : 'Z→A'}</button>
                    <button type="button" onClick={() => { setLeaderAddMemberOpen(true); setLeaderAddMemberForm({ name: '', birthday: '', anniversary: '', phone: '', locality: '', since: '', status: 'active' }); }} className="px-3 min-h-[44px] py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-medium transition-colors">Add Member</button>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <h3 className="font-semibold text-slate-800 mb-2">Active Members</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-slate-600">Name</th>
                            <th className="text-left px-3 py-2 font-medium text-slate-600">Phone</th>
                            <th className="text-left px-3 py-2 font-medium text-slate-600">Role</th>
                            <th className="text-left px-3 py-2 font-medium text-slate-600">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {active.map((m) => (
                            <tr key={m.id}>
                              <td className="px-3 py-2 font-medium text-slate-800">{m.name || '—'}</td>
                              <td className="px-3 py-2 text-slate-600">{m.phone || '—'}</td>
                              <td className="px-3 py-2 text-slate-600">{m.role || '—'}</td>
                              <td className="px-3 py-2 space-x-2">
                                <button type="button" onClick={() => { setEditCellEditModal(m); setEditCellForm({ name: m.name || '', birthday: m.birthday ? String(m.birthday).slice(0, 10) : '', anniversary: m.anniversary ? String(m.anniversary).slice(0, 10) : '', phone: m.phone || '', locality: m.locality || '', since: m.since ? String(m.since).slice(0, 10) : '' }); }} className="text-blue-600 hover:underline">Edit</button>
                                <button
                                  type="button"
                                  disabled={pendingDeactivateIds.includes(m.id)}
                                  onClick={async () => {
                                    if (pendingDeactivateIds.includes(m.id)) return
                                    try {
                                      await addCellMemberPendingChange({
                                        changeType: 'deactivate',
                                        cellId: effectiveCellId,
                                        cellName: cell?.cellName || '',
                                        memberId: m.id,
                                        memberData: null,
                                        requestedBy: userProfile?.email || userProfile?.displayName || 'Leader',
                                      })
                                      setPendingDeactivateIds((prev) => (prev.includes(m.id) ? prev : [...prev, m.id]))
                                      const list = await getCellGroupMembers(effectiveCellId)
                                      setCellMembers(list)
                                      alert('Deactivation request submitted for approval.')
                                    } catch (e) {
                                      alert(e?.message || 'Failed')
                                    }
                                  }}
                                  className="text-amber-600 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {pendingDeactivateIds.includes(m.id) ? 'Under Review' : 'Deactivate'}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {active.length === 0 && <p className="text-slate-500 text-sm py-2">No active members.</p>}
                  </div>
                  {[
                    { key: 'former', title: 'Former Members', rows: former, emptyLabel: 'No former members.', showTenure: true },
                    { key: 'not_attending', title: 'Inactive Members (Not Attending)', rows: notAttending, emptyLabel: 'No inactive members.', showTenure: false },
                  ].map(({ key, title, rows, emptyLabel, showTenure }) => (
                  <div key={key} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <h3 className="font-semibold text-slate-800 mb-2">{title}</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-slate-600">Name</th>
                            <th className="text-left px-3 py-2 font-medium text-slate-600">Phone</th>
                            <th className="text-left px-3 py-2 font-medium text-slate-600">Role</th>
                            {showTenure && <th className="text-left px-3 py-2 font-medium text-slate-600">Tenure</th>}
                            <th className="text-left px-3 py-2 font-medium text-slate-600">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {rows.map((m) => (
                            <tr key={m.id}>
                              <td className="px-3 py-2 font-medium text-slate-800">{m.name || '—'}</td>
                              <td className="px-3 py-2 text-slate-600">{m.phone || '—'}</td>
                              <td className="px-3 py-2 text-slate-600">{m.role || '—'}</td>
                              {showTenure && (
                                <td className="px-3 py-2 text-slate-600">{calcTenureLabel(m.since, m.leftDate) || '—'}</td>
                              )}
                              <td className="px-3 py-2">
                                <button type="button" onClick={async () => { try { await addCellMemberPendingChange({ changeType: 'activate', cellId: effectiveCellId, cellName: cell?.cellName || '', memberId: m.id, memberData: null, requestedBy: userProfile?.email || userProfile?.displayName || 'Leader' }); const list = await getCellGroupMembers(effectiveCellId); setCellMembers(list); alert('Reactivate submitted for approval.'); } catch (e) { alert(e?.message || 'Failed'); } }} className="text-emerald-600 hover:underline">Reactivate</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {rows.length === 0 && <p className="text-slate-500 text-sm py-2">{emptyLabel}</p>}
                  </div>
                  ))}
                  {editCellEditModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-4 border-b border-slate-200">
                          <h3 className="font-semibold text-slate-800">Edit Member (pending approval)</h3>
                        </div>
                        <form
                          onSubmit={async (e) => {
                            e.preventDefault()
                            try {
                              await addCellMemberPendingChange({
                                changeType: 'edit',
                                cellId: effectiveCellId,
                                cellName: cell?.cellName || '',
                                memberId: editCellEditModal.id,
                                memberData: { ...editCellEditModal, name: editCellForm.name.trim(), birthday: editCellForm.birthday || '', anniversary: editCellForm.anniversary || '', phone: editCellForm.phone || '', locality: editCellForm.locality || '', since: editCellForm.since || '', status: editCellEditModal.status },
                                changeSummary: 'Name, Birthday, Anniversary, Phone, Locality, First Sunday',
                                requestedBy: userProfile?.email || userProfile?.displayName || 'Leader',
                              })
                              setEditCellEditModal(null)
                              const list = await getCellGroupMembers(effectiveCellId)
                              setCellMembers(list)
                              alert('Changes submitted for approval.')
                            } catch (err) {
                              alert(err?.message || 'Failed')
                            }
                          }}
                          className="p-4 space-y-3"
                        >
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
                            <input type="text" value={editCellForm.name} onChange={(e) => setEditCellForm((f) => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" required />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Birthday</label>
                            <input type="date" value={editCellForm.birthday} onChange={(e) => setEditCellForm((f) => ({ ...f, birthday: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Anniversary</label>
                            <input type="date" value={editCellForm.anniversary} onChange={(e) => setEditCellForm((f) => ({ ...f, anniversary: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                            <input type="tel" inputMode="numeric" value={editCellForm.phone} onChange={(e) => setEditCellForm((f) => ({ ...f, phone: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Locality</label>
                            <input type="text" value={editCellForm.locality} onChange={(e) => setEditCellForm((f) => ({ ...f, locality: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">First Sunday</label>
                            <input type="date" value={editCellForm.since} onChange={(e) => setEditCellForm((f) => ({ ...f, since: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" title="First Sunday the person started attending the church" />
                          </div>
                          <div className="flex gap-2 pt-2">
                            <button type="submit" className="px-4 min-h-[44px] py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-medium transition-colors">Submit for approval</button>
                            <button type="button" onClick={() => setEditCellEditModal(null)} className="px-4 min-h-[44px] py-2 rounded-lg border border-slate-300 text-slate-700 text-sm hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 transition-colors">Cancel</button>
                          </div>
                        </form>
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {leaderAddMemberOpen && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
                  <div className="p-4 border-b border-slate-200">
                    <h3 className="font-semibold text-slate-800">Add member (requires approval)</h3>
                  </div>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault()
                      if (!canEditCurrentReport) return
                      const name = (leaderAddMemberForm.name || '').trim()
                      if (!name || !myCellId) return
                      try {
                        await addCellMemberPendingChange({
                          changeType: 'add',
                          cellId: myCellId,
                          cellName: cell?.cellName || '',
                          memberId: null,
                          memberData: { name: leaderAddMemberForm.name, birthday: leaderAddMemberForm.birthday, anniversary: leaderAddMemberForm.anniversary, phone: leaderAddMemberForm.phone, locality: leaderAddMemberForm.locality, since: leaderAddMemberForm.since, status: leaderAddMemberForm.status || 'active' },
                          requestedBy: userProfile?.email || userProfile?.displayName || 'Leader',
                        })
                        setLeaderAddMemberOpen(false)
                        setLeaderAddMemberForm({ name: '', birthday: '', anniversary: '', phone: '', locality: '', since: '', status: 'active' })
                        alert('Add member submitted for approval.')
                      } catch (err) {
                        alert('Failed')
                      }
                    }}
                    className="p-4 space-y-3"
                  >
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
                      <input type="text" value={leaderAddMemberForm.name} onChange={(e) => setLeaderAddMemberForm((f) => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" required />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Birthday</label>
                        <input type="date" value={leaderAddMemberForm.birthday} onChange={(e) => setLeaderAddMemberForm((f) => ({ ...f, birthday: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Anniversary</label>
                        <input type="date" value={leaderAddMemberForm.anniversary} onChange={(e) => setLeaderAddMemberForm((f) => ({ ...f, anniversary: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                      <input type="text" value={leaderAddMemberForm.phone} onChange={(e) => setLeaderAddMemberForm((f) => ({ ...f, phone: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Locality</label>
                      <input type="text" value={leaderAddMemberForm.locality} onChange={(e) => setLeaderAddMemberForm((f) => ({ ...f, locality: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Since</label>
                      <input type="date" value={leaderAddMemberForm.since} onChange={(e) => setLeaderAddMemberForm((f) => ({ ...f, since: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                      <select value={leaderAddMemberForm.status} onChange={(e) => setLeaderAddMemberForm((f) => ({ ...f, status: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300">
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button type="submit" className="px-4 min-h-[44px] py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-medium transition-colors">Submit for approval</button>
                      <button type="button" onClick={() => setLeaderAddMemberOpen(false)} className="px-4 min-h-[44px] py-2 rounded-lg border border-slate-300 text-slate-700 text-sm hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 transition-colors">Cancel</button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {leaderEditMember && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
                  <div className="p-4 border-b border-slate-200">
                    <h3 className="font-semibold text-slate-800">Member details (changes require approval)</h3>
                  </div>
                  <form onSubmit={async (e) => { e.preventDefault(); if (!canEditCurrentReport) return; try { await addCellMemberPendingChange({ changeType: 'edit', cellId: myCellId, cellName: cell?.cellName || '', memberId: leaderEditMember.id, memberData: leaderEditForm, requestedBy: userProfile?.email || userProfile?.displayName || 'Leader' }); setLeaderEditMember(null); alert('Save submitted for approval.'); } catch (err) { alert('Failed'); } }} className="p-4 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
                      <input type="text" value={leaderEditForm.name} onChange={(e) => setLeaderEditForm((f) => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" required />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Birthday</label>
                        <input type="date" value={leaderEditForm.birthday} onChange={(e) => setLeaderEditForm((f) => ({ ...f, birthday: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Anniversary</label>
                        <input type="date" value={leaderEditForm.anniversary} onChange={(e) => setLeaderEditForm((f) => ({ ...f, anniversary: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                      <input type="text" value={leaderEditForm.phone} onChange={(e) => setLeaderEditForm((f) => ({ ...f, phone: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Locality</label>
                      <input type="text" value={leaderEditForm.locality} onChange={(e) => setLeaderEditForm((f) => ({ ...f, locality: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Since</label>
                      <input type="date" value={leaderEditForm.since} onChange={(e) => setLeaderEditForm((f) => ({ ...f, since: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                      <select value={leaderEditForm.status} onChange={(e) => setLeaderEditForm((f) => ({ ...f, status: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300">
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2">
                      <button type="submit" className="px-4 min-h-[44px] py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-medium transition-colors">Save Changes</button>
                      <button type="button" onClick={async () => { if (!canEditCurrentReport) return; try { await addCellMemberPendingChange({ changeType: 'deactivate', cellId: myCellId, cellName: cell?.cellName || '', memberId: leaderEditMember.id, memberData: null, requestedBy: userProfile?.email || userProfile?.displayName || 'Leader' }); setLeaderEditMember(null); alert('Make Inactive submitted for approval.'); } catch (e) { alert('Failed'); } }} className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium">Make Inactive</button>
                      <button type="button" onClick={async () => { if (!canEditCurrentReport) return; if (!window.confirm('Request to delete this member?')) return; try { await addCellMemberPendingChange({ changeType: 'delete', cellId: myCellId, cellName: cell?.cellName || '', memberId: leaderEditMember.id, memberData: null, requestedBy: userProfile?.email || userProfile?.displayName || 'Leader' }); setLeaderEditMember(null); alert('Delete submitted for approval.'); } catch (e) { alert('Failed'); } }} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium">Delete Member</button>
                      <button type="button" onClick={() => setLeaderEditMember(null)} className="px-4 min-h-[44px] py-2 rounded-lg border border-slate-300 text-slate-700 text-sm hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 transition-colors">Cancel</button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      </div>

    {/* ── Manual time entry / edit modal (shared by leader + director views) ── */}
    {manualTimeModal && (
      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        onClick={() => setManualTimeModal(null)}
      >
        <div
          className="bg-white rounded-xl shadow-xl w-full max-w-xs p-5"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="font-semibold text-slate-800 mb-4">
            {manualTimeModal.mode === 'edit' ? 'Edit recorded time' : 'Add missed entry'}
          </h3>
          {manualTimeModal.mode === 'edit' ? (
            <p className="text-sm text-slate-500 mb-3">{manualTimeModal.programName}</p>
          ) : (
            <div className="mb-3">
              <label className="block text-sm font-medium text-slate-700 mb-1">Program name</label>
              <input
                type="text"
                value={manualTimeModal.programName}
                onChange={(e) => setManualTimeModal((m) => ({ ...m, programName: e.target.value }))}
                placeholder="e.g. Worship"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
          )}
          <label className="block text-sm font-medium text-slate-700 mb-1">Start time</label>
          <input
            type="time"
            value={manualTimeModal.timeStr}
            onChange={(e) => setManualTimeModal((m) => ({ ...m, timeStr: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-lg font-mono mb-5"
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={async () => {
                const [hh, mm] = (manualTimeModal.timeStr || '00:00').split(':').map(Number)
                const dt = new Date(manualTimeModal.reportDate + 'T00:00:00')
                dt.setHours(hh, mm, 0, 0)
                try {
                  if (manualTimeModal.mode === 'edit') {
                    await updateProgramLog(manualTimeModal.logId, { startTime: dt })
                  } else {
                    await addProgramLog({
                      cellName: cell?.cellName || '',
                      programName: manualTimeModal.programName,
                      startTime: dt,
                      reportDate: manualTimeModal.reportDate,
                    })
                  }
                  const logs = await getProgramLogsByCellAndDate(cell?.cellName || '', manualTimeModal.reportDate)
                  setProgramLogs(logs)
                  setManualTimeModal(null)
                } catch (e) {
                  alert(e?.message || 'Failed to save')
                }
              }}
              className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setManualTimeModal(null)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── D-Light visitor registration modal ── */}
    {proposalModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
          <h3 className="font-semibold text-slate-800 mb-1">Register in D-Light</h3>
          <p className="text-sm text-slate-500 mb-4">This sends a proposal to the D-Light team. They will review and add the visitor to the directory.</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Name</label>
              <input
                type="text"
                value={proposalModal.name}
                readOnly
                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Phone (optional)</label>
              <input
                type="tel"
                value={proposalPhone}
                onChange={(e) => setProposalPhone(e.target.value)}
                placeholder="e.g. 9876543210"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-5">
            <button
              type="button"
              disabled={proposalSubmitting}
              onClick={async () => {
                setProposalSubmitting(true)
                try {
                  const cellName = cellGroups.find((g) => g.id === effectiveCellId)?.cellName || ''
                  await createCellVisitorProposal({
                    visitorName: proposalModal.name,
                    phone:       proposalPhone.trim(),
                    cellId:      effectiveCellId || '',
                    cellName,
                    reportId:    proposalModal.reportId,
                    reportDate:  proposalModal.reportDate || '',
                    sentBy:      userProfile?.email || '',
                    sentByName:  userProfile?.displayName || userProfile?.name || '',
                  })
                  setProposedVisitorNames((prev) => new Set([...prev, proposalModal.name]))
                  setProposalModal(null)
                } catch (e) {
                  console.error('Visitor proposal error', e)
                  alert('Failed to send proposal. Please try again.')
                } finally {
                  setProposalSubmitting(false)
                }
              }}
              className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
            >
              {proposalSubmitting ? 'Sending…' : 'Send to D-Light'}
            </button>
            <button
              type="button"
              onClick={() => setProposalModal(null)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}
  </div>
  )
}
