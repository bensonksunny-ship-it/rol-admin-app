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
      // No Operations tab — Team + Sub-Departments already moved to the top-level
      // "The Team" tab, which left Operations with only Planning as a sub-tab; that
      // lone sub-tab was removed too, so the whole tab is gone rather than left
      // pointing at an empty Operations page.
      return ['summary', 'assign', 'team', 'upcomingSunday', 'finance']
    case 'd-light':
      // No Operations tab (2026-09) — its only remaining child, Team, is now a
      // top-level tab of its own (same move Media made earlier), and is also the
      // default landing tab (see DepartmentHub.jsx's tab-selection effect).
      return ['summary', 'upcomingSunday', 'visitorEntry', 'assign', 'team', 'archives', 'finance']
    case 'event-m':
      return ['summary', 'events', 'liveControl', 'finance', 'operations']
    case 'river-kids':
      return ['summary', 'register', 'attendance', 'finance', 'operations']
    case 'accounts':
      return ['summary', 'tally', 'income', 'expense', 'budget', 'operations']
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
