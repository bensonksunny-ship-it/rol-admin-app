import { useEffect, useMemo, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { format, differenceInCalendarDays } from 'date-fns'
import { Plus, X, MoreVertical, Pencil, Trash2, ClipboardList, CalendarPlus, ChevronDown, Download, History as HistoryIcon, Search, Monitor, Play, Pause, SkipForward } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import html2canvas from 'html2canvas'
import {
  getSecCoreDirectorBoard,
  setSecCoreDirectorBoard,
  subscribeToDirectorBoard,
  getSecCoreSundayLeaderEntries,
  getSecCoreSundayLeaderEntry,
  setSecCoreSundayLeaderMonth,
  getAllSecCoreSundayLeaderEntries,
  subscribeToSundayLeaderPool,
  setSecCoreSundayLeaderPool,
  getUserByName,
  createSundayLeaderAssignmentNotification,
  subscribeToBoardPoints,
  updateBoardPoint,
  getSecCoreBoardMeetingStartTime,
  setSecCoreBoardMeetingStartTime,
  getMergedPeopleDirectory,
  subscribeFinanceExpenseByDept,
  createBoardMeeting,
  subscribeToBoardMeetings,
  subscribeToBoardMeetingLive,
  selectLivePoint,
  setLiveStatus,
} from '../../services/firestore'
import { formatDisplayDate, formatTime12h, addMinutesToTime, formatCountdown } from '../../utils/date'
import { DEPARTMENT_LIST } from '../../constants/departments'
import BoardPointsModal from '../../components/BoardPointsModal'

const DEPT_NAMES = DEPARTMENT_LIST.map(d => d.name)

function dur(from, to) {
  if (!from) return null
  const s = new Date(from), e = to ? new Date(to) : new Date()
  const totalMonths = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
  if (totalMonths < 1) return '<1m'
  const y = Math.floor(totalMonths / 12), m = totalMonths % 12
  return [y > 0 ? `${y}y` : '', m > 0 ? `${m}m` : ''].filter(Boolean).join(' ')
}

// ─── People search picker ─────────────────────────────────────────────────────

function PersonPicker({ value, onChange }) {
  // value = { personId, name } | null
  const [allPeople, setAllPeople] = useState(null)  // null = not loaded yet
  const [query, setQuery]         = useState('')
  const [open, setOpen]           = useState(false)
  const inputRef = useRef(null)

  // Load the full merged People Directory lazily on first focus — the same
  // "everybody" roster PeopleDirectory.jsx shows (people + cell members + dept/
  // worship teams + PCS + D-Light visitors, deduped), not just the sparse `people`
  // collection, so the picker can find someone regardless of which department or
  // role they're currently attached to.
  const loadPeople = () => {
    if (allPeople !== null) return
    getMergedPeopleDirectory()
      .then(({ people }) => {
        const sorted = [...people].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        setAllPeople(sorted)
      })
      .catch(() => setAllPeople([]))
  }

  // No result cap — the whole match set renders in a scrollable dropdown instead
  // of being truncated. Matches name, phone, or email, all case-insensitive.
  const results = allPeople
    ? (() => {
        const q = query.trim().toLowerCase()
        if (!q) return allPeople
        return allPeople.filter(p =>
          (p.name || '').toLowerCase().includes(q) ||
          (p.phone || '').toLowerCase().includes(q) ||
          (p.email || '').toLowerCase().includes(q)
        )
      })()
    : []

  const select = (p) => {
    onChange({ personId: p.personId || '', name: p.name || '' })
    setQuery('')
    setOpen(false)
  }

  const clear = () => {
    onChange(null)
    setQuery('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  if (value) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-indigo-300 bg-indigo-50">
        <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-black text-white flex-shrink-0">
          {value.name[0]?.toUpperCase() || '?'}
        </div>
        <span className="flex-1 text-sm font-semibold text-slate-800 truncate">{value.name}</span>
        <button type="button" onClick={clear} className="text-slate-400 hover:text-red-500 transition-colors flex-shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => { loadPeople(); setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search by name, phone, or email…"
        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
      />
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg overflow-y-auto max-h-64">
          {allPeople === null && (
            <p className="px-3 py-2 text-xs text-slate-400">Loading…</p>
          )}
          {allPeople !== null && results.length === 0 && (
            <p className="px-3 py-2 text-xs text-slate-400">No match in directory</p>
          )}
          {results.map(p => (
            <button
              key={p._key}
              type="button"
              // preventDefault on mousedown (not the selection itself) stops the input
              // from blurring first, so the button is still mounted when the click
              // completes. Doing selection in onMouseDown instead used to unmount this
              // dropdown mid-gesture — the mouseup then landed on the modal's backdrop
              // behind it, which fired the backdrop's onClick-to-dismiss handler and
              // reset the whole form the instant a person was picked.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(p)}
              className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition-colors border-b border-slate-100 last:border-0 flex items-center gap-2"
            >
              <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-black text-indigo-600 flex-shrink-0">
                {p.name?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{p.name}</p>
                {(p.phone || p.email) && (
                  <p className="text-[10px] text-slate-400 truncate">{[p.phone, p.email].filter(Boolean).join(' · ')}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Director Board tab ───────────────────────────────────────────────────────

const BLANK_MEMBER = { personId: '', name: '', role: '', type: 'director', department: '', from: '', to: '' }

const POSITION_STYLES = {
  director:    { active: 'bg-indigo-600 border-indigo-600 text-white', dot: 'bg-indigo-500', badge: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
  coordinator: { active: 'bg-violet-600 border-violet-600 text-white', dot: 'bg-violet-500', badge: 'bg-violet-50 text-violet-700 border-violet-100' },
  secretary:   { active: 'bg-emerald-600 border-emerald-600 text-white', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
}

function MemberForm({ value, onChange, onSubmit, onCancel, submitLabel }) {
  const person = value.personId ? { personId: value.personId, name: value.name } : null
  const style = POSITION_STYLES[value.type] || POSITION_STYLES.director

  const Field = ({ label, sub, children }) => (
    <div>
      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
        {label}{sub && <span className="normal-case font-normal tracking-normal text-slate-300 ml-1">{sub}</span>}
      </label>
      {children}
    </div>
  )

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Row 1: Position + Department */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Position">
          <select
            value={value.type}
            onChange={e => onChange({ ...value, type: e.target.value })}
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
          >
            <option value="director">Director</option>
            <option value="coordinator">Coordinator</option>
            <option value="secretary">Secretary</option>
          </select>
        </Field>
        <Field label="Department" sub="(optional)">
          <select
            value={value.department}
            onChange={e => onChange({ ...value, department: e.target.value })}
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
          >
            <option value="">— select —</option>
            {DEPT_NAMES.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
      </div>

      {/* Row 2: Person picker */}
      <Field label="Person" sub="(from People Directory)">
        <PersonPicker
          value={person}
          onChange={p => onChange({ ...value, personId: p?.personId || '', name: p?.name || '' })}
        />
      </Field>

      {/* Row 3: From + To */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="From">
          <input type="date" value={value.from || ''} onChange={e => onChange({ ...value, from: e.target.value })}
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </Field>
        <Field label="To" sub="(blank = current)">
          <input type="date" value={value.to || ''} onChange={e => onChange({ ...value, to: e.target.value })}
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </Field>
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-end pt-1">
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
        )}
        <button type="button" onClick={onSubmit} disabled={!value.name.trim()}
          className={`px-4 py-1.5 rounded-lg text-white text-xs font-bold disabled:opacity-40 transition-colors ${style.active}`}>
          {submitLabel}
        </button>
      </div>
    </div>
  )
}

export function DirectorBoardTab({ canEdit, userProfile, onOpenMeetingAgenda, onScheduleMeeting }) {
  const [members, setMembers]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saveError, setSaveError] = useState('')
  const [newMember, setNewMember] = useState(BLANK_MEMBER)
  const [editIdx, setEditIdx]   = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [meetings, setMeetings] = useState([])

  useEffect(() => {
    const unsub = subscribeToDirectorBoard(
      (d) => { setMembers(d.members || []); setLoading(false) },
      ()  => {
        // Listener failed — fall back to one-time read
        getSecCoreDirectorBoard()
          .then(d => setMembers(d.members || []))
          .catch(() => {})
          .finally(() => setLoading(false))
      }
    )
    return unsub
  }, [])

  useEffect(() => {
    const unsub = subscribeToBoardMeetings(setMeetings, () => setMeetings([]))
    return unsub
  }, [])

  // Upcoming first (today or later), soonest first; keep at most the next 6 so the
  // list can't grow unbounded as old meetings accumulate.
  const upcomingMeetings = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd')
    return meetings.filter(m => m.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6)
  }, [meetings])

  const save = async (nextMembers) => {
    setSaving(true)
    setSaveError('')
    try {
      await setSecCoreDirectorBoard({ members: nextMembers }, userProfile?.displayName || userProfile?.email)
    } catch (e) {
      console.error('Director board save failed:', e)
      setSaveError('Save failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const addMember = () => {
    if (!newMember.name.trim()) return
    const next = [...members, {
      personId: newMember.personId || '',
      name: newMember.name.trim(),
      role: newMember.role.trim(),
      type: newMember.type,
      department: newMember.department?.trim() || '',
      from: newMember.from || '',
      to: newMember.to || '',
    }]
    setNewMember(BLANK_MEMBER)
    setShowForm(false)
    save(next)
  }

  const applyEdit = () => {
    if (editIdx == null) return
    const next = members.map((m, i) =>
      i === editIdx ? {
        personId: newMember.personId || m.personId || '',
        name: newMember.name.trim() || m.name,
        role: newMember.role.trim(),
        type: newMember.type,
        department: newMember.department?.trim() || '',
        from: newMember.from || '',
        to: newMember.to || '',
      } : m
    )
    setEditIdx(null)
    setNewMember(BLANK_MEMBER)
    save(next)
  }

  const removeMember = (idx) => save(members.filter((_, i) => i !== idx))

  if (loading) return <p className="text-sm text-slate-400">Loading…</p>

  // Group members by type; treat legacy entries (no type) as directors
  const byType = {
    director:    members.filter(m => !m.type || m.type === 'director'),
    coordinator: members.filter(m => m.type === 'coordinator'),
    secretary:   members.filter(m => m.type === 'secretary'),
  }

  const MemberRow = ({ m, idx }) => {
    const isEditing = editIdx === idx
    const style = POSITION_STYLES[m.type] || POSITION_STYLES.director
    const tenure = dur(m.from, m.to || null)
    const [menuOpen, setMenuOpen] = useState(false)

    if (isEditing) {
      return (
        <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
          <MemberForm
            value={newMember}
            onChange={setNewMember}
            onSubmit={applyEdit}
            onCancel={() => { setEditIdx(null); setNewMember(BLANK_MEMBER) }}
            submitLabel="Update"
          />
        </div>
      )
    }

    return (
      <div className="flex items-center gap-4 bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-slate-300 hover:shadow-sm transition-all">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0 ${style.dot}`}>
          {m.name[0]?.toUpperCase() || '?'}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{m.name}</p>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            {m.department && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${style.badge}`}>{m.department}</span>
            )}
            {m.role && <span className="text-xs text-slate-500">{m.role}</span>}
            {m.from && (
              <span className="text-[10px] text-slate-400">
                {new Date(m.from).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                {' – '}
                {m.to ? new Date(m.to).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : 'Present'}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {tenure && (
            <span className={`text-[10px] font-black px-2 py-1 rounded-full border whitespace-nowrap ${style.badge}`}>
              {tenure}
            </span>
          )}
          {canEdit && (
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setMenuOpen(v => !v)}
                aria-label="Member actions"
                className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <MoreVertical size={16} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
                  <div className="absolute right-0 top-full mt-1 z-20 w-36 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false)
                        setEditIdx(idx)
                        setNewMember({ personId: m.personId || '', name: m.name, role: m.role || '', type: m.type || 'director', department: m.department || '', from: m.from || '', to: m.to || '' })
                        setShowForm(false)
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      <Pencil size={13} /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => { setMenuOpen(false); removeMember(idx) }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={13} /> Remove
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  const SECTIONS = [
    { key: 'secretary',   label: 'Secretaries' },
    { key: 'director',    label: 'Directors' },
    { key: 'coordinator', label: 'Coordinators' },
  ]

  const typeLabel = (t) => t.charAt(0).toUpperCase() + t.slice(1)

  return (
    <div className="flex flex-col space-y-4 max-w-4xl mx-auto">

      {/* Page header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Director Board</h2>
          <p className="text-xs text-slate-500 mt-0.5">Secretaries, Directors &amp; Coordinators</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {canEdit && (
            <div className="relative group">
              <button
                type="button"
                onClick={() => onScheduleMeeting?.()}
                aria-label="Schedule Meeting"
                title="Schedule Meeting"
                className="w-11 h-11 flex items-center justify-center rounded-full bg-white border border-slate-300 text-slate-700 shadow-sm hover:bg-slate-50 hover:shadow-md active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:ring-offset-2"
              >
                <CalendarPlus size={18} strokeWidth={2.5} />
              </button>
              <span className="pointer-events-none absolute top-full right-0 mt-2 whitespace-nowrap rounded-lg bg-slate-900 text-white text-xs font-semibold px-2.5 py-1.5 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10">
                Schedule Meeting
              </span>
            </div>
          )}
          {canEdit && (
            <div className="relative group">
              <button
                type="button"
                onClick={() => { setShowForm(true); setEditIdx(null); setNewMember(BLANK_MEMBER) }}
                aria-label="Add Leader"
                title="Add Leader"
                className="w-11 h-11 flex items-center justify-center rounded-full bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 hover:shadow-md active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:ring-offset-2"
              >
                <Plus size={20} strokeWidth={2.5} />
              </button>
              <span className="pointer-events-none absolute top-full right-0 mt-2 whitespace-nowrap rounded-lg bg-slate-900 text-white text-xs font-semibold px-2.5 py-1.5 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10">
                Add Leader
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Scheduled Meetings — each opens the Board Agenda drawer pre-selected to that
          meeting's date; "View full board agenda" is the old always-available entry
          point, now living here instead of its own header icon. */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
          <h3 className="font-semibold text-slate-800 text-sm">Scheduled Meetings</h3>
          <button
            type="button"
            onClick={() => onOpenMeetingAgenda?.(null)}
            className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:underline"
          >
            <ClipboardList size={13} /> View full board agenda
          </button>
        </div>
        {upcomingMeetings.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-400">No upcoming meetings scheduled.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {upcomingMeetings.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onOpenMeetingAgenda?.(m.date)}
                  className="w-full text-left px-5 py-3 hover:bg-slate-50 transition-colors flex items-center gap-3"
                >
                  <div className="flex-shrink-0 w-11 text-center">
                    <p className="text-[10px] font-bold text-indigo-500 uppercase">{format(new Date(m.date + 'T00:00:00'), 'MMM')}</p>
                    <p className="text-lg font-black text-slate-800 leading-tight">{format(new Date(m.date + 'T00:00:00'), 'd')}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{m.title || 'Board Meeting'}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {[m.time, m.venue].filter(Boolean).join(' · ') || 'No time/venue set'}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {SECTIONS.map((sec) => {
        const secMembers = byType[sec.key]
        const style = POSITION_STYLES[sec.key]
        return (
          <div key={sec.key} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                <h3 className="font-semibold text-slate-800 text-sm">
                  {sec.label} <span className="text-slate-400 font-normal">({secMembers.length})</span>
                </h3>
              </div>
              {saving && <span className="text-xs text-slate-400">Saving…</span>}
            </div>

            <div className="p-4 space-y-2.5">
              {secMembers.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-slate-400 bg-slate-50/60 border border-dashed border-slate-200 rounded-lg">
                  No {sec.label.toLowerCase()} added yet.
                </div>
              ) : (
                secMembers.map((m, i) => {
                  const realIdx = members.indexOf(m)
                  return <MemberRow key={i} m={m} idx={realIdx} />
                })
              )}
            </div>
          </div>
        )
      })}

      {saveError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saveError}</p>
      )}

      {/* Add member modal */}
      {canEdit && showForm && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => { setShowForm(false); setNewMember(BLANK_MEMBER) }} />
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={() => { setShowForm(false); setNewMember(BLANK_MEMBER) }}>
            <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">Add Person</h3>
                <button type="button" onClick={() => { setShowForm(false); setNewMember(BLANK_MEMBER) }}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 transition-colors">
                  <X size={16} />
                </button>
              </div>
              <MemberForm
                value={newMember}
                onChange={setNewMember}
                onSubmit={addMember}
                onCancel={() => { setShowForm(false); setNewMember(BLANK_MEMBER) }}
                submitLabel={`+ Add ${typeLabel(newMember.type)}`}
              />
            </div>
          </div>
        </>
      )}

    </div>
  )
}

// ─── Schedule Meeting modal ───────────────────────────────────────────────────

const BLANK_MEETING = { title: '', date: '', time: '', venue: '' }

/** Schedules a Director Board meeting. Notifying the roster is handled by
 * BoardMeetingWorkspaceWidget reading sec_core_board_meetings directly (the workspace
 * banner) rather than by writing per-user notification docs here. */
function ScheduleMeetingModal({ userProfile, initialDate = null, onClose }) {
  const [form, setForm] = useState(() => (initialDate ? { ...BLANK_MEETING, date: initialDate } : BLANK_MEETING))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = form.title.trim() && form.date

  const handleSubmit = async () => {
    if (!canSubmit || saving) return
    setSaving(true)
    setError('')
    const createdBy = userProfile?.displayName || userProfile?.email || 'unknown'
    try {
      await createBoardMeeting({
        title: form.title.trim(),
        date: form.date,
        time: form.time,
        venue: form.venue.trim(),
        createdBy,
      })

      onClose()
    } catch (e) {
      console.error('Schedule meeting failed:', e)
      setError('Failed to schedule meeting. Please try again.')
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
        <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Schedule Board Meeting</h3>
            <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="px-5 py-4 space-y-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Meeting Title</label>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Monthly Board Meeting"
                autoFocus
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Time</label>
                <input
                  type="time"
                  value={form.time}
                  onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Venue / Link</label>
              <input
                type="text"
                value={form.venue}
                onChange={e => setForm(f => ({ ...f, venue: e.target.value }))}
                placeholder="Conference Room / Zoom link…"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>

            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

            <div className="flex gap-2 justify-end pt-1">
              <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit || saving}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold disabled:opacity-40 hover:bg-indigo-700 transition-colors"
              >
                {saving ? 'Scheduling…' : 'Schedule & Notify Board'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Sunday Leader tab ────────────────────────────────────────────────────────

function SundayLeaderPoolModal({ pool, onAdd, onRemove, onClose, saving }) {
  const [picked, setPicked] = useState(null)

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
        <div
          className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div>
              <h3 className="font-semibold text-slate-900">Sunday Leader Pool</h3>
              <p className="text-xs text-slate-400 mt-0.5">Approved leaders available for weekly assignment</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <div className="p-4 space-y-3 border-b border-slate-100 shrink-0">
            <PersonPicker value={picked} onChange={setPicked} />
            <button
              type="button"
              disabled={!picked || saving}
              onClick={() => { onAdd(picked); setPicked(null) }}
              className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors"
            >
              {saving ? 'Adding…' : '+ Add to Pool'}
            </button>
          </div>

          <div className="overflow-y-auto flex-1">
            {pool.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-slate-400">No approved leaders yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {pool.map((p, i) => (
                  <li key={p.personId || p.name || i} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <span className="text-sm font-medium text-slate-800 truncate">{p.name}</span>
                    <button
                      type="button"
                      onClick={() => onRemove(i)}
                      className="text-xs text-red-500 hover:underline shrink-0"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function monthSundays(year, month) {
  const dates = []
  const d = new Date(year, month, 1)
  while (d.getMonth() === month) {
    if (d.getDay() === 0) dates.push(format(d, 'yyyy-MM-dd'))
    d.setDate(d.getDate() + 1)
  }
  return dates
}

const EMPTY_LEADER_FORM = { leader: '', psalm: '', announcements: '' }

const PSALM_OPTIONS = Array.from({ length: 150 }, (_, i) => String(i + 1))

function nextPsalm(psalm) {
  const n = Number(psalm)
  if (!n || n < 1) return ''
  return String((n % 150) + 1)
}

// Controlled table row — value/onChange come from the parent so "Save Month Schedule"
// can batch-write every row in one call instead of each row saving itself. Read-only
// typography by default; the Leader/Psalm cells only swap in <select> inputs while the
// parent's edit toggle is active (canEdit here already folds in that toggle).
function SundayLeaderRow({ date, value, onChange, onReset, pool, dirty, hasAssignment, loading, canEdit }) {
  const d = new Date(date + 'T00:00:00')

  const statusBadge = loading ? (
    <span className="text-[10px] text-slate-400">Loading…</span>
  ) : dirty ? (
    <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">Unsaved</span>
  ) : hasAssignment ? (
    <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">Saved</span>
  ) : (
    <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200 whitespace-nowrap">No assignment</span>
  )

  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 transition-colors">
      <td className="px-4 py-3 align-top whitespace-nowrap">
        <p className="text-sm font-semibold text-slate-800">{format(d, 'dd MMM yyyy')}</p>
        <p className="text-xs text-slate-400">{format(d, 'EEEE')}</p>
      </td>
      <td className="px-4 py-3 align-top">
        {loading ? (
          <span className="text-sm text-slate-300">—</span>
        ) : canEdit ? (
          <select
            value={value.leader}
            onChange={(e) => onChange({ ...value, leader: e.target.value })}
            className="w-full min-w-[160px] px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm bg-white"
          >
            <option value="">— Sunday Leader —</option>
            {pool.map((p) => <option key={p.personId || p.name} value={p.name}>{p.name}</option>)}
          </select>
        ) : (
          <span className={`text-sm ${value.leader ? 'font-medium text-slate-800' : 'text-slate-400'}`}>{value.leader || '—'}</span>
        )}
      </td>
      <td className="px-4 py-3 align-top">
        {loading ? (
          <span className="text-sm text-slate-300">—</span>
        ) : canEdit ? (
          <select
            value={value.psalm}
            onChange={(e) => onChange({ ...value, psalm: e.target.value })}
            className="w-full min-w-[120px] px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm bg-white"
          >
            <option value="">— Psalm —</option>
            {PSALM_OPTIONS.map((n) => <option key={n} value={n}>Psalm {n}</option>)}
          </select>
        ) : (
          <span className={`text-sm ${value.psalm ? 'text-slate-700' : 'text-slate-400'}`}>{value.psalm ? `Psalm ${value.psalm}` : '—'}</span>
        )}
      </td>
      <td className="px-4 py-3 align-top">
        {loading ? (
          <span className="text-sm text-slate-300">—</span>
        ) : canEdit ? (
          <input
            type="text"
            value={value.announcements}
            onChange={(e) => onChange({ ...value, announcements: e.target.value })}
            placeholder="Announcements…"
            className="w-full min-w-[160px] px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm bg-white"
          />
        ) : (
          <span className={`text-sm ${value.announcements ? 'text-slate-700' : 'text-slate-400'}`}>{value.announcements || '—'}</span>
        )}
      </td>
      <td className="px-4 py-3 align-top">{statusBadge}</td>
      <td className="px-4 py-3 align-top text-right">
        {canEdit && dirty && (
          <button type="button" onClick={onReset} className="text-xs font-medium text-slate-400 hover:text-red-500 transition-colors">
            Reset
          </button>
        )}
      </td>
    </tr>
  )
}

// ─── Leader History / Duty Count modal ─────────────────────────────────────────
// Only counts/lists Sundays that have already occurred (date < today) — a future
// assignment doesn't count toward a leader's duty total until that Sunday passes.

function SundayLeaderHistoryModal({ entries, pool, onClose }) {
  const [view, setView] = useState('stats') // 'stats' | 'history'
  // `query` is the actual filter (an exact leader name, or '' for all leaders);
  // `nameInput`/`nameDropdownOpen` drive the searchable-select UI on top of it.
  const [query, setQuery] = useState('')
  const [nameInput, setNameInput] = useState('')
  const [nameDropdownOpen, setNameDropdownOpen] = useState(false)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const today = format(new Date(), 'yyyy-MM-dd')
  const pastEntries = useMemo(
    () => entries.filter((e) => e.leader && e.date < today).sort((a, b) => b.date.localeCompare(a.date)),
    [entries, today]
  )

  const stats = useMemo(() => {
    const counts = {}
    pastEntries.forEach((e) => { counts[e.leader] = (counts[e.leader] || 0) + 1 })
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }, [pastEntries])

  // Directory roster for the dropdown: current Sunday Leaders Pool + any name that
  // actually appears in the history but has since been removed from the pool, so a
  // past leader is still filterable even after they're no longer an approved leader.
  const leaderNameOptions = useMemo(() => {
    const fromPool = (pool || []).map((p) => p.name).filter(Boolean)
    const fromHistory = pastEntries.map((e) => e.leader).filter(Boolean)
    return [...new Set([...fromPool, ...fromHistory])].sort((a, b) => a.localeCompare(b))
  }, [pool, pastEntries])

  const filteredNameOptions = useMemo(() => {
    const q = nameInput.trim().toLowerCase()
    if (!q) return leaderNameOptions
    return leaderNameOptions.filter((n) => n.toLowerCase().includes(q))
  }, [leaderNameOptions, nameInput])

  const selectLeaderName = (name) => {
    setQuery(name)
    setNameInput(name)
    setNameDropdownOpen(false)
  }

  const filteredHistory = useMemo(() => {
    return pastEntries.filter((e) => {
      if (query && e.leader !== query) return false
      if (fromDate && e.date < fromDate) return false
      if (toDate && e.date > toDate) return false
      return true
    })
  }, [pastEntries, query, fromDate, toDate])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-semibold text-slate-900">Leader History</h3>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-1 px-5 pt-3 border-b border-slate-100 shrink-0">
          {[{ key: 'stats', label: 'Stats' }, { key: 'history', label: 'History' }].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setView(t.key)}
              className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                view === t.key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 p-5">
          {view === 'stats' ? (
            stats.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">No completed Sundays recorded yet.</p>
            ) : (
              <ul className="space-y-2">
                {stats.map((s) => (
                  <li key={s.name} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
                    <span className="text-sm font-medium text-slate-800 truncate">{s.name}</span>
                    <span className="shrink-0 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full">
                      Led {s.count} time{s.count !== 1 ? 's' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => { setNameInput(e.target.value); setQuery(''); setNameDropdownOpen(true) }}
                  onFocus={() => setNameDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setNameDropdownOpen(false), 150)}
                  placeholder="Filter by leader name…"
                  className="w-full pl-8 pr-8 py-2 rounded-lg border border-slate-300 text-sm"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => { setQuery(''); setNameInput('') }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={14} />
                  </button>
                )}
                {nameDropdownOpen && (
                  <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectLeaderName('')}
                      className="w-full text-left px-3 py-2 text-sm text-slate-500 hover:bg-indigo-50 border-b border-slate-100"
                    >
                      All Leaders
                    </button>
                    {filteredNameOptions.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-slate-400">No matching leaders</p>
                    ) : (
                      filteredNameOptions.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectLeaderName(name)}
                          className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-indigo-50"
                        >
                          {name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">From</label>
                  <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">To</label>
                  <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm" />
                </div>
              </div>

              {filteredHistory.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">No matching assignments.</p>
              ) : (
                <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                  {filteredHistory.map((e) => (
                    <li key={e.date} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <span className="text-xs text-slate-500 tabular-nums shrink-0">{formatDisplayDate(e.date)}</span>
                      <span className="text-sm font-medium text-slate-800 flex-1 text-right truncate">{e.leader}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function SundayLeaderTab({ canEdit, userProfile }) {
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [pool, setPool]                 = useState([])
  const [poolModalOpen, setPoolModalOpen] = useState(false)
  const [poolSaving, setPoolSaving]     = useState(false)

  const [entries, setEntries]           = useState({})       // date -> {leader, psalm} (editable)
  const [savedEntries, setSavedEntries] = useState({})       // date -> {leader, psalm} | undefined (last-persisted)
  const [entriesLoading, setEntriesLoading] = useState(true)
  const [saving, setSaving]             = useState(false)
  const [saveMessage, setSaveMessage]   = useState('')
  const [exporting, setExporting]       = useState(false)
  // Read-only by default — the whole month's rows only become interactive dropdowns
  // (and Save/Cancel appear) once the Edit icon is tapped, matching the batch-save
  // design (one "Save Month Schedule" for every row, not a per-row save).
  const [editMode, setEditMode]         = useState(false)

  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const [historyEntries, setHistoryEntries]     = useState([])
  const [historyLoading, setHistoryLoading]     = useState(false)

  const openHistory = () => {
    setHistoryModalOpen(true)
    setHistoryLoading(true)
    getAllSecCoreSundayLeaderEntries()
      .then(setHistoryEntries)
      .catch(() => setHistoryEntries([]))
      .finally(() => setHistoryLoading(false))
  }

  const prevMonth = () => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  const nextMonth = () => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))

  const sundaysInMonth = useMemo(
    () => monthSundays(monthCursor.getFullYear(), monthCursor.getMonth()),
    [monthCursor]
  )

  useEffect(() => {
    const unsub = subscribeToSundayLeaderPool(
      (d) => setPool(d.members || []),
      () => setPool([])
    )
    return unsub
  }, [])

  useEffect(() => {
    let cancelled = false
    setEntriesLoading(true)
    setSaveMessage('')
    // Also fetch the Sunday exactly 7 days before this month's first Sunday (may fall
    // in the previous month) so the very first row still has a prior-Psalm reference
    // to auto-suggest from.
    const firstSunday = sundaysInMonth[0]
    const priorDate = firstSunday
      ? (() => { const d = new Date(firstSunday + 'T00:00:00'); d.setDate(d.getDate() - 7); return format(d, 'yyyy-MM-dd') })()
      : null
    Promise.all([
      ...sundaysInMonth.map((date) => getSecCoreSundayLeaderEntry(date)),
      priorDate ? getSecCoreSundayLeaderEntry(priorDate) : Promise.resolve(null),
    ])
      .then((results) => {
        if (cancelled) return
        const monthResults = results.slice(0, sundaysInMonth.length)
        const priorEntry = results[results.length - 1]
        const nextEntries = {}
        const nextSaved = {}
        let priorPsalm = priorEntry?.psalm || ''
        sundaysInMonth.forEach((date, i) => {
          const e = monthResults[i]
          const savedPsalm = e?.psalm || ''
          const val = {
            leader: e?.leader || '',
            psalm: savedPsalm || nextPsalm(priorPsalm),
            announcements: e?.announcements || '',
          }
          nextEntries[date] = val
          nextSaved[date] = e ? { leader: val.leader, psalm: savedPsalm, announcements: val.announcements } : undefined
          priorPsalm = savedPsalm || val.psalm
        })
        setEntries(nextEntries)
        setSavedEntries(nextSaved)
      })
      .finally(() => { if (!cancelled) setEntriesLoading(false) })
    return () => { cancelled = true }
  }, [sundaysInMonth])

  const updateEntry = (date, value) => setEntries((prev) => ({ ...prev, [date]: value }))

  /** Reverts a single row to its last-saved state (or blank if never saved) — the
   * table's per-row "Reset" action, without discarding edits made to other rows. */
  const resetEntry = (date) => {
    setEntries((prev) => ({
      ...prev,
      [date]: savedEntries[date] ? { ...savedEntries[date] } : { ...EMPTY_LEADER_FORM },
    }))
  }

  /** Discards any in-progress edits (reverting every row to its last-saved state,
   * or blank if never saved) and drops back to read-only view. */
  const handleCancelEdit = () => {
    const reverted = {}
    sundaysInMonth.forEach((date) => {
      reverted[date] = savedEntries[date] ? { ...savedEntries[date] } : { ...EMPTY_LEADER_FORM }
    })
    setEntries(reverted)
    setSaveMessage('')
    setEditMode(false)
  }

  const isDirty = (date) => {
    const cur = entries[date] || EMPTY_LEADER_FORM
    const saved = savedEntries[date]
    return saved
      ? (cur.leader !== saved.leader || cur.psalm !== saved.psalm || cur.announcements !== saved.announcements)
      : !!(cur.leader.trim() || cur.psalm || cur.announcements?.trim())
  }

  const addToPool = async (person) => {
    if (!person?.name) return
    if (pool.some((p) => (p.personId && p.personId === person.personId) || p.name === person.name)) return
    setPoolSaving(true)
    try {
      const next = [...pool, { personId: person.personId || '', name: person.name }]
      await setSecCoreSundayLeaderPool({ members: next }, userProfile?.displayName || userProfile?.email)
      setPool(next)
    } finally {
      setPoolSaving(false)
    }
  }

  const removeFromPool = async (idx) => {
    const next = pool.filter((_, i) => i !== idx)
    await setSecCoreSundayLeaderPool({ members: next }, userProfile?.displayName || userProfile?.email)
    setPool(next)
  }

  const handleSaveMonth = async () => {
    setSaving(true)
    setSaveMessage('')
    const updatedBy = userProfile?.displayName || userProfile?.email || 'unknown'
    try {
      const payload = sundaysInMonth.map((date) => ({
        date,
        leader: (entries[date]?.leader || '').trim(),
        psalm: (entries[date]?.psalm || '').trim(),
        announcements: (entries[date]?.announcements || '').trim(),
      }))
      await setSecCoreSundayLeaderMonth(payload, updatedBy)

      // Resolve each distinct assigned leader to an app account once, then notify.
      const names = [...new Set(payload.map((p) => p.leader).filter(Boolean))]
      const userByName = {}
      await Promise.all(names.map(async (name) => {
        userByName[name] = await getUserByName(name).catch(() => null)
      }))

      let notifiedCount = 0
      await Promise.all(payload.flatMap((p) => {
        if (!p.leader || !userByName[p.leader]) return []
        notifiedCount += 1
        return [createSundayLeaderAssignmentNotification({
          uid: userByName[p.leader].id, date: p.date, role: 'leader', name: p.leader, createdBy: updatedBy,
        })]
      }))

      const nextSaved = {}
      payload.forEach((p) => { nextSaved[p.date] = { leader: p.leader, psalm: p.psalm, announcements: p.announcements } })
      setSavedEntries(nextSaved)
      setSaveMessage(`${format(monthCursor, 'MMMM yyyy')} schedule saved · ${notifiedCount} leader${notifiedCount !== 1 ? 's' : ''} notified`)
      setEditMode(false)
    } finally {
      setSaving(false)
    }
  }

  // Exports every sec_core_sunday_leader entry on record (not just this month) as a
  // single shareable JPEG — html2canvas snapshots an off-screen styled card so the
  // graphic can reuse real HTML/Tailwind layout instead of hand-drawing on <canvas>.
  const handleExportSchedule = async () => {
    setExporting(true)
    try {
      const all = await getAllSecCoreSundayLeaderEntries()
      const rows = all
        .filter((e) => e.leader || e.psalm)
        .sort((a, b) => a.date.localeCompare(b.date))

      const container = document.createElement('div')
      container.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;'
      container.innerHTML = `
        <div style="padding:32px 40px;background:linear-gradient(135deg,#4338ca,#312e81);color:#ffffff;">
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:2px;opacity:.7;">ROL CHURCH &middot; SEC-CORE</p>
          <p style="margin:0;font-size:28px;font-weight:800;">SUNDAY LEADER SCHEDULE</p>
        </div>
        <div>
          ${rows.map((e, i) => `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 40px;background:${i % 2 === 0 ? '#f8fafc' : '#ffffff'};border-bottom:1px solid #e2e8f0;">
              <span style="font-weight:700;color:#1e293b;font-size:14px;white-space:nowrap;">${formatDisplayDate(e.date)}</span>
              <span style="color:#4338ca;font-weight:600;font-size:14px;flex:1;text-align:center;">${e.leader || '—'}</span>
              <span style="color:#64748b;font-size:13px;white-space:nowrap;">${e.psalm ? `Psalm ${e.psalm}` : ''}</span>
            </div>
          `).join('') || '<p style="padding:24px 40px;color:#94a3b8;font-size:14px;">No assignments recorded yet.</p>'}
        </div>
        <div style="padding:16px 40px;background:#312e81;color:rgba(255,255,255,.7);font-size:12px;text-align:center;">
          Generated by ROL Admin App
        </div>
      `
      document.body.appendChild(container)
      const canvas = await html2canvas(container, { scale: 2, backgroundColor: '#ffffff' })
      document.body.removeChild(container)

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `sunday-leader-schedule-${format(new Date(), 'yyyy-MM-dd')}.jpg`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export schedule failed:', err)
      alert('Could not export schedule image.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Sunday Leader</h2>
          <p className="text-xs text-slate-500 mt-0.5">Monthly leader schedule</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="relative group">
            <button
              type="button"
              onClick={openHistory}
              aria-label="Leader History"
              title="Leader History"
              className="w-11 h-11 flex items-center justify-center rounded-full bg-white border border-slate-300 text-slate-700 shadow-sm hover:bg-slate-50 hover:shadow-md active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:ring-offset-2"
            >
              <HistoryIcon size={18} strokeWidth={2.5} />
            </button>
            <span className="pointer-events-none absolute top-full right-0 mt-2 whitespace-nowrap rounded-lg bg-slate-900 text-white text-xs font-semibold px-2.5 py-1.5 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10">
              Leader History
            </span>
          </div>
          {canEdit && !editMode && (
            <div className="relative group">
              <button
                type="button"
                onClick={() => setEditMode(true)}
                aria-label="Edit Schedule"
                title="Edit Schedule"
                className="w-11 h-11 flex items-center justify-center rounded-full bg-white border border-slate-300 text-slate-700 shadow-sm hover:bg-slate-50 hover:shadow-md active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:ring-offset-2"
              >
                <Pencil size={16} strokeWidth={2.5} />
              </button>
              <span className="pointer-events-none absolute top-full right-0 mt-2 whitespace-nowrap rounded-lg bg-slate-900 text-white text-xs font-semibold px-2.5 py-1.5 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10">
                Edit Schedule
              </span>
            </div>
          )}
          {canEdit && (
            <>
            <div className="relative group">
              <button
                type="button"
                onClick={handleExportSchedule}
                disabled={exporting}
                aria-label="Export Schedule"
                title="Export Schedule"
                className="w-11 h-11 flex items-center justify-center rounded-full bg-white border border-slate-300 text-slate-700 shadow-sm hover:bg-slate-50 hover:shadow-md active:scale-95 disabled:opacity-50 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:ring-offset-2"
              >
                <Download size={18} strokeWidth={2.5} className={exporting ? 'animate-pulse' : ''} />
              </button>
              <span className="pointer-events-none absolute top-full right-0 mt-2 whitespace-nowrap rounded-lg bg-slate-900 text-white text-xs font-semibold px-2.5 py-1.5 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10">
                {exporting ? 'Exporting…' : 'Export Schedule'}
              </span>
            </div>
            <div className="relative group">
              <button
                type="button"
                onClick={() => setPoolModalOpen(true)}
                aria-label="Manage Sunday Leader Pool"
                title="Manage Sunday Leader Pool"
                className="w-11 h-11 flex items-center justify-center rounded-full bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 hover:shadow-md active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:ring-offset-2"
              >
                <Plus size={20} strokeWidth={2.5} />
              </button>
              <span className="pointer-events-none absolute top-full right-0 mt-2 whitespace-nowrap rounded-lg bg-slate-900 text-white text-xs font-semibold px-2.5 py-1.5 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10">
                Manage Leader Pool
              </span>
            </div>
            </>
          )}
        </div>
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

      {canEdit && editMode && pool.length === 0 && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          No approved leaders yet — tap the + button above to add people from the directory.
        </p>
      )}

      {/* Monthly Sunday schedule — single consolidated card table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Date</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Leader</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Psalm</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Announcements</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sundaysInMonth.map((date) => (
                <SundayLeaderRow
                  key={date}
                  date={date}
                  value={entries[date] || EMPTY_LEADER_FORM}
                  onChange={(value) => updateEntry(date, value)}
                  onReset={() => resetEntry(date)}
                  pool={pool}
                  dirty={!entriesLoading && editMode && isDirty(date)}
                  hasAssignment={!!savedEntries[date]}
                  loading={entriesLoading}
                  canEdit={canEdit && editMode}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {poolModalOpen && (
        <SundayLeaderPoolModal
          pool={pool}
          saving={poolSaving}
          onAdd={addToPool}
          onRemove={removeFromPool}
          onClose={() => setPoolModalOpen(false)}
        />
      )}

      {historyModalOpen && (
        historyLoading ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setHistoryModalOpen(false)}>
            <div className="bg-white rounded-2xl shadow-2xl px-6 py-4 text-sm text-slate-500" onClick={(e) => e.stopPropagation()}>Loading…</div>
          </div>
        ) : (
          <SundayLeaderHistoryModal entries={historyEntries} pool={pool} onClose={() => setHistoryModalOpen(false)} />
        )
      )}
    </div>
  )
}

// ─── Board Agenda tab ─────────────────────────────────────────────────────────

function sundayDateChips() {
  const today = new Date()
  const daysToSun = today.getDay() === 0 ? 0 : 7 - today.getDay()
  const first = new Date(today)
  first.setDate(today.getDate() + daysToSun)
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(first)
    d.setDate(first.getDate() + i * 7)
    return format(d, 'yyyy-MM-dd')
  })
}

export function BoardAgendaTab({ canEdit, userProfile, initialDate = null, onScheduleMeeting, members = [] }) {
  const [allPoints, setAllPoints] = useState([])
  const [loading, setLoading]     = useState(true)
  const [selectedDate, setSelectedDate] = useState(null)
  const [editId, setEditId]       = useState(null)
  const [editVals, setEditVals]   = useState({ durationMinutes: '' })
  const [saving, setSaving]       = useState(false)
  const [meetings, setMeetings]   = useState([])

  useEffect(() => {
    const unsub = subscribeToBoardMeetings(setMeetings, () => setMeetings([]))
    return unsub
  }, [])

  // Meeting Start Time — one per Sunday, drives the auto-computed timeline below.
  // Collapsed by default; the date chips row (de-emphasized) is only shown once the
  // director explicitly wants to change which Sunday they're looking at.
  const [startTime, setStartTime] = useState('')
  const [dateChipsOpen, setDateChipsOpen] = useState(false)

  useEffect(() => {
    setLoading(true)
    // Opened from a scheduled meeting → land straight on its date; otherwise
    // auto-select the forthcoming Sunday like before.
    const chips = sundayDateChips()
    setSelectedDate(initialDate || chips[0] || null)

    const unsub = subscribeToBoardPoints(pts => {
      setAllPoints(pts)
      setLoading(false)
    })
    return unsub
  }, [initialDate])

  useEffect(() => {
    if (!selectedDate) { setStartTime(''); return }
    getSecCoreBoardMeetingStartTime(selectedDate).then(setStartTime).catch(() => setStartTime(''))
  }, [selectedDate])

  const handleStartTimeChange = async (value) => {
    setStartTime(value)
    if (!selectedDate) return
    await setSecCoreBoardMeetingStartTime(selectedDate, value, userProfile?.displayName || userProfile?.email || 'Sec-Core')
  }

  const unscheduled  = allPoints.filter(p => !p.meetingDate)
  const pointDates   = [...new Set(allPoints.map(p => p.meetingDate).filter(Boolean))]
  const upcomingChips = sundayDateChips().filter(d => !pointDates.includes(d))
  // initialDate may be a non-Sunday scheduled-meeting date with no points yet —
  // include it explicitly so its chip still appears and gets auto-selected.
  const allDates     = [...new Set([...pointDates, ...upcomingChips, ...(initialDate ? [initialDate] : [])])].sort()

  const datePoints   = useMemo(
    () => selectedDate ? allPoints.filter(p => p.meetingDate === selectedDate) : [],
    [allPoints, selectedDate]
  )
  const fixedPoints  = datePoints.filter(p => p.slNo && p.allottedTime).sort((a, b) => Number(a.slNo) - Number(b.slNo))
  const unfixedPoints = datePoints.filter(p => !p.slNo || !p.allottedTime)

  // A calendar Sunday is auto-selected by default (sundayDateChips()[0]) whether or
  // not a Board Meeting was actually scheduled for it — this distinguishes "there's a
  // real meeting on this date" from "this is just the next Sunday" so the agenda sheet
  // can give way to a clean empty state instead of a meeting-shaped card with nothing in it.
  const hasScheduledMeeting = !!selectedDate && meetings.some(m => m.date === selectedDate)

  // Active Director for each department (for the table's Director Name column) —
  // same active-membership rule ScheduleMeetingModal used to use to decide who's
  // currently on the roster.
  const activeDirectorByDept = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd')
    const map = {}
    members.forEach(m => {
      if ((m.type && m.type !== 'director') || !m.department) return
      if (m.to && m.to < today) return
      if (!map[m.department]) map[m.department] = m.name
    })
    return map
  }, [members])

  // One row-group per registered department, in canonical DEPARTMENT_LIST order —
  // every department always shows up, whether or not it submitted anything for this
  // date, so the table reads as the full roster rather than just who spoke up.
  const deptRows = useMemo(() => {
    return DEPARTMENT_LIST.map(dept => {
      const deptPoints = datePoints
        .filter(p => p.department === dept.name)
        .sort((a, b) => {
          const aFixed = !!(a.slNo && a.allottedTime), bFixed = !!(b.slNo && b.allottedTime)
          if (aFixed && bFixed) return Number(a.slNo) - Number(b.slNo)
          return aFixed ? -1 : bFixed ? 1 : 0
        })
      return { dept: dept.name, director: activeDirectorByDept[dept.name] || '', points: deptPoints }
    })
  }, [datePoints, activeDirectorByDept])

  // Live per-point time windows, derived from Start Time + each accepted point's
  // durationMinutes in Sl No order — recalculates automatically whenever Start Time
  // changes or a point is accepted/unlocked, instead of trusting a persisted string
  // that could go stale. Legacy points fixed before durationMinutes existed have no
  // known duration, so they can't be placed on the timeline (shown null → falls back
  // to their old allottedTime text) and don't advance the running clock.
  const fixedPointTimes = useMemo(() => {
    if (!startTime) return fixedPoints.map(() => null)
    let cursor = startTime
    return fixedPoints.map((bp) => {
      if (!bp.durationMinutes) return null
      const start = cursor
      const end = addMinutesToTime(cursor, Number(bp.durationMinutes))
      cursor = end
      return `${formatTime12h(start)} – ${formatTime12h(end)}`
    })
  }, [startTime, fixedPoints])

  // Where a newly-accepted point would land — accepted points always append to the
  // end of the agenda, after every already-accepted point's duration.
  const cumulativeMinutes = fixedPoints.reduce((s, bp) => s + (Number(bp.durationMinutes) || 0), 0)
  const nextSlNo = fixedPoints.length + 1

  // ── Dual-screen presentation live sync — drives both this controller's Live
  // Controls bar and the full-screen /board-present view, via a `live` object on
  // the meeting doc (Firestore, not BroadcastChannel, so the presentation window
  // survives a reload independently of this tab). ──────────────────────────────
  const activeMeeting = meetings.find(m => m.date === selectedDate)
  const [liveState, setLiveState] = useState({ activePointId: null, status: 'idle', startedAt: null, pausedElapsedSeconds: 0 })

  useEffect(() => {
    if (!activeMeeting?.id) {
      setLiveState({ activePointId: null, status: 'idle', startedAt: null, pausedElapsedSeconds: 0 })
      return
    }
    return subscribeToBoardMeetingLive(activeMeeting.id, setLiveState)
  }, [activeMeeting?.id])

  // Ticks once a second while running so the local countdown mirror stays live
  // without waiting on a fresh Firestore snapshot every second.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (liveState.status !== 'running') return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [liveState.status])

  const livePoint = fixedPoints.find(p => p.id === liveState.activePointId) || null
  const liveRemainingSeconds = livePoint
    ? (Number(livePoint.durationMinutes) || 0) * 60
      - (liveState.pausedElapsedSeconds || 0)
      - (liveState.status === 'running' && liveState.startedAt?.toMillis ? (now - liveState.startedAt.toMillis()) / 1000 : 0)
    : null

  const handleTogglePresentStatus = () => {
    if (!activeMeeting?.id || !livePoint) return
    setLiveStatus(activeMeeting.id, liveState.status === 'running' ? 'paused' : 'running')
  }

  // Selects the fixed point right after the current one (wrapping to the first),
  // or the first point if nothing is selected yet. Doesn't auto-start — Start is
  // always a separate explicit action.
  const handleNextLivePoint = () => {
    if (!activeMeeting?.id || fixedPoints.length === 0) return
    const idx = fixedPoints.findIndex(p => p.id === liveState.activePointId)
    const next = idx === -1 ? fixedPoints[0] : fixedPoints[(idx + 1) % fixedPoints.length]
    selectLivePoint(activeMeeting.id, next.id)
  }

  const handleAcceptPoint = async (bp) => {
    const mins = Number(editVals.durationMinutes)
    if (!mins || mins <= 0) return
    setSaving(true)
    try {
      const start = startTime ? addMinutesToTime(startTime, cumulativeMinutes) : ''
      const end = start ? addMinutesToTime(start, mins) : ''
      const patch = {
        slNo: nextSlNo,
        durationMinutes: mins,
        allottedTime: start && end ? `${formatTime12h(start)} – ${formatTime12h(end)}` : `${mins} min`,
        status: 'approved',
        approvedBy: userProfile?.displayName || userProfile?.email || 'Sec-Core',
      }
      await updateBoardPoint(bp.id, patch)
      setAllPoints(prev => prev.map(p => p.id === bp.id ? { ...p, ...patch } : p))
      setEditId(null)
      setEditVals({ durationMinutes: '' })
      // Only auto-stage this point as the live/presenting one if nothing is live
      // yet — e.g. right after the meeting starts, so the presentation view isn't
      // stuck on "Waiting for the next point…" until someone remembers to press
      // Next Point. If a point is already being presented, accepting a different
      // one must NOT interrupt it — switching is always an explicit Present/Next
      // Point click (see the per-row "Present" action and the Live Controls bar).
      if (activeMeeting?.id && !liveState.activePointId) {
        await selectLivePoint(activeMeeting.id, bp.id)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleUnfix = async (id) => {
    setSaving(true)
    try {
      const patch = { slNo: '', allottedTime: '', status: 'pending', approvedBy: '', durationMinutes: null }
      await updateBoardPoint(id, patch)
      setAllPoints(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
    } finally {
      setSaving(false)
    }
  }

  const handleAssignToDate = async (id, date) => {
    setSaving(true)
    try {
      await updateBoardPoint(id, { meetingDate: date })
      setAllPoints(prev => prev.map(p => p.id === id ? { ...p, meetingDate: date } : p))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-slate-400 py-6 text-center">Loading agenda…</p>

  return (
    <div className="space-y-4">

      {/* ── Meeting Start Time + de-emphasized date picker ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500">Start Time</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => handleStartTimeChange(e.target.value)}
            disabled={!canEdit || !selectedDate}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50"
          />
        </div>
        <button
          type="button"
          onClick={() => setDateChipsOpen(v => !v)}
          className="flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors"
        >
          {selectedDate ? format(new Date(selectedDate + 'T00:00:00'), 'EEE, d MMM') : 'No Date'}
          <ChevronDown size={13} className={`transition-transform ${dateChipsOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* ── Sunday date chips — hidden by default, expand to change date ── */}
      {dateChipsOpen && (
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {allDates.map(date => {
          const pts      = allPoints.filter(p => p.meetingDate === date)
          const fixed    = pts.filter(p => p.slNo && p.allottedTime).length
          const isActive = selectedDate === date
          const d        = new Date(date + 'T00:00:00')
          return (
            <button
              key={date}
              type="button"
              onClick={() => setSelectedDate(date)}
              className={`flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-xl border transition-all text-xs font-medium ${
                isActive
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                  : pts.length > 0
                    ? 'bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-50'
                    : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
              }`}
            >
              <span className="text-[10px] font-bold uppercase">{format(d, 'EEE')}</span>
              <span className="text-lg font-black leading-tight">{format(d, 'd')}</span>
              <span className="text-[10px]">{format(d, 'MMM')}</span>
              {pts.length > 0 && (
                <span className={`mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/25 text-white' : 'bg-indigo-100 text-indigo-600'}`}>
                  {fixed}/{pts.length}
                </span>
              )}
            </button>
          )
        })}
        {/* Unscheduled chip */}
        {unscheduled.length > 0 && (
          <button
            type="button"
            onClick={() => setSelectedDate(null)}
            className={`flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-xl border transition-all text-xs font-medium ${
              selectedDate === null
                ? 'bg-rose-600 border-rose-600 text-white shadow-md'
                : 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100'
            }`}
          >
            <span className="text-[10px] font-bold uppercase">No</span>
            <span className="text-lg font-black leading-tight">—</span>
            <span className="text-[10px]">Date</span>
            <span className={`mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${selectedDate === null ? 'bg-white/25 text-white' : 'bg-rose-100 text-rose-600'}`}>
              {unscheduled.length}
            </span>
          </button>
        )}
      </div>
      )}

      {/* ── Unscheduled points panel (when "No Date" chip selected) ── */}
      {selectedDate === null && unscheduled.length > 0 && (
        <div className="mx-auto bg-white rounded-2xl shadow-xl border border-rose-200 overflow-hidden w-full" style={{ maxWidth: 480 }}>
          <div className="px-6 py-4 bg-gradient-to-br from-rose-600 to-rose-700 text-white">
            <p className="text-[10px] font-bold uppercase tracking-widest text-rose-200 mb-0.5">Inbox — No Sunday Assigned</p>
            <p className="text-lg font-black">{unscheduled.length} point{unscheduled.length !== 1 ? 's' : ''} pending date</p>
          </div>
          <div className="divide-y divide-slate-100">
            {unscheduled.map(bp => (
              <div key={bp.id} className="px-5 py-4">
                <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wide">{bp.department}</p>
                <p className="text-sm text-slate-800 mt-0.5 leading-snug">{bp.point}</p>
                {bp.timeNeeded && <p className="text-[10px] text-slate-400 mt-0.5">Requested: {bp.timeNeeded}</p>}
                {canEdit && (
                  <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-slate-500 font-medium">Assign to:</span>
                    {sundayDateChips().slice(0, 4).map(d => (
                      <button
                        key={d}
                        type="button"
                        disabled={saving}
                        onClick={() => handleAssignToDate(bp.id, d)}
                        className="text-[10px] font-bold px-2 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 transition-colors"
                      >
                        {format(new Date(d + 'T00:00:00'), 'd MMM')}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── No meeting scheduled for this date — clean empty state instead of a
          meeting-shaped card with nothing in it ── */}
      {selectedDate && !hasScheduledMeeting && (
        <div className="mx-auto bg-white rounded-2xl shadow-sm border border-dashed border-slate-300 overflow-hidden w-full" style={{ maxWidth: 480 }}>
          <div className="px-6 py-10 flex flex-col items-center text-center gap-2">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-1">
              <CalendarPlus size={22} strokeWidth={2} />
            </div>
            <p className="text-sm font-bold text-slate-700">No Board Meeting Scheduled</p>
            <p className="text-xs text-slate-400 max-w-[280px]">
              {format(new Date(selectedDate + 'T00:00:00'), 'EEEE, d MMMM yyyy')} doesn't have a scheduled Board Meeting yet.
            </p>
            {canEdit && onScheduleMeeting && (
              <button
                type="button"
                onClick={() => onScheduleMeeting(selectedDate)}
                className="mt-2 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-colors shadow-sm"
              >
                <CalendarPlus size={14} strokeWidth={2.5} /> Schedule Meeting
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Board meeting + department table ── */}
      {selectedDate && hasScheduledMeeting && (
        <div className="mx-auto bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden w-full max-w-4xl">

          {/* Header */}
          <div className="relative px-6 py-5 bg-gradient-to-br from-indigo-700 to-indigo-900 text-white">
            {/* Present — desktop-only (the extended-display flow needs a real window
                to send to a second screen, not a phone) — opens the full-screen
                /board-present view in a new tab, synced via the meeting doc's `live`
                state rather than window.postMessage/BroadcastChannel. */}
            {activeMeeting && (
              <button
                type="button"
                onClick={() => window.open(`/board-present/${activeMeeting.id}`, '_blank')}
                className="hidden sm:flex absolute top-3 right-3 items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors"
              >
                <Monitor size={13} /> Present
              </button>
            )}
            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300 mb-0.5">ROL Board Meeting</p>
            <p className="text-xl font-black">{format(new Date(selectedDate + 'T00:00:00'), 'EEEE, d MMMM yyyy')}</p>
            <p className="text-xs text-indigo-300 mt-1.5">
              {fixedPoints.length} of {datePoints.length} agenda item{datePoints.length !== 1 ? 's' : ''} fixed
            </p>
          </div>

          {/* Live Controls — Start/Pause/Next Point, synced in real time to
              whichever /board-present window is open on the extended display. */}
          {canEdit && fixedPoints.length > 0 && activeMeeting && (
            <div className="px-6 py-3 bg-slate-800 text-white flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Presenting</p>
                <p className="text-sm font-semibold truncate">
                  {livePoint ? livePoint.department : 'Nothing selected yet'}
                  {livePoint && liveRemainingSeconds != null && (
                    <span className={`ml-2 font-mono ${liveRemainingSeconds < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {formatCountdown(liveRemainingSeconds)}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={handleTogglePresentStatus}
                  disabled={!livePoint}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold transition-colors"
                >
                  {liveState.status === 'running' ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Start</>}
                </button>
                <button
                  type="button"
                  onClick={handleNextLivePoint}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold transition-colors"
                >
                  <SkipForward size={13} /> Next Point
                </button>
              </div>
            </div>
          )}

          {/* Department table — every registered department gets a row (or one row
              per point it submitted); departments with nothing yet show the
              empty-state label instead of just vanishing from the sheet. */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide whitespace-nowrap">Department</th>
                  <th className="px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide whitespace-nowrap">Director Name</th>
                  <th className="px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Discussion Points</th>
                  <th className="px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide whitespace-nowrap">Requested Time</th>
                  <th className="px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide whitespace-nowrap">Time Allotted</th>
                  <th className="px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {deptRows.flatMap(row => {
                  if (row.points.length === 0) {
                    return (
                      <tr key={row.dept} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-3 align-top text-sm font-semibold text-slate-800 whitespace-nowrap">{row.dept}</td>
                        <td className="px-4 py-3 align-top text-sm text-slate-600 whitespace-nowrap">{row.director || '—'}</td>
                        <td className="px-4 py-3 align-top text-sm text-slate-400 italic">No discussion points to discuss</td>
                        <td className="px-4 py-3 align-top text-sm text-slate-300">—</td>
                        <td className="px-4 py-3 align-top text-sm text-slate-300">—</td>
                        <td className="px-4 py-3 align-top text-sm text-slate-300">—</td>
                      </tr>
                    )
                  }

                  return row.points.map(bp => {
                    const isFixed   = !!(bp.slNo && bp.allottedTime)
                    const isEditing = editId === bp.id

                    return (
                      <tr key={bp.id} className={`border-b border-slate-100 last:border-0 transition-colors ${isFixed ? 'bg-emerald-50/30' : ''}`}>
                        <td className="px-4 py-3 align-top text-sm font-semibold text-slate-800 whitespace-nowrap">{row.dept}</td>
                        <td className="px-4 py-3 align-top text-sm text-slate-600 whitespace-nowrap">{row.director || '—'}</td>
                        <td className="px-4 py-3 align-top text-sm text-slate-800 leading-snug">{bp.point}</td>
                        <td className="px-4 py-3 align-top text-sm text-slate-500 whitespace-nowrap">{bp.timeNeeded || '—'}</td>
                        <td className="px-4 py-3 align-top text-sm whitespace-nowrap">
                          {isFixed ? (
                            <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full">
                              {fixedPointTimes[fixedPoints.indexOf(bp)] || bp.allottedTime}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top text-sm whitespace-nowrap">
                          {isFixed ? (
                            canEdit ? (
                              <div className="flex items-center gap-2">
                                {liveState.activePointId === bp.id ? (
                                  <span className="text-xs font-bold text-indigo-600">Presenting</span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => activeMeeting?.id && selectLivePoint(activeMeeting.id, bp.id)}
                                    className="text-xs text-indigo-600 font-semibold hover:underline"
                                  >Present</button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleUnfix(bp.id)}
                                  className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                                >Unfix</button>
                              </div>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )
                          ) : canEdit ? (
                            isEditing ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                <input
                                  type="number"
                                  min="1"
                                  placeholder="Duration"
                                  autoFocus
                                  value={editVals.durationMinutes}
                                  onChange={e => setEditVals({ durationMinutes: e.target.value })}
                                  onKeyDown={e => e.key === 'Enter' && handleAcceptPoint(bp)}
                                  className="w-16 px-2 py-1.5 rounded-lg border border-indigo-300 text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                />
                                <span className="text-xs text-slate-500">min</span>
                                {startTime && editVals.durationMinutes && Number(editVals.durationMinutes) > 0 && (
                                  <span className="text-xs text-indigo-600 font-semibold whitespace-nowrap">
                                    → {formatTime12h(addMinutesToTime(startTime, cumulativeMinutes))} – {formatTime12h(addMinutesToTime(startTime, cumulativeMinutes + Number(editVals.durationMinutes)))}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  disabled={!editVals.durationMinutes || Number(editVals.durationMinutes) <= 0 || saving}
                                  onClick={() => handleAcceptPoint(bp)}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                                >{saving ? '…' : 'Accept Point'}</button>
                                <button
                                  type="button"
                                  onClick={() => { setEditId(null); setEditVals({ durationMinutes: '' }) }}
                                  className="text-slate-400 hover:text-slate-600 text-sm leading-none px-1"
                                >✕</button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditId(bp.id)
                                  // Prefill from the submitter's requested time if it's a bare number.
                                  const guess = /^\d+$/.test(String(bp.timeNeeded || '').trim()) ? bp.timeNeeded.trim() : ''
                                  setEditVals({ durationMinutes: guess })
                                }}
                                className="text-xs text-emerald-600 font-semibold hover:underline"
                              >Accept Point</button>
                            )
                          ) : (
                            <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full whitespace-nowrap">Awaiting schedule</span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          {datePoints.length > 0 && (
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                {fixedPoints.length} fixed · {unfixedPoints.length} pending
              </p>
              {fixedPoints.length === datePoints.length && datePoints.length > 0 && (
                <span className="text-xs font-bold text-emerald-600">Agenda complete</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Board Agenda modal ─────────────────────────────────────────────────────────
// Centered modal (not a right-anchored slide-over) so it becomes the clear focus of
// attention the moment it opens, matching the centered-card convention used
// elsewhere in this app (e.g. SundayLeaderHistoryModal, ChildAttendancePrompt)
// rather than competing for space alongside the page like a sidebar panel.
function BoardAgendaDrawer({ onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Board Agenda"
      onClick={onClose}
    >
      <div
        className="bg-slate-50 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-white rounded-t-3xl flex-shrink-0">
          <p className="text-sm font-bold text-slate-800">Board Agenda</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Director Board page (Board Overview & Leadership + Board Agenda) ─────────

export function DirectorBoardPage({ canEdit, userProfile }) {
  const [agendaOpen, setAgendaOpen] = useState(false)
  const [agendaDate, setAgendaDate] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [pointsMeetingId, setPointsMeetingId] = useState(null)

  // Schedule Board Meeting — owned here (not inside DirectorBoardTab) so both the
  // roster page's own "Schedule Meeting" icon AND the Board Agenda drawer's new
  // "No Board Meeting Scheduled" empty-state button can open the same modal.
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [schedulePrefillDate, setSchedulePrefillDate] = useState(null)

  // Director Board roster — needed by BoardAgendaTab's table to resolve each
  // department's active Director for the Director Name column.
  const [members, setMembers] = useState([])
  useEffect(() => {
    const unsub = subscribeToDirectorBoard(
      (d) => setMembers(d.members || []),
      () => {}
    )
    return unsub
  }, [])

  const openScheduleMeeting = (date = null) => {
    setSchedulePrefillDate(date)
    setScheduleOpen(true)
  }

  const openAgenda = (date) => { setAgendaDate(date); setAgendaOpen(true) }

  // ?openMeetingPoints= deep link — opens the Board Meeting Points modal
  // pre-scoped to that meeting, then clears the param so a page refresh doesn't
  // keep reopening it. Kept for any pre-existing To-Do task whose stored deepLink
  // still points here from before board meeting invites moved to the workspace
  // banner (BoardMeetingWorkspaceWidget's "More" already opens the modal directly,
  // without going through this URL param).
  useEffect(() => {
    const id = searchParams.get('openMeetingPoints')
    if (!id) return
    setPointsMeetingId(id)
    const next = new URLSearchParams(searchParams)
    next.delete('openMeetingPoints')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  return (
    <div className="space-y-4">
      <DirectorBoardTab
        canEdit={canEdit}
        userProfile={userProfile}
        onOpenMeetingAgenda={openAgenda}
        onScheduleMeeting={openScheduleMeeting}
      />

      {agendaOpen && (
        <BoardAgendaDrawer onClose={() => setAgendaOpen(false)}>
          <BoardAgendaTab
            canEdit={canEdit}
            userProfile={userProfile}
            initialDate={agendaDate}
            onScheduleMeeting={openScheduleMeeting}
            members={members}
          />
        </BoardAgendaDrawer>
      )}

      {scheduleOpen && (
        <ScheduleMeetingModal
          userProfile={userProfile}
          initialDate={schedulePrefillDate}
          onClose={() => { setScheduleOpen(false); setSchedulePrefillDate(null) }}
        />
      )}

      {pointsMeetingId && (
        <BoardPointsModal
          department={userProfile?.departments?.[0] || 'Sec-Core'}
          userEmail={userProfile?.email}
          meetingId={pointsMeetingId}
          onClose={() => setPointsMeetingId(null)}
        />
      )}
    </div>
  )
}

// ─── Analytics Hub ────────────────────────────────────────────────────────────

function quarterInfo(d) {
  const q = Math.floor(d.getMonth() / 3) + 1
  return { key: `${d.getFullYear()}-Q${q}`, label: `Q${q} '${String(d.getFullYear()).slice(2)}` }
}

function lastNQuarters(n) {
  const now = new Date()
  return Array.from({ length: n }, (_, i) => quarterInfo(new Date(now.getFullYear(), now.getMonth() - (n - 1 - i) * 3, 1)))
}

function lastNMonths(n) {
  const now = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1)
    return { label: format(d, 'MMM'), year: d.getFullYear(), month: d.getMonth() }
  })
}

// Badge tone recipe matches StatusBadge.jsx (src/components/finance) exactly, so
// pills here read as the same "finance page" visual language, just with labels
// suited to analytics rather than expense-approval status.
const BADGE_TONES = {
  slate:   'bg-slate-50 text-slate-600 border-slate-200',
  indigo:  'bg-indigo-50 text-indigo-700 border-indigo-100',
  rose:    'bg-rose-50 text-rose-700 border-rose-100',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber:   'bg-amber-50 text-amber-700 border-amber-200',
}

function Badge({ tone = 'slate', children }) {
  return (
    <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full border ${BADGE_TONES[tone] || BADGE_TONES.slate}`}>
      {children}
    </span>
  )
}

// Mirrors DeptExpenseTab's "Total Expense" summary card (src/components/DeptExpenseTab.jsx)
// — label/value on the left, a single pill badge on the right — so KPI tiles read
// as the same card as the Worship Finance page's stat card, just repeated per metric.
function KpiTile({ label, value, badge, badgeTone }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
        <p className="text-2xl font-bold text-slate-800 tabular-nums mt-0.5">{value}</p>
      </div>
      {badge && <Badge tone={badgeTone}>{badge}</Badge>}
    </div>
  )
}

function ChartCard({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <p className="text-sm font-semibold text-slate-700 mb-3">{title}</p>
      {children}
    </div>
  )
}

// Mirrors a DeptExpenseTab entry row (bg-white rounded-xl border shadow-sm px-4 py-3)
// with a StatusBadge-style pill in the header instead of a colored card border.
function InsightCard({ title, badge, badgeTone, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
        {badge && <Badge tone={badgeTone}>{badge}</Badge>}
      </div>
      {children}
    </div>
  )
}

const chartTooltipStyle = { fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }
const chartAxisTick = { fontSize: 10, fill: '#94a3b8' }

export function SecCoreAnalyticsHub() {
  const [members, setMembers]     = useState([])
  const [sundayEntries, setSundayEntries] = useState([])
  const [allPoints, setAllPoints] = useState([])
  const [expenses, setExpenses]   = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    let pending = 4
    const done = () => { if (--pending <= 0) setLoading(false) }

    const unsubMembers = subscribeToDirectorBoard(
      (d) => { setMembers(d.members || []); done() },
      () => done()
    )
    getSecCoreSundayLeaderEntries(16).then(setSundayEntries).catch(() => setSundayEntries([])).finally(done)
    const unsubPoints = subscribeToBoardPoints((pts) => { setAllPoints(pts); done() })
    const unsubExpenses = subscribeFinanceExpenseByDept('Sec-Core', (entries) => { setExpenses(entries); done() })

    return () => { unsubMembers?.(); unsubPoints?.(); unsubExpenses?.() }
  }, [])

  const now = new Date()

  const activeMembers = useMemo(
    () => members.filter((m) => !m.to || new Date(m.to) >= now),
    [members]
  )
  const rosterByType = useMemo(() => ({
    director:    activeMembers.filter((m) => !m.type || m.type === 'director').length,
    coordinator: activeMembers.filter((m) => m.type === 'coordinator').length,
    secretary:   activeMembers.filter((m) => m.type === 'secretary').length,
  }), [activeMembers])

  const approvedCount = useMemo(() => allPoints.filter((p) => p.status === 'approved').length, [allPoints])
  const pendingCount  = allPoints.length - approvedCount
  const completionPct = allPoints.length ? Math.round((approvedCount / allPoints.length) * 100) : 0

  const next4Sundays = useMemo(() => sundayDateChips().slice(0, 4), [])
  const missingSundays = useMemo(
    () => next4Sundays.filter((d) => !sundayEntries.some((e) => e.date === d && e.leader)),
    [next4Sundays, sundayEntries]
  )

  const pointsThisMonth = useMemo(
    () => allPoints.filter((p) => p.createdAt && p.createdAt.getFullYear() === now.getFullYear() && p.createdAt.getMonth() === now.getMonth()),
    [allPoints]
  )
  const deptsThisMonth = useMemo(
    () => new Set(pointsThisMonth.map((p) => p.department).filter(Boolean)).size,
    [pointsThisMonth]
  )

  const agendaChartData = useMemo(() => ([
    { label: 'Approved', count: approvedCount, fill: '#10b981' },
    { label: 'Pending',  count: pendingCount,  fill: '#f59e0b' },
  ]), [approvedCount, pendingCount])

  const expenseChartData = useMemo(() => {
    const months = lastNMonths(6)
    return months.map((m) => ({
      label: m.label,
      amount: expenses
        .filter((e) => e.date && new Date(e.date).getFullYear() === m.year && new Date(e.date).getMonth() === m.month)
        .reduce((s, e) => s + (Number(e.amount) || 0), 0),
    }))
  }, [expenses])

  const rotationChartData = useMemo(() => {
    const quarters = lastNQuarters(4)
    return quarters.map((q) => ({
      label: q.label,
      count: members.filter((m) => {
        if (!m.from) return false
        const d = new Date(m.from)
        return !isNaN(d) && quarterInfo(d).key === q.key
      }).length,
    }))
  }, [members])

  const stalePending = useMemo(
    () => allPoints
      .filter((p) => p.status !== 'approved' && p.createdAt && differenceInCalendarDays(now, p.createdAt) > 14)
      .sort((a, b) => a.createdAt - b.createdAt),
    [allPoints]
  )

  const renewalsDue = useMemo(
    () => members
      .filter((m) => {
        if (!m.to) return false
        const d = new Date(m.to)
        if (isNaN(d)) return false
        const days = differenceInCalendarDays(d, now)
        return days >= 0 && days <= 30
      })
      .sort((a, b) => new Date(a.to) - new Date(b.to)),
    [members]
  )

  const topLeader = useMemo(() => {
    const last12 = [...sundayEntries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12)
    const counts = {}
    last12.forEach((e) => { if (e.leader) counts[e.leader] = (counts[e.leader] || 0) + 1 })
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
    return { entry: sorted[0] || null, total: last12.length }
  }, [sundayEntries])

  if (loading) {
    return <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-6 text-center text-slate-400 text-sm">Loading analytics…</div>
  }

  return (
    <div className="space-y-4">
      {/* KPI Row — same stat-card recipe as the Worship Finance page's Total Expense card */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile
          label="Agenda Completion"
          value={`${completionPct}%`}
          badge={`${pendingCount} pending`}
          badgeTone={completionPct >= 70 ? 'emerald' : completionPct >= 40 ? 'amber' : 'rose'}
        />
        <KpiTile
          label="Sunday Coverage"
          value={`${next4Sundays.length - missingSundays.length}/${next4Sundays.length}`}
          badge={missingSundays.length ? `${missingSundays.length} missing` : 'All covered'}
          badgeTone={missingSundays.length === 0 ? 'emerald' : 'amber'}
        />
        <KpiTile
          label="Active Roster"
          value={activeMembers.length}
          badge={`D:${rosterByType.director} C:${rosterByType.coordinator} S:${rosterByType.secretary}`}
          badgeTone="indigo"
        />
        <KpiTile
          label="Board Points This Month"
          value={pointsThisMonth.length}
          badge={`${deptsThisMonth} dept${deptsThisMonth !== 1 ? 's' : ''}`}
          badgeTone="indigo"
        />
      </div>

      {/* Trends */}
      <h3 className="text-sm font-semibold text-slate-700">Trends</h3>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Agenda Completion">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={agendaChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="label" tick={chartAxisTick} axisLine={false} tickLine={false} />
              <YAxis tick={chartAxisTick} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: '#f1f5f9' }} />
              <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={48}>
                {agendaChartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Rose accent — same "money" color as the Finance page's entry-count pill */}
        <ChartCard title="Expense Trend (6 mo)">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={expenseChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="label" tick={chartAxisTick} axisLine={false} tickLine={false} />
              <YAxis tick={chartAxisTick} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: '#f1f5f9' }} formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Expense']} />
              <Bar dataKey="amount" fill="#f43f5e" radius={[3, 3, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Leadership Rotation">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={rotationChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="label" tick={chartAxisTick} axisLine={false} tickLine={false} />
              <YAxis tick={chartAxisTick} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: '#f1f5f9' }} formatter={(v) => [v, 'New appointments']} />
              <Bar dataKey="count" fill="#6366f1" radius={[3, 3, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Insights */}
      <h3 className="text-sm font-semibold text-slate-700">Insights</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <InsightCard
          title="Unassigned Sundays"
          badge={missingSundays.length || 'Clear'}
          badgeTone={missingSundays.length ? 'amber' : 'emerald'}
        >
          {missingSundays.length === 0 ? (
            <p className="text-sm text-slate-500">All upcoming Sundays covered.</p>
          ) : (
            <ul className="space-y-1">
              {missingSundays.map((d) => (
                <li key={d} className="text-sm text-slate-700">{format(new Date(d + 'T00:00:00'), 'EEE, d MMM')}</li>
              ))}
            </ul>
          )}
        </InsightCard>

        <InsightCard
          title="Stale Pending Points"
          badge={stalePending.length || 'Clear'}
          badgeTone={stalePending.length ? 'rose' : 'emerald'}
        >
          {stalePending.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing to flag.</p>
          ) : (
            <p className="text-sm text-slate-700">
              {stalePending.length} point{stalePending.length !== 1 ? 's' : ''} pending &gt;14 days
              <br />
              <span className="text-xs text-slate-400">Oldest: {stalePending[0].department} · {formatDisplayDate(stalePending[0].createdAt)}</span>
            </p>
          )}
        </InsightCard>

        <InsightCard
          title="Roster Renewals Due"
          badge={renewalsDue.length || 'Clear'}
          badgeTone={renewalsDue.length ? 'amber' : 'emerald'}
        >
          {renewalsDue.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing to flag.</p>
          ) : (
            <ul className="space-y-1">
              {renewalsDue.map((m, i) => (
                <li key={i} className="text-sm text-slate-700">{m.name} <span className="text-xs text-slate-400">({format(new Date(m.to), 'd MMM')})</span></li>
              ))}
            </ul>
          )}
        </InsightCard>

        <InsightCard title="Most Active Sunday Leader">
          {topLeader.entry ? (
            <p className="text-sm text-slate-700">
              <span className="font-bold">{topLeader.entry[0]}</span> led {topLeader.entry[1]} of last {topLeader.total} Sundays
            </p>
          ) : (
            <p className="text-sm text-slate-400">No assignments recorded yet.</p>
          )}
        </InsightCard>
      </div>
    </div>
  )
}

