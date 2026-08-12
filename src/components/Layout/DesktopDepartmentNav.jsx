import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { Home, PenLine } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { getDepartmentByName, getDepartmentPath, getDepartmentIcon } from '../../constants/departments'
import { getDepartmentSubpages, myDepartmentNames } from '../../utils/departmentSubpages'
import { canAccessWeeklyEntryOnly, ACCOUNTS_ENTRY_BASE_PATH } from '../../utils/accountsEntryAccess'

function displayDeptName(deptName) {
  if (deptName === 'Event M') return 'Event Management'
  return deptName
}

// Desktop's persistent two-row department nav (lg: and up) — replaces
// DepartmentDock's floating grid/modal as the primary nav surface on desktop;
// DepartmentDock stays exactly as-is below `lg:` (see its own `lg:hidden`).
// Row 1 is every department the signed-in user can access (same tiles
// DepartmentDock builds, including the accounts-entry-only "Weekly Entry"
// synthetic tile, so a desktop user retains everything the dock offered).
// Row 2 — only rendered when the active department has subpages — is that
// department's tabs. Both rows are real navigation (<Link>), not demo state.
export default function DesktopDepartmentNav() {
  const { userProfile, isFounder } = useAuth()
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()

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

  const items = [{ key: 'workspace', label: 'My Workspace', to: '/', Icon: Home, subpages: [] }, ...tiles]

  // "My Workspace" (`to: '/'`) only matches the exact root — every other tile also
  // matches a trailing-slash/query continuation, same as DepartmentDock's activeTile.
  const isActive = (item) =>
    item.key === 'workspace'
      ? pathname === '/'
      : pathname === item.to || pathname.startsWith(item.to + '/') || pathname.startsWith(item.to + '?')

  const activeItem = items.find(isActive)
  const activeSubpageKey = searchParams.get('tab')

  return (
    <div className="hidden lg:block sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200">
      {/* Row 1 — departments */}
      <nav aria-label="Departments" className="max-w-5xl mx-auto px-6 h-12 flex items-center gap-5 overflow-x-auto scrollbar-hide">
        {items.map((item) => {
          const active = item === activeItem
          return (
            <Link
              key={item.key}
              to={item.to}
              className={`relative flex-shrink-0 flex items-center h-full text-sm font-semibold whitespace-nowrap transition-colors ${
                active ? 'text-indigo-700' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {item.label}
              {active && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-indigo-600 rounded-full" />}
            </Link>
          )
        })}
      </nav>

      {/* Row 2 — active department's subpages */}
      {activeItem && activeItem.subpages.length > 0 && (
        <nav
          aria-label={`${activeItem.label} tabs`}
          className="max-w-5xl mx-auto px-6 h-10 flex items-center gap-2 overflow-x-auto scrollbar-hide bg-slate-50/70 border-t border-slate-100"
        >
          {activeItem.subpages.map((sp) => {
            const active = sp.key === activeSubpageKey
            return (
              <Link
                key={sp.key}
                to={sp.to}
                className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  active ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200/70'
                }`}
              >
                {sp.label}
              </Link>
            )
          })}
        </nav>
      )}
    </div>
  )
}
