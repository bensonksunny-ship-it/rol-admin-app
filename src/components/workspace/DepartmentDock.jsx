import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PenLine, LayoutGrid } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { DEPARTMENT_LIST, getDepartmentByName, getDepartmentPath, getDepartmentIcon } from '../../constants/departments'
import { canAccessWeeklyEntryOnly, ACCOUNTS_ENTRY_BASE_PATH } from '../../utils/accountsEntryAccess'
import { getDepartmentSubpages } from '../../utils/departmentSubpages'
import { hasFullWorshipAccess } from '../../utils/worshipAccess'
import { hasAccess } from '../../utils/access'
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
  const candidates = [...new Set([...fromPositions, ...fromDepartments, ...fromPrimary])]
  // A department name merely appearing in positions[]/departments[]/department isn't
  // enough on its own — those can go stale (e.g. departments[] not fully re-synced
  // after a position change) or name a non-head position (e.g. "Associate"). The dock
  // is for departments this person actually runs, so gate on the same Director/
  // Coordinator-tier check (hasAccess → getDepartmentRole) the rest of the app already
  // uses for real access control, not just "was this department ever mentioned".
  return candidates.filter((n) => {
    // Worship is stricter than every other department: Team members, Worship Leader/
    // Member, and even a Coordinator-tier Worship position all already get everything
    // they need (roster, setlist, "My Part") straight from the Upcoming Worship
    // workspace widget — the dock icon is reserved exclusively for whoever actually
    // holds Director - Worship (or a Global/System Admin), not the generic Director-
    // or-Coordinator tier `hasAccess` grants every other department below.
    if (String(n).trim().toLowerCase() === 'worship') return hasFullWorshipAccess(userProfile)
    return hasAccess(userProfile, n)
  })
}

// Floating, single nameless launcher button, fixed bottom-center — the sole
// navigation surface on every screen size. There is no separate mobile bottom tab bar
// anymore (Sidebar's MobileHeader is just the logo + profile avatar), so this is what
// carries department navigation on phones too, with room for the home indicator via
// safe-area-inset-bottom.
//
// Previously this rendered one labeled tile per accessible department; now it's a
// single icon-only floating action button. Tapping it opens the unified menu
// (DepartmentFolderModal) — one flat overlay listing every accessible department's
// icon and subpages simultaneously, with no per-department drill-down popup and no
// collapse/toggle step to reveal a department's own tiles.
export default function DepartmentDock() {
  const { userProfile, isFounder } = useAuth()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => { setMenuOpen(false) }, [pathname])

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

  // A tile with no subpages of its own (e.g. Weekly Entry) still gets its own section
  // in the flat menu, synthesized down to a single tile that navigates straight there
  // — so every accessible destination is reachable from this one overlay.
  const menuDepartments = tiles.map((t) =>
    t.subpages.length > 0 ? t : { ...t, subpages: [{ key: t.key, label: t.label, to: t.to, Icon: t.Icon }] }
  )

  // Whichever department/nested category the user is currently viewing, so opening
  // the menu drills that one section straight into the matching child grid instead of
  // its own top-level tiles.
  const activeTile = tiles.find((t) => pathname === t.to || pathname.startsWith(t.to + '/') || pathname.startsWith(t.to + '?'))
  const currentTab = new URLSearchParams(search).get('tab')

  return (
    <nav
      className="flex fixed left-1/2 -translate-x-1/2 z-40"
      style={{ bottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
      aria-label="Department shortcuts"
    >
      {menuOpen && (
        <DepartmentFolderModal
          departments={menuDepartments}
          activeKey={activeTile?.key}
          activeChildKey={currentTab}
          onClose={() => setMenuOpen(false)}
          onNavigate={(to) => { setMenuOpen(false); navigate(to) }}
        />
      )}

      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        title="Departments"
        aria-label="Open departments menu"
        className="group flex items-center justify-center w-14 h-14 rounded-full transition-transform duration-150 hover:-translate-y-0.5 active:scale-95"
        style={{
          background: 'linear-gradient(135deg, #6357c9 0%, #8b7ff0 100%)',
          boxShadow: menuOpen
            ? '0 4px 18px rgba(99,87,201,0.55), 0 0 0 2px rgba(99,87,201,0.5)'
            : '0 8px 24px rgba(99,87,201,0.4)',
        }}
      >
        <LayoutGrid size={24} className="text-white" strokeWidth={1.75} />
      </button>
    </nav>
  )
}
