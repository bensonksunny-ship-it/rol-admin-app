/**
 * Tab keys for DepartmentHub + DepartmentTabBar (single source of truth).
 */
export function getDepartmentHubTabs(slug) {
  switch (slug) {
    case 'cell':
      return ['summary', 'cellGroups', 'reports', 'shepherdCare', 'midweek', 'finance', 'operations']
    case 'caring':
      return ['summary', 'pcs', 'finance', 'operations']
    case 'sunday-ministry':
      return ['summary', 'sunday', 'sundayReportsHistory', 'sundayCrew', 'finance', 'operations']
    case 'worship':
      return ['summary', 'upcomingSunday', 'assign', 'theTeam', 'applications', 'practiceRehearsal', 'songsDirectory', 'archives', 'finance']
    case 'media':
      return ['summary', 'upcomingSunday', 'finance', 'operations']
    case 'd-light':
      return ['summary', 'upcomingSunday', 'visitorEntry', 'assign', 'finance', 'operations']
    case 'event-m':
      return ['summary', 'events', 'liveControl', 'finance', 'operations']
    case 'river-kids':
      return ['summary', 'register', 'attendance', 'finance', 'operations']
    case 'accounts':
      return ['summary', 'entry', 'finance', 'operations']
    case 'administration':
      return ['summary', 'upcomingSunday', 'finance', 'operations']
    case 'sec-core':
      return ['summary', 'directorBoard', 'sundayLeader', 'planning', 'finance']
    default:
      return ['summary', 'finance', 'operations']
  }
}

/** Department uses generic `department_sub_departments` for Sub Department tab (not D Light’s collection). */
export function usesGenericSubDepartmentCollection(slug) {
  return slug !== 'd-light'
}

/** Legacy Firestore `department` string values to merge when loading tasks / team / entries. */
export const LEGACY_DEPARTMENT_NAMES = {
  'River Kids': ['Junior C'],
  'Building Care': ['Build C'],
}
