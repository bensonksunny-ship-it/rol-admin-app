import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckSquare, Check, XCircle, Users, X } from 'lucide-react'
import { subscribeTasksForDepartments, markTaskCompleted, markTaskTurnedDown, getCellGroups, addCellGroupMember } from '../../services/firestore'
import { useAuth } from '../../context/AuthContext'
import { getDepartmentPath } from '../../constants/departments'
import { formatDMY } from '../../utils/date'
import { getDepartmentRole } from '../../utils/access'

// Resolves where clicking a task should land. Tasks added via a notification's "+ Add
// to To-Do" already carry the exact URL (t.deepLink — see useActionNotifications).
// Tasks created directly elsewhere (e.g. CellDirectorCockpit's "Consult D Light
// Director") don't have that field but do carry the same flags DepartmentHub already
// reads to auto-open their modal (?openConsultId=, matched against cellAssignConsult),
// so recognize those directly rather than just landing on the bare department hub.
function taskDeepLink(t) {
  if (t.deepLink) return t.deepLink
  if (t.cellAssignConsult) return `/department/d-light?tab=summary&openConsultId=${t.id}`
  // `pcsReferral` is shared by two different task shapes (DepartmentHub.jsx):
  // "Add [Name] to a cell group" (Caring -> Cell) and "Add [Name] to D-Light"
  // (Caring -> D-Light). Each has its own specific place to land: the "Recommendation
  // for [Name]" popup pre-loaded with this referral (DepartmentHub reads
  // openPcsReferralTaskId — same modal/write path as a D-Light consult response, just
  // targeting the referral task directly), or the D-Light Visitor Entry tab's
  // "Forwarded from PCS" section pre-expanded and scrolled to this person's row
  // (DepartmentHub reads openPcsForwardTaskId) — never just the bare Visitor Entry tab.
  // Discriminated by `department` (always stamped at creation: 'Cell' vs 'D Light'),
  // not by field presence like memberId — a Cell referral missing that field for any
  // reason must still never fall through to the D-Light branch below it.
  if (t.pcsReferral && t.department === 'Cell') return `/department/cell?openPcsReferralTaskId=${encodeURIComponent(t.id)}`
  if (t.pcsReferral && t.department === 'D Light') return `/department/d-light?tab=visitorEntry&openPcsForwardTaskId=${encodeURIComponent(t.id)}`
  if (t.department) return getDepartmentPath(t.department)
  return '/tasks'
}

function myDepartmentNames(userProfile) {
  const fromPositions = Array.isArray(userProfile?.positions)
    ? userProfile.positions.map((p) => p?.department).filter(Boolean)
    : []
  const fromDepartments = Array.isArray(userProfile?.departments)
    ? userProfile.departments.filter(Boolean)
    : []
  const fromPrimary = userProfile?.department ? [userProfile.department] : []
  return [...new Set([...fromPositions, ...fromDepartments, ...fromPrimary])]
}

// Newest-wins tiebreak when collapsing duplicate active tasks into one row.
function createdMs(t) {
  const d = t.createdAt instanceof Date ? t.createdAt : t.createdAt ? new Date(t.createdAt) : null
  return d && !isNaN(d.getTime()) ? d.getTime() : 0
}

// Groups a task into "the same pending action" as any other task sharing this key.
// Every createTask() call site that's about a specific person now stamps personId +
// taskType directly (see DepartmentHub.jsx, CellDirectorCockpit.jsx, MidweekMinistry.jsx,
// useActionNotifications.js) — grouping on that pair is what lets a re-sent PCS
// referral, a re-triggered consult reminder, etc. collapse into one row instead of a
// duplicate. Older tasks written before that tagging existed fall back to the same
// identity fields those flows have always used for their own "already sent?" checks
// (memberId/pcsPersonVisitorId/consultPersonVisitorId + a phone fallback), so this
// still dedupes without needing a data migration. A task with no recognizable identity
// at all (e.g. a free-form entry from the admin Tasks page) gets its own unique key —
// it never merges with anything.
function taskDedupeKey(t) {
  if (t.taskType && t.personId) return `${t.taskType}:${t.personId}`
  const legacyPersonId = t.memberId || t.pcsPersonVisitorId || t.consultPersonVisitorId ||
    (t.memberPhone || t.pcsPersonPhone || t.consultPersonPhone || '').replace(/\s+/g, '')
  if (!legacyPersonId) return null
  const legacyType = t.pcsReferral ? `pcsReferral:${t.department || ''}`
    : t.cellAssignConsult ? 'cellAssignConsult'
    : t.cellAssignRecommendation ? 'cellAssignRecommendation'
    : t.department || 'task'
  return `${legacyType}:${legacyPersonId}`
}

