import { Music, Users, Heart, CalendarDays, Sun, UsersRound, Video, Wallet, Building2, Megaphone, Settings, Sparkles } from 'lucide-react'

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
  { name: 'River Kids', slug: 'river-kids', customPage: null },
  { name: 'Outreach', slug: 'outreach', customPage: null },
  { name: 'Building Care', slug: 'building-care', customPage: null },
  { name: 'Event M', slug: 'event-m', customPage: null },
  { name: 'Mission', slug: 'mission', customPage: null },
  { name: 'Media', slug: 'media', customPage: null },
  { name: 'Accounts', slug: 'accounts', customPage: null },
  { name: 'Human Resourses', slug: 'human-resourses', customPage: null },
  { name: 'Gen Affairs', slug: 'gen-affairs', customPage: null },
  { name: 'Thunderstorm', slug: 'thunderstorm', customPage: null },
  { name: 'SP Office', slug: 'sp-office', customPage: null },
  { name: 'Sec-Core', slug: 'sec-core', customPage: null },
  { name: 'Administration', slug: 'administration', customPage: null },
]

/** Display name for a department (a few stored names get a friendlier label). */
export function displayDeptName(deptName) {
  if (deptName === 'Event M') return 'Event Management'
  return deptName
}

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

/** Lucide icon component for a department, by name. */
export function getDepartmentIcon(departmentName) {
  const n = String(departmentName || '').trim().toLowerCase()
  if (n === 'worship') return Music
  if (n === 'cell') return Users
  if (n === 'caring') return Heart
  if (n === 'sunday ministry') return CalendarDays
  if (n === 'd light') return Sun
  if (n === 'river kids') return UsersRound
  if (n === 'outreach') return Megaphone
  if (n === 'media') return Video
  if (n === 'accounts') return Wallet
  if (n === 'building care') return Building2
  if (n === 'administration') return Settings
  return Sparkles
}
