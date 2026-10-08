// Caring → Events: pastoral lifecycle events and what each one writes into the
// linked PCS profiles. Wording for the event types and certificates lives here.

export const CARING_EVENT_TYPES = [
  { key: 'baptism',    label: 'Baptism Service',          short: 'Baptism',    codePrefix: 'BAP', certTitle: 'Certificate of Baptism' },
  { key: 'marriage',   label: 'Marriage / Holy Matrimony', short: 'Marriage',   codePrefix: 'MAR', certTitle: 'Certificate of Holy Matrimony' },
  { key: 'dedication', label: 'Baby Dedication',          short: 'Dedication', codePrefix: 'DED', certTitle: 'Certificate of Dedication' },
  { key: 'burial',     label: 'Burial / Funeral Service', short: 'Burial',     codePrefix: 'BUR', certTitle: 'Record of Christian Burial' },
]

export const caringEventType = (key) => CARING_EVENT_TYPES.find((t) => t.key === key) || CARING_EVENT_TYPES[0]

export const CARING_EVENT_DEFAULT_VENUE = 'River of Life Christian Church, Bangalore'
export const CARING_EVENT_CHURCH_NAME = 'River of Life Christian Church'
export const CARING_EVENT_CHURCH_PLACE = 'Bangalore'

/** Next batch code for a type in a year, e.g. "BAP-2026-B3" when two already exist. */
export function suggestBatchCode(type, date, events) {
  const year = String(date || '').slice(0, 4) || String(new Date().getFullYear())
  const prefix = `${caringEventType(type).codePrefix}-${year}-B`
  const used = events
    .map((e) => String(e.batchCode || ''))
    .filter((c) => c.startsWith(prefix))
    .map((c) => Number(c.slice(prefix.length)) || 0)
  return `${prefix}${(used.length ? Math.max(...used) : 0) + 1}`
}

export const serialLabel = (n) => `#${String(n).padStart(2, '0')}`

/** Display name of a participant row (a couple for marriage, the child for dedication). */
export function participantTitle(type, p) {
  if (type === 'marriage') return [p.name, p.spouse?.name].filter(Boolean).join(' & ')
  if (type === 'dedication') return p.childName || ''
  return p.name || ''
}
