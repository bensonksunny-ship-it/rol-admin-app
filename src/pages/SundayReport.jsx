import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { format, addWeeks, subWeeks } from 'date-fns'
import { useAuth } from '../context/AuthContext'
import {
  getSundayReport,
  setSundayReport,
  getCellGroups,
  getCellGroupMembers,
  getAllCellGroupMembers,
  addSundayProgramLog,
  getSundayProgramLogsByDate,
  updateSundayProgramLog,
  getDelightVisitors,
  getPeople,
  recordPersonSundayAttendance,
  getDepartmentChildren,
  subscribeSundayReportRiverKids,
  patchSundayReportRiverKids,
  patchSundayReportNameField,
  patchSundayReportCellAttendance,
} from '../services/firestore'
import DepartmentTabBar from '../components/DepartmentTabBar'
import LiveElapsedTimer from '../components/LiveElapsedTimer'
import ProgramConfirmSheet from '../components/ProgramConfirmSheet'

const MANUAL_ONLY_KEYS = [
  { key: 'nonCell', title: 'Non Cell' },
  { key: 'others', title: 'Others' },
  { key: 'riverKids', title: 'River Kids' },
]

const SECOND_WEEK_KEY = { key: 'secondWeekAttendeesNames', title: 'Second Week Attendees' }

const PASTORAL_KEY = { key: 'pastoralAttendees', title: 'Pastoral Attendees' }

/** Currently the only pastor on record — shown as a one-tap suggestion above the search/manual-add options */
const PASTORAL_ATTENDEE_SUGGESTIONS = ['Pastor Benson K Sunny']

/** Local-only UX: order for Done → scroll to next attendance section */
const ATTENDANCE_SECTION_ORDER = ['pastoral', 'cells', 'nonCell', 'others', 'riverKids', 'newComers', 'secondWeekAttendeesNames']


/** Map legacy report field → normalized cell name (lowercase, no spaces) */
const LEGACY_CELL_MAP = [
  ['olive', 'olive'],
  ['jordan', 'jordan'],
  ['bethany', 'bethany'],
  ['edenStream', 'edenstream'],
  ['bethel', 'bethel'],
  ['newCell1', 'newcell'],
  ['newCell1', 'newcell1'],
  ['children', 'children'],
]

function normalizeCellName(n) {
  return String(n || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
}

function migrateLegacyCellAttendance(report, cellGroups) {
  const byNorm = {}
  for (const g of cellGroups) {
    const id = g.id
    const nn = normalizeCellName(g.cellName)
    if (nn) byNorm[nn] = id
  }
  const sca = { ...(report.sundayCellAttendance && typeof report.sundayCellAttendance === 'object' ? report.sundayCellAttendance : {}) }
  for (const [legacyKey, norm] of LEGACY_CELL_MAP) {
    const arr = report[legacyKey]
    if (!Array.isArray(arr) || !arr.length) continue
    const gid = byNorm[norm]
    if (!gid) continue
    const names = arr.map((x) => String(x).trim()).filter(Boolean)
    sca[gid] = [...new Set([...(sca[gid] || []), ...names])]
  }
  return sca
}

function NameListSection({ title, names, canEdit, onAdd, onAddValue, onEdit, onRemove, suggestions = [], loadingSuggestions = false, suggestionsLabel = 'From D-Light this week — tap to add', people = null, searchPlaceholder = 'Search people directory…', showManualAdd = true, linkDirectory = null, onLink, linkedNames = null, duplicateNorms = null, className = '' }) {
  const [query, setQuery] = useState('')
  const [linkingIdx, setLinkingIdx] = useState(null)
  const [linkQuery, setLinkQuery] = useState('')
  const nameSet = useMemo(() => new Set((names || []).map(n => n.trim().toLowerCase())), [names])
  const unusedSuggestions = useMemo(
    () => suggestions.filter(s => !nameSet.has(s.trim().toLowerCase())),
    [suggestions, nameSet]
  )
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || !people) return []
    return people
      .filter((p) => p.name && p.name.trim().toLowerCase().includes(q) && !nameSet.has(p.name.trim().toLowerCase()))
      .slice(0, 8)
  }, [query, people, nameSet])
  const linkResults = useMemo(() => {
    const q = linkQuery.trim().toLowerCase()
    if (!q || !linkDirectory) return []
    return linkDirectory.filter((m) => m.name && m.name.trim().toLowerCase().includes(q)).slice(0, 8)
  }, [linkQuery, linkDirectory])

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${className || 'bg-white border-slate-200'}`}>
      <h3 className="font-semibold text-slate-800 mb-3">{title}</h3>

      {/* Search people directory */}
      {canEdit && people && (
        <div className="mb-3 relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
          />
          {searchResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
              {searchResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { onAddValue?.(p.name.trim()); setQuery('') }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex flex-col"
                >
                  <span className="text-slate-800 font-medium">{p.name}</span>
                  {p.phone && <span className="text-xs text-slate-400">{p.phone}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* D-Light visitor suggestions */}
      {canEdit && (loadingSuggestions || unusedSuggestions.length > 0) && (
        <div className="mb-3">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
            {suggestionsLabel}
          </p>
          {loadingSuggestions ? (
            <p className="text-xs text-slate-400">Loading visitors…</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {unusedSuggestions.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => onAddValue?.(name)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-medium hover:bg-indigo-100 transition-colors"
                >
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                    <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <ul className="space-y-2">
        {(names || []).map((name, idx) => {
          const isLinked = linkedNames?.has(String(name).trim().toLowerCase())
          const isDupe = duplicateNorms?.has(String(name).replace(/\s+/g, ' ').trim().toLowerCase())
          return (
          <li key={idx} className={linkDirectory ? 'relative' : undefined}>
            <div className="flex items-center gap-2">
              {canEdit ? (
                <>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => onEdit(idx, e.target.value)}
                    className={`flex-1 px-2 py-1.5 rounded border text-sm ${isDupe ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-300'}`}
                  />
                  {isDupe && (
                    <span className="text-xs font-bold text-red-600 whitespace-nowrap">Duplicate</span>
                  )}
                  {!isDupe && isLinked && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold whitespace-nowrap">
                      ✓ Linked
                    </span>
                  )}
                  {linkDirectory && (
                    <button
                      type="button"
                      onClick={() => { setLinkingIdx(linkingIdx === idx ? null : idx); setLinkQuery('') }}
                      className="text-indigo-600 hover:underline text-sm font-medium whitespace-nowrap"
                    >
                      {isLinked ? 'Re-link' : 'Link'}
                    </button>
                  )}
                  <button type="button" onClick={() => onRemove(idx)} className="text-red-600 hover:underline text-sm">
                    Remove
                  </button>
                </>
              ) : (
                <span className={isDupe ? 'text-red-600 font-semibold' : 'text-slate-800'}>{name || '—'}</span>
              )}
            </div>
            {linkDirectory && linkingIdx === idx && (
              <div className="mt-1.5 relative">
                <input
                  type="text"
                  value={linkQuery}
                  onChange={(e) => setLinkQuery(e.target.value)}
                  placeholder="Search directory or visitors to link…"
                  autoFocus
                  className="w-full px-3 py-2 rounded-lg border border-indigo-300 text-sm"
                />
                {linkResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                    {linkResults.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => { onLink?.(idx, m); setLinkingIdx(null); setLinkQuery('') }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex flex-col"
                      >
                        <span className="text-slate-800 font-medium">{m.name}</span>
                        <span className="text-xs text-indigo-500">{m.source === 'visitor' ? 'D-Light Visitor' : 'People Directory'}{m.phone ? ` · ${m.phone}` : ''}</span>
                      </button>
                    ))}
                  </div>
                )}
                {linkQuery.trim() && linkResults.length === 0 && (
                  <p className="text-xs text-slate-400 mt-1">No match found for "{linkQuery.trim()}".</p>
                )}
              </div>
            )}
          </li>
          )
        })}
        {canEdit && showManualAdd && (
          <li>
            <button type="button" onClick={onAdd} className="text-indigo-600 hover:underline text-sm font-medium">
              {people ? '+ Add name manually' : '+ Add person'}
            </button>
          </li>
        )}
      </ul>
    </div>
  )
}

function NonCellSection({ names, canEdit, people, cellMemberNames, onAddValue, onEdit, onRemove, duplicateNorms = null, className = '' }) {
  const [query, setQuery] = useState('')
  const nameSet = useMemo(() => new Set((names || []).map(n => n.trim().toLowerCase())), [names])
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return (people || [])
      .filter((p) => {
        if (!p.name) return false
        const lower = p.name.trim().toLowerCase()
        if (!lower.includes(q)) return false
        if (nameSet.has(lower)) return false
        if (cellMemberNames?.has(lower)) return false
        return true
      })
      .slice(0, 8)
  }, [query, people, nameSet, cellMemberNames])

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${className || 'bg-white border-slate-200'}`}>
      <h3 className="font-semibold text-slate-800 mb-3">Non Cell</h3>

      {canEdit && (
        <div className="mb-3 relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people directory…"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
          />
          {results.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
              {results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { onAddValue(p); setQuery('') }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex flex-col"
                >
                  <span className="text-slate-800 font-medium">{p.name}</span>
                  {p.phone && <span className="text-xs text-slate-400">{p.phone}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <ul className="space-y-2">
        {(names || []).map((name, idx) => {
          const isDupe = duplicateNorms?.has((name || '').replace(/\s+/g, ' ').trim().toLowerCase())
          return (
          <li key={idx} className="flex items-center gap-2">
            {canEdit ? (
              <>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => onEdit(idx, e.target.value)}
                  className={`flex-1 px-2 py-1.5 rounded border text-sm ${isDupe ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-300'}`}
                />
                {isDupe && <span className="text-xs font-bold text-red-600 whitespace-nowrap">Duplicate</span>}
                <button type="button" onClick={() => onRemove(idx)} className="text-red-600 hover:underline text-sm">
                  Remove
                </button>
              </>
            ) : (
              <span className={isDupe ? 'text-red-600 font-semibold' : 'text-slate-800'}>{name || '—'}</span>
            )}
          </li>
        )})}
        {(names || []).length === 0 && !canEdit && (
          <li className="text-sm text-slate-400">No names added.</li>
        )}
      </ul>
    </div>
  )
}

