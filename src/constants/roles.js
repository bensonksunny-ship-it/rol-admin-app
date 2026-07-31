export const ROLES = {
  FOUNDER: 'Founder',
  DIRECTOR: 'Director',
  COORDINATOR: 'Coordinator',
  SENIOR_PASTOR: 'Senior Pastor',
  ADMIN: 'Admin',
  FINANCE_TEAM: 'Finance Team',
  WEEKLY_ENTRY: 'Weekly Entry',
  MINISTRY_LEADER: 'Ministry Leaders',
  OFFICE_SECRETARY: 'Office Secretary',
  VIEWER: 'Viewer',
}

/** Position-in-department options for Add User (up to 4 per person). */
export const POSITION_OPTIONS = [
  { value: 'Director', label: 'Director' },
  { value: 'Coordinator', label: 'Coordinator' },
  { value: 'Cell Leader', label: 'Cell Leader' },
  { value: 'Associate', label: 'Associate' },
  { value: 'Weekly Expense Manager', label: 'Weekly Expense Manager' },
  { value: 'Worship Leader', label: 'Worship Leader' },
  { value: 'Worship Member', label: 'Worship Member' },
]

/** Strips a display-formatted " - {Department}" suffix off a position value
 *  (e.g. "Director - Worship" → "Director"), so exact-match permission checks
 *  work whether a position was saved as the bare enum value or the composite
 *  display string produced by `formatPositionLabel`. */
export function basePositionName(position) {
  const raw = String(position || '').trim()
  const idx = raw.indexOf(' - ')
  return idx === -1 ? raw : raw.slice(0, idx).trim()
}

/** Human-readable label for a department position. "Director" is suffixed with
 *  its department (e.g. "Director - Worship", "Director - Accounts") so a
 *  person who directs more than one department reads unambiguously wherever
 *  positions are listed. Other positions render as before. */
export function formatPositionLabel(department, position) {
  const dept = String(department || '').trim()
  const pos = basePositionName(position)
  if (!pos) return dept
  if (pos.toLowerCase() === 'director' && dept) return `Director - ${dept}`
  return dept ? `${dept} (${pos})` : pos
}

/** Derive app role from positions array (highest wins). Used for permissions. */
export function deriveRoleFromPositions(positions) {
  if (!Array.isArray(positions) || positions.length === 0) return ROLES.VIEWER
  const hasDirector = positions.some((p) => {
    if (!p) return false
    const pos = basePositionName(p.position).toLowerCase()
    const role = String(p.role || '').trim().toUpperCase()
    return pos === 'director' || role === 'DIRECTOR'
  })
  const hasCoordinator = positions.some((p) => {
    if (!p) return false
    const pos = basePositionName(p.position).toLowerCase()
    const role = String(p.role || '').trim().toUpperCase()
    return pos === 'coordinator' || pos === 'cell leader' || role === 'COORDINATOR' || role === 'LEADER'
  })
  if (hasDirector) return ROLES.DIRECTOR
  if (hasCoordinator) return ROLES.COORDINATOR
  return ROLES.VIEWER
}

/** Derive departments array from positions. */
export function deriveDepartmentsFromPositions(positions) {
  if (!Array.isArray(positions) || positions.length === 0) return []
  const set = new Set(positions.map((p) => p.department).filter(Boolean))
  return Array.from(set)
}

