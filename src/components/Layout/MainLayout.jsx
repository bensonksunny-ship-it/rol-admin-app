import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'

// ─── Main Layout ──────────────────────────────────────────────────────────────

export default function MainLayout() {
  const { pathname } = useLocation()
  // My Workspace ('/') collapses the sidebar to a slim icon rail at lg+, so content
  // only needs to clear ~64px instead of the full-width sidebar.
  const isWorkspaceRoute = pathname === '/'

  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className={`${isWorkspaceRoute ? 'lg:ml-16' : 'lg:ml-64'} min-h-screen flex flex-col`}>
        <div
          className="flex-1 pb-20 lg:pt-5 lg:p-6 lg:pb-6"
          style={{ paddingTop: 'calc(3.5rem + env(safe-area-inset-top, 24px))' }}
        >
          <Outlet />
        </div>
      </main>
    </div>
  )
}