/** Local-only: wrap attendance blocks with Done/Undo, scroll target, completed/active styling */
function AttendanceSectionShell({
  sectionRef,
  completed,
  isActive,
  canManage,
  onDone,
  onUndo,
  children,
}) {
  const isCompleted = !!completed
  const shellClass = isCompleted
    ? 'bg-emerald-50/90 border-emerald-300'
    : isActive
      ? 'bg-indigo-50/50 border-indigo-400 ring-2 ring-indigo-200/90'
      : 'bg-white border-slate-200'

  return (
    <div ref={sectionRef} className={`rounded-xl border p-4 shadow-sm transition-colors scroll-mt-4 ${shellClass}`}>
      {children}
      {canManage && (
        <div className="mt-4 flex justify-end border-t border-slate-200/70 pt-3">
          <button
            type="button"
            onClick={() => (isCompleted ? onUndo() : onDone())}
            className="px-4 min-h-[44px] py-2 rounded-lg text-sm font-medium border border-slate-300 bg-white hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 text-slate-800 transition-colors"
          >
            {isCompleted ? 'Undo' : 'Done'}
          </button>
        </div>
      )}
    </div>
  )
}

const BULK_SECTIONS = [
  { key: 'pastoral',              label: 'Pastoral'        },
  { key: 'others',                label: 'Others'          },
  { key: 'nonCell',               label: 'Non-Cell'        },
  { key: 'riverKids',             label: 'River Kids'      },
  { key: 'newComers',             label: 'New Comers'      },
  { key: 'secondWeek',            label: '2nd Week'        },
]

function scorePerson(name, words) {
  const lower = name.toLowerCase()
  const nameWords = lower.split(/\s+/)
  let score = 0
  for (const w of words) {
    if (lower.includes(w)) score += 2
    if (nameWords.some(nw => nw.startsWith(w))) score += 1
  }
  return score
}

