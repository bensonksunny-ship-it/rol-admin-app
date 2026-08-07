/**
 * Single source of truth for recognizing Senior Pastor Benson K Sunny by name across
 * name-string records (PCS entries, pastoral attendee rosters, People Directory, etc.)
 * that aren't tied to an authenticated `users/{uid}` account with `role: 'Senior Pastor'`
 * (see ROLES.SENIOR_PASTOR in constants/roles.js, used for actual app-login accounts).
 */

export const SENIOR_PASTOR_NAME = 'Benson K Sunny'
export const SENIOR_PASTOR_TITLE = 'Senior Pastor'
export const SENIOR_PASTOR_FULL_TITLE = 'Senior Pastor, River of Life Christian Church, Bangalore'

function normalize(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/^(pastor|pr|rev\.?|reverend)\.?\s+/, '')
}

/** True if `name` refers to Senior Pastor Benson K Sunny, tolerant of "Pastor "/"Pr." prefixes. */
export function isSeniorPastorName(name) {
  return normalize(name) === SENIOR_PASTOR_NAME.toLowerCase()
}
