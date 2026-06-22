import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { useAuth } from '../context/AuthContext'
import {
  getProgramNotification,
  getSundayProgramDefault,
  getWorshipScheduleByDate,
  getDeptProgramInput,
  setDeptProgramInput,
} from '../services/firestore'

const DEFAULT_SEED = [
  { programName: 'Pre Worship Talk' },
  { programName: 'Worship' },
  { programName: 'Leader Prayer' },
  { programName: 'Announcements' },
  { programName: 'Sermon' },
  { programName: 'Prayer & Benediction' },
]

const SLUG_TO_DEPT = {
  media: 'Media',
  worship: 'Worship',
  'd-light': 'D Light',
  administration: 'Administration',
}

function getNextSundayISO() {
  const today = new Date()
  const day = today.getDay()
  const diff = day === 0 ? 0 : 7 - day
  const next = new Date(today)
  next.setDate(today.getDate() + diff)
  return format(next, 'yyyy-MM-dd')
}

function formatDisplay(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return format(new Date(y, m - 1, d), 'EEEE, dd MMMM yyyy')
}

export default function UpcomingSunday({ slug }) {
  const { userProfile, canManageDepartment } = useAuth()
  const sundayDate = getNextSundayISO()
  const deptName = SLUG_TO_DEPT[slug] || slug
  const canEdit = canManageDepartment(deptName)

  const [notification, setNotification] = useState(null)
  const [defaultPrograms, setDefaultPrograms] = useState([])
  const [worshipPlan, setWorshipPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)

  // Dept's own data
  const [programElements, setProgramElements] = useState({})
  const [customPrograms, setCustomPrograms] = useState([])

  // UI
  const [expandedProgram, setExpandedProgram] = useState(null)
  const [newElInputs, setNewElInputs] = useState({})
  const [addingCustom, setAddingCustom] = useState(false)
  const [newCustomName, setNewCustomName] = useState('')
  const [expandedCustom, setExpandedCustom] = useState(null)
  const [newCustomElInputs, setNewCustomElInputs] = useState({})

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getProgramNotification(sundayDate),
      getSundayProgramDefault(),
      getDeptProgramInput(sundayDate, slug),
    ])
      .then(([notif, defaultDoc, deptInput]) => {
        setNotification(notif)
        const items = defaultDoc?.items?.length
          ? defaultDoc.items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          : [...DEFAULT_SEED]
        setDefaultPrograms(items.map((i) => i.programName))
        setProgramElements(deptInput?.programElements || {})
        setCustomPrograms(deptInput?.customPrograms || [])
      })
      .catch(() => setDefaultPrograms(DEFAULT_SEED.map((i) => i.programName)))
      .finally(() => setLoading(false))
  }, [sundayDate, slug])

  useEffect(() => {
    if (slug !== 'worship') return
    getWorshipScheduleByDate('Worship', sundayDate)
      .then(setWorshipPlan)
      .catch(() => setWorshipPlan(null))
  }, [sundayDate, slug])

  const programs = notification?.programs?.length ? notification.programs : defaultPrograms

  const leadVocals = slug === 'worship'
    ? (worshipPlan?.assignments || [])
        .filter((a) => a.role?.startsWith('Lead Vocal') && (a.songName || a.memberName))
        .sort((a, b) => a.role.localeCompare(b.role))
    : []

  // ── Element handlers ────────────────────────────────────────────────────────

  const addElement = (programName) => {
    const el = (newElInputs[programName] || '').trim()
    if (!el) return
    setProgramElements((prev) => ({
      ...prev,
      [programName]: [...(prev[programName] || []), el],
    }))
    setNewElInputs((prev) => ({ ...prev, [programName]: '' }))
  }

  const removeElement = (programName, el) => {
    setProgramElements((prev) => ({
      ...prev,
      [programName]: (prev[programName] || []).filter((e) => e !== el),
    }))
  }

  // ── Custom programme handlers ───────────────────────────────────────────────

  const addCustomProgram = () => {
    const name = newCustomName.trim()
    if (!name) return
    if (customPrograms.some((p) => p.programName === name)) { setNewCustomName(''); setAddingCustom(false); return }
    setCustomPrograms((prev) => [...prev, { programName: name, elements: [] }])
    setNewCustomName('')
    setAddingCustom(false)
    setExpandedCustom(name)
  }

  const removeCustomProgram = (name) => {
    setCustomPrograms((prev) => prev.filter((p) => p.programName !== name))
    if (expandedCustom === name) setExpandedCustom(null)
  }

  const addCustomElement = (programName) => {
    const el = (newCustomElInputs[programName] || '').trim()
    if (!el) return
    setCustomPrograms((prev) =>
      prev.map((p) =>
        p.programName === programName ? { ...p, elements: [...p.elements, el] } : p
      )
    )
    setNewCustomElInputs((prev) => ({ ...prev, [programName]: '' }))
  }

  const removeCustomElement = (programName, el) => {
    setCustomPrograms((prev) =>
      prev.map((p) =>
        p.programName === programName ? { ...p, elements: p.elements.filter((e) => e !== el) } : p
      )
    )
  }

  const save = async () => {
    setSaving(true)
    try {
      await setDeptProgramInput(
        sundayDate, slug,
        { programElements, customPrograms },
        userProfile?.email || 'unknown'
      )
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 2500)
    } catch (e) {
      console.error(e)
      alert('Failed to save')
    }
    setSaving(false)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 max-w-lg">

      {/* Header card */}
      <div className="rounded-2xl overflow-hidden shadow-sm border border-indigo-100">
        <div
          style={{ background: 'linear-gradient(135deg, #4338ca 0%, #6366f1 60%, #7c3aed 100%)' }}
          className="px-5 py-4 text-white"
        >
          <p className="text-indigo-200 text-xs uppercase tracking-widest mb-0.5">Upcoming Sunday</p>
          <h2 className="text-lg font-bold">{formatDisplay(sundayDate)}</h2>
          <div className="mt-2">
            {notification ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-white text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 inline-block" />
                Programme sent by Sunday Ministry
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-indigo-200 text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-300 inline-block" />
                Awaiting programme notification
              </span>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-center text-slate-400 text-sm">Loading…</div>
      ) : (
        <>
          {/* ── Sunday Programme ── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
              <h3 className="font-semibold text-slate-800 text-sm flex-1">Sunday Programme</h3>
              <span className="text-xs text-slate-400">{programs.length} items</span>
            </div>

            <div className="divide-y divide-slate-50">
              {programs.map((name, idx) => {
                const isExpanded = expandedProgram === name
                const deptEls = programElements[name] || []
                const isWorship = name === 'Worship'

                return (
                  <div key={name}>
                    {/* Row header */}
                    <button
                      type="button"
                      onClick={() => setExpandedProgram(isExpanded ? null : name)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition"
                    >
                      <span style={{
                        width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                        background: isExpanded ? '#6366f1' : '#e2e8f0',
                        color: isExpanded ? '#fff' : '#64748b',
                        fontSize: 10, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {idx + 1}
                      </span>
                      <span className={`flex-1 font-semibold text-sm ${isExpanded ? 'text-indigo-700' : 'text-slate-800'}`}>
                        {name}
                      </span>
                      {deptEls.length > 0 && (
                        <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                          {deptEls.length}
                        </span>
                      )}
                      <span className="text-slate-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
                    </button>

                    {/* Collapsed: show element chips */}
                    {!isExpanded && deptEls.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
                        {deptEls.map((el) => (
                          <span key={el} className="text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                            {el}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Expanded panel */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3 bg-slate-50/50">

                        {/* Worship songs (worship dept only) */}
                        {isWorship && leadVocals.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-2">Worship Songs</p>
                            <div className="space-y-1">
                              {leadVocals.map((a) => (
                                <div key={a.role} className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-lg">
                                    {a.role.replace('Lead Vocal-', 'Lead Vocal ')}
                                  </span>
                                  {a.songName && <span className="text-xs font-semibold text-slate-800">{a.songName}</span>}
                                  {a.key && <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">{a.key}</span>}
                                  {a.memberName && <span className="text-xs text-slate-500">{a.memberName}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Dept elements */}
                        {deptEls.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Our Elements</p>
                            <div className="flex flex-wrap gap-1.5">
                              {deptEls.map((el) => (
                                <span key={el} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-full">
                                  {el}
                                  {canEdit && (
                                    <button
                                      type="button"
                                      onClick={() => removeElement(name, el)}
                                      className="text-indigo-300 hover:text-red-500 leading-none ml-0.5"
                                    >
                                      ×
                                    </button>
                                  )}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Add element */}
                        {canEdit && (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newElInputs[name] || ''}
                              onChange={(e) => setNewElInputs((prev) => ({ ...prev, [name]: e.target.value }))}
                              onKeyDown={(e) => e.key === 'Enter' && addElement(name)}
                              placeholder="Add our element…"
                              className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                            />
                            <button
                              type="button"
                              onClick={() => addElement(name)}
                              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                            >
                              Add
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Our Programmes ── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
              <h3 className="font-semibold text-slate-800 text-sm flex-1">Our Programmes</h3>
              {canEdit && !addingCustom && (
                <button
                  type="button"
                  onClick={() => setAddingCustom(true)}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                >
                  <span className="text-base leading-none">+</span> Add
                </button>
              )}
            </div>

            {/* Add programme input */}
            {addingCustom && (
              <div className="px-4 py-3 border-b border-slate-100 flex gap-2 bg-indigo-50/50">
                <input
                  autoFocus
                  type="text"
                  value={newCustomName}
                  onChange={(e) => setNewCustomName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addCustomProgram(); if (e.key === 'Escape') { setAddingCustom(false); setNewCustomName('') } }}
                  placeholder="Programme name"
                  className="flex-1 px-3 py-2 rounded-lg border border-indigo-300 text-sm bg-white"
                />
                <button type="button" onClick={addCustomProgram}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">
                  Add
                </button>
                <button type="button" onClick={() => { setAddingCustom(false); setNewCustomName('') }}
                  className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-500 hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            )}

            {customPrograms.length === 0 && !addingCustom ? (
              <p className="px-4 py-6 text-sm text-slate-400 text-center">No programmes added yet</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {customPrograms.map((prog) => {
                  const isExpanded = expandedCustom === prog.programName
                  return (
                    <div key={prog.programName}>
                      <div className="flex items-center gap-2 px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setExpandedCustom(isExpanded ? null : prog.programName)}
                          className="flex-1 flex items-center gap-2 text-left"
                        >
                          <span className="flex-1 font-semibold text-sm text-slate-800">{prog.programName}</span>
                          {prog.elements.length > 0 && (
                            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                              {prog.elements.length}
                            </span>
                          )}
                          <span className="text-slate-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
                        </button>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => removeCustomProgram(prog.programName)}
                            className="w-5 h-5 rounded-full bg-red-50 text-red-400 hover:text-red-600 text-sm flex items-center justify-center flex-shrink-0"
                          >
                            ×
                          </button>
                        )}
                      </div>

                      {/* Collapsed chips */}
                      {!isExpanded && prog.elements.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 px-4 pb-3">
                          {prog.elements.map((el) => (
                            <span key={el} className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                              {el}
                            </span>
                          ))}
                        </div>
                      )}

                      {isExpanded && (
                        <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3 bg-slate-50/50">
                          {prog.elements.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {prog.elements.map((el) => (
                                <span key={el} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-full">
                                  {el}
                                  {canEdit && (
                                    <button
                                      type="button"
                                      onClick={() => removeCustomElement(prog.programName, el)}
                                      className="text-emerald-300 hover:text-red-500 leading-none ml-0.5"
                                    >
                                      ×
                                    </button>
                                  )}
                                </span>
                              ))}
                            </div>
                          )}
                          {canEdit && (
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={newCustomElInputs[prog.programName] || ''}
                                onChange={(e) => setNewCustomElInputs((prev) => ({ ...prev, [prog.programName]: e.target.value }))}
                                onKeyDown={(e) => e.key === 'Enter' && addCustomElement(prog.programName)}
                                placeholder="Add element…"
                                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                              />
                              <button
                                type="button"
                                onClick={() => addCustomElement(prog.programName)}
                                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                              >
                                Add
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Save */}
          {canEdit && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 shadow-sm"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              {savedOk && <span className="text-sm text-emerald-600 font-semibold">Saved!</span>}
            </div>
          )}
        </>
      )}
    </div>
  )
}
