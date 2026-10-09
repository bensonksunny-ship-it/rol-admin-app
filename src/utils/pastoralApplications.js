// Pastoral applications across types (Baptism, Baby Dedication, Membership) — one
// description used by the PCS profile's "Submitted Applications & Forms" list,
// the Caring Hub queue card and the submitted-form viewer.
import { BAPTISM_FIELDS, baptismFieldValue, BAPTISM_DECLARATION_TEXT } from '../constants/baptismForm'
import { MEMBERSHIP_PREFILL_FIELDS, MEMBERSHIP_APPLICANT_FIELDS, membershipFieldValue, membershipFullName } from '../constants/membershipForm'
import { DEDICATION_PARENT_FIELDS, DEDICATION_BABY_FIELDS, dedicationFieldValue, dedicationDisplayName } from '../constants/dedicationForm'
import { MARRIAGE_APPLICANT_FIELDS, MARRIAGE_PARTNER_FIELDS, MARRIAGE_WEDDING_FIELDS, marriageFieldValue, marriageCoupleName, marriagePartnerName, MARRIAGE_DECLARATION_TEXT, marriageApplicantName } from '../constants/marriageForm'
import { childDisplayName, childAgeText } from './familyDetails'
import { openBaptismFormPrint, applicantFullName } from './baptismFormPrint'
import { openMembershipFormPrint } from './membershipFormPrint'

// "Family Details" the applicant submitted (applicant.family) — shown as its own
// section for every type; empty when the applicant gave none.
function familySection(app, { includeSpouse = true } = {}) {
  const fam = app?.applicant?.family
  if (!fam) return []
  const rows = []
  if (includeSpouse) rows.push(['Spouse', fam.spouseName || ''])
  const kids = fam.children || []
  rows.push(['Children', kids.length ? kids.map((c) => `${childDisplayName(c)}${childAgeText(c) ? ` (${childAgeText(c)})` : ''}`).join(', ') : 'None'])
  return [{ title: 'Family Details', rows }]
}

export const APPLICATION_TYPES = {
  baptism: {
    key: 'baptism', label: 'Baptism Application', short: 'Baptism', eventType: 'baptism',
    cls: 'bg-violet-50 text-violet-700 border-violet-200',
    title: (app) => applicantFullName(app),
    sections: (app) => [{ title: 'Candidate Information', rows: BAPTISM_FIELDS.map((f) => [f.label, baptismFieldValue(app, f.key)]) }, ...familySection(app)],
    declaration: (app) => app.declarationAccepted ? BAPTISM_DECLARATION_TEXT.replace('{name}', applicantFullName(app) || '—') : '',
    print: openBaptismFormPrint,
  },
  dedication: {
    key: 'dedication', label: 'Baby Dedication Application', short: 'Dedication', eventType: 'dedication',
    cls: 'bg-teal-50 text-teal-700 border-teal-200',
    title: (app) => dedicationDisplayName(app),
    sections: (app) => [
      { title: 'Parents', rows: DEDICATION_PARENT_FIELDS.map((f) => [f.label, dedicationFieldValue(app, f.key)]) },
      { title: 'Baby', rows: [["Child's Name", dedicationDisplayName(app)], ...DEDICATION_BABY_FIELDS.map((f) => [f.label, dedicationFieldValue(app, f.key)])] },
      ...familySection(app),
    ],
    declaration: () => '',
    print: null,
  },
  membership: {
    key: 'membership', label: 'Membership Application', short: 'Membership', eventType: null,
    cls: 'bg-amber-50 text-amber-800 border-amber-200',
    title: (app) => membershipFullName(app),
    sections: (app) => [
      { title: 'Applicant', rows: MEMBERSHIP_PREFILL_FIELDS.map((f) => [f.label, membershipFieldValue(app, f.key)]) },
      { title: 'Further details', rows: MEMBERSHIP_APPLICANT_FIELDS.map((f) => [f.label, membershipFieldValue(app, f.key)]) },
      ...familySection(app),
    ],
    declaration: () => '',
    print: openMembershipFormPrint,
  },
  marriage: {
    key: 'marriage', label: 'Marriage Application', short: 'Marriage', eventType: 'marriage',
    cls: 'bg-rose-50 text-rose-700 border-rose-200',
    title: (app) => marriageCoupleName(app),
    sections: (app) => [
      { title: 'Applicant', rows: MARRIAGE_APPLICANT_FIELDS.map((f) => [f.label, marriageFieldValue(app, f.key)]) },
      { title: 'Partner', rows: [['Name', marriagePartnerName(app)], ...MARRIAGE_PARTNER_FIELDS.map((f) => [f.label, marriageFieldValue(app, f.key)])] },
      { title: 'Wedding', rows: MARRIAGE_WEDDING_FIELDS.map((f) => [f.label, marriageFieldValue(app, f.key)]) },
      ...familySection(app, { includeSpouse: false }),
    ],
    declaration: (app) => app.declarationAccepted
      ? MARRIAGE_DECLARATION_TEXT.replace('{name}', marriageApplicantName(app) || '—').replace('{partner}', marriagePartnerName(app) || '—')
      : '',
    print: null,
  },
}
export const APPLICATION_TYPE_KEYS = ['baptism', 'dedication', 'marriage', 'membership']

// Statuses that mean "the applicant has submitted" (pending = link not used yet).
export const SUBMITTED_STATUSES = ['submitted', 'info_requested', 'approved', 'rejected']

/** The Caring event an application is on — linked on approval, or added from the Events tab. */
export function eventForApplication(app, events) {
  return (events || []).find((e) => e.id === app.linkedEventId || (e.participants || []).some((p) => p.applicationId === app.id)) || null
}

/** Display status: Pending Review · Info Requested · Not Approved · Approved · Event Scheduled · Completed. */
export function applicationStatus(app, events) {
  const ev = eventForApplication(app, events)
  if (ev) return ev.status === 'completed'
    ? { label: 'Completed', cls: 'bg-slate-100 text-slate-700 border-slate-200' }
    : { label: 'Event Scheduled', cls: 'bg-indigo-100 text-indigo-700 border-indigo-200' }
  switch (app.status) {
    case 'approved': return { label: 'Approved', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
    case 'rejected': return { label: 'Not Approved', cls: 'bg-red-100 text-red-700 border-red-200' }
    case 'info_requested': return { label: 'Info Requested', cls: 'bg-orange-100 text-orange-700 border-orange-200' }
    case 'pending': return { label: 'Link sent', cls: 'bg-slate-50 text-slate-500 border-slate-200' }
    default: return { label: 'Pending Review', cls: 'bg-amber-100 text-amber-800 border-amber-200' }
  }
}
