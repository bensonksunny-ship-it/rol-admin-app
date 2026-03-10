import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function MainLayout() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <main className="lg:ml-64 min-h-screen p-3 pt-12 lg:pt-4 lg:p-5 bg-gradient-to-b from-slate-50 to-white">
        <Outlet />
      </main>
    </div>
  )
}
