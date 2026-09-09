/**
 * Fallback identity for the "Senior Pastor" name-badge shown across the app (PCS
 * entries, People Directory, Sunday Report rosters) — used only until a Founder has
 * ever assigned one via PCS's "Set as Senior Pastor" action (see useSeniorPastor,
 * which reads the live settings/senior_pastor doc and falls back to this constant
 * when that doc doesn't exist yet). Not tied to an authenticated `users/{uid}`
 * account with `role: 'Senior Pastor'` (see ROLES.SENIOR_PASTOR in constants/roles.js,
 * used for actual app-login permissions, kept in sync by assignSeniorPastor).
 */

export const SENIOR_PASTOR_NAME = 'Benson K Sunny'
export const SENIOR_PASTOR_TITLE = 'Senior Pastor'
export const SENIOR_PASTOR_FULL_TITLE = 'Senior Pastor, River of Life Christian Church, Bangalore'

/** Normalizes a name for comparison, tolerant of "Pastor "/"Pr."/"Rev." prefixes. */
export function normalizePastorName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/^(pastor|pr|rev\.?|reverend)\.?\s+/, '')
}

/** True if `name` refers to the hardcoded fallback Senior Pastor. Prefer useSeniorPastor's
 *  isSeniorPastorName in components — this only checks the fallback, not the live doc. */
export function isSeniorPastorName(name) {
  return normalizePastorName(name) === SENIOR_PASTOR_NAME.toLowerCase()
}
