import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import {
  getDepartmentEvents,
  addDepartmentEvent,
  updateDepartmentEvent,
  deleteDepartmentEvent,
  getCellGroups,
  getCellGroupMembers,
} from '../../services/firestore'
import LiveElapsedTimer from '../LiveElapsedTimer'
import ProgramConfirmSheet from '../ProgramConfirmSheet'

/**
 * Event-M department's Events + Live Control tabs (moved out of DepartmentHub).
 * Mounted for both tabs so the selected event carries across when switching between them.
 */
export default function EventManagementTabs({ activeTab, department, canEdit, userProfile, onEditProgram }) {
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

  // Live Control
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

  useEffect(() => {
    if ((activeTab !== 'events' && activeTab !== 'liveControl') || !department) return
    setEventsLoading(true)
    getDepartmentEvents(department.name)
      .then(setDeptEvents)
      .catch(() => setDeptEvents([]))
      .finally(() => setEventsLoading(false))
  }, [activeTab, department])


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

  // Live Control – load cell groups for attendance
  useEffect(() => {
    if (activeTab !== 'liveControl' || liveControlTab !== 'attendance' || !department) return
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
  }, [activeTab, liveControlTab, department])

  // Live Control – load members for the expanded cell tile
  useEffect(() => {
    if (activeTab !== 'liveControl' || liveControlTab !== 'attendance') return
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
  }, [activeTab, liveControlTab, liveExpandedCellId])

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

  return (
    <>
          {activeTab === 'events' && (
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

          {activeTab === 'liveControl' && (
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
                                      onEdit={() => { setLiveConfirmOpen(false); onEditProgram() }}
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
    </>
  )
}
