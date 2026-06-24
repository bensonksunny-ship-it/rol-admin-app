import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { format, addWeeks, subWeeks } from 'date-fns'
import { useAuth } from '../context/AuthContext'
import {
  getSundayReport,
  setSundayReport,
  getCellGroups,
  getCellGroupMembers,
  addSundayProgramLog,
  getSundayProgramLogsByDate,
  updateSundayProgramLog,
  getDelightVisitors,
} from '../services/firestore'
import DepartmentTabBar from '../components/DepartmentTabBar'
import LiveElapsedTimer from '../components/LiveElapsedTimer'
import ProgramConfirmSheet from '../components/ProgramConfirmSheet'

const MANUAL_ONLY_KEYS = [
  { key: 'others', title: 'Others' },
  { key: 'secondWeekAttendeesNames', title: 'Second Week Attendees' },
  { key: 'riverKids', title: 'River Kids' },
]

const PASTORAL_KEY = { key: 'pastoralAttendees', title: 'Pastoral Attendees' }

/** Local-only UX: order for Done → scroll to next attendance section */
const ATTENDANCE_SECTION_ORDER = ['cells', 'pastoral', 'newComers', 'others', 'secondWeekAttendeesNames', 'riverKids']


/** Map legacy report field → normalized cell name (lowercase, no spaces) */
const LEGACY_CELL_MAP = [
  ['olive', 'olive'],
  ['jordan', 'jordan'],
  ['bethany', 'bethany'],
  ['edenStream', 'edenstream'],
  ['bethel', 'bethel'],
  ['newCell1', 'newcell'],
  ['newCell1', 'newcell1'],
  ['children', 'children'],
]