// "Nth reminder"/"Urgent" pill shown on a row that collapsed 2+ pending duplicates —
// see displayTasks below. Intentionally silent (returns null) for a single occurrence.
function escalationBadge(count) {
  if (count === 2) return { label: '2nd Reminder', cls: 'bg-amber-500 text-white' }
  if (count >= 3) return { label: 'Urgent', cls: 'bg-red-600 text-white' }
  return null
}

// Checklist card: mark a task Completed or Turned Down right here, or click it to jump
// straight to its action modal / department tab (taskDeepLink above). Live view of the
// same `tasks` collection via a real-time onSnapshot subscription — spans every
// department a task can be created from (Sec-Core referrals, Caring PCS referrals,
// Cell consult requests, etc.), so this one list is the app's single global To-Do List.
// A task drops off this list the instant it's completed or turned down (the task
// doc keeps its status for the admin Tasks page / reporting).
export default function ToDoListCard() {
  const { userProfile, isFounder, user } = useAuth()
  const navigate = useNavigate()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [completingIds, setCompletingIds] = useState(() => new Set())
  const [turningDownIds, setTurningDownIds] = useState(() => new Set())
  // Removed-on-tap: the instant ✓/✕ is pressed we drop the row(s) locally so the
  // line vanishes without waiting for the status write to round-trip. Rolled back
  // if the write fails.
  const [hiddenIds, setHiddenIds] = useState(() => new Set())

  // Cell assignment (inline "Assign to [recommended cell]" / "Assign to Other…" on
  // consult_response To-Dos) — same underlying write CellDirectorCockpit's Unassigned
  // drawer uses (addCellGroupMember into cell_groups/{cellId}/members), so a Cell
  // Director can act on a D-Light recommendation right from the To-Do List without
  // navigating to the Cell Hub.
  const [cellGroups, setCellGroups] = useState([])
  const [assigningId, setAssigningId] = useState(null)
  const [toast, setToast] = useState(null)

  // Collapsed-by-default: the card itself no longer renders inline. It lives behind a
  // floating capsule badge and only expands into a bottom-sheet drawer on tap, so it
  // stops permanently occupying dashboard space regardless of how many tasks exist.
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    getCellGroups('Cell').then(setCellGroups).catch(() => setCellGroups([]))
  }, [])

  const activeCells = useMemo(() => cellGroups.filter((g) => g.status !== 'inactive'), [cellGroups])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const myDepts = useMemo(() => myDepartmentNames(userProfile), [userProfile])

  useEffect(() => {
    setLoading(true)
    const unsubscribe = subscribeTasksForDepartments(isFounder ? null : myDepts, (rows) => {
      setTasks(rows)
      setLoading(false)
    })
    return unsubscribe
  }, [isFounder, myDepts])

  // subscribeTasksForDepartments queries by department only — it has no way to also
  // scope to *who* a task is for, so any task stamped with an assignedToUid (personal
  // items created via "+ Add to To-Do", e.g. a PCS "Fill profile for [Name]" request
  // addressed to one specific Cell Leader) comes back for every department member,
  // not just its intended recipient. Filter those out here before they ever reach the
  // list a Cell Leader/Director sees — tasks with no assignedToUid are genuine
  // department-wide broadcasts (referrals, consult requests) and stay visible to all,
  // UNLESS the task also carries visibleToRole (e.g. "Add [Name] to a cell group" is a
  // placement decision meant only for the Cell Director, not every Cell Leader in the
  // department) — that's checked against the viewer's actual role in that department,
  // the same DIRECTOR/COORDINATOR distinction getDepartmentRole() already uses to gate
  // department-head-only UI elsewhere in the app.
  const myUid = user?.uid
  const scopedTasks = useMemo(
    () => tasks.filter((t) => {
      if (t.assignedToUid && t.assignedToUid !== myUid && !isFounder) return false
      if (t.visibleToRole && !isFounder && getDepartmentRole(userProfile, t.department) !== t.visibleToRole) return false
      return true
    }),
    [tasks, myUid, isFounder, userProfile]
  )

  // Only active items are ever shown — a line disappears from this list the moment
  // it's completed or turned down. Soonest deadline first.
  const myTasks = useMemo(() => {
    return scopedTasks
      .filter((t) => t.status === 'Pending' || t.status === 'In Progress')
      .sort((a, b) => (a.deadline && b.deadline) ? new Date(a.deadline) - new Date(b.deadline) : 0)
  }, [scopedTasks])

  // Collapses myTasks down to one row per taskDedupeKey — "each pending action appears
  // only once in the list". When a key has 2+ duplicates, the most recently created
  // one is kept as the visible row (freshest title/notes/deadline) and the rest are
  // folded into it via mergedTaskIds, so completing/turning-down the row resolves
  // every duplicate at once. occurrenceCount drives the "2nd Reminder"/"Urgent" badge.
  // `hiddenIds` drops rows that were just actioned before the write round-trips.
  const displayTasks = useMemo(() => {
    const groups = new Map()
    const order = []
    myTasks.forEach((t) => {
      if (hiddenIds.has(t.id)) return
      const key = taskDedupeKey(t)
      const groupKey = key || `__solo:${t.id}`
      if (!groups.has(groupKey)) { groups.set(groupKey, []); order.push(groupKey) }
      groups.get(groupKey).push(t)
    })
    return order.map((groupKey) => {
      const items = groups.get(groupKey)
      if (items.length === 1) return items[0]
      const representative = items.reduce((latest, cur) => (createdMs(cur) > createdMs(latest) ? cur : latest))
      return {
        ...representative,
        mergedTaskIds: items.map((i) => i.id),
        occurrenceCount: items.length,
      }
    })
  }, [myTasks, hiddenIds])

  // Every remaining task is active; alias kept to minimise churn below.
  const activeTasks = displayTasks

  // Shared path for ✓ Complete and ✕ Turn Down: hide the row(s) immediately, run
  // the status write(s), roll the hide back with a toast if the write fails.
  const resolveTask = async (t, actionFn, pendingSet, setPendingSet) => {
    if (pendingSet.has(t.id)) return
    const ids = t.mergedTaskIds || [t.id]
    setPendingSet((prev) => new Set(prev).add(t.id))
    setHiddenIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.add(id)); return next })
    try {
      await Promise.all(ids.map((id) => actionFn(id)))
    } catch {
      setHiddenIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next })
      showToast('Could not update the task. Please try again.', 'error')
    } finally {
      setPendingSet((prev) => { const next = new Set(prev); next.delete(t.id); return next })
    }
  }

  const completeTask = (t) => resolveTask(t, markTaskCompleted, completingIds, setCompletingIds)
  const turnDownTask = (t) => resolveTask(t, markTaskTurnedDown, turningDownIds, setTurningDownIds)

  // Assigns the recommended/chosen person to a cell, completes this To-Do (and every
  // duplicate merged into it), and closes out the original D-Light consult task(s) (if
  // any) so their "pending" notification stops reappearing — mirrors
  // CellDirectorCockpit's handleAssign exactly.
  const assignToCell = async (t, cellId) => {
    if (!cellId || assigningId) return
    setAssigningId(t.id)
    try {
      await addCellGroupMember(cellId, {
        name: t.consultPersonName || t.taskTitle || 'Unassigned',
        status: 'active',
        ...(t.consultPersonPhone ? { phone: t.consultPersonPhone } : {}),
        ...(t.consultPersonVisitorId ? { visitorId: t.consultPersonVisitorId } : {}),
      })
      const mergedIds = t.mergedTaskIds || [t.id]
      await Promise.all(mergedIds.map((id) => markTaskCompleted(id)))
      if (t.sourceConsultTaskId) {
        try { await markTaskCompleted(t.sourceConsultTaskId) } catch { /* non-fatal */ }
      }
      const cellName = activeCells.find((c) => c.id === cellId)?.cellName || 'the cell'
      showToast(`${t.consultPersonName || 'Member'} assigned to ${cellName}.`)
    } catch {
      showToast('Failed to assign. Please try again.', 'error')
    } finally {
      setAssigningId(null)
    }
  }

  return (
    <>
      {toast && (
        <div className={`fixed top-4 right-4 z-[60] px-5 py-3 rounded-2xl text-white shadow-xl text-sm font-semibold ${
          toast.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Collapsed state: floating capsule badge — takes only as much space as its own
          pixels, never a fixed card footprint. Badge count is active (actionable) tasks
          only — resolved items retained for their 30-day window don't inflate it. */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Open To-Do List"
        className="inline-flex items-center gap-2.5 min-h-[44px] pl-2 pr-4 py-1.5 rounded-full border border-white/30 dark:border-white/10 bg-gradient-to-b from-white/80 to-white/50 dark:from-slate-900/60 dark:to-slate-900/35 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:scale-105 active:scale-95 transition-all duration-150"
      >
        <span className="w-8 h-8 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
          <CheckSquare size={16} strokeWidth={1.75} />
        </span>
        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">To-Do</span>
        {loading ? (
          <span className="text-xs text-slate-400 dark:text-slate-500">…</span>
        ) : activeTasks.length > 0 ? (
          <span className="text-[11px] font-bold min-w-[20px] text-center px-2 py-0.5 rounded-full bg-amber-500 text-white">
            {activeTasks.length}
          </span>
        ) : (
          <span className="text-xs text-slate-400 dark:text-slate-500">All clear 🎉</span>
        )}
      </button>

      {/* Expanded state: centered modal dialog (A4-proportioned max width),
          opened on tap — was a full-width bottom sheet; the outer wrapper
          is a pointer-events-none centering frame so clicks in the margin
          around the panel still fall through to the backdrop's close handler. */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              key="todo-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50"
              onClick={() => setIsOpen(false)}
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
              <motion.div
                key="todo-sheet"
                initial={{ opacity: 0, scale: 0.95, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 8 }}
                transition={{ type: 'spring', damping: 30, stiffness: 320 }}
                className="w-full max-w-[640px] max-h-[85vh] rounded-3xl shadow-2xl flex flex-col bg-gradient-to-b from-white to-white/95 dark:from-slate-900 dark:to-slate-900/95 backdrop-blur-md pointer-events-auto"
              >
              <div className="px-5 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
                      <CheckSquare size={18} strokeWidth={1.75} />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">To-Do List</p>
                      <p className="text-xs mt-0.5 text-slate-400 dark:text-slate-500">{activeTasks.length} need attention</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    aria-label="Close To-Do List"
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-90 transition-all"
                  >
                    <X size={18} />
                  </button>
                </div>

              </div>

              <div className="flex-1 overflow-y-auto overscroll-contain">
                {loading ? (
                  <p className="px-5 py-5 text-sm text-center text-slate-400 dark:text-slate-500">Loading…</p>
                ) : displayTasks.length === 0 ? (
                  <p className="px-5 py-8 text-sm text-center text-slate-400 dark:text-slate-500">All clear — no open tasks 🎉</p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    <AnimatePresence initial={false}>
                      {displayTasks.map((t) => {
                        const badge = escalationBadge(t.occurrenceCount)
                        return (
                        <motion.div
                          key={t.id}
                          layout
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
                          className={`group w-full px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                            badge ? (t.occurrenceCount >= 3
                              ? 'border-l-4 border-red-500 bg-red-50/50 dark:bg-red-500/10'
                              : 'border-l-4 border-amber-400 bg-amber-50/50 dark:bg-amber-500/10')
                              : ''
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                // type="button" already keeps this out of any form-submit/
                                // native-navigation path, but stop it explicitly too — this
                                // row's own client-side navigate() below is the only
                                // navigation that should ever fire from this click.
                                e.preventDefault()
                                e.stopPropagation()
                                setIsOpen(false)
                                navigate(taskDeepLink(t))
                              }}
                              className="flex-1 min-w-0 flex items-center gap-3 text-left min-h-[44px]"
                            >
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                t.status === 'In Progress' ? 'bg-[#6357c9]' : 'bg-amber-400'
                              }`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{t.taskTitle || t.task || 'Untitled'}</p>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  {/* Escalation pill — this row folded in 2+ still-pending
                                      duplicate triggers for the same person/action (see
                                      displayTasks); occurrenceCount tracks how many. */}
                                  {badge && (
                                    <span
                                      title={`Triggered ${t.occurrenceCount} times`}
                                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${badge.cls}`}
                                    >
                                      {badge.label}
                                    </span>
                                  )}
                                  {t.department && (
                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                                      [{t.department}]
                                    </span>
                                  )}
                                  {t.deadline && <span className="text-xs text-slate-400 dark:text-slate-500">{formatDMY(t.deadline)}</span>}
                                </div>
                              </div>
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                                t.status === 'In Progress'
                                  ? 'bg-[#efecfb] dark:bg-[#6357c9]/15 text-[#6357c9] dark:text-[#a599e8]'
                                  : 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400'
                              }`}>{t.status}</span>
                            </button>

                            {/* Right-side actions. Siblings of the title button, not
                                nested inside it, so a click here never bubbles into its
                                onClick anyway — stopPropagation is just defense in
                                depth against that ever changing. */}
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <motion.button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); completeTask(t) }}
                                disabled={completingIds.has(t.id) || turningDownIds.has(t.id)}
                                aria-label="Task Completed"
                                title="Task Completed"
                                whileTap={{ scale: 0.85 }}
                                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-slate-300 dark:text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 active:scale-90 transition-all disabled:opacity-50"
                              >
                                <Check size={16} strokeWidth={2.5} />
                              </motion.button>
                              <motion.button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); turnDownTask(t) }}
                                disabled={completingIds.has(t.id) || turningDownIds.has(t.id)}
                                aria-label="Turn Down"
                                title="Turn Down"
                                whileTap={{ scale: 0.85 }}
                                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-slate-300 dark:text-slate-600 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 active:scale-90 transition-all disabled:opacity-50"
                              >
                                <XCircle size={16} strokeWidth={2} />
                              </motion.button>
                            </div>
                          </div>

                          {/* Cell assignment — quick-assign to D-Light's recommended cell, or pick another */}
                          {t.cellAssignRecommendation && (
                            <div className="flex items-center flex-wrap gap-1.5 mt-2 pl-11">
                              {t.recommendedCellId && (
                                <button
                                  type="button"
                                  disabled={assigningId === t.id}
                                  onClick={() => assignToCell(t, t.recommendedCellId)}
                                  className="inline-flex items-center gap-1 min-h-[44px] text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-50"
                                >
                                  <Users size={12} strokeWidth={2} />
                                  {assigningId === t.id ? 'Assigning…' : `Assign to ${t.recommendedCellName || 'recommended cell'}`}
                                </button>
                              )}
                              <select
                                value=""
                                disabled={assigningId === t.id || activeCells.length === 0}
                                onChange={(e) => assignToCell(t, e.target.value)}
                                className="text-xs font-medium min-h-[44px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 max-w-[160px]"
                              >
                                <option value="" disabled>Assign to Other…</option>
                                {activeCells.map((c) => (
                                  <option key={c.id} value={c.id}>{c.cellName || c.id}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </motion.div>
                        )
                      })}
                    </AnimatePresence>
                  </div>
                )}
              </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
