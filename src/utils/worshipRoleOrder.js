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
