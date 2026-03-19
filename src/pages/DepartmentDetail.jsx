import { useParams, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { getTasks } from '../services/firestore'
import { getDepartmentBySlug } from '../constants/departments'
import { DEPARTMENTS } from '../constants/roles'
import DepartmentTabBar from '../components/DepartmentTabBar'
import { useAuth } from '../context/AuthContext'
import { isRestrictedDLightDirector } from '../utils/dlightAccess'

function getDepartmentName(slug) {
  const fromConfig = getDepartmentBySlug(slug)
  if (fromConfig) return fromConfig.name
  const found = DEPARTMENTS.find(
    (d) => d.toLowerCase().replace(/\s+/g, '-').replace(/'/g, '') === slug
  )
  return found || slug
}

export default function DepartmentDetail() {
  const { slug } = useParams()
  const { userProfile } = useAuth()
  const name = getDepartmentName(slug)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getTasks({ department: name }).then(setTasks).finally(() => setLoading(false))
  }, [name])

  if (slug === 'd-light' && isRestrictedDLightDirector(userProfile)) {
    return (
      <div>
        <DepartmentTabBar slug={slug} activeTab="summary" />
        <div className="p-6 text-slate-600">
          <Link to="/sunday-planning" className="text-blue-600 hover:underline">← Sunday Planning</Link>
          <p className="mt-4 text-lg font-semibold text-slate-800">Access Denied</p>
          <p className="mt-2 text-sm text-slate-600">D Light Directors may only use Sunday Planning.</p>
        </div>
      </div>
    )
  }

  const pending = tasks.filter((t) => t.status !== 'Completed')
  const completed = tasks.filter((t) => t.status === 'Completed')

  return (
    <div>
      <DepartmentTabBar slug={slug} activeTab="summary" />
      <div className="space-y-6 p-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total Tasks</p>
          <p className="text-2xl font-bold text-slate-800">{tasks.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm text-slate-500">Pending</p>
          <p className="text-2xl font-bold text-amber-600">{pending.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm text-slate-500">Completed</p>
          <p className="text-2xl font-bold text-emerald-600">{completed.length}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <h2 className="px-5 py-4 font-semibold text-slate-800 border-b border-slate-200">
          Tasks
        </h2>
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading...</div>
        ) : tasks.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No tasks for this department yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Task</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Assigned</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Priority</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Status</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Deadline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {tasks.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 text-slate-800">{t.taskTitle}</td>
                    <td className="px-5 py-3 text-slate-600">{t.assignedPerson || '—'}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          t.priority === 'Urgent'
                            ? 'bg-red-100 text-red-700'
                            : t.priority === 'High'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {t.priority || '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          t.status === 'Completed'
                            ? 'bg-emerald-100 text-emerald-700'
                            : t.status === 'In Progress'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {t.deadline ? new Date(t.deadline).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
