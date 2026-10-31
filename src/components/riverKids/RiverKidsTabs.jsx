import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Pencil, CheckCircle2, Loader2, Trash2 } from 'lucide-react'
import { differenceInCalendarDays, differenceInYears, format, addWeeks, subWeeks } from 'date-fns'
import {
  getPeople,
  getPCSLookup,
  getDelightVisitors,
  getDepartmentChildren,
  addDepartmentChild,
  updateDepartmentChild,
  deleteDepartmentChild,
  syncAllRiverKidsToLookup,
  getDepartmentChildAttendance,
  setDepartmentChildAttendance,
  subscribeSundayReportRiverKids,
  patchSundayReportRiverKids,
} from '../../services/firestore'
import { isoToDMY } from '../../utils/date'
import { RK_CLASS_GROUPS, rkClassGroupLabel } from '../../constants/riverKids'
import DateInput from '../DateInput'
import PersonSearchInput from '../PersonSearchInput'

// Firestore's permission-denied error is a dead end for the person clicking the
// button — "Missing or insufficient permissions" gives them nothing actionable.
// Most real-world cases are a stale `departments[]` sync (see canAccessDept in
// firestore.rules) that clears itself on next login, so say that instead.
function rkPermissionErrorMessage(error) {
  if (error?.code === 'permission-denied') {
    return "Failed to save: you don't have permission to update River Kids attendance. If you were just assigned to this department, signing out and back in usually fixes this — otherwise contact an admin."
  }
  return `Failed to save: ${error?.message || 'unknown error'}`
}

