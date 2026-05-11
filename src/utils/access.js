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
  const targetDept = String(departmentName || '').trim().toLowerCase().replace(/-/g, ' ')
  const p = positions.find((x) => x && String(x.department || '').trim().toLowerCase().replace(/-/g, ' ') === targetDept)
  if (!p) return null

  const roleField = p.role != null ? String(p.role).trim() : ''
  const positionField = p.position != null ? String(p.position).trim() : ''

  // New schema: role is stored as uppercase tokens like DIRECTOR/COORDINATOR.
  if (roleField) {
    const upper = roleField.toUpperCase()
    if (upper === 'DIRECTOR') return 'DIRECTOR'
    if (upper === 'COORDINATOR') return 'COORDINATOR'
    if (upper === 'LEADER') return 'COORDINATOR' // e.g. "LEADER"
  }

  // Legacy schema: position is stored as labels like "Director", "Coordinator", "Cell Leader".
  if (positionField) {
    const pos = positionField.toLowerCase()
    if (pos === 'director') return 'DIRECTOR'
    if (pos === 'coordinator' || pos === 'cell leader') return 'COORDINATOR'
    // Associate (or anything else) is not a department head.
    return null
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

