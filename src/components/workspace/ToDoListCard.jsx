import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckSquare, Check, Trash2, Users } from 'lucide-react'
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
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col relative">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-2xl text-white shadow-xl text-sm font-semibold ${
          toast.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'
        }`}>
          {toast.msg}
        </div>
      )}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
            <CheckSquare size={18} strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-sm font-bold text-slate-800">To-Do List</p>
            <p className="text-xs text-slate-400 mt-0.5">{myTasks.length} need attention</p>
          </div>
        </div>
      </div>
      {loading ? (
        <p className="px-5 py-8 text-sm text-slate-400 text-center">Loading…</p>
      ) : myTasks.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate-400 text-center">All clear — no open tasks 🎉</p>
      ) : (
        <div className="divide-y divide-slate-50 overflow-y-auto max-h-80">
          {myTasks.map((t) => (
            <div key={t.id} className="group w-full px-5 py-3 hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => completeTask(t)}
                  disabled={completingIds.has(t.id)}
                  aria-label="Mark task complete"
                  className="w-5 h-5 rounded-md border-2 border-slate-300 hover:border-emerald-500 hover:bg-emerald-50 flex-shrink-0 flex items-center justify-center transition-colors disabled:opacity-50"
                >
                  <Check size={12} strokeWidth={3} className="text-emerald-600 opacity-0 hover:opacity-100 transition-opacity" />
                </button>

                <button
                  type="button"
                  onClick={() => navigate(taskDeepLink(t))}
                  className="flex-1 min-w-0 flex items-center gap-3 text-left"
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.status === 'In Progress' ? 'bg-indigo-500' : 'bg-amber-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{t.taskTitle || t.task || 'Untitled'}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {t.department && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                          [{t.department}]
                        </span>
                      )}
                      {t.deadline && <span className="text-xs text-slate-400">{formatDMY(t.deadline)}</span>}
                    </div>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                    t.status === 'In Progress' ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'
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
                      className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-semibold hover:bg-rose-700 transition-colors disabled:opacity-50"
                    >
                      {deletingIds.has(t.id) ? '…' : 'Delete?'}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); setConfirmDeleteId(null) }}
                      aria-label="Cancel delete"
                      title="Cancel"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors"
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
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-slate-300 opacity-0 group-hover:opacity-100 hover:!text-rose-600 hover:bg-rose-50 transition-colors"
                  >
                    <Trash2 size={14} strokeWidth={2} />
                  </button>
                )}
              </div>

              {/* Cell assignment — quick-assign to D-Light's recommended cell, or pick another */}
              {t.cellAssignRecommendation && (
                <div className="flex items-center flex-wrap gap-1.5 mt-2 pl-8">
                  {t.recommendedCellId && (
                    <button
                      type="button"
                      disabled={assigningId === t.id}
                      onClick={() => assignToCell(t, t.recommendedCellId)}
                      className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                    >
                      <Users size={12} strokeWidth={2} />
                      {assigningId === t.id ? 'Assigning…' : `Assign to ${t.recommendedCellName || 'recommended cell'}`}
                    </button>
                  )}
                  <select
                    value=""
                    disabled={assigningId === t.id || activeCells.length === 0}
                    onChange={(e) => assignToCell(t, e.target.value)}
                    className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 max-w-[160px]"
                  >
                    <option value="" disabled>Assign to Other…</option>
                    {activeCells.map((c) => (
                      <option key={c.id} value={c.id}>{c.cellName || c.id}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
