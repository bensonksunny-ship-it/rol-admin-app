// Plain helpers shared between RFFProgramPage.jsx and StudentFormModal.jsx —
// kept out of a component file so Vite's Fast Refresh doesn't choke on a file
// mixing component and non-component exports.

export const BLANK_STUDENT = {
  name: '',
  programId: '',
  ageOrClass: '',
  guardianName: '',
  guardianPhone: '',
  admissionDate: '',
  feeAmount: '',
  feePaid: false,
  feePaidDate: '',
}

export function toDateInputValue(d) {
  if (!d) return ''
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

export function formatDisplayDate(d) {
  if (!d) return '—'
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function studentToFormState(s) {
  return {
    id: s.id,
    name: s.name || '',
    programId: s.programId || '',
    ageOrClass: s.ageOrClass || '',
    guardianName: s.guardianName || '',
    guardianPhone: s.guardianPhone || '',
    admissionDate: toDateInputValue(s.admissionDate),
    feeAmount: s.feeAmount ?? '',
    feePaid: !!s.feePaid,
    feePaidDate: toDateInputValue(s.feePaidDate),
  }
}
