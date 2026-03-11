import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { DEPARTMENT_LIST, getDepartmentPath } from '../constants/departments'

export default function Departments() {
  const { userProfile, canSeeAllDepartments } = useAuth()

  const list = canSeeAllDepartments
    ? DEPARTMENT_LIST
    : DEPARTMENT_LIST.filter((d) => d.name === userProfile?.department)

  if (!canSeeAllDepartments && list.length === 1) {
    return <Navigate to={getDepartmentPath(list[0].name)} replace />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Departments</h1>
        <p className="text-slate-500 mt-1">Manage department activity, reports, and tasks</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {list.map((d) => (
          <Link
            key={d.slug}
            to={getDepartmentPath(d.name)}
            className="block bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:border-blue-300 hover:shadow-md transition-all"
          >
            <h2 className="font-semibold text-slate-800">{d.name}</h2>
            <p className="text-sm text-slate-500 mt-1">View activity & tasks →</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
