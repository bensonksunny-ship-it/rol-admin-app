// Shared shape + helpers for the cell-member profile form (see
// components/cell/MemberFormFields.jsx). Kept in a plain module so the component
// file only exports a component (react-refresh constraint).

// Blank form shape for "add member" (carries visitorId for the People-directory link).
export const EMPTY_MEMBER_FORM = {
  name: '', visitorId: '', phone: '', email: '', locality: '', address: '',
  birthday: '', anniversary: '', since: '', occupation: '', role: '', notes: '',
}

// Maps an existing cell_members doc onto the editable form shape (no visitorId —
// that link is set once at add time and not edited here).
export function memberToForm(member) {
  return {
    name:        member?.name        || '',
    phone:       member?.phone       || '',
    email:       member?.email       || '',
    locality:    member?.locality    || '',
    address:     member?.address     || '',
    birthday:    member?.birthday    || '',
    anniversary: member?.anniversary || '',
    since:       member?.since       || '',
    occupation:  member?.occupation  || '',
    role:        member?.role        || '',
    notes:       member?.notes       || '',
  }
}

// How long someone has been attending (from their "since" date to today).
export function calcAttendanceDuration(sinceDate) {
  if (!sinceDate) return null
  const since = new Date(sinceDate)
  const now   = new Date()
  if (isNaN(since.getTime()) || since > now) return null
  let years  = now.getFullYear() - since.getFullYear()
  let months = now.getMonth()   - since.getMonth()
  if (months < 0) { years--; months += 12 }
  const days = Math.floor((now - since) / 86400000)
  if (years > 0 && months > 0) return `${years} yr${years > 1 ? 's' : ''} ${months} mo`
  if (years > 0)  return `${years} year${years > 1 ? 's' : ''}`
  if (months > 0) return `${months} month${months > 1 ? 's' : ''}`
  if (days >= 7)  return `${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? 's' : ''}`
  return 'Less than a week'
}
