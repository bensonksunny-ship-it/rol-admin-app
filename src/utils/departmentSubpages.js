import {
  LayoutGrid, Users, CalendarDays, Wallet, FileBarChart2, PenLine, Settings2,
  Palette, UserCircle, Database, Sun, Tv, ListMusic, FolderTree, UserCheck,
  Music, Music2, Archive, History, PenSquare, LineChart, UserPlus, ClipboardList,
  CheckSquare, HeartHandshake, PartyPopper, CalendarClock, Sparkles,
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
 * Returns this department's subpages as `{ key, label, to }`, in the same order and
 * with the same per-user visibility (e.g. Cell Leaders only see leaderEntry/reports)
 * that DepartmentTabBar used to render as pills.
 */
export function getDepartmentSubpages(slug, userProfile) {
  const allTabs = getDepartmentHubTabs(slug)
  const tabs = slug === 'cell'
    ? visibleCellTabs(userProfile).filter((t) => allTabs.includes(t))
    : allTabs
  return tabs.map((tab) => ({
    key: tab,
    label: getTabLabel(tab),
    to: getTabPath(slug, tab),
    Icon: getTabIcon(tab),
  }))
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
