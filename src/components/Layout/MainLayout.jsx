import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import DepartmentDock from '../workspace/DepartmentDock'

// ─── Main Layout ──────────────────────────────────────────────────────────────
// The sidebar is a permanent slim icon rail (~64px) at lg+ on every route, so
// content only ever needs to clear that width, not a full-width labeled sidebar.
// DepartmentDock is global too (desktop floating dock; mobile's equivalent is
// Sidebar's own BottomTabBar) — lg:pb-24 keeps page content clear of it.

export default function MainLayout() {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className="lg:ml-16 min-h-screen flex flex-col">
        <div
          className="flex-1 pb-[calc(7rem_+_env(safe-area-inset-bottom,0px))] lg:pt-5 lg:p-6 lg:pb-24"
          style={{ paddingTop: 'calc(3rem + env(safe-area-inset-top, 24px))' }}
        >
          <Outlet />
        </div>
      </main>
      <DepartmentDock />
    </div>
  )
}
