import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Home, LogOut } from 'lucide-react'
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

// Sidebar is now just two small, always-mounted chrome pieces — MobileHeader (a
// slim top bar: logo + profile avatar) and IconRail (desktop's icon strip: profile,
// My Workspace, theme, sign out — no separate brand mark). Department/report/admin
// navigation lives
// entirely in the global floating dock (DepartmentDock, rendered from MainLayout) and
// My Workspace itself — there is no more per-role nav-item list, hamburger drawer, or
// bottom tab bar to build one for. Notifications/messages live on WorkspaceHeader
// (My Workspace's page-level header) so they render in exactly one place, not here.
export default function Sidebar() {
  const { user, userProfile, signOut } = useAuth()
  const [profileOpen, setProfileOpen] = useState(false)

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

  // ── Mobile top bar — logo (→ My Workspace) + profile avatar, nothing else. ─────
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

      <button
        type="button"
        onClick={() => setProfileOpen(true)}
        aria-label="Profile"
        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
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
      <IconRail />
      {profileOpen && (
        <ProfileDrawer user={user} userProfile={userProfile} onClose={() => setProfileOpen(false)} />
      )}
    </>
  )
}
