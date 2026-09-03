import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getSundayProgramDefault,
  setSundayProgramDefault,
  pushProgramToSundayReport,
  getSundayProgramDesign,
  setSundayProgramDesign,
  sendProgramNotification,
  getProgramNotification,
  getDeptProgramInput,
  setDeptProgramInput,
} from '../services/firestore'

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

// ─── Department meta ─────────────────────────────────────────────────────────

const DEPT_SLUGS = ['media', 'worship', 'd-light', 'administration']
const DEPT_META = {
  'media':          { name: 'Media',         accent: '#0ea5e9', light: '#e0f2fe' },
  'worship':        { name: 'Worship',        accent: '#f59e0b', light: '#fef3c7' },
  'd-light':        { name: 'D Light',        accent: '#10b981', light: '#d1fae5' },
  'administration': { name: 'Administration', accent: '#8b5cf6', light: '#ede9fe' },
}

// ─── Timing helpers ──────────────────────────────────────────────────────────

function addMinutes(timeStr, minutes) {
  if (!timeStr || !minutes) return timeStr || ''
  const [h, m] = timeStr.split(':').map(Number)
  const total = h * 60 + m + minutes
  const nh = Math.floor(total / 60) % 24
  const nm = total % 60
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`
}

function fmt12(timeStr) {
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function timeToMins(timeStr) {
  if (!timeStr) return 0
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

function minsToTime(totalMins) {
  const safe = Math.max(0, Math.min(totalMins, 23 * 60 + 59))
  const h = Math.floor(safe / 60)
  const m = safe % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ─── Default Program tab ─────────────────────────────────────────────────────

function DefaultProgramTab({ canEdit, userProfile, navigate }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [serviceStartTime, setServiceStartTime] = useState('')
  const [pushDate, setPushDate] = useState(nextSunday)
  const [pushing, setPushing] = useState(false)
  const [sendingNotif, setSendingNotif] = useState(false)
  const [notifSuccess, setNotifSuccess] = useState(false)
  const [form, setForm] = useState({ programName: '', order: 1 })
  const [editingId, setEditingId] = useState(null)
  const [designedPrograms, setDesignedPrograms] = useState([])
  const [deptInputs, setDeptInputs] = useState({})
  const [notification, setNotification] = useState(null)
  const [parallelPrograms, setParallelPrograms] = useState({})
  const [expandedBlock, setExpandedBlock] = useState(null)
  const [removedItems, setRemovedItems] = useState([])

  // Reload dept inputs + notification whenever the push date changes
  useEffect(() => {
    if (!pushDate) return
    Promise.all([
      getProgramNotification(pushDate).catch(() => null),
      ...DEPT_SLUGS.map((slug) =>
        getDeptProgramInput(pushDate, slug)
          .then((data) => ({ slug, data }))
          .catch(() => ({ slug, data: { programElements: {}, customPrograms: [], customElements: [] } }))
      ),
    ]).then(([notif, ...results]) => {
      setNotification(notif)
      const map = {}
      results.forEach(({ slug, data }) => { map[slug] = data })
      setDeptInputs(map)
    })
  }, [pushDate])

  useEffect(() => {
    setLoading(true)
    Promise.all([getSundayProgramDefault(), getSundayProgramDesign()])
      .then(([defaultDoc, designDoc]) => {
        const list = defaultDoc.items?.length ? defaultDoc.items : [...DEFAULT_SEED]
        const svcStart = defaultDoc.serviceStartTime || ''
        // Populate startTime: use saved value, or cascade-calculate from service start
        let cascadeMins = svcStart ? timeToMins(svcStart) : 0
        setItems(list.map((x, i) => {
          const dur = typeof x.duration === 'number' ? x.duration : 0
          const st = x.startTime || (svcStart ? minsToTime(cascadeMins) : '')
          cascadeMins += dur
          return {
            ...x,
            duration: dur,
            startTime: st,
            localId: `lp-${i}-${String(x.programName || '').slice(0, 20)}`,
          }
        }))
        setServiceStartTime(svcStart)
        setParallelPrograms(defaultDoc.parallelPrograms || {})
        const seed = DEFAULT_SEED.map((s) => s.programName)
        const custom = designDoc?.customPrograms || []
        const all = [...seed]
        custom.forEach((p) => { if (!all.includes(p)) all.push(p) })
        // Any program from Design Program (seed or newly added) is selectable here,
        // whether or not it has design elements assigned yet.
        setDesignedPrograms(all)
      })
      .catch(() => {
        setItems(DEFAULT_SEED.map((x, i) => ({ ...x, duration: 0, localId: `seed-${i}` })))
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
    const pos = Math.max(1, Math.min(sorted.length + 1, Number(form.order) || sorted.length + 1))
    const newItem = { programName: name, order: 0, duration: 0, startTime: '', localId: `new-${Date.now()}` }
    const next = [...sorted]
    next.splice(pos - 1, 0, newItem)
    setItems(next.map((x, i) => ({ ...x, order: i })))
    setForm({ programName: '', order: next.length + 1 })
  }

  const setDuration = (localId, val) => {
    const mins = Math.max(0, Math.min(300, Number(val) || 0))
    setItems((prev) => prev.map((x) => (x.localId === localId ? { ...x, duration: mins } : x)))
  }

  const setProgNumber = (localId, val) => {
    setItems((prev) => prev.map((x) => (x.localId === localId ? { ...x, programNumber: val } : x)))
  }

  const saveDefault = async () => {
    setSaving(true); setSavedOk(false)
    try {
      await setSundayProgramDefault(
        sorted.map((x, i) => ({ programName: x.programName, order: i, duration: x.duration || 0, startTime: x.startTime || '', programNumber: x.programNumber || '' })),
        userProfile?.email || 'unknown',
        serviceStartTime,
        parallelPrograms
      )
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 2500)
    } catch (e) { console.error(e); alert('Failed to save') }
    setSaving(false)
  }

  const totalMinutes = sorted.reduce((sum, r) => sum + (r.duration || 0), 0)

  // When service start time changes, shift all startTimes by the delta
  const handleServiceStartChange = (newVal) => {
    if (serviceStartTime && newVal) {
      const delta = timeToMins(newVal) - timeToMins(serviceStartTime)
      if (delta !== 0) {
        setItems((prev) => prev.map((x) => ({
          ...x,
          startTime: x.startTime ? minsToTime(timeToMins(x.startTime) + delta) : '',
        })))
      }
    }
    setServiceStartTime(newVal)
  }

  const removeDeptCustomProgram = async (slug, programName) => {
    const current = deptInputs[slug] || {}
    const updated = {
      ...current,
      customPrograms: (current.customPrograms || []).filter((p) => p.programName !== programName),
    }
    try {
      await setDeptProgramInput(pushDate, slug, updated, userProfile?.email || 'unknown')
      setDeptInputs((prev) => ({ ...prev, [slug]: updated }))
      setParallelPrograms((prev) => { const n = { ...prev }; delete n[programName]; return n })
    } catch (e) {
      console.error(e)
      alert('Failed to remove')
    }
  }

  const setDeptProgField = async (slug, programName, fields) => {
    const current = deptInputs[slug] || {}
    const updated = {
      ...current,
      customPrograms: (current.customPrograms || []).map(p =>
        p.programName === programName ? { ...p, ...fields } : p
      ),
    }
    try {
      await setDeptProgramInput(pushDate, slug, updated, userProfile?.email || 'unknown')
      setDeptInputs(prev => ({ ...prev, [slug]: updated }))
    } catch (e) { console.error(e) }
  }

  if (loading) return <p className="text-slate-500">Loading…</p>

  // True when departments have been notified for this date
  const notifSent = notification !== null

  // Dept custom programmes across all depts
  const deptCustom = DEPT_SLUGS.flatMap((slug) =>
    (deptInputs[slug]?.customPrograms || []).map((p) => ({
      programName: p.programName,
      elements: p.elements || [],
      duration: p.duration || 0,
      category: p.category || '',
      startTime: p.startTime || '',
      meta: DEPT_META[slug],
      slug,
    }))
  )

  const programColors = sorted.map((_, idx) => CARD_COLORS[idx % CARD_COLORS.length])

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-5">
      <h2 className="font-semibold text-slate-800">Programme</h2>

      {/* ── Add / edit form ── */}
      {canEdit && (() => {
        const available = editingId
          ? designedPrograms
          : designedPrograms.filter((p) => !sorted.some((x) => x.programName === p) && !removedItems.some((r) => r.programName === p))
        const hasAnything = available.length > 0 || (!editingId && removedItems.length > 0)
        if (!editingId && !hasAnything) return null
        return (
        <div className="space-y-3 pb-1">
          <p className="text-xs font-medium text-slate-500">
            {editingId ? 'Change programme' : 'Select programme to add'}
          </p>
          {(() => {
            if (!hasAnything) return null
            return (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {!editingId && removedItems.map((item) => (
                  <button key={item.localId} type="button"
                    onClick={() => {
                      setItems(prev => [...prev, { ...item, order: prev.length }])
                      setRemovedItems(prev => prev.filter(r => r.localId !== item.localId))
                      setForm(f => ({ ...f, programName: '' }))
                    }}
                    className="text-left px-3 py-2.5 rounded-xl text-xs font-semibold transition-all"
                    style={{ borderColor: '#10b981', background: '#ecfdf5', color: '#065f46', border: '1.5px dashed #10b981' }}>
                    <span style={{ marginRight: 4, fontWeight: 800 }}>↩</span>{item.programName}
                  </button>
                ))}
                {available.map((p) => {
                  const isSel = form.programName === p
                  return (
                    <button key={p} type="button" onClick={() => setForm((f) => ({ ...f, programName: p }))}
                      className="text-left px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all"
                      style={isSel ? { borderColor: '#6366f1', background: '#eef2ff', color: '#4338ca', boxShadow: '0 0 0 1.5px #6366f1' }
                        : { borderColor: '#e2e8f0', background: '#f8fafc', color: '#374151' }}>
                      {isSel && <span className="mr-1.5 text-indigo-500">✓</span>}{p}
                    </button>
                  )
                })}
              </div>
            )
          })()}
          <div className="flex flex-wrap gap-2 items-center pt-1">
            <div className="w-24">
              <label className="block text-xs text-slate-500 mb-1">Position</label>
              <input type="number" min={1} value={form.order}
                onChange={(e) => setForm((f) => ({ ...f, order: Number(e.target.value) || 1 }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
            </div>
            <button type="button" onClick={addRow} disabled={!form.programName}
              className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-40 mt-4">
              {editingId ? 'Apply edit' : 'Add Programme'}
            </button>
            {editingId && (
              <button type="button"
                onClick={() => { setEditingId(null); setForm({ programName: '', order: sorted.length + 1 }) }}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm mt-4">
                Cancel
              </button>
            )}
          </div>
        </div>
        )
      })()}

      {/* ── Service start time ── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
        background: 'linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)',
        border: '1px solid #e0e7ff', borderRadius: 14,
        padding: '10px 16px',
      }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>🕐</span>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', letterSpacing: 0.2 }}>Service starts</label>
        {canEdit ? (
          <input type="time" value={serviceStartTime}
            onChange={(e) => handleServiceStartChange(e.target.value)}
            style={{
              padding: '4px 10px', borderRadius: 10,
              border: '1.5px solid #a5b4fc', fontSize: 14, fontWeight: 800,
              color: '#3730a3', background: '#fff',
              fontVariantNumeric: 'tabular-nums',
              boxShadow: '0 1px 4px #6366f111',
              outline: 'none',
            }} />
        ) : (
          <span style={{ fontSize: 15, fontWeight: 900, color: '#3730a3', fontVariantNumeric: 'tabular-nums' }}>
            {serviceStartTime ? fmt12(serviceStartTime) : '—'}
          </span>
        )}
        {totalMinutes > 0 && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, color: '#6366f1',
              background: '#e0e7ff', borderRadius: 20, padding: '3px 10px',
            }}>{totalMinutes} min</span>
            {serviceStartTime && totalMinutes > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>
                ends <span style={{ color: '#3730a3' }}>{fmt12(minsToTime(timeToMins(serviceStartTime) + totalMinutes))}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Visual timeline — fixed flowing table, height by duration ── */}
      {sorted.length > 0 && (() => {
        const PX_PER_MIN = 6
        const MIN_BLOCK_PX = 48
        const svcMins = serviceStartTime ? timeToMins(serviceStartTime) : 0

        // Pre-compute main program time windows for overlap detection
        let tempMins = svcMins
        const mainWindows = sorted.map(row => {
          const s = tempMins; tempMins += (row.duration || 0)
          return { localId: row.localId, startMins: s, endMins: tempMins }
        })

        // Mid-event dept programs with a start time — auto-detected overlap
        const midEventTimed = deptCustom
          .filter(p => p.category === 'mid-event' && p.startTime)
          .map(p => ({ ...p, startMins: timeToMins(p.startTime), endMins: timeToMins(p.startTime) + (p.duration || 0) }))

        // Pre/post event programs shown outside main rows
        const preEventProgs  = deptCustom.filter(p => p.category === 'pre-event')
        const postEventProgs = deptCustom.filter(p => p.category === 'post-event')

        let cascadeMins = svcMins

        const DeptEventCard = ({ p }) => {
          const eMins = p.startTime && p.duration ? timeToMins(p.startTime) + p.duration : null
          return (
            <div style={{ background: '#fff', border: `1.5px solid ${p.meta.accent}`, borderRadius: 8, padding: '5px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#1e293b' }}>{p.programName}</span>
                <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 20, background: p.meta.light, color: p.meta.accent }}>{p.meta.name}</span>
              </div>
              {p.startTime && (
                <span style={{ fontSize: 9, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
                  {fmt12(p.startTime)}{eMins != null ? ` → ${fmt12(minsToTime(eMins))}` : ''}{p.duration ? ` · ${p.duration}m` : ''}
                </span>
              )}
            </div>
          )
        }

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

            {/* Pre-event dept programs */}
            {preEventProgs.length > 0 && (
              <div style={{ marginBottom: 10, background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 10, padding: '8px 12px' }}>
                <p style={{ fontSize: 9, fontWeight: 800, color: '#92400e', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 0.8 }}>Pre-event</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {preEventProgs.map(p => <DeptEventCard key={p.programName} p={p} />)}
                </div>
              </div>
            )}

            {/* Main program rows */}
            {sorted.map((row, idx) => {
              const win = mainWindows[idx]
              const color = programColors[idx]
              const dur = row.duration || 0
              const blockH = Math.max(dur * PX_PER_MIN, MIN_BLOCK_PX)
              const startLabel = serviceStartTime ? fmt12(minsToTime(cascadeMins)) : ''
              const endLabel = serviceStartTime && dur ? fmt12(minsToTime(cascadeMins + dur)) : ''
              cascadeMins += dur
              const isExpanded = expandedBlock === row.localId
              const isLast = idx === sorted.length - 1
              const deptRows = DEPT_SLUGS.map((slug) => ({
                slug, meta: DEPT_META[slug],
                elements: deptInputs[slug]?.programElements?.[row.programName] || [],
              })).filter((d) => d.elements.length > 0 || notifSent)

              // Auto-detect mid-event programs that overlap this row's time window
              const overlappingMidEvent = serviceStartTime
                ? midEventTimed.filter(p => p.startMins < win.endMins && p.endMins > win.startMins)
                : []

              return (
                <div key={row.localId} style={{ display: 'flex', alignItems: 'flex-start' }}>
                  {/* Time label */}
                  <div style={{ width: 72, flexShrink: 0, paddingTop: 11, paddingRight: 8, textAlign: 'right' }}>
                    {startLabel && (
                      <span style={{
                        fontSize: 10, fontWeight: 800, color: '#475569',
                        fontVariantNumeric: 'tabular-nums',
                        background: '#f1f5f9', borderRadius: 5, padding: '1px 5px',
                        border: '1px solid #e2e8f0', display: 'inline-block', lineHeight: 1.6,
                      }}>{startLabel}</span>
                    )}
                  </div>

                  {/* Dot + spine segment */}
                  <div style={{ width: 16, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: color.accent, flexShrink: 0, marginTop: 10, boxShadow: `0 0 0 3px ${color.accent}22` }} />
                    {!isLast && <div style={{ flex: 1, width: 2, background: '#e2e8f0', minHeight: 12, marginTop: 3 }} />}
                  </div>

                  {/* Card + overlapping backend blocks */}
                  <div style={{ flex: 1, minWidth: 0, paddingLeft: 8, paddingBottom: isLast ? 0 : 4, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                    {/* Main card */}
                    <div style={{
                      flex: 1, minWidth: 0, minHeight: blockH,
                      background: '#fff', borderRadius: 10,
                      borderLeft: `4px solid ${color.accent}`,
                      boxShadow: isExpanded ? `0 4px 16px ${color.accent}22, 0 0 0 1.5px ${color.accent}55` : '0 1px 3px #0000000a, 0 0 0 1px #e9ecef',
                    }}>
                      {/* Collapsed header */}
                      <div onClick={() => setExpandedBlock(isExpanded ? null : row.localId)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', cursor: 'pointer', userSelect: 'none', minHeight: MIN_BLOCK_PX }}>
                        <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: color.accent, flexShrink: 0, opacity: 0.4 }} />
                        {row.programNumber && (
                          <span style={{ fontSize: 9, fontWeight: 800, color: color.accent, background: color.light, borderRadius: 5, padding: '1px 6px', flexShrink: 0 }}>#{row.programNumber}</span>
                        )}
                        <p style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 12, fontWeight: 700, color: '#1e293b', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {row.programName}
                        </p>
                        {dur > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: color.accent, background: color.light, borderRadius: 5, padding: '1px 5px', flexShrink: 0 }}>{dur}m</span>}
                        {deptRows.some(d => d.elements.length > 0) && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />}
                        <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0, transition: 'transform 0.15s', display: 'inline-block', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>▼</span>
                      </div>

                      {/* Expanded panel */}
                      {isExpanded && (
                        <div style={{ borderTop: `1px solid ${color.accent}18`, padding: '10px 12px 12px' }}>
                          {canEdit && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Program #</span>
                                <input type="text" value={row.programNumber || ''} onChange={(e) => setProgNumber(row.localId, e.target.value)}
                                  placeholder="e.g. 1" onClick={(e) => e.stopPropagation()}
                                  style={{ width: 52, height: 28, padding: '0 6px', borderRadius: 7, textAlign: 'center', border: `1.5px solid ${color.accent}`, fontSize: 12, fontWeight: 700, background: color.light, color: color.accent, outline: 'none' }} />
                                <button type="button" onClick={(e) => {
                                  e.stopPropagation()
                                  const withNum = [...sorted].filter(x => x.programNumber && !isNaN(Number(x.programNumber))).sort((a, b) => Number(a.programNumber) - Number(b.programNumber))
                                  const withoutNum = sorted.filter(x => !x.programNumber || isNaN(Number(x.programNumber)))
                                  setItems([...withNum, ...withoutNum].map((x, i) => ({ ...x, order: i })))
                                  setExpandedBlock(null)
                                }} style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: color.accent, border: 'none', padding: '4px 10px', borderRadius: 7, cursor: 'pointer', flexShrink: 0 }}>
                                  Apply Order
                                </button>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Duration</span>
                                <input type="number" min={0} max={300} value={dur || ''} onChange={(e) => setDuration(row.localId, e.target.value)}
                                  placeholder="0" onClick={(e) => e.stopPropagation()}
                                  style={{ width: 52, height: 28, padding: '0 6px', borderRadius: 7, textAlign: 'center', border: `1.5px solid ${color.accent}`, fontSize: 12, fontWeight: 700, background: color.light, color: color.accent, outline: 'none' }} />
                                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>min</span>
                              </div>
                            </div>
                          )}
                          {startLabel && <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 600, color: color.accent, fontVariantNumeric: 'tabular-nums' }}>{startLabel}{endLabel ? ` → ${endLabel}` : ''}</p>}
                          {deptRows.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
                              {deptRows.map(({ slug, meta, elements }) => {
                                const hasData = elements.length > 0
                                if (!hasData && !notifSent) return null
                                return (
                                  <div key={slug} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
                                    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: hasData ? meta.light : '#f1f5f9', color: hasData ? meta.accent : '#94a3b8', flexShrink: 0 }}>{meta.name}</span>
                                    {hasData ? elements.map((el) => <span key={el} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 20, background: meta.light, color: meta.accent }}>{el}</span>)
                                      : <span style={{ fontSize: 9, color: '#94a3b8', fontStyle: 'italic' }}>awaiting</span>}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                          {canEdit && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                              <button type="button" onClick={(e) => { e.stopPropagation(); setRemovedItems(prev => [...prev, row]); setItems(sorted.filter((x) => x.localId !== row.localId).map((x, i) => ({ ...x, order: i }))); setExpandedBlock(null) }}
                                style={{ fontSize: 10, fontWeight: 600, color: '#ef4444', background: '#fef2f2', border: 'none', padding: '3px 9px', borderRadius: 7, cursor: 'pointer' }}>Remove</button>
                              {idx > 0 && <button type="button" onClick={(e) => { e.stopPropagation(); const n=[...sorted];[n[idx-1],n[idx]]=[n[idx],n[idx-1]];setItems(n.map((x,i)=>({...x,order:i}))) }} style={{ fontSize: 12, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: '0 3px' }}>↑</button>}
                              {idx < sorted.length - 1 && <button type="button" onClick={(e) => { e.stopPropagation(); const n=[...sorted];[n[idx],n[idx+1]]=[n[idx+1],n[idx]];setItems(n.map((x,i)=>({...x,order:i}))) }} style={{ fontSize: 12, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: '0 3px' }}>↓</button>}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Mid-event backend blocks — overlapping alongside main card */}
                    {overlappingMidEvent.map((p) => {
                      const pEnd = p.startTime && p.duration ? timeToMins(p.startTime) + p.duration : null
                      return (
                        <div key={p.programName} style={{
                          width: 96, flexShrink: 0, background: '#fff', borderRadius: 10,
                          borderLeft: `4px solid ${p.meta.accent}`,
                          boxShadow: `0 1px 6px ${p.meta.accent}22, 0 0 0 1px ${p.meta.accent}33`,
                          padding: '7px 8px', minHeight: blockH,
                        }}>
                          <span style={{ fontSize: 7, fontWeight: 800, padding: '1px 5px', borderRadius: 20, background: p.meta.light, color: p.meta.accent, display: 'inline-block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            ∥ {p.meta.name}
                          </span>
                          <p style={{ fontSize: 10, fontWeight: 700, color: '#1e293b', margin: 0, lineHeight: 1.3 }}>{p.programName}</p>
                          {p.startTime && (
                            <p style={{ fontSize: 8, color: p.meta.accent, margin: '3px 0 0', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                              {fmt12(p.startTime)}{pEnd != null ? `→${fmt12(minsToTime(pEnd))}` : ''}
                            </p>
                          )}
                          {p.duration > 0 && <p style={{ fontSize: 8, color: '#94a3b8', margin: '1px 0 0', fontWeight: 600 }}>{p.duration}m</p>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* Post-event dept programs */}
            {postEventProgs.length > 0 && (
              <div style={{ marginTop: 10, background: '#f5f3ff', border: '1.5px solid #ddd6fe', borderRadius: 10, padding: '8px 12px' }}>
                <p style={{ fontSize: 9, fontWeight: 800, color: '#5b21b6', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 0.8 }}>Post-event</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {postEventProgs.map(p => <DeptEventCard key={p.programName} p={p} />)}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Department custom programmes ── */}
      {deptCustom.length > 0 && (() => {
        const visibleSlugs = DEPT_SLUGS.filter(slug =>
          (deptInputs[slug]?.customPrograms || []).length > 0
        )
        if (visibleSlugs.length === 0) return null
        return (
          <div className="rounded-xl border border-slate-100 overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest flex-1">Department Programmes</p>
              <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{deptCustom.length}</span>
            </div>

            {visibleSlugs.map(slug => {
              const meta = DEPT_META[slug]
              const programs = deptInputs[slug]?.customPrograms || []

              return (
                <div key={slug} className="border-b border-slate-100 last:border-0">
                  {/* Dept header row */}
                  <div className="px-3 py-2 flex items-center gap-2" style={{ background: `${meta.light}88` }}>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: meta.light, color: meta.accent }}>
                      {meta.name}
                    </span>
                    <span className="text-[10px] text-slate-400 flex-1">
                      {programs.length} {programs.length === 1 ? 'programme' : 'programmes'}
                    </span>
                  </div>

                  {/* Programme rows */}
                  <div className="divide-y divide-slate-50">
                    {programs.map((item, idx) => {
                      return (
                        <div key={`${slug}-${item.programName}-${idx}`} className="px-3 py-2.5 space-y-2">
                          {/* Header row */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-800 flex-1 min-w-0">{item.programName}</span>
                            {item.category && (
                              <span style={{
                                fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
                                background: item.category === 'pre-event' ? '#fef3c7' : item.category === 'post-event' ? '#ede9fe' : '#dbeafe',
                                color: item.category === 'pre-event' ? '#92400e' : item.category === 'post-event' ? '#5b21b6' : '#1e40af',
                              }}>
                                {item.category === 'pre-event' ? 'Pre-event' : item.category === 'post-event' ? 'Post-event' : 'Mid-event'}
                              </span>
                            )}
                            {item.elements?.length > 0 && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                                style={{ background: meta.light, color: meta.accent }}>
                                {item.elements.length}
                              </span>
                            )}
                            {canEdit && (
                              <button type="button" onClick={() => removeDeptCustomProgram(slug, item.programName)}
                                className="w-5 h-5 rounded-full flex items-center justify-center text-sm hover:scale-110 transition-transform flex-shrink-0"
                                style={{ background: '#fee2e2', color: '#ef4444' }}>×</button>
                            )}
                          </div>

                          {/* Category selector */}
                          {canEdit && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] font-semibold text-slate-400 flex-shrink-0">Category</span>
                              <div className="flex gap-1.5 flex-wrap">
                                {[
                                  { value: 'pre-event',  label: 'Pre-event',  bg: '#fef3c7', col: '#92400e' },
                                  { value: 'mid-event',  label: 'Mid-event',  bg: '#dbeafe', col: '#1e40af' },
                                  { value: 'post-event', label: 'Post-event', bg: '#ede9fe', col: '#5b21b6' },
                                ].map(opt => (
                                  <button key={opt.value} type="button"
                                    onClick={() => setDeptProgField(slug, item.programName, { category: item.category === opt.value ? '' : opt.value })}
                                    style={{
                                      fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                                      background: item.category === opt.value ? opt.bg : '#f1f5f9',
                                      color: item.category === opt.value ? opt.col : '#94a3b8',
                                      border: `1.5px solid ${item.category === opt.value ? opt.col + '44' : 'transparent'}`,
                                      cursor: 'pointer', transition: 'all 0.15s',
                                    }}>
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Timing row: start time + duration + auto end time */}
                          {canEdit ? (
                            <div className="flex items-center gap-3 flex-wrap">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-semibold text-slate-400">Start</span>
                                <input type="time" value={item.startTime || ''}
                                  onChange={e => setDeptProgField(slug, item.programName, { startTime: e.target.value })}
                                  className="px-2 py-1 rounded-lg border text-[11px] font-semibold bg-white"
                                  style={{ borderColor: `${meta.accent}66`, color: meta.accent, outline: 'none', width: 110 }} />
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-semibold text-slate-400">Duration</span>
                                <input type="number" min={0} max={300} value={item.duration || ''}
                                  onChange={e => setDeptProgField(slug, item.programName, { duration: Number(e.target.value) || 0 })}
                                  placeholder="0"
                                  className="px-2 py-1 rounded-lg border text-[11px] font-semibold bg-white text-center"
                                  style={{ borderColor: `${meta.accent}66`, color: meta.accent, outline: 'none', width: 56 }} />
                                <span className="text-[10px] text-slate-400">min</span>
                              </div>
                              {item.startTime && item.duration > 0 && (
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] text-slate-400">ends</span>
                                  <span style={{ fontSize: 10, fontWeight: 800, color: meta.accent, fontVariantNumeric: 'tabular-nums' }}>
                                    {fmt12(minsToTime(timeToMins(item.startTime) + item.duration))}
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : (item.startTime || item.duration > 0) ? (
                            <div className="flex items-center gap-2 text-[10px] text-slate-500">
                              {item.startTime && <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: meta.accent }}>{fmt12(item.startTime)}</span>}
                              {item.startTime && item.duration > 0 && <span>→</span>}
                              {item.startTime && item.duration > 0 && <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: meta.accent }}>{fmt12(minsToTime(timeToMins(item.startTime) + item.duration))}</span>}
                              {item.duration > 0 && <span className="text-slate-400">· {item.duration}m</span>}
                            </div>
                          ) : null}

                          {item.elements?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pl-1">
                              {item.elements.map((el) => (
                                <span key={el} className="text-[10px] font-medium px-2 py-0.5 rounded-full border"
                                  style={{ background: meta.light, color: meta.accent, borderColor: `${meta.accent}44` }}>
                                  {el}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* ── Save Programme & Timing ── */}
      {canEdit && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4 }}>
          <button type="button" onClick={saveDefault} disabled={saving}
            style={{
              padding: '9px 22px', borderRadius: 12,
              background: saving ? '#94a3b8' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
              color: '#fff', fontSize: 13, fontWeight: 700,
              border: 'none', cursor: saving ? 'default' : 'pointer',
              boxShadow: saving ? 'none' : '0 4px 14px #6366f155',
              transition: 'all 0.2s',
            }}>
            {saving ? 'Saving…' : 'Save Programme & Timing'}
          </button>
          {savedOk && (
            <span style={{
              fontSize: 13, fontWeight: 700, color: '#059669',
              background: '#d1fae5', borderRadius: 20, padding: '4px 14px',
              border: '1px solid #6ee7b744',
            }}>Saved!</span>
          )}
        </div>
      )}

      {/* ── Actions ── */}
      {canEdit && (
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-slate-600 font-medium">Sunday date:</label>
            <input type="date" value={pushDate}
              onChange={(e) => { setPushDate(e.target.value); setNotifSuccess(false) }}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm" />
            {notifSent && (
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                ✓ Notification sent
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <button type="button" disabled={sendingNotif || !pushDate || sorted.length === 0}
              onClick={async () => {
                setSendingNotif(true); setNotifSuccess(false)
                try {
                  const names = sorted.map((x) => String(x.programName || '').trim()).filter(Boolean)
                  await sendProgramNotification(pushDate, names, userProfile?.email || 'unknown')
                  setNotification({ programs: names })
                  setNotifSuccess(true)
                  setTimeout(() => setNotifSuccess(false), 3000)
                } catch (e) { console.error(e); alert('Failed to send notification') }
                setSendingNotif(false)
              }}
              className="px-4 min-h-[44px] py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 transition-colors">
              {sendingNotif ? 'Sending…' : 'Send Program Notification'}
            </button>
            <button type="button" disabled={pushing || !pushDate}
              onClick={async () => {
                setPushing(true)
                try {
                  const payload = [...items]
                    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                    .map((x, i) => ({ programName: String(x.programName || '').trim(), order: i }))
                    .filter((x) => x.programName)
                  await pushProgramToSundayReport(pushDate, payload)
                  navigate(`/department/sunday-ministry/sunday?subtab=livecontrol&date=${pushDate}`)
                } catch (e) { console.error(e); alert('Failed to push program') }
                setPushing(false)
              }}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
              {pushing ? 'Pushing…' : 'Push to Live Control'}
            </button>
            {notifSuccess && <span className="text-sm text-indigo-600 font-semibold">Notification sent to departments!</span>}
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
  // Default Timer / Duration per program name (minutes) — the same field Default
  // Program's own timeline uses (SundayProgramDefault.items[].duration), edited here
  // too so a program's allotted time can be set right where its elements are
  // designed. Live Control presets its countdown/progress target from this same value.
  const [durations, setDurations] = useState({})
  // Inline rename of a program card. `renameMap` records each rename keyed by the
  // program's *original* (Firestore) name so save() can patch the matching
  // SundayProgramDefault.items[] entry — a program renamed here should also change
  // on the Default Program timeline. Custom programs persist via `customPrograms`.
  const [renamingProgram, setRenamingProgram] = useState(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [renameMap, setRenameMap] = useState({})
  const renameCancelledRef = useRef(false)
  const expandedRef = useRef(null)

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
        const durMap = {}
        items.forEach((i) => { durMap[i.programName] = i.duration || 0 })
        setDurations(durMap)
      })
      .catch(() => setPrograms(DEFAULT_SEED.map((i) => i.programName)))
      .finally(() => setLoading(false))
  }, [])

  // Bring the just-expanded card into view — it can sit anywhere in the grid and
  // its panel opens below the fold once the grid has more than a couple of rows.
  useEffect(() => {
    if (expandedProgram && expandedRef.current) {
      expandedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [expandedProgram])

  const setProgramDuration = (programName, val) => {
    const mins = Math.max(0, Math.min(300, Number(val) || 0))
    setDurations((prev) => ({ ...prev, [programName]: mins }))
  }

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

  const beginRename = (name) => {
    renameCancelledRef.current = false
    setRenamingProgram(name)
    setRenameDraft(name)
  }

  const commitRename = () => {
    const from = renamingProgram
    const to = renameDraft.trim()
    setRenamingProgram(null)
    if (renameCancelledRef.current) { renameCancelledRef.current = false; return }
    if (!from || !to || to === from) return
    // Silently ignore a name that already belongs to another program (matches addProgram)
    if ([...programs, ...customPrograms].some((p) => p !== from && p.toLowerCase() === to.toLowerCase())) return

    const moveKey = (obj) => {
      if (!(from in obj)) return obj
      const next = { ...obj }
      next[to] = next[from]
      delete next[from]
      return next
    }

    if (customPrograms.includes(from)) {
      setCustomPrograms((prev) => prev.map((p) => (p === from ? to : p)))
    } else {
      setPrograms((prev) => prev.map((p) => (p === from ? to : p)))
    }
    setDesigns(moveKey)
    setDurations(moveKey)
    if (expandedProgram === from) setExpandedProgram(to)

    setRenameMap((prev) => {
      const orig = Object.keys(prev).find((k) => prev[k] === from)
      const next = { ...prev }
      if (orig) {
        if (orig === to) delete next[orig]
        else next[orig] = to
      } else {
        next[from] = to
      }
      return next
    })
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
      // Read-fresh-merge-write onto the Default Program doc so a duration edited here
      // lands in the same items[] Default Program's own timeline reads/writes,
      // without clobbering whatever order/startTime/serviceStartTime it has set
      // concurrently. A program that only exists here (not yet placed in Default
      // Program's timeline) gets appended as a new, unordered item so its duration
      // isn't lost — but only if a real duration was actually set for it.
      const fresh = await getSundayProgramDefault()
      // Apply grid renames onto the schedule doc, keyed by each item's original
      // name, before merging durations so a renamed program stays renamed on the
      // Default Program timeline too.
      const freshItems = Object.keys(renameMap).length
        ? fresh.items.map((i) => (renameMap[i.programName] ? { ...i, programName: renameMap[i.programName] } : i))
        : fresh.items
      const existingNames = new Set(freshItems.map((i) => i.programName))
      const updatedItems = freshItems.map((i) =>
        durations[i.programName] !== undefined ? { ...i, duration: durations[i.programName] } : i
      )
      let nextOrder = updatedItems.length
      Object.entries(durations).forEach(([name, mins]) => {
        if (!existingNames.has(name) && mins > 0) {
          updatedItems.push({ programName: name, order: nextOrder++, duration: mins, startTime: '' })
        }
      })
      await setSundayProgramDefault(updatedItems, userProfile?.email || 'unknown', fresh.serviceStartTime, fresh.parallelPrograms)
      setRenameMap({})
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
              ref={isSelected ? expandedRef : null}
              className={`relative rounded-2xl overflow-hidden transition-all duration-200 ${isSelected ? 'col-span-2 sm:col-span-3' : ''}`}
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

              {/* Card actions — rename (all), remove (custom only) */}
              {canEdit && renamingProgram !== name && (
                <div className="absolute top-2.5 right-2 z-10 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); beginRename(name) }}
                    title="Rename"
                    className="w-5 h-5 rounded-full flex items-center justify-center transition-all hover:scale-110"
                    style={{ background: '#f1f5f9', color: '#64748b', border: 'none', cursor: 'pointer' }}
                  >
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5z"/>
                    </svg>
                  </button>
                  {isCustom && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeCustomProgram(name) }}
                      title="Remove"
                      className="w-5 h-5 rounded-full flex items-center justify-center text-sm transition-all hover:scale-110"
                      style={{ background: '#fee2e2', color: '#ef4444', border: 'none', cursor: 'pointer' }}
                    >
                      ×
                    </button>
                  )}
                </div>
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
                  {renamingProgram === name ? (
                    <input
                      autoFocus
                      type="text"
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        e.stopPropagation()
                        if (e.key === 'Enter') commitRename()
                        if (e.key === 'Escape') { renameCancelledRef.current = true; setRenameDraft(name); setRenamingProgram(null) }
                      }}
                      onBlur={commitRename}
                      className="flex-1 min-w-0"
                      style={{
                        fontSize: 12, fontWeight: 700, lineHeight: 1.35, marginTop: 2,
                        color: '#1e293b', background: '#fff',
                        padding: '2px 6px', borderRadius: 6,
                        border: `1.5px solid ${color.accent}`, outline: 'none',
                      }}
                    />
                  ) : (
                    <span style={{
                      fontSize: 12, fontWeight: 700, lineHeight: 1.35,
                      color: isSelected ? color.accent : '#1e293b',
                      paddingTop: 4, flex: 1,
                      paddingRight: canEdit ? (isCustom ? 42 : 24) : 0,
                    }}>
                      {name}
                    </span>
                  )}
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

                {/* Default Timer / Duration — the same field Default Program's own
                    timeline reads, editable right here so a program's allotted time
                    can be set alongside its designed elements. Live Control presets
                    its countdown/progress target from this once saved. */}
                {canEdit ? (
                  <div
                    className="flex items-center gap-1.5 mb-2.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span style={{ fontSize: 11 }}>⏱</span>
                    <input
                      type="number"
                      min={0}
                      max={300}
                      value={durations[name] || ''}
                      onChange={(e) => setProgramDuration(name, e.target.value)}
                      placeholder="0"
                      className="text-center"
                      style={{
                        width: 44, height: 22, padding: '0 4px', borderRadius: 6,
                        border: `1.5px solid ${color.accent}55`, fontSize: 10, fontWeight: 700,
                        color: color.accent, background: '#fff', outline: 'none',
                      }}
                    />
                    <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600 }}>min default</span>
                  </div>
                ) : durations[name] > 0 ? (
                  <p style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600, marginBottom: 10 }}>⏱ {durations[name]} min default</p>
                ) : null}

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

              {/* Expanded panel — in place, replaces the old below-the-grid palette */}
              {isSelected && (
                <div style={{ borderTop: `1.5px solid ${color.accent}22`, background: color.light }}>
                  {/* Header strip */}
                  <div className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span style={{
                        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                        background: color.accent, color: '#fff', fontSize: 10, fontWeight: 800,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {idx + 1}
                      </span>
                      <span className="text-sm font-bold truncate" style={{ color: color.accent }}>{name}</span>
                      {assigned.length > 0 && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: color.accent, color: '#fff' }}>
                          {assigned.length} element{assigned.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandedProgram(null)}
                      className="w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold transition-all hover:scale-110 flex-shrink-0"
                      style={{ background: `${color.accent}22`, color: color.accent }}
                    >
                      ×
                    </button>
                  </div>

                  <div className="bg-white border-t" style={{ borderColor: `${color.accent}18` }}>
                    {/* Timing */}
                    {canEdit && (
                      <div className="px-4 pt-3 pb-1">
                        <p className="text-[10px] font-bold uppercase tracking-widest mb-2 text-slate-400">Timing</p>
                        <div className="flex items-center gap-1.5">
                          <span style={{ fontSize: 12 }}>⏱</span>
                          <input
                            type="number"
                            min={0}
                            max={300}
                            value={durations[name] || ''}
                            onChange={(e) => setProgramDuration(name, e.target.value)}
                            placeholder="0"
                            className="text-center"
                            style={{
                              width: 52, height: 26, padding: '0 6px', borderRadius: 6,
                              border: `1.5px solid ${color.accent}`, fontSize: 12, fontWeight: 700,
                              color: color.accent, background: '#fff', outline: 'none',
                            }}
                          />
                          <span className="text-xs font-semibold text-slate-500">min default</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">Live Control presets its countdown from this.</p>
                      </div>
                    )}

                    {/* Elements */}
                    <div className="px-4 pt-3 pb-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest mb-2 text-slate-400">Elements</p>
                      <div className="space-y-4">
                        {ELEMENT_CATEGORIES.map((cat) => (
                          <div key={cat.id}>
                            <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: cat.dotColor }}>
                              {cat.label}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {cat.elements.map((el) => {
                                const isActive = assigned.includes(el)
                                return (
                                  <button
                                    key={el}
                                    type="button"
                                    disabled={!canEdit}
                                    onClick={() => toggleElement(name, el)}
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
                                const isActive = assigned.includes(el)
                                return (
                                  <button
                                    key={el}
                                    type="button"
                                    disabled={!canEdit}
                                    onClick={() => toggleElement(name, el)}
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
                  </div>
                </div>
              )}
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

      {/* Save — always visible for an editor: a duration can now be changed directly
          from any closed grid card, not just when a program is expanded or a custom
          one added. */}
      {canEdit && (
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-5 min-h-[44px] py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 transition-colors"
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
  const { userProfile, isSundayMinistryDirector } = useAuth()
  const navigate = useNavigate()
  const canEdit = isSundayMinistryDirector
  const [subTab, setSubTab] = useState('default')

  if (!isSundayMinistryDirector) {
    return (
      <div className="p-8 text-slate-600">
        <Link to="/department/sunday-ministry" className="text-blue-600 hover:underline">← Sunday Ministry</Link>
        <p className="mt-4">You do not have access to Sunday Ministry.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="space-y-2 p-4 max-w-3xl">
        {!embedded && <h1 className="text-xl font-semibold text-slate-800">Program</h1>}
        <SubTabBar active={subTab} onChange={setSubTab} />
        {subTab === 'default' && <DefaultProgramTab canEdit={canEdit} userProfile={userProfile} navigate={navigate} />}
        {subTab === 'design' && <DesignProgramTab canEdit={canEdit} userProfile={userProfile} />}
      </div>
    </div>
  )
}
