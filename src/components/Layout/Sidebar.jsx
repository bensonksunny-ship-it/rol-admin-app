import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Crown, Building2, CalendarCheck,
  UserCog, FolderOpen, Leaf, PenLine,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { getDepartmentPath } from '../../constants/departments'
import { ROLES } from '../../constants/roles'
import { getDepartmentRole } from '../../utils/access'
import { canAccessWeeklyEntryOnly, ACCOUNTS_ENTRY_BASE_PATH } from '../../utils/accountsEntryAccess'

const navItems = [
  { to: '/', label: 'Dashboard', icon: '📊', permission: 'dashboard' },
  { to: '/senior-pastor', label: 'Senior Pastor Office', icon: '👤', permission: 'pastorHub', orFounder: true },
  { to: '/departments', label: 'Departments', icon: '🏢', permission: 'departments' },
  { to: '/sunday-planning', label: 'Sunday Plan', icon: '📋', permission: 'attendance' },
  { to: '/admin/users', label: 'User Management', icon: '👥', permission: 'manageUsers', adminOnly: true },
]

const ICON_MAP = {
  '📊': LayoutDashboard,
  '👤': Crown,
  '🏢': Building2,
  '📋': CalendarCheck,
  '👥': UserCog,
  '📁': FolderOpen,
  '🍃': Leaf,
  '📝': PenLine,
}

function shortLabel(label) {
  const map = {
    'Dashboard': 'Home',
    'Sunday Plan': 'Sunday',
    'Departments': 'Depts',
    'Senior Pastor Office': 'Pastor',
    'User Management': 'Users',
    'Weekly Entry': 'Entry',
  }
  for (const [key, short] of Object.entries(map)) {
    if (label.startsWith(key)) return short
  }
  const paren = label.indexOf(' (')
  const base = paren > 0 ? label.slice(0, paren) : label
  return base.length > 10 ? base.slice(0, 9) + '…' : base
}

function BottomTabBar({ items, theme }) {
  const isDay = theme !== 'night'
  const { pathname } = useLocation()
  const tabRefs = useRef([])
  const [pillStyle, setPillStyle] = useState(null)

  const activeIndex = useMemo(() => {
    for (let i = 0; i < items.length; i++) {
      const to = items[i].to
      if (to === '/') { if (pathname === '/') return i }
      else if (pathname === to || pathname.startsWith(to + '/')) return i
    }
    return -1
  }, [pathname, items])

  useLayoutEffect(() => {
    const el = tabRefs.current[activeIndex]
    if (el) setPillStyle({ left: el.offsetLeft + 4, width: el.offsetWidth - 8 })
  }, [activeIndex, items.length])

  const dockStyle = isDay ? {
    background: 'rgba(255,255,255,0.88)',
    backdropFilter: 'blur(24px) saturate(200%)',
    WebkitBackdropFilter: 'blur(24px) saturate(200%)',
    border: '1px solid rgba(255,255,255,0.95)',
    boxShadow: '0 8px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,1)',
    borderRadius: '20px',
    overflow: 'hidden',
  } : {
    background: 'rgba(15,23,42,0.96)',
    backdropFilter: 'blur(20px) saturate(180%)',
    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
    borderTop: '1px solid rgba(255,255,255,0.08)',
    paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 4px)',
  }

  const pillColor = isDay ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.2)'
  const pillBorder = isDay ? '1px solid rgba(99,102,241,0.15)' : 'none'
  const activeColor = isDay ? '#6366f1' : '#818cf8'
  const inactiveColor = isDay ? '#94a3b8' : '#64748b'

  return (
    <nav
      className="lg:hidden fixed z-50"
      style={isDay ? { bottom: '14px', left: '12px', right: '12px' } : { bottom: 0, left: 0, right: 0 }}
    >
      <div style={dockStyle}>
        <div className="flex overflow-x-auto scrollbar-hide px-1 relative">

          {/* Sliding pill — renders only after first measurement */}
          {pillStyle && (
            <div
              className="absolute top-1.5 bottom-1.5 rounded-xl pointer-events-none"
              style={{
                left: `${pillStyle.left}px`,
                width: `${pillStyle.width}px`,
                background: pillColor,
                border: pillBorder,
                transition: 'left 0.28s cubic-bezier(0.34,1.56,0.64,1), width 0.22s cubic-bezier(0.34,1.56,0.64,1)',
              }}
            />
          )}

          {items.map((item, i) => {
            const isActive = i === activeIndex
            const Icon = ICON_MAP[item.icon] || LayoutDashboard
            return (
              <div
                key={(item.to || '/') + (item.label || '')}
                ref={(el) => { tabRefs.current[i] = el }}
                className="flex-shrink-0"
                style={{ minWidth: '64px' }}
              >
                <NavLink
                  to={item.to || '/'}
                  className="flex flex-col items-center justify-center w-full py-2.5 relative z-10 transition-colors duration-200"
                  style={{ color: isActive ? activeColor : inactiveColor }}
                >
                  <Icon size={20} strokeWidth={1.5} />
                  <span
                    className="text-[10px] font-semibold leading-none transition-all duration-200 overflow-hidden whitespace-nowrap"
                    style={{
                      maxHeight: isActive ? '14px' : '0px',
                      opacity: isActive ? 1 : 0,
                      marginTop: isActive ? '3px' : '0px',
                      transition: 'max-height 0.2s ease, opacity 0.2s ease, margin-top 0.2s ease',
                    }}
                  >
                    {shortLabel(item.label)}
                  </span>
                </NavLink>
              </div>
            )
          })}

        </div>
      </div>
    </nav>
  )
}

