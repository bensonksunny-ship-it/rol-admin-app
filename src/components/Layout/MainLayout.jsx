import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function MainLayout() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <main className="lg:ml-64 min-h-screen p-4 pt-14 lg:pt-6 lg:p-8">
        <div className="w-full lg:w-3/4 max-w-full mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
