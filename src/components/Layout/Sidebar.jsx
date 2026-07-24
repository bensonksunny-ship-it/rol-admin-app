import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Crown, Building2, CalendarCheck,
  UserCog, FolderOpen, Leaf, PenLine, LogOut, Bell,
  MessageCircle, Home, Users, Presentation,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { getDepartmentPath, getDepartmentBySlug } from '../../constants/departments'
import { ROLES } from '../../constants/roles'
import { getDepartmentRole } from '../../utils/access'
import { canAccessWeeklyEntryOnly, ACCOUNTS_ENTRY_BASE_PATH } from '../../utils/accountsEntryAccess'
import useActionNotifications from '../../hooks/useActionNotifications'
import useDirectMessages from '../../hooks/useDirectMessages'
import { getBoardPoints } from '../../services/firestore'
import NotifPanel from '../NotifPanel'
import MessagesPanel from '../MessagesPanel'
import SundayPlanBubble from '../SundayPlanBubble'
import RailTooltip from '../RailTooltip'
import BoardPointsModal from '../BoardPointsModal'
import { getDepartmentSubpages, slugFromDepartmentPath } from '../../utils/departmentSubpages'
import rolccLogo from '../../assets/rolcc_logo BW.JPG'

const WORKSPACE_ITEM = { to: '/', label: 'My Workspace', icon: '🏠' }

const navItems = [
  { to: '/analytics', label: 'Analytics', icon: '📊', permission: 'dashboard', founderOnly: true },
  { to: '/senior-pastor', label: 'Senior Pastor Office', icon: '👤', permission: 'pastorHub', orFounder: true },
  { to: '/departments', label: 'Departments', icon: '🏢', permission: 'departments' },
  { to: '/sunday-planning', label: 'Sunday Plan', icon: '📋', permission: 'attendance' },
  { to: '/admin/users', label: 'User Management', icon: '👥', permission: 'manageUsers', adminOnly: true },
  { to: '/people', label: 'People Directory', icon: '🗂️', permission: 'manageUsers', adminOnly: true },
]

const ICON_MAP = {
  '🏠': Home,
  '📊': LayoutDashboard,
  '👤': Crown,
  '🏢': Building2,
  '📋': CalendarCheck,
  '👥': UserCog,
  '📁': FolderOpen,
  '🍃': Leaf,
  '📝': PenLine,
  '🗂️': Users,
}

