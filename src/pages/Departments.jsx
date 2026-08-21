import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { DEPARTMENT_LIST, getDepartmentPath, getDepartmentIcon, displayDeptName } from '../constants/departments'
import { isRestrictedDLightDirector } from '../utils/dlightAccess'

export default function Departments() {
  const { userProfile, canSeeAllDepartments, isCellDirector } = useAuth()

  const normDept = (s) => String(s || '').trim().toLowerCase().replace(/-/g, ' ')

  const allowedNorms = (() => {
    if (canSeeAllDepartments) return null
    const fromPositions = Array.isArray(userProfile?.positions)
      ? userProfile.positions.map((p) => p?.department).filter(Boolean)
      : []
    const fromDepartments = Array.isArray(userProfile?.departments)
      ? userProfile.departments.filter(Boolean)
      : []
    const fromPrimary = userProfile?.department ? [userProfile.department] : []
    const extra = isCellDirector ? ['Sunday Ministry'] : []
    return new Set([...fromPositions, ...fromDepartments, ...fromPrimary, ...extra].map(normDept))
  })()

  const list = canSeeAllDepartments
    ? DEPARTMENT_LIST
    : DEPARTMENT_LIST.filter((d) => allowedNorms.has(normDept(d.name)))

  return (
    <div className="space-y-6 font-sans">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Departments</h1>
        <p className="text-slate-500 mt-1">Manage department activity, reports, and tasks</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {list.map((d, idx) => {
          if (!d?.slug) return null
          // Explicit target — avoid any stray `href` reference (React Router uses `to` only).
          const linkTo =
            d.slug === 'd-light' && isRestrictedDLightDirector(userProfile)
              ? '/sunday-planning'
              : getDepartmentPath(d.name)
          return (
            <Link
              key={d.slug}
              to={linkTo}
              className="group block bg-white rounded-3xl border border-slate-200 p-6 shadow-md hover:shadow-sm transition-all transform-gpu hover:scale-[1.02] hover:border-indigo-500"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{displayDeptName(d.name)}</h2>
                </div>
                {(() => {
                  const Icon = getDepartmentIcon(d.name)
                  return <Icon className="text-indigo-600" size={22} aria-hidden />
                })()}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
