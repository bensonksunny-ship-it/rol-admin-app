import { format, parseISO, isValid } from 'date-fns'

function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return isValid(value) ? value : null
  if (typeof value === 'string') {
    // Accept ISO-like yyyy-MM-dd and full ISO strings
    const d = parseISO(value)
    return isValid(d) ? d : null
  }
  return null
}

export function formatDMY(value) {
  const d = toDate(value)
  return d ? format(d, 'dd-MM-yyyy') : '—'
}

export function formatDMYTime(value) {
  const d = toDate(value)
  return d ? format(d, 'dd-MM-yyyy HH:mm') : '—'
}

