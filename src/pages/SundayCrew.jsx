import { useEffect, useMemo, useState } from 'react'
import { format, addWeeks } from 'date-fns'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isPreServiceLeaderInPositions } from '../utils/sundayMinistryAccess'
import MemberPicker from '../components/MemberPicker'
import {
  getSundayPreServiceEntry,
  setSundayPreServiceMonth,
  getDepartmentTeamMembers,
  getDepartmentSubDepartments,
  getSundayCrewScheduleByDate,
  setSundayCrewScheduleByDate,
} from '../services/firestore'

function nextSunday() {
  const today = new Date()
  const daysUntil = today.getDay() === 0 ? 0 : 7 - today.getDay()
  const d = new Date(today)
  d.setDate(today.getDate() + daysUntil)
  return format(d, 'yyyy-MM-dd')
}

// Normalizes a sub-department name for comparison (case/whitespace/hyphen
// insensitive) — mirrors DepartmentHub.jsx's subDeptMatchKey convention so
// "Pre-Service", "pre service", "Pre Services" etc. all match the same way.
function subDeptKey(name) {
  return String(name || '').trim().toLowerCase().replace(/[\s-]+/g, ' ').replace(/s$/, '')
}
const PRE_SERVICE_SUBDEPT_KEY = subDeptKey('Pre-Service')

function SubTabBar({ active, onChange, tabs }) {
  return (
    <div className="flex gap-1 border-b border-slate-200 mb-6">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
            active === t.id
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// Every Sunday (yyyy-MM-dd) in a given month — same convention as SEC Core's
// Sunday Leader schedule (monthSundays, SecCoreSummary.jsx), which this table
// is deliberately aligned with.
function monthSundays(year, month) {
  const dates = []
  const d = new Date(year, month, 1)
  while (d.getMonth() === month) {
    if (d.getDay() === 0) dates.push(format(d, 'yyyy-MM-dd'))
    d.setDate(d.getDate() + 1)
  }
  return dates
}

const EMPTY_PRE_SERVICE_FORM = { speakers: [] }
const MAX_PRE_SERVICE_SPEAKERS = 5

// Controlled table row — value/onChange come from the parent so "Save Month
// Schedule" can batch-write every row in one call instead of each row saving
// itself (same pattern as SEC Core's SundayLeaderRow). Read-only typography by
// default; inputs only swap in while the parent's edit toggle is active.
// Date + Speakers only — no Leader/Topics/Status/Actions columns. Pre-Service
// Leader is a standing position assigned via Admin User Management (see
// isPreServiceLeaderInPositions), not a per-Sunday pick in this table; the
// leader who holds that position is the one using this table to assign speakers.
function PreServiceRow({ date, value, onChange, team, loading, canEdit }) {
  const d = new Date(date + 'T00:00:00')

  const addSpeaker = (name) => {
    if (!name || value.speakers.includes(name) || value.speakers.length >= MAX_PRE_SERVICE_SPEAKERS) return
    onChange({ ...value, speakers: [...value.speakers, name] })
  }
  const removeSpeaker = (name) => onChange({ ...value, speakers: value.speakers.filter((s) => s !== name) })

  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 transition-colors">
      <td className="px-4 py-3 align-top whitespace-nowrap">
        <p className="text-sm font-semibold text-slate-800">{format(d, 'dd MMM yyyy')}</p>
        <p className="text-xs text-slate-400">{format(d, 'EEEE')}</p>
      </td>

      {/* Speakers — dynamic multi-select, 1 to 5 per Sunday */}
      <td className="px-4 py-3 align-top min-w-[200px]">
        {loading ? (
          <span className="text-sm text-slate-300">—</span>
        ) : (
          <div className="space-y-1.5">
            {value.speakers.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {value.speakers.map((name) => (
                  <span key={name} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                    {name}
                    {canEdit && (
                      <button type="button" onClick={() => removeSpeaker(name)} className="text-indigo-400 hover:text-red-500 leading-none" aria-label={`Remove ${name}`}>×</button>
                    )}
                  </span>
                ))}
              </div>
            ) : !canEdit ? (
              <span className="text-sm text-slate-400">—</span>
            ) : null}
            {canEdit && value.speakers.length < MAX_PRE_SERVICE_SPEAKERS && (
              <select
                value=""
                onChange={(e) => addSpeaker(e.target.value)}
                className="w-full min-w-[160px] px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
              >
                <option value="">+ Add speaker ({value.speakers.length}/{MAX_PRE_SERVICE_SPEAKERS})</option>
                {team.filter((m) => !value.speakers.includes(m.name)).map((m) => (
                  <option key={m.id} value={m.name}>{m.name}</option>
                ))}
              </select>
            )}
          </div>
        )}
      </td>
    </tr>
  )
}