function BulkImportPanel({ isOpen, onClose, selectedDate, report, updateReport, cellGroups, searchPool, cellMemberMap, rkKidsNorms, userEmail }) {
  const [step, setStep] = useState('setup')
  const [pastedText, setPastedText] = useState('')
  const [lines, setLines] = useState([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [saving, setSaving] = useState(false)
  // Per-line section selection (chosen during review)
  const [lineSection, setLineSection] = useState('others')
  const [lineCellId, setLineCellId] = useState('')
  // Tracks norms added this session (ref for synchronous access in advance())
  const addedNormsRef = useRef(new Set())

  if (!isOpen) return null

  // Collapses ALL unicode whitespace (including non-breaking spaces from Excel) to a single space
  const nn = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase()

  // Norms across ALL sections — used for duplicate detection
  const buildExistingNorms = () => {
    const s = new Set()
    const addArr = (arr) => (arr || []).forEach(n => { const k = nn(n); if (k) s.add(k) })
    addArr(report?.pastoralAttendees)
    addArr(report?.others)
    addArr(report?.nonCell)
    addArr(report?.riverKids)
    addArr(report?.newComers)
    addArr(report?.secondWeekAttendeesNames)
    Object.values(report?.sundayCellAttendance || {}).forEach(arr => addArr(arr))
    for (const n of addedNormsRef.current) s.add(n)
    return s
  }

  const topSuggestion = (raw) => {
    if (!nn(raw)) return null
    const words = nn(raw).split(' ').filter(Boolean)
    return searchPool
      .map(p => ({ ...p, score: scorePerson(p.name, words) }))
      .filter(p => p.score > 0)
      .sort((a, b) => b.score - a.score)[0] || null
  }

  const autoSuggest = (raw) => {
    if (!nn(raw)) return []
    const words = nn(raw).split(' ').filter(Boolean)
    return searchPool
      .map(p => ({ ...p, score: scorePerson(p.name, words) }))
      .filter(p => p.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
  }

  const searchPeople = (q) => {
    if (!nn(q)) return []
    const lower = nn(q)
    return searchPool.filter(p => nn(p.name).includes(lower)).slice(0, 8)
  }

  // Auto-detect section: River Kids registry → riverKids, cell member → cell, else → others
  const detectSection = (personName) => {
    const key = nn(personName)
    if (rkKidsNorms?.has(key)) return { section: 'riverKids', cellId: '' }
    const entry = cellMemberMap.get(key)
    if (entry) return { section: 'cell', cellId: entry.cellId }
    return { section: 'others', cellId: '' }
  }

  const resolveAlreadyPresent = (currentLines, startIdx, existingNorms) => {
    let updated = currentLines
    for (let i = startIdx; i < updated.length; i++) {
      if (updated[i].status !== 'pending') continue
      const rawNorm = nn(updated[i].raw)
      const top = topSuggestion(updated[i].raw)
      const topNorm = top ? nn(top.name) : null
      const allSuggs = autoSuggest(updated[i].raw)
      const allSuggsAlready = allSuggs.length > 0 && allSuggs.every(p => existingNorms.has(nn(p.name)))
      const isAlready = existingNorms.has(rawNorm)
        || (topNorm && existingNorms.has(topNorm))
        || allSuggsAlready
      if (isAlready) {
        updated = updated.map((l, idx) => idx === i
          ? { ...l, status: 'already', confirmedName: top?.name || updated[i].raw }
          : l)
      } else {
        return { updated, nextIdx: i }
      }
    }
    return { updated, nextIdx: -1 }
  }

  const gotoLine = (updatedLines, fromIdx) => {
    const existingNorms = buildExistingNorms()
    const { updated, nextIdx } = resolveAlreadyPresent(updatedLines, fromIdx + 1, existingNorms)
    setLines(updated)
    if (nextIdx === -1) { setStep('done') }
    else {
      setCurrentIdx(nextIdx)
      setSearchQuery('')
      // Auto-detect section for the new line
      const top = topSuggestion(updated[nextIdx].raw)
      if (top) {
        const det = detectSection(top.name)
        setLineSection(det.section)
        setLineCellId(det.cellId)
      } else {
        setLineSection('others')
        setLineCellId('')
      }
    }
  }

  const handleParse = () => {
    addedNormsRef.current = new Set()
    const existingNorms = buildExistingNorms()
    const raw = pastedText.split('\n').map(l => l.trim()).filter(Boolean)
      .map(r => ({ raw: r, status: 'pending', confirmedName: null }))
    if (!raw.length) return
    const { updated, nextIdx } = resolveAlreadyPresent(raw, 0, existingNorms)
    setLines(updated)
    setSearchQuery('')
    if (nextIdx === -1) { setStep('done') }
    else {
      setCurrentIdx(nextIdx)
      setStep('review')
      const top = topSuggestion(updated[nextIdx].raw)
      if (top) {
        const det = detectSection(top.name)
        setLineSection(det.section)
        setLineCellId(det.cellId)
      } else {
        setLineSection('others')
        setLineCellId('')
      }
    }
  }

  // Called when user taps a suggestion — auto-detects section from the tapped person
  const handleSuggestionPick = (person) => {
    if (saving) return
    const det = detectSection(person.name)
    setLineSection(det.section)
    setLineCellId(det.cellId)
    handleConfirmWithSection(person, det.section, det.cellId)
  }

  const handleConfirmWithSection = async (person, sec, cid) => {
    if (saving || (sec === 'cell' && !cid)) return
    setSaving(true)
    const name = person.name.trim()
    const norm = nn(name)
    try {
      if (sec === 'pastoral') {
        const existing = report?.pastoralAttendees || []
        if (!existing.some(n => nn(n) === norm)) {
          const next = [...existing, name]
          updateReport({ pastoralAttendees: next })
          await patchSundayReportNameField(selectedDate, 'pastoralAttendees', next, userEmail)
        }
      } else if (sec === 'others') {
        const existing = report?.others || []
        if (!existing.some(n => nn(n) === norm)) {
          const next = [...existing, name]
          updateReport({ others: next })
          await patchSundayReportNameField(selectedDate, 'others', next, userEmail)
        }
      } else if (sec === 'nonCell') {
        const existing = report?.nonCell || []
        if (!existing.some(n => nn(n) === norm)) {
          const next = [...existing, name]
          updateReport({ nonCell: next })
          await patchSundayReportNameField(selectedDate, 'nonCell', next, userEmail)
        }
      } else if (sec === 'riverKids') {
        const existing = report?.riverKids || []
        if (!existing.some(n => nn(n) === norm)) {
          const next = [...existing, name]
          updateReport({ riverKids: next })
          await patchSundayReportRiverKids(selectedDate, next, userEmail)
        }
      } else if (sec === 'newComers') {
        const existing = report?.newComers || []
        if (!existing.some(n => nn(n) === norm)) {
          const next = [...existing, name]
          updateReport({ newComers: next })
          await patchSundayReportNameField(selectedDate, 'newComers', next, userEmail)
        }
      } else if (sec === 'secondWeek') {
        const existing = report?.secondWeekAttendeesNames || []
        if (!existing.some(n => nn(n) === norm)) {
          const next = [...existing, name]
          updateReport({ secondWeekAttendeesNames: next })
          await patchSundayReportNameField(selectedDate, 'secondWeekAttendeesNames', next, userEmail)
        }
      } else if (sec === 'cell' && cid) {
        const sca = { ...(report?.sundayCellAttendance || {}) }
        const existing = sca[cid] || []
        if (!existing.some(n => nn(String(n)) === norm)) {
          sca[cid] = [...existing, name]
          updateReport({ sundayCellAttendance: sca })
          await patchSundayReportCellAttendance(selectedDate, cid, sca[cid], userEmail)
        }
      }
    } catch { /* optimistic update already applied */ }
    addedNormsRef.current.add(norm)
    addedNormsRef.current.add(nn(lines[currentIdx]?.raw || ''))
    const updated = lines.map((l, i) => i === currentIdx ? { ...l, status: 'confirmed', confirmedName: name } : l)
    setSaving(false)
    gotoLine(updated, currentIdx)
  }

  const handleSkip = () => {
    const updated = lines.map((l, i) => i === currentIdx ? { ...l, status: 'skipped' } : l)
    gotoLine(updated, currentIdx)
  }

  const handleReset = () => {
    setStep('setup'); setPastedText(''); setLines([])
    setCurrentIdx(0); setSearchQuery(''); setSaving(false)
    setLineSection('others'); setLineCellId('')
    addedNormsRef.current = new Set()
  }

  const confirmed  = lines.filter(l => l.status === 'confirmed').length
  const already    = lines.filter(l => l.status === 'already').length
  const skipped    = lines.filter(l => l.status === 'skipped').length
  const done       = confirmed + already + skipped
  const current    = lines[currentIdx]
  const existingNorms  = buildExistingNorms()
  const suggestions    = current ? autoSuggest(current.raw) : []
  const manualResults  = searchPeople(searchQuery)
  const progress   = lines.length ? (done / lines.length) * 100 : 0

  // Name of the currently selected cell group (for display)
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex flex-col justify-end"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-t-3xl max-h-[94vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="font-bold text-slate-800 text-lg">Bulk Import</h2>
            <p className="text-[11px] text-amber-600 font-semibold tracking-wide">FOUNDER · HISTORICAL RECORDS</p>
          </div>
          <button type="button" onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 text-xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-5">

          {/* ── STEP 1: SETUP ── */}
          {step === 'setup' && (
            <div className="space-y-5">
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">Date</span>
                <span className="text-sm font-bold text-slate-800">{selectedDate}</span>
              </div>

              <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
                <p className="text-xs font-semibold text-indigo-700 mb-1">Paste all names together</p>
                <p className="text-xs text-indigo-500">Cell members, others, non-cell — mix them all. You'll assign each person to the right section one by one during review.</p>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Paste Names (one per line)</p>
                <textarea
                  value={pastedText}
                  onChange={e => setPastedText(e.target.value)}
                  placeholder={"John Smith\nSarah Johnson\nMichael Brown\n..."}
                  rows={10}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono resize-none"
                />
                <p className="text-xs text-slate-400 mt-1">
                  {pastedText.split('\n').filter(l => l.trim()).length} names detected
                </p>
              </div>

              <button type="button" onClick={handleParse} disabled={!pastedText.trim()}
                className="w-full py-3 rounded-2xl bg-indigo-600 text-white font-bold text-sm disabled:opacity-40 active:bg-indigo-700 transition-colors">
                Parse Names →
              </button>
            </div>
          )}

          {/* ── STEP 2: REVIEW ── */}
          {step === 'review' && current && (
            <div className="space-y-4">
              {/* Back + progress */}
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setStep('setup')}
                  className="text-indigo-600 text-sm font-semibold shrink-0">← Back</button>
                <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div className="bg-indigo-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-xs text-slate-500 font-semibold shrink-0">{done + 1} / {lines.length}</span>
              </div>

              {/* Current raw name */}
              <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1">Pasted Name</p>
                <p className="font-bold text-slate-800 text-base">"{current.raw}"</p>
              </div>

              {/* Section picker for this name */}
              <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Adding to</p>
                <div className="flex gap-1.5 flex-wrap">
                  {BULK_SECTIONS.map(s => (
                    <button key={s.key} type="button"
                      onClick={() => { setLineSection(s.key); setLineCellId('') }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${lineSection === s.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                      {s.label}
                    </button>
                  ))}
                  {cellGroups.map(cg => {
                    const isActive = lineSection === 'cell' && lineCellId === cg.id
                    return (
                      <button key={cg.id} type="button"
                        onClick={() => { setLineSection('cell'); setLineCellId(cg.id) }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${isActive ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                        {cg.cellName}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Suggestions — always visible */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Suggestions — tap to confirm</p>
                {suggestions.length > 0 ? (
                  <div className="space-y-2">
                    {suggestions.map(p => {
                      const det = detectSection(p.name)
                      const cellLabel = det.section === 'cell' ? cellGroups.find(cg => cg.id === det.cellId)?.cellName : null
                      return (
                        <button key={p.id} type="button"
                          onClick={() => handleSuggestionPick(p)}
                          disabled={saving}
                          className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 border transition-all bg-white border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 active:scale-[.98] disabled:opacity-50">
                          <span className="w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center shrink-0 bg-indigo-100 text-indigo-600">
                            {(p.name || '?')[0].toUpperCase()}
                          </span>
                          <span className="flex-1 min-w-0 text-left">
                            <span className="text-sm font-semibold text-slate-800 block">{p.name}</span>
                            {cellLabel && <span className="text-[10px] text-indigo-500 font-medium">{cellLabel}</span>}
                          </span>
                          <span className="text-xs font-bold text-indigo-500 shrink-0">Pick →</span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 text-center py-2">No close matches — use search below</p>
                )}
              </div>

              {/* Manual search — always visible */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Search Database</p>
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Type any part of the name…"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                {manualResults.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {manualResults.map(p => {
                      const isAlready = existingNorms.has(p.name.toLowerCase().trim())
                      return (
                        <button key={p.id} type="button"
                          onClick={() => { if (!isAlready) handleSuggestionPick(p) }}
                          disabled={saving || isAlready}
                          className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3 border transition-all
                            ${isAlready ? 'bg-slate-50 border-slate-100 cursor-default opacity-60'
                              : 'bg-white border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 active:scale-[.98] disabled:opacity-50'}`}>
                          <span className={`w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center shrink-0
                            ${isAlready ? 'bg-slate-100 text-slate-400' : 'bg-emerald-100 text-emerald-600'}`}>
                            {(p.name || '?')[0].toUpperCase()}
                          </span>
                          <span className="flex-1 text-sm font-semibold text-slate-800 text-left">{p.name}</span>
                          {isAlready
                            ? <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">Already added</span>
                            : <span className="text-xs font-bold text-emerald-500 shrink-0">Pick →</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
                {searchQuery.trim() && manualResults.length === 0 && (
                  <p className="text-xs text-slate-400 mt-2 text-center">No match found in database</p>
                )}
              </div>

              <button type="button"
                onClick={() => handleConfirmWithSection({ name: current.raw }, lineSection, lineCellId)}
                disabled={saving || (lineSection === 'cell' && !lineCellId)}
                className="w-full py-3 rounded-2xl bg-slate-700 text-white font-bold text-sm disabled:opacity-40 active:bg-slate-800 transition-colors">
                Add "{current.raw}" as-is →
              </button>

              <button type="button" onClick={handleSkip} disabled={saving}
                className="w-full py-3 rounded-2xl border border-slate-200 text-slate-500 font-semibold text-sm hover:bg-slate-50 disabled:opacity-40 transition-colors">
                Skip this name →
              </button>
            </div>
          )}

          {/* ── STEP 3: DONE ── */}
          {step === 'done' && (
            <div className="py-8 text-center space-y-6">
              <div className="text-6xl">✅</div>
              <div>
                <p className="font-bold text-slate-800 text-xl mb-1">Import Complete!</p>
                <p className="text-sm text-slate-400">{selectedDate}</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3">
                  <p className="text-2xl font-bold text-emerald-600">{confirmed}</p>
                  <p className="text-[10px] text-emerald-500 font-semibold mt-1">Added</p>
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3">
                  <p className="text-2xl font-bold text-blue-500">{already}</p>
                  <p className="text-[10px] text-blue-400 font-semibold mt-1">Already Present</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
                  <p className="text-2xl font-bold text-slate-400">{skipped}</p>
                  <p className="text-[10px] text-slate-400 font-semibold mt-1">Skipped</p>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={handleReset}
                  className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors">
                  Import More
                </button>
                <button type="button" onClick={onClose}
                  className="flex-1 py-3 rounded-2xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 transition-colors">
                  Done
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

function RiverKidsRegistrySection({ kids, markedNames, canEdit, onToggle, duplicateNorms = null }) {
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const filtered = q ? kids.filter(k => (k.name || '').toLowerCase().includes(q)) : kids
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-800">River Kids</h3>
        <span className="text-xs font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
          {markedNames.filter(Boolean).length} present
        </span>
      </div>
      {canEdit && (
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search Sunday School kids…"
          className="w-full mb-3 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      )}
      <ul className="space-y-1.5">
        {filtered.map(kid => {
          const norm = kid.name.trim().toLowerCase()
          const isPresent = markedNames.some(n => (n || '').trim().toLowerCase() === norm)
          const isDupe = isPresent && duplicateNorms?.has(norm)
          return (
            <li key={kid.id} className="flex items-center gap-3 py-1">
              <span className={`flex-1 text-sm ${isDupe ? 'text-red-600 font-semibold' : 'text-slate-800'}`}>
                {kid.name}{isDupe && <span className="ml-1.5 text-xs font-bold text-red-500">Duplicate</span>}
              </span>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => onToggle(kid.name, isPresent)}
                  className={`px-3 min-h-[36px] py-1 rounded-xl text-xs font-semibold transition-all active:scale-95 shrink-0 ${isPresent ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  {isPresent ? 'Present' : 'Absent'}
                </button>
              ) : (
                <span className={`px-3 py-1 rounded-xl text-xs font-semibold shrink-0 ${isPresent ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                  {isPresent ? 'Present' : 'Absent'}
                </span>
              )}
            </li>
          )
        })}
        {filtered.length === 0 && (
          <li className="text-sm text-slate-400 py-2">
            {search ? 'No kids match your search.' : 'No kids in Sunday School. Add them via River Kids → Kids Register.'}
          </li>
        )}
      </ul>
    </div>
  )
}

function upcomingSunday() {
  const today = new Date()
  const daysUntil = today.getDay() === 0 ? 0 : 7 - today.getDay()
  const d = new Date(today)
  d.setDate(today.getDate() + daysUntil)
  return format(d, 'yyyy-MM-dd')
}

export default function SundayReport({ embedded = false }) {
  const { userProfile, canManageDepartment, isDepartmentHead, isSundayMinistryDirector, isFounder } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [selectedDate, setSelectedDate] = useState(() => searchParams.get('date') || upcomingSunday())
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cellGroups, setCellGroups] = useState([])
  const [expandedCellId, setExpandedCellId] = useState(null)
  const [membersForCell, setMembersForCell] = useState([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [programLogs, setProgramLogs] = useState([])
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [showSavedModal, setShowSavedModal] = useState(false)
  const [savedSummary, setSavedSummary] = useState(null)
  const [showProgramConfirm, setShowProgramConfirm] = useState(false)
  const [dlightSuggestions, setDlightSuggestions] = useState([])
  const [loadingDlight, setLoadingDlight] = useState(false)
  const [secondWeekSuggestions, setSecondWeekSuggestions] = useState([])
  const [loadingSecondWeekSuggestions, setLoadingSecondWeekSuggestions] = useState(false)
  const [peopleDirectory, setPeopleDirectory] = useState([])
  const [delightVisitorsAll, setDelightVisitorsAll] = useState([])
  const [cellMemberNames, setCellMemberNames] = useState(new Set())
  const [allCellMembers, setAllCellMembers] = useState([])
  const [editingLogIdx, setEditingLogIdx] = useState(null)
  const [editingLogTime, setEditingLogTime] = useState('')
  const [editingProgramIdx, setEditingProgramIdx] = useState(null)
  const [editingProgramName, setEditingProgramName] = useState('')
  const [rkSchoolKids, setRkSchoolKids] = useState([])
  const [allRkKids, setAllRkKids] = useState([])
  const [showBulkImport, setShowBulkImport] = useState(false)
  /** Local-only: which attendance sections are marked done (no Firestore) */
  const [completedSections, setCompletedSections] = useState({})

  const cellsSectionRef = useRef(null)
  const pastoralSectionRef = useRef(null)
  const newComersSectionRef = useRef(null)
  const othersSectionRef = useRef(null)
  const nonCellSectionRef = useRef(null)
  const secondWeekSectionRef = useRef(null)
  const riverKidsSectionRef = useRef(null)

  const sectionRefById = useMemo(
    () => ({
      cells: cellsSectionRef,
      pastoral: pastoralSectionRef,
      newComers: newComersSectionRef,
      others: othersSectionRef,
      nonCell: nonCellSectionRef,
      secondWeekAttendeesNames: secondWeekSectionRef,
      riverKids: riverKidsSectionRef,
    }),
    []
  )

  const canEdit = isSundayMinistryDirector
  const canEditEffective = canEdit

  const summaryComputed = useMemo(() => {
    const cellRows = (cellGroups || [])
      .map((g) => {
        const names = (report?.sundayCellAttendance?.[g.id] || []).filter(Boolean)
        return { id: g.id, name: g.cellName || 'Unnamed', count: names.length, names }
      })
      .filter((r) => r.count > 0)
    const othersNames       = (report?.others || []).filter(Boolean)
    const nonCellNames      = (report?.nonCell || []).filter(Boolean)
    const secondWeekNames   = (report?.secondWeekAttendeesNames || []).filter(Boolean)
    const pastoralNames     = (report?.pastoralAttendees || []).filter(Boolean)
    const riverKidsNames    = (report?.riverKids || []).filter(Boolean)
    const newcomersNames    = dlightSuggestions.filter(Boolean)
    const othersCount       = othersNames.length
    const nonCellCount      = nonCellNames.length
    const secondWeekCount   = secondWeekNames.length
    const newcomersCount    = newcomersNames.length
    const pastoralCount     = pastoralNames.length
    const riverKidsCount    = riverKidsNames.length
    const sundaySchool      = Number(report?.summary?.sundaySchool) || 0
    const cellTotal         = cellRows.reduce((s, r) => s + r.count, 0)
    const totalAdults       = cellTotal + othersCount + nonCellCount + secondWeekCount + newcomersCount + pastoralCount
    const total             = totalAdults + sundaySchool + riverKidsCount
    return {
      cellRows, othersCount, othersNames, nonCellCount, nonCellNames, secondWeekCount, secondWeekNames,
      newcomersCount, newcomersNames, pastoralCount, pastoralNames, riverKidsCount, riverKidsNames,
      sundaySchool, totalAdults, total,
    }
  }, [cellGroups, report, dlightSuggestions])

  // Names that appear in 2+ different sections — used to show red duplicate warning
  const duplicateNorms = useMemo(() => {
    const sectionSets = new Map()
    const add = (sectionKey, name) => {
      const key = (name || '').replace(/\s+/g, ' ').trim().toLowerCase()
      if (!key) return
      if (!sectionSets.has(key)) sectionSets.set(key, new Set())
      sectionSets.get(key).add(sectionKey)
    }
    for (const [cellId, names] of Object.entries(report?.sundayCellAttendance || {})) {
      for (const n of (names || [])) add(`cell:${cellId}`, n)
    }
    for (const n of (report?.others || [])) add('others', n)
    for (const n of (report?.nonCell || [])) add('nonCell', n)
    for (const n of (report?.pastoralAttendees || [])) add('pastoral', n)
    for (const n of (report?.riverKids || [])) add('riverKids', n)
    for (const n of (report?.secondWeekAttendeesNames || [])) add('secondWeek', n)
    for (const n of dlightSuggestions) add('newComers', n)
    const dupes = new Set()
    for (const [key, sections] of sectionSets) {
      if (sections.size > 1) dupes.add(key)
    }
    return dupes
  }, [report, dlightSuggestions])

  /** First incomplete attendance section = “active” highlight (editors only) */
  const activeSectionId = useMemo(() => {
    if (!canEditEffective) return null
    return ATTENDANCE_SECTION_ORDER.find((id) => !completedSections[id]) ?? null
  }, [canEditEffective, completedSections])

  const attendanceProgressTotal = ATTENDANCE_SECTION_ORDER.length
  const attendanceProgressDone = useMemo(
    () => ATTENDANCE_SECTION_ORDER.filter((id) => completedSections[id]).length,
    [completedSections]
  )
  const attendanceProgressPct = attendanceProgressTotal
    ? Math.round((attendanceProgressDone / attendanceProgressTotal) * 100)
    : 0

  useEffect(() => {
    const dateFromUrl = searchParams.get('date')
    if (dateFromUrl && dateFromUrl !== selectedDate) {
      setSelectedDate(dateFromUrl)
    }
  }, [searchParams])

  useEffect(() => {
    setCompletedSections({})
  }, [selectedDate])

  const handleAttendanceDone = useCallback(
    (sectionId) => {
      setCompletedSections((prev) => ({ ...prev, [sectionId]: true }))
      const idx = ATTENDANCE_SECTION_ORDER.indexOf(sectionId)
      const nextId = ATTENDANCE_SECTION_ORDER[idx + 1]
      const nextEl = nextId ? sectionRefById[nextId]?.current : null
      if (nextEl) {
        requestAnimationFrame(() => {
          nextEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
      }
    },
    [sectionRefById]
  )

  const handleAttendanceUndo = useCallback((sectionId) => {
    setCompletedSections((prev) => ({ ...prev, [sectionId]: false }))
  }, [])

  // Load the People's Directory + all D-Light visitors once — together they're the base
  // of both the Non Cell search pool and the Others-linking pool (othersLinkDirectory).
  const loadDirectoryData = useCallback(() => {
    return Promise.all([
      getPeople().then(setPeopleDirectory).catch(() => setPeopleDirectory([])),
      getDelightVisitors().then(setDelightVisitorsAll).catch(() => setDelightVisitorsAll([])),
    ])
  }, [])

  useEffect(() => {
    loadDirectoryData()
  }, [loadDirectoryData])

  // On tab focus: also refresh the directory data, so a visitor/person just added in
  // another tab shows up in the Non Cell / Others-link search without a full page reload.
  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === 'visible') loadDirectoryData()
    }
    document.addEventListener('visibilitychange', handleVisible)
    return () => document.removeEventListener('visibilitychange', handleVisible)
  }, [loadDirectoryData])

  // Build the set of names already belonging to any cell — excluded from Non Cell search results.
  // Single collection-group query across every cell's members subcollection, rather than one
  // getCellGroupMembers() call per cell in a Promise.all — a single denied/failed cell in that
  // approach would blank the whole exclusion set and let every cell member back into the search.
  useEffect(() => {
    getAllCellGroupMembers()
      .then((list) => {
        const active = (list || []).filter((m) => m.status !== 'inactive' && m.name)
        const set = new Set(active.map((m) => String(m.name).trim().toLowerCase()))
        setCellMemberNames(set)
        setAllCellMembers(active)
      })
      .catch(() => { setCellMemberNames(new Set()); setAllCellMembers([]) })
  }, [])

  useEffect(() => {
    if (!expandedCellId) {
      setMembersForCell([])
      return
    }
    setLoadingMembers(true)
    getCellGroupMembers(expandedCellId)
      .then((list) => setMembersForCell((list || []).filter((m) => m.status !== 'inactive')))
      .catch(() => setMembersForCell([]))
      .finally(() => setLoadingMembers(false))
  }, [expandedCellId])

  // Enrich membersForCell: if a member has a visitorId, swap in the canonical name from
  // visitors/people directory so attendance is stored under the full registered name.
  const enrichedMembersForCell = useMemo(() => {
    const visitorMap = new Map(delightVisitorsAll.map(v => [v.id, v.name]))
    const peopleMap  = new Map(peopleDirectory.map(p => [p.id, p.name]))
    return membersForCell.map(m => {
      const canonical = m.visitorId
        ? (visitorMap.get(m.visitorId) || peopleMap.get(m.visitorId) || m.name)
        : m.name
      return { ...m, name: canonical, originalName: m.name }
    })
  }, [membersForCell, delightVisitorsAll, peopleDirectory])

  // Fetch D-Light visitors for the week of selectedDate (attendedDate within 7 days before the Sunday),
  // plus the 4 weeks before that (candidates for "Second Week Attendees")
  useEffect(() => {
    setLoadingDlight(true)
    setLoadingSecondWeekSuggestions(true)
    const sunday = new Date(selectedDate + 'T00:00:00')
    const weekAgo = new Date(sunday)
    weekAgo.setDate(sunday.getDate() - 6)
    const priorWeeksEnd = new Date(weekAgo)
    priorWeeksEnd.setDate(weekAgo.getDate() - 1)
    const priorWeeksStart = new Date(weekAgo)
    priorWeeksStart.setDate(weekAgo.getDate() - 28)
    getDelightVisitors()
      .then(visitors => {
        const thisWeek = visitors.filter(v => {
          if (!v.attendedDate) return false
          const d = new Date(v.attendedDate + 'T00:00:00')
          return d >= weekAgo && d <= sunday
        })
        const names = [...new Set(thisWeek.map(v => v.name).filter(Boolean))]
        setDlightSuggestions(names)

        const priorWeeks = visitors.filter(v => {
          if (!v.attendedDate) return false
          const d = new Date(v.attendedDate + 'T00:00:00')
          return d >= priorWeeksStart && d <= priorWeeksEnd
        })
        const priorNames = [...new Set(priorWeeks.map(v => v.name).filter(Boolean))]
        setSecondWeekSuggestions(priorNames)
      })
      .catch(() => { setDlightSuggestions([]); setSecondWeekSuggestions([]) })
      .finally(() => {
        setLoadingDlight(false)
        setLoadingSecondWeekSuggestions(false)
      })
  }, [selectedDate])

  // Single master load — clears stale data immediately so previous date never bleeds through
  useEffect(() => {
    setLoading(true)
    setReport(null)
    setProgramLogs([])
    setShowProgramConfirm(false)
    Promise.all([
      getSundayReport(selectedDate),
      getCellGroups('Cell'),
      getSundayProgramLogsByDate(selectedDate),
    ])
      .then(([r, groups, logs]) => {
        const active = (groups || []).filter((g) => g.status !== 'inactive')
        setCellGroups(active)
        let next = r || null
        if (next) {
          const hasSca =
            next.sundayCellAttendance &&
            typeof next.sundayCellAttendance === 'object' &&
            Object.keys(next.sundayCellAttendance).length > 0
          next = {
            ...next,
            sundayCellAttendance: hasSca ? next.sundayCellAttendance : migrateLegacyCellAttendance(next, active),
            sundayMinistryTeam: [],
          }
        }
        setReport(next)
        setProgramLogs(logs || [])
      })
      .catch(() => { setReport(null); setProgramLogs([]) })
      .finally(() => setLoading(false))
  }, [selectedDate])

  const refreshAll = useCallback(() => {
    setLoading(true)
    setCompletedSections({})
    Promise.all([
      getSundayReport(selectedDate),
      getCellGroups('Cell'),
      getSundayProgramLogsByDate(selectedDate),
    ])
      .then(([r, groups, logs]) => {
        const active = (groups || []).filter((g) => g.status !== 'inactive')
        setCellGroups(active)
        let next = r || null
        if (next) {
          const hasSca = next.sundayCellAttendance && typeof next.sundayCellAttendance === 'object' && Object.keys(next.sundayCellAttendance).length > 0
          next = { ...next, sundayCellAttendance: hasSca ? next.sundayCellAttendance : migrateLegacyCellAttendance(next, active), sundayMinistryTeam: [] }
        }
        setReport(next)
        setProgramLogs(logs || [])
      })
      .catch(() => { setReport(null); setProgramLogs([]) })
      .finally(() => setLoading(false))
  }, [selectedDate])

  // On tab focus: only refresh program logs (not the full report — that would wipe unsaved attendance edits)
  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        getSundayProgramLogsByDate(selectedDate).then(setProgramLogs).catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', handleVisible)
    return () => document.removeEventListener('visibilitychange', handleVisible)
  }, [selectedDate])

  // Load River Kids registry (one-time, no date dependency)
  useEffect(() => {
    getDepartmentChildren('River Kids').then(kids => {
      const active = kids.filter(k => k.active !== false)
      setAllRkKids(active)
      setRkSchoolKids(active.filter(k => k.group === 'sunday-school'))
    }).catch(() => {})
  }, [])

  // Real-time sync: keep report.riverKids up to date when River Kids director makes changes
  useEffect(() => {
    if (!selectedDate) return
    return subscribeSundayReportRiverKids(selectedDate, (names) => {
      setReport(prev => prev ? { ...prev, riverKids: names } : prev)
    })
  }, [selectedDate])

  const updateReport = (patch) => setReport((prev) => (prev ? { ...prev, ...patch } : { ...patch }))

  const handleSave = async () => {
    if (!report || !canEdit) return
    // Firestore queues writes locally when offline and resolves optimistically — the button
    // would otherwise look like it worked with no error, while the write only reaches the
    // server once connectivity returns. Warn up front instead of a silent false "success".
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const proceed = window.confirm(
        "You appear to be offline. This save will be queued on your device and sync automatically once you're back online — but if this device/app closes before that happens, the save will be lost. Continue?"
      )
      if (!proceed) return
    }
    setSaving(true)
    try {
      const { cellRows, othersCount, nonCellCount, secondWeekCount, newcomersCount, riverKidsCount, sundaySchool, totalAdults, total } = summaryComputed
      const cellAttendanceCount = cellRows.reduce((s, r) => s + r.count, 0)

      const cellBreakdown = Object.fromEntries(cellRows.map((r) => [r.name, r.count]))

      const computedSummary = {
        ...report.summary,
        cellAttendance: cellAttendanceCount,
        othersCount,
        nonCellCount,
        newcomers: newcomersCount,
        secondWeekAttendees: secondWeekCount,
        riverKids: riverKidsCount,
        sundaySchool,
        totalAdults,
        totalAttendance: total,
      }

      // Only include logs for items currently in programList — orphaned logs
      // (from items removed via ✕) must not pollute the saved programTimings.
      const activeNames = new Set(
        (report?.programList || []).map((item) => String(item.programName || '').trim().toLowerCase())
      )
      const timings = programLogs
        .filter((log) => activeNames.has(String(log.programName || '').trim().toLowerCase()))
        .map((log) => {
          const t = log.startTime instanceof Date ? log.startTime : log.startTime?.toDate?.() ?? null
          return { programName: log.programName, startTime: t ? t.toISOString() : null }
        })
        .filter((x) => x.startTime)

      const scrollY = window.scrollY
      await setSundayReport(
        selectedDate,
        {
          ...report,
          summary: computedSummary,
          cellBreakdown,
          programList: report?.programList || [],
          programTimings: timings,
          sundayMinistryTeam: [],
        },
        userProfile?.email || 'unknown'
      )
      setReport((prev) => (prev ? { ...prev, summary: computedSummary } : prev))
      requestAnimationFrame(() => window.scrollTo(0, scrollY))
      setSavedSummary({ ...summaryComputed, date: selectedDate })
      setShowSavedModal(true)
    } catch (err) {
      console.error(err)
      alert('Failed to save')
    }
    setSaving(false)
  }

  const toggleMemberAttendance = (cellId, memberName, originalName = null) => {
    const name = String(memberName || '').trim()
    if (!name || !canEditEffective || completedSections.cells) return
    const sca = { ...(report?.sundayCellAttendance || {}) }
    const list = [...(sca[cellId] || [])]
    const i = list.indexOf(name)
    const origStored = originalName && originalName !== name ? String(originalName).trim() : null
    const origIdx = origStored ? list.indexOf(origStored) : -1
    if (i >= 0) {
      list.splice(i, 1)
    } else if (origIdx >= 0) {
      // Old short name in list — remove it (tap deselects; next tap will add canonical name)
      list.splice(origIdx, 1)
    } else {
      list.push(name)
    }
    sca[cellId] = list
    updateReport({ sundayCellAttendance: sca })
  }

  const updateCellList = (key, idx, value) => {
    const list = [...(report?.[key] || [])]
    list[idx] = value
    updateReport({ [key]: list })
  }
  const addCellName = (key) => updateReport({ [key]: [...(report?.[key] || []), ''] })
  const addCellNameValue = (key, value) => updateReport({ [key]: [...(report?.[key] || []), value] })
  const removeCellName = (key, idx) => updateReport({ [key]: (report?.[key] || []).filter((_, i) => i !== idx) })

  const handleRiverKidsToggle = async (kidName, isCurrentlyPresent) => {
    if (!canEditEffective) return
    const trimmed = kidName.trim()
    const norm = trimmed.toLowerCase()
    const currentNames = report?.riverKids || []
    const newNames = isCurrentlyPresent
      ? currentNames.filter(n => (n || '').trim().toLowerCase() !== norm)
      : currentNames.some(n => (n || '').trim().toLowerCase() === norm) ? currentNames : [...currentNames, trimmed]
    updateReport({ riverKids: newNames })
    try {
      await patchSundayReportRiverKids(selectedDate, newNames, userProfile?.email || 'unknown')
    } catch { /* optimistic update already applied; subscription will resync */ }
  }

  // Search pool for linking an "Others" name — People Directory + D-Light visitors, tagged by source.
  const othersLinkDirectory = useMemo(
    () => [
      ...peopleDirectory.map((p) => ({ id: p.id, name: p.name, phone: p.phone, source: 'people' })),
      ...delightVisitorsAll.map((v) => ({ id: v.id, name: v.name, phone: v.phone, source: 'visitor' })),
    ],
    [peopleDirectory, delightVisitorsAll]
  )

  // Same two sources for Non Cell, but deduplicated by phone (fallback to id) — Non Cell
  // shows a flat pick-a-name list rather than a "link an existing entry" flow, so the same
  // physical person appearing in both People Directory and D-Light would otherwise show twice.
  const nonCellSearchPool = useMemo(() => {
    const seen = new Set()
    const merged = []
    for (const p of othersLinkDirectory) {
      const key = (p.phone || '').replace(/\s+/g, '') || p.id
      if (p.name && !seen.has(key)) { seen.add(key); merged.push(p) }
    }
    return merged
  }, [othersLinkDirectory])

  // Combined people pool for bulk import matching: cell members + people directory + visitors + River Kids
  const bulkImportSearchPool = useMemo(() => {
    const seen = new Set()
    const pool = []
    const add = (p) => {
      const key = (p.name || '').trim().toLowerCase()
      if (key && !seen.has(key)) { seen.add(key); pool.push({ id: p.id || key, name: (p.name || '').trim() }) }
    }
    for (const m of allCellMembers) add(m)
    for (const p of peopleDirectory) add(p)
    for (const v of delightVisitorsAll) add(v)
    for (const k of allRkKids) add(k)
    return pool
  }, [allCellMembers, peopleDirectory, delightVisitorsAll, allRkKids])

  // Map from normalized name → { cellId } for auto-detecting section during bulk import
  const cellMemberMap = useMemo(() => {
    const m = new Map()
    for (const member of allCellMembers) {
      const key = (member.name || '').replace(/\s+/g, ' ').trim().toLowerCase()
      if (key && member.cellId) m.set(key, { cellId: member.cellId })
    }
    return m
  }, [allCellMembers])

  // Set of normalized River Kids names for auto-detecting riverKids section in bulk import
  const rkKidsNorms = useMemo(() => {
    const s = new Set()
    for (const k of allRkKids) {
      const key = (k.name || '').replace(/\s+/g, ' ').trim().toLowerCase()
      if (key) s.add(key)
    }
    return s
  }, [allRkKids])

  /** Add a Non Cell attendee and record it against their own profile/visitor record. */
  const addNonCellPerson = (person) => {
    const name = String(person?.name || '').trim()
    if (!name) return
    addCellNameValue('nonCell', name)
    recordPersonSundayAttendance({
      date: selectedDate,
      personId: person.source === 'people' ? person.id : null,
      visitorId: person.source === 'visitor' ? person.id : null,
      name,
      recordedBy: userProfile?.email || 'unknown',
    }).catch(() => {})
  }

  const othersLinkedNames = useMemo(
    () => new Set(Object.keys(report?.othersLinked || {})),
    [report?.othersLinked]
  )

  /**
   * Link an "Others" entry to a real profile — either a People Directory record or a
   * D-Light visitor record — so their own profile can show this Sunday's attendance.
   * If that linked person also happens to be a cell member (matched by name), their
   * name is additionally moved out of Others into that cell's attendance.
   */
  const linkOthersNameToCell = (idx, person) => {
    const name = String(person?.name || '').trim()
    if (!name) return

    const matchedMember = allCellMembers.find(
      (m) => String(m.name || '').trim().toLowerCase() === name.toLowerCase()
    )
    if (matchedMember) {
      // Belongs to a cell — move out of Others entirely into that cell's attendance.
      const others = (report?.others || []).filter((_, i) => i !== idx)
      const sca = { ...(report?.sundayCellAttendance || {}) }
      const list = [...(sca[matchedMember.cellId] || [])]
      if (!list.some((n) => String(n).trim().toLowerCase() === name.toLowerCase())) list.push(name)
      sca[matchedMember.cellId] = list
      updateReport({ others, sundayCellAttendance: sca })
    } else {
      // Not in any cell — stay in Others, but replace the typed name with the
      // canonical directory/visitor name and mark this entry as linked.
      const others = [...(report?.others || [])]
      others[idx] = name
      const othersLinked = { ...(report?.othersLinked || {}) }
      othersLinked[name.toLowerCase()] = { source: person.source, id: person.id }
      updateReport({ others, othersLinked })
    }

    recordPersonSundayAttendance({
      date: selectedDate,
      personId: person.source === 'people' ? person.id : null,
      visitorId: person.source === 'visitor' ? person.id : null,
      name,
      recordedBy: userProfile?.email || 'unknown',
    }).catch(() => {})
  }

  const updateSummary = (key, value) => updateReport({ summary: { ...(report?.summary || {}), [key]: value } })

  const logByName = useMemo(() => {
    const map = {}
    for (const log of programLogs) {
      const key = String(log.programName || '').trim().toLowerCase()
      if (key && !map[key]) map[key] = log
    }
    return map
  }, [programLogs])

  const logForItem = (item) => logByName[String(item?.programName || '').trim().toLowerCase()] || null

  // Sort by actual startTime when logged (reflects real service order),
  // fall back to the configured `order` field for items not yet started.
  const sortedProgram = useMemo(() => {
    const toMs = (log) => {
      if (!log?.startTime) return null
      const d = log.startTime instanceof Date ? log.startTime : new Date(log.startTime)
      return isNaN(d.getTime()) ? null : d.getTime()
    }
    return [...(report?.programList || [])].sort((a, b) => {
      const ta = toMs(logByName[String(a.programName || '').trim().toLowerCase()])
      const tb = toMs(logByName[String(b.programName || '').trim().toLowerCase()])
      if (ta !== null && tb !== null) return ta - tb
      if (ta !== null) return -1   // timed items float before untimed
      if (tb !== null) return 1
      return (a.order ?? 0) - (b.order ?? 0)
    })
  }, [report?.programList, logByName])

  const currentProgramItem = sortedProgram.find((item) => !logForItem(item)) || null
  const allProgramsTimed = sortedProgram.length > 0 && !currentProgramItem

  // The item currently running = the one just before the next-to-time item
  const runningProgramItem = useMemo(() => {
    if (!currentProgramItem) return null
    const idx = sortedProgram.indexOf(currentProgramItem)
    return idx > 0 ? sortedProgram[idx - 1] : null
  }, [sortedProgram, currentProgramItem])
  const runningLog = runningProgramItem ? logForItem(runningProgramItem) : null
  const runningStartMs = useMemo(() => {
    if (!runningLog?.startTime) return null
    const d = runningLog.startTime instanceof Date ? runningLog.startTime : new Date(runningLog.startTime)
    return isNaN(d.getTime()) ? null : d.getTime()
  }, [runningLog])

  const updateProgramItemName = (idx, name) => {
    const updated = sortedProgram.map((item, i) => i === idx ? { ...item, programName: name } : item)
    updateReport({ programList: updated })
  }

  const removeProgramItem = (idx) => {
    const updated = sortedProgram
      .filter((_, i) => i !== idx)
      .map((item, i) => ({ ...item, order: i }))
    updateReport({ programList: updated })
  }


  const handleProgramStart = async () => {
    if (!canEditEffective || !currentProgramItem) return
    try {
      await addSundayProgramLog({
        programName: currentProgramItem.programName,
        startTime: new Date(),
        reportDate: selectedDate,
      })
      const logs = await getSundayProgramLogsByDate(selectedDate)
      setProgramLogs(logs)
      if (logs.length >= sortedProgram.length) {
        setShowCompleteModal(true)
      }
    } catch (e) {
      console.error(e)
      alert(e?.message || 'Failed to record time')
    }
  }

  const handleDownloadExcel = async () => {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()

    // ── Sheet 1: Summary ──────────────────────────────────────────────
    const rows = []
    rows.push([`Sunday Report — ${selectedDate}`])
    rows.push([])

    if (sortedProgram.length > 0) {
      rows.push(['Program', 'Start Time'])
      sortedProgram.forEach((item) => {
        const log = logForItem(item)
        const t = log?.startTime ? (log.startTime instanceof Date ? log.startTime : new Date(log.startTime)) : null
        rows.push([item.programName, t ? format(t, 'h:mm a') : '—'])
      })
      rows.push([])
    }

    const { cellRows, othersCount, nonCellCount, secondWeekCount, newcomersCount, riverKidsCount, totalAdults, total } = summaryComputed
    rows.push(['Attendance', 'Count'])
    cellRows.forEach((r) => rows.push([r.name, r.count]))
    rows.push(['Others', othersCount])
    rows.push(['Non Cell', nonCellCount])
    rows.push(['New Comers', newcomersCount])
    rows.push(['Second Week Attendees', secondWeekCount])
    rows.push(['River Kids', riverKidsCount])
    rows.push(['Sunday School', Number(report?.summary?.sundaySchool) || 0])
    rows.push([])
    rows.push(['Total Adults', totalAdults])
    rows.push(['Total', total])

    const ws1 = XLSX.utils.aoa_to_sheet(rows)
    ws1['!cols'] = [{ wch: 30 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, ws1, 'Summary')

    // ── Sheet 2: Attendance Detail ────────────────────────────────────
    const detailRows = [['Section', 'Name']]
    cellGroups.forEach((g) => {
      const members = (report?.sundayCellAttendance?.[g.id] || []).filter(Boolean)
      members.forEach((name) => detailRows.push([g.cellName || 'Cell', name]))
    })
    const listsToExport = [
      { label: 'Pastoral Attendees', key: 'pastoralAttendees' },
      { label: 'New Comers', key: 'newComers' },
      { label: 'Others', key: 'others' },
      { label: 'Non Cell', key: 'nonCell' },
      { label: 'Second Week Attendees', key: 'secondWeekAttendeesNames' },
      { label: 'River Kids', key: 'riverKids' },
    ]
    listsToExport.forEach(({ label, key }) => {
      const names = (report?.[key] || []).filter(Boolean)
      names.forEach((name) => detailRows.push([label, name]))
    })

    const ws2 = XLSX.utils.aoa_to_sheet(detailRows)
    ws2['!cols'] = [{ wch: 28 }, { wch: 28 }]
    XLSX.utils.book_append_sheet(wb, ws2, 'Attendance Detail')

    XLSX.writeFile(wb, `sunday-report-${selectedDate}.xlsx`)
  }

  const handleUpdateLog = async (idx) => {
    if (!editingLogTime) return
    const item = sortedProgram[idx]
    const log = logForItem(item)
    try {
      const [h, m] = editingLogTime.split(':').map(Number)
      const d = new Date(`${selectedDate}T00:00:00`)
      d.setHours(h, m, 0, 0)
      if (log?.id) {
        await updateSundayProgramLog(log.id, d)
      } else {
        await addSundayProgramLog({
          programName: item?.programName || '',
          startTime: d,
          reportDate: selectedDate,
        })
      }
      const logs = await getSundayProgramLogsByDate(selectedDate)
      setProgramLogs(logs)
      setEditingLogIdx(null)
    } catch (e) {
      console.error(e)
      alert(e?.message || 'Failed to save time')
    }
  }

  if (!isSundayMinistryDirector) {
    return (
      <div className="p-8 text-slate-600">
        <Link to="/department/sunday-ministry" className="text-blue-600 hover:underline">
          ← Sunday Ministry
        </Link>
        <p className="mt-4">You do not have access to Sunday Ministry.</p>
      </div>
    )
  }

  const selectedForCell = (cellId) => new Set(report?.sundayCellAttendance?.[cellId] || [])

  const cellsEdit = canEditEffective && !completedSections.cells
  const pastoralEdit = canEditEffective && !completedSections.pastoral

  return (
    <div>
      {!embedded && <DepartmentTabBar slug="sunday-ministry" activeTab="sundayReport" />}
      <BulkImportPanel
        isOpen={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        selectedDate={selectedDate}
        report={report}
        updateReport={updateReport}
        cellGroups={cellGroups}
        searchPool={bulkImportSearchPool}
        cellMemberMap={cellMemberMap}
        rkKidsNorms={rkKidsNorms}
        userEmail={userProfile?.email || 'unknown'}
      />
      <div className="space-y-6 p-4">
        {/* Date nav + actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setSelectedDate(format(subWeeks(new Date(selectedDate), 1), 'yyyy-MM-dd'))}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
          >
            ←
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 bg-white"
          />
          <button
            type="button"
            onClick={() => setSelectedDate(format(addWeeks(new Date(selectedDate), 1), 'yyyy-MM-dd'))}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
          >
            →
          </button>
          <button
            type="button"
            onClick={refreshAll}
            disabled={loading}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-500 hover:bg-slate-50 disabled:opacity-40"
            title="Refresh"
          >
            ↻
          </button>
          {isFounder && (
            <button
              type="button"
              onClick={() => setShowBulkImport(true)}
              className="ml-auto px-3 min-h-[44px] py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 text-sm font-semibold hover:bg-amber-100 active:bg-amber-200 transition-colors"
              title="Bulk import historical attendance (Founder only)"
            >
              ↑ Import
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className={`${isFounder ? '' : 'ml-auto'} px-5 min-h-[44px] py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 transition-colors`}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>

        {/* Attendance total banner */}
        {!loading && report && summaryComputed.total > 0 && (
          <div className="flex items-center justify-between bg-indigo-600 text-white rounded-xl px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-extrabold tabular-nums">{summaryComputed.total}</span>
              <div className="flex flex-col leading-tight">
                <span className="text-xs font-bold uppercase tracking-wide text-indigo-200">Total Attendance</span>
                <span className="text-[11px] text-indigo-300">{summaryComputed.totalAdults} adults · {summaryComputed.riverKidsCount + summaryComputed.sundaySchool} kids</span>
              </div>
            </div>
            <div className="flex gap-3 text-right">
              <div>
                <p className="text-lg font-bold tabular-nums">{summaryComputed.totalAdults}</p>
                <p className="text-[10px] text-indigo-300 uppercase tracking-wide">Adults</p>
              </div>
              <div className="w-px bg-indigo-500" />
              <div>
                <p className="text-lg font-bold tabular-nums">{summaryComputed.riverKidsCount + summaryComputed.sundaySchool}</p>
                <p className="text-[10px] text-indigo-300 uppercase tracking-wide">Kids</p>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-slate-500">Loading report…</div>
        ) : (
          <>
            {(sortedProgram.length > 0 || canEditEffective) && (
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-slate-800">Program</h3>
                  <Link to="/department/sunday-ministry/sunday?subtab=program" className="text-sm text-indigo-600 hover:underline">
                    Manage program →
                  </Link>
                </div>

                {sortedProgram.length === 0 ? (
                  <p className="text-sm text-slate-400">No programs yet. Add one below or push from Sunday Program page.</p>
                ) : (
                  <ul className="text-sm divide-y divide-slate-100 border border-slate-100 rounded-lg">
                    {sortedProgram.map((item, idx) => {
                      const log = logForItem(item)
                      const logTime = log?.startTime
                        ? format(log.startTime instanceof Date ? log.startTime : new Date(log.startTime), 'HH:mm')
                        : null
                      const nextLog = logForItem(sortedProgram[idx + 1])
                      const durationMs = log?.startTime && nextLog?.startTime
                        ? (nextLog.startTime instanceof Date ? nextLog.startTime : new Date(nextLog.startTime)) -
                          (log.startTime instanceof Date ? log.startTime : new Date(log.startTime))
                        : null
                      const durationLabel = durationMs > 0
                        ? (() => { const m = Math.round(durationMs / 60000); return m >= 60 ? `${Math.floor(m/60)}h${m%60?` ${m%60}m`:''}` : `${m}m` })()
                        : null
                      const isEditingTime = editingLogIdx === idx
                      const isEditingName = editingProgramIdx === idx
                      const canEditName = canEditEffective && !log
                      return (
                        <li key={`${item.programName}-${idx}`} className="flex items-center gap-2 px-3 py-2">
                          {/* Program name */}
                          {isEditingName ? (
                            <>
                              <input
                                type="text"
                                value={editingProgramName}
                                onChange={(e) => setEditingProgramName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { updateProgramItemName(idx, editingProgramName); setEditingProgramIdx(null) } if (e.key === 'Escape') setEditingProgramIdx(null) }}
                                className="flex-1 px-2 py-1 rounded border border-slate-300 text-sm font-medium"
                                autoFocus
                              />
                              <button type="button" onClick={() => { updateProgramItemName(idx, editingProgramName); setEditingProgramIdx(null) }} className="text-emerald-600 font-bold text-base px-1">✓</button>
                              <button type="button" onClick={() => setEditingProgramIdx(null)} className="text-red-500 font-bold text-base px-1">✕</button>
                            </>
                          ) : (
                            <span className="flex items-center gap-1.5 flex-1 min-w-0">
                              <span className="font-medium text-slate-800 truncate">{item.programName}</span>
                              {canEditName && (
                                <button
                                  type="button"
                                  onClick={() => { setEditingProgramIdx(idx); setEditingProgramName(item.programName) }}
                                  className="text-slate-300 hover:text-slate-500 text-xs flex-shrink-0"
                                  title="Edit name"
                                >✎</button>
                              )}
                            </span>
                          )}

                          {/* Program time */}
                          {!isEditingName && (
                            isEditingTime ? (
                              <span className="flex items-center gap-1 flex-shrink-0">
                                <input
                                  type="time"
                                  value={editingLogTime}
                                  onChange={(e) => setEditingLogTime(e.target.value)}
                                  className="px-2 py-1 rounded border border-slate-300 text-sm tabular-nums"
                                />
                                <button type="button" onClick={() => handleUpdateLog(idx)} className="text-emerald-600 hover:text-emerald-700 font-bold text-base px-1">✓</button>
                                <button type="button" onClick={() => setEditingLogIdx(null)} className="text-red-500 hover:text-red-600 font-bold text-base px-1">✕</button>
                              </span>
                            ) : canEditEffective ? (
                              <button
                                type="button"
                                onClick={() => { setEditingLogIdx(idx); setEditingLogTime(logTime || format(new Date(), 'HH:mm')) }}
                                className={`tabular-nums text-sm flex-shrink-0 min-w-[44px] text-right ${logTime ? 'text-slate-600 hover:text-indigo-600 hover:underline' : 'text-slate-300 hover:text-indigo-500'}`}
                                title={logTime ? 'Edit time' : 'Set time'}
                              >
                                {logTime || '—'}
                              </button>
                            ) : (
                              <span className="text-slate-600 tabular-nums text-sm flex-shrink-0">{logTime ?? '—'}</span>
                            )
                          )}

                          {/* Duration badge */}
                          {durationLabel && !isEditingTime && !isEditingName && (
                            <span className="flex-shrink-0 px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs tabular-nums font-medium">
                              {durationLabel}
                            </span>
                          )}

                          {/* Remove */}
                          {canEditEffective && !isEditingName && !isEditingTime && (
                            <button
                              type="button"
                              onClick={() => removeProgramItem(idx)}
                              className="text-slate-200 hover:text-red-500 text-sm px-1 flex-shrink-0"
                              title="Remove program"
                            >✕</button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}


                {/* Program confirm sheet — shown before first tap */}
                {showProgramConfirm && (
                  <ProgramConfirmSheet
                    title="Sunday Program"
                    items={sortedProgram.map(item => ({ name: item.programName }))}
                    onConfirm={() => { setShowProgramConfirm(false); handleProgramStart() }}
                    onEdit={() => { setShowProgramConfirm(false); navigate('/department/sunday-ministry/sunday-program') }}
                  />
                )}

                {runningStartMs && (
                  <div className="flex flex-col items-center gap-1 pt-1">
                    <p className="text-xs text-slate-500 font-medium">Now running: <strong>{runningProgramItem?.programName}</strong></p>
                    <LiveElapsedTimer startedAtMs={runningStartMs} />
                  </div>
                )}

                {canEditEffective && !allProgramsTimed && (
                  <div className="flex flex-col items-center pt-2">
                    <button
                      type="button"
                      onClick={() => programLogs.length === 0 ? setShowProgramConfirm(true) : handleProgramStart()}
                      className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg border-2 border-indigo-700 flex flex-col items-center justify-center cursor-pointer active:scale-[0.98] transition px-8 py-6"
                    >
                      <span className="text-2xl font-bold tracking-wide">START</span>
                      <span className="text-sm text-white/95 mt-2 font-medium">
                        {currentProgramItem ? currentProgramItem.programName : 'Service'}
                      </span>
                    </button>
                  </div>
                )}
                {canEditEffective && allProgramsTimed && (
                  <div className="flex flex-col items-center gap-2 pt-1">
                    <p className="text-sm text-emerald-700 font-medium">All program start times recorded.</p>
                    <button
                      type="button"
                      onClick={() => setShowCompleteModal(true)}
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow transition"
                    >
                      View Service Summary →
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Attendance — all groups combined into one stacked layout, Pastoral first */}
            <h2 className="text-lg font-semibold text-slate-800 mb-1">Attendance</h2>

            <AttendanceSectionShell
              sectionRef={pastoralSectionRef}
              completed={completedSections.pastoral}
              isActive={activeSectionId === 'pastoral'}
              canManage={canEditEffective}
              onDone={() => handleAttendanceDone('pastoral')}
              onUndo={() => handleAttendanceUndo('pastoral')}
            >
              <NameListSection
                title={PASTORAL_KEY.title}
                names={report?.[PASTORAL_KEY.key] || []}
                canEdit={pastoralEdit}
                onAddValue={(value) => addCellNameValue(PASTORAL_KEY.key, value)}
                onEdit={(idx, value) => updateCellList(PASTORAL_KEY.key, idx, value)}
                onRemove={(idx) => removeCellName(PASTORAL_KEY.key, idx)}
                suggestions={PASTORAL_ATTENDEE_SUGGESTIONS}
                suggestionsLabel="Pastors — tap to add"
                showManualAdd={false}
                duplicateNorms={duplicateNorms}
                className="border-0 shadow-none bg-transparent p-0"
              />
            </AttendanceSectionShell>

            <AttendanceSectionShell
              sectionRef={cellsSectionRef}
              completed={completedSections.cells}
              isActive={activeSectionId === 'cells'}
              canManage={canEditEffective}
              onDone={() => handleAttendanceDone('cells')}
              onUndo={() => handleAttendanceUndo('cells')}
            >
              <h3 className="font-semibold text-slate-800 mb-3">Cell Groups</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {cellGroups.map((g) => {
                  const expanded = expandedCellId === g.id
                  const count = (report?.sundayCellAttendance?.[g.id] || []).length
                  return (
                    <div key={g.id} className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
                      <button
                        type="button"
                        onClick={() => setExpandedCellId(expanded ? null : g.id)}
                        className={`w-full text-left p-4 transition ${expanded ? 'bg-indigo-100 border-b border-indigo-200' : 'hover:bg-slate-100'}`}
                      >
                        <p className="font-semibold text-slate-800 text-sm leading-tight">{g.cellName || 'Unnamed'}</p>
                        <p className="text-xs text-slate-500 mt-1">{count} selected</p>
                      </button>
                      {expanded && (
                        <div className="p-3 bg-white max-h-64 overflow-y-auto">
                          {loadingMembers ? (
                            <p className="text-xs text-slate-500">Loading members…</p>
                          ) : membersForCell.length === 0 ? (
                            <p className="text-xs text-slate-500">No active members.</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {enrichedMembersForCell.map((m) => {
                                const nm = (m.name || '').trim()
                                const cellSet = selectedForCell(g.id)
                                const sel = cellSet.has(nm) || (m.originalName !== nm && cellSet.has(m.originalName))
                                const isDupe = sel && duplicateNorms.has(nm.replace(/\s+/g, ' ').toLowerCase())
                                return (
                                  <button
                                    key={m.id}
                                    type="button"
                                    disabled={!cellsEdit || !nm}
                                    onClick={() => toggleMemberAttendance(g.id, nm, m.originalName)}
                                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                                      isDupe
                                        ? 'bg-red-100 text-red-700 border-red-400'
                                        : sel
                                          ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm'
                                          : 'bg-slate-100 text-slate-800 border-slate-200 hover:bg-slate-200'
                                    } ${!cellsEdit ? 'opacity-70 cursor-default' : ''}`}
                                  >
                                    {nm || '—'}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {cellGroups.length === 0 && <p className="text-sm text-slate-500">No cell groups found. Add cells under Cell department.</p>}
            </AttendanceSectionShell>

            {MANUAL_ONLY_KEYS.map(({ key, title }) => {
              const refMap = {
                others: othersSectionRef,
                nonCell: nonCellSectionRef,
                riverKids: riverKidsSectionRef,
              }
              const sectionRef = refMap[key]
              const manualEdit = canEditEffective && !completedSections[key]
              return (
                <AttendanceSectionShell
                  key={key}
                  sectionRef={sectionRef}
                  completed={completedSections[key]}
                  isActive={activeSectionId === key}
                  canManage={canEditEffective}
                  onDone={() => handleAttendanceDone(key)}
                  onUndo={() => handleAttendanceUndo(key)}
                >
                  {key === 'nonCell' ? (
                    <NonCellSection
                      names={report?.[key] || []}
                      canEdit={manualEdit}
                      people={nonCellSearchPool}
                      cellMemberNames={cellMemberNames}
                      onAddValue={addNonCellPerson}
                      onEdit={(idx, value) => updateCellList(key, idx, value)}
                      onRemove={(idx) => removeCellName(key, idx)}
                      duplicateNorms={duplicateNorms}
                      className="border-0 shadow-none bg-transparent p-0"
                    />
                  ) : key === 'riverKids' ? (
                    <RiverKidsRegistrySection
                      kids={allRkKids}
                      markedNames={report?.riverKids || []}
                      canEdit={manualEdit}
                      onToggle={handleRiverKidsToggle}
                      duplicateNorms={duplicateNorms}
                    />
                  ) : (
                    <NameListSection
                      title={title}
                      names={report?.[key] || []}
                      canEdit={manualEdit}
                      onAdd={() => addCellName(key)}
                      onAddValue={(value) => addCellNameValue(key, value)}
                      onEdit={(idx, value) => updateCellList(key, idx, value)}
                      onRemove={(idx) => removeCellName(key, idx)}
                      linkDirectory={key === 'others' ? othersLinkDirectory : null}
                      onLink={key === 'others' ? linkOthersNameToCell : undefined}
                      linkedNames={key === 'others' ? othersLinkedNames : undefined}
                      duplicateNorms={duplicateNorms}
                      className="border-0 shadow-none bg-transparent p-0"
                    />
                  )}
                </AttendanceSectionShell>
              )
            })}

            {/* ── New Comers — auto-populated from D-Light Visitors ── */}
            <div ref={newComersSectionRef} className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-800">New Comers</h3>
                <span className="text-xs text-indigo-500 font-medium bg-indigo-100 px-2 py-0.5 rounded-full">
                  From D-Light Visitors
                </span>
              </div>

              {loadingDlight ? (
                <p className="text-sm text-slate-400 py-2">Loading from D-Light visitors…</p>
              ) : dlightSuggestions.length === 0 ? (
                <p className="text-sm text-slate-400 py-2">
                  No visitors recorded for this Sunday in D-Light yet.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {dlightSuggestions.map((name, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-sm text-slate-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                      {name}
                    </li>
                  ))}
                </ul>
              )}

              <p className="text-xs text-slate-400 mt-3">
                Names are pulled automatically from D-Light visitor entries for this week.
              </p>
            </div>

            <AttendanceSectionShell
              sectionRef={secondWeekSectionRef}
              completed={completedSections[SECOND_WEEK_KEY.key]}
              isActive={activeSectionId === SECOND_WEEK_KEY.key}
              canManage={canEditEffective}
              onDone={() => handleAttendanceDone(SECOND_WEEK_KEY.key)}
              onUndo={() => handleAttendanceUndo(SECOND_WEEK_KEY.key)}
            >
              <NameListSection
                title={SECOND_WEEK_KEY.title}
                names={report?.[SECOND_WEEK_KEY.key] || []}
                canEdit={canEditEffective && !completedSections[SECOND_WEEK_KEY.key]}
                onAdd={() => addCellName(SECOND_WEEK_KEY.key)}
                onAddValue={(value) => addCellNameValue(SECOND_WEEK_KEY.key, value)}
                onEdit={(idx, value) => updateCellList(SECOND_WEEK_KEY.key, idx, value)}
                onRemove={(idx) => removeCellName(SECOND_WEEK_KEY.key, idx)}
                suggestions={secondWeekSuggestions}
                loadingSuggestions={loadingSecondWeekSuggestions}
                suggestionsLabel="New comers from the last 4 weeks — tap to add"
                duplicateNorms={duplicateNorms}
                className="border-0 shadow-none bg-transparent p-0"
              />
            </AttendanceSectionShell>
          </>
        )}
      </div>

      <AnimatePresence>
        {showSavedModal && savedSummary && (
          <SavedModal
            summary={savedSummary}
            onClose={() => setShowSavedModal(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCompleteModal && (
          <ServiceCompleteModal
            sortedProgram={sortedProgram}
            programLogs={programLogs}
            summaryComputed={summaryComputed}
            sundaySchoolValue={report?.summary?.sundaySchool ?? ''}
            onSundaySchoolChange={(v) => updateSummary('sundaySchool', v)}
            saving={saving}
            onSave={async () => {
              await handleSave()
              setShowCompleteModal(false)
              setSelectedDate(format(addWeeks(new Date(selectedDate), 1), 'yyyy-MM-dd'))
            }}
            onClose={() => setShowCompleteModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Saved Confirmation Modal ─────────────────────────────────────────────────

function SavedModal({ summary, onClose }) {
  const {
    cellRows, othersCount, othersNames, nonCellCount, nonCellNames, secondWeekCount, secondWeekNames,
    newcomersCount, newcomersNames, pastoralCount, pastoralNames, riverKidsCount, riverKidsNames,
    sundaySchool, totalAdults, total, date,
  } = summary
  return (
    <>
      <motion.div
        key="saved-backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-50"
        onClick={onClose}
      />
      <motion.div
        key="saved-sheet"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col"
      >
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Hero */}
        <div className="px-6 pt-3 pb-5 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-4xl">✅</span>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Report Saved!</h2>
              <p className="text-slate-500 text-sm">{date}</p>
            </div>
          </div>
          {/* Total hero numbers */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="bg-indigo-600 text-white rounded-2xl p-3 text-center">
              <p className="text-3xl font-extrabold tabular-nums">{total}</p>
              <p className="text-[10px] text-indigo-200 font-bold uppercase tracking-wide mt-0.5">Total</p>
            </div>
            <div className="bg-indigo-50 rounded-2xl p-3 text-center">
              <p className="text-3xl font-extrabold tabular-nums text-indigo-700">{totalAdults}</p>
              <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-wide mt-0.5">Adults</p>
            </div>
            <div className="bg-indigo-50 rounded-2xl p-3 text-center">
              <p className="text-3xl font-extrabold tabular-nums text-indigo-700">{riverKidsCount + sundaySchool}</p>
              <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-wide mt-0.5">Kids</p>
            </div>
          </div>
        </div>

        {/* Breakdown */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {cellRows.map((r) => (
            <AttendanceRow key={r.id} label={r.name} count={r.count} names={r.names} />
          ))}
          <AttendanceRow label="Pastoral" count={pastoralCount} names={pastoralNames} />
          <AttendanceRow label="Non Cell" count={nonCellCount} names={nonCellNames} />
          <AttendanceRow label="Others" count={othersCount} names={othersNames} />
          <AttendanceRow label="New Comers" count={newcomersCount} names={newcomersNames} />
          <AttendanceRow label="Second Week" count={secondWeekCount} names={secondWeekNames} />
          <AttendanceRow label="River Kids" count={riverKidsCount} names={riverKidsNames} />
          {sundaySchool > 0 && (
            <div className="flex justify-between px-4 py-2.5 rounded-xl bg-slate-50 text-sm">
              <span className="text-slate-600">Sunday School</span>
              <span className="font-bold tabular-nums text-slate-800">{sundaySchool}</span>
            </div>
          )}
        </div>

        <div className="px-6 py-5 border-t border-slate-100 flex-shrink-0">
          <button type="button" onClick={onClose}
            className="w-full py-3.5 rounded-2xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 transition-colors">
            Done
          </button>
        </div>
      </motion.div>
    </>
  )
}

/** One attendance category row — count + the actual names, so the summary isn't just a number. */
function AttendanceRow({ label, count, names }) {
  if (!count) return null
  return (
    <div className="px-4 py-2 rounded-xl bg-slate-50 text-sm">
      <div className="flex justify-between">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold tabular-nums text-slate-800">{count}</span>
      </div>
      {names?.length > 0 && (
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">{names.join(', ')}</p>
      )}
    </div>
  )
}

// ─── Service Complete Modal ───────────────────────────────────────────────────

function ServiceCompleteModal({ sortedProgram, programLogs, summaryComputed, sundaySchoolValue, onSundaySchoolChange, saving, onSave, onClose }) {
  const {
    cellRows, othersCount, othersNames, nonCellCount, nonCellNames, secondWeekCount, secondWeekNames,
    newcomersCount, newcomersNames, pastoralCount, pastoralNames, riverKidsCount, riverKidsNames,
    sundaySchool, totalAdults, total,
  } = summaryComputed
  const logByName = {}
  for (const log of programLogs) {
    const key = String(log.programName || '').trim().toLowerCase()
    if (key && !logByName[key]) logByName[key] = log
  }
  const logForItem = (item) => logByName[String(item?.programName || '').trim().toLowerCase()] || null

  return (
    <>
      <motion.div
        key="sc-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-50"
        onClick={onClose}
      />
      <motion.div
        key="sc-sheet"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="px-6 pt-2 pb-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="text-xl font-bold text-slate-900">Service Complete</h2>
          <p className="text-slate-500 text-sm mt-0.5">Review the service before saving the report.</p>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {/* Program timings */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">⏱ Program Timings</p>
            <div className="space-y-1.5">
              {sortedProgram.map((item, idx) => {
                const log = logForItem(item)
                const t = log?.startTime instanceof Date ? log.startTime : (log?.startTime ? new Date(log.startTime) : null)
                return (
                  <div key={idx} className="flex items-center justify-between px-4 py-3 rounded-2xl bg-slate-50">
                    <span className="font-semibold text-slate-800 text-sm">{item.programName}</span>
                    <span className="text-slate-500 text-sm font-medium tabular-nums">
                      {t ? format(t, 'h:mm a') : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Attendance summary */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">👥 Attendance Summary</p>
            <div className="space-y-1.5">
              {cellRows.map((r) => (
                <AttendanceRow key={r.id} label={r.name} count={r.count} names={r.names} />
              ))}
              <AttendanceRow label="Others" count={othersCount} names={othersNames} />
              <AttendanceRow label="Non Cell" count={nonCellCount} names={nonCellNames} />
              <AttendanceRow label="Pastoral" count={pastoralCount} names={pastoralNames} />
              <div className="flex justify-between items-center px-4 py-2 rounded-xl bg-slate-50 text-sm">
                <span className="text-slate-600">Sunday School</span>
                <input
                  type="number"
                  min="0"
                  value={sundaySchoolValue}
                  onChange={(e) => onSundaySchoolChange(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-20 px-2 py-1 rounded border border-slate-300 text-right text-sm tabular-nums"
                />
              </div>
              <AttendanceRow label="Second Week Comers" count={secondWeekCount} names={secondWeekNames} />
              <AttendanceRow label="New Comers" count={newcomersCount} names={newcomersNames} />
              <AttendanceRow label="River Kids" count={riverKidsCount} names={riverKidsNames} />
              <div className="flex justify-between px-4 py-3 rounded-2xl bg-indigo-50 text-sm font-semibold">
                <span className="text-indigo-900">Total Adults</span>
                <span className="tabular-nums text-indigo-900">{totalAdults}</span>
              </div>
              <div className="flex justify-between px-4 py-3 rounded-2xl bg-indigo-100 text-sm font-bold">
                <span className="text-indigo-900">Total</span>
                <span className="tabular-nums text-indigo-900">{total}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-5 border-t border-slate-100 flex-shrink-0 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3.5 rounded-2xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-all"
          >
            Go Back
          </button>
          <motion.button
            type="button"
            onClick={onSave}
            disabled={saving}
            whileTap={{ scale: 0.97 }}
            className="flex-1 py-3.5 rounded-2xl bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 transition-all shadow-lg shadow-emerald-200 disabled:opacity-60"
          >
            {saving ? 'Saving…' : '✅ Save Report'}
          </motion.button>
        </div>
      </motion.div>
    </>
  )
}
