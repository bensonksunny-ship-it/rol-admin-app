// Membership Application form — wording and field list.
//
// Modelled on the printed "River of Life Christian Church, Bangalore - Membership
// Form". Edit the text here to match the paper exactly; the staff modal, the public
// QR page (/membership-apply) and the printed A4 sheet all read from this file.

import { hasValue } from './baptismForm'

export { hasValue }

export const MEMBERSHIP_CHURCH_NAME = 'River of Life Christian Church, Bangalore'
export const MEMBERSHIP_FORM_TITLE = 'Membership Form'

export const MEMBERSHIP_FOOTER_NOTE =
  'Kindly deposit Rs.500/- for the membership card which will be refunded later. Baptism certificate is mandatory with form.'

// Fields filled from the PCS record. Shown locked (✓) on the applicant's page when
// PCS already has a value; left blank → the applicant is asked for it.
export const MEMBERSHIP_PREFILL_FIELDS = [
  { key: 'firstName',      label: 'First Name',                      required: true },
  { key: 'lastName',       label: 'Last Name',                       required: true },
  { key: 'gender',         label: 'Gender',                          required: true, options: ['Male', 'Female'] },
  { key: 'dob',            label: 'Date of Birth',                   required: true, type: 'date' },
  { key: 'phone',          label: 'Primary Phone Number',            required: true, type: 'tel' },
  { key: 'email',          label: 'Email ID',                        required: false, type: 'email' },
  { key: 'currentAddress', label: 'Current Address',                 required: true, wide: true, multiline: true },
  { key: 'dateOfJoin',     label: 'Date of Join',                    required: true, type: 'date' },
  { key: 'baptismDate',    label: 'Date of Baptism',                 required: true, type: 'date' },
  { key: 'baptismChurch',  label: 'Name of Church Presided Baptism', required: true },
  { key: 'cellName',       label: 'Cell Name',                       required: false },
]

// Always asked of the applicant (PCS doesn't hold these).
export const MEMBERSHIP_APPLICANT_FIELDS = [
  { key: 'familyInRolcc',     label: 'Name of immediate family member in ROLCC (Spouse / Siblings / Parents / Children)', required: false, wide: true },
  { key: 'emergencyPhone',    label: 'Emergency Phone Number', required: true, type: 'tel' },
  { key: 'permanentAddress',  label: 'Permanent Address (if different from current address)', required: false, wide: true, multiline: true },
]

export const MEMBERSHIP_TALENTS = [
  'Singing', 'Music / Instruments', 'Teaching', 'Children\'s Ministry', 'Media / Photography',
  'Technical / Sound', 'Hospitality', 'Prayer / Intercession', 'Administration', 'Art / Design',
]

// Documents presented with the form. `required` ones must be uploaded on the QR page.
export const MEMBERSHIP_DOCUMENTS = [
  { key: 'baptismCertificate', label: 'Baptism Certificate', required: true },
  { key: 'idProof',            label: 'ID Proof (Aadhaar / Passport / Voter ID)', required: false },
]

/** Effective value: the applicant's entry wins over the PCS pre-fill. */
export const membershipFieldValue = (app, key) =>
  hasValue(app?.applicant?.[key]) ? app.applicant[key] : (app?.prefill?.[key] || '')

export const membershipFullName = (app) =>
  [membershipFieldValue(app, 'firstName'), membershipFieldValue(app, 'lastName')].filter(hasValue).join(' ')

/** Office decision on a submitted application. */
export const MEMBERSHIP_DECISIONS = {
  submitted: 'Under Review',
  approved: 'Approved',
  rejected: 'Not Approved',
}
