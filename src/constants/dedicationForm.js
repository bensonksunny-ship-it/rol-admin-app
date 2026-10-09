// Baby Dedication Application — wording, fields and the "surprise name" rules.
//
// A surprise name is NOT stored on the application doc (anything Caring can read,
// every Caring user can read). It goes to dedication_secret_names/{token}, which
// only the Founder / Senior Pastor / Admin can read — and Caring too once the
// application is `revealed` (set when the dedication event is marked Completed).
// See firestore.rules → dedication_applications / dedication_secret_names.

import { hasValue } from './baptismForm'
import { ROLES } from './roles'

export { hasValue }

export const DEDICATION_CHURCH_NAME = 'River of Life Christian Church, Bangalore'
export const DEDICATION_FORM_TITLE = 'Baby Dedication Application'

// Parent details — pre-filled from the PCS profile the application is made from.
export const DEDICATION_PARENT_FIELDS = [
  { key: 'fatherName', label: "Father's Name", required: true },
  { key: 'motherName', label: "Mother's Name", required: true },
  { key: 'phone',      label: 'Contact Phone', required: true, type: 'tel' },
  { key: 'email',      label: 'Email',         required: false, type: 'email' },
  { key: 'cellName',   label: 'Cell Group',    required: false },
]

// Baby details — always asked of the parents. childName is handled separately
// (it may be a surprise), so it isn't listed here.
export const DEDICATION_BABY_FIELDS = [
  { key: 'childDob',         label: "Child's Date of Birth", required: true, type: 'date' },
  { key: 'childGender',      label: 'Gender',                required: true, options: ['Male', 'Female'] },
  { key: 'preferredDate',    label: 'Preferred Dedication Date / Service', required: false, type: 'date' },
  { key: 'blessingVerse',    label: 'Dedicated Scripture / Blessing Verse', required: false, wide: true },
]

export const SURPRISE_LABEL = "Keep baby's name as a surprise until the dedication service?"
export const SURPRISE_HELP = "When ticked, the name is hidden everywhere and shown as \"Baby <Father's last name>\" until the dedication service is completed."

export const dedicationFieldValue = (app, key) =>
  hasValue(app?.applicant?.[key]) ? app.applicant[key] : (app?.prefill?.[key] || '')

const lastName = (full) => String(full || '').trim().split(/\s+/).slice(-1)[0] || ''

/** "Baby Thomas" — the name shown while the real one is a surprise. */
export function surpriseDisplayName(fatherName, motherName) {
  const ln = lastName(fatherName) || lastName(motherName)
  return ln ? `Baby ${ln}` : 'Baby (Surprise)'
}

/** Who may see a surprise name before the service. */
export const canRevealSurpriseNames = (userProfile, isFounder) =>
  !!isFounder || userProfile?.role === ROLES.SENIOR_PASTOR || userProfile?.role === ROLES.ADMIN

/** Name to show for an application: the real one, or "Baby X (Surprise Name)". */
export function dedicationDisplayName(app) {
  if (!app) return ''
  if (app.isSurpriseName && !app.revealed) return `${app.publicDisplayName || 'Baby'} (Surprise Name)`
  return app.childName || app.applicant?.childName || app.publicDisplayName || ''
}
