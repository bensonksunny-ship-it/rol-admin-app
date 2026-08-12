import { Outlet } from 'react-router-dom'
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
// (DepartmentHub included) declaring its own width.
//
// The action-notifications feed is subscribed to exactly once, here, and handed both
// to Sidebar (its mobile top bar now carries the bell/messages/board icons, moved up
// from My Workspace's greeting row) and to the routed page via Outlet context (My
// Workspace's own desktop-only header row still renders them) — one subscription
// instead of each consumer re-subscribing independently.
export default function MainLayout() {
  const { user, userProfile, isFounder } = useAuth()
  const {
    notifications, handleNotifAction, dismissNotification, addNotificationToTodo,
  } = useActionNotifications(userProfile, isFounder, user?.uid)

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
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
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
