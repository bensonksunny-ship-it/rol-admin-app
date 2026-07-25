import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Home, LogOut, Menu } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import RailTooltip from '../RailTooltip'
import ProfileDrawer from '../ProfileDrawer'
import rolccLogo from '../../assets/rolcc_logo BW.JPG'

function getInitials(profile) {
  const name = profile?.displayName || profile?.email || ''
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

// Sidebar is just two small chrome pieces — MobileHeader (a slim top bar: hamburger +
// logo on the left, profile avatar on the right, opening a narrow mobile drawer or the
// full-detail ProfileDrawer respectively) and IconRail (desktop's icon strip: profile,
// My Workspace, theme, sign out). Department/report/admin navigation lives entirely in
// the global floating dock (DepartmentDock, rendered from MainLayout) and My Workspace
// itself — neither surface here duplicates that as a per-role nav-item list; the mobile
// drawer only carries account-level actions (profile, home, theme, sign out), mirroring
// IconRail's content rather than the old wide nav-list drawer. Notifications/messages
// live on WorkspaceHeader (My Workspace's page-level header) so they render in exactly
// one place, not here.
export default function Sidebar() {
  const { user, userProfile, signOut } = useAuth()
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

  const navLinkActive = 'bg-gradient-to-r from-indigo-500 to-blue-500 text-white shadow-md'
  const navLinkInactive = isDay
    ? 'text-slate-600 hover:bg-black/5 hover:text-slate-900'
    : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'

  const titleGradient = isDay
    ? 'linear-gradient(to right, #1e293b 0%, #475569 100%)'
    : 'linear-gradient(to right, #ffffff 0%, #cbd5e1 100%)'

  const photoURL = user?.photoURL || null
  const initials = getInitials(userProfile)
  const displayName = userProfile?.displayName || userProfile?.email || 'User'
  const roleLabel = userProfile?.globalRole === 'FOUNDER' ? 'Senior Pastor' : (userProfile?.role || '')

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

  // ── Mobile top bar — hamburger + logo on the left, profile avatar on the right. ──
  const MobileHeader = () => (
    <div
      className="lg:hidden fixed top-0 left-0 right-0 flex items-center justify-between px-2"
      style={{
        zIndex: 40,
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
          className="p-2 rounded-xl"
          style={{ color: isDay ? '#475569' : '#94a3b8' }}
        >
          <Menu size={20} strokeWidth={1.75} />
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

      <button
        type="button"
        onClick={() => setProfileOpen(true)}
        aria-label="Profile"
        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden mr-1"
      >
        <AvatarGlyph className="w-full h-full" />
      </button>
    </div>
  )

  // ── Narrow mobile drawer — compact account rail (profile, home, theme, sign out),
  // not a second copy of app-wide navigation. Always mounted so the slide/backdrop
  // transitions animate on close as well as open, not just appear/disappear.
  const MobileDrawer = () => (
    <div
      className="lg:hidden fixed inset-0"
      style={{ zIndex: 45, pointerEvents: drawerOpen ? 'auto' : 'none' }}
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: drawerOpen ? 1 : 0 }}
        onClick={() => setDrawerOpen(false)}
        aria-hidden
      />
      <aside
        className="absolute inset-y-0 left-0 w-56 max-w-[70vw] flex flex-col shadow-2xl transition-transform duration-300 bg-white"
        style={{
          transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
          paddingTop: 'env(safe-area-inset-top, 12px)',
        }}
      >
        <button
          type="button"
          onClick={() => { setDrawerOpen(false); setProfileOpen(true) }}
          className="flex items-center gap-2.5 px-3.5 py-4 border-b border-slate-100 text-left hover:bg-slate-50 transition-colors flex-shrink-0"
        >
          <AvatarGlyph className="w-10 h-10 rounded-full flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">{displayName}</p>
            {roleLabel && <p className="text-xs text-slate-400 truncate mt-0.5">{roleLabel}</p>}
          </div>
        </button>

        <nav className="flex-1 p-2">
          <NavLink
            to="/"
            onClick={() => setDrawerOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive ? navLinkActive : navLinkInactive
              }`
            }
          >
            <Home size={18} strokeWidth={1.75} />
            My Workspace
          </NavLink>
        </nav>

        <div className="p-2 border-t border-slate-100 flex-shrink-0 space-y-0.5">
          <button
            type="button"
            onClick={() => { setTheme((t) => (t === 'night' ? 'day' : 'night')); setDrawerOpen(false) }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <span className="w-[18px] text-center leading-none">{theme === 'night' ? '🌙' : '☀️'}</span>
            {themeToggleLabel}
          </button>
          <button
            type="button"
            onClick={() => { setDrawerOpen(false); signOut() }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium rounded-lg text-rose-600 hover:bg-rose-50 transition-colors"
          >
            <LogOut size={18} strokeWidth={1.75} />
            Sign out
          </button>
        </div>
      </aside>
    </div>
  )

  // ── Icon-only rail (desktop, every route) ───────────────────────────────────
  const IconRail = () => (
    <aside
      className="hidden lg:flex w-16 min-h-screen flex-col items-center fixed left-0 top-0 py-3 gap-1"
      style={{ ...sidebarStyle, zIndex: 45 }}
    >
      <RailTooltip label="Profile">
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
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

      <div className="w-8 border-t border-white/10 my-1 flex-shrink-0" />

      <div className="flex-1 flex flex-col items-center w-full">
        <RailTooltip label="My Workspace">
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
      </div>

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
