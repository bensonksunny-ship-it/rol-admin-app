import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { DEPARTMENT_LIST } from '../constants/departments'
import { isRestrictedDLightDirector } from '../utils/dlightAccess'

export default function Departments() {
  const { userProfile, canSeeAllDepartments } = useAuth()

  const allowedNames = (() => {
    if (canSeeAllDepartments) return null
    const fromPositions = Array.isArray(userProfile?.positions)
      ? userProfile.positions.map((p) => p?.department).filter(Boolean)
      : []
    const fromDepartments = Array.isArray(userProfile?.departments)
      ? userProfile.departments.filter(Boolean)
      : []
    const fromPrimary = userProfile?.department ? [userProfile.department] : []
    return Array.from(new Set([...fromPositions, ...fromDepartments, ...fromPrimary]))
  })()

  const list = canSeeAllDepartments
    ? DEPARTMENT_LIST
    : DEPARTMENT_LIST.filter((d) => allowedNames.includes(d.name))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Departments</h1>
        <p className="text-slate-500 mt-1">Manage department activity, reports, and tasks</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {list.map((d, idx) => {
          const pastel = [
            { bg: 'bg-blue-50', border: 'border-blue-200', hover: 'hover:bg-blue-100' },
            { bg: 'bg-emerald-50', border: 'border-emerald-200', hover: 'hover:bg-emerald-100' },
            { bg: 'bg-amber-50', border: 'border-amber-200', hover: 'hover:bg-amber-100' },
            { bg: 'bg-violet-50', border: 'border-violet-200', hover: 'hover:bg-violet-100' },
            { bg: 'bg-sky-50', border: 'border-sky-200', hover: 'hover:bg-sky-100' },
            { bg: 'bg-teal-50', border: 'border-teal-200', hover: 'hover:bg-teal-100' },
          ][idx % 6]
          return (
            <Link
              key={d.slug}
              to={`/department/${d.slug}`}
              className={`block ${pastel.bg} ${pastel.border} ${pastel.hover} rounded-2xl border p-6 shadow-sm hover:shadow-md transition-all`}
            >
              <h2 className="text-lg font-semibold text-slate-900">{d.name}</h2>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
