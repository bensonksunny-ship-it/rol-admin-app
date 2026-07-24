import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Crown, Building2, CalendarCheck,
  UserCog, FolderOpen, Leaf, PenLine, LogOut, Bell, Users,
  MessageCircle, ChevronLeft, SquarePen, Send,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { getDepartmentPath } from '../../constants/departments'
import { ROLES } from '../../constants/roles'
import { getDepartmentRole } from '../../utils/access'
import { isCellDirectorInPositions } from '../../utils/cellReportPermissions'
import { canAccessWeeklyEntryOnly, ACCOUNTS_ENTRY_BASE_PATH } from '../../utils/accountsEntryAccess'
import {
  subscribePCSFillInvitationsByCellId, subscribeCellVisitorProposals, subscribeCellDlightConsultTasks,
  subscribeUserConversations, subscribeUserDirectory, subscribeConversationMessages,
  getOrCreateDirectConversation, sendDirectMessage, markConversationRead, syncAllUsersToDirectory,
} from '../../services/firestore'
import SundayPlanBubble from '../SundayPlanBubble'
import rolccLogo from '../../assets/rolcc_logo BW.JPG'

const navItems = [
  { to: '/', label: 'Dashboard', icon: '📊', permission: 'dashboard', founderOnly: true },
  { to: '/senior-pastor', label: 'Senior Pastor Office', icon: '👤', permission: 'pastorHub', orFounder: true },
  { to: '/departments', label: 'Departments', icon: '🏢', permission: 'departments' },
  { to: '/sunday-planning', label: 'Sunday Plan', icon: '📋', permission: 'attendance' },
  { to: '/admin/users', label: 'User Management', icon: '👥', permission: 'manageUsers', adminOnly: true },
  { to: '/people', label: 'People Directory', icon: '🗂️', permission: 'manageUsers', adminOnly: true },
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
  '🗂️': Users,
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

function getInitials(profile) {
  const name = profile?.displayName || profile?.email || ''
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function NotifPanel({ isDay, notifications, posStyle, onAction }) {
  const fmtDate = (d) => {
    if (!d) return ''
    try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) } catch { return '' }
  }
  return (
    <div
      className="w-72 rounded-2xl overflow-hidden"
      style={{
        position: 'fixed',
        zIndex: 9999,
        maxWidth: 'calc(100vw - 24px)',
        background: isDay ? 'rgba(255,255,255,0.97)' : 'rgba(15,23,42,0.97)',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
        border: isDay ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 16px 48px rgba(0,0,0,0.22)',
        ...posStyle,
      }}
    >
      <div className={`px-4 py-2.5 flex items-center justify-between border-b ${isDay ? 'border-slate-100' : 'border-slate-700/60'}`}>
        <p className={`text-sm font-bold ${isDay ? 'text-slate-800' : 'text-slate-100'}`}>Notifications</p>
        {notifications.length > 0 && (
          <span className="text-xs font-semibold text-indigo-500">{notifications.length} pending</span>
        )}
      </div>
      {notifications.length === 0 ? (
        <div className={`px-4 py-6 text-center ${isDay ? 'text-slate-400' : 'text-slate-500'}`}>
          <Bell size={24} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No new notifications</p>
        </div>
      ) : (
        <div className={`overflow-y-auto max-h-72 divide-y ${isDay ? 'divide-slate-100' : 'divide-slate-700/50'}`}>
          {notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onAction && onAction(n)}
              className={`w-full text-left px-4 py-3 transition-colors ${isDay ? 'hover:bg-violet-50' : 'hover:bg-slate-800/50'}`}
            >
              <p className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${isDay ? 'text-violet-600' : 'text-violet-400'}`}>{n.title}</p>
              <p className={`text-sm ${isDay ? 'text-slate-700' : 'text-slate-200'}`}>{n.body}</p>
              {n.cellName && <p className={`text-xs mt-0.5 ${isDay ? 'text-slate-400' : 'text-slate-500'}`}>{n.cellName}</p>}
              {n.sentAt && <p className={`text-[10px] mt-1 ${isDay ? 'text-slate-300' : 'text-slate-600'}`}>{fmtDate(n.sentAt)}</p>}
              <p className={`text-xs font-semibold mt-1.5 ${isDay ? 'text-violet-600' : 'text-violet-400'}`}>
                {n.type === 'visitor_proposal' ? 'Tap to review →'
                  : n.type === 'dlight_consult' ? 'Tap to respond →'
                  : n.type === 'consult_response' ? 'Tap to review →'
                  : 'Tap to fill →'}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function MessagesPanel({
  isDay, posStyle, conversations, currentUid, directory, directorySearch, setDirectorySearch,
  showNewMessage, setShowNewMessage, activeConversation, threadMessages,
  messageDraft, setMessageDraft, onOpenConversation, onStartConversation, onSend, onBack,
}) {
  const fmtTime = (d) => {
    if (!d) return ''
    try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) } catch { return '' }
  }
  const borderClass = isDay ? 'border-slate-100' : 'border-slate-700/60'
  const inputClass = `w-full text-sm px-3 py-2 rounded-xl outline-none ${isDay ? 'bg-slate-100 text-slate-800 placeholder-slate-400' : 'bg-slate-800 text-slate-100 placeholder-slate-500'}`

  const searchTerm = directorySearch.trim().toLowerCase()
  const filteredDirectory = directory
    .filter((p) => p.uid !== currentUid)
    .filter((p) => {
      if (!searchTerm) return true
      return (p.name || '').toLowerCase().includes(searchTerm)
        || (p.email || '').toLowerCase().includes(searchTerm)
        || (p.role || '').toLowerCase().includes(searchTerm)
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  return (
    <div
      className="w-80 rounded-2xl overflow-hidden flex flex-col"
      style={{
        position: 'fixed',
        zIndex: 9999,
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: '70vh',
        background: isDay ? 'rgba(255,255,255,0.97)' : 'rgba(15,23,42,0.97)',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
        border: isDay ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 16px 48px rgba(0,0,0,0.22)',
        ...posStyle,
      }}
    >
      <div className={`px-4 py-2.5 flex items-center justify-between border-b flex-shrink-0 ${borderClass}`}>
        {activeConversation ? (
          <button type="button" onClick={onBack} className={`flex items-center gap-1 text-sm font-bold ${isDay ? 'text-slate-800' : 'text-slate-100'}`}>
            <ChevronLeft size={16} /> {activeConversation.otherName}
          </button>
        ) : (
          <p className={`text-sm font-bold ${isDay ? 'text-slate-800' : 'text-slate-100'}`}>Messages</p>
        )}
        {!activeConversation && (
          <button
            type="button"
            onClick={() => setShowNewMessage((v) => !v)}
            className={`p-1 rounded-lg ${isDay ? 'text-violet-600 hover:bg-violet-50' : 'text-violet-400 hover:bg-slate-800/50'}`}
            aria-label="New message"
          >
            <SquarePen size={16} />
          </button>
        )}
      </div>

      {activeConversation ? (
        <>
          <div className="overflow-y-auto flex-1 px-3 py-3 space-y-2" style={{ minHeight: 220 }}>
            {threadMessages.length === 0 ? (
              <p className={`text-xs text-center mt-6 ${isDay ? 'text-slate-400' : 'text-slate-500'}`}>Say hello 👋</p>
            ) : threadMessages.map((m) => {
              const mine = m.senderId === currentUid
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[75%] px-3 py-1.5 rounded-2xl text-sm break-words ${
                      mine
                        ? 'bg-gradient-to-r from-indigo-500 to-blue-500 text-white'
                        : isDay ? 'bg-slate-100 text-slate-700' : 'bg-slate-800 text-slate-200'
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              )
            })}
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); onSend() }}
            className={`flex items-center gap-2 px-3 py-2.5 border-t flex-shrink-0 ${borderClass}`}
          >
            <input
              type="text"
              value={messageDraft}
              onChange={(e) => setMessageDraft(e.target.value)}
              placeholder="Type a message…"
              className={inputClass}
            />
            <button
              type="submit"
              disabled={!messageDraft.trim()}
              className="p-2 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 text-white disabled:opacity-40 flex-shrink-0"
              aria-label="Send"
            >
              <Send size={15} />
            </button>
          </form>
        </>
      ) : showNewMessage ? (
        <div className="flex-1 overflow-y-auto">
          <div className={`px-3 py-2 border-b ${borderClass}`}>
            <input
              type="text"
              value={directorySearch}
              onChange={(e) => setDirectorySearch(e.target.value)}
              placeholder="Search name, email, or role…"
              autoFocus
              className={inputClass}
            />
          </div>
          {filteredDirectory.length === 0 ? (
            <p className={`text-xs text-center py-6 ${isDay ? 'text-slate-400' : 'text-slate-500'}`}>No matches</p>
          ) : (
            <div className={`divide-y ${isDay ? 'divide-slate-100' : 'divide-slate-700/50'}`}>
              {filteredDirectory.map((p) => (
                <button
                  key={p.uid}
                  type="button"
                  onClick={() => onStartConversation(p)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${isDay ? 'text-slate-700 hover:bg-violet-50' : 'text-slate-200 hover:bg-slate-800/50'}`}
                >
                  <p className="truncate">{p.name || p.email || 'Unnamed user'}</p>
                  {(p.role || p.department || p.email) && (
                    <p className={`text-xs truncate ${isDay ? 'text-slate-400' : 'text-slate-500'}`}>
                      {[p.role, p.department, p.email].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : conversations.length === 0 ? (
        <div className={`px-4 py-6 text-center ${isDay ? 'text-slate-400' : 'text-slate-500'}`}>
          <MessageCircle size={24} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No conversations yet</p>
        </div>
      ) : (
        <div className={`overflow-y-auto divide-y flex-1 ${isDay ? 'divide-slate-100' : 'divide-slate-700/50'}`}>
          {conversations.map((c) => {
            const otherId = (c.participantIds || []).find((id) => id !== currentUid)
            const otherName = c.participantNames?.[otherId] || 'User'
            const unread = c.unreadCounts?.[currentUid] || 0
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onOpenConversation(c)}
                className={`w-full text-left px-4 py-3 transition-colors flex items-center justify-between gap-2 ${isDay ? 'hover:bg-violet-50' : 'hover:bg-slate-800/50'}`}
              >
                <div className="min-w-0">
                  <p className={`text-sm font-semibold truncate ${isDay ? 'text-slate-800' : 'text-slate-100'}`}>{otherName}</p>
                  <p className={`text-xs truncate ${isDay ? 'text-slate-400' : 'text-slate-500'}`}>{c.lastMessageText || 'No messages yet'}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className={`text-[10px] ${isDay ? 'text-slate-300' : 'text-slate-600'}`}>{fmtTime(c.lastMessageAt)}</span>
                  {unread > 0 && (
                    <span className="min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none px-0.5">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function BottomTabBar({ items, theme, signOut, userProfile, user, sidebarOpen }) {
  const isDay = theme !== 'night'
  const { pathname } = useLocation()
  const tabRefs = useRef([])
  const [pillStyle, setPillStyle] = useState(null)
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!showMenu) return
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close) }
  }, [showMenu])

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
    borderTop: '1px solid rgba(255,255,255,0.08)',
    paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 4px)',
  }

  const pillColor = isDay ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.2)'
  const pillBorder = isDay ? '1px solid rgba(99,102,241,0.15)' : 'none'
  const activeColor = isDay ? '#6366f1' : '#818cf8'
  const inactiveColor = isDay ? '#94a3b8' : '#64748b'

  return (
    <nav
      className="lg:hidden fixed"
      style={{
        zIndex: sidebarOpen ? 39 : 50,
        filter: sidebarOpen ? 'blur(3px)' : 'none',
        transition: 'filter 0.2s ease',
        pointerEvents: sidebarOpen ? 'none' : 'auto',
        ...(isDay ? { bottom: '14px', left: '12px', right: '12px' } : { bottom: 0, left: 0, right: 0 }),
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
  const navigate = useNavigate()
  const [notifOpen, setNotifOpen] = useState(false)
  const [fillNotifications, setFillNotifications] = useState([])
  const [visitorProposalNotifications, setVisitorProposalNotifications] = useState([])
  const [dlightConsultNotifications, setDlightConsultNotifications] = useState([])
  const [consultResponseNotifications, setConsultResponseNotifications] = useState([])
  const notifications = useMemo(
    () => [...fillNotifications, ...visitorProposalNotifications, ...dlightConsultNotifications, ...consultResponseNotifications],
    [fillNotifications, visitorProposalNotifications, dlightConsultNotifications, consultResponseNotifications]
  )
  const notifDesktopRef = useRef(null)
  const notifMobileRef = useRef(null)

  const handleNotifAction = (n) => {
    setNotifOpen(false)
    if (n.type === 'pcs_fill') {
      navigate('/department/cell?tab=leaderEntry&openFillInvite=' + (n.inviteId || ''))
    } else if (n.type === 'visitor_proposal') {
      navigate('/department/d-light?tab=visitorEntry')
    } else if (n.type === 'dlight_consult') {
      // Deep-link straight into the Respond modal: DepartmentHub reads
      // ?openConsultId= once the D-Light Hub's tasks have loaded (works whether
      // the user is already on the Hub or navigating there fresh).
      navigate(`/department/d-light?tab=summary&openConsultId=${encodeURIComponent(n.id || '')}`)
    } else if (n.type === 'consult_response') {
      // Land on the Cell Hub's summary tab, where the Unassigned drawer (and the
      // recommendation shown against that person's row) live.
      navigate('/department/cell?tab=summary')
    }
  }

  useEffect(() => {
    const cellId = userProfile?.cellGroupId || userProfile?.cellId
    if (!cellId) return
    return subscribePCSFillInvitationsByCellId(cellId, (invites) => {
      setFillNotifications(invites.map((inv) => ({
        id: inv.id,
        inviteId: inv.id,
        type: 'pcs_fill',
        title: 'Profile Fill Request',
        body: `Fill profile for ${inv.personName || 'a member'}`,
        cellName: inv.cellName || '',
        sentAt: inv.sentAt,
      })))
    })
  }, [userProfile?.cellGroupId, userProfile?.cellId])

  // D-Light: visitor proposals forwarded by Cell/Caring — surfaced on the bell so a
  // D-Light user doesn't have to be on the Visitor Entry tab to know one arrived.
  useEffect(() => {
    const canSeeDLight = isFounder || !!getDepartmentRole(userProfile, 'D Light')
    if (!canSeeDLight) return
    return subscribeCellVisitorProposals((proposals) => {
      setVisitorProposalNotifications(proposals.map((p) => ({
        id: p.id,
        type: 'visitor_proposal',
        title: 'New Visitor to Register',
        body: `${p.visitorName || 'Someone'} was flagged for D-Light registration`,
        cellName: p.cellName || p.sentByName || '',
        sentAt: typeof p.createdAt?.toDate === 'function' ? p.createdAt.toDate() : p.createdAt,
      })))
    })
  }, [userProfile, isFounder])

  // D-Light: Cell Director consult requests ("Consult D Light Director") — surfaced
  // on the bell (and the D-Light sidebar link badge below) so a D-Light Director sees
  // a pending request without already being on the Hub's summary/visitorEntry/assign tab.
  useEffect(() => {
    const canSeeDLight = isFounder || !!getDepartmentRole(userProfile, 'D Light')
    if (!canSeeDLight) return
    return subscribeCellDlightConsultTasks((consults) => {
      setDlightConsultNotifications(consults.map((t) => ({
        id: t.id,
        type: 'dlight_consult',
        title: 'Pending Consultation',
        body: `${t.consultPersonName || 'Someone'} needs a cell placement recommendation`,
        cellName: t.requestedBy || '',
        sentAt: typeof t.createdAt?.toDate === 'function' ? t.createdAt.toDate() : t.createdAt,
      })))
    })
  }, [userProfile, isFounder])

  // Cell: D-Light's responses to consult requests this Director sent — the reverse
  // direction of the subscription above. Reads the same tasks (the security rules'
  // cellAssignConsult carve-out lets Cell read them), just filtered to 'Responded'
  // so the bell only fires once there's an actual recommendation to review.
  useEffect(() => {
    const canSeeCell = isFounder || isCellDirectorInPositions(userProfile)
    if (!canSeeCell) return
    return subscribeCellDlightConsultTasks((consults) => {
      setConsultResponseNotifications(
        consults
          .filter((t) => t.status === 'Responded')
          .map((t) => ({
            id: t.id,
            type: 'consult_response',
            title: 'D-Light Recommendation',
            body: `${t.consultPersonName || 'Someone'}: ${t.recommendation || 'D-Light responded to your request'}`,
            cellName: '',
            sentAt: typeof t.respondedAt === 'string' ? new Date(t.respondedAt) : t.respondedAt,
          }))
      )
    })
  }, [userProfile, isFounder])

  useEffect(() => {
    if (!notifOpen) return
    const close = (e) => {
      const d = notifDesktopRef.current
      const m = notifMobileRef.current
      if ((!d || !d.contains(e.target)) && (!m || !m.contains(e.target))) setNotifOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close) }
  }, [notifOpen])

  // ── Direct Messages ─────────────────────────────────────────────────────────
  const [messagesOpen, setMessagesOpen] = useState(false)
  const [conversations, setConversations] = useState([])
  const [directory, setDirectory] = useState([])
  const [fallbackDirectory, setFallbackDirectory] = useState([])
  const [directorySearch, setDirectorySearch] = useState('')
  const [showNewMessage, setShowNewMessage] = useState(false)
  const [activeConversation, setActiveConversation] = useState(null)
  const [threadMessages, setThreadMessages] = useState([])
  const [messageDraft, setMessageDraft] = useState('')
  const msgDesktopRef = useRef(null)
  const msgMobileRef = useRef(null)

  const unreadMessagesCount = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unreadCounts?.[user?.uid] || 0), 0),
    [conversations, user?.uid]
  )

  useEffect(() => {
    if (!user?.uid) return
    return subscribeUserConversations(user.uid, setConversations)
  }, [user?.uid])

  useEffect(() => {
    if (!messagesOpen) return
    return subscribeUserDirectory(setDirectory)
  }, [messagesOpen])

  // Fallback + auto-populate: if the shared directory looks empty/incomplete (e.g. this
  // session is the first one since the feature shipped, or user_directory just hasn't
  // caught up yet), re-run the server-side backfill (syncUserDirectory Cloud Function —
  // works for any signed-in user) and use its fresh result for an instant, non-empty
  // picker instead of waiting on the user_directory listener to catch up.
  useEffect(() => {
    if (!showNewMessage || directory.length >= 2) return
    syncAllUsersToDirectory()
      .then((rows) => { if (rows.length) setFallbackDirectory(rows) })
      .catch(() => {})
  }, [showNewMessage, directory.length])

  // Real-time user_directory rows win over the one-off fallback fetch once they arrive.
  const combinedDirectory = useMemo(() => {
    const byUid = new Map()
    fallbackDirectory.forEach((p) => byUid.set(p.uid, p))
    directory.forEach((p) => byUid.set(p.uid, p))
    return Array.from(byUid.values())
  }, [directory, fallbackDirectory])

  useEffect(() => {
    if (!activeConversation?.id) { setThreadMessages([]); return }
    return subscribeConversationMessages(activeConversation.id, setThreadMessages)
  }, [activeConversation?.id])

  const toggleMessages = () => {
    setNotifOpen(false)
    setMessagesOpen((v) => !v)
  }

  const closeMessages = () => {
    setMessagesOpen(false)
    setActiveConversation(null)
    setShowNewMessage(false)
    setDirectorySearch('')
  }

  const openConversation = (conv) => {
    const otherId = (conv.participantIds || []).find((id) => id !== user.uid)
    setActiveConversation({ id: conv.id, otherId, otherName: conv.participantNames?.[otherId] || 'User' })
    setShowNewMessage(false)
    if (user?.uid) markConversationRead(conv.id, user.uid).catch(() => {})
  }

  const startConversationWith = async (person) => {
    if (!user?.uid) return
    const conversationId = await getOrCreateDirectConversation(
      user.uid, userProfile?.name || user.email || '', person.uid, person.name || ''
    )
    setActiveConversation({ id: conversationId, otherId: person.uid, otherName: person.name || 'User' })
    setShowNewMessage(false)
  }

  const handleSendMessage = async () => {
    if (!messageDraft.trim() || !activeConversation?.id || !user?.uid) return
    const text = messageDraft.trim()
    setMessageDraft('')
    await sendDirectMessage(activeConversation.id, {
      senderId: user.uid,
      senderName: userProfile?.name || user.email || '',
      text,
    })
  }

  useEffect(() => {
    if (!messagesOpen) return
    const close = (e) => {
      const d = msgDesktopRef.current
      const m = msgMobileRef.current
      if ((!d || !d.contains(e.target)) && (!m || !m.contains(e.target))) closeMessages()
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close) }
  }, [messagesOpen])

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

  const asideTextClass = isDay ? 'text-slate-900' : 'text-white'

  // ── Brand header (shared) ───────────────────────────────────────────────────
  const BrandHeader = () => (
    <div className={`px-4 pt-20 pb-4 border-b ${headerBorderClass}`}>
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
        <div className="min-w-0 flex-1">
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
        <SundayPlanBubble isDay={isDay} />
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
  const MobileHeader = () => (
    <div
      className="lg:hidden fixed top-0 left-0 right-0 flex items-center justify-between px-3"
      style={{
        zIndex: 40,
        paddingTop: 'env(safe-area-inset-top, 24px)',
        minHeight: 'calc(3.5rem + env(safe-area-inset-top, 24px))',
        height: 'calc(3.5rem + env(safe-area-inset-top, 24px))',
        ...(isDay ? {
          background: 'rgba(255,255,255,0.88)',
          backdropFilter: 'blur(20px) saturate(200%)',
          WebkitBackdropFilter: 'blur(20px) saturate(200%)',
          borderBottom: '1px solid rgba(255,255,255,0.9)',
          boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
        } : {
          background: 'rgba(15,23,42,0.95)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 2px 16px rgba(0,0,0,0.3)',
        }),
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
      <div className="flex items-center gap-2">
        <img
          src={rolccLogo}
          alt="ROLCC"
          className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
          style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.18)' }}
        />
        <span
          className="font-black"
          style={{
            fontFamily: "'Montserrat', Inter, system-ui, sans-serif",
            fontSize: '16px',
            background: titleGradient,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: '-0.015em',
          }}
        >River Of Life</span>
      </div>
      <div className="flex items-center gap-0.5">
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

    return (
      <>
        <MobileHeader />
        {open && (
          <div className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm" style={{ zIndex: 41 }} onClick={() => setOpen(false)} aria-hidden />
        )}
        <aside
          className={`w-64 min-h-screen bg-gradient-to-b from-slate-800 to-slate-900 ${asideTextClass} flex flex-col fixed left-0 top-0 transform transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
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
                {item.to === getDepartmentPath('D Light') && dlightConsultNotifications.length > 0 && (
                  <span className="ml-auto min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                    {dlightConsultNotifications.length > 9 ? '9+' : dlightConsultNotifications.length}
                  </span>
                )}
                {item.to === '/department/cell/cell-report' && consultResponseNotifications.length > 0 && (
                  <span className="ml-auto min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                    {consultResponseNotifications.length > 9 ? '9+' : consultResponseNotifications.length}
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
        <BottomTabBar items={scopedItems} theme={theme} signOut={signOut} userProfile={userProfile} user={user} sidebarOpen={open} />
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
  const seenTo = new Set()
  const visibleWithMyDept = mergedNav.filter((item) => {
    if (seenTo.has(item.to)) return false
    seenTo.add(item.to)
    return true
  })

  return (
    <>
      <MobileHeader />
      {open && (
        <div className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm" style={{ zIndex: 41 }} onClick={() => setOpen(false)} aria-hidden />
      )}
      <aside
        className={`w-64 min-h-screen bg-gradient-to-b from-slate-800 to-slate-900 ${asideTextClass} flex flex-col fixed left-0 top-0 transform transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
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
              {item.to === getDepartmentPath('D Light') && dlightConsultNotifications.length > 0 && (
                <span className="ml-auto min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                  {dlightConsultNotifications.length > 9 ? '9+' : dlightConsultNotifications.length}
                </span>
              )}
              {item.to === getDepartmentPath('Cell') && consultResponseNotifications.length > 0 && (
                <span className="ml-auto min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                  {consultResponseNotifications.length > 9 ? '9+' : consultResponseNotifications.length}
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
      <BottomTabBar items={visibleWithMyDept} theme={theme} signOut={signOut} userProfile={userProfile} user={user} sidebarOpen={open} />
    </>
  )
}