function shortLabel(label) {
  const map = {
    'My Workspace': 'Home',
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

function getInitials(profile) {
  const name = profile?.displayName || profile?.email || ''
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}


function BottomTabBar({ items, theme, signOut, userProfile, user, sidebarOpen }) {
  const isDay = theme !== 'night'
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const tabRefs = useRef([])
  const [pillStyle, setPillStyle] = useState(null)
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef(null)
  const [openSheetKey, setOpenSheetKey] = useState(null)

  useEffect(() => {
    if (!showMenu) return
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close) }
  }, [showMenu])

  useEffect(() => { setOpenSheetKey(null) }, [pathname])

  useEffect(() => {
    if (!openSheetKey) return
    const closeOnEscape = (e) => { if (e.key === 'Escape') setOpenSheetKey(null) }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [openSheetKey])

  const openSheetItem = items.find((it) => (it.to || '/') + (it.label || '') === openSheetKey)
  const openSheetSlug = openSheetItem ? slugFromDepartmentPath(openSheetItem.to) : null
  const openSheetSubpages = openSheetSlug ? getDepartmentSubpages(openSheetSlug, userProfile) : []

  const initials = getInitials(userProfile)
  const displayName = userProfile?.displayName || userProfile?.email || 'User'
  const roleLabel = userProfile?.globalRole === 'FOUNDER' ? 'Senior Pastor' : (userProfile?.role || '')
  const email = userProfile?.email || user?.email || ''
  const membershipNumber = userProfile?.membershipNumber || ''
  const photoURL = user?.photoURL || null

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
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
    borderRadius: '20px',
    overflow: 'hidden',
  }

  const pillColor = isDay ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.2)'
  const pillBorder = isDay ? '1px solid rgba(99,102,241,0.15)' : 'none'
  const activeColor = isDay ? '#6366f1' : '#818cf8'
  const inactiveColor = isDay ? '#94a3b8' : '#64748b'

  return (
    <>
    <nav
      className="lg:hidden fixed bottom-4 left-3 right-3"
      style={{
        zIndex: sidebarOpen ? 39 : 50,
        filter: sidebarOpen ? 'blur(3px)' : 'none',
        transition: 'filter 0.2s ease',
        pointerEvents: sidebarOpen ? 'none' : 'auto',
        bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div style={dockStyle}>
        <div className="flex items-stretch">

          {/* Scrollable nav items */}
          <div className="flex-1 flex overflow-x-auto scrollbar-hide px-1 relative min-w-0">

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
              const itemKey = (item.to || '/') + (item.label || '')
              const deptSlug = slugFromDepartmentPath(item.to)
              const tabContent = (
                <>
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
                </>
              )
              return (
                <div
                  key={itemKey}
                  ref={(el) => { tabRefs.current[i] = el }}
                  className="flex-shrink-0"
                  style={{ minWidth: '64px' }}
                >
                  {deptSlug ? (
                    // Department tile — opens the folder sheet with its subpages instead
                    // of navigating straight to the hub (mirrors the desktop dock).
                    <button
                      type="button"
                      onClick={() => setOpenSheetKey(itemKey)}
                      className="flex flex-col items-center justify-center w-full py-2.5 relative z-10 transition-colors duration-200"
                      style={{ color: isActive ? activeColor : inactiveColor }}
                    >
                      {tabContent}
                    </button>
                  ) : (
                    <NavLink
                      to={item.to || '/'}
                      className="flex flex-col items-center justify-center w-full py-2.5 relative z-10 transition-colors duration-200"
                      style={{ color: isActive ? activeColor : inactiveColor }}
                    >
                      {tabContent}
                    </NavLink>
                  )}
                </div>
              )
            })}

          </div>

          {/* Avatar with profile card */}
          <div
            ref={menuRef}
            className="relative flex-shrink-0 flex items-center"
            style={{ borderLeft: isDay ? '1px solid rgba(0,0,0,0.07)' : '1px solid rgba(255,255,255,0.07)' }}
          >
            <button
              type="button"
              onClick={() => setShowMenu((v) => !v)}
              className="flex items-center justify-center px-3 h-full active:opacity-70"
              aria-label="Account menu"
            >
              {photoURL ? (
                <img
                  src={photoURL}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover"
                  style={{ boxShadow: showMenu ? '0 0 0 2px #6366f1' : 'none', transition: 'box-shadow 0.15s' }}
                />
              ) : (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white select-none"
                  style={{
                    background: showMenu
                      ? 'linear-gradient(135deg, #4f46e5, #2563eb)'
                      : 'linear-gradient(135deg, #6366f1, #3b82f6)',
                    boxShadow: showMenu ? '0 0 0 2px #6366f1' : 'none',
                    transition: 'box-shadow 0.15s',
                  }}
                >
                  {initials}
                </div>
              )}
            </button>

            {showMenu && (
              <div
                className="absolute bottom-full right-0 mb-3 rounded-2xl overflow-hidden"
                style={{
                  width: '220px',
                  background: isDay ? 'rgba(255,255,255,0.97)' : 'rgba(15,23,42,0.97)',
                  backdropFilter: 'blur(28px)',
                  WebkitBackdropFilter: 'blur(28px)',
                  border: isDay ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.1)',
                  boxShadow: '0 16px 48px rgba(0,0,0,0.22)',
                }}
              >
                {/* Profile row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {photoURL ? (
                    <img src={photoURL} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0 select-none"
                      style={{ background: 'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)' }}
                    >
                      {initials}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold truncate ${isDay ? 'text-slate-800' : 'text-slate-100'}`}>{displayName}</p>
                    {roleLabel && <p className={`text-xs truncate ${isDay ? 'text-slate-400' : 'text-slate-500'}`}>{roleLabel}</p>}
                    {email && <p className={`text-xs truncate ${isDay ? 'text-slate-400' : 'text-slate-500'}`}>{email}</p>}
                  </div>
                </div>

                {/* Sign out */}
                <div className={`border-t px-3 py-2 ${isDay ? 'border-slate-100' : 'border-slate-700/60'}`}>
                  <button
                    type="button"
                    onClick={() => { setShowMenu(false); signOut() }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium rounded-xl transition-colors ${isDay ? 'text-rose-600 hover:bg-rose-50' : 'text-rose-400 hover:bg-rose-500/10'}`}
                  >
                    <LogOut size={14} strokeWidth={2} />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </nav>

    {/* Folder sheet — subpages of the tapped department, mobile equivalent of the
        desktop dock's popover. Rises above the dock instead of a small anchored
        popover, which is easier to tap on a narrow screen. */}
    {openSheetItem && (
      <>
        <div
          className="lg:hidden fixed inset-0 bg-black/40 backdrop-blur-sm"
          style={{ zIndex: 51 }}
          onClick={() => setOpenSheetKey(null)}
          aria-hidden
        />
        <div
          className="lg:hidden fixed left-3 right-3 rounded-3xl overflow-hidden"
          style={{
            zIndex: 52,
            bottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))',
            background: isDay ? 'rgba(255,255,255,0.97)' : 'rgba(15,23,42,0.97)',
            backdropFilter: 'blur(28px)',
            WebkitBackdropFilter: 'blur(28px)',
            border: isDay ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.22)',
          }}
        >
          <div className={`px-4 pt-3.5 pb-2.5 border-b ${isDay ? 'border-slate-100' : 'border-slate-700/60'}`}>
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">{openSheetItem.label}</p>
          </div>
          <div className="py-1.5 max-h-[50vh] overflow-y-auto">
            {openSheetSubpages.map((sp) => (
              <button
                key={sp.key}
                type="button"
                onClick={() => { setOpenSheetKey(null); navigate(sp.to) }}
                className={`w-full text-left px-4 py-3 text-sm font-medium transition-colors ${isDay ? 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-700' : 'text-slate-200 hover:bg-slate-800'}`}
              >
                {sp.label}
              </button>
            ))}
          </div>
        </div>
      </>
    )}
    </>
  )
}

