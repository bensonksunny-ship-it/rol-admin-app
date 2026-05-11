import { useEffect, useState } from 'react'
import { format, addWeeks, subWeeks } from 'date-fns'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getSundayProgramDefault,
  setSundayProgramDefault,
  pushProgramToSundayReport,
  getSundayPreServiceTeam,
  getSundayPreServiceEntry,
  setSundayPreServiceEntry,
  getSundayCrewRoster,
  setSundayCrewRoster,
  getSundayCrewEntry,
  setSundayCrewEntry,
  getDepartmentTeamMembers,
} from '../services/firestore'
import DepartmentTabBar from '../components/DepartmentTabBar'

function nextSunday() {
  const today = new Date()
  const daysUntil = today.getDay() === 0 ? 0 : 7 - today.getDay()
  const d = new Date(today)
  d.setDate(today.getDate() + daysUntil)
  return format(d, 'yyyy-MM-dd')
}

const DEFAULT_SEED = [
  { programName: 'Pre Worship Talk', order: 0 },
  { programName: 'Worship', order: 1 },
  { programName: 'Leader Prayer', order: 2 },
  { programName: 'Announcements', order: 3 },
  { programName: 'Sermon', order: 4 },
  { programName: 'Prayer & Benediction', order: 5 },
]

// ─── Sub-tab bar ─────────────────────────────────────────────────────────────

