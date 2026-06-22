import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getSundayProgramDefault,
  pushProgramToSundayReport,
  getSundayProgramDesign,
  setSundayProgramDesign,
  sendProgramNotification,
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

// ─── Default Program tab ─────────────────────────────────────────────────────

function DefaultProgramTab({ canEdit, userProfile, navigate }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [pushDate, setPushDate] = useState(nextSunday)
  const [pushing, setPushing] = useState(false)
  const [pushSuccess, setPushSuccess] = useState(false)
  const [sendingNotif, setSendingNotif] = useState(false)
  const [notifSuccess, setNotifSuccess] = useState(false)
  const [form, setForm] = useState({ programName: '', order: 1 })
  const [editingId, setEditingId] = useState(null)
  const [designedPrograms, setDesignedPrograms] = useState([])

  useEffect(() => {
    setLoading(true)
    Promise.all([getSundayProgramDefault(), getSundayProgramDesign()])
      .then(([doc, designDoc]) => {
        const list = doc.items?.length ? doc.items : [...DEFAULT_SEED]
        setItems(list.map((x, i) => ({ ...x, localId: `lp-${i}-${String(x.programName || '').slice(0, 20)}` })))
        const seed = DEFAULT_SEED.map((s) => s.programName)
        const custom = designDoc?.customPrograms || []
        const designs = designDoc?.designs || {}
        const all = [...seed]
        custom.forEach((p) => { if (!all.includes(p)) all.push(p) })
        setDesignedPrograms(all.filter((p) => (designs[p] || []).length > 0))
      })
      .catch(() => {
        setItems(DEFAULT_SEED.map((x, i) => ({ ...x, localId: `seed-${i}` })))
        setDesignedPrograms([])
      })
      .finally(() => setLoading(false))
  }, [])

  const sorted = [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const addRow = () => {
    const name = (form.programName || '').trim()
    if (!name) return
    if (editingId) {
      setItems((prev) => prev.map((x) => (x.localId === editingId ? { ...x, programName: name } : x)))
      setEditingId(null)
      setForm({ programName: '', order: sorted.length + 1 })
      return
    }
    // Insert at the 1-based position the user entered, shifting items at that position and below down
    const pos = Math.max(1, Math.min(sorted.length + 1, Number(form.order) || sorted.length + 1))
    const newItem = { programName: name, order: 0, localId: `new-${Date.now()}` }
    const next = [...sorted]
    next.splice(pos - 1, 0, newItem)
    // Reindex so orders are always 0,1,2,3…
    setItems(next.map((x, i) => ({ ...x, order: i })))
    setForm({ programName: '', order: next.length + 1 })
  }

  if (loading) return <p className="text-slate-500">Loading…</p>

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
      <h2 className="font-semibold text-slate-800">Program items</h2>

      {canEdit && (
        <div className="space-y-3 pb-1">
          {/* Program picker grid */}
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2">
              {editingId ? 'Change program' : 'Select program to add'}
            </p>
            {(() => {
              const available = editingId
                ? designedPrograms
                : designedPrograms.filter((p) => !sorted.some((x) => x.programName === p))
              if (available.length === 0) {
                return (
                  <p className="text-xs text-slate-400 italic">
                    {editingId ? 'No programs available.' : 'All designed programs are already added.'}
                  </p>
                )
              }
              return (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {available.map((p) => {
                    const isSelected = form.programName === p
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, programName: p }))}
                        className="text-left px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all active:scale-95"
                        style={isSelected ? {
                          borderColor: '#6366f1',
                          background: '#eef2ff',
                          color: '#4338ca',
                          boxShadow: '0 0 0 1.5px #6366f1',
                        } : {
                          borderColor: '#e2e8f0',
                          background: '#f8fafc',
                          color: '#374151',
                        }}
                      >
                        {isSelected && (
                          <span className="inline-block mr-1.5 text-indigo-500 font-bold">✓</span>
                        )}
                        {p}
                      </button>
                    )
                  })}
                </div>
              )
            })()}
          </div>

          {/* Position + action buttons */}
          <div className="flex flex-wrap gap-2 items-center pt-1">
            <div className="w-24">
              <label className="block text-xs text-slate-500 mb-1">Position</label>
              <input type="number" min={1} value={form.order} onChange={(e) => setForm((f) => ({ ...f, order: Number(e.target.value) || 1 }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
            </div>
            <button
              type="button"
              onClick={addRow}
              disabled={!form.programName}
              className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-40 mt-4"
            >
              {editingId ? 'Apply edit' : 'Add Program'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => { setEditingId(null); setForm({ programName: '', order: sorted.length + 1 }) }}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm mt-4"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
        {sorted.map((row, idx) => (
          <li key={row.localId || row.programName + idx} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
            <span className="text-slate-400 w-6 font-medium">{idx + 1}.</span>
            <span className="font-medium text-slate-800 flex-1">{row.programName}</span>
            {canEdit && (
              <>
                <button type="button" onClick={() => { setEditingId(row.localId); setForm({ programName: row.programName, order: idx + 1 }) }} className="text-blue-600 hover:underline text-xs">Edit</button>
                <button type="button" onClick={() => {
                  const next = sorted.filter((x) => x.localId !== row.localId).map((x, i) => ({ ...x, order: i }))
                  setItems(next)
                }} className="text-red-600 hover:underline text-xs">Remove</button>
                {idx > 0 && <button type="button" onClick={() => {
                  const next = [...sorted]
                  ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
                  setItems(next.map((x, i) => ({ ...x, order: i })))
                }} className="text-slate-600 text-xs px-1">↑</button>}
                {idx < sorted.length - 1 && <button type="button" onClick={() => {
                  const next = [...sorted]
                  ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
                  setItems(next.map((x, i) => ({ ...x, order: i })))
                }} className="text-slate-600 text-xs px-1">↓</button>}
              </>
            )}
          </li>
        ))}
      </ul>

      {canEdit && (
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-slate-600 font-medium">Sunday date:</label>
            <input
              type="date"
              value={pushDate}
              onChange={(e) => { setPushDate(e.target.value); setPushSuccess(false); setNotifSuccess(false) }}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <button
              type="button"
              disabled={sendingNotif || !pushDate || sorted.length === 0}
              onClick={async () => {
                setSendingNotif(true); setNotifSuccess(false)
                try {
                  const names = sorted.map((x) => String(x.programName || '').trim()).filter(Boolean)
                  await sendProgramNotification(pushDate, names, userProfile?.email || 'unknown')
                  setNotifSuccess(true)
                  setTimeout(() => setNotifSuccess(false), 3000)
                } catch (e) { console.error(e); alert('Failed to send notification') }
                setSendingNotif(false)
              }}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              {sendingNotif ? 'Sending…' : 'Send Program Notification'}
            </button>

            <button
              type="button"
              disabled={pushing || !pushDate}
              onClick={async () => {
                setPushing(true); setPushSuccess(false)
                try {
                  const payload = [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((x, i) => ({ programName: String(x.programName || '').trim(), order: typeof x.order === 'number' ? x.order : i })).filter((x) => x.programName)
                  await pushProgramToSundayReport(pushDate, payload)
                  navigate(`/department/sunday-ministry/sunday?subtab=livecontrol&date=${pushDate}`)
                } catch (e) { console.error(e); alert('Failed to push program') }
                setPushing(false)
              }}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
            >
              {pushing ? 'Pushing…' : 'Push to Live Control'}
            </button>

            {notifSuccess && (
              <span className="text-sm text-indigo-600 font-semibold">Notification sent to departments!</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-tab bar ─────────────────────────────────────────────────────────────

function SubTabBar({ active, onChange }) {
  const tabs = [
    { id: 'default', label: 'Default Program' },
    { id: 'design', label: 'Design Program' },
  ]
  return (
    <div className="flex gap-1 border-b border-slate-200 mb-4">
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

// ─── Design Program tab ───────────────────────────────────────────────────────

const ELEMENT_CATEGORIES = [
  {
    id: 'stage',
    label: 'Stage Management',
    dotColor: '#7c3aed',
    activeBg: '#ede9fe',
    activeColor: '#5b21b6',
    activeBorder: '#c4b5fd',
    elements: [
      'Reposition Podium', 'Stage Reset', 'Chair Setup', 'Chair Removal',
      'Table Setup', 'Prop Placement', 'Prop Clearance', 'Banner Placement', 'Stage Transition',
    ],
  },
  {
    id: 'team',
    label: 'Team Alert',
    dotColor: '#b45309',
    activeBg: '#fef3c7',
    activeColor: '#92400e',
    activeBorder: '#fcd34d',
    elements: ['Crew Alert', 'Guest Ready', 'Pastor Ready', 'Presenter Ready', 'Team Ready'],
  },
  {
    id: 'distribution',
    label: 'Distribution',
    dotColor: '#047857',
    activeBg: '#d1fae5',
    activeColor: '#065f46',
    activeBorder: '#6ee7b7',
    elements: [
      'Card Distribution', 'Communion Distribution', 'Handout Distribution',
      'Certificate Distribution', 'Gift Distribution', 'Feedback Form Distribution', 'Resource Distribution',
    ],
  },
  {
    id: 'logistics',
    label: 'Logistics',
    dotColor: '#0369a1',
    activeBg: '#e0f2fe',
    activeColor: '#075985',
    activeBorder: '#7dd3fc',
    elements: ['Snacks Ready', 'Food Ready', 'Water Ready'],
  },
]

const CARD_COLORS = [
  { accent: '#6366f1', light: '#eef2ff' },
  { accent: '#ec4899', light: '#fdf2f8' },
  { accent: '#f59e0b', light: '#fffbeb' },
  { accent: '#0ea5e9', light: '#f0f9ff' },
  { accent: '#8b5cf6', light: '#faf5ff' },
  { accent: '#14b8a6', light: '#f0fdfa' },
]
const CUSTOM_CARD_COLOR = { accent: '#10b981', light: '#f0fdf4' }

function getElColor(el) {
  for (const cat of ELEMENT_CATEGORIES) {
    if (cat.elements.includes(el)) return { bg: cat.activeBg, color: cat.activeColor }
  }
  return { bg: '#f1f5f9', color: '#475569' }
}

function DesignProgramTab({ canEdit, userProfile }) {
  const [programs, setPrograms] = useState([])
  const [customPrograms, setCustomPrograms] = useState([])
  const [designs, setDesigns] = useState({})
  const [customElements, setCustomElements] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [expandedProgram, setExpandedProgram] = useState(null)
  const [addingProgram, setAddingProgram] = useState(false)
  const [newProgram, setNewProgram] = useState('')
  const [newCustomEl, setNewCustomEl] = useState('')
  const [showCustomMgmt, setShowCustomMgmt] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([getSundayProgramDefault(), getSundayProgramDesign()])
      .then(([defaultDoc, designDoc]) => {
        const items = defaultDoc?.items?.length
          ? defaultDoc.items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          : [...DEFAULT_SEED]
        setPrograms(items.map((i) => i.programName))
        setDesigns(designDoc?.designs || {})
        setCustomElements(designDoc?.customElements || [])
        setCustomPrograms(designDoc?.customPrograms || [])
      })
      .catch(() => setPrograms(DEFAULT_SEED.map((i) => i.programName)))
      .finally(() => setLoading(false))
  }, [])

  const toggleElement = (programName, element) => {
    if (!canEdit) return
    setDesigns((prev) => {
      const current = prev[programName] || []
      const next = current.includes(element)
        ? current.filter((e) => e !== element)
        : [...current, element]
      return { ...prev, [programName]: next }
    })
  }

  const addProgram = () => {
    const name = newProgram.trim()
    if (!name) { setAddingProgram(false); return }
    if (programs.includes(name) || customPrograms.includes(name)) {
      setNewProgram('')
      setAddingProgram(false)
      return
    }
    setCustomPrograms((prev) => [...prev, name])
    setNewProgram('')
    setAddingProgram(false)
    setExpandedProgram(name)
  }

  const removeCustomProgram = (name) => {
    setCustomPrograms((prev) => prev.filter((p) => p !== name))
    setDesigns((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
    if (expandedProgram === name) setExpandedProgram(null)
  }

  const addCustomElement = () => {
    const el = newCustomEl.trim()
    if (!el) return
    const allPredefined = ELEMENT_CATEGORIES.flatMap((c) => c.elements)
    if (allPredefined.includes(el) || customElements.includes(el)) {
      setNewCustomEl('')
      return
    }
    setCustomElements((prev) => [...prev, el])
    setNewCustomEl('')
  }

  const removeCustomElement = (el) => {
    setCustomElements((prev) => prev.filter((e) => e !== el))
    setDesigns((prev) => {
      const next = { ...prev }
      Object.keys(next).forEach((prog) => {
        next[prog] = (next[prog] || []).filter((e) => e !== el)
      })
      return next
    })
  }

  const save = async () => {
    setSaving(true)
    setSavedOk(false)
    try {
      await setSundayProgramDesign({ designs, customElements, customPrograms }, userProfile?.email || 'unknown')
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 2500)
    } catch (e) {
      console.error(e)
      alert('Failed to save design')
    }
    setSaving(false)
  }

  if (loading) return <p className="text-slate-500">Loading…</p>

  const allPrograms = [...programs, ...customPrograms]
  const selectedAssigned = expandedProgram ? (designs[expandedProgram] || []) : []
  const selectedIdx = expandedProgram ? allPrograms.indexOf(expandedProgram) : 0
  const selectedIsCustom = expandedProgram ? customPrograms.includes(expandedProgram) : false
  const selectedColor = selectedIsCustom ? CUSTOM_CARD_COLOR : CARD_COLORS[selectedIdx % CARD_COLORS.length]

  return (
    <div className="space-y-3">

      {/* Program grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {allPrograms.map((name, idx) => {
          const isSelected = expandedProgram === name
          const assigned = designs[name] || []
          const isCustom = customPrograms.includes(name)
          const color = isCustom ? CUSTOM_CARD_COLOR : CARD_COLORS[idx % CARD_COLORS.length]

          return (
            <div
              key={name}
              className="relative rounded-2xl overflow-hidden transition-all duration-200"
              style={{
                background: '#fff',
                boxShadow: isSelected
                  ? `0 0 0 2.5px ${color.accent}, 0 6px 20px ${color.accent}28`
                  : '0 1px 3px #0000000f, 0 1px 8px #0000000a',
              }}
            >
              {/* Colored top stripe */}
              <div style={{
                height: 4,
                background: `linear-gradient(90deg, ${color.accent}, ${color.accent}99)`,
              }} />

              {/* Remove button — custom programs only */}
              {isCustom && canEdit && (
                <button
                  type="button"
                  onClick={() => removeCustomProgram(name)}
                  title="Remove"
                  className="absolute top-3 right-2 z-10 w-5 h-5 rounded-full flex items-center justify-center text-sm transition-all hover:scale-110"
                  style={{ background: '#fee2e2', color: '#ef4444', border: 'none', cursor: 'pointer' }}
                >
                  ×
                </button>
              )}

              {/* Clickable body */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setExpandedProgram(isSelected ? null : name)}
                onKeyDown={(e) => e.key === 'Enter' && setExpandedProgram(isSelected ? null : name)}
                className="cursor-pointer select-none px-3 pt-3 pb-3 transition-colors"
                style={{ background: isSelected ? color.light : 'transparent' }}
              >
                {/* Number badge + name */}
                <div className="flex items-start gap-2 mb-3">
                  <span style={{
                    width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                    background: color.accent,
                    color: '#fff',
                    fontSize: 11, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: `0 3px 10px ${color.accent}55`,
                  }}>
                    {idx + 1}
                  </span>
                  <span style={{
                    fontSize: 12, fontWeight: 700, lineHeight: 1.35,
                    color: isSelected ? color.accent : '#1e293b',
                    paddingTop: 4, flex: 1,
                    paddingRight: isCustom ? 18 : 0,
                  }}>
                    {name}
                  </span>
                </div>

                {/* Element chips */}
                {assigned.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mb-2.5">
                    {assigned.slice(0, 4).map((el) => {
                      const c = getElColor(el)
                      return (
                        <span key={el} style={{
                          fontSize: 9, fontWeight: 600,
                          padding: '2px 7px', borderRadius: 20,
                          background: c.bg, color: c.color,
                        }}>
                          {el}
                        </span>
                      )
                    })}
                    {assigned.length > 4 && (
                      <span style={{
                        fontSize: 9, fontWeight: 700,
                        padding: '2px 7px', borderRadius: 20,
                        background: color.light, color: color.accent,
                      }}>
                        +{assigned.length - 4}
                      </span>
                    )}
                  </div>
                ) : (
                  <p style={{ fontSize: 10, color: '#94a3b8', marginBottom: 10 }}>No elements yet</p>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between">
                  {assigned.length > 0 ? (
                    <span style={{ fontSize: 10, fontWeight: 600, color: color.accent }}>
                      {assigned.length} element{assigned.length !== 1 ? 's' : ''}
                    </span>
                  ) : <span />}
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
                    padding: '2px 9px', borderRadius: 20,
                    background: isSelected ? color.accent : color.light,
                    color: isSelected ? '#fff' : color.accent,
                  }}>
                    {isSelected ? 'CLOSE ▲' : 'DESIGN ▼'}
                  </span>
                </div>
              </div>
            </div>
          )
        })}

        {/* Add program card */}
        {canEdit && (
          addingProgram ? (
            <div
              className="rounded-2xl p-3 flex flex-col gap-2"
              style={{
                border: '2px dashed #a5b4fc',
                background: '#eef2ff',
                minHeight: 110,
              }}
            >
              <p className="text-xs font-bold text-indigo-600 mb-0.5">New program</p>
              <input
                autoFocus
                type="text"
                value={newProgram}
                onChange={(e) => setNewProgram(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addProgram()
                  if (e.key === 'Escape') { setAddingProgram(false); setNewProgram('') }
                }}
                placeholder="Program name"
                className="w-full px-2 py-1.5 rounded-lg border border-indigo-300 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              <div className="flex gap-1.5">
                <button type="button" onClick={addProgram}
                  className="flex-1 px-2 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700">
                  Add
                </button>
                <button type="button" onClick={() => { setAddingProgram(false); setNewProgram('') }}
                  className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingProgram(true)}
              className="rounded-2xl transition-all flex flex-col items-center justify-center gap-2 group"
              style={{
                border: '2px dashed #cbd5e1',
                minHeight: 110,
                background: 'transparent',
              }}
            >
              <span
                className="group-hover:scale-110 transition-transform"
                style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: '#f1f5f9',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, fontWeight: 300, color: '#94a3b8',
                  lineHeight: 1,
                }}
              >
                +
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>New program</span>
            </button>
          )
        )}
      </div>

      {/* Element palette — shown below grid when a program is selected */}
      {expandedProgram && (
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm" style={{ border: `1.5px solid ${selectedColor.accent}44` }}>
          {/* Palette header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ background: selectedColor.light, borderColor: `${selectedColor.accent}22` }}
          >
            <div className="flex items-center gap-2">
              <span style={{
                width: 24, height: 24, borderRadius: '50%',
                background: selectedColor.accent, color: '#fff',
                fontSize: 10, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                boxShadow: `0 2px 6px ${selectedColor.accent}55`,
              }}>
                {allPrograms.indexOf(expandedProgram) + 1}
              </span>
              <span className="text-sm font-bold" style={{ color: selectedColor.accent }}>{expandedProgram}</span>
              {selectedAssigned.length > 0 && (
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: selectedColor.accent, color: '#fff' }}
                >
                  {selectedAssigned.length} element{selectedAssigned.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setExpandedProgram(null)}
              className="w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold transition-all hover:scale-110"
              style={{ background: `${selectedColor.accent}22`, color: selectedColor.accent }}
            >
              ×
            </button>
          </div>

          {/* Categories */}
          <div className="px-4 pb-4 pt-3 space-y-4">
            {ELEMENT_CATEGORIES.map((cat) => (
              <div key={cat.id}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: cat.dotColor }}>
                  {cat.label}
                </p>
                <div className="flex flex-wrap gap-2">
                  {cat.elements.map((el) => {
                    const isActive = selectedAssigned.includes(el)
                    return (
                      <button
                        key={el}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => toggleElement(expandedProgram, el)}
                        style={isActive ? {
                          background: cat.activeBg,
                          color: cat.activeColor,
                          borderColor: cat.activeBorder,
                        } : undefined}
                        className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-all ${
                          isActive
                            ? 'font-semibold shadow-sm'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 disabled:cursor-default'
                        }`}
                      >
                        {isActive && <span className="mr-1">✓</span>}
                        {el}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            {customElements.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-2 text-slate-400">Custom</p>
                <div className="flex flex-wrap gap-2">
                  {customElements.map((el) => {
                    const isActive = selectedAssigned.includes(el)
                    return (
                      <button
                        key={el}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => toggleElement(expandedProgram, el)}
                        className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-all ${
                          isActive
                            ? 'bg-slate-700 text-white border-slate-700 font-semibold'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 disabled:cursor-default'
                        }`}
                      >
                        {isActive && <span className="mr-1">✓</span>}
                        {el}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Custom element management */}
      {canEdit && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setShowCustomMgmt((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            <span>Manage Custom Elements</span>
            <span className="text-slate-400 text-xs">{showCustomMgmt ? '▲' : '▼'}</span>
          </button>
          {showCustomMgmt && (
            <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCustomEl}
                  onChange={(e) => setNewCustomEl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCustomElement()}
                  placeholder="New element name"
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
                <button
                  type="button"
                  onClick={addCustomElement}
                  className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-medium hover:bg-slate-800"
                >
                  Add
                </button>
              </div>
              {customElements.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {customElements.map((el) => (
                    <span key={el} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-slate-100 px-2.5 py-1 rounded-full">
                      {el}
                      <button
                        type="button"
                        onClick={() => removeCustomElement(el)}
                        className="text-slate-400 hover:text-red-500 leading-none text-sm"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">No custom elements yet.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Save — only visible when a program is selected or a custom program has been added */}
      {canEdit && (expandedProgram !== null || customPrograms.length > 0) && (
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Design'}
          </button>
          {savedOk && <span className="text-sm text-emerald-600 font-semibold">Saved!</span>}
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SundayProgram({ embedded = false }) {
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
      {!embedded && <DepartmentTabBar slug="sunday-ministry" activeTab="sundayProgram" />}
      <div className="space-y-2 p-4 max-w-3xl">
        <SubTabBar active={subTab} onChange={setSubTab} />
        {subTab === 'default' && <DefaultProgramTab canEdit={canEdit} userProfile={userProfile} navigate={navigate} />}
        {subTab === 'design' && <DesignProgramTab canEdit={canEdit} userProfile={userProfile} />}
      </div>
    </div>
  )
}
