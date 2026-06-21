import { useEffect, useState } from 'react'
import { format, addWeeks, subWeeks } from 'date-fns'
import {
  getSundayPlan,
  setSundayPlanSection,
  getDepartmentTeamMembers,
} from '../../services/firestore'

const DESIGN_TYPES = ['Video', 'Slide', 'Audio', 'Light']

const TYPE_STYLE = {
  Video: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', icon: '🎬' },
  Slide: { bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe', icon: '🖥️' },
  Audio: { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0', icon: '🎵' },
  Light: { bg: '#fffbeb', color: '#b45309', border: '#fde68a', icon: '💡' },
}

const STATUS_OPTS = [
  { value: 'pending',     label: 'Pending',     bg: '#f1f5f9', color: '#64748b' },
  { value: 'in-progress', label: 'In Progress', bg: '#eff6ff', color: '#1d4ed8' },
  { value: 'done',        label: 'Done',         bg: '#f0fdf4', color: '#15803d' },
]

function nextSunday() {
  const today = new Date()
  const day = today.getDay()
  const next = new Date(today)
  next.setDate(today.getDate() + (day === 0 ? 0 : 7 - day))
  return format(next, 'yyyy-MM-dd')
}

const BLANK_ITEM = () => ({
  id: `item-${Date.now()}`,
  name: '',
  types: [],
  designer: '',
  status: 'pending',
  notes: '',
})

export default function MediaDesign({ canEdit }) {
  const [selectedDate, setSelectedDate] = useState(nextSunday)
  const [program, setProgram] = useState([])   // array of design items
  const [team, setTeam] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [addingItem, setAddingItem] = useState(false)
  const [newItem, setNewItem] = useState(BLANK_ITEM())
  const [editingId, setEditingId] = useState(null)

  const prevSunday = () => setSelectedDate(format(subWeeks(new Date(selectedDate), 1), 'yyyy-MM-dd'))
  const nextSundayNav = () => setSelectedDate(format(addWeeks(new Date(selectedDate), 1), 'yyyy-MM-dd'))

  useEffect(() => {
    getDepartmentTeamMembers('Media')
      .then((m) => setTeam((m || []).filter((x) => !x.isFormer && x.status !== 'inactive')))
      .catch(() => setTeam([]))
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getSundayPlan(selectedDate)
      .then((plan) => {
        if (cancelled) return
        setProgram(plan?.mediaDesignProgram || [])
        setLoading(false)
      })
      .catch(() => { if (!cancelled) { setProgram([]); setLoading(false) } })
    return () => { cancelled = true }
  }, [selectedDate])

  const persist = async (updated) => {
    setSaving(true)
    try { await setSundayPlanSection(selectedDate, 'mediaDesignProgram', updated) } catch (e) { console.error(e) }
    setSaving(false)
  }

  const addItem = async () => {
    if (!newItem.name.trim()) return
    const item = { ...newItem, id: `item-${Date.now()}` }
    const updated = [...program, item]
    setProgram(updated)
    await persist(updated)
    setNewItem(BLANK_ITEM())
    setAddingItem(false)
  }

  const removeItem = async (id) => {
    const updated = program.filter((p) => p.id !== id)
    setProgram(updated)
    await persist(updated)
  }

  const patchItem = async (id, patch) => {
    const updated = program.map((p) => p.id === id ? { ...p, ...patch } : p)
    setProgram(updated)
    await persist(updated)
  }

  const toggleType = (item, type) => {
    const types = item.types.includes(type)
      ? item.types.filter((t) => t !== type)
      : [...item.types, type]
    return types
  }

  const doneCount = program.filter((p) => p.status === 'done').length

  return (
    <div className="space-y-4 p-4 max-w-3xl">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Design Program</h1>
          <p className="text-xs text-slate-500 mt-0.5">Build the media program for Sunday and push it to the Sunday Plan</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={prevSunday} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">← Prev</button>
          <span className="text-sm font-semibold text-slate-700 min-w-[148px] text-center">{format(new Date(selectedDate), 'EEE, dd MMM yyyy')}</span>
          <button type="button" onClick={nextSundayNav} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">Next →</button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>
      ) : (
        <>
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-800 text-sm">Program Items</span>
              {program.length > 0 && (
                <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{doneCount}/{program.length} done</span>
              )}
              {saving && <span className="text-xs text-indigo-400 font-medium">Saving…</span>}
            </div>
            {canEdit && !addingItem && (
              <button type="button" onClick={() => setAddingItem(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 shadow-sm">
                <span className="text-base leading-none">+</span> Add Item
              </button>
            )}
          </div>

          {/* Add item form */}
          {canEdit && addingItem && (
            <div className="bg-white rounded-xl border-2 border-indigo-200 shadow-sm p-4 space-y-3">
              <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">New Program Item</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-slate-500 mb-1 font-medium">Program Name</p>
                  <input
                    value={newItem.name}
                    onChange={(e) => setNewItem((f) => ({ ...f, name: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && addItem()}
                    placeholder="e.g. Flash Video, Worship Slides…"
                    autoFocus
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 mb-1 font-medium">Designer</p>
                  <select value={newItem.designer} onChange={(e) => setNewItem((f) => ({ ...f, designer: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200">
                    <option value="">— Not assigned</option>
                    {team.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 mb-2 font-medium">Design Types</p>
                <div className="flex gap-2 flex-wrap">
                  {DESIGN_TYPES.map((t) => {
                    const s = TYPE_STYLE[t]
                    const active = newItem.types.includes(t)
                    return (
                      <button key={t} type="button"
                        onClick={() => setNewItem((f) => ({ ...f, types: f.types.includes(t) ? f.types.filter((x) => x !== t) : [...f.types, t] }))}
                        style={{ background: active ? s.bg : '#f8fafc', color: active ? s.color : '#94a3b8', border: `2px solid ${active ? s.border : '#e2e8f0'}`, borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}
                      >{s.icon} {t}</button>
                    )
                  })}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={addItem} disabled={!newItem.name.trim()} className="px-5 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 shadow-sm">Add</button>
                <button type="button" onClick={() => { setAddingItem(false); setNewItem(BLANK_ITEM()) }} className="px-4 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50">Cancel</button>
              </div>
            </div>
          )}

          {/* Grid of program cards */}
          {program.length === 0 && !addingItem ? (
            <div className="bg-white rounded-xl border border-dashed border-slate-200 py-14 text-center">
              <p className="text-slate-400 text-sm">No program items yet.</p>
              <p className="text-xs text-slate-300 mt-1">Add items like "Flash Video", "Worship Slides"…</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {program.map((item, idx) => {
                const isEditing = editingId === item.id
                const sOpt = STATUS_OPTS.find((s) => s.value === item.status) || STATUS_OPTS[0]

                return (
                  <div key={item.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-shadow hover:shadow-md ${isEditing ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-200'}`}>
                    {!isEditing ? (
                      /* ── Card read view ── */
                      <div className="p-4 flex flex-col gap-2.5 h-full">
                        {/* Top row: number + name + status */}
                        <div className="flex items-start gap-2">
                          <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{idx + 1}</span>
                          <span className="font-bold text-slate-800 text-sm leading-snug flex-1">{item.name}</span>
                          <span style={{ background: sOpt.bg, color: sOpt.color, borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{sOpt.label}</span>
                        </div>

                        {/* Type chips */}
                        {item.types.length > 0 && (
                          <div className="flex gap-1.5 flex-wrap pl-8">
                            {item.types.map((t) => {
                              const s = TYPE_STYLE[t]
                              return (
                                <span key={t} style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, borderRadius: 16, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{s.icon} {t}</span>
                              )
                            })}
                          </div>
                        )}

                        {/* Designer + notes */}
                        <div className="pl-8 space-y-1">
                          {item.designer && (
                            <p className="text-xs text-slate-500">
                              <span className="font-medium text-slate-600">Designer:</span> {item.designer}
                            </p>
                          )}
                          {item.notes && <p className="text-xs text-slate-400 italic">{item.notes}</p>}
                        </div>

                        {/* Actions */}
                        {canEdit && (
                          <div className="flex gap-2 mt-auto pt-2 border-t border-slate-100">
                            <button type="button" onClick={() => setEditingId(item.id)} className="flex-1 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">Edit</button>
                            <button type="button" onClick={() => removeItem(item.id)} className="flex-1 py-1 text-xs font-semibold text-red-500 hover:bg-red-50 rounded-lg transition-colors">Remove</button>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* ── Card edit view ── */
                      <div className="p-4 space-y-3 bg-indigo-50/40">
                        <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Editing</p>
                        <div className="space-y-2">
                          <div>
                            <p className="text-[10px] text-slate-500 mb-1 font-medium">Program Name</p>
                            <input value={item.name} onChange={(e) => patchItem(item.id, { name: e.target.value })}
                              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200" autoFocus />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <p className="text-[10px] text-slate-500 mb-1 font-medium">Designer</p>
                              <select value={item.designer} onChange={(e) => patchItem(item.id, { designer: e.target.value })} className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white">
                                <option value="">— None</option>
                                {team.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                              </select>
                            </div>
                            <div>
                              <p className="text-[10px] text-slate-500 mb-1 font-medium">Status</p>
                              <select value={item.status} onChange={(e) => patchItem(item.id, { status: e.target.value })} className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white">
                                {STATUS_OPTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                              </select>
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-500 mb-1.5 font-medium">Design Types</p>
                            <div className="flex gap-1.5 flex-wrap">
                              {DESIGN_TYPES.map((t) => {
                                const s = TYPE_STYLE[t]
                                const active = item.types.includes(t)
                                return (
                                  <button key={t} type="button" onClick={() => patchItem(item.id, { types: toggleType(item, t) })}
                                    style={{ background: active ? s.bg : '#f8fafc', color: active ? s.color : '#94a3b8', border: `2px solid ${active ? s.border : '#e2e8f0'}`, borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}
                                  >{s.icon} {t}</button>
                                )
                              })}
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-500 mb-1 font-medium">Notes</p>
                            <input value={item.notes || ''} onChange={(e) => patchItem(item.id, { notes: e.target.value })} placeholder="Optional notes…"
                              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                          </div>
                        </div>
                        <button type="button" onClick={() => setEditingId(null)} className="w-full py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700">Done</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

        </>
      )}
    </div>
  )
}
