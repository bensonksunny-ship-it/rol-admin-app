import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckSquare } from 'lucide-react'
import { getTasks } from '../../services/firestore'
import { useAuth } from '../../context/AuthContext'
import { getDepartmentPath } from '../../constants/departments'
import { formatDMY } from '../../utils/date'

function myDepartmentNames(userProfile) {
  const fromPositions = Array.isArray(userProfile?.positions)
    ? userProfile.positions.map((p) => p?.department).filter(Boolean)
    : []
  const fromDepartments = Array.isArray(userProfile?.departments)
    ? userProfile.departments.filter(Boolean)
    : []
  const fromPrimary = userProfile?.department ? [userProfile.department] : []
  return new Set([...fromPositions, ...fromDepartments, ...fromPrimary].map((d) => String(d).trim().toLowerCase()))
}

// Active tasks relevant to the user's departments, pulled from the same `tasks`
// collection as the Tasks page — no separate "prep checklist" data model.
export default function MyTasksCard() {
  const { userProfile, isFounder } = useAuth()
  const navigate = useNavigate()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getTasks().then(setTasks).catch(() => setTasks([])).finally(() => setLoading(false))
  }, [])

  const myDepts = useMemo(() => myDepartmentNames(userProfile), [userProfile])

  const myTasks = useMemo(() => {
    return tasks
      .filter((t) => t.status === 'Pending' || t.status === 'In Progress')
      .filter((t) => isFounder || myDepts.has(String(t.department || '').trim().toLowerCase()))
      .sort((a, b) => (a.deadline && b.deadline ? new Date(a.deadline) - new Date(b.deadline) : 0))
  }, [tasks, myDepts, isFounder])

  const openTask = (t) => {
    const to = t.department ? getDepartmentPath(t.department) : '/tasks'
    navigate(to)
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
            <CheckSquare size={18} strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-sm font-bold text-slate-800">My Tasks</p>
            <p className="text-xs text-slate-400 mt-0.5">{myTasks.length} need attention</p>
          </div>
        </div>
        <Link to="/tasks" className="text-xs text-indigo-600 font-medium hover:underline flex-shrink-0">View all →</Link>
      </div>
      {loading ? (
        <p className="px-5 py-8 text-sm text-slate-400 text-center">Loading…</p>
      ) : myTasks.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate-400 text-center">All clear — no open tasks 🎉</p>
      ) : (
        <div className="divide-y divide-slate-50 overflow-y-auto max-h-80">
          {myTasks.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => openTask(t)}
              className="w-full text-left flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors"
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
          ))}
        </div>
      )}
    </div>
  )
}
