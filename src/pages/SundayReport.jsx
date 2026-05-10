import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Link, useSearchParams } from 'react-router-dom'
import { format, addWeeks, subWeeks } from 'date-fns'
import { useAuth } from '../context/AuthContext'
import {
  getSundayReport,
  setSundayReport,
  getCellGroups,
  getCellGroupMembers,
  addSundayProgramLog,
  getSundayProgramLogsByDate,
} from '../services/firestore'
import DepartmentTabBar from '../components/DepartmentTabBar'

const MANUAL_ONLY_KEYS = [
  { key: 'newComers', title: 'New Comers' },
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
  const [searchParams] = useSearchParams()
  const [selectedDate, setSelectedDate] = useState(() => searchParams.get('date') || format(new Date(), 'yyyy-MM-dd'))
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cellGroups, setCellGroups] = useState([])
  const [expandedCellId, setExpandedCellId] = useState(null)
  const [membersForCell, setMembersForCell] = useState([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [programLogs, setProgramLogs] = useState([])
  const [showCompleteModal, setShowCompleteModal] = useState(false)
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

  const canEdit = canManageDepartment('Sunday Ministry')
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
    const newcomersCount    = (report?.newComers || []).filter(Boolean).length
    const pastoralCount     = (report?.pastoralAttendees || []).filter(Boolean).length
    const riverKidsCount    = (report?.riverKids || []).filter(Boolean).length
    const sundaySchool      = Number(report?.summary?.sundaySchool) || 0
    const cellTotal         = cellRows.reduce((s, r) => s + r.count, 0)
    const totalAdults       = cellTotal + othersCount + secondWeekCount + newcomersCount + pastoralCount
    const total             = totalAdults + sundaySchool + riverKidsCount
    return { cellRows, othersCount, secondWeekCount, newcomersCount, riverKidsCount, sundaySchool, totalAdults, total }
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

  const refreshAll = () => {
    setLoading(true)
    setCompletedSections({})
    Promise.all([getSundayReport(selectedDate), getCellGroups('Cell')])
      .then(([r, groups]) => {
        const active = (groups || []).filter((g) => g.status !== 'inactive')
        let next = r || null
        if (next) {
          const hasSca = next.sundayCellAttendance && typeof next.sundayCellAttendance === 'object' && Object.keys(next.sundayCellAttendance).length > 0
          next = { ...next, sundayCellAttendance: hasSca ? next.sundayCellAttendance : migrateLegacyCellAttendance(next, active), sundayMinistryTeam: [] }
        }
        setReport(next)
      })
      .catch(() => setReport(null))
      .finally(() => setLoading(false))
    getSundayProgramLogsByDate(selectedDate).then(setProgramLogs).catch(() => setProgramLogs([]))
  }

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
          cellBreakdown,
          programList: [],
          programTimings: timings,
          sundayMinistryTeam: [],
        },
        userProfile?.email || 'unknown'
      )
      setReport((prev) => (prev ? { ...prev, summary: computedSummary, programList: [] } : prev))
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

  const sortedProgram = [...(report?.programList || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
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
      if (logs.length >= sortedProgram.length) {
        setShowCompleteModal(true)
      }
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
          <button
            type="button"
            onClick={refreshAll}
            disabled={loading}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition"
          >
            ↻ Refresh
          </button>
          {canEdit && (
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
                const log = programLogs[idx]
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
