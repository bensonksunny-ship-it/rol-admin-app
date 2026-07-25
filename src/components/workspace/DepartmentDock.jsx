import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PenLine } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { DEPARTMENT_LIST, getDepartmentByName, getDepartmentPath, getDepartmentIcon } from '../../constants/departments'
import { canAccessWeeklyEntryOnly, ACCOUNTS_ENTRY_BASE_PATH } from '../../utils/accountsEntryAccess'
import { getDepartmentSubpages } from '../../utils/departmentSubpages'
import DepartmentFolderModal from '../DepartmentFolderModal'

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
// only — on mobile the existing bottom tab bar covers the same navigation (with its
// own folder sheet for subpages).
//
// Tapping a department tile opens a centered, iOS-Home-Screen-style folder modal
// (DepartmentFolderModal) listing its subpages (from getDepartmentSubpages) instead
// of navigating straight to the hub — this is what replaced the old per-page
// DepartmentTabBar pill row.
export default function DepartmentDock() {
  const { userProfile, isFounder } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [openKey, setOpenKey] = useState(null)

  useEffect(() => { setOpenKey(null) }, [pathname])

  const tiles = myDepartmentNames(userProfile, isFounder).map((name) => {
    const dept = getDepartmentByName(name)
    return {
      key: name,
      label: displayDeptName(name),
      to: getDepartmentPath(name),
      Icon: getDepartmentIcon(name),
      subpages: dept ? getDepartmentSubpages(dept.slug, userProfile) : [],
    }
  })

  if (canAccessWeeklyEntryOnly(userProfile)) {
    tiles.push({ key: 'weekly-entry', label: 'Weekly Entry', to: `${ACCOUNTS_ENTRY_BASE_PATH}/weekly`, Icon: PenLine, subpages: [] })
  }

  if (tiles.length === 0) return null

  const activeTile = tiles.find((t) => pathname === t.to || pathname.startsWith(t.to + '/') || pathname.startsWith(t.to + '?'))
  const openTile = tiles.find((t) => t.key === openKey)

  return (
    <nav
      className="hidden lg:flex fixed bottom-5 left-1/2 -translate-x-1/2 z-40"
      aria-label="Department shortcuts"
    >
      {openTile && openTile.subpages.length > 0 && (
        <DepartmentFolderModal
          label={openTile.label}
          subpages={openTile.subpages}
          onClose={() => setOpenKey(null)}
          onNavigate={(to) => { setOpenKey(null); navigate(to) }}
        />
      )}

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
          const isActive = activeTile?.key === tile.key
          const hasFolder = tile.subpages.length > 0
          return (
            <button
              key={tile.key}
              type="button"
              onClick={() => {
                if (hasFolder) setOpenKey((k) => (k === tile.key ? null : tile.key))
                else navigate(tile.to)
              }}
              title={tile.label}
              className="group flex flex-col items-center gap-1 flex-shrink-0 w-16"
            >
              <span
                className="relative w-12 h-12 rounded-2xl flex items-center justify-center transition-transform duration-150 group-hover:-translate-y-0.5 group-active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)',
                  boxShadow: isActive
                    ? '0 4px 14px rgba(99,102,241,0.55), 0 0 0 2px rgba(99,102,241,0.5)'
                    : '0 4px 14px rgba(99,102,241,0.35)',
                }}
              >
                <TileIcon size={20} className="text-white" strokeWidth={1.75} />
                {hasFolder && (
                  <span
                    className={`absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-white transition-opacity ${openKey === tile.key ? 'opacity-100' : 'opacity-60'}`}
                  />
                )}
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
