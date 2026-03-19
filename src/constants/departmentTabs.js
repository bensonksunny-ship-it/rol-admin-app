/**
 * Tab keys for DepartmentHub + DepartmentTabBar (single source of truth).
 */
export function getDepartmentHubTabs(slug) {
  switch (slug) {
    case 'cell':
      return ['summary', 'cellGroups', 'cellReport', 'team', 'planning', 'financial']
    case 'caring':
      return ['summary', 'members', 'subDepartment', 'team', 'planning', 'financial']
    case 'sunday-ministry':
      return ['summary', 'sundayReport', 'sundayProgram', 'subDepartment', 'team', 'planning', 'financial']
    case 'd-light':
      return ['summary', 'visitorEntry', 'assign', 'subDepartment', 'team', 'planning', 'financial']
    case 'event-m':
      return ['summary', 'subDepartment', 'events', 'team', 'planning', 'financial']
    case 'river-kids':
      return ['summary', 'subDepartment', 'attendance', 'team', 'planning', 'financial']
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
