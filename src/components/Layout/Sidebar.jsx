import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getDepartmentPath } from '../../constants/departments'
import { ROLES } from '../../constants/roles'
import { isRestrictedDLightDirector } from '../../utils/dlightAccess'

const navItems = [
  { to: '/', label: 'Dashboard', icon: '📊', permission: 'dashboard' },
  // Senior Pastor office – second in sidebar
  { to: '/senior-pastor', label: 'Senior Pastor Office', icon: '👤', permission: 'pastorHub', orFounder: true },
  { to: '/departments', label: 'Departments', icon: '🏢', permission: 'departments' },
  { to: '/sunday-planning', label: 'Sunday Planning', icon: '📋', permission: 'attendance' },
  { to: '/admin/users', label: 'User Management', icon: '👥', permission: 'manageUsers', adminOnly: true },
]

export default function Sidebar() {
  const { userProfile, signOut, hasPermission, isFounder, isDepartmentHead, canSeeAllDepartments } = useAuth()
  const [open, setOpen] = useState(false)

  const departments = userProfile?.departments || (userProfile?.department ? [userProfile.department] : [])
  const isCellDirectorOrLeader =
    departments.includes('Cell') &&
    (userProfile?.role === ROLES.DIRECTOR || userProfile?.role === ROLES.COORDINATOR)
  const onlyCell = departments.length === 1 && departments[0] === 'Cell'

  let visible = navItems.filter((item) => {
    if (item.to === '/departments') return hasPermission(item.permission)
    if (item.adminOnly) return (userProfile?.role === ROLES.ADMIN || isFounder) && hasPermission(item.permission)
    if (item.showOnlyDepartment) return departments.includes(item.showOnlyDepartment) || (item.showOnlyDepartmentAlt && departments.includes(item.showOnlyDepartmentAlt)) || isFounder || (item.orAttendance && hasPermission('attendance'))
    if (item.orFounder && item.permission) return hasPermission(item.permission) || isFounder
    if (item.orDepartment) return hasPermission(item.permission) || departments.includes(item.orDepartment)
    return hasPermission(item.permission)
  })

  // For Cell Director/Leader with ONLY Cell: restrict menu to Cell (Director) and Sunday Planning
  // If they also have another department (e.g. D Light Director + Cell Leader), show full menu + both dept links
  if (isCellDirectorOrLeader && onlyCell) {
    visible = navItems.filter(
      (item) => item.to === '/sunday-planning'
    )
  }

  const myDeptItems = departments
    .filter((d) => isDepartmentHead(d))
    .map((d) => {
      if (d === 'D Light' && isRestrictedDLightDirector(userProfile)) {
        return { to: '/sunday-planning', label: 'Sunday Planning (D Light)', icon: '📋' }
      }
      return {
        to: getDepartmentPath(d),
        label: `${d} (${userProfile?.role === ROLES.DIRECTOR ? 'Director' : 'Coordinator'})`,
        icon: '📁',
      }
    })
  const mergedNav = myDeptItems.length ? [...myDeptItems, ...visible] : visible
  const seenTo = new Set()
  const visibleWithMyDept = mergedNav.filter((item) => {
    if (seenTo.has(item.to)) return false
    seenTo.add(item.to)
    return true
  })

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="lg:hidden fixed top-4 left-4 z-40 p-2 rounded-lg bg-slate-800 text-white shadow"
        aria-label="Toggle menu"
      >
        {open ? '✕' : '☰'}
      </button>
      {open && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}
    <aside className={`w-64 min-h-screen bg-gradient-to-b from-slate-800 to-slate-900 text-white flex flex-col fixed left-0 top-0 z-30 transform transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="p-4 border-b border-slate-600/50">
        <h1 className="text-base font-bold text-white">River Of Life</h1>
        <p className="text-xs text-slate-400 uppercase tracking-wider">Admin App</p>
      </div>
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {visibleWithMyDept.map((item) => (
          <NavLink
            key={item.to + (item.label || '')}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow'
                  : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
              }`
            }
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-2 border-t border-slate-600/50">
        <div className="px-3 py-1.5 text-sm text-slate-400">
          {userProfile?.displayName || userProfile?.email || 'User'}
          <br />
          <span className="text-slate-500">
            {userProfile?.globalRole === 'FOUNDER' ? 'Senior Pastor' : (userProfile?.role || '')}
          </span>
        </div>
        <button
          onClick={signOut}
          className="w-full mt-2 px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800 rounded-lg"
        >
          Sign out
        </button>
      </div>
    </aside>
    </>
  )
}
