// Standard Worship team role hierarchy — lets any "who's serving" list group entries
// by role type in a fixed order (Lead Vocal → Parts → Choir member → Musicians →
// Sound Engineer) instead of the order they happen to have been saved/added in.
// Mirrors ASSIGNMENT_ROLES in DepartmentWorship.jsx (the categories each role
// "Category-N" belongs to, e.g. 'Lead Vocal-4' → category 'Lead Vocal').
export const WORSHIP_ROLE_ORDER = [
  'Lead Vocal', 'Parts', 'Choir member',
  'Keyboard', 'Lead Guitar', 'Bass Guitar', 'Acoustic guitar', 'Drums',
  'Sound Engineer',
]

// Splits a role like "Lead Vocal-2" into its category + numeric position ("Lead
// Vocal", 2); a bare role with no "-N" suffix (e.g. "Sound Engineer") is position 1.
// Any role not found in WORSHIP_ROLE_ORDER (a dynamically-added/custom role) sorts
// after every known category instead of before or scattered among them.
export function worshipRoleSortKey(role) {
  const m = (role || '').match(/^(.*)-(\d+)$/)
  const category = m ? m[1] : (role || '')
  const index = m ? parseInt(m[2], 10) : 1
  const categoryRank = WORSHIP_ROLE_ORDER.indexOf(category)
  return [categoryRank === -1 ? WORSHIP_ROLE_ORDER.length : categoryRank, index]
}

export function sortByWorshipRole(assignments) {
  return [...assignments].sort((a, b) => {
    const [catA, idxA] = worshipRoleSortKey(a.role)
    const [catB, idxB] = worshipRoleSortKey(b.role)
    return catA - catB || idxA - idxB
  })
}

// The 4th Lead Vocal slot leads Altar Call Worship — same worship_schedule role key
// ("Lead Vocal-4"), shown under this name wherever a worship role is displayed, and
// the person the Sunday Program's Altar Call item resolves to.
export const ALTAR_CALL_ROLE = 'Lead Vocal-4'
export const ALTAR_CALL_LABEL = 'Altar Call Worship'

export function isAltarCallRole(role) {
  return String(role || '').trim() === ALTAR_CALL_ROLE
}

/** Display name for a worship role key: "Lead Vocal-2" → "Lead Vocal 2", the
 * Altar Call slot → "Altar Call Worship". */
export function worshipRoleLabel(role) {
  return isAltarCallRole(role) ? ALTAR_CALL_LABEL : String(role || '').replace(/-(\d+)$/, ' $1')
}

/** A worship role's category with its slot number dropped ("Lead Vocal-2" → "Lead
 * Vocal"), except the Altar Call slot, which keeps its own name. */
export function worshipRoleCategoryLabel(role) {
  return isAltarCallRole(role) ? ALTAR_CALL_LABEL : String(role || '').replace(/-\d+$/, '')
}
