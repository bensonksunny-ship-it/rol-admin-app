import { basePositionName } from '../constants/roles'

const SUNDAY_MINISTRY = 'sunday ministry'

function normDept(d) {
  return String(d || '').trim().toLowerCase()
}

/**
 * User holds the Pre-Service Leader position for Sunday Ministry — a narrow
 * position (unlike Director/Coordinator) that only grants access to the
 * Pre-Service section of the Sunday Ministry module, not the whole department.
 * Mirrors isCellLeaderInPositions (cellReportPermissions.js).
 */
export function isPreServiceLeaderInPositions(user) {
  const positions = user?.positions
  if (!Array.isArray(positions)) return false
  return positions.some(
    (p) => normDept(p?.department) === SUNDAY_MINISTRY && basePositionName(p?.position) === 'Pre-Service Leader'
  )
}
