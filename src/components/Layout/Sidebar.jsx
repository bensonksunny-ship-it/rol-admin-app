import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const navItems = [
  { to: '/', label: 'Dashboard', icon: '📊', permission: 'dashboard' },
  { to: '/departments', label: 'Departments', icon: '🏢', permission: 'departments' },
  { to: '/tasks', label: 'Tasks', icon: '✅', permission: 'tasks' },
  { to: '/sunday-ministry', label: 'Sunday Ministry', icon: '📅', permission: 'attendance' },
  { to: '/sunday-planning', label: 'Sunday Planning', icon: '📋', permission: 'attendance' },
  { to: '/department/sunday-ministry', label: 'Sunday Ministry (Director)', icon: '📋', showOnlyDepartment: 'Sunday Ministry', orAttendance: true },
  { to: '/sunday-ministry-pastor', label: 'Sunday Ministry (Pastor)', icon: '📝', permission: 'viewDepartmentInsights', orFounder: true, orAttendance: true },
  { to: '/department/worship', label: 'Worship', icon: '🎵', permission: 'viewDepartmentInsights', orDepartment: 'Worship' },
  { to: '/finance', label: 'Finance', icon: '💰', permission: 'finance' },
  { to: '/reports', label: 'Reports', icon: '📋', permission: 'reports' },
]

export default function Sidebar() {
  const { userProfile, signOut, hasPermission, isFounder } = useAuth()
  const [open, setOpen] = useState(false)

  const visible = navItems.filter((item) => {
    if (item.showOnlyDepartment) return userProfile?.department === item.showOnlyDepartment || isFounder || (item.orAttendance && hasPermission('attendance'))
    if (item.orFounder) return hasPermission(item.permission) || isFounder || (item.orAttendance && hasPermission('attendance'))
    if (item.orDepartment) return hasPermission(item.permission) || userProfile?.department === item.orDepartment
    return hasPermission(item.permission)
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
    <aside className={`w-64 min-h-screen bg-slate-900 text-white flex flex-col fixed left-0 top-0 z-30 transform transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="p-5 border-b border-slate-700">
        <h1 className="text-lg font-bold text-white">River Of Life</h1>
        <p className="text-xs text-slate-400">Admin App</p>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {visible.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <span className="text-lg">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-slate-700">
        <div className="px-3 py-2 text-xs text-slate-400">
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
