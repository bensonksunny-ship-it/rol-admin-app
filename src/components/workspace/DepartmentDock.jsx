import { useNavigate } from 'react-router-dom'
import { PenLine } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { DEPARTMENT_LIST, getDepartmentPath, getDepartmentIcon } from '../../constants/departments'
import { canAccessWeeklyEntryOnly, ACCOUNTS_ENTRY_BASE_PATH } from '../../utils/accountsEntryAccess'

function displayDeptName(deptName) {
  if (deptName === 'Event M') return 'Event Management'
  return deptName
}

// The user's own assigned departments — Founder sees every department in the app.
function myDepartmentNames(userProfile, isFounder) {
  if (isFounder) return DEPARTMENT_LIST.map((d) => d.name)
  const fromPositions = Array.isArray(userProfile?.positions)
    ? userProfile.positions.map((p) => p?.department).filter(Boolean)
    : []
  const fromDepartments = Array.isArray(userProfile?.departments)
    ? userProfile.departments.filter(Boolean)
    : []
  const fromPrimary = userProfile?.department ? [userProfile.department] : []
  return [...new Set([...fromPositions, ...fromDepartments, ...fromPrimary])]
}

// Floating, iPhone-style dock of the user's departments, fixed bottom-center. Desktop
// only — on mobile the existing bottom tab bar already lists the same departments.
export default function DepartmentDock() {
  const { userProfile, isFounder } = useAuth()
  const navigate = useNavigate()

  const tiles = myDepartmentNames(userProfile, isFounder).map((name) => ({
    key: name,
    label: displayDeptName(name),
    to: getDepartmentPath(name),
    Icon: getDepartmentIcon(name),
  }))

  if (canAccessWeeklyEntryOnly(userProfile)) {
    tiles.push({ key: 'weekly-entry', label: 'Weekly Entry', to: `${ACCOUNTS_ENTRY_BASE_PATH}/weekly`, Icon: PenLine })
  }

  if (tiles.length === 0) return null

  return (
    <nav
      className="hidden lg:flex fixed bottom-5 left-1/2 -translate-x-1/2 z-40"
      aria-label="Department shortcuts"
    >
      <div
        className="flex items-center gap-2 px-3 py-2.5 rounded-3xl max-w-[calc(100vw-4rem)] overflow-x-auto scrollbar-hide"
        style={{
          background: 'rgba(255,255,255,0.88)',
          backdropFilter: 'blur(24px) saturate(200%)',
          WebkitBackdropFilter: 'blur(24px) saturate(200%)',
          border: '1px solid rgba(255,255,255,0.95)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,1)',
        }}
      >
        {tiles.map((tile) => {
          const TileIcon = tile.Icon
          return (
            <button
              key={tile.key}
              type="button"
              onClick={() => navigate(tile.to)}
              title={tile.label}
              className="group flex flex-col items-center gap-1 flex-shrink-0 w-16"
            >
              <span
                className="w-12 h-12 rounded-2xl flex items-center justify-center transition-transform duration-150 group-hover:-translate-y-0.5 group-active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)',
                  boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
                }}
              >
                <TileIcon size={20} className="text-white" strokeWidth={1.75} />
              </span>
              <span className="text-[10px] font-semibold text-slate-600 leading-none truncate w-full text-center">
                {tile.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
