import { calculateTenure } from './date'
import { ROLES } from '../constants/roles'

// Deacon Office on a PCS entry (caring_pcs.deaconOffice):
//   { isDeacon, status: 'Active' | 'Former' | 'None', appointedDate, endDate, appointedBy, updatedBy, updatedAt }
// Appointing / editing / ending it is Founder or Senior Pastor only — enforced by
// firestore.rules, mirrored here for the UI.

export const DEACON_STATUSES = [
  { value: 'Active', label: 'Active Deacon' },
  { value: 'Former', label: 'Former Deacon' },
  { value: 'None',   label: 'Not a Deacon' },
]

// Accounts that may always manage the Deacon Office (matched case-insensitively).
// Keep in step with deaconManagerEmail() in firestore.rules.
export const DEACON_MANAGER_EMAILS = ['rolccbangalore@gmail.com']

const roleKey = (r) => String(r || '').toLowerCase().replace(/[\s_-]+/g, '')

/**
 * Founder / Senior Pastor guard for appointing, editing or ending a Deacon Office.
 * Accepts every way those are stored: the Founder flag (custom claim / globalRole),
 * role 'Founder' or 'Senior Pastor' in any case/spacing ("SeniorPastor",
 * "senior_pastor"), an authorised admin email, or permissions.canManageDeacons.
 */
export function canManageDeacons(isFounder, userProfile, authUser = null) {
  const email = String(userProfile?.email || authUser?.email || '').trim().toLowerCase()
  const roles = [userProfile?.role, userProfile?.globalRole].map(roleKey)
  return !!isFounder
    || roles.some((r) => r === 'founder' || r === roleKey(ROLES.SENIOR_PASTOR))
    || (!!email && DEACON_MANAGER_EMAILS.includes(email))
    || userProfile?.permissions?.canManageDeacons === true
}

// Temporary verification log — prints the guard inputs once per page load so the
// role check can be confirmed right after login. Remove once confirmed.
let deaconGuardLogged = false
export function logDeaconGuard(isFounder, userProfile, authUser = null) {
  if (deaconGuardLogged) return
  deaconGuardLogged = true
  console.log('Deacon Guard Evaluation:', {
    userRole: userProfile?.role, globalRole: userProfile?.globalRole, isFounder: !!isFounder,
    email: userProfile?.email || authUser?.email || '',
    isAuthorizedForDeaconMgmt: canManageDeacons(isFounder, userProfile, authUser),
  })
}

/** Length of service: "3 yrs 2 mos" (to today when there is no end date). */
export const calculateDeaconTenure = (startDate, endDate) => calculateTenure(startDate, endDate || null)

export const deaconStatusOf = (office) => (office?.status === 'Active' || office?.status === 'Former' ? office.status : 'None')

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const parts = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? { y: m[1], mo: MONTHS[Number(m[2]) - 1], d: m[3] } : null }
/** "12-Jun-2022" */
const dayMonYear = (iso) => { const p = parts(iso); return p ? `${p.d}-${p.mo}-${p.y}` : '' }
/** "Jun 2020" */
const monYear = (iso) => { const p = parts(iso); return p ? `${p.mo} ${p.y}` : '' }

/**
 * "Active Deacon • Serving for 2 yrs 4 mos (Appointed: 12-Jun-2022)" or
 * "Former Deacon • Total Served: 3 yrs 1 mo (Jun 2020 – Jul 2023)"; '' for None.
 */
export function deaconSummary(office) {
  const status = deaconStatusOf(office)
  if (status === 'None') return ''
  const tenure = office.appointedDate ? calculateDeaconTenure(office.appointedDate, status === 'Former' ? office.endDate : null) : ''
  if (status === 'Active') {
    return `Active Deacon${tenure ? ` • Serving for ${tenure}` : ''} (Appointed: ${dayMonYear(office.appointedDate) || 'date not recorded'})`
  }
  const span = `${monYear(office.appointedDate) || '?'} – ${monYear(office.endDate) || 'end not recorded'}`
  return `Former Deacon${tenure && office.endDate ? ` • Total Served: ${tenure}` : ''} (${span})`
}

/** Short read-only badge: "Deacon since 12-Jun-2022" / "Former Deacon (Jun 2020 – Jul 2023)"; '' for None. */
export function deaconBadgeText(office) {
  const status = deaconStatusOf(office)
  if (status === 'Active') return `Deacon since ${dayMonYear(office.appointedDate) || 'date not recorded'}`
  if (status === 'Former') return `Former Deacon (${monYear(office.appointedDate) || '?'} – ${monYear(office.endDate) || '?'})`
  return ''
}