export default function Sidebar() {
  const { userProfile, signOut, hasPermission, isFounder, isDepartmentHead } = useAuth()
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

  // ── Theme-aware style tokens ────────────────────────────────────────────────
  const isDay = theme !== 'night'

  const sidebarStyle = isDay ? {
    background: 'rgba(255,255,255,0.72)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    borderRight: '1px solid rgba(255,255,255,0.9)',
    boxShadow: '4px 0 32px rgba(0,0,0,0.08)',
  } : {}

  const headerBorderClass = isDay ? 'border-slate-200/60' : 'border-slate-600/50'
  const footerBorderClass = isDay ? 'border-slate-200/60' : 'border-slate-600/50'

  const titleGradient = isDay
    ? 'linear-gradient(to right, #1e293b 0%, #475569 100%)'
    : 'linear-gradient(to right, #ffffff 0%, #cbd5e1 100%)'

  const navLinkActive = 'bg-gradient-to-r from-indigo-500 to-blue-500 text-white shadow-md'
  const navLinkInactive = isDay
    ? 'text-slate-600 hover:bg-black/5 hover:text-slate-900'
    : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'

  const profileNameClass = isDay ? 'text-slate-700' : 'text-slate-400'
  const profileRoleClass = isDay ? 'text-slate-500' : 'text-slate-500'
  const actionBtnClass = isDay
    ? 'w-full mt-1 px-3 py-3 text-left text-sm text-slate-600 hover:bg-black/5 rounded-lg transition-colors duration-150'
    : 'w-full mt-1 px-3 py-3 text-left text-sm text-slate-300 hover:bg-slate-800 rounded-lg'

  const hamburgerClass = isDay
    ? 'lg:hidden fixed top-3 left-3 z-40 p-2.5 rounded-xl shadow-md text-lg leading-none bg-white/90 text-slate-700 border border-white/80'
    : 'lg:hidden fixed top-3 left-3 z-40 p-2.5 rounded-xl shadow text-lg leading-none bg-slate-800 text-white'

  const asideTextClass = isDay ? 'text-slate-900' : 'text-white'

  // ── Brand header (shared) ───────────────────────────────────────────────────
  const BrandHeader = () => (
    <div className={`p-4 border-b ${headerBorderClass}`}>
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)',
            boxShadow: '0 4px 14px rgba(99,102,241,0.45)',
          }}
        >
          <span
            className="text-white font-black text-lg leading-none select-none"
            style={{ fontFamily: "'Montserrat', Inter, system-ui, sans-serif", letterSpacing: '-0.02em' }}
          >
            R
          </span>
        </div>
        <div className="min-w-0">
          <h1
            className="font-black leading-tight truncate"
            style={{
              fontFamily: "'Montserrat', Inter, system-ui, sans-serif",
              fontSize: '18px',
              background: titleGradient,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              letterSpacing: '-0.015em',
            }}
          >
            River Of Life
          </h1>
          <p
            className={`font-semibold select-none ${isDay ? 'text-slate-400' : 'text-slate-500'}`}
            style={{ fontSize: '9px', letterSpacing: '0.18em', marginTop: '2px' }}
          >
            ADMIN PORTAL
          </p>
        </div>
      </div>
    </div>
  )

  // ── Scoped sidebar (non-Founder/Admin users) ────────────────────────────────
  if (userProfile && !isFounder && userProfile?.role !== ROLES.ADMIN) {
    const positions = Array.isArray(userProfile?.positions) ? userProfile.positions : []

    const headRoleFromPosition = (p) => {
      if (!p) return null
      const pos = String(p.position || '').trim()
      const role = String(p.role || '').trim()
      const sLower = (pos || role).toLowerCase()
      const rUpper = role.toUpperCase()

      if (sLower === 'director' || rUpper === 'DIRECTOR') return 'DIRECTOR'
      const deptNorm = String(p.department || '').trim().toLowerCase()
      const isCellDept = deptNorm === 'cell'
      const isCoordinatorToken = sLower === 'coordinator' || rUpper === 'COORDINATOR'
      const isCellLeaderToken = sLower === 'cell leader' || rUpper === 'LEADER'
      if (isCoordinatorToken) return 'COORDINATOR'
      if (isCellDept && isCellLeaderToken) return 'COORDINATOR'
      return null
    }

    const headDeptMap = new Map()
    let hasCellHead = false
    positions.forEach((p) => {
      if (!p) return
      const dept = String(p.department || '').trim()
      if (!dept) return
      const deptNorm = dept.toLowerCase()
      const headRole = headRoleFromPosition(p)
      if (!headRole) return
      if (deptNorm === 'cell') { hasCellHead = true; return }
      const nextRank = headRole === 'DIRECTOR' ? 2 : 1
      const existing = headDeptMap.get(dept)
      if (!existing || nextRank > existing.rank) {
        headDeptMap.set(dept, { deptName: dept, headRole, rank: nextRank })
      }
    })

    const cellName = String(userProfile?.cellGroup || '').trim() || 'Cell'
    const scopedItems = []
    scopedItems.push({ to: '/sunday-planning', label: 'Sunday Plan', icon: '📋' })
    for (const v of headDeptMap.values()) {
      scopedItems.push({
        to: getDepartmentPath(v.deptName),
        label: `${displayDeptName(v.deptName)} (${v.headRole === 'DIRECTOR' ? 'Director' : 'Coordinator'})`,
        icon: '📁',
      })
    }
    if (hasCellHead) {
      scopedItems.push({ to: '/department/cell/cell-report', label: `Cell (${cellName})`, icon: '🍃' })
    }
    if (canAccessWeeklyEntryOnly(userProfile)) {
      scopedItems.push({ to: `${ACCOUNTS_ENTRY_BASE_PATH}/weekly`, label: 'Weekly Entry', icon: '📝' })
    }

    return (
      <>
        <button type="button" onClick={() => setOpen((o) => !o)} className={hamburgerClass} aria-label="Toggle menu">
          {open ? '✕' : '☰'}
        </button>
        {open && (
          <div className="lg:hidden fixed inset-0 bg-black/30 z-30 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden />
        )}
        <aside
          className={`w-64 min-h-screen bg-gradient-to-b from-slate-800 to-slate-900 ${asideTextClass} flex flex-col fixed left-0 top-0 z-30 transform transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
          style={sidebarStyle}
        >
          <BrandHeader />
          <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
            {scopedItems.map((item) => (
              <NavLink
                key={(item.to || '/') + (item.label || '')}
                to={item.to || '/'}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-3 rounded-lg text-sm transition-all ${
                    isActive ? navLinkActive : navLinkInactive
                  }`
                }
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className={`p-2 border-t ${footerBorderClass}`}>
            <div className={`px-3 py-1.5 text-sm ${profileNameClass}`}>
              {userProfile?.displayName || userProfile?.email || 'User'}
              <br />
              <span className={profileRoleClass}>{userProfile?.role || ''}</span>
            </div>
            <button type="button" onClick={() => setTheme((t) => (t === 'night' ? 'day' : 'night'))}
              aria-label={themeToggleLabel} className={actionBtnClass}>
              {theme === 'night' ? '🌙 Night mode' : '☀️ Day mode'}
            </button>
            <button onClick={signOut} className={actionBtnClass}>Sign out</button>
          </div>
        </aside>
        <BottomTabBar items={scopedItems} theme={theme} />
      </>
    )
  }

  // ── Full sidebar (Founder / Admin) ──────────────────────────────────────────
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

  if (isCellDirectorOrLeader && onlyCell) {
    visible = navItems.filter((item) => item.to === '/sunday-planning')
  }

  const myDeptItems = departments
    .filter((d) => isDepartmentHead(d))
    .map((d) => ({
      to: getDepartmentPath(d),
      label: `${displayDeptName(d)} (${getDepartmentRole(userProfile, d) === 'DIRECTOR' ? 'Director' : 'Coordinator'})`,
      icon: '📁',
    }))
  const mergedNav = myDeptItems.length ? [...myDeptItems, ...visible] : visible
  const seenTo = new Set()
  const visibleWithMyDept = mergedNav.filter((item) => {
    if (seenTo.has(item.to)) return false
    seenTo.add(item.to)
    return true
  })

  return (
    <>
      <button type="button" onClick={() => setOpen((o) => !o)} className={hamburgerClass} aria-label="Toggle menu">
        {open ? '✕' : '☰'}
      </button>
      {open && (
        <div className="lg:hidden fixed inset-0 bg-black/30 z-30 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden />
      )}
      <aside
        className={`w-64 min-h-screen bg-gradient-to-b from-slate-800 to-slate-900 ${asideTextClass} flex flex-col fixed left-0 top-0 z-30 transform transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
        style={sidebarStyle}
      >
        <BrandHeader />
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {visibleWithMyDept.map((item) => (
            <NavLink
              key={(item.to || '/') + (item.label || '')}
              to={item.to || '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-3 rounded-lg text-sm transition-all ${
                  isActive ? navLinkActive : navLinkInactive
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className={`p-2 border-t ${footerBorderClass}`}>
          <div className={`px-3 py-1.5 text-sm ${profileNameClass}`}>
            {userProfile?.displayName || userProfile?.email || 'User'}
            <br />
            <span className={profileRoleClass}>
              {userProfile?.globalRole === 'FOUNDER' ? 'Senior Pastor' : (userProfile?.role || '')}
            </span>
          </div>
          <button type="button" onClick={() => setTheme((t) => (t === 'night' ? 'day' : 'night'))}
            aria-label={themeToggleLabel} className={actionBtnClass}>
            {theme === 'night' ? '🌙 Night mode' : '☀️ Day mode'}
          </button>
          <button onClick={signOut} className={actionBtnClass}>Sign out</button>
        </div>
      </aside>
      <BottomTabBar items={visibleWithMyDept} theme={theme} />
    </>
  )
}
