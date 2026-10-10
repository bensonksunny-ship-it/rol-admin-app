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
  { key: 'middleName',     label: 'Middle Name',                     required: false },
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

// Documents are handed over in person, not uploaded: the applicant ticks a
// confirmation for each (both required). Saved on applicant as booleans.
// `legacyKey` = the uploaded-scan key older applications used in `documents`.
export const MEMBERSHIP_DOCUMENTS = [
  { key: 'hasSubmittedPhysicalBaptismCertificate', legacyKey: 'baptismCertificate', label: 'Baptism Certificate',
    confirm: 'I have physically submitted my original/copy of Water Baptism Certificate to the church office.' },
  { key: 'hasSubmittedPhysicalIdProof', legacyKey: 'idProof', label: 'ID Proof (Aadhaar / Passport / Voter ID)',
    confirm: 'I have physically submitted my official Government ID Proof (Aadhaar / Passport / Voter ID) to the church office.' },
]

/** Was this document handed over (new tick) or uploaded (older applications)? */
export const membershipDocumentProvided = (app, d) => app?.applicant?.[d.key] === true || !!app?.documents?.[d.legacyKey]

/** Effective value: the applicant's entry wins over the PCS pre-fill. */
export const membershipFieldValue = (app, key) =>
  hasValue(app?.applicant?.[key]) ? app.applicant[key] : (app?.prefill?.[key] || '')

export const membershipFullName = (app) => app?.applicant?.legalFullName
  || [membershipFieldValue(app, 'firstName'), membershipFieldValue(app, 'middleName'), membershipFieldValue(app, 'lastName')].filter(hasValue).join(' ')

/**
 * Water baptism answers on an application: { isBaptized, hasCertificate,
 * selfDeclarationSigned, signedAt, declarationText }. A declaration signed later
 * (after Stage 4 sent it back) wins over the original answers.
 */
export const membershipWaterBaptism = (app) =>
  (app?.declarationResponse?.selfDeclarationSigned ? app.declarationResponse : null) || app?.applicant?.waterBaptism || null

/** Office decision on a submitted application. */
export const MEMBERSHIP_DECISIONS = {
  submitted: 'Under Review',
  approved: 'Approved',
  rejected: 'Not Approved',
}
