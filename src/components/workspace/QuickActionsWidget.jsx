import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronRight, Zap, ArrowRight, ArrowUpRight, CalendarCheck, Music2, FileText, ClipboardList, BarChart3,
  HeartHandshake, CalendarDays, Users, History, CalendarClock, Banknote, Receipt, Contact, CalendarHeart,
  UserPlus, CheckSquare, BookUser,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { getDepartmentByName, getDepartmentIcon } from '../../constants/departments'
import { getDepartmentSubpages, myDepartmentNames, getDepartmentNavPath } from '../../utils/departmentSubpages'
import { getDepartmentRole } from '../../utils/access'

// Colour per department. Every class is a literal so Tailwind keeps it.
//  accent: left edge of the department card · icon: department icon chip
//  tile: action tile at rest + hover tint, glow border and shadow · tileIcon: tile's mini icon
const PALETTE = {
  violet: {
    accent: 'border-l-violet-500', icon: 'text-violet-600 bg-violet-100 dark:bg-violet-500/15 dark:text-violet-300',
    tile: 'bg-violet-50/70 border-violet-200 text-violet-900 hover:bg-violet-600/10 hover:border-violet-400 hover:shadow-[0_8px_24px_-8px_rgba(139,92,246,0.45)] focus-visible:ring-violet-400 dark:bg-violet-500/10 dark:border-violet-500/30 dark:text-violet-100',
    tileIcon: 'bg-white text-violet-600 dark:bg-violet-500/20 dark:text-violet-200',
  },
  emerald: {
    accent: 'border-l-emerald-500', icon: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300',
    tile: 'bg-emerald-50/70 border-emerald-200 text-emerald-900 hover:bg-emerald-600/10 hover:border-emerald-400 hover:shadow-[0_8px_24px_-8px_rgba(16,185,129,0.45)] focus-visible:ring-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-100',
    tileIcon: 'bg-white text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-200',
  },
  amber: {
    accent: 'border-l-amber-500', icon: 'text-amber-600 bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300',
    tile: 'bg-amber-50/70 border-amber-200 text-amber-900 hover:bg-amber-600/10 hover:border-amber-400 hover:shadow-[0_8px_24px_-8px_rgba(245,158,11,0.45)] focus-visible:ring-amber-400 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-100',
    tileIcon: 'bg-white text-amber-600 dark:bg-amber-500/20 dark:text-amber-200',
  },
  sky: {
    accent: 'border-l-sky-500', icon: 'text-sky-600 bg-sky-100 dark:bg-sky-500/15 dark:text-sky-300',
    tile: 'bg-sky-50/70 border-sky-200 text-sky-900 hover:bg-sky-600/10 hover:border-sky-400 hover:shadow-[0_8px_24px_-8px_rgba(14,165,233,0.45)] focus-visible:ring-sky-400 dark:bg-sky-500/10 dark:border-sky-500/30 dark:text-sky-100',
    tileIcon: 'bg-white text-sky-600 dark:bg-sky-500/20 dark:text-sky-200',
  },
  teal: {
    accent: 'border-l-teal-500', icon: 'text-teal-600 bg-teal-100 dark:bg-teal-500/15 dark:text-teal-300',
    tile: 'bg-teal-50/70 border-teal-200 text-teal-900 hover:bg-teal-600/10 hover:border-teal-400 hover:shadow-[0_8px_24px_-8px_rgba(20,184,166,0.45)] focus-visible:ring-teal-400 dark:bg-teal-500/10 dark:border-teal-500/30 dark:text-teal-100',
    tileIcon: 'bg-white text-teal-600 dark:bg-teal-500/20 dark:text-teal-200',
  },
  rose: {
    accent: 'border-l-rose-500', icon: 'text-rose-600 bg-rose-100 dark:bg-rose-500/15 dark:text-rose-300',
    tile: 'bg-rose-50/70 border-rose-200 text-rose-900 hover:bg-rose-600/10 hover:border-rose-400 hover:shadow-[0_8px_24px_-8px_rgba(244,63,94,0.45)] focus-visible:ring-rose-400 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-100',
    tileIcon: 'bg-white text-rose-600 dark:bg-rose-500/20 dark:text-rose-200',
  },
  orange: {
    accent: 'border-l-orange-500', icon: 'text-orange-600 bg-orange-100 dark:bg-orange-500/15 dark:text-orange-300',
    tile: 'bg-orange-50/70 border-orange-200 text-orange-900 hover:bg-orange-600/10 hover:border-orange-400 hover:shadow-[0_8px_24px_-8px_rgba(249,115,22,0.45)] focus-visible:ring-orange-400 dark:bg-orange-500/10 dark:border-orange-500/30 dark:text-orange-100',
    tileIcon: 'bg-white text-orange-600 dark:bg-orange-500/20 dark:text-orange-200',
  },
  cyan: {
    accent: 'border-l-cyan-500', icon: 'text-cyan-600 bg-cyan-100 dark:bg-cyan-500/15 dark:text-cyan-300',
    tile: 'bg-cyan-50/70 border-cyan-200 text-cyan-900 hover:bg-cyan-600/10 hover:border-cyan-400 hover:shadow-[0_8px_24px_-8px_rgba(6,182,212,0.45)] focus-visible:ring-cyan-400 dark:bg-cyan-500/10 dark:border-cyan-500/30 dark:text-cyan-100',
    tileIcon: 'bg-white text-cyan-600 dark:bg-cyan-500/20 dark:text-cyan-200',
  },
}