function normalizeCellName(n) {
  return String(n || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
}

function migrateLegacyCellAttendance(report, cellGroups) {
  const byNorm = {}
  for (const g of cellGroups) {
    const id = g.id
    const nn = normalizeCellName(g.cellName)
    if (nn) byNorm[nn] = id
  }
  const sca = { ...(report.sundayCellAttendance && typeof report.sundayCellAttendance === 'object' ? report.sundayCellAttendance : {}) }
  for (const [legacyKey, norm] of LEGACY_CELL_MAP) {
    const arr = report[legacyKey]
    if (!Array.isArray(arr) || !arr.length) continue
    const gid = byNorm[norm]
    if (!gid) continue
    const names = arr.map((x) => String(x).trim()).filter(Boolean)
    sca[gid] = [...new Set([...(sca[gid] || []), ...names])]
  }
  return sca
}

function NameListSection({ title, names, canEdit, onAdd, onAddValue, onEdit, onRemove, suggestions = [], loadingSuggestions = false, className = '' }) {
  const nameSet = useMemo(() => new Set((names || []).map(n => n.trim().toLowerCase())), [names])
  const unusedSuggestions = useMemo(
    () => suggestions.filter(s => !nameSet.has(s.trim().toLowerCase())),
    [suggestions, nameSet]
  )

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${className || 'bg-white border-slate-200'}`}>
      <h3 className="font-semibold text-slate-800 mb-3">{title}</h3>

      {/* D-Light visitor suggestions */}
      {canEdit && (loadingSuggestions || unusedSuggestions.length > 0) && (
        <div className="mb-3">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
            From D-Light this week — tap to add
          </p>
          {loadingSuggestions ? (
            <p className="text-xs text-slate-400">Loading visitors…</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {unusedSuggestions.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => onAddValue?.(name)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-medium hover:bg-indigo-100 transition-colors"
                >
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                    <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <ul className="space-y-2">
        {(names || []).map((name, idx) => (
          <li key={idx} className="flex items-center gap-2">
            {canEdit ? (
              <>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => onEdit(idx, e.target.value)}
                  className="flex-1 px-2 py-1.5 rounded border border-slate-300 text-sm"
                />
                <button type="button" onClick={() => onRemove(idx)} className="text-red-600 hover:underline text-sm">
                  Remove
                </button>
              </>
            ) : (
              <span className="text-slate-800">{name || '—'}</span>
            )}
          </li>
        ))}
        {canEdit && (
          <li>
            <button type="button" onClick={onAdd} className="text-indigo-600 hover:underline text-sm font-medium">
              + Add person
            </button>
          </li>
        )}
      </ul>
    </div>
  )
}

/** Local-only: wrap attendance blocks with Done/Undo, scroll target, completed/active styling */
function AttendanceSectionShell({
  sectionRef,
  completed,
  isActive,
  canManage,
  onDone,
  onUndo,
  children,
}) {
  const isCompleted = !!completed
  const shellClass = isCompleted
    ? 'bg-emerald-50/90 border-emerald-300'
    : isActive
      ? 'bg-indigo-50/50 border-indigo-400 ring-2 ring-indigo-200/90'
      : 'bg-white border-slate-200'

  return (
    <div ref={sectionRef} className={`rounded-xl border p-4 shadow-sm transition-colors scroll-mt-4 ${shellClass}`}>
      {children}
      {canManage && (
        <div className="mt-4 flex justify-end border-t border-slate-200/70 pt-3">
          <button
            type="button"
            onClick={() => (isCompleted ? onUndo() : onDone())}
            className="px-4 min-h-[44px] py-2 rounded-lg text-sm font-medium border border-slate-300 bg-white hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 text-slate-800 transition-colors"
          >
            {isCompleted ? 'Undo' : 'Done'}
          </button>
        </div>
      )}
    </div>
  )
}

function upcomingSunday() {
  const today = new Date()
  const daysUntil = today.getDay() === 0 ? 0 : 7 - today.getDay()
  const d = new Date(today)
  d.setDate(today.getDate() + daysUntil)
  return format(d, 'yyyy-MM-dd')
}

export default function SundayReport({ embedded = false }) {
  const { userProfile, canManageDepartment, isDepartmentHead, isSundayMinistryDirector } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [selectedDate, setSelectedDate] = useState(() => searchParams.get('date') || upcomingSunday())
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cellGroups, setCellGroups] = useState([])
  const [expandedCellId, setExpandedCellId] = useState(null)
  const [membersForCell, setMembersForCell] = useState([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [programLogs, setProgramLogs] = useState([])
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [showProgramConfirm, setShowProgramConfirm] = useState(false)
  const [dlightSuggestions, setDlightSuggestions] = useState([])
  const [loadingDlight, setLoadingDlight] = useState(false)
  const [editingLogIdx, setEditingLogIdx] = useState(null)
  const [editingLogTime, setEditingLogTime] = useState('')
  const [editingProgramIdx, setEditingProgramIdx] = useState(null)
  const [editingProgramName, setEditingProgramName] = useState('')
  /** Local-only: which attendance sections are marked done (no Firestore) */
  const [completedSections, setCompletedSections] = useState({})

  const cellsSectionRef = useRef(null)
  const pastoralSectionRef = useRef(null)
  const newComersSectionRef = useRef(null)
  const othersSectionRef = useRef(null)
  const secondWeekSectionRef = useRef(null)
  const riverKidsSectionRef = useRef(null)

  const sectionRefById = useMemo(
    () => ({
      cells: cellsSectionRef,
      pastoral: pastoralSectionRef,
      newComers: newComersSectionRef,
      others: othersSectionRef,
      secondWeekAttendeesNames: secondWeekSectionRef,
      riverKids: riverKidsSectionRef,
    }),
    []
  )

  const canEdit = isSundayMinistryDirector
  const canEditEffective = canEdit

  const summaryComputed = useMemo(() => {
    const cellRows = (cellGroups || [])
      .map((g) => ({
        id: g.id,
        name: g.cellName || 'Unnamed',
        count: (report?.sundayCellAttendance?.[g.id] || []).filter(Boolean).length,
      }))
      .filter((r) => r.count > 0)
    const othersCount       = (report?.others || []).filter(Boolean).length
    const secondWeekCount   = (report?.secondWeekAttendeesNames || []).filter(Boolean).length
    const newcomersCount    = dlightSuggestions.filter(Boolean).length
    const pastoralCount     = (report?.pastoralAttendees || []).filter(Boolean).length
    const riverKidsCount    = (report?.riverKids || []).filter(Boolean).length
    const sundaySchool      = Number(report?.summary?.sundaySchool) || 0
    const cellTotal         = cellRows.reduce((s, r) => s + r.count, 0)
    const totalAdults       = cellTotal + othersCount + secondWeekCount + newcomersCount + pastoralCount
    const total             = totalAdults + sundaySchool + riverKidsCount
    return { cellRows, othersCount, secondWeekCount, newcomersCount, riverKidsCount, sundaySchool, totalAdults, total }
  }, [cellGroups, report, dlightSuggestions])

  /** First incomplete attendance section = “active” highlight (editors only) */
  const activeSectionId = useMemo(() => {
    if (!canEditEffective) return null
    return ATTENDANCE_SECTION_ORDER.find((id) => !completedSections[id]) ?? null
  }, [canEditEffective, completedSections])

  const attendanceProgressTotal = ATTENDANCE_SECTION_ORDER.length
  const attendanceProgressDone = useMemo(
    () => ATTENDANCE_SECTION_ORDER.filter((id) => completedSections[id]).length,
    [completedSections]
  )
  const attendanceProgressPct = attendanceProgressTotal
    ? Math.round((attendanceProgressDone / attendanceProgressTotal) * 100)
    : 0

  useEffect(() => {
    const dateFromUrl = searchParams.get('date')
    if (dateFromUrl && dateFromUrl !== selectedDate) {
      setSelectedDate(dateFromUrl)
    }
  }, [searchParams])

  useEffect(() => {
    setCompletedSections({})
  }, [selectedDate])

  const handleAttendanceDone = useCallback(
    (sectionId) => {
      setCompletedSections((prev) => ({ ...prev, [sectionId]: true }))
      const idx = ATTENDANCE_SECTION_ORDER.indexOf(sectionId)
      const nextId = ATTENDANCE_SECTION_ORDER[idx + 1]
      const nextEl = nextId ? sectionRefById[nextId]?.current : null
      if (nextEl) {
        requestAnimationFrame(() => {
          nextEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
      }
    },
    [sectionRefById]
  )

  const handleAttendanceUndo = useCallback((sectionId) => {
    setCompletedSections((prev) => ({ ...prev, [sectionId]: false }))
  }, [])

  useEffect(() => {
    if (!expandedCellId) {
      setMembersForCell([])
      return
    }
    setLoadingMembers(true)
    getCellGroupMembers(expandedCellId)
      .then((list) => setMembersForCell((list || []).filter((m) => m.status !== 'inactive')))
      .catch(() => setMembersForCell([]))
      .finally(() => setLoadingMembers(false))
  }, [expandedCellId])

  // Fetch D-Light visitors for the week of selectedDate (attendedDate within 7 days before the Sunday)
  useEffect(() => {
    setLoadingDlight(true)
    const sunday = new Date(selectedDate + 'T00:00:00')
    const weekAgo = new Date(sunday)
    weekAgo.setDate(sunday.getDate() - 6)
    getDelightVisitors()
      .then(visitors => {
        const thisWeek = visitors.filter(v => {
          if (!v.attendedDate) return false
          const d = new Date(v.attendedDate + 'T00:00:00')
          return d >= weekAgo && d <= sunday
        })
        const names = [...new Set(thisWeek.map(v => v.name).filter(Boolean))]
        setDlightSuggestions(names)
      })
      .catch(() => setDlightSuggestions([]))
      .finally(() => setLoadingDlight(false))
  }, [selectedDate])

  // Single master load — clears stale data immediately so previous date never bleeds through
  useEffect(() => {
    setLoading(true)
    setReport(null)
    setProgramLogs([])
    setShowProgramConfirm(false)
    Promise.all([
      getSundayReport(selectedDate),
      getCellGroups('Cell'),
      getSundayProgramLogsByDate(selectedDate),
    ])
      .then(([r, groups, logs]) => {
        const active = (groups || []).filter((g) => g.status !== 'inactive')
        setCellGroups(active)
        let next = r || null
        if (next) {
          const hasSca =
            next.sundayCellAttendance &&
            typeof next.sundayCellAttendance === 'object' &&
            Object.keys(next.sundayCellAttendance).length > 0
          next = {
            ...next,
            sundayCellAttendance: hasSca ? next.sundayCellAttendance : migrateLegacyCellAttendance(next, active),
            sundayMinistryTeam: [],
          }
        }
        setReport(next)
        setProgramLogs(logs || [])
      })
      .catch(() => { setReport(null); setProgramLogs([]) })
      .finally(() => setLoading(false))
  }, [selectedDate])

  const refreshAll = useCallback(() => {
    setLoading(true)
    setCompletedSections({})
    Promise.all([
      getSundayReport(selectedDate),
      getCellGroups('Cell'),
      getSundayProgramLogsByDate(selectedDate),
    ])
      .then(([r, groups, logs]) => {
        const active = (groups || []).filter((g) => g.status !== 'inactive')
        setCellGroups(active)
        let next = r || null
        if (next) {
          const hasSca = next.sundayCellAttendance && typeof next.sundayCellAttendance === 'object' && Object.keys(next.sundayCellAttendance).length > 0
          next = { ...next, sundayCellAttendance: hasSca ? next.sundayCellAttendance : migrateLegacyCellAttendance(next, active), sundayMinistryTeam: [] }
        }
        setReport(next)
        setProgramLogs(logs || [])
      })
      .catch(() => { setReport(null); setProgramLogs([]) })
      .finally(() => setLoading(false))
  }, [selectedDate])

  // On tab focus: only refresh program logs (not the full report — that would wipe unsaved attendance edits)
  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        getSundayProgramLogsByDate(selectedDate).then(setProgramLogs).catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', handleVisible)
    return () => document.removeEventListener('visibilitychange', handleVisible)
  }, [selectedDate])

  const updateReport = (patch) => setReport((prev) => (prev ? { ...prev, ...patch } : { ...patch }))

  const handleSave = async () => {
    if (!report || !canEdit) return
    setSaving(true)
    try {
      const { cellRows, othersCount, secondWeekCount, newcomersCount, riverKidsCount, sundaySchool, totalAdults, total } = summaryComputed
      const cellAttendanceCount = cellRows.reduce((s, r) => s + r.count, 0)

      const cellBreakdown = Object.fromEntries(cellRows.map((r) => [r.name, r.count]))

      const computedSummary = {
        ...report.summary,
        cellAttendance: cellAttendanceCount,
        othersCount,
        newcomers: newcomersCount,
        secondWeekAttendees: secondWeekCount,
        riverKids: riverKidsCount,
        sundaySchool,
        totalAdults,
        totalAttendance: total,
      }

      // Only include logs for items currently in programList — orphaned logs
      // (from items removed via ✕) must not pollute the saved programTimings.
      const activeNames = new Set(
        (report?.programList || []).map((item) => String(item.programName || '').trim().toLowerCase())
      )
      const timings = programLogs
        .filter((log) => activeNames.has(String(log.programName || '').trim().toLowerCase()))
        .map((log) => {
          const t = log.startTime instanceof Date ? log.startTime : log.startTime?.toDate?.() ?? null
          return { programName: log.programName, startTime: t ? t.toISOString() : null }
        })
        .filter((x) => x.startTime)

      const scrollY = window.scrollY
      await setSundayReport(
        selectedDate,
        {
          ...report,
          summary: computedSummary,
          cellBreakdown,
          programList: report?.programList || [],
          programTimings: timings,
          sundayMinistryTeam: [],
        },
        userProfile?.email || 'unknown'
      )
      setReport((prev) => (prev ? { ...prev, summary: computedSummary } : prev))
      requestAnimationFrame(() => window.scrollTo(0, scrollY))
    } catch (err) {
      console.error(err)
      alert('Failed to save')
    }
    setSaving(false)
  }

  const toggleMemberAttendance = (cellId, memberName) => {
    const name = String(memberName || '').trim()
    if (!name || !canEditEffective || completedSections.cells) return
    const sca = { ...(report?.sundayCellAttendance || {}) }
    const list = [...(sca[cellId] || [])]
    const i = list.indexOf(name)
    if (i >= 0) list.splice(i, 1)
    else list.push(name)
    sca[cellId] = list
    updateReport({ sundayCellAttendance: sca })
  }

  const updateCellList = (key, idx, value) => {
    const list = [...(report?.[key] || [])]
    list[idx] = value
    updateReport({ [key]: list })
  }
  const addCellName = (key) => updateReport({ [key]: [...(report?.[key] || []), ''] })
  const addCellNameValue = (key, value) => updateReport({ [key]: [...(report?.[key] || []), value] })
  const removeCellName = (key, idx) => updateReport({ [key]: (report?.[key] || []).filter((_, i) => i !== idx) })

  const updateSummary = (key, value) => updateReport({ summary: { ...(report?.summary || {}), [key]: value } })

  const logByName = useMemo(() => {
    const map = {}
    for (const log of programLogs) {
      const key = String(log.programName || '').trim().toLowerCase()
      if (key && !map[key]) map[key] = log
    }
    return map
  }, [programLogs])

  const logForItem = (item) => logByName[String(item?.programName || '').trim().toLowerCase()] || null

  // Sort by actual startTime when logged (reflects real service order),
  // fall back to the configured `order` field for items not yet started.
  const sortedProgram = useMemo(() => {
    const toMs = (log) => {
      if (!log?.startTime) return null
      const d = log.startTime instanceof Date ? log.startTime : new Date(log.startTime)
      return isNaN(d.getTime()) ? null : d.getTime()
    }
    return [...(report?.programList || [])].sort((a, b) => {
      const ta = toMs(logByName[String(a.programName || '').trim().toLowerCase()])
      const tb = toMs(logByName[String(b.programName || '').trim().toLowerCase()])
      if (ta !== null && tb !== null) return ta - tb
      if (ta !== null) return -1   // timed items float before untimed
      if (tb !== null) return 1
      return (a.order ?? 0) - (b.order ?? 0)
    })
  }, [report?.programList, logByName])

  const currentProgramItem = sortedProgram.find((item) => !logForItem(item)) || null
  const allProgramsTimed = sortedProgram.length > 0 && !currentProgramItem

  // The item currently running = the one just before the next-to-time item
  const runningProgramItem = useMemo(() => {
    if (!currentProgramItem) return null
    const idx = sortedProgram.indexOf(currentProgramItem)
    return idx > 0 ? sortedProgram[idx - 1] : null
  }, [sortedProgram, currentProgramItem])
  const runningLog = runningProgramItem ? logForItem(runningProgramItem) : null
  const runningStartMs = useMemo(() => {
    if (!runningLog?.startTime) return null
    const d = runningLog.startTime instanceof Date ? runningLog.startTime : new Date(runningLog.startTime)
    return isNaN(d.getTime()) ? null : d.getTime()
  }, [runningLog])

  const updateProgramItemName = (idx, name) => {
    const updated = sortedProgram.map((item, i) => i === idx ? { ...item, programName: name } : item)
    updateReport({ programList: updated })
  }

  const removeProgramItem = (idx) => {
    const updated = sortedProgram
      .filter((_, i) => i !== idx)
      .map((item, i) => ({ ...item, order: i }))
    updateReport({ programList: updated })
  }


  const handleProgramStart = async () => {
    if (!canEditEffective || !currentProgramItem) return
    try {
      await addSundayProgramLog({
        programName: currentProgramItem.programName,
        startTime: new Date(),
        reportDate: selectedDate,
      })
      const logs = await getSundayProgramLogsByDate(selectedDate)
      setProgramLogs(logs)
      if (logs.length >= sortedProgram.length) {
        setShowCompleteModal(true)
      }
    } catch (e) {
      console.error(e)
      alert(e?.message || 'Failed to record time')
    }
  }

  const handleDownloadExcel = async () => {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()

    // ── Sheet 1: Summary ──────────────────────────────────────────────
    const rows = []
    rows.push([`Sunday Report — ${selectedDate}`])
    rows.push([])

    if (sortedProgram.length > 0) {
      rows.push(['Program', 'Start Time'])
      sortedProgram.forEach((item) => {
        const log = logForItem(item)
        const t = log?.startTime ? (log.startTime instanceof Date ? log.startTime : new Date(log.startTime)) : null
        rows.push([item.programName, t ? format(t, 'h:mm a') : '—'])
      })
      rows.push([])
    }

    const { cellRows, othersCount, secondWeekCount, newcomersCount, riverKidsCount, totalAdults, total } = summaryComputed
    rows.push(['Attendance', 'Count'])
    cellRows.forEach((r) => rows.push([r.name, r.count]))
    rows.push(['Others', othersCount])
    rows.push(['New Comers', newcomersCount])
    rows.push(['Second Week Attendees', secondWeekCount])
    rows.push(['River Kids', riverKidsCount])
    rows.push(['Sunday School', Number(report?.summary?.sundaySchool) || 0])
    rows.push([])
    rows.push(['Total Adults', totalAdults])
    rows.push(['Total', total])

    const ws1 = XLSX.utils.aoa_to_sheet(rows)
    ws1['!cols'] = [{ wch: 30 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, ws1, 'Summary')

    // ── Sheet 2: Attendance Detail ────────────────────────────────────
    const detailRows = [['Section', 'Name']]
    cellGroups.forEach((g) => {
      const members = (report?.sundayCellAttendance?.[g.id] || []).filter(Boolean)
      members.forEach((name) => detailRows.push([g.cellName || 'Cell', name]))
    })
    const listsToExport = [
      { label: 'Pastoral Attendees', key: 'pastoralAttendees' },
      { label: 'New Comers', key: 'newComers' },
      { label: 'Others', key: 'others' },
      { label: 'Second Week Attendees', key: 'secondWeekAttendeesNames' },
      { label: 'River Kids', key: 'riverKids' },
    ]
    listsToExport.forEach(({ label, key }) => {
      const names = (report?.[key] || []).filter(Boolean)
      names.forEach((name) => detailRows.push([label, name]))
    })

    const ws2 = XLSX.utils.aoa_to_sheet(detailRows)
    ws2['!cols'] = [{ wch: 28 }, { wch: 28 }]
    XLSX.utils.book_append_sheet(wb, ws2, 'Attendance Detail')

    XLSX.writeFile(wb, `sunday-report-${selectedDate}.xlsx`)
  }

  const handleUpdateLog = async (idx) => {
    if (!editingLogTime) return
    const item = sortedProgram[idx]
    const log = logForItem(item)
    try {
      const [h, m] = editingLogTime.split(':').map(Number)
      const d = new Date(`${selectedDate}T00:00:00`)
      d.setHours(h, m, 0, 0)
      if (log?.id) {
        await updateSundayProgramLog(log.id, d)
      } else {
        await addSundayProgramLog({
          programName: item?.programName || '',
          startTime: d,
          reportDate: selectedDate,
        })
      }
      const logs = await getSundayProgramLogsByDate(selectedDate)
      setProgramLogs(logs)
      setEditingLogIdx(null)
    } catch (e) {
      console.error(e)
      alert(e?.message || 'Failed to save time')
    }
  }

  if (!isSundayMinistryDirector) {
    return (
      <div className="p-8 text-slate-600">
        <Link to="/department/sunday-ministry" className="text-blue-600 hover:underline">
          ← Sunday Ministry
        </Link>
        <p className="mt-4">You do not have access to Sunday Ministry.</p>
      </div>
    )
  }

  const selectedForCell = (cellId) => new Set(report?.sundayCellAttendance?.[cellId] || [])

  const cellsEdit = canEditEffective && !completedSections.cells
  const pastoralEdit = canEditEffective && !completedSections.pastoral

  return (
    <div>
      {!embedded && <DepartmentTabBar slug="sunday-ministry" activeTab="sundayReport" />}
      <div className="space-y-6 p-4">
        {/* Date nav + actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setSelectedDate(format(subWeeks(new Date(selectedDate), 1), 'yyyy-MM-dd'))}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
          >
            ←
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 bg-white"
          />
          <button
            type="button"
            onClick={() => setSelectedDate(format(addWeeks(new Date(selectedDate), 1), 'yyyy-MM-dd'))}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
          >
            →
          </button>
          <button
            type="button"
            onClick={refreshAll}
            disabled={loading}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-500 hover:bg-slate-50 disabled:opacity-40"
            title="Refresh"
          >
            ↻
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="ml-auto px-5 min-h-[44px] py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-500">Loading report…</div>
        ) : (
          <>
            {(sortedProgram.length > 0 || canEditEffective) && (
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-slate-800">Program</h3>
                  <Link to="/department/sunday-ministry/sunday?subtab=program" className="text-sm text-indigo-600 hover:underline">
                    Manage program →
                  </Link>
                </div>

                {sortedProgram.length === 0 ? (
                  <p className="text-sm text-slate-400">No programs yet. Add one below or push from Sunday Program page.</p>
                ) : (
                  <ul className="text-sm divide-y divide-slate-100 border border-slate-100 rounded-lg">
                    {sortedProgram.map((item, idx) => {
                      const log = logForItem(item)
                      const logTime = log?.startTime
                        ? format(log.startTime instanceof Date ? log.startTime : new Date(log.startTime), 'HH:mm')
                        : null
                      const nextLog = logForItem(sortedProgram[idx + 1])
                      const durationMs = log?.startTime && nextLog?.startTime
                        ? (nextLog.startTime instanceof Date ? nextLog.startTime : new Date(nextLog.startTime)) -
                          (log.startTime instanceof Date ? log.startTime : new Date(log.startTime))
                        : null
                      const durationLabel = durationMs > 0
                        ? (() => { const m = Math.round(durationMs / 60000); return m >= 60 ? `${Math.floor(m/60)}h${m%60?` ${m%60}m`:''}` : `${m}m` })()
                        : null
                      const isEditingTime = editingLogIdx === idx
                      const isEditingName = editingProgramIdx === idx
                      const canEditName = canEditEffective && !log
                      return (
                        <li key={`${item.programName}-${idx}`} className="flex items-center gap-2 px-3 py-2">
                          {/* Program name */}
                          {isEditingName ? (
                            <>
                              <input
                                type="text"
                                value={editingProgramName}
                                onChange={(e) => setEditingProgramName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { updateProgramItemName(idx, editingProgramName); setEditingProgramIdx(null) } if (e.key === 'Escape') setEditingProgramIdx(null) }}
                                className="flex-1 px-2 py-1 rounded border border-slate-300 text-sm font-medium"
                                autoFocus
                              />
                              <button type="button" onClick={() => { updateProgramItemName(idx, editingProgramName); setEditingProgramIdx(null) }} className="text-emerald-600 font-bold text-base px-1">✓</button>
                              <button type="button" onClick={() => setEditingProgramIdx(null)} className="text-red-500 font-bold text-base px-1">✕</button>
                            </>
                          ) : (
                            <span className="flex items-center gap-1.5 flex-1 min-w-0">
                              <span className="font-medium text-slate-800 truncate">{item.programName}</span>
                              {canEditName && (
                                <button
                                  type="button"
                                  onClick={() => { setEditingProgramIdx(idx); setEditingProgramName(item.programName) }}
                                  className="text-slate-300 hover:text-slate-500 text-xs flex-shrink-0"
                                  title="Edit name"
                                >✎</button>
                              )}
                            </span>
                          )}

                          {/* Program time */}
                          {!isEditingName && (
                            isEditingTime ? (
                              <span className="flex items-center gap-1 flex-shrink-0">
                                <input
                                  type="time"
                                  value={editingLogTime}
                                  onChange={(e) => setEditingLogTime(e.target.value)}
                                  className="px-2 py-1 rounded border border-slate-300 text-sm tabular-nums"
                                />
                                <button type="button" onClick={() => handleUpdateLog(idx)} className="text-emerald-600 hover:text-emerald-700 font-bold text-base px-1">✓</button>
                                <button type="button" onClick={() => setEditingLogIdx(null)} className="text-red-500 hover:text-red-600 font-bold text-base px-1">✕</button>
                              </span>
                            ) : canEditEffective ? (
                              <button
                                type="button"
                                onClick={() => { setEditingLogIdx(idx); setEditingLogTime(logTime || format(new Date(), 'HH:mm')) }}
                                className={`tabular-nums text-sm flex-shrink-0 min-w-[44px] text-right ${logTime ? 'text-slate-600 hover:text-indigo-600 hover:underline' : 'text-slate-300 hover:text-indigo-500'}`}
                                title={logTime ? 'Edit time' : 'Set time'}
                              >
                                {logTime || '—'}
                              </button>
                            ) : (
                              <span className="text-slate-600 tabular-nums text-sm flex-shrink-0">{logTime ?? '—'}</span>
                            )
                          )}

                          {/* Duration badge */}
                          {durationLabel && !isEditingTime && !isEditingName && (
                            <span className="flex-shrink-0 px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs tabular-nums font-medium">
                              {durationLabel}
                            </span>
                          )}

                          {/* Remove */}
                          {canEditEffective && !isEditingName && !isEditingTime && (
                            <button
                              type="button"
                              onClick={() => removeProgramItem(idx)}
                              className="text-slate-200 hover:text-red-500 text-sm px-1 flex-shrink-0"
                              title="Remove program"
                            >✕</button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}


                {/* Program confirm sheet — shown before first tap */}
                {showProgramConfirm && (
                  <ProgramConfirmSheet
                    title="Sunday Program"
                    items={sortedProgram.map(item => ({ name: item.programName }))}
                    onConfirm={() => { setShowProgramConfirm(false); handleProgramStart() }}
                    onEdit={() => { setShowProgramConfirm(false); navigate('/department/sunday-ministry/sunday-program') }}
                  />
                )}

                {runningStartMs && (
                  <div className="flex flex-col items-center gap-1 pt-1">
                    <p className="text-xs text-slate-500 font-medium">Now running: <strong>{runningProgramItem?.programName}</strong></p>
                    <LiveElapsedTimer startedAtMs={runningStartMs} />
                  </div>
                )}

                {canEditEffective && !allProgramsTimed && (
                  <div className="flex flex-col items-center pt-2">
                    <button
                      type="button"
                      onClick={() => programLogs.length === 0 ? setShowProgramConfirm(true) : handleProgramStart()}
                      className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg border-2 border-indigo-700 flex flex-col items-center justify-center cursor-pointer active:scale-[0.98] transition px-8 py-6"
                    >
                      <span className="text-2xl font-bold tracking-wide">START</span>
                      <span className="text-sm text-white/95 mt-2 font-medium">
                        {currentProgramItem ? currentProgramItem.programName : 'Service'}
                      </span>
                    </button>
                  </div>
                )}
                {canEditEffective && allProgramsTimed && (
                  <div className="flex flex-col items-center gap-2 pt-1">
                    <p className="text-sm text-emerald-700 font-medium">All program start times recorded.</p>
                    <button
                      type="button"
                      onClick={() => setShowCompleteModal(true)}
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow transition"
                    >
                      View Service Summary →
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Attendance — cell tiles */}
            <AttendanceSectionShell
              sectionRef={cellsSectionRef}
              completed={completedSections.cells}
              isActive={activeSectionId === 'cells'}
              canManage={canEditEffective}
              onDone={() => handleAttendanceDone('cells')}
              onUndo={() => handleAttendanceUndo('cells')}
            >
              <h2 className="text-lg font-semibold text-slate-800 mb-1">Attendance</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {cellGroups.map((g) => {
                  const expanded = expandedCellId === g.id
                  const count = (report?.sundayCellAttendance?.[g.id] || []).length
                  return (
                    <div key={g.id} className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
                      <button
                        type="button"
                        onClick={() => setExpandedCellId(expanded ? null : g.id)}
                        className={`w-full text-left p-4 transition ${expanded ? 'bg-indigo-100 border-b border-indigo-200' : 'hover:bg-slate-100'}`}
                      >
                        <p className="font-semibold text-slate-800 text-sm leading-tight">{g.cellName || 'Unnamed'}</p>
                        <p className="text-xs text-slate-500 mt-1">{count} selected</p>
                      </button>
                      {expanded && (
                        <div className="p-3 bg-white max-h-64 overflow-y-auto">
                          {loadingMembers ? (
                            <p className="text-xs text-slate-500">Loading members…</p>
                          ) : membersForCell.length === 0 ? (
                            <p className="text-xs text-slate-500">No active members.</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {membersForCell.map((m) => {
                                const nm = (m.name || '').trim()
                                const sel = selectedForCell(g.id).has(nm)
                                return (
                                  <button
                                    key={m.id}
                                    type="button"
                                    disabled={!cellsEdit || !nm}
                                    onClick={() => toggleMemberAttendance(g.id, nm)}
                                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                                      sel
                                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm'
                                        : 'bg-slate-100 text-slate-800 border-slate-200 hover:bg-slate-200'
                                    } ${!cellsEdit ? 'opacity-70 cursor-default' : ''}`}
                                  >
                                    {nm || '—'}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {cellGroups.length === 0 && <p className="text-sm text-slate-500">No cell groups found. Add cells under Cell department.</p>}
            </AttendanceSectionShell>

            <AttendanceSectionShell
              sectionRef={pastoralSectionRef}
              completed={completedSections.pastoral}
              isActive={activeSectionId === 'pastoral'}
              canManage={canEditEffective}
              onDone={() => handleAttendanceDone('pastoral')}
              onUndo={() => handleAttendanceUndo('pastoral')}
            >
              <NameListSection
                title={PASTORAL_KEY.title}
                names={report?.[PASTORAL_KEY.key] || []}
                canEdit={pastoralEdit}
                onAdd={() => addCellName(PASTORAL_KEY.key)}
                onEdit={(idx, value) => updateCellList(PASTORAL_KEY.key, idx, value)}
                onRemove={(idx) => removeCellName(PASTORAL_KEY.key, idx)}
                className="border-0 shadow-none bg-transparent p-0"
              />
            </AttendanceSectionShell>

            {/* ── New Comers — auto-populated from D-Light Visitors ── */}
            <div ref={newComersSectionRef} className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-800">New Comers</h3>
                <span className="text-xs text-indigo-500 font-medium bg-indigo-100 px-2 py-0.5 rounded-full">
                  From D-Light Visitors
                </span>
              </div>

              {loadingDlight ? (
                <p className="text-sm text-slate-400 py-2">Loading from D-Light visitors…</p>
              ) : dlightSuggestions.length === 0 ? (
                <p className="text-sm text-slate-400 py-2">
                  No visitors recorded for this Sunday in D-Light yet.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {dlightSuggestions.map((name, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-sm text-slate-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                      {name}
                    </li>
                  ))}
                </ul>
              )}

              <p className="text-xs text-slate-400 mt-3">
                Names are pulled automatically from D-Light visitor entries for this week.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {MANUAL_ONLY_KEYS.map(({ key, title }) => {
                const refMap = {
                  others: othersSectionRef,
                  secondWeekAttendeesNames: secondWeekSectionRef,
                  riverKids: riverKidsSectionRef,
                }
                const sectionRef = refMap[key]
                const manualEdit = canEditEffective && !completedSections[key]
                return (
                  <AttendanceSectionShell
                    key={key}
                    sectionRef={sectionRef}
                    completed={completedSections[key]}
                    isActive={activeSectionId === key}
                    canManage={canEditEffective}
                    onDone={() => handleAttendanceDone(key)}
                    onUndo={() => handleAttendanceUndo(key)}
                  >
                    <NameListSection
                      title={title}
                      names={report?.[key] || []}
                      canEdit={manualEdit}
                      onAdd={() => addCellName(key)}
                      onEdit={(idx, value) => updateCellList(key, idx, value)}
                      onRemove={(idx) => removeCellName(key, idx)}
                      className="border-0 shadow-none bg-transparent p-0"
                    />
                  </AttendanceSectionShell>
                )
              })}
            </div>

          </>
        )}
      </div>

      <AnimatePresence>
        {showCompleteModal && (
          <ServiceCompleteModal
            sortedProgram={sortedProgram}
            programLogs={programLogs}
            summaryComputed={summaryComputed}
            sundaySchoolValue={report?.summary?.sundaySchool ?? ''}
            onSundaySchoolChange={(v) => updateSummary('sundaySchool', v)}
            saving={saving}
            onSave={async () => {
              await handleSave()
              setShowCompleteModal(false)
              setSelectedDate(format(addWeeks(new Date(selectedDate), 1), 'yyyy-MM-dd'))
            }}
            onClose={() => setShowCompleteModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Service Complete Modal ───────────────────────────────────────────────────

function ServiceCompleteModal({ sortedProgram, programLogs, summaryComputed, sundaySchoolValue, onSundaySchoolChange, saving, onSave, onClose }) {
  const { cellRows, othersCount, secondWeekCount, newcomersCount, riverKidsCount, sundaySchool, totalAdults, total } = summaryComputed
  const logByName = {}
  for (const log of programLogs) {
    const key = String(log.programName || '').trim().toLowerCase()
    if (key && !logByName[key]) logByName[key] = log
  }
  const logForItem = (item) => logByName[String(item?.programName || '').trim().toLowerCase()] || null

  return (
    <>
      <motion.div
        key="sc-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-50"
        onClick={onClose}
      />
      <motion.div
        key="sc-sheet"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="px-6 pt-2 pb-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="text-xl font-bold text-slate-900">Service Complete</h2>
          <p className="text-slate-500 text-sm mt-0.5">Review the service before saving the report.</p>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {/* Program timings */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">⏱ Program Timings</p>
            <div className="space-y-1.5">
              {sortedProgram.map((item, idx) => {
                const log = logForItem(item)
                const t = log?.startTime instanceof Date ? log.startTime : (log?.startTime ? new Date(log.startTime) : null)
                return (
                  <div key={idx} className="flex items-center justify-between px-4 py-3 rounded-2xl bg-slate-50">
                    <span className="font-semibold text-slate-800 text-sm">{item.programName}</span>
                    <span className="text-slate-500 text-sm font-medium tabular-nums">
                      {t ? format(t, 'h:mm a') : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Attendance summary */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">👥 Attendance Summary</p>
            <div className="space-y-1.5">
              {cellRows.map((r) => (
                <div key={r.id} className="flex justify-between px-4 py-2 rounded-xl bg-slate-50 text-sm">
                  <span className="text-slate-600">{r.name}</span>
                  <span className="font-semibold tabular-nums text-slate-800">{r.count}</span>
                </div>
              ))}
              <div className="flex justify-between px-4 py-2 rounded-xl bg-slate-50 text-sm">
                <span className="text-slate-600">Others</span>
                <span className="tabular-nums text-slate-800">{othersCount}</span>
              </div>
              <div className="flex justify-between items-center px-4 py-2 rounded-xl bg-slate-50 text-sm">
                <span className="text-slate-600">Sunday School</span>
                <input
                  type="number"
                  min="0"
                  value={sundaySchoolValue}
                  onChange={(e) => onSundaySchoolChange(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-20 px-2 py-1 rounded border border-slate-300 text-right text-sm tabular-nums"
                />
              </div>
              <div className="flex justify-between px-4 py-2 rounded-xl bg-slate-50 text-sm">
                <span className="text-slate-600">Second Week Comers</span>
                <span className="tabular-nums text-slate-800">{secondWeekCount}</span>
              </div>
              <div className="flex justify-between px-4 py-2 rounded-xl bg-slate-50 text-sm">
                <span className="text-slate-600">New Comers</span>
                <span className="tabular-nums text-slate-800">{newcomersCount}</span>
              </div>
              <div className="flex justify-between px-4 py-2 rounded-xl bg-slate-50 text-sm">
                <span className="text-slate-600">River Kids</span>
                <span className="tabular-nums text-slate-800">{riverKidsCount}</span>
              </div>
              <div className="flex justify-between px-4 py-3 rounded-2xl bg-indigo-50 text-sm font-semibold">
                <span className="text-indigo-900">Total Adults</span>
                <span className="tabular-nums text-indigo-900">{totalAdults}</span>
              </div>
              <div className="flex justify-between px-4 py-3 rounded-2xl bg-indigo-100 text-sm font-bold">
                <span className="text-indigo-900">Total</span>
                <span className="tabular-nums text-indigo-900">{total}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-5 border-t border-slate-100 flex-shrink-0 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3.5 rounded-2xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-all"
          >
            Go Back
          </button>
          <motion.button
            type="button"
            onClick={onSave}
            disabled={saving}
            whileTap={{ scale: 0.97 }}
            className="flex-1 py-3.5 rounded-2xl bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 transition-all shadow-lg shadow-emerald-200 disabled:opacity-60"
          >
            {saving ? 'Saving…' : '✅ Save Report'}
          </motion.button>
        </div>
      </motion.div>
    </>
  )
}
