// Spouse & children ("Family Details") shared by the PCS profile, the public
// application forms (Membership, Baptism, Baby Dedication, Marriage) and the
// office-approval sync back to the member profile (member_profiles/{visitorId}).
//
// Children keep their existing shape — { id, childType: 'minor'|'adult', name,
// inRiverKids, riverKidsChildId, linkedChildMemberId } — with the legal-name parts
// and details added alongside: firstName, middleName, lastName, dob, gender.
// `name` is always kept as the joined full name, so River Kids links, the PDF and
// everything else that reads `name` keep working.
import { legalFullName, splitName } from './legalName'

const clean = (v) => String(v ?? '').trim().replace(/\s+/g, ' ')
const newChildId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** A child's display name: the legal parts when present, else the stored `name`. */
export const childDisplayName = (c) => legalFullName(c || {}) || clean(c?.name)

/** Age in whole years from a 'YYYY-MM-DD' DOB, or null. */
export function childAgeYears(dob, today = new Date()) {
  const d = dob ? new Date(String(dob).slice(0, 10) + 'T00:00:00') : null
  if (!d || isNaN(d.getTime())) return null
  let y = today.getFullYear() - d.getFullYear()
  const m = today.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) y--
  return y >= 0 ? y : null
}

/** "7 yrs / 12 Mar 2019" · "12 Mar 2019" · "" — the bracketed bit on the profile. */
export function childAgeText(c) {
  if (!c?.dob) return ''
  const d = new Date(String(c.dob).slice(0, 10) + 'T00:00:00')
  const dobText = isNaN(d.getTime()) ? String(c.dob) : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const age = childAgeYears(c.dob)
  return age === null ? dobText : `${age} yr${age === 1 ? '' : 's'} / ${dobText}`
}

/** One child row for an application form: legal parts filled from the stored name when missing. */
function toFormChild(c) {
  const parts = (c.firstName || c.lastName) ? { firstName: c.firstName || '', middleName: c.middleName || '', lastName: c.lastName || '' } : splitName(c.name)
  return { id: c.id || newChildId(), ...parts, dob: c.dob || '', gender: c.gender || '', childType: c.childType || 'minor' }
}

/** Snapshot of the PCS family for an application's `prefill.family`. */
export function buildFamilyPrefill(form) {
  const kids = form?.hasKids === 'yes' || (form?.children || []).length ? (form?.children || []) : []
  return {
    maritalStatus: form?.maritalStatus || '',
    spouseName: form?.maritalStatus === 'Married' ? clean(form?.spouseName) : '',
    children: kids.filter((c) => childDisplayName(c)).map(toFormChild),
  }
}

/** The PCS family snapshot shown (read-only) in the public form's Family Details section. */
export function initialFamilyState(prefill) {
  const fam = prefill?.family || {}
  return {
    spouse: splitName(fam.spouseName || prefill?.spouseName || ''),
    children: (fam.children || []).map((c) => ({ ...toFormChild(c), isNew: false })),
  }
}

const childHasAny = (c) => [c.firstName, c.middleName, c.lastName, c.dob, c.gender].some((v) => clean(v))

/** What the applicant submits (stored as applicant.family). Empty rows dropped. */
export function familyPayload(state, { includeSpouse = true } = {}) {
  const spouse = { firstName: clean(state?.spouse?.firstName), middleName: clean(state?.spouse?.middleName), lastName: clean(state?.spouse?.lastName) }
  return {
    ...(includeSpouse ? { spouse, spouseName: legalFullName(spouse) } : {}),
    children: (state?.children || []).filter(childHasAny).map((c) => {
      const parts = { firstName: clean(c.firstName), middleName: clean(c.middleName), lastName: clean(c.lastName) }
      return { id: c.id, ...parts, name: legalFullName(parts), dob: c.dob || '', gender: c.gender || '', childType: c.childType || 'minor' }
    }),
  }
}

/**
 * Patch for member_profiles once the office approves an application: spouse name
 * (when given) and children merged by id — existing rows keep their River Kids /
 * adult-child links and get the applicant's name parts, DOB and gender; new rows
 * are added. Children missing from the application are never deleted.
 */
export function mergeFamilyIntoProfile(profile, family, { includeSpouse = true } = {}) {
  if (!family) return null
  const existing = Array.isArray(profile?.children) ? profile.children : []
  const byId = new Map(existing.map((c) => [c.id, c]))
  const merged = existing.map((c) => {
    const upd = (family.children || []).find((a) => a.id === c.id)
    if (!upd) return c
    return {
      ...c,
      firstName: upd.firstName, middleName: upd.middleName || '', lastName: upd.lastName,
      name: upd.name || c.name, dob: upd.dob || c.dob || '', gender: upd.gender || c.gender || '',
    }
  })
  for (const a of family.children || []) {
    if (byId.has(a.id)) continue
    merged.push({
      id: a.id, childType: a.childType || 'minor', name: a.name,
      firstName: a.firstName, middleName: a.middleName || '', lastName: a.lastName,
      dob: a.dob || '', gender: a.gender || '', inRiverKids: '', riverKidsChildId: '', linkedChildMemberId: '',
    })
  }
  const patch = { children: merged }
  if (merged.length) patch.hasKids = 'yes'
  if (includeSpouse && clean(family.spouseName)) patch.spouseName = clean(family.spouseName)
  return patch
}
