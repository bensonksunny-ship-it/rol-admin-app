import {
  LayoutGrid, Users, CalendarDays, Wallet, FileBarChart2, PenLine, Settings2,
  Palette, UserCircle, Database, Sun, Tv, ListMusic, FolderTree, UserCheck,
  Music, Music2, Archive, History, PenSquare, LineChart, UserPlus, ClipboardList,
  CheckSquare, HeartHandshake, PartyPopper, CalendarClock, Sparkles,
  CreditCard, Banknote, Building2, Landmark,
} from 'lucide-react'
import { getDepartmentHubTabs } from '../constants/departmentTabs'
import { ACCOUNTS_ENTRY_BASE_PATH } from './accountsEntryAccess'
import { visibleCellTabs } from './cellTabVisibility'

/**
 * Single source of truth for "what are this department's subpages, and where do they
 * link" — used by DepartmentDock's folder modal (the single nav dock at every screen
 * size) in place of the old per-page DepartmentTabBar pill row.
 */

function getTabLabel(tab) {
  switch (tab) {
    case 'summary':           return 'Hub'
    case 'team':              return 'Team'
    case 'planning':          return 'Planning'
    case 'financial':         return 'Budget'
    case 'cellGroups':        return 'Cell Groups'
    case 'reports':           return 'Reports'
    case 'leaderEntry':       return 'Leader Entry'
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
    case 'leaderEntry':        return PenLine
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

// Cell's Leader Entry tab used to have its own inline toggle (CellLeaderEntryTab) for
// switching between Shepherd Care and Mid-week Ministry — same idea, one level deep,
// Cell-only. Drives the `leaderView` query param.
const CELL_LEADER_ENTRY_CHILDREN = [
  { key: 'shepherd', label: 'Shepherd Care', Icon: HeartHandshake },
  { key: 'midweek',  label: 'Mid-week',      Icon: CalendarClock },
]

// Tabs that link to a dedicated standalone route instead of `?tab=` on the generic hub.
function getTabPath(slug, tab) {
  if (tab === 'entry' && slug === 'accounts') return ACCOUNTS_ENTRY_BASE_PATH
  if (tab === 'sunday')               return '/department/sunday-ministry/sunday'
  if (tab === 'sundayReport')         return '/department/sunday-ministry/sunday-report'
  if (tab === 'sundayReportsHistory') return '/department/sunday-ministry/reports'
  if (tab === 'sundayProgram')        return '/department/sunday-ministry/sunday-program'
  if (tab === 'sundayCrew')           return '/department/sunday-ministry/crew'
  return `/department/${slug}?tab=${encodeURIComponent(tab)}`
}

/**
 * Returns this department's subpages as `{ key, label, to, Icon, children? }`, in the
 * same order and with the same per-user visibility (e.g. Cell Leaders only see
 * leaderEntry/reports) that DepartmentTabBar used to render as pills. `children` (only
 * present on Operations, and on Cell's Leader Entry) is a second grid of tiles the
 * folder modal drills into instead of navigating straight there.
 */
export function getDepartmentSubpages(slug, userProfile) {
  const allTabs = getDepartmentHubTabs(slug)
  const tabs = slug === 'cell'
    ? visibleCellTabs(userProfile).filter((t) => allTabs.includes(t))
    : allTabs
  return tabs.map((tab) => {
    const base = {
      key: tab,
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
    if (tab === 'finance') {
      return {
        ...base,
        children: getFinanceChildren(slug).map((c) => ({
          ...c,
          to: `/department/${slug}?tab=finance&financeSub=${encodeURIComponent(c.key)}`,
        })),
      }
    }
    if (tab === 'leaderEntry' && slug === 'cell') {
      return {
        ...base,
        children: CELL_LEADER_ENTRY_CHILDREN.map((c) => ({
          ...c,
          to: `/department/cell?tab=leaderEntry&leaderView=${encodeURIComponent(c.key)}`,
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
