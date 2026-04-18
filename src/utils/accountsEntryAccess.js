import { getDepartmentRole } from './access'
import { ROLES } from '../constants/roles'

const ACCOUNTS_DEPT = 'Accounts'

/** Canonical path: Departments → Accounts hub → Entry (not linked from sidebar or other top-level menus). */
export const ACCOUNTS_ENTRY_BASE_PATH = '/department/accounts/entry'

/**
 * Accounts → Entry module: Founder, Finance (enterFinance), or Accounts department head.
 * No Firestore — permission check only for routing/UI.
 */
export function canAccessAccountsEntry(userProfile, hasPermission, isFounder) {
  if (!userProfile) return false
  if (isFounder || userProfile.role === ROLES.FOUNDER) return true
  if (hasPermission('enterFinance')) return true
  const accountsRole = getDepartmentRole(userProfile, ACCOUNTS_DEPT)
  if (accountsRole === 'DIRECTOR' || accountsRole === 'COORDINATOR') return true
  return false
}
