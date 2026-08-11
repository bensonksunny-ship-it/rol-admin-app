import {
  LayoutGrid, Users, CalendarDays, Wallet, FileBarChart2, Settings2,
  Palette, UserCircle, Database, Sun, Tv, ListMusic, FolderTree, UserCheck,
  Music, Music2, Archive, History, PenSquare, LineChart, UserPlus, ClipboardList,
  CheckSquare, HeartHandshake, PartyPopper, CalendarClock, Sparkles,
  CreditCard, Banknote, Building2, Landmark,
} from 'lucide-react'
import { getDepartmentHubTabs } from '../constants/departmentTabs'
import { DEPARTMENT_LIST } from '../constants/departments'
import { ACCOUNTS_ENTRY_BASE_PATH } from './accountsEntryAccess'
import { visibleCellTabs } from './cellTabVisibility'
import { getAllowedWorshipTabs, shouldBypassWorshipGrid, hasFullWorshipAccess } from './worshipAccess'
import { hasAccess } from './access'

/**
 * Single source of truth for "what are this department's subpages, and where do they
 * link" — used by DepartmentDock's folder modal (the single nav dock at every screen
 * size) in place of the old per-page DepartmentTabBar pill row.
 */

/** The user's own assigned departments — Founder sees every department in the app.
 * Lives here (not in DepartmentDock.jsx) so any nav surface — the dock, a future
 * desktop navbar, dev previews — can share one definition of "what departments does
 * this person see" instead of each re-deriving it. */
