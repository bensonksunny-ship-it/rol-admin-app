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
import { sortByWorshipRole } from '../utils/worshipRoleOrder'

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_SEED = [
  'Pre Worship Talk', 'Worship', 'Leader Prayer',
  'Announcements', 'Sermon', 'Prayer & Benediction',
]

const SLUG_TO_DEPT = {
  media: 'Media', worship: 'Worship', 'd-light': 'D Light', administration: 'Administration',
}

const CARD_COLORS = [
  { accent: '#6366f1', light: '#eef2ff' },
  { accent: '#ec4899', light: '#fdf2f8' },
  { accent: '#f59e0b', light: '#fffbeb' },
  { accent: '#0ea5e9', light: '#f0f9ff' },
  { accent: '#8b5cf6', light: '#faf5ff' },
  { accent: '#14b8a6', light: '#f0fdfa' },
]
const CUSTOM_CARD_COLOR = { accent: '#10b981', light: '#f0fdf4' }


const ELEMENT_CATEGORIES = [
  {
    id: 'screen', label: 'Screen & Presentation',
    dotColor: '#6366f1', activeBg: '#eef2ff', activeColor: '#4338ca', activeBorder: '#c7d2fe',
    elements: [
      'Display Lyrics', 'Clear Screen', 'Display Scripture', 'Display Announcement',
      'Display Welcome Slide', 'Display Speaker Name', 'Display Lower Third',
      'Display Countdown', 'Display Offering Details', 'Display QR Code', 'Display Closing Slide',
    ],
  },
  {
    id: 'video', label: 'Video',
    dotColor: '#dc2626', activeBg: '#fee2e2', activeColor: '#b91c1c', activeBorder: '#fca5a5',
    elements: [
      'Play Video', 'Pause Video', 'Stop Video', 'Video Ready',
      'Switch Video Source', 'Play Testimony Video', 'Play Promotion Video', 'Play Announcement Video',
    ],
  },
  {
    id: 'livestream', label: 'Livestream',
    dotColor: '#e11d48', activeBg: '#ffe4e6', activeColor: '#be123c', activeBorder: '#fda4af',
    elements: [
      'Start Livestream', 'Stop Livestream', 'Stream Check', 'Stream Backup',
      'Go Live', 'End Broadcast', 'Livestream Alert',
    ],
  },
  {
    id: 'camera', label: 'Camera',
    dotColor: '#0369a1', activeBg: '#e0f2fe', activeColor: '#075985', activeBorder: '#7dd3fc',
    elements: [
      'Camera Switch', 'Speaker Focus', 'Worship Focus', 'Congregation Shot',
      'Wide Shot', 'Close-Up Shot', 'Camera Ready', 'Camera Reset',
    ],
  },
  {
    id: 'audio', label: 'Audio',
    dotColor: '#047857', activeBg: '#d1fae5', activeColor: '#065f46', activeBorder: '#6ee7b7',
    elements: [
      'Mute Microphone', 'Unmute Microphone', 'Speaker Mic Ready', 'Worship Mic Ready',
      'Instrument Check', 'Audio Cue', 'Sound Check', 'Audio Backup',
    ],
  },
  {
    id: 'lighting', label: 'Lighting',
    dotColor: '#b45309', activeBg: '#fef3c7', activeColor: '#92400e', activeBorder: '#fcd34d',
    elements: [
      'House Lights On', 'House Lights Off', 'Stage Lights On', 'Worship Lighting',
      'Sermon Lighting', 'Prayer Lighting', 'Spotlight Speaker', 'Lighting Reset',
    ],
  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getNextSundayISO() {
  const today = new Date()
  const diff = today.getDay() === 0 ? 0 : 7 - today.getDay()
  const d = new Date(today)
  d.setDate(today.getDate() + diff)
  return format(d, 'yyyy-MM-dd')
}

function formatDisplay(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return format(new Date(y, m - 1, d), 'EEEE, dd MMMM yyyy')
}

function getElChipColor(el, customElements) {
  if (customElements.includes(el)) return { bg: '#f1f5f9', color: '#475569' }
  for (const cat of ELEMENT_CATEGORIES) {
    if (cat.elements.includes(el)) return { bg: cat.activeBg, color: cat.activeColor }
  }
  return { bg: '#f1f5f9', color: '#475569' }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UpcomingSunday({ slug }) {
  const { userProfile, canAccessDepartment, canManageDepartment, isFounder, isSeniorPastor } = useAuth()
  const sundayDate = getNextSundayISO()
  const deptName = SLUG_TO_DEPT[slug] || slug

  // Any dept member can add their elements; directors/pastors also qualify
  const canEdit = isFounder || isSeniorPastor || canManageDepartment(deptName) || canAccessDepartment(slug)

  const [notification, setNotification] = useState(null)
  const [notifPrograms, setNotifPrograms] = useState([])
  const [worshipPlan, setWorshipPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)

  // Persisted dept data
  const [programElements, setProgramElements] = useState({})
  const [programDurations, setProgramDurations] = useState({})
  const [customPrograms, setCustomPrograms] = useState([])
  const [customElements, setCustomElements] = useState([])

  // UI state
  const [expandedProgram, setExpandedProgram] = useState(null)
  const [addingCustom, setAddingCustom] = useState(false)
  const [newCustomName, setNewCustomName] = useState('')
  const [showCustomElMgmt, setShowCustomElMgmt] = useState(false)
  const [newCustomEl, setNewCustomEl] = useState('')
  const [editingEl, setEditingEl] = useState(null)

  const [worshipLoading, setWorshipLoading] = useState(slug === 'worship')

  // ── Load ─────────────────────────────────────────────────────────────────────

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getProgramNotification(sundayDate),
      getSundayProgramDefault(),
      getDeptProgramInput(sundayDate, slug),
    ])
      .then(([notif, defaultDoc, deptInput]) => {
        setNotification(notif)
        const base = notif?.programs?.length
          ? notif.programs
          : (defaultDoc?.items?.length
              ? defaultDoc.items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((i) => i.programName)
              : [...DEFAULT_SEED])
        setNotifPrograms(base)
        setProgramElements(deptInput?.programElements || {})
        setProgramDurations(deptInput?.programDurations || {})
        setCustomPrograms(deptInput?.customPrograms || [])
        setCustomElements(deptInput?.customElements || [])
      })
      .catch(() => { setNotifPrograms([...DEFAULT_SEED]) })
      .finally(() => setLoading(false))
  }, [sundayDate, slug])

  useEffect(() => {
    if (slug !== 'worship') return
    setWorshipLoading(true)
    getWorshipScheduleByDate('Worship', sundayDate)
      .then(setWorshipPlan)
      .catch(() => setWorshipPlan(null))
      .finally(() => setWorshipLoading(false))
  }, [sundayDate, slug])

  const leadVocals = slug === 'worship'
    ? (worshipPlan?.assignments || [])
        .filter((a) => a.role?.startsWith('Lead Vocal') && (a.songName || a.memberName))
        .sort((a, b) => a.role.localeCompare(b.role))
    : []

  // ── Helpers ───────────────────────────────────────────────────────────────

  const isCustomProgram = (name) => customPrograms.some((p) => p.programName === name)

  const getDesignedElements = (name) => {
    if (isCustomProgram(name)) return customPrograms.find((p) => p.programName === name)?.elements || []
    return programElements[name] || []
  }

  const getDuration = (name) => {
    if (isCustomProgram(name)) return customPrograms.find((p) => p.programName === name)?.duration || 0
    return programDurations[name] || 0
  }

  const setDurationForProgram = (name, val) => {
    const mins = Math.max(0, Math.min(300, Number(val) || 0))
    if (isCustomProgram(name)) {
      setCustomPrograms((prev) => prev.map((p) =>
        p.programName === name ? { ...p, duration: mins } : p
      ))
    } else {
      setProgramDurations((prev) => ({ ...prev, [name]: mins }))
    }
  }

  const toggleEl = (name, el) => {
    if (!canEdit) return
    if (isCustomProgram(name)) {
      setCustomPrograms((prev) =>
        prev.map((p) => {
          if (p.programName !== name) return p
          const els = p.elements || []
          return { ...p, elements: els.includes(el) ? els.filter((e) => e !== el) : [...els, el] }
        })
      )
    } else {
      setProgramElements((prev) => {
        const current = prev[name] || []
        return { ...prev, [name]: current.includes(el) ? current.filter((e) => e !== el) : [...current, el] }
      })
    }
  }

  // ── Custom programme helpers ──────────────────────────────────────────────

  const addCustomProgram = () => {
    const name = newCustomName.trim()
    if (!name || customPrograms.some((p) => p.programName === name)) {
      setNewCustomName(''); setAddingCustom(false); return
    }
    setCustomPrograms((prev) => [...prev, { programName: name, elements: [], duration: 0 }])
    setNewCustomName('')
    setAddingCustom(false)
    setExpandedProgram(name)
  }

  const removeCustomProgram = (name) => {
    setCustomPrograms((prev) => prev.filter((p) => p.programName !== name))
    if (expandedProgram === name) setExpandedProgram(null)
  }

  // ── Custom element helpers ────────────────────────────────────────────────

  const addCustomElement = () => {
    const el = newCustomEl.trim()
    if (!el) return
    const allPredefined = ELEMENT_CATEGORIES.flatMap((c) => c.elements)
    if (allPredefined.includes(el) || customElements.includes(el)) { setNewCustomEl(''); return }
    setCustomElements((prev) => [...prev, el])
    setNewCustomEl('')
  }

  const saveEditCustomEl = () => {
    if (!editingEl) return
    const val = editingEl.value.trim()
    if (!val) { setEditingEl(null); return }
    const old = customElements[editingEl.idx]
    setCustomElements((prev) => prev.map((e, i) => (i === editingEl.idx ? val : e)))
    if (old !== val) {
      setProgramElements((prev) => {
        const next = { ...prev }
        Object.keys(next).forEach((prog) => { next[prog] = (next[prog] || []).map((e) => (e === old ? val : e)) })
        return next
      })
      setCustomPrograms((prev) =>
        prev.map((p) => ({ ...p, elements: p.elements.map((e) => (e === old ? val : e)) }))
      )
    }
    setEditingEl(null)
  }

  const removeCustomEl = (idx) => {
    const el = customElements[idx]
    setCustomElements((prev) => prev.filter((_, i) => i !== idx))
    setProgramElements((prev) => {
      const next = { ...prev }
      Object.keys(next).forEach((prog) => { next[prog] = (next[prog] || []).filter((e) => e !== el) })
      return next
    })
    setCustomPrograms((prev) =>
      prev.map((p) => ({ ...p, elements: p.elements.filter((e) => e !== el) }))
    )
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  const save = async () => {
    setSaving(true)
    try {
      await setDeptProgramInput(
        sundayDate, slug,
        { programElements, programDurations, customPrograms, customElements },
        userProfile?.email || 'unknown'
      )
      setSavedOk(true)
      setExpandedProgram(null)
      setTimeout(() => setSavedOk(false), 2500)
    } catch (e) {
      console.error(e)
      alert('Failed to save')
    }
    setSaving(false)
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const allPrograms = [
    ...notifPrograms.map((name, idx) => ({ name, idx, isCustom: false, color: CARD_COLORS[idx % CARD_COLORS.length] })),
    ...customPrograms.map((p) => ({ name: p.programName, idx: -1, isCustom: true, color: CUSTOM_CARD_COLOR })),
  ]

  const selectedColor = allPrograms.find((p) => p.name === expandedProgram)?.color || CARD_COLORS[0]
  const selectedElements = expandedProgram ? getDesignedElements(expandedProgram) : []
  const selectedDuration = expandedProgram ? getDuration(expandedProgram) : 0

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 max-w-2xl">

      {/* Header */}
      <div className="rounded-2xl overflow-hidden shadow-sm border border-indigo-100">
        <div
          style={{ background: 'linear-gradient(135deg, #4338ca 0%, #6366f1 60%, #7c3aed 100%)' }}
          className="px-5 py-4 text-white"
        >
          <p className="text-indigo-200 text-xs uppercase tracking-widest mb-0.5">{slug === 'worship' ? 'Upcoming Worship' : 'Upcoming Sunday'}</p>
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

      {/* ── Worship Schedule (worship dept only) ── */}
      {slug === 'worship' && (
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-amber-100">
          <div className="px-4 py-3 border-b border-amber-100" style={{ background: '#fffbeb' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-0.5">Worship Team – This Sunday</p>
          </div>
          {worshipLoading ? (
            <div className="px-4 py-5 text-sm text-slate-400 text-center">Loading schedule…</div>
          ) : (worshipPlan?.assignments || []).filter((a) => a.memberId).length === 0 ? (
            <div className="px-4 py-5 text-center">
              <p className="text-sm text-slate-500">No worship schedule assigned yet.</p>
              <p className="text-xs text-slate-400 mt-1">Use the Assign tab to set up the team for this Sunday.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {sortByWorshipRole(worshipPlan.assignments.filter((a) => a.memberId || a.songName)).map((a, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-lg text-center" style={{ minWidth: '6rem' }}>
                    {a.role}
                  </span>
                  {a.memberName && <span className="text-sm font-medium text-slate-800">{a.memberName}</span>}
                  {a.songName && <span className="text-sm italic text-slate-500">{a.songName}</span>}
                  {a.key && <span className="text-xs font-bold bg-violet-50 text-violet-700 border border-violet-100 px-1.5 py-0.5 rounded">{a.key}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center text-slate-400 text-sm">Loading…</div>
      ) : (
        <>
          {/* ── Programme grid ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {allPrograms.map(({ name, idx, isCustom, color }, gridIdx) => {
              const isSelected = expandedProgram === name
              const assigned = getDesignedElements(name)
              const dur = getDuration(name)

              return (
                <div
                  key={name}
                  className="relative rounded-2xl overflow-hidden"
                  style={{
                    background: '#fff',
                    boxShadow: isSelected
                      ? `0 0 0 2.5px ${color.accent}, 0 6px 20px ${color.accent}28`
                      : '0 1px 3px #0000000f, 0 1px 8px #0000000a',
                    transition: 'box-shadow 0.2s',
                  }}
                >
                  {/* Colour stripe */}
                  <div style={{ height: 4, background: `linear-gradient(90deg, ${color.accent}, ${color.accent}99)` }} />

                  {/* Remove button (custom only) */}
                  {isCustom && canEdit && (
                    <button
                      type="button"
                      onClick={() => removeCustomProgram(name)}
                      className="absolute top-2.5 right-2 z-10 w-5 h-5 rounded-full flex items-center justify-center text-sm hover:scale-110 transition-transform"
                      style={{ background: '#fee2e2', color: '#ef4444' }}
                    >
                      ×
                    </button>
                  )}

                  {/* Card body */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setExpandedProgram(isSelected ? null : name)}
                    onKeyDown={(e) => e.key === 'Enter' && setExpandedProgram(isSelected ? null : name)}
                    className="cursor-pointer select-none px-3 pt-3 pb-3"
                    style={{ background: isSelected ? color.light : 'transparent', transition: 'background 0.2s' }}
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <span style={{
                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                        background: color.accent, color: '#fff',
                        fontSize: 11, fontWeight: 800,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: `0 3px 10px ${color.accent}55`,
                      }}>
                        {isCustom ? '★' : gridIdx + 1}
                      </span>
                      <span style={{
                        fontSize: 12, fontWeight: 700, lineHeight: 1.35,
                        color: isSelected ? color.accent : '#1e293b',
                        paddingTop: 4, flex: 1,
                        paddingRight: isCustom ? 18 : 0,
                        transition: 'color 0.2s',
                      }}>
                        {name}
                      </span>
                    </div>

                    {/* Duration badge */}
                    {dur > 0 && (
                      <div className="mb-1.5">
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                          background: '#f0f9ff', color: '#0369a1',
                        }}>⏱ {dur} min</span>
                      </div>
                    )}

                    {assigned.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {assigned.slice(0, 3).map((el) => {
                          const c = getElChipColor(el, customElements)
                          return (
                            <span key={el} style={{
                              fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 20,
                              background: c.bg, color: c.color,
                            }}>{el}</span>
                          )
                        })}
                        {assigned.length > 3 && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 20,
                            background: color.light, color: color.accent,
                          }}>+{assigned.length - 3}</span>
                        )}
                      </div>
                    ) : (
                      <p style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8 }}>No elements yet</p>
                    )}

                    <div className="flex items-center justify-between">
                      {assigned.length > 0
                        ? <span style={{ fontSize: 10, fontWeight: 600, color: color.accent }}>{assigned.length} element{assigned.length !== 1 ? 's' : ''}</span>
                        : <span />}
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
                        padding: '2px 8px', borderRadius: 20,
                        background: isSelected ? color.accent : color.light,
                        color: isSelected ? '#fff' : color.accent,
                        transition: 'background 0.2s, color 0.2s',
                      }}>
                        {isSelected ? 'CLOSE ▲' : 'DESIGN ▼'}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Add Our Programme card */}
            {canEdit && (
              addingCustom ? (
                <div className="rounded-2xl p-3 flex flex-col gap-2"
                  style={{ border: '2px dashed #6ee7b7', background: '#f0fdf4', minHeight: 110 }}>
                  <p className="text-xs font-bold text-emerald-700 mb-0.5">Our Programme</p>
                  <input
                    autoFocus
                    type="text"
                    value={newCustomName}
                    onChange={(e) => setNewCustomName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addCustomProgram()
                      if (e.key === 'Escape') { setAddingCustom(false); setNewCustomName('') }
                    }}
                    placeholder="Programme name"
                    className="w-full px-2 py-1.5 rounded-lg border border-emerald-300 text-xs bg-white"
                  />
                  <div className="flex gap-1.5">
                    <button type="button" onClick={addCustomProgram}
                      className="flex-1 px-2 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700">
                      Add
                    </button>
                    <button type="button" onClick={() => { setAddingCustom(false); setNewCustomName('') }}
                      className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-slate-50">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingCustom(true)}
                  className="rounded-2xl flex flex-col items-center justify-center gap-2 group transition-all hover:bg-emerald-50/50"
                  style={{ border: '2px dashed #a7f3d0', minHeight: 110, background: 'transparent' }}
                >
                  <span
                    className="group-hover:scale-110 transition-transform"
                    style={{ width: 34, height: 34, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: '#6ee7b7' }}
                  >
                    +
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#6ee7b7' }}>Our Programme</span>
                </button>
              )
            )}
          </div>

          {/* ── Element palette ── */}
          {expandedProgram && (
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm"
              style={{ border: `1.5px solid ${selectedColor.accent}44` }}>

              {/* Palette header */}
              <div
                className="flex items-center justify-between px-4 py-3 border-b"
                style={{ background: selectedColor.light, borderColor: `${selectedColor.accent}22` }}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: selectedColor.accent, color: '#fff',
                    fontSize: 10, fontWeight: 800, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: `0 2px 6px ${selectedColor.accent}55`,
                  }}>
                    {isCustomProgram(expandedProgram) ? '★' : (allPrograms.find((p) => p.name === expandedProgram)?.idx ?? 0) + 1}
                  </span>
                  <span className="text-sm font-bold" style={{ color: selectedColor.accent }}>
                    {expandedProgram}
                  </span>
                  {selectedElements.length > 0 && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ background: selectedColor.accent, color: '#fff' }}>
                      {selectedElements.length}
                    </span>
                  )}
                  {isCustomProgram(expandedProgram) && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: '#d1fae5', color: '#065f46' }}>
                      Our Programme
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedProgram(null)}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold hover:scale-110 transition-transform"
                  style={{ background: `${selectedColor.accent}22`, color: selectedColor.accent }}
                >
                  ×
                </button>
              </div>

              <div className="px-4 pb-4 pt-3 space-y-4">

                {/* ── Duration ── */}
                <div className="flex items-center gap-3 pb-1 border-b border-slate-100">
                  <span className="text-xs font-semibold text-slate-600">Duration</span>
                  {canEdit ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={300}
                        value={selectedDuration || ''}
                        onChange={(e) => setDurationForProgram(expandedProgram, e.target.value)}
                        placeholder="0"
                        className="w-16 px-2 py-1 rounded-lg border border-slate-200 text-sm text-center tabular-nums"
                      />
                      <span className="text-xs text-slate-400">min</span>
                    </div>
                  ) : (
                    <span className="text-sm font-bold text-slate-700 tabular-nums">
                      {selectedDuration > 0 ? `${selectedDuration} min` : '—'}
                    </span>
                  )}
                </div>

                {/* Worship songs (worship dept + Worship programme only) */}
                {slug === 'worship' && expandedProgram === 'Worship' && leadVocals.length > 0 && (
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

                {/* Predefined categories */}
                {ELEMENT_CATEGORIES.map((cat) => (
                  <div key={cat.id}>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: cat.dotColor }}>
                      {cat.label}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {cat.elements.map((el) => {
                        const isActive = selectedElements.includes(el)
                        return (
                          <button
                            key={el}
                            type="button"
                            disabled={!canEdit}
                            onClick={() => toggleEl(expandedProgram, el)}
                            className="text-xs font-medium px-3 py-1.5 rounded-full border transition-all"
                            style={isActive ? {
                              background: cat.activeBg, color: cat.activeColor,
                              borderColor: cat.activeBorder, fontWeight: 600,
                            } : {
                              background: '#fff', color: '#475569',
                              borderColor: '#e2e8f0', cursor: canEdit ? 'pointer' : 'default',
                            }}
                          >
                            {isActive && <span className="mr-1">✓</span>}
                            {el}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}

                {/* Custom elements */}
                {customElements.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-2 text-slate-400">Custom</p>
                    <div className="flex flex-wrap gap-2">
                      {customElements.map((el) => {
                        const isActive = selectedElements.includes(el)
                        return (
                          <button
                            key={el}
                            type="button"
                            disabled={!canEdit}
                            onClick={() => toggleEl(expandedProgram, el)}
                            className="text-xs font-medium px-3 py-1.5 rounded-full border transition-all"
                            style={isActive ? {
                              background: '#1e293b', color: '#fff',
                              borderColor: '#1e293b', fontWeight: 600,
                            } : {
                              background: '#fff', color: '#475569',
                              borderColor: '#e2e8f0', cursor: canEdit ? 'pointer' : 'default',
                            }}
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

          {/* ── Manage Custom Elements ── */}
          {canEdit && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() => setShowCustomElMgmt((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                <span>Manage Custom Elements</span>
                <span className="text-slate-400 text-xs">{showCustomElMgmt ? '▲' : '▼'}</span>
              </button>

              {showCustomElMgmt && (
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
                    <button type="button" onClick={addCustomElement}
                      className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-medium hover:bg-slate-800">
                      Add
                    </button>
                  </div>

                  {customElements.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {customElements.map((el, idx) =>
                        editingEl?.idx === idx ? (
                          <span key={el} className="inline-flex items-center gap-1">
                            <input
                              autoFocus
                              type="text"
                              value={editingEl.value}
                              onChange={(e) => setEditingEl({ idx, value: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveEditCustomEl()
                                if (e.key === 'Escape') setEditingEl(null)
                              }}
                              className="px-2 py-1 rounded border border-indigo-400 text-xs w-32"
                            />
                            <button type="button" onClick={saveEditCustomEl} className="text-emerald-600 font-bold text-sm">✓</button>
                            <button type="button" onClick={() => setEditingEl(null)} className="text-red-400 font-bold text-sm">✕</button>
                          </span>
                        ) : (
                          <span key={el} className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 bg-slate-100 px-2.5 py-1 rounded-full">
                            {el}
                            <button type="button" onClick={() => setEditingEl({ idx, value: el })}
                              className="text-slate-400 hover:text-indigo-500 leading-none ml-0.5">✎</button>
                            <button type="button" onClick={() => removeCustomEl(idx)}
                              className="text-slate-400 hover:text-red-500 leading-none text-sm ml-0.5">×</button>
                          </span>
                        )
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">No custom elements yet.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Save ── */}
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
