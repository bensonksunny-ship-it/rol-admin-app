import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { format, addDays, parseISO, isToday } from 'date-fns'
import { ChevronLeft, ChevronRight, ChevronDown, Plus, X, Pencil, Trash2, Clock, MapPin, Check, Settings2 } from 'lucide-react'
import {
  subscribeToSpOfficeSchedule,
  addSpOfficeScheduleItem,
  updateSpOfficeScheduleItem,
  deleteSpOfficeScheduleItem,
  subscribeToSpOfficePrograms,
  setSpOfficeProgramList,
} from '../../services/firestore'

// Starter set of regular programs — used only until someone first edits the list via
// "Manage programs", after which sp_office_settings/programs.list is the whole list.
const DEFAULT_REGULAR_PROGRAMS = [
  'Morning Prayer',
  'Devotion',
  'Staff Meeting',
  'Sermon Preparation',
  'Counselling',
  'Pastoral Visit',
  'Hospital Visit',
  'Appointment',
  'Board Meeting',
  'Leaders Meeting',
  'Cell Leaders Meeting',
  'Bible Study',
  'Lunch Break',
  'Travel',
  'Office Work',
]

const EMPTY_FORM = { title: '', startTime: '', endTime: '', notes: '' }

// "14:30" → "2:30 PM"
function formatTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`
}

const currentClockTime = () => format(new Date(), 'HH:mm')

// Where the floating option list goes, relative to the viewport: below the input, or
// above it when there isn't room below (e.g. the last row near the bottom of the modal).
function listPlacement(inputEl) {
  const rect = inputEl.getBoundingClientRect()
  const gap = 4
  const spaceBelow = window.innerHeight - rect.bottom - gap - 8
  const spaceAbove = rect.top - gap - 8
  // Prefer opening downward; only flip up when there is genuinely no room below.
  const openUp = spaceBelow < 160 && spaceAbove > spaceBelow
  return {
    left: rect.left,
    minWidth: rect.width,
    maxWidth: Math.max(rect.width, Math.min(448, window.innerWidth - rect.left - 8)),
    maxHeight: Math.min(384, openUp ? spaceAbove : spaceBelow),
    ...(openUp ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap }),
  }
}

/**
 * Searchable combobox: filters `options` as you type, but the typed text itself is
 * always the value — so a program not in the list is just typed in directly.
 * The option list is portaled to <body> with fixed positioning so it floats above
 * the builder modal instead of being clipped by its scrolling body.
 */
function ProgramCombobox({ value, onChange, options, onAddNew, autoFocus = false }) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [placement, setPlacement] = useState(null)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase()
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options
  }, [value, options])
  const isCustom = value.trim() && !options.some((o) => o.toLowerCase() === value.trim().toLowerCase())

  const openList = () => {
    if (inputRef.current) setPlacement(listPlacement(inputRef.current))
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return undefined
    const onDocDown = (e) => {
      if (!wrapRef.current?.contains(e.target) && !listRef.current?.contains(e.target)) setOpen(false)
    }
    // Keep the floating list pinned to the input while anything scrolls or resizes
    // (scrolls inside the list itself don't move the input, so skip those).
    const reposition = (e) => {
      if (e?.target && listRef.current?.contains(e.target)) return
      if (inputRef.current) setPlacement(listPlacement(inputRef.current))
    }
    document.addEventListener('mousedown', onDocDown)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open])

  const pick = (name) => { onChange(name); setOpen(false) }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) openList(); setHighlight((h) => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter' && open && filtered[highlight]) { e.preventDefault(); pick(filtered[highlight]) }
    else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false) }
  }

  const showList = open && placement && (filtered.length > 0 || isCustom || onAddNew)

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          placeholder="Search or type a program…"
          value={value}
          onChange={(e) => { onChange(e.target.value); openList(); setHighlight(0) }}
          onFocus={openList}
          onKeyDown={onKeyDown}
          className="w-full bg-white border border-slate-300 rounded-lg pl-3 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => (open ? setOpen(false) : openList())}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-600"
          aria-label="Show programs"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {showList && createPortal(
        <ul
          ref={listRef}
          role="listbox"
          style={placement}
          className="fixed z-[70] overflow-y-auto overscroll-contain bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 text-sm"
        >
          {filtered.map((name, i) => (
            <li
              key={name}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => { e.preventDefault(); pick(name) }}
              onMouseEnter={() => setHighlight(i)}
              className={`px-3.5 py-2 leading-snug cursor-pointer ${i === highlight ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700'}`}
            >
              {name}
            </li>
          ))}
          {filtered.length === 0 && !isCustom && (
            <li className="px-3.5 py-2 text-slate-400">No matching programs</li>
          )}
          {isCustom && (
            <li
              onMouseDown={(e) => { e.preventDefault(); setOpen(false) }}
              className="px-3.5 py-2 leading-snug cursor-pointer text-slate-500 hover:bg-slate-50 border-t border-slate-100"
            >
              Use custom: <span className="font-medium text-slate-800">“{value.trim()}”</span>
            </li>
          )}
          {onAddNew && (
            <li
              onMouseDown={(e) => { e.preventDefault(); setOpen(false); onAddNew(isCustom ? value.trim() : '') }}
              className="px-3.5 py-2 leading-snug cursor-pointer font-medium text-indigo-600 hover:bg-indigo-50 border-t border-slate-100 flex items-start gap-1.5"
            >
              <Plus className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{isCustom ? <>Add “{value.trim()}” as a regular program</> : 'Add New Regular Program'}</span>
            </li>
          )}
        </ul>,
        document.body
      )}
    </div>
  )
}

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Add / rename / delete the regular programs list. Every change is saved straight
 * away. Renaming or deleting a program doesn't touch schedule items already saved
 * with that name — they store the title text, not a reference.
 */