export function myDepartmentNames(userProfile, isFounder) {
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

function getTabLabel(tab) {
  switch (tab) {
    case 'summary':           return 'Hub'
    case 'team':              return 'Team'
    case 'planning':          return 'Planning'
    case 'financial':         return 'Budget'
    case 'cellGroups':        return 'Cell Groups'
    case 'reports':           return 'Reports'
    case 'shepherdCare':      return 'Shepherd Care'
    case 'midweek':           return 'Mid-week'
    case 'finance':           return 'Finance'
    case 'operations':        return 'Operations'
    case 'design':            return 'Design'
    case 'members':           return 'Members'
    case 'dataBackup':        return 'Data Backup'
    case 'sunday':            return 'Sunday'
    case 'sundayReport':      return 'Live Control'
    case 'sundayReportsHistory': return 'Reports'
    case 'sundayProgram':     return 'Program'
    case 'subDepartment':     return 'Sub Dept'
    case 'assign':            return 'Assign'
    case 'theTeam':           return 'The Team'
    case 'practiceRehearsal': return 'Practice'
    case 'songsDirectory':    return 'Songs'
    case 'archives':          return 'Archives'
    case 'budget':            return 'Budget'
    case 'history':           return 'History'
    case 'entry':             return 'Entry'
    case 'insights':          return 'Insights'
    case 'visitorEntry':      return 'Visitors'
    case 'register':          return 'Kids Register'
    case 'attendance':        return 'Attendance'
    case 'pcs':               return 'PCS'
    case 'events':            return 'Events'
    case 'liveControl':       return 'Live Control'
    case 'upcomingSunday':    return 'Upcoming Sunday'
    case 'sundayCrew':        return 'Crew'
    case 'applications':      return 'Applications'
    case 'directorBoard':     return 'Director Board'
    case 'sundayLeader':      return 'Sunday Leader'
    default:                  return tab
  }
}

// Icon shown in the folder modal's app-style grid tile for each subpage.
function getTabIcon(tab) {
  switch (tab) {
    case 'summary':           return LayoutGrid
    case 'team':               return Users
    case 'planning':           return CalendarDays
    case 'financial':          return Wallet
    case 'cellGroups':         return Users
    case 'reports':            return FileBarChart2
    case 'shepherdCare':       return HeartHandshake
    case 'midweek':            return CalendarClock
    case 'finance':            return Landmark
    case 'operations':         return Settings2
    case 'design':             return Palette
    case 'members':            return UserCircle
    case 'dataBackup':         return Database
    case 'sunday':             return Sun
    case 'sundayReport':       return Tv
    case 'sundayReportsHistory': return FileBarChart2
    case 'sundayProgram':      return ListMusic
    case 'subDepartment':      return FolderTree
    case 'assign':             return UserCheck
    case 'theTeam':            return Users
    case 'practiceRehearsal':  return Music
    case 'songsDirectory':     return Music2
    case 'archives':           return Archive
    case 'budget':             return Wallet
    case 'history':            return History
    case 'entry':              return PenSquare
    case 'insights':           return LineChart
    case 'visitorEntry':       return UserPlus
    case 'register':           return ClipboardList
    case 'attendance':         return CheckSquare
    case 'pcs':                return HeartHandshake
    case 'events':             return PartyPopper
    case 'liveControl':        return Tv
    case 'upcomingSunday':     return CalendarClock
    case 'sundayCrew':         return Users
    case 'applications':       return ClipboardList
    case 'directorBoard':      return Users
    case 'sundayLeader':       return Sun
    default:                   return Sparkles
  }
}

// Operations sub-views — previously each department rendered its own inline toggle
// strip (CellOperationsToggle, SundayOperationsToggle, DefaultOperationsToggle, etc.)
// at the top of its Operations tab, all with near-identical option sets. Centralized
// here so the folder modal can show them as a nested grid instead: tapping the
// Operations tile opens a second-level grid of these, driven by the `opsSub` query
// param DepartmentHub already reads (replacing the toggle's local/onChange state).
// Expense/Budget/Payout Request previously lived here too — moved out into their own
// Finance tab (see DEFAULT_FINANCE_CHILDREN below) so money-related sub-pages aren't
// buried inside a generically-named "Operations" tab.
const DEFAULT_OPS_CHILDREN = [
  { key: 'subDepartment', label: 'Sub Department',  Icon: FolderTree },
  { key: 'team',          label: 'Team',            Icon: Users },
  { key: 'planning',      label: 'Planning',        Icon: CalendarDays },
]

function getOperationsChildren(slug) {
  if (slug === 'd-light') {
    return DEFAULT_OPS_CHILDREN.map((c) => (c.key === 'subDepartment' ? { ...c, label: 'Sub Dept' } : c))
  }
  return DEFAULT_OPS_CHILDREN
}

// Finance sub-views — Expense, Budget, and Payout Request, regrouped out of
// Operations under their own tab. Drives the `financeSub` query param, mirroring
// how `opsSub` drives Operations' children above.
const DEFAULT_FINANCE_CHILDREN = [
  { key: 'expense', label: 'Expense',        Icon: CreditCard },
  { key: 'budget',  label: 'Budget',         Icon: Wallet },
  { key: 'payout',  label: 'Payout Request', Icon: Banknote },
]

function getFinanceChildren(slug) {
  if (slug === 'accounts') {
    return DEFAULT_FINANCE_CHILDREN.map((c) =>
      c.key === 'payout' ? { key: 'addDepartments', label: 'Add Departments', Icon: Building2 } : c
    )
  }
  return DEFAULT_FINANCE_CHILDREN
}

// Tabs that link to a dedicated standalone route instead of `?tab=` on the generic hub.
function getTabPath(slug, tab) {
  if (tab === 'entry' && slug === 'accounts') return ACCOUNTS_ENTRY_BASE_PATH
  if (tab === 'sunday')               return '/department/sunday-ministry/sunday'
  if (tab === 'sundayReport')         return '/department/sunday-ministry/sunday-report'
  if (tab === 'sundayReportsHistory') return '/department/sunday-ministry/reports'
  if (tab === 'sundayProgram')        return '/department/sunday-ministry/sunday-program'
  if (tab === 'sundayCrew')           return '/department/sunday-ministry/crew'
  if (tab === 'applications' && slug === 'worship') return '/department/worship/applications'
  return `/department/${slug}?tab=${encodeURIComponent(tab)}`
}

/**
 * Returns this department's subpages as `{ key, label, to, Icon, children? }`, in the
 * same order and with the same per-user visibility (e.g. Cell Leaders only see
 * shepherdCare/midweek/reports) that DepartmentTabBar used to render as pills.
 * `children` (only present on Operations) is a second grid of tiles the folder modal
 * drills into instead of navigating straight there.
 */
export function getDepartmentSubpages(slug, userProfile) {
  const allTabs = getDepartmentHubTabs(slug)
  const tabs = slug === 'cell'
    ? visibleCellTabs(userProfile).filter((t) => allTabs.includes(t))
    // Worship Leader/Member: no picker grid at all — DepartmentDock navigates straight
    // to the department, and DepartmentWorship.jsx's own default-tab logic lands them
    // on Upcoming Worship. Director/Founder/Admin still get the full grid.
    : slug === 'worship' && shouldBypassWorshipGrid(userProfile)
    ? []
    : slug === 'worship'
    ? getAllowedWorshipTabs(userProfile, allTabs)
    : allTabs
  return tabs.map((tab) => {
    const base = {
      key: tab,
      // Labeled "Upcoming Sunday" like every other department's same tab (not "Upcoming
      // Worship" — that name is reserved for the distinct My Workspace widget/page that
      // answers "am I serving this week", so the two don't read as duplicates of
      // each other). This tile routes to the shared setlist/assigned-songs planning
      // view for the coming Sunday, same page every department's Upcoming Sunday tile
      // opens, just scoped to Worship's own tab set.
      label: getTabLabel(tab),
      to: getTabPath(slug, tab),
      Icon: getTabIcon(tab),
    }
    if (tab === 'operations') {
      return {
        ...base,
        children: getOperationsChildren(slug).map((c) => ({
          ...c,
          to: `/department/${slug}?tab=operations&opsSub=${encodeURIComponent(c.key)}`,
        })),
      }
    }
    // Worship's Finance tile skips the Expense/Budget/Payout drill-down grid other
    // departments get — Expense is the page's own permanent base view there, with
    // Budget/Payout Request already reachable as icon buttons on that page's header
    // (see DepartmentWorship.jsx), so an intermediate 3-choice popup here would just
    // be a redundant extra tap in front of the same destination.
    if (tab === 'finance' && slug === 'worship') {
      return { ...base, to: `/department/worship?tab=finance&financeSub=expense` }
    }
    // Sec-Core's Finance tile is the same idea — a single unified page (Expense base
    // view + a Payout Request icon drawer, no Budget) instead of the generic
    // Expense/Budget/Payout drill-down grid.
    if (tab === 'finance' && slug === 'sec-core') {
      return { ...base, to: `/department/sec-core?tab=finance` }
    }
    if (tab === 'finance') {
      return {
        ...base,
        children: getFinanceChildren(slug).map((c) => ({
          ...c,
          to: `/department/${slug}?tab=finance&financeSub=${encodeURIComponent(c.key)}`,
        })),
      }
    }
    return base
  })
}

/**
 * True when `to` is a department hub path this dock can show a folder popover for
 * (i.e. it has subpages worth listing) rather than navigating straight there.
 */
export function isDepartmentPath(to) {
  return /^\/department\/[^/]+$/.test(String(to || ''))
}

/** Extract the `:slug` from a `/department/:slug` path, or null if it isn't one. */
export function slugFromDepartmentPath(to) {
  const m = /^\/department\/([^/]+)$/.exec(String(to || ''))
  return m ? m[1] : null
}
