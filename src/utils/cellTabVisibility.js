import { ROLES } from '../constants/roles'
import { isCellDirectorInPositions, isCellLeaderInPositions } from './cellReportPermissions'

/**
 * Single source of truth for "which Cell tabs can this user see".
 * Used by DepartmentTabBar and DepartmentHub (slug === 'cell').
 *
 * New tab keys (post-restructure):
 *   summary | cellGroups | reports | shepherdCare | midweek | finance | operations
 */

export const CELL_TAB_KEYS = Object.freeze([
  'summary',
  'cellGroups',
  'reports',
  'shepherdCare',
  'midweek',
  'finance',
  'operations',
])

function isFounder(user) {
  if (!user) return false
  return user.globalRole === 'FOUNDER' || user.role === ROLES.FOUNDER
}

function isSeniorPastor(user) {
  return user?.role === ROLES.SENIOR_PASTOR
}

/**
 * Returns the ordered list of Cell tab keys this user may see.
 * Hidden (not just disabled) per request.
 */
export function visibleCellTabs(user) {
  if (!user) return []

  // Founder / Senior Pastor / Admin-like roles see everything.
  if (isFounder(user) || isSeniorPastor(user) || user.role === ROLES.ADMIN) {
    return [...CELL_TAB_KEYS]
  }

  const director = isCellDirectorInPositions(user)
  const leader = isCellLeaderInPositions(user)

  if (director) {
    // Cell Director sees everything inside Cell.
    return [...CELL_TAB_KEYS]
  }

  if (leader) {
    // Cell Leader: their own entry and reports only. No summary, no full cell groups list, no ops.
    return ['shepherdCare', 'midweek', 'reports']
  }

  // Other staff with departmental visibility: read-only overview.
  return ['summary', 'cellGroups', 'reports']
}

/**
 * Is this tab key allowed for this user?
 */
export function canSeeCellTab(user, tabKey) {
  return visibleCellTabs(user).includes(tabKey)
}

/**
 * Pick a safe default tab for the user (first visible).
 */
export function defaultCellTab(user) {
  return visibleCellTabs(user)[0] || 'summary'
}
