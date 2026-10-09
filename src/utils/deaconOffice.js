import { calculateTenure, formatDisplayDate } from './date'
import { ROLES } from '../constants/roles'

// Deacon Office on a PCS entry (caring_pcs.deaconOffice):
//   { isDeacon, status: 'Active' | 'Former' | 'None', appointedDate, endDate, appointedBy, updatedBy, updatedAt }
// Appointing / editing / ending it is Founder or Senior Pastor only — enforced by
// firestore.rules, mirrored here for the UI.

export const DEACON_STATUSES = [
  { value: 'Active', label: 'Active Deacon' },
  { value: 'Former', label: 'Former Deacon' },
  { value: 'None',   label: 'None' },
]

export const canManageDeacons = (isFounder, userProfile) =>
  !!isFounder || userProfile?.role === ROLES.SENIOR_PASTOR

/** Length of service: "3 yrs 2 mos" (to today when there is no end date). */
export const calculateDeaconTenure = (startDate, endDate) => calculateTenure(startDate, endDate || null)

export const deaconStatusOf = (office) => (office?.status === 'Active' || office?.status === 'Former' ? office.status : 'None')

/**
 * "Deacon since 14/Mar/2023 • 3 yrs 2 mos" or
 * "Former Deacon (14/Mar/2019 – 01/Jun/2023) • Total Served: 4 yrs 2 mos"; '' for None.
 */
export function deaconSummary(office) {
  const status = deaconStatusOf(office)
  if (status === 'None') return ''
  const start = office.appointedDate ? formatDisplayDate(office.appointedDate) : ''
  const tenure = office.appointedDate ? calculateDeaconTenure(office.appointedDate, status === 'Former' ? office.endDate : null) : ''
  if (status === 'Active') return `Deacon since ${start || 'date not recorded'}${tenure ? ` • ${tenure}` : ''}`
  const end = office.endDate ? formatDisplayDate(office.endDate) : 'end not recorded'
  return `Former Deacon (${start || '?'} – ${end})${tenure && office.endDate ? ` • Total Served: ${tenure}` : ''}`
}
