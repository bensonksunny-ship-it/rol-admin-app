import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { getSundayPlan, setSundayPlanSection, getWorshipScheduleByDate, publishSundayPlan, unpublishSundayPlan, getSundayProgramDefault, getSundayPreServiceEntry } from '../services/firestore'
import { useAuth } from '../context/AuthContext'
import { SUNDAY_PLAN_SECTIONS } from '../constants/roles'
import { format, addWeeks, subWeeks } from 'date-fns'
import { formatDMY } from '../utils/date'

function nextSundayISO() {
  const today = new Date()
  const day = today.getDay()
  const daysUntilSunday = (7 - day) % 7
  const next = new Date(today)
  next.setDate(today.getDate() + (daysUntilSunday === 0 ? 7 : daysUntilSunday))
  return format(next, 'yyyy-MM-dd')
}

const WORSHIP_ROLES = [
  'Lead Vocal-1', 'Lead Vocal-2', 'Lead Vocal-3', 'Lead Vocal-4', 'Lead Vocal-5', 'Lead Vocal-6',
  'Parts-1', 'Parts-2',
  'Choir member-1', 'Choir member-2', 'Choir member-3', 'Choir member-4', 'Choir member-5', 'Choir member-6',
  'Keyboard', 'Lead Guitar', 'Bass Guitar', 'Acoustic guitar', 'Drums', 'Sound Engineer',
]

const SECTION_LABELS = {
  [SUNDAY_PLAN_SECTIONS.SUNDAY_MINISTRY]: 'Sunday Ministry Team',
  [SUNDAY_PLAN_SECTIONS.WORSHIP]: 'Worship',
  [SUNDAY_PLAN_SECTIONS.SUNDAY_LEADER]: 'Sunday Leader',
  [SUNDAY_PLAN_SECTIONS.MEDIA]: 'Media Team',
  [SUNDAY_PLAN_SECTIONS.ANNOUNCEMENTS]: 'Announcements',
  [SUNDAY_PLAN_SECTIONS.D_LITE]: 'D-Lite',
  [SUNDAY_PLAN_SECTIONS.RIVER_KIDS]: 'River Kids',
}

const SECTION_ORDER = [
  SUNDAY_PLAN_SECTIONS.SUNDAY_MINISTRY,
  SUNDAY_PLAN_SECTIONS.WORSHIP,
  SUNDAY_PLAN_SECTIONS.SUNDAY_LEADER,
  SUNDAY_PLAN_SECTIONS.MEDIA,
  SUNDAY_PLAN_SECTIONS.ANNOUNCEMENTS,
  SUNDAY_PLAN_SECTIONS.D_LITE,
  SUNDAY_PLAN_SECTIONS.RIVER_KIDS,
]

const SECTION_ACCENT = {
  [SUNDAY_PLAN_SECTIONS.SUNDAY_MINISTRY]: { border: 'border-l-violet-500', btn: 'bg-violet-500 hover:bg-violet-600' },
  [SUNDAY_PLAN_SECTIONS.SUNDAY_LEADER]: { border: 'border-l-sky-500', btn: 'bg-sky-500 hover:bg-sky-600' },
  [SUNDAY_PLAN_SECTIONS.MEDIA]: { border: 'border-l-emerald-500', btn: 'bg-emerald-500 hover:bg-emerald-600' },
  [SUNDAY_PLAN_SECTIONS.ANNOUNCEMENTS]: { border: 'border-l-amber-500', btn: 'bg-amber-500 hover:bg-amber-600' },
  [SUNDAY_PLAN_SECTIONS.D_LITE]: { border: 'border-l-rose-500', btn: 'bg-rose-500 hover:bg-rose-600' },
  [SUNDAY_PLAN_SECTIONS.RIVER_KIDS]: { border: 'border-l-teal-500', btn: 'bg-teal-500 hover:bg-teal-600' },
}

