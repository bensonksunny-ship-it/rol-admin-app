/**
 * Canonical list of church departments (exact names as provided).
 * slug: URL segment for /department/:slug
 * customPage: use existing dedicated page instead of generic hub (worship)
 */
export const DEPARTMENT_LIST = [
  { name: 'Worship', slug: 'worship', customPage: 'worship' },
  { name: 'Cell', slug: 'cell', customPage: null },
  { name: 'Caring', slug: 'caring', customPage: null },
  { name: 'Sunday Ministry', slug: 'sunday-ministry', customPage: null },
  { name: 'D Light', slug: 'd-light', customPage: null },
  { name: 'Junior C', slug: 'junior-c', customPage: null },
  { name: 'Outreach', slug: 'outreach', customPage: null },
  { name: 'Build C', slug: 'build-c', customPage: null },
  { name: 'Event M', slug: 'event-m', customPage: null },
  { name: 'Mission', slug: 'mission', customPage: null },
  { name: 'Media', slug: 'media', customPage: null },
  { name: 'Accounts', slug: 'accounts', customPage: null },
  { name: 'Human Resourses', slug: 'human-resourses', customPage: null },
  { name: 'Gen Affairs', slug: 'gen-affairs', customPage: null },
  { name: 'Thunderstorm', slug: 'thunderstorm', customPage: null },
  { name: 'SP Office', slug: 'sp-office', customPage: null },
]

export function getDepartmentBySlug(slug) {
  return DEPARTMENT_LIST.find((d) => d.slug === slug) || null
}

export function getDepartmentByName(name) {
  return DEPARTMENT_LIST.find((d) => d.name === name) || null
}

export function getSlugForDepartment(name) {
  const d = getDepartmentByName(name)
  return d ? d.slug : name?.toLowerCase().replace(/\s+/g, '-').replace(/'/g, '') || ''
}

/** URL path for a department (custom pages use existing paths) */
export function getDepartmentPath(departmentName) {
  const d = getDepartmentByName(departmentName)
  if (!d) return `/departments`
  if (d.customPage === 'worship') return '/department/worship'
  return `/department/${d.slug}`
}
