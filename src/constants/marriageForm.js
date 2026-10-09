// Holy Matrimony / Marriage Application form — wording and field list.
//
// DRAFT WORDING: there is no paper original to copy yet. Edit the text and fields
// here to match the church's form; the staff modal, the public QR page
// (/marriage-apply), the office viewer and the queue all read from this one file.

import { hasValue } from './baptismForm'

export { hasValue }

export const MARRIAGE_CHURCH_NAME = 'RIVER OF LIFE CHRISTIAN CHURCH - BANGALORE'
export const MARRIAGE_FORM_TITLE = 'Application for Holy Matrimony'

export const MARRIAGE_INTRO_POINTS = [
  'Both partners should be born-again believers and baptised by immersion.',
  'Pre-marital counselling with the Pastoral Office is required before the wedding date is confirmed.',
  'Please apply at least three months before the proposed wedding date.',
]

// {name} / {partner} are replaced with the applicant's and partner's full names.
export const MARRIAGE_DECLARATION_TEXT =
  'I, {name}, declare that I wish to enter into Holy Matrimony with {partner} of my own free will, that the details given here are true, and that I am legally free to marry.'

// Applicant fields, pre-filled from PCS. Shown locked (✓) on the applicant's page
// when PCS already has a value; left blank → the applicant is asked.
export const MARRIAGE_APPLICANT_FIELDS = [
  { key: 'firstName',     label: 'First Name',            required: true },
  { key: 'middleName',    label: 'Middle Name',           required: false },
  { key: 'lastName',      label: 'Last Name',             required: true },
  { key: 'gender',        label: 'Gender',                required: true, options: ['Male', 'Female'] },
  { key: 'dob',           label: 'Date of Birth',         required: true, type: 'date' },
  { key: 'maritalStatus', label: 'Current Marital Status', required: true, options: ['Single', 'Widowed', 'Divorced'] },
  { key: 'phone',         label: 'Phone Number',          required: true, type: 'tel' },
  { key: 'email',         label: 'Email',                 required: false, type: 'email' },
  { key: 'currentAddress', label: 'Current Address',      required: true, wide: true },
  { key: 'baptismDate',   label: 'Date of Baptism',       required: false, type: 'date' },
  { key: 'baptismChurch', label: 'Church of Baptism',     required: false },
  { key: 'cellName',      label: 'Cell Group',            required: false },
  { key: 'fatherName',    label: "Father's Name",         required: true },
  { key: 'motherName',    label: "Mother's Name",         required: true },
]

// Partner — never pre-filled (name parts are asked in the legal-name boxes).
export const MARRIAGE_PARTNER_FIELDS = [
  { key: 'partnerDob',        label: "Partner's Date of Birth",  required: true, type: 'date' },
  { key: 'partnerPhone',      label: "Partner's Phone Number",   required: true, type: 'tel' },
  { key: 'partnerChurch',     label: "Partner's Home Church",    required: true },
  { key: 'partnerBaptised',   label: 'Partner Baptised?',        required: true, options: ['Yes', 'No'] },
  { key: 'partnerFatherName', label: "Partner's Father's Name",  required: true },
  { key: 'partnerMotherName', label: "Partner's Mother's Name",  required: true },
]

export const MARRIAGE_WEDDING_FIELDS = [
  { key: 'proposedDate',   label: 'Proposed Wedding Date',          required: true, type: 'date' },
  { key: 'preferredVenue', label: 'Preferred Venue',                required: false, placeholder: 'e.g. ROLCC Main Hall' },
  { key: 'counselling',    label: 'Pre-marital Counselling',        required: true, options: ['Completed', 'Not yet — please schedule'] },
  { key: 'notes',          label: 'Anything the office should know', required: false, wide: true, multiline: true },
]

/** Effective value: the applicant's entry wins over the PCS pre-fill. */
export const marriageFieldValue = (app, key) =>
  hasValue(app?.applicant?.[key]) ? app.applicant[key] : (app?.prefill?.[key] || '')

export const marriageApplicantName = (app) => app?.applicant?.legalFullName
  || [marriageFieldValue(app, 'firstName'), marriageFieldValue(app, 'middleName'), marriageFieldValue(app, 'lastName')].filter(hasValue).join(' ')

export const marriagePartnerName = (app) => app?.applicant?.partnerLegalFullName || ''

/** "Asha Mathew & Joel Thomas" for lists and the viewer title. */
export const marriageCoupleName = (app) => [marriageApplicantName(app), marriagePartnerName(app)].filter(hasValue).join(' & ')
