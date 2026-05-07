import { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getDepartmentPath } from '../../constants/departments'
import { ROLES } from '../../constants/roles'
import { getDepartmentRole } from '../../utils/access'
import { canAccessWeeklyEntryOnly, ACCOUNTS_ENTRY_BASE_PATH } from '../../utils/accountsEntryAccess'

const navItems = [
  { to: '/', label: 'Dashboard', icon: '📊', permission: 'dashboard' },
  // Senior Pastor office – second in sidebar
  { to: '/senior-pastor', label: 'Senior Pastor Office', icon: '👤', permission: 'pastorHub', orFounder: true },
  { to: '/departments', label: 'Departments', icon: '🏢', permission: 'departments' },
  { to: '/sunday-planning', label: 'Sunday Plan', icon: '📋', permission: 'attendance' },
  { to: '/admin/users', label: 'User Management', icon: '👥', permission: 'manageUsers', adminOnly: true },
]

export default function Sidebar() {
  const { userProfile, signOut, hasPermission, isFounder, isDepartmentHead, canSeeAllDepartments } = useAuth()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  const [theme, setTheme] = useState(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('rol-theme') : null
    if (saved === 'day' || saved === 'night') return saved
    const prefersNight = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)')?.matches : false
    return prefersNight ? 'night' : 'day'
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'night')
    try {
      window.localStorage.setItem('rol-theme', theme)
    } catch {}
  }, [theme])

  const themeToggleLabel = useMemo(
    () => (theme === 'night' ? 'Switch to Day mode' : 'Switch to Night mode'),
    [theme]
  )

  const displayDeptName = (deptName) => {
    if (deptName === 'Event M') return 'Event Management'
    return deptName
  }

  // Scoped sidebar mode: for all non-Founder/Admin users, map the sidebar directly
  // from their `positions[]` (Director/Coordinator only; associate-only is hidden).
  if (userProfile && !isFounder && userProfile?.role !== ROLES.ADMIN) {
    const positions = Array.isArray(userProfile?.positions) ? userProfile.positions : []

    const headRoleFromPosition = (p) => {
      if (!p) return null
      const pos = String(p.position || '').trim()
      const role = String(p.role || '').trim()
      const sLower = (pos || role).toLowerCase()
      const rUpper = role.toUpperCase()

      if (sLower === 'director' || rUpper === 'DIRECTOR') return 'DIRECTOR'
      // Only treat "Cell Leader"/"LEADER" as COORDINATOR head-role for the *Cell* department.
      // For any other department, "Cell Leader" must not grant hub access.
      const deptNorm = String(p.department || '').trim().toLowerCase()
      const isCellDept = deptNorm === 'cell'

      const isCoordinatorToken =
        sLower === 'coordinator' ||
        rUpper === 'COORDINATOR'

      const isCellLeaderToken = sLower === 'cell leader' || rUpper === 'LEADER'

      if (isCoordinatorToken) return 'COORDINATOR'
      if (isCellDept && isCellLeaderToken) return 'COORDINATOR'
      return null
    }

    const headDeptMap = new Map() // deptName -> { deptName, headRole, rank }
    let hasCellHead = false
    positions.forEach((p) => {
      if (!p) return
      const dept = String(p.department || '').trim()
      if (!dept) return

      const deptNorm = dept.toLowerCase()
      const headRole = headRoleFromPosition(p)
      if (!headRole) return

      if (deptNorm === 'cell') {
        hasCellHead = true
        return
      }

      const nextRank = headRole === 'DIRECTOR' ? 2 : 1
      const existing = headDeptMap.get(dept)
      if (!existing || nextRank > existing.rank) {
        headDeptMap.set(dept, { deptName: dept, headRole, rank: nextRank })
      }
    })

    const cellName = String(userProfile?.cellGroup || '').trim() || 'Cell'

    const scopedItems = []

    // Sunday Plan is visible to everyone.
    scopedItems.push({ to: '/sunday-planning', label: 'Sunday Plan', icon: '📋' })

    // Department hubs for Director/Coordinator positions.
    for (const v of headDeptMap.values()) {
      scopedItems.push({
        to: getDepartmentPath(v.deptName),
        label: `${displayDeptName(v.deptName)} (${v.headRole === 'DIRECTOR' ? 'Director' : 'Coordinator'})`,
        icon: '📁',
      })
    }

    // Cell report page for Cell Leader/Director (head positions).
    if (hasCellHead) {
      scopedItems.push({
        to: '/department/cell/cell-report',
        label: `Cell (${cellName})`,
        icon: '🍃',
      })
    }

    // Weekly Entry direct link for Weekly Expense Manager / Weekly Entry role.
    if (canAccessWeeklyEntryOnly(userProfile)) {
      scopedItems.push({
        to: `${ACCOUNTS_ENTRY_BASE_PATH}/weekly`,
        label: 'Weekly Entry',
        icon: '📝',
      })
    }

    return (
      <>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="lg:hidden fixed top-3 left-3 z-40 p-2.5 rounded-xl bg-slate-800 text-white shadow text-lg leading-none"
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
            {scopedItems.map((item) => (
              <NavLink
                key={(item.to || '/') + (item.label || '')}
                to={item.to || '/'}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-3 rounded-lg text-sm transition-all ${
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
              <span className="text-slate-500">{userProfile?.role || ''}</span>
            </div>
        <button
          type="button"
          onClick={() => setTheme((t) => (t === 'night' ? 'day' : 'night'))}
          aria-label={themeToggleLabel}
          className="w-full mt-1 px-3 py-3 text-left text-sm text-slate-300 hover:bg-slate-800 rounded-lg"
        >
          {theme === 'night' ? '🌙 Night mode' : '☀️ Day mode'}
        </button>
            <button
              onClick={signOut}
              className="w-full mt-1 px-3 py-3 text-left text-sm text-slate-300 hover:bg-slate-800 rounded-lg"
            >
              Sign out
            </button>
          </div>
        </aside>
      </>
    )
  }

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

  // For Cell Director/Leader with ONLY Cell: restrict menu to Cell (Director) and Sunday Plan
  // If they also have another department (e.g. D Light Director + Cell Leader), show full menu + both dept links
  if (isCellDirectorOrLeader && onlyCell) {
    visible = navItems.filter(
      (item) => item.to === '/sunday-planning'
    )
  }

  const myDeptItems = departments
    .filter((d) => isDepartmentHead(d))
    .map((d) => {
      return {
        to: getDepartmentPath(d),
        label: `${displayDeptName(d)} (${getDepartmentRole(userProfile, d) === 'DIRECTOR' ? 'Director' : 'Coordinator'})`,
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
        className="lg:hidden fixed top-3 left-3 z-40 p-2.5 rounded-xl bg-slate-800 text-white shadow text-lg leading-none"
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
            key={(item.to || '/') + (item.label || '')}
            to={item.to || '/'}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-3 rounded-lg text-sm transition-all ${
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
          className="w-full mt-1 px-3 py-3 text-left text-sm text-slate-300 hover:bg-slate-800 rounded-lg"
        >
          Sign out
        </button>
      </div>
    </aside>
    </>
  )
}
