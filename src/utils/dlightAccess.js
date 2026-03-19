import { getDepartmentRole } from './access'
import { ROLES } from '../constants/roles'

/**
 * D Light Director: may only use Sunday Planning, not the D Light department hub or other D Light tabs.
 * Founder / Admin always have full access.
 */
export function isRestrictedDLightDirector(userProfile) {
  if (!userProfile) return false
  if (userProfile.globalRole === 'FOUNDER' || userProfile.role === ROLES.FOUNDER) return false
  if (userProfile.role === ROLES.ADMIN) return false
  if (getDepartmentRole(userProfile, 'D Light') === 'DIRECTOR') return true
  if (userProfile.department === 'D Light' && userProfile.role === ROLES.DIRECTOR) return true
  return false
}
