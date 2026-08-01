import { isFounder as isFounderGlobal, getDepartmentRole } from './access'
import { ROLES } from '../constants/roles'

const WORSHIP_DEPT = 'worship'

function isFounderUser(userProfile) {
  return isFounderGlobal(userProfile) || userProfile?.role === ROLES.FOUNDER
}

function hasWorshipPosition(userProfile, label) {
  const positions = Array.isArray(userProfile?.positions) ? userProfile.positions : []
  const target = label.trim().toLowerCase()
  return positions.some(p =>
    String(p?.department || '').trim().toLowerCase() === WORSHIP_DEPT &&
    String(p?.position || '').trim().toLowerCase() === target
  )
}

/**
 * Full edit access to songs, segments, and arrangements (Song Directory + Designer)
 * — deliberately narrower than a Worship Director: no Team, Assign, Budget, or
 * Applications access. Kept separate from `getDepartmentRole`'s DIRECTOR/COORDINATOR
 * tiers in access.js, since those feed cross-department "am I a Director anywhere"
 * checks (DirectorDashboard, WorkspaceHeader) that this role should not trigger.
 */
export function isWorshipLeader(userProfile) {
  return hasWorshipPosition(userProfile, 'Worship Leader')
}

/**
 * No Song Directory/Design access at all — restricted to Upcoming Worship (their own
 * assigned setlist for the coming Sunday). They can still open an individual assigned
 * song from Upcoming Worship's "View Song"/"My Part" buttons (a separate SongViewer
 * overlay, not the Directory tab), but browsing/searching the full song catalog and
 * the Designer are Worship Leader/Director only.
 */
export function isWorshipMember(userProfile) {
  return hasWorshipPosition(userProfile, 'Worship Member')
}

/** True for anyone who should reach the Worship department page solely via one of
 * these two roles, independent of the generic Director/Coordinator department check. */
export function hasWorshipRoleAccess(userProfile) {
  return isWorshipLeader(userProfile) || isWorshipMember(userProfile)
}

/** Mirrors DepartmentWorship.jsx's own `isDirector` check — scoped to this specific
 * department's position via getDepartmentRole, not the loose top-level `department`
 * field (which is just whichever department happened to be inserted first into
 * `positions[]`, and would wrongly grant this to a Director of a different
 * department who also holds any lesser position in Worship). Kept here too so
 * nav-grid filtering and the page's own route guard agree on the same definition of
 * "full Worship access" without importing the page itself. */
export function isWorshipDirector(userProfile) {
  return getDepartmentRole(userProfile, 'Worship') === 'DIRECTOR'
}

/** Founder, Worship Director, or (global) Admin — retains every Worship sub-module. */
export function hasFullWorshipAccess(userProfile) {
  return isFounderUser(userProfile) || isWorshipDirector(userProfile) || userProfile?.role === ROLES.ADMIN
}

/** Worship Leader's nav grid + route guard are restricted to these two modules: Songs
 * (Song Directory — Song Design/SongDesigner lives inside it, opened via a song's Edit
 * button, so it doesn't need its own tab entry) and Upcoming Worship (the setlist/
 * assigned-songs view for the coming Sunday). Everything else (Assign, The Team,
 * Practice, Archives, Finance) stays Director/Founder/Admin-only. */
export const RESTRICTED_WORSHIP_TABS = ['songsDirectory', 'upcomingSunday']

/** Worship Member is restricted further still — Songs (Directory + Design) is Worship
 * Leader/Director only, so a Member's nav grid + route guard only ever show this. */
export const WORSHIP_MEMBER_TABS = ['upcomingSunday']

/** Given this department's full tab list, returns the subset `userProfile` may see —
 * used by both the sub-menu grid (departmentSubpages.js) and DepartmentWorship.jsx's
 * own route guard, so what's shown in the grid and what's actually reachable agree. */
export function getAllowedWorshipTabs(userProfile, allTabs) {
  if (hasFullWorshipAccess(userProfile)) return allTabs
  if (isWorshipLeader(userProfile)) {
    return allTabs.filter(t => RESTRICTED_WORSHIP_TABS.includes(t))
  }
  // Anyone else who can merely open this department at all (Worship Member, or a
  // legacy generic Coordinator/Associate position under Worship — not Director,
  // Founder, Admin, or Worship Leader) gets the same minimal, least-privilege set as
  // a Worship Member. This used to fall through to `return allTabs` (every sub-module,
  // including Team/Assign/Budget/Applications) for anyone not explicitly matched above
  // — the actual cause of a Director of a *different* department (who also held some
  // lesser Worship position) appearing to have full Worship admin access.
  return allTabs.filter(t => WORSHIP_MEMBER_TABS.includes(t))
}

/** Worship Leader and Worship Member both always land straight on Upcoming Worship —
 * the department-dock's icon-grid picker is reserved for whoever needs to choose
 * between multiple admin sub-modules (Director/Founder/Admin only). This is a launcher
 * concern only: a Worship Leader can still reach Songs Directory once inside (it's
 * still in their `getAllowedWorshipTabs` set above), just not via this picker. */
export function shouldBypassWorshipGrid(userProfile) {
  if (hasFullWorshipAccess(userProfile)) return false
  return isWorshipLeader(userProfile) || isWorshipMember(userProfile)
}
