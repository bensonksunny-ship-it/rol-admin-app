import { useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion'
import { PenLine } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { getDepartmentByName, getDepartmentIcon, displayDeptName } from '../../constants/departments'
import { getDepartmentSubpages, myDepartmentNames, getDepartmentNavPath } from '../../utils/departmentSubpages'
import { canAccessWeeklyEntryOnly, ACCOUNTS_ENTRY_BASE_PATH } from '../../utils/accountsEntryAccess'
import { TILE_STYLES } from '../../constants/tileStyles'

const MotionDiv = motion.div
const MotionSpan = motion.span

// Dock magnification: icons within RANGE px of the cursor grow from base up to
// MAX_SCALE × base, easing back with distance (macOS Dock style).
const RANGE = 140
const MAX_SCALE = 1.6
// Room kept free under the dock for a fully magnified icon (base × 0.6) plus the
// active dot, so a grown icon never runs into the tabs row or the page below.
const growRoom = (base) => Math.ceil(base * (MAX_SCALE - 1)) + 8

/**
 * One dock icon. Its slot keeps the dock's height fixed — only the slot's width
 * follows the magnification, so neighbours slide apart like the macOS Dock — and
 * the squircle hangs from the slot's top and grows downward over the page. Nothing
 * below shifts and the top edge never clips.
 */
function DockIcon({ item, index, active, mouseX, base, still }) {
  const [hover, setHover] = useState(false)
  const [el, setEl] = useState(null)
  const distance = useTransform(mouseX, (x) => {
    const r = el?.getBoundingClientRect()
    return r ? x - (r.left + r.width / 2) : Infinity
  })
  const target = useTransform(distance, [-RANGE, 0, RANGE], [base, base * MAX_SCALE, base])
  const size = useSpring(target, { mass: 0.1, stiffness: 170, damping: 14 })
  const labelTop = useTransform(size, (v) => v + 12)
  const style = TILE_STYLES[index % TILE_STYLES.length]
  const Icon = item.Icon
  const dim = still ? base : size

  return (
    <MotionDiv ref={setEl} style={{ width: dim, height: base }} className="relative flex-shrink-0">
      <Link
        to={item.to}
        aria-label={item.label}
        aria-current={active ? 'page' : undefined}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        className="absolute left-0 top-0 block rounded-[28%] outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
      >
        <MotionSpan
          style={{ width: dim, height: dim }}
          className={`flex items-center justify-center rounded-[28%] bg-gradient-to-br ${style.gradient} shadow-md ${style.shadow} ring-1 ring-white/40`}
        >
          {Icon && <Icon className="w-1/2 h-1/2 text-white" strokeWidth={2} aria-hidden="true" />}
        </MotionSpan>
      </Link>

      {/* Current department: a dot under its icon */}
      {active && (
        <span aria-hidden="true" className="absolute left-1/2 -translate-x-1/2 -bottom-2.5 w-1.5 h-1.5 rounded-full bg-slate-700" />
      )}

      {/* Name label — below the icon, since the dock sits at the top of the screen */}
      <AnimatePresence>
        {hover && (
          <MotionSpan
            role="tooltip"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            style={{ top: still ? base + 12 : labelTop, x: '-50%' }}
            className="pointer-events-none absolute left-1/2 z-50 whitespace-nowrap rounded-md bg-slate-900/90 px-2 py-1 text-xs font-medium text-white shadow-lg"
          >
            {item.label}
          </MotionSpan>
        )}
      </AnimatePresence>
    </MotionDiv>
  )
}

// Desktop's department nav (lg: and up) — DepartmentDock stays the mobile nav below
// `lg:` (see its own `lg:hidden`).
// Row 1 is a floating macOS-style dock of every department (no My Workspace tile —
// that lives in the left sidebar) the signed-in user can
// access (same tiles DepartmentDock builds, including the accounts-entry-only
// "Weekly Entry" synthetic tile). Row 2 — only when the active department has
// subpages — is that department's tabs, as a glass pill under the dock. Both rows
// are real navigation (<Link>), not demo state.
export default function DesktopDepartmentNav() {
  const { userProfile, isFounder } = useAuth()
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const mouseX = useMotionValue(Infinity)
  // Reduced-motion users get a still dock (no magnification).
  const reduceMotion = useReducedMotion()

  const tiles = myDepartmentNames(userProfile, isFounder).map((name) => {
    const dept = getDepartmentByName(name)
    return {
      key: name,
      label: displayDeptName(name),
      to: getDepartmentNavPath(name, userProfile),
      Icon: getDepartmentIcon(name),
      subpages: dept ? getDepartmentSubpages(dept.slug, userProfile) : [],
    }
  })

  if (canAccessWeeklyEntryOnly(userProfile)) {
    tiles.push({ key: 'weekly-entry', label: 'Finance Assistant', to: `${ACCOUNTS_ENTRY_BASE_PATH}/weekly`, Icon: PenLine, subpages: [] })
  }

  // Departments only — My Workspace already has a fixed home in the left sidebar.
  const items = tiles

  // A tile also matches a trailing-slash/query continuation, same as DepartmentDock's activeTile.
  const isActive = (item) =>
    pathname === item.to || pathname.startsWith(item.to + '/') || pathname.startsWith(item.to + '?')

  const activeItem = items.find(isActive)
  const activeSubpageKey = searchParams.get('tab')

  // Eden Garden (the founder's '/' workspace view) already renders every department
  // as its own icon in EdenGardenGrid's body — repeating them up here is pure
  // clutter, so suppress this whole bar on that view.
  const isEdenGarden = pathname === '/' && isFounder
  if (isEdenGarden || items.length === 0) return null

  // Smaller base icons when the user can open many departments, so the dock fits.
  const base = items.length > 14 ? 34 : 40
  const hasTabs = !!activeItem && activeItem.subpages.length > 0

  return (
    <div
      className="hidden lg:flex flex-col items-center sticky top-0 z-30 pt-3 px-4 pointer-events-none"
      style={{ rowGap: growRoom(base), paddingBottom: hasTabs ? 8 : growRoom(base) }}
    >
      {/* z-40 > the tabs row's z-30: grown icons and their name labels always
          draw above the tabs, never under them. */}
      <nav
        aria-label="Departments"
        onMouseMove={(e) => mouseX.set(e.clientX)}
        onMouseLeave={() => mouseX.set(Infinity)}
        className="relative z-40 pointer-events-auto max-w-full flex items-start gap-2 px-3 pt-2.5 pb-4 rounded-2xl bg-white/60 backdrop-blur-xl backdrop-saturate-150 border border-white/70 shadow-lg shadow-slate-900/10 ring-1 ring-slate-900/5"
      >
        {items.map((item, i) => (
          <DockIcon
            key={item.key}
            item={item}
            index={i}
            active={item === activeItem}
            mouseX={mouseX}
            base={base}
            still={reduceMotion}
          />
        ))}
      </nav>

      {/* Row 2 — active department's subpages */}
      {hasTabs && (
        <nav
          aria-label={`${activeItem.label} tabs`}
          className="relative z-30 pointer-events-auto max-w-full h-9 px-1.5 flex items-center gap-1 overflow-x-auto scrollbar-hide rounded-full bg-white/70 backdrop-blur-xl border border-white/70 shadow-md shadow-slate-900/5 ring-1 ring-slate-900/5"
        >
          {activeItem.subpages.map((sp) => {
            const active = sp.key === activeSubpageKey
            return (
              <Link
                key={sp.key}
                to={sp.to}
                aria-current={active ? 'page' : undefined}
                className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  active ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200/70'
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