function SubTabBar({ active, onChange }) {
  const tabs = [
    { id: 'default', label: 'Default Program' },
    { id: 'preService', label: 'Pre-Service' },
    { id: 'crew', label: 'Crew' },
  ]
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

// ─── Default Program tab ─────────────────────────────────────────────────────

function DefaultProgramTab({ canEdit, userProfile, navigate }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pushDate, setPushDate] = useState(nextSunday)
  const [pushing, setPushing] = useState(false)
  const [pushSuccess, setPushSuccess] = useState(false)
  const [form, setForm] = useState({ programName: '', order: 0 })
  const [editingId, setEditingId] = useState(null)

  useEffect(() => {
    setLoading(true)
    getSundayProgramDefault()
      .then((doc) => {
        const list = doc.items?.length ? doc.items : [...DEFAULT_SEED]
        setItems(list.map((x, i) => ({ ...x, localId: `lp-${i}-${String(x.programName || '').slice(0, 20)}` })))
      })
      .catch(() => setItems(DEFAULT_SEED.map((x, i) => ({ ...x, localId: `seed-${i}` }))))
      .finally(() => setLoading(false))
  }, [])

  const persist = async () => {
    if (!canEdit) return
    setSaving(true)
    try {
      const payload = [...items]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((x, i) => ({ programName: String(x.programName || '').trim(), order: typeof x.order === 'number' ? x.order : i }))
        .filter((x) => x.programName)
      await setSundayProgramDefault(payload, userProfile?.email || userProfile?.displayName || 'unknown')
      setItems(payload.map((x, i) => ({ ...x, localId: `lp-${i}-${String(x.programName || '').slice(0, 20)}` })))
    } catch (e) {
      console.error(e)
      alert('Failed to save program')
    }
    setSaving(false)
  }

  const addRow = () => {
    const name = (form.programName || '').trim()
    if (!name) return
    if (editingId) {
      setItems((prev) => prev.map((x) => (x.localId === editingId ? { ...x, programName: name, order: Number(form.order) || 0 } : x)))
      setEditingId(null)
    } else {
      setItems((prev) => [...prev, { programName: name, order: Number(form.order) || prev.length, localId: `new-${Date.now()}` }])
    }
    setForm({ programName: '', order: items.length })
  }

  const sorted = [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  if (loading) return <p className="text-slate-500">Loading…</p>

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
      <h2 className="font-semibold text-slate-800">Program items</h2>
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs text-slate-500 mb-1">Name</label>
          <input type="text" value={form.programName} onChange={(e) => setForm((f) => ({ ...f, programName: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" placeholder="Program name" />
        </div>
        <div className="w-24">
          <label className="block text-xs text-slate-500 mb-1">Order</label>
          <input type="number" value={form.order} onChange={(e) => setForm((f) => ({ ...f, order: Number(e.target.value) || 0 }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
        </div>
        <button type="button" onClick={addRow} disabled={!canEdit} className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50">{editingId ? 'Apply edit' : 'Add Program'}</button>
        {editingId && <button type="button" onClick={() => { setEditingId(null); setForm({ programName: '', order: sorted.length }) }} className="px-3 py-2 rounded-lg border border-slate-300 text-sm">Cancel edit</button>}
      </div>

      <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
        {sorted.map((row, idx) => (
          <li key={row.localId || row.programName + idx} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
            <span className="text-slate-400 w-6">{idx + 1}.</span>
            <span className="font-medium text-slate-800 flex-1">{row.programName}</span>
            <span className="text-slate-500 text-xs">order {row.order ?? idx}</span>
            {canEdit && (
              <>
                <button type="button" onClick={() => { setEditingId(row.localId); setForm({ programName: row.programName, order: row.order ?? idx }) }} className="text-blue-600 hover:underline text-xs">Edit</button>
                <button type="button" onClick={() => setItems((prev) => prev.filter((x) => x.localId !== row.localId))} className="text-red-600 hover:underline text-xs">Remove</button>
                {idx > 0 && <button type="button" onClick={() => { const p = sorted[idx - 1]; setItems((l) => l.map((x) => x.localId === row.localId ? { ...x, order: p.order ?? idx - 1 } : x.localId === p.localId ? { ...x, order: row.order ?? idx } : x)) }} className="text-slate-600 text-xs px-1">↑</button>}
                {idx < sorted.length - 1 && <button type="button" onClick={() => { const n = sorted[idx + 1]; setItems((l) => l.map((x) => x.localId === row.localId ? { ...x, order: n.order ?? idx + 1 } : x.localId === n.localId ? { ...x, order: row.order ?? idx } : x)) }} className="text-slate-600 text-xs px-1">↓</button>}
              </>
            )}
          </li>
        ))}
      </ul>

      {canEdit && (
        <div className="space-y-3 pt-2">
          <button type="button" disabled={saving} onClick={persist} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">{saving ? 'Saving…' : 'Update Default'}</button>
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <label className="text-sm text-slate-600 font-medium">Push to Live Control for:</label>
            <input type="date" value={pushDate} onChange={(e) => { setPushDate(e.target.value); setPushSuccess(false) }} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm" />
            <button type="button" disabled={pushing || !pushDate} onClick={async () => {
              setPushing(true); setPushSuccess(false)
              try {
                const payload = [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((x, i) => ({ programName: String(x.programName || '').trim(), order: typeof x.order === 'number' ? x.order : i })).filter((x) => x.programName)
                await pushProgramToSundayReport(pushDate, payload)
                navigate(`/department/sunday-ministry/sunday-report?date=${pushDate}`)
              } catch (e) { console.error(e); alert('Failed to push program') }
              setPushing(false)
            }} className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">{pushing ? 'Pushing…' : 'Push to Live Control'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Pre-Service tab ──────────────────────────────────────────────────────────

function PreServiceTab({ canEdit, userProfile }) {
  // Team (loaded for assignment only)
  const [team, setTeam] = useState([])
  const [teamLoading, setTeamLoading] = useState(true)

  // Weekly entry — always a Sunday
  const [selectedDate, setSelectedDate] = useState(nextSunday)
  const [entryLoading, setEntryLoading] = useState(false)
  const [entrySaving, setEntrySaving] = useState(false)
  const [speakers, setSpeakers] = useState([])
  const [topics, setTopics] = useState([])
  const [newTopic, setNewTopic] = useState('')
  const [editingTopicIdx, setEditingTopicIdx] = useState(null)
  const [editingTopicVal, setEditingTopicVal] = useState('')

  const prevSunday = () => setSelectedDate(format(subWeeks(new Date(selectedDate), 1), 'yyyy-MM-dd'))
  const nextSundayNav = () => setSelectedDate(format(addWeeks(new Date(selectedDate), 1), 'yyyy-MM-dd'))

  // Load team
  useEffect(() => {
    setTeamLoading(true)
    getSundayPreServiceTeam()
      .then(setTeam)
      .catch(() => setTeam([]))
      .finally(() => setTeamLoading(false))
  }, [])

  // Load weekly entry when date changes
  useEffect(() => {
    if (!selectedDate) return
    setEntryLoading(true)
    getSundayPreServiceEntry(selectedDate)
      .then((entry) => {
        setSpeakers(entry?.speakers || [])
        setTopics(entry?.topics || [])
      })
      .catch(() => { setSpeakers([]); setTopics([]) })
      .finally(() => setEntryLoading(false))
  }, [selectedDate])

  const assignSpeaker = (name) => {
    setSpeakers((prev) => {
      if (prev.includes(name)) return prev
      if (prev.length >= 2) return prev
      return [...prev, name]
    })
  }

  const removeSpeaker = (name) => setSpeakers((prev) => prev.filter((s) => s !== name))

  const addTopic = () => {
    const t = newTopic.trim()
    if (!t) return
    setTopics((prev) => [...prev, t])
    setNewTopic('')
  }

  const saveEntry = async () => {
    setEntrySaving(true)
    try {
      await setSundayPreServiceEntry(selectedDate, { speakers, topics }, userProfile?.email || 'unknown')
    } catch (e) { console.error(e); alert('Failed to save') }
    setEntrySaving(false)
  }

  return (
    <div className="space-y-5">

      {/* ── Weekly assignment ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
        <div>
          <h2 className="font-semibold text-slate-800">Weekly Assignment</h2>
        </div>

        {/* Sunday navigation — no free-form date input */}
        <div className="flex items-center gap-3">
          <button type="button" onClick={prevSunday} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">← Prev</button>
          <span className="text-sm font-semibold text-slate-800">
            {format(new Date(selectedDate), 'EEE, dd MMM yyyy')}
          </span>
          <button type="button" onClick={nextSundayNav} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">Next →</button>
        </div>

        {entryLoading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <>
            {/* Speaker assignment — loaded from team */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">
                Pre-Service Talk Speaker
                <span className="text-xs font-normal text-slate-400 ml-1">(up to 2)</span>
              </p>

              {team.length === 0 ? (
                <p className="text-xs text-slate-400">Add team members in the Pre-Service Team section above first.</p>
              ) : (
                <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
                  {team.map((name) => {
                    const assigned = speakers.includes(name)
                    const limitReached = !assigned && speakers.length >= 2
                    return (
                      <li key={name} className="flex items-center gap-3 px-3 py-2.5">
                        <span className={`flex-1 text-sm font-medium ${assigned ? 'text-indigo-700' : 'text-slate-800'}`}>
                          {name}
                        </span>
                        {assigned
                          ? <span className="text-xs text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded-full">Assigned</span>
                          : null
                        }
                        {canEdit && (
                          assigned ? (
                            <button type="button" onClick={() => removeSpeaker(name)} className="text-xs text-red-500 hover:underline">Remove</button>
                          ) : (
                            <button
                              type="button"
                              disabled={limitReached}
                              onClick={() => assignSpeaker(name)}
                              className="text-xs text-indigo-600 hover:underline disabled:text-slate-300 disabled:cursor-not-allowed"
                            >
                              Assign
                            </button>
                          )
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* Topics */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Major Topics</p>
              {topics.length > 0 && (
                <ul className="space-y-1.5">
                  {topics.map((topic, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      {editingTopicIdx === idx ? (
                        <>
                          <input
                            type="text"
                            value={editingTopicVal}
                            onChange={(e) => setEditingTopicVal(e.target.value)}
                            className="flex-1 px-2 py-1 rounded border border-slate-300 text-sm"
                            autoFocus
                          />
                          <button type="button" onClick={() => { const v = editingTopicVal.trim(); if (v) setTopics((prev) => prev.map((t, i) => i === idx ? v : t)); setEditingTopicIdx(null) }} className="text-indigo-600 text-xs hover:underline">Save</button>
                          <button type="button" onClick={() => setEditingTopicIdx(null)} className="text-slate-400 text-xs hover:underline">Cancel</button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-1.5 border border-slate-100">{topic}</span>
                          {canEdit && (
                            <>
                              <button type="button" onClick={() => { setEditingTopicIdx(idx); setEditingTopicVal(topic) }} className="text-blue-600 text-xs hover:underline">Edit</button>
                              <button type="button" onClick={() => setTopics((prev) => prev.filter((_, i) => i !== idx))} className="text-red-600 text-xs hover:underline">Remove</button>
                            </>
                          )}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {canEdit && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addTopic()}
                    placeholder="Enter a topic"
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                  <button type="button" onClick={addTopic} className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-medium hover:bg-slate-800">Add</button>
                </div>
              )}
            </div>

            {canEdit && (
              <button
                type="button"
                onClick={saveEntry}
                disabled={entrySaving}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {entrySaving ? 'Saving…' : 'Save Assignment'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Crew tab ─────────────────────────────────────────────────────────────────

const COMMON_ROLES = ['Sound', 'Projection', 'Worship', 'Usher', 'River Kids', 'Photography']

function CrewTab({ canEdit, userProfile }) {
  const [roster, setRoster] = useState([])
  const [rosterLoading, setRosterLoading] = useState(true)
  const [rosterSaving, setRosterSaving] = useState(false)
  const [showRoster, setShowRoster] = useState(false)
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [newRole, setNewRole] = useState('')
  const [teamMembers, setTeamMembers] = useState([])
  const [teamLoading, setTeamLoading] = useState(true)

  const [selectedDate, setSelectedDate] = useState(nextSunday)
  const [entryLoading, setEntryLoading] = useState(false)
  const [entrySaving, setEntrySaving] = useState(false)
  const [serving, setServing] = useState([])
  const [notes, setNotes] = useState('')

  const prevSunday = () => setSelectedDate(format(subWeeks(new Date(selectedDate), 1), 'yyyy-MM-dd'))
  const nextSundayNav = () => setSelectedDate(format(addWeeks(new Date(selectedDate), 1), 'yyyy-MM-dd'))

  useEffect(() => {
    setRosterLoading(true)
    getSundayCrewRoster()
      .then(setRoster)
      .catch(() => setRoster([]))
      .finally(() => setRosterLoading(false))
  }, [])

  useEffect(() => {
    setTeamLoading(true)
    getDepartmentTeamMembers('Sunday Ministry')
      .then((members) => setTeamMembers((members || []).filter((m) => !m.isFormer && m.status !== 'inactive')))
      .catch(() => setTeamMembers([]))
      .finally(() => setTeamLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedDate) return
    setEntryLoading(true)
    getSundayCrewEntry(selectedDate)
      .then((entry) => {
        setServing(entry?.serving || [])
        setNotes(entry?.notes || '')
      })
      .catch(() => { setServing([]); setNotes('') })
      .finally(() => setEntryLoading(false))
  }, [selectedDate])

  // When a team member is picked from dropdown, auto-fill role from their first sub-department
  const handleMemberSelect = (e) => {
    const val = e.target.value
    setSelectedMemberId(val)
    if (val) {
      const member = teamMembers.find((m) => m.id === val)
      const autoRole = (member?.subDepartments?.[0] || member?.rolePosition || '').trim()
      setNewRole(autoRole)
    } else {
      setNewRole('')
    }
  }

  const addMember = () => {
    const member = teamMembers.find((m) => m.id === selectedMemberId)
    const name = member?.name?.trim()
    if (!name) return
    if (roster.some((r) => r.name === name)) return
    setRoster((prev) => [...prev, { name, role: newRole.trim() }])
    setSelectedMemberId('')
    setNewRole('')
  }

  const removeMember = (idx) => setRoster((prev) => prev.filter((_, i) => i !== idx))

  const saveRoster = async () => {
    setRosterSaving(true)
    try {
      await setSundayCrewRoster(roster, userProfile?.email || 'unknown')
    } catch (e) { console.error(e); alert('Failed to save roster') }
    setRosterSaving(false)
  }

  const toggleServing = (name) => {
    setServing((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name])
  }

  const saveEntry = async () => {
    setEntrySaving(true)
    try {
      await setSundayCrewEntry(selectedDate, { serving, notes }, userProfile?.email || 'unknown')
    } catch (e) { console.error(e); alert('Failed to save') }
    setEntrySaving(false)
  }

  const byRole = roster.reduce((acc, m) => {
    const key = m.role || 'Other'
    if (!acc[key]) acc[key] = []
    acc[key].push(m)
    return acc
  }, {})
  const roleOrder = [...new Set(roster.map((m) => m.role || 'Other'))]

  // Members not yet in roster, for the dropdown
  const rosterNames = new Set(roster.map((m) => m.name))
  const availableMembers = teamMembers.filter((m) => !rosterNames.has(m.name?.trim()))

  return (
    <div className="space-y-5">

      {/* ── Weekly assignment ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
        <h2 className="font-semibold text-slate-800">Weekly Crew</h2>

        <div className="flex items-center gap-3">
          <button type="button" onClick={prevSunday} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">← Prev</button>
          <span className="text-sm font-semibold text-slate-800">
            {format(new Date(selectedDate), 'EEE, dd MMM yyyy')}
          </span>
          <button type="button" onClick={nextSundayNav} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">Next →</button>
        </div>

        {entryLoading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : rosterLoading ? (
          <p className="text-sm text-slate-400">Loading roster…</p>
        ) : roster.length === 0 ? (
          <p className="text-sm text-slate-400">No crew members yet. Add members in the Crew Roster below.</p>
        ) : (
          <>
            <div className="space-y-3">
              {roleOrder.map((role) => (
                <div key={role}>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{role}</p>
                  <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
                    {(byRole[role] || []).map((m) => {
                      const isServing = serving.includes(m.name)
                      return (
                        <div key={m.name} className="flex items-center gap-3 px-3 py-2.5">
                          <span className={`flex-1 text-sm font-medium ${isServing ? 'text-indigo-700' : 'text-slate-800'}`}>
                            {m.name}
                          </span>
                          {isServing && (
                            <span className="text-xs text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded-full">Serving</span>
                          )}
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => toggleServing(m.name)}
                              className={`text-xs hover:underline ${isServing ? 'text-red-500' : 'text-indigo-600'}`}
                            >
                              {isServing ? 'Remove' : 'Assign'}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-700">Notes</p>
              {canEdit ? (
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Any notes for this week…"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm resize-none"
                />
              ) : (
                notes ? <p className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2">{notes}</p> : <p className="text-sm text-slate-400">—</p>
              )}
            </div>

            {canEdit && (
              <button
                type="button"
                onClick={saveEntry}
                disabled={entrySaving}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {entrySaving ? 'Saving…' : 'Save Crew'}
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Roster management ── */}
      {canEdit && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setShowRoster((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            <span>Manage Crew Roster</span>
            <span className="text-slate-400">{showRoster ? '▲' : '▼'}</span>
          </button>

          {showRoster && (
            <div className="px-4 pb-4 space-y-4 border-t border-slate-100">
              {rosterLoading ? (
                <p className="text-sm text-slate-400 pt-3">Loading…</p>
              ) : (
                <>
                  {roster.length > 0 && (
                    <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg mt-3">
                      {roster.map((m, idx) => (
                        <li key={idx} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                          <span className="flex-1 font-medium text-slate-800">{m.name}</span>
                          {m.role && <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{m.role}</span>}
                          <button type="button" onClick={() => removeMember(idx)} className="text-red-500 hover:underline text-xs">Remove</button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="flex flex-wrap gap-2 items-end pt-1">
                    <div className="flex-1 min-w-[180px]">
                      <label className="block text-xs text-slate-500 mb-1">Member</label>
                      {teamLoading ? (
                        <p className="text-xs text-slate-400 py-2">Loading members…</p>
                      ) : (
                        <select
                          value={selectedMemberId}
                          onChange={handleMemberSelect}
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                        >
                          <option value="">— Select a member —</option>
                          {availableMembers.length === 0 && roster.length > 0 && (
                            <option disabled>All team members added</option>
                          )}
                          {availableMembers.map((m) => {
                            const subDepts = (m.subDepartments || []).filter(Boolean)
                            const label = subDepts.length
                              ? `${m.name}  (${subDepts.join(', ')})`
                              : m.name
                            return (
                              <option key={m.id} value={m.id}>{label}</option>
                            )
                          })}
                        </select>
                      )}
                    </div>
                    <div className="flex-1 min-w-[120px]">
                      <label className="block text-xs text-slate-500 mb-1">Crew Role</label>
                      <input
                        type="text"
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value)}
                        list="crew-roles"
                        placeholder="e.g. Sound"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                      />
                      <datalist id="crew-roles">
                        {COMMON_ROLES.map((r) => <option key={r} value={r} />)}
                      </datalist>
                    </div>
                    <button
                      type="button"
                      onClick={addMember}
                      disabled={!selectedMemberId}
                      className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-40"
                    >
                      Add
                    </button>
                  </div>

                  {teamMembers.length === 0 && !teamLoading && (
                    <p className="text-xs text-slate-400">No Sunday Ministry team members found. Add members in the Sunday Ministry team page first.</p>
                  )}

                  <button
                    type="button"
                    onClick={saveRoster}
                    disabled={rosterSaving}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {rosterSaving ? 'Saving…' : 'Save Roster'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SundayProgram() {
  const { userProfile, canManageDepartment, isCellDirector } = useAuth()
  const navigate = useNavigate()
  const canEdit = canManageDepartment('Sunday Ministry') || isCellDirector
  const [subTab, setSubTab] = useState('default')

  if (!canManageDepartment('Sunday Ministry') && !isCellDirector) {
    return (
      <div className="p-8 text-slate-600">
        <Link to="/department/sunday-ministry" className="text-blue-600 hover:underline">← Sunday Ministry</Link>
        <p className="mt-4">You do not have permission to manage Sunday Program.</p>
      </div>
    )
  }

  return (
    <div>
      <DepartmentTabBar slug="sunday-ministry" activeTab="sundayProgram" />
      <div className="space-y-2 p-4 max-w-3xl">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-800">Sunday Program</h1>
        </div>

        <SubTabBar active={subTab} onChange={setSubTab} />

        {subTab === 'default' && <DefaultProgramTab canEdit={canEdit} userProfile={userProfile} navigate={navigate} />}
        {subTab === 'preService' && <PreServiceTab canEdit={canEdit} userProfile={userProfile} />}
        {subTab === 'crew' && <CrewTab canEdit={canEdit} userProfile={userProfile} />}
      </div>
    </div>
  )
}
