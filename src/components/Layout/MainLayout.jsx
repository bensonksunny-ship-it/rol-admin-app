import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

// ─── Main Layout ──────────────────────────────────────────────────────────────

export default function MainLayout() {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className="lg:ml-64 min-h-screen flex flex-col">
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
