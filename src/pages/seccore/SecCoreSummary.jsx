import { useEffect, useState, useMemo } from 'react'
import { format, addWeeks, subWeeks } from 'date-fns'
import {
  getSecCoreDirectorBoard,
  setSecCoreDirectorBoard,
  getSecCoreSundayLeaderEntries,
  getSecCoreSundayLeaderEntry,
  setSecCoreSundayLeaderEntry,
  deleteSecCoreSundayLeaderEntry,
  getAllBoardPoints,
  updateBoardPoint,
} from '../../services/firestore'
import { useAuth } from '../../context/AuthContext'
import { formatDisplayDate } from '../../utils/date'

function nextSundayISO() {
  const today = new Date()
  const daysUntil = today.getDay() === 0 ? 0 : 7 - today.getDay()
  const d = new Date(today)
  d.setDate(today.getDate() + daysUntil)
  return format(d, 'yyyy-MM-dd')
}

// ─── Director Board tab ───────────────────────────────────────────────────────

function DirectorBoardTab({ canEdit, userProfile }) {
  const [data, setData]       = useState({ members: [], notes: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [newMember, setNewMember] = useState({ name: '', role: '' })
  const [editIdx, setEditIdx] = useState(null)

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
    const name = newMember.name.trim()
    if (!name) return
    const updated = [...data.members, { name, role: newMember.role.trim() }]
    setNewMember({ name: '', role: '' })
    save({ members: updated })
  }

  const removeMember = (idx) => {
    save({ members: data.members.filter((_, i) => i !== idx) })
  }

  const applyEdit = () => {
    if (editIdx == null) return
    const updated = data.members.map((m, i) =>
      i === editIdx ? { name: newMember.name.trim() || m.name, role: newMember.role.trim() } : m
    )
    setEditIdx(null)
    setNewMember({ name: '', role: '' })
    save({ members: updated })
  }

  if (loading) return <p className="text-sm text-slate-400">Loading…</p>

  return (
    <div className="space-y-4">
      {/* Members table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800 text-sm">Board Members</h3>
          {saving && <span className="text-xs text-slate-400">Saving…</span>}
        </div>

        {data.members.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-400">No members added yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.members.map((m, idx) => (
              <li key={idx} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{m.name}</p>
                  {m.role && <p className="text-xs text-slate-500">{m.role}</p>}
                </div>
                {canEdit && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => { setEditIdx(idx); setNewMember({ name: m.name, role: m.role || '' }) }}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => removeMember(idx)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap gap-2 items-end bg-slate-50/50">
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs text-slate-500 mb-1">Name</label>
              <input
                type="text"
                value={newMember.name}
                onChange={(e) => setNewMember((p) => ({ ...p, name: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && (editIdx != null ? applyEdit() : addMember())}
                placeholder="Full name"
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div className="w-36">
              <label className="block text-xs text-slate-500 mb-1">Role / Position</label>
              <input
                type="text"
                value={newMember.role}
                onChange={(e) => setNewMember((p) => ({ ...p, role: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && (editIdx != null ? applyEdit() : addMember())}
                placeholder="e.g. Chairman"
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            {editIdx != null ? (
              <>
                <button
                  type="button"
                  onClick={applyEdit}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                >
                  Update
                </button>
                <button
                  type="button"
                  onClick={() => { setEditIdx(null); setNewMember({ name: '', role: '' }) }}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={addMember}
                disabled={!newMember.name.trim()}
                className="px-3 py-1.5 rounded-lg bg-slate-700 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-40"
              >
                + Add
              </button>
            )}
          </div>
        )}
      </div>

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
              <button
                type="button"
                disabled={saving}
                onClick={() => save({ notes: data.notes })}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
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

function BoardAgendaTab({ canEdit, userProfile }) {
  const [points, setPoints]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [approving, setApproving] = useState(null) // { id, point, department }
  const [timeInput, setTimeInput] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

  useEffect(() => {
    getAllBoardPoints()
      .then(setPoints)
      .catch(() => setPoints([]))
      .finally(() => setLoading(false))
  }, [])

  // Group by department
  const grouped = useMemo(() => {
    const filtered = filterStatus === 'all' ? points : points.filter(p => p.status === filterStatus)
    const map = {}
    filtered.forEach(p => {
      if (!map[p.department]) map[p.department] = []
      map[p.department].push(p)
    })
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [points, filterStatus])

  const handleApprove = async () => {
    if (!approving) return
    const time = timeInput.trim()
    if (!time) return
    await updateBoardPoint(approving.id, {
      status: 'approved',
      allottedTime: time,
      approvedBy: userProfile?.displayName || userProfile?.email || 'Sec-Core',
    })
    setPoints(prev => prev.map(p => p.id === approving.id
      ? { ...p, status: 'approved', allottedTime: time, approvedBy: userProfile?.displayName || userProfile?.email || 'Sec-Core' }
      : p
    ))
    setApproving(null)
    setTimeInput('')
  }

  const handleReject = async (id) => {
    if (!window.confirm('Reject this agenda point?')) return
    await updateBoardPoint(id, { status: 'rejected', allottedTime: '', approvedBy: '' })
    setPoints(prev => prev.map(p => p.id === id ? { ...p, status: 'rejected', allottedTime: '', approvedBy: '' } : p))
  }

  const handleReset = async (id) => {
    await updateBoardPoint(id, { status: 'pending', allottedTime: '', approvedBy: '' })
    setPoints(prev => prev.map(p => p.id === id ? { ...p, status: 'pending', allottedTime: '', approvedBy: '' } : p))
  }

  const counts = {
    all: points.length,
    pending: points.filter(p => p.status === 'pending').length,
    approved: points.filter(p => p.status === 'approved').length,
    rejected: points.filter(p => p.status === 'rejected').length,
  }

  const statusStyle = {
    pending:  'bg-amber-100 text-amber-700',
    approved: 'bg-emerald-100 text-emerald-700',
    rejected: 'bg-red-100 text-red-500',
  }

  if (loading) return <p className="text-sm text-slate-400 py-6 text-center">Loading agenda…</p>

  return (
    <div className="space-y-4">
      {/* Approve modal */}
      {approving && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => { setApproving(null); setTimeInput('') }} />
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={() => { setApproving(null); setTimeInput('') }}>
            <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <p className="font-semibold text-slate-800 text-sm">Approve Agenda Point</p>
                <button type="button" onClick={() => { setApproving(null); setTimeInput('') }} className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 text-xl">×</button>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{approving.department}</p>
                  <p className="text-sm text-slate-800">{approving.point}</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Allotted Time *</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      autoFocus
                      placeholder="e.g. 10 mins, 15 minutes"
                      value={timeInput}
                      onChange={e => setTimeInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && timeInput.trim() && handleApprove()}
                      className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Enter the time allocated for this presentation.</p>
                </div>
              </div>
              <div className="px-5 pb-5 flex gap-2">
                <button
                  type="button"
                  disabled={!timeInput.trim()}
                  onClick={handleApprove}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >Approve & Set Time</button>
                <button type="button" onClick={() => { setApproving(null); setTimeInput('') }}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Summary stats + filter */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="font-semibold text-slate-800 text-sm">Board Meeting Agenda</h3>
          <span className="text-xs text-slate-400">{counts.all} total points</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'all',      label: `All (${counts.all})`,           cls: 'bg-slate-100 text-slate-600' },
            { key: 'pending',  label: `Pending (${counts.pending})`,   cls: 'bg-amber-100 text-amber-700' },
            { key: 'approved', label: `Approved (${counts.approved})`, cls: 'bg-emerald-100 text-emerald-700' },
            { key: 'rejected', label: `Rejected (${counts.rejected})`, cls: 'bg-red-100 text-red-500' },
          ].map(f => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilterStatus(f.key)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all
                ${filterStatus === f.key ? 'ring-2 ring-offset-1 ring-indigo-400 ' + f.cls : f.cls + ' opacity-60 hover:opacity-100'}`}
            >{f.label}</button>
          ))}
        </div>
      </div>

      {/* Grouped list */}
      {grouped.length === 0 ? (
        <div className="py-12 text-center text-slate-400 text-sm">
          {points.length === 0 ? 'No presentation points submitted yet.' : 'No points match the selected filter.'}
        </div>
      ) : grouped.map(([dept, deptPoints]) => (
        <div key={dept} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <p className="text-sm font-bold text-slate-700">{dept}</p>
            <span className="text-xs text-slate-400">{deptPoints.length} point{deptPoints.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="divide-y divide-slate-100">
            {deptPoints.map((bp, idx) => (
              <div key={bp.id} className="flex items-start gap-3 px-5 py-4">
                <span className="text-xs font-medium text-slate-400 w-5 pt-0.5 flex-shrink-0 text-right">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-800 leading-relaxed">{bp.point}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    {bp.meetingDate && <span className="text-xs text-slate-400">📅 {bp.meetingDate}</span>}
                    {bp.status === 'approved' && bp.allottedTime && (
                      <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">⏱ {bp.allottedTime}</span>
                    )}
                    {bp.approvedBy && bp.status === 'approved' && (
                      <span className="text-xs text-slate-400">by {bp.approvedBy}</span>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0 flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusStyle[bp.status] || 'bg-slate-100 text-slate-500'}`}>
                    {bp.status === 'approved' ? 'Approved' : bp.status === 'rejected' ? 'Rejected' : 'Pending'}
                  </span>
                  {canEdit && (
                    <div className="flex gap-1.5">
                      {bp.status === 'pending' && (
                        <>
                          <button
                            type="button"
                            onClick={() => { setApproving(bp); setTimeInput('') }}
                            className="text-xs text-emerald-600 font-semibold hover:underline"
                          >Approve</button>
                          <button
                            type="button"
                            onClick={() => handleReject(bp.id)}
                            className="text-xs text-red-500 hover:underline"
                          >Reject</button>
                        </>
                      )}
                      {bp.status === 'approved' && (
                        <>
                          <button
                            type="button"
                            onClick={() => { setApproving(bp); setTimeInput(bp.allottedTime || '') }}
                            className="text-xs text-slate-500 hover:underline"
                          >Edit Time</button>
                          <button
                            type="button"
                            onClick={() => handleReset(bp.id)}
                            className="text-xs text-amber-600 hover:underline"
                          >Reset</button>
                        </>
                      )}
                      {bp.status === 'rejected' && (
                        <button
                          type="button"
                          onClick={() => handleReset(bp.id)}
                          className="text-xs text-amber-600 hover:underline"
                        >Reconsider</button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
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
