import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

// ─── Main Layout ──────────────────────────────────────────────────────────────

export default function MainLayout() {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className="lg:ml-64 min-h-screen flex flex-col">
        <div className="flex-1 p-4 pt-14 pb-20 lg:pt-5 lg:p-6 lg:pb-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
