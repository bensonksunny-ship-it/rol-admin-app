// Structured postal address used by the public application forms.

export const EMPTY_ADDRESS = { line1: '', line2: '', city: 'Bangalore', state: 'Karnataka', pincode: '' }

const clean = (v) => String(v ?? '').trim().replace(/\s+/g, ' ')

/** "Line 1, Line 2, City, State - 560102" */
export function formatAddress(a = {}) {
  const head = [a.line1, a.line2, a.city, a.state].map(clean).filter(Boolean).join(', ')
  const pin = clean(a.pincode)
  return pin ? `${head}${head ? ' - ' : ''}${pin}` : head
}

/** Problems with an address, as field labels ('' entries removed). */
export function addressProblems(a = {}) {
  return [
    !clean(a.line1) && 'Address Line 1',
    !clean(a.city) && 'City / Town',
    !clean(a.state) && 'State',
    !/^\d{6}$/.test(clean(a.pincode)) && 'Pincode (6 digits)',
  ].filter(Boolean)
}

/** Trimmed address + its one-line form, ready to save. */
export function addressPayload(a = {}) {
  const out = { line1: clean(a.line1), line2: clean(a.line2), city: clean(a.city), state: clean(a.state), pincode: clean(a.pincode) }
  return { ...out, fullFormattedAddress: formatAddress(out) }
}
