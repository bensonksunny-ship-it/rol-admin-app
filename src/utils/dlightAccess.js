import { getDepartmentRole } from './access'
import { ROLES } from '../constants/roles'

/**
 * D Light Director: may only use Sunday Planning, not the D Light department hub or other D Light tabs.
 * Founder / Admin always have full access.
 */
export function isRestrictedDLightDirector(userProfile) {
  // Requirement: D Light Director pages are fully accessible.
  // Keep this function for backward compatibility with existing checks,
  // but remove the redirect/block behavior.
  return false
}
