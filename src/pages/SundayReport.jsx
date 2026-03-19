import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { format, addWeeks, subWeeks } from 'date-fns'
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

const SUMMARY_KEYS = [
  'totalVolunteers',
  'cellAttendance',
  'newcomers',
  'secondWeekAttendees',
  'riverKids',
  'englishServiceAttendance',
  'tamilServiceAttendance',
  'totalAdults',
  'totalAttendance',
]
const SUMMARY_LABELS = {
  totalVolunteers: 'Total Volunteers',
  cellAttendance: 'Cell Attendance',
  newcomers: 'Newcomers',
  secondWeekAttendees: 'Second Week Attendees',
  riverKids: 'River Kids',
  englishServiceAttendance: 'English Service Attendance',
  tamilServiceAttendance: 'Tamil Service Attendance',
  totalAdults: 'Total Adults',
  totalAttendance: 'Total Attendance',
}

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

function NameListSection({ title, names, canEdit, onAdd, onEdit, onRemove }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
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

  const canEdit = canManageDepartment('Sunday Ministry')

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
      await setSundayReport(
        selectedDate,
        {
          ...report,
          sundayMinistryTeam: [],
        },
        userProfile?.email || 'unknown'
      )
    } catch (err) {
      console.error(err)
      alert('Failed to save')
    }
    setSaving(false)
  }

  const toggleMemberAttendance = (cellId, memberName) => {
    const name = String(memberName || '').trim()
    if (!name || !canEdit) return
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
    if (!canEdit || !currentProgramItem) return
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

        {loading ? (
          <div className="py-12 text-center text-slate-500">Loading report…</div>
        ) : (
          <>
            {/* Attendance — cell tiles */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
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
                                    disabled={!canEdit || !nm}
                                    onClick={() => toggleMemberAttendance(g.id, nm)}
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
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {cellGroups.length === 0 && <p className="text-sm text-slate-500">No cell groups found. Add cells under Cell department.</p>}
            </div>

            <NameListSection
              title={PASTORAL_KEY.title}
              names={report?.[PASTORAL_KEY.key] || []}
              canEdit={canEdit}
              onAdd={() => addCellName(PASTORAL_KEY.key)}
              onEdit={(idx, value) => updateCellList(PASTORAL_KEY.key, idx, value)}
              onRemove={(idx) => removeCellName(PASTORAL_KEY.key, idx)}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {MANUAL_ONLY_KEYS.map(({ key, title }) => (
                <NameListSection
                  key={key}
                  title={title}
                  names={report?.[key] || []}
                  canEdit={canEdit}
                  onAdd={() => addCellName(key)}
                  onEdit={(idx, value) => updateCellList(key, idx, value)}
                  onRemove={(idx) => removeCellName(key, idx)}
                />
              ))}
            </div>

            {/* Program from sunday_program + timer */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-slate-800">Program</h3>
                <Link to="/department/sunday-ministry/sunday-program" className="text-sm text-indigo-600 hover:underline">
                  Edit program list →
                </Link>
              </div>
              {sortedProgram.length === 0 ? (
                <p className="text-sm text-slate-500">No program items yet. Configure them on the Sunday Program page.</p>
              ) : (
                <>
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
                  {canEdit && currentProgramItem && (
                    <div className="flex flex-col items-center pt-2">
                      <p className="text-sm text-slate-500 mb-2">Tap START when this segment begins (same flow as Cell timer).</p>
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
                  {canEdit && sortedProgram.length > 0 && !currentProgramItem && (
                    <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-center">
                      All program start times recorded for this date.
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-3">Preservice</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">Lead 1</label>
                  {canEdit ? (
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
                  {canEdit ? (
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
              <h3 className="font-semibold text-slate-800 mb-3">Summary</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {SUMMARY_KEYS.map((key) => (
                  <div key={key}>
                    <label className="block text-sm text-slate-600 mb-1">{SUMMARY_LABELS[key]}</label>
                    {canEdit ? (
                      <input
                        type="text"
                        value={report?.summary?.[key] ?? ''}
                        onChange={(e) => updateSummary(key, e.target.value)}
                        className="w-full px-3 py-2 rounded border border-slate-300"
                      />
                    ) : (
                      <p className="text-slate-800">{report?.summary?.[key] ?? '—'}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {canEdit && (
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
