import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ClipboardList, Home, Menu, Moon, Sun, UserCog, Users } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import RailTooltip from '../RailTooltip'
import ProfileDrawer from '../ProfileDrawer'
import WorkspaceHeader from '../workspace/WorkspaceHeader'
import rolccLogo from '../../assets/rolcc_logo BW.JPG'

function getInitials(profile) {
  const name = profile?.displayName || profile?.email || ''
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

// Sidebar is just two small chrome pieces — MobileHeader (a slim top bar: hamburger +
// logo on the left, opening a narrow mobile drawer; the bell/messages/board icons now
// live here too — see below) and IconRail (desktop's icon strip: profile, My Workspace,
// theme, sign out). Department/report navigation lives entirely in the global floating
// dock (DepartmentDock, rendered from MainLayout) and My Workspace itself — neither
// surface here duplicates that as a per-role nav-item list. The exceptions are User
// Management (`/admin/users`), People Directory (`/people`), and Worklist Sheet
// (`/worklist`): all three are Founder-only, have no department tile of their own, and
// aren't linked from anywhere else, so both rails render them — gated on `isFounder` —
// right after My Workspace. The mobile drawer is otherwise a slim w-16 icon-only rail
// carrying the same account-level actions as IconRail (profile, home, theme, sign out)
// — no text labels, no full-width nav-list panel.
//
// `notifications`/`onNotifAction`/`onDismissNotification`/`onAddNotificationToTodo` are
// passed down from MainLayout (a single lifted useActionNotifications subscription) so
// MobileHeader can render the same WorkspaceHeader icon row My Workspace's desktop
// greeting row uses, inline with the logo/menu instead of a separate row further down
// the page. The profile avatar that used to sit here moved out — it's already one tap
// away via the hamburger's drawer (and the desktop rail), so this bar no longer needs
// its own copy.
export default function Sidebar({ notifications, onNotifAction, onDismissNotification, onAddNotificationToTodo }) {
  const { user, userProfile, isFounder } = useAuth()
  const { pathname } = useLocation()
  const [profileOpen, setProfileOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => { setDrawerOpen(false) }, [pathname])

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

  const isDay = theme !== 'night'

  const sidebarStyle = isDay ? {
    background: 'rgba(255,255,255,0.72)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    borderRight: '1px solid rgba(255,255,255,0.9)',
    boxShadow: '4px 0 32px rgba(0,0,0,0.08)',
  } : {}

  // Solid/glass backing for the fixed mobile top bar so scrolled page content
  // (cards, lists) can never visually bleed through the logo/icon row.
  const mobileHeaderStyle = isDay ? {
    background: 'rgba(255,255,255,0.9)',
    backdropFilter: 'blur(16px) saturate(180%)',
    WebkitBackdropFilter: 'blur(16px) saturate(180%)',
    borderBottom: '1px solid rgba(226,232,240,0.8)',
    boxShadow: '0 1px 12px rgba(0,0,0,0.04)',
  } : {
    background: 'rgba(11,18,32,0.9)',
    backdropFilter: 'blur(16px) saturate(180%)',
    WebkitBackdropFilter: 'blur(16px) saturate(180%)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  }

  const navLinkActive = 'bg-gradient-to-r from-indigo-500 to-blue-500 text-white shadow-md'
  const navLinkInactive = isDay
    ? 'text-slate-600 hover:bg-black/5 hover:text-slate-900'
    : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'

  const titleGradient = isDay
    ? 'linear-gradient(to right, #1e293b 0%, #475569 100%)'
    : 'linear-gradient(to right, #ffffff 0%, #cbd5e1 100%)'

  const photoURL = user?.photoURL || null
  const initials = getInitials(userProfile)

  const AvatarGlyph = ({ className }) => (
    photoURL ? (
      <img src={photoURL} alt="" className={`${className} object-cover`} />
    ) : (
      <span
        className={`${className} flex items-center justify-center text-xs font-bold text-white select-none`}
        style={{ background: 'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)' }}
      >
        {initials}
      </span>
    )
  )

  // ── Mobile top bar — hamburger + logo on the left, utility action icons (Sunday
  // Plan/notifications/messages/Director Board) on the right, all on one line. ──
  const MobileHeader = () => (
    <div
      className="lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-2"
      style={{
        ...mobileHeaderStyle,
        paddingTop: 'env(safe-area-inset-top, 24px)',
        minHeight: 'calc(3rem + env(safe-area-inset-top, 24px))',
        height: 'calc(3rem + env(safe-area-inset-top, 24px))',
      }}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 active:scale-95 transition-colors"
          style={{ color: isDay ? '#475569' : '#94a3b8' }}
        >
          <Menu size={24} strokeWidth={1.75} />
        </button>
        <Link to="/" className="flex items-center gap-1.5">
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
        </Link>
      </div>

      <div className="mr-1">
        <WorkspaceHeader
          notifications={notifications}
          onNotifAction={onNotifAction}
          onDismissNotification={onDismissNotification}
          onAddNotificationToTodo={onAddNotificationToTodo}
        />
      </div>
    </div>
  )

  // ── Narrow mobile drawer — a w-16 icon-only rail, not a text-labeled nav-list
  // panel. Brand mark up top (where the profile avatar used to sit), then
  // Workspace; theme + profile grouped in the footer, mirroring desktop's
  // IconRail exactly. No Sign Out here — it lives inside ProfileDrawer (opened
  // by the footer avatar) so there's one place to sign out, not a second copy
  // sitting right next to it. Always mounted (rather than conditionally
  // rendered) so the slide/backdrop transitions animate on close as well as open.
  const MobileDrawer = () => {
    const mobileRailBtnClass = 'relative rounded-2xl flex items-center justify-center flex-shrink-0 transition-all active:scale-95'
    return (
      <div
        className="lg:hidden fixed inset-0"
        style={{ zIndex: 60, pointerEvents: drawerOpen ? 'auto' : 'none' }}
      >
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
          style={{ opacity: drawerOpen ? 1 : 0 }}
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
        <aside
          className="absolute inset-y-0 left-0 w-16 flex flex-col items-center py-3 gap-1 shadow-2xl transition-transform duration-300 bg-white"
          style={{
            transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
            paddingTop: 'env(safe-area-inset-top, 12px)',
          }}
        >
          <Link
            to="/"
            title="River Of Life"
            aria-label="River Of Life — My Workspace"
            onClick={() => setDrawerOpen(false)}
            className="w-10 h-10 rounded-2xl overflow-hidden flex-shrink-0"
          >
            <img src={rolccLogo} alt="ROLCC" className="w-full h-full object-cover" />
          </Link>

          <div className="w-8 border-t border-slate-100 my-1 flex-shrink-0" />

          <NavLink
            to="/"
            title={isFounder ? 'Eden Garden' : 'My Workspace'}
            aria-label={isFounder ? 'Eden Garden' : 'My Workspace'}
            onClick={() => setDrawerOpen(false)}
            className={({ isActive }) =>
              `${mobileRailBtnClass} w-12 h-12 ${isActive ? navLinkActive : navLinkInactive}`
            }
          >
            <Home size={22} strokeWidth={1.75} />
          </NavLink>

          {isFounder && (
            <NavLink
              to="/admin/users"
              title="User Management"
              aria-label="User Management"
              onClick={() => setDrawerOpen(false)}
              className={({ isActive }) =>
                `${mobileRailBtnClass} w-12 h-12 ${isActive ? navLinkActive : navLinkInactive}`
              }
            >
              <UserCog size={22} strokeWidth={1.75} />
            </NavLink>
          )}

          {isFounder && (
            <NavLink
              to="/people"
              title="People Directory"
              aria-label="People Directory"
              onClick={() => setDrawerOpen(false)}
              className={({ isActive }) =>
                `${mobileRailBtnClass} w-12 h-12 ${isActive ? navLinkActive : navLinkInactive}`
              }
            >
              <Users size={22} strokeWidth={1.75} />
            </NavLink>
          )}

          {isFounder && (
            <NavLink
              to="/worklist"
              title="Worklist Sheet"
              aria-label="Worklist Sheet"
              onClick={() => setDrawerOpen(false)}
              className={({ isActive }) =>
                `${mobileRailBtnClass} w-12 h-12 ${isActive ? navLinkActive : navLinkInactive}`
              }
            >
              <ClipboardList size={22} strokeWidth={1.75} />
            </NavLink>
          )}

          <div className="flex-1" />

          <button
            type="button"
            title={themeToggleLabel}
            aria-label={themeToggleLabel}
            onClick={() => { setTheme((t) => (t === 'night' ? 'day' : 'night')); setDrawerOpen(false) }}
            className={`${mobileRailBtnClass} w-11 h-11 text-slate-500 hover:bg-slate-100`}
          >
            {theme === 'night' ? <Moon size={20} strokeWidth={1.75} /> : <Sun size={20} strokeWidth={1.75} />}
          </button>
          <button
            type="button"
            title="Profile"
            aria-label="Profile"
            onClick={() => { setDrawerOpen(false); setProfileOpen(true) }}
            className={`${mobileRailBtnClass} w-11 h-11 overflow-hidden hover:ring-2 hover:ring-indigo-400/50`}
          >
            <AvatarGlyph className="w-11 h-11 rounded-2xl" />
          </button>
        </aside>
      </div>
    )
  }

  // ── Icon-only rail (desktop, every route) ───────────────────────────────────
  // Brand mark up top (where the profile avatar used to sit), then Workspace;
  // theme + profile grouped in the footer. No Sign Out here — it lives inside
  // ProfileDrawer (opened by the footer avatar) so there's one place to sign
  // out, not a second copy sitting right next to it.
  const IconRail = () => (
    <aside
      className="hidden lg:flex w-16 min-h-screen flex-col items-center fixed left-0 top-0 py-3 gap-1"
      style={{ ...sidebarStyle, zIndex: 45 }}
    >
      <Link to="/" title="River Of Life" aria-label="River Of Life — My Workspace" className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0">
        <img src={rolccLogo} alt="ROLCC" className="w-full h-full object-cover" />
      </Link>

      <div className="w-8 border-t border-white/10 my-1 flex-shrink-0" />

      <RailTooltip label={isFounder ? 'Eden Garden' : 'My Workspace'}>
        <NavLink
          to="/"
          className={({ isActive }) =>
            `relative w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
              isActive ? navLinkActive : navLinkInactive
            }`
          }
        >
          <Home size={20} strokeWidth={1.75} />
        </NavLink>
      </RailTooltip>

      {isFounder && (
        <RailTooltip label="User Management">
          <NavLink
            to="/admin/users"
            aria-label="User Management"
            className={({ isActive }) =>
              `relative w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
                isActive ? navLinkActive : navLinkInactive
              }`
            }
          >
            <UserCog size={20} strokeWidth={1.75} />
          </NavLink>
        </RailTooltip>
      )}

      {isFounder && (
        <RailTooltip label="People Directory">
          <NavLink
            to="/people"
            aria-label="People Directory"
            className={({ isActive }) =>
              `relative w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
                isActive ? navLinkActive : navLinkInactive
              }`
            }
          >
            <Users size={20} strokeWidth={1.75} />
          </NavLink>
        </RailTooltip>
      )}

      {isFounder && (
        <RailTooltip label="Worklist Sheet">
          <NavLink
            to="/worklist"
            aria-label="Worklist Sheet"
            className={({ isActive }) =>
              `relative w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
                isActive ? navLinkActive : navLinkInactive
              }`
            }
          >
            <ClipboardList size={20} strokeWidth={1.75} />
          </NavLink>
        </RailTooltip>
      )}

      <div className="flex-1" />

      <RailTooltip label={themeToggleLabel}>
        <button
          type="button"
          onClick={() => setTheme((t) => (t === 'night' ? 'day' : 'night'))}
          title={themeToggleLabel}
          aria-label={themeToggleLabel}
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 hover:bg-white/10 transition-colors"
          style={{ color: isDay ? '#64748b' : '#94a3b8' }}
        >
          {theme === 'night' ? <Moon size={18} strokeWidth={1.75} /> : <Sun size={18} strokeWidth={1.75} />}
        </button>
      </RailTooltip>
      <RailTooltip label="Profile">
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          title="Profile"
          aria-label="Profile"
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden hover:ring-2 hover:ring-indigo-400/50 transition-all"
        >
          {photoURL ? (
            <img src={photoURL} alt="" className="w-full h-full object-cover" />
          ) : (
            <span
              className="w-full h-full flex items-center justify-center text-xs font-bold text-white select-none"
              style={{ background: 'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)' }}
            >
              {initials}
            </span>
          )}
        </button>
      </RailTooltip>
    </aside>
  )

  return (
    <>
      <MobileHeader />
      <MobileDrawer />
      <IconRail />
      {profileOpen && (
        <ProfileDrawer user={user} userProfile={userProfile} onClose={() => setProfileOpen(false)} />
      )}
    </>
  )
}
