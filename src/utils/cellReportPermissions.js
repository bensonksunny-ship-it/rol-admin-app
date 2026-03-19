import { ROLES } from '../constants/roles'

const CELL = 'cell'

function normDept(d) {
  return String(d || '').trim().toLowerCase()
}

/**
 * Cell department match (case-insensitive).
 */
export function isCellDepartmentName(name) {
  return normDept(name) === CELL
}

/**
 * User has Cell Director in positions (new role field or legacy position field).
 */
export function isCellDirectorInPositions(user) {
  const positions = user?.positions
  if (!Array.isArray(positions)) return false
  return positions.some(
    (p) =>
      isCellDepartmentName(p?.department) &&
      (String(p?.role || '').toUpperCase() === 'DIRECTOR' || p?.position === 'Director')
  )
}

/**
 * User has Cell Leader in positions (new role field or legacy position label).
 */
export function isCellLeaderInPositions(user) {
  const positions = user?.positions
  if (!Array.isArray(positions)) return false
  return positions.some(
    (p) =>
      isCellDepartmentName(p?.department) &&
      (String(p?.role || '').toUpperCase() === 'LEADER' ||
        p?.position === 'Cell Leader' ||
        String(p?.role || '').toLowerCase() === 'cell leader')
  )
}

/**
 * User profile cell link matches a cell group (Firestore doc id or logical `cellId` on the group).
 */
export function userLinksToCellGroup(user, cellGroup) {
  if (!user || !cellGroup) return false
  const u = String(user.cellGroupId || user.cellId || '').trim()
  if (!u) return false
  const docId = String(cellGroup.id || '').trim()
  const logical = String(cellGroup.cellId || '').trim()
  return u === docId || (logical !== '' && u === logical)
}

/**
 * Whether the user may edit data for a given cell's report (attendance, visitors, timer, program, etc.).
 *
 * Rules:
 * - Founder: always
 * - Cell Leader (in positions) for that cell: yes when user.cellGroupId/cellId matches group's `cellId` or doc id
 * - Cell Director only: no
 * - Director + Leader: edit only own cell (leader rule applies)
 *
 * @param {object} user - userProfile
 * @param {string} reportCellFirestoreId - cell group document id (report.cellId)
 * @param {object|null} cellGroup - row from getCellGroups with id, cellId, etc.
 */
export function canEditCellReport(user, reportCellFirestoreId, cellGroup) {
  if (!user || !reportCellFirestoreId) return false
  if (user.globalRole === 'FOUNDER' || user.role === ROLES.FOUNDER) return true

  const docId = String(reportCellFirestoreId).trim()
  const g = cellGroup
  if (!g || String(g.id) !== docId) return false

  if (!isCellLeaderInPositions(user)) return false
  return userLinksToCellGroup(user, g)
}