function ManageProgramsModal({ programs, initialDraft, onSaveList, onAdded, onClose }) {
  const [draft, setDraft]         = useState(initialDraft || '')
  const [editIdx, setEditIdx]     = useState(null)
  const [editValue, setEditValue] = useState('')
  const [busy, setBusy]           = useState(false)
  const [error, setError]         = useState('')
  const [notice, setNotice]       = useState('')

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(''), 2500)
    return () => clearTimeout(t)
  }, [notice])

  // onSaveList applies the list optimistically in the parent and rolls it back if
  // the write fails, so the list below already shows `next` while this awaits.
  const persist = async (next, successMsg) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await onSaveList(next)
      setNotice(successMsg)
      return true
    } catch (err) {
      console.error('ManagePrograms save:', err)
      setError(
        err?.code === 'permission-denied'
          ? 'Could not save the program list — you don’t have permission to edit SP Office settings.'
          : err?.code === 'unavailable'
            ? 'Could not save the program list — you appear to be offline. Try again when connected.'
            : `Could not save the program list.${err?.message ? ` (${err.message})` : ''}`
      )
      return false
    } finally {
      setBusy(false)
    }
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    const name = draft.trim()
    if (!name) return
    if (programs.some((p) => sameName(p, name))) { setError(`“${name}” is already in the list.`); return }
    setDraft('')
    if (await persist([...programs, name], `Added “${name}”.`)) onAdded?.(name)
    else setDraft(name)
  }

  const handleRename = async (idx) => {
    const name = editValue.trim()
    if (!name) return
    if (programs.some((p, i) => i !== idx && sameName(p, name))) { setError(`“${name}” is already in the list.`); return }
    setEditIdx(null)
    if (!(await persist(programs.map((p, i) => (i === idx ? name : p)), `Renamed to “${name}”.`))) setEditIdx(idx)
  }

  const handleDelete = (idx) => persist(programs.filter((_, i) => i !== idx), `Removed “${programs[idx]}”.`)

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">Regular Programs</h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-500" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleAdd} className="px-5 pt-4 pb-3 flex gap-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="New regular program name"
            className="flex-1 min-w-0 border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <button type="submit" disabled={busy || !draft.trim()} className="inline-flex items-center gap-1 px-3 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            <Plus className="w-4 h-4" /> Add
          </button>
        </form>
        {error && <p role="alert" className="mx-5 mb-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        {!error && notice && <p role="status" className="mx-5 mb-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">{notice}</p>}
        {busy && <p className="mx-5 mb-2 text-xs text-slate-400">Saving…</p>}
        <ul className="flex-1 overflow-y-auto border-t border-slate-100 divide-y divide-slate-100">
          {programs.length === 0 && <li className="px-5 py-6 text-center text-sm text-slate-500">No regular programs yet.</li>}
          {programs.map((name, idx) => (
            <li key={name} className="px-5 py-2 flex items-center gap-2 text-sm">
              {editIdx === idx ? (
                <>
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); handleRename(idx) }
                      else if (e.key === 'Escape') setEditIdx(null)
                    }}
                    className="flex-1 min-w-0 border border-slate-300 rounded-lg px-2 py-1 text-sm"
                  />
                  <button type="button" disabled={busy || !editValue.trim()} onClick={() => handleRename(idx)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 disabled:opacity-50" aria-label="Save name">
                    <Check className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => setEditIdx(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Cancel rename">
                    <X className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 min-w-0 truncate text-slate-700">{name}</span>
                  <button type="button" disabled={busy} onClick={() => { setEditIdx(idx); setEditValue(name); setError('') }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" aria-label={`Rename ${name}`}>
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button type="button" disabled={busy} onClick={() => handleDelete(idx)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600" aria-label={`Delete ${name}`}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function TimeField({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <div className="mt-1 flex gap-1.5">
        <input
          type="time"
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 bg-white border border-slate-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
        />
        <button
          type="button"
          onClick={() => onChange(currentClockTime())}
          title="Set to current time"
          className="shrink-0 inline-flex items-center gap-1 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          <Clock className="w-3.5 h-3.5" /> Now
        </button>
      </div>
    </label>
  )
}

let rowSeq = 0
const newRow = (data = {}) => ({ key: `row-${++rowSeq}`, ...EMPTY_FORM, ...data })
const rowIsBlank = (r) => !r.title.trim() && !r.startTime && !r.endTime && !r.notes.trim()

/**
 * SP Office → Daily Schedule. One day at a time, as a numbered table
 * (SL NO · Program / Details · Timing), sorted by start time with untimed items last.
 */
export default function DailySchedule({ canEdit, userProfile }) {
  const [dateStr, setDateStr] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [programsDoc, setProgramsDoc] = useState({})
  const [manageOpen, setManageOpen]   = useState(false)
  const [manageDraft, setManageDraft] = useState('')
  const [manageRowKey, setManageRowKey] = useState(null)
  // Shown while a program-list write is in flight; dropped on success (the snapshot
  // then carries the saved list) or on failure (rolls back to the last saved list).
  const [optimisticPrograms, setOptimisticPrograms] = useState(null)

  // Builder modal: several rows when adding, exactly one when editing.
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [rows, setRows]           = useState([])
  const [saving, setSaving]       = useState(false)

  const who = userProfile?.name || userProfile?.email || 'unknown'

  useEffect(() => {
    setLoading(true)
    setError('')
    return subscribeToSpOfficeSchedule(
      dateStr,
      (list) => { setItems(list); setLoading(false) },
      () => { setItems([]); setLoading(false); setError('Could not load the schedule.') }
    )
  }, [dateStr])

  useEffect(() => subscribeToSpOfficePrograms(setProgramsDoc, () => setProgramsDoc({})), [])

  // Saved list wins once it exists; before that, defaults + any names remembered by
  // the earlier auto-save behaviour (legacy `names` field).
  const programOptions = useMemo(() => {
    if (optimisticPrograms) return optimisticPrograms
    if (Array.isArray(programsDoc.list)) return programsDoc.list
    const out = [...DEFAULT_REGULAR_PROGRAMS]
    for (const n of programsDoc.names || []) if (!out.some((p) => sameName(p, n))) out.push(n)
    return out
  }, [programsDoc, optimisticPrograms])

  const saveProgramList = async (list) => {
    setOptimisticPrograms(list)
    try { await setSpOfficeProgramList(list, who) }
    finally { setOptimisticPrograms(null) }
  }

  const openManage = (draft = '', rowKey = null) => { setManageDraft(draft); setManageRowKey(rowKey); setManageOpen(true) }

  const sorted = useMemo(
    () => [...items].sort((a, b) => (a.startTime || '99:99').localeCompare(b.startTime || '99:99')),
    [items]
  )

  const dateObj = parseISO(dateStr)
  const shiftDay = (n) => setDateStr(format(addDays(dateObj, n), 'yyyy-MM-dd'))

  const openAdd = () => { setEditingId(null); setRows([newRow()]); setError(''); setModalOpen(true) }
  const openEdit = (item) => {
    setEditingId(item.id)
    setError('')
    setRows([newRow({ title: item.title || '', startTime: item.startTime || '', endTime: item.endTime || '', notes: item.notes || '' })])
    setModalOpen(true)
  }

  const updateRow = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const removeRow = (key) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs))
  const addRow = () => setRows((rs) => [...rs, newRow()])

  const filledRows = rows.filter((r) => !rowIsBlank(r))
  // SL No shown in the builder continues on from what's already scheduled that day.
  const slFor = (idx) => (editingId ? sorted.findIndex((i) => i.id === editingId) + 1 : sorted.length + idx + 1)

  const handleSave = async (e) => {
    e.preventDefault()
    if (filledRows.length === 0) return
    if (filledRows.some((r) => !r.title.trim())) {
      setError('Every row needs a program name.')
      return
    }
    if (filledRows.some((r) => r.startTime && r.endTime && r.endTime < r.startTime)) {
      setError('A row has its end time before its start time.')
      return
    }
    setSaving(true)
    setError('')
    const toPayload = (r) => ({
      date: dateStr,
      title: r.title.trim(),
      startTime: r.startTime || '',
      endTime: r.endTime || '',
      notes: r.notes.trim(),
    })
    try {
      if (editingId) await updateSpOfficeScheduleItem(editingId, toPayload(filledRows[0]), who)
      else await Promise.all(filledRows.map((r) => addSpOfficeScheduleItem(toPayload(r), who)))
      setModalOpen(false)
    } catch (err) {
      console.error('DailySchedule save:', err)
      setError('Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item) => {
    try { await deleteSpOfficeScheduleItem(item.id) }
    catch (err) { console.error('DailySchedule delete:', err); setError('Could not delete this item.') }
  }

  return (
    // @container + min-h in cqw: the sheet is always at least A4 proportion
    // (297 / 210 = 1.414 × its own width) and still grows if the day runs longer.
    <div className="@container">
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[141.4cqw]">
      {/* Header: date navigator */}
      <div className="px-4 sm:px-6 py-5 border-b border-slate-200 flex flex-wrap items-center gap-4 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => shiftDay(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600" aria-label="Previous day">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="min-w-[9rem] text-center">
            <p className="font-semibold text-slate-800">{format(dateObj, 'EEEE')}</p>
            <p className="text-xs text-slate-500">{format(dateObj, 'd MMM yyyy')}</p>
          </div>
          <button type="button" onClick={() => shiftDay(1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600" aria-label="Next day">
            <ChevronRight className="w-5 h-5" />
          </button>
          {!isToday(dateObj) && (
            <button type="button" onClick={() => setDateStr(format(new Date(), 'yyyy-MM-dd'))} className="text-xs font-medium text-indigo-600 hover:underline ml-1">
              Today
            </button>
          )}
          <input
            type="date"
            value={dateStr}
            onChange={(e) => e.target.value && setDateStr(e.target.value)}
            className="ml-1 text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-600"
          />
        </div>
        {canEdit && (
          <button type="button" onClick={openAdd} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium shadow-sm hover:bg-indigo-700">
            <Plus className="w-4 h-4" /> Add Program
          </button>
        )}
      </div>

      {error && !modalOpen && <p className="px-4 sm:px-6 py-2 text-sm text-red-600 bg-red-50 border-b border-red-100">{error}</p>}

      {/* Schedule table */}
      {loading ? (
        <p className="px-6 py-12 text-center text-sm text-slate-500">Loading…</p>
      ) : sorted.length === 0 ? (
        <div className="px-6 py-14 text-center">
          <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Nothing scheduled for this day.</p>
        </div>
      ) : (
        // No sideways scrolling: fixed-layout table that fits the page column, text
        // wraps downward. On phones the Timing column folds in under the program name.
        <table className="w-full table-fixed text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide border-b border-slate-200">
            <tr>
              <th className="w-14 sm:w-20 px-3 sm:px-6 py-3 text-left">SL No</th>
              <th className="px-3 sm:px-6 py-3 text-left">Program / Details</th>
              <th className="hidden sm:table-cell w-48 px-6 py-3 text-left">Timing</th>
              {canEdit && <th className="w-24 sm:w-28 px-3 sm:px-6 py-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((item, idx) => {
              const timing = item.startTime ? (
                <>
                  {formatTime(item.startTime)}
                  {item.endTime && <span className="text-slate-400"> – {formatTime(item.endTime)}</span>}
                </>
              ) : (
                <span className="text-slate-400">—</span>
              )
              return (
                <tr key={item.id} className="align-top hover:bg-slate-50/60">
                  <td className="px-3 sm:px-6 py-4 font-medium text-slate-500">{idx + 1}</td>
                  <td className="px-3 sm:px-6 py-4 break-words">
                    <p className="font-medium text-slate-800">{item.title}</p>
                    <p className="sm:hidden text-xs text-slate-600 mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3 shrink-0 text-slate-400" /><span>{timing}</span>
                    </p>
                    {item.location && (
                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-1"><MapPin className="w-3 h-3" />{item.location}</p>
                    )}
                    {item.notes && <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">{item.notes}</p>}
                  </td>
                  <td className="hidden sm:table-cell px-6 py-4 text-slate-700">{timing}</td>
                  {canEdit && (
                    <td className="px-2 sm:px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => openEdit(item)} className="shrink-0 p-2 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Edit">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => handleDelete(item)} className="shrink-0 p-2 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600" aria-label="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {/* Ruled lines fill the rest of the page like a paper sheet */}
      {!loading && (
        <div
          aria-hidden="true"
          className="flex-1 min-h-[3.25rem] border-t border-slate-100"
          style={{ backgroundImage: "repeating-linear-gradient(to bottom, transparent 0, transparent calc(3.25rem - 1px), rgb(241 245 249) calc(3.25rem - 1px), rgb(241 245 249) 3.25rem)" }}
        />
      )}

      {/* Item builder modal — each row is a card whose fields stack downward */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3 sm:p-6" onClick={() => !saving && setModalOpen(false)}>
          <form onSubmit={handleSave} onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[94vh] flex flex-col">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold text-slate-800">{editingId ? 'Edit Program' : 'Add Programs'}</h3>
                <p className="text-xs text-slate-500">{format(dateObj, 'EEEE, d MMM yyyy')}</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => openManage()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50">
                  <Settings2 className="w-3.5 h-3.5" /> Manage programs
                </button>
                <button type="button" onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Close">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6 space-y-4">
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

              {rows.map((row, idx) => (
                <div key={row.key} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-indigo-50 text-indigo-700 text-xs">{slFor(idx)}</span>
                      SL No
                    </span>
                    {!editingId && rows.length > 1 && (
                      <button type="button" onClick={() => removeRow(row.key)} className="shrink-0 p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600" aria-label="Remove row">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div>
                    <span className="text-xs font-medium text-slate-600">Program *</span>
                    <div className="mt-1">
                      <ProgramCombobox
                        autoFocus={idx === rows.length - 1}
                        value={row.title}
                        onChange={(title) => updateRow(row.key, { title })}
                        options={programOptions}
                        onAddNew={(draft) => openManage(draft, row.key)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <TimeField label="Start" value={row.startTime} onChange={(startTime) => updateRow(row.key, { startTime })} />
                    <TimeField label="End" value={row.endTime} onChange={(endTime) => updateRow(row.key, { endTime })} />
                  </div>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Details</span>
                    <textarea
                      rows={3}
                      placeholder="Optional notes"
                      value={row.notes}
                      onChange={(e) => updateRow(row.key, { notes: e.target.value })}
                      className="mt-1 w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                    />
                  </label>
                </div>
              ))}

              {!editingId && (
                <button type="button" onClick={addRow} className="w-full inline-flex items-center justify-center gap-1.5 py-3 rounded-xl border-2 border-dashed border-slate-300 text-sm font-medium text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/50">
                  <Plus className="w-4 h-4" /> Add another program
                </button>
              )}
            </div>

            <div className="px-4 sm:px-6 py-4 border-t border-slate-200 flex items-center justify-between gap-4">
              <p className="text-xs text-slate-500">
                {!editingId && `${filledRows.length} program${filledRows.length === 1 ? '' : 's'} to add`}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" disabled={saving || filledRows.length === 0} className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium shadow-sm hover:bg-indigo-700 disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {manageOpen && (
        <ManageProgramsModal
          programs={programOptions}
          initialDraft={manageDraft}
          onSaveList={saveProgramList}
          onAdded={(name) => {
            if (manageRowKey && manageDraft) { updateRow(manageRowKey, { title: name }); setManageOpen(false) }
          }}
          onClose={() => setManageOpen(false)}
        />
      )}
    </div>
    </div>
  )
}
