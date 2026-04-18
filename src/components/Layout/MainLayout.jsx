import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useAuth } from '../../context/AuthContext'
import { useViewAs, VIEW_AS_ROLES } from '../../context/ViewAsContext'

// ─── Founder View Switcher ────────────────────────────────────────────────────

function FounderViewSwitcher() {
  const { viewAsRole, setViewAsRole, capabilities } = useViewAs()

  return (
    <div className="sticky top-0 z-50 bg-slate-900 border-b border-slate-800">
      <div className="flex items-center gap-3 px-4 py-2 overflow-x-auto">
        {/* Label */}
        <span className="text-slate-400 text-xs font-medium whitespace-nowrap flex-shrink-0 select-none">
          👁 Viewing as:
        </span>

        {/* Role pills */}
        <div className="flex gap-1.5 flex-shrink-0">
          {VIEW_AS_ROLES.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setViewAsRole(key)}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                viewAsRole === key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-400 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Capability hint — only when not in Founder view */}
        {viewAsRole !== 'founder' && (
          <span className="hidden sm:block text-slate-500 text-xs whitespace-nowrap ml-auto flex-shrink-0 select-none">
            · {capabilities.label}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Main Layout ──────────────────────────────────────────────────────────────

export default function MainLayout() {
  const { isFounder } = useAuth()

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <main className="lg:ml-64 min-h-screen bg-white flex flex-col">
        {isFounder && <FounderViewSwitcher />}
        <div className="flex-1 p-3 pt-12 lg:pt-4 lg:p-5">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
