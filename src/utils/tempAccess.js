import { DEPARTMENT_LIST, getDepartmentBySlug } from '../constants/departments'

// ─── Time-bounded page access for the SP Office secretary ────────────────────
//
// The Founder can lend the SP Office secretary ("part-time admin") access to one
// department page at a time, for a fixed window (default one day). A grant lives in
// `temp_access_grants/{uid}` — NEVER on the user's own users/{uid} doc — as
//
//   { uid, name, grants: { [departmentName]: { level, expiresAt, grantedAt,
//                                               grantedBy, grantedByName } } }
//
// Security model:
//  - Only full access (Founder) may write the grant doc; the grantee can only read
//    his own (firestore.rules → temp_access_grants).
//  - The rules' canAccessDept() honours a grant only while `expiresAt > request.time`,
//    so an expired grant stops working server-side even if the client never notices.
//  - The client (AuthContext) layers active grants onto the profile as positions
//    flagged `temporary: true`, and drops each one the moment it expires (timer), so
//    nav, tabs and page guards follow the same window. Temporary positions are never
//    written back to Firestore.
//  - Every grant / extend / revoke is appended to `temp_access_log` (create-only).

export const TEMP_ACCESS_COLLECTION = 'temp_access_grants'
export const TEMP_ACCESS_LOG_COLLECTION = 'temp_access_log'

/** The department whose staff can receive grants. */
export const TEMP_ACCESS_GRANTEE_DEPARTMENT = 'SP Office'

/** Durations offered when granting, in hours. 24h (one day) is the default. */
export const TEMP_ACCESS_DURATIONS = [
  { hours: 2, label: '2 hours' },
  { hours: 4, label: '4 hours' },
  { hours: 8, label: 'Work day (8h)' },
  { hours: 24, label: '1 day' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '1 week' },
]
export const DEFAULT_TEMP_ACCESS_HOURS = 24
/** Hard ceiling on one grant (checked when granting). */
export const MAX_TEMP_ACCESS_HOURS = 168

export const TEMP_ACCESS_LEVELS = [
  { value: 'DIRECTOR', label: 'Full', hint: 'Works the page like its Director' },
  { value: 'COORDINATOR', label: 'Limited', hint: 'Works the page like a Coordinator' },
]

// Never lent out: SP Office is already his; Administration holds user management.
const NON_GRANTABLE = new Set(['SP Office', 'Administration'])

export function isGrantableDepartment(name) {
  return !!name && !NON_GRANTABLE.has(name) && DEPARTMENT_LIST.some((d) => d.name === name)
}

/** Department a route belongs to (for the per-page access control), or null. */
export function departmentForPath(pathname) {
  const p = String(pathname || '')
  if (p === '/sunday-ministry' || p === '/sunday-planning') return 'Sunday Ministry'
  if (p === '/finance') return 'Accounts'
  if (p === '/rff' || p.startsWith('/rff/')) return 'RFF'
  if (p === '/first-lady') return 'First Lady'
  const m = p.match(/^\/department\/([^/]+)/)
  if (m) return getDepartmentBySlug(m[1])?.name || null
  return null
}

function toMillis(v) {
  if (!v) return 0
  if (typeof v.toMillis === 'function') return v.toMillis()
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'number') return v
  if (typeof v.seconds === 'number') return v.seconds * 1000
  return 0
}

/** Grants from a grant doc that are still live at `now`: [{ department, level, expiresAtMs, … }]. */
export function activeGrantsFromDoc(grantDoc, now = Date.now()) {
  const grants = grantDoc?.grants && typeof grantDoc.grants === 'object' ? grantDoc.grants : {}
  return Object.entries(grants)
    .map(([department, g]) => ({
      department,
      level: g?.level === 'COORDINATOR' ? 'COORDINATOR' : 'DIRECTOR',
      expiresAtMs: toMillis(g?.expiresAt),
      grantedAtMs: toMillis(g?.grantedAt),
      grantedByName: g?.grantedByName || '',
    }))
    .filter((g) => isGrantableDepartment(g.department) && g.expiresAtMs > now)
    .sort((a, b) => a.expiresAtMs - b.expiresAtMs)
}

/**
 * Profile with live grants layered on as temporary positions/departments. Pure —
 * the result must never be written back to users/{uid}.
 */
export function applyTempGrants(profile, activeGrants) {
  if (!profile || !activeGrants?.length) return profile
  const positions = Array.isArray(profile.positions) ? profile.positions : []
  const departments = Array.isArray(profile.departments) ? profile.departments : []
  const temp = activeGrants.map((g) => ({
    department: g.department,
    role: g.level,
    temporary: true,
    expiresAtMs: g.expiresAtMs,
  }))
  return {
    ...profile,
    positions: [...positions, ...temp],
    departments: [...new Set([...departments, ...activeGrants.map((g) => g.department)])],
    tempAccessGrants: activeGrants,
  }
}

/** "5h 12m left" / "12m left" / "under a minute". */
export function formatTimeLeft(expiresAtMs, now = Date.now()) {
  const ms = Math.max(0, expiresAtMs - now)
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'under a minute left'
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d) return `${d}d ${h}h left`
  if (h) return `${h}h ${m}m left`
  return `${m}m left`
}

export function formatExpiry(expiresAtMs) {
  return new Date(expiresAtMs).toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  })
}
