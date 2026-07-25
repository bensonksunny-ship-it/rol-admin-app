import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import DepartmentDock from '../workspace/DepartmentDock'

// ─── Main Layout ──────────────────────────────────────────────────────────────
// The sidebar is a permanent slim icon rail (~64px) at lg+ on every route, so
// content only ever needs to clear that width, not a full-width labeled sidebar.
// DepartmentDock is the sole navigation dock at every screen size (mobile included) —
// pb-24 / pb-[7rem] keeps page content clear of it either way.
//
// Every page's content is centered inside a single shared max-w-5xl column here —
// the one place this needs to be set for it to apply app-wide, rather than each page
// (DepartmentHub included) declaring its own width.

export default function MainLayout() {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className="lg:ml-16 min-h-screen flex flex-col">
        <div
          className="flex-1 pb-[calc(7rem_+_env(safe-area-inset-bottom,0px))] lg:pb-24"
          style={{ paddingTop: 'calc(3rem + env(safe-area-inset-top, 24px))' }}
        >
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
            <Outlet />
          </div>
        </div>
      </main>
      <DepartmentDock />
    </div>
  )
}
