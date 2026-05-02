import { getDepartmentRole } from './access'
import { ROLES } from '../constants/roles'

const ACCOUNTS_DEPT = 'Accounts'

/** Canonical path: Departments → Accounts hub → Entry (not linked from sidebar or other top-level menus). */
export const ACCOUNTS_ENTRY_BASE_PATH = '/department/accounts/entry'

/** Weekly Entry restricted role — can only access the Weekly Entry tab, 3 months back. */
export function canAccessWeeklyEntryOnly(userProfile) {
  if (!userProfile) return false
  if (userProfile.role === ROLES.WEEKLY_ENTRY) return true
  const positions = Array.isArray(userProfile.positions) ? userProfile.positions : []
  return positions.some(p => String(p?.position || '').trim() === 'Weekly Expense Manager')
}

/**
 * Accounts → Entry module: Founder, Admin, Finance (enterFinance), Accounts department head,
 * or Weekly Entry restricted role.
 */
export function canAccessAccountsEntry(userProfile, hasPermission, isFounder) {
  if (!userProfile) return false
  if (isFounder || userProfile.role === ROLES.FOUNDER) return true
  if (userProfile.role === ROLES.ADMIN) return true
  if (canAccessWeeklyEntryOnly(userProfile)) return true
  if (hasPermission('enterFinance')) return true
  const accountsRole = getDepartmentRole(userProfile, ACCOUNTS_DEPT)
  if (accountsRole === 'DIRECTOR' || accountsRole === 'COORDINATOR') return true
  return false
}