// The handful of things each department does every week, as tab keys of that
// department's hub (see constants/departmentTabs.js) with a mini icon. Every action
// is resolved through getDepartmentSubpages, so it links to the real route and only
// shows when this user can open that tab (e.g. a Cell Leader gets Reports but not Hub).
const WEEKLY_ACTIONS = {
  Worship: { color: 'violet', actions: [
    ['assign', 'Assign Roster', CalendarCheck],
    ['practiceRehearsal', 'Practice & Rehearsal', Music2],
    // Applications live in a panel on The Team; the extra query opens it.
    ['theTeam', 'Review Applications', FileText, 'panel=applications'],
  ] },
  Cell: { color: 'emerald', actions: [
    ['reports', 'Submit Cell Report', ClipboardList],
    ['summary', 'Weekly Attendance', BarChart3],
    ['shepherdCare', 'Shepherd Care', HeartHandshake],
  ] },
  'Sunday Ministry': { color: 'amber', actions: [
    ['sunday', 'Sunday Service Plan', CalendarDays],
    ['sundayCrew', 'Assign Sunday Crew', Users],
    ['sundayReportsHistory', 'Sunday Reports', History],
  ] },
  Media: { color: 'sky', actions: [
    ['assign', 'Media & Sound Roster', CalendarCheck],
    ['upcomingSunday', 'Upcoming Sunday', CalendarClock],
  ] },
  Accounts: { color: 'teal', actions: [
    ['income', 'Record Tithes / Income', Banknote],
    ['expense', 'Record Expense', Receipt],
  ] },
  Caring: { color: 'rose', actions: [
    ['pcs', 'PCS Records', Contact],
    ['events', 'Caring Events', CalendarHeart],
  ] },
  'D Light': { color: 'orange', actions: [
    ['visitorEntry', 'Record Visitors', UserPlus],
    ['assign', 'Assign Team', CalendarCheck],
  ] },
  'River Kids': { color: 'cyan', actions: [
    ['attendance', 'Kids Attendance', CheckSquare],
    ['register', 'Kids Register', BookUser],
  ] },
}

/**
 * My Workspace → "Frequent Weekly Actions": one full-width card per department this
 * user runs, each with large action tiles (icon, label, → on hover) linking straight
 * to that department's weekly tasks. Departments where they're Director come first.
 * Founder sees every department, collapsed to the first three until "Show all".
 */
export default function QuickActionsWidget() {
  const { userProfile, isFounder } = useAuth()
  const [showAll, setShowAll] = useState(false)

  const cards = myDepartmentNames(userProfile, isFounder)
    .filter((name) => WEEKLY_ACTIONS[name])
    .map((name) => {
      const cfg = WEEKLY_ACTIONS[name]
      const dept = getDepartmentByName(name)
      const subpages = dept ? getDepartmentSubpages(dept.slug, userProfile) : []
      const byKey = new Map(subpages.map((s) => [s.key, s]))
      let actions = cfg.actions.filter(([tab]) => byKey.has(tab)).map(([tab, label, Icon, extraQuery]) => {
        const to = byKey.get(tab).to
        return { key: tab, label, Icon, to: extraQuery ? `${to}${to.includes('?') ? '&' : '?'}${extraQuery}` : to }
      })
      // No hub tabs for this user (e.g. a Pre-Service-only Sunday Ministry leader):
      // one action straight to wherever their department tile goes.
      if (!actions.length) actions = [{ key: 'open', label: `Open ${name}`, Icon: ArrowUpRight, to: getDepartmentNavPath(name, userProfile) }]
      const role = getDepartmentRole(userProfile, name)
      return { name, theme: PALETTE[cfg.color], actions, to: getDepartmentNavPath(name, userProfile), Icon: getDepartmentIcon(name), director: role === 'DIRECTOR' }
    })
    .sort((a, b) => Number(b.director) - Number(a.director))

  if (!cards.length) return null
  const LIMIT = 3
  const shown = isFounder && !showAll ? cards.slice(0, LIMIT) : cards

  return (
    <section aria-labelledby="quick-actions-title" className="w-full">
      <div className="flex items-center justify-between mb-2">
        <h2 id="quick-actions-title" className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100">
          <Zap size={15} className="text-amber-500" /> Frequent Weekly Actions
        </h2>
        {isFounder && cards.length > LIMIT && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
            {showAll ? 'Show less' : `Show all ${cards.length}`}
          </button>
        )}
      </div>
      <div className="space-y-3">
        {shown.map(({ name, theme, actions, to, Icon, director }) => (
          <div key={name}
            className={`w-full rounded-2xl border border-slate-200/70 dark:border-white/10 border-l-4 ${theme.accent} bg-gradient-to-b from-white/90 to-white/70 dark:from-slate-900/60 dark:to-slate-900/35 backdrop-blur-md shadow-sm p-4`}>
            <div className="flex items-center gap-2.5 mb-3">
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${theme.icon}`}>
                {Icon ? <Icon size={18} /> : null}
              </span>
              <p className="flex-1 min-w-0 text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100 truncate">{name === 'Accounts' ? 'Finance & Accounts' : name}</p>
              {director && <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Director</span>}
              <Link to={to} aria-label={`Open ${name}`} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-600">
                <ChevronRight size={16} />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {actions.map(({ key, label, Icon: ActionIcon, to: href }) => (
                <Link key={key} to={href}
                  className={`group flex items-center gap-3 min-h-[64px] px-4 py-3.5 rounded-xl border transition-all duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.02] active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${theme.tile}`}>
                  <span className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 shadow-sm ${theme.tileIcon}`}>
                    {ActionIcon ? <ActionIcon size={18} strokeWidth={2} /> : null}
                  </span>
                  <span className="flex-1 min-w-0 text-sm font-semibold leading-snug">{label}</span>
                  <ArrowRight size={16} aria-hidden="true"
                    className="shrink-0 opacity-40 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0" />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
