import { Link } from 'react-router-dom'
import {
  ArrowRight, ArrowUpRight, CalendarCheck, Music2, FileText, ClipboardList, BarChart3,
  HeartHandshake, CalendarDays, Users, History, CalendarClock, Banknote, Receipt, Contact, CalendarHeart,
  UserPlus, CheckSquare, BookUser,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { getDepartmentByName } from '../../constants/departments'
import { getDepartmentSubpages, myDepartmentNames, getDepartmentNavPath } from '../../utils/departmentSubpages'
import { getDepartmentRole } from '../../utils/access'

// Action buttons cycle through these tints by position, so neighbouring buttons
// read as distinct actions. Every class is a literal so Tailwind keeps it. tile: rest + hover tint, glow and ring · tileIcon: solid chip.
const TILE_TINTS = [
  {
    tile: 'bg-indigo-50 border-indigo-200 text-indigo-900 hover:bg-indigo-100 hover:border-indigo-400 hover:shadow-[0_8px_24px_-8px_rgba(99,102,241,0.5)] focus-visible:ring-indigo-400 dark:bg-indigo-500/15 dark:border-indigo-500/40 dark:text-indigo-100 dark:hover:bg-indigo-500/25',
    tileIcon: 'bg-indigo-500 text-white dark:bg-indigo-500/80',
  },
  {
    tile: 'bg-violet-50 border-violet-200 text-violet-900 hover:bg-violet-100 hover:border-violet-400 hover:shadow-[0_8px_24px_-8px_rgba(139,92,246,0.5)] focus-visible:ring-violet-400 dark:bg-violet-500/15 dark:border-violet-500/40 dark:text-violet-100 dark:hover:bg-violet-500/25',
    tileIcon: 'bg-violet-500 text-white dark:bg-violet-500/80',
  },
  {
    tile: 'bg-emerald-50 border-emerald-200 text-emerald-900 hover:bg-emerald-100 hover:border-emerald-400 hover:shadow-[0_8px_24px_-8px_rgba(16,185,129,0.5)] focus-visible:ring-emerald-400 dark:bg-emerald-500/15 dark:border-emerald-500/40 dark:text-emerald-100 dark:hover:bg-emerald-500/25',
    tileIcon: 'bg-emerald-500 text-white dark:bg-emerald-500/80',
  },
]

// The handful of things each department does every week, as tab keys of that
// department's hub (see constants/departmentTabs.js) with a mini icon. Every action
// is resolved through getDepartmentSubpages, so it links to the real route and only
// shows when this user can open that tab (e.g. a Cell Leader gets Reports but not Hub).
const WEEKLY_ACTIONS = {
  Worship: { actions: [
    ['assign', 'Assign Roster', CalendarCheck],
    ['practiceRehearsal', 'Practice & Rehearsal', Music2],
    // Applications live in a panel on The Team; the extra query opens it.
    ['theTeam', 'Review Applications', FileText, 'panel=applications'],
  ] },
  Cell: { actions: [
    ['reports', 'Submit Cell Report', ClipboardList],
    ['summary', 'Weekly Attendance', BarChart3],
    ['shepherdCare', 'Shepherd Care', HeartHandshake],
  ] },
  'Sunday Ministry': { actions: [
    ['sunday', 'Sunday Service Plan', CalendarDays],
    ['sundayCrew', 'Assign Sunday Crew', Users],
    ['sundayReportsHistory', 'Sunday Reports', History],
  ] },
  Media: { actions: [
    ['assign', 'Media & Sound Roster', CalendarCheck],
    ['upcomingSunday', 'Upcoming Sunday', CalendarClock],
  ] },
  Accounts: { actions: [
    ['income', 'Record Tithes / Income', Banknote],
    ['expense', 'Record Expense', Receipt],
  ] },
  Caring: { actions: [
    ['pcs', 'PCS Records', Contact],
    ['events', 'Caring Events', CalendarHeart],
  ] },
  'D Light': { actions: [
    ['visitorEntry', 'Record Visitors', UserPlus],
    ['assign', 'Assign Team', CalendarCheck],
  ] },
  'River Kids': { actions: [
    ['attendance', 'Kids Attendance', CheckSquare],
    ['register', 'Kids Register', BookUser],
  ] },
}

/**
 * My Workspace quick actions: one row of tinted buttons (icon, label, →) per
 * department this user runs, linking straight to that department's weekly tasks.
 * Rows wrap rather than scroll so no department's buttons end up off-screen.
 * Departments where they're Director come first.
 */
export default function QuickActionsWidget() {
  const { userProfile, isFounder } = useAuth()

  const rows = myDepartmentNames(userProfile, isFounder)
    .filter((name) => WEEKLY_ACTIONS[name])
    .sort((a, b) => Number(getDepartmentRole(userProfile, b) === 'DIRECTOR') - Number(getDepartmentRole(userProfile, a) === 'DIRECTOR'))
    .map((name) => {
      const dept = getDepartmentByName(name)
      const subpages = dept ? getDepartmentSubpages(dept.slug, userProfile) : []
      const byKey = new Map(subpages.map((s) => [s.key, s]))
      const actions = WEEKLY_ACTIONS[name].actions.filter(([tab]) => byKey.has(tab)).map(([tab, label, Icon, extraQuery]) => {
        const to = byKey.get(tab).to
        return { key: tab, label, Icon, to: extraQuery ? `${to}${to.includes('?') ? '&' : '?'}${extraQuery}` : to }
      })
      // No hub tabs for this user (e.g. a Pre-Service-only Sunday Ministry leader):
      // one action straight to wherever their department tile goes.
      return {
        name,
        actions: actions.length ? actions
          : [{ key: 'open', label: `Open ${name}`, Icon: ArrowUpRight, to: getDepartmentNavPath(name, userProfile) }],
      }
    })

  if (!rows.length) return null

  return (
    <div className="space-y-2">
      {rows.map(({ name, actions }) => (
        <nav key={name} aria-label={`${name} quick actions`} className="flex flex-wrap gap-2">
          {actions.map(({ key, label, Icon, to }, i) => {
            const tint = TILE_TINTS[i % TILE_TINTS.length]
            return (
              <Link key={key} to={to}
                className={`group flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${tint.tile}`}>
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-sm ${tint.tileIcon}`}>
                  {Icon ? <Icon size={15} strokeWidth={2} /> : null}
                </span>
                <span className="text-sm font-semibold whitespace-nowrap">{label}</span>
                <ArrowRight size={15} aria-hidden="true"
                  className="shrink-0 opacity-40 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0" />
              </Link>
            )
          })}
        </nav>
      ))}
    </div>
  )
}
