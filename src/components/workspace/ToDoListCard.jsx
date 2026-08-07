import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckSquare, Check, XCircle, Users, X } from 'lucide-react'
import { subscribeTasksForDepartments, markTaskCompleted, markTaskTurnedDown, getCellGroups, addCellGroupMember } from '../../services/firestore'
import { useAuth } from '../../context/AuthContext'
import { getDepartmentPath } from '../../constants/departments'
import { formatDMY } from '../../utils/date'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

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
  // "Add [Name] to a cell group" (Caring -> Cell, carries memberId) and "Add [Name] to
  // D-Light" (Caring -> D-Light, no memberId). Only the first has anywhere useful to
  // deep-link into — send it straight to that person's PCS profile drawer instead of
  // falling through to the D-Light route below, which is for the other task shape.
  if (t.pcsReferral && t.memberId) return `/department/caring?tab=pcs&memberId=${encodeURIComponent(t.memberId)}`
  if (t.pcsReferral) return '/department/d-light?tab=visitorEntry'
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

// The moment a task's 30-day retention clock starts counting down from — whichever
// action last touched it, falling back to when it was created for still-pending items.
function taskAnchorTime(t) {
  const anchor = t.completedAt || t.turnedDownAt || t.createdAt
  const d = anchor instanceof Date ? anchor : anchor ? new Date(anchor) : null
  return d && !isNaN(d.getTime()) ? d.getTime() : Date.now()
}

// Checklist card: mark a task Completed or Turned Down right here, or click it to jump
// straight to its action modal / department tab (taskDeepLink above). Live view of the
// same `tasks` collection via a real-time onSnapshot subscription — spans every
// department a task can be created from (Sec-Core referrals, Caring PCS referrals,
// Cell consult requests, etc.), so this one list is the app's single global To-Do List.
// Completed/Turned Down items stay visible (greyed out) for 30 days instead of vanishing
// the instant they're actioned — see taskAnchorTime above.
export default function ToDoListCard() {
  const { userProfile, isFounder } = useAuth()
  const navigate = useNavigate()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [completingIds, setCompletingIds] = useState(() => new Set())
  const [turningDownIds, setTurningDownIds] = useState(() => new Set())

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

  // Every task within its 30-day retention window, regardless of status — this is the
  // full list rendered in the drawer. Active items surface first (soonest deadline
  // first); resolved items (Completed/Turned Down) sink below them, most recent first.
  const myTasks = useMemo(() => {
    const cutoff = Date.now() - THIRTY_DAYS_MS
    const relevant = ['Pending', 'In Progress', 'Completed', 'Turned Down']
    return tasks
      .filter((t) => relevant.includes(t.status) && taskAnchorTime(t) >= cutoff)
      .sort((a, b) => {
        const aActive = a.status === 'Pending' || a.status === 'In Progress'
        const bActive = b.status === 'Pending' || b.status === 'In Progress'
        if (aActive !== bActive) return aActive ? -1 : 1
        if (aActive) return (a.deadline && b.deadline) ? new Date(a.deadline) - new Date(b.deadline) : 0
        return taskAnchorTime(b) - taskAnchorTime(a)
      })
  }, [tasks])

  const activeTasks = useMemo(
    () => myTasks.filter((t) => t.status === 'Pending' || t.status === 'In Progress'),
    [myTasks]
  )
  const completedCount = useMemo(() => myTasks.filter((t) => t.status === 'Completed').length, [myTasks])
  const turnedDownCount = useMemo(() => myTasks.filter((t) => t.status === 'Turned Down').length, [myTasks])

  const completeTask = async (t) => {
    if (completingIds.has(t.id)) return
    setCompletingIds((prev) => new Set(prev).add(t.id))
    try {
      await markTaskCompleted(t.id)
    } finally {
      setCompletingIds((prev) => { const next = new Set(prev); next.delete(t.id); return next })
    }
  }

  const turnDownTask = async (t) => {
    if (turningDownIds.has(t.id)) return
    setTurningDownIds((prev) => new Set(prev).add(t.id))
    try {
      await markTaskTurnedDown(t.id)
    } finally {
      setTurningDownIds((prev) => { const next = new Set(prev); next.delete(t.id); return next })
    }
  }

  // Assigns the recommended/chosen person to a cell, completes this To-Do, and closes
  // out the original D-Light consult task (if any) so its "pending" notification stops
  // reappearing — mirrors CellDirectorCockpit's handleAssign exactly.
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
      await markTaskCompleted(t.id)
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

      {/* Expanded state: bottom-sheet drawer, opened on tap */}
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
            <motion.div
              key="todo-sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col bg-gradient-to-b from-white to-white/95 dark:from-slate-900 dark:to-slate-900/95 backdrop-blur-md"
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-slate-700" />
              </div>

              <div className="px-5 pb-4 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
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

                {/* Action counter summary — last 30 days */}
                {(completedCount > 0 || turnedDownCount > 0) && (
                  <div className="flex items-center gap-2 mt-3">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <Check size={11} strokeWidth={3} /> {completedCount} Completed
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                      <XCircle size={11} strokeWidth={2.5} /> {turnedDownCount} Turned Down
                    </span>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto overscroll-contain">
                {loading ? (
                  <p className="px-5 py-5 text-sm text-center text-slate-400 dark:text-slate-500">Loading…</p>
                ) : myTasks.length === 0 ? (
                  <p className="px-5 py-8 text-sm text-center text-slate-400 dark:text-slate-500">All clear — no open tasks 🎉</p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    <AnimatePresence initial={false}>
                      {myTasks.map((t) => {
                        const isResolved = t.status === 'Completed' || t.status === 'Turned Down'
                        return (
                        <motion.div
                          key={t.id}
                          layout
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
                          className={`group w-full px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${isResolved ? 'grayscale opacity-60' : ''}`}
                        >
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => { setIsOpen(false); navigate(taskDeepLink(t)) }}
                              className="flex-1 min-w-0 flex items-center gap-3 text-left min-h-[44px]"
                            >
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                t.status === 'Completed' ? 'bg-emerald-500'
                                  : t.status === 'Turned Down' ? 'bg-slate-400'
                                  : t.status === 'In Progress' ? 'bg-[#6357c9]' : 'bg-amber-400'
                              }`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{t.taskTitle || t.task || 'Untitled'}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {t.department && (
                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                                      [{t.department}]
                                    </span>
                                  )}
                                  {t.deadline && <span className="text-xs text-slate-400 dark:text-slate-500">{formatDMY(t.deadline)}</span>}
                                </div>
                              </div>
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                                t.status === 'Completed' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  : t.status === 'Turned Down' ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                                  : t.status === 'In Progress' ? 'bg-[#efecfb] dark:bg-[#6357c9]/15 text-[#6357c9] dark:text-[#a599e8]' : 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400'
                              }`}>{t.status}</span>
                            </button>

                            {/* Right-side actions — only for still-active items; a
                                resolved item just shows its status badge above. These
                                buttons are siblings of the title button, not nested
                                inside it, so a click here never bubbles into its
                                onClick anyway — stopPropagation is just defense in
                                depth against that ever changing. */}
                            {!isResolved && (
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
                            )}
                          </div>

                          {/* Cell assignment — quick-assign to D-Light's recommended cell, or pick another */}
                          {!isResolved && t.cellAssignRecommendation && (
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
          </>
        )}
      </AnimatePresence>
    </>
  )
}
