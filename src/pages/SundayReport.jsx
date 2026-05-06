import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { format, addWeeks, subWeeks, parseISO, endOfDay } from 'date-fns'
import { useAuth } from '../context/AuthContext'
import {
  getSundayReport,
  setSundayReport,
  getCellGroups,
  getCellGroupMembers,
  getSundayProgramDefault,
  addSundayProgramLog,
  getSundayProgramLogsByDate,
} from '../services/firestore'
import DepartmentTabBar from '../components/DepartmentTabBar'

const MANUAL_ONLY_KEYS = [
  { key: 'newComers', title: 'New Comers' },
  { key: 'others', title: 'Others' },
  { key: 'secondWeekAttendeesNames', title: 'Second Week Attendees' },
]

const PASTORAL_KEY = { key: 'pastoralAttendees', title: 'Pastoral Attendees' }

/** Local-only UX: order for Done → scroll to next attendance section */
const ATTENDANCE_SECTION_ORDER = ['cells', 'pastoral', 'newComers', 'others', 'secondWeekAttendeesNames']


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

function NameListSection({ title, names, canEdit, onAdd, onEdit, onRemove, className = '' }) {
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${className || 'bg-white border-slate-200'}`}>
      <h3 className="font-semibold text-slate-800 mb-3">{title}</h3>
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
            className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-800"
          >
            {isCompleted ? 'Undo' : 'Done'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function SundayReport() {
  const { userProfile, canManageDepartment } = useAuth()
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cellGroups, setCellGroups] = useState([])
  const [expandedCellId, setExpandedCellId] = useState(null)
  const [membersForCell, setMembersForCell] = useState([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [programItems, setProgramItems] = useState([])
  const [programLogs, setProgramLogs] = useState([])
  /** Local-only: which attendance sections are marked done (no Firestore) */
  const [completedSections, setCompletedSections] = useState({})

  const cellsSectionRef = useRef(null)
  const pastoralSectionRef = useRef(null)
  const newComersSectionRef = useRef(null)
  const othersSectionRef = useRef(null)
  const secondWeekSectionRef = useRef(null)

  const sectionRefById = useMemo(
    () => ({
      cells: cellsSectionRef,
      pastoral: pastoralSectionRef,
      newComers: newComersSectionRef,
      others: othersSectionRef,
      secondWeekAttendeesNames: secondWeekSectionRef,
    }),
    []
  )

  const canEdit = canManageDepartment('Sunday Ministry')

  /** After end of the selected report date (local), edits are locked (no Firestore change). */
  const reportDateLocked = useMemo(() => {
    if (!selectedDate) return false
    const d = parseISO(selectedDate)
    if (Number.isNaN(d.getTime())) return false
    return Date.now() > endOfDay(d).getTime()
  }, [selectedDate])

  const canEditEffective = canEdit && !reportDateLocked

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
    const newcomersCount    = (report?.newComers || []).filter(Boolean).length
    const pastoralCount     = (report?.pastoralAttendees || []).filter(Boolean).length
    const sundaySchool      = Number(report?.summary?.sundaySchool) || 0
    const cellTotal         = cellRows.reduce((s, r) => s + r.count, 0)
    const totalAdults       = cellTotal + othersCount + secondWeekCount + newcomersCount + pastoralCount
    const total             = totalAdults + sundaySchool
    return { cellRows, othersCount, secondWeekCount, newcomersCount, sundaySchool, totalAdults, total }
  }, [cellGroups, report])

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

  const loadCellGroups = useCallback(() => {
    getCellGroups('Cell')
      .then((groups) => setCellGroups((groups || []).filter((g) => g.status !== 'inactive')))
      .catch(() => setCellGroups([]))
  }, [])

  useEffect(() => {
    loadCellGroups()
  }, [loadCellGroups, selectedDate])

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

  useEffect(() => {
    getSundayProgramDefault().then((d) => setProgramItems(d.items || []))
  }, [selectedDate])

  useEffect(() => {
    getSundayProgramLogsByDate(selectedDate).then(setProgramLogs).catch(() => setProgramLogs([]))
  }, [selectedDate])

  useEffect(() => {
    setLoading(true)
    Promise.all([getSundayReport(selectedDate), getCellGroups('Cell')])
      .then(([r, groups]) => {
        const active = (groups || []).filter((g) => g.status !== 'inactive')
        let next = r || null
        if (next) {
          const hasSca =
            next.sundayCellAttendance &&
            typeof next.sundayCellAttendance === 'object' &&
            Object.keys(next.sundayCellAttendance).length > 0
          const migrated = hasSca ? next.sundayCellAttendance : migrateLegacyCellAttendance(next, active)
          next = {
            ...next,
            sundayCellAttendance: migrated,
            sundayMinistryTeam: [],
          }
        }
        setReport(next)
      })
      .catch(() => setReport(null))
      .finally(() => setLoading(false))
  }, [selectedDate])

  const updateReport = (patch) => setReport((prev) => (prev ? { ...prev, ...patch } : { ...patch }))

  const handleSave = async () => {
    if (!report || !canEdit) return
    setSaving(true)
    try {
      const { cellRows, othersCount, secondWeekCount, newcomersCount, sundaySchool, totalAdults, total } = summaryComputed
      const cellAttendanceCount = cellRows.reduce((s, r) => s + r.count, 0)

      const computedSummary = {
        ...report.summary,
        cellAttendance: cellAttendanceCount,
        newcomers: newcomersCount,
        secondWeekAttendees: secondWeekCount,
        sundaySchool,
        totalAdults,
        totalAttendance: total,
      }

      const timings = programLogs
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
  const removeCellName = (key, idx) => updateReport({ [key]: (report?.[key] || []).filter((_, i) => i !== idx) })

  const updateSummary = (key, value) => updateReport({ summary: { ...(report?.summary || {}), [key]: value } })
  const updatePreservice = (field, value) => updateReport({ preservice: { ...(report?.preservice || {}), [field]: value } })

  const sortedProgram = [...programItems].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const logAtIndex = (idx) => programLogs[idx] || null
  const nextProgramIndex = programLogs.length
  const currentProgramItem = sortedProgram[nextProgramIndex] || null

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
    } catch (e) {
      console.error(e)
      alert(e?.message || 'Failed to record time')
    }
  }

  if (!canManageDepartment('Sunday Ministry')) {
    return (
      <div className="p-8 text-slate-600">
        <Link to="/department/sunday-ministry" className="text-blue-600 hover:underline">
          ← Sunday Ministry
        </Link>
        <p className="mt-4">You do not have permission to view the Sunday Report.</p>
      </div>
    )
  }

  const selectedForCell = (cellId) => new Set(report?.sundayCellAttendance?.[cellId] || [])

  const cellsEdit = canEditEffective && !completedSections.cells
  const pastoralEdit = canEditEffective && !completedSections.pastoral

  return (
    <div>
      <DepartmentTabBar slug="sunday-ministry" activeTab="sundayReport" />
      <div className="space-y-6 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <label className="text-sm font-medium text-slate-700">Date:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300"
          />
          <button
            type="button"
            onClick={() => setSelectedDate(format(subWeeks(new Date(selectedDate), 1), 'yyyy-MM-dd'))}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
          >
            ← Prev
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate(format(addWeeks(new Date(selectedDate), 1), 'yyyy-MM-dd'))}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
          >
            Next →
          </button>
          {canEdit && !reportDateLocked && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save report'}
            </button>
          )}
        </div>

        {reportDateLocked && canEdit && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>Locked:</strong> This report date has passed (after 11:59 PM on that day). Editing is disabled; you
            can still view and export. Choose another date if you need to enter a different Sunday.
          </div>
        )}

        {canEditEffective && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-800">
                Attendance checklist progress: {attendanceProgressDone} / {attendanceProgressTotal} completed
              </span>
              <span className="text-xs text-slate-500 tabular-nums">{attendanceProgressPct}%</span>
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-indigo-600 transition-[width] duration-300"
                style={{ width: `${attendanceProgressPct}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1.5">Local progress only — use Save report to persist.</p>
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-slate-500">Loading report…</div>
        ) : (
          <>
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
              <p className="text-sm text-slate-500 mb-4">
                Cell groups come from the Cell department. Tap a cell to expand, then tap members to mark attendance.
              </p>
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {MANUAL_ONLY_KEYS.map(({ key, title }) => {
                const refMap = {
                  newComers: newComersSectionRef,
                  others: othersSectionRef,
                  secondWeekAttendeesNames: secondWeekSectionRef,
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

            {sortedProgram.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-slate-800">Program</h3>
                  <Link to="/department/sunday-ministry/sunday-program" className="text-sm text-indigo-600 hover:underline">
                    Edit program list →
                  </Link>
                </div>
                <ul className="text-sm divide-y divide-slate-100 border border-slate-100 rounded-lg">
                  {sortedProgram.map((item, idx) => {
                    const log = logAtIndex(idx)
                    return (
                      <li key={`${item.programName}-${idx}`} className="flex justify-between gap-4 px-3 py-2">
                        <span className="font-medium text-slate-800">{item.programName}</span>
                        <span className="text-slate-600 tabular-nums">
                          {log?.startTime
                            ? format(log.startTime instanceof Date ? log.startTime : new Date(log.startTime), 'HH:mm')
                            : '—'}
                        </span>
                      </li>
                    )
                  })}
                </ul>
                {canEditEffective && currentProgramItem && (
                  <div className="flex flex-col items-center pt-2">
                    <p className="text-sm text-slate-500 mb-2">Tap START when this segment begins.</p>
                    <button
                      type="button"
                      onClick={handleProgramStart}
                      className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg border-2 border-indigo-700 flex flex-col items-center justify-center cursor-pointer active:scale-[0.98] transition px-8 py-6"
                    >
                      <span className="text-2xl font-bold tracking-wide">START</span>
                      <span className="text-sm text-white/95 mt-2 font-medium">{currentProgramItem.programName}</span>
                    </button>
                  </div>
                )}
                {canEditEffective && !currentProgramItem && (
                  <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-center">
                    All program start times recorded for this date.
                  </p>
                )}
              </div>
            )}

            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-3">Preservice</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">Lead 1</label>
                  {canEditEffective ? (
                    <input
                      type="text"
                      value={report?.preservice?.lead1 || ''}
                      onChange={(e) => updatePreservice('lead1', e.target.value)}
                      className="w-full px-3 py-2 rounded border border-slate-300"
                    />
                  ) : (
                    <p className="text-slate-800">{report?.preservice?.lead1 || '—'}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">Lead 2</label>
                  {canEditEffective ? (
                    <input
                      type="text"
                      value={report?.preservice?.lead2 || ''}
                      onChange={(e) => updatePreservice('lead2', e.target.value)}
                      className="w-full px-3 py-2 rounded border border-slate-300"
                    />
                  ) : (
                    <p className="text-slate-800">{report?.preservice?.lead2 || '—'}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-4">Summary</h3>
              <div className="space-y-2 text-sm max-w-sm">
                {summaryComputed.cellRows.map((r) => (
                  <div key={r.id} className="flex justify-between">
                    <span className="text-slate-600">{r.name}</span>
                    <span className="tabular-nums font-medium text-slate-800">{r.count}</span>
                  </div>
                ))}
                <div className="flex justify-between">
                  <span className="text-slate-600">Others</span>
                  <span className="tabular-nums text-slate-800">{summaryComputed.othersCount}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Sunday School</span>
                  {canEditEffective ? (
                    <input
                      type="number"
                      min="0"
                      value={report?.summary?.sundaySchool ?? ''}
                      onChange={(e) => updateSummary('sundaySchool', e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-20 px-2 py-1 rounded border border-slate-300 text-right text-sm tabular-nums"
                    />
                  ) : (
                    <span className="tabular-nums text-slate-800">{summaryComputed.sundaySchool || '—'}</span>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Second Week Comers</span>
                  <span className="tabular-nums text-slate-800">{summaryComputed.secondWeekCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">New Comers</span>
                  <span className="tabular-nums text-slate-800">{summaryComputed.newcomersCount}</span>
                </div>
                <div className="flex justify-between font-semibold pt-2 border-t border-slate-200">
                  <span className="text-slate-800">Total Adults</span>
                  <span className="tabular-nums">{summaryComputed.totalAdults}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Children</span>
                  <span className="tabular-nums text-slate-800">{summaryComputed.sundaySchool || '—'}</span>
                </div>
                <div className="flex justify-between font-bold text-base pt-2 border-t border-slate-200">
                  <span>Total</span>
                  <span className="tabular-nums">{summaryComputed.total}</span>
                </div>
              </div>
            </div>

            {canEdit && !reportDateLocked && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save report'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
