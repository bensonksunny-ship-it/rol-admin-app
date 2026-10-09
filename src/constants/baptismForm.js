// Baptism Application form — wording and field list.
//
// DRAFT WORDING: modelled on the description of the official paper form
// ("River of Life Christian Church Bangalore - Application Form for Baptism").
// Edit the text here to match the printed document exactly; the staff modal, the
// public QR page and the printed sheet all read from this one file.

export const BAPTISM_CHURCH_NAME = 'RIVER OF LIFE CHRISTIAN CHURCH - BANGALORE'
export const BAPTISM_FORM_TITLE = 'Application form for Baptism'

export const BAPTISM_DECLARATION_POINTS = [
  'I have accepted the Lord Jesus Christ as my personal Saviour and Lord.',
  'I understand that water baptism by immersion is a public declaration of my faith, in obedience to the Word of God (Matthew 28:19, Acts 2:38).',
  'I will continue in fellowship, prayer and the study of God\'s Word as part of River of Life Christian Church.',
]

// {name} is replaced with the applicant's full name.
export const BAPTISM_DECLARATION_TEXT =
  'I, {name}, declare that I have taken the decision of taking baptism of my own free will, without any compulsion, after understanding its meaning from the Word of God.'

export const BAPTISM_PASTOR_SIGNOFF = ['S/d Pr. Benson K Sunny', 'Senior Pastor, ROLCC']

// Candidate Information fields, in form order. `required` fields left blank in
// PCS are highlighted on the applicant's page; filled ones are shown locked.
export const BAPTISM_FIELDS = [
  { key: 'firstName',     label: 'First Name',      required: true },
  { key: 'middleName',    label: 'Middle Name',     required: false },
  { key: 'lastName',      label: 'Last Name',       required: true },
  { key: 'dob',           label: 'Date of Birth',   required: true, type: 'date' },
  { key: 'gender',        label: 'Gender',          required: true, options: ['Male', 'Female'] },
  { key: 'maritalStatus', label: 'Marital Status',  required: true, options: ['Single', 'Married', 'Widowed', 'Divorced'] },
  { key: 'spouseName',    label: 'Spouse Name',     required: false, onlyIf: (v) => v.maritalStatus === 'Married' },
  { key: 'street',        label: 'Street Address',  required: true, wide: true },
  { key: 'city',          label: 'City',            required: true },
  { key: 'state',         label: 'State',           required: true },
  { key: 'zip',           label: 'PIN / Zip Code',  required: true },
  { key: 'country',       label: 'Country',         required: true },
  { key: 'phone',         label: 'Phone Number',    required: true, type: 'tel' },
  { key: 'altPhone',      label: 'Alternate Phone', required: false, type: 'tel' },
  { key: 'email',         label: 'Email',           required: false, type: 'email' },
  { key: 'cellName',      label: 'Cell Group',      required: false },
  // Asked of the applicant (never pre-filled). Caring assigns the formal Batch No. /
  // Serial No. when reviewing the submitted application.
  { key: 'baptismPlace',  label: 'Baptism Place',   required: false, placeholder: 'e.g. Church baptistry, Bangalore' },
  { key: 'preferredBatchDate', label: 'Preferred Batch / Service Date', required: false, type: 'date' },
]

export const hasValue = (v) => v !== null && v !== undefined && String(v).trim() !== ''

/** Effective value of a field: the applicant's entry wins over the PCS pre-fill. */
export const baptismFieldValue = (app, key) =>
  hasValue(app?.applicant?.[key]) ? app.applicant[key] : (app?.prefill?.[key] || '')

/** Fields relevant for this application (spouse only when married). */
export function visibleBaptismFields(app) {
  const values = Object.fromEntries(BAPTISM_FIELDS.map((f) => [f.key, baptismFieldValue(app, f.key)]))
  return BAPTISM_FIELDS.filter((f) => !f.onlyIf || f.onlyIf(values))
}