// Monthly schedule table, aligned with SEC Core's Sunday Leader view (same
// month-nav + batch-edit-then-save shape) — minus the Psalm column SEC Core
// has, plus a 1–5 dynamic multi-select for Speakers in place of a single pick.
// Date + Speakers only. The Pre-Service Leader is a standing position (assigned
// via Admin User Management → positions, see isPreServiceLeaderInPositions) —
// that person is who's using this table each week to assign Speakers, not
// something chosen per-Sunday here.
function PreServiceTab({ canEdit, userProfile }) {
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  // Speaker options come from the Sunday Ministry team roster (Operations >
  // Team), filtered to active members whose sub-department is "Pre-Service" —
  // not the general church directory.
  const [preServiceTeam, setPreServiceTeam] = useState([])
  const [preServiceTeamLoading, setPreServiceTeamLoading] = useState(true)

  const [entries, setEntries] = useState({})       // date -> { speakers[] } (editable)
  const [savedEntries, setSavedEntries] = useState({})  // date -> same shape | undefined (last-persisted)
  const [entriesLoading, setEntriesLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  // Read-only by default — the whole month's rows only become interactive
  // (and Save/Cancel appear) once Edit Schedule is tapped, matching SEC Core's
  // batch-save design (one "Save Month Schedule" for every row).
  const [editMode, setEditMode] = useState(false)

  const prevMonth = () => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  const nextMonth = () => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))

  const sundaysInMonth = useMemo(
    () => monthSundays(monthCursor.getFullYear(), monthCursor.getMonth()),
    [monthCursor]
  )

  useEffect(() => {
    setPreServiceTeamLoading(true)
    getDepartmentTeamMembers('Sunday Ministry')
      .then((members) => {
        const preService = (members || [])
          .filter((m) => !m.isFormer && m.status !== 'inactive')
          .filter((m) => (m.subDepartments || []).some((sd) => subDeptKey(sd) === PRE_SERVICE_SUBDEPT_KEY))
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        setPreServiceTeam(preService)
      })
      .catch(() => setPreServiceTeam([]))
      .finally(() => setPreServiceTeamLoading(false))
  }, [])

  useEffect(() => {
    let cancelled = false
    setEntriesLoading(true)
    setSaveMessage('')
    Promise.all(sundaysInMonth.map((date) => getSundayPreServiceEntry(date)))
      .then((results) => {
        if (cancelled) return
        const nextEntries = {}
        const nextSaved = {}
        sundaysInMonth.forEach((date, i) => {
          const e = results[i]
          const val = { speakers: e?.speakers || [] }
          nextEntries[date] = val
          nextSaved[date] = e ? { ...val } : undefined
        })
        setEntries(nextEntries)
        setSavedEntries(nextSaved)
      })
      .finally(() => { if (!cancelled) setEntriesLoading(false) })
    return () => { cancelled = true }
  }, [sundaysInMonth])

  const updateEntry = (date, value) => setEntries((prev) => ({ ...prev, [date]: value }))

  /** Discards any in-progress edits (reverting every row to its last-saved
   * state, or blank if never saved) and drops back to read-only view. */
  const handleCancelEdit = () => {
    const reverted = {}
    sundaysInMonth.forEach((date) => {
      reverted[date] = savedEntries[date] ? { ...savedEntries[date] } : { ...EMPTY_PRE_SERVICE_FORM }
    })
    setEntries(reverted)
    setSaveMessage('')
    setEditMode(false)
  }

  const handleSaveMonth = async () => {
    setSaving(true)
    setSaveMessage('')
    const updatedBy = userProfile?.email || 'unknown'
    try {
      const payload = sundaysInMonth.map((date) => ({
        date,
        speakers: entries[date]?.speakers || [],
      }))
      await setSundayPreServiceMonth(payload, updatedBy)

      const nextSaved = {}
      payload.forEach((p) => { nextSaved[p.date] = { speakers: p.speakers } })
      setSavedEntries(nextSaved)
      setSaveMessage(`${format(monthCursor, 'MMMM yyyy')} schedule saved`)
      setEditMode(false)
    } catch (e) {
      console.error(e)
      alert('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Pre-Service</h2>
          <p className="text-xs text-slate-500 mt-0.5">Monthly Pre-Service schedule</p>
        </div>
        {canEdit && !editMode && (
          <button
            type="button"
            onClick={() => setEditMode(true)}
            className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Edit Schedule
          </button>
        )}
      </div>

      {/* Month navigation + Save Month Schedule */}
      <div className="flex items-center justify-between gap-3 bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button type="button" onClick={prevMonth} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">‹ Prev Month</button>
          <span className="font-semibold text-slate-800 text-sm">{format(monthCursor, 'MMMM yyyy')}</span>
          <button type="button" onClick={nextMonth} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">Next Month ›</button>
        </div>
        {canEdit && editMode && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancelEdit}
              disabled={saving}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-semibold hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveMonth}
              disabled={saving || entriesLoading}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-40 transition-colors shadow-sm"
            >
              {saving ? 'Saving…' : 'Save Month Schedule'}
            </button>
          </div>
        )}
      </div>

      {saveMessage && (
        <p className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{saveMessage}</p>
      )}

      {canEdit && editMode && !preServiceTeamLoading && preServiceTeam.length === 0 && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          No active Pre-Service team members found. Add members to the Pre-Service sub-department in Operations → Team first.
        </p>
      )}

      {/* Monthly Sunday schedule — single consolidated card table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Date</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Speakers</th>
              </tr>
            </thead>
            <tbody>
              {sundaysInMonth.map((date) => (
                <PreServiceRow
                  key={date}
                  date={date}
                  value={entries[date] || EMPTY_PRE_SERVICE_FORM}
                  onChange={(value) => updateEntry(date, value)}
                  team={preServiceTeam}
                  loading={entriesLoading || preServiceTeamLoading}
                  canEdit={canEdit && editMode}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// Role-slot accent cycle — Sunday Ministry's crew sub-departments are
// director-defined (Operations > Sub Department), not a fixed list, so accents
// are assigned by row position rather than by name. Same convention as Media's
// Assign tab (MEDIA_ROLE_ACCENTS, DepartmentHub.jsx).
const CREW_ROLE_ACCENTS = [
  { border: 'border-l-indigo-400', pill: 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200', avatar: 'bg-indigo-500', label: 'text-indigo-700' },
  { border: 'border-l-emerald-400', pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200', avatar: 'bg-emerald-500', label: 'text-emerald-700' },
  { border: 'border-l-amber-400', pill: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200', avatar: 'bg-amber-500', label: 'text-amber-700' },
  { border: 'border-l-rose-400', pill: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200', avatar: 'bg-rose-500', label: 'text-rose-700' },
  { border: 'border-l-sky-400', pill: 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200', avatar: 'bg-sky-500', label: 'text-sky-700' },
  { border: 'border-l-violet-400', pill: 'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200', avatar: 'bg-violet-500', label: 'text-violet-700' },
]
function crewRoleAccent(index) {
  return CREW_ROLE_ACCENTS[index % CREW_ROLE_ACCENTS.length]
}

function upcomingSundaysList(count = 5) {
  const out = []
  let d = new Date(nextSunday() + 'T12:00:00')
  for (let i = 0; i < count; i++) {
    out.push(format(d, 'yyyy-MM-dd'))
    d = addWeeks(d, 1)
  }
  return out
}

// Snaps a free-typed date to its nearest Sunday, same convention as
// normalizeToSunday (firestore.js) / mediaSnapToSunday (DepartmentHub.jsx).
function snapToSunday(dateStr) {
  const d = new Date(String(dateStr).slice(0, 10) + 'T12:00:00')
  if (isNaN(d.getTime())) return dateStr
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7))
  return format(d, 'yyyy-MM-dd')
}

// Weekly Crew — aligned to the D-Light/Media Assign tab pattern: predefined
// role slots (one per Sunday Ministry sub-department, from Operations > Team),
// each a MemberPicker scoped to active team members explicitly assigned to
// that sub-department, editable behind an Edit/Cancel/Save lifecycle rather
// than always-on freeform inputs.
function CrewTab({ canEdit, userProfile }) {
  const [team, setTeam] = useState([])
  const [teamLoading, setTeamLoading] = useState(true)
  const [subDepartments, setSubDepartments] = useState([])
  const [subDeptLoading, setSubDeptLoading] = useState(true)

  const [assignDate, setAssignDate] = useState(nextSunday)
  const [rows, setRows] = useState([])
  const [savedStamp, setSavedStamp] = useState(null)
  const [loadingSchedule, setLoadingSchedule] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setTeamLoading(true)
    getDepartmentTeamMembers('Sunday Ministry')
      .then((members) => setTeam((members || []).filter((m) => !m.isFormer && m.status !== 'inactive')))
      .catch(() => setTeam([]))
      .finally(() => setTeamLoading(false))
  }, [])

  useEffect(() => {
    setSubDeptLoading(true)
    getDepartmentSubDepartments('Sunday Ministry')
      .then(setSubDepartments)
      .catch(() => setSubDepartments([]))
      .finally(() => setSubDeptLoading(false))
  }, [])

  useEffect(() => {
    if (subDeptLoading) return
    setLoadingSchedule(true)
    setEditing(false)
    getSundayCrewScheduleByDate(assignDate)
      .then((doc) => {
        const saved = Array.isArray(doc?.assignments) ? doc.assignments : []
        const byRow = {}
        saved.forEach((a) => {
          if (!a.memberId) return
          const key = a.subDeptId || `role:${a.role}`
          if (!byRow[key]) byRow[key] = []
          byRow[key].push({ id: a.memberId, name: a.memberName || '' })
        })
        const nextRows = subDepartments.map((sd) => ({
          subDeptId: sd.id,
          role: sd.name,
          members: byRow[sd.id] || byRow[`role:${sd.name}`] || [],
        }))
        setRows(nextRows)
        setSavedStamp(nextRows.some((r) => r.members.length) ? nextRows.map((r) => ({ ...r, members: [...r.members] })) : null)
      })
      .catch(() => {
        setRows(subDepartments.map((sd) => ({ subDeptId: sd.id, role: sd.name, members: [] })))
        setSavedStamp(null)
      })
      .finally(() => setLoadingSchedule(false))
  }, [assignDate, subDepartments, subDeptLoading])

  const memberSubDepts = (m) => (Array.isArray(m.subDepartments) ? m.subDepartments : (m.subDepartment ? [m.subDepartment] : []))
  const memberDetail = (m) => (memberSubDepts(m).length ? memberSubDepts(m).join(' · ') : (m.role || ''))
  const eligibleFor = (roleName) => {
    const key = subDeptKey(roleName)
    return team.filter((m) => memberSubDepts(m).some((sd) => subDeptKey(sd) === key))
  }
  const addablePeopleFor = (row) => eligibleFor(row.role).filter((m) => !(row.members || []).some((am) => am.id === m.id))

  const addPersonToRow = (subDeptId, id, name) => {
    if (!id) return
    setRows((prev) => prev.map((r) => {
      if (r.subDeptId !== subDeptId) return r
      if ((r.members || []).some((m) => m.id === id)) return r
      return { ...r, members: [...(r.members || []), { id, name }] }
    }))
  }
  const removePersonFromRow = (subDeptId, id) => {
    setRows((prev) => prev.map((r) => (r.subDeptId === subDeptId ? { ...r, members: (r.members || []).filter((m) => m.id !== id) } : r)))
  }

  const cancelEdit = () => {
    setRows(
      savedStamp
        ? savedStamp.map((r) => ({ ...r, members: [...(r.members || [])] }))
        : subDepartments.map((sd) => ({ subDeptId: sd.id, role: sd.name, members: [] }))
    )
    setEditing(false)
  }

  const saveRows = async () => {
    setSaving(true)
    try {
      const assignments = rows.flatMap((r) =>
        (r.members || []).map((m) => ({ subDeptId: r.subDeptId || '', role: r.role, memberId: m.id, memberName: m.name || '' }))
      )
      await setSundayCrewScheduleByDate(assignDate, assignments, userProfile?.email || 'unknown')
      setSavedStamp(rows.some((r) => (r.members || []).length) ? rows.map((r) => ({ ...r, members: [...(r.members || [])] })) : null)
      setEditing(false)
    } catch (e) { console.error(e); alert('Failed to save crew assignments') }
    setSaving(false)
  }

  const loading = teamLoading || subDeptLoading || loadingSchedule

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-4 border-b border-slate-200 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-800">Weekly Crew</h2>
          {canEdit && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors text-sm font-medium"
            >
              Edit Plan
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">Coming Sundays</span>
            {upcomingSundaysList(5).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setAssignDate(d)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                  assignDate === d
                    ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400 hover:text-indigo-700 hover:bg-indigo-50'
                }`}
              >
                {format(new Date(d), 'd MMM')}
              </button>
            ))}
            <input
              type="date"
              value={assignDate}
              onChange={(e) => { if (e.target.value) setAssignDate(snapToSunday(e.target.value)) }}
              className="px-2 py-1 text-sm rounded-lg border border-slate-300 text-slate-600"
              title="Pick a custom Sunday date"
            />
          </div>
          {canEdit && editing && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={saving}
                onClick={cancelEdit}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={saveRows}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 shadow-sm"
              >
                {saving ? 'Saving…' : 'Save plan'}
              </button>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-5 text-center text-slate-500 text-sm">Loading…</div>
      ) : subDepartments.length === 0 ? (
        <div className="p-5 text-center text-slate-500 text-sm">
          No crew sub-departments found. Add role slots (e.g. Sound, Ushering) in Operations → Sub Department, then assign active members to them in Operations → Team.
        </div>
      ) : (
        <>
          {/* Mobile: one card per role */}
          <div className="md:hidden grid grid-cols-1 gap-3 p-4">
            {rows.map((r, i) => {
              const accent = crewRoleAccent(i)
              const rowMembers = r.members || []
              return (
                <div key={r.subDeptId} className={`rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-2 border-l-4 ${accent.border}`}>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${accent.pill}`}>{r.role}</span>
                  {editing ? (
                    <div className="flex flex-wrap gap-2 items-center min-h-[42px] p-2 bg-slate-50 border border-slate-200 rounded-lg">
                      {rowMembers.map((m) => (
                        <span key={m.id} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${accent.pill}`}>
                          {m.name}
                          <button type="button" onClick={() => removePersonFromRow(r.subDeptId, m.id)} className="font-bold leading-none text-sm opacity-60 hover:opacity-100 hover:text-red-600" aria-label={`Remove ${m.name}`}>×</button>
                        </span>
                      ))}
                      <MemberPicker
                        value=""
                        members={addablePeopleFor(r)}
                        allMembers={team}
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
                        <span key={m.id} className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold ${accent.pill}`}>{m.name}</span>
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
              {rows.map((r, i) => {
                const accent = crewRoleAccent(i)
                const rowMembers = r.members || []
                return (
                  <tr key={r.subDeptId} className={`hover:bg-indigo-50/40 border-l-4 ${accent.border}`}>
                    <td className="px-5 py-4 align-top">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${accent.pill}`}>{r.role}</span>
                    </td>
                    <td className="px-5 py-4 align-top">
                      {editing ? (
                        <div className="flex flex-wrap gap-2 items-center min-h-[42px] p-2 bg-slate-50 border border-slate-200 rounded-lg">
                          {rowMembers.map((m) => (
                            <span key={m.id} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${accent.pill}`}>
                              {m.name}
                              <button type="button" onClick={() => removePersonFromRow(r.subDeptId, m.id)} className="font-bold leading-none text-sm opacity-60 hover:opacity-100 hover:text-red-600" aria-label={`Remove ${m.name}`}>×</button>
                            </span>
                          ))}
                          <MemberPicker
                            value=""
                            members={addablePeopleFor(r)}
                            allMembers={team}
                            tint={accent.avatar}
                            getDetail={memberDetail}
                            hideClearOption
                            fitContent
                            emptyLabel={rowMembers.length === 0 ? '-- Not assigned --' : (addablePeopleFor(r).length === 0 ? 'No more eligible members' : '+ Add person')}
                            onChange={(id, name) => addPersonToRow(r.subDeptId, id, name)}
                          />
                        </div>
                      ) : rowMembers.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {rowMembers.map((m) => (
                            <span key={m.id} className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold ${accent.pill}`}>{m.name}</span>
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
  )
}

export default function SundayCrew() {
  const { isSundayMinistryDirector, userProfile } = useAuth()
  // Pre-Service Leader is a narrow position — it only unlocks the Pre-Service
  // section below, not Crew/the rest of Sunday Ministry (see
  // isPreServiceLeaderInPositions, sundayMinistryAccess.js).
  const isPreServiceLeader = isPreServiceLeaderInPositions(userProfile)
  const canAccessCrew = isSundayMinistryDirector
  const canAccessPreService = isSundayMinistryDirector || isPreServiceLeader
  const [subTab, setSubTab] = useState('preService')

  if (!canAccessCrew && !canAccessPreService) {
    return (
      <div className="p-8 text-slate-600">
        <Link to="/department/sunday-ministry" className="text-blue-600 hover:underline">← Sunday Ministry</Link>
        <p className="mt-4">You do not have access to Sunday Ministry.</p>
      </div>
    )
  }

  // A leader-only user (no Crew access) never sees the Crew tab or lands on it.
  const activeTab = canAccessCrew ? subTab : 'preService'
  const tabs = [
    { id: 'preService', label: 'Pre-Service' },
    ...(canAccessCrew ? [{ id: 'crew', label: 'Assign' }] : []),
  ]

  return (
    <div>
      <div className="space-y-2 p-4 max-w-3xl">
        <h1 className="text-xl font-semibold text-slate-800">Assign</h1>
        {tabs.length > 1 && <SubTabBar active={activeTab} onChange={setSubTab} tabs={tabs} />}
        {activeTab === 'preService' && (
          <PreServiceTab canEdit={canAccessPreService} userProfile={userProfile} />
        )}
        {activeTab === 'crew' && <CrewTab canEdit={canAccessCrew} userProfile={userProfile} />}
      </div>
    </div>
  )
}
