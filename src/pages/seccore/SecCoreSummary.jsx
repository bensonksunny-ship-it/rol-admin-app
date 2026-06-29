import { useEffect, useState, useRef } from 'react'
import { format, addWeeks, subWeeks } from 'date-fns'
import {
  getSecCoreDirectorBoard,
  setSecCoreDirectorBoard,
  getSecCoreSundayLeaderEntries,
  getSecCoreSundayLeaderEntry,
  setSecCoreSundayLeaderEntry,
  deleteSecCoreSundayLeaderEntry,
  subscribeToBoardPoints,
  updateBoardPoint,
  getPeople,
} from '../../services/firestore'
import { useAuth } from '../../context/AuthContext'
import { formatDisplayDate } from '../../utils/date'
import { DEPARTMENT_LIST } from '../../constants/departments'

const DEPT_NAMES = DEPARTMENT_LIST.map(d => d.name)

// ─── People search picker ─────────────────────────────────────────────────────

function PersonPicker({ value, onChange }) {
  // value = { personId, name } | null
  const [allPeople, setAllPeople] = useState(null)  // null = not loaded yet
  const [query, setQuery]         = useState('')
  const [open, setOpen]           = useState(false)
  const inputRef = useRef(null)

  // Load people lazily on first focus
  const loadPeople = () => {
    if (allPeople !== null) return
    getPeople().then(setAllPeople).catch(() => setAllPeople([]))
  }

  const results = allPeople
    ? allPeople.filter(p => {
        if (!query.trim()) return false
        const q = query.toLowerCase()
        return p.name?.toLowerCase().includes(q) || (p.phone || '').includes(q)
      }).slice(0, 8)
    : []

  const select = (p) => {
    onChange({ personId: p.id, name: p.name || '' })
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
        placeholder="Search by name or phone…"
        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
      />
      {open && query.trim() && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {allPeople === null && (
            <p className="px-3 py-2 text-xs text-slate-400">Loading…</p>
          )}
          {allPeople !== null && results.length === 0 && (
            <p className="px-3 py-2 text-xs text-slate-400">No match in directory</p>
          )}
          {results.map(p => (
            <button
              key={p.id}
              type="button"
              onMouseDown={() => select(p)}
              className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition-colors border-b border-slate-100 last:border-0 flex items-center gap-2"
            >
              <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-black text-indigo-600 flex-shrink-0">
                {p.name?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{p.name}</p>
                {p.phone && <p className="text-[10px] text-slate-400">{p.phone}</p>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function nextSundayISO() {
  const today = new Date()
  const daysUntil = today.getDay() === 0 ? 0 : 7 - today.getDay()
  const d = new Date(today)
  d.setDate(today.getDate() + daysUntil)
  return format(d, 'yyyy-MM-dd')
}

// ─── Director Board tab ───────────────────────────────────────────────────────

const BLANK_MEMBER = { personId: '', name: '', role: '', type: 'director', department: '' }

const POSITION_STYLES = {
  director:    { active: 'bg-indigo-600 border-indigo-600 text-white', dot: 'bg-indigo-500', badge: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
  coordinator: { active: 'bg-violet-600 border-violet-600 text-white', dot: 'bg-violet-500', badge: 'bg-violet-50 text-violet-700 border-violet-100' },
  secretary:   { active: 'bg-emerald-600 border-emerald-600 text-white', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
}

function MemberForm({ value, onChange, onSubmit, onCancel, submitLabel }) {
  const person = value.personId ? { personId: value.personId, name: value.name } : null
  const style = POSITION_STYLES[value.type] || POSITION_STYLES.director

  return (
    <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50 space-y-3">
      {/* Type toggle */}
      <div className="flex gap-2">
        {['director', 'coordinator', 'secretary'].map(t => (
          <button
            key={t}
            type="button"
            onClick={() => onChange({ ...value, type: t })}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
              value.type === t
                ? POSITION_STYLES[t].active
                : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Person picker from directory */}
      <div>
        <label className="block text-xs text-slate-500 mb-1">Person <span className="text-slate-400">(from People Directory)</span></label>
        <PersonPicker
          value={person}
          onChange={p => onChange({ ...value, personId: p?.personId || '', name: p?.name || '' })}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {/* Department */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">Department <span className="text-slate-400">(optional)</span></label>
          <select
            value={value.department}
            onChange={e => onChange({ ...value, department: e.target.value })}
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <option value="">— select dept —</option>
            {DEPT_NAMES.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        {/* Role / title */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">Role / Title <span className="text-slate-400">(optional)</span></label>
          <input
            type="text"
            value={value.role}
            onChange={e => onChange({ ...value, role: e.target.value })}
            onKeyDown={e => e.key === 'Enter' && onSubmit()}
            placeholder="e.g. Chairman, Youth Secretary…"
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={onSubmit}
          disabled={!value.name.trim()}
          className={`px-4 py-1.5 rounded-lg text-white text-sm font-medium disabled:opacity-40 transition-colors ${style.active}`}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  )
}

function DirectorBoardTab({ canEdit, userProfile }) {
  const [data, setData]         = useState({ members: [], notes: '' })
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [newMember, setNewMember] = useState(BLANK_MEMBER)
  const [editIdx, setEditIdx]   = useState(null)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    getSecCoreDirectorBoard()
      .then((d) => setData({ members: d.members || [], notes: d.notes || '' }))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const save = async (patch) => {
    const next = { ...data, ...patch }
    setData(next)
    setSaving(true)
    try {
      await setSecCoreDirectorBoard(next, userProfile?.displayName || userProfile?.email)
    } finally {
      setSaving(false)
    }
  }

  const addMember = () => {
    if (!newMember.name.trim()) return
    save({ members: [...data.members, {
      personId: newMember.personId || '',
      name: newMember.name.trim(),
      role: newMember.role.trim(),
      type: newMember.type,
      department: newMember.department?.trim() || '',
    }]})
    setNewMember(BLANK_MEMBER)
    setShowForm(false)
  }

  const applyEdit = () => {
    if (editIdx == null) return
    const updated = data.members.map((m, i) =>
      i === editIdx ? {
        personId: newMember.personId || m.personId || '',
        name: newMember.name.trim() || m.name,
        role: newMember.role.trim(),
        type: newMember.type,
        department: newMember.department?.trim() || '',
      } : m
    )
    setEditIdx(null)
    setNewMember(BLANK_MEMBER)
    save({ members: updated })
  }

  const removeMember = (idx) => save({ members: data.members.filter((_, i) => i !== idx) })

  if (loading) return <p className="text-sm text-slate-400">Loading…</p>

  // Group members by type; treat legacy entries (no type) as directors
  const byType = {
    director:    data.members.filter(m => !m.type || m.type === 'director'),
    coordinator: data.members.filter(m => m.type === 'coordinator'),
    secretary:   data.members.filter(m => m.type === 'secretary'),
  }

  const MemberRow = ({ m, idx }) => {
    const isEditing = editIdx === idx
    const style = POSITION_STYLES[m.type] || POSITION_STYLES.director
    return (
      <li className={`border-b border-slate-100 last:border-0 ${isEditing ? 'bg-slate-50' : ''}`}>
        {isEditing ? (
          <MemberForm
            value={newMember}
            onChange={setNewMember}
            onSubmit={applyEdit}
            onCancel={() => { setEditIdx(null); setNewMember(BLANK_MEMBER) }}
            submitLabel="Update"
          />
        ) : (
          <div className="flex items-center gap-3 px-4 py-2.5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800">{m.name}</p>
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                {m.department && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${style.badge}`}>{m.department}</span>
                )}
                {m.role && <span className="text-xs text-slate-500">{m.role}</span>}
              </div>
            </div>
            {canEdit && (
              <div className="flex gap-2 shrink-0">
                <button type="button"
                  onClick={() => { setEditIdx(idx); setNewMember({ personId: m.personId || '', name: m.name, role: m.role || '', type: m.type || 'director', department: m.department || '' }); setShowForm(false) }}
                  className="text-xs text-indigo-600 hover:underline">Edit</button>
                <button type="button" onClick={() => removeMember(idx)}
                  className="text-xs text-red-500 hover:underline">Remove</button>
              </div>
            )}
          </div>
        )}
      </li>
    )
  }

  const SECTIONS = [
    { key: 'director',    label: 'Directors' },
    { key: 'coordinator', label: 'Coordinators' },
    { key: 'secretary',   label: 'Secretaries' },
  ]

  const typeLabel = (t) => t.charAt(0).toUpperCase() + t.slice(1)

  return (
    <div className="space-y-4">

      {SECTIONS.map((sec, si) => {
        const members = byType[sec.key]
        const style = POSITION_STYLES[sec.key]
        return (
          <div key={sec.key} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${style.dot}`} />
                <h3 className="font-semibold text-slate-800 text-sm">{sec.label}</h3>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{members.length}</span>
              </div>
              {saving && si === 0 && <span className="text-xs text-slate-400">Saving…</span>}
            </div>
            {members.length === 0 ? (
              <p className="px-4 py-4 text-sm text-slate-400">No {sec.label.toLowerCase()} added yet.</p>
            ) : (
              <ul>
                {members.map((m, i) => {
                  const realIdx = data.members.indexOf(m)
                  return <MemberRow key={i} m={m} idx={realIdx} />
                })}
              </ul>
            )}
          </div>
        )
      })}

      {/* Add new member */}
      {canEdit && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {showForm ? (
            <>
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-700">Add Person</p>
              </div>
              <MemberForm
                value={newMember}
                onChange={setNewMember}
                onSubmit={addMember}
                onCancel={() => { setShowForm(false); setNewMember(BLANK_MEMBER) }}
                submitLabel={`+ Add ${typeLabel(newMember.type)}`}
              />
            </>
          ) : (
            <button
              type="button"
              onClick={() => { setShowForm(true); setEditIdx(null) }}
              className="w-full px-4 py-3 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors flex items-center gap-2"
            >
              <span className="text-lg leading-none">+</span> Add Director, Coordinator or Secretary
            </button>
          )}
        </div>
      )}

      {/* Shared notes */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-2">
        <h3 className="font-semibold text-slate-800 text-sm">Board Notes</h3>
        {canEdit ? (
          <>
            <textarea
              value={data.notes}
              onChange={(e) => setData((d) => ({ ...d, notes: e.target.value }))}
              placeholder="Agenda items, decisions, meeting notes…"
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
            <div className="flex justify-end">
              <button type="button" disabled={saving} onClick={() => save({ notes: data.notes })}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save Notes'}
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{data.notes || '— No notes yet —'}</p>
        )}
      </div>
    </div>
  )
}

// ─── Sunday Leader tab ────────────────────────────────────────────────────────

function SundayLeaderTab({ canEdit, userProfile }) {
  const [selectedDate, setSelectedDate] = useState(nextSundayISO)
  const [entry, setEntry]               = useState(null)
  const [loading, setLoading]           = useState(false)
  const [saving, setSaving]             = useState(false)
  const [deleting, setDeleting]         = useState(false)
  const [history, setHistory]           = useState([])
  const [historyLoading, setHistLoading]= useState(true)
  const [form, setForm]                 = useState({ leader: '', coLeader: '', notes: '' })

  const prevSunday = () =>
    setSelectedDate(format(subWeeks(new Date(selectedDate), 1), 'yyyy-MM-dd'))
  const nextSunday = () =>
    setSelectedDate(format(addWeeks(new Date(selectedDate), 1), 'yyyy-MM-dd'))

  useEffect(() => {
    getSecCoreSundayLeaderEntries(20)
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setHistLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedDate) return
    setLoading(true)
    getSecCoreSundayLeaderEntry(selectedDate)
      .then((e) => {
        setEntry(e)
        setForm({ leader: e?.leader || '', coLeader: e?.coLeader || '', notes: e?.notes || '' })
      })
      .catch(() => { setEntry(null); setForm({ leader: '', coLeader: '', notes: '' }) })
      .finally(() => setLoading(false))
  }, [selectedDate])

  const handleSave = async () => {
    setSaving(true)
    try {
      await setSecCoreSundayLeaderEntry(
        selectedDate,
        { leader: form.leader.trim(), coLeader: form.coLeader.trim(), notes: form.notes.trim() },
        userProfile?.displayName || userProfile?.email
      )
      setEntry({ ...form, date: selectedDate })
      setHistory((prev) => {
        const filtered = prev.filter((h) => h.date !== selectedDate)
        return [{ date: selectedDate, ...form }, ...filtered].sort((a, b) => b.date.localeCompare(a.date))
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm(`Delete assignment for ${formatDisplayDate(selectedDate)}?`)) return
    setDeleting(true)
    try {
      await deleteSecCoreSundayLeaderEntry(selectedDate)
      setEntry(null)
      setForm({ leader: '', coLeader: '', notes: '' })
      setHistory((prev) => prev.filter((h) => h.date !== selectedDate))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Date nav + form */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={prevSunday} className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">← Prev</button>
          <span className="font-semibold text-slate-800 text-sm">
            {format(new Date(selectedDate), 'EEE, dd MMM yyyy')}
          </span>
          <button type="button" onClick={nextSunday} className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">Next →</button>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : canEdit ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Sunday Leader</label>
                <input
                  type="text"
                  value={form.leader}
                  onChange={(e) => setForm((f) => ({ ...f, leader: e.target.value }))}
                  placeholder="Name"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Co-Leader <span className="text-slate-400">(optional)</span></label>
                <input
                  type="text"
                  value={form.coLeader}
                  onChange={(e) => setForm((f) => ({ ...f, coLeader: e.target.value }))}
                  placeholder="Name"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Any notes for this Sunday…"
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div className="flex gap-2 justify-end">
              {entry && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-sm hover:bg-red-50 disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !form.leader.trim()}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : entry ? (
          <div className="space-y-1">
            <p className="text-sm"><span className="text-slate-500">Leader:</span> <span className="font-medium text-slate-800">{entry.leader}</span></p>
            {entry.coLeader && <p className="text-sm"><span className="text-slate-500">Co-Leader:</span> <span className="font-medium text-slate-800">{entry.coLeader}</span></p>}
            {entry.notes && <p className="text-sm text-slate-600 whitespace-pre-wrap">{entry.notes}</p>}
          </div>
        ) : (
          <p className="text-sm text-slate-400">No assignment for this Sunday.</p>
        )}
      </div>

      {/* History */}
      {!historyLoading && history.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <h3 className="px-4 py-3 font-semibold text-slate-800 text-sm border-b border-slate-100">Recent Assignments</h3>
          <ul className="divide-y divide-slate-100">
            {history.map((h) => (
              <li
                key={h.date}
                className={`flex items-center gap-4 px-4 py-2.5 cursor-pointer hover:bg-slate-50 ${h.date === selectedDate ? 'bg-indigo-50/60' : ''}`}
                onClick={() => setSelectedDate(h.date)}
              >
                <span className="text-xs text-slate-500 tabular-nums w-24 shrink-0">{formatDisplayDate(h.date)}</span>
                <span className="text-sm font-medium text-slate-800 flex-1">{h.leader}</span>
                {h.coLeader && <span className="text-xs text-slate-500">{h.coLeader}</span>}
              </li>
            ))}
          </ul>
        </div>
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

function BoardAgendaTab({ canEdit, userProfile }) {
  const [allPoints, setAllPoints] = useState([])
  const [loading, setLoading]     = useState(true)
  const [selectedDate, setSelectedDate] = useState(null)
  const [editId, setEditId]       = useState(null)
  const [editVals, setEditVals]   = useState({ slNo: '', allottedTime: '' })
  const [saving, setSaving]       = useState(false)

  useEffect(() => {
    setLoading(true)
    // Auto-select the forthcoming Sunday immediately
    const chips = sundayDateChips()
    setSelectedDate(chips[0] || null)

    const unsub = subscribeToBoardPoints(pts => {
      setAllPoints(pts)
      setLoading(false)
    })
    return unsub
  }, [])

  const unscheduled  = allPoints.filter(p => !p.meetingDate)
  const pointDates   = [...new Set(allPoints.map(p => p.meetingDate).filter(Boolean))]
  const upcomingChips = sundayDateChips().filter(d => !pointDates.includes(d))
  const allDates     = [...new Set([...pointDates, ...upcomingChips])].sort()

  const datePoints   = selectedDate ? allPoints.filter(p => p.meetingDate === selectedDate) : []
  const fixedPoints  = datePoints.filter(p => p.slNo && p.allottedTime).sort((a, b) => Number(a.slNo) - Number(b.slNo))
  const unfixedPoints = datePoints.filter(p => !p.slNo || !p.allottedTime)
  const sortedPoints = [...fixedPoints, ...unfixedPoints]

  const handleFix = async (id) => {
    if (!editVals.slNo.trim() || !editVals.allottedTime.trim()) return
    setSaving(true)
    try {
      const patch = {
        slNo: editVals.slNo.trim(),
        allottedTime: editVals.allottedTime.trim(),
        status: 'approved',
        approvedBy: userProfile?.displayName || userProfile?.email || 'Sec-Core',
      }
      await updateBoardPoint(id, patch)
      setAllPoints(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
      setEditId(null)
      setEditVals({ slNo: '', allottedTime: '' })
    } finally {
      setSaving(false)
    }
  }

  const handleUnfix = async (id) => {
    setSaving(true)
    try {
      const patch = { slNo: '', allottedTime: '', status: 'pending', approvedBy: '' }
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

      {/* ── Sunday date chips ── */}
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

      {/* ── A5 agenda sheet ── */}
      {selectedDate && (
        <div className="mx-auto bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden w-full" style={{ maxWidth: 480 }}>

          {/* Header */}
          <div className="px-6 py-5 bg-gradient-to-br from-indigo-700 to-indigo-900 text-white">
            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300 mb-0.5">ROL Board Meeting</p>
            <p className="text-xl font-black">{format(new Date(selectedDate + 'T00:00:00'), 'EEEE, d MMMM yyyy')}</p>
            <p className="text-xs text-indigo-300 mt-1.5">
              {fixedPoints.length} of {datePoints.length} agenda item{datePoints.length !== 1 ? 's' : ''} fixed
            </p>
          </div>

          {/* Agenda rows */}
          <div className="divide-y divide-slate-100">
            {sortedPoints.length === 0 && (
              <p className="px-6 py-10 text-center text-slate-400 text-sm">
                No points submitted for this Sunday yet.
              </p>
            )}

            {sortedPoints.map(bp => {
              const isFixed   = !!(bp.slNo && bp.allottedTime)
              const isEditing = editId === bp.id

              return (
                <div key={bp.id} className={`px-5 py-4 transition-colors ${isFixed ? 'bg-emerald-50/40' : 'bg-white'}`}>
                  <div className="flex items-start gap-3">

                    {/* Sl No circle */}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-black mt-0.5 ${
                      isFixed ? 'bg-emerald-500 text-white shadow-sm' : 'bg-slate-100 text-slate-400'
                    }`}>
                      {isFixed ? bp.slNo : '—'}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wide">{bp.department}</p>
                      <p className="text-sm text-slate-800 leading-snug mt-0.5">{bp.point}</p>
                      {bp.timeNeeded && (
                        <p className="text-[10px] text-slate-400 mt-0.5">Requested: {bp.timeNeeded}</p>
                      )}

                      {/* Inline Sl + Time editor for unfixed items */}
                      {!isFixed && canEdit && (
                        isEditing ? (
                          <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                            <input
                              type="number"
                              min="1"
                              placeholder="Sl"
                              autoFocus
                              value={editVals.slNo}
                              onChange={e => setEditVals(v => ({ ...v, slNo: e.target.value }))}
                              className="w-14 px-2 py-1.5 rounded-lg border border-indigo-300 text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                            <input
                              type="text"
                              placeholder="Approved time"
                              value={editVals.allottedTime}
                              onChange={e => setEditVals(v => ({ ...v, allottedTime: e.target.value }))}
                              onKeyDown={e => e.key === 'Enter' && handleFix(bp.id)}
                              className="flex-1 min-w-[120px] px-2 py-1.5 rounded-lg border border-indigo-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                            <button
                              type="button"
                              disabled={!editVals.slNo.trim() || !editVals.allottedTime.trim() || saving}
                              onClick={() => handleFix(bp.id)}
                              className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                            >{saving ? '…' : 'Fix Slot'}</button>
                            <button
                              type="button"
                              onClick={() => { setEditId(null); setEditVals({ slNo: '', allottedTime: '' }) }}
                              className="text-slate-400 hover:text-slate-600 text-sm leading-none px-1"
                            >✕</button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditId(bp.id)
                              setEditVals({ slNo: bp.slNo || '', allottedTime: bp.allottedTime || '' })
                            }}
                            className="mt-2 text-xs text-indigo-600 font-semibold hover:underline"
                          >Set Sl &amp; Time →</button>
                        )
                      )}
                      {!isFixed && !canEdit && (
                        <span className="mt-1.5 inline-block text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Awaiting schedule</span>
                      )}
                    </div>

                    {/* Fixed badge + unlock */}
                    {isFixed && (
                      <div className="flex-shrink-0 flex flex-col items-end gap-1">
                        <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full">{bp.allottedTime}</span>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => handleUnfix(bp.id)}
                            className="text-[10px] text-slate-400 hover:text-red-500 transition-colors"
                          >unlock</button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
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

// ─── Main export ──────────────────────────────────────────────────────────────

export default function SecCoreSummary() {
  const { canManageDepartment, userProfile } = useAuth()
  const canEdit = canManageDepartment('Sec-Core')
  const [tab, setTab] = useState('directorBoard')

  const tabs = [
    { key: 'directorBoard', label: 'Director Board' },
    { key: 'boardAgenda',   label: 'Board Agenda' },
    { key: 'sundayLeader',  label: 'Sunday Leader' },
  ]

  return (
    <div className="space-y-3">
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto scrollbar-hide">
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === t.key
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'directorBoard' && <DirectorBoardTab canEdit={canEdit} userProfile={userProfile} />}
      {tab === 'boardAgenda'   && <BoardAgendaTab   canEdit={canEdit} userProfile={userProfile} />}
      {tab === 'sundayLeader'  && <SundayLeaderTab  canEdit={canEdit} userProfile={userProfile} />}
    </div>
  )
}