export const ROLE_PERMISSIONS = {
  [ROLES.FOUNDER]: {
    dashboard: true,
    departments: true,
    tasks: true,
    attendance: true,
    finance: true,
    reports: true,
    manageUsers: true,
    manageDepartments: true,
    enterAttendance: true,
    enterFinance: true,
    exportReports: true,
    editSundayPlanFull: true,
    viewDepartmentInsights: true,
    pastorHub: true,
  },
  [ROLES.SENIOR_PASTOR]: {
    dashboard: true,
    departments: true,
    tasks: true,
    attendance: true,
    finance: true,
    reports: true,
    manageUsers: false,
    manageDepartments: false,
    enterAttendance: true,
    enterFinance: false,
    exportReports: true,
    editSundayPlanFull: true,
    viewDepartmentInsights: true,
    pastorHub: true,
  },
  [ROLES.DIRECTOR]: {
    dashboard: true,
    departments: true,
    tasks: true,
    attendance: true,
    finance: true,
    reports: true,
    manageUsers: false,
    manageDepartments: false,
    enterAttendance: false,
    enterFinance: false,
    exportReports: true,
    editSundayPlanFull: true,
    viewDepartmentInsights: true,
  },
  [ROLES.COORDINATOR]: {
    dashboard: true,
    departments: true,
    tasks: true,
    attendance: true,
    finance: false,
    reports: true,
    manageUsers: false,
    manageDepartments: false,
    enterAttendance: true,
    enterFinance: false,
    exportReports: false,
    editSundayPlanFull: false,
    viewDepartmentInsights: false,
  },
  [ROLES.ADMIN]: {
    dashboard: true,
    departments: true,
    tasks: true,
    attendance: true,
    finance: false,
    reports: true,
    manageUsers: true,
    manageDepartments: true,
    enterAttendance: true,
    enterFinance: false,
    exportReports: true,
    editSundayPlanFull: true,
    viewDepartmentInsights: true,
  },
  [ROLES.FINANCE_TEAM]: {
    dashboard: true,
    departments: false,
    tasks: false,
    attendance: false,
    finance: true,
    reports: true,
    manageUsers: false,
    manageDepartments: false,
    enterAttendance: false,
    enterFinance: true,
    exportReports: true,
    editSundayPlanFull: false,
    viewDepartmentInsights: false,
  },
  [ROLES.MINISTRY_LEADER]: {
    dashboard: true,
    departments: true,
    tasks: true,
    attendance: true,
    finance: false,
    reports: true,
    manageUsers: false,
    manageDepartments: false,
    enterAttendance: true,
    enterFinance: false,
    exportReports: false,
    editSundayPlanFull: false,
    viewDepartmentInsights: false,
  },
  [ROLES.OFFICE_SECRETARY]: {
    dashboard: true,
    departments: true,
    tasks: true,
    attendance: true,
    finance: true,
    reports: true,
    manageUsers: false,
    manageDepartments: false,
    enterAttendance: false,
    enterFinance: false,
    exportReports: true,
    editSundayPlanFull: false,
    viewDepartmentInsights: false,
  },
  [ROLES.WEEKLY_ENTRY]: {
    dashboard: false,
    departments: false,
    tasks: false,
    attendance: false,
    finance: false,
    reports: false,
    manageUsers: false,
    manageDepartments: false,
    enterAttendance: false,
    enterFinance: false,
    exportReports: false,
    editSundayPlanFull: false,
    viewDepartmentInsights: false,
  },
  [ROLES.VIEWER]: {
    dashboard: true,
    departments: true,
    tasks: true,
    attendance: true,
    finance: true,
    reports: true,
    manageUsers: false,
    manageDepartments: false,
    enterAttendance: false,
    enterFinance: false,
    exportReports: false,
    editSundayPlanFull: false,
    viewDepartmentInsights: false,
  },
}

export const DEPARTMENTS = [
  'Worship',
  'Cell Ministry',
  'Caring Department',
  'Sunday Ministry',
  'River Kids',
  'Building Care',
  'Junior Church',
  'Outreach',
  'Media',
  'Accounts',
  'Human Resources',
  'General Affairs',
  'Thunderstorm Youth',
  "ROL's School of Music",
  'RFF',
  'ROLF',
]

export const INCOME_TYPES = [
  'Online Offering',
  'English Offering',
  'Tamil Offering',
  'Tithe',
  'Contribution',
  'Missions',
  'RSM',
  'RFF',
  'Donations',
]

export const EXPENSE_CATEGORIES = [
  'Worship',
  'Cell Ministry',
  'Caring',
  'Sunday Ministry',
  'Junior Church',
  'Outreach',
  'Building',
  'Media',
  'Accounts',
  'Human Resources',
  'General Affairs',
  'Thunderstorm',
  'SP Office',
]

export const DEPARTMENT_TAGS = [
  'General',
  'Worship',
  'Cell',
  'Caring',
  'Sunday Ministry',
  'D Light',
  'River Kids',
  'Outreach',
  'Building Care',
  'Event M',
  'Mission',
  'Media',
  'Accounts',
  'Human Resources',
  'Gen Affairs',
  'Thunderstorm',
  'SP Office',
]

export const TASK_STATUS = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
}

export const TASK_PRIORITY = ['Low', 'Medium', 'High', 'Urgent']

// Sunday Ministry Planning – sections (each department fills one)
export const SUNDAY_PLAN_SECTIONS = {
  SUNDAY_MINISTRY: 'sundayMinistry',
  WORSHIP: 'worship',
  SUNDAY_LEADER: 'sundayLeader',
  MEDIA: 'media',
  ANNOUNCEMENTS: 'announcements',
  D_LITE: 'dLite',
  RIVER_KIDS: 'riverKids',
}

// Roles that can edit a specific section only (same login, different view)
export const SECTION_ROLES = {
  'Sunday Ministry': SUNDAY_PLAN_SECTIONS.SUNDAY_MINISTRY,
  'Worship': SUNDAY_PLAN_SECTIONS.WORSHIP,
  'Media': SUNDAY_PLAN_SECTIONS.MEDIA,
  'D-Lite': SUNDAY_PLAN_SECTIONS.D_LITE,
  'River Kids': SUNDAY_PLAN_SECTIONS.RIVER_KIDS,
  'Announcements': SUNDAY_PLAN_SECTIONS.ANNOUNCEMENTS,
}
