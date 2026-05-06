import { useEffect, useState } from 'react'
import { format, addWeeks, subWeeks } from 'date-fns'
import {
  getSecCoreDirectorBoard,
  setSecCoreDirectorBoard,
  getSecCoreSundayLeaderEntries,
  getSecCoreSundayLeaderEntry,
  setSecCoreSundayLeaderEntry,
  deleteSecCoreSundayLeaderEntry,
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

// ─── Main export ──────────────────────────────────────────────────────────────

export default function SecCoreSummary() {
  const { canManageDepartment, userProfile } = useAuth()
  const canEdit = canManageDepartment('Sec-Core')
  const [tab, setTab] = useState('directorBoard')

  return (
    <div className="space-y-3">
      <div className="flex gap-1 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setTab('directorBoard')}
          className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'directorBoard'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Director Board
        </button>
        <button
          type="button"
          onClick={() => setTab('sundayLeader')}
          className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'sundayLeader'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Sunday Leader
        </button>
      </div>

      {tab === 'directorBoard' && (
        <DirectorBoardTab canEdit={canEdit} userProfile={userProfile} />
      )}
      {tab === 'sundayLeader' && (
        <SundayLeaderTab canEdit={canEdit} userProfile={userProfile} />
      )}
    </div>
  )
}
