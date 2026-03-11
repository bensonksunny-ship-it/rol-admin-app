import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getDepartmentPath } from '../../constants/departments'
import { ROLES } from '../../constants/roles'

const navItems = [
  { to: '/', label: 'Dashboard', icon: '📊', permission: 'dashboard' },
  { to: '/departments', label: 'Departments', icon: '🏢', permission: 'departments' },
  { to: '/tasks', label: 'Tasks', icon: '✅', permission: 'tasks' },
  { to: '/sunday-ministry', label: 'Sunday Ministry', icon: '📅', permission: 'attendance' },
  { to: '/sunday-planning', label: 'Sunday Planning', icon: '📋', permission: 'attendance' },
  { to: '/department/sunday-ministry', label: 'Sunday Ministry (Director)', icon: '📋', showOnlyDepartment: 'Sunday Ministry', showOnlyDepartmentAlt: 'Sunday M', orAttendance: true },
  { to: '/sunday-ministry-pastor', label: 'Sunday Ministry (Pastor)', icon: '📝', permission: 'viewDepartmentInsights', orFounder: true, orAttendance: true },
  { to: '/department/worship', label: 'Worship', icon: '🎵', permission: 'viewDepartmentInsights', orDepartment: 'Worship' },
  { to: '/senior-pastor', label: 'Senior Pastor', icon: '👤', permission: 'pastorHub', orFounder: true },
  { to: '/finance', label: 'Finance', icon: '💰', permission: 'finance' },
  { to: '/reports', label: 'Reports', icon: '📋', permission: 'reports' },
]

export default function Sidebar() {
  const { userProfile, signOut, hasPermission, isFounder, isDepartmentHead } = useAuth()
  const [open, setOpen] = useState(false)

  const visible = navItems.filter((item) => {
    if (item.showOnlyDepartment) return userProfile?.department === item.showOnlyDepartment || userProfile?.department === item.showOnlyDepartmentAlt || isFounder || (item.orAttendance && hasPermission('attendance'))
    if (item.orFounder && item.permission) return hasPermission(item.permission) || isFounder
    if (item.orDepartment) return hasPermission(item.permission) || userProfile?.department === item.orDepartment
    return hasPermission(item.permission)
  })

  const myDeptItem = userProfile?.department && isDepartmentHead(userProfile.department)
    ? { to: getDepartmentPath(userProfile.department), label: `${userProfile.department} (${userProfile.role === ROLES.DIRECTOR ? 'Director' : 'Coordinator'})`, icon: '📁' }
    : null
  const visibleWithMyDept = myDeptItem ? [myDeptItem, ...visible] : visible

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
          <span className="text-slate-500">{userProfile?.role}</span>
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