// Multi-select pill toggle for a kid's Class/Group — a child can belong to more than
// one (e.g. Sunday School + River Kids-1), so this toggles membership in the array
// rather than picking a single value like a native <select> would.
function ClassGroupPicker({ value, onChange }) {
  const selected = Array.isArray(value) ? value : []
  const toggle = (key) => onChange(selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key])
  return (
    <div className="flex flex-wrap gap-2">
      {RK_CLASS_GROUPS.map(g => (
        <button key={g.key} type="button" onClick={() => toggle(g.key)}
          className={`py-1.5 px-3 rounded-xl border text-xs font-medium transition ${
            selected.includes(g.key)
              ? 'bg-indigo-600 text-white border-indigo-700'
              : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          {g.label}
        </button>
      ))}
    </div>
  )
}

/**
 * River Kids department's Register + Attendance tabs (moved out of DepartmentHub).
 * Mounted for both tabs so the roster and picked date carry across when switching between them.
 */
export default function RiverKidsTabs({ activeTab, department, canEdit, canEditRkAttendance, userProfile }) {
  const [rkChildren, setRkChildren] = useState([])
  const [rkLoading, setRkLoading] = useState(false)
  const [rkDate, setRkDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  // Nested by classGroup: { [classGroupKey]: { [childId]: bool } } — see
  // setDepartmentChildAttendance in firestore.js for why this isn't a flat map.
  const [rkAttendanceByGroup, setRkAttendanceByGroup] = useState({})
  const [rkChildForm, setRkChildForm] = useState({ name: '', dob: '', fatherName: '', motherName: '', currentPlace: '', classGroups: [], joinedDate: '', joinedVia: '' })
  const [rkEditChild, setRkEditChild] = useState(null)
  const [rkSavingEdit, setRkSavingEdit] = useState(false)
  const [rkExpandedChildIds, setRkExpandedChildIds] = useState(() => new Set())
  const [rkActionsMenuId, setRkActionsMenuId] = useState(null)
  // Fixed-viewport coords for the portaled Edit/Delete menu below, computed from the
  // ⋮ button's own rect at click time (same pattern as activeMenuMemberPos) — a
  // portal isn't a DOM descendant of the accordion card, so it can't be clipped by
  // the card's own `overflow-hidden` or the framer-motion height-animation wrapper's,
  // the way an absolutely-positioned child dropdown was.
  const [rkActionsMenuPos, setRkActionsMenuPos] = useState(null)
  const [rkSyncing, setRkSyncing] = useState(false)
  const [rkSyncMsg, setRkSyncMsg] = useState('')
  // Full people + D-Light visitor records (name -> join date), kept separately from rkAllUsers
  // (which only has {id, name}) so a parent's church-join date can be looked up by name.
  const [rkJoinDateSources, setRkJoinDateSources] = useState([])
  const resolveParentJoinDate = (name) => {
    const norm = (name || '').trim().toLowerCase()
    if (!norm) return ''
    return rkJoinDateSources.find((s) => s.name.trim().toLowerCase() === norm)?.joinDate || ''
  }
  const [rkAllUsers, setRkAllUsers] = useState([])
  const [rkReportKidsNames, setRkReportKidsNames] = useState([])
  const [rkAttendanceSaving, setRkAttendanceSaving] = useState(false)
  const [rkAttendanceToast, setRkAttendanceToast] = useState('')

  useEffect(() => {
    if ((activeTab !== 'attendance' && activeTab !== 'register') || !department) return
    setRkLoading(true)
    // Load children, attendance, and people for parent search all at once
    Promise.all([
      getDepartmentChildren(department.name),
      getDepartmentChildAttendance(department.name, rkDate),
      getPeople().catch(() => []),
      getPCSLookup().catch(() => []),
      getDelightVisitors().catch(() => []),
    ])
      .then(([children, att, fromPeople, fromLookup, fromVisitors]) => {
        const active = children.filter((c) => c.active !== false)
        setRkChildren(active)
        // Keep the cross-department name-only search index in step with the roster.
        if (department.name === 'River Kids') {
          syncAllRiverKidsToLookup(children).catch((err) =>
            console.error('Failed to sync river_kids_lookup', err))
        }
        setRkAttendanceByGroup(typeof att.present === 'object' && att.present ? { ...att.present } : {})
        // Build parent name suggestions: people directory + pcs_lookup + names already saved in kids
        const seen = new Set()
        const merged = []
        const add = (name, id) => {
          const key = (name || '').trim().toLowerCase()
          if (key && !seen.has(key)) { seen.add(key); merged.push({ id, name: name.trim() }) }
        }
        for (const x of [...fromPeople, ...fromLookup]) add(x.name, x.id)
        for (const c of active) {
          if (c.fatherName) add(c.fatherName, `f-${c.id}`)
          if (c.motherName) add(c.motherName, `m-${c.id}`)
        }
        merged.sort((a, b) => a.name.localeCompare(b.name))
        setRkAllUsers(merged)
        // Name -> church-join date, so a parent's date can be suggested for their child.
        setRkJoinDateSources([
          ...fromPeople.filter((p) => p.firstVisitDate).map((p) => ({ name: p.name, joinDate: p.firstVisitDate })),
          ...fromVisitors.filter((v) => v.attendedDate).map((v) => ({ name: v.name, joinDate: v.attendedDate })),
        ])
      })
      .catch((error) => { console.error('River Kids attendance load error:', error); setRkChildren([]); setRkAttendanceByGroup({}) })
      .finally(() => setRkLoading(false))
  }, [activeTab, department, rkDate])

  // Real-time subscription to the "River Kids" name list on the Sunday Ministry report —
  // kept live across all three groups (not just Sunday School) so every group's presence
  // toggle can merge into the same list Sunday Ministry reads its "River Kids" total from.
  useEffect(() => {
    if (activeTab !== 'attendance') return
    const unsub = subscribeSundayReportRiverKids(rkDate, names => setRkReportKidsNames(names))
    return unsub
  }, [activeTab, rkDate])

  return (
    <>
          {/* ── Kids Register tab ── */}
          {activeTab === 'register' && (
            <div className="space-y-4">
              {/* Header */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-800">Kids Register</p>
                  <p className="text-xs text-slate-400">{rkChildren.length} kid{rkChildren.length !== 1 ? 's' : ''} registered</p>
                </div>
                {canEdit && (
                  <div className="flex flex-col items-end gap-1">
                    <button
                      type="button"
                      disabled={rkSyncing}
                      onClick={async () => {
                        setRkSyncing(true)
                        setRkSyncMsg('')
                        try {
                          const all = await getDepartmentChildren('River Kids')
                          await syncAllRiverKidsToLookup(all)
                          setRkSyncMsg(`Search index synced (${all.filter((c) => c.active !== false).length} active kids).`)
                        } catch (err) {
                          console.error('Manual river_kids_lookup sync failed', err)
                          setRkSyncMsg('Sync failed — see console.')
                        } finally {
                          setRkSyncing(false)
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 disabled:opacity-60 transition-colors"
                      title="Rebuild the name-only index other departments' team search reads from"
                    >
                      {rkSyncing ? 'Syncing…' : 'Sync search index'}
                    </button>
                    {rkSyncMsg && <span className="text-[11px] text-slate-400">{rkSyncMsg}</span>}
                  </div>
                )}
              </div>

              {/* Add kid form */}
              {canEdit && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Add a Kid</p>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault()
                      if (!rkChildForm.name.trim() || !department) return
                      try {
                        await addDepartmentChild(department.name, rkChildForm, userProfile?.email || userProfile?.displayName || 'unknown')
                        setRkChildForm({ name: '', dob: '', fatherName: '', motherName: '', currentPlace: '', classGroups: [], joinedDate: '', joinedVia: '' })
                        const list = await getDepartmentChildren(department.name)
                        setRkChildren(list.filter((c) => c.active !== false))
                      } catch { alert('Failed to add kid') }
                    }}
                    className="space-y-3"
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Name *</label>
                        <input value={rkChildForm.name} onChange={e => setRkChildForm(p => ({ ...p, name: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="Child's name" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Date of Birth</label>
                        <DateInput value={rkChildForm.dob} onChange={e => setRkChildForm(p => ({ ...p, dob: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                      </div>
                      <div>
                        <PersonSearchInput label="Father's Name" value={rkChildForm.fatherName}
                          onChange={v => setRkChildForm(p => ({ ...p, fatherName: v }))}
                          people={rkAllUsers} placeholder="Search or type father's name" />
                      </div>
                      <div>
                        <PersonSearchInput label="Mother's Name" value={rkChildForm.motherName}
                          onChange={v => setRkChildForm(p => ({ ...p, motherName: v }))}
                          people={rkAllUsers} placeholder="Search or type mother's name" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-slate-600 mb-1">Current Location</label>
                        <input value={rkChildForm.currentPlace} onChange={e => setRkChildForm(p => ({ ...p, currentPlace: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="Current place of residence" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-slate-600 mb-1">Class / Group</label>
                        <ClassGroupPicker value={rkChildForm.classGroups} onChange={v => setRkChildForm(p => ({ ...p, classGroups: v }))} />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-slate-600 mb-2">How They Joined</label>
                        <div className="flex gap-2">
                          {[{ key: 'born', label: 'Born to members' }, { key: 'outside', label: 'Joined from outside' }].map(opt => (
                            <button key={opt.key} type="button"
                              onClick={() => setRkChildForm(p => ({ ...p, joinedVia: p.joinedVia === opt.key ? '' : opt.key }))}
                              className={`flex-1 py-2 px-2 rounded-xl border text-xs font-medium transition ${
                                rkChildForm.joinedVia === opt.key
                                  ? 'bg-indigo-600 text-white border-indigo-700'
                                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {rkChildForm.joinedVia === 'outside' && (() => {
                        const fatherDate = resolveParentJoinDate(rkChildForm.fatherName)
                        const motherDate = resolveParentJoinDate(rkChildForm.motherName)
                        return (
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-slate-600 mb-1">Joined Date</label>
                            <DateInput value={rkChildForm.joinedDate} onChange={e => setRkChildForm(p => ({ ...p, joinedDate: e.target.value }))}
                              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                            {(fatherDate || motherDate) && (
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {fatherDate && (
                                  <button type="button" onClick={() => setRkChildForm(p => ({ ...p, joinedDate: fatherDate }))}
                                    className="text-[11px] px-2 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 font-medium">
                                    👨 Father joined {isoToDMY(fatherDate)}
                                  </button>
                                )}
                                {motherDate && (
                                  <button type="button" onClick={() => setRkChildForm(p => ({ ...p, joinedDate: motherDate }))}
                                    className="text-[11px] px-2 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 font-medium">
                                    👩 Mother joined {isoToDMY(motherDate)}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                    <button type="submit" disabled={!rkChildForm.name.trim()}
                      className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 active:scale-[0.98] transition-all">
                      Add Kid
                    </button>
                  </form>
                </div>
              )}

              {/* Kids list */}
              {rkLoading ? (
                <p className="text-center text-slate-400 text-sm py-8">Loading…</p>
              ) : rkChildren.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-8">No kids registered yet.</p>
              ) : (
                <div className="space-y-2">
                  {rkChildren.map((c) => {
                    const age = c.dob ? differenceInYears(new Date(), new Date(c.dob)) : null
                    const expanded = rkExpandedChildIds.has(c.id)
                    const toggleExpanded = () => {
                      // Collapsing while this card's own actions menu is open would leave the
                      // portaled menu floating detached from its (now-gone) trigger button.
                      if (rkActionsMenuId === c.id) setRkActionsMenuId(null)
                      setRkExpandedChildIds(prev => {
                        const next = new Set(prev)
                        if (next.has(c.id)) next.delete(c.id); else next.add(c.id)
                        return next
                      })
                    }
                    return (
                      <div key={c.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div
                          onClick={toggleExpanded}
                          role="button"
                          tabIndex={0}
                          aria-expanded={expanded}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpanded() } }}
                          className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-slate-50 transition-colors"
                        >
                          <p className="text-base font-semibold text-slate-800 flex-1 min-w-0 truncate">{c.name}</p>
                          {age !== null && (
                            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full border border-indigo-100 shrink-0">{age}y</span>
                          )}
                          {/* Chevron sits in a full touch-target box, not just the icon itself. */}
                          <span className="w-8 h-8 flex items-center justify-center shrink-0">
                            <svg width="14" height="14" viewBox="0 0 12 12" fill="none" className={`text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}>
                              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </span>
                        </div>
                        <AnimatePresence initial={false}>
                          {expanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2, ease: 'easeInOut' }}
                              className="overflow-hidden"
                            >
                              <div className="relative p-5 border-t border-slate-100">
                                {canEdit && (
                                  <div className="absolute right-4 top-4">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        if (rkActionsMenuId === c.id) { setRkActionsMenuId(null); return }
                                        const rect = e.currentTarget.getBoundingClientRect()
                                        setRkActionsMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
                                        setRkActionsMenuId(c.id)
                                      }}
                                      className="w-9 h-9 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                                      aria-label="Row actions"
                                    >
                                      ⋮
                                    </button>
                                    {/* Portaled to document.body with `fixed` coords instead of an
                                        absolutely-positioned child — the accordion card and its
                                        framer-motion height-animation wrapper both have
                                        `overflow-hidden`, which was clipping Edit/Delete before they
                                        could render (a portal isn't a descendant of either, so it
                                        can't be clipped by them). The invisible full-screen overlay
                                        underneath closes the menu on any outside click. */}
                                    {rkActionsMenuId === c.id && rkActionsMenuPos && createPortal(
                                      <>
                                        <div className="fixed inset-0 z-[90]" onClick={(e) => { e.stopPropagation(); setRkActionsMenuId(null) }} />
                                        <div
                                          style={{ position: 'fixed', top: rkActionsMenuPos.top, right: rkActionsMenuPos.right }}
                                          onClick={(e) => e.stopPropagation()}
                                          className="z-[100] w-36 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden"
                                        >
                                          <button
                                            type="button"
                                            onClick={() => { setRkActionsMenuId(null); setRkEditChild({ ...c }) }}
                                            className="w-full flex items-center gap-2 text-left px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                                          >
                                            <Pencil size={14} className="text-slate-400 flex-shrink-0" />
                                            Edit
                                          </button>
                                          <button
                                            type="button"
                                            onClick={async () => {
                                              setRkActionsMenuId(null)
                                              if (!window.confirm(`Remove ${c.name} from the register?`)) return
                                              try {
                                                await deleteDepartmentChild(c.id)
                                                setRkChildren(prev => prev.filter(x => x.id !== c.id))
                                              } catch { alert('Failed to remove kid') }
                                            }}
                                            className="w-full flex items-center gap-2 text-left px-3 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors border-t border-slate-100"
                                          >
                                            <Trash2 size={14} className="text-red-400 flex-shrink-0" />
                                            Delete
                                          </button>
                                        </div>
                                      </>,
                                      document.body
                                    )}
                                  </div>
                                )}
                                {/* Each fact lives in its own row so parents/tags/dates never run
                                    together into one crammed line, with room reserved on the right
                                    (pr-12) so none of it ever sits under the actions button. */}
                                <div className="pr-12 space-y-3">
                                  {c.dob && (
                                    <div className="flex items-center gap-2 text-xs text-slate-500">
                                      <span className="font-medium text-slate-400">DOB</span>
                                      <span>{isoToDMY(c.dob)}</span>
                                    </div>
                                  )}
                                  {(c.fatherName || c.motherName) && (
                                    <div className="flex flex-wrap gap-x-6 gap-y-1.5">
                                      {c.fatherName && (
                                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                          <span className="font-medium text-slate-400">Father</span>
                                          <span className="font-medium text-slate-700">{c.fatherName}</span>
                                        </div>
                                      )}
                                      {c.motherName && (
                                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                          <span className="font-medium text-slate-400">Mother</span>
                                          <span className="font-medium text-slate-700">{c.motherName}</span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {c.currentPlace && (
                                    <div className="flex items-center gap-2 text-xs text-slate-500">
                                      <span className="font-medium text-slate-400">Current Location</span>
                                      <span>{c.currentPlace}</span>
                                    </div>
                                  )}
                                  <div className="flex flex-wrap items-center gap-2">
                                    {(c.classGroups || []).map(g => (
                                      <span key={g} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-100">
                                        {rkClassGroupLabel(g)}
                                      </span>
                                    ))}
                                    {c.joinedVia && (
                                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                        c.joinedVia === 'born'
                                          ? 'bg-pink-50 text-pink-600 border-pink-100'
                                          : 'bg-sky-50 text-sky-600 border-sky-100'
                                      }`}>
                                        {c.joinedVia === 'born' ? 'Born to members' : 'Joined from outside'}
                                      </span>
                                    )}
                                    {(() => {
                                      const effectiveDate = c.joinedVia === 'born' ? c.dob : c.joinedDate
                                      return effectiveDate
                                        ? <span className="text-[10px] text-slate-400">Joined: {isoToDMY(effectiveDate)}</span>
                                        : null
                                    })()}
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Edit kid modal */}
              {rkEditChild && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-slate-900 dark:text-white">Edit Kid</p>
                      <button type="button" onClick={() => setRkEditChild(null)}
                        className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 text-lg leading-none">×</button>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-900 dark:text-white mb-1">Name *</label>
                        <input value={rkEditChild.name} onChange={e => setRkEditChild(p => ({ ...p, name: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-900 dark:text-white mb-1">Date of Birth</label>
                        <DateInput value={rkEditChild.dob || ''} onChange={e => setRkEditChild(p => ({ ...p, dob: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                      </div>
                      <div>
                        <PersonSearchInput label="Father's Name" value={rkEditChild.fatherName || ''}
                          onChange={v => setRkEditChild(p => ({ ...p, fatherName: v }))}
                          people={rkAllUsers} placeholder="Search or type father's name" />
                      </div>
                      <div>
                        <PersonSearchInput label="Mother's Name" value={rkEditChild.motherName || ''}
                          onChange={v => setRkEditChild(p => ({ ...p, motherName: v }))}
                          people={rkAllUsers} placeholder="Search or type mother's name" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-900 dark:text-white mb-1">Current Location</label>
                        <input value={rkEditChild.currentPlace || ''} onChange={e => setRkEditChild(p => ({ ...p, currentPlace: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="Current place of residence" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-900 dark:text-white mb-1">Class / Group</label>
                        <ClassGroupPicker value={rkEditChild.classGroups} onChange={v => setRkEditChild(p => ({ ...p, classGroups: v }))} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-900 dark:text-white mb-2">How They Joined</label>
                        <div className="flex gap-2">
                          {[{ key: 'born', label: 'Born to members' }, { key: 'outside', label: 'Joined from outside' }].map(opt => (
                            <button key={opt.key} type="button"
                              onClick={() => setRkEditChild(p => ({ ...p, joinedVia: p.joinedVia === opt.key ? '' : opt.key }))}
                              className={`flex-1 py-2 px-2 rounded-xl border text-xs font-medium transition ${
                                rkEditChild.joinedVia === opt.key
                                  ? 'bg-indigo-600 text-white border-indigo-700'
                                  : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {rkEditChild.joinedVia === 'outside' && (() => {
                        const fatherDate = resolveParentJoinDate(rkEditChild.fatherName)
                        const motherDate = resolveParentJoinDate(rkEditChild.motherName)
                        return (
                          <div>
                            <label className="block text-xs font-medium text-slate-900 dark:text-white mb-1">Joined Date</label>
                            <DateInput value={rkEditChild.joinedDate || ''} onChange={e => setRkEditChild(p => ({ ...p, joinedDate: e.target.value }))}
                              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                            {(fatherDate || motherDate) && (
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {fatherDate && (
                                  <button type="button" onClick={() => setRkEditChild(p => ({ ...p, joinedDate: fatherDate }))}
                                    className="text-[11px] px-2 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 font-medium">
                                    👨 Father joined {isoToDMY(fatherDate)}
                                  </button>
                                )}
                                {motherDate && (
                                  <button type="button" onClick={() => setRkEditChild(p => ({ ...p, joinedDate: motherDate }))}
                                    className="text-[11px] px-2 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 font-medium">
                                    👩 Mother joined {isoToDMY(motherDate)}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                    <button type="button" disabled={rkSavingEdit || !rkEditChild.name.trim()}
                      onClick={async () => {
                        setRkSavingEdit(true)
                        try {
                          await updateDepartmentChild(rkEditChild.id, {
                            name: rkEditChild.name, dob: rkEditChild.dob || '',
                            fatherName: rkEditChild.fatherName || '', motherName: rkEditChild.motherName || '',
                            currentPlace: rkEditChild.currentPlace || '',
                            classGroups: rkEditChild.classGroups || [],
                            joinedDate: rkEditChild.joinedDate || '',
                            joinedVia: rkEditChild.joinedVia || '',
                          }, department.name)
                          const list = await getDepartmentChildren(department.name)
                          setRkChildren(list.filter((c) => c.active !== false))
                          setRkEditChild(null)
                        } catch { alert('Failed to save') } finally { setRkSavingEdit(false) }
                      }}
                      className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 active:scale-[0.98] transition-all">
                      {rkSavingEdit ? 'Saving…' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Attendance tab ── */}
          {activeTab === 'attendance' && (() => {
            // The date picker steps a whole week at a time, so it lands on future Sundays/
            // Saturdays routinely. Nobody can be "absent" from a service that hasn't happened
            // yet — on those dates the roster is read-only and each column's header badge
            // becomes a countdown, rather than reporting every kid as a no-show ahead of time.
            const daysUntilRkDate = differenceInCalendarDays(new Date(rkDate + 'T00:00:00'), new Date())
            const isFutureRkDate = daysUntilRkDate > 0
            const rkCountdownLabel = daysUntilRkDate === 1 ? 'Tomorrow' : `In ${daysUntilRkDate} days`
            const rkFutureDateHint = 'Attendance marking opens on the event day'
            // All three groups render side by side now instead of one at a time behind a
            // tab switcher, so every group's derived data (roster, presence map, counts) is
            // computed up front here rather than for a single "active" group.
            const groupsData = RK_CLASS_GROUPS.map((g) => {
              const isSundaySchool = g.key === 'sunday-school'
              const groupKids = rkChildren.filter(c => !(c.classGroups || []).length || c.classGroups.includes(g.key))
              const rkPresent = rkAttendanceByGroup[g.key] || {}
              const isKidPresent = (c) => isSundaySchool
                ? rkReportKidsNames.some(n => (n || '').trim().toLowerCase() === c.name.trim().toLowerCase())
                : !!rkPresent[c.id]
              return { ...g, isSundaySchool, groupKids, rkPresent, isKidPresent, presentCount: groupKids.filter(isKidPresent).length }
            })
            // A kid's presence toggle merges their name into/out of the Sunday Ministry
            // report's "River Kids" list — that's the single total Sunday Ministry shows,
            // so it must reflect every column, not just whichever one was tapped.
            const toggleKidPresence = async (g, c, isPresent) => {
              if (!canEditRkAttendance || !department || isFutureRkDate) return
              const trimmedName = c.name.trim()
              const norm = trimmedName.toLowerCase()
              const newReportNames = isPresent
                ? rkReportKidsNames.filter(n => (n || '').trim().toLowerCase() !== norm)
                : rkReportKidsNames.some(n => (n || '').trim().toLowerCase() === norm)
                  ? rkReportKidsNames
                  : [...rkReportKidsNames, trimmedName]
              try {
                await patchSundayReportRiverKids(rkDate, newReportNames, userProfile?.email || userProfile?.displayName || 'unknown')
              } catch (error) {
                console.error('Attendance Save Error (Sunday report River Kids sync):', error)
                alert(rkPermissionErrorMessage(error))
              }
              if (!g.isSundaySchool) {
                const previous = g.rkPresent
                const next = { ...g.rkPresent, [c.id]: !isPresent }
                setRkAttendanceByGroup(prev => ({ ...prev, [g.key]: next }))
                try {
                  await setDepartmentChildAttendance(department.name, rkDate, g.key, next, userProfile?.email || userProfile?.displayName || 'unknown')
                } catch (error) {
                  console.error('Attendance Save Error:', error)
                  // Roll the optimistic toggle back — otherwise a failed write (e.g.
                  // permission-denied) leaves the badge showing the new state even
                  // though nothing was actually saved.
                  setRkAttendanceByGroup(prev => ({ ...prev, [g.key]: previous }))
                  alert(rkPermissionErrorMessage(error))
                }
              }
            }
            // Every toggle above already auto-saves as it happens (setDepartmentChildAttendance
            // + patchSundayReportRiverKids) — this button re-asserts the CURRENT on-screen state
            // for every column back to Firestore in one explicit action, so staff get a
            // definitive "it's saved" confirmation instead of trusting a silent per-tap write.
            const saveRkAttendance = async () => {
              if (!canEditRkAttendance || !department || rkAttendanceSaving || isFutureRkDate) return
              setRkAttendanceSaving(true)
              try {
                for (const g of groupsData) {
                  if (!g.isSundaySchool) {
                    await setDepartmentChildAttendance(department.name, rkDate, g.key, g.rkPresent, userProfile?.email || userProfile?.displayName || 'unknown')
                  }
                }
                // Shared across all three groups — this is the same field Sunday Ministry's
                // dashboard reads for the live "River Kids" attendance total.
                await patchSundayReportRiverKids(rkDate, rkReportKidsNames, userProfile?.email || userProfile?.displayName || 'unknown')
                const totalPresent = groupsData.reduce((sum, g) => sum + g.presentCount, 0)
                const totalKids = groupsData.reduce((sum, g) => sum + g.groupKids.length, 0)
                setRkAttendanceToast(`Saved — ${totalPresent} present of ${totalKids} total across all groups. Synced to Sunday Ministry.`)
                setTimeout(() => setRkAttendanceToast(''), 3500)
              } catch (error) {
                console.error('Attendance Save Error (Save button):', error)
                alert(rkPermissionErrorMessage(error))
              } finally {
                setRkAttendanceSaving(false)
              }
            }
            return (
              <div className="space-y-3">
                {/* Date row */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="font-bold text-slate-800">Attendance</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <span className="text-xs font-medium text-slate-500">Date</span>
                      <button
                        type="button"
                        onClick={() => setRkDate(d => format(subWeeks(new Date(d + 'T00:00:00'), 1), 'yyyy-MM-dd'))}
                        aria-label="Previous week"
                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                      >
                        ‹
                      </button>
                      <DateInput
                        value={rkDate}
                        // All three groups (Sunday + Saturday services) now share one date
                        // picker, so it's a plain free-pick date — no weekday snapping.
                        onChange={e => { if (e.target.value) setRkDate(e.target.value) }}
                        className="px-2 py-1.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                      <button
                        type="button"
                        onClick={() => setRkDate(d => format(addWeeks(new Date(d + 'T00:00:00'), 1), 'yyyy-MM-dd'))}
                        aria-label="Next week"
                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                      >
                        ›
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={!canEditRkAttendance || rkAttendanceSaving || isFutureRkDate}
                      onClick={saveRkAttendance}
                      title={isFutureRkDate ? rkFutureDateHint : undefined}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold shadow-sm hover:bg-indigo-700 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {rkAttendanceSaving ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Saving…
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={14} />
                          Save Attendance
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Sunday School / River Kids-1 / River Kids-2 side by side — 3 columns on
                    desktop (md:grid-cols-3), stacked on phones (grid-cols-1). */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {groupsData.map((g) => (
                    <div key={g.key} className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                      {/* Header badge — section name + live Present/Total (or countdown). */}
                      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-slate-800">{g.label}</span>
                        {isFutureRkDate ? (
                          <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-amber-50 text-amber-600 border border-amber-100 whitespace-nowrap">
                            {rkCountdownLabel}
                          </span>
                        ) : (
                          <span className="text-xs font-semibold px-2 py-1 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100 whitespace-nowrap">
                            {g.presentCount} / {g.groupKids.length}
                          </span>
                        )}
                      </div>
                      {g.isSundaySchool && (
                        <div className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-50/60 border-b border-indigo-100/60">
                          <span className="text-indigo-400 text-xs">↔</span>
                          <p className="text-[10px] text-indigo-500">Synced with Sunday Ministry Live Control</p>
                        </div>
                      )}
                      {/* Scrollable kid list — tap a pill to mark present/absent. */}
                      <div className="p-3 max-h-[420px] overflow-y-auto">
                        {rkLoading ? (
                          <p className="text-center text-slate-400 text-xs py-6">Loading…</p>
                        ) : g.groupKids.length === 0 ? (
                          <p className="text-center text-slate-400 text-xs py-6">No kids in this group yet.</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {g.groupKids.map((c) => {
                              const age = c.dob ? differenceInYears(new Date(), new Date(c.dob)) : null
                              const isPresent = g.isKidPresent(c)
                              const parents = [c.fatherName, c.motherName].filter(Boolean).join(' · ')
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  disabled={!canEditRkAttendance || isFutureRkDate}
                                  title={isFutureRkDate ? rkFutureDateHint : (parents || undefined)}
                                  onClick={() => toggleKidPresence(g, c, isPresent)}
                                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition active:scale-95 ${
                                    isPresent
                                      ? 'bg-emerald-500 text-white border-emerald-600 shadow-sm'
                                      : isFutureRkDate
                                        // Not "absent" — just not taken yet. Dashed + faded reads as
                                        // pending rather than as a no-show marked before the event.
                                        ? 'bg-white text-slate-400 border-slate-200 border-dashed'
                                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                  } ${!canEditRkAttendance || isFutureRkDate ? 'cursor-not-allowed' : ''} ${!canEditRkAttendance ? 'opacity-50' : ''}`}
                                >
                                  {c.name}
                                  {age !== null && <span className={`ml-1 ${isPresent ? 'text-emerald-100' : 'text-slate-400'}`}>· {age}y</span>}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* "Attendance saved" confirmation for the Save Attendance button above. */}
                <AnimatePresence>
                  {rkAttendanceToast && (
                    <motion.div
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 16 }}
                      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-slate-900 text-white text-sm font-medium shadow-lg"
                    >
                      <CheckCircle2 size={16} className="text-emerald-400" />
                      {rkAttendanceToast}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })()}
    </>
  )
}
