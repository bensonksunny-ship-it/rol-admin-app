import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckSquare, Check, Trash2, Users, X } from 'lucide-react'
import { subscribeTasksForDepartments, updateTask, deleteTask, getCellGroups, addCellGroupMember } from '../../services/firestore'
import { useAuth } from '../../context/AuthContext'
import { getDepartmentPath } from '../../constants/departments'
import { formatDMY } from '../../utils/date'

// Resolves where clicking a task should land. Tasks added via a notification's "+ Add
// to To-Do" already carry the exact URL (t.deepLink — see useActionNotifications).
// Tasks created directly elsewhere (e.g. CellDirectorCockpit's "Consult D Light
// Director") don't have that field but do carry the same flags DepartmentHub already
// reads to auto-open their modal (?openConsultId=, matched against cellAssignConsult),
// so recognize those directly rather than just landing on the bare department hub.
function taskDeepLink(t) {
  if (t.deepLink) return t.deepLink
  if (t.cellAssignConsult) return `/department/d-light?tab=summary&openConsultId=${t.id}`
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

// Checklist card: check off or delete a task right here, or click it to jump straight
// to its action modal / department tab (taskDeepLink above). Live view of the same
// `tasks` collection via a real-time onSnapshot subscription, so nothing (including
// items added via a notification's "+ Add to To-Do List" action) needs a page refresh.
export default function ToDoListCard() {
  const { userProfile, isFounder } = useAuth()
  const navigate = useNavigate()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [completingIds, setCompletingIds] = useState(() => new Set())
  const [deletingIds, setDeletingIds] = useState(() => new Set())

  // Cell assignment (inline "Assign to [recommended cell]" / "Assign to Other…" on
  // consult_response To-Dos) — same underlying write CellDirectorCockpit's Unassigned
  // drawer uses (addCellGroupMember into cell_groups/{cellId}/members), so a Cell
  // Director can act on a D-Light recommendation right from the To-Do List without
  // navigating to the Cell Hub.
  const [cellGroups, setCellGroups] = useState([])
  const [assigningId, setAssigningId] = useState(null)
  const [toast, setToast] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

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

  const myTasks = useMemo(() => {
    return tasks
      .filter((t) => t.status === 'Pending' || t.status === 'In Progress')
      .sort((a, b) => (a.deadline && b.deadline ? new Date(a.deadline) - new Date(b.deadline) : 0))
  }, [tasks])

  const completeTask = async (t) => {
    if (completingIds.has(t.id)) return
    setCompletingIds((prev) => new Set(prev).add(t.id))
    try {
      await updateTask(t.id, { status: 'Completed' })
    } catch {
      setCompletingIds((prev) => { const next = new Set(prev); next.delete(t.id); return next })
    }
  }

  // Two-tap delete (tap trash to arm, tap the confirm check to actually delete) instead
  // of window.confirm — a native blocking dialog is one more thing that can behave
  // unpredictably (browser/extension/embedded-context quirks); this keeps everything
  // inside React so it's easy to reason about and test. Removes from local `tasks`
  // state immediately (optimistic), then deletes the Firestore doc; if the write
  // fails, the task is put back and the actual error is surfaced in the toast instead
  // of silently doing nothing, so a permission-denied failure is visibly a failure —
  // not indistinguishable from "worked, but slow."
  const removeTask = async (t) => {
    if (deletingIds.has(t.id)) return
    setConfirmDeleteId(null)
    setDeletingIds((prev) => new Set(prev).add(t.id))
    setTasks((prev) => prev.filter((x) => x.id !== t.id))
    try {
      await deleteTask(t.id)
    } catch (err) {
      setTasks((prev) => (prev.some((x) => x.id === t.id) ? prev : [...prev, t]))
      showToast(`Failed to delete: ${err?.code || err?.message || 'unknown error'}`, 'error')
    } finally {
      setDeletingIds((prev) => { const next = new Set(prev); next.delete(t.id); return next })
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
      await updateTask(t.id, { status: 'Completed' })
      if (t.sourceConsultTaskId) {
        try { await updateTask(t.sourceConsultTaskId, { status: 'Completed' }) } catch { /* non-fatal */ }
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
          pixels, never a fixed card footprint. */}
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
        ) : myTasks.length > 0 ? (
          <span className="text-[11px] font-bold min-w-[20px] text-center px-2 py-0.5 rounded-full bg-amber-500 text-white">
            {myTasks.length}
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

              <div className="px-5 pb-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
                    <CheckSquare size={18} strokeWidth={1.75} />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">To-Do List</p>
                    <p className="text-xs mt-0.5 text-slate-400 dark:text-slate-500">{myTasks.length} need attention</p>
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

              <div className="flex-1 overflow-y-auto overscroll-contain">
                {loading ? (
                  <p className="px-5 py-5 text-sm text-center text-slate-400 dark:text-slate-500">Loading…</p>
                ) : myTasks.length === 0 ? (
                  <p className="px-5 py-8 text-sm text-center text-slate-400 dark:text-slate-500">All clear — no open tasks 🎉</p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    <AnimatePresence initial={false}>
                      {myTasks.map((t) => (
                        <motion.div
                          key={t.id}
                          layout
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
                          className="group w-full px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <motion.button
                              type="button"
                              onClick={() => completeTask(t)}
                              disabled={completingIds.has(t.id)}
                              aria-label="Mark task complete"
                              whileTap={{ scale: 0.8 }}
                              className="min-h-[44px] min-w-[44px] flex-shrink-0 flex items-center justify-center transition-colors disabled:opacity-50"
                            >
                              <span className="w-5 h-5 rounded-md border-2 border-slate-300 dark:border-slate-600 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 flex items-center justify-center transition-colors">
                                <Check size={12} strokeWidth={3} className="text-emerald-600 dark:text-emerald-400 opacity-0 hover:opacity-100 transition-opacity" />
                              </span>
                            </motion.button>

                            <button
                              type="button"
                              onClick={() => { setIsOpen(false); navigate(taskDeepLink(t)) }}
                              className="flex-1 min-w-0 flex items-center gap-3 text-left min-h-[44px]"
                            >
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.status === 'In Progress' ? 'bg-[#6357c9]' : 'bg-amber-400'}`} />
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
                                t.status === 'In Progress' ? 'bg-[#efecfb] dark:bg-[#6357c9]/15 text-[#6357c9] dark:text-[#a599e8]' : 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400'
                              }`}>{t.status}</span>
                            </button>

                            {confirmDeleteId === t.id ? (
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); removeTask(t) }}
                                  disabled={deletingIds.has(t.id)}
                                  aria-label="Confirm delete"
                                  title="Confirm delete"
                                  className="min-h-[44px] px-3 rounded-lg bg-rose-600 text-white text-[11px] font-semibold hover:bg-rose-700 active:scale-95 transition-all disabled:opacity-50"
                                >
                                  {deletingIds.has(t.id) ? '…' : 'Delete?'}
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); setConfirmDeleteId(null) }}
                                  aria-label="Cancel delete"
                                  title="Cancel"
                                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-90 transition-all"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); setConfirmDeleteId(t.id) }}
                                aria-label="Delete task"
                                title="Delete task"
                                className="min-h-[44px] min-w-[44px] flex items-center justify-center flex-shrink-0 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 hover:!text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 active:scale-90 transition-all"
                              >
                                <Trash2 size={14} strokeWidth={2} />
                              </button>
                            )}
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
                      ))}
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
