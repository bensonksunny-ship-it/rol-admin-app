import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import useActionNotifications from '../../hooks/useActionNotifications'
import Sidebar from './Sidebar'
import DesktopDepartmentNav from './DesktopDepartmentNav'
import DepartmentDock from '../workspace/DepartmentDock'

// ─── Main Layout ──────────────────────────────────────────────────────────────
// The sidebar is a permanent slim icon rail (~64px) at lg+ on every route, so
// content only ever needs to clear that width, not a full-width labeled sidebar.
// DepartmentDock is mobile's navigation dock (lg:hidden below the DesktopDepartmentNav
// breakpoint) — pb-24 / pb-[7rem] keeps mobile page content clear of it.
//
// Every page's content is centered inside a single shared max-w-5xl column here —
// the one place this needs to be set for it to apply app-wide, rather than each page
// (DepartmentHub included) declaring its own width. WIDE_LAYOUT_ROUTES is one
// deliberate exception: a small set of dashboard-style pages (currently just the
// Worklist Sheet's dense multi-column table) that need more than 5xl of breathing
// room — widened here, in the one shared place, rather than each such page hacking
// a CSS breakout past this wrapper's max-width. The Accounts department (hub tabs
// plus its nested /entry sub-routes) is the other exception — it drops the max-width
// cap entirely and goes edge-to-edge, matched by path prefix since it covers several
// sub-routes rather than one fixed path.
//
// The action-notifications feed is subscribed to exactly once, here, and handed both
// to Sidebar (its mobile top bar now carries the bell/messages/board icons, moved up
// from My Workspace's greeting row) and to the routed page via Outlet context (My
// Workspace's own desktop-only header row still renders them) — one subscription
// instead of each consumer re-subscribing independently.
const WIDE_LAYOUT_ROUTES = ['/worklist']

// Same idea as WIDE_LAYOUT_ROUTES, but for a single tab of a hub page rather than
// a whole route (the tab lives in the ?tab= query string, so pathname alone can't
// key it) — currently Media's "The Team" master table, D-Light's Team sub-tab
// (nested under Operations as ?opsSub=team, hence the extra `opsSub` match), and
// River Kids' Register tab (sub-category tabs, join-status toggles and Add Kid
// form were cramped into the default 5xl column) — all of which need more than
// 5xl to breathe. { pathname, tab } must match, and `opsSub` too when set —
// `opsSubIsDefault` additionally matches the no-`opsSub`-param case, since
// DepartmentHub.jsx itself falls back to 'team' when that param is absent.
const WIDE_LAYOUT_TABS = [
  { pathname: '/department/media', tab: 'team' },
  { pathname: '/department/d-light', tab: 'operations', opsSub: 'team', opsSubIsDefault: true },
  { pathname: '/department/river-kids', tab: 'register' },
]

export default function MainLayout() {
  const { user, userProfile, isFounder } = useAuth()
  const { pathname, search } = useLocation()
  const {
    notifications, handleNotifAction, dismissNotification, addNotificationToTodo,
  } = useActionNotifications(userProfile, isFounder, user?.uid)
  const searchParams = new URLSearchParams(search)
  const activeTab = searchParams.get('tab')
  const activeOpsSub = searchParams.get('opsSub')
  const isWide = WIDE_LAYOUT_ROUTES.includes(pathname)
  const isWideTab = WIDE_LAYOUT_TABS.some((w) => {
    if (w.pathname !== pathname || w.tab !== activeTab) return false
    if (w.opsSub === undefined) return true
    if (activeOpsSub) return activeOpsSub === w.opsSub
    return !!w.opsSubIsDefault
  })
  const isAccountsFullWidth = pathname.startsWith('/department/accounts')

  return (
    <div className="min-h-screen">
      <Sidebar
        notifications={notifications}
        onNotifAction={handleNotifAction}
        onDismissNotification={dismissNotification}
        onAddNotificationToTodo={addNotificationToTodo}
      />
      <main className="lg:ml-16 min-h-screen flex flex-col">
        <DesktopDepartmentNav />
        {/* pt- clears MobileHeader's fixed top bar, pb- clears DepartmentDock's floating
            button — both lg:hidden now, so both offsets zero out at lg: too. */}
        <div className="flex-1 pt-[calc(3rem_+_env(safe-area-inset-top,24px))] lg:pt-0 pb-[calc(7rem_+_env(safe-area-inset-bottom,0px))] lg:pb-0">
          <div className={`px-4 sm:px-6 py-6 ${isAccountsFullWidth ? 'w-full' : `mx-auto ${isWide ? 'max-w-[1400px]' : isWideTab ? 'max-w-7xl' : 'max-w-5xl'}`}`}>
            <Outlet context={{ notifications, handleNotifAction, dismissNotification, addNotificationToTodo }} />
          </div>
        </div>
      </main>
      <DepartmentDock />
      {/* Fake iOS home-indicator bar — only rendered when the app is running
          installed/full-screen (the `standalone:` variant, see index.css), where
          there's no OS chrome left to hint at the bottom swipe-up gesture. It's
          purely decorative (pointer-events-none, full-width) so it never blocks
          that gesture or the FAB sitting just above it. */}
      <div className="hidden standalone:block fixed inset-x-0 bottom-0 z-40 pointer-events-none">
        <div className="w-32 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto my-1.5" />
      </div>
    </div>
  )
}