function WorshipPlanSummary({ selectedDate }) {
  const [worshipPlan, setWorshipPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expandedRole, setExpandedRole] = useState(null)

  useEffect(() => {
    setLoading(true)
    setExpandedRole(null)
    getWorshipScheduleByDate('Worship', selectedDate)
      .then(setWorshipPlan)
      .catch(() => setWorshipPlan({ date: selectedDate, assignments: [], songs: [] }))
      .finally(() => setLoading(false))
  }, [selectedDate])

  if (loading) return (
    <div className="bg-white rounded-xl border border-amber-200 p-3 shadow-sm">
      <p className="text-slate-500 text-sm">Loading Worship plan...</p>
    </div>
  )

  const assignments = worshipPlan?.assignments || []
  const leadVocalRoles = WORSHIP_ROLES.filter((r) => r.startsWith('Lead Vocal'))
  const otherRoles = WORSHIP_ROLES.filter((r) => !r.startsWith('Lead Vocal'))

  const leadVocalEntries = leadVocalRoles
    .map((role) => ({ role, a: assignments.find((x) => x.role === role) }))
    .filter(({ a }) => a?.memberName)

  const otherAssigned = otherRoles
    .map((role) => ({ role, a: assignments.find((x) => x.role === role) }))
    .filter(({ a }) => a?.memberName)

  const hasAnything = leadVocalEntries.length > 0 || otherAssigned.length > 0

  return (
    <div className="bg-white rounded-xl border border-amber-200 border-l-4 border-l-amber-500 p-3 shadow-sm">
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="font-semibold text-amber-900 text-sm">Worship</h3>
        <Link to={`/department/worship?date=${selectedDate}`} className="text-amber-600 hover:text-amber-700 text-xs font-semibold">
          Edit in Worship dept →
        </Link>
      </div>

      {!hasAnything ? (
        <p className="text-slate-500 text-xs">No worship assignments yet.</p>
      ) : (
        <div className="space-y-2">
          {/* Lead Vocals — expandable cards with song + structure */}
          {leadVocalEntries.map(({ role, a }) => {
            const structure = a?.structure
            const isExpanded = expandedRole === role
            const hasStructure = !!structure?.text
            return (
              <div key={role} className="rounded-lg border border-amber-200 bg-amber-50/40 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedRole(isExpanded ? null : role)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-amber-50/80 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">{role.replace('-', ' ')}</span>
                      {a.songName && <span className="text-slate-300 text-xs">|</span>}
                      {a.songName && <span className="text-xs text-slate-700 font-medium truncate">{a.songName}</span>}
                      {a.key && <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold flex-shrink-0">{a.key}</span>}
                    </div>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5 truncate">{a.memberName}</p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                    {hasStructure && (
                      <span className="text-[9px] font-semibold text-amber-600 uppercase tracking-wide leading-none">📄 structure</span>
                    )}
                    <span className={`text-amber-400 text-sm transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t border-amber-100 px-3 py-2.5 bg-white/80">
                    {hasStructure ? (
                      <>
                        <p className="text-xs font-semibold text-amber-700 mb-1.5 uppercase tracking-wide">
                          {structure.fileName || 'Song Structure'}
                        </p>
                        <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                          {structure.text}
                        </pre>
                      </>
                    ) : (
                      <p className="text-xs text-slate-400 italic">No structure uploaded for this song.</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* Rest of worship team — compact list */}
          {otherAssigned.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              <div className="divide-y divide-slate-100">
                {otherAssigned.map(({ role, a }) => (
                  <div key={role} className="flex items-center gap-3 px-3 py-1.5">
                    <span className="text-xs text-slate-500 w-28 shrink-0">{role}</span>
                    <span className="text-xs font-medium text-slate-800">{a.memberName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const DESIGN_TYPE_ICON = { Video: '🎬', Slide: '🖥️', Audio: '🎵', Light: '💡' }

function MediaDesignBlock({ plan }) {
  const items = plan?.mediaDesignProgram
  if (!items?.length) return null
  return (
    <div className="bg-white rounded-xl border border-slate-200 border-l-4 border-l-emerald-500 p-3 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-slate-800 text-sm">Media Program</h3>
        <span className="text-xs text-emerald-600 font-semibold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">✓ Pushed by Media</span>
      </div>
      <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
        {items.map((item, idx) => (
          <div key={item.id || idx} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <span className="text-xs text-slate-400 w-5 text-right shrink-0">{idx + 1}.</span>
            <span className="text-sm font-medium text-slate-800 flex-1 min-w-[80px]">{item.name}</span>
            {(item.types || []).map((t) => (
              <span key={t} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{DESIGN_TYPE_ICON[t] || ''} {t}</span>
            ))}
            {item.assignedPerson && (
              <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">{item.assignedPerson}</span>
            )}
            {!item.assignedPerson && item.designer && (
              <span className="text-xs text-slate-500">{item.designer}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function SectionForm({ sectionKey, label, data, canEdit, onSave, saving }) {
  const [form, setForm] = useState(data || { notes: '' })
  useEffect(() => setForm(data || { notes: '' }), [data])
  const style = SECTION_ACCENT[sectionKey] || { border: 'border-l-indigo-400', btn: 'bg-indigo-500 hover:bg-indigo-600' }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(sectionKey, form)
  }

  return (
    <div className={`bg-white rounded-xl border border-slate-200 border-l-4 ${style.border} p-3 shadow-sm`}>
      <h3 className="font-semibold text-slate-950 mb-1.5 text-sm">{label}</h3>
      {canEdit ? (
        <form onSubmit={handleSubmit} className="space-y-2">
          <textarea
            value={form.notes ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Planning notes, names, details..."
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm"
            rows={2}
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className={`px-3 py-1 rounded-lg text-white text-xs font-semibold disabled:opacity-50 ${style.btn}`}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      ) : (
        <div className="text-slate-600 whitespace-pre-wrap text-sm">
          {form.notes || '— No data yet —'}
        </div>
      )}
    </div>
  )
}

const DEFAULT_SEED = [
  { programName: 'Pre Worship Talk', order: 0 },
  { programName: 'Worship', order: 1 },
  { programName: 'Leader Prayer', order: 2 },
  { programName: 'Announcements', order: 3 },
  { programName: 'Sermon', order: 4 },
  { programName: 'Prayer & Benediction', order: 5 },
]

// Maps each default program item to the plan section key that owns it
const PROGRAM_SECTION_MAP = {
  'Pre Worship Talk': '__preservice__',
  'Worship': 'worship',
  'Leader Prayer': 'sundayLeader',
  'Announcements': 'announcements',
  'Sermon': 'sundayMinistry',
  'Prayer & Benediction': 'sundayLeader',
  'D-Lite': 'dLite',
  'River Kids': 'riverKids',
  'Media': 'media',
}

const SECTION_DEPT_LABEL = {
  worship: 'Worship',
  sundayLeader: 'Sunday Leader',
  announcements: 'Announcements',
  sundayMinistry: 'Sunday Ministry',
  dLite: 'D-Lite',
  riverKids: 'River Kids',
  media: 'Media',
}

function SundayProgramBlock({ plan, preServiceEntry, canEdit, selectedDate }) {
  const [items, setItems] = useState([])
  const [loadingItems, setLoadingItems] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLoadingItems(true)
    getSundayProgramDefault()
      .then((doc) => {
        const list = doc?.items?.length ? doc.items : [...DEFAULT_SEED]
        const sorted = [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        // Apply per-Sunday order override if saved
        const savedOrder = plan?.programOrder
        if (Array.isArray(savedOrder) && savedOrder.length) {
          const nameToItem = Object.fromEntries(sorted.map((i) => [i.programName, i]))
          const ordered = savedOrder.map((name) => nameToItem[name]).filter(Boolean)
          // Append any items not in savedOrder
          const savedSet = new Set(savedOrder)
          sorted.forEach((i) => { if (!savedSet.has(i.programName)) ordered.push(i) })
          setItems(ordered)
        } else {
          setItems(sorted)
        }
      })
      .catch(() => setItems([...DEFAULT_SEED]))
      .finally(() => setLoadingItems(false))
  }, [plan?.programOrder])

  const moveItem = async (idx, dir) => {
    const next = [...items]
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= next.length) return
    ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
    setItems(next)
    setSaving(true)
    try {
      await setSundayPlanSection(selectedDate, 'programOrder', next.map((i) => i.programName))
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  const getAssignment = (programName) => {
    const sectionKey = PROGRAM_SECTION_MAP[programName]
    if (!sectionKey) return null
    if (sectionKey === '__preservice__') {
      const speakers = preServiceEntry?.speakers
      if (speakers?.length) return { text: speakers.join(', '), dept: 'Pre-Service' }
      return null
    }
    const notes = plan?.[sectionKey]?.notes?.trim()
    if (!notes) return null
    return { text: notes, dept: SECTION_DEPT_LABEL[sectionKey] || sectionKey }
  }

  return (
    <div style={{ background: '#fff', border: '2px solid #e0e7ff', borderRadius: 14, padding: '14px 16px', marginBottom: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 16 }}>📋</span>
        <h2 style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', margin: 0, flex: 1 }}>Sunday Program</h2>
        {saving && <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 500 }}>Saving…</span>}
        <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 600, background: '#eef2ff', padding: '2px 10px', borderRadius: 20 }}>
          {items.length} items
        </span>
      </div>

      {loadingItems ? (
        <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Loading…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {items.map((item, idx) => {
            const assignment = getAssignment(item.programName)
            return (
              <div key={item.programName} style={{ background: assignment ? '#fafafe' : '#f8fafc', border: assignment ? '1px solid #c7d2fe' : '1px solid #e2e8f0', borderRadius: 10, padding: '9px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                  <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#6366f1', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{idx + 1}</span>
                  <span style={{ fontWeight: 600, color: '#1e293b', fontSize: 13, flex: 1, minWidth: 80 }}>{item.programName}</span>
                  {assignment && (
                    <span style={{ fontSize: 12, background: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe', padding: '2px 10px', borderRadius: 20, fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {assignment.text}
                      <span style={{ fontWeight: 400, opacity: 0.65 }}> · {assignment.dept}</span>
                    </span>
                  )}
                  {canEdit && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginLeft: 'auto', flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => moveItem(idx, -1)}
                        disabled={idx === 0 || saving}
                        style={{ width: 22, height: 18, border: '1px solid #e2e8f0', borderRadius: 4, background: idx === 0 ? '#f8fafc' : '#fff', color: idx === 0 ? '#cbd5e1' : '#6366f1', fontSize: 10, cursor: idx === 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                      >▲</button>
                      <button
                        type="button"
                        onClick={() => moveItem(idx, 1)}
                        disabled={idx === items.length - 1 || saving}
                        style={{ width: 22, height: 18, border: '1px solid #e2e8f0', borderRadius: 4, background: idx === items.length - 1 ? '#f8fafc' : '#fff', color: idx === items.length - 1 ? '#cbd5e1' : '#6366f1', fontSize: 10, cursor: idx === items.length - 1 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                      >▼</button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SundayProgramView() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    getSundayProgramDefault()
      .then((doc) => {
        const list = doc?.items?.length ? doc.items : [...DEFAULT_SEED]
        setItems([...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))
      })
      .catch(() => setItems([...DEFAULT_SEED]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-sm text-slate-400">Loading…</p>
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <ul className="divide-y divide-slate-100">
        {items.map((row, idx) => (
          <li key={idx} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-5 text-xs text-slate-500 text-right">{idx + 1}.</span>
            <span className="text-sm font-medium text-slate-800">{row.programName}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function SundayPlanning() {
  const [searchParams, setSearchParams] = useSearchParams()
  const dateFromUrl = searchParams.get('date')
  const { hasPermission, userProfile } = useAuth()
  const [selectedDate, setSelectedDate] = useState(() => dateFromUrl || nextSundayISO())
  const [plan, setPlan] = useState(null)
  const [preServiceEntry, setPreServiceEntry] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [activeTab, setActiveTab] = useState('combined')
  const canView = hasPermission('attendance')
  const canEditFull = hasPermission('editSundayPlanFull')
  const isPublished = plan?.status === 'published'

  useEffect(() => {
    if (dateFromUrl) setSelectedDate(dateFromUrl)
  }, [dateFromUrl])

  useEffect(() => {
    setLoading(true)
    getSundayPlan(selectedDate).then((p) => {
      setPlan(p || {})
      setLoading(false)
    })
    getSundayPreServiceEntry(selectedDate)
      .then(setPreServiceEntry)
      .catch(() => setPreServiceEntry(null))
  }, [selectedDate])

  const handleDateChange = (nextDate) => {
    setSelectedDate(nextDate)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('date', nextDate)
      return next
    })
  }

  const handleSaveSection = async (sectionKey, sectionData) => {
    setSaving(true)
    try {
      await setSundayPlanSection(selectedDate, sectionKey, sectionData)
      setPlan((prev) => ({ ...prev, [sectionKey]: sectionData }))
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = async () => {
    if (!window.confirm('Publish this Sunday Plan? It will become visible as a Digital Bulletin to all users.')) return
    setPublishing(true)
    try {
      await publishSundayPlan(selectedDate, userProfile?.displayName || userProfile?.email || 'unknown')
      setPlan((prev) => ({ ...prev, status: 'published' }))
    } finally {
      setPublishing(false)
    }
  }

  const handleUnpublish = async () => {
    setPublishing(true)
    try {
      await unpublishSundayPlan(selectedDate, userProfile?.displayName || userProfile?.email || 'unknown')
      setPlan((prev) => ({ ...prev, status: 'draft' }))
    } finally {
      setPublishing(false)
    }
  }

  if (!canView) {
    return (
      <div className="p-8 text-slate-600">
        You don't have access to Sunday Planning. Contact an administrator.
      </div>
    )
  }

  return (
    <div className="space-y-3 font-sans">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-slate-950">Sunday Plan</h1>
            {isPublished ? (
              <span className="px-2.5 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                ✓ Published — Digital Bulletin
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
                Draft
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium text-slate-600">Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-slate-300 text-sm"
          />
          <button
            type="button"
            onClick={() => handleDateChange(format(subWeeks(new Date(selectedDate), 1), 'yyyy-MM-dd'))}
            className="px-2 py-1.5 rounded-lg border border-slate-300 text-sm font-medium hover:bg-indigo-50 hover:border-indigo-300"
          >
            ← Prev
          </button>
          <button
            type="button"
            onClick={() => handleDateChange(format(addWeeks(new Date(selectedDate), 1), 'yyyy-MM-dd'))}
            className="px-2 py-1.5 rounded-lg border border-slate-300 text-sm font-medium hover:bg-indigo-50 hover:border-indigo-300"
          >
            Next →
          </button>
          {canEditFull && (
            isPublished ? (
              <button
                type="button"
                onClick={handleUnpublish}
                disabled={publishing}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {publishing ? '…' : 'Unpublish'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing || loading}
                className="px-4 py-1.5 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
              >
                {publishing ? 'Publishing…' : '✓ Confirm & Publish'}
              </button>
            )
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('combined')}
          className={`px-3 py-1.5 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === 'combined' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Sunday plan
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('sundayProgram')}
          className={`px-3 py-1.5 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === 'sundayProgram' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Sunday program
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-500">Loading...</div>
      ) : isPublished ? (
        /* ── Digital Bulletin (read-only for all users) ───────────────── */
        <DigitalBulletin plan={plan} selectedDate={selectedDate} />
      ) : activeTab === 'sundayProgram' ? (
        <SundayProgramView />
      ) : (
        <div className="space-y-2">
          <SundayProgramBlock plan={plan} preServiceEntry={preServiceEntry} canEdit={canEdit} selectedDate={selectedDate} />
          <MediaDesignBlock plan={plan} />
          <WorshipPlanSummary selectedDate={selectedDate} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {SECTION_ORDER.filter((key) => key !== SUNDAY_PLAN_SECTIONS.WORSHIP).map((key) => (
              <SectionForm
                key={key}
                sectionKey={key}
                label={SECTION_LABELS[key]}
                data={plan?.[key]}
                canEdit={canEditFull}
                onSave={handleSaveSection}
                saving={saving}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Digital Bulletin — polished read-only view shown once published ────────
function DigitalBulletin({ plan, selectedDate }) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-3xl p-6 text-white shadow-lg">
        <p className="text-indigo-200 text-xs uppercase tracking-widest mb-1">River Of Life Church</p>
        <h2 className="text-xl sm:text-2xl font-bold">Sunday Service</h2>
        <p className="text-indigo-200 text-sm mt-1">{formatDMY(selectedDate)}</p>
        <span className="inline-block mt-3 px-3 py-1 rounded-full bg-white/20 text-white text-xs font-semibold">
          ✓ Official Sunday Plan
        </span>
      </div>

      {/* Worship — pulls from the Worship dept schedule */}
      <WorshipPlanSummary selectedDate={selectedDate} />

      {/* All other sections */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {SECTION_ORDER.filter((k) => k !== SUNDAY_PLAN_SECTIONS.WORSHIP).map((key) => {
        const data = plan?.[key]
        const notes = data?.notes || ''
        const style = SECTION_ACCENT[key] || { border: 'border-l-indigo-400' }
        return (
          <div key={key} className={`bg-white rounded-xl border border-slate-200 border-l-4 ${style.border} p-3 shadow-sm`}>
            <h3 className="font-semibold text-slate-900 mb-1.5 text-sm">{SECTION_LABELS[key]}</h3>
            {notes ? (
              <p className="text-slate-700 whitespace-pre-wrap text-sm leading-relaxed">{notes}</p>
            ) : (
              <p className="text-slate-400 italic text-sm">Nothing entered for this section.</p>
            )}
          </div>
        )
      })}
      </div>

      {plan?.publishedBy && (
        <p className="text-center text-xs text-slate-500">
          Published by {plan.publishedBy}
          {plan.publishedAt?.toDate ? ` on ${formatDMY(format(plan.publishedAt.toDate(), 'yyyy-MM-dd'))}` : ''}
        </p>
      )}
    </div>
  )
}
