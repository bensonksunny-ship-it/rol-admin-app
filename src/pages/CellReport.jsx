import { useEffect, useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { format, startOfWeek, parseISO } from 'date-fns'
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
  getProgramLogsByCellAndDate,
  getLatestCellReports,
  updateUser,
  getCellMemberPendingChanges,
} from '../services/firestore'
import { ROLES } from '../constants/roles'
import { getDepartmentRole } from '../utils/access'
import { canEditCellReport } from '../utils/cellReportPermissions'
import DepartmentTabBar from '../components/DepartmentTabBar'

const CELL_DEPARTMENT = 'Cell'
const TILES_PER_ROW = 3
const MAX_TILE_ROWS = 6
const MAX_VISIBLE_TILES = TILES_PER_ROW * MAX_TILE_ROWS

/** Tabs when user may edit this cell’s report (attendance, timer, program, member requests). */
const CELL_REPORT_TABS_ALL = [
  { key: 'attendance', label: 'Attendance' },
  { key: 'timer', label: 'Timer' },
  { key: 'backToBible', label: 'Back to Bible' },
  { key: 'setDefaultProgram', label: 'Set Default Program' },
  { key: 'editCell', label: 'Edit Cell' },
]

/** View-only tabs (e.g. Cell Leader read-only edge case). */
const CELL_REPORT_TABS_VIEW_ONLY = [
  { key: 'attendance', label: 'Attendance' },
  { key: 'backToBible', label: 'Back to Bible' },
]

/** Cell Director viewing a cell they cannot edit: summary only (no member names). */
const CELL_REPORT_TABS_DIRECTOR_SUMMARY = [
  { key: 'summary', label: 'Report summary' },
  { key: 'backToBible', label: 'Back to Bible' },
]

const TILE_COLORS = [
  { bg: 'bg-blue-500', hover: 'hover:bg-blue-600', light: 'bg-blue-50', border: 'border-blue-200' },
  { bg: 'bg-emerald-500', hover: 'hover:bg-emerald-600', light: 'bg-emerald-50', border: 'border-emerald-200' },
  { bg: 'bg-amber-500', hover: 'hover:bg-amber-600', light: 'bg-amber-50', border: 'border-amber-200' },
  { bg: 'bg-violet-500', hover: 'hover:bg-violet-600', light: 'bg-violet-50', border: 'border-violet-200' },
  { bg: 'bg-rose-500', hover: 'hover:bg-rose-600', light: 'bg-rose-50', border: 'border-rose-200' },
  { bg: 'bg-teal-500', hover: 'hover:bg-teal-600', light: 'bg-teal-50', border: 'border-teal-200' },
]

