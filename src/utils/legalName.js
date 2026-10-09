// Legal name (as per government ID) — First / Middle / Last, used by every public
// application form (baptism, membership, baby dedication).

export const LEGAL_NAME_KEYS = ['firstName', 'middleName', 'lastName']

const clean = (v) => String(v ?? '').trim().replace(/\s+/g, ' ')

/** "First Middle Last" — middle name only when given. */
export function legalFullName({ firstName, middleName, lastName } = {}) {
  return [clean(firstName), clean(middleName), clean(lastName)].filter(Boolean).join(' ')
}

/** Best-effort split of a single stored name into parts, to pre-fill the three boxes. */
export function splitName(full) {
  const parts = clean(full).split(' ').filter(Boolean)
  if (parts.length <= 1) return { firstName: parts[0] || '', middleName: '', lastName: '' }
  return { firstName: parts[0], middleName: parts.slice(1, -1).join(' '), lastName: parts[parts.length - 1] }
}

/** Trimmed parts + full name, ready to save on an application. */
export function legalNamePayload(parts) {
  const out = { firstName: clean(parts?.firstName), middleName: clean(parts?.middleName), lastName: clean(parts?.lastName) }
  return { ...out, legalFullName: legalFullName(out) }
}

export const isLegalNameComplete = (parts) => !!clean(parts?.firstName) && !!clean(parts?.lastName)
