/**
 * Tab keys for DepartmentHub + DepartmentTabBar (single source of truth).
 */
export function getDepartmentHubTabs(slug) {
  switch (slug) {
    case 'cell':
      return ['summary', 'cellGroups', 'reports', 'leaderEntry', 'operations']
    case 'caring':
      return ['summary', 'pcs', 'operations']
    case 'sunday-ministry':
      return ['summary', 'sundayReport', 'sundayReportsHistory', 'sundayProgram', 'sundayCrew', 'operations']
    case 'worship':
      return ['summary', 'upcomingSunday', 'assign', 'theTeam', 'practiceRehearsal', 'archives', 'operations']
    case 'media':
      return ['summary', 'upcomingSunday', 'design', 'operations']
    case 'd-light':
      return ['summary', 'upcomingSunday', 'visitorEntry', 'assign', 'operations']
    case 'event-m':
      return ['summary', 'events', 'liveControl', 'subDepartment', 'team', 'planning', 'financial']
    case 'river-kids':
      return ['summary', 'attendance', 'operations']
    case 'accounts':
      return ['summary', 'entry', 'operations']
    case 'administration':
      return ['summary', 'upcomingSunday', 'operations']
    default:
      return ['summary', 'subDepartment', 'team', 'planning', 'financial']
  }
}

/** Department uses generic `department_sub_departments` for Sub Department tab (not D Light’s collection). */
export function usesGenericSubDepartmentCollection(slug) {
  return slug !== 'd-light' && slug !== 'cell'
}

/** Legacy Firestore `department` string values to merge when loading tasks / team / entries. */
export const LEGACY_DEPARTMENT_NAMES = {
  'River Kids': ['Junior C'],
  'Building Care': ['Build C'],
}