/** Weekly report bands (director overview). */
const WEEK_BAND_COLORS = [
  { bg: 'bg-violet-50', border: 'border-violet-200', head: 'text-violet-900' },
  { bg: 'bg-sky-50', border: 'border-sky-200', head: 'text-sky-900' },
  { bg: 'bg-amber-50', border: 'border-amber-200', head: 'text-amber-900' },
  { bg: 'bg-emerald-50', border: 'border-emerald-200', head: 'text-emerald-900' },
  { bg: 'bg-rose-50', border: 'border-rose-200', head: 'text-rose-900' },
  { bg: 'bg-indigo-50', border: 'border-indigo-200', head: 'text-indigo-900' },
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

export default function CellReport() {
  const { userProfile, user: authUser } = useAuth()
  const [cellGroups, setCellGroups] = useState([])
  const [selectedCellId, setSelectedCellId] = useState(null)
  const [reportDate, setReportDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [report, setReport] = useState(null)
  const [attendees, setAttendees] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [memberForm, setMemberForm] = useState({ name: '', birthday: '', anniversary: '', phone: '', locality: '' })
  const [editForm, setEditForm] = useState(null)
  const [leaderTab, setLeaderTab] = useState('attendance')
  const [cellMembers, setCellMembers] = useState([])
  const [loadingCellMembers, setLoadingCellMembers] = useState(false)
  const [backToBible, setBackToBible] = useState(null)
  const [leaderEditMember, setLeaderEditMember] = useState(null)
  const [leaderEditForm, setLeaderEditForm] = useState({ name: '', birthday: '', anniversary: '', phone: '', locality: '', since: '', status: 'active' })
  const [programItems, setProgramItems] = useState([])
  const [programLogs, setProgramLogs] = useState([])
  const [programForm, setProgramForm] = useState({ programName: '', order: 0 })
  const [editingProgramId, setEditingProgramId] = useState(null)
  const [latestCellReports, setLatestCellReports] = useState([])
  const [latestReportLogs, setLatestReportLogs] = useState({})
  const [visitorInput, setVisitorInput] = useState('')
  const [childInput, setChildInput] = useState('')
  const [leaderAddMemberOpen, setLeaderAddMemberOpen] = useState(false)
  const [leaderAddMemberForm, setLeaderAddMemberForm] = useState({ name: '', birthday: '', anniversary: '', phone: '', locality: '', since: '', status: 'active' })
  const [editCellSearch, setEditCellSearch] = useState('')
  const [editCellSortAsc, setEditCellSortAsc] = useState(true)
  const [editCellEditModal, setEditCellEditModal] = useState(null)
  const [editCellForm, setEditCellForm] = useState({ name: '', birthday: '', anniversary: '', phone: '', locality: '', since: '' })
  const [editCellAddMemberOpen, setEditCellAddMemberOpen] = useState(false)
  const [editCellAddMemberForm, setEditCellAddMemberForm] = useState({ name: '', birthday: '', anniversary: '', phone: '', locality: '', since: '' })
  const [pendingDeactivateIds, setPendingDeactivateIds] = useState([])
  const [tileAttendanceMap, setTileAttendanceMap] = useState({})

  const cellRole = useMemo(() => getDepartmentRole(userProfile, CELL_DEPARTMENT), [userProfile])
  const isCellDirector = cellRole === 'DIRECTOR'
  const isFullAccess = userProfile?.globalRole === 'FOUNDER' || userProfile?.role === ROLES.FOUNDER
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
    const name = (userProfile?.displayName || userProfile?.name || userProfile?.email || '').trim()
    if (!name || !cellGroups.length) return null
    const match = cellGroups.find(
      (g) => (g.leader || '').trim() === name || (g.leader || '').toLowerCase().includes(name.toLowerCase())
    )
    return match?.id || null
  }, [
    userProfile?.cellGroupId,
    userProfile?.cellId,
    userProfile?.displayName,
    userProfile?.name,
    userProfile?.email,
    cellGroups,
  ])

  const effectiveCellId = canViewAllCells ? selectedCellId : myCellId

  const canEditReportForCell = useCallback(
    (cellId) => {
      const g = cellGroups.find((x) => x.id === cellId)
      return canEditCellReport(userProfile, cellId, g || null)
    },
    [userProfile, cellGroups]
  )

  const canEditCurrentReport = Boolean(effectiveCellId && canEditReportForCell(effectiveCellId))
  const canEditSelectedCellReport = Boolean(selectedCellId && canEditReportForCell(selectedCellId))

  const cell = useMemo(() => cellGroups.find((g) => g.id === effectiveCellId) || null, [cellGroups, effectiveCellId])
  const activeCellGroups = useMemo(() => cellGroups.filter((c) => c.status !== 'inactive'), [cellGroups])
  const visibleTiles = useMemo(() => activeCellGroups.slice(0, MAX_VISIBLE_TILES), [activeCellGroups])
  const isLeaderView = !canViewAllCells && myCellId
  const isDirectorView = canViewAllCells

  const cellReportsByWeek = useMemo(() => {
    const weekMap = new Map()
    for (const r of latestCellReports) {
      const wk = weekStartKey(r.reportDate)
      if (!weekMap.has(wk)) weekMap.set(wk, [])
      weekMap.get(wk).push(r)
    }
    const entries = [...weekMap.entries()].sort((a, b) => b[0].localeCompare(a[0]))
    return entries.map(([weekStart, rows]) => ({
      weekStart,
      rows: [...rows].sort((a, b) => (b.reportDate || '').localeCompare(a.reportDate || '')),
    }))
  }, [latestCellReports])

  useEffect(() => {
    getCellGroups(CELL_DEPARTMENT)
      .then(setCellGroups)
      .catch(() => setCellGroups([]))
  }, [])

  // So Firestore rules allow create: set user cellId when we detect leader by name
  useEffect(() => {
    if (authUser?.uid && myCellId && !userProfile?.cellId) {
      updateUser(authUser.uid, { cellId: myCellId }).catch(() => {})
    }
  }, [authUser?.uid, myCellId, userProfile?.cellId])

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
    setLoading(true)
    Promise.all([
      getCellReportByCellAndDate(effectiveCellId, reportDate),
      getCellGroup(effectiveCellId),
    ])
      .then(([r, c]) => {
        if (r) {
          setReport(r)
          return getCellReportAttendees(r.id).then(setAttendees)
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
            setReport({ id, ...newReport, visitorsList: [], childrenList: [], createdBy: userProfile?.email })
            setAttendees([])
          })
        }
      })
      .catch(() => {
        setReport(null)
        setAttendees([])
      })
      .finally(() => setLoading(false))
  }, [effectiveCellId, reportDate, userProfile, cellGroups])

  useEffect(() => {
    if (!effectiveCellId) return
    const dirSummaryOtherCell =
      isDirectorView && selectedCellId && !canEditReportForCell(selectedCellId)
    if (dirSummaryOtherCell) {
      setCellMembers([])
      setLoadingCellMembers(false)
      return
    }
    setLoadingCellMembers(true)
    getCellGroupMembers(effectiveCellId)
      .then(setCellMembers)
      .catch(() => setCellMembers([]))
      .finally(() => setLoadingCellMembers(false))
  }, [effectiveCellId, isDirectorView, selectedCellId, canEditReportForCell])

  useEffect(() => {
    if (!isDirectorView || !reportDate) {
      setTileAttendanceMap({})
      return
    }
    const tiles = activeCellGroups.filter((c) => c.status !== 'inactive').slice(0, MAX_VISIBLE_TILES)
    if (tiles.length === 0) {
      setTileAttendanceMap({})
      return
    }
    let cancelled = false
    Promise.all(
      tiles.map((c) =>
        getCellReportByCellAndDate(c.id, reportDate).then((r) => [c.id, totalAttendanceFromReport(r)])
      )
    )
      .then((pairs) => {
        if (!cancelled) setTileAttendanceMap(Object.fromEntries(pairs))
      })
      .catch(() => {
        if (!cancelled) setTileAttendanceMap({})
      })
    return () => {
      cancelled = true
    }
  }, [isDirectorView, reportDate, activeCellGroups])

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
    const allowed = new Set(['summary', 'backToBible'])
    if (!allowed.has(leaderTab)) setLeaderTab('summary')
  }, [isDirectorView, selectedCellId, canEditSelectedCellReport, leaderTab])

  useEffect(() => {
    if (!isLeaderView || canEditCurrentReport) return
    const allowed = new Set(['attendance', 'backToBible'])
    if (!allowed.has(leaderTab)) setLeaderTab('attendance')
  }, [isLeaderView, canEditCurrentReport, leaderTab])

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
    setSaving(false)
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
    const inactiveMembers = (cellMembers || []).filter((m) => m.status === 'inactive')
    const isAttended = (memberId) => attendees.some((a) => a.memberId === memberId)
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <label className="text-sm font-medium text-slate-700">Report Date:</label>
          <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300" />
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
          <p className="text-xs text-slate-400">Click a member name below to mark attended; click again to remove.</p>
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
            <button type="button" onClick={() => { const n = visitorInput.trim(); if (n) { handleAddVisitor(n); setVisitorInput(''); } }} className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm">Add visitor</button>
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
            <button type="button" onClick={() => { const n = childInput.trim(); if (n) { handleAddChild(n); setChildInput(''); } }} className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm">Add child</button>
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
          <h3 className="font-semibold text-slate-800 mb-2">Inactive Members</h3>
          <p className="text-xs text-slate-500 mb-2">Visible but not selectable for attendance.</p>
          <ul className="text-sm text-slate-500 divide-y divide-slate-100">
            {inactiveMembers.length === 0 ? <li className="py-2">No inactive members.</li> : inactiveMembers.map((m) => <li key={m.id} className="py-1">{m.name || '—'}</li>)}
          </ul>
        </div>
      </div>
    )
  }

  return (
    <div>
      <DepartmentTabBar slug="cell" activeTab="cellReport" />
      <div className="space-y-6 p-4">
      {isDirectorView && (
        <>
          <div className="flex flex-wrap items-center gap-4">
            <label className="text-sm font-medium text-slate-700">Report Date:</label>
            <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300" />
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <h2 className="font-semibold text-slate-800 mb-3">Weekly reports</h2>
            <p className="text-xs text-slate-500 mb-4">Grouped by week. Totals are members + visitors + children. Duration is from first to last program time logged.</p>
            {latestCellReports.length === 0 ? (
              <p className="text-sm text-slate-500">No reports yet.</p>
            ) : (
              <div className="space-y-4">
                {cellReportsByWeek.map((block, bi) => {
                  const palette = WEEK_BAND_COLORS[bi % WEEK_BAND_COLORS.length]
                  return (
                    <div key={block.weekStart} className={`rounded-xl border ${palette.border} ${palette.bg} p-4`}>
                      <h3 className={`text-sm font-semibold mb-3 ${palette.head}`}>
                        Week of {block.weekStart}
                      </h3>
                      <div className="overflow-x-auto bg-white/60 rounded-lg border border-slate-200/80">
                        <table className="min-w-full text-sm">
                          <thead className="bg-slate-50/90">
                            <tr>
                              <th className="text-left px-3 py-2 font-medium text-slate-600">Cell</th>
                              <th className="text-left px-3 py-2 font-medium text-slate-600">Date</th>
                              <th className="text-left px-3 py-2 font-medium text-slate-600">Total attendance</th>
                              <th className="text-left px-3 py-2 font-medium text-slate-600">Meeting duration</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {block.rows.map((r) => {
                              const dur = meetingDurationMinutesFromLogs(latestReportLogs[r.id] || [])
                              return (
                                <tr key={r.id} className="hover:bg-white/80">
                                  <td className="px-3 py-2 text-slate-800 font-medium">{r.cellName || '—'}</td>
                                  <td className="px-3 py-2 text-slate-600">{r.reportDate || '—'}</td>
                                  <td className="px-3 py-2 text-slate-800 font-semibold">{totalAttendanceFromReport(r)}</td>
                                  <td className="px-3 py-2 text-slate-600">{formatDurationMinutes(dur)}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1">
              <div className="grid grid-cols-3 gap-3" style={{ maxWidth: 'min(100%, 420px)' }}>
                {visibleTiles.map((c, idx) => {
                  const colors = TILE_COLORS[idx % TILE_COLORS.length]
                  const isExpanded = selectedCellId === c.id
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedCellId(isExpanded ? null : c.id)}
                      className={`${colors.bg} ${colors.hover} text-white rounded-xl p-4 text-left shadow-md transition flex flex-col justify-center ${
                        isExpanded ? 'ring-2 ring-offset-2 ring-slate-400' : ''
                      }`}
                      style={{ width: '3in', minWidth: '3in', height: '6in', minHeight: '6in', maxHeight: '6in' }}
                    >
                      <span className="font-semibold text-sm leading-tight">{c.cellName || 'Unnamed'}</span>
                      <span className="text-white/90 text-xs mt-1">Leader: {c.leader || '—'}</span>
                      <span className="text-white/90 text-xs">Day: {c.meetingDay || '—'}</span>
                      <span className="text-white/90 text-xs mt-1.5">Members: {c.memberCount ?? 0}</span>
                      <span className="text-white text-2xl font-extrabold mt-auto pt-3 leading-tight">
                        {tileAttendanceMap[c.id] != null ? tileAttendanceMap[c.id] : '—'}
                      </span>
                      <span className="text-white/95 text-[10px] font-semibold uppercase tracking-wide">Total attendance</span>
                    </button>
                  )
                })}
              </div>
              {visibleTiles.length === 0 && <p className="text-slate-500 text-sm">No cell groups yet.</p>}
            </div>
            <div className="lg:col-span-2">
              {selectedCellId ? (
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 shadow-sm overflow-y-auto max-h-[80vh]">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold text-slate-800">Report: {cell?.cellName || '—'}</h2>
                    <button type="button" onClick={() => setSelectedCellId(null)} className="text-sm text-slate-600 hover:underline">Close</button>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm mb-4">
                    <h3 className="font-semibold text-slate-800 mb-2">Cell Information</h3>
                    <p className="text-slate-700 text-sm"><strong>Cell Name:</strong> {cell?.cellName || '—'}</p>
                    <p className="text-slate-700 text-sm mt-0.5"><strong>Leader:</strong> {cell?.leader || '—'}</p>
                    <p className="text-slate-700 text-sm mt-0.5"><strong>Meeting Day:</strong> {cell?.meetingDay || '—'}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <label className="text-sm font-medium text-slate-700">Report Date:</label>
                      <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300" />
                    </div>
                  </div>
                  <div className="flex border-b border-slate-200 overflow-x-auto mb-4">
                    {(canEditSelectedCellReport ? CELL_REPORT_TABS_ALL : CELL_REPORT_TABS_DIRECTOR_SUMMARY).map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setLeaderTab(key)}
                        className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition ${leaderTab === key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {leaderTab === 'summary' && !canEditSelectedCellReport && (
                    <div className="space-y-4">
                      <p className="text-sm text-slate-600 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2">
                        Summary view: member names and editable lists are hidden. Leaders manage detail in their own cell report.
                      </p>
                      {loading ? (
                        <div className="py-8 text-slate-500">Loading…</div>
                      ) : !report ? (
                        <div className="py-6 text-slate-500">No report for this date.</div>
                      ) : (
                        <>
                          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                            <h3 className="font-semibold text-slate-800 mb-2">Total attendance</h3>
                            <p className="text-4xl font-bold text-slate-900">{totalAttendanceFromReport(report)}</p>
                            <p className="text-xs text-slate-500 mt-2">
                              Members present: {report.membersAttended ?? 0} · Visitors (count): {report.visitors ?? 0} · Children (count): {report.children ?? 0}
                            </p>
                          </div>
                          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                            <h3 className="font-semibold text-slate-800 mb-2">Meeting duration</h3>
                            <p className="text-2xl font-semibold text-slate-800">
                              {formatDurationMinutes(meetingDurationMinutesFromLogs(programLogs))}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">From first to last program start time for this date.</p>
                          </div>
                          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                            <h3 className="font-semibold text-slate-800 mb-2">Program (latest report)</h3>
                            {(programLogs && programLogs.length > 0) ? (
                              <ul className="text-sm text-slate-700 divide-y divide-slate-100">
                                {programLogs.map((log, i) => (
                                  <li key={log.id || i} className="py-1.5 flex justify-between gap-2">
                                    <span className="font-medium text-slate-800">{log.programName || '—'}</span>
                                    <span className="text-slate-600 tabular-nums">
                                      {log.startTime ? format(log.startTime instanceof Date ? log.startTime : new Date(log.startTime), 'HH:mm') : '—'}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-sm text-slate-500">No program times recorded for this meeting.</p>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {leaderTab === 'attendance' && canEditSelectedCellReport && (
                    <div className="space-y-4">
                      {loading ? (
                        <div className="py-8 text-slate-500">Loading…</div>
                      ) : !report ? (
                        <div className="py-6 text-slate-500">
                          {canEditSelectedCellReport
                            ? 'No report for this date. Save attendance after the report is created.'
                            : 'No report for this date.'}
                        </div>
                      ) : (
                        <>
                          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                            <h3 className="font-semibold text-slate-800 mb-2">Active Members</h3>
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-sm">
                                <thead className="bg-slate-50">
                                  <tr>
                                    <th className="text-left px-3 py-2 font-medium text-slate-600 w-10">SL</th>
                                    <th className="text-left px-3 py-2 font-medium text-slate-600">Name</th>
                                    <th className="text-left px-3 py-2 font-medium text-slate-600">Attendance</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {(cellMembers || []).filter((m) => m.status !== 'inactive').map((m, idx) => {
                                    const attended = attendees.some((a) => a.memberId === m.id)
                                    return (
                                      <tr key={m.id}>
                                        <td className="px-3 py-2 text-slate-600">{idx + 1}</td>
                                        <td className="px-3 py-2 font-medium text-slate-800">{m.name || '—'}</td>
                                        <td className="px-3 py-2">
                                          {canEditSelectedCellReport ? (
                                            <button type="button" onClick={() => handleToggleAttendance(m)} className={`px-3 py-1.5 rounded text-sm font-medium min-w-[4.5rem] ${attended ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-emerald-500 text-white hover:bg-emerald-600'}`}>
                                              {attended ? 'Undo' : 'Present'}
                                            </button>
                                          ) : (
                                            <span className={`text-sm font-medium ${attended ? 'text-emerald-700' : 'text-slate-500'}`}>{attended ? 'Attended' : '—'}</span>
                                          )}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                            {(cellMembers || []).filter((m) => m.status !== 'inactive').length === 0 && <p className="text-slate-500 text-sm py-2">No active members.</p>}
                          </div>
                          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                            <h3 className="font-semibold text-slate-800 mb-2">Visitors Attended</h3>
                            {canEditSelectedCellReport ? (
                              <>
                                <div className="flex flex-wrap gap-2 mb-2">
                                  <input type="text" value={visitorInput} onChange={(e) => setVisitorInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const n = visitorInput.trim(); if (n) { handleAddVisitor(n); setVisitorInput(''); } } }} placeholder="Type name and press Enter or click Add" className="px-2 py-1.5 rounded border border-slate-300 min-w-[180px] flex-1" />
                                  <button type="button" onClick={() => { const n = visitorInput.trim(); if (n) { handleAddVisitor(n); setVisitorInput(''); } }} className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm">Add</button>
                                </div>
                                <ul className="text-sm text-slate-700 divide-y divide-slate-100">
                                  {(report.visitorsList || []).length === 0 ? <li className="py-2 text-slate-500">No visitors added.</li> : (report.visitorsList || []).map((name, i) => (
                                    <li key={i} className="py-1.5 flex items-center justify-between gap-2">
                                      <span>{name}</span>
                                      <button type="button" onClick={() => handleRemoveVisitor(i)} className="text-red-600 text-xs hover:underline">Remove</button>
                                    </li>
                                  ))}
                                </ul>
                              </>
                            ) : (
                              <ul className="text-sm text-slate-700 divide-y divide-slate-100">
                                {(report.visitorsList || []).length === 0 ? <li className="py-2 text-slate-500">No visitors.</li> : (report.visitorsList || []).map((name, i) => (
                                  <li key={i} className="py-1.5">{name}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                            <h3 className="font-semibold text-slate-800 mb-2">Children Attended</h3>
                            {canEditSelectedCellReport ? (
                              <>
                                <div className="flex flex-wrap gap-2 mb-2">
                                  <input type="text" value={childInput} onChange={(e) => setChildInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const n = childInput.trim(); if (n) { handleAddChild(n); setChildInput(''); } } }} placeholder="Type name and press Enter or click Add" className="px-2 py-1.5 rounded border border-slate-300 min-w-[180px] flex-1" />
                                  <button type="button" onClick={() => { const n = childInput.trim(); if (n) { handleAddChild(n); setChildInput(''); } }} className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm">Add</button>
                                </div>
                                <ul className="text-sm text-slate-700 divide-y divide-slate-100">
                                  {(report.childrenList || []).length === 0 ? <li className="py-2 text-slate-500">No children added.</li> : (report.childrenList || []).map((name, i) => (
                                    <li key={i} className="py-1.5 flex items-center justify-between gap-2">
                                      <span>{name}</span>
                                      <button type="button" onClick={() => handleRemoveChild(i)} className="text-red-600 text-xs hover:underline">Remove</button>
                                    </li>
                                  ))}
                                </ul>
                              </>
                            ) : (
                              <ul className="text-sm text-slate-700 divide-y divide-slate-100">
                                {(report.childrenList || []).length === 0 ? <li className="py-2 text-slate-500">No children.</li> : (report.childrenList || []).map((name, i) => (
                                  <li key={i} className="py-1.5">{name}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </>
                      )}
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
                      <p className="text-sm text-slate-500">Tap START when each program begins. Times are recorded and cannot be edited.</p>
                      {(() => {
                        const sorted = [...programItems].sort((a, b) => a.order - b.order)
                        const currentItem = sorted[programLogs.length] || null
                        if (sorted.length === 0) return <p className="text-slate-500 py-6">Add program items in <strong>Set Default Program</strong> first.</p>
                        if (!currentItem) {
                          return (
                            <div className="space-y-4">
                              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
                                <p className="font-semibold text-emerald-800">All programs recorded</p>
                                <p className="text-sm text-emerald-700 mt-1">Program timeline appears in the final report.</p>
                              </div>
                              {programLogs.length > 0 && (
                                <div className="bg-slate-50 rounded-xl border-2 border-slate-200 p-4 shadow-sm">
                                  <h3 className="font-semibold text-slate-800 mb-2">Program timeline (read-only)</h3>
                                  <ul className="text-sm text-slate-700 divide-y divide-slate-200">
                                    {programLogs.map((log) => (
                                      <li key={log.id} className="py-1.5">{log.programName || '—'}: {log.startTime ? format(log.startTime instanceof Date ? log.startTime : new Date(log.startTime), 'HH:mm') : '—'}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )
                        }
                        return (
                          <div className="flex flex-col items-center">
                            <button
                              type="button"
                              onClick={async () => {
                                if (!canEditSelectedCellReport) return
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
                            <p className="text-xs text-slate-500 mt-2">Next: {currentItem.programName}</p>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                  {leaderTab === 'setDefaultProgram' && (
                    <div className="space-y-4">
                      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                        <h3 className="font-semibold text-slate-800 mb-2">Default program for this cell</h3>
                        <p className="text-xs text-slate-500 mb-3">Add, edit, delete, or reorder items. This list is used when recording program timing during the meeting.</p>
                        <form onSubmit={async (e) => { e.preventDefault(); if (!canEditSelectedCellReport || !effectiveCellId) return; const name = (programForm.programName || '').trim(); if (!name) return; try { if (editingProgramId) { await updateCellProgramItem(effectiveCellId, editingProgramId, { programName: name, order: programForm.order }); setProgramItems((prev) => prev.map((p) => p.id === editingProgramId ? { ...p, programName: name, order: programForm.order } : p)); setEditingProgramId(null); } else { await addCellProgramItem(effectiveCellId, { programName: name, order: programForm.order }); const list = await getCellProgramItems(effectiveCellId); setProgramItems(list); } setProgramForm({ programName: '', order: programItems.length }); } catch (err) { alert('Failed'); } }} className="flex flex-wrap gap-2 mb-4">
                          <input type="text" placeholder="Program name" value={programForm.programName} onChange={(e) => setProgramForm((f) => ({ ...f, programName: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-300 flex-1 min-w-[120px]" />
                          <input type="number" min="0" placeholder="Order" value={programForm.order} onChange={(e) => setProgramForm((f) => ({ ...f, order: Number(e.target.value) || 0 }))} className="w-16 px-2 py-2 rounded-lg border border-slate-300" />
                          <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium">{editingProgramId ? 'Update' : 'Add'}</button>
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
                                <button type="button" onClick={() => { if (!canEditSelectedCellReport) return; setEditingProgramId(item.id); setProgramForm({ programName: item.programName, order: item.order }); }} className="text-blue-600 text-sm hover:underline">Edit</button>
                                <button type="button" onClick={async () => { if (!canEditSelectedCellReport) return; if (!window.confirm('Remove this item?')) return; await deleteCellProgramItem(effectiveCellId, item.id); setProgramItems((p) => p.filter((x) => x.id !== item.id)); }} className="text-red-600 text-sm hover:underline">Delete</button>
                                {prevItem && <button type="button" onClick={async () => { if (!canEditSelectedCellReport) return; await updateCellProgramItem(effectiveCellId, item.id, { order: prevItem.order }); await updateCellProgramItem(effectiveCellId, prevItem.id, { order: item.order }); const list = await getCellProgramItems(effectiveCellId); setProgramItems(list); }} className="text-slate-600 text-xs px-1">↑</button>}
                                {nextItem && <button type="button" onClick={async () => { if (!canEditSelectedCellReport) return; await updateCellProgramItem(effectiveCellId, item.id, { order: nextItem.order }); await updateCellProgramItem(effectiveCellId, nextItem.id, { order: item.order }); const list = await getCellProgramItems(effectiveCellId); setProgramItems(list); }} className="text-slate-600 text-xs px-1">↓</button>}
                              </li>
                            )
                          })}
                        </ul>
                        {programItems.length === 0 && <p className="text-slate-500 text-sm py-2">No program items. Add items above (e.g. Opening Prayer, Worship, Back to the Bible, Sharing, Prayer).</p>}
                      </div>
                    </div>
                  )}
                  {leaderTab === 'editCell' && (() => {
                    const all = cellMembers || []
                    const q = (editCellSearch || '').toLowerCase().trim()
                    const filtered = q ? all.filter((m) => (m.name || '').toLowerCase().includes(q) || (m.phone || '').includes(q) || (m.role || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q)) : all
                    const sorted = [...filtered].sort((a, b) => { const na = (a.name || '').toLowerCase(); const nb = (b.name || '').toLowerCase(); return editCellSortAsc ? na.localeCompare(nb) : nb.localeCompare(na) })
                    const active = sorted.filter((m) => m.status !== 'inactive')
                    const inactive = sorted.filter((m) => m.status === 'inactive')
                    return (
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <input type="text" value={editCellSearch} onChange={(e) => setEditCellSearch(e.target.value)} placeholder="Search member" className="px-3 py-2 rounded-lg border border-slate-300 min-w-[180px]" />
                          <button type="button" onClick={() => setEditCellSortAsc((v) => !v)} className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700">Sort by name {editCellSortAsc ? 'A→Z' : 'Z→A'}</button>
                          <button type="button" onClick={() => { setEditCellAddMemberOpen(true); setEditCellAddMemberForm({ name: '', birthday: '', anniversary: '', phone: '', locality: '', since: '' }); }} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium">Add Member</button>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                          <h3 className="font-semibold text-slate-800 mb-2">Active Members</h3>
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                              <thead className="bg-slate-50"><tr><th className="text-left px-3 py-2 font-medium text-slate-600">Name</th><th className="text-left px-3 py-2 font-medium text-slate-600">Phone</th><th className="text-left px-3 py-2 font-medium text-slate-600">Role</th><th className="text-left px-3 py-2 font-medium text-slate-600">Actions</th></tr></thead>
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
                        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                          <h3 className="font-semibold text-slate-800 mb-2">Inactive Members</h3>
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                              <thead className="bg-slate-50"><tr><th className="text-left px-3 py-2 font-medium text-slate-600">Name</th><th className="text-left px-3 py-2 font-medium text-slate-600">Phone</th><th className="text-left px-3 py-2 font-medium text-slate-600">Role</th><th className="text-left px-3 py-2 font-medium text-slate-600">Actions</th></tr></thead>
                              <tbody className="divide-y divide-slate-100">
                                {inactive.map((m) => (
                                  <tr key={m.id}>
                                    <td className="px-3 py-2 font-medium text-slate-800">{m.name || '—'}</td>
                                    <td className="px-3 py-2 text-slate-600">{m.phone || '—'}</td>
                                    <td className="px-3 py-2 text-slate-600">{m.role || '—'}</td>
                                    <td className="px-3 py-2">
                                      <button type="button" onClick={async () => { try { await addCellMemberPendingChange({ changeType: 'activate', cellId: effectiveCellId, cellName: cell?.cellName || '', memberId: m.id, memberData: null, requestedBy: userProfile?.email || userProfile?.displayName || 'Leader' }); const list = await getCellGroupMembers(effectiveCellId); setCellMembers(list); alert('Reactivate submitted for approval.'); } catch (e) { alert(e?.message || 'Failed'); } }} className="text-emerald-600 hover:underline">Reactivate</button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {inactive.length === 0 && <p className="text-slate-500 text-sm py-2">No inactive members.</p>}
                        </div>
                        {editCellEditModal && (
                          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                            <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                              <div className="p-4 border-b border-slate-200"><h3 className="font-semibold text-slate-800">Edit Member (pending approval)</h3></div>
                              <form onSubmit={async (e) => { e.preventDefault(); try { await addCellMemberPendingChange({ changeType: 'edit', cellId: effectiveCellId, cellName: cell?.cellName || '', memberId: editCellEditModal.id, memberData: { ...editCellEditModal, name: editCellForm.name.trim(), birthday: editCellForm.birthday || '', anniversary: editCellForm.anniversary || '', phone: editCellForm.phone || '', locality: editCellForm.locality || '', since: editCellForm.since || '', status: editCellEditModal.status }, changeSummary: 'Name, Birthday, Anniversary, Phone, Locality, First Sunday', requestedBy: userProfile?.email || userProfile?.displayName || 'Leader' }); setEditCellEditModal(null); const list = await getCellGroupMembers(effectiveCellId); setCellMembers(list); alert('Changes submitted for approval.'); } catch (err) { alert(err?.message || 'Failed'); } }} className="p-4 space-y-3">
                                <div><label className="block text-sm font-medium text-slate-700 mb-1">Name *</label><input type="text" value={editCellForm.name} onChange={(e) => setEditCellForm((f) => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" required /></div>
                                <div><label className="block text-sm font-medium text-slate-700 mb-1">Birthday</label><input type="date" value={editCellForm.birthday} onChange={(e) => setEditCellForm((f) => ({ ...f, birthday: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" /></div>
                                <div><label className="block text-sm font-medium text-slate-700 mb-1">Anniversary</label><input type="date" value={editCellForm.anniversary} onChange={(e) => setEditCellForm((f) => ({ ...f, anniversary: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" /></div>
                                <div><label className="block text-sm font-medium text-slate-700 mb-1">Phone</label><input type="tel" inputMode="numeric" value={editCellForm.phone} onChange={(e) => setEditCellForm((f) => ({ ...f, phone: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" /></div>
                                <div><label className="block text-sm font-medium text-slate-700 mb-1">Locality</label><input type="text" value={editCellForm.locality} onChange={(e) => setEditCellForm((f) => ({ ...f, locality: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" /></div>
                                <div><label className="block text-sm font-medium text-slate-700 mb-1">First Sunday</label><input type="date" value={editCellForm.since} onChange={(e) => setEditCellForm((f) => ({ ...f, since: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" title="First Sunday the person started attending" /></div>
                                <div className="flex gap-2 pt-2"><button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium">Submit for approval</button><button type="button" onClick={() => setEditCellEditModal(null)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm">Cancel</button></div>
                              </form>
                            </div>
                          </div>
                        )}
                        {editCellAddMemberOpen && (
                          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                            <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                              <div className="p-4 border-b border-slate-200"><h3 className="font-semibold text-slate-800">Add Member (pending approval)</h3></div>
                              <form onSubmit={async (e) => { e.preventDefault(); try { await addCellMemberPendingChange({ changeType: 'add', cellId: effectiveCellId, cellName: cell?.cellName || '', memberData: { name: editCellAddMemberForm.name.trim(), birthday: editCellAddMemberForm.birthday || '', anniversary: editCellAddMemberForm.anniversary || '', phone: editCellAddMemberForm.phone || '', locality: editCellAddMemberForm.locality || '', since: editCellAddMemberForm.since || '', status: 'active' }, requestedBy: userProfile?.email || userProfile?.displayName || 'Cell Director' }); setEditCellAddMemberOpen(false); setEditCellAddMemberForm({ name: '', birthday: '', anniversary: '', phone: '', locality: '', since: '' }); const list = await getCellGroupMembers(effectiveCellId); setCellMembers(list); alert('Add member submitted for approval.'); } catch (err) { alert(err?.message || 'Failed'); } }} className="p-4 space-y-3">
                                <div><label className="block text-sm font-medium text-slate-700 mb-1">Name *</label><input type="text" value={editCellAddMemberForm.name} onChange={(e) => setEditCellAddMemberForm((f) => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" required /></div>
                                <div><label className="block text-sm font-medium text-slate-700 mb-1">Birthday</label><input type="date" value={editCellAddMemberForm.birthday} onChange={(e) => setEditCellAddMemberForm((f) => ({ ...f, birthday: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" /></div>
                                <div><label className="block text-sm font-medium text-slate-700 mb-1">Anniversary</label><input type="date" value={editCellAddMemberForm.anniversary} onChange={(e) => setEditCellAddMemberForm((f) => ({ ...f, anniversary: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" /></div>
                                <div><label className="block text-sm font-medium text-slate-700 mb-1">Phone</label><input type="tel" inputMode="numeric" value={editCellAddMemberForm.phone} onChange={(e) => setEditCellAddMemberForm((f) => ({ ...f, phone: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" /></div>
                                <div><label className="block text-sm font-medium text-slate-700 mb-1">Locality</label><input type="text" value={editCellAddMemberForm.locality} onChange={(e) => setEditCellAddMemberForm((f) => ({ ...f, locality: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" /></div>
                                <div><label className="block text-sm font-medium text-slate-700 mb-1">First Sunday</label><input type="date" value={editCellAddMemberForm.since} onChange={(e) => setEditCellAddMemberForm((f) => ({ ...f, since: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" title="First Sunday the person started attending" /></div>
                                <div className="flex gap-2 pt-2"><button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium">Submit for approval</button><button type="button" onClick={() => setEditCellAddMemberOpen(false)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm">Cancel</button></div>
                              </form>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              ) : (
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-8 text-center text-slate-500">
                  <p>Click a cell tile to view or edit its report.</p>
                </div>
              )}
            </div>
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
              <label className="text-sm font-medium text-slate-700">Report Date:</label>
              <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300" />
            </div>
          </div>
          <div className="flex border-b border-slate-200 overflow-x-auto">
            {(canEditCurrentReport ? CELL_REPORT_TABS_ALL : CELL_REPORT_TABS_VIEW_ONLY).map(({ key, label }) => (
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
                {!canEditCurrentReport && (
                  <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    View only. You can edit this report only when you are Cell Leader for this cell (and your profile cell matches).
                  </p>
                )}
                {loading ? (
                  <div className="py-8 text-slate-500">Loading…</div>
                ) : !report ? (
                  <div className="py-6 text-slate-500">
                    {canEditCurrentReport
                      ? 'No report for this date. Save attendance after the report is created.'
                      : 'No report for this date.'}
                  </div>
                ) : (
                  <>
                    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                      <h3 className="font-semibold text-slate-800 mb-2">Active Members</h3>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="text-left px-3 py-2 font-medium text-slate-600 w-10">SL</th>
                              <th className="text-left px-3 py-2 font-medium text-slate-600">Name</th>
                              <th className="text-left px-3 py-2 font-medium text-slate-600">Attendance</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {(cellMembers || []).filter((m) => m.status !== 'inactive').map((m, idx) => {
                              const attended = attendees.some((a) => a.memberId === m.id)
                              return (
                                <tr key={m.id}>
                                  <td className="px-3 py-2 text-slate-600">{idx + 1}</td>
                                  <td className="px-3 py-2 font-medium text-slate-800">{m.name || '—'}</td>
                                  <td className="px-3 py-2">
                                    {canEditCurrentReport ? (
                                      <button
                                        type="button"
                                        onClick={() => handleToggleAttendance(m)}
                                        className={`px-3 py-1.5 rounded text-sm font-medium min-w-[4.5rem] ${attended ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-emerald-500 text-white hover:bg-emerald-600'}`}
                                      >
                                        {attended ? 'Undo' : 'Present'}
                                      </button>
                                    ) : (
                                      <span className={`text-sm font-medium ${attended ? 'text-emerald-700' : 'text-slate-500'}`}>{attended ? 'Attended' : '—'}</span>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      {(cellMembers || []).filter((m) => m.status !== 'inactive').length === 0 && (
                        <p className="text-slate-500 text-sm py-2">No active members.</p>
                      )}
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                      <h3 className="font-semibold text-slate-800 mb-2">Visitors Attended</h3>
                      {canEditCurrentReport ? (
                        <>
                          <div className="flex flex-wrap gap-2 mb-2">
                            <input
                              type="text"
                              value={visitorInput}
                              onChange={(e) => setVisitorInput(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const n = visitorInput.trim(); if (n) { handleAddVisitor(n); setVisitorInput(''); } } }}
                              placeholder="Type name and press Enter or click Add"
                              className="px-2 py-1.5 rounded border border-slate-300 min-w-[180px] flex-1"
                            />
                            <button type="button" onClick={() => { const n = visitorInput.trim(); if (n) { handleAddVisitor(n); setVisitorInput(''); } }} className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm">Add</button>
                          </div>
                          <ul className="text-sm text-slate-700 divide-y divide-slate-100">
                            {(report.visitorsList || []).length === 0 ? <li className="py-2 text-slate-500">No visitors added.</li> : (report.visitorsList || []).map((name, i) => (
                              <li key={i} className="py-1.5 flex items-center justify-between gap-2">
                                <span>{name}</span>
                                <button type="button" onClick={() => handleRemoveVisitor(i)} className="text-red-600 text-xs hover:underline">Remove</button>
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        <ul className="text-sm text-slate-700 divide-y divide-slate-100">
                          {(report.visitorsList || []).length === 0 ? <li className="py-2 text-slate-500">No visitors.</li> : (report.visitorsList || []).map((name, i) => (
                            <li key={i} className="py-1.5">{name}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                      <h3 className="font-semibold text-slate-800 mb-2">Children Attended</h3>
                      {canEditCurrentReport ? (
                        <>
                          <div className="flex flex-wrap gap-2 mb-2">
                            <input
                              type="text"
                              value={childInput}
                              onChange={(e) => setChildInput(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const n = childInput.trim(); if (n) { handleAddChild(n); setChildInput(''); } } }}
                              placeholder="Type name and press Enter or click Add"
                              className="px-2 py-1.5 rounded border border-slate-300 min-w-[180px] flex-1"
                            />
                            <button type="button" onClick={() => { const n = childInput.trim(); if (n) { handleAddChild(n); setChildInput(''); } }} className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm">Add</button>
                          </div>
                          <ul className="text-sm text-slate-700 divide-y divide-slate-100">
                            {(report.childrenList || []).length === 0 ? <li className="py-2 text-slate-500">No children added.</li> : (report.childrenList || []).map((name, i) => (
                              <li key={i} className="py-1.5 flex items-center justify-between gap-2">
                                <span>{name}</span>
                                <button type="button" onClick={() => handleRemoveChild(i)} className="text-red-600 text-xs hover:underline">Remove</button>
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        <ul className="text-sm text-slate-700 divide-y divide-slate-100">
                          {(report.childrenList || []).length === 0 ? <li className="py-2 text-slate-500">No children.</li> : (report.childrenList || []).map((name, i) => (
                            <li key={i} className="py-1.5">{name}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </>
                )}
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
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <label className="text-sm font-medium text-slate-700">Meeting date:</label>
                  <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300" />
                </div>
                <p className="text-sm text-slate-500">Tap START when each program begins. Times are recorded and cannot be edited.</p>
                {(() => {
                  const sorted = [...programItems].sort((a, b) => a.order - b.order)
                  const currentItem = sorted[programLogs.length] || null
                  if (sorted.length === 0) {
                    return <p className="text-slate-500 py-6">Add program items in <strong>Set Default Program</strong> first.</p>
                  }
                  if (!currentItem) {
                    return (
                      <div className="space-y-4">
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
                          <p className="font-semibold text-emerald-800">All programs recorded</p>
                          <p className="text-sm text-emerald-700 mt-1">Program timeline appears in the final report below.</p>
                        </div>
                        {programLogs.length > 0 && (
                          <div className="bg-slate-50 rounded-xl border-2 border-slate-200 p-4 shadow-sm">
                            <h3 className="font-semibold text-slate-800 mb-2">Program timeline (read-only)</h3>
                            <ul className="text-sm text-slate-700 divide-y divide-slate-200">
                              {programLogs.map((log) => (
                                <li key={log.id} className="py-1.5">{log.programName || '—'}: {log.startTime ? format(log.startTime instanceof Date ? log.startTime : new Date(log.startTime), 'HH:mm') : '—'}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )
                  }
                  return (
                    <div className="flex flex-col items-center">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!canEditCurrentReport) return
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
                      <p className="text-xs text-slate-500 mt-2">Next: {currentItem.programName}</p>
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
                    <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium">{editingProgramId ? 'Update' : 'Add'}</button>
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

            {leaderTab === 'editCell' && (() => {
              const all = cellMembers || []
              const q = (editCellSearch || '').toLowerCase().trim()
              const filtered = q ? all.filter((m) => (m.name || '').toLowerCase().includes(q) || (m.phone || '').includes(q) || (m.role || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q)) : all
              const sorted = [...filtered].sort((a, b) => {
                const na = (a.name || '').toLowerCase()
                const nb = (b.name || '').toLowerCase()
                return editCellSortAsc ? na.localeCompare(nb) : nb.localeCompare(na)
              })
              const active = sorted.filter((m) => m.status !== 'inactive')
              const inactive = sorted.filter((m) => m.status === 'inactive')
              return (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <input type="text" value={editCellSearch} onChange={(e) => setEditCellSearch(e.target.value)} placeholder="Search member" className="px-3 py-2 rounded-lg border border-slate-300 min-w-[180px]" />
                    <button type="button" onClick={() => setEditCellSortAsc((v) => !v)} className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700">Sort by name {editCellSortAsc ? 'A→Z' : 'Z→A'}</button>
                    <button type="button" onClick={() => { setLeaderAddMemberOpen(true); setLeaderAddMemberForm({ name: '', birthday: '', anniversary: '', phone: '', locality: '', since: '', status: 'active' }); }} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium">Add Member</button>
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
                  <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <h3 className="font-semibold text-slate-800 mb-2">Inactive Members</h3>
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
                          {inactive.map((m) => (
                            <tr key={m.id}>
                              <td className="px-3 py-2 font-medium text-slate-800">{m.name || '—'}</td>
                              <td className="px-3 py-2 text-slate-600">{m.phone || '—'}</td>
                              <td className="px-3 py-2 text-slate-600">{m.role || '—'}</td>
                              <td className="px-3 py-2">
                                <button type="button" onClick={async () => { try { await addCellMemberPendingChange({ changeType: 'activate', cellId: effectiveCellId, cellName: cell?.cellName || '', memberId: m.id, memberData: null, requestedBy: userProfile?.email || userProfile?.displayName || 'Leader' }); const list = await getCellGroupMembers(effectiveCellId); setCellMembers(list); alert('Reactivate submitted for approval.'); } catch (e) { alert(e?.message || 'Failed'); } }} className="text-emerald-600 hover:underline">Reactivate</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {inactive.length === 0 && <p className="text-slate-500 text-sm py-2">No inactive members.</p>}
                  </div>
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
                            <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium">Submit for approval</button>
                            <button type="button" onClick={() => setEditCellEditModal(null)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm">Cancel</button>
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
                      <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium">Submit for approval</button>
                      <button type="button" onClick={() => setLeaderAddMemberOpen(false)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm">Cancel</button>
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
                      <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium">Save Changes</button>
                      <button type="button" onClick={async () => { if (!canEditCurrentReport) return; try { await addCellMemberPendingChange({ changeType: 'deactivate', cellId: myCellId, cellName: cell?.cellName || '', memberId: leaderEditMember.id, memberData: null, requestedBy: userProfile?.email || userProfile?.displayName || 'Leader' }); setLeaderEditMember(null); alert('Make Inactive submitted for approval.'); } catch (e) { alert('Failed'); } }} className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium">Make Inactive</button>
                      <button type="button" onClick={async () => { if (!canEditCurrentReport) return; if (!window.confirm('Request to delete this member?')) return; try { await addCellMemberPendingChange({ changeType: 'delete', cellId: myCellId, cellName: cell?.cellName || '', memberId: leaderEditMember.id, memberData: null, requestedBy: userProfile?.email || userProfile?.displayName || 'Leader' }); setLeaderEditMember(null); alert('Delete submitted for approval.'); } catch (e) { alert('Failed'); } }} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium">Delete Member</button>
                      <button type="button" onClick={() => setLeaderEditMember(null)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm">Cancel</button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
