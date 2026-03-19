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

/**
 * Parse a value from Excel/CSV (number = Excel serial, Date, or string) to YYYY-MM-DD.
 * Used for Since/Birthday/Anniversary on member import. Returns '' if unparseable.
 */
export function parseDateToYYYYMMDD(value) {
  if (value == null || value === '') return ''
  if (value instanceof Date) return isValid(value) ? format(value, 'yyyy-MM-dd') : ''
  if (typeof value === 'number') {
    // Excel serial: days since 1900-01-01 (approx). 25569 = 1970-01-01
    const d = new Date(Math.round((value - 25569) * 86400 * 1000))
    return isValid(d) ? format(d, 'yyyy-MM-dd') : ''
  }
  const s = String(value).trim()
  if (!s) return ''
  const d = new Date(s)
  return isValid(d) ? format(d, 'yyyy-MM-dd') : ''
}

export function formatDMY(value) {
  const d = toDate(value)
  return d ? format(d, 'dd-MM-yyyy') : '—'
}

export function formatDMYTime(value) {
  const d = toDate(value)
  return d ? format(d, 'dd-MM-yyyy HH:mm') : '—'
}

