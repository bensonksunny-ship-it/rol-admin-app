import { getDepartmentPath } from '../constants/departments'
import { getDepartmentRole } from './access'

// Shared by the To-Do List (ToDoListCard) and its yellow ribbons on My Workspace
// (TodoAlertRibbons), so both show the same tasks, deduped the same way, and land
// in the same place.

// Resolves where clicking a task should land. Tasks added via a notification's "+ Add
// to To-Do" already carry the exact URL (t.deepLink — see useActionNotifications).
// Tasks created directly elsewhere (e.g. CellDirectorCockpit's "Consult D Light
// Director") don't have that field but do carry the same flags DepartmentHub already
// reads to auto-open their modal (?openConsultId=, matched against cellAssignConsult),
// so recognize those directly rather than just landing on the bare department hub.
export function taskDeepLink(t) {
  if (t.deepLink) return t.deepLink
  if (t.cellAssignConsult) return `/department/d-light?tab=summary&openConsultId=${t.id}`
  // `pcsReferral` is shared by two different task shapes (DepartmentHub.jsx):
  // "Add [Name] to a cell group" (Caring -> Cell) and "Add [Name] to D-Light"
  // (Caring -> D-Light). Each has its own specific place to land: the "Recommendation
  // for [Name]" popup pre-loaded with this referral (DepartmentHub reads
  // openPcsReferralTaskId — same modal/write path as a D-Light consult response, just
  // targeting the referral task directly), or the D-Light Visitor Entry tab's
  // "Forwarded from PCS" section pre-expanded and scrolled to this person's row
  // (DepartmentHub reads openPcsForwardTaskId) — never just the bare Visitor Entry tab.
  // Discriminated by `department` (always stamped at creation: 'Cell' vs 'D Light'),
  // not by field presence like memberId — a Cell referral missing that field for any
  // reason must still never fall through to the D-Light branch below it.
  if (t.pcsReferral && t.department === 'Cell') return `/department/cell?openPcsReferralTaskId=${encodeURIComponent(t.id)}`
  if (t.pcsReferral && t.department === 'D Light') return `/department/d-light?tab=visitorEntry&openPcsForwardTaskId=${encodeURIComponent(t.id)}`
  if (t.department) return getDepartmentPath(t.department)
  return '/tasks'
}

export function myTaskDepartmentNames(userProfile) {
  const fromPositions = Array.isArray(userProfile?.positions)
    ? userProfile.positions.map((p) => p?.department).filter(Boolean)
    : []
  const fromDepartments = Array.isArray(userProfile?.departments)
    ? userProfile.departments.filter(Boolean)
    : []
  const fromPrimary = userProfile?.department ? [userProfile.department] : []
  return [...new Set([...fromPositions, ...fromDepartments, ...fromPrimary])]
}

// subscribeTasksForDepartments queries by department only — it has no way to also
// scope to *who* a task is for, so any task stamped with an assignedToUid (personal
// items created via "+ Add to To-Do", e.g. a PCS "Fill profile for [Name]" request
// addressed to one specific Cell Leader) comes back for every department member,
// not just its intended recipient. Tasks with no assignedToUid are genuine
// department-wide broadcasts (referrals, consult requests) and stay visible to all,
// UNLESS the task also carries visibleToRole (e.g. "Add [Name] to a cell group" is a
// placement decision meant only for the Cell Director, not every Cell Leader in the
// department) — checked against the viewer's actual role in that department, the
// same DIRECTOR/COORDINATOR distinction getDepartmentRole() uses elsewhere.
export function isTaskForViewer(t, { uid, isFounder, userProfile }) {
  if (t.assignedToUid && t.assignedToUid !== uid && !isFounder) return false
  if (t.visibleToRole && !isFounder && getDepartmentRole(userProfile, t.department) !== t.visibleToRole) return false
  return true
}

export const isActiveTask = (t) => t.status === 'Pending' || t.status === 'In Progress'

// Newest-wins tiebreak when collapsing duplicate active tasks into one row.
export function createdMs(t) {
  const d = t.createdAt instanceof Date ? t.createdAt : t.createdAt ? new Date(t.createdAt) : null
  return d && !isNaN(d.getTime()) ? d.getTime() : 0
}

// Groups a task into "the same pending action" as any other task sharing this key.
// Every createTask() call site that's about a specific person now stamps personId +
// taskType directly (see DepartmentHub.jsx, CellDirectorCockpit.jsx, MidweekMinistry.jsx,
// useActionNotifications.js) — grouping on that pair is what lets a re-sent PCS
// referral, a re-triggered consult reminder, etc. collapse into one row instead of a
// duplicate. Older tasks written before that tagging existed fall back to the same
// identity fields those flows have always used for their own "already sent?" checks
// (memberId/pcsPersonVisitorId/consultPersonVisitorId + a phone fallback), so this
// still dedupes without needing a data migration. A task with no recognizable identity
// at all (e.g. a free-form entry from the admin Tasks page) gets its own unique key —
// it never merges with anything.
export function taskDedupeKey(t) {
  if (t.taskType && t.personId) return `${t.taskType}:${t.personId}`
  const legacyPersonId = t.memberId || t.pcsPersonVisitorId || t.consultPersonVisitorId ||
    (t.memberPhone || t.pcsPersonPhone || t.consultPersonPhone || '').replace(/\s+/g, '')
  if (!legacyPersonId) return null
  const legacyType = t.pcsReferral ? `pcsReferral:${t.department || ''}`
    : t.cellAssignConsult ? 'cellAssignConsult'
    : t.cellAssignRecommendation ? 'cellAssignRecommendation'
    : t.department || 'task'
  return `${legacyType}:${legacyPersonId}`
}

// Collapses tasks to one row per taskDedupeKey; the newest is kept as the visible row
// and the rest fold into it via mergedTaskIds (completing the row resolves them all).
export function dedupeTasks(tasks, hiddenIds = null) {
  const groups = new Map()
  const order = []
  tasks.forEach((t) => {
    if (hiddenIds?.has(t.id)) return
    const groupKey = taskDedupeKey(t) || `__solo:${t.id}`
    if (!groups.has(groupKey)) { groups.set(groupKey, []); order.push(groupKey) }
    groups.get(groupKey).push(t)
  })
  return order.map((groupKey) => {
    const items = groups.get(groupKey)
    if (items.length === 1) return items[0]
    const representative = items.reduce((latest, cur) => (createdMs(cur) > createdMs(latest) ? cur : latest))
    return { ...representative, mergedTaskIds: items.map((i) => i.id), occurrenceCount: items.length }
  })
}
