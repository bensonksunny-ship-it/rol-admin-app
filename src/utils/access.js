export const GLOBAL_ROLES = {
  FOUNDER: 'FOUNDER',
}

export function isFounder(user) {
  return user?.globalRole === GLOBAL_ROLES.FOUNDER
}

export function displayGlobalRole(user) {
  // UI label rule: display Founder as Senior Pastor
  if (isFounder(user)) return 'Senior Pastor'
  return ''
}

// Normalize position objects across legacy/new schemas.
// New schema: { department, role: 'DIRECTOR' | 'MEMBER' | ... }
// Legacy schema: { department, position: 'Director' | 'Coordinator' | 'Cell Leader' | 'Associate' }
export function getDepartmentRole(user, departmentName) {
  const positions = Array.isArray(user?.positions) ? user.positions : []
  const p = positions.find((x) => x && x.department === departmentName)
  if (!p) return null
  if (p.role) return String(p.role)
  if (p.position) {
    const pos = String(p.position)
    if (pos === 'Director') return 'DIRECTOR'
    // treat any non-director position as MEMBER for access checks
    return 'MEMBER'
  }
  return null
}

export function hasAccess(user, departmentName, requiredRole) {
  if (!user || !departmentName) return false

  // SUPER ADMIN override
  if (user.globalRole === GLOBAL_ROLES.FOUNDER) {
    return true
  }

  // Backward compatibility: legacy full-access roles
  if (user.role === 'Founder') return true

  // Department-based check
  const deptRole = getDepartmentRole(user, departmentName)
  if (!deptRole) return false

  if (!requiredRole) return true
  return deptRole === requiredRole
}