export default function Sidebar() {
  const { user, userProfile, signOut, hasPermission, isFounder, isDepartmentHead } = useAuth()
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

  // ── Notifications ───────────────────────────────────────────────────────────
  const [notifOpen, setNotifOpen] = useState(false)
  const {
    notifications, dlightConsultCount, consultResponseCount,
    handleNotifAction: navigateForNotif, dismissNotification, addNotificationToTodo,
  } = useActionNotifications(userProfile, isFounder, user?.uid)
  const notifDesktopRef = useRef(null)
  const notifMobileRef = useRef(null)
  const notifRailRef = useRef(null)

  const handleNotifAction = (n) => {
    setNotifOpen(false)
    navigateForNotif(n)
  }

  useEffect(() => {
    if (!notifOpen) return
    const close = (e) => {
      const d = notifDesktopRef.current
      const m = notifMobileRef.current
      const r = notifRailRef.current
      if ((!d || !d.contains(e.target)) && (!m || !m.contains(e.target)) && (!r || !r.contains(e.target))) setNotifOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close) }
  }, [notifOpen])

  // ── Direct Messages ─────────────────────────────────────────────────────────
  const [messagesOpen, setMessagesOpen] = useState(false)
  const {
    conversations, directory: combinedDirectory,
    directorySearch, setDirectorySearch,
    showNewMessage, setShowNewMessage,
    activeConversation, setActiveConversation,
    threadMessages, messageDraft, setMessageDraft,
    unreadMessagesCount,
    openConversation, startConversationWith, handleSendMessage,
    resetPanel,
  } = useDirectMessages(user, userProfile, { directoryEnabled: messagesOpen })
  const msgDesktopRef = useRef(null)
  const msgMobileRef = useRef(null)
  const msgRailRef = useRef(null)

  const toggleMessages = () => {
    setNotifOpen(false)
    setMessagesOpen((v) => !v)
  }

  const closeMessages = () => {
    setMessagesOpen(false)
    resetPanel()
  }

  useEffect(() => {
    if (!messagesOpen) return
    const close = (e) => {
      const d = msgDesktopRef.current
      const m = msgMobileRef.current
      const r = msgRailRef.current
      if ((!d || !d.contains(e.target)) && (!m || !m.contains(e.target)) && (!r || !r.contains(e.target))) closeMessages()
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close) }
  }, [messagesOpen])

  // ── Board Meeting Points ("Director Board") ─────────────────────────────────
  // Unlike Notifications/Messages this is department-scoped data (getBoardPoints
  // reads per-department docs), so the icon only appears while viewing a department
  // page, and fetches independently of whatever DepartmentHub itself has loaded.
  const currentDeptSlug = /^\/department\/([^/]+)/.exec(pathname)?.[1] || null
  const currentDept = currentDeptSlug ? getDepartmentBySlug(currentDeptSlug) : null
  const showBoardIcon = !!currentDept && currentDept.slug !== 'sec-core'
  const [boardPointsOpen, setBoardPointsOpen] = useState(false)
  const [boardPointCount, setBoardPointCount] = useState(0)

  useEffect(() => {
    setBoardPointsOpen(false)
    if (!showBoardIcon) { setBoardPointCount(0); return }
    let alive = true
    getBoardPoints(currentDept.name)
      .then((pts) => { if (alive) setBoardPointCount(pts.filter((p) => p.status === 'pending').length) })
      .catch(() => { if (alive) setBoardPointCount(0) })
    return () => { alive = false }
  }, [currentDept?.name, showBoardIcon])

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

  const asideTextClass = isDay ? 'text-slate-900' : 'text-white'

  // ── Brand header (shared) ───────────────────────────────────────────────────
  // Amazon-style: transparent, no border/fill — sits directly on the page background.
  const BrandHeader = () => (
    <div className="px-4 pt-20 pb-4">
      <div className="flex items-center gap-2.5">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)',
            boxShadow: '0 4px 14px rgba(99,102,241,0.45)',
          }}
        >
          <span
            className="text-white font-black text-xs leading-none select-none"
            style={{ fontFamily: "'Montserrat', Inter, system-ui, sans-serif", letterSpacing: '-0.02em' }}
          >
            R
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h1
            className="font-black leading-tight truncate"
            style={{
              fontFamily: "'Montserrat', Inter, system-ui, sans-serif",
              fontSize: '13px',
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
            style={{ fontSize: '7px', letterSpacing: '0.15em', marginTop: '1px' }}
          >
            ADMIN PORTAL
          </p>
        </div>
        <SundayPlanBubble isDay={isDay} />
        {showBoardIcon && (
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => setBoardPointsOpen(true)}
              className="relative p-1.5 rounded-lg transition-colors hover:bg-white/10"
              style={{ color: isDay ? '#64748b' : '#94a3b8' }}
              aria-label="Director Board"
              title="Board Meeting Points"
            >
              <Presentation size={18} strokeWidth={1.5} />
              {boardPointCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none px-0.5">
                  {boardPointCount > 9 ? '9+' : boardPointCount}
                </span>
              )}
            </button>
          </div>
        )}
        <div className="relative flex-shrink-0" ref={notifDesktopRef}>
          <button
            type="button"
            onClick={() => { setMessagesOpen(false); setNotifOpen((v) => !v) }}
            className="relative p-1.5 rounded-lg transition-colors hover:bg-white/10"
            style={{ color: isDay ? '#64748b' : '#94a3b8' }}
            aria-label="Notifications"
          >
            <Bell size={18} strokeWidth={1.5} />
            {notifications.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none px-0.5">
                {notifications.length > 9 ? '9+' : notifications.length}
              </span>
            )}
          </button>
          {notifOpen && (() => {
            const r = notifDesktopRef.current?.getBoundingClientRect()
            return <NotifPanel isDay={isDay} notifications={notifications} onAction={handleNotifAction}
              onAddToTodo={addNotificationToTodo} onDismiss={dismissNotification}
              posStyle={{ top: (r?.bottom ?? 60) + 8, left: Math.min(r?.left ?? 0, window.innerWidth - 300) }} />
          })()}
        </div>
        <div className="relative flex-shrink-0" ref={msgDesktopRef}>
          <button
            type="button"
            onClick={toggleMessages}
            className="relative p-1.5 rounded-lg transition-colors hover:bg-white/10"
            style={{ color: isDay ? '#64748b' : '#94a3b8' }}
            aria-label="Messages"
          >
            <MessageCircle size={18} strokeWidth={1.5} />
            {unreadMessagesCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none px-0.5">
                {unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}
              </span>
            )}
          </button>
          {messagesOpen && (() => {
            const r = msgDesktopRef.current?.getBoundingClientRect()
            return <MessagesPanel
              isDay={isDay} currentUid={user?.uid}
              conversations={conversations} directory={combinedDirectory}
              directorySearch={directorySearch} setDirectorySearch={setDirectorySearch}
              showNewMessage={showNewMessage} setShowNewMessage={setShowNewMessage}
              activeConversation={activeConversation} threadMessages={threadMessages}
              messageDraft={messageDraft} setMessageDraft={setMessageDraft}
              onOpenConversation={openConversation} onStartConversation={startConversationWith}
              onSend={handleSendMessage} onBack={() => setActiveConversation(null)}
              posStyle={{ top: (r?.bottom ?? 60) + 8, left: Math.min(r?.left ?? 0, window.innerWidth - 336) }}
            />
          })()}
        </div>
      </div>
    </div>
  )

  // ── Mobile header bar (shared) ─────────────────────────────────────────────
  // Amazon-style: transparent, no background/border/shadow — sits directly on the page.
  const MobileHeader = () => (
    <div
      className="lg:hidden fixed top-0 left-0 right-0 flex items-center justify-between px-3"
      style={{
        zIndex: 40,
        paddingTop: 'env(safe-area-inset-top, 24px)',
        minHeight: 'calc(3rem + env(safe-area-inset-top, 24px))',
        height: 'calc(3rem + env(safe-area-inset-top, 24px))',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Toggle menu"
        className="p-2 rounded-xl text-xl leading-none"
        style={{ color: isDay ? '#475569' : '#94a3b8' }}
      >
        {open ? '✕' : '☰'}
      </button>
      <div className="flex items-center gap-1.5">
        <img
          src={rolccLogo}
          alt="ROLCC"
          className="w-6 h-6 rounded-md object-contain flex-shrink-0"
        />
        <span
          className="font-black"
          style={{
            fontFamily: "'Montserrat', Inter, system-ui, sans-serif",
            fontSize: '12px',
            background: titleGradient,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: '-0.015em',
          }}
        >River Of Life</span>
      </div>
      <div className="flex items-center gap-0.5">
        {showBoardIcon && (
          <button
            type="button"
            onClick={() => setBoardPointsOpen(true)}
            className="relative p-2 rounded-xl"
            style={{ color: isDay ? '#475569' : '#94a3b8' }}
            aria-label="Director Board"
            title="Board Meeting Points"
          >
            <Presentation size={20} strokeWidth={1.5} />
            {boardPointCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[14px] h-3.5 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none px-0.5">
                {boardPointCount > 9 ? '9+' : boardPointCount}
              </span>
            )}
          </button>
        )}
        <div className="relative" ref={notifMobileRef}>
          <button
            type="button"
            onClick={() => { setMessagesOpen(false); setNotifOpen((v) => !v) }}
            className="relative p-2 rounded-xl"
            style={{ color: isDay ? '#475569' : '#94a3b8' }}
            aria-label="Notifications"
          >
            <Bell size={20} strokeWidth={1.5} />
            {notifications.length > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[14px] h-3.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none px-0.5">
                {notifications.length > 9 ? '9+' : notifications.length}
              </span>
            )}
          </button>
          {notifOpen && (() => {
            const r = notifMobileRef.current?.getBoundingClientRect()
            const panelW = Math.min(288, window.innerWidth - 24)
            const rightEdge = r ? window.innerWidth - r.right : 8
            return <NotifPanel isDay={isDay} notifications={notifications} onAction={handleNotifAction}
              onAddToTodo={addNotificationToTodo} onDismiss={dismissNotification}
              posStyle={{ top: (r?.bottom ?? 60) + 8, right: Math.max(rightEdge, 8), maxWidth: panelW }} />
          })()}
        </div>
        <div className="relative" ref={msgMobileRef}>
          <button
            type="button"
            onClick={toggleMessages}
            className="relative p-2 rounded-xl"
            style={{ color: isDay ? '#475569' : '#94a3b8' }}
            aria-label="Messages"
          >
            <MessageCircle size={20} strokeWidth={1.5} />
            {unreadMessagesCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[14px] h-3.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none px-0.5">
                {unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}
              </span>
            )}
          </button>
          {messagesOpen && (() => {
            const r = msgMobileRef.current?.getBoundingClientRect()
            const panelW = Math.min(320, window.innerWidth - 24)
            const rightEdge = r ? window.innerWidth - r.right : 8
            return <MessagesPanel
              isDay={isDay} currentUid={user?.uid}
              conversations={conversations} directory={combinedDirectory}
              directorySearch={directorySearch} setDirectorySearch={setDirectorySearch}
              showNewMessage={showNewMessage} setShowNewMessage={setShowNewMessage}
              activeConversation={activeConversation} threadMessages={threadMessages}
              messageDraft={messageDraft} setMessageDraft={setMessageDraft}
              onOpenConversation={openConversation} onStartConversation={startConversationWith}
              onSend={handleSendMessage} onBack={() => setActiveConversation(null)}
              posStyle={{ top: (r?.bottom ?? 60) + 8, right: Math.max(rightEdge, 8), maxWidth: panelW }}
            />
          })()}
        </div>
        <button
          type="button"
          onClick={() => setTheme((t) => (t === 'night' ? 'day' : 'night'))}
          aria-label={themeToggleLabel}
          className="p-2 rounded-xl text-base"
        >
          {theme === 'night' ? '🌙' : '☀️'}
        </button>
      </div>
    </div>
  )

  // ── Icon-only rail (desktop, My Workspace route) ────────────────────────────
  // Replaces the full labeled sidebar at lg+ while on '/' so the workspace page gets
  // full breathing room. Reuses the exact same notification/message state, panels, and
  // handlers as the full sidebar — just a slimmer presentation of the same nav items.
  const IconRail = ({ items }) => (
    <aside
      className="hidden lg:flex w-16 min-h-screen flex-col items-center fixed left-0 top-0 py-3 gap-1"
      style={{ ...sidebarStyle, zIndex: 45 }}
    >
      <RailTooltip label="Home">
        <NavLink to="/" className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mb-1" style={{
          background: 'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)',
          boxShadow: '0 4px 14px rgba(99,102,241,0.45)',
        }}>
          <span className="text-white font-black text-base leading-none select-none" style={{ fontFamily: "'Montserrat', Inter, system-ui, sans-serif" }}>R</span>
        </NavLink>
      </RailTooltip>

      <RailTooltip label="Notifications">
        <div className="relative flex-shrink-0" ref={notifRailRef}>
          <button
            type="button"
            onClick={() => { setMessagesOpen(false); setNotifOpen((v) => !v) }}
            className="relative p-2 rounded-lg transition-colors hover:bg-white/10"
            style={{ color: isDay ? '#cbd5e1' : '#94a3b8' }}
            aria-label="Notifications"
          >
            <Bell size={18} strokeWidth={1.5} />
            {notifications.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none px-0.5">
                {notifications.length > 9 ? '9+' : notifications.length}
              </span>
            )}
          </button>
          {notifOpen && (() => {
            const r = notifRailRef.current?.getBoundingClientRect()
            return <NotifPanel isDay={isDay} notifications={notifications} onAction={handleNotifAction}
                onAddToTodo={addNotificationToTodo} onDismiss={dismissNotification}
              posStyle={{ top: r?.top ?? 60, left: (r?.right ?? 64) + 8 }} />
          })()}
        </div>
      </RailTooltip>

      <RailTooltip label="Messages">
        <div className="relative flex-shrink-0" ref={msgRailRef}>
          <button
            type="button"
            onClick={toggleMessages}
            className="relative p-2 rounded-lg transition-colors hover:bg-white/10"
            style={{ color: isDay ? '#cbd5e1' : '#94a3b8' }}
            aria-label="Messages"
          >
            <MessageCircle size={18} strokeWidth={1.5} />
            {unreadMessagesCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none px-0.5">
                {unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}
              </span>
            )}
          </button>
          {messagesOpen && (() => {
            const r = msgRailRef.current?.getBoundingClientRect()
            return <MessagesPanel
              isDay={isDay} currentUid={user?.uid}
              conversations={conversations} directory={combinedDirectory}
              directorySearch={directorySearch} setDirectorySearch={setDirectorySearch}
              showNewMessage={showNewMessage} setShowNewMessage={setShowNewMessage}
              activeConversation={activeConversation} threadMessages={threadMessages}
              messageDraft={messageDraft} setMessageDraft={setMessageDraft}
              onOpenConversation={openConversation} onStartConversation={startConversationWith}
              onSend={handleSendMessage} onBack={() => setActiveConversation(null)}
              posStyle={{ top: r?.top ?? 60, left: (r?.right ?? 64) + 8 }}
            />
          })()}
        </div>
      </RailTooltip>

      {showBoardIcon && (
        <RailTooltip label="Board Meeting Points">
          <button
            type="button"
            onClick={() => setBoardPointsOpen(true)}
            className="relative p-2 rounded-lg transition-colors hover:bg-white/10 flex-shrink-0"
            style={{ color: isDay ? '#cbd5e1' : '#94a3b8' }}
            aria-label="Director Board"
          >
            <Presentation size={18} strokeWidth={1.5} />
            {boardPointCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none px-0.5">
                {boardPointCount > 9 ? '9+' : boardPointCount}
              </span>
            )}
          </button>
        </RailTooltip>
      )}

      <div className="w-8 border-t border-white/10 my-1 flex-shrink-0" />

      <nav className="flex-1 flex flex-col items-center gap-1 overflow-y-auto w-full px-1.5">
        {items.map((item) => (
          <RailTooltip key={(item.to || '/') + (item.label || '')} label={item.label}>
            <NavLink
              to={item.to || '/'}
              className={({ isActive }) =>
                `relative w-11 h-11 rounded-xl flex items-center justify-center text-lg flex-shrink-0 transition-all ${
                  isActive ? navLinkActive : navLinkInactive
                }`
              }
            >
              <span aria-hidden>{item.icon}</span>
              {item.to === getDepartmentPath('D Light') && dlightConsultCount > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                  {dlightConsultCount > 9 ? '9+' : dlightConsultCount}
                </span>
              )}
              {(item.to === getDepartmentPath('Cell') || item.to === '/department/cell/cell-report') && consultResponseCount > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                  {consultResponseCount > 9 ? '9+' : consultResponseCount}
                </span>
              )}
            </NavLink>
          </RailTooltip>
        ))}
      </nav>

      <RailTooltip label={themeToggleLabel}>
        <button
          type="button"
          onClick={() => setTheme((t) => (t === 'night' ? 'day' : 'night'))}
          aria-label={themeToggleLabel}
          className="w-10 h-10 rounded-lg flex items-center justify-center text-base flex-shrink-0 hover:bg-white/10 transition-colors"
        >
          {theme === 'night' ? '🌙' : '☀️'}
        </button>
      </RailTooltip>
      <RailTooltip label="Sign out">
        <button
          type="button"
          onClick={signOut}
          aria-label="Sign out"
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-rose-400 hover:bg-rose-500/10 transition-colors"
        >
          <LogOut size={16} strokeWidth={2} />
        </button>
      </RailTooltip>
    </aside>
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
    for (const v of headDeptMap.values()) {
      scopedItems.push({
        to: getDepartmentPath(v.deptName),
        label: `${displayDeptName(v.deptName)} (${v.headRole === 'DIRECTOR' ? 'Director' : 'Coordinator'})`,
        icon: '📁',
      })
    }
    // Team members without a head title (e.g. "Associate") still need a way into their
    // department hub now that Sunday Plan no longer sits in the sidebar as a fallback link.
    for (const d of (userProfile?.departments || [])) {
      if (!d || d === 'Cell' || headDeptMap.has(d)) continue
      scopedItems.push({ to: getDepartmentPath(d), label: displayDeptName(d), icon: '📁' })
    }
    if (hasCellHead) {
      scopedItems.push({ to: '/department/cell/cell-report', label: `Cell (${cellName})`, icon: '🍃' })
    }
    // People Directory is intentionally not a standalone nav item for Cell Directors —
    // the /people route stays live and reachable from cell group "Add Member"/"Link
    // Person" actions, but browsing the full directory from the sidebar is Admin/Founder-only.
    if (canAccessWeeklyEntryOnly(userProfile)) {
      scopedItems.push({ to: `${ACCOUNTS_ENTRY_BASE_PATH}/weekly`, label: 'Weekly Entry', icon: '📝' })
    }
    scopedItems.unshift(WORKSPACE_ITEM)

    return (
      <>
        <MobileHeader />
        {open && (
          <div className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm" style={{ zIndex: 41 }} onClick={() => setOpen(false)} aria-hidden />
        )}
        <aside
          className={`w-64 min-h-screen bg-gradient-to-b from-slate-800 to-slate-900 ${asideTextClass} flex flex-col fixed left-0 top-0 transform transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'} lg:hidden`}
          style={{ ...sidebarStyle, zIndex: 45, paddingTop: 'env(safe-area-inset-top, 0px)' }}
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
                {item.to === getDepartmentPath('D Light') && dlightConsultCount > 0 && (
                  <span className="ml-auto min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                    {dlightConsultCount > 9 ? '9+' : dlightConsultCount}
                  </span>
                )}
                {item.to === '/department/cell/cell-report' && consultResponseCount > 0 && (
                  <span className="ml-auto min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                    {consultResponseCount > 9 ? '9+' : consultResponseCount}
                  </span>
                )}
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
        <IconRail items={scopedItems} />
        <BottomTabBar items={scopedItems} theme={theme} signOut={signOut} userProfile={userProfile} user={user} sidebarOpen={open} />
        {boardPointsOpen && currentDept && (
          <BoardPointsModal department={currentDept.name} userEmail={userProfile?.email} onClose={() => setBoardPointsOpen(false)} />
        )}
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
    if (item.founderOnly) return isFounder
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
  const seenTo = new Set(['/'])
  const visibleWithMyDept = [WORKSPACE_ITEM, ...mergedNav.filter((item) => {
    if (seenTo.has(item.to)) return false
    seenTo.add(item.to)
    return true
  })]

  return (
    <>
      <MobileHeader />
      {open && (
        <div className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm" style={{ zIndex: 41 }} onClick={() => setOpen(false)} aria-hidden />
      )}
      <aside
        className={`w-64 min-h-screen bg-gradient-to-b from-slate-800 to-slate-900 ${asideTextClass} flex flex-col fixed left-0 top-0 transform transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'} lg:hidden`}
        style={{ ...sidebarStyle, zIndex: 45 }}
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
              {item.to === getDepartmentPath('D Light') && dlightConsultCount > 0 && (
                <span className="ml-auto min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                  {dlightConsultCount > 9 ? '9+' : dlightConsultCount}
                </span>
              )}
              {item.to === getDepartmentPath('Cell') && consultResponseCount > 0 && (
                <span className="ml-auto min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                  {consultResponseCount > 9 ? '9+' : consultResponseCount}
                </span>
              )}
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
      <IconRail items={visibleWithMyDept} />
      <BottomTabBar items={visibleWithMyDept} theme={theme} signOut={signOut} userProfile={userProfile} user={user} sidebarOpen={open} />
      {boardPointsOpen && currentDept && (
        <BoardPointsModal department={currentDept.name} userEmail={userProfile?.email} onClose={() => setBoardPointsOpen(false)} />
      )}
    </>
  )
}
